import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLogsForStats } from '../useLogsForStats';
import { isLogPendingIngestion } from '../../../stats/hooks/useStatsAggregationWorker';

const makeLog = (id: string, status: string, detailsStatus = 'idle'): any => ({
    id,
    filePath: `/logs/${id}.zevtc`,
    status,
    detailsStatus
});

describe('isLogPendingIngestion', () => {
    it('flags logs that are still uploading/parsing or awaiting details', () => {
        for (const status of ['queued', 'pending', 'uploading', 'retrying', 'parsing', 'calculating']) {
            expect(isLogPendingIngestion(makeLog('a', status))).toBe(true);
        }
        expect(isLogPendingIngestion(makeLog('a', 'success', 'available'))).toBe(true);
        expect(isLogPendingIngestion(makeLog('a', 'success', 'loading'))).toBe(true);
    });

    it('does not flag settled logs', () => {
        expect(isLogPendingIngestion(makeLog('a', 'success', 'loaded'))).toBe(false);
        expect(isLogPendingIngestion(makeLog('a', 'error', 'unavailable'))).toBe(false);
        expect(isLogPendingIngestion(null)).toBe(false);
    });
});

describe('useLogsForStats adaptive debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('publishes after 400ms when the log set is settled', () => {
        const settled = [makeLog('a', 'success', 'loaded')];
        const { result, rerender } = renderHook(({ logs }) => useLogsForStats({ logs }), {
            initialProps: { logs: [] as any[] }
        });
        rerender({ logs: settled });
        act(() => {
            vi.advanceTimersByTime(450);
        });
        expect(result.current.logsForStats).toHaveLength(1);
    });

    it('stretches the window to 2.5s while many logs are pending', () => {
        const pending = ['a', 'b', 'c', 'd', 'e'].map((id) => makeLog(id, 'uploading'));
        const { result, rerender } = renderHook(({ logs }) => useLogsForStats({ logs }), {
            initialProps: { logs: [] as any[] }
        });
        rerender({ logs: pending });
        act(() => {
            vi.advanceTimersByTime(450);
        });
        // Still on the old snapshot — bulk churn must not publish every 400ms.
        expect(result.current.logsForStats).toHaveLength(0);
        act(() => {
            vi.advanceTimersByTime(2200);
        });
        expect(result.current.logsForStats).toHaveLength(5);
    });

    it('keeps the fast window when only a few logs are pending', () => {
        const logs = [
            makeLog('a', 'uploading'),
            makeLog('b', 'success', 'loaded'),
            makeLog('c', 'success', 'loaded')
        ];
        const { result, rerender } = renderHook(({ logs: l }) => useLogsForStats({ logs: l }), {
            initialProps: { logs: [] as any[] }
        });
        rerender({ logs });
        act(() => {
            vi.advanceTimersByTime(450);
        });
        expect(result.current.logsForStats).toHaveLength(3);
    });
});
