import { describe, it, expect } from 'vitest';
import { finalizePinPressure, MIN_OTHER_DOWNS, type PinPressureResult } from '../computePinPressure';
import type { EnemyAttentionContribution, EnemyAttentionIngest } from '../computeEnemyAttention';

type Member = { account: string; downs: number; preDownCasts: number; isCommander?: boolean };

const contribution = (fightId: string, m: Member): EnemyAttentionContribution => ({
    account: m.account,
    profession: 'Firebrand',
    isCommander: !!m.isCommander,
    fightId,
    castsDrawn: 0,
    castsDrawnMinions: 0,
    downs: m.downs,
    preDownCasts: m.preDownCasts,
    fairShare: 1,
});

const fight = (fightId: string, label: string, members: Member[]): EnemyAttentionIngest => ({
    measurable: true,
    preDownWindowMs: 3000,
    label,
    contributions: members.map(m => contribution(fightId, m)),
});

/** `count` identical non-tag members, so a fight clears MIN_OTHER_DOWNS. */
const squad = (count: number, downs: number, preDownCasts: number): Member[] =>
    Array.from({ length: count }, (_, i) => ({ account: `Squad.${i}`, downs, preDownCasts }));

const unmeasurable = (): EnemyAttentionIngest =>
    ({ measurable: false, preDownWindowMs: 0, label: '', contributions: [] });

describe('finalizePinPressure', () => {
    it('scores a fight against the squad’s own pre-down rate, not an absolute band', () => {
        // Tag: 12 casts over 2 downs = 6.0/down. Squad: 6 members, 1 down and
        // 2 casts each = 2.0/down. The tag drew 3x what the squad drew.
        const r = finalizePinPressure([
            fight('a.zevtc', 'Eternal: Bay (2:31)', [
                { account: 'Tag.1234', downs: 2, preDownCasts: 12, isCommander: true },
                ...squad(6, 1, 2),
            ]),
        ]);
        expect(r.comparableFightCount).toBe(1);
        const f = r.fights[0];
        expect(f.comparable).toBe(true);
        expect(f.label).toBe('Eternal: Bay (2:31)');
        expect(f.tagPerDown).toBeCloseTo(6);
        expect(f.otherPerDown).toBeCloseTo(2);
        expect(f.ratio).toBeCloseTo(3);
        expect(f.band).toBe('focused');
    });

    it('bands only above the measured thresholds', () => {
        const at = (tagCasts: number) => finalizePinPressure([
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 1, preDownCasts: tagCasts, isCommander: true },
                ...squad(6, 1, 2),
            ]),
        ]).fights[0].band;
        expect(at(2)).toBe('normal');      // 1.0x
        expect(at(3)).toBe('normal');      // 1.5x
        expect(at(4)).toBe('focused');     // 2.0x
        expect(at(8)).toBe('converged');   // 4.0x
    });

    it('refuses to score a fight the tag survived, and says so as a separate count', () => {
        const r = finalizePinPressure([
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 0, preDownCasts: 0, isCommander: true },
                ...squad(6, 1, 2),
            ]),
        ]);
        expect(r.comparableFightCount).toBe(0);
        expect(r.noComparisonFightCount).toBe(1);
        // 0 is the absence of a ratio here, and the section must not print it.
        expect(r.fights[0].comparable).toBe(false);
        expect(r.fights[0].ratio).toBe(0);
        expect(r.fights[0].tagDowns).toBe(0);
    });

    it(`refuses to score against fewer than ${MIN_OTHER_DOWNS} other downs`, () => {
        // The baseline is a per-down average over the rest of the squad; built
        // from four samples it swings hard enough to invent a finding.
        const under = finalizePinPressure([
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 20, isCommander: true },
                ...squad(MIN_OTHER_DOWNS - 1, 1, 2),
            ]),
        ]);
        expect(under.comparableFightCount).toBe(0);
        expect(under.noComparisonFightCount).toBe(1);

        const at = finalizePinPressure([
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 20, isCommander: true },
                ...squad(MIN_OTHER_DOWNS, 1, 2),
            ]),
        ]);
        expect(at.comparableFightCount).toBe(1);
    });

    it('does not divide by a squad that drew no aimed casts before its downs', () => {
        const r = finalizePinPressure([
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 9, isCommander: true },
                ...squad(6, 1, 0),
            ]),
        ]);
        expect(r.fights[0].comparable).toBe(false);
        expect(Number.isFinite(r.fights[0].ratio)).toBe(true);
        expect(r.fights[0].ratio).toBe(0);
        expect(r.pooledRatio).toBe(0);
    });

    it('pools the session ratio rather than averaging per-fight ratios', () => {
        // Fight A: tag 1 down / 10 casts (10.0). Fight B: tag 5 downs / 10 casts
        // (2.0). Squad baseline is 2.0 in both. A mean of the two per-fight
        // ratios is (5.0 + 1.0) / 2 = 3.0; pooling is 20/6 over 2.0 = 1.67,
        // which is the honest one — fight B carries five times the evidence.
        const r: PinPressureResult = finalizePinPressure([
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 10, isCommander: true },
                ...squad(6, 1, 2),
            ]),
            fight('b.zevtc', 'B', [
                { account: 'Tag.1234', downs: 5, preDownCasts: 10, isCommander: true },
                ...squad(6, 1, 2),
            ]),
        ]);
        expect(r.pooledTagPerDown).toBeCloseTo(20 / 6);
        expect(r.pooledOtherPerDown).toBeCloseTo(2);
        expect(r.pooledRatio).toBeCloseTo((20 / 6) / 2);
        expect(r.focusedFightCount).toBe(1);
    });

    it('excludes a pre-rework fight rather than scoring it as calm', () => {
        const r = finalizePinPressure([
            unmeasurable(),
            unmeasurable(),
            fight('a.zevtc', 'A', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 8, isCommander: true },
                ...squad(6, 1, 2),
            ]),
        ]);
        expect(r.unmeasuredFightCount).toBe(2);
        expect(r.comparableFightCount).toBe(1);
        expect(r.noComparisonFightCount).toBe(0);
        expect(r.pooledRatio).toBeCloseTo(4);
    });

    it('drops a tagless fight instead of counting it as unscorable', () => {
        const r = finalizePinPressure([fight('a.zevtc', 'A', squad(6, 1, 2))]);
        expect(r.fights).toHaveLength(0);
        expect(r.noComparisonFightCount).toBe(0);
        expect(r.unmeasuredFightCount).toBe(0);
    });

    it('sorts scored fights first, hardest convergence first', () => {
        const r = finalizePinPressure([
            fight('mild.zevtc', 'Mild', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 2, isCommander: true },
                ...squad(6, 1, 2),
            ]),
            fight('none.zevtc', 'None', [
                { account: 'Tag.1234', downs: 0, preDownCasts: 0, isCommander: true },
                ...squad(6, 1, 2),
            ]),
            fight('hard.zevtc', 'Hard', [
                { account: 'Tag.1234', downs: 1, preDownCasts: 12, isCommander: true },
                ...squad(6, 1, 2),
            ]),
        ]);
        expect(r.fights.map(f => f.label)).toEqual(['Hard', 'Mild', 'None']);
    });

    it('reads the pre-down window off the document instead of hardcoding it', () => {
        const custom = fight('a.zevtc', 'A', [
            { account: 'Tag.1234', downs: 1, preDownCasts: 8, isCommander: true },
            ...squad(6, 1, 2),
        ]);
        const r = finalizePinPressure([{ ...custom, preDownWindowMs: 5000 }]);
        expect(r.preDownWindowMs).toBe(5000);
    });
});
