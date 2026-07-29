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
    const m = computeMatchup(json, squad, 200, 10);
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
    const m = computeMatchup(json, squad, 200, 10);
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
    const m = computeMatchup(json, squad, 200, 10);
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
    const m = computeMatchup(json, squad as unknown as Player[], 200, 10);
    expect(m.squadCount).toBe(2);
  });

  it('collapses duplicate-account pug (ally) entries to distinct people', () => {
    const pug = [
      mkPerson('Carol.3333', { notInSquad: true }),
      mkPerson('Carol.3333', { notInSquad: true }),
      mkPerson('Dave.4444', { notInSquad: true }),
    ];
    const json = { ...base, players: pug, targets: [mkEnemy(60)] } as unknown as DPSReportJSON;
    const m = computeMatchup(json, [] as unknown as Player[], 200, 10);
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
    const m = computeMatchup(json, squad as unknown as Player[], 200, 10);
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
    const m = computeMatchup(json, squad as unknown as Player[], 200, 10);
    expect(m.enemyCount).toBe(3);
    expect(m.enemyPeak).toBe(3);
  });
});

describe('computeMatchup inTagBubbleAtEngage distinct-person numerator', () => {
  // Position/centroid math is still entry-based (unchanged), but the final
  // "how many are on tag" count must be deduped by identity so it stays
  // comparable to the distinct-person squadCount it's reported against
  // (MatchupSection's tagPct = inTagBubbleAtEngage / squadCount).
  function mkPositioned(account: string, notInSquad = false): any {
    return {
      account,
      notInSquad,
      teamID: 50,
      combatReplayData: { start: 0, dead: [], positions: Array.from({ length: 11 }, () => [0, 0] as [number, number]) },
      statsAll: [{}],
      activeTimes: [1000],
    };
  }

  it('counts a duplicate-account squad member once even when both entries are in the bubble', () => {
    const squad = [
      mkPositioned('Alice.1111'),
      mkPositioned('Alice.1111'), // duplicate entry, also positioned in the bubble
      mkPositioned('Bob.2222'),
    ];
    const json = { ...base, players: squad, targets: [] } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad as unknown as Player[], 200, 10);
    expect(m.squadCount).toBe(2);
    expect(m.inTagBubbleAtEngage).toBe(2); // not 3
  });
});
