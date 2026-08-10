import { describe, expect, it } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';
import { OFFENSE_METRICS_STATS_ALL_FALLBACK } from '../statsMetrics';

/**
 * The `statsAll[0]` fallback for the Offense Detailed columns axilog does not
 * report per target. See §4.1 of `docs/axilog-cutover-report.md` and the
 * boundary note on `OFFENSE_METRICS_STATS_ALL_FALLBACK`.
 *
 * Both backends are exercised here because the fallback has to be *inert*
 * under Elite Insights, not merely harmless: EI emits the full 38-field
 * per-target set (zeroes included), so a value-based trigger would have
 * silently swapped whole-fight numbers in for real per-target zeroes. The
 * trigger is field presence, and these tests are what pin that.
 */

/** The 8 whole-fight fields, with plausible non-zero values. */
const STATS_ALL_HIT_QUALITY = {
    connectedDamageCount: 400,
    connectedDirectDamageCount: 300,
    critableDirectDamageCount: 250,
    criticalRate: 125,
    criticalDmg: 90_000,
    flankingRate: 60,
    glanceRate: 12,
    againstDownedDamage: 45_000,
    appliedCrowdControl: 30,
    appliedCrowdControlDuration: 15_000,
};

/** axilog's shape: 8 of EI's 38 per-target fields, the rest simply absent. */
const axilogStatsTarget = (over: any = {}) => [{
    totalDmg: 50_000,
    connectedDmg: 48_000,
    connectedDamageCount: 200,
    downed: 1,
    killed: 1,
    downContribution: 4_000,
    againstDownedCount: 2,
    interrupts: 3,
    ...over,
}];

/** EI's shape: every field present, zeroes included. */
const eiStatsTarget = (over: any = {}) => [{
    ...axilogStatsTarget()[0],
    directDmg: 40_000,
    connectedDirectDamageCount: 150,
    critableDirectDamageCount: 120,
    criticalRate: 0,
    criticalDmg: 0,
    flankingRate: 0,
    glanceRate: 0,
    missed: 0,
    evaded: 0,
    blocked: 0,
    invulned: 0,
    againstDownedDamage: 0,
    appliedCrowdControl: 0,
    appliedCrowdControlDuration: 0,
    appliedCrowdControlDownContribution: 0,
    appliedCrowdControlDurationDownContribution: 0,
    ...over,
}];

const makePlayer = (statsTargets: any, statsAllOver: any = {}) => ({
    account: 'TestPlayer.1234',
    name: 'TestCharacter',
    profession: 'Guardian',
    notInSquad: false,
    activeTimes: [60_000],
    dpsAll: [{ damage: 100_000, dps: 1_667 }],
    statsAll: [{ ...STATS_ALL_HIT_QUALITY, ...statsAllOver }],
    support: [{ resurrects: 0 }],
    defenses: [{ downCount: 0, deadCount: 0 }],
    statsTargets,
    damage1S: [[]],
    targetDamage1S: [[[]]],
    targetDamageDist: [[[]]],
    totalDamageDist: [[]],
});

const makeLog = (players: any[]) => ({
    status: 'success',
    filePath: 'test-log',
    details: {
        durationMS: 60_000,
        fightName: 'Test Fight',
        success: true,
        players,
        targets: [],
        skillMap: {},
        buffMap: {},
    },
});

const aggregate = (players: any[]) => {
    const { playerStats } = computePlayerAggregation({
        validLogs: [makeLog(players)],
        method: 'count' as const,
        skillDamageSource: 'target',
        splitPlayersByClass: false,
    });
    const ps = playerStats.get('TestPlayer.1234');
    expect(ps).toBeTruthy();
    return ps!;
};

