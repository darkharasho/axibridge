import log from 'electron-log';
import {
    CLOUDFLARE_OAUTH_SCOPES,
    refreshAccessToken,
    revokeToken,
    type TokenSet
} from './oauth';

// ─── Cloudflare OAuth session ─────────────────────────────────────────────────
//
// Owns the persisted token set and the single question every R2 call needs
// answered: "give me an access token that is valid right now."
//
// Tokens are stored in electron-store alongside the existing GitHub token. That
// is plaintext on disk — no better option exists here without introducing
// safeStorage, which nothing else in the app uses. The stored refresh token is
// scoped to R2 writes and account listing, and is revocable from the dashboard.

export interface StoreLike {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete?(key: string): void;
}

export const CF_TOKEN_KEY = 'cloudflareTokenSet';
export const CF_ACCOUNT_ID_KEY = 'cloudflareAccountId';
export const CF_ACCOUNT_NAME_KEY = 'cloudflareAccountName';

/**
 * Refresh this far ahead of expiry. A publish can queue several large uploads
 * behind one token check, so a token that is merely "not expired yet" is not
 * good enough — it has to outlive the request it is about to authorise.
 */
export const REFRESH_SKEW_MS = 60_000;

const isTokenSet = (value: unknown): value is TokenSet =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as TokenSet).accessToken === 'string' &&
    typeof (value as TokenSet).expiresAt === 'number';

export const readTokenSet = (store: StoreLike): TokenSet | null => {
    const stored = store.get(CF_TOKEN_KEY);
    return isTokenSet(stored) ? stored : null;
};

export const writeTokenSet = (store: StoreLike, tokens: TokenSet): void => {
    store.set(CF_TOKEN_KEY, tokens);
};

export const clearSession = (store: StoreLike): void => {
    store.set(CF_TOKEN_KEY, null);
    store.set(CF_ACCOUNT_ID_KEY, '');
    store.set(CF_ACCOUNT_NAME_KEY, '');
};

export const isSessionConnected = (store: StoreLike): boolean => {
    const tokens = readTokenSet(store);
    const accountId = store.get(CF_ACCOUNT_ID_KEY);
    return !!tokens && typeof accountId === 'string' && accountId.trim().length > 0;
};

export class CloudflareSessionError extends Error {
    readonly reauthRequired: boolean;
    constructor(message: string, reauthRequired: boolean) {
        super(message);
        this.name = 'CloudflareSessionError';
        this.reauthRequired = reauthRequired;
    }
}

/**
 * Serialises refreshes. Five concurrent uploads noticing an expired token at the
 * same moment would otherwise fire five refreshes; Cloudflare rotates the
 * refresh token on use, so four of those would race to persist a stale one.
 */
const inFlightRefresh = new WeakMap<StoreLike, Promise<TokenSet>>();

const performRefresh = async (store: StoreLike, clientId: string, tokens: TokenSet): Promise<TokenSet> => {
    if (!tokens.refreshToken) {
        throw new CloudflareSessionError(
            'The Cloudflare session expired and cannot be renewed. Sign in to Cloudflare again.',
            true
        );
    }
    const result = await refreshAccessToken({ clientId, refreshToken: tokens.refreshToken });
    if (!result.ok) {
        // Only a rejected grant means the session is genuinely gone. A network
        // blip or a WAF block must not log the user out of a working account.
        const dead = result.oauthError === 'invalid_grant' || result.oauthError === 'invalid_client';
        throw new CloudflareSessionError(result.error, dead);
    }
    // Cloudflare may omit the refresh token on renewal, meaning "keep using the
    // one you have"; dropping it would silently downgrade the session to
    // single-use and force a re-auth an hour later.
    const next: TokenSet = {
        ...result.tokens,
        refreshToken: result.tokens.refreshToken ?? tokens.refreshToken,
        grantedScopes: result.tokens.grantedScopes.length ? result.tokens.grantedScopes : tokens.grantedScopes
    };
    writeTokenSet(store, next);
    log.info('[Main] Cloudflare access token refreshed');
    return next;
};

export const getAccessToken = async (
    store: StoreLike,
    clientId: string,
    now: number = Date.now()
): Promise<string> => {
    const tokens = readTokenSet(store);
    if (!tokens) {
        throw new CloudflareSessionError('Not signed in to Cloudflare.', true);
    }
    if (tokens.expiresAt - REFRESH_SKEW_MS > now) return tokens.accessToken;

    const existing = inFlightRefresh.get(store);
    if (existing) return (await existing).accessToken;

    const pending = performRefresh(store, clientId, tokens);
    inFlightRefresh.set(store, pending);
    try {
        return (await pending).accessToken;
    } finally {
        inFlightRefresh.delete(store);
    }
};

/** Disconnect: revoke upstream if we can, but always clear locally. */
export const disconnectSession = async (store: StoreLike, clientId: string): Promise<void> => {
    const tokens = readTokenSet(store);
    if (tokens?.refreshToken) {
        // Revocation is a courtesy to Cloudflare, not a precondition for
        // disconnecting. If it throws, the user still asked to be signed out —
        // leaving the token set on disk would be the worse failure.
        try {
            await revokeToken({ clientId, token: tokens.refreshToken });
        } catch (err) {
            log.warn(`[Main] Cloudflare token revoke failed, clearing locally anyway: ${(err as Error).message}`);
        }
    }
    clearSession(store);
    log.info('[Main] Cloudflare session disconnected');
};

export const grantedScopesAreSufficient = (tokens: TokenSet): boolean => {
    if (!tokens.grantedScopes.length) return true; // server declined to enumerate; trust the grant
    // offline_access is not a resource scope — a grant without it still works
    // for the current session, it just cannot be renewed.
    return CLOUDFLARE_OAUTH_SCOPES.filter((scope) => scope !== 'offline_access').every((scope) =>
        tokens.grantedScopes.includes(scope)
    );
};
