import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const cloudflareJson = vi.fn();
vi.mock('../restClient', () => ({
    cloudflareJson: (...args: unknown[]) => cloudflareJson(...args)
}));

import { createOAuthUploader } from '../uploader';

const makeUploader = () =>
    createOAuthUploader({
        accountId: 'acct',
        bucketName: 'my bucket',
        publicUrl: 'https://pub-x.r2.dev/',
        getAccessToken: async () => 'tok'
    });

// Braced body on purpose: mockReset() returns the mock, and Vitest treats a
// value returned from beforeEach as a cleanup function — so an expression-bodied
// arrow makes it *call the mock* with no arguments after every test.
beforeEach(() => {
    cloudflareJson.mockReset();
});

describe('OAuth uploader object operations', () => {
    it('keeps slashes as path separators while escaping the rest of the key', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: {} });
        await makeUploader().putObject('reports/a b/replay.json', Buffer.from('{}'), 'application/json');
        expect(cloudflareJson.mock.calls[0][0].path).toBe(
            '/client/v4/accounts/acct/r2/buckets/my%20bucket/objects/reports/a%20b/replay.json'
        );
    });

    it('returns the public URL built from the un-escaped key', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: {} });
        const result = await makeUploader().putObject('reports/x/replay.json', Buffer.from('{}'), 'application/json');
        // Trailing slash on the configured public URL must not double up.
        expect(result).toEqual({ success: true, url: 'https://pub-x.r2.dev/reports/x/replay.json' });
    });

    it('surfaces the classified failure message rather than a bare status', async () => {
        cloudflareJson.mockResolvedValue({ ok: false, failure: { kind: 'r2-not-enabled', message: 'R2 is not enabled.' } });
        const result = await makeUploader().putObject('k', Buffer.alloc(0), 'application/json');
        expect(result).toEqual({ success: false, error: 'R2 is not enabled.' });
    });

    it('deletes through the same key encoding', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: {} });
        await makeUploader().deleteObject('reports/x/replay.json');
        expect(cloudflareJson.mock.calls[0][0]).toMatchObject({ method: 'DELETE', accessToken: 'tok' });
    });
});

describe('OAuth uploader CORS', () => {
    const withExistingRules = (rules: unknown[]) => {
        cloudflareJson.mockImplementation(async (opts: { method: string }) =>
            opts.method === 'GET' ? { ok: true, result: { rules } } : { ok: true, result: {} }
        );
    };

    it('appends to the existing rules instead of replacing them', async () => {
        withExistingRules([{ allowed: { origins: ['https://other.example'], methods: ['GET'] } }]);
        const result = await makeUploader().ensureCors('https://user.github.io');
        expect(result.success).toBe(true);
        const put = cloudflareJson.mock.calls.find((c) => c[0].method === 'PUT');
        expect(JSON.parse(put![0].body.toString())).toEqual({
            rules: [
                { allowed: { origins: ['https://other.example'], methods: ['GET'] } },
                { allowed: { origins: ['https://user.github.io'], methods: ['GET'], headers: ['*'] } }
            ]
        });
    });

    it('writes nothing when the origin is already allowed', async () => {
        withExistingRules([{ allowed: { origins: ['https://user.github.io'] } }]);
        await makeUploader().ensureCors('https://user.github.io');
        expect(cloudflareJson.mock.calls.some((c) => c[0].method === 'PUT')).toBe(false);
    });

    it('treats a wildcard origin as already covering everything', async () => {
        withExistingRules([{ allowed: { origins: ['*'] } }]);
        await makeUploader().ensureCors('https://user.github.io');
        expect(cloudflareJson.mock.calls.some((c) => c[0].method === 'PUT')).toBe(false);
    });

    it('establishes a config when the bucket has none to read', async () => {
        cloudflareJson.mockImplementation(async (opts: { method: string }) =>
            opts.method === 'GET'
                ? { ok: false, failure: { kind: 'http', message: 'no cors config' } }
                : { ok: true, result: {} }
        );
        const result = await makeUploader().ensureCors('https://user.github.io');
        expect(result.success).toBe(true);
        const put = cloudflareJson.mock.calls.find((c) => c[0].method === 'PUT');
        expect(JSON.parse(put![0].body.toString()).rules).toHaveLength(1);
    });
});
