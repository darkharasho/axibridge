import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFilePicker } from '../app/hooks/useFilePicker';

const manualUploadBatch = vi.fn();

beforeEach(() => {
    manualUploadBatch.mockClear();
    (window as any).electronAPI = { manualUploadBatch, listLogFiles: vi.fn() };
});

const setup = () => renderHook(() => useFilePicker({
    logDirectory: null,
    setLogs: vi.fn(),
    setBulkUploadMode: vi.fn(),
    bulkUploadExpectedRef: { current: null },
    bulkUploadCompletedRef: { current: 0 }
}));

// Two frames pass before the deferred commit runs; jsdom's rAF is timer-backed.
const flushFrames = async () => {
    for (let i = 0; i < 3; i += 1) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
};

describe('useFilePicker: adding selected files', () => {
    it('goes busy, then closes, and only then does the expensive part', async () => {
        const { result } = setup();
        act(() => { result.current.setFilePickerOpen(true); });
        act(() => { result.current.setFilePickerSelected(new Set(['/logs/a.zevtc'])); });

        act(() => { result.current.handleAddSelectedFiles(); });

        // The click itself must do nothing slow, or the spinner never paints.
        expect(result.current.filePickerSubmitting).toBe(true);
        expect(manualUploadBatch).not.toHaveBeenCalled();
        expect(result.current.filePickerOpen).toBe(true);

        await flushFrames();
        expect(result.current.filePickerOpen).toBe(false);
        // Still waiting: the insert would stall the modal's exit animation.
        expect(manualUploadBatch).not.toHaveBeenCalled();

        act(() => { result.current.commitPendingAdd(); });
        expect(manualUploadBatch).toHaveBeenCalledWith(['/logs/a.zevtc']);
        expect(result.current.filePickerSubmitting).toBe(false);
    });

    it('adds the files anyway if the exit never reports back', async () => {
        const { result } = setup();
        act(() => { result.current.setFilePickerSelected(new Set(['/logs/a.zevtc'])); });
        act(() => { result.current.handleAddSelectedFiles(); });

        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 950)); });
        expect(manualUploadBatch).toHaveBeenCalledWith(['/logs/a.zevtc']);
    });

    it('adds the files once, however many times the commit is asked for', async () => {
        const { result } = setup();
        act(() => { result.current.setFilePickerSelected(new Set(['/logs/a.zevtc'])); });

        act(() => { result.current.handleAddSelectedFiles(); });
        act(() => { result.current.handleAddSelectedFiles(); });
        await flushFrames();
        act(() => { result.current.commitPendingAdd(); });
        act(() => { result.current.commitPendingAdd(); });

        expect(manualUploadBatch).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty selection without going busy', () => {
        const { result } = setup();
        act(() => { result.current.handleAddSelectedFiles(); });
        expect(result.current.filePickerSubmitting).toBe(false);
        expect(result.current.filePickerError).toBe('Select at least one log file.');
    });
});
