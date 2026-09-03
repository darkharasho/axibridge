import { describe, it, expect } from 'vitest';
import {
    ingestLogEnemyAttention,
    finalizeEnemyAttention,
    type EnemyAttentionIngest,
} from '../computeEnemyAttention';

/** A native-shaped log carrying a focus block for a post-rework build. */
const makeLog = (opts: {
    build?: string;
    filePath?: string;
    squad?: Array<{ id: number; account: string; elite_spec?: string; commander?: boolean }>;
    focus?: any;
}) => {
    const squad = opts.squad ?? [];
    return {
        filePath: opts.filePath ?? 'fight-a.zevtc',
        details: {
            native: {
                encounter: { build: opts.build ?? '20260816' },
                entities: squad.map(p => ({
                    id: p.id, role: 'squad', account: p.account,
                    elite_spec: p.elite_spec ?? 'Firebrand',
                    ...(p.commander ? { commander: { segments: [[0, 1000]] } } : {}),
                })),
                blocks: opts.focus === undefined ? {} : { focus: opts.focus },
            },
        },
    };
};

const focusBlock = (squadSize: number, totalCasts: number, rows: Record<string, any>) => ({
    squad_size: squadSize,
    total_casts: totalCasts,
    total_minion_casts: 0,
    pre_down_window_ms: 3000,
    by_entity: rows,
});

describe('ingestLogEnemyAttention', () => {
    it('reports a pre-rework fight as unmeasurable even when a zeroed block is present', () => {
        // axilog 1.11.0 emitted a full zeroed roster for these logs. Treating it
        // as data would report "nobody was focused" for a fight that structurally
        // cannot say — the exact confusion this guard exists to prevent.
        const log = makeLog({
            build: '20260114',
            squad: [{ id: 1, account: 'A.1111' }, { id: 2, account: 'B.2222' }],
            focus: focusBlock(2, 0, { 1: { casts_drawn: 0, focus_index: 0, downs: 0, pre_down_casts: 0 } }),
        });
        const ingest = ingestLogEnemyAttention(log, 0);
        expect(ingest.measurable).toBe(false);
        expect(ingest.contributions).toHaveLength(0);
    });

    it('treats a malformed build as pre-rework rather than guessing', () => {
        const log = makeLog({ build: 'not-a-build', squad: [{ id: 1, account: 'A.1111' }], focus: focusBlock(1, 5, {}) });
        expect(ingestLogEnemyAttention(log, 0).measurable).toBe(false);
    });

    it('gives every squad member a contribution, including one with no focus row', () => {
        // A squad member the enemy never aimed at still played the fight and
        // still shares its fair-share denominator; dropping them would inflate
        // everyone else's index.
        const log = makeLog({
            squad: [{ id: 1, account: 'A.1111' }, { id: 2, account: 'B.2222' }],
            focus: focusBlock(2, 10, { 1: { casts_drawn: 10, focus_index: 2, downs: 1, pre_down_casts: 4 } }),
        });
        const ingest = ingestLogEnemyAttention(log, 0);
        expect(ingest.measurable).toBe(true);
        expect(ingest.contributions).toHaveLength(2);
        expect(ingest.contributions.map(c => c.fairShare)).toEqual([5, 5]);
        expect(ingest.contributions.find(c => c.account === 'B.2222')!.castsDrawn).toBe(0);
    });

    it('reads the minion axis when axilog supplies it, and 0 when it does not', () => {
        const withMinions = ingestLogEnemyAttention(makeLog({
            squad: [{ id: 1, account: 'A.1111' }],
            focus: focusBlock(1, 4, { 1: { casts_drawn: 4, casts_drawn_minions: 7, downs: 0, pre_down_casts: 0 } }),
        }), 0);
        expect(withMinions.contributions[0].castsDrawnMinions).toBe(7);

        // axilog 1.11.0 has no such field; absent must read as 0, not NaN.
        const without = ingestLogEnemyAttention(makeLog({
            squad: [{ id: 1, account: 'A.1111' }],
            focus: focusBlock(1, 4, { 1: { casts_drawn: 4, downs: 0, pre_down_casts: 0 } }),
        }), 0);
        expect(without.contributions[0].castsDrawnMinions).toBe(0);
    });
});

