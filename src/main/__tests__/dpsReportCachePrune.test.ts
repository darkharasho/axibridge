import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import {
    loadDpsReportCacheEntry,
    resetDpsReportCachePruneThrottle,
    saveDpsReportCacheEntry,
    DPS_REPORT_CACHE_KEY
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
