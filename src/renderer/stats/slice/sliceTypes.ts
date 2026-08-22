import type { FightRosterEntry } from '../statsStore';

/** Bumped whenever a frame's internal shape changes. A viewer that sees a
 *  version it does not know disables slicing rather than guessing. */
export const SLICE_SIDECAR_VERSION = 1;

/** The tray's view of a fight. Deliberately the Phase A roster shape, so
 *  `FightSliceTray` renders sidecar fights with no changes at all. */
export type SliceFightEntry = FightRosterEntry;

/**
 * Pre-finalize aggregator state for exactly one fight, Map/Set-encoded.
 * Opaque by design: only `IncrementalAggregator.exportFrame` writes it and
 * only `IncrementalAggregator.mergeFrame` reads it.
 */
export interface SliceFrame {
    [section: string]: unknown;
}

export interface SliceSidecar {
    version: number;
    /** Hash of the settings the frames were built under. A viewer whose report
     *  disagrees disables slicing rather than rendering wrong numbers. */
    settingsHash: string;
    /** Frozen publish order. Ordinal addressing is stable because of this. */
    fights: SliceFightEntry[];
    /** `frames[i]` is the frame for `fights[i]`. */
    frames: SliceFrame[];
}