describe('OFFENSE_METRICS statsAll fallback', () => {
    it('covers exactly the 8 fields verified present on axilog statsAll[0]', () => {
        expect([...OFFENSE_METRICS_STATS_ALL_FALLBACK].sort()).toEqual([
            'againstDownedDamage',
            'appliedCrowdControl',
            'appliedCrowdControlDuration',
            'connectedDirectDamageCount',
            'criticalDmg',
            'criticalRate',
            'flankingRate',
            'glanceRate',
        ]);
    });

    describe('axilog backend (per-target fields absent)', () => {
        it('fills the 8 recoverable columns from the whole-fight statsAll[0]', () => {
            // Two targets: axilog emits one statsTargets entry per real enemy,
            // and neither carries the hit-quality family at all.
            const ps = aggregate([makePlayer([axilogStatsTarget(), axilogStatsTarget()])]);

            expect(ps.offenseTotals.connectedDirectDamageCount).toBe(300);
            expect(ps.offenseTotals.criticalRate).toBe(125);
            expect(ps.offenseTotals.criticalDmg).toBe(90_000);
            expect(ps.offenseTotals.flankingRate).toBe(60);
            expect(ps.offenseTotals.glanceRate).toBe(12);
            expect(ps.offenseTotals.againstDownedDamage).toBe(45_000);
            expect(ps.offenseTotals.appliedCrowdControl).toBe(30);
            expect(ps.offenseTotals.appliedCrowdControlDuration).toBe(15_000);
        });

        it('takes the whole-fight figure once, not once per target', () => {
            const one = aggregate([makePlayer([axilogStatsTarget()])]);
            const three = aggregate([makePlayer([axilogStatsTarget(), axilogStatsTarget(), axilogStatsTarget()])]);
            expect(three.offenseTotals.criticalDmg).toBe(one.offenseTotals.criticalDmg);
        });

        it('pairs each rate with its own whole-fight denominator', () => {
            const ps = aggregate([makePlayer([axilogStatsTarget()])]);
            // criticalRate / critableDirectDamageCount, per OFFENSE_METRICS.
            expect(ps.offenseRateWeights.criticalRate).toBe(250);
            // flankingRate + glanceRate / connectedDirectDamageCount.
            expect(ps.offenseRateWeights.flankingRate).toBe(300);
            expect(ps.offenseRateWeights.glanceRate).toBe(300);
        });

        it('leaves the 7 columns statsAll[0] cannot supply at 0', () => {
            const ps = aggregate([makePlayer([axilogStatsTarget()])]);
            for (const id of ['directDmg', 'missed', 'evaded', 'blocked', 'invulned',
                'appliedCrowdControlDownContribution', 'appliedCrowdControlDurationDownContribution']) {
                expect(ps.offenseTotals[id] || 0).toBe(0);
            }
        });

        it('does not disturb the per-target fields axilog does emit', () => {
            const ps = aggregate([makePlayer([axilogStatsTarget(), axilogStatsTarget()])]);
            // Summed over both targets, not read from statsAll.
            expect(ps.offenseTotals.connectedDamageCount).toBe(400);
            expect(ps.offenseTotals.interrupts).toBe(6);
            expect(ps.offenseTotals.killed).toBe(2);
            expect(ps.offenseTotals.downed).toBe(2);
        });
    });

    describe('elite-insights backend (per-target fields present)', () => {
        it('is inert: a real per-target zero stays zero', () => {
            // The whole point of gating on presence rather than value. EI's
            // aggregate "Enemy Players" target reports a genuine 0 here while
            // statsAll[0] — which also counts NPCs, guards and siege — does
            // not. A value-based fallback would report 90,000 crit damage
            // against enemy players the log says there was none.
            const ps = aggregate([makePlayer([eiStatsTarget()])]);

            expect(ps.offenseTotals.criticalDmg).toBe(0);
            expect(ps.offenseTotals.criticalRate).toBe(0);
            expect(ps.offenseTotals.flankingRate).toBe(0);
            expect(ps.offenseTotals.glanceRate).toBe(0);
            expect(ps.offenseTotals.againstDownedDamage).toBe(0);
            expect(ps.offenseTotals.appliedCrowdControl).toBe(0);
            expect(ps.offenseTotals.appliedCrowdControlDuration).toBe(0);
            // Present and non-zero: summed per target, not from statsAll's 300.
            expect(ps.offenseTotals.connectedDirectDamageCount).toBe(150);
        });

        it('still sums non-zero per-target values across targets', () => {
            const ps = aggregate([makePlayer([
                eiStatsTarget({ criticalDmg: 1_000, critableDirectDamageCount: 10 }),
                eiStatsTarget({ criticalDmg: 2_000, critableDirectDamageCount: 20 }),
            ])]);
            expect(ps.offenseTotals.criticalDmg).toBe(3_000);
            expect(ps.offenseRateWeights.criticalRate).toBe(30);
        });
    });

    it('falls back for a player with no statsTargets at all', () => {
        const ps = aggregate([makePlayer([])]);
        expect(ps.offenseTotals.criticalDmg).toBe(90_000);
        expect(ps.offenseTotals.directDmg || 0).toBe(0);
    });
});
