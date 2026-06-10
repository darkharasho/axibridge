// src/shared/__tests__/buildBoonLeaderboards.test.ts
import { describe, it, expect } from 'vitest';
import { buildBoonLeaderboards, type BoonTable } from '../boonGeneration';

const mkRow = (account: string, squadGenMs: number) => ({
  account, profession: 'Firebrand', professionList: ['Firebrand'],
  activeTimeMs: 10000, numFights: 1, groupSupported: 6, squadSupported: 6,
  categories: {
    selfBuffs: { generationMs: 0, wastedMs: 0 },
    groupBuffs: { generationMs: 0, wastedMs: 0 },
    squadBuffs: { generationMs: squadGenMs, wastedMs: 0 },
  },
});

const tables: BoonTable[] = [
  { id: 'b1187', name: 'Quickness', stacking: false, rows: [mkRow('A.1', 40000), mkRow('B.2', 20000)] },
  { id: 'b740', name: 'Might', stacking: true, rows: [mkRow('A.1', 200000), mkRow('B.2', 50000)] },
];

describe('buildBoonLeaderboards', () => {
  it('ranks players by squad generation, descending', () => {
    const lbs = buildBoonLeaderboards(tables);
    expect(lbs['b1187'].map((r) => r.account)).toEqual(['A.1', 'B.2']);
    expect(lbs['b1187'][0].rank).toBe(1);
    expect(lbs['b1187'][1].rank).toBe(2);
  });

  it('non-stacking boon value is a uptime percentage', () => {
    const lbs = buildBoonLeaderboards(tables);
    // squadSupported(6) - numFights(1) = 5; denom = 5/1 = 5
    // generationMs/activeTimeMs = 40000/10000 = 4; /denom 5 = 0.8; *100 = 80
    expect(lbs['b1187'][0].value).toBeCloseTo(80, 5);
  });

  it('stacking boon value is average stacks (no percentage)', () => {
    const lbs = buildBoonLeaderboards(tables);
    // 200000/10000 = 20; /5 = 4 stacks
    expect(lbs['b740'][0].value).toBeCloseTo(4, 5);
  });

  it('drops rows with non-finite or zero value', () => {
    const t: BoonTable[] = [{ id: 'b717', name: 'Protection', stacking: false, rows: [mkRow('A.1', 0)] }];
    expect(buildBoonLeaderboards(t)['b717']).toEqual([]);
  });

  it('ties share a rank and the next distinct value uses competition ranking (1,1,3)', () => {
    const t: BoonTable[] = [
      { id: 'b1187', name: 'Quickness', stacking: false, rows: [
        mkRow('A.1', 40000), mkRow('B.2', 40000), mkRow('C.3', 20000),
      ] },
    ];
    const rows = buildBoonLeaderboards(t)['b1187'];
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('breaks value ties by account name ascending', () => {
    const t: BoonTable[] = [
      { id: 'b1187', name: 'Quickness', stacking: false, rows: [
        mkRow('Zed.9', 40000), mkRow('Amy.1', 40000),
      ] },
    ];
    const rows = buildBoonLeaderboards(t)['b1187'];
    expect(rows.map((r) => r.account)).toEqual(['Amy.1', 'Zed.9']);
  });
});
