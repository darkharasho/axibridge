/**
 * Memory-bounded retention for the pruned log payloads streamed to the stats worker.
 *
 * Why this exists: aggregation is streaming by design — `IncrementalAggregator`
 * ingests one log and keeps only derived accumulators, and `DetailsCache` is
 * capped at 15 entries so the renderer never holds more than a handful of EI
 * detail graphs. Two perf caches used to defeat that: the hook memoised one
 * pruned payload per log (growing to `logs.length`) and the worker retained a
 * structured-clone of each. At roughly 55 MB of V8 heap per pruned log, a
 * 66-log set held ~7 GB across the two copies and blew the renderer's heap
 * ceiling — the OOM crash reported for large WvW sessions. That ceiling is
 * Chromium's own, sized from installed RAM (4192 MiB on a 32 GB machine) and
 * *not* settable by `--max-old-space-size`; earlier revisions of this comment
 * cited a 6144 MB limit that never existed.
 *
 * Why pressure and not a count: the fast path matters. During bulk ingestion
 * every publish restarts the worker and re-streams every log (see the debounce
 * note in `useLogsForStats`), so a small fixed cap would re-clone dozens of
 * multi-MB payloads on each restart. Log sizes also vary by more than an order
 * of magnitude between a small skirmish and a 53-player fight, so no fixed
 * count is right for both. We're on Chromium, so `performance.memory` gives a
 * direct reading of the exact quantity that crashes — keep the full cache while
 * there's headroom, trim hard as utilisation climbs.
 */

export interface LogPayloadEntry {
    /** The `{...log, details}` object the pruned payload was derived from. */
    sourceLog: any;
    /** Weak handle on the source details, used to detect a re-fetched graph. */
    sourceDetails: WeakRef<object> | null;
    /** `log.sectorOwners` identity — patched in place well after first stream. */
    sourceOwners: any;
    /** The payload posted to the worker. */
    pruned: any;
    /** True once the full payload was transferred to the *current* worker. */
    sent: boolean;
}

/**
 * Retention budgets, keyed off renderer heap utilisation.
 *
 * `max` matches the previous unconditional cache size, so datasets with
 * headroom keep exactly today's ref-hit behaviour. `min` is deliberately small:
 * once heap is this tight, re-cloning is strictly better than crashing.
 */
export const RETENTION_TIERS = {
    max: 80,
    soft: 24,
    min: 8,
    /** Used when no heap reading is available (non-Chromium, or API removed). */
    fallback: 24,
    // Thresholds are deliberately low. `performance.memory` is per-isolate: the
    // ratio is an honest reading of the main thread's own heap against its own
    // limit, but it says nothing about the stats worker's isolate, which holds a
    // comparable set of cloned payloads. Trimming early covers both the worker
    // running out of its own heap unseen and the two isolates together
    // exhausting physical memory, neither of which this reading can show.
    softPressure: 0.25,
    highPressure: 0.40,
} as const;

/**
 * Bucket size Blink rounds every field of a *bucketized* `MemoryInfo` to.
 *
 * Chromium serves `performance.memory` at one of two precisions. Precise
 * readings are live and unrounded. Bucketized readings — the default — are a
 * cached value rounded to this bucket and refreshed only every twenty minutes,
 * which for our purposes means never: measured in a real renderer, allocating
 * 600 MB of live arrays took the process to 789 MB of RSS while
 * `usedJSHeapSize` sat unchanged at 10,000,000 for nine seconds. The reported
 * limit is rounded too, and wrongly — 3,760,000,000 against a true
 * 4,395,630,592 — so a bucketized reading is off in both numerator and
 * denominator.
 */
const MEMORY_INFO_BUCKET_BYTES = 100_000;

/**
 * Whether a reading carries the bucketized fingerprint, i.e. is a stale cache
 * entry rather than a measurement.
 *
 * Both fields must be bucket-aligned. A precise reading hitting one boundary by
 * chance is a 1-in-100,000 event that self-corrects on the next sample; hitting
 * both at once is not worth defending against, and a real V8 heap limit is a
 * multiple of a mebibyte, which is only bucket-aligned at implausible sizes.
 */
