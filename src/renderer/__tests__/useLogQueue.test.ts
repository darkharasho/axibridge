import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { canPromoteCalculatingLog, normalizeQueuedLogStatus, useLogQueue } from '../app/hooks/useLogQueue';

describe('normalizeQueuedLogStatus', () => {
    it('keeps pending detail fetches in calculating', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-1',
            filePath: 'one.zevtc',
            permalink: 'https://dps.report/example',
            status: 'success',
            detailsStatus: 'available',
        } as ILogData);

        expect(result.status).toBe('calculating');
    });

    it('keeps calculating even with loaded status (promotion via aggregation only)', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-2',
            filePath: 'two.zevtc',
            permalink: 'https://dps.report/example',
            status: 'calculating',
            detailsStatus: 'loaded',
        } as ILogData);

        // normalizeQueuedLogStatus no longer promotes based on statsDetailsLoaded.
        // Promotion is handled by the aggregation-aware effect in App.tsx.
        expect(result.status).toBe('calculating');
    });

    it('keeps calculating when detailsStatus is available but stats not yet computed', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-2b',
            filePath: 'two-b.zevtc',
            permalink: 'https://dps.report/example',
            status: 'calculating',
            detailsStatus: 'available',
        } as ILogData);

        expect(result.status).toBe('calculating');
    });

    it('promotes calculating when details are known unavailable', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-3',
            filePath: 'three.zevtc',
            permalink: 'https://dps.report/example',
            status: 'calculating',
            detailsStatus: 'unavailable',
        } as ILogData);

        expect(result.status).toBe('success');
        expect(result.detailsStatus).toBe('unavailable');
    });
});

describe('canPromoteCalculatingLog', () => {
    const log = (detailsStatus: ILogData['detailsStatus']): ILogData => ({
        id: 'log-1',
        filePath: 'one.zevtc',
        status: 'calculating',
        detailsStatus,
    } as ILogData);
    const missCache = { peek: () => undefined };
    const hitCache = { peek: () => ({ players: [] }) };

    it('promotes a loaded log even when its details were evicted from the LRU', () => {
        // Regression: worker re-streams evict LRU entries (capacity 15), so the
        // peek-only gate left loaded logs stuck in calculating forever — keeping
        // isLogPendingIngestion true, forcing skipReplay on every flush, and
        // permanently disabling the web upload.
        expect(canPromoteCalculatingLog(log('loaded'), missCache)).toBe(true);
    });

    it('promotes a loaded log when the cache is unavailable', () => {
        expect(canPromoteCalculatingLog(log('loaded'), null)).toBe(true);
    });

    it('promotes when details will never arrive', () => {
        expect(canPromoteCalculatingLog(log('exhausted'), missCache)).toBe(true);
        expect(canPromoteCalculatingLog(log('unavailable'), missCache)).toBe(true);
    });

    it('promotes on an LRU hit regardless of detailsStatus', () => {
        expect(canPromoteCalculatingLog(log('available'), hitCache)).toBe(true);
        expect(canPromoteCalculatingLog(log('idle'), hitCache)).toBe(true);
    });

    it('keeps waiting while details are still pending and not cached', () => {
        expect(canPromoteCalculatingLog(log('available'), missCache)).toBe(false);
        expect(canPromoteCalculatingLog(log('loading'), missCache)).toBe(false);
        expect(canPromoteCalculatingLog(log('idle'), missCache)).toBe(false);
    });
});

describe('useLogQueue', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const renderQueue = (bulkUploadMode = false) => renderHook(() => {
        const [logs, setLogs] = useState<ILogData[]>([]);
        const bulkUploadModeRef = useRef(bulkUploadMode);
        bulkUploadModeRef.current = bulkUploadMode;
        const queue = useLogQueue(setLogs, bulkUploadModeRef);
        return { logs, ...queue };
    });

    it('merges thin permalink update with prior upload-complete in same window', () => {
        const { result } = renderQueue(true);

        act(() => {
            result.current.queueLogUpdate({
                id: 'log-1',
                filePath: 'fight.zevtc',
                status: 'calculating',
                detailsStatus: 'available',
                playerCount: 51,
                fightName: 'Detailed WvW - Eternal Battlegrounds',
                encounterDuration: '0:43',
                dashboardSummary: {
                    hasPlayers: true,
                    hasTargets: true,
                    squadCount: 51,
                    enemyCount: 12,
                    isWin: true,
                    squadDeaths: 0,
                    enemyDeaths: 4,
                },
            } as unknown as ILogData);
            // Permalink IPC arrives within the same batch window.
            result.current.queueLogUpdate({
                id: 'log-1',
                filePath: 'fight.zevtc',
                permalink: 'https://dps.report/UMin-20260425-223312_wvw',
            } as ILogData);
        });

        act(() => {
            vi.runAllTimers();
        });

        expect(result.current.logs).toHaveLength(1);
        const merged = result.current.logs[0] as any;
        expect(merged.permalink).toBe('https://dps.report/UMin-20260425-223312_wvw');
        expect(merged.dashboardSummary?.squadCount).toBe(51);
        expect(merged.dashboardSummary?.isWin).toBe(true);
        expect(merged.playerCount).toBe(51);
        expect(merged.detailsStatus).toBe('available');
        expect(merged.fightName).toBe('Detailed WvW - Eternal Battlegrounds');
        expect(merged.encounterDuration).toBe('0:43');
    });
});
