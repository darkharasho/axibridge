import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, nativeTheme, crashReporter } from 'electron'
import fs from 'fs'
import path from 'node:path'
import https from 'node:https'
import { createHash } from 'node:crypto'

import { spawn } from 'node:child_process'
import { LEGACY_THEME_TO_PALETTE } from '../shared/webThemes';
import { buildFightLabelV2, computeFightAvgPosition } from '../shared/mapUtils';
import { DEFAULT_DISRUPTION_METHOD, DisruptionMethod } from '../shared/metricsSettings';
import { LogWatcher } from './watcher'
import { Uploader, UploadResult } from './uploader'
import { waitForPermalink } from './permalinkWait'
import { DiscordNotifier } from './discord';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { DesktopIntegrator } from './integration';
import {
    inferUploadRetryFailureCategory,
    trimUploadRetryQueue,
    buildUploadRetryPauseState,
    buildUploadRetryQueuePayload as buildUploadRetryQueuePayloadRaw,
    loadUploadRetryQueue as loadUploadRetryQueueFromStore,
    saveUploadRetryQueue as saveUploadRetryQueueToStore,
    loadUploadRetryState as loadUploadRetryStateFromStore,
    saveUploadRetryState as saveUploadRetryStateToStore,
    UPLOAD_RETRY_QUEUE_KEY,
    UPLOAD_RETRY_STATE_KEY,
    AUTH_RETRY_PAUSE_THRESHOLD,
    type UploadRetryQueueEntry,
    type UploadRetryRuntimeState,
    type UploadRetryQueuePayload,
} from './uploadRetryQueue';
import {
    resolveDetailsUploadTime,
    pruneDetailsForStats,
    buildDashboardSummaryFromDetails,
    extractSquadGuilds,
    buildManifestEntry,
    attachConditionMetrics,
    hasUsableFightDetails,
} from './detailsProcessing';
import {
    parseVersion,
    compareVersion,
    extractReleaseNotesRangeFromFile,
} from './versionUtils';
import {
    extractAutoUpdateErrorMessage,
    formatAutoUpdateErrorMessage,
    isRetryableAutoUpdateError,
} from '../shared/autoUpdateErrors';
import { fetchImageBuffer } from './imageFetcher';
import { setupConsoleLogger } from './consoleLogger';
import {
    computeFileHash,
    pruneDpsReportCacheIndex,
    removeDpsReportCacheEntry,
    loadDpsReportCacheIndex as loadDpsReportCacheIndexFn,
    saveDpsReportCacheIndex as saveDpsReportCacheIndexFn,
    clearDpsReportCache as clearDpsReportCacheFn,
    invalidateDpsReportCacheEntry as invalidateDpsReportCacheEntryFn,
    loadDpsReportCacheEntry as loadDpsReportCacheEntryFn,
    saveDpsReportCacheEntry as saveDpsReportCacheEntryFn,
    updateDpsReportCacheDetails as updateDpsReportCacheDetailsFn,
    readCachedDetailsFile as readCachedDetailsFileFn,
    type DpsReportCacheEntry,
} from './dpsReportCache';

import { registerFileHandlers } from './handlers/fileHandlers';
import { registerAppHandlers } from './handlers/appHandlers';
import { registerDiscordHandlers } from './handlers/discordHandlers';
import {
    registerSettingsHandlers,
    DEFAULT_EMBED_STATS,
    DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS,
    normalizeMvpWeights,
} from './handlers/settingsHandlers';
import { registerUploadHandlers } from './handlers/uploadHandlers';
import { registerGithubHandlers } from './handlers/githubHandlers';
import { registerCloudflareHandlers } from './handlers/cloudflareHandlers';
import { registerEiHandlers } from './handlers/eiHandlers';
import { registerReparseHandlers } from './handlers/reparseHandlers';
import { EiManager, DEFAULT_EI_SETTINGS, EiParserSettings } from './eiParser';
import { AxilogManager, normalizeParserBackend, type ParserBackend } from './axilogParser';
import { migrateParserBackendToAxilog } from './parserBackendMigration';
import { parseCliFlags } from './cliFlags';

const cliFlags = parseCliFlags(process.argv);

/** Compute the landmark-aware fight label from pruned EI details (safe to call with null). */
function buildFightLabelFromDetails(details: any): string | undefined {
    if (!details) return undefined;
    const zone = details.fightName;
    if (!zone) return undefined;
    return buildFightLabelV2({ zone, avgPosition: computeFightAvgPosition(details) });
}

// Increase V8 heap for packaged and dev builds to avoid OOM on large datasets.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=6144');
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

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

// Crash reporting — native dumps go to userData/Crashpad/, JS exceptions go to the electron-log file
crashReporter.start({ uploadToServer: false });
process.on('uncaughtException', (err) => {
    log.error('[Crash] Uncaught exception:', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
    log.error('[Crash] Unhandled promise rejection:', reason instanceof Error ? reason.stack : reason);
});

// ─── User data migration: ArcBridge → AxiBridge ─────────────────────────────
// Must run before `new Store()` — electron-store derives its path from
// app.getPath('userData'), which changed when productName became "AxiBridge".
if (!app.isPackaged) {
    // Dev mode: migrate ArcBridge-Dev → AxiBridge-Dev
    const appData = app.getPath('appData');
    const oldDevDir = path.join(appData, 'ArcBridge-Dev');
    const newDevDir = path.join(appData, 'AxiBridge-Dev');
    if (fs.existsSync(oldDevDir) && !fs.existsSync(newDevDir)) {
        try {
            fs.cpSync(oldDevDir, newDevDir, { recursive: true });
            log.info('[Migration] Copied dev userData from ArcBridge-Dev to AxiBridge-Dev');
        } catch (err: any) {
            log.warn('[Migration] Failed to copy dev userData:', err?.message || err);
        }
    }
    const devUserDataDir = path.join(app.getPath('appData'), 'AxiBridge-Dev');
    app.setPath('userData', devUserDataDir);
} else {
    const appData = app.getPath('appData');
    const oldDir = path.join(appData, 'ArcBridge');
    const newDir = path.join(appData, 'AxiBridge');
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        try {
            fs.cpSync(oldDir, newDir, { recursive: true });
            log.info('[Migration] Copied userData from ArcBridge to AxiBridge');
        } catch (err: any) {
            log.warn('[Migration] Failed to copy userData:', err?.message || err);
        }
    }
}

// Migrate DPS report cache directory
const oldCacheDir = path.join(app.getPath('temp'), 'arcbridge-dps-report-cache');
const newCacheDir = path.join(app.getPath('temp'), 'axibridge-dps-report-cache');
if (fs.existsSync(oldCacheDir) && !fs.existsSync(newCacheDir)) {
    try {
        fs.renameSync(oldCacheDir, newCacheDir);
        log.info('[Migration] Renamed DPS report cache directory');
    } catch (err: any) {
        log.warn('[Migration] Failed to rename cache dir:', err?.message || err);
    }
}

// Clean up stale arcbridge-updater cache (from pre-rename installs).
// If left behind, electron-updater can pick up the old cache and try to
// unlink a non-existent AppImage path, blocking updates.
const cacheHome = process.env.XDG_CACHE_HOME || path.join(app.getPath('home'), '.cache');
const oldUpdaterCache = path.join(cacheHome, 'arcbridge-updater');
if (fs.existsSync(oldUpdaterCache)) {
    try {
        fs.rmSync(oldUpdaterCache, { recursive: true });
        log.info('[Migration] Removed stale arcbridge-updater cache');
    } catch (err: any) {
        log.warn('[Migration] Failed to remove old updater cache:', err?.message || err);
    }
}

