import type { FightRosterEntry } from '../statsStore';

/** Bumped whenever a frame's internal shape changes. A viewer that sees a
 *  version it does not know disables slicing rather than guessing.
 *
 *  v2: frames carry a `reviveDetail` section. A v1 sidecar merged by a v2
 *  viewer would leave the revive accumulator empty, which must not be
 *  presented as "nobody was revived".
 *
 *  v3: the revive accumulator's per-utility `byCaster` map changed from a bare
 *  revive count to `{ casts, revives }`, and utility rows carry a skill icon. A
 *  v2 frame merged by a v3 viewer would add numbers to objects. */
export const SLICE_SIDECAR_VERSION = 3;

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
