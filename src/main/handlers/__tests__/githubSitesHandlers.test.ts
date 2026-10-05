import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) } }));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { recordMemberCount, resetGithubApiCaches } from '../../githubApi';
import { readSites } from '../../githubSitesStore';
import { registerSitesHandlers } from '../githubSitesHandlers';

const makeStore = (values: Record<string, unknown>) => {
    const data: Record<string, unknown> = { ...values };
    return { get: (k: string, d?: unknown) => (k in data ? data[k] : d), set: vi.fn((k: string, v: unknown) => { data[k] = v; }), data };
};
const invoke = (ch: string, payload?: unknown) => handlers.get(ch)!({}, payload);
const keys = (sites: any[]) => sites.map((s) => `${s.owner}/${s.repo}:${s.addedVia}`);

let store: ReturnType<typeof makeStore>;
const setup = (values: Record<string, unknown>, responder: (c: RecordedCall) => MockResponse = () => ({ status: 404 })) => {
    handlers.clear();
    store = makeStore({ githubToken: 'tok', ...values });
    registerSitesHandlers({ store });
    return installHttpsMock(responder);
};

beforeEach(() => { vi.restoreAllMocks(); resetGithubApiCaches(); });

describe('readSites', () => {
    it('migrates favourites once and leaves githubFavoriteRepos untouched', () => {
        const s = makeStore({ githubRepoOwner: 'guild', githubRepoName: 'site', githubFavoriteRepos: ['x/y', 'Guild/Site'] });
        expect(keys(readSites(s))).toEqual(['guild/site:default', 'x/y:manual']);
        expect(s.data.githubFavoriteRepos).toEqual(['x/y', 'Guild/Site']);
        s.data.githubFavoriteRepos = ['z/z'];
        expect(keys(readSites(s))).toEqual(['guild/site:default', 'x/y:manual']);
    });
    it('migrates favourites with no default', () => {
        const s = makeStore({ githubFavoriteRepos: ['x/y'] });
        expect(keys(readSites(s))).toEqual(['x/y:manual']);
    });
    it('adds a default written elsewhere and does not duplicate it across case', () => {
        const s = makeStore({ githubRepoOwner: 'Guild', githubRepoName: 'Site', githubSites: [{ owner: 'guild', repo: 'site', addedVia: 'manual', addedAt: '' }] });
        expect(readSites(s)).toHaveLength(1);
        s.data.githubRepoOwner = 'new';
        s.data.githubRepoName = 'one';
        expect(keys(readSites(s))).toEqual(['new/one:default', 'guild/site:manual']);
    });
    it('does not write when nothing changed', () => {
        const s = makeStore({ githubSites: [] });
        readSites(s);
        expect(s.set).not.toHaveBeenCalled();
    });
});

describe('get-github-sites / add / remove', () => {
    it('lists sites with the default key', async () => {
        setup({ githubRepoOwner: 'Guild', githubRepoName: 'Site' });
        const res = await invoke('get-github-sites');
        expect(res).toMatchObject({ success: true, defaultKey: 'guild/site' });
        expect(keys(res.sites)).toEqual(['Guild/Site:default']);
    });
    it('adds a manual site and persists it', async () => {
        setup({});
        const res = await invoke('add-github-site', { owner: 'x', repo: 'y', addedVia: 'manual' });
        expect(keys(res.sites)).toEqual(['x/y:manual']);
        expect(keys(store.data.githubSites as any[])).toEqual(['x/y:manual']);
    });
    it('rejects a bad name or addedVia', async () => {
        setup({});
        expect(await invoke('add-github-site', { owner: 'a b', repo: 'y', addedVia: 'manual' })).toMatchObject({ success: false, error: 'Not a valid owner/repo.' });
        expect((await invoke('add-github-site', { owner: 'x', repo: 'y', addedVia: 'default' })).success).toBe(false);
    });
    it('refuses to remove the current default', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' });
        expect(await invoke('remove-github-site', { owner: 'GUILD', repo: 'site' }))
            .toMatchObject({ success: false, error: 'Switch to another site before removing your current one.' });
    });
    it('removes another site', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site', githubSites: [
            { owner: 'guild', repo: 'site', addedVia: 'default', addedAt: '' }, { owner: 'x', repo: 'y', addedVia: 'manual', addedAt: '' }
        ] });
        const res = await invoke('remove-github-site', { owner: 'x', repo: 'y' });
        expect(keys(res.sites)).toEqual(['guild/site:default']);
    });
});

describe('set-default-github-site', () => {
    it('writes the default and its Pages branch, folder and URL', async () => {
        setup({ githubRepoOwner: 'old', githubRepoName: 'one', githubBranch: 'main' }, (c) => {
            if (c.path === '/repos/guild/site/pages') return { status: 200, body: { html_url: 'https://reports.example.com/', source: { branch: 'gh-pages', path: '/docs' } } };
            return { status: 404 };
        });
        const res = await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(res).toMatchObject({ success: true, defaultKey: 'guild/site', pagesUrl: 'https://reports.example.com/' });
        expect(keys(res.sites)).toEqual(['old/one:default', 'guild/site:manual']);
        expect(store.data).toMatchObject({
            githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'gh-pages',
            githubPagesBaseUrl: 'https://reports.example.com/', githubPagesSourcePath: 'docs'
        });
    });
    it('falls back to the default branch and inferred URL without Pages', async () => {
        setup({ githubBranch: 'gh-pages' }, (c) => (c.path === '/repos/guild/site' ? { status: 200, body: { default_branch: 'trunk' } } : { status: 404 }));
        await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(store.data).toMatchObject({ githubBranch: 'trunk', githubPagesBaseUrl: 'https://guild.github.io/site', githubPagesSourcePath: '' });
    });
    it('fails and writes nothing when both lookups fail', async () => {
        setup({ githubBranch: 'gh-pages', githubRepoOwner: 'old', githubRepoName: 'one' }, () => ({ status: 500 }));
        const res = await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(res).toMatchObject({ success: false, error: "Couldn't reach GitHub to switch sites." });
        expect(store.data).toMatchObject({ githubBranch: 'gh-pages', githubRepoOwner: 'old', githubRepoName: 'one' });
        expect(JSON.stringify(store.data.githubSites ?? [])).not.toContain('guild');
    });
    it('needs a token', async () => {
        handlers.clear();
        store = makeStore({});
        registerSitesHandlers({ store });
        expect(await invoke('set-default-github-site', { owner: 'guild', repo: 'site' })).toMatchObject({ success: false, error: 'GitHub not connected.' });
    });
});

