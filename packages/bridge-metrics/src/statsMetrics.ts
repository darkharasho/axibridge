export { NON_DAMAGING_CONDITIONS } from './conditionsMetrics';

export const OFFENSE_METRICS: Array<{
    id: string;
    label: string;
    field?: string;
    isRate?: boolean;
    isPercent?: boolean;
    weightField?: string;
    denomField?: string;
    source?: 'statsTargets' | 'dpsTargets' | 'statsAll' | 'dpsAll' | 'support';
}> = [
        { id: 'damage', label: 'Damage', field: 'damage', source: 'dpsAll' },
        { id: 'directDmg', label: 'Direct Damage', field: 'directDmg', source: 'statsTargets' },
        { id: 'connectedDamageCount', label: 'Connected Damage Count', field: 'connectedDamageCount', source: 'statsTargets' },
        { id: 'connectedDirectDamageCount', label: 'Connected Direct Damage Count', field: 'connectedDirectDamageCount', source: 'statsTargets' },
        { id: 'battleStandardHits', label: 'Battle Standard Tracking' },
        { id: 'criticalRate', label: 'Critical Rate', field: 'criticalRate', isRate: true, isPercent: true, denomField: 'critableDirectDamageCount', source: 'statsTargets' },
        { id: 'criticalDmg', label: 'Critical Damage', field: 'criticalDmg', source: 'statsTargets' },
        { id: 'flankingRate', label: 'Flanking Rate', field: 'flankingRate', isRate: true, isPercent: true, denomField: 'connectedDirectDamageCount', source: 'statsTargets' },
        { id: 'glanceRate', label: 'Glance Rate', field: 'glanceRate', isRate: true, isPercent: true, denomField: 'connectedDirectDamageCount', source: 'statsTargets' },
        { id: 'missed', label: 'Missed', field: 'missed', source: 'statsTargets' },
        { id: 'evaded', label: 'Evaded (enemy)', field: 'evaded', source: 'statsTargets' },
        { id: 'blocked', label: 'Blocked (enemy)', field: 'blocked', source: 'statsTargets' },
        { id: 'interrupts', label: 'Interrupts', field: 'interrupts', source: 'statsTargets' },
        { id: 'invulned', label: 'Invulned', field: 'invulned', source: 'statsTargets' },
        { id: 'killed', label: 'Killed', field: 'killed', source: 'statsTargets' },
        { id: 'downed', label: 'Downed', field: 'downed', source: 'statsTargets' },
        { id: 'downContribution', label: 'Down Contribution', field: 'downContribution', source: 'statsTargets' },
        { id: 'downContributionPercent', label: 'Down Contribution %', isRate: true, isPercent: true },
        { id: 'againstDownedDamage', label: 'Against Downed Damage', field: 'againstDownedDamage', source: 'statsTargets' },
        { id: 'appliedCrowdControl', label: 'Applied CC', field: 'appliedCrowdControl', source: 'statsTargets' },
        { id: 'appliedCrowdControlDuration', label: 'Applied CC Duration', field: 'appliedCrowdControlDuration', source: 'statsTargets' },
        { id: 'appliedCrowdControlDownContribution', label: 'Applied CC Down Contribution', field: 'appliedCrowdControlDownContribution', source: 'statsTargets' },
        { id: 'appliedCrowdControlDurationDownContribution', label: 'Applied CC Duration Down Contribution', field: 'appliedCrowdControlDurationDownContribution', source: 'statsTargets' },
        { id: 'boonStrips', label: 'Boon Strips', field: 'boonStrips', source: 'support' }
    ];