const { setForwarding: setConsoleLogForwarding, getHistory: getConsoleLogHistory } = setupConsoleLogger(() => win);

const Store = require('electron-store');
const store = new Store();

// ─── Settings migration: legacy UiTheme → colorPalette + glassSurfaces ────────
{
    const legacyUiTheme = store.get('uiTheme') as string | undefined;
    if (legacyUiTheme) {
        const mapping = LEGACY_THEME_TO_PALETTE[legacyUiTheme] ?? { palette: 'electric-blue', glass: false };
        store.set('colorPalette', mapping.palette);
        store.set('glassSurfaces', mapping.glass);
        store.delete('uiTheme');
        store.delete('githubWebTheme');
        store.delete('kineticFontStyle');
        store.delete('kineticThemeVariant');
        store.delete('dashboardLayout');
    }
}

// Local wrappers bind the store-injected functions from uploadRetryQueue.ts to
// the module-level electron-store instance, preserving all existing call sites.
const loadUploadRetryQueue = (): Record<string, UploadRetryQueueEntry> => loadUploadRetryQueueFromStore(store);
const saveUploadRetryQueue = (queue: Record<string, UploadRetryQueueEntry>) => saveUploadRetryQueueToStore(store, queue);
const loadUploadRetryState = (): UploadRetryRuntimeState => loadUploadRetryStateFromStore(store);
const saveUploadRetryState = (state: UploadRetryRuntimeState) => saveUploadRetryStateToStore(store, state);

const getLegacyDpsReportCacheDir = () => path.join(app.getPath('userData'), 'dps-report-cache');
const getDpsReportCacheDir = () => path.join(app.getPath('temp'), 'axibridge-dps-report-cache');

// Local wrappers bind the store- and dir-injected cache functions to this process context.
const loadDpsReportCacheIndex = () => loadDpsReportCacheIndexFn(store);
const saveDpsReportCacheIndex = (index: Record<string, DpsReportCacheEntry>) => saveDpsReportCacheIndexFn(store, index);
const clearDpsReportCache = (
    onProgress?: (data: { stage?: string; message?: string; progress?: number; current?: number; total?: number }) => void
) => clearDpsReportCacheFn(store, getDpsReportCacheDir, getLegacyDpsReportCacheDir, onProgress);
const invalidateDpsReportCacheEntry = (hash: string, reason: string) => invalidateDpsReportCacheEntryFn(store, hash, reason);
const loadDpsReportCacheEntry = (hash: string) => loadDpsReportCacheEntryFn(store, hash);
const saveDpsReportCacheEntry = (hash: string, result: UploadResult, jsonDetails: any | null) => saveDpsReportCacheEntryFn(store, getDpsReportCacheDir, hash, result, jsonDetails);
const updateDpsReportCacheDetails = (hash: string, jsonDetails: any) => updateDpsReportCacheDetailsFn(store, getDpsReportCacheDir, hash, jsonDetails);


process.env.DIST = path.join(__dirname, '../../')
process.env.VITE_PUBLIC = app.isPackaged ? path.join(process.env.DIST, 'dist-react') : path.join(process.env.DIST, 'public')

let win: BrowserWindow | null
let tray: Tray | null = null
let isQuitting = false
let watcher: LogWatcher | null = null
let uploader: Uploader | null = null
let discord: DiscordNotifier | null = null
let eiManager: EiManager | null = null
let axilogManager: AxilogManager | null = null

// ─── Parser backend selection ───────────────────────────────────────────────
// `axilog` (the default) parses in-process via the @axiapps/axilog bindings;
// `elite-insights` is the opt-out that spawns the .NET CLI. It is also the only
// engine that emits Axilog data, which the migrated stats readers need — an
// explicit Elite Insights selection is honoured, but its logs render empty in
// the migrated views and say so via the coverage banner. See
// DEFAULT_PARSER_BACKEND's doc comment and docs/axilog-cutover-report.md.
const getParserBackend = (): ParserBackend => normalizeParserBackend(store.get('parserBackend'));

/**
 * The parser to use for local parses. Falls back to EI when the user selected
 * axilog but its native binding could not be loaded on this platform.
 */
const getActiveParser = (): EiManager | AxilogManager | null => {
    if (getParserBackend() === 'axilog' && axilogManager?.isInstalled()) return axilogManager;
    return eiManager;
};

/** True when a local parse is possible right now with the selected backend. */
const isLocalParserAvailable = (): boolean => Boolean(getActiveParser()?.isInstalled());

/**
 * True when the EI CLI download/update machinery should run at all.
 *
 * It stands down while axilog is the *selected*, *available* backend — which
 * under the axilog default is a fresh install, so nobody pays for the ~90 MB
 * download by default any more. It resumes for a user who opts out to Elite
 * Insights, and on a platform with no axilog binary, where EI is the fallback.
 */
const shouldAutoManageEi = (): boolean =>
    Boolean(store.get('autoManageEi', true)) && !(getParserBackend() === 'axilog' && Boolean(axilogManager?.isInstalled()));

// We always parse combat replay (EI v3.24+ only emits the distToCom/stackDist
// distance scalars when it does; axilog never emits them and axilogParser.ts
// derives them from the same replay positions), but only RETAIN the heavy
// position arrays when the user's `parseCombatReplay` setting is on. Off =
// coarse mode: keep the scalars (Closest to Tag still works), drop positions to
// keep payloads small.
const statsPruneOptions = (): { keepReplayPositions: boolean } => ({
    keepReplayPositions: Boolean(getActiveParser()?.getSettings().parseCombatReplay),
});
let autoUpdateRetryAttempts = 0;
let autoUpdateRetryTimer: NodeJS.Timeout | null = null;
let resolvedRetryCount = 0;
const activeUploads = new Set<string>();
const recentDiscordSends = new Map<string, number>();
const DISCORD_DEDUPE_TTL_MS = 2 * 60 * 1000;
let discordNoWebhookLogAt = 0;
let bulkUploadMode = false;
const bulkLogDetailsCache = new Map<string, any>();
const bulkLogDetailsByBaseName = new Map<string, any>();
const BULK_LOG_DETAILS_CACHE_MAX = 100;
const fileHashByPath = new Map<string, string>();
const FILE_HASH_CACHE_MAX = 1200;
const normalizeDetailsCacheKey = (filePath: string) => path.resolve(path.normalize(String(filePath || '')));
const rememberFileHash = (filePath: string, hash: string | null | undefined) => {
    const normalizedKey = normalizeDetailsCacheKey(filePath);
    if (!normalizedKey || !hash) return;
    if (fileHashByPath.has(normalizedKey)) {
        fileHashByPath.delete(normalizedKey);
    }
    fileHashByPath.set(normalizedKey, hash);
    while (fileHashByPath.size > FILE_HASH_CACHE_MAX) {
        const oldest = fileHashByPath.keys().next().value;
        if (!oldest) break;
        fileHashByPath.delete(oldest);
    }
};
const getKnownFileHash = (filePath: string): string | null => {
    const normalizedKey = normalizeDetailsCacheKey(filePath);
    if (!normalizedKey) return null;
    return fileHashByPath.get(normalizedKey) || null;
};

// ─── Local Parse Queue ──────────────────────────────────────────────────────
// Serialises local parses so only one dotnet process (EI) / native parse
// (axilog) runs at a time.
let eiParseQueue: { logPath: string; logId: string; resolve: (json: any) => void; reject: (err: any) => void }[] = [];
let eiParseActive = false;

