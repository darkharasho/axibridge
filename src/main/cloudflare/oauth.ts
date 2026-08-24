import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { CLOUDFLARE_USER_AGENT } from './restClient';

/**
 * Cloudflare shipped self-managed OAuth clients GA on 2026-06-03. Desktop apps are
 * an explicitly supported public client type: authorization code only, PKCE S256
 * required, `token_endpoint_auth_method: "none"` — so no client secret ships in the
 * binary. Endpoints come from https://dash.cloudflare.com/.well-known/openid-configuration
 */
export const CLOUDFLARE_AUTHORIZE_URL = 'https://dash.cloudflare.com/oauth2/auth';
export const CLOUDFLARE_TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
export const CLOUDFLARE_REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';

/**
 * The registered OAuth client. Not a secret — it is a public client
 * (`token_endpoint_auth_method: "none"`, PKCE S256) and the id already travels
 * in the authorize URL, so there is nothing here to leak.
 *
 * It must be baked in, not left to the environment: a packaged build has no
 * shell to export the variable, and an empty client id makes Cloudflare answer
 * every token call with a generic "client credentials missing or malformed"
 * that looks nothing like the misconfiguration it is. The env var still wins,
 * for pointing a dev build at a client on another account.
 */
export const CLOUDFLARE_OAUTH_CLIENT_ID =
    process.env.CLOUDFLARE_OAUTH_CLIENT_ID || '676540c5844fe8c89b6b9cb8482c304d';

/**
 * `workers-r2.write` is account-wide R2 admin and **implies read** — verified in
 * probe 2, where an object GET succeeded on a grant containing no
 * `workers-r2.read`. It cannot be narrowed to a single bucket: the REST object
 * endpoints reject object-scoped grants, and `workers-r2-bucket-item.*` is
 * S3-API-only and cannot create a bucket, enable r2.dev, or set CORS.
 *
 * Do not add scopes "to be safe". Each one widens what the consent screen asks for.
 */
export const CLOUDFLARE_OAUTH_SCOPES = ['workers-r2.write', 'memberships.read', 'offline_access'] as const;

/**
 * OAuth redirect URIs are matched exactly, and every port used here has to be
 * pre-registered on the client. That rules out an ephemeral port, so we register a
 * small pool and take the first one that binds — a single fixed port would make
 * sign-in fail outright for anyone already running something on it.
 */
export const CLOUDFLARE_REDIRECT_PORTS = [8976, 8977, 8978, 51703] as const;

/**
 * RFC 8252 §7.3: use the loopback IP literal, not `localhost`. `localhost`
 * resolves through the name service and can be redirected by a hosts entry.
 */
export const redirectUriForPort = (port: number): string => `http://127.0.0.1:${port}/oauth/callback`;

export interface PkcePair {
    verifier: string;
    challenge: string;
    method: 'S256';
}

export const createPkcePair = (): PkcePair => {
    // 32 bytes → 43 base64url characters, the RFC 7636 minimum.
    const verifier = randomBytes(32).toString('base64url');
    return {
        verifier,
        challenge: createHash('sha256').update(verifier).digest('base64url'),
        method: 'S256'
    };
};

export const createState = (): string => randomBytes(32).toString('base64url');

export interface AuthorizeUrlParams {
    clientId: string;
    redirectUri: string;
    state: string;
    challenge: string;
}

export const buildAuthorizeUrl = ({ clientId, redirectUri, state, challenge }: AuthorizeUrlParams): string => {
    const url = new URL(CLOUDFLARE_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', CLOUDFLARE_OAUTH_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
};

export type CallbackResult = { ok: true; code: string } | { ok: false; error: string };

/** Constant-time compare so a state check cannot be probed byte by byte. */
const statesMatch = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Validate a loopback callback. The state check comes first and applies to the
 * error path too — an unsolicited request to the listener, forged or stray, must
 * not be able to report anything to the user.
 */
export const parseCallbackUrl = (requestUrl: string, expectedState: string): CallbackResult => {
    let url: URL;
    try {
        url = new URL(requestUrl, 'http://127.0.0.1');
    } catch {
        return { ok: false, error: 'Cloudflare returned a callback that could not be parsed.' };
    }

    if (url.pathname !== '/oauth/callback') {
        return { ok: false, error: 'Ignored a request to an unrelated path.' };
    }

    const state = url.searchParams.get('state');
    if (!state || !statesMatch(state, expectedState)) {
        return { ok: false, error: 'The Cloudflare sign-in response did not match this request. Try again.' };
    }

    const error = url.searchParams.get('error');
    if (error) {
        if (error === 'access_denied') {
            return { ok: false, error: 'Consent was declined in Cloudflare, so nothing was changed.' };
        }
        const description = url.searchParams.get('error_description');
        return { ok: false, error: `Cloudflare refused the sign-in (${error})${description ? `: ${description}` : ''}.` };
    }

    const code = url.searchParams.get('code');
    if (!code) {
        return { ok: false, error: 'Cloudflare returned no authorization code.' };
    }

    return { ok: true, code };
};

export interface TokenSet {
    accessToken: string;
    refreshToken?: string;
    /** Epoch milliseconds. */
    expiresAt: number;
    grantedScopes: string[];
}

interface TokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
}

