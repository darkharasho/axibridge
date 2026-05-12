import { describe, it, expect } from 'vitest';
import detector from '../stabCoverageBad';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(stab: number, bombs: number) {
  return baseFight({
    burst: {
      worst3sIncoming: 0,
      worst3sIncomingTSec: 0,
      inHealRatioAtSpike: 0,
      healAtSpike: 0,
      bombWindowCount: bombs,
      bombWindows: [],
      downsInWorst3s: 0,
      stabUptimeInSpike: stab,
    },
  });
}

describe('stabCoverageBad detector', () => {
  it('fires bad when stab below threshold during bomb', () => {
    const f = detector(fight(0.2, 1), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
  });

  it('does not fire when no bomb windows', () => {
    const f = detector(fight(0.2, 0), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when stab above threshold', () => {
    const f = detector(fight(0.6, 1), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