async function processEiQueue() {
    if (eiParseActive || eiParseQueue.length === 0) return;
    eiParseActive = true;
    const task = eiParseQueue.shift()!;
    try {
        const parser = getActiveParser();
        if (!parser) throw new Error('No local parser is available');
        const json = await parser.parseLog(task.logPath, task.logId);
        task.resolve(json);
    } catch (err) {
        task.reject(err);
    } finally {
        eiParseActive = false;
        processEiQueue();
    }
}

function queueEiParse(logPath: string, logId: string): Promise<any> {
    return new Promise((resolve, reject) => {
        eiParseQueue.push({ logPath, logId, resolve, reject });
        processEiQueue();
    });
}

const BULK_LOG_DETAILS_HEAP_BUDGET_BYTES = 400 * 1024 * 1024; // 400 MB
const setBulkLogDetails = (filePath: string, details: any) => {
    const rawKey = String(filePath || '');
    const normalizedKey = normalizeDetailsCacheKey(filePath);
    const keys = [rawKey, normalizedKey].filter(Boolean);
    keys.forEach((key) => {
        if (bulkLogDetailsCache.has(key)) {
            bulkLogDetailsCache.delete(key);
        }
        bulkLogDetailsCache.set(key, details);
    });
    const baseName = path.basename(rawKey || normalizedKey || '');
    if (baseName) {
        if (bulkLogDetailsByBaseName.has(baseName)) {
            bulkLogDetailsByBaseName.delete(baseName);
        }
        bulkLogDetailsByBaseName.set(baseName, details);
    }
    while (bulkLogDetailsCache.size > BULK_LOG_DETAILS_CACHE_MAX) {
        const oldest = bulkLogDetailsCache.keys().next().value;
        if (!oldest) break;
        bulkLogDetailsCache.delete(oldest);
    }
    while (bulkLogDetailsByBaseName.size > BULK_LOG_DETAILS_CACHE_MAX) {
        const oldest = bulkLogDetailsByBaseName.keys().next().value;
        if (!oldest) break;
        bulkLogDetailsByBaseName.delete(oldest);
    }
    // Evict oldest entries when heap usage exceeds budget to prevent OOM
    try {
        const heapUsed = process.memoryUsage().heapUsed;
        if (heapUsed > BULK_LOG_DETAILS_HEAP_BUDGET_BYTES && bulkLogDetailsCache.size > 2) {
            const evictCount = Math.max(1, Math.ceil(bulkLogDetailsCache.size * 0.25));
            let evicted = 0;
            for (const key of bulkLogDetailsCache.keys()) {
                if (evicted >= evictCount) break;
                bulkLogDetailsCache.delete(key);
                evicted += 1;
            }
            // Also evict corresponding baseName entries
            evicted = 0;
            for (const key of bulkLogDetailsByBaseName.keys()) {
                if (evicted >= evictCount) break;
                bulkLogDetailsByBaseName.delete(key);
                evicted += 1;
            }
            console.log(`[Main] Heap budget exceeded (${(heapUsed / 1024 / 1024).toFixed(0)}MB). Evicted ${evictCount} oldest cache entries. Remaining: ${bulkLogDetailsCache.size} entries.`);
        }
    } catch { /* memory check failure should not block cache updates */ }
};
const getBulkLogDetails = (filePath: string) => {
    const rawKey = String(filePath || '');
    const normalizedKey = normalizeDetailsCacheKey(filePath);
    const direct = (rawKey && bulkLogDetailsCache.get(rawKey))
        || (normalizedKey && bulkLogDetailsCache.get(normalizedKey));
    if (direct) return direct;
    const baseName = path.basename(rawKey || normalizedKey || '');
    if (!baseName) return null;
    return bulkLogDetailsByBaseName.get(baseName) || null;
};
/**
 * Rehydrate a log's details from the persistent on-disk cache.
 *
 * `bulkLogDetailsCache` is a memory-budgeted LRU: a session with a few dozen
 * large logs will blow the 400MB budget and evict most of them. Before this
 * existed, an evicted log was gone for good — `get-log-details` reported
 * "Details not found", the log contributed no fight to any aggregate, and its
 * row rendered with a blank date. The pruned details are still on disk, so read
 * them back instead of treating LRU residency as the source of truth.
 *
 * The in-memory cache is only re-warmed when there is headroom; warming it
 * while already over budget would just evict another 25% of the map and make
 * the next reader pay the same disk round-trip.
 */
const loadPersistedLogDetails = async (filePath: string): Promise<any | null> => {
    if (!filePath) return null;
    try {
        let hash = getKnownFileHash(filePath);
        if (!hash) {
            if (!fs.existsSync(filePath)) return null;
            hash = await computeFileHash(filePath);
            rememberFileHash(filePath, hash);
        }
        const details = await readCachedDetailsFileFn(store, hash);
        if (!details || details.error || !hasUsableFightDetails(details)) return null;
        if (process.memoryUsage().heapUsed < BULK_LOG_DETAILS_HEAP_BUDGET_BYTES) {
            setBulkLogDetails(filePath, details);
        }
        return details;
    } catch (err) {
        console.warn(`[Main] Failed to rehydrate details for ${filePath}: ${String(err)}`);
        return null;
    }
};

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
const GITHUB_PROTOCOL = 'axibridge';
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5177';

const getUploadRetryQueuePayload = (): UploadRetryQueuePayload =>
    buildUploadRetryQueuePayloadRaw(loadUploadRetryQueue(), loadUploadRetryState(), resolvedRetryCount);

const sendUploadRetryQueueUpdate = () => {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('upload-retry-queue-updated', getUploadRetryQueuePayload());
};

