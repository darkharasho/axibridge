import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStatsAggregationWorker } from '../useStatsAggregationWorker';
import { RETENTION_TIERS } from '../../utils/logPayloadRetention';

/**
 * Regression guard for the renderer OOM on large log sets.
 *
 * Streaming used to retain one pruned payload per log on the main thread and a
 * structured-clone per log in the worker, both growing with `logs.length` and
 * defeating the 15-entry DetailsCache LRU. At ~55 MB of V8 heap per pruned log
 * a 66-log session held several GB across the two isolates and hit the renderer
 * heap ceiling. Retention must now stay inside the heap-pressure budget, and
 * every eviction must reach the worker as a `forget`.
 *
 * jsdom exposes no `performance.memory`, so `readHeapPressure()` returns null
 * and the cache uses its deterministic `fallback` budget.
 */

interface PostedMessage {
    type: string;
    key?: string;
    ref?: string;
    keys?: string[];
}

const posted: PostedMessage[] = [];

class StubWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onmessageerror: ((event: any) => void) | null = null;
    postMessage(message: PostedMessage) {
        posted.push(message);
    }
    terminate() { /* no-op */ }
}

/** Payloads the worker still holds: full transfers minus forget evictions. */
const liveWorkerPayloads = () => {
    const live = new Set<string>();
    posted.forEach((message) => {
        if (message.type === 'log' && typeof message.key === 'string') live.add(message.key);
        if (message.type === 'forget') (message.keys ?? []).forEach((key) => live.delete(key));
    });
    return live;
};

const makeLogs = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        id: `log-${i}`,
        filePath: `/logs/fight-${i}.zevtc`,
        status: 'success',
        detailsStatus: 'loaded',
    }));

const makeDetailsCache = () => ({
    // Distinct object per log, mirroring a real details graph's identity.
    peek: (logId: string) => ({ id: logId, players: [], targets: [] }),
    getLocal: async () => null,
}) as any;

afterEach(() => {
    posted.length = 0;
    vi.unstubAllGlobals();
});

describe('useStatsAggregationWorker payload retention', () => {
    it('bounds retained worker payloads on a large log set', async () => {
        vi.stubGlobal('Worker', StubWorker);
        const logs = makeLogs(66);

        renderHook(() => useStatsAggregationWorker({ logs, detailsCache: makeDetailsCache() }));

        // Wait for the streaming loop to transfer every log.
        await waitFor(
            () => {
                const streamed = posted.filter((m) => m.type === 'log').length;
                expect(streamed).toBe(logs.length);
            },
            { timeout: 5000 }
        );

        // The regression signal: retention must not scale with the log set. The
        // old code retained one clone per log (capped only at 80), so all 66
        // stayed resident. Asserting against the budget alone would be circular —
        // raising the budget would keep the test green — so pin the invariant to
        // the log count too.
        const live = liveWorkerPayloads().size;
        expect(live).toBeLessThan(logs.length);
        expect(live).toBeLessThanOrEqual(RETENTION_TIERS.fallback);
    });

    it('streams every log exactly once regardless of eviction', async () => {
        vi.stubGlobal('Worker', StubWorker);
        const logs = makeLogs(40);

        renderHook(() => useStatsAggregationWorker({ logs, detailsCache: makeDetailsCache() }));

        await waitFor(
            () => {
                const streamed = posted.filter((m) => m.type === 'log').length;
                expect(streamed).toBe(logs.length);
            },
            { timeout: 5000 }
        );

        // Eviction must never drop a log from aggregation: each key is ingested
        // once, as either a full payload or a ref to one the worker still holds.
        const ingestedKeys = posted
            .filter((m) => m.type === 'log')
            .map((m) => m.key ?? m.ref);
        expect(new Set(ingestedKeys).size).toBe(logs.length);
        expect(ingestedKeys.filter((k) => k === undefined)).toHaveLength(0);
    });

    it('never sends a ref for a payload it has already told the worker to forget', async () => {
        vi.stubGlobal('Worker', StubWorker);
        const logs = makeLogs(66);

        renderHook(() => useStatsAggregationWorker({ logs, detailsCache: makeDetailsCache() }));

        await waitFor(
            () => {
                const streamed = posted.filter((m) => m.type === 'log').length;
                expect(streamed).toBe(logs.length);
            },
            { timeout: 5000 }
        );

        // Replay the protocol in order; a ref to a forgotten key would make the
        // worker drop that log silently (droppedLogMessages), skewing every stat.
        const held = new Set<string>();
        const danglingRefs: string[] = [];
        posted.forEach((message) => {
            if (message.type === 'log' && typeof message.key === 'string') held.add(message.key);
            else if (message.type === 'log' && typeof message.ref === 'string') {
                if (!held.has(message.ref)) danglingRefs.push(message.ref);
            } else if (message.type === 'forget') {
                (message.keys ?? []).forEach((key) => held.delete(key));
            }
        });
        expect(danglingRefs).toEqual([]);
    });
});
