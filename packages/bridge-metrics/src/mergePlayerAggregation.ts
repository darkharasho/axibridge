/**
 * Merging player-aggregation accumulators.
 *
 * The fight slicer takes a snapshot of `PlayerAggregationAccumulators` per
 * fight, *before* `finalizePlayerAggregation` runs, and re-finalizes an
 * arbitrary subset of those snapshots in the browser. That only works if two
 * accumulators can be combined into the state a single sequential ingest of the
 * same fights would have produced:
 *
 *     finalize(merge(frame(A), frame(B))) === finalize(ingest(A); ingest(B))
 *
 * `PlayerStats` alone carries ~50 fields, so the per-field behaviour lives in
 * an explicit rule table (`PLAYER_STATS_MERGE_RULES`) rather than in fifty
 * hand-written assignments. The table is paired with a coverage test that fails
 * when a real fixture produces a `PlayerStats` key with no rule — without it, a
 * field added upstream would be silently dropped from every sliced report.
 *
 * Structures whose combination is genuinely not a table entry (skill entries
 * with `min`/`max`, mitigation totals, the special-buff aggregates) get small
 * hand-written combiners below, each mirroring the corresponding `ingest`
 * arithmetic exactly.
 */
import type {
    PlayerAggregationAccumulators,
    PlayerStats,
    DamageMitigationTotals,
    DamageMitigationRow,
    SpecialBuffAggEntry,
} from './computePlayerAggregation';
import type { PlayerSkillDamageEntry, PlayerHealingSkillEntry } from './aggregationTypes';

export type MergeRule =
    | 'sum' | 'max' | 'min' | 'first' | 'or'
    | 'setUnion' | 'arrayUnion' | 'recordSum' | 'recordDeepSum'
    | 'firstKnown' | 'lastKnown' | 'derived' | 'special';

/**
 * How each `PlayerStats` field combines when two accumulators are merged.
 *
 * - `sum` / `max` / `min` / `or`: numeric or boolean accumulation. `min` treats
 *   0 as "unset", matching `firstSeenFightTs`'s sentinel in ingest.
 * - `first`: the field is written once, when the player row is created, so the
 *   earlier accumulator's value wins.
 * - `lastKnown`: ingest *overwrites* the field on every log that reports a real
 *   value, so the later accumulator wins unless its value is missing/'Unknown'.
 * - `firstKnown`: the mirror image — kept for fields written only when unset.
 * - `recordSum` / `recordDeepSum`: `Record<string, number>` and nested-object
 *   variants, summed leaf by leaf.
 * - `derived`: not written by ingest at all (recomputed downstream), so the
 *   target's value is left alone.
 * - `special`: resolved by hand-written code in `mergePlayerStatsInto` because
 *   it depends on the value of another field.
 *
 * A field produced by a real log with no rule here is a test failure, not a
 * silent drop — see the coverage test in mergePlayerAggregation.test.ts.
 */
/**
 * True only under a test runner.
 *
 * The sense of this check matters and used to be inverted. It was
 * `NODE_ENV === 'production'`, so it read FALSE in a browser worker (where
 * `process` does not exist at all) — i.e. the unknown-field `throw` below fired
 * in exactly the one environment its own comment promised to degrade in, and a
 * single unmapped field added upstream would have stranded every *published*
 * report's slice recompute on an uncaught throw. "Not production" is not a
 * usable proxy for "somewhere a throw is safe" when the shipping target has no
 * `process` object. So the condition is now positive and narrow: throw where a
 * human is watching a test run and can fix the rule table, degrade everywhere
 * else. Vitest sets both `NODE_ENV=test` and `VITEST`.
 */
const isTestRun = (): boolean => typeof process !== 'undefined'
    && typeof process.env === 'object'
    && (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST));

