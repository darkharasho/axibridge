import {
    createPlayerAggregationAccumulators,
    precomputeGlobalEnemySkillStats,
    ingestLogPlayerData,
    finalizePlayerAggregation,
} from '@axiapps/bridge-metrics';

/**
 * Per-account damage-mitigation totals for a single fight, computed by the
 * same bridge-metrics pipeline the stats dashboard uses (window = this one
 * log). Player scope only, matching the dashboard's default view.
 * Options mirror the dashboard defaults (method 'count', skill damage
 * source 'target', no class split).
 */
export function buildFightMitigationByAccount(jsonDetails: any): Map<string, number> {
    const result = new Map<string, number>();
    if (!jsonDetails) return result;
    const acc = createPlayerAggregationAccumulators();
    const log = { details: jsonDetails };
    precomputeGlobalEnemySkillStats(log, acc);
    ingestLogPlayerData(log, acc, { method: 'count', skillDamageSource: 'target', splitPlayersByClass: false });
    finalizePlayerAggregation(acc);
    for (const row of acc.damageMitigationPlayersMap.values()) {
        const total = row?.mitigationTotals?.totalMitigation ?? 0;
        if (total > 0) result.set(row.account || row.name, total);
    }
    return result;
}
