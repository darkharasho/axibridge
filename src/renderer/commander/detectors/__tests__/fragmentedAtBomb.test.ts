import { describe, it, expect } from 'vitest';
import detector from '../fragmentedAtBomb';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';
import type { BombWindow } from '../../../../shared/commanderTypes';

function fight(spread: number, peakT: number, bombs: BombWindow[]) {
  return baseFight({
    cohesion: {
      avgDistFromTag: 500,
      timeSpread900PlusSec: 0,
      avgDistAtDeath: 500,
      peakSpreadStdev: spread,
      peakSpreadStdevTSec: peakT,
      stragglersAtBomb: 0,
      detachedMembers: 0,
    },
    burst: {
      worst3sIncoming: 0,
      worst3sIncomingTSec: 0,
      inHealRatioAtSpike: 0,
      healAtSpike: 0,
      bombWindowCount: bombs.length,
      bombWindows: bombs,
      downsInWorst3s: 0,
      stabUptimeInSpike: 0,
    },
  });
}

describe('fragmentedAtBomb detector', () => {
  it('fires bad when spread peak inside a bomb window', () => {
    const f = detector(
      fight(900, 12, [{ tSec: 10, durationSec: 3, incoming: 200000, heal: 100000, outcome: 'broke' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
  });

  it('does not fire when peak outside bomb window', () => {
    const f = detector(
      fight(900, 30, [{ tSec: 10, durationSec: 3, incoming: 200000, heal: 100000, outcome: 'broke' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).toBeNull();
  });

  it('does not fire when spread below threshold', () => {
    const f = detector(
      fight(400, 12, [{ tSec: 10, durationSec: 3, incoming: 200000, heal: 100000, outcome: 'broke' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).toBeNull();
  });
});
