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

});
