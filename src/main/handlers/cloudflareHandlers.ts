import { app, ipcMain, shell, BrowserWindow } from 'electron';
import log from 'electron-log';

import { runAuthFlow } from '../cloudflare/authFlow';
import {
    CLOUDFLARE_OAUTH_CLIENT_ID,
    type TokenSet
} from '../cloudflare/oauth';
import {
    defaultBucketName,
    listAccounts,
    provisionR2,
    type CloudflareAccount,
    type ProvisionFailure
} from '../cloudflare/provision';
import {
    CF_ACCOUNT_ID_KEY,
    CF_ACCOUNT_NAME_KEY,
    clearSession,
    disconnectSession,
    getAccessToken,
    grantedScopesAreSufficient,
    isSessionConnected,
    readTokenSet,
    writeTokenSet,
    type StoreLike
} from '../cloudflare/session';

// ─── "Sign in with Cloudflare" ────────────────────────────────────────────────
//
// Replaces the five hand-copied R2 credential fields with one grant. The manual
// fields stay: they are still the only route to a custom domain, and the only
// fallback if a grant cannot be made.

export interface CloudflareStatus {
    connected: boolean;
    accountId: string;
    accountName: string;
    bucketName: string;
    publicUrl: string;
    /** False in a build with no OAuth client baked in — the button cannot work. */
    clientConfigured: boolean;
}

export const describeCloudflareStatus = (store: StoreLike): CloudflareStatus => ({
    connected: isSessionConnected(store),
    accountId: String(store.get(CF_ACCOUNT_ID_KEY) ?? ''),
    accountName: String(store.get(CF_ACCOUNT_NAME_KEY) ?? ''),
    bucketName: String(store.get('r2BucketName') ?? ''),
    publicUrl: String(store.get('r2PublicUrl') ?? ''),
    clientConfigured: !!CLOUDFLARE_OAUTH_CLIENT_ID
});

/**
 * Turn a provisioning failure into something the user can act on.
 *
 * The three failures that arrive as an indistinguishable 403 have completely
 * different remedies, and the wrong message actively wastes the user's time —
 * telling someone to sign in again when the real problem is a missing payment
 * card sends them round a loop that cannot terminate.
 */
export const explainProvisionFailure = (error: ProvisionFailure): { error: string; helpUrl?: string } => {
    const { step, failure } = error;

    if (failure.kind === 'r2-not-enabled') {
        return {
            error: 'R2 is not enabled on this Cloudflare account yet. Enabling it is free, but Cloudflare '
                + 'requires a payment card on file even for the free tier. Add one, enable R2, then try again.',
            helpUrl: 'https://dash.cloudflare.com/?to=/:account/r2'
        };
    }
    if (failure.kind === 'waf-blocked') {
        return {
            error: 'Cloudflare blocked the request at its edge before it reached the API. This is not a '
                + 'sign-in problem — wait a moment and try again.'
        };
    }
    if (failure.kind === 'unauthorized') {
        return {
            error: step === 'list-accounts'
                ? 'Cloudflare did not accept the sign-in. Try connecting again.'
                : 'Cloudflare refused the request for this account. Make sure the account you picked is one '
                    + 'you can administer, then try again.'
        };
    }
    if (failure.kind === 'rate-limited') {
        return { error: 'Cloudflare is rate-limiting this account right now. Wait a minute and try again.' };
    }
    if (step === 'verify') {
        return {
            error: `The bucket was created but its public URL did not serve a test file back: ${failure.message} `
                + 'Check the bucket\'s public access setting in the Cloudflare dashboard.',
            helpUrl: 'https://dash.cloudflare.com/?to=/:account/r2'
        };
    }
    return { error: failure.message };
};

export type ConnectResult =
    | { success: true; status: CloudflareStatus; adoptedExisting: boolean }
    /** More than one account in the grant — the user has to say which. */
    | { success: true; needsAccountChoice: true; accounts: CloudflareAccount[] }
    | { success: false; error: string; helpUrl?: string; cancelled?: boolean };

export interface ConnectDeps {
    store: StoreLike;
    openExternal: (url: string) => Promise<void>;
    corsOrigin?: string;
    signal?: AuthFlowSignal;
    runAuth?: typeof runAuthFlow;
    list?: typeof listAccounts;
    provision?: typeof provisionR2;
    /** Which bucket to create when the user has not named one. Dev uses its own. */
    defaultBucket?: string;
}

type AuthFlowSignal = Parameters<typeof runAuthFlow>[0]['signal'];

/**
 * Provision against a chosen account and record everything the publish path
 * needs. Writing `r2AuthMode` last is deliberate: until the bucket is verified,
 * switching the uploader over to OAuth would break a working manual setup.
 */
export const finishConnect = async (
    store: StoreLike,
    accountId: string,
    accountName: string,
    options: { corsOrigin?: string; provision?: typeof provisionR2; defaultBucket?: string } = {}
): Promise<ConnectResult> => {
    const provision = options.provision ?? provisionR2;

    let accessToken: string;
    try {
        accessToken = await getAccessToken(store, CLOUDFLARE_OAUTH_CLIENT_ID);
    } catch (err) {
        return { success: false, error: (err as Error).message };
    }

    const result = await provision({
        accessToken,
        accountId,
        bucketName: String(store.get('r2BucketName') ?? '').trim()
            || options.defaultBucket
            || defaultBucketName(false),
        corsOrigin: options.corsOrigin
    });
    if (!result.ok) {
        const explained = explainProvisionFailure(result.error);
        log.warn(`[Main] Cloudflare provisioning failed at ${result.error.step}: ${result.error.failure.message}`);
        return { success: false, ...explained };
    }

    store.set(CF_ACCOUNT_ID_KEY, accountId);
    store.set(CF_ACCOUNT_NAME_KEY, accountName);
    store.set('r2BucketName', result.value.bucketName);
    store.set('r2PublicUrl', result.value.publicUrl);
    store.set('r2AuthMode', 'oauth');
    // Connecting is an explicit "use R2" action, so both artifacts go on —
    // including for a user who had switched one off before disconnecting.
    store.set('r2HostingEnabled', true);
    store.set('r2SliceEnabled', true);

    return {
        success: true,
        status: describeCloudflareStatus(store),
        adoptedExisting: result.value.adoptedExisting
    };
};