describe('get-github-site-details', () => {
    const repoBody = (permissions: Record<string, boolean>, type = 'Organization') => ({
        status: 200, body: { owner: { type, avatar_url: 'a.png' }, permissions }
    });
    it('maps admin / push / 404 / 403 / rate limit / network error', async () => {
        setup({}, (c) => {
            if (c.path === '/repos/o/admin') return repoBody({ admin: true, push: true });
            if (c.path === '/repos/o/pub') return repoBody({ push: true }, 'User');
            if (c.path === '/repos/o/read') return repoBody({ pull: true });
            if (c.path === '/repos/o/gone') return { status: 404 };
            if (c.path === '/repos/o/denied') return { status: 403, body: { message: 'Must have push access' } };
            if (c.path === '/repos/o/limited') return { status: 403, body: { message: 'API rate limit exceeded for user' } };
            if (c.path === '/repos/o/admin/pages') return { status: 200, body: { html_url: 'https://custom.example/' } };
            if (c.path === '/repos/o/boom') return { status: 502 };
            return { status: 404 };
        });
        recordMemberCount('O', 'Admin', 4);
        const names = ['admin', 'pub', 'read', 'gone', 'denied', 'limited', 'boom'];
        const res = await invoke('get-github-site-details', names.map((repo) => ({ owner: 'o', repo })));
        const d = res.details;
        expect(d['o/admin']).toEqual({ role: 'admin', ownerType: 'Organization', ownerAvatarUrl: 'a.png', pagesUrl: 'https://custom.example/', memberCount: 4 });
        expect(d['o/pub']).toMatchObject({ role: 'publisher', ownerType: 'User', pagesUrl: 'https://o.github.io/pub', memberCount: null });
        expect(d['o/read'].role).toBe('none');
        expect(d['o/gone'].role).toBe('none');
        expect(d['o/denied'].role).toBe('none');
        expect(d['o/limited'].role).toBeNull();
        expect(d['o/boom']).toEqual({ role: null, ownerType: null, ownerAvatarUrl: null, pagesUrl: 'https://o.github.io/boom', memberCount: null });
    });
    it('skips the Pages lookup for a site with no access', async () => {
        const calls = setup({}, () => ({ status: 404 }));
        await invoke('get-github-site-details', [{ owner: 'o', repo: 'gone' }]);
        expect(calls.map((c) => c.path)).toEqual(['/repos/o/gone']);
    });
    it('ignores malformed entries and works without a token', async () => {
        handlers.clear();
        store = makeStore({});
        registerSitesHandlers({ store });
        const res = await invoke('get-github-site-details', [{ owner: 'a b', repo: 'x' }, { owner: 'o', repo: 'r' }]);
        expect(Object.keys(res.details)).toEqual(['o/r']);
        expect(res.details['o/r'].role).toBeNull();
    });
});

describe('find-github-sites', () => {
    const page = (n: number, extra: any[] = []) => [
        ...Array.from({ length: n }, (_, i) => ({ name: `r${i}`, owner: { login: 'filler' }, description: 'x', permissions: { push: true } })),
        ...extra
    ];
    it('keeps pushable AxiBridge sites not already listed, across pages', async () => {
        setup({ githubSites: [{ owner: 'guild', repo: 'known', addedVia: 'manual', addedAt: '' }] }, (c) => {
            if (c.path === '/user/repos?per_page=100&page=1') return { status: 200, body: page(98, [
                { name: 'known', owner: { login: 'guild' }, description: 'AxiBridge Reports', permissions: { push: true } },
                { name: 'site', owner: { login: 'guild' }, description: ' AxiBridge Reports ', permissions: { push: true } }
            ]) };
            if (c.path === '/user/repos?per_page=100&page=2') return { status: 200, body: [
                { name: 'readonly', owner: { login: 'x' }, description: 'AxiBridge Reports', permissions: { push: false } },
                { name: 'other', owner: { login: 'me' }, description: 'AxiBridge Reports', permissions: { admin: true, push: true } }
            ] };
            return { status: 404 };
        });
        const res = await invoke('find-github-sites');
        expect(res).toEqual({ success: true, found: [{ owner: 'guild', repo: 'site' }, { owner: 'me', repo: 'other' }] });
        expect(keys(store.data.githubSites as any[])).toEqual(['guild/known:manual']); // never adds
    });
    it('reports a failure', async () => {
        setup({}, () => ({ status: 500 }));
        expect(await invoke('find-github-sites')).toMatchObject({ success: false });
    });
});
