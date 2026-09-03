import { TIMELINE_HEIGHT_PX } from './SyncedTimeline';

/**
 * The transport card's own height.
 *
 * One number now, where there used to be a resting height and an expanded one:
 * the CC/strip lanes are drawn as an overlay on the scrubber rather than as a
 * second row, so toggling them no longer changes the card's height. Every HUD
 * child that clears the transport therefore holds still when it is pressed,
 * instead of animating up and down with it.
 *
 * Derived from the scrubber so the two cannot fall out of step: 4px of padding
 * top and bottom, plus 1px of border on each side.
 */
export const REPLAY_TRANSPORT_HEIGHT = TIMELINE_HEIGHT_PX + 10;

/** The transport card's own `bottom` offset from the replay area's edge. */
export const REPLAY_TRANSPORT_BOTTOM = 8;

/** Breathing room between the transport card's top edge and whatever floats above it. */
export const REPLAY_ABOVE_TRANSPORT_GAP = 8;

/**
 * `bottom` offset for a HUD child that must always clear the transport
 * card's top edge.
 */
export function aboveTransportBottom(): number {
    return REPLAY_TRANSPORT_BOTTOM + REPLAY_TRANSPORT_HEIGHT + REPLAY_ABOVE_TRANSPORT_GAP;
}
