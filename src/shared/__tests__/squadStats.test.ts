import { describe, it, expect } from 'vitest';
import { computeSquadStat } from '../squadStats';

const players = (vals: number[]) =>
  vals.map((value, i) => ({ account: `P${i}`, value, profession: 'Guardian' }));

describe('computeSquadStat', () => {
  it('computes mean, population stdDev, min, max, count', () => {
    const s = computeSquadStat(players([2, 4, 4, 4, 5, 5, 7, 9]), true);
    expect(s.mean).toBe(5);
    expect(s.stdDev).toBeCloseTo(2, 5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
    expect(s.count).toBe(8);
  });

  it('sorts players ascending for the dot-plot', () => {
    const s = computeSquadStat(players([9, 1, 5]), true);
    expect(s.players.map((p) => p.value)).toEqual([1, 5, 9]);
  });

  it('flags LOW outliers when higherIsBetter (low end needs improvement)', () => {
    // mean 100, one player far below
    const s = computeSquadStat(players([100, 100, 100, 100, 0]), true, 1.5);
    expect(s.needsImprovementOutliers.map((p) => p.value)).toEqual([0]);
  });

  it('flags HIGH outliers when NOT higherIsBetter (e.g. deaths/damage taken)', () => {
    const s = computeSquadStat(players([0, 0, 0, 0, 100]), false, 1.5);
    expect(s.needsImprovementOutliers.map((p) => p.value)).toEqual([100]);
  });

  it('never flags the celebrated end as needs-improvement', () => {
    // higherIsBetter: a single very HIGH player must NOT be an outlier
    const s = computeSquadStat(players([0, 0, 0, 0, 100]), true, 1.5);
    expect(s.needsImprovementOutliers).toEqual([]);
  });

  it('returns no outliers when stdDev is 0 (all equal)', () => {
    const s = computeSquadStat(players([3, 3, 3]), true);
    expect(s.stdDev).toBe(0);
    expect(s.needsImprovementOutliers).toEqual([]);
  });

  it('handles single player and empty input safely', () => {
    const single = computeSquadStat(players([42]), true);
    expect(single.mean).toBe(42);
    expect(single.stdDev).toBe(0);
    expect(single.needsImprovementOutliers).toEqual([]);

    const empty = computeSquadStat([], true);
    expect(empty.count).toBe(0);
    expect(empty.mean).toBe(0);
    expect(empty.players).toEqual([]);
    expect(empty.needsImprovementOutliers).toEqual([]);
  });

  it('ignores non-finite values', () => {
    const s = computeSquadStat(
      [{ account: 'A', value: 10 }, { account: 'B', value: NaN }, { account: 'C', value: 20 }],
      true,
    );
    expect(s.count).toBe(2);
    expect(s.mean).toBe(15);
  });
});
