import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

/** Newest fight first; ties broken by the later ingest index. Returns a new array. */
export function sortFightsNewestFirst(fights: ReplayFightPayload[]): ReplayFightPayload[] {
    return [...fights].sort((a, b) => (b.timestampMs - a.timestampMs) || (b.fightIndex - a.fightIndex));
}

export function pickDefaultFightId(fights: ReplayFightPayload[]): string | null {
    if (!fights.length) return null;
    let best = fights[0];
    for (let i = 1; i < fights.length; i++) {
        const candidate = fights[i];
        if (
            candidate.timestampMs > best.timestampMs
            || (candidate.timestampMs === best.timestampMs && candidate.fightIndex > best.fightIndex)
        ) {
            best = candidate;
        }
    }
    return best.fightId;
}

function sampleAt(member: SquadMemberMovement, pollIndex: number): [number, number] | null {
    if (!member.positions.length) return null;
    // `pollIndex` is ABSOLUTE; `positions[0]` sits at the member's own
    // `firstPoll` (see `SquadMemberMovement.firstPoll`). Clamping is kept
    // rather than returning null: this feeds hit-testing for "which member
    // did I click", where parking on someone's nearest known sample is
    // friendlier than making them un-clickable outside their track.
    const idx = Math.max(0, Math.min(pollIndex - (member.firstPoll || 0), member.positions.length - 1));
    return member.positions[idx];
}

export function findClosestMember(
    members: SquadMemberMovement[],
    pollIndex: number,
    mapX: number,
    mapY: number,
    radius: number,
): SquadMemberMovement | null {
    let bestMember: SquadMemberMovement | null = null;
    let bestDist = radius;
    for (const m of members) {
        const pos = sampleAt(m, pollIndex);
        if (!pos) continue;
        const d = Math.hypot(pos[0] - mapX, pos[1] - mapY);
        if (d < bestDist) {
            bestDist = d;
            bestMember = m;
        }
    }
    return bestMember;
}

/** Stable-sort members so commanders render last — SVG paints in document
 *  order, so the tag icon ends up above every other member icon. */
export function orderMembersForRender<T extends { isCommander?: boolean }>(members: T[]): T[] {
    return [...members].sort((a, b) => Number(!!a.isCommander) - Number(!!b.isCommander));
}

/** How far into the fight a track may start and still count as part of the
 *  opening roster rather than a late joiner. One second: long enough to clear
 *  the measured poll-1..poll-3 opening spread, short enough that nobody stares
 *  at a blank map. */
const OPENING_WINDOW_MS = 1000;

/**
 * The fight-relative time at which the opening roster is actually on the map.
 *
 * Measured across every native fixture and all 29 fights of a real report, the
 * `firstPoll` histogram is consistently `{0: 1–5, 1: 28–116, …}`: a handful of
 * tracks carry a sample at t=0, essentially all the rest start exactly one poll
 * in, and a few stragglers join much later. Opening the playhead at 0 therefore
 * draws a near-empty map — 1 of 82 actors on the reported fight — that "fills
 * in" 300ms later.
 *
 * So the seed is the LATEST first poll among tracks that start inside
 * {@link OPENING_WINDOW_MS}, not the earliest overall: that is the first instant
 * the whole opening roster exists, and it still invents no position. Tracks
 * beyond the window are late joiners and are allowed to pop in. If nothing at
 * all starts inside the window the earliest track wins, which is the old
 * behaviour.
 *
 * Returns 0 when nothing has a track.
 */
export function firstPopulatedTimeMs(
    members: Pick<SquadMemberMovement, 'positions' | 'firstPoll'>[],
    pollingRate: number,
): number {
    if (!(pollingRate > 0)) return 0;
    const lastOpeningPoll = Math.floor(OPENING_WINDOW_MS / pollingRate);
    let earliest = Infinity;
    let openingRosterComplete = -Infinity;
    for (const m of members) {
        if (!m.positions.length) continue;
        const poll = Math.max(0, m.firstPoll || 0);
        if (poll < earliest) earliest = poll;
        if (poll <= lastOpeningPoll && poll > openingRosterComplete) openingRosterComplete = poll;
    }
    const chosen = Number.isFinite(openingRosterComplete) ? openingRosterComplete : earliest;
    return Number.isFinite(chosen) ? chosen * pollingRate : 0;
}
