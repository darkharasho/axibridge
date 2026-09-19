import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallback, useRef, useState } from 'react';
import { hasPendingDetailsHydration, useDetailsHydration } from '../app/hooks/useDetailsHydration';
import { DetailsCache } from '../cache/DetailsCache';

vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
}));

// Details that pass the staleness checks in the hydration candidate filter.
const freshDetails = {
    players: [{}],
    damageModMap: {},
    conditionMetrics: {},
    targets: [],
};

// A real cache over a mocked IndexedDB. Whether a write reached durable
// storage is the thing under test here, so a stub that reported success
// unconditionally would pin the wrong half of the contract.
const cacheWith = (entries: Record<string, any>): DetailsCache => {
    const cache = new DetailsCache({ fetchDetails: async () => null });
    Object.entries(entries).forEach(([id, details]) => cache.putSync(id, details));
    return cache;
};

const makeLog = (overrides: Partial<ILogData>): ILogData =>
    ({
        id: 'ei-1',
        filePath: '/logs/fight.zevtc',
        status: 'success',
        detailsStatus: 'available',
        permalink: 'https://dps.report/example',
        ...overrides,
    }) as ILogData;

describe('hasPendingDetailsHydration', () => {
    it('treats an available log as pending even when its details are cache-resident', () => {
        // The hydration pass is what exits the 'available' state (marking the
        // log loaded without a fetch); if the predicate skips cache hits, the
        // pass never gets scheduled and the log pends forever.
        const cache = cacheWith({ 'ei-1': freshDetails });
        expect(hasPendingDetailsHydration([makeLog({})], cache)).toBe(true);
    });

    it('does not report loaded or terminal logs as pending', () => {
        const cache = cacheWith({});
        expect(hasPendingDetailsHydration([makeLog({ detailsStatus: 'loaded' })], cache)).toBe(false);
        expect(hasPendingDetailsHydration([makeLog({ detailsStatus: 'exhausted' })], cache)).toBe(false);
        expect(hasPendingDetailsHydration([makeLog({ detailsStatus: 'unavailable' })], cache)).toBe(false);
    });

    it('reports successful permalinked logs without details as pending', () => {
        const cache = cacheWith({});
        expect(hasPendingDetailsHydration([makeLog({ detailsStatus: 'idle' })], cache)).toBe(true);
        expect(hasPendingDetailsHydration([makeLog({ detailsStatus: 'idle', permalink: undefined })], cache)).toBe(false);
    });

    it('does not report idle cache-resident logs as pending', () => {
        const cache = cacheWith({ 'ei-1': freshDetails });
        expect(hasPendingDetailsHydration([makeLog({ detailsStatus: 'idle' })], cache)).toBe(false);
    });
});

describe('useDetailsHydration', () => {
    let originalElectronAPI: any;

    beforeEach(async () => {
        const { set } = await import('idb-keyval');
        (set as any).mockReset();
        (set as any).mockResolvedValue(undefined);
        vi.useFakeTimers();
        originalElectronAPI = (window as any).electronAPI;
        (window as any).electronAPI = {
            getLogDetails: vi.fn(async () => ({ success: true, details: freshDetails })),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        (window as any).electronAPI = originalElectronAPI;
    });

    const renderHydration = (initialLogs: ILogData[], cache: DetailsCache | null) =>
        renderHook(() => {
            const [logs, setLogs] = useState<ILogData[]>(initialLogs);
            const logsRef = useRef(logs);
            logsRef.current = logs;
            const viewRef = useRef('stats');
            const setLogsDeferred = useCallback(
                (updater: (currentLogs: ILogData[]) => ILogData[]) => setLogs(updater),
                []
            );
            const hydration = useDetailsHydration({
                viewRef,
                logsRef,
                setLogs,
                setLogsDeferred,
                setLogsForStats: (() => undefined) as unknown as React.Dispatch<React.SetStateAction<ILogData[]>>,
                detailsCache: cache,
            });
            return { logs, ...hydration };
        });

    it('marks an available log loaded without fetching when details are cache-resident', async () => {
        // details-prewarm already put this log's details in the LRU (write-through
        // to IDB). The fetch path is gated on a cache miss, so without an explicit
        // mark the log would stay 'available' forever — keeping
        // isLogPendingIngestion true and the web upload disabled.
        const log = makeLog({});
        const cache = cacheWith({ 'ei-1': freshDetails });
        const { result } = renderHydration([log], cache);

        act(() => {
            result.current.scheduleDetailsHydration();
        });
        await act(async () => {
            vi.advanceTimersByTime(200);
        });

        expect(result.current.logs[0].detailsStatus).toBe('loaded');
        expect((window as any).electronAPI.getLogDetails).not.toHaveBeenCalled();
    });

    it('still fetches details for an available log on a cache miss', async () => {
        const log = makeLog({});
        const cache = cacheWith({});
        const { result } = renderHydration([log], cache);

        act(() => {
            result.current.scheduleDetailsHydration();
        });
        await act(async () => {
            vi.advanceTimersByTime(200);
        });
        // Drain the fetch worker loop (yield timers between fetches).
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect((window as any).electronAPI.getLogDetails).toHaveBeenCalledTimes(1);
        expect(result.current.logs[0].detailsStatus).toBe('loaded');
    });

    it('does not mark a log loaded when its details never reached durable storage', async () => {
        // 'loaded' is a promise that the aggregation stream can read this log
        // back whenever it asks. The memory LRU holds a handful of entries and
        // a session holds dozens of logs, so only the IndexedDB write can keep
        // that promise — and when it is rejected, claiming 'loaded' is how a
        // fight ends up silently missing from every total in the report.
        const { set } = await import('idb-keyval');
        (set as any).mockRejectedValue(new Error('QuotaExceededError'));
        const log = makeLog({});
        const { result } = renderHydration([log], cacheWith({}));

        act(() => {
            result.current.scheduleDetailsHydration();
        });
        await act(async () => {
            vi.advanceTimersByTime(200);
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect((window as any).electronAPI.getLogDetails).toHaveBeenCalled();
        expect(result.current.logs[0].detailsStatus).not.toBe('loaded');
    });

    it('gives up on a log the store keeps rejecting instead of retrying forever', async () => {
        // The retries have to end somewhere, and 'exhausted' is the state the
        // coverage banner reads to offer a repair. Without a stop, a log whose
        // details are LRU-resident but undurable would re-parse on every pass
        // for the life of the session.
        const { set } = await import('idb-keyval');
        (set as any).mockRejectedValue(new Error('QuotaExceededError'));
        const { result } = renderHydration([makeLog({})], cacheWith({}));

        act(() => {
            result.current.scheduleDetailsHydration();
        });
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(result.current.logs[0].detailsStatus).toBe('exhausted');
    });
});