const setUploadRetryPaused = (paused: boolean, reason: string | null = null) => {
    saveUploadRetryState(buildUploadRetryPauseState(paused, reason));
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

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        // Local EI JSON import — skip dps.report entirely
        win?.webContents.send('upload-status', { id: fileId, filePath, status: 'calculating' });
        try {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            let jsonDetails = JSON.parse(raw);

            if (jsonDetails && !jsonDetails.error) {
                jsonDetails = attachConditionMetrics(jsonDetails);
            }

            const hasUsableDetails = Boolean(jsonDetails && !jsonDetails.error && hasUsableFightDetails(jsonDetails));
            const prunedDetails = hasUsableDetails ? pruneDetailsForStats(jsonDetails, statsPruneOptions()) : null;
            jsonDetails = null; // Release full JSON for GC

            const playerCount = Array.isArray(prunedDetails?.players) ? prunedDetails.players.length : undefined;
            const dashboardSummary = prunedDetails ? buildDashboardSummaryFromDetails(prunedDetails) : undefined;
            const squadGuilds = prunedDetails ? extractSquadGuilds(prunedDetails) : undefined;

            if (prunedDetails) {
                setBulkLogDetails(filePath, prunedDetails);
                void updateGlobalManifest(prunedDetails, filePath);
            }
            if (prunedDetails && win?.webContents && !bulkUploadMode) {
                win.webContents.send('details-prewarm', {
                    logId: fileId,
                    filePath,
                    details: prunedDetails,
                });
            }

            win?.webContents.send('upload-complete', {
                id: fileId,
                permalink: '',
                filePath,
                fightName: prunedDetails?.fightName || fileId,
                fightLabel: buildFightLabelFromDetails(prunedDetails),
                encounterDuration: prunedDetails?.encounterDuration,
                uploadTime: prunedDetails?.uploadTime || Date.now() / 1000,
                status: hasUsableDetails ? 'calculating' : 'success',
                detailsStatus: hasUsableDetails ? 'available' as const : 'idle' as const,
                // An imported EI JSON never carries axilog's native container,
                // so the migrated readers render it empty. Recording where the
                // details came from is what lets the renderer say so.
                parseSource: 'json-import' as const,
                playerCount,
                dashboardSummary,
                squadGuilds
            });
            console.log(`[Main] Local JSON import complete: ${filePath} players=${playerCount ?? 'n/a'}`);
        } catch (jsonError: any) {
            console.error('[Main] Local JSON import failed:', jsonError?.message || jsonError);
            win?.webContents.send('upload-complete', {
                id: fileId,
                filePath,
                status: 'error',
                error: jsonError?.message || 'Failed to read local JSON file'
            });
        } finally {
            activeUploads.delete(filePath);
        }
        return;
    }

    if (options?.retry) {
        markUploadRetrying(filePath);
    }

    // Common: compute hash and check cache before choosing EI vs dps.report path.
    let cacheKey: string | null = null;
    try {
        cacheKey = await computeFileHash(filePath);
        rememberFileHash(filePath, cacheKey);
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

    // If we have a full cache hit (permalink + usable details), use it directly
    // regardless of EI availability — no need to re-parse or re-upload.
    // Exception: when local EI is installed, treat the cache as stale if it lacks
    // combatReplayMetaData. We now always parse replay (EI v3.24+ only emits the
    // distToCom/stackDist distance scalars when it does), so a cache without
    // combatReplayMetaData was produced by the old replay-off path and has
    // distToCom/stackDist == 0 — i.e. Closest to Tag stuck at 0. Re-parsing heals
    // those histories. (Independent of the parseCombatReplay retention setting,
    // which only controls whether positions are kept.)
    const eiInstalled = isLocalParserAvailable();
    const cachedDetailsLackReplay = eiInstalled
        && cached?.jsonDetails
        && !cached.jsonDetails.combatReplayMetaData;
    const cachedHasUsableDetails = Boolean(
        cached?.entry?.result
        && cached?.jsonDetails
        && !cached.jsonDetails.error
        && hasUsableFightDetails(cached.jsonDetails)
        && !cachedDetailsLackReplay
    );
    if (cachedDetailsLackReplay) {
        console.log(`[Cache] Cached details for ${filePath} lack combatReplayMetaData; forcing EI re-parse.`);
    }

    // ─── Local-parser-first path ────────────────────────────────────────────
    // When a local parser (EI by default, axilog when opted into) is available
    // and we don't have a full cache hit, parse locally and upload to
    // dps.report in parallel for the permalink. This is the only path that
    // produces stats; dps.report is never a parse source.
    let localParseError: string | null = null;
    if (!cachedHasUsableDetails && isLocalParserAvailable()) {
        win?.webContents.send('upload-status', { id: fileId, filePath, status: 'parsing' });

        // Set up local parse progress callback
        getActiveParser()?.setParseProgressCallback((data: string) => {
            win?.webContents.send('ei:parse-progress', { logId: fileId, filePath, data });
        });

        // Start dps.report upload in parallel (for permalink only) — don't await yet
        const permalinkPromise = uploader
            ? uploader.upload(filePath).catch((err: any) => {
                console.warn(`[Main] dps.report parallel upload failed for ${filePath}:`, err?.message || err);
                return null as UploadResult | null;
            })
            : Promise.resolve(null as UploadResult | null);

        try {
            let eiJson = await queueEiParse(filePath, fileId);
            console.log(`[Main] EI parse succeeded for ${filePath}`);

            // Enrich and prune
            if (eiJson && !eiJson.error) {
                eiJson = attachConditionMetrics(eiJson);
            }
            const hasUsableDetails = Boolean(eiJson && !eiJson.error && hasUsableFightDetails(eiJson));
            const prunedDetails = hasUsableDetails ? pruneDetailsForStats(eiJson, statsPruneOptions()) : null;
            eiJson = null; // Release full JSON for GC

            const playerCount = Array.isArray(prunedDetails?.players) ? prunedDetails.players.length : undefined;
            const dashboardSummary = prunedDetails ? buildDashboardSummaryFromDetails(prunedDetails) : undefined;
            const squadGuilds = prunedDetails ? extractSquadGuilds(prunedDetails) : undefined;
            const detailsSummary = {
                fightName: prunedDetails?.fightName,
                fightLabel: buildFightLabelFromDetails(prunedDetails),
                encounterDuration: prunedDetails?.encounterDuration,
                uploadTime: prunedDetails?.uploadTime,
                success: prunedDetails?.success
            };

            // Cache the EI-parsed result.  Use a synthetic UploadResult from cache
            // if available, otherwise build a minimal one until the permalink arrives.
            const cachedResult = cached?.entry?.result;
            const syntheticResult: UploadResult = cachedResult || {
                id: fileId,
                permalink: '',
                userToken: '',
                fightName: prunedDetails?.fightName || fileId,
                encounterDuration: prunedDetails?.encounterDuration,
                uploadTime: prunedDetails?.uploadTime || Date.now() / 1000,
            };

            if (cacheKey && !cachedResult) {
                await saveDpsReportCacheEntry(cacheKey, syntheticResult, prunedDetails);
            } else if (cacheKey && cachedResult && prunedDetails) {
                await updateDpsReportCacheDetails(cacheKey, prunedDetails);
            }

            markUploadRetryResolved(filePath);

            if (prunedDetails) {
                setBulkLogDetails(filePath, prunedDetails);
                void updateGlobalManifest(prunedDetails, filePath);
            }

            // Pre-warm renderer memory cache
            if (prunedDetails && win?.webContents && !bulkUploadMode) {
                win.webContents.send('details-prewarm', {
                    logId: syntheticResult.id || filePath,
                    filePath,
                    details: prunedDetails,
                });
            }

            // Discord notifications — must happen before upload-complete to match
            // the dps.report ordering (discord → upload-complete), otherwise the
            // card flips from "done" back to "discord" status.
            const enemySplitSettings = {
                image: false,
                embed: false,
                tiled: false,
                ...(store.get('discordEnemySplitSettings') as any || {})
            };
            const globalSplitEnemiesByTeam = Boolean(store.get('discordSplitEnemiesByTeam', false));
            const splitEnemiesByTeam = globalSplitEnemiesByTeam || Boolean(enemySplitSettings.embed);
            const selectedWebhookId = store.get('selectedWebhookId', null);
            const webhookUrl = store.get('discordWebhookUrl', null);
            const shouldSendDiscord = Boolean(selectedWebhookId) && typeof webhookUrl === 'string' && webhookUrl.length > 0;

            // The parallel dps.report upload is what supplies the permalink the
            // Discord embed links its title to. It was started before the local
            // parse, so it has usually resolved by now — but it must be awaited,
            // otherwise every freshly-parsed log posts with an empty URL.
            if (shouldSendDiscord && !syntheticResult.permalink) {
                const resolvedPermalink = await waitForPermalink(permalinkPromise);
                if (resolvedPermalink) {
                    syntheticResult.permalink = resolvedPermalink;
                } else {
                    console.warn(`[Main] No dps.report permalink available for ${filePath}; posting Discord embed without a report link.`);
                }
            }

            if (shouldSendDiscord) {
                win?.webContents.send('upload-status', {
                    id: fileId,
                    filePath,
                    status: 'discord',
                    permalink: syntheticResult.permalink,
                    uploadTime: syntheticResult.uploadTime,
                    encounterDuration: syntheticResult.encounterDuration,
                    fightName: syntheticResult.fightName
                });
                try {
                    const dedupeKey = cacheKey || syntheticResult.id || filePath;
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
                        await discord?.sendLog({ ...syntheticResult, filePath, mode: 'embed', splitEnemiesByTeam }, prunedDetails);
                    }
                } catch (discordError: any) {
                    console.error('[Main] Discord notification failed:', discordError?.message || discordError);
                }
            } else {
                const now = Date.now();
                if (now - discordNoWebhookLogAt > 15000) {
                    console.log('[Main] Discord notifications disabled: no webhook selected.');
                    discordNoWebhookLogAt = now;
                }
            }

            // Send upload-complete with EI data (permalink may be empty until dps.report resolves)
            win?.webContents.send('upload-complete', {
                ...syntheticResult,
                ...detailsSummary,
                filePath,
                status: hasUsableDetails ? 'calculating' : 'success',
                detailsStatus: hasUsableDetails ? 'available' as const : 'idle' as const,
                // Whichever engine actually ran. Only 'axilog' attaches native.
                parseSource: getParserBackend(),
                playerCount,
                dashboardSummary,
                squadGuilds
            });
            console.log(`[Main] upload-complete (EI): ${filePath} players=${playerCount ?? 'n/a'}`);

            // Await the dps.report permalink and attach it asynchronously
            permalinkPromise.then(async (uploadResult) => {
                if (uploadResult && !uploadResult.error && uploadResult.permalink) {
                    console.log(`[Main] dps.report permalink resolved for ${filePath}: ${uploadResult.permalink}`);
                    // Update cache with the real permalink
                    if (cacheKey) {
                        await saveDpsReportCacheEntry(cacheKey, uploadResult, prunedDetails);
                    }
                    // Notify renderer of the permalink
                    win?.webContents.send('upload-permalink', {
                        id: fileId,
                        filePath,
                        permalink: uploadResult.permalink,
                    });
                } else if (uploadResult?.error) {
                    console.warn(`[Main] dps.report upload returned error for ${filePath}: ${uploadResult.error}`);
                }
            }).catch((err: any) => {
                console.warn(`[Main] dps.report permalink resolution failed for ${filePath}:`, err?.message || err);
            });

            activeUploads.delete(filePath);
            return;
        } catch (eiError: any) {
            // No parse fallback exists any more — dps.report's JSON carries no
            // Axilog data. Fall through only to resolve the permalink and post
            // the embed, then report the log as failed.
            localParseError = eiError?.message || String(eiError) || 'Unknown parse error';
            console.error(`[Main] Local parse failed for ${filePath}:`, localParseError);
        }
    }

    // ─── Upload-only path ───────────────────────────────────────────────────
    // Reached three ways: a full cache hit made the local parse unnecessary, no
    // local parser is installed yet, or the local parse threw. In all three,
    // dps.report is an upload target and nothing more — it supplies the
    // permalink the Discord embed links its title to, never the stats.
    //
    // It used to be a parse fallback too. It cannot be one any more: its JSON
    // carries no Axilog data, so every migrated reader renders a log sourced
    // from it empty while the dashboard still shows a confident-looking total.
    // A log we cannot parse locally is reported as such instead.
    win?.webContents.send('upload-status', { id: fileId, filePath, status: 'uploading' });

    try {
        if (!uploader) {
            throw new Error('Uploader not initialized.');
        }

        const result = cached?.entry?.result || await uploader.upload(filePath);

        if (!result || result.error) {
            markUploadRetryFailure(filePath, result?.error || 'Unknown upload error', result?.statusCode);
            win?.webContents.send('upload-complete', { ...result, filePath, status: 'error' });
            console.log(`[Main] upload-complete error: ${filePath} msg=${result?.error || 'unknown'}`);
            return;
        }

        if (cached?.entry?.result) {
            console.log(`[Main] Cache hit for ${filePath}. Using cached dps.report permalink.`);
        } else {
            console.log(`[Main] Upload successful: ${result.permalink}.`);
        }

        // Details come from the local cache or not at all. An entry written
        // before the Axilog cutover has no carry-set; the coverage banner
        // surfaces that and offers the re-parse that repairs it.
        let cachedDetails = cached?.jsonDetails && !cached.jsonDetails.error ? cached.jsonDetails : null;
        if (cachedDetails) {
            cachedDetails = attachConditionMetrics(cachedDetails);
        }
        const hasUsableDetails = Boolean(cachedDetails && hasUsableFightDetails(cachedDetails));
        const prunedDetails = hasUsableDetails ? pruneDetailsForStats(cachedDetails, statsPruneOptions()) : null;
        cachedDetails = null;

        if (cacheKey && !cached?.entry?.result) {
            await saveDpsReportCacheEntry(cacheKey, result, prunedDetails);
        }

        markUploadRetryResolved(filePath);

        const selectedWebhookId = store.get('selectedWebhookId', null);
        const webhookUrl = store.get('discordWebhookUrl', null);
        const shouldSendDiscord = Boolean(selectedWebhookId) && typeof webhookUrl === 'string' && webhookUrl.length > 0;

        if (shouldSendDiscord) {
            const enemySplitSettings = {
                image: false,
                embed: false,
                tiled: false,
                ...(store.get('discordEnemySplitSettings') as any || {})
            };
            const globalSplitEnemiesByTeam = Boolean(store.get('discordSplitEnemiesByTeam', false));
            const splitEnemiesByTeam = globalSplitEnemiesByTeam || Boolean(enemySplitSettings.embed);

            win?.webContents.send('upload-status', {
                id: fileId,
                filePath,
                status: 'discord',
                permalink: result.permalink,
                uploadTime: result.uploadTime,
                encounterDuration: result.encounterDuration,
                fightName: result.fightName
            });

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
                    // `prunedDetails` is null when the local parse failed, which
                    // posts the link-only embed rather than nothing at all.
                    await discord?.sendLog({ ...result, filePath, mode: 'embed', splitEnemiesByTeam }, prunedDetails);
                }
            } catch (discordError: any) {
                console.error('[Main] Discord notification failed:', discordError?.message || discordError);
            }
        } else {
            const now = Date.now();
            if (now - discordNoWebhookLogAt > 15000) {
                console.log('[Main] Discord notifications disabled: no webhook selected.');
                discordNoWebhookLogAt = now;
            }
        }

        // The log reached here because parsing it locally failed. The upload
        // succeeded, so the permalink and the embed are live — but there are no
        // stats, and saying so beats contributing zeros to every total.
        if (localParseError) {
            win?.webContents.send('upload-complete', {
                ...result,
                filePath,
                status: 'error',
                error: `Local parse failed: ${localParseError}`
            });
            console.log(`[Main] upload-complete parse-failure: ${filePath} msg=${localParseError}`);
            return;
        }

        const playerCount = Array.isArray(prunedDetails?.players) ? prunedDetails.players.length : undefined;
        const dashboardSummary = prunedDetails ? buildDashboardSummaryFromDetails(prunedDetails) : undefined;
        const squadGuilds = prunedDetails ? extractSquadGuilds(prunedDetails) : undefined;
        const detailsSummary = {
            fightName: prunedDetails?.fightName,
            fightLabel: buildFightLabelFromDetails(prunedDetails),
            encounterDuration: prunedDetails?.encounterDuration,
            uploadTime: prunedDetails?.uploadTime,
            success: prunedDetails?.success
        };
        if (prunedDetails) {
            setBulkLogDetails(filePath, prunedDetails);
            void updateGlobalManifest(prunedDetails, filePath);
        }
        // Pre-warm renderer memory cache (LRU only, no IndexedDB).
        // Skip during bulk upload — IPC deserialization of 10-40MB objects blocks the renderer.
        // Details flow via hydration after bulk upload ends.
        if (prunedDetails && win?.webContents && !bulkUploadMode) {
            win.webContents.send('details-prewarm', {
                logId: result.id || filePath,
                filePath,
                details: prunedDetails,
            });
        }
        win?.webContents.send('upload-complete', {
            ...result,
            ...detailsSummary,
            filePath,
            status: hasUsableDetails ? 'calculating' : 'success',
            detailsStatus: hasUsableDetails ? 'available' as const : 'idle' as const,
            // Deliberately no `parseSource`: these details came off disk and the
            // cache does not record which engine produced them. A log that makes
            // no claim is checked against its details once they hydrate; one that
            // claims wrongly is never rechecked.
            playerCount,
            dashboardSummary,
            squadGuilds
        });
        console.log(`[Main] upload-complete${bulkUploadMode ? ' (bulk)' : ''}: ${filePath} players=${playerCount ?? 'n/a'}`);
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

