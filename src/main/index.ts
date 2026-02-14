import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import fs from 'fs'
import path from 'node:path'
import https from 'node:https'
import { createHash } from 'node:crypto'
import util from 'node:util'
import { spawn } from 'node:child_process'
import { BASE_WEB_THEMES, CRT_WEB_THEME, CRT_WEB_THEME_ID, DEFAULT_WEB_THEME_ID, MATTE_WEB_THEME, MATTE_WEB_THEME_ID } from '../shared/webThemes';
import { computeOutgoingConditions } from '../shared/conditionsMetrics';
import { DEFAULT_DISRUPTION_METHOD, DisruptionMethod } from '../shared/metricsSettings';
import { LogWatcher } from './watcher'
import { Uploader, UploadResult } from './uploader'
import { DiscordNotifier } from './discord';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { DesktopIntegrator } from './integration';

// Increase V8 heap for packaged and dev builds to avoid OOM on large datasets.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=6144');

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
const originalConsoleWarn = console.warn;

if (!app.isPackaged) {
    const devUserDataDir = path.join(app.getPath('appData'), 'ArcBridge-Dev');
    app.setPath('userData', devUserDataDir);
}

function formatLogArg(arg: any): string {
    try {
        if (arg instanceof Error) {
            try {
                if (typeof arg.stack === 'string' && arg.stack.length > 0) {
                    return arg.stack;
                }
            } catch {
                // Some stack getters can throw; fall through to message.
            }
            const errorName = typeof arg.name === 'string' && arg.name.length > 0 ? arg.name : 'Error';
            const errorMessage = typeof arg.message === 'string' && arg.message.length > 0 ? arg.message : '[no message]';
            return `${errorName}: ${errorMessage}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                return util.inspect(arg, {
                    depth: 3,
                    maxArrayLength: 50,
                    maxStringLength: 5000,
                    breakLength: 120,
                    customInspect: false,
                    getters: false
                });
            } catch {
                try {
                    return Object.prototype.toString.call(arg);
                } catch {
                    return '[Unserializable object]';
                }
            }
        }
        return String(arg);
    } catch {
        return '[Unserializable argument]';
    }
}

function formatLogArgs(args: any[]) {
    try {
        return args.map((arg) => formatLogArg(arg)).join(' ');
    } catch {
        return '[Log formatting failed]';
    }
}

const safeSendToRenderer = (payload: { type: 'info' | 'error'; message: string; timestamp: string }) => {
    try {
        if (!win || win.isDestroyed()) return;
        if (win.webContents.isDestroyed()) return;
        win.webContents.send('console-log', payload);
    } catch {
        // Swallow send errors to avoid recursive console errors when the renderer is gone.
    }
};

const sendCrashDiagDirect = (message: string) => {
    const line = String(message);
    try {
        originalConsoleError(line);
    } catch {
        // Last-resort: ignore console transport failures.
    }
    safeSendToRenderer({ type: 'error', message: line, timestamp: new Date().toISOString() });
};

console.log = (...args) => {
    const message = formatLogArgs(args);
    originalConsoleLog(message);
    safeSendToRenderer({ type: 'info', message, timestamp: new Date().toISOString() });
};

console.warn = (...args) => {
    const message = formatLogArgs(args);
    originalConsoleWarn(message);
    safeSendToRenderer({ type: 'info', message, timestamp: new Date().toISOString() });
};

console.error = (...args) => {
    const message = formatLogArgs(args);
    originalConsoleError(message);
    safeSendToRenderer({ type: 'error', message, timestamp: new Date().toISOString() });
};

const isStackOverflowRangeError = (errorLike: any): boolean => {
    const message = String(errorLike?.message || errorLike || '');
    const name = String(errorLike?.name || '');
    return (name === 'RangeError' && /maximum call stack size exceeded/i.test(message))
        || /RangeError:\s*Maximum call stack size exceeded/i.test(message);
};

const buildMainCrashDiagnostics = () => {
    let rssMb = 'n/a';
    let heapUsedMb = 'n/a';
    let heapTotalMb = 'n/a';
    try {
        const mem = process.memoryUsage();
        rssMb = (mem.rss / 1024 / 1024).toFixed(1);
        heapUsedMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
        heapTotalMb = (mem.heapTotal / 1024 / 1024).toFixed(1);
    } catch {
        // Ignore memory probe errors.
    }
    return {
        processType: 'main',
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        electron: process.versions?.electron || 'unknown',
        chrome: process.versions?.chrome || 'unknown',
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        uptimeSec: Math.round(process.uptime()),
        cwd: process.cwd(),
        rssMb,
        heapUsedMb,
        heapTotalMb
    };
};

const serializeCrashReason = (value: any): { name: string; message: string; stack: string | null } => {
    if (value instanceof Error) {
        return {
            name: value.name || 'Error',
            message: value.message || '[no message]',
            stack: value.stack || null
        };
    }
    const asString = String(value ?? 'Unknown error');
    return {
        name: 'NonError',
        message: asString,
        stack: null
    };
};

const emitMainCrashDiagnostics = (source: 'uncaughtExceptionMonitor' | 'uncaughtException' | 'unhandledRejection', reason: any) => {
    const payload = serializeCrashReason(reason);
    const diagnostics = buildMainCrashDiagnostics();
    sendCrashDiagDirect(`[CrashDiag] ${source} | name=${payload.name} | message=${payload.message}`);
    sendCrashDiagDirect(`[CrashDiag] Runtime: ${JSON.stringify(diagnostics)}`);
    if (payload.stack) {
        sendCrashDiagDirect(`[CrashDiag] Stack:\n${payload.stack}`);
    }
};

process.on('uncaughtExceptionMonitor', (error) => {
    // Monitor fires before uncaughtException and helps capture diagnostics even if later handlers fail.
    emitMainCrashDiagnostics('uncaughtExceptionMonitor', error);
});

process.on('uncaughtException', (error) => {
    if (!isStackOverflowRangeError(error)) return;
    emitMainCrashDiagnostics('uncaughtException', error);
});

process.on('unhandledRejection', (reason: any) => {
    if (!isStackOverflowRangeError(reason)) return;
    emitMainCrashDiagnostics('unhandledRejection', reason);
});

const Store = require('electron-store');
const store = new Store();

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const IMAGE_REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Referer': 'https://wiki.guildwars2.com/'
};

const fetchImageBuffer = (url: string, redirectCount = 0): Promise<{ buffer: Buffer; contentType: string }> => {
    if (redirectCount > 5) {
        return Promise.reject(new Error('Too many redirects'));
    }
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: IMAGE_REQUEST_HEADERS }, (res) => {
            const statusCode = res.statusCode || 0;
            if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, url).toString();
                res.resume();
                fetchImageBuffer(nextUrl, redirectCount + 1).then(resolve).catch(reject);
                return;
            }
            if (statusCode >= 400) {
                res.resume();
                reject(new Error(`Request failed with status ${statusCode}`));
                return;
            }
            const chunks: Buffer[] = [];
            let total = 0;
            res.on('data', (chunk: Buffer) => {
                total += chunk.length;
                if (total > MAX_IMAGE_BYTES) {
                    req.destroy();
                    reject(new Error('Image too large'));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                const contentType = typeof res.headers['content-type'] === 'string'
                    ? res.headers['content-type']
                    : 'application/octet-stream';
                resolve({ buffer: Buffer.concat(chunks), contentType });
            });
        });
        req.on('error', (err) => reject(err));
    });
};


type DpsReportCacheEntry = {
    hash: string;
    createdAt: number;
    result: UploadResult;
    detailsPath?: string | null;
};

const DPS_REPORT_CACHE_KEY = 'dpsReportCacheIndex';
const DPS_REPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DPS_REPORT_CACHE_MAX_ENTRIES = 100;
const UPLOAD_RETRY_QUEUE_KEY = 'uploadRetryQueue';
const UPLOAD_RETRY_STATE_KEY = 'uploadRetryQueueState';
const MAX_UPLOAD_RETRY_QUEUE_ENTRIES = 200;
const AUTH_RETRY_PAUSE_THRESHOLD = 3;

type UploadRetryFailureCategory = 'network' | 'auth' | 'rate-limit' | 'file' | 'unknown';

type UploadRetryQueueEntry = {
    filePath: string;
    error: string;
    statusCode?: number;
    category: UploadRetryFailureCategory;
    failedAt: string;
    attempts: number;
    state: 'failed' | 'retrying';
};

type UploadRetryRuntimeState = {
    paused: boolean;
    pauseReason: string | null;
    pausedAt: string | null;
};

type UploadRetryQueuePayload = {
    failed: number;
    retrying: number;
    resolved: number;
    paused: boolean;
    pauseReason: string | null;
    pausedAt: string | null;
    entries: UploadRetryQueueEntry[];
};

const getDpsReportCacheDir = () => path.join(app.getPath('userData'), 'dps-report-cache');

const loadDpsReportCacheIndex = (): Record<string, DpsReportCacheEntry> => {
    const raw = store.get(DPS_REPORT_CACHE_KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, DpsReportCacheEntry>;
};

const saveDpsReportCacheIndex = (index: Record<string, DpsReportCacheEntry>) => {
    store.set(DPS_REPORT_CACHE_KEY, index);
};

const loadUploadRetryQueue = (): Record<string, UploadRetryQueueEntry> => {
    const raw = store.get(UPLOAD_RETRY_QUEUE_KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const parsed = raw as Record<string, any>;
    const normalized: Record<string, UploadRetryQueueEntry> = {};
    Object.entries(parsed).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;
        normalized[key] = {
            filePath: typeof value.filePath === 'string' ? value.filePath : key,
            error: typeof value.error === 'string' ? value.error : 'Unknown upload error',
            statusCode: typeof value.statusCode === 'number' ? value.statusCode : undefined,
            category: value.category === 'network' || value.category === 'auth' || value.category === 'rate-limit' || value.category === 'file'
                ? value.category
                : 'unknown',
            failedAt: typeof value.failedAt === 'string' ? value.failedAt : new Date().toISOString(),
            attempts: Number.isFinite(Number(value.attempts)) ? Math.max(1, Number(value.attempts)) : 1,
            state: value.state === 'retrying' ? 'retrying' : 'failed'
        };
    });
    return normalized;
};

const saveUploadRetryQueue = (queue: Record<string, UploadRetryQueueEntry>) => {
    store.set(UPLOAD_RETRY_QUEUE_KEY, queue);
};

const loadUploadRetryState = (): UploadRetryRuntimeState => {
    const raw = store.get(UPLOAD_RETRY_STATE_KEY, {});
    const parsed = (!raw || typeof raw !== 'object' || Array.isArray(raw)) ? {} : raw as any;
    return {
        paused: parsed.paused === true,
        pauseReason: typeof parsed.pauseReason === 'string' ? parsed.pauseReason : null,
        pausedAt: typeof parsed.pausedAt === 'string' ? parsed.pausedAt : null
    };
};

const saveUploadRetryState = (state: UploadRetryRuntimeState) => {
    store.set(UPLOAD_RETRY_STATE_KEY, state);
};

const clearDpsReportCache = (
    onProgress?: (data: { stage?: string; message?: string; progress?: number; current?: number; total?: number }) => void
) => {
    onProgress?.({ stage: 'start', message: 'Preparing cache cleanup…', progress: 0 });
    const index = loadDpsReportCacheIndex();
    const clearedEntries = Object.keys(index).length;
    store.delete(DPS_REPORT_CACHE_KEY);
    onProgress?.({ stage: 'index', message: 'Cache index cleared.', progress: 20, current: 0, total: 0 });

    const cacheDir = getDpsReportCacheDir();
    try {
        if (fs.existsSync(cacheDir)) {
            const entries = fs.readdirSync(cacheDir);
            const total = entries.length;
            entries.forEach((entry, index) => {
                fs.rmSync(path.join(cacheDir, entry), { recursive: true, force: true });
                const progress = total > 0 ? 20 + Math.round(((index + 1) / total) * 75) : 95;
                onProgress?.({
                    stage: 'files',
                    message: `Removing cached files (${index + 1}/${total})…`,
                    progress,
                    current: index + 1,
                    total
                });
            });
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
    } catch (err: any) {
        console.warn('[Main] Failed to remove dps.report cache directory:', err?.message || err);
        return { success: false, clearedEntries, error: 'Failed to remove cache directory.' };
    }

    onProgress?.({ stage: 'done', message: 'Cache cleared.', progress: 100 });
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

const getDevDatasetsDir = () => path.join(process.cwd(), 'dev', 'datasets');

const ensureDevDatasetsDir = async () => {
    const dir = getDevDatasetsDir();
    await fs.promises.mkdir(dir, { recursive: true });
    return dir;
};

const sanitizeDevDatasetId = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, '');
const sanitizeDevDatasetName = (name: string) => name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'dataset';
const devDatasetFolderCache = new Map<string, string>();
const devDatasetFinalFolderCache = new Map<string, string>();
const devDatasetManifestCache = new Map<string, { meta: { id: string; name: string; createdAt: string; folder: string }; logs: any[] }>();
const MAX_DEV_DATASET_REPORT_BYTES = 50 * 1024 * 1024;
const DEV_DATASET_SNAPSHOT_SCHEMA_VERSION = 1;
const DEV_DATASET_TEMP_PREFIX = '.tmp-';
const DEV_DATASET_STATUS_FILE = 'status.json';
const DEV_DATASET_INTEGRITY_FILE = 'integrity.json';
const DEV_DATASET_INTEGRITY_SCHEMA_VERSION = 1;

const getDevDatasetFolderName = (id: string, name: string) => `${id}-${sanitizeDevDatasetName(name).replace(/\s+/g, '-').toLowerCase()}`;
const getDevDatasetTempFolderName = (folderName: string) => `${DEV_DATASET_TEMP_PREFIX}${folderName}`;
const isDevDatasetTempFolder = (folderName: string) => folderName.startsWith(DEV_DATASET_TEMP_PREFIX);

const normalizeDevDatasetSnapshot = (snapshot: any) => {
    const state = snapshot && typeof snapshot === 'object' && snapshot.state && typeof snapshot.state === 'object'
        ? snapshot.state
        : {};
    const parsedSchemaVersion = Number(snapshot?.schemaVersion);
    return {
        schemaVersion: Number.isFinite(parsedSchemaVersion) && parsedSchemaVersion > 0
            ? Math.floor(parsedSchemaVersion)
            : DEV_DATASET_SNAPSHOT_SCHEMA_VERSION,
        capturedAt: typeof snapshot?.capturedAt === 'string' ? snapshot.capturedAt : new Date().toISOString(),
        appVersion: typeof snapshot?.appVersion === 'string' ? snapshot.appVersion : app.getVersion(),
        state
    };
};

const writeDevDatasetStatus = async (datasetDir: string, status: { complete: boolean; createdAt?: string; completedAt?: string; totalLogs?: number }) => {
    await fs.promises.writeFile(path.join(datasetDir, DEV_DATASET_STATUS_FILE), JSON.stringify(status, null, 2), 'utf-8');
};

const readDevDatasetStatus = async (datasetDir: string) => {
    const statusPath = path.join(datasetDir, DEV_DATASET_STATUS_FILE);
    if (!fs.existsSync(statusPath)) return null;
    const raw = await fs.promises.readFile(statusPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as { complete?: boolean; createdAt?: string; completedAt?: string; totalLogs?: number };
};

const getDatasetRelativeLogPath = (index: number) => `logs/log-${index + 1}.json`;

const normalizeDatasetRelativePath = (value: string) => value.replace(/\\/g, '/');

const resolveDatasetLogPath = (datasetDir: string, logsDir: string, value: string): string | null => {
    if (!value || typeof value !== 'string') return null;
    const normalizedRaw = normalizeDatasetRelativePath(value);
    const candidate = path.isAbsolute(normalizedRaw)
        ? normalizedRaw
        : path.join(datasetDir, normalizedRaw);
    const normalizedCandidate = path.normalize(candidate);
    const normalizedLogsDir = path.normalize(logsDir + path.sep);
    if (!normalizedCandidate.startsWith(normalizedLogsDir)) return null;
    return normalizedCandidate;
};

const resolveOrderedDatasetLogPaths = async (datasetDir: string, logsDir: string, manifest: any, snapshot: any) => {
    const names = (await fs.promises.readdir(logsDir))
        .filter((name) => name.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const fallbackPaths = names.map((name) => path.join(logsDir, name));
    const seen = new Set<string>();
    const ordered: string[] = [];
    const addPath = (candidate: string | null) => {
        if (!candidate) return;
        if (!fs.existsSync(candidate)) return;
        if (seen.has(candidate)) return;
        seen.add(candidate);
        ordered.push(candidate);
    };

    const snapshotOrderRaw = snapshot?.state?.datasetLogOrder;
    if (Array.isArray(snapshotOrderRaw)) {
        snapshotOrderRaw.forEach((entry: any) => {
            if (typeof entry !== 'string') return;
            addPath(resolveDatasetLogPath(datasetDir, logsDir, entry));
        });
    }

    const manifestOrderRaw = manifest?.logs;
    if (Array.isArray(manifestOrderRaw)) {
        manifestOrderRaw.forEach((entry: any) => {
            if (!entry || typeof entry !== 'object') return;
            if (typeof entry.filePath !== 'string') return;
            addPath(resolveDatasetLogPath(datasetDir, logsDir, entry.filePath));
        });
    }

    fallbackPaths.forEach((filePath) => addPath(filePath));
    return ordered;
};

const hashFileSha256 = async (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
};

const buildDatasetIntegrity = async (datasetDir: string) => {
    const logsDir = path.join(datasetDir, 'logs');
    const manifestPath = path.join(datasetDir, 'manifest.json');
    const reportPath = path.join(datasetDir, 'report.json');
    const snapshotPath = path.join(datasetDir, 'snapshot.json');
    const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'))
        : null;
    const snapshot = fs.existsSync(snapshotPath)
        ? JSON.parse(await fs.promises.readFile(snapshotPath, 'utf-8'))
        : null;
    const logPaths = await resolveOrderedDatasetLogPaths(datasetDir, logsDir, manifest, snapshot);
    const logs = [];
    for (let i = 0; i < logPaths.length; i += 1) {
        const absolute = logPaths[i];
        const relative = path.relative(datasetDir, absolute).replace(/\\/g, '/');
        logs.push({
            path: relative,
            sha256: await hashFileSha256(absolute)
        });
    }
    return {
        schemaVersion: DEV_DATASET_INTEGRITY_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        snapshotSchemaVersion: Number.isFinite(Number(snapshot?.schemaVersion)) ? Number(snapshot?.schemaVersion) : null,
        files: {
            manifest: { path: 'manifest.json', sha256: await hashFileSha256(manifestPath) },
            report: { path: 'report.json', sha256: await hashFileSha256(reportPath) },
            snapshot: { path: 'snapshot.json', sha256: await hashFileSha256(snapshotPath) },
            logs
        }
    };
};

const validateDatasetIntegrity = async (datasetDir: string) => {
    const issues: string[] = [];
    const integrityPath = path.join(datasetDir, DEV_DATASET_INTEGRITY_FILE);
    const snapshotPath = path.join(datasetDir, 'snapshot.json');
    let snapshotSchemaVersion: number | null = null;
    try {
        if (fs.existsSync(snapshotPath)) {
            const snapshot = JSON.parse(await fs.promises.readFile(snapshotPath, 'utf-8'));
            const schemaVersion = Number(snapshot?.schemaVersion);
            if (Number.isFinite(schemaVersion)) {
                snapshotSchemaVersion = Math.floor(schemaVersion);
                if (snapshotSchemaVersion > DEV_DATASET_SNAPSHOT_SCHEMA_VERSION) {
                    issues.push(`Unsupported snapshot schema version ${snapshotSchemaVersion}.`);
                }
            }
        }
    } catch (err: any) {
        issues.push(`Failed to read snapshot.json: ${err?.message || err}`);
    }

    if (!fs.existsSync(integrityPath)) {
        return { ok: issues.length === 0, issues, hasIntegrityFile: false, snapshotSchemaVersion };
    }

    let integrity: any = null;
    try {
        integrity = JSON.parse(await fs.promises.readFile(integrityPath, 'utf-8'));
    } catch (err: any) {
        issues.push(`Failed to read integrity.json: ${err?.message || err}`);
        return { ok: false, issues, hasIntegrityFile: true, snapshotSchemaVersion };
    }

    const schemaVersion = Number(integrity?.schemaVersion);
    if (!Number.isFinite(schemaVersion) || schemaVersion !== DEV_DATASET_INTEGRITY_SCHEMA_VERSION) {
        issues.push('Unsupported integrity schema version.');
    }

    const files = integrity?.files || {};
    const verifyFile = async (entry: any, label: string) => {
        if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
            issues.push(`Missing checksum entry for ${label}.`);
            return;
        }
        const filePath = path.join(datasetDir, entry.path);
        if (!fs.existsSync(filePath)) {
            issues.push(`Missing file for ${label}: ${entry.path}`);
            return;
        }
        const checksum = await hashFileSha256(filePath);
        if (checksum !== entry.sha256) {
            issues.push(`Checksum mismatch for ${entry.path}`);
        }
    };

    await verifyFile(files.manifest, 'manifest');
    await verifyFile(files.report, 'report');
    await verifyFile(files.snapshot, 'snapshot');

    const logEntries = Array.isArray(files.logs) ? files.logs : [];
    if (logEntries.length === 0) {
        issues.push('Missing log checksum entries.');
    } else {
        for (let i = 0; i < logEntries.length; i += 1) {
            const entry = logEntries[i];
            await verifyFile(entry, `log #${i + 1}`);
        }
    }

    return { ok: issues.length === 0, issues, hasIntegrityFile: true, snapshotSchemaVersion };
};

