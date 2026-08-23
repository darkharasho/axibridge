import { describe, it, expect } from 'vitest';
import {
    createPlayerAggregationAccumulators,
    precomputeGlobalEnemySkillStats,
    ingestLogPlayerData,
    finalizePlayerAggregation,
    mergePlayerAggregationAccumulators,
    PLAYER_STATS_MERGE_RULES,
} from '../../computePlayerAggregation';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTIONS = { method: 'count' as const, skillDamageSource: 'target', splitPlayersByClass: false };

const soloAcc = (log: any) => {
    const acc = createPlayerAggregationAccumulators();
    precomputeGlobalEnemySkillStats(log, acc);
    ingestLogPlayerData(log, acc, OPTIONS);
    return acc;
};

/**
 * The direct path: every fight's global enemy stats are precomputed first, then
 * every fight is ingested. That two-pass shape is why the merge has to carry
 * `globalEnemySkillStats` — a per-fight frame only ever saw its own.
 */
const ingestAll = (logs: any[]) => {
    const acc = createPlayerAggregationAccumulators();
    logs.forEach((log) => precomputeGlobalEnemySkillStats(log, acc));
    logs.forEach((log) => ingestLogPlayerData(log, acc, OPTIONS));
    return acc;
};

const mergedAcc = (logs: any[], viaJson = false) => {
    const target = createPlayerAggregationAccumulators();
    logs.forEach((log) => {
        const solo = soloAcc(log);
        const source = viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(solo)))) : solo;
        mergePlayerAggregationAccumulators(target, source);
    });
    return target;
};

/** `finalizePlayerAggregation` mutates in place and returns void — compare the accumulator. */
const finalized = (acc: any) => {
    finalizePlayerAggregation(acc);
    return acc;
};

