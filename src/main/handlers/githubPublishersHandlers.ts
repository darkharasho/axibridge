/**
 * Shared publishing: a site admin adds publishers by GitHub username, and
 * invitees join from AxiBridge. GitHub's collaborator/invitation API is the
 * only source of truth — removing a collaborator on GitHub revokes access
 * here too, and there is nothing of ours to keep in sync.
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import {
    encodeGitPath,
    getRepoPermissions,
    getViewerLogin,
    githubApiRequest,
    invalidateRepoPermissions
} from '../githubApi';

export interface RepoCollaborator { login: string; avatarUrl: string | null }
export interface RepoInvite { id: number; login: string; avatarUrl: string | null; createdAt: string }
export interface SiteInvite {
    id: number; owner: string; repo: string; fullName: string; inviter: string; createdAt: string; dismissed: boolean;
}
export interface SiteJoinTarget {
    owner: string; repo: string; fullName: string; branch: string;
    pagesUrl: string; pagesSourcePath: string; madeDefault: boolean; favorites: string[];
}

const SITE_DESCRIPTION = 'AxiBridge Reports';
const INVITE_CACHE_TTL_MS = 10 * 60_000;
const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const normalizePagesPath = (value: unknown) => String(value || '').trim().replace(/^\/+|\/+$/g, '');

/**
 * Before acceptance an invitee cannot read a PRIVATE repo, so the contents
 * probe 404s there; the description (set by create-github-repo) still admits
 * AxiBridge-created sites.
 */
const looksLikeAxibridgeSite = async (owner: string, repo: string, description: unknown, branch: string, token: string) => {
    if (typeof description === 'string' && description.trim() === SITE_DESCRIPTION) return true;
    for (const p of ['reports/index.json', 'docs/reports/index.json']) {
        const resp = await githubApiRequest(
            'GET',
            `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/contents/${p}?ref=${encodeURIComponent(branch)}`,
            token
        );
        if (resp.status === 200) return true;
    }
    return false;
};

export interface PublishersHandlerOptions { store: any }

