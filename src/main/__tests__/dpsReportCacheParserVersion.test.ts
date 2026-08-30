import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import {
    cachedParserVersionIsStale,
    saveDpsReportCacheEntry,
    updateDpsReportCacheDetails,
    resetDpsReportCachePruneThrottle,
    DPS_REPORT_CACHE_KEY,
    MIN_PARSER_VERSION
} from '../dpsReportCache';

const makeStore = (initial: Record<string, any> = {}) => {
    const data: Record<string, any> = { ...initial };
    return {
        get: (key: string, fallback?: any) => (key in data ? data[key] : fallback),
        set: (key: string, value: any) => { data[key] = value; },
        data
    };
};

describe('cachedParserVersionIsStale', () => {
    it('treats an unstamped entry as stale', () => {
        // Written by a build from before the stamp existed, so which axilog
        // produced it is unknowable — and an axilog older than the minimum is
        // exactly the case this check exists to catch. Re-parsing is the only
        // answer that cannot be wrong.
        expect(cachedParserVersionIsStale({ parserVersion: undefined })).toBe(true);
        expect(cachedParserVersionIsStale({})).toBe(true);
    });

    it('treats a parse from an older axilog as stale', () => {
        // 1.8.2 predates the per-entity cc_taken / strips_taken lanes, so its
        // details can never grow them no matter how many times they are read.
        expect(cachedParserVersionIsStale({ parserVersion: '1.8.2' })).toBe(true);
    });

    it('keeps a parse from the minimum version or newer', () => {
        expect(cachedParserVersionIsStale({ parserVersion: MIN_PARSER_VERSION })).toBe(false);
        expect(cachedParserVersionIsStale({ parserVersion: '1.10.0' })).toBe(false);
        expect(cachedParserVersionIsStale({ parserVersion: '2.0.0' })).toBe(false);
    });

    it('treats an unparseable stamp as stale', () => {
        expect(cachedParserVersionIsStale({ parserVersion: 'nightly' })).toBe(true);
    });
});

describe('parser version stamping', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetDpsReportCachePruneThrottle();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-parserver-'));
    });

    it('stamps the producing parser version when an entry is written', async () => {
        const store = makeStore();
        await saveDpsReportCacheEntry(store, () => tmpDir, 'h1', { permalink: 'p' } as any, { players: [] }, '1.9.0');
        expect(store.data[DPS_REPORT_CACHE_KEY].h1.parserVersion).toBe('1.9.0');
        expect(cachedParserVersionIsStale(store.data[DPS_REPORT_CACHE_KEY].h1)).toBe(false);
    });

    it('re-stamps when details are replaced on an existing entry', async () => {
        // The details file is what carries the lanes, so the stamp has to
        // follow the details — not the entry's original creation.
        const store = makeStore();
        await saveDpsReportCacheEntry(store, () => tmpDir, 'h2', { permalink: 'p' } as any, null, '1.8.2');
        await updateDpsReportCacheDetails(store, () => tmpDir, 'h2', { players: [] }, '1.9.0');
        expect(store.data[DPS_REPORT_CACHE_KEY].h2.parserVersion).toBe('1.9.0');
    });
});
