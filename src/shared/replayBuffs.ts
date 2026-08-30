// Boon IDs worth rendering on the replay — offensive + defensive core boons.
// Extend this set if additional buffs need to show up on the replay timeline.
export const TRACKED_REPLAY_BUFF_IDS: Set<number> = new Set([
    740,   // Might
    725,   // Fury
    1187,  // Quickness
    30328, // Alacrity
    743,   // Aegis
    1122,  // Stability
    718,   // Regeneration
    717,   // Protection
    26980, // Resistance
    873,   // Resolution (EI reuses the old Retaliation id 873; 31484 is not emitted)
    719,   // Swiftness
    726,   // Vigor
]);

/**
 * Conditions worth rendering on a replay member card. Curated, not
 * exhaustive: every tracked id adds a per-member state series to
 * `movementData`, and `replayFights` is already ~66% of `report.json`.
 *
 * These eight are the ones that change what a player can *do* in a WvW
 * fight. Damage conditions (Bleeding, Burning, Poison, Torment, Confusion)
 * are deliberately excluded — five more series per member to say something
 * the health bar already says.
 */
export const TRACKED_REPLAY_CONDI_IDS: Set<number> = new Set([
    738,   // Vulnerability
    722,   // Chilled
    727,   // Immobile
    720,   // Blind
    742,   // Weakness
    791,   // Fear
    721,   // Crippled
    26766, // Slow
]);

/**
 * What `buildMovementData` actually filters on. Boons and conditions share
 * one `buffUptimes` stream and one icon catalog, so they are tracked with a
 * single set and split again at render time by {@link isReplayCondition}.
 */
export const TRACKED_REPLAY_STATE_IDS: Set<number> = new Set([
    ...TRACKED_REPLAY_BUFF_IDS,
    ...TRACKED_REPLAY_CONDI_IDS,
]);

/** True when `id` is one of the tracked conditions rather than a boon. */
export function isReplayCondition(id: number): boolean {
    return TRACKED_REPLAY_CONDI_IDS.has(id);
}
