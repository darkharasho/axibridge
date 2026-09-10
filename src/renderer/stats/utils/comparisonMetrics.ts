// src/renderer/stats/utils/comparisonMetrics.ts

export interface ComparisonMetric {
    id: string;
    label: string;
    /** Which *Totals object to read from (offenseTotals, defenseTotals, etc.) */
    totalsKey?: 'offenseTotals' | 'defenseTotals' | 'supportTotals' | 'healingTotals';
    /** The field key inside the totals object */
    field?: string;
    /** If true, lower values are better (deaths, damage taken) */
    lowerIsBetter?: boolean;
    /** If true, display as percentage */
    isPercent?: boolean;
    /** If true, this is a rate field that needs denominator from rateWeights */
    isRate?: boolean;
    /** If true, divide value by activeMs/1000 to get per-second */
    perSecond?: boolean;
    /** If true, divide value by activeMs/60000 to get per-minute */
    perMinute?: boolean;
    /** If true, divide value by logsJoined to get per-fight */
    perFight?: boolean;
    /** Number of decimal places for display */
    decimals?: number;
    /** Direct field on the player row object (not inside a totals sub-object) */
    directField?: string;
    /** Boon metric: boon table ID (e.g., 'b740' for Might) */
    boonId?: string;
    /** Boon metric: which generation category to read */
    boonCategory?: 'selfBuffs' | 'groupBuffs' | 'squadBuffs';
    /** Burst metric: field on SpikeDamagePlayer to read (e.g., 'peak1s') */
    burstField?: string;
}

export type ComparisonCategory = 'offense' | 'defense' | 'support' | 'healing' | 'general';

export const COMPARISON_CATEGORIES: { value: ComparisonCategory; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'offense', label: 'Offense' },
    { value: 'defense', label: 'Defense' },
    { value: 'support', label: 'Support' },
    { value: 'healing', label: 'Healing' },
];

