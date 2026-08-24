import { ipcMain, app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import log from 'electron-log';
import {
    parseRollupSourcesFile,
    removeRollupSources,
    updateRollupSourcesForPublish,
    type RollupReportPayload
} from '../../web/rollup';
import { parseAttendanceFile, updateAttendanceForPublish, type AttendanceRaid } from '../../web/attendance';
import { postReportToWebhooks, type ReportWebhookPostResult } from '../reportWebhooks';
import { type IReportWebhook, selectReportWebhooks } from '../../shared/reportWebhooks';
import { resolveGuild } from '../guildDirectory';
import { type R2Config } from '../cloudflare/r2SigV4';
import {
    createManualUploader,
    createOAuthUploader,
    type R2AuthMode,
    type R2Uploader
} from '../cloudflare/uploader';
import { CLOUDFLARE_OAUTH_CLIENT_ID } from '../cloudflare/oauth';
import {
    REPLAY_SIDECAR_CONTENT_TYPE,
    REPLAY_SIDECAR_FILENAME,
    prepareReplaySidecar,
    replayObjectKeys
} from '../cloudflare/replaySidecar';
import {
    CF_ACCOUNT_ID_KEY,
    getAccessToken as getCloudflareAccessToken,
    isSessionConnected
} from '../cloudflare/session';
// ─── Constants ────────────────────────────────────────────────────────────────

// GitHub's blob API encodes content as base64, adding ~33% overhead.
// A 50 MB raw file becomes ~67 MB base64 — safely under GitHub's ~100 MB request limit.
// 90 MB was too large: it produced ~120 MB base64 payloads that GitHub rejects with 422.
export const MAX_GITHUB_BLOB_BYTES = 50 * 1024 * 1024;
const MAX_GITHUB_REPORT_JSON_BYTES = MAX_GITHUB_BLOB_BYTES;
const GITHUB_DEVICE_CLIENT_ID = process.env.GITHUB_DEVICE_CLIENT_ID || 'Ov23liFh1ih9LAcnLACw';
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';

// ─── GitHub auth helpers ──────────────────────────────────────────────────────

const requestGithubDeviceCode = (scope: string): Promise<{ deviceCode?: string; userCode?: string; verificationUri?: string; interval?: number; error?: string }> => {
    if (!GITHUB_DEVICE_CLIENT_ID) {
        return Promise.resolve({ error: 'GitHub device client ID is not configured.' });
    }
    const postData = new URLSearchParams({
        client_id: GITHUB_DEVICE_CLIENT_ID,
        scope
    }).toString();

    return new Promise((resolve) => {
        const req = https.request(
            {
                method: 'POST',
                hostname: 'github.com',
                path: '/login/device/code',
                headers: {
                    'User-Agent': 'AxiBridge',
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            },
            (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const payload = JSON.parse(data);
                        if (payload?.device_code) {
                            resolve({
                                deviceCode: payload.device_code,
                                userCode: payload.user_code,
                                verificationUri: payload.verification_uri,
                                interval: payload.interval
                            });
                        } else {
                            resolve({ error: payload?.error_description || 'Failed to start GitHub device flow.' });
                        }
                    } catch {
                        resolve({ error: 'Failed to parse GitHub device flow response.' });
                    }
                });
            }
        );
        req.on('error', () => resolve({ error: 'GitHub device flow request failed.' }));
        req.write(postData);
        req.end();
    });
};

const pollGithubDeviceToken = async (deviceCode: string, intervalSeconds: number): Promise<{ token?: string; error?: string }> => {
    const postData = new URLSearchParams({
        client_id: GITHUB_DEVICE_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    }).toString();

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let intervalMs = Math.max(1000, intervalSeconds * 1000);

    for (let attempt = 0; attempt < 120; attempt += 1) {
        const result = await new Promise<{ token?: string; error?: string; errorCode?: string }>((resolve) => {
            const req = https.request(
                {
                    method: 'POST',
                    hostname: 'github.com',
                    path: '/login/oauth/access_token',
                    headers: {
                        'User-Agent': 'AxiBridge',
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                },
                (res) => {
                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            const payload = JSON.parse(data);
                            if (payload?.access_token) {
                                resolve({ token: payload.access_token });
                            } else if (payload?.error) {
                                resolve({ errorCode: payload.error, error: payload.error_description || payload.error });
                            } else {
                                resolve({ error: 'Unknown device auth response.' });
                            }
                        } catch {
                            resolve({ error: 'Failed to parse device token response.' });
                        }
                    });
                }
            );
            req.on('error', () => resolve({ error: 'GitHub token polling failed.' }));
            req.write(postData);
            req.end();
        });

        if (result.token) return { token: result.token };
        if (result.errorCode === 'authorization_pending') {
            await wait(intervalMs);
            continue;
        }
        if (result.errorCode === 'slow_down') {
            intervalMs += 5000;
            await wait(intervalMs);
            continue;
        }
        if (result.errorCode === 'expired_token') {
            return { error: 'Authorization expired. Please try again.' };
        }
        return { error: result.error || 'Device authorization failed.' };
    }
    return { error: 'Authorization timed out.' };
};

// ─── GitHub API helpers ────────────────────────────────────────────────────────

const encodeGitPath = (value: string) =>
    value.split('/').map((part) => encodeURIComponent(part)).join('/');

const githubApiRequest = (method: string, apiPath: string, token: string, body?: any): Promise<{ status: number; data: any }> => {
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
        if (payload) req.write(payload);
        req.end();
    });
};

const getGithubFile = async (owner: string, repo: string, filePath: string, branch: string, token: string) => {
    const apiPath = `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/contents/${encodeGitPath(filePath)}?ref=${encodeURIComponent(branch)}`;
    const resp = await githubApiRequest('GET', apiPath, token);
    if (resp.status === 404) return null;
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading ${filePath}`);
    }
    return resp.data;
};

const getGithubBlob = async (owner: string, repo: string, blobSha: string, token: string) => {
    // Unlike the contents API, the blob API has no 1MB read limit.
    const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/blobs/${encodeGitPath(blobSha)}`, token);
    if (resp.status === 404) return null;
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading blob ${blobSha}`);
    }
    return resp.data;
};

const getGithubTree = async (owner: string, repo: string, treeSha: string, token: string) => {
    const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/trees/${encodeGitPath(treeSha)}?recursive=1`, token);
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading tree`);
    }
    return resp.data;
};

const getGithubRef = async (owner: string, repo: string, branch: string, token: string) => {
    const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/ref/heads/${encodeGitPath(branch)}`, token);
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading ref`);
    }
    return resp.data;
};

const getGithubCommit = async (owner: string, repo: string, commitSha: string, token: string) => {
    const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/commits/${encodeGitPath(commitSha)}`, token);
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading commit`);
    }
    return resp.data;
};

const getGithubPagesLatestBuild = async (owner: string, repo: string, token: string) => {
    const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/pages/builds/latest`, token);
    if (resp.status === 404) return null;
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading Pages build status`);
    }
    return resp.data;
};

const createGithubBlob = async (owner: string, repo: string, token: string, contentBase64: string, blobPath?: string) => {
    const resp = await githubApiRequest('POST', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/blobs`, token, {
        content: contentBase64,
        encoding: 'base64'
    });
    if (resp.status >= 300) {
        const detail = typeof resp.data?.message === 'string' ? resp.data.message : 'Unknown error';
        const target = blobPath ? ` for ${blobPath}` : '';
        const err = new Error(`GitHub API error (${resp.status}) creating blob${target}: ${detail}`);
        (err as any).status = resp.status;
        (err as any).data = resp.data;
        throw err;
    }
    return resp.data;
};

const createGithubTree = async (owner: string, repo: string, token: string, baseTree: string, entries: Array<{ path: string; sha: string | null }>) => {
    const resp = await githubApiRequest('POST', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/trees`, token, {
        base_tree: baseTree,
        tree: entries.map((entry) => ({
            path: entry.path,
            mode: '100644',
            type: 'blob',
            sha: entry.sha ?? null
        }))
    });
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) creating tree`);
    }
    return resp.data;
};

const createGithubCommit = async (owner: string, repo: string, token: string, message: string, treeSha: string, parentSha: string) => {
    const resp = await githubApiRequest('POST', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/commits`, token, {
        message,
        tree: treeSha,
        parents: [parentSha]
    });
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) creating commit`);
    }
    return resp.data;
};

const updateGithubRef = async (owner: string, repo: string, branch: string, token: string, commitSha: string) => {
    const resp = await githubApiRequest('PATCH', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/refs/heads/${encodeGitPath(branch)}`, token, {
        sha: commitSha,
        force: false
    });
    if (resp.status >= 300) {
        const err = new Error(`GitHub API error (${resp.status}) updating ref`);
        (err as any).status = resp.status;
        (err as any).data = resp.data;
        throw err;
    }
    return resp.data;
};

const computeGitBlobSha = (content: Buffer) => {
    return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
};

const listGithubRepos = async (token: string) => {
    const repos: Array<{ full_name: string; name: string; owner: string }> = [];
    let page = 1;
    while (page <= 5) {
        const resp = await githubApiRequest('GET', `/user/repos?per_page=100&page=${page}`, token);
        if (resp.status >= 300) {
            throw new Error(`GitHub API error (${resp.status}) loading repos`);
        }
        if (!Array.isArray(resp.data) || resp.data.length === 0) break;
        resp.data.forEach((repo: any) => {
            if (!repo || !repo.full_name) return;
            repos.push({
                full_name: repo.full_name,
                name: repo.name,
                owner: repo.owner?.login || ''
            });
        });
        if (resp.data.length < 100) break;
        page += 1;
    }
    return repos;
};

const listGithubOrganizations = async (token: string) => {
    const orgs: Array<{ login: string }> = [];
    let page = 1;
    while (page <= 5) {
        const resp = await githubApiRequest('GET', `/user/orgs?per_page=100&page=${page}`, token);
        if (resp.status >= 300) {
            throw new Error(`GitHub API error (${resp.status}) loading organizations`);
        }
        if (!Array.isArray(resp.data) || resp.data.length === 0) break;
        resp.data.forEach((org: any) => {
            const login = org?.login;
            if (!login || typeof login !== 'string') return;
            orgs.push({ login });
        });
        if (resp.data.length < 100) break;
        page += 1;
    }
    return orgs;
};

const getGithubUser = async (token: string) => {
    const resp = await githubApiRequest('GET', '/user', token);
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading user`);
    }
    return resp.data;
};

const isValidRepoName = (value: string) => /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.') && !value.endsWith('.git');

const createGithubRepo = async (owner: string, repo: string, token: string, authenticatedUser?: string) => {
    if (!isValidRepoName(repo)) {
        throw new Error('Invalid repository name.');
    }
    const creatingInOrg = !!authenticatedUser && owner.toLowerCase() !== authenticatedUser.toLowerCase();
    const apiPath = creatingInOrg
        ? `/orgs/${encodeGitPath(owner)}/repos`
        : '/user/repos';
    const resp = await githubApiRequest('POST', apiPath, token, {
        name: repo,
        private: false,
        auto_init: true,
        description: 'AxiBridge Reports'
    });
    if (resp.status >= 300) {
        const detail = resp.data?.message || 'Unknown error';
        throw new Error(`GitHub API error (${resp.status}) creating repo: ${detail}`);
    }
    return resp.data;
};

