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

/**
 * A failure below HTTP: the connection dropped, DNS failed, or the TLS session
 * broke. The commonest on Windows is `SSLV3_ALERT_BAD_RECORD_MAC` — bytes were
 * altered in transit, which in practice means antivirus HTTPS scanning, a VPN
 * or proxy, or a flaky link, not GitHub and not AxiBridge.
 */
export const isTransportError = (err: unknown): boolean => {
    const code = String((err as any)?.code ?? '');
    if (code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')) return true;
    if (['ECONNRESET', 'ECONNABORTED', 'ECONNREFUSED', 'EPIPE', 'EPROTO', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) return true;
    return /\b(SSL|TLS)\b|BAD_RECORD_MAC|DECRYPTION_FAILED|socket hang up/i.test(String((err as any)?.message ?? ''));
};

/**
 * What the user reads when a GitHub request fails below HTTP. Says plainly that
 * the cause is on their side and what to try; the original error stays on
 * `cause` and in the stack, which is what the publish dialog's detail box and
 * main.log show, so the raw OpenSSL text still reaches us.
 */
export class GithubConnectionError extends Error {
    readonly cause: unknown;

    constructor(method: string, apiPath: string, cause: unknown, attempts: number) {
        const tls = /\b(SSL|TLS)\b|BAD_RECORD_MAC|DECRYPTION_FAILED/i.test(String((cause as any)?.message ?? ''))
            || /^ERR_(SSL|TLS)_/.test(String((cause as any)?.code ?? ''));
        super(
            (tls ? 'The secure connection to GitHub was broken in transit' : 'The connection to GitHub dropped')
            + (attempts > 1 ? ', twice in a row. ' : '. ')
            + 'This comes from this computer or its network, not from GitHub or AxiBridge: '
            + 'usually antivirus "HTTPS/web scanning", a VPN or proxy, or an unstable connection. '
            + 'Try publishing again; if it keeps failing, pause web scanning or the VPN and retry.'
        );
        this.name = 'GithubConnectionError';
        this.cause = cause;
        const original = (cause as any)?.stack || String(cause);
        this.stack = `${this.stack}\nRequest: ${method} ${apiPath}\nCaused by: ${original}`;
    }
}

export const GITHUB_TRANSPORT_RETRY_DELAY_MS = 1000;

/**
 * Requests that are safe to send twice when the first one's fate is unknown.
 * Git data objects are content-addressed, so a duplicate blob/tree/commit is the
 * same object (or a harmless dangling commit); the contents API and ref
 * updates are left alone.
 */
const isSafeToRetry = (method: string, apiPath: string) =>
    method === 'GET' || (method === 'POST' && /\/git\/(blobs|trees|commits)$/.test(apiPath));

/**
 * Run one GitHub request. A transport failure (see {@link isTransportError}) is
 * retried once when {@link isSafeToRetry}; if it fails again, or cannot be
 * retried, it surfaces as a {@link GithubConnectionError}. HTTP error statuses
 * and our own idle timeout pass through untouched.
 */
export const withGithubTransportRetry = async <T>(method: string, apiPath: string, once: () => Promise<T>): Promise<T> => {
    try {
        return await once();
    } catch (err) {
        if (!isTransportError(err)) throw err;
        if (!isSafeToRetry(method, apiPath)) throw new GithubConnectionError(method, apiPath, err, 1);
        console.warn(`[GitHub] ${method} ${apiPath} failed at the connection (${(err as any)?.code || (err as any)?.message}); retrying once.`);
    }
    await new Promise((resolve) => setTimeout(resolve, GITHUB_TRANSPORT_RETRY_DELAY_MS));
    try {
        return await once();
    } catch (err) {
        if (!isTransportError(err)) throw err;
        throw new GithubConnectionError(method, apiPath, err, 2);
    }
};

export const githubApiRequest = (method: string, apiPath: string, token: string, body?: any): Promise<{ status: number; data: any }> =>
    withGithubTransportRetry(method, apiPath, () => githubApiRequestOnce(method, apiPath, token, body));

const githubApiRequestOnce = (method: string, apiPath: string, token: string, body?: any): Promise<{ status: number; data: any }> => {
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

/** Push collaborators per repo, recorded whenever a members list loads this session. */
const memberCounts = new Map<string, number>();
export const recordMemberCount = (owner: string, repo: string, count: number) => {
    memberCounts.set(permissionsKey(owner, repo), count);
};
export const getMemberCount = (owner: string, repo: string): number | null =>
    memberCounts.get(permissionsKey(owner, repo)) ?? null;

export const resetGithubApiCaches = () => {
    memberCounts.clear();
    viewerLoginCache.clear();
    permissionsCache.clear();
};
