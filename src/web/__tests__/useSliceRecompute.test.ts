import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSliceRecompute } from '../hooks/useSliceRecompute';

const posted: any[] = [];
let handler: ((e: any) => void) | null = null;

class FakeWorker {
    onmessage: ((e: any) => void) | null = null;
    constructor() { handler = null; }
    postMessage(msg: any) {
        posted.push(msg);
        handler = this.onmessage;
    }
    terminate() {}
}

vi.stubGlobal('Worker', FakeWorker as any);

const SIDECAR: any = {
    version: 1, settingsHash: 'h',
    fights: [{ id: 'a' }, { id: 'b' }],
    frames: [{ n: 1 }, { n: 2 }],
};

afterEach(() => { posted.length = 0; handler = null; });

describe('useSliceRecompute', () => {
    it('posts only the selected frames', async () => {
        renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [1], mvpWeights: undefined, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(posted.length).toBeGreaterThan(0));
        const msg = posted[posted.length - 1];
        expect(msg.type).toBe('mergeFrames');
        expect(msg.frames).toEqual([{ n: 2 }]);
    });

    it('returns null stats and stops computing when nothing is selected', () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: null, mvpWeights: undefined, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        expect(result.current.stats).toBeNull();
        expect(result.current.computing).toBe(false);
        expect(posted).toHaveLength(0);
    });

    it('surfaces the worker result', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], mvpWeights: undefined, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(handler).toBeTruthy());
        const token = posted[posted.length - 1].token;
        handler!({ data: { type: 'result', token, result: { stats: { ok: true } } } });
        await waitFor(() => expect(result.current.stats).toEqual({ ok: true }));
        expect(result.current.computing).toBe(false);
    });

    it('ignores a result carrying a stale token', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], mvpWeights: undefined, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(handler).toBeTruthy());

        // `act` is load-bearing: without it the assertion runs before React has
        // flushed, so `stats` reads null whether the token guard exists or not
        // and the test passes for the wrong reason.
        await act(async () => {
            handler!({ data: { type: 'result', token: 9999, result: { stats: { stale: true } } } });
        });
        expect(result.current.stats).toBeNull();
        // A superseded reply must not end the computing state either — the
        // request it belonged to is not the one still outstanding.
        expect(result.current.computing).toBe(true);

        // Discriminator: the same handler, with the live token, DOES apply.
        // Without this the test cannot tell a working guard from a dead handler.
        const token = posted[posted.length - 1].token;
        await act(async () => {
            handler!({ data: { type: 'result', token, result: { stats: { fresh: true } } } });
        });
        expect(result.current.stats).toEqual({ fresh: true });
        expect(result.current.computing).toBe(false);
    });

    it('includes the publisher mvpWeights in the posted settings', async () => {
        const mvpWeights = { dps: 0.5, cleanses: 0.5 };
        renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], mvpWeights, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(posted.length).toBeGreaterThan(0));
        const msg = posted[posted.length - 1];
        expect(msg.type).toBe('mergeFrames');
        expect(msg.settings.mvpWeights).toEqual(mvpWeights);
    });
});
