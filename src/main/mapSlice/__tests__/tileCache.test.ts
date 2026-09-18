import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTiles } from '../tileCache';

const placement = (url: string) => ({ url, x: 0, y: 0, width: 10, height: 10 });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('resolveTiles', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'slice-tiles-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('returns data URLs and preserves placement geometry', async () => {
        const fetcher = vi.fn(async () => PNG);
        const out = await resolveTiles([placement('https://x/a.jpg')], { cacheDir: dir, fetcher });
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:image/jpeg;base64,')).toBe(true);
        expect(out[0].width).toBe(10);
    });

    it('does not re-fetch a cached tile', async () => {
        const fetcher = vi.fn(async () => PNG);
        const tiles = [placement('https://x/a.jpg')];
        await resolveTiles(tiles, { cacheDir: dir, fetcher });
        await resolveTiles(tiles, { cacheDir: dir, fetcher });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(readdirSync(dir).length).toBe(1);
    });

    it('omits tiles that fail and keeps the ones that succeed', async () => {
        const fetcher = vi.fn(async (url: string) => {
            if (url.includes('bad')) throw new Error('404');
            return PNG;
        });
        const out = await resolveTiles(
            [placement('https://x/good.jpg'), placement('https://x/bad.jpg')],
            { cacheDir: dir, fetcher },
        );
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:')).toBe(true);
    });

    it('returns [] when every tile fails', async () => {
        const fetcher = vi.fn(async () => { throw new Error('offline'); });
        const out = await resolveTiles([placement('https://x/a.jpg')], { cacheDir: dir, fetcher });
        expect(out).toEqual([]);
    });

    it('does not throw when the cache directory cannot be created', async () => {
        // Point cacheDir at a path whose parent is a file, not a directory,
        // so mkdir(recursive) fails every time.
        const blockerFile = join(dir, 'blocker');
        const { writeFileSync } = await import('node:fs');
        writeFileSync(blockerFile, 'not a directory');
        const unusableCacheDir = join(blockerFile, 'nested', 'cache');

        const fetcher = vi.fn(async () => PNG);
        const out = await resolveTiles([placement('https://x/a.jpg')], { cacheDir: unusableCacheDir, fetcher });
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:')).toBe(true);
    });

    it('does not throw when a cache entry is corrupt (still returns a data URL)', async () => {
        // A cache "hit" that reads back garbage bytes is not a throw case:
        // readFile succeeds regardless of content, so it must still resolve.
        const { mkdirSync, writeFileSync } = await import('node:fs');
        mkdirSync(dir, { recursive: true });
        const { createHash } = await import('node:crypto');
        const url = 'https://x/a.jpg';
        const key = `${createHash('sha1').update(url).digest('hex')}.jpg`;
        writeFileSync(join(dir, key), Buffer.from('not a real image'));

        const fetcher = vi.fn(async () => PNG);
        const out = await resolveTiles([placement(url)], { cacheDir: dir, fetcher });
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:')).toBe(true);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('resolves by deadlineMs instead of waiting on a slow-but-not-hung fetch, keeping only what finished', async () => {
        const fetcher = vi.fn((url: string) => {
            if (url.includes('slow')) return new Promise<Buffer>(() => {}); // never settles within the test
            return Promise.resolve(PNG);
        });
        const start = Date.now();
        const out = await resolveTiles(
            [placement('https://x/fast.jpg'), placement('https://x/slow.jpg')],
            { cacheDir: dir, fetcher, concurrency: 2, deadlineMs: 30 },
        );
        const elapsed = Date.now() - start;
        // Generous upper bound: proves resolveTiles did not fall back to
        // waiting on the hung fetch (which never resolves at all).
        expect(elapsed).toBeLessThan(2000);
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:')).toBe(true);
    });

    it('still prunes to the budget on a pass that hit the deadline', async () => {
        // Tiles are written regardless of the deadline, so gating the prune on
        // "completed in time" meant a connection slow enough to hit the
        // deadline regularly grew the cache without bound and the 200MB budget
        // never applied. maxBytes: 1 makes any written tile over budget.
        const fetcher = vi.fn((url: string) => {
            if (url.includes('slow')) return new Promise<Buffer>(() => {});
            return Promise.resolve(PNG);
        });

        const out = await resolveTiles(
            [placement('https://x/fast.jpg'), placement('https://x/slow.jpg')],
            { cacheDir: dir, fetcher, concurrency: 2, deadlineMs: 30, maxBytes: 1 },
        );
        expect(out).toHaveLength(1);       // the deadline really was hit

        // The prune is fire-and-forget, so poll for it rather than awaiting.
        const deadline = Date.now() + 2000;
        while (readdirSync(dir).length > 0 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 10));
        }
        expect(readdirSync(dir)).toEqual([]);
    });
});