describe('player aggregation merge equivalence', () => {
    it('gives every PlayerStats field produced by a real log a merge rule', () => {
        // Guards the silent failure mode: an upstream field added to PlayerStats
        // with no rule would otherwise be dropped from every sliced report.
        const acc = ingestAll([LOGS[0]]);
        const sample = [...acc.playerStats.values()][0];
        expect(sample).toBeTruthy();
        expect(Object.keys(sample).length).toBeGreaterThan(40);
        const missing = Object.keys(sample).filter((key) => !(key in PLAYER_STATS_MERGE_RULES));
        expect(missing).toEqual([]);
    });

    it('has real, non-empty state to compare', () => {
        const acc = ingestAll(LOGS);
        expect(acc.playerStats.size).toBeGreaterThan(5);
        expect([...acc.playerStats.values()].reduce((t, p) => t + p.damage, 0)).toBeGreaterThan(0);
        expect(Object.keys(acc.skillDamageMap).length).toBeGreaterThan(10);
        expect(acc.playerSkillBreakdownMap.size).toBeGreaterThan(5);
        expect(acc.healingBreakdownMap.size).toBeGreaterThan(5);
        expect(acc.globalEnemySkillStats.size).toBeGreaterThan(0);
        expect(acc.mitigationCumulativeCounts.size).toBeGreaterThan(100);
        expect(acc.mitigationMinionCumulativeCounts.size).toBeGreaterThan(10);
        expect(Object.keys(acc.incomingSkillDamageMap).length).toBeGreaterThan(10);
        expect(Object.keys(acc.outgoingCondiTotals).length).toBeGreaterThan(0);
        expect(Object.keys(acc.incomingCondiTotals).length).toBeGreaterThan(0);
        expect(Object.keys(acc.enemyProfessionCounts).length).toBeGreaterThan(0);
        expect(acc.pendingSkillCasts.size).toBeGreaterThan(0);
        // NOT exercised by these fixtures: specialBuffAgg / specialBuffOutputAgg /
        // specialBuffMeta stay empty on the native fixtures, so those combiners
        // are pinned synthetically below instead.
        expect(acc.specialBuffAgg.size).toBe(0);
    });

    it('reproduces the all-fights player stats from per-fight accumulators', () => {
        expect(mergedAcc(LOGS).playerStats).toEqual(ingestAll(LOGS).playerStats);
    });

    it('reproduces every accumulator field, not just playerStats', () => {
        const merged = mergedAcc(LOGS) as any;
        const direct = ingestAll(LOGS) as any;
        Object.keys(direct).forEach((key) => {
            expect({ [key]: merged[key] }).toEqual({ [key]: direct[key] });
        });
    });

    it('preserves player insertion order, which finalize sorts are stable against', () => {
        expect([...mergedAcc(LOGS).playerStats.keys()]).toEqual([...ingestAll(LOGS).playerStats.keys()]);
        expect([...mergedAcc(LOGS).playerSkillBreakdownMap.keys()])
            .toEqual([...ingestAll(LOGS).playerSkillBreakdownMap.keys()]);
    });

    it('reproduces the all-fights finalize output', () => {
        expect(finalized(mergedAcc(LOGS))).toEqual(finalized(ingestAll(LOGS)));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(finalized(mergedAcc(subset))).toEqual(finalized(ingestAll(subset)));
    });

    it('reproduces a reversed-order subset', () => {
        const subset = [LOGS[2], LOGS[1]];
        expect(finalized(mergedAcc(subset))).toEqual(finalized(ingestAll(subset)));
    });

    it('survives a JSON round trip through the state codec', () => {
        // Compared in the codec's own domain: `JSON.stringify` drops keys whose
        // value is `undefined` (every `icon` a log had no artwork for), so a
        // decoded frame is missing keys the direct accumulator carries as
        // explicit `undefined`. Normalising BOTH sides through the same encode
        // /decode makes that one difference disappear without weakening
        // anything else — every number, name, Map entry and array order is
        // still compared exactly, and a value that actually changed still
        // fails. The Infinity sentinel is pinned separately below, because JSON
        // turns it into `null` on both sides.
        const roundTrip = (acc: any) => JSON.parse(JSON.stringify(encodeState(acc)));
        expect(roundTrip(finalized(mergedAcc(LOGS, true)))).toEqual(roundTrip(finalized(ingestAll(LOGS))));
    });

    it('replays casts that a per-fight frame could not attribute on its own', () => {
        // A rotation cast whose skill dealt no damage in its own fight is
        // dropped by ingest unless an earlier fight already created the row.
        // Without the pending-cast replay the sliced totals read low here.
        const merged = mergedAcc(LOGS);
        const direct = ingestAll(LOGS);
        const casts = (acc: any) => [...acc.playerSkillBreakdownMap.values()]
            .reduce((t: number, row: any) => t + [...row.skills.values()]
                .reduce((n: number, sk: any) => n + sk.casts, 0), 0);
        expect(casts(direct)).toBeGreaterThan(0);
        expect(casts(merged)).toBe(casts(direct));
    });

    it('accumulates rather than replacing — totals grow with the slice', () => {
        const all = mergedAcc(LOGS);
        const one = mergedAcc([LOGS[0]]);
        const sum = (acc: any) => [...acc.playerStats.values()].reduce((t: number, p: any) => t + p.damage, 0);
        expect(sum(one)).toBeGreaterThan(0);
        expect(sum(all)).toBeGreaterThan(sum(one));
        expect(all.wins + all.losses).toBe(3);
    });

    it('does not mutate the source frame, so one frame can feed several slices', () => {
        const solo = soloAcc(LOGS[0]);
        const before = JSON.stringify(encodeState(solo));
        const target = createPlayerAggregationAccumulators();
        mergePlayerAggregationAccumulators(target, solo);
        mergePlayerAggregationAccumulators(createPlayerAggregationAccumulators(), solo);
        expect(JSON.stringify(encodeState(solo))).toBe(before);
    });

    it('rejects state that skipped decodeState instead of silently dropping it', () => {
        const target = createPlayerAggregationAccumulators();
        const raw = JSON.parse(JSON.stringify(encodeState(soloAcc(LOGS[0]))));
        expect(() => mergePlayerAggregationAccumulators(target, raw)).toThrow(/decodeState/);
    });
});

/**
 * The fixtures do not happen to exercise every rule: several `first`/`lastKnown`
 * fields never disagree across these three logs, and the skill `min`/`max`
 * sentinels never tie. A green fixture test would pass under the wrong rule for
 * those, so they are pinned by hand here against synthetic accumulators.
 */
