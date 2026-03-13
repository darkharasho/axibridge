import { ipcMain, app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
    BASE_WEB_THEMES, CRT_WEB_THEME, CRT_WEB_THEME_ID,
    DARK_GLASS_WEB_THEME_ID,
    DEFAULT_WEB_THEME_ID,
    KINETIC_DARK_WEB_THEME, KINETIC_DARK_WEB_THEME_ID,
    KINETIC_SLATE_WEB_THEME, KINETIC_SLATE_WEB_THEME_ID,
    KINETIC_WEB_THEME, KINETIC_WEB_THEME_ID,
    MATTE_WEB_THEME, MATTE_WEB_THEME_ID,
    type WebTheme,
} from '../../shared/webThemes';
import {
    normalizeKineticThemeVariant,
    inferKineticThemeVariantFromThemeId,
} from './settingsHandlers';
import { MAX_GITHUB_BLOB_BYTES, MAX_GITHUB_REPORT_JSON_BYTES } from '../devDatasets';

// ─── Constants ────────────────────────────────────────────────────────────────

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
                    'User-Agent': 'ArcBridge',
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
                        'User-Agent': 'ArcBridge',
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
                    'User-Agent': 'ArcBridge',
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
        description: 'ArcBridge Reports'
    });
    if (resp.status >= 300) {
        const detail = resp.data?.message || 'Unknown error';
        throw new Error(`GitHub API error (${resp.status}) creating repo: ${detail}`);
    }
    return resp.data;
};