const isBucketizedReading = (used: number, limit: number): boolean =>
    used % MEMORY_INFO_BUCKET_BYTES === 0 && limit % MEMORY_INFO_BUCKET_BYTES === 0;

/**
 * Renderer heap utilisation as a 0..1 ratio, or `null` when unavailable.
 *
 * A bucketized reading counts as unavailable. It has to: it is a finite number,
 * so without this check `budget()` skips its `fallback` branch *and* every
 * pressure branch and returns `max` unconditionally — the failure that let a
 * 33-log session OOM a renderer despite this module being in place. Callers
 * that want the real signal must run with `--enable-precise-memory-info`
 * (AxiBridge sets it in `src/main/index.ts`); everything else gets the
 * conservative fallback budget, which is the correct answer when the only
 * available reading cannot be trusted.
 */
export const readHeapPressure = (
    perf: Performance | undefined = typeof performance !== 'undefined' ? performance : undefined
): number | null => {
    const memory = (perf as any)?.memory;
    const used = Number(memory?.usedJSHeapSize);
    const limit = Number(memory?.jsHeapSizeLimit);
    if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
    if (isBucketizedReading(used, limit)) return null;
    return used / limit;
};

export interface LogPayloadCacheOptions {
    readPressure?: () => number | null;
}

/**
 * LRU of pruned log payloads whose capacity shrinks under heap pressure.
 *
 * Callers must forward every evicted key to the worker as a `forget` message so
 * the worker's payload store shrinks in lockstep — the main thread is the
 * authority on what the worker holds. Evicting mid-stream is safe: each key is
 * visited at most once per stream, so the worker's store only ever matters for
 * *subsequent* streams.
 */
export class LogPayloadCache {
    private entries = new Map<string, LogPayloadEntry>();
    private readPressure: () => number | null;

    constructor(options: LogPayloadCacheOptions = {}) {
        this.readPressure = options.readPressure ?? (() => readHeapPressure());
    }

    get size(): number {
        return this.entries.size;
    }

    has(key: string): boolean {
        return this.entries.has(key);
    }

    /** Fetch and promote to most-recently-used. */
    get(key: string): LogPayloadEntry | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) return undefined;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry;
    }

    /** Insert (as most-recently-used) and trim. Returns the evicted keys. */
    set(key: string, entry: LogPayloadEntry): string[] {
        this.entries.delete(key);
        this.entries.set(key, entry);
        return this.trim();
    }

    /** Drop everything outside the current log set. Returns the dropped keys. */
    retain(validKeys: Set<string>): string[] {
        const dropped: string[] = [];
        this.entries.forEach((_entry, key) => {
            if (!validKeys.has(key)) dropped.push(key);
        });
        dropped.forEach((key) => this.entries.delete(key));
        return dropped;
    }

    /**
     * Clear transfer state without dropping the memoised payloads. Used when a
     * fresh worker is spawned: its store is empty, so nothing may be sent as a
     * `ref`, but the pruned payloads themselves are still valid.
     */
    markAllUnsent(): void {
        this.entries.forEach((entry) => {
            entry.sent = false;
        });
    }

    /** Evict least-recently-used entries down to the current budget. */
    trim(): string[] {
        const budget = this.budget();
        const evicted: string[] = [];
        while (this.entries.size > budget) {
            const oldest = this.entries.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
            evicted.push(oldest);
        }
        return evicted;
    }

    private budget(): number {
        const pressure = this.readPressure();
        if (pressure === null) return RETENTION_TIERS.fallback;
        if (pressure >= RETENTION_TIERS.highPressure) return RETENTION_TIERS.min;
        if (pressure >= RETENTION_TIERS.softPressure) return RETENTION_TIERS.soft;
        return RETENTION_TIERS.max;
    }
}
