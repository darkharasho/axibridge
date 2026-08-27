import { Player } from './dpsReportTypes';
import { computeDownContribution, computeOutgoingCrowdControl, computeSquadBarrier, computeSquadHealing, resolveDisruptionValue } from './combatMetrics';
import { DisruptionMethod, DEFAULT_DISRUPTION_METHOD } from './metricsSettings';
import { buildNativeDistanceLookup } from './nativePositioning';

export const getPlayerDamage = (player: Player) =>
    player.dpsAll?.[0]?.damage || 0;

export const getPlayerDps = (player: Player) =>
    player.dpsAll?.[0]?.dps || 0;

export const getPlayerCleanses = (player: Player) =>
    (player.support?.[0]?.condiCleanse || 0) + (player.support?.[0]?.condiCleanseSelf || 0);

// `condiCleanseMinions` is an axilog extension, NOT an Elite Insights field: EI's
// ConditionCleanseCount loops `foreach (Player p in log.PlayerList)`, so a condition
// cleansed off a ranger pet, necro minion, mesmer clone or revenant spirit is counted
// zero times. The in-game arcdps meter folds pets into their master and does count
// them, which is the whole reason arcdps reads ~3-4% higher than we do for the same
// fight. Only logs parsed locally by the axilog backend carry it — logs parsed by
// Elite Insights, hydrated from dps.report, or aggregated before this field existed
// do not — so callers MUST test availability rather than reading a missing key as 0.
export const hasMinionCleanseData = (player: Player): boolean =>
    player.support?.[0] != null && 'condiCleanseMinions' in (player.support[0] as any);

// True when the log carries axilog's arcdps-methodology cleanse counters, which are
// a transcription of the in-game meter's own counting code rather than an adjustment
// applied on top of EI's. Prefer this over `hasMinionCleanseData`: the minion field
// only ever patched the population EI missed, while this family also reproduces the
// exclusions EI has no notion of (single-stack stability, self-consumed blind, and
// the self-removal burst that going down produces).
export const hasArcdpsCleanseData = (player: Player): boolean =>
    player.support?.[0] != null && 'condiCleanseArcdps' in (player.support[0] as any);

// Matches what the in-game arcdps meter reports, in three tiers of fidelity:
//
//  1. axilog's arcdps-methodology counters, when present. Base bucket plus the
//     "vs npcs" bucket — cleanses performed ON a minion. That combination is what
//     the field reports we calibrated against actually showed; the meter's own
//     default window inclusions decide this, so it is an empirical match rather
//     than a derived one. The "from npcs" bucket is deliberately NOT added: it
//     needs the other toggle, and adding both would double-count neither but
//     over-report against the windows users described.
//  2. Otherwise EI parity plus `condiCleanseMinions`, the older approximation.
//     Right population, wrong exclusions — reads a few percent high.
//  3. Otherwise plain EI parity.
//
// Always safe to call, but a caller choosing to SHOW it as "arcdps" should gate on
// `hasArcdpsCleanseData` / `hasMinionCleanseData` first, or it will silently present
// an EI number under an arcdps label.
export const getPlayerCleansesArcdps = (player: Player): number => {
    const support = player.support?.[0] as any;
    if (support != null && 'condiCleanseArcdps' in support) {
        return (support.condiCleanseArcdps || 0) + (support.condiCleanseArcdpsOnMinion || 0);
    }
    return getPlayerCleanses(player) + (support?.condiCleanseMinions || 0);
};

export const getPlayerStrips = (player: Player, method: DisruptionMethod = DEFAULT_DISRUPTION_METHOD) => {
    const support = player.support?.[0] as any;
    const count = Number(support?.boonStrips ?? 0);
    const durationMs = Number(support?.boonStripsTime ?? 0);
    return resolveDisruptionValue(count, durationMs, method);
};

export const getPlayerResurrects = (player: Player) =>
    player.support?.[0]?.resurrects || 0;

