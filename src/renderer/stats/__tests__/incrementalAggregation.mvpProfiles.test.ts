import { describe, it, expect } from 'vitest';
import { computeStatsSync } from '../incrementalAggregation';
import { DEFAULT_MVP_WEIGHT_PROFILES, DEFAULT_STATS_VIEW_SETTINGS } from '../../global.d';

function player(account: string, over: any = {}) {
  return {
    account, name: account, profession: 'Firebrand', notInSquad: false,
    activeTimes: [60_000], dpsAll: [{ damage: over.damage ?? 1000, breakbarDamage: 0 }],
    statsAll: [{}], support: [{ resurrects: over.revives ?? 0 }],
    statsTargets: [[{ killed: 0, downed: 0 }]],
    defenses: [{ downCount: 0, deadCount: 0, damageTaken: 0, blockedCount: 0, evadedCount: 0, missedCount: 0 }],
  };
}
function makeLog(players: any[]) {
  return { status: 'success', filePath: 'l1', details: { durationMS: 60_000, players, targets: [], skillMap: {}, buffMap: {} } };
}

describe('MVP profiles scoring', () => {
  it('with default profiles, the higher-damage player wins Offensive MVP', () => {
    const logs = [makeLog([ player('hi.1', { damage: 5_000_000 }), player('lo.2', { damage: 1_000 }) ])];
    const { stats } = computeStatsSync({
      logs: logs as any[],
      mvpWeights: DEFAULT_MVP_WEIGHT_PROFILES as any,
      statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, showMvp: true },
    });
    expect(stats.offensiveMvp.account).toBe('hi.1');
  });

  it('zero weights everywhere yields no MVP', () => {
    const logs = [makeLog([player('a.1', { damage: 5_000_000 })])];
    const { stats } = computeStatsSync({
      logs: logs as any[],
      mvpWeights: { general: {}, offensive: {}, defensive: {} } as any,
      statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, showMvp: true },
    });
    expect(stats.offensiveMvp.account).toBe('None');
  });
});
