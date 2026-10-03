/**
 * The cache index is one store key holding every entry, so adding an entry is
 * read-the-whole-map / mutate / write-the-whole-map. Bulk ingestion runs
 * several `processLogFile` workers at once and each one `await`s a
 * multi-megabyte details write between the read and the write.
 *
 * Before the index lock, two workers read the same snapshot and the second
 * write erased the first's entry. The details file survived on disk with
 * nothing pointing at it, so `readCachedDetailsFile` returned null,
 * `get-log-details` answered "Details not found", and the log reached the user
 * as "N logs could not be read back from the cache" — reproduced here on real
 * files, because the whole failure is about what the index ends up containing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import {
    DPS_REPORT_CACHE_KEY,
    loadDpsReportCacheIndex,
    readCachedDetailsFile,
    resetDpsReportCachePruneThrottle,
    saveDpsReportCacheEntry,
    updateDpsReportCacheDetails,
} from '../dpsReportCache';

const makeStore = (initial: Record<string, any> = {}) => {
    const data: Record<string, any> = { ...initial };
    return {
        get: (key: string, fallback?: any) => (key in data ? data[key] : fallback),
        set: (key: string, value: any) => {
            // electron-store round-trips through JSON, so a caller that keeps a
            // reference to the stored object cannot mutate it after the fact.
            // Without this the test passes for the wrong reason.
            data[key] = JSON.parse(JSON.stringify(value));
        },
        data,
    };
};

const resultFor = (hash: string) => ({
    id: hash,
    permalink: `https://dps.report/${hash}`,
    userToken: '',
}) as any;

describe('dps.report cache index under concurrent writers', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-cache-concurrency-'));
        resetDpsReportCachePruneThrottle();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('keeps every entry when entries are saved concurrently', async () => {
        const store = makeStore();
        const hashes = Array.from({ length: 12 }, (_, i) => `hash-${i}`);

        await Promise.all(hashes.map((hash) => saveDpsReportCacheEntry(
            store,
            () => tmpDir,
            hash,
            resultFor(hash),
            { fightName: hash, players: [{ name: hash }] },
            '1.15.0'
        )));

        const index = loadDpsReportCacheIndex(store);
        expect(Object.keys(index).sort()).toEqual([...hashes].sort());
        for (const hash of hashes) {
            expect(index[hash].detailsPath).toBeTruthy();
            const details = await readCachedDetailsFile(store, hash);
            expect(details?.fightName).toBe(hash);
        }
    });

    it('keeps concurrently-saved entries when details are updated at the same time', async () => {
        const store = makeStore();
        const hashes = Array.from({ length: 8 }, (_, i) => `mixed-${i}`);

        // Seed half the entries so the update path and the save path run
        // against the same index at once — the real bulk-ingest mix, where a
        // re-ingested log takes `updateDpsReportCacheDetails` and a new one
        // takes `saveDpsReportCacheEntry`.
        const seeded = hashes.slice(0, 4);
        for (const hash of seeded) {
            await saveDpsReportCacheEntry(store, () => tmpDir, hash, resultFor(hash), null, '1.15.0');
        }

        await Promise.all(hashes.map((hash) => (seeded.includes(hash)
            ? updateDpsReportCacheDetails(store, () => tmpDir, hash, { fightName: hash }, '1.15.0')
            : saveDpsReportCacheEntry(store, () => tmpDir, hash, resultFor(hash), { fightName: hash }, '1.15.0'))));

        const index = loadDpsReportCacheIndex(store);
        expect(Object.keys(index).sort()).toEqual([...hashes].sort());
        for (const hash of hashes) {
            expect(await readCachedDetailsFile(store, hash)).toMatchObject({ fightName: hash });
        }
    });

    it('does not resurrect entries a concurrent writer added after its own snapshot', async () => {
        // The inverse of the lost update: re-reading the index inside the lock
        // must not reinstate an entry that was deliberately removed between
        // the snapshot and the write.
        const store = makeStore();
        await saveDpsReportCacheEntry(store, () => tmpDir, 'keep', resultFor('keep'), { fightName: 'keep' }, '1.15.0');

        const pending = saveDpsReportCacheEntry(store, () => tmpDir, 'new', resultFor('new'), { fightName: 'new' }, '1.15.0');
        const index = loadDpsReportCacheIndex(store);
        delete index.keep;
        store.set(DPS_REPORT_CACHE_KEY, index);
        await pending;

        expect(Object.keys(loadDpsReportCacheIndex(store))).toEqual(['new']);
    });
});