// EI emits `statsAll[0].distToCom` (distance to commander) with a sentinel when the
// squad has no commander: older EI used the string "Infinity", EI v3.24 switched to
// the number -1. Either must be treated as "no commander distance" so callers fall
// back to `stackDist`. A real commander distance is a finite number >= 0 (the
// commander's own distToCom is a legitimate 0).
export const resolveCommanderDistance = (distToCom: unknown): number | null => {
    if (typeof distToCom !== 'number') return null; // undefined / null / "Infinity"
    if (!Number.isFinite(distToCom) || distToCom < 0) return null; // -1 sentinel / Infinity
    return distToCom;
};

export const getPlayerDistanceToTag = (player: Player) => {
    const stats = player.statsAll?.[0];
    const distToCom = resolveCommanderDistance(stats?.distToCom);
    if (distToCom !== null) {
        return distToCom;
    }
    return stats?.stackDist || 0;
};

/**
 * Distance to tag for one fight, resolving BOTH parse shapes.
 *
 * `getPlayerDistanceToTag` reads only `statsAll`, which a native (axilog) parse
 * never populates — its scalars live on `native.blocks.replay.by_entity`. Any
 * caller holding the fight `details` should use this instead, or it prints 0
 * for the whole squad on native logs (the Discord embed and the per-log card
 * both did). Returns `null` when neither source knows the distance, so callers
 * can tell "unknown" from a genuine 0 (a commander's own distance).
 */
export const createDistanceToTagResolver = (details: any) => {
    const nativeLookup = buildNativeDistanceLookup(details);
    return (player: Player): number | null => {
        const stats = player?.statsAll?.[0] as any;
        const commanderDist = resolveCommanderDistance(stats?.distToCom);
        if (commanderDist !== null) return Math.round(commanderDist);
        if (stats?.stackDist !== undefined) return Math.round(Number(stats.stackDist)) || 0;
        const native = nativeLookup(player as any);
        return native === null ? null : Math.round(native);
    };
};

export const getPlayerBreakbarDamage = (player: Player) =>
    player.dpsAll?.[0]?.breakbarDamage || 0;

export const getPlayerDamageTaken = (player: Player) =>
    player.defenses?.[0]?.damageTaken || 0;

export const getPlayerDeaths = (player: Player) =>
    player.defenses?.[0]?.deadCount || 0;

// Vindicator's dodge is the "Death Drop" skill (id 62730). Its endurance cost
// varies by trait (100 for Forerunner of Death, 50 for Saint of zu Heltzer), but
// each cast is exactly one dodge either way. Elite Insights does not tally Death
// Drop in defenses.dodgeCount (it stays 0 for Vindicators), so we recover the
// count 1:1 from the cast rotation.
export const VINDICATOR_DODGE_SKILL_ID = 62730;

export const getVindicatorDodgeCasts = (player: Player): number => {
    const rot = player.rotation?.find((r) => r.id === VINDICATOR_DODGE_SKILL_ID);
    return rot?.skills?.length || 0;
};

export const getPlayerDodges = (player: Player) =>
    (player.defenses?.[0]?.dodgeCount || 0) + getVindicatorDodgeCasts(player);

export const getPlayerMissed = (player: Player) =>
    player.defenses?.[0]?.missedCount || 0;

export const getPlayerBlocked = (player: Player) =>
    player.defenses?.[0]?.blockedCount || 0;

export const getPlayerEvaded = (player: Player) =>
    player.defenses?.[0]?.evadedCount || 0;

export const getPlayerDownsTaken = (player: Player) =>
    player.defenses?.[0]?.downCount || 0;

export const getTargetStatTotal = (player: Player, field: 'killed' | 'downed' | 'againstDownedCount' | 'interrupts') => {
    let total = 0;
    const statsTargets = player.statsTargets || [];
    for (const targetStats of statsTargets) {
        if (targetStats && targetStats.length > 0) {
            total += Number((targetStats[0] as any)[field] || 0);
        }
    }
    return total;
};

export const getPlayerOutgoingInterrupts = (player: Player): number =>
    getTargetStatTotal(player, 'interrupts');

export const getPlayerDashboardTotals = (player: Player, method: DisruptionMethod = DEFAULT_DISRUPTION_METHOD) => ({
    downContrib: computeDownContribution(player),
    cleanses: getPlayerCleansesArcdps(player),
    strips: getPlayerStrips(player, method),
    healing: computeSquadHealing(player),
    barrier: computeSquadBarrier(player),
    cc: computeOutgoingCrowdControl(player, method),
});

