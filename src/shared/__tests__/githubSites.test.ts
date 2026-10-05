import { describe, expect, it } from 'vitest';
import {
    addSite, describeDestination, hasSite, inferredPagesUrl, mergeFoundSites, migrateFavoritesToSites,
    normalizeSiteKey, parseSiteFullName, removeSite, sanitizeSites, setDefaultSite, sortSitesDefaultFirst,
    withDefault, type IGithubSite
} from '../githubSites';

const NOW = '2026-10-04T00:00:00.000Z';
const site = (owner: string, repo: string, addedVia: IGithubSite['addedVia'] = 'manual'): IGithubSite => ({ owner, repo, addedVia, addedAt: NOW });

describe('normalizeSiteKey / parseSiteFullName', () => {
    it('lowercases and trims', () => {
        expect(normalizeSiteKey(' Guild ', 'Site ')).toBe('guild/site');
    });
    it('parses owner/repo and rejects junk', () => {
        expect(parseSiteFullName(' guild/site ')).toEqual({ owner: 'guild', repo: 'site' });
        expect(parseSiteFullName('guild/my.site_2-x')).toEqual({ owner: 'guild', repo: 'my.site_2-x' });
        expect(parseSiteFullName('guild')).toBeNull();
        expect(parseSiteFullName('a/b/c')).toBeNull();
        expect(parseSiteFullName('guild/ ')).toBeNull();
        expect(parseSiteFullName('gu ild/site')).toBeNull();
        expect(parseSiteFullName(42)).toBeNull();
        expect(parseSiteFullName(null)).toBeNull();
    });
    it('infers the Pages URL', () => {
        expect(inferredPagesUrl({ owner: 'guild', repo: 'site' })).toBe('https://guild.github.io/site');
    });
});

describe('addSite', () => {
    it('appends a new site', () => {
        expect(addSite([], { owner: 'guild', repo: 'site' }, 'joined', NOW)).toEqual([site('guild', 'site', 'joined')]);
    });
    it('dedupes case-insensitively and keeps the original entry', () => {
        const sites = [site('Guild', 'Site', 'default')];
        expect(addSite(sites, { owner: 'guild', repo: 'site' }, 'manual', NOW)).toBe(sites);
    });
    it('ignores invalid names', () => {
        const sites: IGithubSite[] = [];
        expect(addSite(sites, { owner: '', repo: 'x' }, 'manual', NOW)).toBe(sites);
        expect(addSite(sites, { owner: 'a b', repo: 'x' }, 'manual', NOW)).toBe(sites);
    });
});

describe('withDefault', () => {
    it('prepends a missing default', () => {
        expect(withDefault([site('x', 'y')], 'guild', 'site', NOW)).toEqual([site('guild', 'site', 'default'), site('x', 'y')]);
    });
    it('leaves the list alone when the default is present in another case', () => {
        const sites = [site('x', 'y'), site('Guild', 'Site')];
        expect(withDefault(sites, 'guild', 'site', NOW)).toBe(sites);
    });
    it('leaves the list alone with no default', () => {
        const sites = [site('x', 'y')];
        expect(withDefault(sites, '', '', NOW)).toBe(sites);
    });
});

describe('removeSite', () => {
    it('removes a non-default site', () => {
        expect(removeSite([site('a', 'b'), site('x', 'y')], { owner: 'X', repo: 'Y' }, 'a/b')).toEqual({ sites: [site('a', 'b')] });
    });
    it('refuses the default, case-insensitively', () => {
        const sites = [site('Guild', 'Site', 'default')];
        const res = removeSite(sites, { owner: 'Guild', repo: 'Site' }, 'guild/site');
        expect(res.sites).toBe(sites);
        expect(res.error).toBe('Switch to another site before removing your current one.');
    });
});

describe('setDefaultSite', () => {
    it('adds the new default when missing and keeps existing entries', () => {
        expect(setDefaultSite([site('a', 'b')], { owner: 'x', repo: 'y' }, NOW)).toEqual([site('a', 'b'), site('x', 'y')]);
    });
    it('is a no-op for a listed site', () => {
        const sites = [site('a', 'b')];
        expect(setDefaultSite(sites, { owner: 'A', repo: 'B' }, NOW)).toBe(sites);
    });
});

describe('sanitizeSites', () => {
    it('drops malformed entries and duplicates', () => {
        const raw = [site('a', 'b'), { owner: 'a', repo: 'B', addedVia: 'manual', addedAt: NOW }, { owner: 1 }, null, 'a/b',
            { owner: 'c', repo: 'd', addedVia: 'weird', addedAt: NOW }, { owner: 'e', repo: 'f' }];
        expect(sanitizeSites(raw)).toEqual([site('a', 'b'), { owner: 'c', repo: 'd', addedVia: 'manual', addedAt: NOW }, { owner: 'e', repo: 'f', addedVia: 'manual', addedAt: '' }]);
    });
    it('returns [] for non-arrays', () => {
        expect(sanitizeSites(undefined)).toEqual([]);
        expect(sanitizeSites({})).toEqual([]);
    });
});

describe('migrateFavoritesToSites', () => {
    it('puts the default first and favourites after, without duplicating the default', () => {
        expect(migrateFavoritesToSites('guild', 'site', ['Guild/Site', 'x/y', 'bad', 7, 'x/Y'], NOW))
            .toEqual([site('guild', 'site', 'default'), site('x', 'y')]);
    });
    it('handles no default and a missing favourites list', () => {
        expect(migrateFavoritesToSites('', '', ['x/y'], NOW)).toEqual([site('x', 'y')]);
        expect(migrateFavoritesToSites('', '', undefined, NOW)).toEqual([]);
        expect(migrateFavoritesToSites('guild', 'site', null, NOW)).toEqual([site('guild', 'site', 'default')]);
    });
});

describe('mergeFoundSites', () => {
    it('drops known sites and duplicates among the results', () => {
        expect(mergeFoundSites([site('a', 'b')], [{ owner: 'A', repo: 'B' }, { owner: 'x', repo: 'y' }, { owner: 'X', repo: 'Y' }]))
            .toEqual([{ owner: 'x', repo: 'y' }]);
    });
});

describe('sortSitesDefaultFirst', () => {
    it('moves the default to the front and keeps the rest in order', () => {
        const sites = [site('a', 'b'), site('c', 'd'), site('Guild', 'Site')];
        expect(sortSitesDefaultFirst(sites, 'guild/site').map((s) => s.repo)).toEqual(['Site', 'b', 'd']);
        expect(sortSitesDefaultFirst(sites, null)).toEqual(sites);
    });
});

describe('describeDestination', () => {
    it('names the URL and the other commanders', () => {
        expect(describeDestination('https://g.github.io/s', 4)).toBe('Your report appears at https://g.github.io/s, alongside reports from 3 other commanders.');
        expect(describeDestination('https://g.github.io/s', 2)).toBe('Your report appears at https://g.github.io/s, alongside reports from 1 other commander.');
    });
    it('omits the clause when nobody else publishes or the count is unknown', () => {
        expect(describeDestination('https://g.github.io/s', 1)).toBe('Your report appears at https://g.github.io/s.');
        expect(describeDestination('https://g.github.io/s', null)).toBe('Your report appears at https://g.github.io/s.');
    });
});

it('hasSite is case-insensitive', () => {
    expect(hasSite([site('Guild', 'Site')], { owner: 'guild', repo: 'SITE' })).toBe(true);
    expect(hasSite([], { owner: 'guild', repo: 'site' })).toBe(false);
});