/** Sign in, then either provision straight away or ask which account to use. */
export const connectCloudflare = async (deps: ConnectDeps): Promise<ConnectResult> => {
    const { store, openExternal, corsOrigin } = deps;
    const runAuth = deps.runAuth ?? runAuthFlow;
    const list = deps.list ?? listAccounts;

    const auth = await runAuth({
        clientId: CLOUDFLARE_OAUTH_CLIENT_ID,
        openExternal,
        signal: deps.signal
    });
    if (!auth.ok) {
        return { success: false, error: auth.error, cancelled: auth.cancelled };
    }

    const tokens: TokenSet = auth.tokens;
    if (!grantedScopesAreSufficient(tokens)) {
        return {
            success: false,
            error: 'The Cloudflare sign-in did not grant the permissions AxiBridge needs to manage an R2 '
                + 'bucket. Connect again and accept all of the requested permissions.'
        };
    }
    // Stored before provisioning: the account list call below needs the token,
    // and `getAccessToken` reads it from the store.
    writeTokenSet(store, tokens);

    const accounts = await list(tokens.accessToken);
    if (!accounts.ok) {
        // Nothing was provisioned, so nothing is half-configured — but a stored
        // token with no account is a session the UI would call "connected".
        clearSession(store);
        return { success: false, ...explainProvisionFailure(accounts.error) };
    }
    if (accounts.value.length > 1) {
        return { success: true, needsAccountChoice: true, accounts: accounts.value };
    }

    const [account] = accounts.value;
    return finishConnect(store, account.id, account.name, {
        corsOrigin,
        provision: deps.provision,
        defaultBucket: deps.defaultBucket
    });
};

// ─── Handler registration ─────────────────────────────────────────────────────

export interface CloudflareHandlerOptions {
    store: StoreLike;
    getWindow: () => BrowserWindow | null;
}

export function registerCloudflareHandlers({ store }: CloudflareHandlerOptions) {
    /** Lets a second sign-in, or leaving Settings, abandon the first one's listener. */
    let inFlight: AbortController | null = null;

    // `app.isPackaged` is the same signal that isolates dev userData, so a dev
    // run gets its own bucket for the same reason it gets its own settings.
    const bucketDefault = defaultBucketName(!app.isPackaged);

    /**
     * Set CORS during provisioning rather than waiting for the first publish to
     * do it, so a freshly connected bucket is already usable. The publish path
     * still checks — the Pages URL may not exist yet at sign-in time.
     */
    const defaultCorsOrigin = (): string | undefined => {
        const base = String(store.get('githubPagesBaseUrl') ?? '').trim();
        if (!base) return undefined;
        try {
            return new URL(base).origin;
        } catch {
            return undefined;
        }
    };

    ipcMain.handle('get-cloudflare-status', async () => describeCloudflareStatus(store));

    ipcMain.handle('start-cloudflare-oauth', async (_event, payload?: { corsOrigin?: string }) => {
        inFlight?.abort();
        const controller = new AbortController();
        inFlight = controller;
        try {
            return await connectCloudflare({
                store,
                openExternal: (url) => shell.openExternal(url),
                corsOrigin: payload?.corsOrigin ?? defaultCorsOrigin(),
                signal: controller.signal,
                defaultBucket: bucketDefault
            });
        } catch (err) {
            log.error('[Main] Cloudflare sign-in threw', err);
            return { success: false, error: (err as Error)?.message || 'Cloudflare sign-in failed.' };
        } finally {
            if (inFlight === controller) inFlight = null;
        }
    });

    ipcMain.handle('select-cloudflare-account', async (_event, payload: { accountId: string; accountName?: string; corsOrigin?: string }) => {
        const accountId = String(payload?.accountId ?? '').trim();
        if (!accountId) {
            return { success: false, error: 'No Cloudflare account was selected.' };
        }
        if (!readTokenSet(store)) {
            return { success: false, error: 'The Cloudflare sign-in expired before an account was chosen. Connect again.' };
        }
        try {
            return await finishConnect(store, accountId, String(payload?.accountName ?? '').trim(), {
                corsOrigin: payload?.corsOrigin ?? defaultCorsOrigin(),
                defaultBucket: bucketDefault
            });
        } catch (err) {
            log.error('[Main] Cloudflare provisioning threw', err);
            return { success: false, error: (err as Error)?.message || 'Cloudflare provisioning failed.' };
        }
    });

    ipcMain.handle('cancel-cloudflare-oauth', async () => {
        inFlight?.abort();
        return { success: true };
    });

    ipcMain.handle('disconnect-cloudflare', async () => {
        inFlight?.abort();
        await disconnectSession(store, CLOUDFLARE_OAUTH_CLIENT_ID);
        // Leave the bucket and its contents alone — published reports keep
        // working. Only the app's ability to write to it goes away.
        store.set('r2AuthMode', 'manual');
        return { success: true, status: describeCloudflareStatus(store) };
    });
}
