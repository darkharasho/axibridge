import { describe, expect, it, vi } from 'vitest';

// githubHandlers imports electron at module load; stub the surface it touches.
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { MAX_GITHUB_BLOB_BYTES, planReplayHosting, resolveR2Config } from '../githubHandlers';

const makeStore = (values: Record<string, unknown>) => ({
    get: (key: string) => values[key]
});

const FULL = {
    r2AccountId: 'acct',
    r2AccessKeyId: 'akid',
    r2SecretAccessKey: 'secret',
    r2BucketName: 'bucket',
    r2PublicUrl: 'https://pub-x.r2.dev'
};

describe('resolveR2Config', () => {
    it('resolves a complete config', () => {
        const { config, missingFields } = resolveR2Config(makeStore(FULL));
        expect(missingFields).toEqual([]);
        expect(config).toEqual({
            accountId: 'acct',
            accessKeyId: 'akid',
            secretAccessKey: 'secret',
            bucketName: 'bucket',
            publicUrl: 'https://pub-x.r2.dev'
        });
    });

    it('trims whitespace pasted into credential fields', () => {
        const { config, missingFields } = resolveR2Config(makeStore({
            r2AccountId: '  acct\n',
            r2AccessKeyId: 'akid ',
            r2SecretAccessKey: '\tsecret',
            r2BucketName: ' bucket ',
            r2PublicUrl: ' https://pub-x.r2.dev \n'
        }));
        expect(missingFields).toEqual([]);
        expect(config?.accountId).toBe('acct');
        expect(config?.secretAccessKey).toBe('secret');
        expect(config?.publicUrl).toBe('https://pub-x.r2.dev');
    });

    it('treats a whitespace-only field as missing and names it', () => {
        const { config, missingFields } = resolveR2Config(makeStore({ ...FULL, r2PublicUrl: '   ' }));
        expect(config).toBeNull();
        expect(missingFields).toEqual(['Public URL']);
    });

    it('reports every missing field when nothing is configured', () => {
        const { config, missingFields } = resolveR2Config(makeStore({}));
        expect(config).toBeNull();
        expect(missingFields).toHaveLength(5);
    });
});

describe('planReplayHosting', () => {
    const base = { reportId: 'rep1', baseUrl: 'https://user.github.io/repo' };

    it('uses the R2 url when the R2 upload succeeded', () => {
        const plan = planReplayHosting({ ...base, replayBytes: 900 * 1024 * 1024, r2Url: 'https://pub-x.r2.dev/reports/rep1/replay.json' });
        expect(plan.mode).toBe('r2');
        expect(plan.url).toBe('https://pub-x.r2.dev/reports/rep1/replay.json');
        expect(plan.warning).toBeNull();
    });

    it('falls back to Pages when R2 is unavailable and the replay fits in a blob', () => {
        const plan = planReplayHosting({ ...base, replayBytes: 4 * 1024 * 1024, r2Url: null });
        expect(plan.mode).toBe('pages');
        expect(plan.url).toBe('https://user.github.io/repo/reports/rep1/replay.json');
        expect(plan.warning).toBeNull();
    });

    it('drops the replay instead of failing the upload when it exceeds the blob limit', () => {
        const plan = planReplayHosting({ ...base, replayBytes: MAX_GITHUB_BLOB_BYTES + 1, r2Url: null });
        expect(plan.mode).toBe('dropped');
        expect(plan.url).toBeNull();
        expect(plan.warning).toMatch(/replay/i);
    });

    it('uses a relative Pages url when no base url is known', () => {
        const plan = planReplayHosting({ ...base, baseUrl: null, replayBytes: 1024, r2Url: null });
        expect(plan.url).toBe('reports/rep1/replay.json');
    });
});

describe('MAX_GITHUB_BLOB_BYTES', () => {
    // base64 inflates by ~33%; GitHub rejects requests past ~100 MB with a 422.
    it('leaves the base64-encoded blob under 100 MB', () => {
        expect(Math.ceil(MAX_GITHUB_BLOB_BYTES / 3) * 4).toBeLessThan(100 * 1024 * 1024);
    });
});