export function registerPublishersHandlers({ store }: PublishersHandlerOptions) {
    let inviteCache: { token: string; at: number; invites: Array<SiteInvite & { branch: string }> } | null = null;

    const getToken = () => store.get('githubToken') as string | undefined;
    const resolveRepo = (payload?: { owner?: string; repo?: string }) => ({
        owner: (payload?.owner?.trim() || (store.get('githubRepoOwner') as string | undefined) || '').trim(),
        repo: (payload?.repo?.trim() || (store.get('githubRepoName') as string | undefined) || '').trim()
    });
    const dismissedIds = () => {
        const raw = store.get('dismissedSiteInvites', []);
        return Array.isArray(raw) ? raw.map(String) : [];
    };
    const repoPath = (owner: string, repo: string) => `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`;

    const loadInvites = async (token: string, force: boolean) => {
        if (!force && inviteCache && inviteCache.token === token && Date.now() - inviteCache.at < INVITE_CACHE_TTL_MS) {
            return inviteCache.invites;
        }
        const resp = await githubApiRequest('GET', '/user/repository_invitations?per_page=100', token);
        if (resp.status >= 300) throw new Error(`GitHub API error (${resp.status}) loading invitations`);
        const out: Array<SiteInvite & { branch: string }> = [];
        for (const inv of Array.isArray(resp.data) ? resp.data : []) {
            const owner = inv?.repository?.owner?.login;
            const repo = inv?.repository?.name;
            if (typeof owner !== 'string' || typeof repo !== 'string' || typeof inv?.id !== 'number') continue;
            const branch = typeof inv.repository.default_branch === 'string' ? inv.repository.default_branch : 'main';
            try {
                if (!(await looksLikeAxibridgeSite(owner, repo, inv.repository.description, branch, token))) continue;
            } catch (err) {
                log.warn(`[Main] Could not inspect invited repo ${owner}/${repo}:`, err);
                continue;
            }
            out.push({
                id: inv.id, owner, repo, fullName: `${owner}/${repo}`, branch,
                inviter: typeof inv?.inviter?.login === 'string' ? inv.inviter.login : owner,
                createdAt: typeof inv.created_at === 'string' ? inv.created_at : '',
                dismissed: false
            });
        }
        out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        inviteCache = { token, at: Date.now(), invites: out };
        return out;
    };

    ipcMain.handle('get-github-viewer-login', async () => {
        const token = getToken();
        if (!token) return { success: false, error: 'GitHub not connected.' };
        const login = await getViewerLogin(token);
        return login ? { success: true, login } : { success: false, error: 'Unable to determine GitHub username.' };
    });

    ipcMain.handle('get-repo-publishers', async (_e, payload?: { owner?: string; repo?: string }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            if (!owner || !repo) return { success: false, error: 'Repository not configured.' };
            const perms = await getRepoPermissions(owner, repo, token);
            if (!perms.admin) {
                return { success: true, canAdmin: false, ownerType: perms.ownerType, collaborators: [], invites: [] };
            }
            const [collabResp, inviteResp] = await Promise.all([
                githubApiRequest('GET', `${repoPath(owner, repo)}/collaborators?affiliation=direct&per_page=100`, token),
                githubApiRequest('GET', `${repoPath(owner, repo)}/invitations?per_page=100`, token)
            ]);
            if (collabResp.status >= 300) throw new Error(`GitHub API error (${collabResp.status}) loading collaborators`);
            if (inviteResp.status >= 300) throw new Error(`GitHub API error (${inviteResp.status}) loading invitations`);
            const collaborators: RepoCollaborator[] = (Array.isArray(collabResp.data) ? collabResp.data : [])
                .filter((c: any) => typeof c?.login === 'string' && c?.permissions?.push === true)
                .map((c: any) => ({ login: c.login, avatarUrl: c.avatar_url ?? null }));
            const invites: RepoInvite[] = (Array.isArray(inviteResp.data) ? inviteResp.data : [])
                .filter((i: any) => typeof i?.id === 'number' && typeof i?.invitee?.login === 'string')
                .map((i: any) => ({ id: i.id, login: i.invitee.login, avatarUrl: i.invitee.avatar_url ?? null, createdAt: i.created_at ?? '' }));
            return { success: true, canAdmin: true, ownerType: perms.ownerType, collaborators, invites };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load publishers.' };
        }
    });

    ipcMain.handle('add-repo-publisher', async (_e, payload: { owner?: string; repo?: string; username: string }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            if (!owner || !repo) return { success: false, error: 'Repository not configured.' };
            const username = String(payload?.username || '').trim().replace(/^@/, '');
            if (!GITHUB_LOGIN_RE.test(username)) return { success: false, error: 'Enter a GitHub username.' };
            const user = await githubApiRequest('GET', `/users/${encodeGitPath(username)}`, token);
            if (user.status === 404) return { success: false, error: `No GitHub user named ${username}.` };
            if (user.status >= 300) throw new Error(`GitHub API error (${user.status}) looking up ${username}`);
            const resp = await githubApiRequest('PUT', `${repoPath(owner, repo)}/collaborators/${encodeGitPath(username)}`, token, { permission: 'push' });
            if (resp.status === 201) return { success: true, status: 'invited' };
            if (resp.status === 204) return { success: true, status: 'already-has-access' };
            return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) adding ${username}` };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to add publisher.' };
        }
    });

    ipcMain.handle('remove-repo-publisher', async (_e, payload: { owner?: string; repo?: string; username: string }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            const resp = await githubApiRequest('DELETE', `${repoPath(owner, repo)}/collaborators/${encodeGitPath(String(payload?.username || ''))}`, token);
            if (resp.status >= 300) return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) removing publisher` };
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to remove publisher.' };
        }
    });

    ipcMain.handle('cancel-repo-invite', async (_e, payload: { owner?: string; repo?: string; invitationId: number }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            const resp = await githubApiRequest('DELETE', `${repoPath(owner, repo)}/invitations/${Number(payload?.invitationId)}`, token);
            if (resp.status >= 300) return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) cancelling invite` };
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to cancel invite.' };
        }
    });

    ipcMain.handle('get-pending-site-invites', async (_e, payload?: { force?: boolean }) => {
        try {
            const token = getToken();
            if (!token) return { success: true, invites: [] };
            const dismissed = new Set(dismissedIds());
            const invites = (await loadInvites(token, !!payload?.force))
                .map(({ branch: _branch, ...invite }) => ({ ...invite, dismissed: dismissed.has(String(invite.id)) }));
            return { success: true, invites };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load invites.' };
        }
    });

    ipcMain.handle('accept-site-invite', async (_e, payload: { invitationId: number }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const id = Number(payload?.invitationId);
            const invite = (await loadInvites(token, false)).find((i) => i.id === id)
                ?? (await loadInvites(token, true)).find((i) => i.id === id);
            if (!invite) return { success: false, error: 'That invite is no longer valid.' };
            const resp = await githubApiRequest('PATCH', `/user/repository_invitations/${id}`, token);
            inviteCache = null;
            if (resp.status === 404) return { success: false, error: 'That invite is no longer valid.' };
            if (resp.status >= 300) return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) accepting invite` };
            invalidateRepoPermissions(invite.owner, invite.repo);

            // GET only: a push collaborator cannot enable Pages, and the first
            // publish runs ensureGithubPages anyway.
            const pages = await githubApiRequest('GET', `${repoPath(invite.owner, invite.repo)}/pages`, token);
            const pagesUrl = pages.status === 200 && typeof pages.data?.html_url === 'string'
                ? pages.data.html_url
                : `https://${invite.owner}.github.io/${invite.repo}`;
            const pagesSourcePath = pages.status === 200 ? normalizePagesPath(pages.data?.source?.path) : '';

            const existing = store.get('githubFavoriteRepos', []);
            const favorites = Array.from(new Set([...(Array.isArray(existing) ? existing : []), invite.fullName]));
            store.set('githubFavoriteRepos', favorites);
            const madeDefault = !store.get('githubRepoOwner') || !store.get('githubRepoName');
            if (madeDefault) {
                store.set('githubRepoOwner', invite.owner);
                store.set('githubRepoName', invite.repo);
                store.set('githubBranch', invite.branch);
                store.set('githubPagesBaseUrl', pagesUrl);
                store.set('githubPagesSourcePath', pagesSourcePath);
            }
            const target: SiteJoinTarget = {
                owner: invite.owner, repo: invite.repo, fullName: invite.fullName, branch: invite.branch,
                pagesUrl, pagesSourcePath, madeDefault, favorites
            };
            return { success: true, target };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to join site.' };
        }
    });

    ipcMain.handle('dismiss-site-invite', async (_e, payload: { invitationId: number }) => {
        const ids = dismissedIds();
        const id = String(payload?.invitationId);
        if (!ids.includes(id)) store.set('dismissedSiteInvites', [...ids, id]);
        return { success: true };
    });
}