export const DEFENSE_METRICS: Array<{
    id: string;
    label: string;
    field?: string;
    isTimeMs?: boolean;
}> = [
        { id: 'damageTaken', label: 'Damage Taken', field: 'damageTaken' },
        { id: 'minionDamageTaken', label: 'Minion Damage Taken' },
        { id: 'damageTakenCount', label: 'Damage Taken Count', field: 'damageTakenCount' },
        { id: 'conditionDamageTaken', label: 'Condition Damage Taken', field: 'conditionDamageTaken' },
        { id: 'conditionDamageTakenCount', label: 'Condition Damage Taken Count', field: 'conditionDamageTakenCount' },
        { id: 'powerDamageTaken', label: 'Power Damage Taken', field: 'powerDamageTaken' },
        { id: 'powerDamageTakenCount', label: 'Power Damage Taken Count', field: 'powerDamageTakenCount' },
        { id: 'downedDamageTaken', label: 'Downed Damage Taken', field: 'downedDamageTaken' },
        { id: 'downedDamageTakenCount', label: 'Downed Damage Taken Count', field: 'downedDamageTakenCount' },
        { id: 'damageBarrier', label: 'Damage Barrier', field: 'damageBarrier' },
        { id: 'damageBarrierCount', label: 'Damage Barrier Count', field: 'damageBarrierCount' },
        { id: 'blockedCount', label: 'Blocked Count', field: 'blockedCount' },
        { id: 'evadedCount', label: 'Evaded Count', field: 'evadedCount' },
        { id: 'missedCount', label: 'Missed Count', field: 'missedCount' },
        { id: 'dodgeCount', label: 'Dodge Count', field: 'dodgeCount' },
        { id: 'invulnedCount', label: 'Invulnerable Count', field: 'invulnedCount' },
        { id: 'interruptedCount', label: 'Interrupted Count', field: 'interruptedCount' },
        { id: 'downCount', label: 'Down Count', field: 'downCount' },
        { id: 'deadCount', label: 'Death Count', field: 'deadCount' },
        { id: 'boonStrips', label: 'Boon Strips (Incoming)', field: 'boonStrips' },
        { id: 'conditionCleanses', label: 'Cleanses (Incoming)', field: 'conditionCleanses' },
        { id: 'receivedCrowdControl', label: 'Crowd Control (Incoming)', field: 'receivedCrowdControl' }
    ];

export const DAMAGE_MITIGATION_METRICS: Array<{
    id: string;
    label: string;
}> = [
        { id: 'totalHits', label: 'Total Hits' },
        { id: 'evaded', label: 'Evaded' },
        { id: 'blocked', label: 'Blocked' },
        { id: 'glanced', label: 'Glanced' },
        { id: 'missed', label: 'Missed' },
        { id: 'invulned', label: 'Invulned' },
        { id: 'interrupted', label: 'Interrupted' },
        { id: 'totalMitigation', label: 'Damage Mitigation' },
        { id: 'minMitigation', label: 'Min Damage Mitigation' }
    ];

/**
 * Which population a displayed cleanse count covers.
 *
 * - `squad`  — conditions removed from OTHER squad members only.
 * - `all`    — the above plus self-cleanses. This is Elite Insights parity:
 *              `condiCleanse + condiCleanseSelf` is exactly what dps.report
 *              and every other GW2EI-derived tool reports.
 * - `arcdps` — what the in-game arcdps meter shows. NOT an adjustment layered
 *              on top of EI: axilog counts this with a transcription of the
 *              meter's own source, which drops single-stack stability removals
 *              and self-consumed blinds, subtracts the self-removal burst that
 *              going down produces, and folds pets into their master. EI's
 *              count is `log.PlayerList`-scoped and misses the pet population
 *              entirely, which is the ~3-4% gap.
 *
 *              Older logs answer this the legacy way — EI parity plus
 *              `condiCleanseMinions` — which gets the population right but not
 *              the exclusions, so it reads a few percent high. Both paths are
 *              gated on {@link hasMinionCleanseData}.
 */
export type CleanseScope = 'arcdps' | 'all' | 'squad';

/** Cleanse total for one aggregation row under the given {@link CleanseScope}. */
export const resolveCleanseTotal = (row: any, scope: CleanseScope): number => {
    const totals = row?.supportTotals;
    const squad = totals?.condiCleanse || 0;
    if (scope === 'squad') return squad;
    const all = squad + (totals?.condiCleanseSelf || 0);
    if (scope === 'all') return all;
    // Prefer axilog's arcdps-methodology counters. Base bucket plus the "vs
    // npcs" bucket — see `getPlayerCleansesArcdps` for why that pairing and
    // not the other toggle. Fall back to the legacy minion approximation for
    // rows aggregated before those counters existed.
    if ((totals?.condiCleanseArcdpsLogs || 0) > 0) {
        return (totals?.condiCleanseArcdps || 0) + (totals?.condiCleanseArcdpsOnMinion || 0);
    }
    return all + (totals?.condiCleanseMinions || 0);
};

/**
 * Whether the `arcdps` scope can be answered for these rows at all.
 *
 * `condiCleanseMinions` only exists on logs parsed locally by the axilog
 * backend. Elite-Insights-parsed logs, dps.report-hydrated details, and
 * reports published before the field existed all lack it — and a missing key
 * reads as 0, which would silently render an EI number under an arcdps label.
 * Gate the toggle on this.
 */
