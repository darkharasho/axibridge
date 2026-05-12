import { describe, it, expect } from 'vitest';
import detector from '../firstSupportDeathPreBomb';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(supportTSec: number | null, bombTSec: number) {
  return baseFight({
    survival: {
      firstSquadDeath: null,
      firstSupportDeath:
        supportTSec === null
          ? null
          : { tSec: supportTSec, account: 'Heal.1234', profession: 'Scrapper', role: 'support', distFromTag: 300 },
      squadAliveAtEnd: 20,
      squadTotal: 25,
      rallyRate: 0,
      rallies: 0,
      downs: 0,
      avgTimeDownedSec: 0,
    },
    burst: {
      worst3sIncoming: 200000,
      worst3sIncomingTSec: bombTSec,
      inHealRatioAtSpike: 2,
      healAtSpike: 100000,
      bombWindowCount: 1,
      bombWindows: [],
      downsInWorst3s: 0,
      stabUptimeInSpike: 0.6,
    },
  });
}

describe('firstSupportDeathPreBomb detector', () => {
  it('fires bad when support dies well before bomb', () => {
    const f = detector(fight(10, 30), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
    expect(f!.evidence).toContain('0:10');
  });

  it('does not fire when support dies too close to bomb', () => {
    const f = detector(fight(28, 30), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when no support death exists', () => {
    const f = detector(fight(null, 30), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
