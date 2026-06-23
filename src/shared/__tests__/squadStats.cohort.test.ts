import { describe, it, expect } from 'vitest';
import { computeCohortStat, type CohortStatPlayer } from '../squadStats';

// 5 damage players with high down-contrib, 4 support players with low down-contrib.
const downContribSquad: CohortStatPlayer[] = [
  { account: 'D1', value: 40, role: 'damage' },
  { account: 'D2', value: 42, role: 'damage' },
  { account: 'D3', value: 44, role: 'damage' },
  { account: 'D4', value: 46, role: 'damage' },
  { account: 'D5', value: 48, role: 'damage' },
  { account: 'Healer1', value: 3, role: 'support' },
  { account: 'Healer2', value: 4, role: 'support' },
  { account: 'Healer3', value: 5, role: 'support' },
  { account: 'Healer4', value: 4, role: 'support' },
];

describe('computeCohortStat', () => {
  it('does NOT flag a support player on a damage-metric just for being below the squad', () => {
    const s = computeCohortStat(downContribSquad, true);
    const flagged = s.needsImprovementOutliers.map((o) => o.account);
    // None of the healers should be flagged: their low down-contrib is normal AMONG supports.
    expect(flagged).not.toContain('Healer1');
    expect(flagged).not.toContain('Healer2');
    expect(flagged).not.toContain('Healer3');
    expect(flagged).not.toContain('Healer4');
  });

  it('flags a support player who is genuinely low among supports', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'S1', value: 100, role: 'support' },
      { account: 'S2', value: 100, role: 'support' },
      { account: 'S3', value: 100, role: 'support' },
      { account: 'SLow', value: 0, role: 'support' },
    ];
    const s = computeCohortStat(squad, true);
    const low = s.needsImprovementOutliers.find((o) => o.account === 'SLow');
    expect(low).toBeTruthy();
    expect(low!.baseline).toBe('support');
    expect(low!.sigmaGap).toBeGreaterThanOrEqual(1.5);
  });

  it('falls back to squad baseline when a cohort has fewer than 3 players', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'D1', value: 10, role: 'damage' },
      { account: 'D2', value: 10, role: 'damage' },
      { account: 'D3', value: 10, role: 'damage' },
      { account: 'D4', value: 10, role: 'damage' },
      { account: 'S1', value: 9, role: 'support' },   // support cohort size 2 -> fallback
      { account: 'S2', value: 11, role: 'support' },
    ];
    const s = computeCohortStat(squad, true);
    expect(s.support).toBeUndefined();          // too small to be its own baseline
    expect(s.damage).toBeDefined();
    // Every flagged player (if any) must be judged against 'squad' or 'damage', never 'support'.
    for (const o of s.needsImprovementOutliers) expect(o.baseline).not.toBe('support');
  });

  it('uses squad baseline for players with no role', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'A', value: 100 },
      { account: 'B', value: 100 },
      { account: 'C', value: 100 },
      { account: 'NoRoleLow', value: 0 },
    ];
    const s = computeCohortStat(squad, true);
    const low = s.needsImprovementOutliers.find((o) => o.account === 'NoRoleLow');
    expect(low?.baseline).toBe('squad');
  });

  it('flags the HIGH end for lower-is-better metrics (deaths) within cohort', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'D1', value: 1, role: 'damage' },
      { account: 'D2', value: 1, role: 'damage' },
      { account: 'D3', value: 1, role: 'damage' },
      { account: 'DHigh', value: 9, role: 'damage' },
    ];
    const s = computeCohortStat(squad, false); // lower is better
    const hi = s.needsImprovementOutliers.find((o) => o.account === 'DHigh');
    expect(hi).toBeTruthy();
    expect(hi!.baseline).toBe('damage');
  });

  it('populates squad always and both cohort summaries when both are large enough', () => {
    const s = computeCohortStat(downContribSquad, true);
    expect(s.squad.count).toBe(9);
    expect(s.damage?.count).toBe(5);
    expect(s.support?.count).toBe(4);
  });

  it('is safe on empty input', () => {
    const s = computeCohortStat([], true);
    expect(s.squad.count).toBe(0);
    expect(s.needsImprovementOutliers).toEqual([]);
    expect(s.support).toBeUndefined();
    expect(s.damage).toBeUndefined();
  });
});