export const PLAYER_STATS_MERGE_RULES: Readonly<Record<string, MergeRule>> = Object.freeze({
    name: 'first',
    account: 'first',
    characterNames: 'setUnion',
    downContrib: 'sum',
    cleanses: 'sum',
    strips: 'sum',
    stab: 'sum',
    healing: 'sum',
    barrier: 'sum',
    cc: 'sum',
    interrupts: 'sum',
    logsJoined: 'sum',
    totalDist: 'sum',
    distCount: 'sum',
    stackedLogCount: 'sum',
    dodges: 'sum',
    downs: 'sum',
    deaths: 'sum',
    kills: 'sum',
    enemyDowns: 'sum',
    damageTaken: 'sum',
    breakbar: 'sum',
    blocks: 'sum',
    evades: 'sum',
    misses: 'sum',
    totalFightMs: 'sum',
    offenseTotals: 'recordSum',
    offenseRateWeights: 'recordSum',
    defenseActiveMs: 'sum',
    defenseTotals: 'recordSum',
    defenseMinionDamageTaken: 'recordSum',
    supportActiveMs: 'sum',
    supportTotals: 'recordSum',
    healingActiveMs: 'sum',
    healingTotals: 'recordSum',
    hasHealAddon: 'or',
    // ingest does `s.profession = p.profession` for every log that reports a
    // known profession, so the LAST log seen wins, not the first.
    profession: 'lastKnown',
    professions: 'setUnion',
    professionList: 'arrayUnion',
    professionTimeMs: 'recordSum',
    squadActiveMs: 'sum',
    firstSeenFightTs: 'min',
    lastSeenFightTs: 'max',
    // Belongs to whichever side saw the later fight; ties take the longer
    // fight, exactly as ingest does.
    lastSeenFightDurationMs: 'special',
    isCommander: 'or',
    damage: 'sum',
    // ingest accumulates `s.dps += dpsAll.dps` per player entry — it is a raw
    // running total, not a rate recomputed at finalize.
    dps: 'sum',
    revives: 'sum',
    outgoingConditions: 'recordDeepSum',
    incomingConditions: 'recordDeepSum',
    damageModTotals: 'recordDeepSum',
    incomingDamageModTotals: 'recordDeepSum',
    roleClassification: 'derived',
});

/** Sum every numeric leaf of `source` into `target`, first-wins for strings. */
export const deepSumInto = (target: any, source: any): void => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([key, value]) => {
        if (typeof value === 'number') {
            target[key] = Number(target[key] || 0) + value;
        } else if (Array.isArray(value)) {
            if (!Array.isArray(target[key])) target[key] = [...value];
            else {
                value.forEach((v, i) => {
                    if (typeof v === 'number') target[key][i] = Number(target[key][i] || 0) + v;
                });
            }
        } else if (value && typeof value === 'object') {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            deepSumInto(target[key], value);
        } else if (target[key] === undefined) {
            target[key] = value;
        }
    });
};

const applyRule = (rule: MergeRule, targetValue: any, sourceValue: any): any => {
    switch (rule) {
        case 'sum': return Number(targetValue || 0) + Number(sourceValue || 0);
        case 'max': return Math.max(Number(targetValue || 0), Number(sourceValue || 0));
        case 'min': {
            const t = Number(targetValue || 0);
            const s = Number(sourceValue || 0);
            if (!t) return s;
            if (!s) return t;
            return Math.min(t, s);
        }
        case 'or': return Boolean(targetValue) || Boolean(sourceValue);
        case 'first': return targetValue !== undefined && targetValue !== '' ? targetValue : sourceValue;
        case 'firstKnown':
            return targetValue && targetValue !== 'Unknown' ? targetValue : sourceValue;
        case 'lastKnown':
            return sourceValue && sourceValue !== 'Unknown' ? sourceValue : targetValue;
        case 'setUnion': {
            const out = targetValue instanceof Set ? targetValue : new Set(targetValue || []);
            (sourceValue instanceof Set ? sourceValue : new Set(sourceValue || []))
                .forEach((v: any) => out.add(v));
            return out;
        }
        case 'arrayUnion': {
            const out = Array.isArray(targetValue) ? targetValue : [];
            (Array.isArray(sourceValue) ? sourceValue : []).forEach((v) => {
                if (!out.includes(v)) out.push(v);
            });
            return out;
        }
        case 'recordSum': {
            const out = targetValue && typeof targetValue === 'object' ? targetValue : {};
            Object.entries(sourceValue || {}).forEach(([k, v]) => {
                out[k] = Number(out[k] || 0) + Number(v || 0);
            });
            return out;
        }
        case 'recordDeepSum': {
            const out = targetValue && typeof targetValue === 'object' ? targetValue : {};
            deepSumInto(out, sourceValue || {});
            return out;
        }
        case 'special':
            // Handled by the caller; leave the target untouched here.
            return targetValue;
        case 'derived':
        default:
            return targetValue === undefined ? sourceValue : targetValue;
    }
};

