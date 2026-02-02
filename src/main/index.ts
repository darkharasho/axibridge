import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import fs from 'fs'
import path from 'node:path'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { DEFAULT_WEB_THEME_ID, WEB_THEMES } from '../shared/webThemes';
import { computeOutgoingConditions } from '../shared/conditionsMetrics';
import { DEFAULT_DISRUPTION_METHOD, DisruptionMethod } from '../shared/metricsSettings';
import { LogWatcher } from './watcher'
import { Uploader, UploadResult } from './uploader'
import { DiscordNotifier } from './discord';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { DesktopIntegrator } from './integration';

// Handle EPIPE errors gracefully - these occur when stdout/stderr pipes close
// (e.g., when running as AppImage without a terminal)
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return; // Silently ignore EPIPE errors
    throw err;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return; // Silently ignore EPIPE errors
    throw err;
});

// Configure autoUpdater logger
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Hook console logging to send to renderer
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

if (!app.isPackaged) {
    const devUserDataDir = path.join(app.getPath('appData'), 'ArcBridge-Dev');
    app.setPath('userData', devUserDataDir);
}

function formatLogArgs(args: any[]) {
    return args.map(arg => {
        if (arg instanceof Error) {
            return arg.stack || arg.message;
        }
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

console.log = (...args) => {
    originalConsoleLog(...args);
    if (win && !win.isDestroyed()) {
        win.webContents.send('console-log', { type: 'info', message: formatLogArgs(args), timestamp: new Date().toISOString() });
    }
};

console.error = (...args) => {
    originalConsoleError(...args);
    if (win && !win.isDestroyed()) {
        win.webContents.send('console-log', { type: 'error', message: formatLogArgs(args), timestamp: new Date().toISOString() });
    }
};

const Store = require('electron-store');
const store = new Store();

type DpsReportCacheEntry = {
    hash: string;
    createdAt: number;
    result: UploadResult;
    detailsPath?: string | null;
};

const DPS_REPORT_CACHE_KEY = 'dpsReportCacheIndex';
const DPS_REPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DPS_REPORT_CACHE_MAX_ENTRIES = 100;

const getDpsReportCacheDir = () => path.join(app.getPath('userData'), 'dps-report-cache');

const loadDpsReportCacheIndex = (): Record<string, DpsReportCacheEntry> => {
    const raw = store.get(DPS_REPORT_CACHE_KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, DpsReportCacheEntry>;
};

const saveDpsReportCacheIndex = (index: Record<string, DpsReportCacheEntry>) => {
    store.set(DPS_REPORT_CACHE_KEY, index);
};

const clearDpsReportCache = () => {
    const index = loadDpsReportCacheIndex();
    const clearedEntries = Object.keys(index).length;
    store.delete(DPS_REPORT_CACHE_KEY);

    const cacheDir = getDpsReportCacheDir();
    try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch (err: any) {
        console.warn('[Main] Failed to remove dps.report cache directory:', err?.message || err);
        return { success: false, clearedEntries, error: 'Failed to remove cache directory.' };
    }

    return { success: true, clearedEntries };
};

const removeDpsReportCacheEntry = (index: Record<string, DpsReportCacheEntry>, key: string) => {
    const entry = index[key];
    if (entry?.detailsPath) {
        try {
            fs.unlinkSync(entry.detailsPath);
        } catch {
            // Ignore cache cleanup errors.
        }
    }
    delete index[key];
};

const pruneDpsReportCacheIndex = (index: Record<string, DpsReportCacheEntry>) => {
    const now = Date.now();
    let changed = false;

    Object.keys(index).forEach((key) => {
        const entry = index[key];
        if (!entry || typeof entry.createdAt !== 'number' || !entry.result?.permalink) {
            console.log(`[Cache] Removing invalid cache entry for ${key}.`);
            removeDpsReportCacheEntry(index, key);
            changed = true;
            return;
        }
        if (now - entry.createdAt > DPS_REPORT_CACHE_TTL_MS) {
            console.log(`[Cache] Busting cache for ${key} (expired).`);
            removeDpsReportCacheEntry(index, key);
            changed = true;
            return;
        }
        if (entry.detailsPath && !fs.existsSync(entry.detailsPath)) {
            console.log(`[Cache] Cache details missing for ${key}; will refetch JSON.`);
            entry.detailsPath = null;
            changed = true;
        }
    });

    const keys = Object.keys(index);
    if (keys.length > DPS_REPORT_CACHE_MAX_ENTRIES) {
        const sorted = keys.sort((a, b) => (index[b]?.createdAt || 0) - (index[a]?.createdAt || 0));
        sorted.slice(DPS_REPORT_CACHE_MAX_ENTRIES).forEach((key) => {
            console.log(`[Cache] Evicting cache entry for ${key} (limit ${DPS_REPORT_CACHE_MAX_ENTRIES}).`);
            removeDpsReportCacheEntry(index, key);
            changed = true;
        });
    }

    return changed;
};

const computeFileHash = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
};

const attachConditionMetrics = (details: any) => {
    if (!details || details.conditionMetrics) return details;
    const players = Array.isArray(details.players) ? details.players : [];
    const targets = Array.isArray(details.targets) ? details.targets : [];
    if (!players.length || !targets.length) return details;
    try {
        details.conditionMetrics = computeOutgoingConditions({
            players,
            targets,
            skillMap: details.skillMap,
            buffMap: details.buffMap
        });
    } catch (err: any) {
        console.warn('[Main] Condition metrics failed:', err?.message || err);
    }
    return details;
};

const loadDpsReportCacheEntry = async (hash: string) => {
    const index = loadDpsReportCacheIndex();
    const changed = pruneDpsReportCacheIndex(index);
    if (changed) saveDpsReportCacheIndex(index);

    const entry = index[hash];
    if (!entry) return null;

    let jsonDetails: any | null = null;
    if (entry.detailsPath) {
        try {
            const raw = await fs.promises.readFile(entry.detailsPath, 'utf8');
            jsonDetails = JSON.parse(raw);
        } catch {
            jsonDetails = null;
        }
    }

    return { entry, jsonDetails };
};

const saveDpsReportCacheEntry = async (hash: string, result: UploadResult, jsonDetails: any | null) => {
    const cacheDir = getDpsReportCacheDir();
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch {
        // Cache directory creation failures should not block uploads.
    }

    const index = loadDpsReportCacheIndex();
    const entry: DpsReportCacheEntry = {
        hash,
        createdAt: Date.now(),
        result,
        detailsPath: null
    };

    if (jsonDetails) {
        const detailsPath = path.join(cacheDir, `${hash}.json`);
        try {
            await fs.promises.writeFile(detailsPath, JSON.stringify(jsonDetails));
            entry.detailsPath = detailsPath;
        } catch {
            entry.detailsPath = null;
        }
    }

    index[hash] = entry;
    pruneDpsReportCacheIndex(index);
    saveDpsReportCacheIndex(index);
};

const updateDpsReportCacheDetails = async (hash: string, jsonDetails: any) => {
    const cacheDir = getDpsReportCacheDir();
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch {
        return;
    }

    const index = loadDpsReportCacheIndex();
    const entry = index[hash];
    if (!entry) return;

    const detailsPath = path.join(cacheDir, `${hash}.json`);
    try {
        await fs.promises.writeFile(detailsPath, JSON.stringify(jsonDetails));
        entry.detailsPath = detailsPath;
        index[hash] = entry;
        saveDpsReportCacheIndex(index);
    } catch {
        // Ignore cache write errors.
    }
};

process.env.DIST = path.join(__dirname, '../../')
process.env.VITE_PUBLIC = app.isPackaged ? path.join(process.env.DIST, 'dist-react') : path.join(process.env.DIST, 'public')

let win: BrowserWindow | null
let tray: Tray | null = null
let isQuitting = false
let watcher: LogWatcher | null = null
let uploader: Uploader | null = null
let discord: DiscordNotifier | null = null
const pendingDiscordLogs = new Map<string, { result: any, jsonDetails: any }>();
const GITHUB_PROTOCOL = 'arcbridge';
const GITHUB_DEVICE_CLIENT_ID = process.env.GITHUB_DEVICE_CLIENT_ID || 'Ov23liFh1ih9LAcnLACw';

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';

const processLogFile = async (filePath: string) => {
    const fileId = path.basename(filePath);
    win?.webContents.send('upload-status', { id: fileId, filePath, status: 'uploading' });

    try {
        if (!uploader) {
            throw new Error('Uploader not initialized.');
        }
        let cacheKey: string | null = null;
        try {
            cacheKey = await computeFileHash(filePath);
        } catch (hashError: any) {
            console.warn('[Main] Failed to compute log hash for cache:', hashError?.message || hashError);
        }

        let cached = null as null | { entry: DpsReportCacheEntry; jsonDetails: any | null };
        if (cacheKey) {
            cached = await loadDpsReportCacheEntry(cacheKey);
            if (!cached) {
                console.log(`[Cache] Miss for ${filePath}.`);
            }
        }

        const result = cached?.entry?.result || await uploader.upload(filePath);

        if (result && !result.error) {
            if (cached?.entry?.result) {
                console.log(`[Main] Cache hit for ${filePath}. Using cached dps.report permalink.`);
            } else {
                console.log(`[Main] Upload successful: ${result.permalink}. Fetching details...`);
            }

            let jsonDetails = cached?.jsonDetails || await uploader.fetchDetailedJson(result.permalink);

            if (!jsonDetails || jsonDetails.error) {
                console.log('[Main] Retrying JSON fetch in 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                jsonDetails = await uploader.fetchDetailedJson(result.permalink);
            }

            const cacheableDetails = jsonDetails && !jsonDetails.error ? jsonDetails : null;
            if (cacheKey && !cached?.entry?.result) {
                await saveDpsReportCacheEntry(cacheKey, result, cacheableDetails);
            } else if (cacheKey && cached?.entry?.result && cacheableDetails && !cached?.jsonDetails) {
                await updateDpsReportCacheDetails(cacheKey, cacheableDetails);
            }

            if (jsonDetails && !jsonDetails.error) {
                jsonDetails = attachConditionMetrics(jsonDetails);
            }

            win?.webContents.send('upload-status', {
                id: fileId,
                filePath,
                status: 'discord',
                permalink: result.permalink,
                uploadTime: result.uploadTime,
                encounterDuration: result.encounterDuration,
                fightName: result.fightName
            });

            const notificationType = store.get('discordNotificationType', 'image');
            const selectedWebhookId = store.get('selectedWebhookId', null);
            const webhookUrl = store.get('discordWebhookUrl', null);
            const shouldSendDiscord = Boolean(selectedWebhookId) && typeof webhookUrl === 'string' && webhookUrl.length > 0;
            console.log(`[Main] Preparing Discord delivery. Configured type: ${notificationType}`);

            if (shouldSendDiscord) {
                try {
                    if (notificationType === 'image' || notificationType === 'image-beta') {
                        const logKey = result.id || filePath;
                        if (!logKey) {
                            console.error('[Main] Discord notification skipped: missing log identifier.');
                        } else {
                            pendingDiscordLogs.set(logKey, { result: { ...result, filePath, id: logKey }, jsonDetails });
                            win?.webContents.send('request-screenshot', { ...result, id: logKey, filePath, details: jsonDetails, mode: notificationType });
                        }
                    } else {
                        await discord?.sendLog({ ...result, filePath, mode: 'embed' }, jsonDetails);
                    }
                } catch (discordError: any) {
                    console.error('[Main] Discord notification failed:', discordError?.message || discordError);
                    // Still mark as success since upload worked, but log the Discord failure
                }
            } else {
                console.log('[Main] Discord notification skipped: no webhook selected.');
            }

            win?.webContents.send('upload-complete', {
                ...result,
                filePath,
                status: 'success',
                details: jsonDetails
            });
        } else {
            win?.webContents.send('upload-complete', { ...result, filePath, status: 'error' });
        }
    } catch (error: any) {
        console.error('[Main] Log processing failed:', error?.message || error);
        win?.webContents.send('upload-complete', {
            id: fileId,
            filePath,
            status: 'error',
            error: error?.message || 'Unknown error during processing'
        });
    }
};

const parseVersion = (value: string | null): number[] | null => {
    if (!value) return null;
    const cleaned = value.trim().replace(/^v/i, '');
    const parts = cleaned.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.some((num) => Number.isNaN(num))) {
        return null;
    }
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
};

const compareVersion = (a: number[], b: number[]) => {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
};

const migrateLegacySettings = () => {
    if (!app.isPackaged) return;
    if (store.get('bridgeSettingsMigrated')) return;

    const appData = app.getPath('appData');
    const legacyDirs = ['gw2-arc-log-uploader', 'GW2 Arc Log Uploader'];
    const legacyPaths = legacyDirs.map((dir) => path.join(appData, dir, 'config.json'));

    let legacyData: Record<string, any> | null = null;
    for (const legacyPath of legacyPaths) {
        if (!fs.existsSync(legacyPath)) continue;
        try {
            const raw = fs.readFileSync(legacyPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                legacyData = parsed;
                break;
            }
        } catch {
            // Ignore invalid legacy config.
        }
    }

    if (!legacyData) {
        store.set('bridgeSettingsMigrated', true);
        return;
    }

    const currentData = store.store || {};
    if (Object.keys(currentData).length === 0) {
        store.store = { ...legacyData, bridgeSettingsMigrated: true };
        return;
    }

    Object.entries(legacyData).forEach(([key, value]) => {
        if (currentData[key] === undefined) {
            store.set(key, value);
        }
    });
    store.set('bridgeSettingsMigrated', true);
};

const shouldRunBridgeMigration = (version: string | null) => {
    const parsed = parseVersion(version);
    if (!parsed) return false;
    return compareVersion(parsed, [1, 12, 0]) > 0;
};

const migrateLegacyInstallName = () => {
    if (!app.isPackaged || !shouldRunBridgeMigration(app.getVersion())) return;
    const legacyPrefix = 'gw2_arc_log_uploader';
    const newPrefix = 'ArcBridge';

    if (process.platform === 'linux') {
        const appImagePath = process.env.APPIMAGE;
        if (!appImagePath) return;
        const baseName = path.basename(appImagePath);
        if (!baseName.startsWith(legacyPrefix)) return;
        const newName = baseName.replace(legacyPrefix, newPrefix);
        const targetPath = path.join(path.dirname(appImagePath), newName);
        if (fs.existsSync(targetPath)) return;
        try {
            fs.copyFileSync(appImagePath, targetPath);
            fs.chmodSync(targetPath, 0o755);
            log.info(`[Bridge] Created new AppImage name: ${targetPath}`);
        } catch (err: any) {
            log.warn(`[Bridge] Failed to copy AppImage to new name: ${err?.message || err}`);
        }
        return;
    }

    if (process.platform === 'win32') {
        const portablePath = process.env.PORTABLE_EXECUTABLE;
        if (!portablePath) return;
        const baseName = path.basename(portablePath);
        if (!baseName.startsWith(legacyPrefix)) return;
        const newName = baseName.replace(legacyPrefix, newPrefix);
        const targetPath = path.join(path.dirname(portablePath), newName);
        if (fs.existsSync(targetPath)) return;
        try {
            fs.copyFileSync(portablePath, targetPath);
            log.info(`[Bridge] Created new portable name: ${targetPath}`);
        } catch (err: any) {
            log.warn(`[Bridge] Failed to copy portable exe to new name: ${err?.message || err}`);
        }
    }
};

const extractReleaseNotesRangeFromFile = (rawNotes: string, currentVersion: string, lastSeenVersion: string | null) => {
    const current = parseVersion(currentVersion);
    if (!current) return null;
    const lastSeen = parseVersion(lastSeenVersion);
    const body = rawNotes.replace(/^# Release Notes\s*/i, '').trim();
    if (!body) return null;
    const sections = body.split(/\n(?=Version v)/).map((section) => section.trim()).filter(Boolean);
    const selected = sections.filter((section) => {
        const match = section.match(/^Version v?([0-9]+\.[0-9]+\.[0-9]+)\b/);
        if (!match) return false;
        const version = parseVersion(match[1]);
        if (!version) return false;
        if (compareVersion(version, current) > 0) return false;
        if (lastSeen && compareVersion(version, lastSeen) <= 0) return false;
        return true;
    });
    if (selected.length === 0) return null;
    const sorted = selected.sort((a, b) => {
        const aMatch = a.match(/^Version v?([0-9]+\.[0-9]+\.[0-9]+)\b/);
        const bMatch = b.match(/^Version v?([0-9]+\.[0-9]+\.[0-9]+)\b/);
        const aVer = parseVersion(aMatch?.[1] || '');
        const bVer = parseVersion(bMatch?.[1] || '');
        if (!aVer || !bVer) return 0;
        return compareVersion(bVer, aVer);
    });
    return `# Release Notes\n\n${sorted.join('\n\n')}`.trim();
};

const fetchGithubReleaseNotesRange = async (currentVersion: string, lastSeenVersion: string | null): Promise<string | null> => {
    const current = parseVersion(currentVersion);
    if (!current) return null;
    const lastSeen = parseVersion(lastSeenVersion);
    const url = 'https://api.github.com/repos/darkharasho/ArcBridge/releases?per_page=100';

    return new Promise((resolve) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'ArcBridge',
                    'Accept': 'application/vnd.github+json'
                }
            },
            (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const releases = JSON.parse(data);
                        if (!Array.isArray(releases)) {
                            resolve(null);
                            return;
                        }
                        const selected = releases
                            .map((release) => {
                                const tag = String(release?.tag_name || '');
                                const version = parseVersion(tag);
                                return {
                                    tag,
                                    version,
                                    body: release?.body || ''
                                };
                            })
                            .filter((release) => {
                                if (!release.version) return false;
                                if (compareVersion(release.version, current) > 0) return false;
                                if (lastSeen && compareVersion(release.version, lastSeen) <= 0) return false;
                                return true;
                            })
                            .sort((a, b) => compareVersion(b.version!, a.version!));

                        if (selected.length === 0) {
                            resolve(null);
                            return;
                        }

                        const combined = selected
                            .map((release) => {
                                const header = `# Release Notes ${release.tag.startsWith('v') ? release.tag : `v${release.tag}`}`;
                                const body = release.body?.trim() || '';
                                if (body.toLowerCase().startsWith('# release notes')) {
                                    return body;
                                }
                                return `${header}\n\n${body}`.trim();
                            })
                            .join('\n\n---\n\n');

                        resolve(combined || null);
                    } catch (err) {
                        resolve(null);
                    }
                });
            }
        );
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
};

