import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const cloudflareJson = vi.fn();
const cloudflareRequest = vi.fn();
vi.mock('../restClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../restClient')>()),
    cloudflareJson: (...args: unknown[]) => cloudflareJson(...args),
    cloudflareRequest: (...args: unknown[]) => cloudflareRequest(...args)
}));

import { CF_ERR_BUCKET_EXISTS } from '../restClient';
import { DEFAULT_BUCKET_NAME, ensureBucket, enablePublicDevUrl, listAccounts, provisionR2 } from '../provision';

beforeEach(() => {
    cloudflareJson.mockReset();
    cloudflareRequest.mockReset();
    vi.useFakeTimers();
});

/** Drive the retry sleeps in verifyRoundTrip without waiting on them. */
const runAll = async <T>(work: Promise<T>): Promise<T> => {
    const settled = work.finally(() => undefined);
    await vi.runAllTimersAsync();
    return settled;
};

describe('listAccounts', () => {
    it('names the OAuth-access setting when Cloudflare shares no accounts', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: [] });
        const result = await listAccounts('tok');
        expect(result.ok).toBe(false);
        // An empty list is a permissions setting, not a network error — the
        // message has to say where to look or the user has nothing to go on.
        expect(result.ok === false && result.error.failure.message).toMatch(/Public OAuth App access/);
    });

    it('drops entries without an id rather than producing a broken account', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: [{ name: 'no id' }, { id: 'a', name: 'Real' }] });
        const result = await listAccounts('tok');
        expect(result.ok === true && result.value).toEqual([{ id: 'a', name: 'Real' }]);
    });

    it('falls back to the id when an account has no name', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: [{ id: 'abc' }] });
        expect(await listAccounts('tok')).toMatchObject({ value: [{ id: 'abc', name: 'abc' }] });
    });
});

describe('ensureBucket', () => {
    it('adopts a bucket that already exists under our own account', async () => {
        cloudflareJson.mockResolvedValue({ ok: false, failure: { kind: 'http', code: CF_ERR_BUCKET_EXISTS, message: 'exists' } });
        const result = await ensureBucket('tok', 'acct', 'b');
        expect(result).toEqual({ ok: true, value: { adoptedExisting: true } });
    });

    it('does not swallow a genuine creation failure', async () => {
        cloudflareJson.mockResolvedValue({ ok: false, failure: { kind: 'r2-not-enabled', code: 10042, message: 'enable R2' } });
        const result = await ensureBucket('tok', 'acct', 'b');
        expect(result.ok === false && result.error.step).toBe('create-bucket');
    });
});

describe('enablePublicDevUrl', () => {
    it('takes the r2.dev hostname straight from the PUT response', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: { enabled: true, domain: 'pub-abc.r2.dev' } });
        const result = await enablePublicDevUrl('tok', 'acct', 'b');
        expect(result).toEqual({ ok: true, value: 'https://pub-abc.r2.dev' });
        // One call: the domain is in the PUT response, so there is no follow-up GET.
        expect(cloudflareJson).toHaveBeenCalledTimes(1);
    });

    it('fails loudly when the response carries no domain', async () => {
        cloudflareJson.mockResolvedValue({ ok: true, result: { enabled: true } });
        const result = await enablePublicDevUrl('tok', 'acct', 'b');
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error.step).toBe('enable-public-url');
    });
});

describe('provisionR2', () => {
    const happyJson = () => {
        cloudflareJson.mockImplementation(async (opts: { method: string; path: string }) => {
            if (opts.path.endsWith('/domains/managed')) return { ok: true, result: { domain: 'pub-abc.r2.dev' } };
            return { ok: true, result: {} };
        });
    };

    it('reports success only after the object reads back over the public URL', async () => {
        happyJson();
        cloudflareRequest.mockResolvedValue({ status: 200, body: '{}', headers: {} });
        const result = await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct' }));
        expect(result).toMatchObject({
            ok: true,
            value: { bucketName: DEFAULT_BUCKET_NAME, publicUrl: 'https://pub-abc.r2.dev', adoptedExisting: false }
        });
    });

    it('reads the probe back anonymously, as a browser would', async () => {
        happyJson();
        cloudflareRequest.mockResolvedValue({ status: 200, body: '{}', headers: {} });
        await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct' }));
        const read = cloudflareRequest.mock.calls[0][0];
        expect(read.hostname).toBe('pub-abc.r2.dev');
        // A token here would pass on a bucket that is not actually public,
        // which is the exact failure this step exists to catch.
        expect(read.accessToken).toBeUndefined();
    });

    it('refuses to report connected when the bucket is not publicly readable', async () => {
        happyJson();
        cloudflareRequest.mockResolvedValue({ status: 404, body: '', headers: {} });
        const result = await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct' }));
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error.step).toBe('verify');
    });

    it('removes the probe object even when the public read failed', async () => {
        happyJson();
        cloudflareRequest.mockResolvedValue({ status: 404, body: '', headers: {} });
        await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct' }));
        // Otherwise a retry would read back the previous run's object and pass.
        expect(cloudflareJson.mock.calls.some((c) => c[0].method === 'DELETE')).toBe(true);
    });

    it('retries the public read before giving up on a freshly published bucket', async () => {
        happyJson();
        cloudflareRequest
            .mockResolvedValueOnce({ status: 404, body: '', headers: {} })
            .mockResolvedValue({ status: 200, body: '{}', headers: {} });
        const result = await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct' }));
        expect(result.ok).toBe(true);
        expect(cloudflareRequest.mock.calls.length).toBeGreaterThan(1);
    });

    it('stops at the failing step instead of running the rest of the sequence', async () => {
        cloudflareJson.mockResolvedValue({ ok: false, failure: { kind: 'r2-not-enabled', code: 10042, message: 'enable R2' } });
        const result = await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct' }));
        expect(result.ok === false && result.error.step).toBe('create-bucket');
        // No public URL call, no CORS call, no verify.
        expect(cloudflareJson).toHaveBeenCalledTimes(1);
        expect(cloudflareRequest).not.toHaveBeenCalled();
    });

    it('honours a custom bucket name', async () => {
        happyJson();
        cloudflareRequest.mockResolvedValue({ status: 200, body: '{}', headers: {} });
        const result = await runAll(provisionR2({ accessToken: 'tok', accountId: 'acct', bucketName: '  guild-reports ' }));
        expect(result).toMatchObject({ value: { bucketName: 'guild-reports' } });
    });
});
