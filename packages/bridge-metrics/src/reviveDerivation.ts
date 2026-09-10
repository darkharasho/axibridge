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
    /** Skill icon URL from the log's own skill map, or null when it carries none. */
    skillIcon: string | null;
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
    skillMap: Record<string, { name?: string; icon?: string }> | undefined
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
                skillIcon: skillMap?.[`s${skill.id}`]?.icon || null,
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
     *
     * NO PRODUCTION CALLER PASSES THIS TODAY. Utility attribution is therefore
     * time-window-only: a Battle Standard planted anywhere on the map is
     * credited with every squad stand-up inside its window, and one long-window
     * utility can be credited with several. That is the mechanism behind the
     * revives-per-cast figures above 1 in the spec's validation table, and the
     * Revives section carries a matching caveat. It is a known limitation of the
     * heuristic, not a defect in it; this option is the extension point.
     */
    isWithinRadius?: (casterIndex: number, revivedIndex: number, atMs: number) => boolean;
    /**
     * Overrides `reviveePlayerKey` for building the key each player is tracked
     * under. A caller that keys its own player map differently (e.g.
     * `computePlayerAggregation`'s account-or-`account::profession` identity)
     * passes its own function here rather than reconciling two separate key
     * conventions after the fact.
     */
    playerKey?: (player: any) => string;
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

export const ILLUSION_OF_LIFE_ID = 10244;

export interface RevivePlayerCounts {
    attempts: number;
    attemptTimeMs: number;
    handRevives: number;
    utilityCasts: number;
    utilityRevives: number;
    selfRevives: number;
    assists: number;
}

/**
 * Per-utility tally. `byCaster` holds BOTH casts and revives, keyed by caster,
 * because a per-caster breakdown that carried revives alone could not show
 * revives per cast — and a caster who cast without ever landing one would
 * vanish from the breakdown entirely while still counting toward the total.
 */
export interface ReviveUtilityTally {
    name: string;
    icon: string | null;
    casts: number;
    revives: number;
    byCaster: Map<string, { casts: number; revives: number }>;
}

export interface ReviveLogSummary {
    hasData: boolean;
    downs: number;
    recovered: number;
    died: number;
    byKind: Record<'hand' | 'utility' | 'self' | 'unattributed', number>;
    players: Map<string, RevivePlayerCounts>;
    utilities: Map<number, ReviveUtilityTally>;
    iolRevives: Array<{ playerKey: string; playerIndex: number; at: number }>;
}

const emptyCounts = (): RevivePlayerCounts => ({
    attempts: 0, attemptTimeMs: 0, handRevives: 0,
    utilityCasts: 0, utilityRevives: 0, selfRevives: 0, assists: 0,
});

/**
 * The single source of truth for how a player is keyed across revive
 * derivation, the renderer accumulator (Task 7), and the aggregation layer
 * (Task 9). Exported so every consumer builds and splits the same string
 * instead of keeping its own private copy of this convention.
 */
export const reviveePlayerKey = (player: any): string =>
    `${player?.account || player?.name || 'Unknown'}|${player?.profession || 'Unknown'}`;

export const deriveReviveLogSummary = (details: any, opts: AttributionOptions = {}): ReviveLogSummary => {
    const summary: ReviveLogSummary = {
        hasData: false, downs: 0, recovered: 0, died: 0,
        byKind: { hand: 0, utility: 0, self: 0, unattributed: 0 },
        players: new Map(), utilities: new Map(), iolRevives: [],
    };

    const roster = (Array.isArray(details?.players) ? details.players : [])
        .map((player: any, index: number) => ({ player, index }))
        .filter(({ player }: any) => !player?.notInSquad);
    if (roster.length === 0) return summary;

    summary.hasData = roster.some(({ player }: any) => hasReviveData(player));
    if (!summary.hasData) return summary;

    const keyFor = opts.playerKey || reviveePlayerKey;

    const counts = (key: string) => {
        let entry = summary.players.get(key);
        if (!entry) { entry = emptyCounts(); summary.players.set(key, entry); }
        return entry;
    };

    const utilityTally = (skillId: number, name: string, icon: string | null): ReviveUtilityTally => {
        let utility = summary.utilities.get(skillId);
        if (!utility) {
            utility = { name, icon, casts: 0, revives: 0, byCaster: new Map() };
            summary.utilities.set(skillId, utility);
        }
        return utility;
    };

    const casterTally = (utility: ReviveUtilityTally, casterKey: string) => {
        let entry = utility.byCaster.get(casterKey);
        if (!entry) { entry = { casts: 0, revives: 0 }; utility.byCaster.set(casterKey, entry); }
        return entry;
    };

    const allCasts: ResurrectCast[] = [];
    const allRecoveries: Recovery[] = [];

    for (const { player, index } of roster) {
        const key = keyFor(player);
        counts(key);

        const casts = extractResurrectCasts(player, key, index, details?.skillMap);
        allCasts.push(...casts);

        for (const cast of casts) {
            const entry = counts(key);
            if (cast.kind === 'hand') {
                entry.attempts += 1;
                entry.attemptTimeMs += Math.max(0, cast.end - cast.start);
            } else if (cast.kind === 'utility') {
                entry.utilityCasts += 1;
                const utility = utilityTally(cast.skillId, cast.skillName, cast.skillIcon);
                utility.casts += 1;
                casterTally(utility, key).casts += 1;
            }
        }

        const downCount = Array.isArray(player?.combatReplayData?.down) ? player.combatReplayData.down.length : 0;
        summary.downs += downCount;
        allRecoveries.push(...deriveRecoveries(player, key, index));
    }

    summary.recovered = allRecoveries.length;
    summary.died = summary.downs - summary.recovered;

    for (const recovery of allRecoveries) {
        const attribution = attributeRecovery(recovery, allCasts, opts);
        summary.byKind[attribution.kind] += 1;

        if (attribution.primaryKey) {
            const entry = counts(attribution.primaryKey);
            if (attribution.kind === 'hand') entry.handRevives += 1;
            if (attribution.kind === 'self') entry.selfRevives += 1;
            if (attribution.kind === 'utility') {
                entry.utilityRevives += 1;
                const utility = summary.utilities.get(attribution.skillId!);
                if (utility) {
                    utility.revives += 1;
                    casterTally(utility, attribution.primaryKey).revives += 1;
                }
                if (attribution.skillId === ILLUSION_OF_LIFE_ID) {
                    summary.iolRevives.push({
                        playerKey: recovery.playerKey,
                        playerIndex: recovery.playerIndex,
                        at: recovery.standUpAt,
                    });
                }
            }
        }

        for (const assistKey of attribution.assistKeys) counts(assistKey).assists += 1;
    }

    return summary;
};
