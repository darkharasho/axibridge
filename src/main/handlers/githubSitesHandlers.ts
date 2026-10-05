/**
 * The publishing site list: which GitHub Pages sites this user publishes to,
 * and which one is the default. Access itself lives on GitHub; this list is
 * only the user's bookmarks plus live lookups.
 */
import { ipcMain } from 'electron';
import { encodeGitPath, getMemberCount, githubApiRequest } from '../githubApi';
import { SITE_DESCRIPTION } from './githubPublishersHandlers';
import { getDefaultSiteKey, readSites, writeSites } from '../githubSitesStore';
import {
    addSite, inferredPagesUrl, mergeFoundSites, normalizeSiteKey, parseSiteFullName, removeSite, setDefaultSite,
    type ISiteDetails, type SiteAddedVia, type SiteRef
} from '../../shared/githubSites';

const normalizePagesPath = (value: unknown) => String(value || '').trim().replace(/^\/+|\/+$/g, '');
const repoPath = (owner: string, repo: string) => `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`;
const toRef = (payload: unknown): SiteRef | null => {
    const p = payload as { owner?: unknown; repo?: unknown } | undefined;
    return parseSiteFullName(`${String(p?.owner ?? '')}/${String(p?.repo ?? '')}`);
};
const INVALID = { success: false, error: 'Not a valid owner/repo.' } as const;
const USER_ADDED: SiteAddedVia[] = ['manual', 'found'];

const FIND_PAGE_LIMIT = 5;

/** `role: null` = couldn't tell (network, 5xx, rate limit): callers fail open. */
const lookupSiteDetails = async (ref: SiteRef, token: string | undefined): Promise<ISiteDetails> => {
    const unknown: ISiteDetails = {
        role: null, ownerType: null, ownerAvatarUrl: null, pagesUrl: inferredPagesUrl(ref), memberCount: getMemberCount(ref.owner, ref.repo)
    };
    if (!token) return unknown;
    const path = repoPath(ref.owner, ref.repo);
    let resp: { status: number; data: any };
    try {
        resp = await githubApiRequest('GET', path, token);
    } catch {
        return unknown;
    }
    const rateLimited = resp.status === 403 && /rate limit/i.test(String(resp.data?.message || ''));
    if (resp.status === 404 || (resp.status === 403 && !rateLimited)) return { ...unknown, role: 'none' };
    if (resp.status !== 200) return unknown;
    const perms = resp.data?.permissions ?? {};
    const role = perms.admin === true ? 'admin' : perms.push === true ? 'publisher' : 'none';
    const ownerTypeRaw = resp.data?.owner?.type;
    const details: ISiteDetails = {
        ...unknown,
        role,
        ownerType: ownerTypeRaw === 'Organization' || ownerTypeRaw === 'User' ? ownerTypeRaw : null,
        ownerAvatarUrl: typeof resp.data?.owner?.avatar_url === 'string' ? resp.data.owner.avatar_url : null
    };
    if (role === 'none') return details;
    const pages = await githubApiRequest('GET', `${path}/pages`, token).catch(() => null);
    if (pages?.status === 200 && typeof pages.data?.html_url === 'string' && pages.data.html_url) details.pagesUrl = pages.data.html_url;
    return details;
};

export interface SitesHandlerOptions { store: any }

