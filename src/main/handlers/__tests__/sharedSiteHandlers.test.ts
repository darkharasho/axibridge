import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) },
    app: { isPackaged: true, getPath: () => '/tmp', getAppPath: () => '/tmp', getVersion: () => '3.20.0' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
import { registerGithubHandlers } from '../githubHandlers';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');
const store = (values: Record<string, unknown>) => ({ get: (k: string, d?: unknown) => (k in values ? values[k] : d), set: vi.fn() });

beforeEach(() => {
    handlers.clear();
    vi.restoreAllMocks();
    resetGithubApiCaches();
    registerGithubHandlers({
        store: store({ githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'main', githubPagesSourcePath: '' }),
        getWindow: () => null
    });
});

describe('delete-github-reports on a shared site', () => {
    it('keeps the site appearance and retries on a conflict with a rebuilt index', async () => {
        let head = 0;
        // Index at head 0 has a,b; at head 1 someone added c.
        const indexAt = (h: number) => ({ colorPalette: 'ember', axiTheme: 'flat', entries: h === 0 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }, { id: 'a' }, { id: 'b' }] });
        const blobs: Record<string, unknown> = {};
        let blobN = 0;
        let refPatches = 0;
        installHttpsMock((c: RecordedCall) => {
            if (c.path.endsWith('/pages')) return { status: 200, body: { source: { path: '/' } } };
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: `h${head}` } } };
            if (/\/git\/commits\/h\d$/.test(c.path)) return { status: 200, body: { tree: { sha: `t${head}` } } };
            if (c.path.includes('/git/trees/t')) return { status: 200, body: { tree: [
                { path: 'reports/index.json', type: 'blob', sha: `idx${head}` },
                { path: 'reports/a/report.json', type: 'blob', sha: 'ra' }
            ] } };
            if (c.path.includes('/git/blobs/idx')) return { status: 200, body: { content: b64(indexAt(Number(c.path.slice(-1)))) } };
            if (c.method === 'POST' && c.path.endsWith('/git/blobs')) {
                const sha = `nb${blobN++}`;
                blobs[sha] = JSON.parse(Buffer.from((c.body as any).content, 'base64').toString('utf8'));
                return { status: 201, body: { sha } };
            }
            if (c.path.endsWith('/git/trees')) return { status: 201, body: { sha: 'nt' } };
            if (c.path.endsWith('/git/commits')) return { status: 201, body: { sha: 'nc' } };
            if (c.method === 'PATCH') {
                refPatches += 1;
                if (refPatches === 1) { head = 1; return { status: 422, body: { message: 'not a fast forward' } }; }
                return { status: 200, body: {} };
            }
            return { status: 404 };
        });
        const result = await handlers.get('delete-github-reports')!({}, { ids: ['a'] });
        expect(result).toEqual({ success: true, removed: ['a'] });
        const lastIndex = blobs[`nb${blobN - 1}`] as any;
        expect(lastIndex.entries.map((e: any) => e.id)).toEqual(['c', 'b']);
        expect(lastIndex.colorPalette).toBe('ember');
    });
});

describe('apply-github-logo', () => {
    it('refuses for a non-admin', async () => {
        installHttpsMock((c) => (c.path === '/repos/guild/site'
            ? { status: 200, body: { owner: { type: 'Organization' }, permissions: { admin: false, push: true } } }
            : { status: 404 }));
        const fs = await import('fs');
        vi.spyOn(fs.default, 'existsSync').mockReturnValue(true);
        const result = await handlers.get('apply-github-logo')!({}, { logoPath: '/x/logo.png' });
        expect(result).toEqual({ success: false, error: 'Only a repo admin can change the site logo.' });
    });
});

describe('ensure-github-template', () => {
    it('skips when the site viewer is newer than this app', async () => {
        installHttpsMock((c) => {
            if (c.path.endsWith('/pages')) return { status: 200, body: { source: { path: '/' } } };
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'h0' } } };
            if (c.path.endsWith('/git/commits/h0')) return { status: 200, body: { tree: { sha: 't0' } } };
            if (c.path.includes('/git/trees/t0')) return { status: 200, body: { tree: [{ path: 'reports/index.json', type: 'blob', sha: 'i' }] } };
            if (c.path.endsWith('/git/blobs/i')) return { status: 200, body: { content: b64({ generator: { app: 'axibridge', version: '9.0.0' }, entries: [] }) } };
            return { status: 404 };
        });
        const result = await handlers.get('ensure-github-template')!({});
        expect(result).toEqual({ success: true, updated: false, skipped: 'viewer-newer' });
    });
});
