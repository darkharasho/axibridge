import https from 'node:https';

export const encodeGitPath = (value: string) =>
    value.split('/').map((part) => encodeURIComponent(part)).join('/');

// Socket INACTIVITY, not total duration — `request.setTimeout` arms the
// socket's idle timer, so a 35 MB blob upload that is still streaming never
// trips it, while a connection that has gone silent does. Without this every
// call here could hang forever: share resolution is awaited on the ingest
// critical path, so one dead socket stops the app processing logs at all and
// leaves every card stuck on "pending".
export const GITHUB_API_IDLE_TIMEOUT_MS = 60_000;

export const githubApiRequest = (method: string, apiPath: string, token: string, body?: any): Promise<{ status: number; data: any }> => {
    const payload = body ? JSON.stringify(body) : null;
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                method,
                hostname: 'api.github.com',
                path: apiPath,
                headers: {
                    'User-Agent': 'AxiBridge',
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${token}`,
                    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
                }
            },
            (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const parsed = data ? JSON.parse(data) : null;
                        resolve({ status: res.statusCode || 0, data: parsed });
                    } catch {
                        resolve({ status: res.statusCode || 0, data: null });
                    }
                });
            }
        );
        req.on('error', (err) => reject(err));
        // `destroy(err)` surfaces through the 'error' handler above, so the
        // promise rejects rather than being abandoned unsettled.
        req.setTimeout(GITHUB_API_IDLE_TIMEOUT_MS, () => {
            req.destroy(new Error(
                `GitHub API request timed out after ${GITHUB_API_IDLE_TIMEOUT_MS}ms of inactivity: ${method} ${apiPath}`
            ));
        });
        if (payload) req.write(payload);
        req.end();
    });
};

// ─── Cached identity / permission lookups ─────────────────────────────────────

const viewerLoginCache = new Map<string, Promise<string | null>>();

/** The signed-in user's login. Cached per token; failures are not cached. */
export const getViewerLogin = (token: string): Promise<string | null> => {
    const cached = viewerLoginCache.get(token);
    if (cached) return cached;
    const pending = githubApiRequest('GET', '/user', token)
        .then((resp) => (resp.status < 300 && typeof resp.data?.login === 'string' ? resp.data.login as string : null))
        .catch(() => null);
    viewerLoginCache.set(token, pending);
    void pending.then((login) => { if (!login) viewerLoginCache.delete(token); });
    return pending;
};

export interface RepoPermissions {
    admin: boolean;
    push: boolean;
    ownerType: 'User' | 'Organization' | null;
}

const NO_PERMISSIONS: RepoPermissions = { admin: false, push: false, ownerType: null };
const PERMISSIONS_TTL_MS = 60_000;
const permissionsCache = new Map<string, { at: number; token: string; value: RepoPermissions }>();
const permissionsKey = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase();

/**
 * What the token may do on owner/repo. A failed lookup reads as "no
 * permissions" — callers treat that as non-admin, which can never flap a
 * shared site's appearance — and is not cached, so the next call retries.
 */
export const getRepoPermissions = async (owner: string, repo: string, token: string): Promise<RepoPermissions> => {
    const key = permissionsKey(owner, repo);
    const cached = permissionsCache.get(key);
    if (cached && cached.token === token && Date.now() - cached.at < PERMISSIONS_TTL_MS) return cached.value;
    try {
        const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`, token);
        if (resp.status >= 300) return NO_PERMISSIONS;
        const admin = resp.data?.permissions?.admin === true;
        const ownerTypeRaw = resp.data?.owner?.type;
        const value: RepoPermissions = {
            admin,
            push: admin || resp.data?.permissions?.push === true,
            ownerType: ownerTypeRaw === 'Organization' || ownerTypeRaw === 'User' ? ownerTypeRaw : null
        };
        permissionsCache.set(key, { at: Date.now(), token, value });
        return value;
    } catch {
        return NO_PERMISSIONS;
    }
};

export const invalidateRepoPermissions = (owner: string, repo: string) => {
    permissionsCache.delete(permissionsKey(owner, repo));
};

export const resetGithubApiCaches = () => {
    viewerLoginCache.clear();
    permissionsCache.clear();
};
