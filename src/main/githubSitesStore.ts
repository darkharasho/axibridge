import {
    migrateFavoritesToSites, normalizeSiteKey, sanitizeSites, withDefault, type IGithubSite
} from '../shared/githubSites';

const storedDefault = (store: any) => ({
    owner: String(store.get('githubRepoOwner') || '').trim(),
    repo: String(store.get('githubRepoName') || '').trim()
});

export const getDefaultSiteKey = (store: any): string | null => {
    const { owner, repo } = storedDefault(store);
    return owner && repo ? normalizeSiteKey(owner, repo) : null;
};

/**
 * The saved site list. The first read on an install without `githubSites`
 * builds it from the default plus `githubFavoriteRepos` (left in place for
 * downgrades, never read again). Every read keeps the default present, since
 * other code (create-repo, settings save) writes the default keys directly.
 */
export const readSites = (store: any): IGithubSite[] => {
    const raw = store.get('githubSites');
    const { owner, repo } = storedDefault(store);
    const sites = raw === undefined
        ? migrateFavoritesToSites(owner, repo, store.get('githubFavoriteRepos', []))
        : withDefault(sanitizeSites(raw), owner, repo);
    if (raw === undefined || JSON.stringify(sites) !== JSON.stringify(raw)) store.set('githubSites', sites);
    return sites;
};

export const writeSites = (store: any, sites: IGithubSite[]) => {
    store.set('githubSites', sites);
};

/**
 * Applies the site list from an imported/saved settings patch. `githubSites` is
 * sanitized (never written raw) and the default stays present. Legacy favourites
 * are converted to `githubSites` earlier, in normalizeImportedSettings.
 * Call after the default owner/repo keys in the same patch have been stored.
 */
export const applyImportedSites = (store: any, patch: { githubSites?: unknown }) => {
    if (patch.githubSites === undefined) return;
    const { owner, repo } = storedDefault(store);
    writeSites(store, withDefault(sanitizeSites(patch.githubSites), owner, repo));
};
