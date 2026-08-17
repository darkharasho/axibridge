import { describe, it, expect } from 'vitest';
import { computeMatchup } from '../matchup';
import type { DPSReportJSON, Player } from '../../dpsReportTypes';

function mkEnemy(teamID: number): any {
  return { name: 'Tempest pl-1', isFake: false, enemyPlayer: true, teamID, dpsAll: [{ damage: 0 }] };
}
function mkSquad(teamID: number): any {
  return { notInSquad: false, teamID, combatReplayData: { dead: [] }, statsAll: [{}] };
}

const base: Partial<DPSReportJSON> = { players: [], targets: [], durationMS: 10000 };

describe('computeMatchup team colors', () => {
  it('uses the authoritative wvWMapData when present', () => {
    const squad = [mkSquad(50)] as unknown as Player[];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(60), mkEnemy(70)],
      wvWMapData: { redTeamID: 60, greenTeamID: 70, blueTeamID: 50 },
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad, [], 300, 10, null);
    const colors = Object.fromEntries(m.enemyByTeam.map((t) => [t.teamID, t.color]));
    expect(colors[60]).toBe('red');
    expect(colors[70]).toBe('green');
    expect(m.squadColor).toBe('blue');
  });

  it('falls back to the fixed table without wvWMapData', () => {
    const squad = [mkSquad(433)] as unknown as Player[];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(707), mkEnemy(2767)],
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad, [], 300, 10, null);
    const colors = Object.fromEntries(m.enemyByTeam.map((t) => [t.teamID, t.color]));
    expect(colors[707]).toBe('red');
    expect(colors[2767]).toBe('green');
    expect(m.squadColor).toBe('blue');
  });

  it('returns null squadColor when squad players have no team id', () => {
    const squad = [{ notInSquad: false, combatReplayData: { dead: [] }, statsAll: [{}] }] as unknown as Player[];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(707)],
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad, [], 300, 10, null);
    expect(m.squadColor).toBeNull();
    expect(m.enemyByTeam.find((t) => t.teamID === 707)?.color).toBe('red');
  });
});

describe('computeMatchup distinct-player counts', () => {
  // arcdps emits a new players[] entry per agent instance, so one person who
  // relogs/build-swaps mid-fight can appear as several entries. squadCount/
  // alliesCount must count distinct people, not raw entries.
  function mkPerson(account: string, overrides: Record<string, unknown> = {}): any {
    return {
      account,
      notInSquad: false,
      teamID: 50,
      combatReplayData: { dead: [] },
      statsAll: [{}],
      activeTimes: [1000],
      ...overrides,
    };
  }

  it('collapses duplicate-account squad entries to distinct people', () => {
    // Same account relogged twice mid-fight -> 3 raw entries, 2 distinct people.
    const squad = [
      mkPerson('Alice.1111', { activeTimes: [5000] }),
      mkPerson('Alice.1111', { activeTimes: [3000] }),
      mkPerson('Bob.2222'),
    ];
    const json = { ...base, players: squad, targets: [mkEnemy(60)] } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad as unknown as Player[], [], 300, 10, null);
    expect(m.squadCount).toBe(2);
  });

  it('collapses duplicate-account pug (ally) entries to distinct people', () => {
    const pug = [
      mkPerson('Carol.3333', { notInSquad: true }),
      mkPerson('Carol.3333', { notInSquad: true }),
      mkPerson('Dave.4444', { notInSquad: true }),
    ];
    const json = { ...base, players: pug, targets: [mkEnemy(60)] } as unknown as DPSReportJSON;
    const m = computeMatchup(json, [] as unknown as Player[], [], 300, 10, null);
    expect(m.alliesCount).toBe(2);
  });

  it('effectiveRatio uses distinct-person squad+allies counts, not raw entry counts', () => {
    const squad = [
      mkPerson('Alice.1111'),
      mkPerson('Alice.1111'), // duplicate entry, same person
    ];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(60), mkEnemy(60)], // enemyPeak = 2
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad as unknown as Player[], [], 300, 10, null);
    expect(m.squadCount).toBe(1);
    expect(m.effectiveRatio).toBeCloseTo(0.5, 5); // 1/2, not 2/2
  });

  it('does not change enemy counts', () => {
    const squad = [mkPerson('Alice.1111'), mkPerson('Alice.1111')];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(60), mkEnemy(60), mkEnemy(60)],
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad as unknown as Player[], [], 300, 10, null);
    expect(m.enemyCount).toBe(3);
    expect(m.enemyPeak).toBe(3);
  });
});

describe('computeMatchup inTagBubbleAtEngage', () => {
  // `tagPct` = inTagBubbleAtEngage / squadCount, so the numerator must be a
  // distinct-person count. Native tracks are one per entity and keyed by
  // account, so the dedupe is the Set — arcdps duplicate `players[]` entries
  // cannot inflate it the way they could on the EI path.
  function mkPlayer(account: string): any {
    return { account, notInSquad: false, teamID: 50, statsAll: [{}], activeTimes: [1000] };
  }
  // Engage is sampled at t = min(2, duration) = 2s; the track must cover it.
  const trackAt = (key: string, x: number, y: number) => ({
    key,
    track: {
      entityId: 0,
      samples: Array.from({ length: 11 }, (_, i) => [i * 300, x, y] as [number, number, number]),
      down: [], dead: [], dc: [],
    },
  });

  it('counts each distinct member once', () => {
    const squad = [mkPlayer('Alice.1111'), mkPlayer('Alice.1111'), mkPlayer('Bob.2222')];
    const json = { ...base, players: squad, targets: [] } as unknown as DPSReportJSON;
    const tracks = [trackAt('Alice.1111', 0, 0), trackAt('Bob.2222', 100, 0)];
    const m = computeMatchup(json, squad as unknown as Player[], tracks as any, 300, 10, null);
    expect(m.squadCount).toBe(2);
    expect(m.inTagBubbleAtEngage).toBe(2);
  });

  it('excludes a member outside the 600u tag bubble', () => {
    // Impossible to assert before this unit: distances were replay PIXELS, so
    // 600 spanned ~70,000 game units and every member always counted.
    // Two members stacked at the origin, one 4000u east. Centroid sits at
    // x≈1333, leaving the stragglers 1333u out and the far one 2667u out —
    // so nobody is within 600u and the count is 0, not 3.
    const squad = [mkPlayer('A.1'), mkPlayer('B.2'), mkPlayer('C.3')];
    const json = { ...base, players: squad, targets: [] } as unknown as DPSReportJSON;
    const tracks = [trackAt('A.1', 0, 0), trackAt('B.2', 0, 0), trackAt('C.3', 4000, 0)];
    const m = computeMatchup(json, squad as unknown as Player[], tracks as any, 300, 10, null);
    expect(m.inTagBubbleAtEngage).toBe(0);
  });

  it('counts the stacked members when the outlier is close enough to keep the centroid on them', () => {
    // Same shape, but the third member is only 900u out: centroid at x=300,
    // so the two stacked members are 300u from it (inside 600u) and the
    // outlier is 600u away — exactly on the boundary, which counts.
    const squad = [mkPlayer('A.1'), mkPlayer('B.2'), mkPlayer('C.3')];
    const json = { ...base, players: squad, targets: [] } as unknown as DPSReportJSON;
    const tracks = [trackAt('A.1', 0, 0), trackAt('B.2', 0, 0), trackAt('C.3', 900, 0)];
    const m = computeMatchup(json, squad as unknown as Player[], tracks as any, 300, 10, null);
    expect(m.inTagBubbleAtEngage).toBe(3);
  });
});
