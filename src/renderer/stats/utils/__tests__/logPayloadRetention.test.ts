import { describe, expect, it } from 'vitest';
import { LogPayloadCache, readHeapPressure, RETENTION_TIERS } from '../logPayloadRetention';

const makeEntry = (id: string) => ({
    sourceLog: { id },
    sourceDetails: null,
    sourceOwners: null,
    pruned: { id, details: { players: [] } },
    sent: false,
});

/** Cache with a fixed, injected heap-pressure reading. */
const cacheAt = (pressure: number | null) =>
    new LogPayloadCache({ readPressure: () => pressure });

describe('readHeapPressure', () => {
    it('returns null when performance.memory is unavailable', () => {
        expect(readHeapPressure({} as any)).toBeNull();
    });

    it('returns null for a zero or missing heap limit', () => {
        expect(readHeapPressure({ memory: { usedJSHeapSize: 100, jsHeapSizeLimit: 0 } } as any)).toBeNull();
        expect(readHeapPressure({ memory: { usedJSHeapSize: 100 } } as any)).toBeNull();
    });

    it('reports used/limit utilisation', () => {
        const pressure = readHeapPressure({
            memory: { usedJSHeapSize: 3_000_000_000, jsHeapSizeLimit: 6_000_000_000 },
        } as any);
        expect(pressure).toBeCloseTo(0.5, 5);
    });
});

describe('LogPayloadCache retention budget', () => {
    it('keeps the full fast-path cache while heap headroom is plentiful', () => {
        const cache = cacheAt(0.1);
        for (let i = 0; i < 200; i++) cache.set(`log-${i}`, makeEntry(`log-${i}`));
        expect(cache.size).toBe(RETENTION_TIERS.max);
    });

    it('trims hard once heap utilisation crosses the high-pressure threshold', () => {
        const cache = cacheAt(RETENTION_TIERS.highPressure + 0.05);
        for (let i = 0; i < 200; i++) cache.set(`log-${i}`, makeEntry(`log-${i}`));
        expect(cache.size).toBe(RETENTION_TIERS.min);
    });

    it('uses the intermediate budget at moderate pressure', () => {
        const cache = cacheAt(RETENTION_TIERS.softPressure + 0.01);
        for (let i = 0; i < 200; i++) cache.set(`log-${i}`, makeEntry(`log-${i}`));
        expect(cache.size).toBe(RETENTION_TIERS.soft);
    });

    it('falls back to a conservative budget when no heap reading is available', () => {
        const cache = cacheAt(null);
        for (let i = 0; i < 200; i++) cache.set(`log-${i}`, makeEntry(`log-${i}`));
        expect(cache.size).toBe(RETENTION_TIERS.fallback);
    });

    it('re-trims already-resident entries when pressure rises after insertion', () => {
        let pressure = 0.1;
        const cache = new LogPayloadCache({ readPressure: () => pressure });
        for (let i = 0; i < 60; i++) cache.set(`log-${i}`, makeEntry(`log-${i}`));
        expect(cache.size).toBe(60);

        pressure = RETENTION_TIERS.highPressure + 0.05;
        const evicted = cache.trim();
        expect(cache.size).toBe(RETENTION_TIERS.min);
        expect(evicted.length).toBe(60 - RETENTION_TIERS.min);
    });
});

describe('LogPayloadCache eviction reporting', () => {
    it('reports evicted keys so the worker can forget them in lockstep', () => {
        const cache = cacheAt(RETENTION_TIERS.highPressure + 0.05);
        const evictedAcrossInserts: string[] = [];
        for (let i = 0; i < RETENTION_TIERS.min + 3; i++) {
            evictedAcrossInserts.push(...cache.set(`log-${i}`, makeEntry(`log-${i}`)));
        }
        expect(evictedAcrossInserts).toEqual(['log-0', 'log-1', 'log-2']);
        expect(cache.has('log-0')).toBe(false);
    });

    it('evicts least-recently-used first, and get() promotes', () => {
        const cache = cacheAt(RETENTION_TIERS.highPressure + 0.05);
        for (let i = 0; i < RETENTION_TIERS.min; i++) cache.set(`log-${i}`, makeEntry(`log-${i}`));

        // Promote the oldest entry so the next-oldest is evicted instead.
        cache.get('log-0');
        const evicted = cache.set('fresh', makeEntry('fresh'));

        expect(evicted).toEqual(['log-1']);
        expect(cache.has('log-0')).toBe(true);
    });
});

describe('LogPayloadCache set coherence', () => {
    it('drops keys outside the current log set and reports them', () => {
        const cache = cacheAt(0.1);
        ['a', 'b', 'c'].forEach((id) => cache.set(id, makeEntry(id)));

        const dropped = cache.retain(new Set(['a', 'c']));

        expect(dropped).toEqual(['b']);
        expect(cache.has('b')).toBe(false);
        expect(cache.has('a')).toBe(true);
    });

    it('markAllUnsent clears transfer state without dropping memoised payloads', () => {
        const cache = cacheAt(0.1);
        const entry = makeEntry('a');
        cache.set('a', entry);
        entry.sent = true;

        cache.markAllUnsent();

        expect(cache.size).toBe(1);
        expect(cache.get('a')?.sent).toBe(false);
        // Same object identity — the pruned payload memo survives.
        expect(cache.get('a')?.pruned).toBe(entry.pruned);
    });
});

describe('regression: bulk ingestion retention ceiling', () => {
    /**
     * The OOM this guards: streaming a large log set used to retain one pruned
     * payload per log on the main thread (prunedLogCacheRef grew to logs.length)
     * plus a structured-clone per log in the worker, defeating the 15-entry
     * DetailsCache LRU. At ~55 MB of V8 heap per pruned log, 66 logs x 2 copies
     * exceeded the 6144 MB renderer ceiling.
     */
    it('never retains more than the high-pressure budget while heap is stressed', () => {
        const cache = cacheAt(0.85);
        const forgotten: string[] = [];
        for (let i = 0; i < 66; i++) {
            forgotten.push(...cache.set(`/logs/fight-${i}.zevtc`, makeEntry(`fight-${i}`)));
        }
        expect(cache.size).toBeLessThanOrEqual(RETENTION_TIERS.min);
        // Everything trimmed was reported, so the worker store shrinks in step.
        expect(forgotten.length).toBe(66 - RETENTION_TIERS.min);
    });
});
