/**
 * Publish always publishes every fight. `runWebUpload` (behind both
 * `handleWebUpload` and `handleWebUploadToTarget`) is the sole gateway to the
 * real `onWebUpload` callback that performs the upload — see the walk in
 * task-6-report.md. This pins that gateway directly: it must refuse to call
 * `onWebUpload` while a slice is active, and must still call it once the slice
 * is cleared, so the test cannot pass by the guard simply never firing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatsUploads } from '../useStatsUploads';
import { useStatsStore } from '../../statsStore';

describe('useStatsUploads publish guard', () => {
    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
    });

    it('does not call onWebUpload when a slice is active', async () => {
        useStatsStore.getState().toggleFightExcluded('b');
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs: [],
            stats: {},
            skillUsageData: {},
            activeStatsViewSettings: {},
            embedded: false,
            onWebUpload
        }));

        await act(async () => {
            await result.current.handleWebUpload();
        });

        expect(onWebUpload).not.toHaveBeenCalled();
    });

    it('calls onWebUpload once the slice is cleared', async () => {
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs: [],
            stats: {},
            skillUsageData: {},
            activeStatsViewSettings: {},
            embedded: false,
            onWebUpload
        }));

        await act(async () => {
            await result.current.handleWebUpload();
        });

        expect(onWebUpload).toHaveBeenCalledTimes(1);
    });
});