export const COMPARISON_METRICS: Record<ComparisonCategory, ComparisonMetric[]> = {
    general: [
        { id: 'activePercent', label: 'Active %', directField: 'activePercent', isPercent: true, decimals: 1 },
        { id: 'stackPercent', label: 'Stack %', directField: 'stackPercent', isPercent: true, decimals: 1 },
        { id: 'avgDistCmd', label: 'Avg Dist Cmd', directField: 'avgDistCmd', lowerIsBetter: true, decimals: 0 },
    ],
    offense: [
        { id: 'damage', label: 'Damage', totalsKey: 'offenseTotals', field: 'damage' },
        { id: 'dps', label: 'DPS', totalsKey: 'offenseTotals', field: 'damage', perSecond: true, decimals: 0 },
        { id: 'dpm', label: 'Avg DPM', totalsKey: 'offenseTotals', field: 'damage', perMinute: true, decimals: 0 },
        { id: 'burst1s', label: 'Burst 1s', burstField: 'peak1s', decimals: 0 },
        { id: 'burstAvg', label: 'Burst Avg', burstField: 'burstAvg', decimals: 0 },
        { id: 'downContribution', label: 'Down Contribution', totalsKey: 'offenseTotals', field: 'downContribution' },
        { id: 'downed', label: 'Downs', totalsKey: 'offenseTotals', field: 'downed' },
        { id: 'killed', label: 'Kills', totalsKey: 'offenseTotals', field: 'killed' },
        { id: 'criticalRate', label: 'Critical Rate', totalsKey: 'offenseTotals', field: 'criticalRate', isRate: true, isPercent: true, decimals: 1 },
        { id: 'boonStrips', label: 'Boon Strips', totalsKey: 'offenseTotals', field: 'boonStrips' },
    ],
    defense: [
        { id: 'damageTaken', label: 'Damage Taken', totalsKey: 'defenseTotals', field: 'damageTaken', lowerIsBetter: true },
        { id: 'deathsPerFight', label: 'Deaths/Fight', totalsKey: 'defenseTotals', field: 'deadCount', perFight: true, lowerIsBetter: true, decimals: 2 },
        { id: 'downsPerFight', label: 'Downs/Fight', totalsKey: 'defenseTotals', field: 'downCount', perFight: true, lowerIsBetter: true, decimals: 2 },
        { id: 'dodgesPerMin', label: 'Dodges/min', totalsKey: 'defenseTotals', field: 'dodgeCount', perMinute: true, decimals: 1 },
        { id: 'downCount', label: 'Down Count', totalsKey: 'defenseTotals', field: 'downCount', lowerIsBetter: true },
        { id: 'deadCount', label: 'Death Count', totalsKey: 'defenseTotals', field: 'deadCount', lowerIsBetter: true },
        { id: 'dodgeCount', label: 'Dodge Count', totalsKey: 'defenseTotals', field: 'dodgeCount' },
        { id: 'blockedCount', label: 'Blocked Count', totalsKey: 'defenseTotals', field: 'blockedCount' },
        { id: 'evadedCount', label: 'Evaded Count', totalsKey: 'defenseTotals', field: 'evadedCount' },
    ],
    support: [
        { id: 'condiCleanse', label: 'Condition Cleanses', totalsKey: 'supportTotals', field: 'condiCleanse' },
        { id: 'cleansesPerMin', label: 'Cleanses/min', totalsKey: 'supportTotals', field: 'condiCleanse', perMinute: true, decimals: 1 },
        { id: 'boonStrips', label: 'Boon Strips', totalsKey: 'supportTotals', field: 'boonStrips' },
        { id: 'stripsPerMin', label: 'Strips/min', totalsKey: 'supportTotals', field: 'boonStrips', perMinute: true, decimals: 1 },
        { id: 'stunBreak', label: 'Stun Breaks', totalsKey: 'supportTotals', field: 'stunBreak' },
        { id: 'resurrects', label: 'Resurrect Attempts', totalsKey: 'supportTotals', field: 'resurrects' },
        // Stability generation
        { id: 'stabSquad', label: 'Stab (Squad)', boonId: 'b1122', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'stabGroup', label: 'Stab (Group)', boonId: 'b1122', boonCategory: 'groupBuffs', decimals: 1 },
        { id: 'stabSelf', label: 'Stab (Self)', boonId: 'b1122', boonCategory: 'selfBuffs', decimals: 1 },
        // Combat boons
        { id: 'might', label: 'Might', boonId: 'b740', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'fury', label: 'Fury', boonId: 'b725', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'quickness', label: 'Quickness', boonId: 'b1187', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'alacrity', label: 'Alacrity', boonId: 'b30328', boonCategory: 'squadBuffs', decimals: 1 },
        // Defense boons
        { id: 'protection', label: 'Protection', boonId: 'b717', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'resistance', label: 'Resistance', boonId: 'b26980', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'vigor', label: 'Vigor', boonId: 'b726', boonCategory: 'squadBuffs', decimals: 1 },
        // Utility boons
        { id: 'aegis', label: 'Aegis', boonId: 'b743', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'regen', label: 'Regen', boonId: 'b718', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'swiftness', label: 'Swiftness', boonId: 'b719', boonCategory: 'squadBuffs', decimals: 1 },
        { id: 'resolution', label: 'Resolution', boonId: 'b873', boonCategory: 'squadBuffs', decimals: 1 },
    ],
    healing: [
        { id: 'healing', label: 'Healing', totalsKey: 'healingTotals', field: 'healing' },
        { id: 'healingPerSecond', label: 'HPS', totalsKey: 'healingTotals', field: 'healing', perSecond: true, decimals: 1 },
        { id: 'barrier', label: 'Barrier', totalsKey: 'healingTotals', field: 'barrier' },
        { id: 'barrierPerSecond', label: 'Barrier/s', totalsKey: 'healingTotals', field: 'barrier', perSecond: true, decimals: 1 },
        { id: 'downedHealing', label: 'Downed Healing', totalsKey: 'healingTotals', field: 'downedHealing' },
    ],
};

export interface ComparisonContext {
    boonTables?: any[];
    spikePlayers?: any[];
}

