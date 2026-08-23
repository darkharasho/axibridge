import type { SliceSidecar } from './sliceTypes';

/**
 * Resolve the excluded-fight set into the ordinals a slice includes.
 *
 * Extracted from `reportApp` because the three lines that composed it were
 * pinned by nothing: a re-review reintroduced the exact C2 bug here
 * (`included.length > 0 ? included : null`) and all 49 web tests stayed green.
 * The hooks and the worker either side of it are well covered; this seam was
 * the gap between them.
 *
 * The two empty cases are NOT the same thing, and conflating them is the bug:
 *
 * - `null` — no slice is active. The viewer renders the published aggregation.
 * - `[]`   — a slice that selects no fights. Reached by the tray's None button
 *            and by an all-zero shared bitmask. It must recompute to a real
 *            zero-fight aggregation; returning `null` here rendered the FULL
 *            report under a "Sliced view — 0 of N fights" banner.
 */
export function computeIncludedOrdinals(
    sidecar: SliceSidecar | null,
    excludedFightKeys: Set<string>,
): number[] | null {
    if (!sidecar || excludedFightKeys.size === 0) return null;
    return sidecar.fights
        .map((fight, ordinal) => ({ fight, ordinal }))
        .filter(({ fight }) => !excludedFightKeys.has(fight.id))
        .map(({ ordinal }) => ordinal);
}