// A brand-new repository with no commits has no branches, so the target branch
// does not exist. GitHub rejects both enabling Pages and updating refs against
// such a repo with a 409 Conflict ("Git Repository is empty"). GET on a ref
// returns 404 (no such ref) or 409 (empty repo) in that state.
const branchExists = async (owner: string, repo: string, branch: string, token: string) => {
    const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/ref/heads/${encodeGitPath(branch)}`, token);
    if (resp.status === 200) return true;
    if (resp.status === 404 || resp.status === 409) return false;
    throw new Error(`GitHub API error (${resp.status}) checking branch ${branch}`);
};

// Seed an empty repository with a first commit so the target branch exists.
// The Contents API works on an empty repo and creates the branch as a side
// effect, unlike the git-data endpoints which require an existing ref.
const seedEmptyGithubRepo = async (owner: string, repo: string, branch: string, token: string) => {
    const content = Buffer.from(
        '# AxiBridge Reports\n\nThis repository hosts AxiBridge web reports.\n'
    ).toString('base64');
    const resp = await githubApiRequest('PUT', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/contents/README.md`, token, {
        message: 'Initialize repository for AxiBridge',
        content,
        branch
    });
    if (resp.status >= 300) {
        const detail = typeof resp.data?.message === 'string' ? resp.data.message : 'Unknown error';
        throw new Error(`GitHub API error (${resp.status}) initializing repository: ${detail}`);
    }
    return resp.data;
};

export const ensureGithubPages = async (owner: string, repo: string, branch: string, token: string) => {
    const pagesResp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/pages`, token);
    if (pagesResp.status === 200) {
        return pagesResp.data;
    }
    if (pagesResp.status !== 404) {
        throw new Error(`GitHub API error (${pagesResp.status}) checking Pages`);
    }
    // Pages can only be enabled once the source branch exists. An empty repo has
    // no branch yet, which otherwise surfaces as a confusing 409 on the POST
    // below — seed a first commit so the branch is present.
    if (!(await branchExists(owner, repo, branch, token))) {
        await seedEmptyGithubRepo(owner, repo, branch, token);
    }
    const createResp = await githubApiRequest('POST', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/pages`, token, {
        source: { branch, path: '/' }
    });
    if (createResp.status >= 300) {
        const detail = createResp.data?.message || 'Unknown error';
        throw new Error(`GitHub API error (${createResp.status}) enabling Pages: ${detail}`);
    }
    return createResp.data;
};

// ─── Pages path helpers ────────────────────────────────────────────────────────

const normalizePagesPath = (value?: string | null) => {
    if (!value) return '';
    let pathValue = String(value).trim();
    if (!pathValue || pathValue === '/' || pathValue === '.') return '';
    pathValue = pathValue.replace(/^\/+|\/+$/g, '');
    return pathValue;
};

const withPagesPath = (pagesPath: string, repoPath: string) => {
    if (!pagesPath) return repoPath;
    return `${pagesPath}/${repoPath}`.replace(/\/{2,}/g, '/');
};

// ─── Cloudflare R2 helpers ────────────────────────────────────────────────────

// Credentials are pasted from the Cloudflare dashboard, so trim: a trailing
// space or newline survives the "is it set?" check but corrupts the SigV4
// signature, which used to surface only as an opaque R2 PUT failure.
const R2_FIELDS = [
    { key: 'r2AccountId', label: 'Account ID', prop: 'accountId' },
    { key: 'r2AccessKeyId', label: 'Access Key ID', prop: 'accessKeyId' },
    { key: 'r2SecretAccessKey', label: 'Secret Access Key', prop: 'secretAccessKey' },
    { key: 'r2BucketName', label: 'Bucket Name', prop: 'bucketName' },
    { key: 'r2PublicUrl', label: 'Public URL', prop: 'publicUrl' }
] as const;

export const resolveR2Config = (store: any): { config: R2Config | null; missingFields: string[] } => {
    const resolved: Record<string, string> = {};
    const missingFields: string[] = [];
    for (const { key, label, prop } of R2_FIELDS) {
        const value = store.get(key) as string | null | undefined;
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (!trimmed) missingFields.push(label);
        else resolved[prop] = trimmed;
    }
    if (missingFields.length > 0) {
        log.info(`[Main] R2 config incomplete — missing: ${missingFields.join(', ')}`);
        return { config: null, missingFields };
    }
    return { config: resolved as unknown as R2Config, missingFields };
};

// Hosting is opt-out rather than opt-in: a user who filled in credentials wants
// them used. The flags exist so a publish can be sent to Pages alone without
// tearing the credentials out and pasting them back afterwards.
//
// Replay and slice are two independent R2 objects produced by two independent
// codepaths — the slice sidecar folds a fresh aggregator per fight and never
// reads a replay position — so each gets its own switch.
//
// `r2HostingEnabled` is the replay switch. The key keeps its original name
// because that is what it has always been labelled as in Settings, and renaming
// it would cost a migration to change nothing a user can see.
export const isR2ReplayEnabled = (store: any): boolean => store.get('r2HostingEnabled') !== false;

/**
 * Whether fight slice data goes to R2.
 *
 * An install that predates the split has no `r2SliceEnabled` at all, and back
 * then `r2HostingEnabled` gated slices too. Reading the absent key as its own
 * default would quietly take the web slicer away from everyone who had R2 on,
 * so it inherits the replay switch until the user touches it.
 */
export const isR2SliceEnabled = (store: any): boolean => {
    const raw = store.get('r2SliceEnabled');
    return typeof raw === 'boolean' ? raw : isR2ReplayEnabled(store);
};

export const resolveR2AuthMode = (store: any): R2AuthMode =>
    store.get('r2AuthMode') === 'oauth' ? 'oauth' : 'manual';

interface R2UploaderResolution {
    uploader: R2Uploader | null;
    missingFields: string[];
    /**
     * The user set R2 up part-way. Distinct from "not configured": it is worth
     * interrupting a publish to say why R2 was skipped, but only when they
     * clearly meant to use it.
     */
    partiallyConfigured: boolean;
}

/** The three things OAuth mode needs beyond the grant itself. */
const OAUTH_FIELD_COUNT = 3;

/**
 * The single question the publish path asks: "can I write to R2 right now, and
 * through what?" Both credential modes collapse to one uploader here so that no
 * call site has to know which transport it got, or that OAuth exists at all.
 */
const resolveR2Credentials = (store: any): R2UploaderResolution => {
    if (resolveR2AuthMode(store) === 'oauth') {
        const accountId = String(store.get(CF_ACCOUNT_ID_KEY) ?? '').trim();
        const bucketName = String(store.get('r2BucketName') ?? '').trim();
        const publicUrl = String(store.get('r2PublicUrl') ?? '').trim();
        const missingFields: string[] = [];
        if (!isSessionConnected(store)) missingFields.push('Cloudflare sign-in');
        if (!bucketName) missingFields.push('Bucket Name');
        if (!publicUrl) missingFields.push('Public URL');
        if (missingFields.length > 0) {
            log.info(`[Main] R2 OAuth config incomplete — missing: ${missingFields.join(', ')}`);
            return { uploader: null, missingFields, partiallyConfigured: missingFields.length < OAUTH_FIELD_COUNT };
        }
        return {
            uploader: createOAuthUploader({
                accountId,
                bucketName,
                publicUrl,
                getAccessToken: () => getCloudflareAccessToken(store, CLOUDFLARE_OAUTH_CLIENT_ID)
            }),
            missingFields: [],
            partiallyConfigured: false
        };
    }

    const { config, missingFields } = resolveR2Config(store);
    return {
        uploader: config ? createManualUploader(config) : null,
        missingFields,
        // Nothing filled in at all is "not using R2", not "using R2 wrong".
        partiallyConfigured: !config && missingFields.length < R2_FIELDS.length
    };
};

export const resolveR2Uploader = (store: any): R2UploaderResolution => {
    // Credentials are resolved when *either* artifact still wants R2. Which one
    // actually gets uploaded is decided per artifact at the publish site.
    if (!isR2ReplayEnabled(store) && !isR2SliceEnabled(store)) {
        log.info('[Main] R2 hosting is switched off for both replay and slice data — skipping R2 for this publish');
        return { uploader: null, missingFields: [], partiallyConfigured: false };
    }
    return resolveR2Credentials(store);
};

/**
 * What the UI needs to describe R2 without asking three separate questions.
 *
 * `credentialsPresent` deliberately ignores the hosting toggle: the toggle's own
 * row is shown only when R2 is set up, and folding the toggle into that answer
 * would make switching it off hide the switch that turns it back on.
 */
export const describeR2Status = (store: any) => {
    const credentials = resolveR2Credentials(store);
    const present = !!credentials.uploader;
    const replayEnabled = isR2ReplayEnabled(store);
    const sliceEnabled = isR2SliceEnabled(store);
    return {
        /** R2 will be used for at least one artifact on the next publish. */
        configured: present && (replayEnabled || sliceEnabled),
        credentialsPresent: present,
        replayEnabled,
        sliceEnabled,
        replayConfigured: present && replayEnabled,
        sliceConfigured: present && sliceEnabled,
        mode: resolveR2AuthMode(store)
    };
};

// ─── Report payload builder ────────────────────────────────────────────────────

