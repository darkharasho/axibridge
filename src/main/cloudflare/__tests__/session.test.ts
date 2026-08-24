import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const refreshAccessToken = vi.fn();
const revokeToken = vi.fn();
vi.mock('../oauth', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../oauth')>()),
    refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
    revokeToken: (...args: unknown[]) => revokeToken(...args)
}));

import {
    CF_ACCOUNT_ID_KEY,
    CF_TOKEN_KEY,
    CloudflareSessionError,
    disconnectSession,
    getAccessToken,
    isSessionConnected
} from '../session';

const makeStore = (values: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { ...values };
    return {
        data,
        get: (key: string) => data[key],
        set: (key: string, value: unknown) => {
            data[key] = value;
        }
    };
};

const NOW = 1_700_000_000_000;
const live = { accessToken: 'live', refreshToken: 'r1', expiresAt: NOW + 600_000, grantedScopes: ['workers-r2.write'] };
const stale = { ...live, accessToken: 'stale', expiresAt: NOW + 5_000 };

beforeEach(() => {
    refreshAccessToken.mockReset();
    revokeToken.mockReset();
});

describe('getAccessToken', () => {
    it('returns the stored token without refreshing while it is comfortably valid', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: live });
        await expect(getAccessToken(store, 'client', NOW)).resolves.toBe('live');
        expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes a token that expires inside the skew window rather than using it', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        refreshAccessToken.mockResolvedValue({
            ok: true,
            tokens: { accessToken: 'fresh', refreshToken: 'r2', expiresAt: NOW + 600_000, grantedScopes: [] }
        });
        await expect(getAccessToken(store, 'client', NOW)).resolves.toBe('fresh');
        expect(store.data[CF_TOKEN_KEY]).toMatchObject({ accessToken: 'fresh', refreshToken: 'r2' });
    });

    it('keeps the old refresh token when the renewal response omits one', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        refreshAccessToken.mockResolvedValue({
            ok: true,
            tokens: { accessToken: 'fresh', expiresAt: NOW + 600_000, grantedScopes: [] }
        });
        await getAccessToken(store, 'client', NOW);
        expect(store.data[CF_TOKEN_KEY]).toMatchObject({ refreshToken: 'r1' });
    });

    it('coalesces concurrent refreshes into one token request', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        refreshAccessToken.mockResolvedValue({
            ok: true,
            tokens: { accessToken: 'fresh', refreshToken: 'r2', expiresAt: NOW + 600_000, grantedScopes: [] }
        });
        const results = await Promise.all([
            getAccessToken(store, 'client', NOW),
            getAccessToken(store, 'client', NOW),
            getAccessToken(store, 'client', NOW)
        ]);
        expect(results).toEqual(['fresh', 'fresh', 'fresh']);
        expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it('treats a rejected grant as a dead session that needs re-authorisation', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        refreshAccessToken.mockResolvedValue({ ok: false, error: 'nope', oauthError: 'invalid_grant' });
        await expect(getAccessToken(store, 'client', NOW)).rejects.toMatchObject({ reauthRequired: true });
    });

    it('does not sign the user out over a transport failure', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        refreshAccessToken.mockResolvedValue({ ok: false, error: 'Could not reach Cloudflare: ETIMEDOUT' });
        await expect(getAccessToken(store, 'client', NOW)).rejects.toMatchObject({ reauthRequired: false });
        expect(store.data[CF_TOKEN_KEY]).toEqual(stale);
    });

    it('reports a missing session rather than throwing a shapeless error', async () => {
        await expect(getAccessToken(makeStore(), 'client', NOW)).rejects.toBeInstanceOf(CloudflareSessionError);
    });
});

describe('isSessionConnected', () => {
    it('needs both a token set and a chosen account', () => {
        expect(isSessionConnected(makeStore({ [CF_TOKEN_KEY]: live }))).toBe(false);
        expect(isSessionConnected(makeStore({ [CF_TOKEN_KEY]: live, [CF_ACCOUNT_ID_KEY]: 'acct' }))).toBe(true);
    });
});

describe('disconnectSession', () => {
    it('clears local state even when the upstream revoke fails', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: live, [CF_ACCOUNT_ID_KEY]: 'acct' });
        revokeToken.mockRejectedValue(new Error('offline'));
        await disconnectSession(store, 'client');
        // A user who asked to disconnect must end up disconnected. An
        // unreachable revoke endpoint cannot strand a live token set on disk.
        expect(store.data[CF_TOKEN_KEY]).toBeNull();
        expect(store.data[CF_ACCOUNT_ID_KEY]).toBe('');
    });

    it('revokes the refresh token and clears the account', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: live, [CF_ACCOUNT_ID_KEY]: 'acct' });
        revokeToken.mockResolvedValue(undefined);
        await disconnectSession(store, 'client');
        expect(revokeToken).toHaveBeenCalledWith({ clientId: 'client', token: 'r1' });
        expect(store.data[CF_TOKEN_KEY]).toBeNull();
        expect(store.data[CF_ACCOUNT_ID_KEY]).toBe('');
    });
});

describe('getAccessToken with no OAuth client id', () => {
    // Cloudflare answers an empty client_id with a generic "client credentials
    // missing or malformed" invalid_request, which reads like a dead session and
    // sends users off re-authorising a problem re-authorising cannot fix.
    it('fails before any network call and names the real cause', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        await expect(getAccessToken(store, '', NOW)).rejects.toThrow(/no Cloudflare OAuth client configured/i);
        expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('does not ask the user to sign in again — signing in cannot supply a client id', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: stale });
        await expect(getAccessToken(store, '', NOW)).rejects.toMatchObject({
            name: 'CloudflareSessionError',
            reauthRequired: false
        });
    });

    it('still serves a token that is comfortably valid, which needs no client id', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: live });
        await expect(getAccessToken(store, '', NOW)).resolves.toBe('live');
    });
});
