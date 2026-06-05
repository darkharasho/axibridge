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
});
