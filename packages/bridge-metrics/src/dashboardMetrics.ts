import { Player } from './dpsReportTypes';
import { computeDownContribution, computeOutgoingCrowdControl, computeSquadBarrier, computeSquadHealing, resolveDisruptionValue } from './combatMetrics';
import { DisruptionMethod, DEFAULT_DISRUPTION_METHOD } from './metricsSettings';

export const getPlayerDamage = (player: Player) =>
    player.dpsAll?.[0]?.damage || 0;

export const getPlayerDps = (player: Player) =>
    player.dpsAll?.[0]?.dps || 0;

export const getPlayerCleanses = (player: Player) =>
    (player.support?.[0]?.condiCleanse || 0) + (player.support?.[0]?.condiCleanseSelf || 0);

export const getPlayerStrips = (player: Player, method: DisruptionMethod = DEFAULT_DISRUPTION_METHOD) => {
    const support = player.support?.[0] as any;
    const count = Number(support?.boonStrips ?? 0);
    const durationMs = Number(support?.boonStripsTime ?? 0);
    return resolveDisruptionValue(count, durationMs, method);
};

export const getPlayerResurrects = (player: Player) =>
    player.support?.[0]?.resurrects || 0;

export const getPlayerDistanceToTag = (player: Player) => {
    const stats = player.statsAll?.[0];
    const distToCom = stats?.distToCom;
    if (distToCom !== undefined && distToCom !== null) {
        return distToCom;
    }
    return stats?.stackDist || 0;
};

export const getPlayerBreakbarDamage = (player: Player) =>
    player.dpsAll?.[0]?.breakbarDamage || 0;

export const getPlayerDamageTaken = (player: Player) =>
    player.defenses?.[0]?.damageTaken || 0;

export const getPlayerDeaths = (player: Player) =>
    player.defenses?.[0]?.deadCount || 0;

export const getPlayerDodges = (player: Player) =>
    player.defenses?.[0]?.dodgeCount || 0;

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
    cleanses: getPlayerCleanses(player),
    strips: getPlayerStrips(player, method),
    healing: computeSquadHealing(player),
    barrier: computeSquadBarrier(player),
    cc: computeOutgoingCrowdControl(player, method),
});