const readJsonFilesWithLimit = async <T = any>(paths: string[], limit = 8): Promise<T[]> => {
    const results: T[] = new Array(paths.length);
    let index = 0;

    const worker = async () => {
        while (index < paths.length) {
            const current = index;
            index += 1;
            const raw = await fs.promises.readFile(paths[current], 'utf-8');
            results[current] = JSON.parse(raw) as T;
        }
    };

    const workers = Array.from({ length: Math.min(limit, paths.length) }, () => worker());
    await Promise.all(workers);
    return results;
};

const resolveTimestampSeconds = (value: any): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return undefined;
        return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
    }
    const raw = String(value).trim();
    if (!raw) return undefined;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed / 1000);
    const normalized = raw.replace(/([+-]\d{2})$/, '$1:00');
    const reparsed = Date.parse(normalized);
    if (Number.isFinite(reparsed) && reparsed > 0) return Math.floor(reparsed / 1000);
    return undefined;
};

const resolveDetailsUploadTime = (details: any, fallback?: any): number | undefined => {
    return resolveTimestampSeconds(
        details?.uploadTime
        ?? fallback?.uploadTime
        ?? details?.timeStartStd
        ?? details?.timeStart
        ?? details?.timeEndStd
        ?? details?.timeEnd
    );
};