const mergePlayerStatsInto = (target: PlayerStats, source: PlayerStats): void => {
    // Resolved before the rule pass, because it reads `lastSeenFightTs` on both
    // sides and the rule pass overwrites the target's copy with the max.
    const targetTs = Number(target.lastSeenFightTs || 0);
    const sourceTs = Number(source.lastSeenFightTs || 0);
    const sourceDuration = Number(source.lastSeenFightDurationMs || 0);
    let lastDuration = Number(target.lastSeenFightDurationMs || 0);
    if (targetTs <= 0 || sourceTs > targetTs) lastDuration = sourceDuration;
    else if (sourceTs > 0 && sourceTs === targetTs) lastDuration = Math.max(lastDuration, sourceDuration);

    Object.entries(source as any).forEach(([key, value]) => {
        const rule = PLAYER_STATS_MERGE_RULES[key];
        if (!rule) {
            // Defaulting to 'sum' would turn a string field added upstream into
            // NaN in every sliced report — the exact silent corruption the rule
            // table exists to prevent. Fail loudly wherever failing is safe.
            if (isTestRun()) {
                throw new Error(
                    `mergePlayerAggregationAccumulators: PlayerStats field "${key}" has no entry in `
                    + 'PLAYER_STATS_MERGE_RULES. Add one (see the coverage test in mergePlayerAggregation.test.ts).',
                );
            }
            // Anywhere else — a published report, a packaged desktop build —
            // degrade rather than blank the page: sum numbers, keep the first
            // value for anything else.
            (target as any)[key] = applyRule(typeof value === 'number' ? 'sum' : 'first', (target as any)[key], value);
            return;
        }
        (target as any)[key] = applyRule(rule, (target as any)[key], value);
    });

    target.lastSeenFightDurationMs = lastDuration;
};

const mergeMapInto = <V>(
    target: Map<any, V>,
    source: Map<any, V>,
    combine: (existing: V, incoming: V) => void,
    clone: (incoming: V) => V,
): void => {
    source.forEach((incoming, key) => {
        const existing = target.get(key);
        if (existing === undefined) target.set(key, clone(incoming));
        else combine(existing, incoming);
    });
};

const cloneDeep = <T>(value: T): T => {
    if (value instanceof Set) return new Set(value) as unknown as T;
    if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, cloneDeep(v)])) as unknown as T;
    if (Array.isArray(value)) return value.map(cloneDeep) as unknown as T;
    if (value && typeof value === 'object') {
        const out: any = {};
        Object.entries(value as any).forEach(([k, v]) => { out[k] = cloneDeep(v); });
        return out;
    }
    return value;
};

const addToList = (list: string[], incoming: string[] | undefined): void => {
    (incoming || []).forEach((p) => {
        if (!list.includes(p)) list.push(p);
    });
};

/**
 * `min` is seeded to `Infinity` and only lowered by finite, positive hits, so a
 * skill that never reported one keeps `Infinity`. JSON has no `Infinity`, and
 * the sidecar codec turns it into `null`, so both sentinels normalise back to
 * `Infinity` here — otherwise a round-tripped frame would merge a `null` into
 * the minimum and report 0.
 */
const asMinSentinel = (value: any): number => {
    if (value === null || value === undefined) return Infinity;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Infinity;
};

/**
 * Skill names arrive as `Skill <id>` placeholders when the log's `skillMap` has
 * no entry, and ingest upgrades a placeholder the first time a real name shows
 * up. Merging has to do the same or a slice starting on a nameless log would
 * keep the placeholder forever.
 */
