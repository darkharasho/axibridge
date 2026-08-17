/**
 * The heal is only finished when the fresh details are reachable from every key
 * the pipeline looks under. The renderer reads the cache by log id while
 * streaming and by file path while hydrating, so a heal that writes one key
 * leaves the other serving the Axilog-less copy and the banner comes straight
 * back. That double write, and the refusal to report a log as healed when its
 * re-parse failed, are what these tests pin.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAxilogHeal } from '../useAxilogHeal';
import type { AxilogCoverageLog } from '../../utils/axilogCoverage';

const log = (id: string, filePath: string): AxilogCoverageLog => ({
    id, filePath, label: id, parseSource: 'dps.report',
});

const fakeCache = () => ({ putSync: vi.fn() });

// The shared test setup defines `electronAPI` as writable but not
// configurable, so the property can be reassigned but never deleted.
const setElectronAPI = (value: any) => {
    (window as any).electronAPI = value;
};

const setReparse = (impl: (payload: { filePath: string }) => any) => {
    setElectronAPI({ reparseLogAxilog: vi.fn(impl) });
};

describe('useAxilogHeal', () => {
    beforeEach(() => {
        setElectronAPI(undefined);
    });

    it('writes healed details under both the id and the file path', async () => {
        const cache = fakeCache();
        setReparse(() => ({ success: true, details: { native: { axilog: {} } } }));
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: cache as any }));

        await act(async () => { await result.current.heal([log('log-1', '/a.zevtc')]); });

        expect(cache.putSync).toHaveBeenCalledTimes(2);
        expect(cache.putSync.mock.calls.map((c) => c[0]).sort()).toEqual(['/a.zevtc', 'log-1']);
    });

    it('writes once when the id and the file path are the same key', async () => {
        const cache = fakeCache();
        setReparse(() => ({ success: true, details: {} }));
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: cache as any }));

        await act(async () => { await result.current.heal([log('/a.zevtc', '/a.zevtc')]); });

        expect(cache.putSync).toHaveBeenCalledTimes(1);
    });

    it('reports only the logs that actually healed', async () => {
        const onLogsHealed = vi.fn();
        setReparse(({ filePath }) => (
            filePath === '/good.zevtc'
                ? { success: true, details: {} }
                : { success: false, reason: 'source-missing', error: 'gone' }
        ));
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: fakeCache() as any, onLogsHealed }));

        await act(async () => {
            await result.current.heal([log('a', '/good.zevtc'), log('b', '/bad.zevtc')]);
        });

        expect(onLogsHealed).toHaveBeenCalledWith(['/good.zevtc']);
        expect(result.current.healState.healed).toBe(1);
        expect(result.current.healState.failures).toEqual([{ label: 'b', error: 'gone' }]);
    });

    it('does not announce a heal when nothing succeeded', async () => {
        const onLogsHealed = vi.fn();
        setReparse(() => ({ success: false, error: 'nope' }));
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: fakeCache() as any, onLogsHealed }));

        await act(async () => { await result.current.heal([log('a', '/a.zevtc')]); });

        expect(onLogsHealed).not.toHaveBeenCalled();
    });

    it('survives a rejected IPC call and records it as a failure', async () => {
        setReparse(() => { throw new Error('bridge died'); });
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: fakeCache() as any }));

        await act(async () => { await result.current.heal([log('a', '/a.zevtc')]); });

        expect(result.current.healState.failures).toEqual([{ label: 'a', error: 'bridge died' }]);
        expect(result.current.healState.running).toBe(false);
    });

    it('skips logs with no source file rather than asking for a parse of nothing', async () => {
        setReparse(() => ({ success: true, details: {} }));
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: fakeCache() as any }));

        await act(async () => {
            await result.current.heal([log('a', ''), log('b', '/b.zevtc')]);
        });

        expect((window as any).electronAPI.reparseLogAxilog).toHaveBeenCalledTimes(1);
        expect(result.current.healState.total).toBe(1);
    });

    it('ignores a second request while one is already running', async () => {
        let release: (() => void) | null = null;
        setReparse(() => new Promise((resolve) => {
            release = () => resolve({ success: true, details: {} });
        }));
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: fakeCache() as any }));

        let first: Promise<void>;
        act(() => { first = result.current.heal([log('a', '/a.zevtc')]); });
        await waitFor(() => expect(result.current.healState.running).toBe(true));
        await act(async () => { await result.current.heal([log('b', '/b.zevtc')]); });
        expect((window as any).electronAPI.reparseLogAxilog).toHaveBeenCalledTimes(1);

        await act(async () => { release?.(); await first!; });
        expect(result.current.healState.running).toBe(false);
    });

    it('does nothing at all without the IPC bridge', async () => {
        const { result } = renderHook(() => useAxilogHeal({ detailsCache: fakeCache() as any }));
        await act(async () => { await result.current.heal([log('a', '/a.zevtc')]); });
        expect(result.current.healState.running).toBe(false);
        expect(result.current.healState.total).toBe(0);
    });
});
