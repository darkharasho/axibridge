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

/**
 * `OFFENSE_METRICS` ids that may be sourced from the whole-fight `statsAll[0]`
 * when their per-target `statsTargets` origin carries nothing.
 *
 * **Why.** Elite Insights folds the whole enemy roster into one aggregate
 * `"Enemy Players"` target, so for EI "summed over every target" and
 * "whole fight" are the *same number* and sourcing either way is equivalent.
 * axilog emits one `statsTargets` entry per real enemy agent but populates only
 * 8 of EI's 38 per-target stat fields, so these columns summed to a hard `0`
 * under axilog even though the identical whole-fight figure sits in
 * `statsAll[0]`, which axilog emits in full. See §4.1 of
 * `docs/axilog-cutover-report.md`.
 *
 * **The scope boundary, which is what makes this safe.** A whole-fight number
 * standing in for a per-target one is only correct where the consumer wanted
 * *all* targets. The single consumer of `OFFENSE_METRICS`'
 * `source: 'statsTargets'` branch — `computePlayerAggregation.ts`'s
 * `offenseTotals`/`offenseRateWeights` rollup — sums `p.statsTargets` with **no
 * target predicate whatsoever**, and nothing upstream of it filters
 * `statsTargets` either (there is no per-target/enemy filter anywhere in the
 * app; the Offense Detailed table, the comparison view and `reportMetrics` all
 * read the all-targets rollup). So "sum over every target" and "whole fight"
 * are the same scope here, and substituting one for the other changes nothing
 * but whether the cell is blank. **If a per-target or per-enemy filter is ever
 * introduced for these columns, this fallback must not be applied inside it** —
 * it would silently report whole-fight figures under a filtered heading.
 *
 * **Exactly these 8**, each verified present on a live axilog 0.3.0
 * `statsAll[0]` (report §4.1). The other 7 blank columns (`directDmg`,
 * `missed`, `evaded`, `blocked`, `invulned` and the two
 * `appliedCrowdControl*DownContribution`s) are absent from `statsAll[0]` too
 * and stay blank — deliberately, rather than being faked from a near-miss
 * field.
 *
 * Rate metrics bring their denominators with them: `statsAll[0]` carries
 * `critableDirectDamageCount` and `connectedDirectDamageCount`, so
 * `criticalRate`/`flankingRate`/`glanceRate` fall back numerator *and*
 * denominator together and never mix scopes within one ratio.
 *
 * Inert under Elite Insights: EI populates the per-target fields, so the
 * per-target sum is non-zero and the fallback is never consulted.
 */
export const OFFENSE_METRICS_STATS_ALL_FALLBACK: ReadonlySet<string> = new Set([
    'connectedDirectDamageCount',
    'criticalRate',
    'criticalDmg',
    'flankingRate',
    'glanceRate',
    'againstDownedDamage',
    'appliedCrowdControl',
    'appliedCrowdControlDuration',
]);

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

export const SUPPORT_METRICS: Array<{
    id: string;
    label: string;
    field: string;
    isTime?: boolean;
}> = [
        { id: 'condiCleanse', label: 'Condition Cleanses', field: 'condiCleanse' },
        { id: 'condiCleanseTime', label: 'Condition Cleanse Time', field: 'condiCleanseTime', isTime: true },
        { id: 'condiCleanseSelf', label: 'Condition Cleanse Self', field: 'condiCleanseSelf' },
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