export function registerSitesHandlers({ store }: SitesHandlerOptions) {
    readSites(store); // migrate at startup, not on the first Settings visit

    const getToken = () => store.get('githubToken') as string | undefined;
    const getStoredBranch = () => ((store.get('githubBranch') as string | undefined)?.trim()) || 'main';

    ipcMain.handle('get-github-sites', async () => ({
        success: true, sites: readSites(store), defaultKey: getDefaultSiteKey(store)
    }));

    ipcMain.handle('add-github-site', async (_e, payload: { owner: string; repo: string; addedVia: SiteAddedVia }) => {
        const ref = toRef(payload);
        if (!ref || !USER_ADDED.includes(payload?.addedVia)) return { ...INVALID, sites: readSites(store) };
        const sites = addSite(readSites(store), ref, payload.addedVia);
        writeSites(store, sites);
        return { success: true, sites };
    });

    ipcMain.handle('remove-github-site', async (_e, payload: { owner: string; repo: string }) => {
        const ref = toRef(payload);
        if (!ref) return { ...INVALID, sites: readSites(store) };
        const res = removeSite(readSites(store), ref, getDefaultSiteKey(store));
        if (res.error) return { success: false, error: res.error, sites: res.sites };
        writeSites(store, res.sites);
        return { success: true, sites: res.sites };
    });

    /**
     * Read-only, like an override publish: Pages source branch and folder, else
     * the repo's default branch at the root, else the stored branch. Never
     * enables Pages — the first publish does that.
     */
    ipcMain.handle('set-default-github-site', async (_e, payload: { owner: string; repo: string }) => {
        const ref = toRef(payload);
        if (!ref) return { ...INVALID, sites: readSites(store) };
        const token = getToken();
        if (!token) return { success: false, error: 'GitHub not connected.', sites: readSites(store) };
        const path = repoPath(ref.owner, ref.repo);
        const pages: any = await githubApiRequest('GET', `${path}/pages`, token)
            .then((r) => (r.status === 200 ? r.data : null))
            .catch(() => null);
        let branch = typeof pages?.source?.branch === 'string' ? pages.source.branch.trim() : '';
        if (!branch) {
            branch = await githubApiRequest('GET', path, token)
                .then((r) => (r.status === 200 && typeof r.data?.default_branch === 'string' ? r.data.default_branch.trim() : ''))
                .catch(() => '');
        }
        const pagesUrl = typeof pages?.html_url === 'string' && pages.html_url ? pages.html_url as string : inferredPagesUrl(ref);
        // List first: readSites re-adds whatever default the store holds.
        const sites = setDefaultSite(readSites(store), ref);
        writeSites(store, sites);
        store.set('githubRepoOwner', ref.owner);
        store.set('githubRepoName', ref.repo);
        store.set('githubBranch', branch || getStoredBranch());
        store.set('githubPagesBaseUrl', pagesUrl);
        store.set('githubPagesSourcePath', normalizePagesPath(pages?.source?.path));
        return { success: true, sites, defaultKey: normalizeSiteKey(ref.owner, ref.repo), pagesUrl };
    });

    ipcMain.handle('get-github-site-details', async (_e, payload: unknown) => {
        const refs = (Array.isArray(payload) ? payload : []).map(toRef).filter((r): r is SiteRef => !!r);
        const token = getToken();
        const entries = await Promise.all(refs.map(async (ref) => [normalizeSiteKey(ref.owner, ref.repo), await lookupSiteDetails(ref, token)] as const));
        return { success: true, details: Object.fromEntries(entries) };
    });

    ipcMain.handle('find-github-sites', async () => {
        const token = getToken();
        if (!token) return { success: false, error: 'GitHub not connected.' };
        try {
            const candidates: SiteRef[] = [];
            for (let page = 1; page <= FIND_PAGE_LIMIT; page += 1) {
                const resp = await githubApiRequest('GET', `/user/repos?per_page=100&page=${page}`, token);
                if (resp.status >= 300) throw new Error(`GitHub API error (${resp.status}) loading repos`);
                const rows = Array.isArray(resp.data) ? resp.data : [];
                for (const r of rows) {
                    const owner = r?.owner?.login;
                    if (typeof owner !== 'string' || typeof r?.name !== 'string') continue;
                    if (r?.permissions?.push !== true) continue;
                    if (typeof r.description !== 'string' || r.description.trim() !== SITE_DESCRIPTION) continue;
                    candidates.push({ owner, repo: r.name });
                }
                if (rows.length < 100) break;
            }
            return { success: true, found: mergeFoundSites(readSites(store), candidates) };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to search your repos.' };
        }
    });
}