/**
 * `oauthError` carries the machine-readable OAuth code (`invalid_grant` and
 * friends) separately from the display message, so callers can tell "this
 * refresh token is dead, re-authorise" from "the network was down" without
 * pattern-matching on prose.
 */
export type TokenEndpointResult =
    | { ok: true; tokens: TokenSet }
    | { ok: false; error: string; oauthError?: string };

/**
 * Token endpoint calls are form-encoded, unauthenticated (public client), and — like
 * every other Cloudflare request — must carry an explicit User-Agent. A default
 * agent gets a WAF 403 here, which reads exactly like a broken OAuth configuration.
 */
const postTokenEndpoint = async (
    url: string,
    form: Record<string, string>
): Promise<TokenEndpointResult> => {
    const body = new URLSearchParams(form).toString();
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
                'User-Agent': CLOUDFLARE_USER_AGENT
            },
            body
        });
    } catch (err) {
        return { ok: false, error: `Could not reach Cloudflare: ${(err as Error).message}` };
    }

    const text = await response.text();

    if (/error code:\s*1010/i.test(text)) {
        return {
            ok: false,
            error: 'Cloudflare blocked the token request at its edge (error 1010). This is not a sign-in '
                + 'problem — the request never reached the OAuth endpoint.'
        };
    }

    let parsed: TokenResponse;
    try {
        parsed = JSON.parse(text) as TokenResponse;
    } catch {
        return { ok: false, error: `Cloudflare returned an unreadable token response (HTTP ${response.status}).` };
    }

    if (!response.ok || parsed.error) {
        const detail = parsed.error_description || parsed.error || `HTTP ${response.status}`;
        return { ok: false, error: `Cloudflare rejected the token request: ${detail}`, oauthError: parsed.error };
    }
    if (!parsed.access_token) {
        return { ok: false, error: 'Cloudflare returned no access token.' };
    }

    return {
        ok: true,
        tokens: {
            accessToken: parsed.access_token,
            refreshToken: parsed.refresh_token,
            // Default to a short life rather than a long one: a needless refresh is
            // cheap, a request with a dead token fails a user's publish.
            expiresAt: Date.now() + (parsed.expires_in ?? 300) * 1000,
            grantedScopes: parsed.scope ? parsed.scope.split(/\s+/).filter(Boolean) : []
        }
    };
};

export const exchangeCodeForTokens = (params: {
    clientId: string;
    code: string;
    verifier: string;
    redirectUri: string;
}) =>
    postTokenEndpoint(CLOUDFLARE_TOKEN_URL, {
        grant_type: 'authorization_code',
        client_id: params.clientId,
        code: params.code,
        code_verifier: params.verifier,
        redirect_uri: params.redirectUri
    });

export const refreshAccessToken = (params: { clientId: string; refreshToken: string }) =>
    postTokenEndpoint(CLOUDFLARE_TOKEN_URL, {
        grant_type: 'refresh_token',
        client_id: params.clientId,
        refresh_token: params.refreshToken
    });

/** Best-effort: a failed revoke must not block clearing local state on disconnect. */
export const revokeToken = async (params: { clientId: string; token: string }): Promise<void> => {
    try {
        await fetch(CLOUDFLARE_REVOKE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': CLOUDFLARE_USER_AGENT
            },
            body: new URLSearchParams({ client_id: params.clientId, token: params.token }).toString()
        });
    } catch {
        // Ignored by design — see above.
    }
};