const formatBytes = (value: number) => {
    if (!Number.isFinite(value) || value < 1024) {
        return `${Math.max(0, Math.round(value || 0))} B`;
    }
    const units = ['KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = -1;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

/**
 * Decide where a report's out-of-band artifact lives.
 *
 * Replays prefer R2 and fall back to GitHub Pages, since one artifact on Pages
 * is affordable and losing the replay outright costs a feature. A Pages-hosted
 * replay travels through the GitHub blob API, which 422s past
 * MAX_GITHUB_BLOB_BYTES, so an oversized one is dropped rather than allowed to
 * fail the whole upload.
 *
 * Slice sidecars are R2-only, deliberately. A Pages fallback would spend ~1.56x
 * of the repo's storage budget per report — precisely the cost the web slicer
 * was designed to avoid. With no R2 the report publishes exactly as it does
 * today and simply has no slicer.
 */
export const planSidecarHosting = ({ kind, bytes, r2Url, reportId, baseUrl }: {
    kind: 'replay' | 'slice';
    bytes: number;
    r2Url: string | null;
    reportId: string;
    baseUrl: string | null;
}): { mode: 'r2' | 'pages' | 'dropped'; url: string | null; warning: string | null } => {
    if (r2Url) {
        return { mode: 'r2', url: r2Url, warning: null };
    }
    if (kind === 'slice') {
        return {
            mode: 'dropped',
            url: null,
            warning:
                'Fight slicing in the published report needs Cloudflare R2 — configure it in Settings. ' +
                'The report itself publishes normally either way.'
        };
    }
    if (bytes > MAX_GITHUB_BLOB_BYTES) {
        return {
            mode: 'dropped',
            url: null,
            warning:
                `Replay data (${formatBytes(bytes)}) is too large to host on GitHub Pages ` +
                `(limit ${formatBytes(MAX_GITHUB_BLOB_BYTES)}) — publishing the report without the map replay. ` +
                `Configure Cloudflare R2 in Settings to keep replays on large sessions.`
        };
    }
    const relativePath = `reports/${reportId}/${REPLAY_SIDECAR_FILENAME}`;
    return {
        mode: 'pages',
        url: baseUrl ? `${baseUrl.replace(/\/$/, '')}/${relativePath}` : relativePath,
        warning: null
    };
};

const buildWebReportPayload = (
    reportMeta: any,
    sourceStats: any,
    colorPalette: string,
    glassSurfaces: boolean,
    glassmorphic: boolean
) => {
    const payload = {
        meta: { ...(reportMeta || {}) },
        stats: {
            ...(sourceStats || {}),
            colorPalette,
            glassSurfaces,
            glassmorphic
        } as Record<string, any>
    };

    const stats = payload.stats as Record<string, any>;

    // Deduplicate boonIcons/skillIcons across replayFights: these icon dictionaries are
    // identical (or near-identical) across every fight in a session, so storing them once
    // at the top level instead of once per fight saves significant space.
    const replayFightsRaw = Array.isArray(stats.replayFights) ? (stats.replayFights as any[]) : [];
    if (replayFightsRaw.length > 0) {
        const mergedBoonIcons: Record<number, { name: string; icon: string }> = {};
        const mergedSkillIcons: Record<number, { name: string; icon: string }> = {};
        for (const fight of replayFightsRaw) {
            if (fight?.movementData?.boonIcons) Object.assign(mergedBoonIcons, fight.movementData.boonIcons);
            if (fight?.movementData?.skillIcons) Object.assign(mergedSkillIcons, fight.movementData.skillIcons);
            if (fight?.movementData) {
                fight.movementData.boonIcons = {};
                fight.movementData.skillIcons = {};
            }
        }
        stats.replayIcons = { boonIcons: mergedBoonIcons, skillIcons: mergedSkillIcons };
    }

    // Build a global icon URL index: collect every `icon` string value in the entire
    // stats object, store deduplicated URLs in stats.iconIndex[], and replace each
    // occurrence with its numeric index. A GW2 CDN URL is ~84 chars; indices are 1-3
    // chars, and the same URL is repeated many times across skill/boon tables.
    (() => {
        const iconIndex: string[] = [];
        const iconMap = new Map<string, number>();
        const walk = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) { for (const item of obj) walk(item); return; }
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (key === 'icon' && typeof val === 'string' && val.length > 0) {
                    let idx = iconMap.get(val);
                    if (idx === undefined) { idx = iconIndex.length; iconIndex.push(val); iconMap.set(val, idx); }
                    obj[key] = idx;
                } else if (val && typeof val === 'object') {
                    walk(val);
                }
            }
        };
        walk(stats);
        if (iconIndex.length > 0) stats.iconIndex = iconIndex;
    })();

    // Compress targetFocusSamples: replace repeated memberKey account strings with
    // per-fight numeric indices into a fight.memberKeys array.
    for (const fight of replayFightsRaw) {
        if (!Array.isArray(fight?.targetFocusSamples) || fight.targetFocusSamples.length === 0) continue;
        const seen = new Set<string>();
        for (const s of fight.targetFocusSamples) { if (typeof s.memberKey === 'string') seen.add(s.memberKey); }
        const memberKeys = Array.from(seen);
        if (memberKeys.length === 0) continue;
        const keyToIdx = new Map(memberKeys.map((k, i) => [k, i] as const));
        fight.memberKeys = memberKeys;
        fight.targetFocusSamples = fight.targetFocusSamples.map((s: any) => {
            const idx = keyToIdx.get(s.memberKey);
            return idx !== undefined ? { ...s, memberKey: idx } : s;
        });
    }

    const serialize = () => Buffer.from(JSON.stringify(payload), 'utf8');
    let jsonBuffer = serialize();
    if (jsonBuffer.length <= MAX_GITHUB_REPORT_JSON_BYTES) {
        return { payload, jsonBuffer, trimmedSections: [] as string[] };
    }

    const trimmedSections: string[] = [];
    const clearArray = (target: any, key: string) => {
        if (!target || typeof target !== 'object' || !Array.isArray(target[key]) || target[key].length === 0) {
            return false;
        }
        target[key] = [];
        return true;
    };
    const deleteKey = (target: any, key: string) => {
        if (!target || typeof target !== 'object' || !(key in target)) return false;
        delete target[key];
        return true;
    };

    const trimSteps: Array<{ label: string; apply: () => boolean }> = [
        // Replay data is the largest section — drop it first.
        { label: 'replayFights', apply: () => clearArray(stats, 'replayFights') },
        // Icons become orphaned once fights are dropped.
        { label: 'replayIcons', apply: () => deleteKey(stats, 'replayIcons') },
        { label: 'skillUsageData.logRecords', apply: () => clearArray(stats.skillUsageData, 'logRecords') },
        { label: 'playerSkillBreakdowns', apply: () => clearArray(stats, 'playerSkillBreakdowns') },
        { label: 'boonTimeline', apply: () => clearArray(stats, 'boonTimeline') },
        { label: 'boonUptimeTimeline', apply: () => clearArray(stats, 'boonUptimeTimeline') },
        { label: 'specialTables', apply: () => clearArray(stats, 'specialTables') },
        { label: 'fightDiffMode', apply: () => clearArray(stats, 'fightDiffMode') },
        { label: 'outgoingConditionPlayers', apply: () => clearArray(stats, 'outgoingConditionPlayers') },
        { label: 'incomingConditionPlayers', apply: () => clearArray(stats, 'incomingConditionPlayers') },
        { label: 'skillUsageData.players', apply: () => clearArray(stats.skillUsageData, 'players') },
        { label: 'skillUsageData.skillOptions', apply: () => clearArray(stats.skillUsageData, 'skillOptions') },
        { label: 'topSkills', apply: () => clearArray(stats, 'topSkills') },
        { label: 'topIncomingSkills', apply: () => clearArray(stats, 'topIncomingSkills') },
        { label: 'topSkillsByDamage', apply: () => clearArray(stats, 'topSkillsByDamage') },
        { label: 'topSkillsByDownContribution', apply: () => clearArray(stats, 'topSkillsByDownContribution') },
        { label: 'fightBreakdown', apply: () => clearArray(stats, 'fightBreakdown') },
        { label: 'timelineData', apply: () => clearArray(stats, 'timelineData') },
        { label: 'squadCompByFight', apply: () => clearArray(stats, 'squadCompByFight') },
        { label: 'iconIndex', apply: () => deleteKey(stats, 'iconIndex') },
    ];

    for (const step of trimSteps) {
        if (!step.apply()) continue;
        trimmedSections.push(step.label);
        jsonBuffer = serialize();
        if (jsonBuffer.length <= MAX_GITHUB_REPORT_JSON_BYTES) break;
    }

    if (trimmedSections.length > 0) {
        payload.meta = {
            ...payload.meta,
            trimmedSections
        };
        jsonBuffer = serialize();
    }

    if (jsonBuffer.length > MAX_GITHUB_REPORT_JSON_BYTES) {
        throw new Error(
            `Report payload too large for GitHub upload after trimming (${formatBytes(jsonBuffer.length)}). ` +
            `Limit is ${formatBytes(MAX_GITHUB_REPORT_JSON_BYTES)}.`
        );
    }

    return { payload, jsonBuffer, trimmedSections };
};

const hasWebReportContent = (payload: { meta?: any; stats?: any } | null | undefined) => {
    const stats = payload?.stats;
    if (!stats || typeof stats !== 'object') return false;

    const total = Number((stats as any).total || 0);
    if (Number.isFinite(total) && total > 0) return true;

    const nonEmptyArrayKeys = [
        'fightBreakdown',
        'timelineData',
        'mapData',
        'attendanceData',
        'offensePlayers',
        'defensePlayers',
        'supportPlayers',
        'healingPlayers',
        'boonTables',
        'squadClassData',
        'enemyClassData',
        'playerSkillBreakdowns',
        'topSkills',
        'topIncomingSkills'
    ];

    return nonEmptyArrayKeys.some((key) => Array.isArray((stats as any)[key]) && (stats as any)[key].length > 0);
};

// ─── Web template helpers ──────────────────────────────────────────────────────

const collectFiles = (dir: string) => {
    const result: Array<{ absPath: string; relPath: string }> = [];
    const walk = (current: string) => {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        entries.forEach((entry) => {
            const absPath = path.join(current, entry.name);
            const relPath = path.relative(dir, absPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
                walk(absPath);
            } else {
                if (entry.name.startsWith('.')) return;
                if (entry.name.endsWith('~')) return;
                if (/\.(kra|psd|xcf)$/i.test(entry.name)) return;
                result.push({ absPath, relPath });
            }
        });
    };
    walk(dir);
    return result;
};

