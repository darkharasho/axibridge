import http from 'node:http';
import type { AddressInfo } from 'node:net';

import log from 'electron-log';

import {
    CLOUDFLARE_REDIRECT_PORTS,
    buildAuthorizeUrl,
    createPkcePair,
    createState,
    exchangeCodeForTokens,
    parseCallbackUrl,
    redirectUriForPort,
    type TokenSet
} from './oauth';

// ─── The interactive half of the OAuth flow ───────────────────────────────────
//
// Spec §2 steps 1–3: bind a loopback listener, hand the authorize URL to the
// *system* browser, and wait for Cloudflare to redirect back with a code.
//
// It has to be the system browser, not a BrowserWindow. An embedded webview
// would ask the user to type their Cloudflare password into a window this app
// controls, which is exactly the phishing shape OAuth exists to avoid — and it
// would not see an existing dashboard session, so every sign-in would demand a
// fresh login and a second factor.

/** How long the listener stays open before giving up on the browser. */
export const AUTH_TIMEOUT_MS = 5 * 60_000;

export type AuthFlowOutcome =
    | { ok: true; tokens: TokenSet }
    | { ok: false; error: string; cancelled?: boolean };

/**
 * What the listener hands back to the flow: the raw code, not a token set. The
 * exchange happens after the browser has its response, so a slow token endpoint
 * never leaves the user staring at a hanging tab.
 */
type CallbackOutcome =
    | { ok: true; code: string }
    | { ok: false; error: string; cancelled?: boolean };

/**
 * The page the browser lands on after the redirect. The window is the user's,
 * not ours, so we cannot close it for them — say plainly that the app has taken
 * over and the tab is done.
 */
const resultPage = (heading: string, detail: string, ok: boolean): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AxiBridge</title><style>
  body { background:#111318; color:#e6e8ee; font:15px/1.5 system-ui,sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .card { max-width:26rem; padding:2rem; border:1px solid #2a2e39; border-radius:6px; background:#171a21; }
  h1 { font-size:1.1rem; margin:0 0 .6rem; color:${ok ? '#7fd58b' : '#e88f8f'}; }
  p { margin:0; color:#9aa1b1; }
</style></head><body><div class="card"><h1>${heading}</h1><p>${detail}</p></div></body></html>`;

const SUCCESS_PAGE = resultPage(
    'Connected to Cloudflare',
    'AxiBridge is finishing setup. You can close this tab and return to the app.',
    true
);

const failurePage = (message: string) => resultPage('Sign-in failed', message, false);

/**
 * Bind the first port in the pool that is free.
 *
 * Every port here is registered on the OAuth client, because redirect URIs are
 * matched exactly and an ephemeral port could never be. A single fixed port
 * would make sign-in impossible for anyone already running something on it, so
 * we try a handful.
 */
const listenOnFirstAvailablePort = (
    server: http.Server,
    ports: readonly number[]
): Promise<number> =>
    new Promise((resolve, reject) => {
        const attempt = (index: number) => {
            if (index >= ports.length) {
                reject(new Error(
                    `Could not open a local sign-in listener. Ports ${ports.join(', ')} are all in use — `
                    + 'close whatever is using them and try again.'
                ));
                return;
            }
            const onError = (err: NodeJS.ErrnoException) => {
                server.removeListener('listening', onListening);
                if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
                    attempt(index + 1);
                } else {
                    reject(err);
                }
            };
            const onListening = () => {
                server.removeListener('error', onError);
                const address = server.address() as AddressInfo | null;
                resolve(address?.port ?? ports[index]);
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(ports[index], '127.0.0.1');
        };
        attempt(0);
    });

export interface AuthFlowOptions {
    clientId: string;
    /** Injected so tests never launch a browser, and so the caller owns `shell`. */
    openExternal: (url: string) => Promise<void>;
    timeoutMs?: number;
    /** Aborts a flow the user walked away from — closing Settings, say. */
    signal?: { addEventListener: (type: 'abort', listener: () => void) => void; aborted: boolean };
    ports?: readonly number[];
    exchange?: typeof exchangeCodeForTokens;
}

/**
 * Run one sign-in from authorize URL to token set.
 *
 * Resolves rather than rejects on every expected failure — a declined consent
 * screen is an outcome to show the user, not an exception to unwind through the
 * IPC layer.
 */
export const runAuthFlow = async (options: AuthFlowOptions): Promise<AuthFlowOutcome> => {
    const {
        clientId,
        openExternal,
        timeoutMs = AUTH_TIMEOUT_MS,
        signal,
        ports = CLOUDFLARE_REDIRECT_PORTS,
        exchange = exchangeCodeForTokens
    } = options;

    if (!clientId) {
        return { ok: false, error: 'This build has no Cloudflare OAuth client configured.' };
    }

    const pkce = createPkcePair();
    const state = createState();

    let settle: (outcome: CallbackOutcome) => void = () => {};
    const settled = new Promise<CallbackOutcome>((resolve) => {
        settle = resolve;
    });

    const server = http.createServer((req, res) => {
        const result = parseCallbackUrl(req.url ?? '/', state);

        // A request that fails the state check is unsolicited — a stray browser
        // tab or a forged hit. It gets a flat 404 and, crucially, does not end
        // the flow the user is still part-way through.
        if (!result.ok && /did not match|unrelated path/.test(result.error)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }

        res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(result.ok ? SUCCESS_PAGE : failurePage(result.error));

        if (!result.ok) {
            settle({ ok: false, error: result.error });
            return;
        }
        settle({ ok: true, code: result.code });
    });

    let port: number;
    try {
        port = await listenOnFirstAvailablePort(server, ports);
    } catch (err) {
        server.close();
        return { ok: false, error: (err as Error).message };
    }

    const redirectUri = redirectUriForPort(port);
    const timer = setTimeout(() => {
        settle({ ok: false, error: 'Timed out waiting for the Cloudflare sign-in to finish.', cancelled: true });
    }, timeoutMs);
    // Node keeps the process alive for a pending timer; a five-minute one would
    // hold a quitting app open.
    timer.unref?.();

    if (signal) {
        if (signal.aborted) {
            settle({ ok: false, error: 'Sign-in cancelled.', cancelled: true });
        }
        signal.addEventListener('abort', () => {
            settle({ ok: false, error: 'Sign-in cancelled.', cancelled: true });
        });
    }

    try {
        const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state, challenge: pkce.challenge });
        log.info(`[Main] Cloudflare sign-in listening on ${redirectUri}`);
        try {
            await openExternal(authorizeUrl);
        } catch (err) {
            return { ok: false, error: `Could not open your browser: ${(err as Error).message}` };
        }

        const outcome = await settled;
        if (!outcome.ok) return outcome;

        const exchanged = await exchange({ clientId, code: outcome.code, verifier: pkce.verifier, redirectUri });
        if (!exchanged.ok) {
            return { ok: false, error: exchanged.error };
        }
        return { ok: true, tokens: exchanged.tokens };
    } finally {
        clearTimeout(timer);
        server.close();
    }
};
