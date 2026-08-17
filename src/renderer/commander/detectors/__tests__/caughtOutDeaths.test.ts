import { describe, it, expect } from 'vitest';
import detector from '../caughtOutDeaths';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(avgDist: number, deaths: number) {
  return baseFight({
    cohesion: {
      avgDistFromTag: 500,
      timeSpread900PlusSec: 0,
      avgDistAtDeath: avgDist,
      peakSpreadStdev: 0,
      peakSpreadStdevTSec: 0,
      stragglersAtBomb: 0,
      detachedMembers: 0,
    },
    outcome: {
      kills: 0,
      squadDeaths: deaths,
      allyDeaths: 0,
      netTrade: 0,
      damageOut: 0,
      damageIn: 0,
      damageOutInRatio: 0,
    },
  });
}

describe('caughtOutDeaths detector', () => {
  it('fires bad when deaths far from tag and >= 3 deaths', () => {
    const f = detector(fight(1200, 5), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
  });

  it('does not fire when too few deaths', () => {
    const f = detector(fight(1500, 2), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when deaths close to tag', () => {
    const f = detector(fight(400, 10), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