const copyDir = (src: string, dest: string) => {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    entries.forEach((entry) => {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
};

const refreshDevWebTemplate = (templateDir: string, webRoot: string) => {
    const resetTargets = [
        'assets',
        'img',
        'svg',
        'web',
        'index.html',
        'theme.json',
        'ui-theme.json',
        'logo.json',
        'logo.png'
    ];
    resetTargets.forEach((target) => {
        const targetPath = path.join(webRoot, target);
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
    });
    copyDir(templateDir, webRoot);
    ensureWebRootIndex(webRoot);
    ensureDevWebIndex(webRoot);
};

const ensureDevWebIndex = (webRoot: string) => {
    const indexPath = path.join(webRoot, 'index.html');
    if (fs.existsSync(indexPath)) {
        try {
            const current = fs.readFileSync(indexPath, 'utf8');
            if (current.includes('/src/web/main.tsx')) {
                return;
            }
        } catch {
            // Fall through to rewrite index.
        }
    }
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/svg/axibridge-glyph.svg" />
    <link rel="apple-touch-icon" href="/svg/axibridge-glyph.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AxiBridge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/web/main.tsx"></script>
  </body>
</html>
`;
    fs.writeFileSync(indexPath, html);
};

const ensureWebRootIndex = (templateDir: string) => {
    try {
        const rootIndex = path.join(templateDir, 'index.html');
        const webIndex = path.join(templateDir, 'web', 'index.html');
        if (!fs.existsSync(webIndex)) return;
        let html = fs.readFileSync(webIndex, 'utf8');
        html = html.replace(/\.\.\/assets\//g, './assets/');
        html = html.replace(/\.\.\/img\//g, './img/');
        html = html.replace(/\.\.\/svg\//g, './svg/');
        if (fs.existsSync(rootIndex)) {
            const current = fs.readFileSync(rootIndex, 'utf8');
            if (current === html) return;
        }
        fs.writeFileSync(rootIndex, html);
    } catch {
        // Ignore failures; upload will still include web/index.html.
    }
};

const getWebRootIndexBuffer = (templateDir: string) => {
    try {
        const webIndex = path.join(templateDir, 'web', 'index.html');
        if (!fs.existsSync(webIndex)) return null;
        let html = fs.readFileSync(webIndex, 'utf8');
        html = html.replace(/\.\.\/assets\//g, './assets/');
        html = html.replace(/\.\.\/img\//g, './img/');
        html = html.replace(/\.\.\/svg\//g, './svg/');
        return Buffer.from(html);
    } catch {
        return null;
    }
};

// Compatibility patch:
// Older web bundles hardcode custom icon masks to `/svg/custom-icons/*`, which breaks
// on GitHub Pages project subpaths. Rewrite those to `./svg/custom-icons/*` at upload
// time so reports self-heal even if the uploader is on an older template snapshot.
const patchLegacyCustomIconUrls = (relPath: string, content: Buffer) => {
    const normalizedPath = relPath.replace(/\\/g, '/');
    if (!/^assets\/index-.*\.js$/i.test(normalizedPath)) {
        return content;
    }
    const source = content.toString('utf8');
    const patched = source.replace(/url\(\/svg\/custom-icons\//g, 'url(./svg/custom-icons/');
    if (patched === source) {
        return content;
    }
    return Buffer.from(patched, 'utf8');
};

const buildWebTemplate = async (appRoot: string) => {
    // In dev, local mock/web uploads overwrite `web/index.html` with built output.
    // Restore the source entrypoint before each build so Vite recompiles from src/web/main.tsx.
    if (!app.isPackaged) {
        try {
            ensureDevWebIndex(path.join(appRoot, 'web'));
        } catch {
            // Best effort; build may still fail with a clear error if entry is invalid.
        }
    }
    return new Promise<{ ok: boolean; error?: string; errorDetail?: string }>((resolve) => {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const child = spawn(npmCmd, ['run', 'build:web'], { cwd: appRoot });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (err) => resolve({ ok: false, error: err.message, errorDetail: err.stack || err.message }));
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ ok: true });
                return;
            }
            const combined = [stdout, stderr].filter(Boolean).join('\n');
            const tail = (stderr || stdout).split('\n').slice(-6).join('\n').trim();
            resolve({
                ok: false,
                error: tail || `build:web exited with code ${code}`,
                errorDetail: combined || tail || `build:web exited with code ${code}`
            });
        });
    });
};

const getWebRoot = () => {
    if (app.isPackaged) {
        return app.getAppPath();
    }
    const candidates = [
        process.cwd(),
        path.resolve(__dirname, '../../../'),
        path.resolve(__dirname, '../../'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return candidate;
        }
    }
    return process.cwd();
};

// ─── Handler options ───────────────────────────────────────────────────────────

export interface GithubHandlerOptions {
    store: any;
    getWindow: () => BrowserWindow | null;
}

// ─── Handler registration ──────────────────────────────────────────────────────

export function registerGithubHandlers(opts: GithubHandlerOptions) {
    const { store, getWindow } = opts;

    const sendGithubAuthResult = (payload: { success: boolean; token?: string; error?: string }) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('github-auth-complete', payload);
        }
    };

    const sendWebUploadStatus = (stage: string, message?: string, progress?: number) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('web-upload-status', { stage, message, progress });
        }
    };

    const getStoredPagesPath = () => normalizePagesPath(store.get('githubPagesSourcePath', '') as string);

    const resolvePagesSource = async (owner: string, repo: string, branch: string, token: string) => {
        const pagesInfo = await ensureGithubPages(owner, repo, branch, token);
        const pagesPath = normalizePagesPath(pagesInfo?.source?.path);
        store.set('githubPagesSourcePath', pagesPath);
        return { pagesInfo, pagesPath };
    };

    const resolveEffectivePagesPath = async (
        effectiveOwner: string,
        effectiveRepo: string,
        effectiveBranch: string,
        token: string,
        isOverride: boolean
    ): Promise<string> => {
        if (!isOverride) {
            const stored = getStoredPagesPath();
            if (stored) return stored;
            try {
                const resolved = await resolvePagesSource(effectiveOwner, effectiveRepo, effectiveBranch, token);
                return resolved.pagesPath;
            } catch {
                return '';
            }
        }
        try {
            const pagesInfo = await ensureGithubPages(effectiveOwner, effectiveRepo, effectiveBranch, token);
            return normalizePagesPath(pagesInfo?.source?.path);
        } catch {
            return '';
        }
    };

    ipcMain.handle('get-github-repos', async () => {
        try {
            const token = store.get('githubToken') as string | undefined;
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            const repos = await listGithubRepos(token);
            return { success: true, repos };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load repos.' };
        }
    });

    ipcMain.handle('get-github-orgs', async () => {
        try {
            const token = store.get('githubToken') as string | undefined;
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            const orgs = await listGithubOrganizations(token);
            return { success: true, orgs };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load organizations.' };
        }
    });

    ipcMain.handle('get-github-reports', async (_event, payload?: { owner?: string; repo?: string; branch?: string }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const isOverride = !!(payload?.owner && payload?.repo);
            const owner = (isOverride ? payload!.owner! : store.get('githubRepoOwner') as string | undefined);
            const repo = (isOverride ? payload!.repo! : store.get('githubRepoName') as string | undefined);
            const branch = payload?.branch || (store.get('githubBranch') as string | undefined) || 'main';
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            if (!owner || !repo) {
                return { success: false, error: 'Repository not configured.' };
            }
            const pagesPath = await resolveEffectivePagesPath(owner, repo, branch, token, isOverride);
            const indexPath = withPagesPath(pagesPath, 'reports/index.json');
            const existing = await getGithubFile(owner, repo, indexPath, branch, token);
            if (!existing?.content) {
                return { success: true, reports: [] };
            }
            const decoded = Buffer.from(existing.content, 'base64').toString('utf8');
            const parsed = JSON.parse(decoded);
            const reports = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : []);
            return { success: true, reports };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load reports.' };
        }
    });

    ipcMain.handle('get-github-report-detail', async (_event, payload: {
        reportId: string;
        owner?: string;
        repo?: string;
        branch?: string;
    }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const reportId = payload?.reportId;
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            if (!reportId) {
                return { success: false, error: 'No report ID provided.' };
            }
            const isOverride = !!(payload?.owner && payload?.repo);
            const owner = isOverride ? payload.owner! : (store.get('githubRepoOwner') as string | undefined);
            const repo = isOverride ? payload.repo! : (store.get('githubRepoName') as string | undefined);
            const branch = payload?.branch || (store.get('githubBranch') as string | undefined) || 'main';
            if (!owner || !repo) {
                return { success: false, error: 'Repository not configured.' };
            }
            const pagesPath = await resolveEffectivePagesPath(owner, repo, branch, token, isOverride);
            const filePath = withPagesPath(pagesPath, `reports/${reportId}/report.json`);
            const file = await getGithubFile(owner, repo, filePath, branch, token);
            if (!file) {
                return { success: false, error: 'Report not found.' };
            }
            let reportJson: string;
            if (file.content) {
                // File within 1MB Contents API limit — base64 encoded
                reportJson = Buffer.from(file.content, 'base64').toString('utf8');
            } else if (file.download_url) {
                // File exceeds 1MB — fetch raw content via download_url
                const rawResp = await new Promise<string>((resolve, reject) => {
                    const url = new URL(file.download_url);
                    https.get(
                        { hostname: url.hostname, path: url.pathname + url.search, headers: { 'User-Agent': 'AxiBridge' } },
                        (res) => {
                            if (res.statusCode === 301 || res.statusCode === 302) {
                                const redirect = res.headers.location;
                                if (!redirect) return reject(new Error('Redirect with no location'));
                                const rUrl = new URL(redirect);
                                https.get(
                                    { hostname: rUrl.hostname, path: rUrl.pathname + rUrl.search, headers: { 'User-Agent': 'AxiBridge' } },
                                    (rRes) => {
                                        let d = '';
                                        rRes.setEncoding('utf8');
                                        rRes.on('data', (c) => (d += c));
                                        rRes.on('end', () => resolve(d));
                                    }
                                ).on('error', reject);
                                return;
                            }
                            let d = '';
                            res.setEncoding('utf8');
                            res.on('data', (c) => (d += c));
                            res.on('end', () => resolve(d));
                        }
                    ).on('error', reject);
                });
                reportJson = rawResp;
            } else {
                return { success: false, error: 'Report not found.' };
            }
            const report = JSON.parse(reportJson);
            return { success: true, report };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load report.' };
        }
    });

    ipcMain.handle('delete-github-reports', async (_event, payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const isOverride = !!(payload?.owner && payload?.repo);
            const owner = (isOverride ? payload.owner! : store.get('githubRepoOwner') as string | undefined);
            const repo = (isOverride ? payload.repo! : store.get('githubRepoName') as string | undefined);
            const branch = payload?.branch || (store.get('githubBranch') as string | undefined) || 'main';
            const ids = payload?.ids?.filter(Boolean) || [];
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            if (!owner || !repo) {
                return { success: false, error: 'Repository not configured.' };
            }
            if (ids.length === 0) {
                return { success: false, error: 'No reports selected.' };
            }
            const pagesPath = await resolveEffectivePagesPath(owner, repo, branch, token, isOverride);
            const pagesPrefix = pagesPath ? `${pagesPath}/` : '';

            const headRef = await getGithubRef(owner, repo, branch, token);
            const headSha = headRef?.object?.sha;
            if (!headSha) {
                throw new Error('Unable to resolve repository branch head.');
            }
            const headCommit = await getGithubCommit(owner, repo, headSha, token);
            const baseTreeSha = headCommit?.tree?.sha;
            if (!baseTreeSha) {
                throw new Error('Unable to resolve repository tree.');
            }
            const treeData = await getGithubTree(owner, repo, baseTreeSha, token);
            const treeEntries = Array.isArray(treeData?.tree) ? treeData.tree : [];
            const deleteEntries: Array<{ path: string; sha: string | null }> = [];
            treeEntries.forEach((entry: any) => {
                if (!entry?.path || entry?.type !== 'blob') return;
                for (const id of ids) {
                    if (entry.path.startsWith(`${pagesPrefix}reports/${id}/`)) {
                        deleteEntries.push({ path: entry.path, sha: null });
                        break;
                    }
                }
            });

            let existingEntries: any[] = [];
            let existingIndexSiteTheme: any = null;
            try {
                const existing = await getGithubFile(owner, repo, withPagesPath(pagesPath, 'reports/index.json'), branch, token);
                if (existing?.content) {
                    const decoded = Buffer.from(existing.content, 'base64').toString('utf8');
                    const parsed = JSON.parse(decoded);
                    existingEntries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : []);
                    existingIndexSiteTheme = Array.isArray(parsed) ? null : (parsed?.siteTheme || null);
                }
            } catch {
                existingEntries = [];
            }
            const filteredEntries = ids.length > 0
                ? existingEntries.filter((entry: any) => !ids.includes(entry?.id))
                : existingEntries;
            const deletedIndexPayload = existingIndexSiteTheme
                ? { siteTheme: existingIndexSiteTheme, entries: filteredEntries }
                : filteredEntries;
            const indexContent = Buffer.from(JSON.stringify(deletedIndexPayload, null, 2)).toString('base64');
            const indexBlob = await createGithubBlob(owner, repo, token, indexContent, withPagesPath(pagesPath, 'reports/index.json'));

            const commitEntries = [
                ...deleteEntries,
                { path: withPagesPath(pagesPath, 'reports/index.json'), sha: indexBlob.sha }
            ];

            // Keep the precomputed rollup consistent: drop sources for deleted reports.
            try {
                const rollupRepoPath = withPagesPath(pagesPath, 'reports/rollup.json');
                const rollupEntry = treeEntries.find(
                    (entry: any) => entry?.path === rollupRepoPath && entry?.type === 'blob' && entry?.sha
                );
                if (rollupEntry) {
                    const blob = await getGithubBlob(owner, repo, rollupEntry.sha, token);
                    const parsed = blob?.content
                        ? parseRollupSourcesFile(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')))
                        : null;
                    if (parsed) {
                        const rollupFile = removeRollupSources(parsed, ids);
                        const rollupBlob = await createGithubBlob(
                            owner,
                            repo,
                            token,
                            Buffer.from(JSON.stringify(rollupFile), 'utf8').toString('base64'),
                            rollupRepoPath
                        );
                        commitEntries.push({ path: rollupRepoPath, sha: rollupBlob.sha });
                    }
                }
            } catch (err) {
                log.warn('[Main] Failed to update rollup.json after delete (non-blocking):', err);
            }

            // Keep the attendance history consistent: drop raids for deleted reports.
            try {
                const attendanceRepoPath = withPagesPath(pagesPath, 'reports/attendance.json');
                const attendanceEntry = treeEntries.find(
                    (entry: any) => entry?.path === attendanceRepoPath && entry?.type === 'blob' && entry?.sha
                );
                if (attendanceEntry) {
                    const blob = await getGithubBlob(owner, repo, attendanceEntry.sha, token);
                    const parsed = blob?.content
                        ? parseAttendanceFile(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')))
                        : null;
                    if (parsed) {
                        const deletedSet = new Set(ids.map((id: any) => String(id || '').trim()));
                        const keptRaids = parsed.raids.filter((r) => !deletedSet.has(String(r.id).trim()));
                        const attendanceBlob = await createGithubBlob(
                            owner,
                            repo,
                            token,
                            Buffer.from(JSON.stringify({ ...parsed, raids: keptRaids }), 'utf8').toString('base64'),
                            attendanceRepoPath
                        );
                        commitEntries.push({ path: attendanceRepoPath, sha: attendanceBlob.sha });
                    }
                }
            } catch (err) {
                log.warn('[Main] Failed to update attendance.json after delete (non-blocking):', err);
            }

            const newTree = await createGithubTree(owner, repo, token, baseTreeSha, commitEntries);
            const commitMessage = `Delete ${ids.length} report${ids.length === 1 ? '' : 's'}`;
            const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, headSha);
            await updateGithubRef(owner, repo, branch, token, newCommit.sha);

            // Best-effort: delete replay objects from R2 if configured
            const { uploader: r2 } = resolveR2Uploader(store);
            if (r2) {
                await Promise.allSettled(
                    ids.flatMap((id) => replayObjectKeys(id).map((key) => r2.deleteObject(key)))
                );
            }

            return { success: true, removed: ids };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to delete reports.' };
        }
    });

    ipcMain.handle('create-github-repo', async (_event, params: { name: string; branch?: string; owner?: string }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            const user = await getGithubUser(token);
            const authenticatedUser = user?.login;
            if (!authenticatedUser) {
                return { success: false, error: 'Unable to determine GitHub username.' };
            }
            const owner = params.owner?.trim() || authenticatedUser;
            const repoName = params.name?.trim();
            if (!repoName) {
                return { success: false, error: 'Repository name is required.' };
            }
            const repo = await createGithubRepo(owner, repoName, token, authenticatedUser);
            const branch = params.branch || 'main';
            const { pagesInfo, pagesPath } = await resolvePagesSource(owner, repoName, branch, token);
            const pagesUrl = pagesInfo?.html_url || `https://${owner}.github.io/${repoName}`;
            store.set('githubRepoOwner', owner);
            store.set('githubRepoName', repoName);
            store.set('githubPagesBaseUrl', pagesUrl);
            store.set('githubPagesSourcePath', pagesPath);
            return {
                success: true,
                repo: {
                    full_name: repo?.full_name || `${owner}/${repoName}`,
                    owner,
                    name: repoName,
                    pagesUrl
                }
            };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to create repository.' };
        }
    });

    ipcMain.handle('get-github-pages-build-status', async (_event, payload?: { repoFullName?: string; repoOwner?: string; repoName?: string }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const explicitOwner = typeof payload?.repoOwner === 'string' ? payload.repoOwner.trim() : '';
            const explicitRepo = typeof payload?.repoName === 'string' ? payload.repoName.trim() : '';
            const requestedRepoFullName = typeof payload?.repoFullName === 'string' ? payload.repoFullName.trim() : '';
            const requestedRepoParts = requestedRepoFullName.split('/').map((part) => part.trim()).filter(Boolean);
            const hasExplicitOverride = !!explicitOwner && !!explicitRepo;
            const hasRepoOverride = hasExplicitOverride || requestedRepoParts.length === 2;
            const owner = hasRepoOverride
                ? (hasExplicitOverride ? explicitOwner : requestedRepoParts[0])
                : (store.get('githubRepoOwner') as string | undefined);
            const repo = hasRepoOverride
                ? (hasExplicitOverride ? explicitRepo : requestedRepoParts[1])
                : (store.get('githubRepoName') as string | undefined);
            if (!owner || !repo) {
                return { success: false, error: 'Repository not configured.' };
            }
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            const build = await getGithubPagesLatestBuild(owner, repo, token);
            if (!build) {
                return { success: false, error: 'No Pages builds found.' };
            }
            return {
                success: true,
                status: build.status || 'unknown',
                updatedAt: build.updated_at || build.created_at,
                errorMessage: build.error?.message
            };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load Pages build status.' };
        }
    });

    // Cheap, synchronous-ish existence check for the renderer to gate the
    // (relatively expensive: ~300ms build + 10MB+ structured clone over IPC)
    // slice sidecar build on. Does not validate the credentials against R2 —
    // just "are all the fields present" like the upload path itself checks.
    ipcMain.handle('get-r2-configured', async () => {
        try {
            // "Configured" means "R2 will actually be used for this publish" —
            // it folds in the auth mode and the hosting toggle, because a slice
            // sidecar built for a bucket we won't write to is wasted work.
            return describeR2Status(store);
        } catch {
            return { configured: false };
        }
    });

    ipcMain.handle('ensure-github-template', async () => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const owner = store.get('githubRepoOwner') as string | undefined;
            const repo = store.get('githubRepoName') as string | undefined;
            const branch = (store.get('githubBranch') as string | undefined) || 'main';
            if (!token) {
                return { success: false, error: 'Missing GitHub token. Connect GitHub first.' };
            }
            if (!owner || !repo) {
                return { success: false, error: 'Select or create a repository in Settings first.' };
            }
            let pagesPath = getStoredPagesPath();
            try {
                const resolved = await resolvePagesSource(owner, repo, branch, token);
                pagesPath = resolved.pagesPath;
            } catch {
                pagesPath = getStoredPagesPath();
            }
            const pagesPrefix = pagesPath ? `${pagesPath}/` : '';

            const headRef = await getGithubRef(owner, repo, branch, token);
            const headSha = headRef?.object?.sha;
            if (!headSha) {
                throw new Error('Unable to resolve repository branch head.');
            }
            const headCommit = await getGithubCommit(owner, repo, headSha, token);
            const baseTreeSha = headCommit?.tree?.sha;
            if (!baseTreeSha) {
                throw new Error('Unable to resolve repository tree.');
            }
            const treeData = await getGithubTree(owner, repo, baseTreeSha, token);
            const treeEntries = Array.isArray(treeData?.tree) ? treeData.tree : [];
            const treeMap = new Map<string, string>();
            let hasIndex = false;
            let hasAssets = false;
            treeEntries.forEach((entry: any) => {
                if (entry?.path && entry?.sha && entry?.type === 'blob') {
                    treeMap.set(entry.path, entry.sha);
                    if (entry.path === `${pagesPrefix}index.html`) hasIndex = true;
                    if (entry.path.startsWith(`${pagesPrefix}assets/`)) hasAssets = true;
                }
            });

            if (hasIndex && hasAssets) {
                return { success: true, updated: false };
            }

            const appRoot = getWebRoot();
            const templateDir = path.join(appRoot, 'dist-web');
            if (app.isPackaged && !fs.existsSync(templateDir)) {
                return { success: false, error: 'Web template missing from the app build.' };
            }
            if (!app.isPackaged) {
                const built = await buildWebTemplate(appRoot);
                if (!built.ok || !fs.existsSync(templateDir)) {
                    return { success: false, error: built.error || 'Failed to generate the web template automatically.' };
                }
            }

            const pendingEntries: Array<{ path: string; contentBase64: string; blobSha: string }> = [];
            const queueFile = (repoPath: string, content: Buffer) => {
                if (content.length > MAX_GITHUB_BLOB_BYTES) {
                    throw new Error(
                        `File too large for GitHub upload: ${repoPath} (${formatBytes(content.length)}). ` +
                        `Limit is ${formatBytes(MAX_GITHUB_BLOB_BYTES)} per file.`
                    );
                }
                const blobSha = computeGitBlobSha(content);
                const existingSha = treeMap.get(repoPath);
                if (existingSha && existingSha === blobSha) return;
                pendingEntries.push({
                    path: repoPath,
                    contentBase64: content.toString('base64'),
                    blobSha
                });
            };

            ensureWebRootIndex(templateDir);
            const rootIndexBuffer = getWebRootIndexBuffer(templateDir);
            const rootFiles = collectFiles(templateDir);
            for (const file of rootFiles) {
                const rawContent = fs.readFileSync(file.absPath);
                const content = patchLegacyCustomIconUrls(file.relPath, rawContent);
                queueFile(withPagesPath(pagesPath, file.relPath), content);
            }
            if (rootIndexBuffer) {
                queueFile(withPagesPath(pagesPath, 'index.html'), rootIndexBuffer);
            }

            if (pendingEntries.length === 0) {
                return { success: true, updated: false };
            }

            const blobEntries: Array<{ path: string; sha: string }> = [];
            for (const entry of pendingEntries) {
                const blob = await createGithubBlob(owner, repo, token, entry.contentBase64, entry.path);
                blobEntries.push({ path: entry.path, sha: blob.sha });
            }

            const newTree = await createGithubTree(owner, repo, token, baseTreeSha, blobEntries);
            const commitMessage = 'Add web template';
            const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, headSha);
            await updateGithubRef(owner, repo, branch, token, newCommit.sha);

            return { success: true, updated: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to ensure web template.' };
        }
    });

    ipcMain.handle('apply-github-logo', async (_event, payload?: { logoPath?: string }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const owner = store.get('githubRepoOwner') as string | undefined;
            const repo = store.get('githubRepoName') as string | undefined;
            const branch = (store.get('githubBranch') as string | undefined) || 'main';
            const logoPath = payload?.logoPath || (store.get('githubLogoPath') as string | undefined);
            if (!token) {
                return { success: false, error: 'Missing GitHub token. Connect GitHub first.' };
            }
            if (!owner || !repo) {
                return { success: false, error: 'Select or create a repository in Settings first.' };
            }
            if (!logoPath || !fs.existsSync(logoPath)) {
                return { success: false, error: 'Logo file not found.' };
            }
            let pagesPath = getStoredPagesPath();
            try {
                const resolved = await resolvePagesSource(owner, repo, branch, token);
                pagesPath = resolved.pagesPath;
            } catch {
                pagesPath = getStoredPagesPath();
            }

            const headRef = await getGithubRef(owner, repo, branch, token);
            const headSha = headRef?.object?.sha;
            if (!headSha) {
                throw new Error('Unable to resolve repository branch head.');
            }
            const headCommit = await getGithubCommit(owner, repo, headSha, token);
            const baseTreeSha = headCommit?.tree?.sha;
            if (!baseTreeSha) {
                throw new Error('Unable to resolve repository tree.');
            }
            const treeData = await getGithubTree(owner, repo, baseTreeSha, token);
            const treeEntries = Array.isArray(treeData?.tree) ? treeData.tree : [];
            const treeMap = new Map<string, string>();
            treeEntries.forEach((entry: any) => {
                if (entry?.path && entry?.sha && entry?.type === 'blob') {
                    treeMap.set(entry.path, entry.sha);
                }
            });

            const pendingEntries: Array<{ path: string; contentBase64: string; blobSha: string }> = [];
            const queueFile = (repoPath: string, content: Buffer) => {
                if (content.length > MAX_GITHUB_BLOB_BYTES) {
                    throw new Error(
                        `File too large for GitHub upload: ${repoPath} (${formatBytes(content.length)}). ` +
                        `Limit is ${formatBytes(MAX_GITHUB_BLOB_BYTES)} per file.`
                    );
                }
                const blobSha = computeGitBlobSha(content);
                const existingSha = treeMap.get(repoPath);
                if (existingSha && existingSha === blobSha) return;
                pendingEntries.push({
                    path: repoPath,
                    contentBase64: content.toString('base64'),
                    blobSha
                });
            };

            const logoBuffer = fs.readFileSync(logoPath);
            const logoJson = Buffer.from(JSON.stringify({ path: 'logo.png', updatedAt: new Date().toISOString() }, null, 2));
            queueFile(withPagesPath(pagesPath, 'logo.png'), logoBuffer);
            queueFile(withPagesPath(pagesPath, 'logo.json'), logoJson);

            if (pendingEntries.length === 0) {
                return { success: true, updated: false };
            }

            const blobEntries: Array<{ path: string; sha: string }> = [];
            for (const entry of pendingEntries) {
                const blob = await createGithubBlob(owner, repo, token, entry.contentBase64, entry.path);
                blobEntries.push({ path: entry.path, sha: blob.sha });
            }

            const newTree = await createGithubTree(owner, repo, token, baseTreeSha, blobEntries);
            const commitMessage = 'Update logo';
            const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, headSha);
            await updateGithubRef(owner, repo, branch, token, newCommit.sha);

            return { success: true, updated: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to update logo.' };
        }
    });

    ipcMain.handle('start-github-oauth', async () => {
        const result = await requestGithubDeviceCode('repo');
        if (!result.deviceCode) {
            return { success: false, error: result.error || 'Failed to start GitHub device flow.' };
        }
        pollGithubDeviceToken(result.deviceCode, result.interval || 5)
            .then((tokenResult) => {
                if (tokenResult.token) {
                    store.set('githubToken', tokenResult.token);
                    sendGithubAuthResult({ success: true, token: tokenResult.token });
                } else {
                    sendGithubAuthResult({ success: false, error: tokenResult.error || 'Device auth failed.' });
                }
            })
            .catch((err) => {
                sendGithubAuthResult({ success: false, error: err?.message || 'Device auth failed.' });
            });
        return {
            success: true,
            userCode: result.userCode,
            verificationUri: result.verificationUri
        };
    });

    ipcMain.handle('upload-web-report', async (_event, payload: { meta: any; stats: any; repoFullName?: string; repoOwner?: string; repoName?: string; reportWebhookIds?: string[]; sliceSidecar?: any }) => {
        try {
            if (!hasWebReportContent(payload)) {
                return { success: false, error: 'Cannot upload an empty web report. Add at least one fight before publishing.' };
            }
            sendWebUploadStatus('Preparing', 'Validating settings...', 5);
            const token = store.get('githubToken') as string | undefined;
            const explicitOwner = typeof payload?.repoOwner === 'string' ? payload.repoOwner.trim() : '';
            const explicitRepo = typeof payload?.repoName === 'string' ? payload.repoName.trim() : '';
            const requestedRepoFullName = typeof payload?.repoFullName === 'string' ? payload.repoFullName.trim() : '';
            const requestedRepoParts = requestedRepoFullName.split('/').map((part) => part.trim()).filter(Boolean);
            const hasExplicitOverride = !!explicitOwner && !!explicitRepo;
            const hasRepoOverride = hasExplicitOverride || requestedRepoParts.length === 2;
            const owner = hasRepoOverride
                ? (hasExplicitOverride ? explicitOwner : requestedRepoParts[0])
                : (store.get('githubRepoOwner') as string | undefined);
            const repo = hasRepoOverride
                ? (hasExplicitOverride ? explicitRepo : requestedRepoParts[1])
                : (store.get('githubRepoName') as string | undefined);
            const branch = (store.get('githubBranch') as string | undefined) || 'main';
            let baseUrl = hasRepoOverride ? '' : ((store.get('githubPagesBaseUrl') as string | undefined) || '');
            if (!token) {
                return { success: false, error: 'Missing GitHub token. Connect GitHub first.' };
            }
            if (!owner || !repo) {
                return { success: false, error: 'Select or create a repository in Settings first.' };
            }

            sendWebUploadStatus('Preparing', `Using ${owner}/${repo}...`, 8);

            sendWebUploadStatus('Preparing', 'Ensuring Pages configuration...', 15);
            const { pagesInfo, pagesPath } = await resolvePagesSource(owner, repo, branch, token);
            if (!baseUrl && pagesInfo?.html_url) {
                baseUrl = pagesInfo.html_url;
                if (!hasRepoOverride) {
                    store.set('githubPagesBaseUrl', baseUrl);
                }
            } else if (!baseUrl) {
                baseUrl = `https://${owner}.github.io/${repo}`;
                if (!hasRepoOverride) {
                    store.set('githubPagesBaseUrl', baseUrl);
                }
            }
            if (!hasRepoOverride) {
                store.set('githubPagesSourcePath', pagesPath);
            }

            sendWebUploadStatus('Preparing', 'Checking web template...', 25);
            const appRoot = getWebRoot();
            sendWebUploadStatus('Preparing', `Using web root: ${appRoot}`, 27);
            const templateDir = path.join(appRoot, 'dist-web');
            if (app.isPackaged && !fs.existsSync(templateDir)) {
                return { success: false, error: 'Web template missing from the app build.' };
            }
            if (!app.isPackaged) {
                sendWebUploadStatus('Building', 'Generating web template...', 30);
                const built = await buildWebTemplate(appRoot);
                if (!built.ok || !fs.existsSync(templateDir)) {
                    sendWebUploadStatus('Build failed', built.error || 'Failed to generate web template.', 30);
                    return { success: false, error: built.error || 'Failed to generate the web template automatically.', errorDetail: built.errorDetail };
                }
            }

            const reportMeta = {
                ...payload.meta,
                appVersion: app.getVersion()
            };

            // Stamp the session's dominant guild (detected renderer-side) with
            // name/tag resolved via the GW2 API + permanent cache. Resolution
            // failure stamps id-only; it must never fail or block the upload.
            const detectedGuildId = typeof (reportMeta as any).guildId === 'string' ? (reportMeta as any).guildId.trim() : '';
            if (detectedGuildId) {
                const cachedDirectory = store.get('guildDirectory', {}) as Record<string, any>;
                if (!cachedDirectory[detectedGuildId]) {
                    sendWebUploadStatus('Preparing', 'Resolving guild name via GW2 API...', 12);
                }
                (reportMeta as any).guild = await resolveGuild(detectedGuildId, store as any);
            }

            const paletteValue = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const glassValue = !!store.get('glassSurfaces', false);
            const glassmorphicValue = !!store.get('glassmorphic', false);

            // R2: if configured, strip replayFights from the main payload and upload separately.
            const { uploader: r2, missingFields: r2MissingFields, partiallyConfigured } = resolveR2Uploader(store);
            // One uploader, two independently switchable artifacts.
            const r2ForReplay = isR2ReplayEnabled(store) ? r2 : null;
            const r2ForSlice = isR2SliceEnabled(store) ? r2 : null;
            if (partiallyConfigured) {
                // Partially configured: the user believes R2 is on, so say why it isn't.
                sendWebUploadStatus(
                    'Warning',
                    `R2 is partially configured (missing: ${r2MissingFields.join(', ')}) — replay data will be hosted on GitHub Pages instead.`,
                    37
                );
            }
            if (r2) {
                // Ensure CORS is set so the web viewer can fetch replay.json from the browser.
                const pagesBaseUrl = (store.get('githubPagesBaseUrl') as string | null | undefined) || null;
                // CORS AllowedOrigin must be scheme+host only (no path). Extract the origin
                // from the full GitHub Pages URL so "https://user.github.io/repo/" → "https://user.github.io".
                const corsOrigin = pagesBaseUrl ? new URL(pagesBaseUrl).origin : '*';
                const corsResult = await r2.ensureCors(corsOrigin);
                if (!corsResult.success) {
                    const corsWarning = `[WARN] (non-blocking) R2 CORS setup failed (${corsResult.error ?? 'unknown error'}). ` +
                        `Upload will continue; the replay viewer may not load in the browser until CORS is configured. ` +
                        `Fix: in the Cloudflare R2 dashboard → your bucket → Settings → CORS, ` +
                        `add an AllowedOrigin of "${corsOrigin}" with GET method. ` +
                        `Alternatively, use an R2 API token with Admin Read & Write permissions.`;
                    sendWebUploadStatus('Warning', corsWarning, 39);
                }
            }
            let sourceStats: Record<string, any> = payload.stats || {};
            // Replay data dominates report.json size (often 2/3 of the payload), so it is
            // always split out and lazy-loaded by the viewer: uploaded to R2 when configured,
            // otherwise hosted on Pages next to report.json.
            let replayBuffer: Buffer | null = null;
            const rawReplayFights = Array.isArray(sourceStats.replayFights) ? sourceStats.replayFights : [];
            if (rawReplayFights.length > 0) {
                // Compressed for both destinations: it is what R2 stores and what
                // has to clear the Pages blob limit. The viewer inflates it.
                const prepared = prepareReplaySidecar(rawReplayFights);
                replayBuffer = prepared.buffer;
                sourceStats = { ...sourceStats };
                delete sourceStats.replayFights;
                log.info(
                    `[Main] ${rawReplayFights.length} replay fight(s) found `
                    + `(${formatBytes(prepared.rawBytes)} → ${formatBytes(replayBuffer.length)} gzipped) `
                    + `— splitting out of report.json.`
                );
            } else if (r2ForReplay) {
                log.info('[Main] R2 configured but no replay fights found in stats — skipping R2 upload. Enable Combat Replay in Parser Settings and re-process logs.');
                sendWebUploadStatus('Packaging', 'R2 configured — no replay data found (Combat Replay may be disabled in Parser Settings)', 39);
            }

            const builtReport = buildWebReportPayload(
                reportMeta,
                sourceStats,
                paletteValue,
                glassValue,
                glassmorphicValue
            );

            let replayHostedOnPages = false;
            if (replayBuffer) {
                let r2Url: string | null = null;
                if (r2ForReplay) {
                    sendWebUploadStatus('Uploading', 'Uploading replay data to R2...', 38);
                    const r2Key = `reports/${reportMeta.id}/${REPLAY_SIDECAR_FILENAME}`;
                    const r2Result = await r2ForReplay.putObject(r2Key, replayBuffer, REPLAY_SIDECAR_CONTENT_TYPE);
                    if (r2Result.success && r2Result.url) {
                        r2Url = r2Result.url;
                        log.info(`[Main] R2 replay upload succeeded: ${r2Result.url} (${formatBytes(replayBuffer.length)})`);
                    } else {
                        log.warn(`[Main] R2 replay upload failed: ${r2Result.error} — falling back to Pages-hosted replay.json.`);
                        sendWebUploadStatus('Warning', `R2 upload failed: ${r2Result.error}`, 39);
                    }
                }
                const replayPlan = planSidecarHosting({
                    kind: 'replay',
                    bytes: replayBuffer.length,
                    r2Url,
                    reportId: reportMeta.id,
                    baseUrl
                });
                if (replayPlan.warning) {
                    log.warn(`[Main] ${replayPlan.warning}`);
                    sendWebUploadStatus('Warning', replayPlan.warning, 39);
                }
                if (replayPlan.mode === 'dropped') {
                    // Publishing the report without the replay beats a hard 422 on the
                    // whole upload; the viewer simply hides the map replay.
                    delete (builtReport.payload.stats as any).replayDataUrl;
                    replayBuffer = null;
                } else {
                    replayHostedOnPages = replayPlan.mode === 'pages';
                    (builtReport.payload.stats as any).replayDataUrl = replayPlan.url;
                }
                builtReport.jsonBuffer = Buffer.from(JSON.stringify(builtReport.payload), 'utf8');
            }

            // Slice sidecar — R2 only. With no R2 the report publishes exactly as
            // it always has and the published viewer simply has no slicer.
            const sliceSidecar = (payload as any)?.sliceSidecar;
            if (sliceSidecar && Array.isArray(sliceSidecar.frames) && sliceSidecar.frames.length > 0) {
                const sliceBuffer = gzipSync(Buffer.from(JSON.stringify(sliceSidecar), 'utf8'), { level: 9 });
                let sliceR2Url: string | null = null;
                // Distinguishes "R2 is not configured" from "R2 is configured and
                // the upload failed" — the two need different advice, and telling a
                // user who has already configured R2 to go configure it sends them
                // looking in the wrong place.
                let sliceUploadFailed = false;
                if (r2ForSlice) {
                    sendWebUploadStatus('Uploading', 'Uploading fight slice data to R2...', 39);
                    const sliceKey = `reports/${reportMeta.id}/slice.json.gz`;
                    // Content-Type only, no Content-Encoding: the viewer inflates
                    // these bytes itself with DecompressionStream('gzip'), so the
                    // browser must NOT transparently inflate them first.
                    const sliceResult = await r2ForSlice.putObject(sliceKey, sliceBuffer, 'application/gzip');
                    if (sliceResult.success && sliceResult.url) {
                        sliceR2Url = sliceResult.url;
                        log.info(`[Main] R2 slice upload succeeded: ${sliceResult.url} (${formatBytes(sliceBuffer.length)})`);
                    } else {
                        sliceUploadFailed = true;
                        log.warn(`[Main] R2 slice upload failed: ${sliceResult.error} — publishing without the web slicer.`);
                    }
                }
                const slicePlan = planSidecarHosting({
                    kind: 'slice',
                    bytes: sliceBuffer.length,
                    r2Url: sliceR2Url,
                    reportId: reportMeta.id,
                    baseUrl
                });
                if (slicePlan.mode === 'r2' && slicePlan.url) {
                    (builtReport.payload.stats as any).sliceDataUrl = slicePlan.url;
                    // The viewer compares this against the sidecar's own hash and
                    // disables slicing on a mismatch rather than rendering numbers
                    // computed under different settings.
                    (builtReport.payload.stats as any).sliceSettingsHash = sliceSidecar.settingsHash;
                } else {
                    delete (builtReport.payload.stats as any).sliceDataUrl;
                    delete (builtReport.payload.stats as any).sliceSettingsHash;
                    // These two ride along ONLY so the viewer can merge frames
                    // under the publisher's settings. With no sliceDataUrl there
                    // is nothing to merge, so they are dead weight in report.json.
                    // (The renderer already strips them when R2 is unconfigured;
                    // this covers the upload-failed path, where it could not know.)
                    delete (builtReport.payload.stats as any).mvpWeights;
                    delete (builtReport.payload.stats as any).disruptionMethod;
                    const sliceWarning = sliceUploadFailed
                        ? 'Fight slice data could not be uploaded to Cloudflare R2 — publishing the report without '
                        + 'the web slicer. The report itself publishes normally; check the log for the R2 error.'
                        : slicePlan.warning;
                    if (sliceWarning) {
                        log.info(`[Main] ${sliceWarning}`);
                        sendWebUploadStatus('Packaging', sliceWarning, 39);
                    }
                }
                builtReport.jsonBuffer = Buffer.from(JSON.stringify(builtReport.payload), 'utf8');
            }

            sendWebUploadStatus('Packaging', 'Preparing report bundle...', 40);
            const stagingRoot = path.join(app.getPath('userData'), 'web-report-staging', reportMeta.id);
            fs.rmSync(stagingRoot, { recursive: true, force: true });
            fs.mkdirSync(stagingRoot, { recursive: true });
            if (replayBuffer && replayHostedOnPages) {
                // Lands in reports/<id>/replay.json.gz via the staging-dir upload below.
                fs.writeFileSync(path.join(stagingRoot, REPLAY_SIDECAR_FILENAME), replayBuffer);
            }
            if (builtReport.trimmedSections.length > 0) {
                console.warn(
                    `[Main] Web report ${reportMeta.id} trimmed for GitHub upload: ${builtReport.trimmedSections.join(', ')} ` +
                    `(${formatBytes(builtReport.jsonBuffer.length)})`
                );
            }
            fs.writeFileSync(path.join(stagingRoot, 'report.json'), builtReport.jsonBuffer);
            const redirectHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=../../?report=${reportMeta.id}" />
    <title>Redirecting...</title>
  </head>
  <body>
    <script>
      window.location.replace('../../?report=${reportMeta.id}');
    </script>
    <p>Redirecting to report...</p>
  </body>
</html>
`;
            fs.writeFileSync(path.join(stagingRoot, 'index.html'), redirectHtml);

            const reportUrl = baseUrl
                ? `${baseUrl.replace(/\/$/, '')}/?report=${reportMeta.id}`
                : `./?report=${reportMeta.id}`;
            const indexEntry = {
                id: reportMeta.id,
                title: reportMeta.title,
                commanders: reportMeta.commanders || [],
                guild: (reportMeta as any).guild ?? null,
                dateStart: reportMeta.dateStart,
                dateEnd: reportMeta.dateEnd,
                dateLabel: reportMeta.dateLabel,
                url: reportUrl,
                summary: (() => {
                    const stats = payload?.stats || {};
                    const mapData = Array.isArray(stats.mapData) ? stats.mapData : [];
                    const totalMaps = mapData.reduce((sum: number, entry: any) => sum + (entry?.value || 0), 0);
                    const borderlandsCount = mapData.reduce((sum: number, entry: any) => {
                        const name = String(entry?.name || '').toLowerCase();
                        return name.includes('borderlands') ? sum + (entry?.value || 0) : sum;
                    }, 0);
                    const borderlandsPct = totalMaps > 0 ? borderlandsCount / totalMaps : null;
                    const mapSlices = mapData.map((entry: any) => ({
                        name: entry?.name || 'Unknown',
                        value: entry?.value || 0,
                        color: entry?.color || '#94a3b8'
                    }));
                    const avgSquadSize = typeof stats.avgSquadSize === 'number' ? stats.avgSquadSize : null;
                    const avgEnemySize = typeof stats.avgEnemies === 'number' ? stats.avgEnemies : null;
                    return {
                        borderlandsPct,
                        mapSlices,
                        avgSquadSize,
                        avgEnemySize
                    };
                })()
            };

            let existingEntries: any[] = [];
            try {
                const existing = await getGithubFile(owner, repo, withPagesPath(pagesPath, 'reports/index.json'), branch, token);
                if (existing?.content) {
                    const decoded = Buffer.from(existing.content, 'base64').toString('utf8');
                    const parsed = JSON.parse(decoded);
                    // Support both old plain-array format and new object format.
                    existingEntries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : []);
                }
            } catch (err) {
                existingEntries = [];
            }

            const mergedEntries = [indexEntry, ...existingEntries.filter((entry) => entry?.id !== reportMeta.id)];
            const indexPayload = {
                colorPalette: paletteValue,
                glassSurfaces: glassValue,
                glassmorphic: glassmorphicValue,
                entries: mergedEntries
            };

            sendWebUploadStatus('Uploading', 'Preparing upload bundle...', 55);
            const headRef = await getGithubRef(owner, repo, branch, token);
            const headSha = headRef?.object?.sha;
            if (!headSha) {
                throw new Error('Unable to resolve repository branch head.');
            }
            const headCommit = await getGithubCommit(owner, repo, headSha, token);
            const baseTreeSha = headCommit?.tree?.sha;
            if (!baseTreeSha) {
                throw new Error('Unable to resolve repository tree.');
            }
            const treeData = await getGithubTree(owner, repo, baseTreeSha, token);
            const treeEntries = Array.isArray(treeData?.tree) ? treeData.tree : [];
            const treeMap = new Map<string, string>();
            let hasIndex = false;
            let hasAssets = false;
            treeEntries.forEach((entry: any) => {
                if (entry?.path && entry?.sha && entry?.type === 'blob') {
                    treeMap.set(entry.path, entry.sha);
                    if (entry.path === withPagesPath(pagesPath, 'index.html')) hasIndex = true;
                    if (entry.path.startsWith(withPagesPath(pagesPath, 'assets/'))) hasAssets = true;
                }
            });
            const needsBaseTemplate = !hasIndex || !hasAssets;

            const pendingEntries: Array<{ path: string; contentBase64: string; blobSha: string }> = [];
            const queueFile = (repoPath: string, content: Buffer) => {
                const blobSha = computeGitBlobSha(content);
                const existingSha = treeMap.get(repoPath);
                if (existingSha && existingSha === blobSha) return;
                pendingEntries.push({
                    path: repoPath,
                    contentBase64: content.toString('base64'),
                    blobSha
                });
            };

            if (needsBaseTemplate) {
                sendWebUploadStatus('Preparing', 'Restoring base web files...', 50);
            }
            ensureWebRootIndex(templateDir);
            const rootIndexBuffer = getWebRootIndexBuffer(templateDir);
            const rootFiles = collectFiles(templateDir);
            for (const file of rootFiles) {
                const repoPath = file.relPath;
                const rawContent = fs.readFileSync(file.absPath);
                const content = patchLegacyCustomIconUrls(file.relPath, rawContent);
                queueFile(withPagesPath(pagesPath, repoPath), content);
            }
            if (rootIndexBuffer) {
                queueFile(withPagesPath(pagesPath, 'index.html'), rootIndexBuffer);
            }

            const reportFiles = collectFiles(stagingRoot);
            for (const file of reportFiles) {
                const repoPath = withPagesPath(pagesPath, `reports/${reportMeta.id}/${file.relPath}`);
                const content = fs.readFileSync(file.absPath);
                queueFile(repoPath, content);
            }

            const indexBuffer = Buffer.from(JSON.stringify(indexPayload, null, 2));
            queueFile(withPagesPath(pagesPath, 'reports/index.json'), indexBuffer);

            // Maintain the precomputed rollup (reports/rollup.json) so the All Reports
            // view loads one small file instead of every report.json. Non-blocking:
            // the viewer falls back to per-report fetches when this file is stale or absent.
            try {
                const rollupRepoPath = withPagesPath(pagesPath, 'reports/rollup.json');
                let existingSources: RollupReportPayload[] = [];
                const existingRollupSha = treeMap.get(rollupRepoPath);
                if (existingRollupSha) {
                    try {
                        const blob = await getGithubBlob(owner, repo, existingRollupSha, token);
                        if (blob?.content) {
                            const parsed = parseRollupSourcesFile(
                                JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
                            );
                            if (parsed) existingSources = parsed.sources;
                        }
                    } catch (err) {
                        log.warn('[Main] Could not read existing rollup.json, rebuilding from scratch:', err);
                    }
                }
                // Backfill reports published before rollup.json existed from local staging copies.
                const stagingParent = path.join(app.getPath('userData'), 'web-report-staging');
                const loadLocalReport = (id: string): RollupReportPayload | null => {
                    const localReportPath = path.join(stagingParent, id, 'report.json');
                    if (!fs.existsSync(localReportPath)) return null;
                    try {
                        return JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
                    } catch {
                        // Unreadable local copy — the viewer fetches this report directly instead.
                        return null;
                    }
                };
                const rollupFile = updateRollupSourcesForPublish({
                    existingSources,
                    currentReport: builtReport.payload as RollupReportPayload,
                    validIds: mergedEntries.map((entry: any) => String(entry?.id || '')),
                    loadLocalReport
                });
                queueFile(rollupRepoPath, Buffer.from(JSON.stringify(rollupFile), 'utf8'));
            } catch (err) {
                log.warn('[Main] Failed to build precomputed rollup (non-blocking):', err);
            }

            // Maintain the first-class attendance history (reports/attendance.json)
            // so the roster's retention radar gets real per-raid time-series.
            // Non-blocking: a failure here must not abort the publish.
            try {
                const attendanceRepoPath = withPagesPath(pagesPath, 'reports/attendance.json');
                let existingRaids: AttendanceRaid[] = [];
                const existingAttendanceSha = treeMap.get(attendanceRepoPath);
                if (existingAttendanceSha) {
                    try {
                        const blob = await getGithubBlob(owner, repo, existingAttendanceSha, token);
                        if (blob?.content) {
                            const parsed = parseAttendanceFile(
                                JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
                            );
                            if (parsed) existingRaids = parsed.raids;
                        }
                    } catch (err) {
                        log.warn('[Main] Could not read existing attendance.json, rebuilding:', err);
                    }
                }
                // Backfill raids predating attendance.json from local staging copies,
                // so the first publish reconstructs the full history (mirrors rollup).
                const attendanceStagingParent = path.join(app.getPath('userData'), 'web-report-staging');
                const loadLocalAttendanceReport = (id: string): RollupReportPayload | null => {
                    const localReportPath = path.join(attendanceStagingParent, id, 'report.json');
                    if (!fs.existsSync(localReportPath)) return null;
                    try {
                        return JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
                    } catch {
                        return null;
                    }
                };
                const attendanceFile = updateAttendanceForPublish({
                    existingRaids,
                    currentReport: builtReport.payload as RollupReportPayload,
                    validIds: mergedEntries.map((entry: any) => String(entry?.id || '')),
                    generatedAt: new Date().toISOString(),
                    loadLocalReport: loadLocalAttendanceReport
                });
                queueFile(attendanceRepoPath, Buffer.from(JSON.stringify(attendanceFile), 'utf8'));
            } catch (err) {
                log.warn('[Main] Failed to build attendance history (non-blocking):', err);
            }

            const deleteEntries: Array<{ path: string; sha: null }> = [];
            ['theme.json', 'ui-theme.json'].forEach((legacyFile) => {
                const repoPath = withPagesPath(pagesPath, legacyFile);
                if (treeMap.has(repoPath)) {
                    deleteEntries.push({ path: repoPath, sha: null });
                }
            });
            const logoPath = store.get('githubLogoPath') as string | undefined;
            if (logoPath && fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                queueFile(withPagesPath(pagesPath, 'logo.png'), logoBuffer);
                const logoJson = Buffer.from(JSON.stringify({ path: 'logo.png', updatedAt: new Date().toISOString() }, null, 2));
                queueFile(withPagesPath(pagesPath, 'logo.json'), logoJson);
            }

            const replayDataUrl = (builtReport.payload.stats as any)?.replayDataUrl as string | undefined;

            if (pendingEntries.length === 0 && deleteEntries.length === 0) {
                sendWebUploadStatus('Complete', 'No changes to upload.', 100);
                return { success: true, url: reportUrl, replayDataUrl: replayDataUrl ?? null };
            }

            sendWebUploadStatus('Uploading', 'Uploading changes...', 75);
            const blobEntries: Array<{ path: string; sha: string }> = [];
            for (const entry of pendingEntries) {
                const blob = await createGithubBlob(owner, repo, token, entry.contentBase64, entry.path);
                blobEntries.push({ path: entry.path, sha: blob.sha });
            }
            const commitEntries: Array<{ path: string; sha: string | null }> = [...blobEntries, ...deleteEntries];

            const commitMessage = `Update web report ${reportMeta.id}`;
            const publishCommit = async (treeBaseSha: string, parentSha: string) => {
                const newTree = await createGithubTree(owner, repo, token, treeBaseSha, commitEntries);
                const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, parentSha);
                await updateGithubRef(owner, repo, branch, token, newCommit.sha);
            };

            sendWebUploadStatus('Finalizing', 'Publishing commit...', 90);
            try {
                await publishCommit(baseTreeSha, headSha);
            } catch (err: any) {
                const message = String(err?.message || '');
                const status = Number(err?.status);
                if (status !== 422 && !message.includes('(422)')) {
                    throw err;
                }
                sendWebUploadStatus('Finalizing', 'Retrying publish after concurrent update...', 92);
                const retryHeadRef = await getGithubRef(owner, repo, branch, token);
                const retryHeadSha = retryHeadRef?.object?.sha;
                if (!retryHeadSha) {
                    throw err;
                }
                const retryHeadCommit = await getGithubCommit(owner, repo, retryHeadSha, token);
                const retryBaseTreeSha = retryHeadCommit?.tree?.sha;
                if (!retryBaseTreeSha) {
                    throw err;
                }
                await publishCommit(retryBaseTreeSha, retryHeadSha);
            }

            sendWebUploadStatus('Complete', 'Web report uploaded.', 100);

            // Post the report link to configured report webhooks. Failures are
            // logged into the upload status feed but never fail the upload.
            let webhookResults: ReportWebhookPostResult[] = [];
            const rawReportWebhooks = store.get('reportWebhooks', []);
            const allReportWebhooks = Array.isArray(rawReportWebhooks) ? rawReportWebhooks as IReportWebhook[] : [];
            // The renderer sends the user's per-publish choice; absent → all enabled.
            const reportWebhooks = selectReportWebhooks(allReportWebhooks, payload.reportWebhookIds);
            if (reportWebhooks.length > 0) {
                sendWebUploadStatus('Posting', `Posting report link to ${reportWebhooks.length} Discord webhook${reportWebhooks.length === 1 ? '' : 's'}...`, 100);
                webhookResults = await postReportToWebhooks({
                    webhooks: reportWebhooks,
                    meta: reportMeta,
                    stats: payload.stats,
                    url: reportUrl,
                    onStatus: (line: string, isWarn?: boolean) => sendWebUploadStatus(isWarn ? 'Warning' : 'Posting', line, 100),
                    persistForumFlag: (id: string, isForum: boolean) => {
                        const current = store.get('reportWebhooks', []) as IReportWebhook[];
                        store.set('reportWebhooks', current.map((hook) => (hook.id === id ? { ...hook, isForum } : hook)));
                    },
                });
            }
            return { success: true, url: reportUrl, replayDataUrl: replayDataUrl ?? null, webhookResults };
        } catch (err: any) {
            const error = err?.message || 'Upload failed.';
            const errorDetail = err?.stack || String(err);
            console.error('[Main] Web upload failed:', errorDetail);
            return { success: false, error, errorDetail };
        }
    });

    ipcMain.handle('mock-web-report', async (_event, payload: { meta: any; stats: any }) => {
        if (app.isPackaged) {
            return { success: false, error: 'Mock web reports are only available in dev builds.' };
        }
        try {
            const appRoot = getWebRoot();
            const webRoot = path.join(appRoot, 'web');
            const devRoot = path.join(appRoot, 'dev');
            const webRootExists = fs.existsSync(webRoot);
            if (!webRootExists) {
                fs.mkdirSync(webRoot, { recursive: true });
            }
            const templateDir = path.join(appRoot, 'dist-web');
            // Always rebuild in dev so local mock reports include the latest web changes.
            const built = await buildWebTemplate(appRoot);
            if (!built.ok || !fs.existsSync(templateDir)) {
                return { success: false, error: built.error || 'Failed to generate the web template automatically.', errorDetail: built.errorDetail };
            }
            // Always refresh local web template so dev reports pick up latest web fixes.
            // Purge stale hashed assets first so old bundles cannot be served accidentally.
            refreshDevWebTemplate(templateDir, webRoot);
            const reportMeta = {
                ...payload.meta,
                appVersion: app.getVersion()
            };
            const localPalette = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const localGlass = !!store.get('glassSurfaces', false);
            const localGlassmorphic = !!store.get('glassmorphic', false);
            const builtReport = buildWebReportPayload(
                reportMeta,
                payload.stats || {},
                localPalette,
                localGlass,
                localGlassmorphic
            );
            const reportsRoot = path.join(webRoot, 'reports');
            const reportDir = path.join(reportsRoot, reportMeta.id);
            fs.mkdirSync(reportDir, { recursive: true });
            fs.mkdirSync(devRoot, { recursive: true });
            fs.writeFileSync(path.join(devRoot, 'report.json'), builtReport.jsonBuffer);
            fs.writeFileSync(path.join(reportDir, 'report.json'), builtReport.jsonBuffer);
            fs.rmSync(path.join(webRoot, 'theme.json'), { force: true });
            fs.rmSync(path.join(webRoot, 'ui-theme.json'), { force: true });

            const redirectHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=../../?report=${reportMeta.id}" />
    <title>Redirecting...</title>
  </head>
  <body>
    <script>
      window.location.replace('../../?report=${reportMeta.id}');
    </script>
    <p>Redirecting to report...</p>
  </body>
</html>
`;
            fs.writeFileSync(path.join(reportDir, 'index.html'), redirectHtml);

            const indexEntry = {
                id: reportMeta.id,
                title: reportMeta.title,
                commanders: reportMeta.commanders || [],
                dateStart: reportMeta.dateStart,
                dateEnd: reportMeta.dateEnd,
                dateLabel: reportMeta.dateLabel,
                url: `./?report=${reportMeta.id}`,
                summary: (() => {
                    const stats = payload?.stats || {};
                    const mapData = Array.isArray(stats.mapData) ? stats.mapData : [];
                    const totalMaps = mapData.reduce((sum: number, entry: any) => sum + (entry?.value || 0), 0);
                    const borderlandsCount = mapData.reduce((sum: number, entry: any) => {
                        const name = String(entry?.name || '').toLowerCase();
                        return name.includes('borderlands') ? sum + (entry?.value || 0) : sum;
                    }, 0);
                    const borderlandsPct = totalMaps > 0 ? borderlandsCount / totalMaps : null;
                    const mapSlices = mapData.map((entry: any) => ({
                        name: entry?.name || 'Unknown',
                        value: entry?.value || 0,
                        color: entry?.color || '#94a3b8'
                    }));
                    const avgSquadSize = typeof stats.avgSquadSize === 'number' ? stats.avgSquadSize : null;
                    const avgEnemySize = typeof stats.avgEnemies === 'number' ? stats.avgEnemies : null;
                    return {
                        borderlandsPct,
                        mapSlices,
                        avgSquadSize,
                        avgEnemySize
                    };
                })()
            };

            const indexPath = path.join(reportsRoot, 'index.json');
            let existingLocalEntries: any[] = [];
            try {
                if (fs.existsSync(indexPath)) {
                    const decoded = fs.readFileSync(indexPath, 'utf8');
                    const parsed = JSON.parse(decoded);
                    existingLocalEntries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : []);
                }
            } catch {
                existingLocalEntries = [];
            }
            const normalizedExistingEntries = existingLocalEntries.map((entry) => {
                if (!entry || typeof entry !== 'object') return entry;
                const currentUrl = typeof entry.url === 'string' ? entry.url : '';
                const normalizedUrl = currentUrl
                    .replace('./web/web/index.html?report=', './?report=')
                    .replace('./web/index.html?report=', './?report=');
                return normalizedUrl === currentUrl ? entry : { ...entry, url: normalizedUrl };
            });
            const mergedLocalEntries = [indexEntry, ...normalizedExistingEntries.filter((entry) => entry?.id !== reportMeta.id)];
            const localIndexPayload = {
                colorPalette: localPalette,
                glassSurfaces: localGlass,
                glassmorphic: localGlassmorphic,
                entries: mergedLocalEntries
            };
            fs.writeFileSync(indexPath, JSON.stringify(localIndexPayload, null, 2));

            const baseUrl = VITE_DEV_SERVER_URL.replace(/\/$/, '');
            return { success: true, url: `${baseUrl}/web/?report=${reportMeta.id}` };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to create local web report.' };
        }
    });
}
