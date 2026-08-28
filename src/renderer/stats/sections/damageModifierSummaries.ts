// src/renderer/stats/sections/damageModifierSummaries.ts

export type ModTotals = { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number };
export type ModMapEntry = { name: string; icon: string; description: string; incoming: boolean };

export type ModSummary = {
    id: string;
    name: string;
    icon: string;
    description: string;
    squadDamageGain: number;
    isPersonal: boolean;
};

/**
 * Whether the parser told us which modifiers are a spec's *own*.
 *
 * Elite Insights emits a top-level `personalDamageMods` (spec name -> modifier
 * ids), which `IncrementalAggregator` flattens into `personalDamageModKeys`;
 * everything outside it is a shared/gear/relic modifier whose damage gain is
 * attributed to every benefiting player rather than to the provider — what the
 * Damage Modifiers section calls "hypothetical" and hides by default.
 *
 * axilog's EI-compat surface has emitted the same `personalDamageMods` field
 * since at least 1.7.2, so native logs are classified too in practice. This
 * function still has to handle the empty-set case: an empty
 * `personalDamageModKeys` means "unclassified", NOT "nothing is personal" -
 * treating it as the latter hid every modifier and left the whole section
 * reading "No damage modifier data available" even though the per-player
 * totals were fully aggregated. That empty-set path is what
 * `is false when the catalog is absent` below still pins.
 */
export const hasPersonalModClassification = (personalModKeys: ReadonlySet<string>): boolean =>
    personalModKeys.size > 0;

/**
 * Fold every player's per-modifier totals into one squad-level row per
 * modifier, filtered to the requested direction.
 *
 * With no personal-mod classification available the Hypothetical filter has no
 * meaning, so it is not applied and no row is dimmed as hypothetical.
 */
export const buildModSummaries = ({
    playerRows,
    totalsKey,
    modMap,
    personalModKeys,
    incoming,
    showHypothetical,
}: {
    playerRows: any[];
    totalsKey: string;
    modMap: Record<string, ModMapEntry>;
    personalModKeys: ReadonlySet<string>;
    incoming: boolean;
    showHypothetical: boolean;
}): ModSummary[] => {
    const classified = hasPersonalModClassification(personalModKeys);
    const summaryMap: Record<string, ModSummary> = {};

    for (const row of playerRows ?? []) {
        const modTotals: Record<string, ModTotals> = row?.[totalsKey] ?? {};
        for (const [modId, vals] of Object.entries(modTotals)) {
            const info = modMap?.[modId];
            if (!info) continue;
            // Only show modifiers matching the requested direction.
            if (info.incoming !== incoming) continue;
            // Hide hypothetical (shared) modifiers unless toggled — but only
            // when we actually know which modifiers are personal.
            const isPersonal = classified ? personalModKeys.has(modId) : true;
            if (!isPersonal && !showHypothetical) continue;
            if (!summaryMap[modId]) {
                summaryMap[modId] = {
                    id: modId,
                    name: info.name,
                    icon: info.icon,
                    description: info.description,
                    squadDamageGain: 0,
                    isPersonal,
                };
            }
            summaryMap[modId].squadDamageGain += vals.damageGain;
        }
    }

    return Object.values(summaryMap).sort(
        (a, b) => Math.abs(b.squadDamageGain) - Math.abs(a.squadDamageGain),
    );
};