const sendGithubAuthResult = (payload: { success: boolean; token?: string; error?: string }) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('github-auth-complete', payload);
    }
};

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

const createGithubBlob = async (owner: string, repo: string, token: string, contentBase64: string) => {
    const resp = await githubApiRequest('POST', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/git/blobs`, token, {
        content: contentBase64,
        encoding: 'base64'
    });
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) creating blob`);
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

const putGithubFile = async (owner: string, repo: string, filePath: string, branch: string, token: string, contentBase64: string, message: string, sha?: string) => {
    const apiPath = `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/contents/${encodeGitPath(filePath)}`;
    const body: any = {
        message,
        content: contentBase64,
        branch
    };
    if (sha) body.sha = sha;
    const resp = await githubApiRequest('PUT', apiPath, token, body);
    if (resp.status >= 300) {
        const detail = resp.data?.message || 'Unknown error';
        throw new Error(`GitHub API error (${resp.status}) writing ${filePath}: ${detail}`);
    }
    return resp.data;
};

const getGithubUser = async (token: string) => {
    const resp = await githubApiRequest('GET', '/user', token);
    if (resp.status >= 300) {
        throw new Error(`GitHub API error (${resp.status}) loading user`);
    }
    return resp.data;
};

const isValidRepoName = (value: string) => /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.') && !value.endsWith('.git');

const ensureGithubRepo = async (owner: string, repo: string, token: string) => {
    if (!isValidRepoName(repo)) {
        throw new Error('Invalid repository name.');
    }
    try {
        const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`, token);
        if (resp.status === 200) return resp.data;
        if (resp.status !== 404) {
            throw new Error(`GitHub API error (${resp.status}) checking repo`);
        }
    } catch (err) {
        throw err;
    }
    const createResp = await githubApiRequest('POST', '/user/repos', token, {
        name: repo,
        private: false,
        auto_init: true,
        description: 'ArcBridge Reports'
    });
    if (createResp.status >= 300) {
        const detail = createResp.data?.message || 'Unknown error';
        throw new Error(`GitHub API error (${createResp.status}) creating repo: ${detail}`);
    }
    return createResp.data;
};

const createGithubRepo = async (owner: string, repo: string, token: string) => {
    if (!isValidRepoName(repo)) {
        throw new Error('Invalid repository name.');
    }
    const resp = await githubApiRequest('POST', '/user/repos', token, {
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

const getStoredPagesPath = () => normalizePagesPath(store.get('githubPagesSourcePath', '') as string);

const resolvePagesSource = async (owner: string, repo: string, branch: string, token: string) => {
    const pagesInfo = await ensureGithubPages(owner, repo, branch, token);
    const pagesPath = normalizePagesPath(pagesInfo?.source?.path);
    store.set('githubPagesSourcePath', pagesPath);
    return { pagesInfo, pagesPath };
};

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

const isWebTemplateReady = (webRoot: string) => {
    try {
        const indexPath = path.join(webRoot, 'index.html');
        const assetsPath = path.join(webRoot, 'assets');
        if (!fs.existsSync(indexPath)) return false;
        if (!fs.existsSync(assetsPath)) return false;
        const entries = fs.readdirSync(assetsPath);
        return entries.length > 0;
    } catch {
        return false;
    }
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

const sendWebUploadStatus = (stage: string, message?: string, progress?: number) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('web-upload-status', { stage, message, progress });
    }
};

const sendGithubThemeStatus = (stage: string, message?: string, progress?: number) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('github-theme-status', { stage, message, progress });
    }
};

const buildWebTemplate = async (appRoot: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
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
        child.on('error', (err) => resolve({ ok: false, error: err.message }));
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ ok: true });
                return;
            }
            const tail = (stderr || stdout).split('\n').slice(-6).join('\n').trim();
            resolve({ ok: false, error: tail || `build:web exited with code ${code}` });
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

function createTray() {
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'img/ArcBridgeAppIcon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                win?.show();
                win?.focus();
            }
        },
        {
            label: 'Manual Upload...',
            click: () => {
                if (win) {
                    win.show();
                    win.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('ArcBridge');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (win?.isVisible()) {
            win.hide();
        } else {
            win?.show();
            win?.focus();
        }
    });
}

function createWindow() {
    const bounds = store.get('windowBounds') as { width: number, height: number } | undefined;

    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'img/ArcBridgeAppIcon.png');
    console.log(`[Main] Loading icon from: ${iconPath}`);
    const appIcon = nativeImage.createFromPath(iconPath);

    win = new BrowserWindow({
        icon: appIcon,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
        },
        width: bounds ? bounds.width : 1200,
        height: bounds ? bounds.height : 860,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#000000',
        show: true
    })

    win.on('resize', () => {
        if (!win) return;
        const [width, height] = win.getSize();
        store.set('windowBounds', { width, height });
    });

    // Handle close event based on user preference
    win.on('close', (event) => {
        if (!isQuitting) {
            const closeBehavior = store.get('closeBehavior', 'minimize');
            if (closeBehavior === 'minimize') {
                event.preventDefault();
                win?.hide();
            } else {
                // closeBehavior === 'quit', fully quit the application
                isQuitting = true;
                app.quit();
            }
        }
    });

    watcher = new LogWatcher();
    uploader = new Uploader();
    discord = new DiscordNotifier();

    // Initialize Discord config
    const webhookUrl = store.get('discordWebhookUrl');
    if (webhookUrl && typeof webhookUrl === 'string') {
        discord.setWebhookUrl(webhookUrl);
    }

    // Initialize embed stat settings
    const embedStatSettings = store.get('embedStatSettings');
    if (embedStatSettings) {
        discord.setEmbedStatSettings(embedStatSettings as any);
    }
    const disruptionMethod = store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD) as DisruptionMethod;
    discord.setDisruptionMethod(disruptionMethod);

    // Initialize dps.report token
    const dpsReportToken = store.get('dpsReportToken');
    if (dpsReportToken && typeof dpsReportToken === 'string') {
        uploader.setUserToken(dpsReportToken);
    }

    watcher.on('log-detected', async (filePath: string) => {
        await processLogFile(filePath);
    });

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (!app.isPackaged) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'dist-react/index.html'))
    }
}

function setupAutoUpdater() {
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        win?.webContents.send('update-message', 'Checking for update...');
    });
    autoUpdater.on('update-available', (info: any) => {
        log.info('Update available.');
        win?.webContents.send('update-available', info);
    });
    autoUpdater.on('update-not-available', (info: any) => {
        log.info('Update not available.');
        win?.webContents.send('update-not-available', info);
    });
    autoUpdater.on('error', (err: any) => {
        log.error('Error in auto-updater. ' + err);
        win?.webContents.send('update-error', err);
    });
    autoUpdater.on('download-progress', (progressObj: any) => {
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
        // log.info(log_message);
        win?.webContents.send('download-progress', progressObj);
    });
    autoUpdater.on('update-downloaded', (info: any) => {
        log.info('Update downloaded');
        win?.webContents.send('update-downloaded', info);
    });
}


app.on('window-all-closed', () => {
    // Keep alive for tray
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        win?.show();
    }
})

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('open-url', (event) => {
    event.preventDefault();
});

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is already running, quit this one
    app.quit();
} else {
    // This is the first/primary instance
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        if (process.defaultApp && process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(GITHUB_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
        } else {
            app.setAsDefaultProtocolClient(GITHUB_PROTOCOL);
        }
        migrateLegacySettings();
        migrateLegacyInstallName();
        createWindow();
        createTray();

        // Desktop Integration for Linux AppImage
        if (process.platform === 'linux') {
            const integrator = new DesktopIntegrator();
            integrator.integrate().catch(err => console.error('Integration error:', err));
        }

        // Check for updates (skip for portable/zip builds without app-update.yml)
        const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
        const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE);
        const canAutoUpdate = app.isPackaged && !isPortable && fs.existsSync(updateConfigPath);
        if (canAutoUpdate) {
            setupAutoUpdater();
        } else {
            log.info('[AutoUpdater] Skipped: no app-update.yml or portable build detected.');
        }

        if (canAutoUpdate) {
            // Disable auto-download to give more control
            autoUpdater.autoDownload = true;
            autoUpdater.autoInstallOnAppQuit = true;

            if (process.platform === 'linux' && !process.env.APPIMAGE) {
                log.info('[AutoUpdater] Detected Linux non-AppImage run. Disabling auto-download to ensure detection works without download errors.');
                autoUpdater.autoDownload = false;
            }
        }

        // Check for updates after a short delay to ensure window is ready
        // Only check for updates in packaged apps (not development)
        setTimeout(async () => {
            if (!canAutoUpdate) {
                return;
            }
            // Skip auto-update in development mode
            if (!app.isPackaged) {
                log.info('[AutoUpdater] Skipping update check in development mode');
                win?.webContents.send('update-not-available', { version: app.getVersion() });
                return;
            }

            // Log the package type for debugging
            if (process.platform === 'linux') {
                if (process.env.APPIMAGE) {
                    log.info('[AutoUpdater] Running as AppImage:', process.env.APPIMAGE);
                } else {
                    log.info('[AutoUpdater] Running as installed package (deb/rpm)');
                }
            }

            try {
                log.info('[AutoUpdater] Starting update check...');
                const result = await Promise.race([
                    autoUpdater.checkForUpdates(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Update check timed out after 30s')), 30000)
                    )
                ]);
                log.info('[AutoUpdater] Update check completed:', result);
            } catch (err: any) {
                log.error('[AutoUpdater] Update check failed:', err?.message || err);
                win?.webContents.send('update-error', { message: err?.message || 'Update check failed' });
            }
        }, 3000);

        ipcMain.on('check-for-updates', async () => {
            // Skip auto-update in development mode
            if (!app.isPackaged) {
                log.info('[AutoUpdater] Manual check skipped in development mode');
                win?.webContents.send('update-not-available', { version: app.getVersion() });
                return;
            }

            try {
                await autoUpdater.checkForUpdates();
            } catch (err: any) {
                log.error('[AutoUpdater] Manual check failed:', err?.message || err);
                win?.webContents.send('update-error', { message: err?.message || 'Update check failed' });
            }
        });

        ipcMain.on('restart-app', () => {
            autoUpdater.quitAndInstall();
        });

        ipcMain.handle('get-app-version', () => {
            return app.getVersion();
        });

        ipcMain.handle('get-whats-new', async () => {
            const version = app.getVersion();
            const lastSeenVersion = store.get('lastSeenVersion', null) as string | null;
            let releaseNotes: string | null = null;
            releaseNotes = await fetchGithubReleaseNotesRange(version, lastSeenVersion);
            if (!releaseNotes) {
                const basePath = app.isPackaged ? process.resourcesPath : process.cwd();
                const notesPath = path.join(basePath, 'RELEASE_NOTES.md');
                try {
                    const rawNotes = fs.readFileSync(notesPath, 'utf8');
                    releaseNotes = extractReleaseNotesRangeFromFile(rawNotes, version, lastSeenVersion);
                    if (!releaseNotes) {
                        const nextHeaderIndex = rawNotes.indexOf('\n# Release Notes', 1);
                        releaseNotes = nextHeaderIndex > -1 ? rawNotes.slice(0, nextHeaderIndex).trim() : rawNotes.trim();
                    }
                } catch (err) {
                    console.warn('[Main] Failed to read release notes:', err);
                }
            }
            return { version, lastSeenVersion, releaseNotes };
        });

        ipcMain.handle('set-last-seen-version', (_event, version: string) => {
            store.set('lastSeenVersion', version);
        });

        // Default embed stat settings
        const DEFAULT_EMBED_STATS = {
            showSquadSummary: true,
            showEnemySummary: true,
            showIncomingStats: true,
            showClassSummary: true,
            showDamage: true,
            showDownContribution: true,
            showHealing: true,
            showBarrier: true,
            showCleanses: true,
            showBoonStrips: true,
            showCC: true,
            showStability: true,
            showResurrects: false,
            showDistanceToTag: false,
            showKills: false,
            showDowns: false,
            showBreakbarDamage: false,
            showDamageTaken: false,
            showDeaths: false,
            showDodges: false,
            maxTopListRows: 10,
            classDisplay: 'off',
        };
        const DEFAULT_MVP_WEIGHTS = {
            downContribution: 1,
            healing: 1,
            cleanses: 1,
            strips: 1,
            stability: 1,
            cc: 0.7,
            revives: 0.7,
            distanceToTag: 0.7,
            participation: 0.7,
            dodging: 0.4,
            dps: 0.2,
            damage: 0.2
        };
        const DEFAULT_STATS_VIEW_SETTINGS = {
            showTopStats: true,
            showMvp: true,
            roundCountStats: false,
            topStatsMode: 'total'
        };
        ipcMain.handle('get-settings', () => {
            const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
            const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE);
            const updateSupported = app.isPackaged && !isPortable && fs.existsSync(updateConfigPath);
            let updateDisabledReason: string | null = null;
            if (!updateSupported) {
                if (!app.isPackaged) {
                    updateDisabledReason = 'dev';
                } else if (isPortable) {
                    updateDisabledReason = 'portable';
                } else {
                    updateDisabledReason = 'missing-config';
                }
            }
            return {
                logDirectory: store.get('logDirectory', null),
                discordWebhookUrl: store.get('discordWebhookUrl', null),
                discordNotificationType: store.get('discordNotificationType', 'image'),
                webhooks: store.get('webhooks', []),
                selectedWebhookId: store.get('selectedWebhookId', null),
                dpsReportToken: store.get('dpsReportToken', null),
                closeBehavior: store.get('closeBehavior', 'minimize'),
                embedStatSettings: store.get('embedStatSettings', DEFAULT_EMBED_STATS),
                mvpWeights: { ...DEFAULT_MVP_WEIGHTS, ...(store.get('mvpWeights') as any || {}) },
                statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
                disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
                uiTheme: store.get('uiTheme', 'classic'),
                autoUpdateSupported: updateSupported,
                autoUpdateDisabledReason: updateDisabledReason,
                githubRepoOwner: store.get('githubRepoOwner', null),
                githubRepoName: store.get('githubRepoName', null),
                githubBranch: store.get('githubBranch', 'main'),
                githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
                githubToken: store.get('githubToken', null),
                githubWebTheme: store.get('githubWebTheme', DEFAULT_WEB_THEME_ID),
                githubLogoPath: store.get('githubLogoPath', null),
                githubFavoriteRepos: store.get('githubFavoriteRepos', [])
            };
        });

        ipcMain.handle('clear-dps-report-cache', async () => {
            return clearDpsReportCache();
        });

        // Clear logs from store to improve boot time (persistence removed)
        if (store.has('logs')) {
            console.log('[Main] Clearing persistent logs to improve startup time.');
            store.delete('logs');
        }

        // Removed get-logs and save-logs handlers

        ipcMain.on('save-settings', (_event, settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'image' | 'image-beta' | 'embed', webhooks?: any[], selectedWebhookId?: string | null, dpsReportToken?: string | null, closeBehavior?: 'minimize' | 'quit', embedStatSettings?: any, mvpWeights?: any, statsViewSettings?: any, disruptionMethod?: DisruptionMethod, uiTheme?: 'classic' | 'modern', githubRepoOwner?: string | null, githubRepoName?: string | null, githubBranch?: string | null, githubPagesBaseUrl?: string | null, githubToken?: string | null, githubWebTheme?: string | null, githubLogoPath?: string | null, githubFavoriteRepos?: string[] }) => {
            if (settings.logDirectory !== undefined) {
                store.set('logDirectory', settings.logDirectory);
                if (settings.logDirectory) watcher?.start(settings.logDirectory);
            }
            if (settings.discordWebhookUrl !== undefined) {
                store.set('discordWebhookUrl', settings.discordWebhookUrl);
                discord?.setWebhookUrl(settings.discordWebhookUrl);
            }
            if (settings.discordNotificationType !== undefined) {
                store.set('discordNotificationType', settings.discordNotificationType);
            }
            if (settings.webhooks !== undefined) {
                store.set('webhooks', settings.webhooks);
            }
            if (settings.selectedWebhookId !== undefined) {
                store.set('selectedWebhookId', settings.selectedWebhookId);
                // Update the active webhook URL based on selected ID
                const webhooks = store.get('webhooks', []) as any[];
                const selected = webhooks.find((w: any) => w.id === settings.selectedWebhookId);
                if (selected) {
                    store.set('discordWebhookUrl', selected.url);
                    discord?.setWebhookUrl(selected.url);
                } else {
                    store.set('discordWebhookUrl', null);
                    discord?.setWebhookUrl('');
                }
            }
            if (settings.dpsReportToken !== undefined) {
                store.set('dpsReportToken', settings.dpsReportToken);
                uploader?.setUserToken(settings.dpsReportToken);
            }
            if (settings.closeBehavior !== undefined) {
                store.set('closeBehavior', settings.closeBehavior);
            }
            if (settings.embedStatSettings !== undefined) {
                store.set('embedStatSettings', settings.embedStatSettings);
                discord?.setEmbedStatSettings(settings.embedStatSettings);
            }
            if (settings.mvpWeights !== undefined) {
                store.set('mvpWeights', settings.mvpWeights);
            }
            if (settings.statsViewSettings !== undefined) {
                store.set('statsViewSettings', settings.statsViewSettings);
            }
            if (settings.disruptionMethod !== undefined) {
                store.set('disruptionMethod', settings.disruptionMethod);
                discord?.setDisruptionMethod(settings.disruptionMethod);
            }
            if (settings.uiTheme !== undefined) {
                store.set('uiTheme', settings.uiTheme);
            }
            if (settings.githubRepoOwner !== undefined) {
                store.set('githubRepoOwner', settings.githubRepoOwner);
            }
            if (settings.githubRepoName !== undefined) {
                store.set('githubRepoName', settings.githubRepoName);
            }
            if (settings.githubBranch !== undefined) {
                store.set('githubBranch', settings.githubBranch);
            }
            if (settings.githubPagesBaseUrl !== undefined) {
                store.set('githubPagesBaseUrl', settings.githubPagesBaseUrl);
            }
            if (settings.githubToken !== undefined) {
                store.set('githubToken', settings.githubToken);
            }
            if (settings.githubWebTheme !== undefined) {
                store.set('githubWebTheme', settings.githubWebTheme);
            }
            if (settings.githubLogoPath !== undefined) {
                store.set('githubLogoPath', settings.githubLogoPath);
            }
            if (settings.githubFavoriteRepos !== undefined) {
                store.set('githubFavoriteRepos', settings.githubFavoriteRepos);
            }
        });

        ipcMain.handle('select-directory', async () => {
            if (!win) return null;
            const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
            if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
            return null;
        });

        ipcMain.handle('select-files', async (_event, payload?: { defaultPath?: string }) => {
            if (!win) return null;
            const result = await dialog.showOpenDialog(win, {
                properties: ['openFile', 'multiSelections'],
                defaultPath: payload?.defaultPath,
                filters: [
                    { name: 'Arc Logs', extensions: ['evtc', 'zevtc'] }
                ]
            });
            if (!result.canceled && result.filePaths.length > 0) return result.filePaths;
            return null;
        });

        ipcMain.handle('select-github-logo', async () => {
            if (!win) return null;
            const result = await dialog.showOpenDialog(win, {
                properties: ['openFile'],
                filters: [
                    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
                ]
            });
            if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
            return null;
        });

        ipcMain.handle('list-log-files', async (_event, payload?: { dir?: string }) => {
            try {
                const dir = payload?.dir;
                if (!dir) return { success: false, error: 'Missing directory.' };
                if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found.' };
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const files = await Promise.all(entries
                    .filter((entry) => entry.isFile() && (entry.name.endsWith('.evtc') || entry.name.endsWith('.zevtc')))
                    .map(async (entry) => {
                        const fullPath = path.join(dir, entry.name);
                        const stat = await fs.promises.stat(fullPath);
                        return {
                            path: fullPath,
                            name: entry.name,
                            mtimeMs: stat.mtimeMs,
                            size: stat.size
                        };
                    }));
                files.sort((a, b) => b.mtimeMs - a.mtimeMs);
                return { success: true, files };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to list log files.' };
            }
        });

        ipcMain.on('start-watching', (_event, dirPath: string) => {
            watcher?.start(dirPath);
            store.set('logDirectory', dirPath);
        });

        ipcMain.on('set-discord-webhook', (_event, url: string) => {
            discord?.setWebhookUrl(url);
            store.set('discordWebhookUrl', url);
        });

        ipcMain.on('manual-upload', (_event, filePath: string) => {
            processLogFile(filePath);
        });

        ipcMain.on('manual-upload-batch', (_event, filePaths: string[]) => {
            console.log(`[Main] Received batch of ${filePaths.length} logs.`);
            if (win && filePaths.length > 1) {
                filePaths.forEach((filePath) => {
                    const fileId = path.basename(filePath);
                    win?.webContents.send('upload-status', { id: fileId, filePath, status: 'queued' });
                });
            }
            // Process sequentially to avoid overwhelming the system
            (async () => {
                for (const filePath of filePaths) {
                    await processLogFile(filePath);
                    // Small delay to allow UI updates to breathe
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            })();
        });

        ipcMain.on('renderer-log', (_event, payload: { level?: 'info' | 'warn' | 'error'; message: string; meta?: any }) => {
            const level = payload?.level || 'info';
            const meta = payload?.meta;
            const message = payload?.message || '';
            const formatted = meta ? `${message} ${formatLogArgs([meta])}` : message;
            if (level === 'error') {
                console.error(`[Renderer] ${formatted}`);
            } else if (level === 'warn') {
                console.warn(`[Renderer] ${formatted}`);
            } else {
                console.log(`[Renderer] ${formatted}`);
            }
        });

        ipcMain.on('window-control', (_event, action: 'minimize' | 'maximize' | 'close') => {
            if (!win) return;
            if (action === 'minimize') win.minimize();
            else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
            else if (action === 'close') win.close(); // Triggers the 'close' event handler
        });

        ipcMain.handle('open-external', async (_event, url: string) => {
            try {
                await shell.openExternal(url);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

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
                const reports = JSON.parse(decoded);
                return { success: true, reports: Array.isArray(reports) ? reports : [] };
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
                const pathsToDelete = new Set<string>();
                ids.forEach((id) => {
                    pathsToDelete.add(`${pagesPrefix}reports/${id}/`);
                });
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

                let existingIndex: any[] = [];
                try {
                    const existing = await getGithubFile(owner, repo, withPagesPath(pagesPath, 'reports/index.json'), branch, token);
                    if (existing?.content) {
                        const decoded = Buffer.from(existing.content, 'base64').toString('utf8');
                        existingIndex = JSON.parse(decoded);
                    }
                } catch {
                    existingIndex = [];
                }
                const filteredIndex = Array.isArray(existingIndex)
                    ? existingIndex.filter((entry: any) => !ids.includes(entry?.id))
                    : [];
                const indexContent = Buffer.from(JSON.stringify(filteredIndex, null, 2)).toString('base64');
                const indexBlob = await createGithubBlob(owner, repo, token, indexContent);

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


        ipcMain.handle('create-github-repo', async (_event, params: { name: string; branch?: string }) => {
            try {
                const token = store.get('githubToken') as string | undefined;
                if (!token) {
                    return { success: false, error: 'GitHub not connected.' };
                }
                const user = await getGithubUser(token);
                const owner = user?.login;
                if (!owner) {
                    return { success: false, error: 'Unable to determine GitHub username.' };
                }
                const repoName = params.name?.trim();
                if (!repoName) {
                    return { success: false, error: 'Repository name is required.' };
                }
                const repo = await createGithubRepo(owner, repoName, token);
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

        ipcMain.handle('get-github-pages-build-status', async () => {
            try {
                const token = store.get('githubToken') as string | undefined;
                const owner = store.get('githubRepoOwner') as string | undefined;
                const repo = store.get('githubRepoName') as string | undefined;
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
                let hasClassIcons = false;
                treeEntries.forEach((entry: any) => {
                    if (entry?.path && entry?.sha && entry?.type === 'blob') {
                        treeMap.set(entry.path, entry.sha);
                        if (entry.path === `${pagesPrefix}index.html`) hasIndex = true;
                        if (entry.path.startsWith(`${pagesPrefix}assets/`)) hasAssets = true;
                        if (entry.path.startsWith(`${pagesPrefix}img/class-icons/`)) hasClassIcons = true;
                    }
                });

                if (hasIndex && hasAssets && hasClassIcons) {
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
                    const blobSha = computeGitBlobSha(content);
                    const existingSha = treeMap.get(repoPath);
                    if (existingSha && existingSha === blobSha) return;
                    pendingEntries.push({
                        path: repoPath,
                        contentBase64: content.toString('base64'),
                        blobSha
                    });
                };

                const rootFiles = collectFiles(templateDir);
                for (const file of rootFiles) {
                    const content = fs.readFileSync(file.absPath);
                    queueFile(withPagesPath(pagesPath, file.relPath), content);
                }

                if (pendingEntries.length === 0) {
                    return { success: true, updated: false };
                }

                const blobEntries: Array<{ path: string; sha: string }> = [];
                for (const entry of pendingEntries) {
                    const blob = await createGithubBlob(owner, repo, token, entry.contentBase64);
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
                    const blob = await createGithubBlob(owner, repo, token, entry.contentBase64);
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

        ipcMain.handle('apply-github-theme', async (_event, payload?: { themeId?: string }) => {
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

                const themeId = payload?.themeId
                    || (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string)
                    || DEFAULT_WEB_THEME_ID;
                const selectedTheme = WEB_THEMES.find((theme) => theme.id === themeId) || WEB_THEMES[0];

                sendGithubThemeStatus('Preparing', 'Loading report index...', 15);
                let reportIds: string[] = [];
                try {
                    const indexFile = await getGithubFile(owner, repo, withPagesPath(pagesPath, 'reports/index.json'), branch, token);
                    if (indexFile?.content) {
                        const decoded = Buffer.from(indexFile.content, 'base64').toString('utf8');
                        const parsed = JSON.parse(decoded);
                        if (Array.isArray(parsed)) {
                            reportIds = parsed.map((entry) => entry?.id).filter((id) => typeof id === 'string');
                        }
                    }
                } catch (err) {
                    reportIds = [];
                }

                sendGithubThemeStatus('Preparing', `Updating ${reportIds.length} reports...`, 25);
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
                    const blobSha = computeGitBlobSha(content);
                    const existingSha = treeMap.get(repoPath);
                    if (existingSha && existingSha === blobSha) return;
                    pendingEntries.push({
                        path: repoPath,
                        contentBase64: content.toString('base64'),
                        blobSha
                    });
                };

                const themeBuffer = Buffer.from(JSON.stringify(selectedTheme, null, 2));
                queueFile(withPagesPath(pagesPath, 'theme.json'), themeBuffer);
                reportIds.forEach((id) => {
                    queueFile(withPagesPath(pagesPath, `reports/${id}/theme.json`), themeBuffer);
                });
                const uiTheme = store.get('uiTheme', 'classic') as string;
                const uiThemeBuffer = Buffer.from(JSON.stringify({ theme: uiTheme }, null, 2));
                queueFile(withPagesPath(pagesPath, 'ui-theme.json'), uiThemeBuffer);

                if (pendingEntries.length === 0) {
                    sendGithubThemeStatus('Complete', 'Theme already up to date.', 100);
                    return { success: true };
                }

                sendGithubThemeStatus('Uploading', 'Uploading theme updates...', 70);
                const blobEntries: Array<{ path: string; sha: string }> = [];
                for (const entry of pendingEntries) {
                    const blob = await createGithubBlob(owner, repo, token, entry.contentBase64);
                    blobEntries.push({ path: entry.path, sha: blob.sha });
                }

                sendGithubThemeStatus('Finalizing', 'Publishing theme commit...', 90);
                const newTree = await createGithubTree(owner, repo, token, baseTreeSha, blobEntries);
                const commitMessage = `Update web theme to ${selectedTheme.id}`;
                const newCommit = await createGithubCommit(owner, repo, token, commitMessage, newTree.sha, headSha);
                await updateGithubRef(owner, repo, branch, token, newCommit.sha);

                sendGithubThemeStatus('Committed', 'Theme commit pushed. Waiting for Pages build...', 100);
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

        ipcMain.handle('upload-web-report', async (_event, payload: { meta: any; stats: any }) => {
            try {
                sendWebUploadStatus('Preparing', 'Validating settings...', 5);
                const token = store.get('githubToken') as string | undefined;
                const owner = store.get('githubRepoOwner') as string | undefined;
                const repo = store.get('githubRepoName') as string | undefined;
                const branch = (store.get('githubBranch') as string | undefined) || 'main';
                let baseUrl = (store.get('githubPagesBaseUrl') as string | undefined) || '';
                if (!token) {
                    return { success: false, error: 'Missing GitHub token. Connect GitHub first.' };
                }
                if (!owner || !repo) {
                    return { success: false, error: 'Select or create a repository in Settings first.' };
                }

                sendWebUploadStatus('Preparing', 'Ensuring Pages configuration...', 15);
                const { pagesInfo, pagesPath } = await resolvePagesSource(owner, repo, branch, token);
                if (!baseUrl && pagesInfo?.html_url) {
                    baseUrl = pagesInfo.html_url;
                    store.set('githubPagesBaseUrl', baseUrl);
                } else if (!baseUrl) {
                    baseUrl = `https://${owner}.github.io/${repo}`;
                    store.set('githubPagesBaseUrl', baseUrl);
                }
                store.set('githubPagesSourcePath', pagesPath);

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
                        return { success: false, error: built.error || 'Failed to generate the web template automatically.' };
                    }
                }

                const reportMeta = {
                    ...payload.meta,
                    appVersion: app.getVersion()
                };
                const themeId = (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string) || DEFAULT_WEB_THEME_ID;
                const selectedTheme = WEB_THEMES.find((theme) => theme.id === themeId) || WEB_THEMES.find((theme) => theme.id === 'Midnight') || WEB_THEMES[0];

                sendWebUploadStatus('Packaging', 'Preparing report bundle...', 40);
                const stagingRoot = path.join(app.getPath('userData'), 'web-report-staging', reportMeta.id);
                fs.rmSync(stagingRoot, { recursive: true, force: true });
                fs.mkdirSync(stagingRoot, { recursive: true });
                fs.writeFileSync(path.join(stagingRoot, 'report.json'), JSON.stringify({ meta: reportMeta, stats: payload.stats }, null, 2));
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

                let existingIndex: any[] = [];
                try {
                    const existing = await getGithubFile(owner, repo, withPagesPath(pagesPath, 'reports/index.json'), branch, token);
                    if (existing?.content) {
                        const decoded = Buffer.from(existing.content, 'base64').toString('utf8');
                        existingIndex = JSON.parse(decoded);
                    }
                } catch (err) {
                    existingIndex = [];
                }

                const mergedIndex = [indexEntry, ...(Array.isArray(existingIndex) ? existingIndex.filter((entry) => entry?.id !== reportMeta.id) : [])];

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
                treeEntries.forEach((entry: any) => {
                    if (entry?.path && entry?.sha && entry?.type === 'blob') {
                        treeMap.set(entry.path, entry.sha);
                    }
                });

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

                const rootFiles = collectFiles(templateDir);
                for (const file of rootFiles) {
                    const repoPath = file.relPath;
                    const content = fs.readFileSync(file.absPath);
                    queueFile(withPagesPath(pagesPath, repoPath), content);
                }

                const reportFiles = collectFiles(stagingRoot);
                for (const file of reportFiles) {
                    const repoPath = withPagesPath(pagesPath, `reports/${reportMeta.id}/${file.relPath}`);
                    const content = fs.readFileSync(file.absPath);
                    queueFile(repoPath, content);
                }

                const indexBuffer = Buffer.from(JSON.stringify(mergedIndex, null, 2));
                queueFile(withPagesPath(pagesPath, 'reports/index.json'), indexBuffer);
                if (selectedTheme) {
                    const themeBuffer = Buffer.from(JSON.stringify(selectedTheme, null, 2));
                    queueFile(withPagesPath(pagesPath, 'theme.json'), themeBuffer);
                }
                const uiTheme = store.get('uiTheme', 'classic') as string;
                const uiThemeBuffer = Buffer.from(JSON.stringify({ theme: uiTheme }, null, 2));
                queueFile(withPagesPath(pagesPath, 'ui-theme.json'), uiThemeBuffer);
                const logoPath = store.get('githubLogoPath') as string | undefined;
                if (logoPath && fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                queueFile(withPagesPath(pagesPath, 'logo.png'), logoBuffer);
                const logoJson = Buffer.from(JSON.stringify({ path: 'logo.png', updatedAt: new Date().toISOString() }, null, 2));
                queueFile(withPagesPath(pagesPath, 'logo.json'), logoJson);
                }

                if (pendingEntries.length === 0) {
                    sendWebUploadStatus('Complete', 'No changes to upload.', 100);
                    return { success: true, url: reportUrl };
                }

                sendWebUploadStatus('Uploading', 'Uploading changes...', 75);
                const blobEntries: Array<{ path: string; sha: string }> = [];
                for (const entry of pendingEntries) {
                    const blob = await createGithubBlob(owner, repo, token, entry.contentBase64);
                    blobEntries.push({ path: entry.path, sha: blob.sha });
                }

                const commitMessage = `Update web report ${reportMeta.id}`;
                const publishCommit = async (treeBaseSha: string, parentSha: string) => {
                    const newTree = await createGithubTree(owner, repo, token, treeBaseSha, blobEntries);
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
                return { success: false, error: err?.message || 'Upload failed.' };
            }
        });

        ipcMain.handle('mock-web-report', async (_event, payload: { meta: any; stats: any }) => {
            if (app.isPackaged) {
                return { success: false, error: 'Mock web reports are only available in dev builds.' };
            }
            try {
                const appRoot = getWebRoot();
                const webRoot = path.join(appRoot, 'web');
                const webRootExists = fs.existsSync(webRoot);
                const webRootEmpty = webRootExists ? fs.readdirSync(webRoot).length === 0 : true;
                if (!webRootExists) {
                    fs.mkdirSync(webRoot, { recursive: true });
                }
                if (webRootEmpty) {
                    const templateDir = path.join(appRoot, 'dist-web');
                    const built = await buildWebTemplate(appRoot);
                    if (!built.ok || !fs.existsSync(templateDir)) {
                        return { success: false, error: built.error || 'Failed to generate the web template automatically.' };
                    }
                    copyDir(templateDir, webRoot);
                }
                // Always ensure dev index points at the web entry.
                ensureDevWebIndex(webRoot);
                const reportMeta = {
                    ...payload.meta,
                    appVersion: app.getVersion()
                };
                const reportPayload = { meta: reportMeta, stats: payload.stats };
                const reportsRoot = path.join(webRoot, 'reports');
                const reportDir = path.join(reportsRoot, reportMeta.id);
                fs.mkdirSync(reportDir, { recursive: true });
                fs.writeFileSync(path.join(webRoot, 'report.json'), JSON.stringify(reportPayload, null, 2));
                fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(reportPayload, null, 2));

                const redirectHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=../../index.html?report=${reportMeta.id}" />
    <title>Redirecting...</title>
  </head>
  <body>
    <script>
      window.location.replace('../../index.html?report=${reportMeta.id}');
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
                let existingIndex: any[] = [];
                try {
                    if (fs.existsSync(indexPath)) {
                        const decoded = fs.readFileSync(indexPath, 'utf8');
                        existingIndex = JSON.parse(decoded);
                    }
                } catch {
                    existingIndex = [];
                }
                const mergedIndex = [indexEntry, ...(Array.isArray(existingIndex) ? existingIndex.filter((entry) => entry?.id !== reportMeta.id) : [])];
                fs.writeFileSync(indexPath, JSON.stringify(mergedIndex, null, 2));

                const baseUrl = VITE_DEV_SERVER_URL.replace(/\/$/, '');
                return { success: true, url: `${baseUrl}/web/index.html?report=${reportMeta.id}` };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to create local web report.' };
            }
        });

        ipcMain.on('send-screenshot', async (_event, logId: string, buffer: Uint8Array) => {
            const data = pendingDiscordLogs.get(logId);
            if (data && discord) {
                await discord.sendLog({ ...data.result, imageBuffer: buffer, mode: 'image' }, data.jsonDetails);
                pendingDiscordLogs.delete(logId);
            }
        });

        ipcMain.on('send-screenshots', async (_event, logId: string, buffers: Uint8Array[]) => {
            const data = pendingDiscordLogs.get(logId);
            if (!data || !discord) return;
            const chunks: Uint8Array[][] = [];
            for (let i = 0; i < buffers.length; i += 2) {
                chunks.push(buffers.slice(i, i + 2));
            }
            for (let i = 0; i < chunks.length; i += 1) {
                const suppressContent = i > 0;
                await discord.sendLog({ ...data.result, imageBuffers: chunks[i], mode: 'image', suppressContent }, data.jsonDetails);
            }
            pendingDiscordLogs.delete(logId);
        });

        ipcMain.on('send-screenshots-groups', async (_event, logId: string, groups: Uint8Array[][]) => {
            const data = pendingDiscordLogs.get(logId);
            if (!data || !discord) return;
            for (let i = 0; i < groups.length; i += 1) {
                const suppressContent = i > 0;
                await discord.sendLog({ ...data.result, imageBuffers: groups[i], mode: 'image', suppressContent }, data.jsonDetails);
            }
            pendingDiscordLogs.delete(logId);
        });

        ipcMain.on('send-stats-screenshot', async (_event, buffer: Uint8Array) => {
            if (discord) {
                // We create a dummy log entry for the generalized stats
                const dummyLog: any = {
                    id: 'stats-dashboard',
                    fightName: 'Weekly Statistics',
                    encounterDuration: 'Summary',
                    uploadTime: Math.floor(Date.now() / 1000),
                    permalink: 'https://dps.report',
                    imageBuffer: buffer,
                    mode: 'image'
                };
                // We pass a dummy jsonDetails for the title
                try {
                    await discord.sendLog(dummyLog, { fightName: 'Aggregated Statistics' });
                    console.log('[Main] Stats screenshot sent to Discord.');
                } catch (e) {
                    console.error('[Main] Failed to send stats screenshot:', e);
                }
            }
        });
    })
}
