import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAppUpdater } from '../useAppUpdater';

type Listener = (payload: any) => void;

/** Capture the renderer-side listeners so a test can replay the exact event
 *  order the main process produced. */
function installElectronApiStub() {
    const listeners: Record<string, Listener[]> = {};
    const register = (channel: string) => (cb: Listener) => {
        (listeners[channel] ||= []).push(cb);
        return () => {
            listeners[channel] = (listeners[channel] || []).filter((f) => f !== cb);
        };
    };
    const emit = (channel: string, payload?: any) =>
        (listeners[channel] || []).forEach((cb) => cb(payload));

    (globalThis as any).window.electronAPI = {
        onUpdateMessage: register('message'),
        onUpdateAvailable: register('available'),
        onUpdateNotAvailable: register('not-available'),
        onUpdateError: register('error'),
        onDownloadProgress: register('progress'),
        onUpdateDownloaded: register('downloaded'),
    };
    return { emit };
}

describe('useAppUpdater stale timeout errors', () => {
    let emit: (channel: string, payload?: any) => void;

    beforeEach(() => {
        vi.useFakeTimers();
        emit = installElectronApiStub().emit;
    });

    // The reported v3.19.0 symptom. Main races the update check against a
    // fixed budget, so a slow-but-working check reports an error first and the
    // real answer lands afterwards (measured: error at 38s, "not available" at
    // 56s). The late answer is authoritative and must take the banner down.
    it('clears the error banner when the slow check later reports no update', () => {
        const { result } = renderHook(() => useAppUpdater());

        act(() => emit('error', { message: 'The update check timed out before the server responded.' }));
        expect(result.current.showUpdateErrorModal).toBe(true);
        expect(result.current.updateError).toContain('timed out');

        act(() => emit('not-available', { version: '3.19.0' }));
        expect(result.current.showUpdateErrorModal).toBe(false);
        expect(result.current.updateError).toBeNull();
        expect(result.current.updateStatus).toBe('App is up to date.');
    });

    it('clears the error banner when the slow check later finds an update', () => {
        const { result } = renderHook(() => useAppUpdater());

        act(() => emit('error', { message: 'The update check timed out before the server responded.' }));
        act(() => emit('available', { version: '3.20.0' }));

        expect(result.current.showUpdateErrorModal).toBe(false);
        expect(result.current.updateError).toBeNull();
        expect(result.current.updateAvailable).toBe(true);
    });

    // A genuine failure with no later outcome must still be reported, or the
    // fix above would simply hide every update error.
    it('keeps a real error that is never followed by an outcome', () => {
        const { result } = renderHook(() => useAppUpdater());

        act(() => emit('error', { message: 'ENOTFOUND github.com' }));

        expect(result.current.showUpdateErrorModal).toBe(true);
        expect(result.current.updateError).toBe('ENOTFOUND github.com');
    });
});
