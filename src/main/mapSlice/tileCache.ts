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
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

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
 */
export async function resolveTiles(
    tiles: SliceTilePlacement[],
    options: TileCacheOptions,
): Promise<SliceTilePlacement[]> {
    if (tiles.length === 0) return [];
    const { cacheDir, fetcher = httpFetcher } = options;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

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

    await Promise.all(
        Array.from({ length: Math.min(concurrency, tiles.length) }, worker),
    );

    if (fetched > 0) {
        await pruneCache(cacheDir, options.maxBytes ?? DEFAULT_MAX_BYTES);
    }

    return resolved.filter((t): t is SliceTilePlacement => t !== null);
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
