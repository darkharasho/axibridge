import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    shell: { openExternal: vi.fn() },
    BrowserWindow: class {},
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
    connectCloudflare,
    describeCloudflareStatus,
    explainProvisionFailure,
    finishConnect,
} from '../cloudflareHandlers';
import { CF_ACCOUNT_ID_KEY, CF_ACCOUNT_NAME_KEY, CF_TOKEN_KEY } from '../../cloudflare/session';

const TOKENS = {
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 3_600_000,
    grantedScopes: ['workers-r2.write', 'memberships.read', 'offline_access'],
};

const makeStore = (initial: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { ...initial };
    return {
        data,
        get: (key: string) => data[key],
        set: (key: string, value: unknown) => { data[key] = value; },
        delete: (key: string) => { delete data[key]; },
    };
};

const okProvision = vi.fn(async () => ({
    ok: true as const,
    value: {
        accountId: 'acct-1',
        bucketName: 'axibridge-reports',
        publicUrl: 'https://pub-abc.r2.dev',
        adoptedExisting: false,
    },
}));

const deps = (store: ReturnType<typeof makeStore>, overrides: Record<string, unknown> = {}) => ({
    store,
    openExternal: vi.fn(async () => {}),
    runAuth: vi.fn(async () => ({ ok: true as const, tokens: TOKENS })),
    list: vi.fn(async () => ({ ok: true as const, value: [{ id: 'acct-1', name: 'Personal' }] })),
    provision: okProvision,
    ...overrides,
} as unknown as Parameters<typeof connectCloudflare>[0]);

beforeEach(() => {
    okProvision.mockClear();
});

describe('connectCloudflare', () => {
    it('provisions straight away when the grant covers exactly one account', async () => {
        const store = makeStore();
        const result = await connectCloudflare(deps(store));

        expect(result).toMatchObject({ success: true, adoptedExisting: false });
        expect(store.data['r2AuthMode']).toBe('oauth');
        expect(store.data['r2BucketName']).toBe('axibridge-reports');
        expect(store.data['r2PublicUrl']).toBe('https://pub-abc.r2.dev');
        expect(store.data[CF_ACCOUNT_ID_KEY]).toBe('acct-1');
        expect(store.data[CF_ACCOUNT_NAME_KEY]).toBe('Personal');
    });

    it('asks which account to use rather than picking one when the grant covers several', async () => {
        const store = makeStore();
        const list = vi.fn(async () => ({
            ok: true as const,
            value: [{ id: 'a', name: 'Personal' }, { id: 'b', name: 'Guild' }],
        }));
        const result = await connectCloudflare(deps(store, { list }));

        expect(result).toMatchObject({ success: true, needsAccountChoice: true });
        expect(okProvision).not.toHaveBeenCalled();
        // Nothing is switched over until the user has actually chosen.
        expect(store.data['r2AuthMode']).toBeUndefined();
    });

    it('keeps a working manual setup untouched when provisioning fails', async () => {
        const store = makeStore({ r2AuthMode: 'manual', r2AccountId: 'manual-acct', r2BucketName: 'mine' });
        const provision = vi.fn(async () => ({
            ok: false as const,
            error: { step: 'create-bucket' as const, failure: { kind: 'r2-not-enabled' as const, code: 10042, message: 'R2 not enabled' } },
        }));
        const result = await connectCloudflare(deps(store, { provision }));

        expect(result.success).toBe(false);
        expect(store.data['r2AuthMode']).toBe('manual');
        expect(store.data['r2PublicUrl']).toBeUndefined();
    });

    it('refuses a grant that came back without the R2 write scope', async () => {
        const store = makeStore();
        const runAuth = vi.fn(async () => ({
            ok: true as const,
            tokens: { ...TOKENS, grantedScopes: ['memberships.read'] },
        }));
        const result = await connectCloudflare(deps(store, { runAuth }));

        expect(result.success).toBe(false);
        expect(result.success === false && result.error).toMatch(/permissions/i);
        expect(store.data[CF_TOKEN_KEY]).toBeUndefined();
    });

    it('does not leave a half-connected session behind when the account list fails', async () => {
        const store = makeStore();
        const list = vi.fn(async () => ({
            ok: false as const,
            error: { step: 'list-accounts' as const, failure: { kind: 'unauthorized' as const, code: 9109, message: 'nope' } },
        }));
        const result = await connectCloudflare(deps(store, { list }));

        expect(result.success).toBe(false);
        // A stored token with no account id is a dead state: nothing can use it,
        // and the next sign-in would layer a second grant on top. Nothing worth
        // preserving was established yet, so the token goes.
        expect(store.data[CF_TOKEN_KEY]).toBeFalsy();
        expect(describeCloudflareStatus(store).connected).toBe(false);
    });

    it('passes a declined consent screen straight through as a cancellation', async () => {
        const store = makeStore();
        const runAuth = vi.fn(async () => ({
            ok: false as const,
            error: 'Consent was declined in Cloudflare, so nothing was changed.',
        }));
        const result = await connectCloudflare(deps(store, { runAuth }));

        expect(result).toEqual({
            success: false,
            error: 'Consent was declined in Cloudflare, so nothing was changed.',
            cancelled: undefined,
        });
    });

    it('reuses a bucket name the user already set instead of forcing the default', async () => {
        const store = makeStore({ r2BucketName: 'my-own-bucket' });
        await connectCloudflare(deps(store));
        expect(okProvision).toHaveBeenCalledWith(expect.objectContaining({ bucketName: 'my-own-bucket' }));
    });
});

