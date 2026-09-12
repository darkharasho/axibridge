import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { uploadBlobWithRetry } from '../githubHandlers';

const httpError = (status: number) => Object.assign(new Error(`GitHub API error (${status}) creating blob: Bad credentials`), { status });

describe('uploadBlobWithRetry', () => {
    it('returns the first success without retrying', async () => {
        const attempt = vi.fn(async () => ({ sha: 'a' }));
        await expect(uploadBlobWithRetry(attempt, 'reports/x/report.json.gz.000', 10)).resolves.toEqual({ sha: 'a' });
        expect(attempt).toHaveBeenCalledTimes(1);
    });

    it.each([401, 502])('retries once after a %i', async (status) => {
        const attempt = vi.fn()
            .mockRejectedValueOnce(httpError(status))
            .mockResolvedValueOnce({ sha: 'b' });
        await expect(uploadBlobWithRetry(attempt, 'p', 10)).resolves.toEqual({ sha: 'b' });
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it('reports a timeout instead of bad credentials when the retry also fails', async () => {
        const attempt = vi.fn().mockRejectedValue(httpError(401));
        const err: any = await uploadBlobWithRetry(attempt, 'reports/x/report.json.gz.003', 4 * 1024 * 1024).catch((e) => e);
        expect(attempt).toHaveBeenCalledTimes(2);
        expect(err.message).toMatch(/^GitHub timed out receiving reports\/x\/report\.json\.gz\.003 \(4(\.0)? MB\)\. /);
        expect(err.message).toContain('try again or enable R2 hosting');
        expect(err.message).not.toContain('Bad credentials');
        expect(err.status).toBe(401);
    });

    it('does not retry other failures', async () => {
        const attempt = vi.fn().mockRejectedValue(httpError(422));
        await expect(uploadBlobWithRetry(attempt, 'p', 10)).rejects.toThrow('(422)');
        expect(attempt).toHaveBeenCalledTimes(1);
    });
});
