import { describe, expect, it } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

/**
 * Rate columns in Offense Detailed divide a per-target numerator by a
 * per-target denominator. axilog reports the numerators (`criticalRate` is a
 * count of critical hits) but NOT every denominator: `critableDirectDamageCount`
 * is emitted on `statsAll[0]` only, never per target. That made Critical Rate
 * render a hard 0.00% for every player — numerator summed fine, denominator
 * summed to nothing, so the rate weight stayed 0.
 *
 * The fallback substitutes numerator AND denominator together from the
 * whole-fight `statsAll[0]`, and only when NO target reported the denominator
 * field at all. Presence, never value: Elite Insights emits the full per-target
 * set with zeroes included, so a real zero stays zero there.
 */

/** Whole-fight figures. Present on both backends. */
const STATS_ALL = {
    connectedDamageCount: 400,
    connectedDirectDamageCount: 300,
    critableDirectDamageCount: 250,
    criticalRate: 125,
    flankingRate: 60,
};

/** axilog 0.3.9: per-target numerators, no `critableDirectDamageCount`. */
const axilogStatsTarget = (over: any = {}) => [{
    connectedDamageCount: 200,
    connectedDirectDamageCount: 150,
    criticalRate: 40,
    flankingRate: 20,
    downed: 0,
    killed: 0,
    ...over,
}];

/** Elite Insights: every field present, zeroes included. */
const eiStatsTarget = (over: any = {}) => [{
    ...axilogStatsTarget()[0],
    critableDirectDamageCount: 120,
    ...over,
}];

const makePlayer = (statsTargets: any, statsAllOver: any = {}) => ({
    account: 'TestPlayer.1234',
    name: 'TestCharacter',
    profession: 'Guardian',
    notInSquad: false,
    activeTimes: [60_000],
    dpsAll: [{ damage: 100_000, dps: 1_667 }],
    statsAll: [{ ...STATS_ALL, ...statsAllOver }],
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
        validLogs: [makeLog(players)] as any,
        method: 'count' as const,
        skillDamageSource: 'target',
        splitPlayersByClass: false,
    });
    const ps = playerStats.get('TestPlayer.1234');
    expect(ps).toBeTruthy();
    return ps!;
};

describe('Offense rate denominator fallback', () => {
    describe('axilog backend (denominator absent per target)', () => {
        it('takes Critical Rate numerator and denominator from statsAll[0]', () => {
            const ps = aggregate([makePlayer([axilogStatsTarget(), axilogStatsTarget()])]);
            expect(ps.offenseTotals.criticalRate).toBe(125);
            expect(ps.offenseRateWeights.criticalRate).toBe(250);
        });

        it('takes the whole-fight figure once, not once per target', () => {
            const one = aggregate([makePlayer([axilogStatsTarget()])]);
            const three = aggregate([makePlayer([axilogStatsTarget(), axilogStatsTarget(), axilogStatsTarget()])]);
            expect(three.offenseRateWeights.criticalRate).toBe(one.offenseRateWeights.criticalRate);
            expect(three.offenseTotals.criticalRate).toBe(one.offenseTotals.criticalRate);
        });

        it('leaves rates whose denominator IS reported per target alone', () => {
            const ps = aggregate([makePlayer([axilogStatsTarget(), axilogStatsTarget()])]);
            // flankingRate divides by connectedDirectDamageCount, which axilog
            // does report per target — no substitution.
            expect(ps.offenseTotals.flankingRate).toBe(40);
            expect(ps.offenseRateWeights.flankingRate).toBe(300);
        });

        it('does not substitute when statsAll[0] lacks the denominator either', () => {
            const ps = aggregate([makePlayer([axilogStatsTarget()], { critableDirectDamageCount: undefined })]);
            expect(ps.offenseTotals.criticalRate).toBe(40);
            expect(ps.offenseRateWeights.criticalRate ?? 0).toBe(0);
        });
    });

    describe('Elite Insights backend (denominator present per target)', () => {
        it('sums the per-target denominator and never substitutes', () => {
            const ps = aggregate([makePlayer([eiStatsTarget(), eiStatsTarget()])]);
            expect(ps.offenseTotals.criticalRate).toBe(80);
            expect(ps.offenseRateWeights.criticalRate).toBe(240);
        });

        it('keeps a real per-target zero at zero', () => {
            const ps = aggregate([makePlayer([eiStatsTarget({ criticalRate: 0, critableDirectDamageCount: 0 })])]);
            expect(ps.offenseTotals.criticalRate).toBe(0);
            expect(ps.offenseRateWeights.criticalRate ?? 0).toBe(0);
        });
    });

    it('does not substitute for a fight with no tracked target roster', () => {
        // An absent roster is not axilog's field-subset shape; substituting
        // there would swap in statsAll's NPC/guard/siege-inclusive totals with
        // nothing to justify them.
        const ps = aggregate([makePlayer([])]);
        expect(ps.offenseTotals.criticalRate ?? 0).toBe(0);
        expect(ps.offenseRateWeights.criticalRate ?? 0).toBe(0);
    });
});
