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

import { MAX_GITHUB_BLOB_BYTES, planSidecarHosting, resolveR2Config, resolveR2Uploader } from '../githubHandlers';

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

describe('planSidecarHosting', () => {
    const BASE = 'https://user.github.io/repo';

    it('prefers R2 for a replay', () => {
        expect(planSidecarHosting({
            kind: 'replay', bytes: 1024, r2Url: 'https://pub-x.r2.dev/reports/a/replay.json',
            reportId: 'a', baseUrl: BASE,
        })).toEqual({ mode: 'r2', url: 'https://pub-x.r2.dev/reports/a/replay.json', warning: null });
    });

    it('falls back to Pages for a replay with no R2', () => {
        const plan = planSidecarHosting({ kind: 'replay', bytes: 1024, r2Url: null, reportId: 'a', baseUrl: BASE });
        expect(plan.mode).toBe('pages');
        expect(plan.url).toBe(`${BASE}/reports/a/replay.json`);
    });

    it('drops an oversized Pages replay rather than failing the upload with a 422', () => {
        const plan = planSidecarHosting({
            kind: 'replay', bytes: MAX_GITHUB_BLOB_BYTES + 1, r2Url: null, reportId: 'a', baseUrl: BASE,
        });
        expect(plan.mode).toBe('dropped');
        expect(plan.url).toBeNull();
        expect(plan.warning).toMatch(/Cloudflare R2/);
    });

    it('prefers R2 for a slice sidecar', () => {
        expect(planSidecarHosting({
            kind: 'slice', bytes: 1024, r2Url: 'https://pub-x.r2.dev/reports/a/slice.json.gz',
            reportId: 'a', baseUrl: BASE,
        })).toEqual({ mode: 'r2', url: 'https://pub-x.r2.dev/reports/a/slice.json.gz', warning: null });
    });

    it('never falls back to Pages for a slice sidecar', () => {
        // The whole point: a Pages-hosted sidecar would spend the repo storage
        // budget this design exists to protect. No R2 means no web slicer.
        const plan = planSidecarHosting({ kind: 'slice', bytes: 1024, r2Url: null, reportId: 'a', baseUrl: BASE });
        expect(plan.mode).toBe('dropped');
        expect(plan.url).toBeNull();
        expect(plan.warning).toMatch(/Cloudflare R2/);
    });

    it('drops a slice sidecar with no R2 regardless of how small it is', () => {
        const plan = planSidecarHosting({ kind: 'slice', bytes: 1, r2Url: null, reportId: 'a', baseUrl: null });
        expect(plan.mode).toBe('dropped');
    });
});

describe('MAX_GITHUB_BLOB_BYTES', () => {
    // base64 inflates by ~33%; GitHub rejects requests past ~100 MB with a 422.
    it('leaves the base64-encoded blob under 100 MB', () => {
        expect(Math.ceil(MAX_GITHUB_BLOB_BYTES / 3) * 4).toBeLessThan(100 * 1024 * 1024);
    });
});


describe('resolveR2Uploader', () => {
    it('hands back a SigV4 uploader for a complete manual config', () => {
        const { uploader, partiallyConfigured } = resolveR2Uploader(makeStore(FULL));
        expect(uploader?.mode).toBe('manual');
        expect(uploader?.bucketName).toBe('bucket');
        expect(partiallyConfigured).toBe(false);
    });

    it('refuses to upload when hosting is switched off, even fully configured', () => {
        const { uploader, missingFields, partiallyConfigured } = resolveR2Uploader(
            makeStore({ ...FULL, r2HostingEnabled: false })
        );
        expect(uploader).toBeNull();
        // Nothing is missing — the user turned it off — so the publish path must
        // not nag about a half-finished setup.
        expect(missingFields).toEqual([]);
        expect(partiallyConfigured).toBe(false);
    });

    it('treats an absent toggle as on, so existing installs keep working', () => {
        expect(resolveR2Uploader(makeStore(FULL)).uploader).not.toBeNull();
        expect(resolveR2Uploader(makeStore({ ...FULL, r2HostingEnabled: true })).uploader).not.toBeNull();
    });

    it('flags a half-filled manual config as partially configured', () => {
        const { uploader, partiallyConfigured } = resolveR2Uploader(
            makeStore({ ...FULL, r2PublicUrl: '' })
        );
        expect(uploader).toBeNull();
        expect(partiallyConfigured).toBe(true);
    });

    it('does not nag when no R2 field has ever been filled in', () => {
        expect(resolveR2Uploader(makeStore({})).partiallyConfigured).toBe(false);
    });

    it('builds an OAuth uploader without any access key pair', () => {
        const { uploader } = resolveR2Uploader(makeStore({
            r2AuthMode: 'oauth',
            cloudflareAccountId: 'acct',
            cloudflareTokenSet: { accessToken: 'a', expiresAt: Date.now() + 600_000 },
            r2BucketName: 'bucket',
            r2PublicUrl: 'https://pub-x.r2.dev'
        }));
        // The whole point of the phase: no accessKeyId, no secretAccessKey.
        expect(uploader?.mode).toBe('oauth');
        expect(uploader?.publicUrl).toBe('https://pub-x.r2.dev');
    });

    it('names the sign-in as missing when OAuth mode has no session', () => {
        const { uploader, missingFields } = resolveR2Uploader(makeStore({
            r2AuthMode: 'oauth',
            r2BucketName: 'bucket',
            r2PublicUrl: 'https://pub-x.r2.dev'
        }));
        expect(uploader).toBeNull();
        expect(missingFields).toEqual(['Cloudflare sign-in']);
    });

    it('ignores stale manual credentials once OAuth mode is selected', () => {
        const { uploader } = resolveR2Uploader(makeStore({ ...FULL, r2AuthMode: 'oauth' }));
        // Manual keys are all present, but the mode says OAuth and there is no
        // session — falling back to the old keys would be a silent mode switch.
        expect(uploader).toBeNull();
    });
});