const pruneDetailsForStats = (details: any) => {
    if (!details || typeof details !== 'object') return details;
    const pick = (obj: any, keys: string[]) => {
        const out: any = {};
        keys.forEach((key) => {
            if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
                out[key] = obj[key];
            }
        });
        return out;
    };
    const pruned: any = pick(details, [
        'players',
        'targets',
        'durationMS',
        'uploadTime',
        'timeStart',
        'timeStartStd',
        'timeEnd',
        'timeEndStd',
        'fightName',
        'zone',
        'mapName',
        'map',
        'location',
        'permalink',
        'uploadLinks',
        'success',
        'teamBreakdown',
        'teamCounts',
        'combatReplayMetaData',
        'skillMap',
        'buffMap',
        'encounterDuration',
        'player_damage_mitigation',
        'player_minion_damage_mitigation',
        'playerDamageMitigation',
        'playerMinionDamageMitigation'
    ]);
    if (Array.isArray(pruned.players)) {
        pruned.players = pruned.players.map((player: any) => {
            const base = pick(player, [
                'name',
                'display_name',
                'character_name',
                'profession',
                'elite_spec',
                'group',
                'dpsAll',
                'statsAll',
                'dpsTargets',
                'statsTargets',
                'defenses',
                'support',
                'rotation',
                'extHealingStats',
                'extBarrierStats',
                'squadBuffVolumes',
                'selfBuffs',
                'groupBuffs',
                'squadBuffs',
                'selfBuffsActive',
                'groupBuffsActive',
                'squadBuffsActive',
                'buffUptimes',
                'totalDamageDist',
                'targetDamageDist',
                'damage1S',
                'targetDamage1S',
                'powerDamageTaken1S',
                'targetPowerDamage1S',
                'totalDamageTaken',
                'totalDamageTakenDist',
                'minions',
                'combatReplayData',
                'hasCommanderTag',
                'notInSquad',
                'account',
                'activeTimes',
                'teamID',
                'teamId',
                'team',
                'teamColor',
                'team_color'
            ]);
            return base;
        });
    }
    if (Array.isArray(pruned.targets)) {
        pruned.targets = pruned.targets.map((target: any) =>
            pick(target, [
                'id',
                'name',
                'isFake',
                'dpsAll',
                'statsAll',
                'defenses',
                'totalHealth',
                'healthPercentBurned',
                'enemyPlayer',
                'totalDamageDist',
                'powerDamage1S',
                'damage1S',
                'profession',
                'teamID',
                'teamId',
                'team',
                'teamColor',
                'team_color'
            ])
        );
    }
    return pruned;
};

const buildManifestEntry = (details: any, filePath: string, index: number) => {
    const players = Array.isArray(details?.players) ? details.players : [];
    const squadCount = players.filter((p: any) => !p?.notInSquad).length;
    const nonSquadCount = players.filter((p: any) => p?.notInSquad).length;
    return {
        id: details?.id || `dev-log-${index + 1}`,
        filePath,
        fightName: details?.fightName,
        encounterDuration: details?.encounterDuration,
        uploadTime: resolveDetailsUploadTime(details),
        timeStart: details?.timeStart,
        timeStartStd: details?.timeStartStd,
        durationMS: details?.durationMS,
        success: details?.success,
        playerCount: players.length,
        squadCount,
        nonSquadCount
    };
};