const upgradeSkillName = (existing: string, incoming: string): string => (
    existing.startsWith('Skill ') && !incoming.startsWith('Skill ') ? incoming : existing
);

const mergeSkillDamageEntryInto = (
    existing: { name: string; icon?: string; damage: number; hits: number; downContribution: number },
    incoming: { name: string; icon?: string; damage: number; hits: number; downContribution: number },
): void => {
    existing.name = upgradeSkillName(existing.name, incoming.name);
    if (!existing.icon && incoming.icon) existing.icon = incoming.icon;
    existing.damage += incoming.damage;
    existing.hits += incoming.hits;
    existing.downContribution += incoming.downContribution;
};

const mergeIncomingSkillDamageEntryInto = (
    existing: { name: string; icon?: string; damage: number; hits: number },
    incoming: { name: string; icon?: string; damage: number; hits: number },
): void => {
    // Mirrors ingest's own (unusual) precedence at computePlayerAggregation.ts:
    // the name is replaced unless the existing one is a placeholder and the
    // incoming one is not.
    if (!existing.name.startsWith('Skill ') || incoming.name.startsWith('Skill ')) {
        existing.name = incoming.name;
    }
    if (!existing.icon && incoming.icon) existing.icon = incoming.icon;
    existing.damage += incoming.damage;
    existing.hits += incoming.hits;
};

const mergeRecordOfEntries = <T>(
    target: Record<string | number, T>,
    source: Record<string | number, T>,
    combine: (existing: T, incoming: T) => void,
): void => {
    Object.entries(source || {}).forEach(([key, incoming]) => {
        const existing = (target as any)[key];
        if (!existing) (target as any)[key] = cloneDeep(incoming);
        else combine(existing, incoming as T);
    });
};

/**
 * A skill row that only ONE frame ever saw is copied verbatim, so nothing on
 * the merge path below ever inspects its `min` — and a frame that came back
 * through JSON carries `null` there, because JSON has no `Infinity`. The
 * sentinel has to be restored while cloning or a sliced accumulator ends up
 * with `null` where an unsliced one holds `Infinity`, which
 * `computeSpecialTables` tests for by identity.
 *
 * Restoring it here rather than in `stateCodec` is deliberate: the codec is
 * shared by every slice module and knows nothing about which fields are
 * sentinels. `min` is a fact about `PlayerSkillDamageEntry`, so it belongs with
 * the code that owns that type's merge semantics.
 */
const clonePlayerSkillEntry = (entry: PlayerSkillDamageEntry): PlayerSkillDamageEntry => ({
    ...entry,
    min: asMinSentinel(entry.min),
});

const clonePlayerBreakdownRow = <T extends { skills: Map<string, PlayerSkillDamageEntry> }>(row: T): T => ({
    ...cloneDeep(row),
    skills: new Map([...row.skills].map(([id, entry]) => [id, clonePlayerSkillEntry(entry)])),
});

const mergePlayerSkillEntryInto = (existing: PlayerSkillDamageEntry, incoming: PlayerSkillDamageEntry): void => {
    existing.name = upgradeSkillName(existing.name, incoming.name);
    if (!existing.icon && incoming.icon) existing.icon = incoming.icon;
    existing.damage += incoming.damage;
    existing.downContribution += incoming.downContribution;
    existing.hits += incoming.hits;
    existing.casts += incoming.casts;
    existing.min = Math.min(asMinSentinel(existing.min), asMinSentinel(incoming.min));
    existing.max = Math.max(Number(existing.max || 0), Number(incoming.max || 0));
};

const mergeHealingSkillEntryInto = (existing: PlayerHealingSkillEntry, incoming: PlayerHealingSkillEntry): void => {
    existing.name = upgradeSkillName(existing.name, incoming.name);
    if (!existing.icon && incoming.icon) existing.icon = incoming.icon;
    existing.total += incoming.total;
    existing.hits += incoming.hits;
    existing.max = Math.max(Number(existing.max || 0), Number(incoming.max || 0));
};

/**
 * Every field here is a running `+=` in ingest, `minMitigation` included — it
 * accumulates `min_avoided_damage`, it is not a minimum.
 */
