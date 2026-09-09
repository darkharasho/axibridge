import { classifyResurrectSkill, type ResurrectKind } from './resurrectCatalog';

/**
 * A down interval that ended in a stand-up rather than a death.
 *
 * This is the atomic unit of revive tracking and it is ground truth from the
 * log: it depends on no attribution heuristic. `support[0].resurrects`, by
 * contrast, is a count of hand-resurrect CHANNEL STARTS — attempts, not
 * pickups — which is the defect this module exists to correct.
 */
export interface Recovery {
    playerKey: string;
    playerIndex: number;
    downStart: number;
    standUpAt: number;
}

/**
 * A death is recorded as a `dead` interval starting where the `down` interval
 * ended. Allow a small slop for ordering jitter between the two event streams.
 */
export const DEATH_MATCH_TOLERANCE_MS = 250;

const intervals = (value: unknown): number[][] =>
    Array.isArray(value) ? value.filter((entry) => Array.isArray(entry) && entry.length >= 2) : [];

/**
 * True when this player's data can support revive derivation at all.
 *
 * Requires BOTH replay intervals (for recoveries) and rotation (for
 * attribution). Logs parsed without `replay: true` or `rotation: true`, and
 * logs cached before this feature shipped, have neither — for those, completed
 * revives must be reported as null, never as zero.
 */
export const hasReviveData = (player: any): boolean =>
    Array.isArray(player?.combatReplayData?.down)
    && Array.isArray(player?.combatReplayData?.dead)
    && Array.isArray(player?.rotation);

export const deriveRecoveries = (player: any, playerKey: string, playerIndex: number): Recovery[] => {
    const down = intervals(player?.combatReplayData?.down);
    const dead = intervals(player?.combatReplayData?.dead);
    const recoveries: Recovery[] = [];

    for (const [downStart, downEnd] of down) {
        const diedHere = dead.some(([deadStart]) => Math.abs(deadStart - downEnd) <= DEATH_MATCH_TOLERANCE_MS);
        if (diedHere) continue;
        recoveries.push({ playerKey, playerIndex, downStart, standUpAt: downEnd });
    }

    return recoveries;
};

export interface ResurrectCast {
    playerKey: string;
    playerIndex: number;
    skillId: number;
    skillName: string;
    kind: ResurrectKind;
    start: number;
    end: number;
}

/**
 * EI groups every cast of one skill into a SINGLE rotation entry with a
 * `skills[]` array. Counting rotation entries reports 1 where the player cast
 * the skill nine times, so always flat-map `skills[]`.
 *
 * Channelled resurrects use their real cast duration. Utilities use their
 * catalogued window instead: a banner is planted in an instant but keeps
 * reviving for its lifetime, so the cast duration is not the credit window.
 */
export const extractResurrectCasts = (
    player: any,
    playerKey: string,
    playerIndex: number,
    skillMap: Record<string, { name?: string }> | undefined
): ResurrectCast[] => {
    const rotation = Array.isArray(player?.rotation) ? player.rotation : [];
    const casts: ResurrectCast[] = [];

    for (const entry of rotation) {
        if (!entry?.id) continue;
        const skill = classifyResurrectSkill(Number(entry.id), skillMap);
        if (!skill) continue;

        for (const instance of Array.isArray(entry.skills) ? entry.skills : []) {
            const start = Number(instance?.castTime);
            if (!Number.isFinite(start)) continue;
            const duration = Number(instance?.duration) || 0;
            const end = skill.kind === 'utility' ? start + skill.windowMs : start + duration;
            casts.push({
                playerKey, playerIndex,
                skillId: skill.id, skillName: skill.name, kind: skill.kind,
                start, end,
            });
        }
    }

    return casts;
};

export interface AttributionOptions {
    /**
     * Optional proximity gate for ground-placed utilities. Omitted means
     * window-only attribution. Implementations must use the last known position
     * sample and never interpolate across a gap: a missing position sample
     * means the entity was stationary, not that it moved.
     */
    isWithinRadius?: (casterIndex: number, revivedIndex: number, atMs: number) => boolean;
}

export interface Attribution {
    recovery: Recovery;
    kind: 'hand' | 'utility' | 'self' | 'unattributed';
    primaryKey: string | null;
    skillId: number | null;
    assistKeys: string[];
}

const covers = (cast: ResurrectCast, atMs: number) => cast.start <= atMs && cast.end >= atMs;

/**
 * Resolve one recovery through the attribution ladder: hand, then utility, then
 * self, then unattributed.
 *
 * Unattributed is a REPORTED outcome, not a dropped one. Its rate is how we
 * measure whether this heuristic is trustworthy, and it is displayed in the UI.
 */
export const attributeRecovery = (
    recovery: Recovery,
    casts: ResurrectCast[],
    opts: AttributionOptions = {}
): Attribution => {
    const at = recovery.standUpAt;
    const base = { recovery, assistKeys: [] as string[] };

    const hands = casts.filter((cast) =>
        cast.kind === 'hand' && cast.playerKey !== recovery.playerKey && covers(cast, at));

    if (hands.length > 0) {
        // Every candidate covers the stand-up; the one that channelled longest
        // over this down did the work. Earliest start breaks a tie.
        const overlap = (cast: ResurrectCast) =>
            Math.min(cast.end, at) - Math.max(cast.start, recovery.downStart);
        const sorted = [...hands].sort((a, b) => (overlap(b) - overlap(a)) || (a.start - b.start));
        const [primary, ...assists] = sorted;
        return {
            ...base,
            kind: 'hand',
            primaryKey: primary.playerKey,
            skillId: primary.skillId,
            assistKeys: assists.map((cast) => cast.playerKey),
        };
    }

    const utilities = casts.filter((cast) =>
        cast.kind === 'utility'
        && covers(cast, at)
        && (!opts.isWithinRadius || opts.isWithinRadius(cast.playerIndex, recovery.playerIndex, at)));

    if (utilities.length > 0) {
        // Most recent activation wins: it is the one that plausibly did it.
        const primary = utilities.reduce((best, cast) => (cast.start > best.start ? cast : best));
        return { ...base, kind: 'utility', primaryKey: primary.playerKey, skillId: primary.skillId };
    }

    const self = casts.find((cast) =>
        cast.kind === 'self' && cast.playerKey === recovery.playerKey && covers(cast, at));
    if (self) {
        return { ...base, kind: 'self', primaryKey: self.playerKey, skillId: self.skillId };
    }

    return { ...base, kind: 'unattributed', primaryKey: null, skillId: null };
};
