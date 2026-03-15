import { Player } from './dpsReportTypes';
import { getPlayerBoonGenerationMs } from './boonGeneration';
import { DisruptionMethod, METRICS_SPEC, DEFAULT_DISRUPTION_METHOD } from './metricsSettings';
import { STABILITY_BOON_ID } from './constants';

const toSeconds = (ms: number) => (ms || 0) / 1000;

const applyTierWeight = (count: number, durationMs: number) => {
    if (!count) return 0;
    const tiers = METRICS_SPEC.methods.tiered?.tiers;
    if (!tiers) return count;
    const avg = durationMs / Math.max(count, 1);
    if (avg <= tiers.shortMs) return count * tiers.weights.short;
    if (avg <= tiers.mediumMs) return count * tiers.weights.medium;
    return count * tiers.weights.long;
};

export const resolveDisruptionValue = (count: number, durationMs: number, method: DisruptionMethod) => {
    if (method === 'duration') return toSeconds(durationMs);
    if (method === 'tiered') return applyTierWeight(count, durationMs);
    return count;
};

export function computeOutgoingCrowdControl(player: Player, method: DisruptionMethod = DEFAULT_DISRUPTION_METHOD): number {
    const stats = player.statsAll?.[0] as any;
    const count = Number(stats?.appliedCrowdControl ?? 0);
    const durationMs = Number(stats?.appliedCrowdControlDuration ?? 0);

    return resolveDisruptionValue(count, durationMs, method);
}

export function computeIncomingDisruptions(
    player: Player,
    method: DisruptionMethod = DEFAULT_DISRUPTION_METHOD,
): { strips: { total: number; missed: number; blocked: number }; cc: { total: number; missed: number; blocked: number } } {
    const defenses = player.defenses?.[0] as any;

    const incomingCcCount = Number(defenses?.receivedCrowdControl ?? 0);
    const incomingCcDurationMs = Number(defenses?.receivedCrowdControlDuration ?? 0);
    const incomingStripCount = Number(defenses?.boonStrips ?? 0);
    const incomingStripDurationMs = Number(defenses?.boonStripsTime ?? 0);

    const resolveValue = (count: number, durationMs: number) => resolveDisruptionValue(count, durationMs, method);

    return {
        strips: {
            total: resolveValue(incomingStripCount, incomingStripDurationMs),
            missed: 0,
            blocked: 0,
        },
        cc: {
            total: resolveValue(incomingCcCount, incomingCcDurationMs),
            missed: 0,
            blocked: 0,
        }
    };
}

// Global pass function
export function applySquadStabilityGeneration(
    players: Player[],
    context?: { durationMS?: number; buffMap?: Record<string, any> }
) {
    const durationMs = context?.durationMS || 0;
    const buffMap = context?.buffMap || {};
    const squadPlayers = players.filter((p) => !p.notInSquad);
    const squadCount = squadPlayers.length;
    const groupCounts = new Map<number, number>();

    squadPlayers.forEach((player) => {
        const group = player.group ?? 0;
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    });

    squadPlayers.forEach((player) => {
        const groupCount = groupCounts.get(player.group ?? 0) || 1;
        const self = getPlayerBoonGenerationMs(
            player,
            'selfBuffs',
            STABILITY_BOON_ID,
            durationMs,
            groupCount,
            squadCount,
            buffMap,
        );
        const squad = getPlayerBoonGenerationMs(
            player,
            'squadBuffs',
            STABILITY_BOON_ID,
            durationMs,
            groupCount,
            squadCount,
            buffMap,
        );
        player.stabGeneration = (self.generationMs + squad.generationMs) / 1000;
    });
}

export function computeDownContribution(player: Player): number {
    // Try statsTargets first (works when EI creates per-player targets)
    let total = 0;
    if (player.statsTargets) {
        for (const targetStats of player.statsTargets) {
            if (targetStats && targetStats.length > 0) {
                total += (targetStats[0] as any).downContribution || 0;
            }
        }
    }
    if (total > 0) return total;

    // Fallback to totalDamageDist (required when EI uses aggregate "Enemy Players" target,
    // which zeroes out statsTargets.downContribution)
    if (player.totalDamageDist) {
        for (const targetList of player.totalDamageDist) {
            if (targetList) {
                for (const entry of targetList) {
                    total += entry.downContribution || 0;
                }
            }
        }
    }
    return total;
}

export function computeSquadBarrier(player: Player): number {
    if (!player.extBarrierStats || !player.extBarrierStats.outgoingBarrierAllies) return 0;

    let total = 0;
    for (const squadMember of player.extBarrierStats.outgoingBarrierAllies) {
        if (!squadMember) continue;
        for (const phaseData of squadMember) {
            if (phaseData) {
                total += (phaseData as any).barrier || 0;
            }
        }
    }
    return total;
}

export function computeSquadHealing(player: Player): number {
    if (!player.extHealingStats || !player.extHealingStats.outgoingHealingAllies) return 0;

    let total = 0;
    for (const squadMember of player.extHealingStats.outgoingHealingAllies) {
        if (!squadMember) continue;
        for (const phaseData of squadMember) {
            if (phaseData) {
                total += (phaseData as any).healing || 0;
            }
        }
    }
    return total;
}
