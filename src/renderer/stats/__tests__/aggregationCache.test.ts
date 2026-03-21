import { describe, it, expect, beforeEach } from 'vitest';
import { AggregationLRUCache, hashAggregationSettings, resetAggregationCache, getAggregationCache } from '../aggregationCache';

describe('AggregationLRUCache', () => {
    let cache: AggregationLRUCache;

    beforeEach(() => {
        cache = new AggregationLRUCache({ maxEntries: 3, debugLogging: false });
    });

    describe('hashAggregationSettings', () => {
        it('produces same hash for identical settings', () => {
            const settings1 = {
                mvpWeights: { offensiveDps: 1.0, defensiveHealing: 0.5 },
                statsViewSettings: { showMvp: true },
                disruptionMethod: 'disruption' as const
            };
            const settings2 = {
                mvpWeights: { offensiveDps: 1.0, defensiveHealing: 0.5 },
                statsViewSettings: { showMvp: true },
                disruptionMethod: 'disruption' as const
            };
            const hash1 = hashAggregationSettings(settings1.mvpWeights, settings1.statsViewSettings, settings1.disruptionMethod);
            const hash2 = hashAggregationSettings(settings2.mvpWeights, settings2.statsViewSettings, settings2.disruptionMethod);
            expect(hash1).toBe(hash2);
        });

        it('produces different hash for different settings', () => {
            const hash1 = hashAggregationSettings({ offensiveDps: 1.0 }, {}, 'disruption');
            const hash2 = hashAggregationSettings({ offensiveDps: 2.0 }, {}, 'disruption');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('get/set operations', () => {
        it('returns null for cache miss', () => {
            const result = cache.get(10, 'hash1');
            expect(result).toBeNull();
        });

        it('returns cached value after set', () => {
            const mockResult = { stats: { topStats: {} } };
            cache.set(10, 'hash1', mockResult);
            const result = cache.get(10, 'hash1');
            expect(result).toBe(mockResult);
        });

        it('tracks hit/miss statistics', () => {
            cache.set(10, 'hash1', { data: 'test' });
            cache.get(10, 'hash1'); // hit
            cache.get(10, 'hash2'); // miss
            const stats = cache.getStats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
        });

        it('updates hit rate correctly', () => {
            cache.set(10, 'hash1', { data: 'test' });
            cache.get(10, 'hash1'); // hit
            cache.get(10, 'hash1'); // hit
            cache.get(10, 'hash2'); // miss
            const stats = cache.getStats();
            expect(stats.hitRate).toBe('66.7%');
        });
    });

    describe('LRU eviction', () => {
        it('evicts oldest entry when capacity exceeded', () => {
            cache.set(10, 'hash1', { data: '1' });
            cache.set(10, 'hash2', { data: '2' });
            cache.set(10, 'hash3', { data: '3' });
            expect(cache.getStats().size).toBe(3);

            // Add fourth entry, should evict oldest (hash1)
            cache.set(10, 'hash4', { data: '4' });
            expect(cache.getStats().size).toBe(3);
            expect(cache.get(10, 'hash1')).toBeNull(); // evicted
            expect(cache.get(10, 'hash4')).toEqual({ data: '4' }); // added
        });

        it('updates access order on get', () => {
            cache.set(10, 'hash1', { data: '1' });
            cache.set(10, 'hash2', { data: '2' });
            cache.set(10, 'hash3', { data: '3' });

            // Access hash1, moving it to end of LRU queue
            cache.get(10, 'hash1');

            // Add fourth, should evict hash2 (not hash1, since we accessed it)
            cache.set(10, 'hash4', { data: '4' });
            expect(cache.get(10, 'hash1')).toEqual({ data: '1' }); // still in cache
            expect(cache.get(10, 'hash2')).toBeNull(); // evicted
        });
    });

    describe('cache key generation', () => {
        it('treats different log counts as different keys', () => {
            cache.set(10, 'hash1', { data: 'ten' });
            cache.set(15, 'hash1', { data: 'fifteen' });

            expect(cache.get(10, 'hash1')).toEqual({ data: 'ten' });
            expect(cache.get(15, 'hash1')).toEqual({ data: 'fifteen' });
        });

        it('treats different setting hashes as different keys', () => {
            cache.set(10, 'hash1', { data: 'hash1' });
            cache.set(10, 'hash2', { data: 'hash2' });

            expect(cache.get(10, 'hash1')).toEqual({ data: 'hash1' });
            expect(cache.get(10, 'hash2')).toEqual({ data: 'hash2' });
        });
    });

    describe('clear operation', () => {
        it('clears all entries and resets stats', () => {
            cache.set(10, 'hash1', { data: '1' });
            cache.set(10, 'hash2', { data: '2' });
            cache.get(10, 'hash1'); // hit

            cache.clear();

            expect(cache.getStats().size).toBe(0);
            expect(cache.getStats().hits).toBe(0);
            expect(cache.getStats().misses).toBe(0);
            expect(cache.get(10, 'hash1')).toBeNull();
        });
    });

    describe('getStats', () => {
        it('returns accurate statistics', () => {
            cache.set(10, 'hash1', { data: 'test' });
            cache.set(15, 'hash2', { data: 'test' });

            const stats = cache.getStats();
            expect(stats.size).toBe(2);
            expect(stats.maxEntries).toBe(3);
            expect(stats.entries).toHaveLength(2);
            expect(stats.entries[0]).toHaveProperty('key');
            expect(stats.entries[0]).toHaveProperty('logCount');
            expect(stats.entries[0]).toHaveProperty('ageMs');
        });
    });

    describe('global singleton', () => {
        it('returns same instance on multiple calls', () => {
            resetAggregationCache();
            const cache1 = getAggregationCache();
            const cache2 = getAggregationCache();
            expect(cache1).toBe(cache2);
        });

        it('resets global cache on resetAggregationCache', () => {
            const cache1 = getAggregationCache();
            cache1.set(10, 'hash1', { data: 'test' });

            resetAggregationCache();

            const cache2 = getAggregationCache();
            expect(cache2.get(10, 'hash1')).toBeNull();
        });

        it('supports debug logging', () => {
            resetAggregationCache();
            const cacheWithDebug = getAggregationCache(true);
            // Manually verify console logs were called (if console is spyable)
            expect(cacheWithDebug).toBeDefined();
        });
    });
});
