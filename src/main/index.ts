import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import fs from 'fs'
import path from 'node:path'
import https from 'node:https'
import { createHash } from 'node:crypto'

import { spawn } from 'node:child_process'
import { BASE_WEB_THEMES, CRT_WEB_THEME, CRT_WEB_THEME_ID, DEFAULT_WEB_THEME_ID, KINETIC_DARK_WEB_THEME, KINETIC_DARK_WEB_THEME_ID, KINETIC_SLATE_WEB_THEME, KINETIC_SLATE_WEB_THEME_ID, KINETIC_WEB_THEME, KINETIC_WEB_THEME_ID, MATTE_WEB_THEME, MATTE_WEB_THEME_ID, type WebTheme } from '../shared/webThemes';
import { DEFAULT_DISRUPTION_METHOD, DisruptionMethod } from '../shared/metricsSettings';
import { LogWatcher } from './watcher'
import { Uploader, UploadResult } from './uploader'
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
    buildManifestEntry,
    attachConditionMetrics,
    hasUsableFightDetails,
    isDetailsPermalinkNotFound,
} from './detailsProcessing';
import {
    parseVersion,
    compareVersion,
    extractReleaseNotesRangeFromFile,
} from './versionUtils';
import { fetchImageBuffer } from './imageFetcher';
import { setupConsoleLogger } from './consoleLogger';
import {
    getDevDatasetsDir,
    ensureDevDatasetsDir,
    sanitizeDevDatasetId,
    sanitizeDevDatasetName,
    devDatasetFolderCache,
    devDatasetFinalFolderCache,
    devDatasetManifestCache,
    MAX_DEV_DATASET_REPORT_BYTES,
    DEV_DATASET_SNAPSHOT_SCHEMA_VERSION,
    DEV_DATASET_TEMP_PREFIX,
    DEV_DATASET_STATUS_FILE,
    DEV_DATASET_INTEGRITY_FILE,
    DEV_DATASET_INTEGRITY_SCHEMA_VERSION,
    MAX_GITHUB_BLOB_BYTES,
    MAX_GITHUB_REPORT_JSON_BYTES,
    getDevDatasetFolderName,
    getDevDatasetTempFolderName,
    isDevDatasetTempFolder,
    normalizeDevDatasetSnapshot,
    writeDevDatasetStatus,
    readDevDatasetStatus,
    getDatasetRelativeLogPath,
    normalizeDatasetRelativePath,
    resolveDatasetLogPath,
    resolveOrderedDatasetLogPaths,
    buildDatasetIntegrity,
    validateDatasetIntegrity,
    readJsonFilesWithLimit,
    writeJsonFilesWithLimit,
} from './devDatasets';
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
    type DpsReportCacheEntry,
} from './dpsReportCache';

import { registerFileHandlers } from './handlers/fileHandlers';
import { registerAppHandlers } from './handlers/appHandlers';
import { registerDiscordHandlers } from './handlers/discordHandlers';
import {
    registerSettingsHandlers,
    DEFAULT_EMBED_STATS,
    DEFAULT_MVP_WEIGHTS,
    DEFAULT_STATS_VIEW_SETTINGS,
    DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS,
    normalizeKineticThemeVariant,
    inferKineticThemeVariantFromThemeId,
} from './handlers/settingsHandlers';
import { registerDatasetHandlers } from './handlers/datasetHandlers';
import { registerUploadHandlers } from './handlers/uploadHandlers';
import { registerGithubHandlers } from './handlers/githubHandlers';

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

if (!app.isPackaged) {
    const devUserDataDir = path.join(app.getPath('appData'), 'ArcBridge-Dev');
    app.setPath('userData', devUserDataDir);
}

const { setForwarding: setConsoleLogForwarding, getHistory: getConsoleLogHistory } = setupConsoleLogger(() => win);

const Store = require('electron-store');
const store = new Store();


// Local wrappers bind the store-injected functions from uploadRetryQueue.ts to
// the module-level electron-store instance, preserving all existing call sites.
const loadUploadRetryQueue = (): Record<string, UploadRetryQueueEntry> => loadUploadRetryQueueFromStore(store);
const saveUploadRetryQueue = (queue: Record<string, UploadRetryQueueEntry>) => saveUploadRetryQueueToStore(store, queue);
const loadUploadRetryState = (): UploadRetryRuntimeState => loadUploadRetryStateFromStore(store);
const saveUploadRetryState = (state: UploadRetryRuntimeState) => saveUploadRetryStateToStore(store, state);

