import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const fetchSliceSidecar = vi.fn();
vi.mock('../../renderer/stats/slice/fetchSliceSidecar', () => ({
    fetchSliceSidecar: (...args: any[]) => fetchSliceSidecar(...args),
}));

import { useSliceSidecarLoader } from '../hooks/useSliceSidecarLoader';

const SIDECAR: any = { version: 1, settingsHash: 'h', fights: [{ id: 'a' }], frames: [{ n: 1 }] };

const setup = (url: string | null = 'https://r2.example/slice.json.gz') => renderHook(
    () => useSliceSidecarLoader({ url, settingsHash: 'h', onSidecar: () => {} }),
);

beforeEach(() => { fetchSliceSidecar.mockReset(); });

describe('useSliceSidecarLoader', () => {
    it('issues no request until asked', () => {
        setup();
        // The cold-load guarantee: rendering a published report must not fetch.
        expect(fetchSliceSidecar).not.toHaveBeenCalled();
    });

    it('surfaces a loading message while the sidecar downloads', async () => {
        let release: (v: any) => void = () => {};
        fetchSliceSidecar.mockReturnValue(new Promise((r) => { release = r; }));
        const { result } = setup();

        let pending!: Promise<any>;
        act(() => { pending = result.current.loadSliceSidecar(); });

        // The tray is blank until the fetch lands, so the status strip is the
        // only feedback the user gets for a multi-megabyte download.
        expect(result.current.sliceState.status).toBe('loading');
        expect(result.current.sliceState.message).toMatch(/loading slice data/i);

        await act(async () => { release({ ok: true, sidecar: SIDECAR }); await pending; });
        expect(result.current.sliceState.status).toBe('ready');
        expect(result.current.sliceState.message).toBeNull();
    });

    it('shares one request between concurrent callers', async () => {
        let release: (v: any) => void = () => {};
        fetchSliceSidecar.mockReturnValue(new Promise((r) => { release = r; }));
        const { result } = setup();

        // A slice= deep link and a tray click both call this. Guarding only on
        // the settled sidecar let each start its own multi-megabyte download.
        let a!: Promise<any>; let b!: Promise<any>;
        act(() => { a = result.current.loadSliceSidecar(); b = result.current.loadSliceSidecar(); });
        expect(fetchSliceSidecar).toHaveBeenCalledTimes(1);

        await act(async () => { release({ ok: true, sidecar: SIDECAR }); await Promise.all([a, b]); });
        expect(await a).toBe(SIDECAR);
        expect(await b).toBe(SIDECAR);

        // And a later call reuses the settled sidecar rather than refetching.
        await act(async () => { await result.current.loadSliceSidecar(); });
        expect(fetchSliceSidecar).toHaveBeenCalledTimes(1);
    });

    it('reports a rejected fetch instead of hanging on loading', async () => {
        fetchSliceSidecar.mockRejectedValue(new Error('network down'));
        const { result } = setup();
        await act(async () => { await result.current.loadSliceSidecar(); });
        expect(result.current.sliceState.status).toBe('unavailable');
        expect(result.current.sliceState.message).toMatch(/could not load slice data/i);
    });

    it('reports a report published without slice data', async () => {
        const { result } = setup(null);
        await act(async () => { await result.current.loadSliceSidecar(); });
        expect(result.current.sliceState.status).toBe('unavailable');
        expect(fetchSliceSidecar).not.toHaveBeenCalled();
    });
});
