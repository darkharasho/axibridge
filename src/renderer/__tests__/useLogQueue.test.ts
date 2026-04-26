import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { normalizeQueuedLogStatus, useLogQueue } from '../app/hooks/useLogQueue';

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