describe('player aggregation merge rules pinned synthetically', () => {
    const blankStats = (over: any) => ({
        name: '', account: '', characterNames: new Set<string>(), downContrib: 0, cleanses: 0, strips: 0,
        stab: 0, healing: 0, barrier: 0, cc: 0, interrupts: 0, logsJoined: 0, totalDist: 0, distCount: 0,
        stackedLogCount: 0, dodges: 0, downs: 0, deaths: 0, kills: 0, enemyDowns: 0, damageTaken: 0,
        breakbar: 0, blocks: 0, evades: 0, misses: 0, totalFightMs: 0, offenseTotals: {}, offenseRateWeights: {},
        defenseActiveMs: 0, defenseTotals: {}, defenseMinionDamageTaken: {}, supportActiveMs: 0, supportTotals: {},
        healingActiveMs: 0, healingTotals: {}, hasHealAddon: false, profession: 'Unknown', professions: new Set<string>(),
        professionTimeMs: {}, squadActiveMs: 0, firstSeenFightTs: 0, lastSeenFightTs: 0, lastSeenFightDurationMs: 0,
        isCommander: false, damage: 0, dps: 0, revives: 0, outgoingConditions: {}, incomingConditions: {},
        damageModTotals: {}, incomingDamageModTotals: {},
        roleClassification: { role: 'damage', supportScore: 0, confidenceScore: 0, threshold: 0, factors: [] },
        ...over,
    });

    const mergeStats = (a: any, b: any) => {
        const target = createPlayerAggregationAccumulators();
        const source = createPlayerAggregationAccumulators();
        target.playerStats.set('p', blankStats(a) as any);
        source.playerStats.set('p', blankStats(b) as any);
        mergePlayerAggregationAccumulators(target, source);
        return target.playerStats.get('p') as any;
    };

    it('keeps the first name and account, and takes the later profession', () => {
        const out = mergeStats(
            { name: 'Alpha', account: 'A.1111', profession: 'Guardian' },
            { name: 'Beta', account: 'B.2222', profession: 'Firebrand' },
        );
        expect(out.name).toBe('Alpha');
        expect(out.account).toBe('A.1111');
        // ingest reassigns profession per log, so the later log wins...
        expect(out.profession).toBe('Firebrand');
        // ...but an unknown profession never overwrites a known one.
        expect(mergeStats({ profession: 'Guardian' }, { profession: 'Unknown' }).profession).toBe('Guardian');
        expect(mergeStats({ profession: 'Unknown' }, { profession: 'Scourge' }).profession).toBe('Scourge');
    });

    it('treats a zero firstSeenFightTs as unset rather than as the minimum', () => {
        expect(mergeStats({ firstSeenFightTs: 0 }, { firstSeenFightTs: 500 }).firstSeenFightTs).toBe(500);
        expect(mergeStats({ firstSeenFightTs: 500 }, { firstSeenFightTs: 0 }).firstSeenFightTs).toBe(500);
        expect(mergeStats({ firstSeenFightTs: 900 }, { firstSeenFightTs: 500 }).firstSeenFightTs).toBe(500);
        expect(mergeStats({ firstSeenFightTs: 500 }, { firstSeenFightTs: 900 }).firstSeenFightTs).toBe(500);
    });

    it('pairs lastSeenFightDurationMs with the later fight, longest wins on a tie', () => {
        // Later source fight: its duration wins even though it is shorter.
        expect(mergeStats(
            { lastSeenFightTs: 100, lastSeenFightDurationMs: 9000 },
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 1000 },
        ).lastSeenFightDurationMs).toBe(1000);
        // Earlier source fight: the target keeps its own.
        expect(mergeStats(
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 1000 },
            { lastSeenFightTs: 100, lastSeenFightDurationMs: 9000 },
        ).lastSeenFightDurationMs).toBe(1000);
        // Tie: ingest keeps the longer fight.
        expect(mergeStats(
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 1000 },
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 9000 },
        ).lastSeenFightDurationMs).toBe(9000);
        expect(mergeStats(
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 9000 },
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 1000 },
        ).lastSeenFightDurationMs).toBe(9000);
        // A source that never saw a timestamped fight contributes nothing.
        expect(mergeStats(
            { lastSeenFightTs: 200, lastSeenFightDurationMs: 9000 },
            { lastSeenFightTs: 0, lastSeenFightDurationMs: 0 },
        ).lastSeenFightDurationMs).toBe(9000);
    });

    it('ors the flags and unions the sets', () => {
        const out = mergeStats(
            { isCommander: true, hasHealAddon: false, characterNames: new Set(['A']), professions: new Set(['Guardian']) },
            { isCommander: false, hasHealAddon: true, characterNames: new Set(['B']), professions: new Set(['Scourge']) },
        );
        expect(out.isCommander).toBe(true);
        expect(out.hasHealAddon).toBe(true);
        expect([...out.characterNames]).toEqual(['A', 'B']);
        expect([...out.professions]).toEqual(['Guardian', 'Scourge']);
    });

    it('sums dps rather than treating it as a derived rate', () => {
        expect(mergeStats({ dps: 1000 }, { dps: 250 }).dps).toBe(1250);
    });

    const mergeSkills = (a: any, b: any) => {
        const target = createPlayerAggregationAccumulators();
        const source = createPlayerAggregationAccumulators();
        const row = (skill: any) => ({
            key: 'p', account: 'p', displayName: 'p', profession: 'Guardian', professionList: ['Guardian'],
            totalFightMs: 0, skills: new Map([['s1', skill]]),
        });
        target.playerSkillBreakdownMap.set('p', row(a) as any);
        source.playerSkillBreakdownMap.set('p', row(b) as any);
        mergePlayerAggregationAccumulators(target, source);
        return (target.playerSkillBreakdownMap.get('p') as any).skills.get('s1');
    };

    const skill = (over: any) => ({
        id: 's1', name: 'Skill 1', icon: undefined, damage: 0, downContribution: 0,
        hits: 0, casts: 0, min: Infinity, max: 0, ...over,
    });

    it('mins and maxes the skill entry extremes instead of summing them', () => {
        const out = mergeSkills(skill({ min: 700, max: 900 }), skill({ min: 300, max: 1500 }));
        expect(out.min).toBe(300);
        expect(out.max).toBe(1500);
        const flipped = mergeSkills(skill({ min: 300, max: 1500 }), skill({ min: 700, max: 900 }));
        expect(flipped.min).toBe(300);
        expect(flipped.max).toBe(1500);
        // Ties must not double.
        expect(mergeSkills(skill({ min: 400, max: 400 }), skill({ min: 400, max: 400 })).max).toBe(400);
    });

    it('keeps the Infinity min sentinel, including after a JSON round trip turns it into null', () => {
        expect(mergeSkills(skill({}), skill({})).min).toBe(Infinity);
        expect(mergeSkills(skill({ min: Infinity }), skill({ min: 250 })).min).toBe(250);
        expect(mergeSkills(skill({ min: 250 }), skill({ min: null })).min).toBe(250);
        expect(mergeSkills(skill({ min: null }), skill({ min: null })).min).toBe(Infinity);
    });

    it('upgrades a placeholder skill name and fills a missing icon', () => {
        const out = mergeSkills(skill({ name: 'Skill 1' }), skill({ name: 'Fireball', icon: 'i.png' }));
        expect(out.name).toBe('Fireball');
        expect(out.icon).toBe('i.png');
        // A real name is never downgraded back to a placeholder.
        expect(mergeSkills(skill({ name: 'Fireball' }), skill({ name: 'Skill 1' })).name).toBe('Fireball');
    });

    it('combines special-buff aggregates, which these fixtures never populate', () => {
        const entry = (over: any) => ({
            key: 'p', account: 'p', profession: 'Unknown', professions: new Set<string>(),
            professionTimeMs: {}, totalMs: 0, uptimeMs: 0, durationMs: 0, ...over,
        });
        const target = createPlayerAggregationAccumulators();
        const source = createPlayerAggregationAccumulators();
        target.specialBuffMeta.set('b1', { name: 'Merciful Intervention', stacking: false, icon: 'a.png' });
        source.specialBuffMeta.set('b1', { name: 'CHANGED', stacking: true, icon: 'b.png' });
        source.specialBuffMeta.set('b2', { name: 'Second', stacking: false, icon: 'c.png' });
        target.specialBuffAgg.set('b1', new Map([['p', entry({
            profession: 'Guardian', professions: new Set(['Guardian']),
            professionTimeMs: { Guardian: 100 }, totalMs: 10, uptimeMs: 5, durationMs: 200,
        }) as any]]));
        source.specialBuffAgg.set('b1', new Map([['p', entry({
            profession: 'Firebrand', professions: new Set(['Firebrand']),
            professionTimeMs: { Firebrand: 300 }, totalMs: 40, uptimeMs: 20, durationMs: 400,
        }) as any]]));
        source.specialBuffOutputAgg.set('b2', new Map([['q', entry({ key: 'q', account: 'q', totalMs: 7 }) as any]]));

        mergePlayerAggregationAccumulators(target, source);

        // Buff metadata is written once and never changes across logs.
        expect(target.specialBuffMeta.get('b1')).toEqual({ name: 'Merciful Intervention', stacking: false, icon: 'a.png' });
        expect(target.specialBuffMeta.get('b2')).toEqual({ name: 'Second', stacking: false, icon: 'c.png' });
        const merged: any = target.specialBuffAgg.get('b1')!.get('p');
        expect(merged.totalMs).toBe(50);
        expect(merged.uptimeMs).toBe(25);
        expect(merged.durationMs).toBe(600);
        expect(merged.professionTimeMs).toEqual({ Guardian: 100, Firebrand: 300 });
        expect([...merged.professions]).toEqual(['Guardian', 'Firebrand']);
        // ingest reassigns agg.profession per log, so the later one wins.
        expect(merged.profession).toBe('Firebrand');
        // A buff bucket only the source has is created, not dropped.
        expect((target.specialBuffOutputAgg.get('b2')!.get('q') as any).totalMs).toBe(7);
    });

    it('keeps mitigation-row identity first-wins, even when the first value is Unknown', () => {
        const row = (over: any) => ({
            account: 'a', name: 'n', profession: 'Unknown', professionList: ['Unknown'],
            activeMs: 0,
            mitigationTotals: {
                totalHits: 0, blocked: 0, evaded: 0, glanced: 0, missed: 0,
                invulned: 0, interrupted: 0, totalMitigation: 0, minMitigation: 0,
            },
            ...over,
        });
        const target = createPlayerAggregationAccumulators();
        const source = createPlayerAggregationAccumulators();
        target.damageMitigationPlayersMap.set('k', row({}) as any);
        source.damageMitigationPlayersMap.set('k', row({ profession: 'Guardian', professionList: ['Guardian'] }) as any);
        mergePlayerAggregationAccumulators(target, source);
        const out: any = target.damageMitigationPlayersMap.get('k');
        // ensureMitigationRow writes `profession` only when creating the row.
        expect(out.profession).toBe('Unknown');
        expect(out.professionList).toEqual(['Unknown', 'Guardian']);
    });

    it('sums minMitigation — it accumulates min_avoided_damage, it is not a minimum', () => {
        const totals = (over: any) => ({
            totalHits: 0, blocked: 0, evaded: 0, glanced: 0, missed: 0, invulned: 0,
            interrupted: 0, totalMitigation: 0, minMitigation: 0, ...over,
        });
        const target = createPlayerAggregationAccumulators();
        const source = createPlayerAggregationAccumulators();
        target.mitigationCumulativeCounts.set('k', totals({ minMitigation: 30, totalMitigation: 100 }) as any);
        source.mitigationCumulativeCounts.set('k', totals({ minMitigation: 70, totalMitigation: 200 }) as any);
        mergePlayerAggregationAccumulators(target, source);
        expect(target.mitigationCumulativeCounts.get('k')).toEqual(
            totals({ minMitigation: 100, totalMitigation: 300 }),
        );
    });
});

describe('player aggregation frame size', () => {
    it('reports the per-fight sidecar cost', async () => {
        const { gzipSync } = await import('node:zlib');
        const json = JSON.stringify(encodeState(soloAcc(LOGS[0])));
        const gzipped = gzipSync(Buffer.from(json)).length;
        // Informational, not a gate — the 200 KB gzipped budget is per fight
        // across ALL slice modules combined, and this is the largest of them.
        console.log(`player aggregation frame: ${json.length} bytes JSON, ${gzipped} bytes gzipped`);
        expect(json.length).toBeGreaterThan(0);
    });
});