export const hasMinionCleanseData = (rows: Array<any> | undefined): boolean =>
    (rows ?? []).some(r =>
        (r?.supportTotals?.condiCleanseArcdpsLogs || 0) > 0
        || (r?.supportTotals?.condiCleanseMinionsLogs || 0) > 0);

/**
 * True when the rows answer the arcdps scope with axilog's transcription of the
 * meter's own counting code, rather than the legacy EI-plus-minions
 * approximation. The legacy path is still shown as "arcdps" because it is much
 * closer than EI parity, but it does not apply arcdps' exclusions and reads a
 * few percent high — worth saying so in a tooltip.
 */
export const hasArcdpsMethodologyData = (rows: Array<any> | undefined): boolean =>
    (rows ?? []).some(r => (r?.supportTotals?.condiCleanseArcdpsLogs || 0) > 0);

/**
 * True when only SOME of the aggregated logs carried minion data (a mixed
 * axilog / Elite-Insights history). The arcdps total is then a floor, not an
 * exact match for the in-game meter, and the UI should say so.
 */
export const hasPartialMinionCleanseData = (rows: Array<any> | undefined): boolean =>
    (rows ?? []).some(r => {
        const withData = (r?.supportTotals?.condiCleanseArcdpsLogs || 0)
            || (r?.supportTotals?.condiCleanseMinionsLogs || 0);
        return withData > 0 && withData < (r?.logsJoined || 0);
    });

export const SUPPORT_METRICS: Array<{
    id: string;
    label: string;
    field: string;
    isTime?: boolean;
}> = [
        { id: 'condiCleanse', label: 'Condition Cleanses', field: 'condiCleanse' },
        { id: 'condiCleanseTime', label: 'Condition Cleanse Time', field: 'condiCleanseTime', isTime: true },
        { id: 'condiCleanseSelf', label: 'Condition Cleanse Self', field: 'condiCleanseSelf' },
        { id: 'condiCleanseMinions', label: 'Condition Cleanse (Minions)', field: 'condiCleanseMinions' },
        { id: 'condiCleanseTimeSelf', label: 'Condition Cleanse Time Self', field: 'condiCleanseTimeSelf', isTime: true },
        { id: 'boonStrips', label: 'Boon Strips', field: 'boonStrips' },
        { id: 'boonStripsTime', label: 'Boon Strips Time', field: 'boonStripsTime', isTime: true },
        { id: 'boonStripDownContribution', label: 'Boon Strip Down Contribution', field: 'boonStripDownContribution' },
        { id: 'boonStripDownContributionTime', label: 'Boon Strip Down Contribution Time', field: 'boonStripDownContributionTime', isTime: true },
        { id: 'stunBreak', label: 'Stun Breaks', field: 'stunBreak' },
        { id: 'removedStunDuration', label: 'Removed Stun Duration', field: 'removedStunDuration', isTime: true },
        { id: 'resurrects', label: 'Resurrects', field: 'resurrects' },
        { id: 'resurrectTime', label: 'Resurrect Time', field: 'resurrectTime', isTime: true }
    ];

export const HEALING_METRICS: Array<{
    id: string;
    label: string;
    baseField: 'healing' | 'barrier' | 'downedHealing' | 'resUtility';
    perSecond: boolean;
    decimals: number;
}> = [
        { id: 'healing', label: 'Healing', baseField: 'healing', perSecond: false, decimals: 0 },
        { id: 'healingPerSecond', label: 'Healing Per Second', baseField: 'healing', perSecond: true, decimals: 2 },
        { id: 'barrier', label: 'Barrier', baseField: 'barrier', perSecond: false, decimals: 0 },
        { id: 'barrierPerSecond', label: 'Barrier Per Second', baseField: 'barrier', perSecond: true, decimals: 2 },
        { id: 'downedHealing', label: 'Downed Healing', baseField: 'downedHealing', perSecond: false, decimals: 0 },
        { id: 'downedHealingPerSecond', label: 'Downed Healing Per Second', baseField: 'downedHealing', perSecond: true, decimals: 1 },
        { id: 'resUtility', label: 'Resurrect Utility', baseField: 'resUtility', perSecond: false, decimals: 0 }
    ];

export const RES_UTILITY_NAME_MATCHES = [
    'battle standard',
    'glyph of renewal',
    'glyph of the stars',
    'illusion of life',
    'spirit of nature',
    'nature spirit',
    'search and rescue',
    'signet of mercy'
];

export const RES_UTILITY_IDS = new Set<number>([10244]);
