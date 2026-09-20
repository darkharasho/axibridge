import { describe, it, expect, vi } from 'vitest';
import { createGithubShareTarget, type GithubRequestFn } from '../githubShareTarget';

const opts = (request: GithubRequestFn, maxBytes?: number) => ({
    owner: 'someone',
    repo: 'axibridge-fights',
    branch: 'main',
    token: 'tok',
    baseUrl: 'https://someone.github.io/axibridge-fights/',
    request,
    maxBytes
});

const ok = { status: 200, data: { content: {} } };
const missing = { status: 404, data: { message: 'Not Found' } };

describe('createGithubShareTarget', () => {
    it('writes a new object and returns its Pages URL', async () => {
        const request = vi.fn<GithubRequestFn>()
            .mockResolvedValueOnce(missing)
            .mockResolvedValueOnce({ status: 201, data: {} });

        const result = await createGithubShareTarget(opts(request))
            .putObject('shares/abc-123.json.gz', Buffer.from('bytes'), 'application/gzip');

        // The trailing slash on baseUrl must not produce a double slash.
        expect(result).toEqual({ success: true, url: 'https://someone.github.io/axibridge-fights/shares/abc-123.json.gz' });

        const [method, apiPath, token, body] = request.mock.calls[1];
        expect(method).toBe('PUT');
        expect(apiPath).toBe('/repos/someone/axibridge-fights/contents/shares/abc-123.json.gz');
        expect(token).toBe('tok');
        expect(Buffer.from(body.content, 'base64').toString()).toBe('bytes');
        expect(body.branch).toBe('main');
        // Absent file: sending `sha` at all would make GitHub reject the write.
        expect('sha' in body).toBe(false);
    });

    it('passes the existing sha when overwriting', async () => {
        const request = vi.fn<GithubRequestFn>()
            .mockResolvedValueOnce({ status: 200, data: { sha: 'deadbeef' } })
            .mockResolvedValueOnce(ok);

        await createGithubShareTarget(opts(request))
            .putObject('shares/x.json.gz', Buffer.from('b'), 'application/gzip');

        expect(request.mock.calls[1][3].sha).toBe('deadbeef');
    });

    it('re-reads the sha and retries once on a 409 race', async () => {
        const request = vi.fn<GithubRequestFn>()
            .mockResolvedValueOnce(missing)
            .mockResolvedValueOnce({ status: 409, data: { message: 'conflict' } })
            .mockResolvedValueOnce({ status: 200, data: { sha: 'fresh' } })
            .mockResolvedValueOnce(ok);

        const result = await createGithubShareTarget(opts(request))
            .putObject('shares/x.json.gz', Buffer.from('b'), 'application/gzip');

        expect(result.success).toBe(true);
        expect(request.mock.calls[3][3].sha).toBe('fresh');
    });

    it('refuses a body over the size ceiling without calling GitHub', async () => {
        const request = vi.fn<GithubRequestFn>();

        const result = await createGithubShareTarget(opts(request, 10))
            .putObject('shares/x.json.gz', Buffer.alloc(11), 'application/gzip');

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/too large to host on GitHub Pages/);
        expect(result.error).toMatch(/Cloudflare R2/);
        expect(request).not.toHaveBeenCalled();
    });

    it('resolves (never throws) when the request function rejects', async () => {
        const request = vi.fn<GithubRequestFn>().mockRejectedValue(new Error('socket hang up'));

        const result = await createGithubShareTarget(opts(request))
            .putObject('shares/x.json.gz', Buffer.from('b'), 'application/gzip');

        expect(result).toEqual({ success: false, error: 'socket hang up' });
    });

    it('surfaces a GitHub error status as a message', async () => {
        const request = vi.fn<GithubRequestFn>()
            .mockResolvedValueOnce(missing)
            .mockResolvedValueOnce({ status: 403, data: { message: 'Resource not accessible' } });

        const result = await createGithubShareTarget(opts(request))
            .putObject('shares/x.json.gz', Buffer.from('b'), 'application/gzip');

        expect(result.success).toBe(false);
        expect(result.error).toContain('403');
        expect(result.error).toContain('Resource not accessible');
    });

    it('has no ensureCors, because Pages already sends Access-Control-Allow-Origin', () => {
        expect(createGithubShareTarget(opts(vi.fn())).ensureCors).toBeUndefined();
    });
});

describe('createGithubShareTarget.deleteObject', () => {
    const existing = { status: 200, data: { sha: 'deadbeef' } };

    it('deletes the object with the sha the Contents API requires', async () => {
        const request = vi.fn<GithubRequestFn>()
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce({ status: 200, data: {} });

        const result = await createGithubShareTarget(opts(request)).deleteObject!('shares/abc-123.json.gz');

        expect(result).toEqual({ success: true });
        const [method, apiPath, token, body] = request.mock.calls[1];
        expect(method).toBe('DELETE');
        expect(apiPath).toBe('/repos/someone/axibridge-fights/contents/shares/abc-123.json.gz');
        expect(token).toBe('tok');
        expect(body).toMatchObject({ sha: 'deadbeef', branch: 'main' });
    });

    // Retention is idempotent: an interrupted run is re-run from the ledger, and
    // "the object is gone" is already true for a file that was never there.
    it('treats an already-absent object as success and issues no DELETE', async () => {
        const request = vi.fn<GithubRequestFn>().mockResolvedValueOnce(missing);

        expect(await createGithubShareTarget(opts(request)).deleteObject!('shares/gone.json.gz'))
            .toEqual({ success: true });
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('reports a GitHub API failure rather than claiming the bytes are freed', async () => {
        const request = vi.fn<GithubRequestFn>()
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce({ status: 403, data: { message: 'Resource not accessible' } });

        const result = await createGithubShareTarget(opts(request)).deleteObject!('shares/abc.json.gz');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/403/);
        expect(result.error).toMatch(/Resource not accessible/);
    });

    it('never throws when the request layer does', async () => {
        const request = vi.fn<GithubRequestFn>().mockRejectedValue(new Error('socket hang up'));
        const result = await createGithubShareTarget(opts(request)).deleteObject!('shares/abc.json.gz');
        expect(result).toEqual({ success: false, error: 'socket hang up' });
    });
});