const writeJsonFilesWithLimit = async (
    entries: Array<{ path: string; data: any }>,
    limit = 8,
    onProgress?: (written: number, total: number) => void
) => {
    let index = 0;
    let written = 0;
    const total = entries.length;

    const worker = async () => {
        while (index < entries.length) {
            const current = index;
            index += 1;
            const entry = entries[current];
            await fs.promises.writeFile(entry.path, JSON.stringify(entry.data), 'utf-8');
            written += 1;
            onProgress?.(written, total);
        }
    };

    const workers = Array.from({ length: Math.min(limit, entries.length) }, () => worker());
    await Promise.all(workers);
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
let resolvedRetryCount = 0;
const activeUploads = new Set<string>();
const pendingDiscordLogs = new Map<string, { result: any, jsonDetails: any }>();
const recentDiscordSends = new Map<string, number>();
const DISCORD_DEDUPE_TTL_MS = 2 * 60 * 1000;
let bulkUploadMode = false;
const BULK_PROCESS_CONCURRENCY = 3;
const bulkLogDetailsCache = new Map<string, any>();
const globalManifest: Array<any> = [];
const globalManifestPath = () => path.join(process.cwd(), 'dev', 'manifest.json');

const updateGlobalManifest = async (details: any, filePath: string) => {
    try {
        const entry = buildManifestEntry(details, filePath, globalManifest.length);
        const existingIndex = globalManifest.findIndex((item) => item.filePath === filePath);
        if (existingIndex >= 0) {
            globalManifest[existingIndex] = { ...globalManifest[existingIndex], ...entry };
        } else {
            globalManifest.push(entry);
        }
        await fs.promises.mkdir(path.dirname(globalManifestPath()), { recursive: true });
        await fs.promises.writeFile(globalManifestPath(), JSON.stringify({ updatedAt: new Date().toISOString(), logs: globalManifest }, null, 2), 'utf-8');
    } catch (err: any) {
        console.warn('[Main] Failed to update global manifest:', err?.message || err);
    }
};
const GITHUB_PROTOCOL = 'arcbridge';
const GITHUB_DEVICE_CLIENT_ID = process.env.GITHUB_DEVICE_CLIENT_ID || 'Ov23liFh1ih9LAcnLACw';

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';

const getUploadRetryQueuePayload = (): UploadRetryQueuePayload => {
    const queue = loadUploadRetryQueue();
    const state = loadUploadRetryState();
    const entries = Object.values(queue).sort((a, b) => b.failedAt.localeCompare(a.failedAt));
    return {
        failed: entries.filter((entry) => entry.state === 'failed').length,
        retrying: entries.filter((entry) => entry.state === 'retrying').length,
        resolved: resolvedRetryCount,
        paused: state.paused,
        pauseReason: state.pauseReason,
        pausedAt: state.pausedAt,
        entries
    };
};

const sendUploadRetryQueueUpdate = () => {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('upload-retry-queue-updated', getUploadRetryQueuePayload());
};

const trimUploadRetryQueue = (queue: Record<string, UploadRetryQueueEntry>) => {
    const entries = Object.values(queue);
    if (entries.length <= MAX_UPLOAD_RETRY_QUEUE_ENTRIES) return queue;
    const sorted = entries.sort((a, b) => a.failedAt.localeCompare(b.failedAt));
    const overflow = sorted.length - MAX_UPLOAD_RETRY_QUEUE_ENTRIES;
    for (let i = 0; i < overflow; i += 1) {
        delete queue[sorted[i].filePath];
    }
    return queue;
};

const inferUploadRetryFailureCategory = (error: string, statusCode?: number): UploadRetryFailureCategory => {
    const text = String(error || '').toLowerCase();
    if (statusCode === 429 || text.includes('rate limit')) return 'rate-limit';
    if (statusCode === 401 || statusCode === 403 || text.includes('unauthorized') || text.includes('forbidden') || text.includes('token') || text.includes('auth')) return 'auth';
    if (statusCode === 400 || statusCode === 413 || statusCode === 415 || statusCode === 422 || text.includes('enoent') || text.includes('eacces') || text.includes('eperm') || text.includes('file')) return 'file';
    if (statusCode === undefined || statusCode === null) {
        if (text.includes('timeout') || text.includes('network') || text.includes('socket') || text.includes('econnreset') || text.includes('econnrefused') || text.includes('enotfound') || text.includes('eai_again') || text.includes('etimedout')) {
            return 'network';
        }
    }
    return 'unknown';
};

const setUploadRetryPaused = (paused: boolean, reason: string | null = null) => {
    const nextState: UploadRetryRuntimeState = {
        paused,
        pauseReason: paused ? (reason || 'Retries paused.') : null,
        pausedAt: paused ? new Date().toISOString() : null
    };
    saveUploadRetryState(nextState);
    sendUploadRetryQueueUpdate();
};

const markUploadRetryFailure = (filePath: string, error: string, statusCode?: number) => {
    const queue = loadUploadRetryQueue();
    const previousAttempts = queue[filePath]?.attempts || 0;
    queue[filePath] = {
        filePath,
        error,
        statusCode,
        category: inferUploadRetryFailureCategory(error, statusCode),
        failedAt: new Date().toISOString(),
        attempts: previousAttempts + 1,
        state: 'failed'
    };
    saveUploadRetryQueue(trimUploadRetryQueue(queue));
    sendUploadRetryQueueUpdate();
};

const markUploadRetrying = (filePath: string) => {
    const queue = loadUploadRetryQueue();
    const existing = queue[filePath];
    if (!existing) return;
    queue[filePath] = {
        ...existing,
        state: 'retrying'
    };
    saveUploadRetryQueue(queue);
    sendUploadRetryQueueUpdate();
};

const markUploadRetryResolved = (filePath: string) => {
    const queue = loadUploadRetryQueue();
    if (!queue[filePath]) return;
    delete queue[filePath];
    resolvedRetryCount += 1;
    saveUploadRetryQueue(queue);
    sendUploadRetryQueueUpdate();
};

const processLogFile = async (filePath: string, options?: { retry?: boolean }) => {
    const fileId = path.basename(filePath);
    if (activeUploads.has(filePath)) {
        console.log(`[Main] processLogFile skipped (already active): ${filePath}`);
        return;
    }
    activeUploads.add(filePath);
    console.log(`[Main] processLogFile start: ${filePath}`);
    if (options?.retry) {
        markUploadRetrying(filePath);
        // Keep the visible chip flow consistent with first-time uploads.
        win?.webContents.send('upload-status', { id: fileId, filePath, status: 'uploading' });
    } else {
        win?.webContents.send('upload-status', { id: fileId, filePath, status: 'uploading' });
    }

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
                const reason = jsonDetails?.error || 'null-response';
                console.warn(`[Main] JSON details missing or error for ${filePath} (${result.permalink}): ${reason}`);
            }

            if (!jsonDetails || jsonDetails.error) {
                console.log('[Main] Retrying JSON fetch in 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                jsonDetails = await uploader.fetchDetailedJson(result.permalink);
                if (!jsonDetails || jsonDetails.error) {
                    const retryReason = jsonDetails?.error || 'null-response';
                    console.warn(`[Main] JSON details retry failed for ${filePath} (${result.permalink}): ${retryReason}`);
                }
            }

            if (jsonDetails && !jsonDetails.error) {
                jsonDetails = attachConditionMetrics(jsonDetails);
            }

            const cacheableDetails = jsonDetails && !jsonDetails.error ? jsonDetails : null;
            if (cacheKey && !cached?.entry?.result) {
                await saveDpsReportCacheEntry(cacheKey, result, cacheableDetails);
            } else if (cacheKey && cached?.entry?.result && cacheableDetails) {
                await updateDpsReportCacheDetails(cacheKey, cacheableDetails);
            }

            markUploadRetryResolved(filePath);

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
            const enemySplitSettings = {
                image: false,
                embed: false,
                tiled: false,
                ...(store.get('discordEnemySplitSettings') as any || {})
            };
            const globalSplitEnemiesByTeam = Boolean(store.get('discordSplitEnemiesByTeam', false));
            const splitEnemiesByTeam = globalSplitEnemiesByTeam || (notificationType === 'image-beta'
                ? Boolean(enemySplitSettings.tiled)
                : notificationType === 'embed'
                    ? Boolean(enemySplitSettings.embed)
                    : Boolean(enemySplitSettings.image));
            const selectedWebhookId = store.get('selectedWebhookId', null);
            const webhookUrl = store.get('discordWebhookUrl', null);
            const shouldSendDiscord = Boolean(selectedWebhookId) && typeof webhookUrl === 'string' && webhookUrl.length > 0;
            console.log(`[Main] Preparing Discord delivery. Configured type: ${notificationType}`);

            if (shouldSendDiscord) {
                try {
                    const dedupeKey = cacheKey || result.id || filePath;
                    const now = Date.now();
                    const lastSentAt = recentDiscordSends.get(dedupeKey);
                    if (lastSentAt && now - lastSentAt < DISCORD_DEDUPE_TTL_MS) {
                        console.warn(`[Main] Skipping duplicate Discord post for ${filePath} (dedupe key: ${dedupeKey}).`);
                    } else {
                        recentDiscordSends.set(dedupeKey, now);
                        if (recentDiscordSends.size > 500) {
                            for (const [key, timestamp] of recentDiscordSends) {
                                if (now - timestamp > DISCORD_DEDUPE_TTL_MS) {
                                    recentDiscordSends.delete(key);
                                }
                            }
                        }
                        if (notificationType === 'image' || notificationType === 'image-beta') {
                            const logKey = result.id || filePath;
                            if (!logKey) {
                                console.error('[Main] Discord notification skipped: missing log identifier.');
                            } else {
                                pendingDiscordLogs.set(logKey, { result: { ...result, filePath, id: logKey }, jsonDetails });
                                win?.webContents.send('request-screenshot', { ...result, id: logKey, filePath, details: jsonDetails, mode: notificationType, splitEnemiesByTeam });
                            }
                        } else {
                            await discord?.sendLog({ ...result, filePath, mode: 'embed', splitEnemiesByTeam }, jsonDetails);
                        }
                    }
                } catch (discordError: any) {
                    console.error('[Main] Discord notification failed:', discordError?.message || discordError);
                    // Still mark as success since upload worked, but log the Discord failure
                }
            } else {
                console.log('[Main] Discord notification skipped: no webhook selected.');
            }

            const hasDetails = Boolean(jsonDetails && !jsonDetails.error);
            const prunedDetails = hasDetails ? pruneDetailsForStats(jsonDetails) : null;
            const playerCount = Array.isArray(prunedDetails?.players) ? prunedDetails.players.length : undefined;
            const detailsSummary = {
                fightName: prunedDetails?.fightName,
                encounterDuration: prunedDetails?.encounterDuration,
                uploadTime: prunedDetails?.uploadTime,
                success: prunedDetails?.success
            };
            if (prunedDetails) {
                bulkLogDetailsCache.set(filePath, prunedDetails);
                void updateGlobalManifest(prunedDetails, filePath);
            }
            if (bulkUploadMode) {
                win?.webContents.send('upload-complete', {
                    ...result,
                    ...detailsSummary,
                    filePath,
                    status: hasDetails ? 'calculating' : 'success',
                    detailsAvailable: hasDetails,
                    playerCount
                });
                console.log(`[Main] upload-complete (bulk): ${filePath} players=${playerCount ?? 'n/a'}`);
            } else {
                win?.webContents.send('upload-complete', {
                    ...result,
                    ...detailsSummary,
                    filePath,
                    status: hasDetails ? 'calculating' : 'success',
                    detailsAvailable: hasDetails,
                    playerCount
                });
                console.log(`[Main] upload-complete: ${filePath} summary sent`);
            }
        } else {
            markUploadRetryFailure(filePath, result?.error || 'Unknown upload error', result?.statusCode);
            win?.webContents.send('upload-complete', { ...result, filePath, status: 'error' });
            console.log(`[Main] upload-complete error: ${filePath} msg=${result?.error || 'unknown'}`);
        }
    } catch (error: any) {
        console.error('[Main] Log processing failed:', error?.message || error);
        markUploadRetryFailure(filePath, error?.message || 'Unknown error during processing', error?.statusCode || error?.response?.status);
        win?.webContents.send('upload-complete', {
            id: fileId,
            filePath,
            status: 'error',
            error: error?.message || 'Unknown error during processing'
        });
        console.log(`[Main] upload-complete exception: ${filePath} msg=${error?.message || error}`);
    } finally {
        activeUploads.delete(filePath);
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

const normalizeUiThemeChoice = (value: unknown): 'classic' | 'modern' | 'crt' | 'matte' => {
    if (value === 'modern' || value === 'crt' || value === 'matte') return value;
    return 'classic';
};

const resolveWebUiThemeChoice = (appUiTheme: unknown, selectedThemeId: unknown): 'classic' | 'modern' | 'crt' | 'matte' => {
    if (selectedThemeId === MATTE_WEB_THEME_ID) return 'matte';
    if (selectedThemeId === CRT_WEB_THEME_ID) return 'crt';
    return normalizeUiThemeChoice(appUiTheme);
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
        sendUploadRetryQueueUpdate();
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
            topStatsMode: 'total',
            topSkillDamageSource: 'target',
            topSkillsMetric: 'damage'
        };
        const DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS = {
            image: false,
            embed: false,
            tiled: false
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
                discordEnemySplitSettings: { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) },
                discordSplitEnemiesByTeam: store.get('discordSplitEnemiesByTeam', (() => {
                    const perType = { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) };
                    return Boolean(perType.image || perType.embed || perType.tiled);
                })()),
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
                githubFavoriteRepos: store.get('githubFavoriteRepos', []),
                walkthroughSeen: store.get('walkthroughSeen', false)
            };
        });

        ipcMain.handle('clear-dps-report-cache', async (event) => {
            return clearDpsReportCache((progress) => {
                event.sender.send('clear-dps-report-cache-progress', progress);
            });
        });

        // Clear logs from store to improve boot time (persistence removed)
        if (store.has('logs')) {
            console.log('[Main] Clearing persistent logs to improve startup time.');
            store.delete('logs');
        }

        // Removed get-logs and save-logs handlers

        const applySettings = (settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'image' | 'image-beta' | 'embed', discordEnemySplitSettings?: { image?: boolean; embed?: boolean; tiled?: boolean }, discordSplitEnemiesByTeam?: boolean, webhooks?: any[], selectedWebhookId?: string | null, dpsReportToken?: string | null, closeBehavior?: 'minimize' | 'quit', embedStatSettings?: any, mvpWeights?: any, statsViewSettings?: any, disruptionMethod?: DisruptionMethod, uiTheme?: 'classic' | 'modern' | 'crt' | 'matte', githubRepoOwner?: string | null, githubRepoName?: string | null, githubBranch?: string | null, githubPagesBaseUrl?: string | null, githubToken?: string | null, githubWebTheme?: string | null, githubLogoPath?: string | null, githubFavoriteRepos?: string[], walkthroughSeen?: boolean }) => {
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
            if (settings.discordEnemySplitSettings !== undefined) {
                const merged = { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...settings.discordEnemySplitSettings };
                store.set('discordEnemySplitSettings', merged);
                if (settings.discordSplitEnemiesByTeam === undefined) {
                    store.set('discordSplitEnemiesByTeam', Boolean(merged.image || merged.embed || merged.tiled));
                }
            }
            if (settings.discordSplitEnemiesByTeam !== undefined) {
                store.set('discordSplitEnemiesByTeam', settings.discordSplitEnemiesByTeam);
                store.set('discordEnemySplitSettings', {
                    image: settings.discordSplitEnemiesByTeam,
                    embed: settings.discordSplitEnemiesByTeam,
                    tiled: settings.discordSplitEnemiesByTeam
                });
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
                if (typeof settings.dpsReportToken === 'string' && settings.dpsReportToken.trim().length > 0) {
                    setUploadRetryPaused(false, null);
                }
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
            if (settings.walkthroughSeen !== undefined) {
                store.set('walkthroughSeen', settings.walkthroughSeen);
            }
        };

        ipcMain.on('save-settings', (_event, settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'image' | 'image-beta' | 'embed', discordEnemySplitSettings?: { image?: boolean; embed?: boolean; tiled?: boolean }, discordSplitEnemiesByTeam?: boolean, webhooks?: any[], selectedWebhookId?: string | null, dpsReportToken?: string | null, closeBehavior?: 'minimize' | 'quit', embedStatSettings?: any, mvpWeights?: any, statsViewSettings?: any, disruptionMethod?: DisruptionMethod, uiTheme?: 'classic' | 'modern' | 'crt' | 'matte', githubRepoOwner?: string | null, githubRepoName?: string | null, githubBranch?: string | null, githubPagesBaseUrl?: string | null, githubToken?: string | null, githubWebTheme?: string | null, githubLogoPath?: string | null, githubFavoriteRepos?: string[], walkthroughSeen?: boolean }) => {
            applySettings(settings);
        });

        const bringDialogParentToFront = (parent: BrowserWindow | null) => {
            if (!parent) return;
            parent.show();
            parent.focus();
            try {
                app.focus({ steal: true });
            } catch {
                // noop
            }
            if (parent.isAlwaysOnTop()) {
                parent.setAlwaysOnTop(false);
            }
        };

        ipcMain.handle('export-settings', async () => {
            const parent = BrowserWindow.getFocusedWindow() || win || null;
            bringDialogParentToFront(parent);
            if (!parent) return { success: false, error: 'Window unavailable.' };
            const result = await dialog.showSaveDialog(parent, {
                title: 'Export ArcBridge Settings',
                defaultPath: 'arcbridge-settings.json',
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (result.canceled || !result.filePath) return { success: false, canceled: true };

            const settings = {
                logDirectory: store.get('logDirectory', null),
                discordWebhookUrl: store.get('discordWebhookUrl', null),
                discordNotificationType: store.get('discordNotificationType', 'image'),
                discordEnemySplitSettings: { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) },
                discordSplitEnemiesByTeam: store.get('discordSplitEnemiesByTeam', (() => {
                    const perType = { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) };
                    return Boolean(perType.image || perType.embed || perType.tiled);
                })()),
                webhooks: store.get('webhooks', []),
                selectedWebhookId: store.get('selectedWebhookId', null),
                dpsReportToken: store.get('dpsReportToken', null),
                closeBehavior: store.get('closeBehavior', 'minimize'),
                embedStatSettings: store.get('embedStatSettings', DEFAULT_EMBED_STATS),
                mvpWeights: { ...DEFAULT_MVP_WEIGHTS, ...(store.get('mvpWeights') as any || {}) },
                statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
                disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
                uiTheme: store.get('uiTheme', 'classic'),
                githubRepoOwner: store.get('githubRepoOwner', null),
                githubRepoName: store.get('githubRepoName', null),
                githubBranch: store.get('githubBranch', 'main'),
                githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
                githubToken: store.get('githubToken', null),
                githubWebTheme: store.get('githubWebTheme', DEFAULT_WEB_THEME_ID),
                githubLogoPath: store.get('githubLogoPath', null),
                githubFavoriteRepos: store.get('githubFavoriteRepos', []),
                walkthroughSeen: store.get('walkthroughSeen', false)
            };

            try {
                await fs.promises.writeFile(result.filePath, JSON.stringify(settings, null, 2), 'utf-8');
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to write settings file.' };
            }
        });

        ipcMain.handle('import-settings', async () => {
            const parent = BrowserWindow.getFocusedWindow() || win || null;
            bringDialogParentToFront(parent);
            if (!parent) return { success: false, error: 'Window unavailable.' };
            const result = await dialog.showOpenDialog(parent, {
                title: 'Import ArcBridge Settings',
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
            const filePath = result.filePaths[0];
            try {
                const raw = await fs.promises.readFile(filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') {
                    return { success: false, error: 'Invalid settings file.' };
                }
                applySettings(parsed);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to import settings.' };
            }
        });

        ipcMain.handle('select-settings-file', async () => {
            const parent = BrowserWindow.getFocusedWindow() || win || null;
            bringDialogParentToFront(parent);
            if (!parent) return { success: false, error: 'Window unavailable.' };
            const result = await dialog.showOpenDialog(parent, {
                title: 'Select Settings File',
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
            const filePath = result.filePaths[0];
            try {
                const raw = await fs.promises.readFile(filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') {
                    return { success: false, error: 'Invalid settings file.' };
                }
                return { success: true, settings: parsed, filePath };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to read settings file.' };
            }
        });

        ipcMain.handle('list-dev-datasets', async () => {
            try {
                const dir = await ensureDevDatasetsDir();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const datasets = [];
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    if (isDevDatasetTempFolder(entry.name)) continue;
                    const datasetDir = path.join(dir, entry.name);
                    try {
                        const status = await readDevDatasetStatus(datasetDir);
                        if (status && status.complete !== true) continue;
                    } catch {
                        // Ignore unreadable status and continue listing legacy datasets.
                    }
                    const metaPath = path.join(dir, entry.name, 'meta.json');
                    try {
                        const raw = await fs.promises.readFile(metaPath, 'utf-8');
                        const parsed = JSON.parse(raw);
                        if (!parsed || typeof parsed !== 'object') continue;
                        datasets.push({
                            id: parsed.id || entry.name,
                            name: parsed.name || 'Unnamed Dataset',
                            createdAt: parsed.createdAt || new Date(0).toISOString()
                        });
                    } catch {
                        // Ignore unreadable dataset folders.
                    }
                }
                datasets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
                return { success: true, datasets };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to list datasets.' };
            }
        });

        ipcMain.handle('save-dev-dataset', async (event, payload: { id?: string; name: string; logs: any[]; report?: any; snapshot?: any }) => {
            try {
                const dir = await ensureDevDatasetsDir();
                const baseId = payload.id || `${Date.now()}`;
                const id = sanitizeDevDatasetId(baseId) || `${Date.now()}`;
                const name = payload.name?.trim() || 'Dataset';
                const createdAt = new Date().toISOString();
                const folderName = getDevDatasetFolderName(id, name);
                const tempFolderName = getDevDatasetTempFolderName(folderName);
                const finalDatasetDir = path.join(dir, folderName);
                const datasetDir = path.join(dir, tempFolderName);
                const logsDir = path.join(datasetDir, 'logs');
                if (fs.existsSync(finalDatasetDir)) return { success: false, error: 'Dataset already exists.' };
                if (fs.existsSync(datasetDir)) {
                    await fs.promises.rm(datasetDir, { recursive: true, force: true });
                }
                await fs.promises.mkdir(logsDir, { recursive: true });
                event.sender.send('dev-dataset-save-progress', { id, stage: 'folder', written: 0, total: 0 });
                const meta = { id, name, createdAt, folder: folderName };
                await fs.promises.writeFile(path.join(datasetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
                await fs.promises.writeFile(path.join(datasetDir, 'report.json'), JSON.stringify(payload.report || null), 'utf-8');
                await fs.promises.writeFile(path.join(datasetDir, 'snapshot.json'), JSON.stringify(normalizeDevDatasetSnapshot(payload.snapshot), null, 2), 'utf-8');
                await fs.promises.writeFile(path.join(datasetDir, 'manifest.json'), JSON.stringify({ ...meta, logs: [] }, null, 2), 'utf-8');
                await writeDevDatasetStatus(datasetDir, { complete: false, createdAt });
                const logs = Array.isArray(payload.logs) ? payload.logs : [];
                const manifestEntries: any[] = [];
                const entries = logs.map((log, index) => {
                    return { log, index };
                });
                const materializedEntries: Array<{ path: string; data: any }> = [];
                for (const { log, index } of entries) {
                    const details = log?.details ?? log;
                    const pruned = pruneDetailsForStats(details);
                    manifestEntries.push(buildManifestEntry(pruned, getDatasetRelativeLogPath(index), index));
                    materializedEntries.push({
                        path: path.join(logsDir, `log-${index + 1}.json`),
                        data: pruned
                    });
                }
                if (materializedEntries.length > 0) {
                    await writeJsonFilesWithLimit(materializedEntries, 8, (written, total) => {
                        event.sender.send('dev-dataset-save-progress', { id, stage: 'logs', written, total });
                    });
                }
                if (manifestEntries.length > 0) {
                    await fs.promises.writeFile(
                        path.join(datasetDir, 'manifest.json'),
                        JSON.stringify({ ...meta, logs: manifestEntries }, null, 2),
                        'utf-8'
                    );
                }
                const integrity = await buildDatasetIntegrity(datasetDir);
                await fs.promises.writeFile(path.join(datasetDir, DEV_DATASET_INTEGRITY_FILE), JSON.stringify(integrity, null, 2), 'utf-8');
                await writeDevDatasetStatus(datasetDir, { complete: true, createdAt, completedAt: new Date().toISOString(), totalLogs: logs.length });
                await fs.promises.rename(datasetDir, finalDatasetDir);
                event.sender.send('dev-dataset-save-progress', { id, stage: 'done', written: logs.length, total: logs.length });
                return { success: true, dataset: { id, name, createdAt } };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to save dataset.' };
            }
        });

        ipcMain.handle('begin-dev-dataset-save', async (_event, payload: { id?: string; name: string; report?: any; snapshot?: any }) => {
            try {
                const dir = await ensureDevDatasetsDir();
                const baseId = payload.id || `${Date.now()}`;
                const id = sanitizeDevDatasetId(baseId) || `${Date.now()}`;
                const name = payload.name?.trim() || 'Dataset';
                const createdAt = new Date().toISOString();
                const folderName = getDevDatasetFolderName(id, name);
                const tempFolderName = getDevDatasetTempFolderName(folderName);
                const finalDatasetDir = path.join(dir, folderName);
                const datasetDir = path.join(dir, tempFolderName);
                const logsDir = path.join(datasetDir, 'logs');
                if (fs.existsSync(finalDatasetDir)) return { success: false, error: 'Dataset already exists.' };
                if (fs.existsSync(datasetDir)) {
                    await fs.promises.rm(datasetDir, { recursive: true, force: true });
                }
                await fs.promises.mkdir(logsDir, { recursive: true });
                const meta = { id, name, createdAt, folder: folderName };
                await fs.promises.writeFile(path.join(datasetDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
                await fs.promises.writeFile(path.join(datasetDir, 'report.json'), JSON.stringify(payload.report || null), 'utf-8');
                await fs.promises.writeFile(path.join(datasetDir, 'snapshot.json'), JSON.stringify(normalizeDevDatasetSnapshot(payload.snapshot), null, 2), 'utf-8');
                await fs.promises.writeFile(path.join(datasetDir, 'manifest.json'), JSON.stringify({ ...meta, logs: [] }, null, 2), 'utf-8');
                await writeDevDatasetStatus(datasetDir, { complete: false, createdAt });
                devDatasetFolderCache.set(id, datasetDir);
                devDatasetFinalFolderCache.set(id, finalDatasetDir);
                devDatasetManifestCache.set(id, { meta, logs: [] });
                return { success: true, dataset: { id, name, createdAt } };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to start dataset save.' };
            }
        });

        ipcMain.handle('append-dev-dataset-logs', async (event, payload: { id: string; logs: any[]; startIndex: number; total?: number }) => {
            try {
                const id = sanitizeDevDatasetId(payload.id);
                if (!id) return { success: false, error: 'Invalid dataset id.' };
                let datasetDir = devDatasetFolderCache.get(id);
                if (!datasetDir) {
                    const dir = await ensureDevDatasetsDir();
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                    const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${DEV_DATASET_TEMP_PREFIX}${id}-`));
                    if (!folder) return { success: false, error: 'Dataset not found.' };
                    datasetDir = path.join(dir, folder.name);
                    devDatasetFolderCache.set(id, datasetDir);
                    devDatasetFinalFolderCache.set(id, path.join(dir, folder.name.replace(DEV_DATASET_TEMP_PREFIX, '')));
                }
                const logsDir = path.join(datasetDir, 'logs');
                const logs = Array.isArray(payload.logs) ? payload.logs : [];
                const entries: Array<{ path: string; data: any }> = [];
                for (let index = 0; index < logs.length; index += 1) {
                    const log = logs[index];
                    const details = log?.details ?? log;
                    const pruned = pruneDetailsForStats(details);
                    const manifest = devDatasetManifestCache.get(id);
                    if (manifest) {
                        manifest.logs.push(buildManifestEntry(pruned, getDatasetRelativeLogPath(payload.startIndex + index), payload.startIndex + index));
                    }
                    entries.push({
                        path: path.join(logsDir, `log-${payload.startIndex + index + 1}.json`),
                        data: pruned
                    });
                }
                if (entries.length > 0) {
                    await writeJsonFilesWithLimit(entries, 8);
                }
                if (payload.total) {
                    const written = Math.min(payload.startIndex + logs.length, payload.total);
                    event.sender.send('dev-dataset-save-progress', { id, stage: 'logs', written, total: payload.total });
                }
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to append dataset logs.' };
            }
        });

        ipcMain.handle('finish-dev-dataset-save', async (_event, payload: { id: string; total: number }) => {
            try {
                const id = sanitizeDevDatasetId(payload.id);
                if (!id) return { success: false, error: 'Invalid dataset id.' };
                let datasetDir = devDatasetFolderCache.get(id);
                if (!datasetDir) {
                    const dir = await ensureDevDatasetsDir();
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                    const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${DEV_DATASET_TEMP_PREFIX}${id}-`));
                    if (!folder) return { success: false, error: 'Dataset not found.' };
                    datasetDir = path.join(dir, folder.name);
                    devDatasetFolderCache.set(id, datasetDir);
                }
                let finalDatasetDir = devDatasetFinalFolderCache.get(id);
                if (!finalDatasetDir) {
                    const dir = await ensureDevDatasetsDir();
                    const folderName = path.basename(datasetDir);
                    finalDatasetDir = path.join(dir, folderName.startsWith(DEV_DATASET_TEMP_PREFIX) ? folderName.replace(DEV_DATASET_TEMP_PREFIX, '') : folderName);
                    devDatasetFinalFolderCache.set(id, finalDatasetDir);
                }
                const manifest = devDatasetManifestCache.get(id);
                if (manifest) {
                    await fs.promises.writeFile(
                        path.join(datasetDir, 'manifest.json'),
                        JSON.stringify({ ...manifest.meta, logs: manifest.logs }, null, 2),
                        'utf-8'
                    );
                }
                const integrity = await buildDatasetIntegrity(datasetDir);
                await fs.promises.writeFile(path.join(datasetDir, DEV_DATASET_INTEGRITY_FILE), JSON.stringify(integrity, null, 2), 'utf-8');
                await writeDevDatasetStatus(datasetDir, { complete: true, completedAt: new Date().toISOString(), totalLogs: payload.total });
                if (fs.existsSync(finalDatasetDir)) return { success: false, error: 'Dataset already exists.' };
                await fs.promises.rename(datasetDir, finalDatasetDir);
                devDatasetManifestCache.delete(id);
                devDatasetFolderCache.delete(id);
                devDatasetFinalFolderCache.delete(id);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to finish dataset save.' };
            }
        });

        ipcMain.handle('load-dev-dataset', async (_event, payload: { id: string; allowLogsOnlyOnIntegrityFailure?: boolean }) => {
            try {
                const dir = await ensureDevDatasetsDir();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const id = sanitizeDevDatasetId(payload.id);
                if (!id) return { success: false, error: 'Invalid dataset id.' };
                const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${id}-`));
                if (!folder) return { success: false, error: 'Dataset not found.' };
                const datasetDir = path.join(dir, folder.name);
                const status = await readDevDatasetStatus(datasetDir);
                if (status && status.complete !== true) {
                    return { success: false, error: 'Dataset is incomplete and cannot be loaded yet.' };
                }
                const integrity = await validateDatasetIntegrity(datasetDir);
                const logsOnlyFallback = !integrity.ok;
                if (logsOnlyFallback && !payload.allowLogsOnlyOnIntegrityFailure) {
                    return {
                        success: false,
                        error: `Dataset integrity check failed: ${integrity.issues.join(' ')}`,
                        canLoadLogsOnly: true,
                        integrity
                    };
                }
                const metaPath = path.join(datasetDir, 'meta.json');
                const reportPath = path.join(datasetDir, 'report.json');
                const snapshotPath = path.join(datasetDir, 'snapshot.json');
                const manifestPath = path.join(datasetDir, 'manifest.json');
                const logsDir = path.join(datasetDir, 'logs');
                const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
                const meta = JSON.parse(metaRaw);
                let manifest: any = null;
                try {
                    if (fs.existsSync(manifestPath)) {
                        const manifestRaw = await fs.promises.readFile(manifestPath, 'utf-8');
                        manifest = JSON.parse(manifestRaw);
                    }
                } catch (manifestError: any) {
                    console.warn('[Main] Failed to read dev dataset manifest.json:', manifestError?.message || manifestError);
                }
                let report: any = null;
                if (!logsOnlyFallback) {
                    try {
                        const reportStat = await fs.promises.stat(reportPath);
                        if (reportStat.size <= MAX_DEV_DATASET_REPORT_BYTES) {
                            const reportRaw = await fs.promises.readFile(reportPath, 'utf-8');
                            report = JSON.parse(reportRaw);
                        } else {
                            console.warn(`[Main] Skipping dev dataset report.json (${reportStat.size} bytes) to avoid OOM.`);
                        }
                    } catch (reportError: any) {
                        console.warn('[Main] Failed to read dev dataset report.json:', reportError?.message || reportError);
                    }
                }
                let snapshot: any = null;
                if (!logsOnlyFallback) {
                    try {
                        if (fs.existsSync(snapshotPath)) {
                            const snapshotRaw = await fs.promises.readFile(snapshotPath, 'utf-8');
                            snapshot = normalizeDevDatasetSnapshot(JSON.parse(snapshotRaw));
                        }
                    } catch (snapshotError: any) {
                        console.warn('[Main] Failed to read dev dataset snapshot.json:', snapshotError?.message || snapshotError);
                    }
                }
                const logPaths = await resolveOrderedDatasetLogPaths(datasetDir, logsDir, manifest, snapshot);
                const snapshotLogIds = Array.isArray(snapshot?.state?.datasetLogIds) ? snapshot.state.datasetLogIds : null;
                const logs = await readJsonFilesWithLimit(logPaths, 1);
                const slimLogs = logs.map((entry: any, index: number) => {
                    const details = entry?.details ?? entry ?? {};
                    const snapshotId = snapshotLogIds && typeof snapshotLogIds[index] === 'string'
                        ? snapshotLogIds[index]
                        : null;
                    return {
                        id: snapshotId || entry?.id || details?.id || `dev-log-${index + 1}`,
                        filePath: logPaths[index],
                        status: 'calculating',
                        detailsAvailable: true,
                        fightName: details?.fightName || entry?.fightName,
                        encounterDuration: details?.encounterDuration || entry?.encounterDuration,
                        uploadTime: resolveDetailsUploadTime(details, entry)
                    };
                });
                return { success: true, dataset: { ...meta, logs: slimLogs, report, manifest, snapshot }, integrity, logsOnlyFallback };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to load dataset.' };
            }
        });

        ipcMain.handle('load-dev-dataset-chunked', async (event, payload: { id: string; chunkSize?: number; allowLogsOnlyOnIntegrityFailure?: boolean }) => {
            try {
                const dir = await ensureDevDatasetsDir();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const id = sanitizeDevDatasetId(payload.id);
                if (!id) return { success: false, error: 'Invalid dataset id.' };
                const folder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${id}-`));
                if (!folder) return { success: false, error: 'Dataset not found.' };
                const datasetDir = path.join(dir, folder.name);
                const status = await readDevDatasetStatus(datasetDir);
                if (status && status.complete !== true) {
                    return { success: false, error: 'Dataset is incomplete and cannot be loaded yet.' };
                }
                const integrity = await validateDatasetIntegrity(datasetDir);
                const logsOnlyFallback = !integrity.ok;
                if (logsOnlyFallback && !payload.allowLogsOnlyOnIntegrityFailure) {
                    return {
                        success: false,
                        error: `Dataset integrity check failed: ${integrity.issues.join(' ')}`,
                        canLoadLogsOnly: true,
                        integrity
                    };
                }
                const metaPath = path.join(datasetDir, 'meta.json');
                const reportPath = path.join(datasetDir, 'report.json');
                const snapshotPath = path.join(datasetDir, 'snapshot.json');
                const manifestPath = path.join(datasetDir, 'manifest.json');
                const logsDir = path.join(datasetDir, 'logs');
                const metaRaw = await fs.promises.readFile(metaPath, 'utf-8');
                const meta = JSON.parse(metaRaw);
                let manifest: any = null;
                try {
                    if (fs.existsSync(manifestPath)) {
                        const manifestRaw = await fs.promises.readFile(manifestPath, 'utf-8');
                        manifest = JSON.parse(manifestRaw);
                    }
                } catch (manifestError: any) {
                    console.warn('[Main] Failed to read dev dataset manifest.json:', manifestError?.message || manifestError);
                }
                let report: any = null;
                if (!logsOnlyFallback) {
                    try {
                        const reportStat = await fs.promises.stat(reportPath);
                        if (reportStat.size <= MAX_DEV_DATASET_REPORT_BYTES) {
                            const reportRaw = await fs.promises.readFile(reportPath, 'utf-8');
                            report = JSON.parse(reportRaw);
                        } else {
                            console.warn(`[Main] Skipping dev dataset report.json (${reportStat.size} bytes) to avoid OOM.`);
                        }
                    } catch (reportError: any) {
                        console.warn('[Main] Failed to read dev dataset report.json:', reportError?.message || reportError);
                    }
                }
                let snapshot: any = null;
                if (!logsOnlyFallback) {
                    try {
                        if (fs.existsSync(snapshotPath)) {
                            const snapshotRaw = await fs.promises.readFile(snapshotPath, 'utf-8');
                            snapshot = normalizeDevDatasetSnapshot(JSON.parse(snapshotRaw));
                        }
                    } catch (snapshotError: any) {
                        console.warn('[Main] Failed to read dev dataset snapshot.json:', snapshotError?.message || snapshotError);
                    }
                }
                const logPaths = await resolveOrderedDatasetLogPaths(datasetDir, logsDir, manifest, snapshot);
                const snapshotLogIds = Array.isArray(snapshot?.state?.datasetLogIds) ? snapshot.state.datasetLogIds : null;
                const chunkSize = Math.max(1, Math.min(payload.chunkSize || 25, 200));

                void (async () => {
                    for (let i = 0; i < logPaths.length; i += chunkSize) {
                        const chunkPaths = logPaths.slice(i, i + chunkSize);
                        const logs = await readJsonFilesWithLimit(chunkPaths, 1);
                        const slimLogs = logs.map((entry: any, offset: number) => {
                            const details = entry?.details ?? entry ?? {};
                            const absoluteIndex = i + offset;
                            const snapshotId = snapshotLogIds && typeof snapshotLogIds[absoluteIndex] === 'string'
                                ? snapshotLogIds[absoluteIndex]
                                : null;
                            return {
                                id: snapshotId || entry?.id || details?.id || `dev-log-${absoluteIndex + 1}`,
                                filePath: chunkPaths[offset],
                                status: 'calculating',
                                detailsAvailable: true,
                                fightName: details?.fightName || entry?.fightName,
                                encounterDuration: details?.encounterDuration || entry?.encounterDuration,
                                uploadTime: resolveDetailsUploadTime(details, entry)
                            };
                        });
                        event.sender.send('dev-dataset-logs-chunk', {
                            id,
                            logs: slimLogs,
                            index: i,
                            total: logPaths.length,
                            done: i + chunkSize >= logPaths.length
                        });
                    }
                })();

                return { success: true, dataset: { ...meta, report, manifest, snapshot }, totalLogs: logPaths.length, integrity, logsOnlyFallback };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to load dataset.' };
            }
        });

        ipcMain.handle('delete-dev-dataset', async (_event, payload: { id: string }) => {
            try {
                const dir = await ensureDevDatasetsDir();
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const id = sanitizeDevDatasetId(payload.id);
                if (!id) return { success: false, error: 'Invalid dataset id.' };
                const folders = entries.filter((entry) =>
                    entry.isDirectory() && (
                        entry.name.startsWith(`${id}-`) ||
                        entry.name.startsWith(`${DEV_DATASET_TEMP_PREFIX}${id}-`)
                    )
                );
                if (folders.length === 0) return { success: false, error: 'Dataset not found.' };
                await Promise.all(folders.map((folder) => fs.promises.rm(path.join(dir, folder.name), { recursive: true, force: true })));
                devDatasetFolderCache.delete(id);
                devDatasetFinalFolderCache.delete(id);
                devDatasetManifestCache.delete(id);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to delete dataset.' };
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
            // Bounded concurrency lets non-upload steps overlap without flooding dps.report.
            (async () => {
                bulkUploadMode = filePaths.length > 1;
                const queue = [...filePaths];
                const workerCount = Math.min(BULK_PROCESS_CONCURRENCY, queue.length);
                const workers = Array.from({ length: workerCount }, async () => {
                    while (queue.length > 0) {
                        const nextPath = queue.shift();
                        if (!nextPath) return;
                        await processLogFile(nextPath);
                        await new Promise((resolve) => setTimeout(resolve, 25));
                    }
                });
                if (workers.length > 0) {
                    await Promise.all(workers);
                }
                bulkUploadMode = false;
            })();
        });

        ipcMain.handle('get-upload-retry-queue', async () => {
            return { success: true, queue: getUploadRetryQueuePayload() };
        });

        ipcMain.handle('retry-failed-uploads', async () => {
            const retryState = loadUploadRetryState();
            if (retryState.paused) {
                return { success: false, retried: 0, error: retryState.pauseReason || 'Retry queue is paused.', queue: getUploadRetryQueuePayload() };
            }
            const queue = loadUploadRetryQueue();
            const retryPaths = Object.values(queue)
                .filter((entry) => entry.state === 'failed')
                .sort((a, b) => a.failedAt.localeCompare(b.failedAt))
                .map((entry) => entry.filePath);
            if (retryPaths.length === 0) {
                return { success: true, retried: 0, queue: getUploadRetryQueuePayload() };
            }
            let retried = 0;
            let consecutiveAuthFailures = 0;
            for (const filePath of retryPaths) {
                if (!filePath || activeUploads.has(filePath)) continue;
                const fileId = path.basename(filePath);
                win?.webContents.send('upload-status', { id: fileId, filePath, status: 'queued' });
                await processLogFile(filePath, { retry: true });
                retried += 1;
                const refreshedQueue = loadUploadRetryQueue();
                const entry = refreshedQueue[filePath];
                if (entry?.state === 'failed' && entry.category === 'auth') {
                    consecutiveAuthFailures += 1;
                    if (consecutiveAuthFailures >= AUTH_RETRY_PAUSE_THRESHOLD) {
                        setUploadRetryPaused(
                            true,
                            `Retries paused after ${AUTH_RETRY_PAUSE_THRESHOLD} consecutive authentication failures. Update your dps.report token in Settings and resume retries.`
                        );
                        break;
                    }
                } else if (!entry || entry.category !== 'auth') {
                    consecutiveAuthFailures = 0;
                }
            }
            return { success: true, retried, queue: getUploadRetryQueuePayload() };
        });

        ipcMain.handle('resume-upload-retries', async () => {
            setUploadRetryPaused(false, null);
            return { success: true, queue: getUploadRetryQueuePayload() };
        });

        ipcMain.handle('get-log-details', async (_event, payload: { filePath: string }) => {
            const filePath = payload?.filePath;
            if (!filePath) {
                console.warn('[Main] get-log-details missing filePath');
                return { success: false, error: 'Missing filePath.' };
            }
            const details = bulkLogDetailsCache.get(filePath);
            if (details) {
                console.log(`[Main] get-log-details hit: ${filePath}`);
                return { success: true, details };
            }
            try {
                const devDir = getDevDatasetsDir();
                if (filePath.startsWith(devDir) && filePath.endsWith('.json')) {
                    const raw = await fs.promises.readFile(filePath, 'utf-8');
                    const parsed = JSON.parse(raw);
                    const resolved = pruneDetailsForStats(parsed?.details ?? parsed);
                    console.log(`[Main] get-log-details dev-dataset: ${filePath}`);
                    return { success: true, details: resolved };
                }
            } catch (err: any) {
                console.warn('[Main] get-log-details failed:', err?.message || err);
            }
            console.warn(`[Main] get-log-details not found: ${filePath}`);
            return { success: false, error: 'Details not found.' };
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

        ipcMain.handle('fetch-image-data-url', async (_event, url: string) => {
            try {
                if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL.' };
                if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Unsupported URL scheme.' };
                const { buffer, contentType } = await fetchImageBuffer(url);
                const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
                return { success: true, dataUrl };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to fetch image.' };
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
                        if (entry.path.startsWith(`${pagesPrefix}svg/class-icons/`)) hasClassIcons = true;
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

                const uiTheme = store.get('uiTheme', 'classic') as string;
                const availableThemes = uiTheme === 'crt' ? [CRT_WEB_THEME] : [...BASE_WEB_THEMES, MATTE_WEB_THEME];
                const requestedThemeId = payload?.themeId
                    || (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string)
                    || DEFAULT_WEB_THEME_ID;
                const themeId = uiTheme === 'crt' ? CRT_WEB_THEME_ID : (uiTheme === 'matte' ? MATTE_WEB_THEME_ID : requestedThemeId);
                const selectedTheme = availableThemes.find((theme) => theme.id === themeId) || availableThemes[0];

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
                const uiThemeValue = resolveWebUiThemeChoice(uiTheme, selectedTheme?.id);
                const uiThemeBuffer = Buffer.from(JSON.stringify({ theme: uiThemeValue }, null, 2));
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
                        return { success: false, error: built.error || 'Failed to generate the web template automatically.', errorDetail: built.errorDetail };
                    }
                }

                const reportMeta = {
                    ...payload.meta,
                    appVersion: app.getVersion()
                };
                const uiTheme = store.get('uiTheme', 'classic') as string;
                const availableThemes = uiTheme === 'crt' ? [CRT_WEB_THEME] : [...BASE_WEB_THEMES, MATTE_WEB_THEME];
                const requestedThemeId = (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string) || DEFAULT_WEB_THEME_ID;
                const themeId = uiTheme === 'crt' ? CRT_WEB_THEME_ID : (uiTheme === 'matte' ? MATTE_WEB_THEME_ID : requestedThemeId);
                const selectedTheme = availableThemes.find((theme) => theme.id === themeId) || availableThemes[0];
                const uiThemeValue = resolveWebUiThemeChoice(uiTheme, selectedTheme?.id);
                const reportPayload = {
                    meta: reportMeta,
                    stats: {
                        ...(payload.stats || {}),
                        uiTheme: uiThemeValue,
                        webThemeId: selectedTheme?.id || DEFAULT_WEB_THEME_ID
                    }
                };

                sendWebUploadStatus('Packaging', 'Preparing report bundle...', 40);
                const stagingRoot = path.join(app.getPath('userData'), 'web-report-staging', reportMeta.id);
                fs.rmSync(stagingRoot, { recursive: true, force: true });
                fs.mkdirSync(stagingRoot, { recursive: true });
                fs.writeFileSync(path.join(stagingRoot, 'report.json'), JSON.stringify(reportPayload, null, 2));
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
                let hasIndex = false;
                let hasAssets = false;
                let hasClassIcons = false;
                treeEntries.forEach((entry: any) => {
                    if (entry?.path && entry?.sha && entry?.type === 'blob') {
                        treeMap.set(entry.path, entry.sha);
                        if (entry.path === withPagesPath(pagesPath, 'index.html')) hasIndex = true;
                        if (entry.path.startsWith(withPagesPath(pagesPath, 'assets/'))) hasAssets = true;
                        if (entry.path.startsWith(withPagesPath(pagesPath, 'svg/class-icons/'))) hasClassIcons = true;
                    }
                });
                const needsBaseTemplate = !hasIndex || !hasAssets || !hasClassIcons;

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

                const indexBuffer = Buffer.from(JSON.stringify(mergedIndex, null, 2));
                queueFile(withPagesPath(pagesPath, 'reports/index.json'), indexBuffer);
                if (selectedTheme) {
                    const themeBuffer = Buffer.from(JSON.stringify(selectedTheme, null, 2));
                    queueFile(withPagesPath(pagesPath, 'theme.json'), themeBuffer);
                }
                const uiThemeBuffer = Buffer.from(JSON.stringify({ theme: uiThemeValue }, null, 2));
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
                const availableThemes = uiTheme === 'crt' ? [CRT_WEB_THEME] : [...BASE_WEB_THEMES, MATTE_WEB_THEME];
                const requestedThemeId = (store.get('githubWebTheme', DEFAULT_WEB_THEME_ID) as string) || DEFAULT_WEB_THEME_ID;
                const themeId = uiTheme === 'crt' ? CRT_WEB_THEME_ID : (uiTheme === 'matte' ? MATTE_WEB_THEME_ID : requestedThemeId);
                const selectedTheme = availableThemes.find((theme) => theme.id === themeId) || availableThemes[0];
                const uiThemeValue = resolveWebUiThemeChoice(uiTheme, selectedTheme?.id);
                const reportPayload = {
                    meta: reportMeta,
                    stats: {
                        ...(payload.stats || {}),
                        uiTheme: uiThemeValue,
                        webThemeId: selectedTheme?.id || DEFAULT_WEB_THEME_ID
                    }
                };
                const reportsRoot = path.join(webRoot, 'reports');
                const reportDir = path.join(reportsRoot, reportMeta.id);
                fs.mkdirSync(reportDir, { recursive: true });
                fs.mkdirSync(devRoot, { recursive: true });
                fs.writeFileSync(path.join(devRoot, 'report.json'), JSON.stringify(reportPayload, null, 2));
                fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(reportPayload, null, 2));
                if (selectedTheme) {
                    const themePayload = JSON.stringify(selectedTheme, null, 2);
                    fs.writeFileSync(path.join(webRoot, 'theme.json'), themePayload);
                }
                const uiThemePayload = JSON.stringify({ theme: uiThemeValue }, null, 2);
                fs.writeFileSync(path.join(webRoot, 'ui-theme.json'), uiThemePayload);

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
                let existingIndex: any[] = [];
                try {
                    if (fs.existsSync(indexPath)) {
                        const decoded = fs.readFileSync(indexPath, 'utf8');
                        existingIndex = JSON.parse(decoded);
                    }
                } catch {
                    existingIndex = [];
                }
                const normalizedExistingIndex = (Array.isArray(existingIndex) ? existingIndex : []).map((entry) => {
                    if (!entry || typeof entry !== 'object') return entry;
                    const currentUrl = typeof entry.url === 'string' ? entry.url : '';
                    const normalizedUrl = currentUrl
                        .replace('./web/web/index.html?report=', './?report=')
                        .replace('./web/index.html?report=', './?report=');
                    return normalizedUrl === currentUrl ? entry : { ...entry, url: normalizedUrl };
                });
                const mergedIndex = [indexEntry, ...normalizedExistingIndex.filter((entry) => entry?.id !== reportMeta.id)];
                fs.writeFileSync(indexPath, JSON.stringify(mergedIndex, null, 2));

                const baseUrl = VITE_DEV_SERVER_URL.replace(/\/$/, '');
                return { success: true, url: `${baseUrl}/web/?report=${reportMeta.id}` };
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
