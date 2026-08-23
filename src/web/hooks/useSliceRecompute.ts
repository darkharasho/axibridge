import { useEffect, useRef, useState } from 'react';
import { hashSliceSettings } from '../../renderer/stats/slice/sliceSettingsHash';
import type { SliceSidecar } from '../../renderer/stats/slice/sliceTypes';

/**
 * What the caller renders instead of the slice when the recompute cannot be
 * trusted. It must never fall back to the full-report aggregation while still
 * claiming a slice is active — showing all seven fights' numbers under a
 * "Sliced view — 3 of 7 fights" banner is the one outcome the spec forbids.
 */
export const SLICE_UNAVAILABLE_MESSAGE =
    'Fight slicing is unavailable for this report — showing all fights.';

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
}): { stats: any | null; computing: boolean; error: string | null } {
    const [stats, setStats] = useState<any | null>(null);
    const [computing, setComputing] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
        // `includedOrdinals === null` means "no slice active" — the caller is
        // rendering the full report and there is nothing to recompute.
        // An EMPTY ARRAY is a different thing: a slice that selects no fights.
        // That is a legitimate, representable state (the tray's None button
        // reaches it in one click, and an empty bitmask decodes to it), and it
        // must recompute to the real zero-fight aggregation. Collapsing the two
        // used to make a 0-fight slice render the FULL report under a
        // "Sliced view — 0 of N fights" banner. The worker handles `frames: []`
        // correctly — it finalizes an aggregator that ingested nothing.
        if (!sidecar || !includedOrdinals) {
            setStats(null);
            setComputing(false);
            setError(null);
            return;
        }
        // The viewer has no settings of its own in slice mode: it merges under
        // the values the publisher wrote into report.json. Re-hashing them here
        // and comparing against the sidecar's own hash is the only surviving
        // check that the two actually agree — the worker's `mergeFrames`
        // handler builds its aggregator from whatever settings it is handed and
        // cannot verify anything. Without this, a report.json whose settings
        // drifted from the sidecar (a partial re-publish, a hand-edited file, a
        // future trim step that drops one of the three) would merge silently
        // under the wrong settings and render numbers that do not match what
        // was published. Costs ~1 ms.
        if (hashSliceSettings(mvpWeights, statsViewSettings, disruptionMethod) !== sidecar.settingsHash) {
            setStats(null);
            setComputing(false);
            setError(SLICE_UNAVAILABLE_MESSAGE);
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
        setError(null);
        worker.onmessage = (event: MessageEvent) => {
            const data = event.data;
            if (data?.token !== tokenRef.current) return;
            if (data?.type === 'error') {
                setStats(null);
                setComputing(false);
                setError(SLICE_UNAVAILABLE_MESSAGE);
                return;
            }
            if (data?.type !== 'result') return;
            const nextStats = data.result?.stats ?? null;
            if (!nextStats) {
                // `computeAndPost` posts `stats: null` when `finalize()` throws.
                // Treating that as "no stats yet" would leave `computing` false
                // and `stats` null forever, which the caller renders as the full
                // report under a slice banner.
                setStats(null);
                setComputing(false);
                setError(SLICE_UNAVAILABLE_MESSAGE);
                return;
            }
            setStats(nextStats);
            setComputing(false);
            setError(null);
        };
        // A throw inside `mergeFrame` that escapes the worker's own try/catch
        // (a module-load failure, say) arrives here and nowhere else. Without
        // this handler `computing` would stay true and `stats` null forever.
        worker.onerror = () => {
            setStats(null);
            setComputing(false);
            setError(SLICE_UNAVAILABLE_MESSAGE);
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

    return { stats, computing, error };
}
