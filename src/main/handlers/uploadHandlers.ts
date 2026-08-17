import { ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'fs';
import { AUTH_RETRY_PAUSE_THRESHOLD, type UploadRetryQueueEntry, type UploadRetryRuntimeState, type UploadRetryQueuePayload } from '../uploadRetryQueue';
import { BULK_PROCESS_CONCURRENCY } from '../../shared/constants';
import { hasUsableFightDetails } from '../detailsProcessing';

// ─── Module-level state ─────────────────────────────────────────────────────

const missingDetailsLogByPath = new Map<string, number>();

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

    /**
     * Serve a log's details from the main-process store.
     *
     * This used to fall back to re-fetching the dps.report permalink when the
     * stored copy looked stale. That fallback is gone with dps.report as a data
     * source: its JSON carries no Axilog data, so the refresh could never
     * satisfy a reader that needs it, and a stale-because-Axilog-less copy would
     * have re-fetched on every hydration forever. Repair now goes through
     * `log:reparse-axilog`, which re-parses the original `.zevtc`.
     */
    ipcMain.handle('get-log-details', async (_event, payload: { filePath: string }) => {
        const filePath = payload?.filePath;
        if (!filePath) {
            console.warn('[Main] get-log-details missing filePath');
            return { success: false, error: 'Missing filePath.' };
        }
        const details = getBulkLogDetails(filePath);
        if (details && hasUsableFightDetails(details)) {
            return { success: true, details };
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