const ensureGithubPages = async (owner: string, repo: string, branch: string, token: string) => {
    const pagesResp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/pages`, token);
    if (pagesResp.status === 200) {
        return pagesResp.data;
    }
    if (pagesResp.status !== 404) {
        throw new Error(`GitHub API error (${pagesResp.status}) checking Pages`);
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

// ─── Theme helpers ─────────────────────────────────────────────────────────────

const normalizeUiThemeChoice = (value: unknown): 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic' | 'dark-glass' => {
    if (value === 'modern' || value === 'crt' || value === 'matte' || value === 'kinetic' || value === 'dark-glass') return value;
    return 'classic';
};

const resolveWebUiThemeChoice = (appUiTheme: unknown, selectedThemeId: unknown): 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic' | 'dark-glass' => {
    if (selectedThemeId === MATTE_WEB_THEME_ID) return 'matte';
    if (selectedThemeId === KINETIC_WEB_THEME_ID || selectedThemeId === KINETIC_DARK_WEB_THEME_ID || selectedThemeId === KINETIC_SLATE_WEB_THEME_ID) return 'kinetic';
    if (selectedThemeId === CRT_WEB_THEME_ID) return 'crt';
    return normalizeUiThemeChoice(appUiTheme);
};

const resolveWebPublishTheme = (uiTheme: string, requestedThemeId: string): { selectedTheme: WebTheme; uiThemeValue: 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic' | 'dark-glass' } => {
    const availableThemes = uiTheme === 'crt'
        ? [CRT_WEB_THEME]
        : [...BASE_WEB_THEMES, MATTE_WEB_THEME, KINETIC_WEB_THEME, KINETIC_DARK_WEB_THEME, KINETIC_SLATE_WEB_THEME];
    const themeId = uiTheme === 'crt'
        ? CRT_WEB_THEME_ID
        : uiTheme === 'matte'
            ? MATTE_WEB_THEME_ID
            : uiTheme === 'dark-glass'
                ? (requestedThemeId === DEFAULT_WEB_THEME_ID ? DARK_GLASS_WEB_THEME_ID : requestedThemeId)
                : requestedThemeId;
    const selectedTheme = availableThemes.find((theme) => theme.id === themeId) || availableThemes[0];
    const uiThemeValue = resolveWebUiThemeChoice(uiTheme, selectedTheme?.id);
    return { selectedTheme, uiThemeValue };
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

const buildWebReportPayload = (
    reportMeta: any,
    sourceStats: any,
    uiThemeValue: 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic' | 'dark-glass',
    webThemeId: string,
    kineticThemeVariant?: 'light' | 'midnight' | 'slate'
) => {
    const payload = {
        meta: { ...(reportMeta || {}) },
        stats: {
            ...(sourceStats || {}),
            reportTheme: {
                ui: uiThemeValue,
                paletteId: webThemeId,
                ...(uiThemeValue === 'kinetic' ? { variant: normalizeKineticThemeVariant(kineticThemeVariant) } : {})
            },
            uiTheme: uiThemeValue,
            webThemeId
        } as Record<string, any>
    };

    const serialize = () => Buffer.from(JSON.stringify(payload), 'utf8');
    let jsonBuffer = serialize();
    if (jsonBuffer.length <= MAX_GITHUB_REPORT_JSON_BYTES) {
        return { payload, jsonBuffer, trimmedSections: [] as string[] };
    }

    const stats = payload.stats as Record<string, any>;
    const trimmedSections: string[] = [];
    const clearArray = (target: any, key: string) => {
        if (!target || typeof target !== 'object' || !Array.isArray(target[key]) || target[key].length === 0) {
            return false;
        }
        target[key] = [];
        return true;
    };

    const trimSteps: Array<{ label: string; apply: () => boolean }> = [
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
        { label: 'squadCompByFight', apply: () => clearArray(stats, 'squadCompByFight') }
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
    <link rel="icon" type="image/png" href="/img/ArcBridgeGradient.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ArcBridge</title>
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

    const sendGithubThemeStatus = (stage: string, message?: string, progress?: number) => {
        const win = getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('github-theme-status', { stage, message, progress });
        }
    };

    const getStoredPagesPath = () => normalizePagesPath(store.get('githubPagesSourcePath', '') as string);

    const resolvePagesSource = async (owner: string, repo: string, branch: string, token: string) => {
        const pagesInfo = await ensureGithubPages(owner, repo, branch, token);
        const pagesPath = normalizePagesPath(pagesInfo?.source?.path);
        store.set('githubPagesSourcePath', pagesPath);
        return { pagesInfo, pagesPath };
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

    ipcMain.handle('get-github-reports', async () => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const owner = store.get('githubRepoOwner') as string | undefined;
            const repo = store.get('githubRepoName') as string | undefined;
            const branch = (store.get('githubBranch') as string | undefined) || 'main';
            if (!token) {
                return { success: false, error: 'GitHub not connected.' };
            }
            if (!owner || !repo) {
                return { success: false, error: 'Repository not configured.' };
            }
            let pagesPath = getStoredPagesPath();
            if (!pagesPath) {
                try {
                    const resolved = await resolvePagesSource(owner, repo, branch, token);
                    pagesPath = resolved.pagesPath;
                } catch {
                    pagesPath = '';
                }
            }
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

    ipcMain.handle('delete-github-reports', async (_event, payload: { ids: string[] }) => {
        try {
            const token = store.get('githubToken') as string | undefined;
            const owner = store.get('githubRepoOwner') as string | undefined;
            const repo = store.get('githubRepoName') as string | undefined;
            const branch = (store.get('githubBranch') as string | undefined) || 'main';
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
            let pagesPath = getStoredPagesPath();
            if (!pagesPath) {
                try {
                    const resolved = await resolvePagesSource(owner, repo, branch, token);
                    pagesPath = resolved.pagesPath;
                } catch {
                    pagesPath = '';
                }
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

            const newTree = await createGithubTree(owner, repo, token, baseTreeSha, commitEntries);
            const commitMessage = `Delete ${ids.length} report${ids.length === 1 ? '' : 's'}`;
            const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, headSha);
            await updateGithubRef(owner, repo, branch, token, newCommit.sha);

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

    ipcMain.handle('apply-github-theme', async (_event, _payload?: { themeId?: string }) => {
        try {
            sendGithubThemeStatus('Preparing', 'Updating site theme. This can take a minute...', 5);
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

            sendGithubThemeStatus('Preparing', 'Removing legacy site theme files...', 25);
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

            const deleteEntries: Array<{ path: string; sha: null }> = [];
            ['theme.json', 'ui-theme.json'].forEach((legacyFile) => {
                const repoPath = withPagesPath(pagesPath, legacyFile);
                if (treeMap.has(repoPath)) {
                    deleteEntries.push({ path: repoPath, sha: null });
                }
            });

            // Push the stable per-theme CSS files so all reports (including old ones)
            // get the latest styling without requiring a new report to be published.
            const THEME_CSS_FILES = ['classic.css', 'modern.css', 'crt.css', 'matte.css', 'kinetic.css'];
            const themeDir = path.join(getWebRoot(), 'dist-web', 'web-report-themes');
            const cssUploadEntries: Array<{ path: string; contentBase64: string }> = [];
            if (fs.existsSync(themeDir)) {
                for (const cssFile of THEME_CSS_FILES) {
                    const absPath = path.join(themeDir, cssFile);
                    if (!fs.existsSync(absPath)) continue;
                    const content = fs.readFileSync(absPath);
                    const blobSha = computeGitBlobSha(content);
                    const repoPath = withPagesPath(pagesPath, `web-report-themes/${cssFile}`);
                    if (treeMap.get(repoPath) !== blobSha) {
                        cssUploadEntries.push({ path: repoPath, contentBase64: content.toString('base64') });
                    }
                }
            }

            if (deleteEntries.length === 0 && cssUploadEntries.length === 0) {
                sendGithubThemeStatus('Complete', 'Site is up to date. Legacy files removed, theme stylesheets are current.', 100);
                return { success: true };
            }

            sendGithubThemeStatus('Uploading', `Updating ${cssUploadEntries.length > 0 ? 'theme stylesheets' : 'legacy file cleanup'}...`, 55);
            const cssBlobEntries: Array<{ path: string; sha: string }> = [];
            for (const entry of cssUploadEntries) {
                const blob = await createGithubBlob(owner, repo, token, entry.contentBase64, entry.path);
                cssBlobEntries.push({ path: entry.path, sha: blob.sha });
            }

            const allTreeEntries: Array<{ path: string; sha: string | null }> = [
                ...deleteEntries,
                ...cssBlobEntries
            ];
            const commitParts: string[] = [];
            if (deleteEntries.length > 0) commitParts.push('remove legacy web theme defaults');
            if (cssBlobEntries.length > 0) commitParts.push('update web report theme stylesheets');
            const commitMessage = commitParts.join(', ');

            sendGithubThemeStatus('Finalizing', 'Publishing theme commit...', 90);
            const newTree = await createGithubTree(owner, repo, token, baseTreeSha, allTreeEntries);
            const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, headSha);
            await updateGithubRef(owner, repo, branch, token, newCommit.sha);

            sendGithubThemeStatus('Committed', 'Theme update committed. Waiting for Pages build...', 100);
            return { success: true };
        } catch (err: any) {
            sendGithubThemeStatus('Error', err?.message || 'Theme update failed.', 100);
            return { success: false, error: err?.message || 'Theme update failed.' };
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

    ipcMain.handle('upload-web-report', async (_event, payload: { meta: any; stats: any; repoFullName?: string; repoOwner?: string; repoName?: string }) => {
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
            const uiTheme = store.get('uiTheme', 'classic') as string;
            const requestedThemeId = (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string) || DEFAULT_WEB_THEME_ID;
            const { selectedTheme, uiThemeValue } = resolveWebPublishTheme(uiTheme, requestedThemeId);
            const kineticThemeVariant = normalizeKineticThemeVariant(store.get('kineticThemeVariant', inferKineticThemeVariantFromThemeId(selectedTheme?.id || DEFAULT_WEB_THEME_ID)));
            const builtReport = buildWebReportPayload(
                reportMeta,
                payload.stats || {},
                uiThemeValue,
                selectedTheme?.id || DEFAULT_WEB_THEME_ID,
                kineticThemeVariant
            );

            sendWebUploadStatus('Packaging', 'Preparing report bundle...', 40);
            const stagingRoot = path.join(app.getPath('userData'), 'web-report-staging', reportMeta.id);
            fs.rmSync(stagingRoot, { recursive: true, force: true });
            fs.mkdirSync(stagingRoot, { recursive: true });
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
            const kineticFont = (store.get('kineticFontStyle', 'default') as string) === 'original' ? 'original' : 'default';
            const kineticVariant = normalizeKineticThemeVariant(store.get('kineticThemeVariant', inferKineticThemeVariantFromThemeId(selectedTheme?.id || DEFAULT_WEB_THEME_ID)));
            const indexPayload = {
                siteTheme: { ui: uiThemeValue, paletteId: selectedTheme?.id || DEFAULT_WEB_THEME_ID, kineticFont, ...(uiThemeValue === 'kinetic' ? { kineticVariant } : {}) },
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

            if (pendingEntries.length === 0 && deleteEntries.length === 0) {
                sendWebUploadStatus('Complete', 'No changes to upload.', 100);
                return { success: true, url: reportUrl };
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
            return { success: true, url: reportUrl };
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
            const uiTheme = store.get('uiTheme', 'classic') as string;
            const requestedThemeId = (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string) || DEFAULT_WEB_THEME_ID;
            const { selectedTheme, uiThemeValue } = resolveWebPublishTheme(uiTheme, requestedThemeId);
            const localKineticVariant = normalizeKineticThemeVariant(store.get('kineticThemeVariant', inferKineticThemeVariantFromThemeId(selectedTheme?.id || DEFAULT_WEB_THEME_ID)));
            const builtReport = buildWebReportPayload(
                reportMeta,
                payload.stats || {},
                uiThemeValue,
                selectedTheme?.id || DEFAULT_WEB_THEME_ID,
                localKineticVariant
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
            const localKineticFont = (store.get('kineticFontStyle', 'default') as string) === 'original' ? 'original' : 'default';
            const localIndexPayload = {
                siteTheme: { ui: uiThemeValue, paletteId: selectedTheme?.id || DEFAULT_WEB_THEME_ID, kineticFont: localKineticFont, ...(uiThemeValue === 'kinetic' ? { kineticVariant: localKineticVariant } : {}) },
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
