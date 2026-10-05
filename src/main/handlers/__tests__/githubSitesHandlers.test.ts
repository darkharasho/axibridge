import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) } }));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
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
    it('keeps the stored branch when both lookups fail', async () => {
        setup({ githubBranch: 'gh-pages' }, () => ({ status: 500 }));
        await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(store.data.githubBranch).toBe('gh-pages');
    });
    it('needs a token', async () => {
        handlers.clear();
        store = makeStore({});
        registerSitesHandlers({ store });
        expect(await invoke('set-default-github-site', { owner: 'guild', repo: 'site' })).toMatchObject({ success: false, error: 'GitHub not connected.' });
    });
});