const mergeMitigationTotalsInto = (target: DamageMitigationTotals, source: DamageMitigationTotals): void => {
    target.totalHits += source.totalHits;
    target.blocked += source.blocked;
    target.evaded += source.evaded;
    target.glanced += source.glanced;
    target.missed += source.missed;
    target.invulned += source.invulned;
    target.interrupted += source.interrupted;
    target.totalMitigation += source.totalMitigation;
    target.minMitigation += source.minMitigation;
};

const mergeSpecialBuffEntryInto = (existing: SpecialBuffAggEntry, incoming: SpecialBuffAggEntry): void => {
    existing.totalMs += incoming.totalMs;
    existing.uptimeMs += incoming.uptimeMs;
    existing.durationMs += incoming.durationMs;
    incoming.professions.forEach((p) => existing.professions.add(p));
    Object.entries(incoming.professionTimeMs || {}).forEach(([p, ms]) => {
        existing.professionTimeMs[p] = Number(existing.professionTimeMs[p] || 0) + Number(ms || 0);
    });
    // ingest reassigns `agg.profession` on every known profession it sees, so
    // the later accumulator wins.
    if (incoming.profession && incoming.profession !== 'Unknown') existing.profession = incoming.profession;
};

const mergeBuffAggInto = (
    targetAgg: Map<string, Map<string, SpecialBuffAggEntry>>,
    sourceAgg: Map<string, Map<string, SpecialBuffAggEntry>>,
): void => {
    sourceAgg.forEach((sourceInner, buffId) => {
        let inner = targetAgg.get(buffId);
        if (!inner) {
            inner = new Map<string, SpecialBuffAggEntry>();
            targetAgg.set(buffId, inner);
        }
        mergeMapInto(inner, sourceInner, mergeSpecialBuffEntryInto, cloneDeep);
    });
};

/**
 * Mitigation rows: `profession`, `account` and `name` are written only when the
 * row is created, so they are first-wins even when the first value is
 * 'Unknown'. Only `professionList` grows, and the row's `mitigationTotals` are
 * overwritten wholesale by `finalizePlayerAggregation`.
 */
const mergeMitigationRowsInto = <T extends DamageMitigationRow>(
    targetRows: Map<string, T>,
    sourceRows: Map<string, T>,
): void => {
    mergeMapInto(targetRows, sourceRows, (existing, incoming) => {
        existing.activeMs += incoming.activeMs;
        addToList(existing.professionList, incoming.professionList);
        mergeMitigationTotalsInto(existing.mitigationTotals, incoming.mitigationTotals);
    }, cloneDeep);
};

/**
 * Merge one fight's player aggregation state into a running accumulator.
 *
 * ORDER MATTERS. Frames must be merged in the same order the direct path would
 * have ingested them — chronological fight order — because `first` / `lastKnown`
 * rules, the pending-cast replay and Map insertion order (which the stable
 * `finalize*` sorts carry through to the output) all depend on it.
 *
 * `target` is mutated in place; `source` is only read (values copied out of it
 * are deep-cloned, so a frame can be merged into several different slices).
 * Call `finalizePlayerAggregation` on the result, never on the inputs —
 * `recomputeMitigationTotals` overwrites row totals from the cumulative counts
 * and is not safe to run twice on state that is still being accumulated.
 */
