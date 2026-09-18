import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import type { SliceTilePlacement } from '../../shared/sliceGeometry';

export interface TileFetcher { (url: string): Promise<Buffer>; }

export interface TileCacheOptions {
    cacheDir: string;
    fetcher?: TileFetcher;
    concurrency?: number;
    maxBytes?: number;
    /** Overall wall-clock budget for the whole call, in ms. See resolveTiles. */
    deadlineMs?: number;
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_DEADLINE_MS = 8000;

const httpFetcher: TileFetcher = async (url) => {
    const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: FETCH_TIMEOUT_MS,
    });
    return Buffer.from(res.data);
};

/** Cache filename for a tile URL. Hashed because a URL is not a safe path. */
const cacheKey = (url: string) => `${createHash('sha1').update(url).digest('hex')}.jpg`;

const toDataUrl = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`;

/**
 * Resolve tile URLs to `data:` URLs, reading through a disk cache.
 *
 * Data URLs rather than the originals because the renderer paints these onto
 * a canvas it must then read back: `tiles.guildwars2.com` sends no
 * `Access-Control-Allow-Origin`, so a remote URL would taint the canvas and
 * make `toBlob()` throw. See the design doc.
 *
 * A tile that cannot be fetched is omitted rather than fatal — a missing tile
 * is a gap in a decorative image, and this function never throws.
 *
 * The whole call is also bounded by `deadlineMs` (default 8s): if fetching
 * every tile would take too long — e.g. a slow-but-not-hung tile host, where
 * each of ~60 tiles legitimately takes close to its own per-request timeout —
 * `resolveTiles` still resolves on time with whatever tiles finished first.
 * This is the same "omit what didn't make it" contract as any other partial
 * failure, not a new outcome. Work still in flight when the deadline fires
 * keeps running in the background (its own errors are already caught inside
 * the worker), but it can never mutate the array already handed back to the
 * caller — that array is a fresh copy taken at the deadline.
 */
export async function resolveTiles(
    tiles: SliceTilePlacement[],
    options: TileCacheOptions,
): Promise<SliceTilePlacement[]> {
    if (tiles.length === 0) return [];
    const { cacheDir, fetcher = httpFetcher } = options;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    const deadlineMs = Math.max(0, options.deadlineMs ?? DEFAULT_DEADLINE_MS);

    try {
        await fs.mkdir(cacheDir, { recursive: true });
    } catch {
        // An unusable cache dir degrades to fetching every time, not to failing.
    }

    const resolved: Array<SliceTilePlacement | null> = new Array(tiles.length).fill(null);
    let cursor = 0;
    let fetched = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor++;
            if (index >= tiles.length) return;
            const tile = tiles[index];
            const path = join(cacheDir, cacheKey(tile.url));

            try {
                const cached = await fs.readFile(path);
                resolved[index] = { ...tile, url: toDataUrl(cached) };
                continue;
            } catch {
                // Cache miss (or corrupt/unreadable cache entry) — fall through to the network.
            }

            try {
                const buffer = await fetcher(tile.url);
                if (!buffer?.length) continue;
                resolved[index] = { ...tile, url: toDataUrl(buffer) };
                fetched += 1;
                try {
                    await fs.writeFile(path, buffer);
                } catch {
                    // A tile we could not cache is still a tile we can draw.
                }
            } catch {
                // Omitted: a 404 on a synthetic hi-res tile is expected.
            }
        }
    };

    const workersDone = Promise.all(
        Array.from({ length: Math.min(concurrency, tiles.length) }, worker),
    ).then(() => true as const);

    let deadlineTimer: NodeJS.Timeout;
    const deadlineHit = new Promise<false>((resolve) => {
        deadlineTimer = setTimeout(() => resolve(false), deadlineMs);
    });

    const completedInTime = await Promise.race([workersDone, deadlineHit]);
    clearTimeout(deadlineTimer!);

    // Snapshot now, before any late worker can touch `resolved` further —
    // this filtered copy is a distinct array, so it is safe to return even
    // though background workers (on the deadline-hit path) may still be
    // writing into `resolved` after this point.
    const result = resolved.filter((t): t is SliceTilePlacement => t !== null);

    if (completedInTime && fetched > 0) {
        void pruneCache(cacheDir, options.maxBytes ?? DEFAULT_MAX_BYTES);
    }

    return result;
}

/** Drop the least recently used tiles until the cache fits its budget. */
async function pruneCache(cacheDir: string, maxBytes: number): Promise<void> {
    try {
        const names = await fs.readdir(cacheDir);
        const entries: Array<{ path: string; size: number; atime: number }> = [];
        let total = 0;
        for (const name of names) {
            const path = join(cacheDir, name);
            try {
                const stat = await fs.stat(path);
                if (!stat.isFile()) continue;
                entries.push({ path, size: stat.size, atime: stat.atimeMs });
                total += stat.size;
            } catch {
                // Raced with another prune; skip it.
            }
        }
        if (total <= maxBytes) return;

        entries.sort((a, b) => a.atime - b.atime);
        for (const entry of entries) {
            if (total <= maxBytes) break;
            try {
                await fs.unlink(entry.path);
                total -= entry.size;
            } catch {
                // Already gone.
            }
        }
    } catch {
        // Pruning is housekeeping; failing it must not fail a report.
    }
}
