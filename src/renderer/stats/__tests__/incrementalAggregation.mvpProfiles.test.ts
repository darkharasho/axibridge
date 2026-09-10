import { describe, it, expect } from 'vitest';
import { computeStatsSync } from '../incrementalAggregation';
import { DEFAULT_MVP_WEIGHT_PROFILES, DEFAULT_STATS_VIEW_SETTINGS } from '../../global.d';

function player(account: string, over: any = {}) {
  return {
    account, name: account, profession: 'Firebrand', notInSquad: false,
    activeTimes: [60_000], dpsAll: [{ damage: over.damage ?? 1000, breakbarDamage: 0 }],
    statsAll: [{ downContribution: over.downContribution ?? 0 }], support: [{ resurrects: over.revives ?? 0 }],
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

  it('MVP reason and top stats lead with the heaviest weighted contribution, not raw ratio', () => {
    // winner.1 is squad-best in BOTH stats (ratio 1.0 each). With downContrib
    // weighted 1.0 vs damage 0.05, the card must headline Down Contribution —
    // a raw-ratio sort would tie and fall back to alphabetical ("Damage").
    const logs = [makeLog([
      player('winner.1', { damage: 1_000_000, downContribution: 500_000 }),
      player('runner.2', { damage: 200_000, downContribution: 100_000 }),
    ])];
    const { stats } = computeStatsSync({
      logs: logs as any[],
      mvpWeights: { general: {}, offensive: { downContrib: 1, damage: 0.05 }, defensive: {} } as any,
      statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, showMvp: true },
    });
    expect(stats.offensiveMvp.account).toBe('winner.1');
    expect(stats.offensiveMvp.reason).toBe('Down Contribution');
    expect(stats.offensiveMvp.topStats[0].name).toBe('Down Contribution');
  });

  it('does not score revives for a player whose completed count is unknown', () => {
    // `revives` carries a DEFAULT defensive weight of 0.7, so this fires for a
    // user who never opened MVP settings, on any mixed-coverage log set.
    //
    // nocover.2 attended a log with no replay/rotation data: 12 resurrect
    // ATTEMPTS, completed revives unknown (null). cover.1 attended a covered log
    // and completed 1 revive, which is the best-completed denominator. Scoring
    // nocover.2's attempts against it gave ratio 12 -> 12 x 0.7 = 8.4, where
    // every other metric in the sum is bounded by 1.0 x weight, handing the
    // Defensive MVP to the player we cannot measure.
    const reviver = (account: string, over: any) => ({ ...player(account, over), ...over.extra });
    const coveredLog = {
      status: 'success', filePath: 'covered.zevtc',
      details: { durationMS: 60_000, skillMap: {}, buffMap: {}, targets: [], players: [
        reviver('cover.1', { revives: 1, extra: {
          combatReplayData: { down: [], dead: [] },
          rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }],
        } }),
        reviver('downed.3', { extra: {
          combatReplayData: { down: [[1000, 5000]], dead: [] }, rotation: [],
        } }),
      ] },
    };
    const uncoveredLog = {
      status: 'success', filePath: 'uncovered.zevtc',
      details: { durationMS: 60_000, skillMap: {}, buffMap: {}, targets: [],
        players: [player('nocover.2', { revives: 12 })] },
    };

    const { stats } = computeStatsSync({
      logs: [coveredLog, uncoveredLog] as any[],
      mvpWeights: DEFAULT_MVP_WEIGHT_PROFILES as any,
      statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, showMvp: true },
    });

    // The completed leaderboard has a single, low best: 1.
    expect((stats as any).leaderboards.revivesCompleted).toEqual([
      expect.objectContaining({ account: 'cover.1', value: 1 }),
    ]);
    expect(stats.defensiveMvp.account).toBe('cover.1');

    const placements = [stats.defensiveMvp, (stats as any).defensiveSilver, (stats as any).defensiveBronze]
      .filter(Boolean) as any[];
    const nocover = placements.find((p) => p.account === 'nocover.2');
    expect(nocover).toBeTruthy();
    // Unknown means ABSENT from scoring, not scored at a capped value.
    expect(nocover.contribs.map((c: any) => c.name)).not.toContain('Revives');
    // And no contribution anywhere exceeds its weight's 1.0 ceiling.
    for (const placement of placements) {
      for (const contrib of placement.contribs) expect(contrib.ratio).toBeLessThanOrEqual(1);
    }
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
