import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import {
    loadDpsReportCacheEntry,
    resetDpsReportCachePruneThrottle,
    saveDpsReportCacheEntry,
    readCachedDetailsFile,
    DPS_REPORT_CACHE_KEY,
    DPS_REPORT_DETAILS_TTL_MS
} from '../dpsReportCache';

const makeStore = (initial: Record<string, any> = {}) => {
    const data: Record<string, any> = { ...initial };
    let setCount = 0;
    return {
        get: (key: string, fallback?: any) => (key in data ? data[key] : fallback),
        set: (key: string, value: any) => {
            data[key] = value;
            setCount += 1;
        },
        getSetCount: () => setCount,
        data
    };
};

describe('dps.report cache prune throttling', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetDpsReportCachePruneThrottle();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-cache-test-'));
    });

    it('sweeps stale entries on the first load but not on rapid subsequent loads', async () => {
        // One valid entry with an on-disk details file, one with a missing file.
        const goodPath = path.join(tmpDir, 'good.json');
        fs.writeFileSync(goodPath, JSON.stringify({ ok: true }));
        const store = makeStore({
            [DPS_REPORT_CACHE_KEY]: {
                good: { hash: 'good', createdAt: Date.now(), result: { permalink: 'p1' }, detailsPath: goodPath, detailsCachedAt: Date.now() },
                stale: { hash: 'stale', createdAt: Date.now(), result: { permalink: 'p2' }, detailsPath: path.join(tmpDir, 'missing.json'), detailsCachedAt: Date.now() }
            }
        });

        // First load runs the sweep: the stale entry's detailsPath is nulled and saved.
        await loadDpsReportCacheEntry(store, 'good');
        expect(store.data[DPS_REPORT_CACHE_KEY].stale.detailsPath).toBeNull();
        const writesAfterFirstLoad = store.getSetCount();
        expect(writesAfterFirstLoad).toBeGreaterThan(0);

        // Simulate bulk-upload churn: many loads in quick succession must not
        // re-run the sweep or rewrite the store.
        for (let i = 0; i < 50; i++) {
            await loadDpsReportCacheEntry(store, 'good');
        }
        expect(store.getSetCount()).toBe(writesAfterFirstLoad);
    });

    it('still self-heals an individual entry whose details file disappeared', async () => {
        const lostPath = path.join(tmpDir, 'lost.json');
        fs.writeFileSync(lostPath, JSON.stringify({ ok: true }));
        const store = makeStore({
            [DPS_REPORT_CACHE_KEY]: {
                lost: { hash: 'lost', createdAt: Date.now(), result: { permalink: 'p' }, detailsPath: lostPath, detailsCachedAt: Date.now() }
            }
        });

        // Consume the one allowed sweep, then remove the file.
        await loadDpsReportCacheEntry(store, 'lost');
        fs.unlinkSync(lostPath);

        // Even with the sweep throttled, the per-entry read failure nulls the path.
        const result = await loadDpsReportCacheEntry(store, 'lost');
        expect(result?.jsonDetails).toBeNull();
        expect(store.data[DPS_REPORT_CACHE_KEY].lost.detailsPath).toBeNull();
    });

    it('save path skips the sweep while throttled but still persists the entry', async () => {
        const store = makeStore({ [DPS_REPORT_CACHE_KEY]: {} });
        await saveDpsReportCacheEntry(store, () => tmpDir, 'h1', { permalink: 'p1' } as any, { players: [] });
        await saveDpsReportCacheEntry(store, () => tmpDir, 'h2', { permalink: 'p2' } as any, { players: [] });
        expect(Object.keys(store.data[DPS_REPORT_CACHE_KEY])).toEqual(['h1', 'h2']);
    });
});

describe('readCachedDetailsFile', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetDpsReportCachePruneThrottle();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-rehydrate-test-'));
    });

    it('returns details past the TTL and leaves the file in place', async () => {
        // The rehydration path has no fresher source to fall back on: expiring
        // a details file here means the log renders as no fight at all, so the
        // stale copy wins. `loadDpsReportCacheEntry` deliberately does the
        // opposite, and that difference is the point of this function.
        const detailsPath = path.join(tmpDir, 'old.json');
        fs.writeFileSync(detailsPath, JSON.stringify({ players: [{ account: 'a.1234' }] }));
        const staleAt = Date.now() - DPS_REPORT_DETAILS_TTL_MS - 1000;
        const store = makeStore({
            [DPS_REPORT_CACHE_KEY]: {
                old: { hash: 'old', createdAt: staleAt, result: { permalink: 'p' }, detailsPath, detailsCachedAt: staleAt }
            }
        });

        const details = await readCachedDetailsFile(store, 'old');

        expect(details.players).toHaveLength(1);
        expect(fs.existsSync(detailsPath)).toBe(true);
        expect(store.data[DPS_REPORT_CACHE_KEY].old.detailsPath).toBe(detailsPath);
    });

    it('returns null for an unknown hash, a detail-less entry, or an unreadable file', async () => {
        const store = makeStore({
            [DPS_REPORT_CACHE_KEY]: {
                bare: { hash: 'bare', createdAt: Date.now(), result: { permalink: 'p' }, detailsPath: null },
                gone: { hash: 'gone', createdAt: Date.now(), result: { permalink: 'p' }, detailsPath: path.join(tmpDir, 'missing.json') }
            }
        });

        expect(await readCachedDetailsFile(store, 'nope')).toBeNull();
        expect(await readCachedDetailsFile(store, 'bare')).toBeNull();
        expect(await readCachedDetailsFile(store, 'gone')).toBeNull();
        expect(await readCachedDetailsFile(store, '')).toBeNull();
    });
});