/**
 * Extract a metric value from a player row object.
 * Player rows have shape: { account, profession, professionList, offenseTotals, offenseRateWeights, totalFightMs, ... }
 */
export function getMetricValue(player: any, metric: ComparisonMetric, context?: ComparisonContext): number {
    // Boon metrics: look up from boonTables
    if (metric.boonId && metric.boonCategory) {
        return getBoonMetricValue(player, metric, context?.boonTables);
    }

    // Burst metrics: cross-reference spikeDamage players
    if (metric.burstField) {
        return getBurstMetricValue(player, metric, context?.spikePlayers);
    }

    // Direct field on player row (not inside totals)
    if (metric.directField) {
        return computeDirectField(player, metric);
    }

    const totals = player[metric.totalsKey!];
    if (!totals) return 0;

    let value: number;

    if (metric.isRate) {
        const weightsKey = metric.totalsKey!.replace('Totals', 'RateWeights');
        const denom = player[weightsKey]?.[metric.field!] || 0;
        const numer = totals[metric.field!] || 0;
        value = denom > 0 ? (numer / denom) * 100 : 0;
    } else {
        value = totals[metric.field!] || 0;
    }

    if (metric.perSecond) {
        const ms = player.totalFightMs || player.activeMs || 0;
        const seconds = Math.max(1, ms / 1000);
        value = value / seconds;
    }

    if (metric.perMinute) {
        const ms = player.totalFightMs || player.activeMs || 0;
        const minutes = Math.max(1 / 60, ms / 60000);
        value = value / minutes;
    }

    if (metric.perFight) {
        const logs = player.logsJoined || 1;
        value = value / logs;
    }

    return value;
}

function computeDirectField(player: any, metric: ComparisonMetric): number {
    switch (metric.directField) {
        case 'activePercent': {
            const squad = player.squadActiveMs || 0;
            const total = player.totalFightMs || 0;
            return total > 0 ? (squad / total) * 100 : 0;
        }
        case 'stackPercent': {
            const stacked = player.stackedLogCount || 0;
            const logs = player.logsJoined || 0;
            return logs > 0 ? (stacked / logs) * 100 : 0;
        }
        case 'avgDistCmd': {
            const dist = player.totalDist || 0;
            const count = player.distCount || 0;
            return count > 0 ? dist / count : 0;
        }
        default:
            return player[metric.directField!] || 0;
    }
}

function getBoonMetricValue(player: any, metric: ComparisonMetric, boonTables?: any[]): number {
    if (!boonTables) return 0;
    const table = boonTables.find((t: any) => t.id === metric.boonId);
    if (!table) return 0;
    const row = (table.rows || []).find((r: any) => r.account === player.account);
    if (!row) return 0;
    const categoryData = row.categories?.[metric.boonCategory!];
    if (!categoryData) return 0;
    const activeTimeMs = row.activeTimeMs || 1;
    // seconds per minute of generation
    const generationMs = categoryData.generationMs || 0;
    const activeMinutes = activeTimeMs / 60000;
    return activeMinutes > 0 ? (generationMs / 1000) / activeMinutes : 0;
}

function getBurstMetricValue(player: any, metric: ComparisonMetric, spikePlayers?: any[]): number {
    if (!spikePlayers) return 0;
    const spikePlayer = spikePlayers.find((sp: any) => sp.account === player.account);
    if (!spikePlayer) return 0;
    if (metric.burstField === 'burstAvg') {
        // Average burst: SpikeDamagePlayer only stores peaks, not sums
        // Use peak1s as the best available single-value approximation
        return spikePlayer.peak1s || 0;
    }
    return spikePlayer[metric.burstField!] || 0;
}

/**
 * Given a category, return the stats array key to read from.
 */
export function getPlayersArrayKey(category: ComparisonCategory): string {
    switch (category) {
        case 'general': return 'generalPlayers';
        case 'offense': return 'offensePlayers';
        case 'defense': return 'defensePlayers';
        case 'support': return 'supportPlayers';
        case 'healing': return 'healingPlayers';
    }
}
