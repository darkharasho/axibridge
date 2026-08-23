import { IncrementalAggregator } from '../incrementalAggregation';
import { hashAggregationSettings } from '../statsStore';
import type { SliceSidecar } from './sliceTypes';

/**
 * Thrown when the viewer's active settings do not match the settings the
 * sidecar was built under. Slice mode uses the PUBLISHER's settings — there is
 * no way to recompute a frame under different ones — so a mismatch must
 * disable slicing rather than silently render numbers that don't match what
 * was published. Callers should catch this and fall back to the non-slice
 * (full-report) view.
 */
export class SliceSettingsMismatchError extends Error {
    constructor() {
        super('mergeSliceFrames: settingsHash mismatch — sidecar was built under different settings');
        this.name = 'SliceSettingsMismatchError';
    }
}

/**
 * Recompute stats for a subset of a published report's fights.
 *
 * The browser's whole slice path: merge the selected frames into a fresh
 * aggregator and run the real `finalize()`. Everything derived — leaderboards,
 * top stats, MVPs — is rebuilt here, which is why frames never carry it.
 *
 * `includedOrdinals` is sanitized before use so a malformed selection degrades
 * safely instead of producing silently-wrong numbers:
 *  - out-of-range ordinals (negative, or >= frame count) are dropped;
 *  - non-integer ordinals (floats, NaN) are dropped — `Number.isInteger`
 *    rejects both;
 *  - duplicate ordinals are deduped so a repeated ordinal is merged exactly
 *    once (merging it twice would double-count that fight's contribution);
 *  - an empty (or entirely-invalid) selection is not an error — it produces
 *    the same "zero fights" result `finalize()` gives an aggregator that
 *    never ingested anything, matching what an empty non-slice report shows.
 */
export function mergeSliceFrames({ sidecar, includedOrdinals, mvpWeights, statsViewSettings, disruptionMethod }: {
    sidecar: SliceSidecar;
    includedOrdinals: number[];
    mvpWeights: any;
    statsViewSettings: any;
    disruptionMethod: any;
}): { stats: any; skillUsageData: any } {
    const expectedHash = hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod);
    if (expectedHash !== sidecar.settingsHash) {
        throw new SliceSettingsMismatchError();
    }

    const seen = new Set<number>();
    const ordinals = (includedOrdinals || [])
        .filter((ordinal) => Number.isInteger(ordinal) && ordinal >= 0 && ordinal < sidecar.frames.length)
        .filter((ordinal) => {
            if (seen.has(ordinal)) return false;
            seen.add(ordinal);
            return true;
        })
        .sort((a, b) => a - b);

    const aggregator = new IncrementalAggregator({ mvpWeights, statsViewSettings, disruptionMethod });
    ordinals.forEach((ordinal) => {
        const frame = sidecar.frames[ordinal];
        if (frame) aggregator.mergeFrame(frame);
    });
    return aggregator.finalize();
}
