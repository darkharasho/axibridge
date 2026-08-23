import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSliceRecompute, SLICE_UNAVAILABLE_MESSAGE } from '../hooks/useSliceRecompute';
import { hashSliceSettings } from '../../renderer/stats/slice/sliceSettingsHash';

const posted: any[] = [];
let handler: ((e: any) => void) | null = null;
let errorHandler: ((e: any) => void) | null = null;

class FakeWorker {
    onmessage: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    constructor() { handler = null; errorHandler = null; }
    postMessage(msg: any) {
        posted.push(msg);
        handler = this.onmessage;
        errorHandler = this.onerror;
    }
    terminate() {}
}

vi.stubGlobal('Worker', FakeWorker as any);

// The settings triple every test below passes to the hook. The hook re-hashes
// it and refuses to merge unless it matches the sidecar's own `settingsHash`
// (M1), so the fixture carries the real hash rather than a placeholder.
const SETTINGS = { mvpWeights: undefined, statsViewSettings: {}, disruptionMethod: undefined };

const SIDECAR: any = {
    version: 1,
    settingsHash: hashSliceSettings(SETTINGS.mvpWeights, SETTINGS.statsViewSettings, SETTINGS.disruptionMethod),
    fights: [{ id: 'a' }, { id: 'b' }],
    frames: [{ n: 1 }, { n: 2 }],
};

afterEach(() => { posted.length = 0; handler = null; errorHandler = null; });

describe('useSliceRecompute', () => {
    it('posts only the selected frames', async () => {
        renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [1], ...SETTINGS,
        }));
        await waitFor(() => expect(posted.length).toBeGreaterThan(0));
        const msg = posted[posted.length - 1];
        expect(msg.type).toBe('mergeFrames');
        expect(msg.frames).toEqual([{ n: 2 }]);
    });

    /**
     * Ruling R20-2: `mergeFrames` MUST be preceded by a `reset` carrying the
     * same token, and nothing else pinned that.
     *
     * The worker only advances its `currentToken` on a `reset` (statsWorker.ts
     * `hasMismatchedToken`); a bare `mergeFrames` leaves it at its initial `0`.
     * The hook's first token is `1`, so without the `reset` EVERY `mergeFrames`
     * would be dropped by the token guard and no slice would ever recompute —
     * silently, because the worker replies to a dropped message with nothing.
     * Every other assertion in this file reads `posted[posted.length - 1]` and
     * so cannot see the `reset` at all; these two read position 0 explicitly.
     */
    it('precedes every mergeFrames with a reset carrying the same token', async () => {
        renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [1], ...SETTINGS,
        }));
        await waitFor(() => expect(posted.length).toBe(2));
        expect(posted[0].type).toBe('reset');
        expect(posted[1].type).toBe('mergeFrames');
        expect(typeof posted[0].token).toBe('number');
        expect(posted[0].token).toBe(posted[1].token);
    });

    it('returns null stats and stops computing when no slice is active', () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: null, ...SETTINGS,
        }));
        expect(result.current.stats).toBeNull();
        expect(result.current.computing).toBe(false);
        expect(result.current.error).toBeNull();
        expect(posted).toHaveLength(0);
    });

    /**
     * C2: an empty selection is a SLICE THAT SELECTS NOTHING, not "no slice".
     * It must round-trip through the worker with `frames: []` so the viewer
     * renders the real zero-fight aggregation. Short-circuiting it to
     * `stats: null` made the caller fall back to `report.stats` — the FULL
     * report — under a "Sliced view — 0 of N fights" banner.
     */
    it('recomputes an empty selection as a zero-fight slice instead of skipping it', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [], ...SETTINGS,
        }));
        await waitFor(() => expect(posted.length).toBe(2));
        expect(posted[1].type).toBe('mergeFrames');
        expect(posted[1].frames).toEqual([]);
        expect(result.current.computing).toBe(true);

        const token = posted[1].token;
        await act(async () => {
            handler!({ data: { type: 'result', token, result: { stats: { zeroFight: true } } } });
        });
        // A real (empty) aggregation, not a null that the caller would replace
        // with the full report.
        expect(result.current.stats).toEqual({ zeroFight: true });
        expect(result.current.error).toBeNull();
    });

    /**
     * M1: slice mode has no settings of its own — it merges under the values
     * the publisher wrote into report.json. Task 20 moved production onto the
     * worker's `mergeFrames`, which builds its aggregator from whatever
     * settings it is handed and verifies nothing, so this re-hash is the only
     * surviving check that report.json and the sidecar actually agree. On a
     * mismatch the hook must refuse to merge and say so — never merge under
     * settings the sidecar was not built for.
     */
    it('refuses to merge when the published settings do not hash to the sidecar hash', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: { ...SIDECAR, settingsHash: 'built-under-something-else' },
            includedOrdinals: [0], ...SETTINGS,
        }));
        await waitFor(() => expect(result.current.error).toBe(SLICE_UNAVAILABLE_MESSAGE));
        expect(result.current.stats).toBeNull();
        expect(result.current.computing).toBe(false);
        expect(posted).toHaveLength(0);
    });

    it('surfaces a worker error message as an unavailable slice', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], ...SETTINGS,
        }));
        await waitFor(() => expect(handler).toBeTruthy());
        const token = posted[posted.length - 1].token;
        await act(async () => {
            handler!({ data: { type: 'error', token, message: 'boom' } });
        });
        expect(result.current.error).toBe(SLICE_UNAVAILABLE_MESSAGE);
        expect(result.current.stats).toBeNull();
        expect(result.current.computing).toBe(false);
    });

    it('surfaces an uncaught worker failure via onerror', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], ...SETTINGS,
        }));
        await waitFor(() => expect(errorHandler).toBeTruthy());
        await act(async () => {
            errorHandler!({ message: 'module load failed' });
        });
        expect(result.current.error).toBe(SLICE_UNAVAILABLE_MESSAGE);
        expect(result.current.stats).toBeNull();
        // Not left stuck on "Recomputing…" forever.
        expect(result.current.computing).toBe(false);
    });

    it('treats a result carrying null stats as an unavailable slice', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], ...SETTINGS,
        }));
        await waitFor(() => expect(handler).toBeTruthy());
        const token = posted[posted.length - 1].token;
        await act(async () => {
            // What computeAndPost posts when finalize() throws.
            handler!({ data: { type: 'result', token, result: { stats: null, skillUsageData: null } } });
        });
        expect(result.current.error).toBe(SLICE_UNAVAILABLE_MESSAGE);
        expect(result.current.computing).toBe(false);
    });

    it('surfaces the worker result', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], ...SETTINGS,
        }));
        await waitFor(() => expect(handler).toBeTruthy());
        const token = posted[posted.length - 1].token;
        handler!({ data: { type: 'result', token, result: { stats: { ok: true } } } });
        await waitFor(() => expect(result.current.stats).toEqual({ ok: true }));
        expect(result.current.computing).toBe(false);
    });

    it('ignores a result carrying a stale token', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], ...SETTINGS,
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
        const sidecar = { ...SIDECAR, settingsHash: hashSliceSettings(mvpWeights, {}, undefined) };
        renderHook(() => useSliceRecompute({
            sidecar, includedOrdinals: [0], mvpWeights, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(posted.length).toBeGreaterThan(0));
        const msg = posted[posted.length - 1];
        expect(msg.type).toBe('mergeFrames');
        expect(msg.settings.mvpWeights).toEqual(mvpWeights);
    });
});