describe('finalizeEnemyAttention', () => {
    const twoFights = (): EnemyAttentionIngest[] => [
        // Fight 1: 10-player squad, 100 aimed casts -> fair share 10.
        ingestLogEnemyAttention(makeLog({
            filePath: 'f1', squad: [{ id: 1, account: 'TAG.1111', commander: true }, { id: 2, account: 'B.2222' }],
            focus: focusBlock(10, 100, {
                1: { casts_drawn: 30, downs: 2, pre_down_casts: 12 },
                2: { casts_drawn: 5, downs: 1, pre_down_casts: 1 },
            }),
        }), 0),
        // Fight 2: 5-player squad, 10 aimed casts -> fair share 2.
        ingestLogEnemyAttention(makeLog({
            filePath: 'f2', squad: [{ id: 1, account: 'TAG.1111', commander: true }, { id: 2, account: 'B.2222' }],
            focus: focusBlock(5, 10, {
                1: { casts_drawn: 6, downs: 0, pre_down_casts: 0 },
                2: { casts_drawn: 1, downs: 1, pre_down_casts: 3 },
            }),
        }), 1),
    ];

    it('pools by summing casts and fair shares, never by averaging indices', () => {
        // Per-fight indices for the tag are 3.0 and 3.0, so a mean would also be
        // 3.0 and prove nothing. Fight 2 is deliberately tiny: the correct
        // pooled answer is 36/12 = 3.0 exactly, while an unweighted mean of
        // per-fight indices would drift as soon as the fights differ in size.
        const r = finalizeEnemyAttention(twoFights());
        const tag = r.rows.find(x => x.account === 'TAG.1111')!;
        expect(tag.castsDrawn).toBe(36);
        expect(tag.focusIndex).toBeCloseTo(36 / 12, 10);
        expect(tag.isCommander).toBe(true);

        const other = r.rows.find(x => x.account === 'B.2222')!;
        expect(other.focusIndex).toBeCloseTo(6 / 12, 10);
        // The tag drew six times the attention of the other player.
        expect(tag.focusIndex / other.focusIndex).toBeCloseTo(6, 10);
    });

    it('excludes unmeasurable fights from every ratio instead of zeroing them in', () => {
        const withOld = [
            ...twoFights(),
            ingestLogEnemyAttention(makeLog({
                filePath: 'f3', build: '20260114',
                squad: [{ id: 1, account: 'TAG.1111', commander: true }, { id: 2, account: 'B.2222' }],
                focus: focusBlock(2, 0, {}),
            }), 2),
        ];
        const r = finalizeEnemyAttention(withOld);
        expect(r.measuredFightCount).toBe(2);
        expect(r.unmeasuredFightCount).toBe(1);

        const tag = r.rows.find(x => x.account === 'TAG.1111')!;
        // Unchanged from the two-fight case: the old log neither adds casts nor
        // dilutes the denominator.
        expect(tag.fightCount).toBe(2);
        expect(tag.focusIndex).toBeCloseTo(3, 10);
    });

    it('carries the pre-down window off the document and reports per-down rates', () => {
        const r = finalizeEnemyAttention(twoFights());
        expect(r.preDownWindowMs).toBe(3000);
        const tag = r.rows.find(x => x.account === 'TAG.1111')!;
        expect(tag.downs).toBe(2);
        expect(tag.preDownCasts).toBe(12);
        expect(tag.preDownPerDown).toBeCloseTo(6, 10);
    });

    it('is empty, not measured-as-zero, when nothing loaded can be measured', () => {
        const r = finalizeEnemyAttention([
            { measurable: false, preDownWindowMs: 0, label: '', contributions: [] },
            { measurable: false, preDownWindowMs: 0, label: '', contributions: [] },
        ]);
        expect(r.rows).toHaveLength(0);
        expect(r.measuredFightCount).toBe(0);
        expect(r.unmeasuredFightCount).toBe(2);
    });

    it('sorts most-focused first and keeps a per-player profession list', () => {
        const r = finalizeEnemyAttention(twoFights());
        expect(r.rows[0].account).toBe('TAG.1111');
        expect(r.rows[0].professionList).toEqual(['Firebrand']);
        expect(r.totalCasts).toBe(42);
    });
});