const migrateArcBridgeInstallName = () => {
    if (!app.isPackaged) return;
    const legacyPrefix = 'ArcBridge';
    const newPrefix = 'AxiBridge';

    if (process.platform === 'linux') {
        const appImagePath = process.env.APPIMAGE;
        if (!appImagePath) return;
        const baseName = path.basename(appImagePath);
        if (!baseName.startsWith(legacyPrefix)) return;
        // Don't rename if already AxiBridge
        if (baseName.startsWith(newPrefix)) return;
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
        if (baseName.startsWith(newPrefix)) return;
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


function getIconPath(): string {
    const variant = process.platform === 'linux' || nativeTheme.shouldUseDarkColors ? 'white' : 'black';
    return path.join(process.env.VITE_PUBLIC || '', `img/AxiBridge-${variant}.png`);
}

/** Build a multi-size nativeImage suitable for both tray and window icons. */
function getAppIcon(): Electron.NativeImage {
    const raw = nativeImage.createFromPath(getIconPath());
    // Windows needs explicit standard sizes for the taskbar / title-bar icon.
    if (process.platform === 'win32') {
        const sizes = [16, 32, 48, 64, 128, 256];
        const buffers = sizes.map(s => raw.resize({ width: s, height: s }).toPNG());
        // Create a fresh image and add each size
        const multi = nativeImage.createEmpty();
        for (let i = 0; i < sizes.length; i++) {
            multi.addRepresentation({ width: sizes[i], height: sizes[i], buffer: buffers[i], scaleFactor: 1.0 });
        }
        return multi;
    }
    return raw;
}

function createTray() {
    const icon = getAppIcon();
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

    tray.setToolTip('AxiBridge');
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

let servicesInitialized = false;

function initServices() {
    if (servicesInitialized) return;
    servicesInitialized = true;

    watcher = new LogWatcher();
    uploader = new Uploader();
    discord = new DiscordNotifier();

    eiManager = new EiManager(app.getPath('userData'));
    axilogManager = new AxilogManager();
    const savedEiSettings = store.get('eiParserSettings') as EiParserSettings | undefined;
    const resolvedParserSettings = { ...DEFAULT_EI_SETTINGS, ...(savedEiSettings ?? {}) };
    if (savedEiSettings) {
        eiManager.setSettings(resolvedParserSettings);
    }
    // Both backends read the same user-facing settings object; axilogParser maps
    // it onto axilog's ParseOptions (see mapEiSettingsToAxilogOptions).
    axilogManager.setSettings(resolvedParserSettings);
    // Before anything reads the backend: move a pre-cutover Elite Insights
    // selection onto Axilog, once. See parserBackendMigration.ts.
    const migration = migrateParserBackendToAxilog(store, axilogManager.isInstalled());
    if (migration === 'migrated') {
        console.log('[Main] Parser backend migrated: elite-insights → axilog (one-time).');
    }
    console.log(`[Main] Parser backend: ${getParserBackend()} (axilog binding ${axilogManager.isInstalled() ? 'available' : 'UNAVAILABLE'})`);

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

    // Headless: auto-manage EI without a window to wait for did-finish-load
    if (cliFlags.headless) {
        if (shouldAutoManageEi()) {
            const runAutoManage = async () => {
                try {
                    eiManager!.setProgressCallback((progress) => {
                        win?.webContents.send('ei:download-progress', progress);
                    });
                    if (!eiManager!.isInstalled()) {
                        win?.webContents.send('ei:status-changed', { installed: false, version: null, updateAvailable: null, installing: true, error: null });
                        await eiManager!.install();
                        const status = { ...eiManager!.getStatus(), installing: false, error: null };
                        win?.webContents.send('ei:status-changed', status);
                    } else {
                        const updateVersion = await eiManager!.checkForUpdate();
                        if (updateVersion) {
                            win?.webContents.send('ei:status-changed', { ...eiManager!.getStatus(), updateAvailable: updateVersion, installing: true, error: null });
                            await eiManager!.installCli();
                            const status = { ...eiManager!.getStatus(), installing: false, error: null };
                            win?.webContents.send('ei:status-changed', status);
                        }
                    }
                } catch (err: any) {
                    const status = { ...eiManager!.getStatus(), installing: false, error: err?.message || 'Auto-manage failed' };
                    win?.webContents.send('ei:status-changed', status);
                }
            };
            setTimeout(runAutoManage, 2000);
        }
    }
}

function createWindow() {
    const bounds = store.get('windowBounds') as { width: number, height: number } | undefined;

    const appIcon = getAppIcon();

    const isMac = process.platform === 'darwin';

    win = new BrowserWindow({
        icon: appIcon,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            backgroundThrottling: false,
        },
        width: bounds ? bounds.width : 1200,
        height: bounds ? bounds.height : 860,
        ...(isMac
            ? { frame: false, titleBarStyle: 'hidden', transparent: false, backgroundColor: '#000000' }
            : { frame: false, transparent: false, backgroundColor: '#000000' }
        ),
        show: true
    })

    // Explicitly set icon after creation so Windows updates the taskbar
    // icon for frameless windows (the constructor `icon` alone is not
    // always enough).
    win.setIcon(appIcon);

    win.on('maximize', () => {
        win?.webContents.send('window:maximized-change', true);
    });

    win.on('unmaximize', () => {
        win?.webContents.send('window:maximized-change', false);
    });

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

    initServices();

    // Auto-manage EI: install if missing, update if outdated. Skipped entirely
    // when the axilog backend is active — there is nothing to download.
    if (shouldAutoManageEi()) {
        const runAutoManage = async () => {
            try {
                eiManager!.setProgressCallback((progress) => {
                    win?.webContents.send('ei:download-progress', progress);
                });
                if (!eiManager!.isInstalled()) {
                    win?.webContents.send('ei:status-changed', { installed: false, version: null, updateAvailable: null, installing: true, error: null });
                    await eiManager!.install();
                    const status = { ...eiManager!.getStatus(), installing: false, error: null };
                    win?.webContents.send('ei:status-changed', status);
                } else {
                    const updateVersion = await eiManager!.checkForUpdate();
                    if (updateVersion) {
                        win?.webContents.send('ei:status-changed', { ...eiManager!.getStatus(), updateAvailable: updateVersion, installing: true, error: null });
                        await eiManager!.installCli();
                        const status = { ...eiManager!.getStatus(), installing: false, error: null };
                        win?.webContents.send('ei:status-changed', status);
                    }
                }
            } catch (err: any) {
                const status = { ...eiManager!.getStatus(), installing: false, error: err?.message || 'Auto-manage failed' };
                win?.webContents.send('ei:status-changed', status);
            }
        };
        // Run after window loads so IPC events reach the renderer
        win.webContents.on('did-finish-load', () => {
            setTimeout(runAutoManage, 2000);
        });
    }

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
        sendUploadRetryQueueUpdate();
    })

    // Pipe renderer console output to the main process terminal
    win.webContents.on('console-message', (event) => {
        log.info(`[Renderer] ${event.message}`);
    });

    if (!app.isPackaged) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'dist-react/index.html'))
    }

    win.webContents.on('render-process-gone', (_event, details) => {
        const mainMem = process.memoryUsage();
        // Use both log.error (writes to disk) and console.error (feeds in-app terminal after reload)
        const msg1 = `[Main] Renderer process gone — reason: ${details.reason}, exitCode: ${details.exitCode}`;
        const msg2 = `[Main] Main process memory at crash — rss: ${(mainMem.rss / 1024 / 1024).toFixed(1)}MB, heapUsed: ${(mainMem.heapUsed / 1024 / 1024).toFixed(1)}MB, heapTotal: ${(mainMem.heapTotal / 1024 / 1024).toFixed(1)}MB`;
        const msg3 = `[Main] Active uploads: ${activeUploads.size}, fileHashCache: ${fileHashByPath.size}, detailsCache: ${bulkLogDetailsCache.size}`;
        log.error(msg1);
        log.error(msg2);
        log.error(msg3);
        console.error(msg1);
        console.error(msg2);
        console.error(msg3);
        if (!app.isPackaged) {
            win?.loadURL(VITE_DEV_SERVER_URL);
        } else {
            win?.loadFile(path.join(process.env.DIST || '', 'dist-react/index.html'));
        }
    });

    win.webContents.on('unresponsive', () => {
        const mainMem = process.memoryUsage();
        const msg = `[Main] Renderer became unresponsive — rss: ${(mainMem.rss / 1024 / 1024).toFixed(1)}MB, heapUsed: ${(mainMem.heapUsed / 1024 / 1024).toFixed(1)}MB`;
        log.warn(msg);
        console.warn(msg);
    });

    win.webContents.on('responsive', () => {
        log.info(`[Main] Renderer became responsive again`);
        console.log(`[Main] Renderer became responsive again`);
    });
}