const getLegacyDpsReportCacheDir = () => path.join(app.getPath('userData'), 'dps-report-cache');
const getDpsReportCacheDir = () => path.join(app.getPath('temp'), 'arcbridge-dps-report-cache');

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
let resolvedRetryCount = 0;
const activeUploads = new Set<string>();
const pendingDiscordLogs = new Map<string, { result: any, jsonDetails: any }>();
const recentDiscordSends = new Map<string, number>();
const DISCORD_DEDUPE_TTL_MS = 2 * 60 * 1000;
let discordNoWebhookLogAt = 0;
let bulkUploadMode = false;
const BULK_PROCESS_CONCURRENCY = 3;
const bulkLogDetailsCache = new Map<string, any>();
const bulkLogDetailsByBaseName = new Map<string, any>();
const BULK_LOG_DETAILS_CACHE_MAX = 600;
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
const fetchDetailsFromPermalinkWithRetry = async (permalink: string) => {
    if (!uploader || !permalink) return { details: null as any | null, terminal: false };
    try {
        const fetched = await uploader.fetchDetailedJson(permalink);
        if (fetched?.error) {
            const code = String(fetched.error || '').toLowerCase();
            const terminal = code === 'incomplete-json'
                || code === 'invalid-json'
                || code === 'empty-json-payload'
                || isDetailsPermalinkNotFound(fetched);
            return {
                details: null as any | null,
                terminal,
                errorCode: code || undefined
            };
        }
        if (fetched) {
            const enriched = attachConditionMetrics(fetched);
            if (hasUsableFightDetails(enriched)) {
                return { details: enriched, terminal: false };
            }
            return { details: null as any | null, terminal: true };
        }
    } catch (err: any) {
        console.warn('[Main] get-log-details permalink refresh failed:', err?.message || err);
    }
    return { details: null as any | null, terminal: false };
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
const GITHUB_PROTOCOL = 'arcbridge';
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';

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

        let result = cached?.entry?.result || await uploader.upload(filePath);
        let cacheRecomputedFrom404 = false;

        if (result && !result.error) {
            if (cached?.entry?.result) {
                console.log(`[Main] Cache hit for ${filePath}. Using cached dps.report permalink.`);
            } else {
                console.log(`[Main] Upload successful: ${result.permalink}. Fetching details...`);
            }

            let jsonDetails = cached?.jsonDetails || await uploader.fetchDetailedJson(result.permalink);
            if (cached?.entry?.result && isDetailsPermalinkNotFound(jsonDetails)) {
                console.warn(`[Cache] Cached permalink returned 404 for ${filePath}. Re-uploading to refresh permalink.`);
                if (cacheKey) {
                    invalidateDpsReportCacheEntry(cacheKey, 'permalink-404');
                }
                const refreshedResult = await uploader.upload(filePath);
                if (refreshedResult && !refreshedResult.error) {
                    result = refreshedResult;
                    cacheRecomputedFrom404 = true;
                    jsonDetails = await uploader.fetchDetailedJson(result.permalink);
                } else {
                    result = refreshedResult;
                    jsonDetails = null;
                }
            }
            if (!result || result.error) {
                markUploadRetryFailure(filePath, result?.error || 'Unknown upload error', result?.statusCode);
                win?.webContents.send('upload-complete', { ...result, filePath, status: 'error' });
                console.log(`[Main] upload-complete error: ${filePath} msg=${result?.error || 'unknown'}`);
                return;
            }
            if (!jsonDetails || jsonDetails.error) {
                const reason = jsonDetails?.error || 'null-response';
                console.warn(`[Main] JSON details missing or error for ${filePath} (${result.permalink}): ${reason}`);
            }

            const isUnrecoverableDetailsError = Boolean(
                jsonDetails?.error
                && ['incomplete-json', 'invalid-json', 'empty-json-payload'].includes(String(jsonDetails.error))
            );
            if ((!jsonDetails || jsonDetails.error) && !isUnrecoverableDetailsError) {
                const retryReason = jsonDetails?.error || 'null-response';
                console.warn(`[Main] JSON details unresolved for ${filePath} (${result.permalink}): ${retryReason}`);
            }

            if (jsonDetails && !jsonDetails.error) {
                jsonDetails = attachConditionMetrics(jsonDetails);
            }

            const hasJsonPayload = Boolean(jsonDetails && !jsonDetails.error);
            const hasUsableDetails = Boolean(hasJsonPayload && hasUsableFightDetails(jsonDetails));
            const cacheableDetails = hasUsableDetails ? jsonDetails : null;
            if (cacheKey && (!cached?.entry?.result || cacheRecomputedFrom404)) {
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
            if (shouldSendDiscord) {
                console.log(`[Main] Preparing Discord delivery. Configured type: ${notificationType}`);
            }

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
                const now = Date.now();
                if (now - discordNoWebhookLogAt > 15000) {
                    console.log('[Main] Discord notifications disabled: no webhook selected.');
                    discordNoWebhookLogAt = now;
                }
            }

            const hasDetails = hasUsableDetails;
            const detailsErrorCode = String(jsonDetails?.error || '').toLowerCase();
            const detailsKnownUnavailable = detailsErrorCode === 'incomplete-json'
                || detailsErrorCode === 'invalid-json'
                || detailsErrorCode === 'empty-json-payload'
                || (hasJsonPayload && !hasUsableDetails);
            const prunedDetails = hasDetails ? pruneDetailsForStats(jsonDetails) : null;
            const playerCount = Array.isArray(prunedDetails?.players) ? prunedDetails.players.length : undefined;
            const dashboardSummary = prunedDetails ? buildDashboardSummaryFromDetails(prunedDetails) : undefined;
            const detailsSummary = {
                fightName: prunedDetails?.fightName,
                encounterDuration: prunedDetails?.encounterDuration,
                uploadTime: prunedDetails?.uploadTime,
                success: prunedDetails?.success
            };
            if (prunedDetails) {
                setBulkLogDetails(filePath, prunedDetails);
                void updateGlobalManifest(prunedDetails, filePath);
            }
            if (bulkUploadMode) {
                win?.webContents.send('upload-complete', {
                    ...result,
                    ...detailsSummary,
                    filePath,
                    status: hasDetails ? 'calculating' : 'success',
                    detailsAvailable: hasDetails,
                    detailsFetchExhausted: detailsKnownUnavailable,
                    detailsKnownUnavailable,
                    playerCount,
                    dashboardSummary
                });
                console.log(`[Main] upload-complete (bulk): ${filePath} players=${playerCount ?? 'n/a'}`);
            } else {
                win?.webContents.send('upload-complete', {
                    ...result,
                    ...detailsSummary,
                    filePath,
                    status: hasDetails ? 'calculating' : 'success',
                    detailsAvailable: hasDetails,
                    detailsFetchExhausted: detailsKnownUnavailable,
                    detailsKnownUnavailable,
                    playerCount,
                    dashboardSummary
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

        const applySettings = (settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'image' | 'image-beta' | 'embed', discordEnemySplitSettings?: { image?: boolean; embed?: boolean; tiled?: boolean }, discordSplitEnemiesByTeam?: boolean, webhooks?: any[], selectedWebhookId?: string | null, dpsReportToken?: string | null, closeBehavior?: 'minimize' | 'quit', embedStatSettings?: any, mvpWeights?: any, statsViewSettings?: any, disruptionMethod?: DisruptionMethod, uiTheme?: 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic', kineticFontStyle?: 'default' | 'original', kineticThemeVariant?: 'light' | 'midnight' | 'slate', dashboardLayout?: 'top' | 'side', githubRepoOwner?: string | null, githubRepoName?: string | null, githubBranch?: string | null, githubPagesBaseUrl?: string | null, githubToken?: string | null, githubWebTheme?: string | null, githubLogoPath?: string | null, githubFavoriteRepos?: string[], walkthroughSeen?: boolean }) => {
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
            if (settings.kineticFontStyle !== undefined) {
                store.set('kineticFontStyle', settings.kineticFontStyle);
            }
            if (settings.kineticThemeVariant !== undefined) {
                store.set('kineticThemeVariant', normalizeKineticThemeVariant(settings.kineticThemeVariant));
            }
            if (settings.dashboardLayout !== undefined) {
                store.set('dashboardLayout', settings.dashboardLayout);
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

        // ─── Register IPC handlers ─────────────────────────────────────────────────
        registerFileHandlers({ getWindow: () => win });
        registerAppHandlers({ store, getWindow: () => win });
        registerDiscordHandlers({
            store,
            getDiscord: () => discord,
            pendingDiscordLogs,
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
        registerDatasetHandlers();
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
            setBulkLogDetails,
            getKnownFileHash,
            updateDpsReportCacheDetails,
            fetchDetailsFromPermalinkWithRetry,
        });
        registerGithubHandlers({
            store,
            getWindow: () => win,
        });
    })
}
