/**
 * LRU cache for aggregation results.
 * Keyed by [logCount, settingsHash] to avoid recomputation when logs/settings unchanged.
 * Disabled during bulk upload (logs changing rapidly), activated after bulk completes.
 */

export interface AggregationCacheEntry {
    logCount: number;
    settingsHash: string;
    result: any; // Cached aggregation result
    timestamp: number;
}

interface CacheOptions {
    maxEntries?: number;
    debugLogging?: boolean;
}

/**
 * Create a hash of settings for cache key generation.
 * Only includes keys that affect aggregation output.
 */
export function hashAggregationSettings(mvpWeights: any, statsViewSettings: any, disruptionMethod: any): string {
    const key = JSON.stringify({
        mvpWeights,
        statsViewSettings,
        disruptionMethod
    });
    // Use simple character distribution to create unique hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

export class AggregationLRUCache {
    private cache: Map<string, AggregationCacheEntry> = new Map();
    private accessOrder: string[] = []; // Track access order for LRU
    private maxEntries: number;
    private debugLogging: boolean;
    private hits = 0;
    private misses = 0;

    constructor(options: CacheOptions = {}) {
        this.maxEntries = options.maxEntries ?? 5;
        this.debugLogging = options.debugLogging ?? false;
    }

    /**
     * Generate cache key from log count and settings hash.
     */
    private getKey(logCount: number, settingsHash: string): string {
        return `${logCount}:${settingsHash}`;
    }

    /**
     * Mark entry as recently accessed (move to end of access order).
     */
    private markAccessed(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }

    /**
     * Get cached result if available and valid.
     */
    get(logCount: number, settingsHash: string): any | null {
        const key = this.getKey(logCount, settingsHash);
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        this.hits++;
        this.markAccessed(key);
        if (this.debugLogging) {
            console.log(`[AggregationCache] HIT: ${key} (${this.hits} hits, ${this.misses} misses, ratio: ${(this.hits / (this.hits + this.misses) * 100).toFixed(1)}%)`);
        }
        return entry.result;
    }

    /**
     * Store aggregation result in cache.
     */
    set(logCount: number, settingsHash: string, result: any): void {
        const key = this.getKey(logCount, settingsHash);

        // Remove old entry if exists
        if (this.cache.has(key)) {
            this.cache.delete(key);
            const index = this.accessOrder.indexOf(key);
            if (index > -1) this.accessOrder.splice(index, 1);
        }

        // Add new entry
        this.cache.set(key, {
            logCount,
            settingsHash,
            result,
            timestamp: Date.now()
        });
        this.accessOrder.push(key);

        // Evict oldest if over capacity
        if (this.cache.size > this.maxEntries) {
            const oldestKey = this.accessOrder.shift();
            if (oldestKey) {
                this.cache.delete(oldestKey);
                if (this.debugLogging) {
                    console.log(`[AggregationCache] EVICT: ${oldestKey} (size now ${this.cache.size})`);
                }
            }
        }

        if (this.debugLogging) {
            console.log(`[AggregationCache] SET: ${key} (size: ${this.cache.size}/${this.maxEntries})`);
        }
    }

    /**
     * Clear all cached entries.
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
        this.hits = 0;
        this.misses = 0;
        if (this.debugLogging) {
            console.log('[AggregationCache] CLEAR');
        }
    }

    /**
     * Get cache statistics.
     */
    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxEntries: this.maxEntries,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : 'N/A',
            entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                logCount: entry.logCount,
                ageMs: Date.now() - entry.timestamp
            }))
        };
    }
}

// Global singleton instance
let globalCache: AggregationLRUCache | null = null;

/**
 * Get or create global aggregation cache.
 */
export function getAggregationCache(debugLogging: boolean = false): AggregationLRUCache {
    if (!globalCache) {
        globalCache = new AggregationLRUCache({ maxEntries: 5, debugLogging });
    }
    return globalCache;
}

/**
 * Reset the global cache (useful for testing or full refresh).
 */
export function resetAggregationCache(): void {
    if (globalCache) {
        globalCache.clear();
    }
}