function setupAutoUpdater() {
    const clearAutoUpdateRetryState = () => {
        autoUpdateRetryAttempts = 0;
        if (autoUpdateRetryTimer) {
            clearTimeout(autoUpdateRetryTimer);
            autoUpdateRetryTimer = null;
        }
    };

    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        win?.webContents.send('update-message', 'Checking for update...');
    });
    autoUpdater.on('update-available', (info: any) => {
        clearAutoUpdateRetryState();
        log.info('Update available.');
        win?.webContents.send('update-available', info);
    });
    autoUpdater.on('update-not-available', (info: any) => {
        clearAutoUpdateRetryState();
        log.info('Update not available.');
        win?.webContents.send('update-not-available', info);
    });
    autoUpdater.on('error', (err: any) => {
        const rawMessage = extractAutoUpdateErrorMessage(err);
        if (isRetryableAutoUpdateError(err) && autoUpdateRetryAttempts < 1) {
            autoUpdateRetryAttempts += 1;
            const retryDelayMs = 2000;
            log.warn(`[AutoUpdater] Retryable error "${rawMessage}". Retrying in ${retryDelayMs}ms (${autoUpdateRetryAttempts}/1)`);
            win?.webContents.send('update-message', 'Temporary network issue while checking for updates. Retrying...');
            if (autoUpdateRetryTimer) {
                clearTimeout(autoUpdateRetryTimer);
            }
            autoUpdateRetryTimer = setTimeout(() => {
                autoUpdateRetryTimer = null;
                autoUpdater.checkForUpdates().catch((retryErr: any) => {
                    log.error('[AutoUpdater] Retry attempt failed:', extractAutoUpdateErrorMessage(retryErr));
                });
            }, retryDelayMs);
            return;
        }
        log.error('Error in auto-updater. ' + rawMessage);
        win?.webContents.send('update-error', {
            message: formatAutoUpdateErrorMessage(err),
            rawMessage,
        });
    });
    autoUpdater.on('download-progress', (progressObj: any) => {
        clearAutoUpdateRetryState();
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
        // log.info(log_message);
        win?.webContents.send('download-progress', progressObj);
    });
    autoUpdater.on('update-downloaded', (info: any) => {
        clearAutoUpdateRetryState();
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
    eiManager?.killActiveProcess();
    axilogManager?.killActiveProcess();
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
        const secondWantsWindow = !parseCliFlags(commandLine).headless;
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        } else if (secondWantsWindow) {
            // Primary instance is headless — attach a window to it.
            createWindow();
        }
    });

    app.whenReady().then(async () => {
        fs.writeFileSync(path.join(app.getPath('userData'), 'axiom-version'), app.getVersion(), 'utf8')
        if (process.defaultApp && process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(GITHUB_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
        } else {
            app.setAsDefaultProtocolClient(GITHUB_PROTOCOL);
        }
        migrateLegacySettings();
        migrateLegacyInstallName();
        migrateArcBridgeInstallName();
        if (cliFlags.headless) {
            log.info('[Main] Starting in headless mode — watcher/uploader/publisher only.');
            initServices();
        } else {
            createWindow();
        }
        createTray();

        nativeTheme.on('updated', () => {
            const icon = getAppIcon();
            tray?.setImage(icon.resize({ width: 16, height: 16 }));
            win?.setIcon(icon);
        });

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
                win?.webContents.send('update-error', {
                    message: formatAutoUpdateErrorMessage(err),
                    rawMessage: extractAutoUpdateErrorMessage(err),
                });
            }
        }, 3000);

        // Clear logs from store to improve boot time (persistence removed)
        if (store.has('logs')) {
            console.log('[Main] Clearing persistent logs to improve startup time.');
            store.delete('logs');
        }
        // Retry queue references specific log files from prior sessions. Since logs are
        // intentionally non-persistent, clear retry queue state on boot as well.
        if (store.has(UPLOAD_RETRY_QUEUE_KEY) || store.has(UPLOAD_RETRY_STATE_KEY)) {
            console.log('[Main] Clearing persistent upload retry queue state.');
            store.delete(UPLOAD_RETRY_QUEUE_KEY);
            store.delete(UPLOAD_RETRY_STATE_KEY);
            resolvedRetryCount = 0;
        }

        // Removed get-logs and save-logs handlers

        // Renderer error reporting — catches errors from AppErrorBoundary and
        // unhandled exceptions/rejections in the renderer process so they appear
        // in the electron-log file on disk.
        ipcMain.on('renderer-error', (_event, payload: { source: string; message: string; stack?: string }) => {
            const msg = `[Renderer:${payload.source}] ${payload.message}`;
            log.error(msg);
            console.error(msg);
            if (payload.stack) {
                log.error(`[Renderer:${payload.source}] Stack: ${payload.stack}`);
                console.error(`[Renderer:${payload.source}] Stack: ${payload.stack}`);
            }
        });

        // Periodic memory diagnostics — log every 5 minutes so we can spot
        // gradual leaks that precede a renderer crash.
        setInterval(() => {
            const mem = process.memoryUsage();
            const msg =
                `[Diagnostics] Main process — rss: ${(mem.rss / 1024 / 1024).toFixed(1)}MB, ` +
                `heapUsed: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB, ` +
                `heapTotal: ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB, ` +
                `activeUploads: ${activeUploads.size}, ` +
                `hashCache: ${fileHashByPath.size}, ` +
                `detailsCache: ${bulkLogDetailsCache.size}`;
            log.info(msg);
            console.log(msg);
            // Ask renderer for its heap stats (if alive)
            try {
                if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                    win.webContents.send('request-renderer-diagnostics');
                }
            } catch { /* renderer may be gone */ }
        }, 5 * 60 * 1000);

        ipcMain.on('renderer-diagnostics', (_event, payload: { heapUsed: number; heapTotal: number; heapLimit: number; logCount: number }) => {
            const msg =
                `[Diagnostics] Renderer — heapUsed: ${(payload.heapUsed / 1024 / 1024).toFixed(1)}MB, ` +
                `heapTotal: ${(payload.heapTotal / 1024 / 1024).toFixed(1)}MB, ` +
                `heapLimit: ${(payload.heapLimit / 1024 / 1024).toFixed(1)}MB, ` +
                `logCount: ${payload.logCount}`;
            log.info(msg);
            console.log(msg);
        });

        const applySettings = (settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'embed', discordEnemySplitSettings?: { image?: boolean; embed?: boolean; tiled?: boolean }, discordSplitEnemiesByTeam?: boolean, webhooks?: any[], reportWebhooks?: any[], selectedWebhookId?: string | null, dpsReportToken?: string | null, closeBehavior?: 'minimize' | 'quit', embedStatSettings?: any, mvpWeights?: any, mvpWeightProfiles?: any, statsViewSettings?: any, disruptionMethod?: DisruptionMethod, colorPalette?: string, glassSurfaces?: boolean, glassmorphic?: boolean, particlesEnabled?: boolean, githubRepoOwner?: string | null, githubRepoName?: string | null, githubBranch?: string | null, githubPagesBaseUrl?: string | null, githubToken?: string | null, githubLogoPath?: string | null, githubFavoriteRepos?: string[], walkthroughSeen?: boolean, allowLocalJson?: boolean, r2AccountId?: string | null, r2AccessKeyId?: string | null, r2SecretAccessKey?: string | null, r2BucketName?: string | null, r2PublicUrl?: string | null, r2PreciseReplay?: boolean, r2HostingEnabled?: boolean, r2SliceEnabled?: boolean, reportWebhookSelection?: string[], reportWebhookSeen?: string[] }) => {
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
            if (settings.reportWebhooks !== undefined) {
                store.set('reportWebhooks', settings.reportWebhooks);
            }
            if (settings.reportWebhookSelection !== undefined) {
                store.set('reportWebhookSelection', settings.reportWebhookSelection);
            }
            if (settings.reportWebhookSeen !== undefined) {
                store.set('reportWebhookSeen', settings.reportWebhookSeen);
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
                store.set('mvpWeights', normalizeMvpWeights(settings.mvpWeights));
            }
            if (settings.mvpWeightProfiles !== undefined) {
                store.set('mvpWeightProfiles', settings.mvpWeightProfiles);
            }
            if (settings.statsViewSettings !== undefined) {
                store.set('statsViewSettings', settings.statsViewSettings);
            }
            if (settings.disruptionMethod !== undefined) {
                store.set('disruptionMethod', settings.disruptionMethod);
                discord?.setDisruptionMethod(settings.disruptionMethod);
            }
            if ((settings as { commanderThresholds?: unknown }).commanderThresholds !== undefined) {
                store.set('commanderThresholds', (settings as { commanderThresholds?: unknown }).commanderThresholds);
            }
            if (settings.colorPalette !== undefined) {
                store.set('colorPalette', settings.colorPalette);
            }
            if (settings.glassSurfaces !== undefined) {
                store.set('glassSurfaces', settings.glassSurfaces);
            }
            if (settings.glassmorphic !== undefined) {
                store.set('glassmorphic', settings.glassmorphic);
            }
            if (settings.particlesEnabled !== undefined) {
                store.set('particlesEnabled', settings.particlesEnabled);
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
            if (settings.githubLogoPath !== undefined) {
                store.set('githubLogoPath', settings.githubLogoPath);
            }
            if (settings.githubFavoriteRepos !== undefined) {
                store.set('githubFavoriteRepos', settings.githubFavoriteRepos);
            }
            if (settings.walkthroughSeen !== undefined) {
                store.set('walkthroughSeen', settings.walkthroughSeen);
            }
            if (settings.allowLocalJson !== undefined) {
                store.set('allowLocalJson', settings.allowLocalJson);
            }
            if (settings.r2AccountId !== undefined) {
                store.set('r2AccountId', settings.r2AccountId);
            }
            if (settings.r2AccessKeyId !== undefined) {
                store.set('r2AccessKeyId', settings.r2AccessKeyId);
            }
            if (settings.r2SecretAccessKey !== undefined) {
                store.set('r2SecretAccessKey', settings.r2SecretAccessKey);
            }
            if (settings.r2BucketName !== undefined) {
                store.set('r2BucketName', settings.r2BucketName);
            }
            if (settings.r2PublicUrl !== undefined) {
                store.set('r2PublicUrl', settings.r2PublicUrl);
            }
            if (settings.r2HostingEnabled !== undefined) {
                store.set('r2HostingEnabled', settings.r2HostingEnabled);
            }
            if (settings.r2SliceEnabled !== undefined) {
                store.set('r2SliceEnabled', settings.r2SliceEnabled);
            }
            if (settings.r2PreciseReplay !== undefined) {
                store.set('r2PreciseReplay', settings.r2PreciseReplay);
            }
        };

        // ─── Register IPC handlers ─────────────────────────────────────────────────
        registerFileHandlers({ getWindow: () => win });
        registerAppHandlers({ store, getWindow: () => win });
        registerDiscordHandlers({
            store,
            getDiscord: () => discord,
            setConsoleLogForwarding,
            getConsoleLogHistory,
        });
        registerSettingsHandlers({
            store,
            getWindow: () => win,
            clearDpsReportCache,
            fetchImageBuffer,
            onApplySettings: (settings) => applySettings(settings),
        });
        registerUploadHandlers({
            store,
            getWindow: () => win,
            getWatcher: () => watcher,
            processLogFile,
            setBulkUploadMode: (v) => { bulkUploadMode = v; },
            getActiveUploads: () => activeUploads,
            getUploadRetryQueuePayload,
            loadUploadRetryQueue,
            loadUploadRetryState,
            setUploadRetryPaused,
            getBulkLogDetails,
            loadPersistedLogDetails,
        });
        registerGithubHandlers({
            store,
            getWindow: () => win,
        });
        registerCloudflareHandlers({
            store,
            getWindow: () => win,
        });
        registerEiHandlers({
            store,
            getWindow: () => win,
            getEiManager: () => eiManager!,
            getAxilogManager: () => axilogManager,
        });
        registerReparseHandlers({
            getAxilogManager: () => axilogManager,
            getBackend: () => getParserBackend(),
            getPruneOptions: statsPruneOptions,
            setBulkLogDetails,
        });
    })
}
