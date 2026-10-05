import { describe, expect, it } from 'vitest';
import { applyImportedSites } from '../githubSitesStore';

const makeStore = (init: Record<string, unknown>) => {
    const data = { ...init };
    return { data, get: (k: string, d?: unknown) => (k in data ? data[k] : d), set: (k: string, v: unknown) => { data[k] = v; } };
};
const base = { githubRepoOwner: 'guild', githubRepoName: 'site' };

describe('applyImportedSites', () => {
    it('sanitizes and persists an imported githubSites, keeping the default', () => {
        const store = makeStore(base);
        applyImportedSites(store, { githubSites: [{ owner: 'x', repo: 'y', addedVia: 'manual', addedAt: 'a' }, 'junk', { owner: '', repo: 'z' }] });
        const saved = store.data.githubSites as any[];
        expect(saved.map((s) => `${s.owner}/${s.repo}`)).toEqual(['guild/site', 'x/y']);
    });
    it('folds favourites from an old export into the current list', () => {
        const store = makeStore({ ...base, githubSites: [{ owner: 'guild', repo: 'site', addedVia: 'default', addedAt: 'a' }] });
        applyImportedSites(store, { githubFavoriteRepos: ['x/y', 'bad'] });
        expect((store.data.githubSites as any[]).map((s) => `${s.owner}/${s.repo}`)).toEqual(['guild/site', 'x/y']);
        expect(store.data).not.toHaveProperty('githubFavoriteRepos');
    });
    it('does nothing without either key', () => {
        const store = makeStore(base);
        applyImportedSites(store, {});
        expect(store.data).not.toHaveProperty('githubSites');
    });
});
