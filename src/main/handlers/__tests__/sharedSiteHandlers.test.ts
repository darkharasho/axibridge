import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const paths = vi.hoisted(() => ({ app: '/tmp', userData: '/tmp' }));
const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) },
    app: { isPackaged: true, getPath: () => paths.userData, getAppPath: () => paths.app, getVersion: () => '3.20.0' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Both run detached after upload-web-report returns; neither is under test here.
vi.mock('../../githubPagesDeploy', () => ({
    waitForPagesDeploy: vi.fn(async () => ({ outcome: 'built' })),
    describePagesDeploy: vi.fn(() => '')
}));
vi.mock('../../reportPostRunner', () => ({ startReportPost: vi.fn(async () => undefined) }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
import { registerGithubHandlers } from '../githubHandlers';
import { readLocalReport } from '../../webReportParts';
import { updateRollupSourcesForPublish } from '../../../web/rollup';
import { DEFAULT_AXI_THEME } from '../../../shared/webThemes';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');
const store = (values: Record<string, unknown>) => ({ get: (k: string, d?: unknown) => (k in values ? values[k] : d), set: vi.fn() });

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-shared-site-'));
paths.app = path.join(tmpRoot, 'app');
paths.userData = path.join(tmpRoot, 'userData');
fs.mkdirSync(path.join(paths.app, 'dist-web', 'web'), { recursive: true });
fs.mkdirSync(path.join(paths.app, 'dist-web', 'assets'), { recursive: true });
fs.writeFileSync(path.join(paths.app, 'dist-web', 'web', 'index.html'), '<html><script src="../assets/index-v1.js"></script></html>');
fs.writeFileSync(path.join(paths.app, 'dist-web', 'assets', 'index-v1.js'), 'console.log(1)');
fs.mkdirSync(paths.userData, { recursive: true });
const logoFile = path.join(tmpRoot, 'logo.png');
fs.writeFileSync(logoFile, 'PNG');
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

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

/**
 * A fake repo for upload-web-report: `head` advances when the first ref
 * PATCH is refused, as if another publisher pushed in between.
 */
const makeSite = (opts: {
    repo: string;
    branch: string;
    pagesPath: string;
    admin: boolean;
    indexAt: (head: number) => unknown;
    rollupAt?: (head: number) => unknown;
    attendanceAt?: (head: number) => unknown;
    conflictOnce?: boolean;
    pages?: MockResponse;
    repoDefaultBranch?: string;
}) => {
    const prefix = opts.pagesPath ? `${opts.pagesPath}/` : '';
    const state = { head: 0, refPatches: 0, blobs: new Map<string, Buffer>(), trees: [] as any[], blobN: 0 };
    const files = (h: number): Record<string, unknown> => ({
        [`${prefix}reports/index.json`]: opts.indexAt(h),
        ...(opts.rollupAt ? { [`${prefix}reports/rollup.json`]: opts.rollupAt(h) } : {}),
        ...(opts.attendanceAt ? { [`${prefix}reports/attendance.json`]: opts.attendanceAt(h) } : {})
    });
    const repoBase = `/repos/guild/${opts.repo}`;
    const responder = (c: RecordedCall): MockResponse => {
        if (c.path === repoBase) {
            return { status: 200, body: { owner: { type: 'User' }, default_branch: opts.repoDefaultBranch ?? 'main', permissions: { admin: opts.admin, push: true } } };
        }
        if (c.path === '/user') return { status: 200, body: { login: 'me' } };
        if (c.path === `${repoBase}/pages`) {
            return opts.pages ?? { status: 200, body: { html_url: `https://guild.github.io/${opts.repo}/`, source: { branch: opts.branch, path: `/${opts.pagesPath}` } } };
        }
        if (c.path === `${repoBase}/git/ref/heads/${opts.branch}`) return { status: 200, body: { object: { sha: `h${state.head}` } } };
        const commitMatch = c.path.match(/\/git\/commits\/h(\d+)$/);
        if (commitMatch) return { status: 200, body: { tree: { sha: `t${commitMatch[1]}` } } };
        const treeMatch = c.path.match(/\/git\/trees\/t(\d+)/);
        if (treeMatch) {
            const h = Number(treeMatch[1]);
            return { status: 200, body: { tree: Object.keys(files(h)).map((p) => ({ path: p, type: 'blob', sha: `f${h}:${p}` })) } };
        }
        const blobMatch = c.path.match(/\/git\/blobs\/f(\d+)(?::|%3A)(.+)$/);
        if (blobMatch && c.method === 'GET') {
            const value = files(Number(blobMatch[1]))[decodeURIComponent(blobMatch[2])];
            return value === undefined ? { status: 404 } : { status: 200, body: { content: b64(value) } };
        }
        if (c.method === 'POST' && c.path === `${repoBase}/git/blobs`) {
            const sha = `nb${state.blobN++}`;
            state.blobs.set(sha, Buffer.from((c.body as any).content, 'base64'));
            return { status: 201, body: { sha } };
        }
        if (c.method === 'POST' && c.path === `${repoBase}/git/trees`) {
            state.trees.push(c.body);
            return { status: 201, body: { sha: `nt${state.trees.length}` } };
        }
        if (c.method === 'POST' && c.path === `${repoBase}/git/commits`) return { status: 201, body: { sha: `nc${state.trees.length}` } };
        if (c.method === 'PATCH' && c.path === `${repoBase}/git/refs/heads/${opts.branch}`) {
            state.refPatches += 1;
            if (opts.conflictOnce && state.refPatches === 1) {
                state.head = 1;
                return { status: 422, body: { message: 'Update is not a fast forward' } };
            }
            return { status: 200, body: {} };
        }
        return { status: 404 };
    };
    /** The last tree POSTed, as path -> parsed JSON (or raw string) of the blob. */
    const lastTree = () => {
        const tree = state.trees[state.trees.length - 1]?.tree as Array<{ path: string; sha: string | null }> ?? [];
        const out = new Map<string, any>();
        for (const entry of tree) {
            const buf = entry.sha ? state.blobs.get(entry.sha) : undefined;
            let value: any = entry.sha;
            if (buf) {
                try { value = JSON.parse(buf.toString('utf8')); } catch { value = buf.toString('utf8'); }
            }
            out.set(entry.path, value);
        }
        return out;
    };
    return { state, responder, lastTree };
};

const reportFor = (id: string) => ({
    meta: { id, title: id, commanders: [], dateStart: '2026-10-01T20:00:00Z', dateEnd: '2026-10-01T22:00:00Z', dateLabel: 'Oct 1' },
    stats: { total: 1, attendanceData: [{ account: `${id}.1234`, combatTime: 60, squadTime: 60 }] }
});

const uploadPayload = (id: string, extra: Record<string, unknown> = {}) => {
    const r = reportFor(id);
    return { meta: r.meta, statsJson: JSON.stringify(r.stats), ...extra };
};

const registerWith = (values: Record<string, unknown>) => {
    handlers.clear();
    const data: Record<string, unknown> = { githubToken: 'tok', ...values };
    const s = { get: (k: string, d?: unknown) => (k in data ? data[k] : d), set: vi.fn((k: string, v: unknown) => { data[k] = v; }), data };
    registerGithubHandlers({ store: s, getWindow: () => null });
    return s;
};

describe('upload-web-report on a shared site', () => {
    it('rebuilds index, rollup and attendance on the new base after a conflict, keeping the admin look for a push-only user', async () => {
        const otherRollup = updateRollupSourcesForPublish({ existingSources: [], currentReport: reportFor('other') as any, validIds: ['other', 'old'] });
        const oldRollup = updateRollupSourcesForPublish({ existingSources: [], currentReport: reportFor('old') as any, validIds: ['old'] });
        const bothRollup = updateRollupSourcesForPublish({ existingSources: oldRollup.sources, currentReport: reportFor('other') as any, validIds: ['other', 'old'] });
        expect(otherRollup.sources.length).toBe(1);
        const site = makeSite({
            repo: 'site', branch: 'main', pagesPath: '', admin: false, conflictOnce: true,
            indexAt: (h) => ({
                colorPalette: 'ember', axiTheme: 'some-future-theme',
                entries: h === 0 ? [{ id: 'old' }] : [{ id: 'other', publishedBy: 'kyra' }, { id: 'old' }]
            }),
            rollupAt: (h) => (h === 0 ? oldRollup : bothRollup),
            attendanceAt: (h) => ({
                version: 1, generatedAt: 'x',
                raids: [
                    ...(h === 1 ? [{ id: 'other', date: '2026-10-01T18:00:00Z', attendees: [{ account: 'kyra.1', combatTimeMs: 1, squadTimeMs: 1 }] }] : []),
                    { id: 'old', date: '2026-09-01T18:00:00Z', attendees: [{ account: 'old.1', combatTimeMs: 1, squadTimeMs: 1 }] }
                ]
            })
        });
        registerWith({
            githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'main', githubPagesSourcePath: '',
            colorPalette: 'electric-blue', axiTheme: 'glass', githubLogoPath: logoFile
        });
        installHttpsMock(site.responder);

        const result = await handlers.get('upload-web-report')!({}, uploadPayload('mine'));
        expect(result.success).toBe(true);
        expect(site.state.refPatches).toBe(2);
        expect(site.state.trees.length).toBe(2);

        const tree = site.lastTree();
        const index = tree.get('reports/index.json');
        expect(index.entries.map((e: any) => e.id)).toEqual(['mine', 'other', 'old']);
        expect(index.entries[0].publishedBy).toBe('me');
        expect(index.entries[1].publishedBy).toBe('kyra');
        // The admin's appearance survives, verbatim, even a theme this app doesn't know.
        expect(index.colorPalette).toBe('ember');
        expect(index.axiTheme).toBe('some-future-theme');

        const rollupIds = tree.get('reports/rollup.json').sources.map((s: any) => s.meta.id).sort();
        expect(rollupIds).toEqual(['mine', 'old', 'other']);
        const raidIds = tree.get('reports/attendance.json').raids.map((r: any) => r.id).sort();
        expect(raidIds).toContain('other');
        expect(raidIds).toContain('old');

        expect([...tree.keys()].some((p) => p.endsWith('logo.png') || p.endsWith('logo.json'))).toBe(false);

        // report.json is styled with the site's colours and a theme this viewer can render.
        const report = readLocalReport(paths.userData, 'mine');
        expect(report.stats.colorPalette).toBe('ember');
        expect(report.stats.axiTheme).toBe(DEFAULT_AXI_THEME);
    });

    it('commits an override target to its own Pages branch and folder without touching the stored Pages path', async () => {
        const site = makeSite({
            repo: 'friends', branch: 'gh-pages', pagesPath: 'docs', admin: false,
            indexAt: () => ({ colorPalette: 'ember', axiTheme: 'flat', entries: [] })
        });
        const s = registerWith({ githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'main', githubPagesSourcePath: 'stored' });
        const calls = installHttpsMock(site.responder);

        const result = await handlers.get('upload-web-report')!({}, uploadPayload('mine', { repoOwner: 'guild', repoName: 'friends' }));
        expect(result.success).toBe(true);
        expect(calls.some((c) => c.method === 'PATCH' && c.path === '/repos/guild/friends/git/refs/heads/gh-pages')).toBe(true);
        expect(calls.some((c) => c.path.includes('/heads/main'))).toBe(false);
        const paths = [...site.lastTree().keys()];
        expect(paths).toContain('docs/reports/index.json');
        expect(paths.every((p) => p.startsWith('docs/'))).toBe(true);
        expect(s.data.githubPagesSourcePath).toBe('stored');
        expect(s.set).not.toHaveBeenCalledWith('githubPagesSourcePath', expect.anything());
    });

    it('falls back to the override repo default branch when Pages is not readable', async () => {
        const site = makeSite({
            repo: 'friends', branch: 'trunk', pagesPath: '', admin: false, repoDefaultBranch: 'trunk',
            pages: { status: 404 },
            indexAt: () => ({ entries: [] })
        });
        registerWith({ githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'main', githubPagesSourcePath: '' });
        const calls = installHttpsMock((c) => {
            // Enabling Pages succeeds on the branch we asked for.
            if (c.method === 'POST' && c.path === '/repos/guild/friends/pages') return { status: 201, body: { html_url: 'https://guild.github.io/friends/', source: { branch: (c.body as any).source.branch, path: '/' } } };
            return site.responder(c);
        });
        const result = await handlers.get('delete-github-reports')!({}, { ids: ['x'], owner: 'guild', repo: 'friends' });
        expect(result.success).toBe(true);
        expect(calls.some((c) => c.method === 'POST' && c.path === '/repos/guild/friends/pages' && (c.body as any).source.branch === 'trunk')).toBe(true);
        expect(calls.some((c) => c.path === '/repos/guild/friends/git/refs/heads/trunk')).toBe(true);
    });
});

describe('push-access errors', () => {
    it('surfaces a rate-limited 403 on a read unchanged', async () => {
        installHttpsMock((c) => {
            if (c.path.endsWith('/pages')) return { status: 200, body: { source: { path: '/' } } };
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'h0' } } };
            if (c.path.endsWith('/git/commits/h0')) return { status: 200, body: { tree: { sha: 't0' } } };
            if (c.path.includes('/git/trees/t0')) return { status: 200, body: { tree: [{ path: 'reports/index.json', type: 'blob', sha: 'idx' }] } };
            if (c.path.endsWith('/git/blobs/idx')) return { status: 403, body: { message: 'API rate limit exceeded' } };
            return { status: 404 };
        });
        const result = await handlers.get('delete-github-reports')!({}, { ids: ['a'] });
        expect(result.success).toBe(false);
        expect(result.error).toContain('(403)');
        expect(result.error).not.toMatch(/push access/);
    });

    it('still explains a 403 on the commit step as missing push access', async () => {
        installHttpsMock((c) => {
            if (c.path.endsWith('/pages')) return { status: 200, body: { source: { path: '/' } } };
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'h0' } } };
            if (c.path.endsWith('/git/commits/h0')) return { status: 200, body: { tree: { sha: 't0' } } };
            if (c.path.includes('/git/trees/t0')) return { status: 200, body: { tree: [{ path: 'reports/a/report.json', type: 'blob', sha: 'ra' }] } };
            if (c.method === 'POST' && c.path.endsWith('/git/trees')) return { status: 403, body: { message: 'Resource not accessible' } };
            return { status: 404 };
        });
        const result = await handlers.get('delete-github-reports')!({}, { ids: ['a'] });
        expect(result).toEqual({ success: false, error: "You don't have push access to guild/site. Ask the site admin to add you." });
    });
});
