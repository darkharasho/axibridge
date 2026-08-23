import { useEffect, useRef, useState } from 'react';
import type { SliceSidecar } from '../../renderer/stats/slice/sliceTypes';

/**
 * Recompute a slice in the stats worker.
 *
 * Merging 25 frames and running `finalize()` costs about what a full
 * aggregation costs, so it does not belong on the main thread. Results carry
 * the token of the request that asked for them; a late reply from a superseded
 * selection is dropped rather than painted.
 *
 * Every request is preceded by a `reset` message carrying the same token.
 * This is not optional bookkeeping: `statsWorker.ts` only updates its
 * internal `currentToken` on a `reset` message (see `statsWorker.ts:151-152`
 * and the `hasMismatchedToken` guard at `statsWorker.ts:26-27,181`). A
 * `mergeFrames` message alone never changes `currentToken` — it stays at its
 * initial value of `0` for the life of the worker — so a second `mergeFrames`
 * call carrying any other token would be silently dropped, and every
 * `result` the worker ever posts would carry `token: 0` regardless of what
 * was requested, defeating staleness detection. Pairing `reset` +
 * `mergeFrames` with the same token threads the token through both the
 * request-acceptance check and the reply, exactly like the desktop
 * aggregation hook (`useStatsAggregationWorker.ts:430-441`) and exactly what
 * `workerMergeFrames.test.ts`'s "ignores a mergeFrames message carrying a
 * stale token" case pins.
 *
 * The worker URL is resolved the same way the desktop hook resolves it
 * (`useStatsAggregationWorker.ts:256`), so the bundler emits one shared chunk.
 */
export function useSliceRecompute({ sidecar, includedOrdinals, mvpWeights, statsViewSettings, disruptionMethod }: {
    sidecar: SliceSidecar | null;
    includedOrdinals: number[] | null;
    mvpWeights: any;
    statsViewSettings: any;
    disruptionMethod: any;
}): { stats: any | null; computing: boolean } {
    const [stats, setStats] = useState<any | null>(null);
    const [computing, setComputing] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const tokenRef = useRef(0);

    useEffect(() => () => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);

    const key = includedOrdinals ? includedOrdinals.join(',') : '';
    // Same reasoning as `key` above, extended to the settings objects: a
    // caller that reconstructs `statsViewSettings`/`disruptionMethod`/
    // `mvpWeights` with a new identity on every render (this hook's own test
    // does, via inline object literals) would otherwise re-fire this effect
    // on every render the effect itself causes via `setComputing`/`setStats`
    // — content-equal but reference-unequal settings must not restart the
    // worker round-trip.
    const settingsKey = JSON.stringify({ mvpWeights, statsViewSettings, disruptionMethod });

    useEffect(() => {
        if (!sidecar || !includedOrdinals || includedOrdinals.length === 0) {
            setStats(null);
            setComputing(false);
            return;
        }
        if (!workerRef.current) {
            workerRef.current = new Worker(
                new URL('../../renderer/workers/statsWorker.ts', import.meta.url),
                { type: 'module' },
            );
        }
        const worker = workerRef.current;
        const token = ++tokenRef.current;
        setComputing(true);
        worker.onmessage = (event: MessageEvent) => {
            const data = event.data;
            if (data?.type !== 'result' || data.token !== tokenRef.current) return;
            setStats(data.result?.stats ?? null);
            setComputing(false);
        };
        // See the JSDoc above: `reset` establishes the worker's currentToken
        // before `mergeFrames` is allowed to run under it.
        worker.postMessage({ type: 'reset', token, totalLogs: 0 });
        worker.postMessage({
            type: 'mergeFrames',
            token,
            frames: includedOrdinals.map((ordinal) => sidecar.frames[ordinal]).filter(Boolean),
            settings: { mvpWeights, statsViewSettings, disruptionMethod },
        });
        // `includedOrdinals` is deliberately NOT a dependency here — it is a
        // fresh array on every caller render even when its contents are
        // unchanged (reportApp.tsx rebuilds it from a Set each render). `key`
        // is its content-stable proxy; depending on the array itself would
        // re-fire this effect (and re-post to the worker) on every unrelated
        // re-render triggered by `setComputing`/`setStats` below.
    }, [sidecar, key, settingsKey]);

    return { stats, computing };
}
