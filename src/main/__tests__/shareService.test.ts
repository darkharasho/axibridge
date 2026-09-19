import { describe, expect, it, vi } from 'vitest';
import { gzipSync, gunzipSync, constants as zlibConstants } from 'zlib';
import { compressReport, shareLog, type ShareTarget } from '../shareService';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }],
    targets: [{ name: 'E' }]
};

const okTarget = (): ShareTarget & { putObject: ReturnType<typeof vi.fn> } => ({
    putObject: vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.gz' })
});

const okWorker = () => vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 'k3Xm9qR2', url: 'https://bridge.axi.link/r/k3Xm9qR2' }), { status: 201 })
);

const deps = (over: Partial<Parameters<typeof shareLog>[2]> = {}) => ({
    target: okTarget(),
    githubToken: 'gho_valid',
    fetchImpl: okWorker() as any,
    ...over
});

describe('compressReport', () => {
    it('round-trips through gunzipSync', () => {
        const restored = JSON.parse(gunzipSync(compressReport(details)).toString('utf8'));
        expect(restored).toEqual(details);
    });

    it('produces something smaller than the raw JSON', () => {
        const raw = Buffer.byteLength(JSON.stringify({ padding: 'a'.repeat(10000) }));
        expect(compressReport({ padding: 'a'.repeat(10000) }).length).toBeLessThan(raw);
    });

    it('compresses better than gzip level 1, guarding against a collapse to the weakest setting', () => {
        // This does not pin Z_BEST_COMPRESSION specifically (an exact byte count is
        // brittle across zlib versions) — it only guards against silently
        // regressing to the weakest gzip level. Measured on this fixture: level 1
        // -> 96 bytes, Z_BEST_COMPRESSION -> 61 bytes.
        const input = { padding: 'a'.repeat(10000) };
        const raw = Buffer.from(JSON.stringify(input), 'utf8');
        const lowLevel = gzipSync(raw, { level: 1 });
        expect(compressReport(input).length).toBeLessThan(lowLevel.length);
    });
});

describe('shareLog', () => {
    it('returns the code and url from the worker', async () => {
        await expect(shareLog(details, 'log-1', deps())).resolves.toMatchObject({
            success: true,
            code: 'k3Xm9qR2',
            url: 'https://bridge.axi.link/r/k3Xm9qR2'
        });
    });

    it('uploads gzip-compressed bytes under a .json.gz key', async () => {
        const target = okTarget();
        await shareLog(details, 'log-1', deps({ target }));
        const [key, body, contentType] = target.putObject.mock.calls[0];
        expect(key).toBe('shares/log-1.json.gz');
        expect(contentType).toBe('application/gzip');
        expect(JSON.parse(gunzipSync(body).toString('utf8'))).toEqual(details);
    });

    it('posts the summary and the uploaded location to the worker', async () => {
        const fetchImpl = okWorker();
        await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        const [, init] = fetchImpl.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.loc).toBe('https://cdn.example.com/a.gz');
        expect(body.sum.f).toBe('Detonator');
        expect(init.headers.Authorization).toBe('Bearer gho_valid');
    });

    it('fails without a GitHub token and never uploads', async () => {
        const target = okTarget();
        const result = await shareLog(details, 'log-1', deps({ target, githubToken: null }));
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/GitHub/i);
        expect(target.putObject).not.toHaveBeenCalled();
    });

    it('surfaces an upload failure without calling the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockResolvedValue({ success: false, error: 'bucket missing' }) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('bucket missing');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        [400, 'Missing report location.'],
        [401, 'GitHub authentication required.'],
        [413, 'Payload too large.'],
        [429, 'Share rate limit reached. Try again later.'],
        [503, 'Could not allocate a share code. Try again.'],
        [500, 'internal error']
    ])('surfaces a worker rejection for status %i verbatim', async (status, workerError) => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: workerError }), { status })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toBe(workerError);
    });

    it('surfaces the 429 rate-limit message distinctly and human-readably', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: 'Share rate limit reached. Try again later.' }), { status: 429 })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('rate limit');
    });

    it('resolves (does not reject) when putObject rejects, and never calls the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockRejectedValue(new Error('Not signed in to Cloudflare.')) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('Not signed in to Cloudflare.');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('resolves (does not reject) when the report has a circular reference', async () => {
        const circular: any = { fightName: 'Detonator' };
        circular.self = circular;
        const target = okTarget();
        const fetchImpl = okWorker();
        const result = await shareLog(circular, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(target.putObject).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('rejects a non-https upload location before calling the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockResolvedValue({ success: true, url: 'http://cdn.example.com/a.br' }) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('surfaces a network failure reaching the worker', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('offline');
    });

    it('never reports success on a non-201 status even when the body parses cleanly', async () => {
        // Guards against checking response.ok alone: a hypothetical 200 with a
        // code/url-shaped body must still not be treated as success, since the
        // Worker's contract is 201-or-error.
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ code: 'zzzzzzzz', url: 'https://bridge.axi.link/r/zzzzzzzz' }), { status: 200 })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
    });
});
