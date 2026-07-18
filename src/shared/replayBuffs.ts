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
