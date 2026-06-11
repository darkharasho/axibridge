/**
 * DPS report upload result cache — index CRUD, TTL expiry, and filesystem management.
 *
 * Store-dependent functions accept a `StoreAdapter` so they can be unit-tested
 * without a real electron-store or any Electron API.
 * Dir-dependent functions accept `getCacheDir` / `getLegacyCacheDir` callbacks
 * for the same reason — callers in index.ts bind these to `app.getPath()`.
 */

import fs from 'fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { StoreAdapter } from './uploadRetryQueue';
import type { UploadResult } from './uploader';

// ─── Extended adapter (needed for store.delete in clearDpsReportCache) ────────

export interface CacheStoreAdapter extends StoreAdapter {
    delete(key: string): void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DpsReportCacheEntry = {
    hash: string;
    createdAt: number;
    result: UploadResult;
    detailsPath?: string | null;
    detailsCachedAt?: number | null;
    detailsSchemaVersion?: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const DPS_REPORT_CACHE_KEY = 'dpsReportCacheIndex';
export const DPS_REPORT_DETAILS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Increment this when the pruned-details schema changes in a way that makes
 * old cached files incompatible (e.g. new fields preserved in pruning).
 * Entries written with an older version are treated as expired and re-fetched.
 *
 * History:
 *   1 → 2: target combatReplayData.positions now preserved (enemy replay data)
 */
export const DETAILS_SCHEMA_VERSION = 2;

// ─── Pure helpers (no store I/O) ──────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a file. Pure async I/O — no store, no Electron.
 */
export const computeFileHash = (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
};

/**
 * Remove a single cache entry — deletes its details file and drops the key.
 * Mutates `index` in place. Pure (no store I/O).
 */
export const removeDpsReportCacheEntry = (index: Record<string, DpsReportCacheEntry>, key: string) => {
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

/**
 * The full prune sweep stats every entry's details file on disk (fs.existsSync
 * per entry) and a changed index triggers a synchronous rewrite of the whole
 * electron-store config — far too expensive to run on every upload during bulk
 * ingestion (it runs on the main process thread that serves all IPC).
 *
 * Stale detailsPath entries are individually self-healing: loadDpsReportCacheEntry
 * already nulls the path when the file read fails. The sweep is pure housekeeping,
 * so it runs at most once per interval.
 */
const PRUNE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastPruneSweepAt = 0;

/** Test hook — reset the prune throttle so sweeps run again immediately. */
export const resetDpsReportCachePruneThrottle = () => {
    lastPruneSweepAt = 0;
};

const shouldRunPruneSweep = (): boolean => {
    const now = Date.now();
    if (now - lastPruneSweepAt < PRUNE_SWEEP_INTERVAL_MS) return false;
    lastPruneSweepAt = now;
    return true;
};

/**
 * Sweep an in-memory index for invalid or stale-file entries.
 * Mutates `index` in place. Returns `true` if any changes were made.
 * Pure (no store I/O).
 */
export const pruneDpsReportCacheIndex = (index: Record<string, DpsReportCacheEntry>): boolean => {
    let changed = false;

    Object.keys(index).forEach((key) => {
        const entry = index[key];
        if (!entry || typeof entry.createdAt !== 'number' || !entry.result?.permalink) {
            console.log(`[Cache] Removing invalid cache entry for ${key}.`);
            removeDpsReportCacheEntry(index, key);
            changed = true;
            return;
        }
        if (entry.detailsPath && !fs.existsSync(entry.detailsPath)) {
            console.log(`[Cache] Cache details missing for ${key}; will refetch JSON.`);
            entry.detailsPath = null;
            entry.detailsCachedAt = null;
            changed = true;
        }
    });

    return changed;
};

// ─── Store I/O ────────────────────────────────────────────────────────────────

export const loadDpsReportCacheIndex = (store: StoreAdapter): Record<string, DpsReportCacheEntry> => {
    const raw = store.get(DPS_REPORT_CACHE_KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, DpsReportCacheEntry>;
};

export const saveDpsReportCacheIndex = (
    store: StoreAdapter,
    index: Record<string, DpsReportCacheEntry>
): void => {
    store.set(DPS_REPORT_CACHE_KEY, index);
};

/**
 * Delete the cache index and remove all cached files from disk.
 * Reports progress via the optional `onProgress` callback.
 */
export const clearDpsReportCache = (
    store: CacheStoreAdapter,
    getCacheDir: () => string,
    getLegacyCacheDir: () => string,
    onProgress?: (data: { stage?: string; message?: string; progress?: number; current?: number; total?: number }) => void
) => {
    onProgress?.({ stage: 'start', message: 'Preparing cache cleanup…', progress: 0 });
    const index = loadDpsReportCacheIndex(store);
    const clearedEntries = Object.keys(index).length;
    store.delete(DPS_REPORT_CACHE_KEY);
    onProgress?.({ stage: 'index', message: 'Cache index cleared.', progress: 20, current: 0, total: 0 });

    const cacheDirs = [getCacheDir(), getLegacyCacheDir()];
    try {
        const existingDirs = cacheDirs.filter((dir) => fs.existsSync(dir));
        const entriesByDir = existingDirs.map((dir) => ({ dir, entries: fs.readdirSync(dir) }));
        const total = entriesByDir.reduce((sum, item) => sum + item.entries.length, 0);
        let current = 0;
        entriesByDir.forEach(({ dir, entries }) => {
            entries.forEach((entry) => {
                fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
                current += 1;
                const progress = total > 0 ? 20 + Math.round((current / total) * 75) : 95;
                onProgress?.({
                    stage: 'files',
                    message: `Removing cached files (${current}/${total})…`,
                    progress,
                    current,
                    total
                });
            });
            fs.rmSync(dir, { recursive: true, force: true });
        });
    } catch (err: any) {
        console.warn('[Main] Failed to remove dps.report cache directory:', err?.message || err);
        return { success: false, clearedEntries, error: 'Failed to remove cache directory.' };
    }

    onProgress?.({ stage: 'done', message: 'Cache cleared.', progress: 100 });
    return { success: true, clearedEntries };
};

export const invalidateDpsReportCacheEntry = (store: StoreAdapter, hash: string, reason: string) => {
    if (!hash) return;
    const index = loadDpsReportCacheIndex(store);
    if (!index[hash]) return;
    console.log(`[Cache] Invalidating ${hash} (${reason}).`);
    removeDpsReportCacheEntry(index, hash);
    saveDpsReportCacheIndex(store, index);
};

export const loadDpsReportCacheEntry = async (store: StoreAdapter, hash: string) => {
    const index = loadDpsReportCacheIndex(store);
    let changed = shouldRunPruneSweep() ? pruneDpsReportCacheIndex(index) : false;
    if (changed) saveDpsReportCacheIndex(store, index);

    const entry = index[hash];
    if (!entry) return null;

    let jsonDetails: any | null = null;
    const detailsCachedAt = Number(entry.detailsCachedAt || entry.createdAt || 0);
    const detailsExpired = detailsCachedAt > 0 && Date.now() - detailsCachedAt > DPS_REPORT_DETAILS_TTL_MS;
    if (entry.detailsPath) {
        if (detailsExpired) {
            try {
                fs.unlinkSync(entry.detailsPath);
            } catch {
                // Ignore file cleanup errors.
            }
            entry.detailsPath = null;
            entry.detailsCachedAt = null;
            index[hash] = entry;
            changed = true;
        } else {
            try {
                const raw = await fs.promises.readFile(entry.detailsPath, 'utf8');
                jsonDetails = JSON.parse(raw);
            } catch {
                jsonDetails = null;
                entry.detailsPath = null;
                entry.detailsCachedAt = null;
                index[hash] = entry;
                changed = true;
            }
        }
    }
    if (changed) saveDpsReportCacheIndex(store, index);

    return { entry, jsonDetails };
};

export const saveDpsReportCacheEntry = async (
    store: StoreAdapter,
    getCacheDir: () => string,
    hash: string,
    result: UploadResult,
    jsonDetails: any | null
) => {
    const cacheDir = getCacheDir();
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch {
        // Cache directory creation failures should not block uploads.
    }

    const index = loadDpsReportCacheIndex(store);
    const entry: DpsReportCacheEntry = {
        hash,
        createdAt: Date.now(),
        result,
        detailsPath: null,
        detailsCachedAt: null,
        detailsSchemaVersion: DETAILS_SCHEMA_VERSION,
    };

    if (jsonDetails) {
        const detailsPath = path.join(cacheDir, `${hash}.json`);
        try {
            await fs.promises.writeFile(detailsPath, JSON.stringify(jsonDetails));
            entry.detailsPath = detailsPath;
            entry.detailsCachedAt = Date.now();
        } catch {
            entry.detailsPath = null;
            entry.detailsCachedAt = null;
        }
    }

    index[hash] = entry;
    if (shouldRunPruneSweep()) pruneDpsReportCacheIndex(index);
    saveDpsReportCacheIndex(store, index);
};

export const updateDpsReportCacheDetails = async (
    store: StoreAdapter,
    getCacheDir: () => string,
    hash: string,
    jsonDetails: any
) => {
    const cacheDir = getCacheDir();
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch {
        return;
    }

    const index = loadDpsReportCacheIndex(store);
    const entry = index[hash];
    if (!entry) return;

    const detailsPath = path.join(cacheDir, `${hash}.json`);
    try {
        await fs.promises.writeFile(detailsPath, JSON.stringify(jsonDetails));
        entry.detailsPath = detailsPath;
        entry.detailsCachedAt = Date.now();
        entry.detailsSchemaVersion = DETAILS_SCHEMA_VERSION;
        index[hash] = entry;
        saveDpsReportCacheIndex(store, index);
    } catch {
        // Ignore cache write errors.
    }
};
