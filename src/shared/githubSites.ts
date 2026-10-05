/**
 * The list of GitHub Pages sites a user publishes to. The default site lives
 * in the githubRepoOwner/githubRepoName store keys; this list holds it plus
 * every other site, and every helper here is pure so main and renderer agree.
 */
export type SiteAddedVia = 'default' | 'manual' | 'joined' | 'found';
export interface IGithubSite { owner: string; repo: string; addedVia: SiteAddedVia; addedAt: string }
export type SiteRole = 'admin' | 'publisher' | 'none';
/** Live, unpersisted facts about a site. `role: null` = the lookup failed; treat as usable. */
export interface ISiteDetails {
    role: SiteRole | null;
    ownerType: 'User' | 'Organization' | null;
    ownerAvatarUrl: string | null;
    pagesUrl: string;
    memberCount: number | null;
}
export interface SiteRef { owner: string; repo: string }

const NAME_RE = /^[A-Za-z0-9._-]+$/;
const ADDED_VIA: SiteAddedVia[] = ['default', 'manual', 'joined', 'found'];

export const normalizeSiteKey = (owner: string, repo: string) => `${owner.trim()}/${repo.trim()}`.toLowerCase();
export const siteFullName = (site: SiteRef) => `${site.owner}/${site.repo}`;
export const inferredPagesUrl = (site: SiteRef) => `https://${site.owner}.github.io/${site.repo}`;

const validRef = (owner: string, repo: string) => NAME_RE.test(owner) && NAME_RE.test(repo);

export const parseSiteFullName = (value: unknown): SiteRef | null => {
    if (typeof value !== 'string') return null;
    const parts = value.trim().split('/');
    if (parts.length !== 2) return null;
    const owner = parts[0].trim();
    const repo = parts[1].trim();
    return validRef(owner, repo) ? { owner, repo } : null;
};

export const hasSite = (sites: IGithubSite[], site: SiteRef) => {
    const key = normalizeSiteKey(site.owner, site.repo);
    return sites.some((s) => normalizeSiteKey(s.owner, s.repo) === key);
};

export const addSite = (sites: IGithubSite[], site: SiteRef, addedVia: SiteAddedVia, now = new Date().toISOString()): IGithubSite[] => {
    const owner = site.owner.trim();
    const repo = site.repo.trim();
    if (!validRef(owner, repo) || hasSite(sites, { owner, repo })) return sites;
    return [...sites, { owner, repo, addedVia, addedAt: now }];
};

/** Prepends the default when it is missing; otherwise returns `sites` unchanged. */
export const withDefault = (sites: IGithubSite[], owner: string, repo: string, now = new Date().toISOString()): IGithubSite[] => {
    const o = owner.trim();
    const r = repo.trim();
    if (!validRef(o, r) || hasSite(sites, { owner: o, repo: r })) return sites;
    return [{ owner: o, repo: r, addedVia: 'default', addedAt: now }, ...sites];
};

export const removeSite = (sites: IGithubSite[], site: SiteRef, defaultKey: string | null): { sites: IGithubSite[]; error?: string } => {
    const key = normalizeSiteKey(site.owner, site.repo);
    if (defaultKey && key === defaultKey) {
        return { sites, error: 'Switch to another site before removing your current one.' };
    }
    return { sites: sites.filter((s) => normalizeSiteKey(s.owner, s.repo) !== key) };
};

export const setDefaultSite = (sites: IGithubSite[], site: SiteRef, now = new Date().toISOString()) =>
    addSite(sites, site, 'manual', now);

export const sanitizeSites = (raw: unknown): IGithubSite[] => {
    if (!Array.isArray(raw)) return [];
    let out: IGithubSite[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const { owner, repo, addedVia, addedAt } = entry as Record<string, unknown>;
        if (typeof owner !== 'string' || typeof repo !== 'string') continue;
        const via = ADDED_VIA.includes(addedVia as SiteAddedVia) ? addedVia as SiteAddedVia : 'manual';
        out = addSite(out, { owner, repo }, via, typeof addedAt === 'string' ? addedAt : '');
    }
    return out;
};

export const migrateFavoritesToSites = (owner: string, repo: string, favorites: unknown, now = new Date().toISOString()): IGithubSite[] => {
    let sites = withDefault([], owner, repo, now);
    for (const fav of Array.isArray(favorites) ? favorites : []) {
        const ref = parseSiteFullName(fav);
        if (ref) sites = addSite(sites, ref, 'manual', now);
    }
    return sites;
};

export const mergeFoundSites = (sites: IGithubSite[], found: SiteRef[]): SiteRef[] => {
    const seen = new Set(sites.map((s) => normalizeSiteKey(s.owner, s.repo)));
    const out: SiteRef[] = [];
    for (const f of found) {
        const key = normalizeSiteKey(f.owner, f.repo);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ owner: f.owner, repo: f.repo });
    }
    return out;
};

export const sortSitesDefaultFirst = (sites: IGithubSite[], defaultKey: string | null): IGithubSite[] => {
    if (!defaultKey) return sites;
    const isDefault = (s: IGithubSite) => normalizeSiteKey(s.owner, s.repo) === defaultKey;
    return [...sites.filter(isDefault), ...sites.filter((s) => !isDefault(s))];
};

export const describeDestination = (pagesUrl: string, memberCount: number | null): string => {
    const others = memberCount === null ? 0 : memberCount - 1;
    if (others <= 0) return `Your report appears at ${pagesUrl}.`;
    return `Your report appears at ${pagesUrl}, alongside reports from ${others} other commander${others === 1 ? '' : 's'}.`;
};
