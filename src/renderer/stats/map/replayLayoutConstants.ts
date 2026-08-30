/**
 * The transport card's own height at rest and with the CC/strip lanes band
 * expanded. Kept as named constants — rather than the bare `66` / `122`
 * scattered through comments — because two other floating HUD children
 * (the CC-taken notice and the follow/re-center chips) must clear the
 * transport's *top* edge and previously only accounted for the resting
 * height, letting the transport's expanded state cover them.
 */
export const REPLAY_TRANSPORT_HEIGHT_RESTING = 66;
export const REPLAY_TRANSPORT_HEIGHT_EXPANDED = 122;

/** The transport card's own `bottom` offset from the replay area's edge. */
export const REPLAY_TRANSPORT_BOTTOM = 8;

/** Breathing room between the transport card's top edge and whatever floats above it. */
export const REPLAY_ABOVE_TRANSPORT_GAP = 8;

/**
 * `bottom` offset for a HUD child that must always clear the transport
 * card's top edge, in both its resting and lanes-expanded heights.
 */
export function aboveTransportBottom(lanesExpanded: boolean): number {
    const height = lanesExpanded ? REPLAY_TRANSPORT_HEIGHT_EXPANDED : REPLAY_TRANSPORT_HEIGHT_RESTING;
    return REPLAY_TRANSPORT_BOTTOM + height + REPLAY_ABOVE_TRANSPORT_GAP;
}
