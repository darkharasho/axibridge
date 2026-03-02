import { ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'fs';
import { AUTH_RETRY_PAUSE_THRESHOLD, type UploadRetryQueueEntry, type UploadRetryRuntimeState, type UploadRetryQueuePayload } from '../uploadRetryQueue';
import { pruneDetailsForStats, hasUsableFightDetails } from '../detailsProcessing';
import { getDevDatasetsDir } from '../devDatasets';

// ─── Module-level state ─────────────────────────────────────────────────────

const pendingDetailsRefreshByPermalink = new Map<string, Promise<{ details: any | null; terminal: boolean; errorCode?: string }>>();
const missingDetailsLogByPath = new Map<string, number>();
const BULK_PROCESS_CONCURRENCY = 3;

// ─── Handler options ───────────────────────────────────────────────────────────

export interface UploadHandlerOptions {
    store: any;
    getWindow: () => BrowserWindow | null;
    getWatcher: () => { start: (dir: string) => void } | null;
    processLogFile: (filePath: string, opts?: { retry?: boolean }) => Promise<void>;
    setBulkUploadMode: (v: boolean) => void;
    getActiveUploads: () => Set<string>;
    getUploadRetryQueuePayload: () => UploadRetryQueuePayload;
    loadUploadRetryQueue: () => Record<string, UploadRetryQueueEntry>;
    loadUploadRetryState: () => UploadRetryRuntimeState;
    setUploadRetryPaused: (paused: boolean, reason: string | null) => void;
    getBulkLogDetails: (filePath: string) => any;
    setBulkLogDetails: (filePath: string, details: any) => void;
    getKnownFileHash: (filePath: string) => string | null;
    updateDpsReportCacheDetails: (hash: string, details: any) => Promise<void>;
    fetchDetailsFromPermalinkWithRetry: (permalink: string) => Promise<{ details: any | null; terminal: boolean; errorCode?: string }>;
}

// ─── Handler registration ──────────────────────────────────────────────────────

export function registerUploadHandlers(opts: UploadHandlerOptions) {
    const {
        store,
        getWindow,
        getWatcher,
        processLogFile,
        setBulkUploadMode,
        getActiveUploads,
        getUploadRetryQueuePayload,
        loadUploadRetryQueue,
        loadUploadRetryState,
        setUploadRetryPaused,
        getBulkLogDetails,
        setBulkLogDetails,
        getKnownFileHash,
        updateDpsReportCacheDetails,
        fetchDetailsFromPermalinkWithRetry,
    } = opts;

    ipcMain.on('start-watching', (_event, dirPath: string) => {
        getWatcher()?.start(dirPath);
        store.set('logDirectory', dirPath);
    });

    ipcMain.on('manual-upload', (_event, filePath: string) => {
        processLogFile(filePath);
    });

    ipcMain.on('manual-upload-batch', (_event, filePaths: string[]) => {
        console.log(`[Main] Received batch of ${filePaths.length} logs.`);
        const win = getWindow();
        if (win && filePaths.length > 1) {
            filePaths.forEach((filePath) => {
                const fileId = path.basename(filePath);
                win.webContents.send('upload-status', { id: fileId, filePath, status: 'queued' });
            });
        }
        // Bounded concurrency lets non-upload steps overlap without flooding dps.report.
        (async () => {
            setBulkUploadMode(filePaths.length > 1);
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
            setBulkUploadMode(false);
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
        const win = getWindow();
        const activeUploads = getActiveUploads();
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

    ipcMain.handle('get-log-details', async (_event, payload: { filePath: string; permalink?: string }) => {
        const filePath = payload?.filePath;
        const permalink = typeof payload?.permalink === 'string' ? payload.permalink.trim() : '';
        if (!filePath) {
            console.warn('[Main] get-log-details missing filePath');
            return { success: false, error: 'Missing filePath.' };
        }
        const details = getBulkLogDetails(filePath);
        if (details && hasUsableFightDetails(details)) {
            return { success: true, details };
        }
        if (permalink) {
            let refreshPromise = pendingDetailsRefreshByPermalink.get(permalink);
            if (!refreshPromise) {
                const activePromise = (async () => {
                    const refreshed = await fetchDetailsFromPermalinkWithRetry(permalink);
                    if (!refreshed.details) return refreshed;
                    const resolved = pruneDetailsForStats(refreshed.details);
                    setBulkLogDetails(filePath, resolved);
                    const knownHash = getKnownFileHash(filePath);
                    if (knownHash) {
                        try {
                            await updateDpsReportCacheDetails(knownHash, refreshed.details);
                        } catch {
                            // Cache refresh failures should not block stats hydration.
                        }
                    }
                    return { details: resolved, terminal: false };
                })();
                pendingDetailsRefreshByPermalink.set(permalink, activePromise);
                activePromise
                    .finally(() => {
                        if (pendingDetailsRefreshByPermalink.get(permalink) === activePromise) {
                            pendingDetailsRefreshByPermalink.delete(permalink);
                        }
                    })
                    .catch(() => {
                        // No-op: handled by caller.
                    });
                refreshPromise = activePromise;
            }
            const refreshed = await refreshPromise;
            if (refreshed?.details) {
                console.log(`[Main] get-log-details refreshed from permalink: ${filePath}`);
                return { success: true, details: refreshed.details };
            }
            if (refreshed?.terminal) {
                return { success: false, terminal: true, error: 'Fight has no usable details.' };
            }
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
        const now = Date.now();
        const lastLoggedAt = missingDetailsLogByPath.get(filePath) || 0;
        if (now - lastLoggedAt > 60000) {
            console.warn(`[Main] get-log-details not found: ${filePath}`);
            missingDetailsLogByPath.set(filePath, now);
            if (missingDetailsLogByPath.size > 2000) {
                const oldestKey = missingDetailsLogByPath.keys().next().value;
                if (oldestKey) {
                    missingDetailsLogByPath.delete(oldestKey);
                }
            }
        }
        return { success: false, error: 'Details not found.' };
    });
}