describe('finishConnect', () => {
    it('reports an adopted bucket so the UI can say it reused one', async () => {
        const store = makeStore({ [CF_TOKEN_KEY]: TOKENS });
        const provision = vi.fn(async () => ({
            ok: true as const,
            value: { accountId: 'b', bucketName: 'axibridge-reports', publicUrl: 'https://pub-x.r2.dev', adoptedExisting: true },
        }));
        const result = await finishConnect(store, 'b', 'Guild', { provision });

        expect(result).toMatchObject({ success: true, adoptedExisting: true });
        expect(store.data[CF_ACCOUNT_ID_KEY]).toBe('b');
    });
});

describe('explainProvisionFailure', () => {
    it('tells the user about the payment card instead of blaming the sign-in', () => {
        const explained = explainProvisionFailure({
            step: 'create-bucket',
            failure: { kind: 'r2-not-enabled', code: 10042, message: 'R2 is not enabled' },
        });
        expect(explained.error).toMatch(/payment card/i);
        expect(explained.error).not.toMatch(/sign in again/i);
        expect(explained.helpUrl).toContain('r2');
    });

    it('says a WAF block is not a sign-in problem, because the remedy is the opposite', () => {
        const explained = explainProvisionFailure({
            step: 'list-accounts',
            failure: { kind: 'waf-blocked', message: 'error code: 1010' },
        });
        expect(explained.error).toMatch(/not a sign-in problem/i);
    });

    it('distinguishes an unauthorized account from an unauthorized sign-in', () => {
        const atSignIn = explainProvisionFailure({
            step: 'list-accounts',
            failure: { kind: 'unauthorized', code: 9109, message: 'x' },
        });
        const atBucket = explainProvisionFailure({
            step: 'create-bucket',
            failure: { kind: 'unauthorized', code: 9109, message: 'x' },
        });
        expect(atSignIn.error).toMatch(/connecting again/i);
        expect(atBucket.error).toMatch(/administer/i);
    });

    it('points a failed verification at public access, not at the sign-in', () => {
        const explained = explainProvisionFailure({
            step: 'verify',
            failure: { kind: 'http', status: 404, message: 'not found' },
        });
        expect(explained.error).toMatch(/public access/i);
    });
});

describe('describeCloudflareStatus', () => {
    it('is not connected on a token set with no account chosen yet', () => {
        expect(describeCloudflareStatus(makeStore({ [CF_TOKEN_KEY]: TOKENS })).connected).toBe(false);
    });

    it('is connected once both a token and an account are stored', () => {
        const status = describeCloudflareStatus(makeStore({
            [CF_TOKEN_KEY]: TOKENS,
            [CF_ACCOUNT_ID_KEY]: 'acct-1',
            [CF_ACCOUNT_NAME_KEY]: 'Personal',
            r2BucketName: 'axibridge-reports',
            r2PublicUrl: 'https://pub-abc.r2.dev',
        }));
        expect(status).toMatchObject({ connected: true, accountName: 'Personal', bucketName: 'axibridge-reports' });
    });
});