export function mergePlayerAggregationAccumulators(
    target: PlayerAggregationAccumulators,
    source: PlayerAggregationAccumulators,
): void {
    if (!target || !source) throw new Error('mergePlayerAggregationAccumulators: both accumulators are required');
    if (!(target.playerStats instanceof Map) || !(source.playerStats instanceof Map)) {
        throw new Error('mergePlayerAggregationAccumulators: accumulators must carry Map state (did the frame skip decodeState?)');
    }

    mergeMapInto(target.playerStats, source.playerStats, mergePlayerStatsInto, cloneDeep);

    mergeRecordOfEntries(target.skillDamageMap, source.skillDamageMap, mergeSkillDamageEntryInto);
    mergeRecordOfEntries(target.incomingSkillDamageMap, source.incomingSkillDamageMap, mergeIncomingSkillDamageEntryInto);
    deepSumInto(target.outgoingCondiTotals, source.outgoingCondiTotals);
    deepSumInto(target.incomingCondiTotals, source.incomingCondiTotals);
    deepSumInto(target.enemyProfessionCounts, source.enemyProfessionCounts);

    mergeMapInto(target.playerSkillBreakdownMap, source.playerSkillBreakdownMap, (existing, incoming) => {
        existing.totalFightMs += incoming.totalFightMs;
        addToList(existing.professionList, incoming.professionList);
        mergeMapInto(existing.skills, incoming.skills, mergePlayerSkillEntryInto, clonePlayerSkillEntry);
    }, clonePlayerBreakdownRow);

    mergeMapInto(target.healingBreakdownMap, source.healingBreakdownMap, (existing, incoming) => {
        existing.hasHealAddon = existing.hasHealAddon || incoming.hasHealAddon;
        addToList(existing.professionList, incoming.professionList);
        mergeMapInto(existing.healingSkills, incoming.healingSkills, mergeHealingSkillEntryInto, cloneDeep);
        mergeMapInto(existing.barrierSkills, incoming.barrierSkills, mergeHealingSkillEntryInto, cloneDeep);
    }, cloneDeep);

    // Rotation casts parked by ingest because their skill row did not exist in
    // their own fight. A sequential ingest would have credited them to a row an
    // EARLIER fight created, so they are replayed against the target's rows —
    // which is exactly the set of rows the earlier fights contributed. Casts
    // that still find no row stay parked, matching the direct path, where they
    // are never credited either.
    source.pendingSkillCasts.forEach((skills, playerKey) => {
        const breakdown = target.playerSkillBreakdownMap.get(playerKey);
        skills.forEach((count, skillId) => {
            const entry = breakdown?.skills.get(skillId);
            if (entry) {
                entry.casts += count;
                return;
            }
            let leftover = target.pendingSkillCasts.get(playerKey);
            if (!leftover) {
                leftover = new Map<string, number>();
                target.pendingSkillCasts.set(playerKey, leftover);
            }
            leftover.set(skillId, (leftover.get(skillId) || 0) + count);
        });
    });

    // First-wins metadata: name, icon and stacking never change across logs.
    source.specialBuffMeta.forEach((meta, key) => {
        if (!target.specialBuffMeta.has(key)) target.specialBuffMeta.set(key, cloneDeep(meta));
    });

    mergeBuffAggInto(target.specialBuffAgg, source.specialBuffAgg);
    mergeBuffAggInto(target.specialBuffOutputAgg, source.specialBuffOutputAgg);

    mergeMitigationRowsInto(target.damageMitigationPlayersMap, source.damageMitigationPlayersMap);
    mergeMitigationRowsInto(target.damageMitigationMinionsMap, source.damageMitigationMinionsMap);

    mergeMapInto(target.mitigationCumulativeCounts, source.mitigationCumulativeCounts,
        mergeMitigationTotalsInto, cloneDeep);
    mergeMapInto(target.mitigationMinionCumulativeCounts, source.mitigationMinionCumulativeCounts,
        mergeMitigationTotalsInto, cloneDeep);

    mergeMapInto(target.globalEnemySkillStats, source.globalEnemySkillStats, (existing, incoming) => {
        existing.totalDamage += incoming.totalDamage;
        existing.connectedHits += incoming.connectedHits;
        existing.minTotal += incoming.minTotal;
        existing.minCount += incoming.minCount;
    }, cloneDeep);

    target.wins += source.wins;
    target.losses += source.losses;
    target.totalSquadSizeAccum += source.totalSquadSizeAccum;
    target.totalEnemiesAccum += source.totalEnemiesAccum;
    target.totalSquadDeaths += source.totalSquadDeaths;
    target.totalSquadKills += source.totalSquadKills;
    target.totalEnemyDeaths += source.totalEnemyDeaths;
    target.totalEnemyKills += source.totalEnemyKills;
    target.totalSquadDowns += source.totalSquadDowns;
    target.totalEnemyDowns += source.totalEnemyDowns;
}
