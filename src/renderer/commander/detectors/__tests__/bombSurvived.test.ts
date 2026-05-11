import { describe, it, expect } from 'vitest';
import detector from '../bombSurvived';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';
import type { BombWindow } from '../../../../shared/commanderTypes';

function fight(bombWindows: BombWindow[]) {
  return baseFight({
    burst: {
      worst3sIncoming: 0,
      worst3sIncomingTSec: 0,
      inHealRatioAtSpike: 0,
      healAtSpike: 0,
      bombWindowCount: bombWindows.length,
      bombWindows,
      downsInWorst3s: 0,
      stabUptimeInSpike: 0,
    },
  });
}

describe('bombSurvived detector', () => {
  it('fires good when any bomb survived', () => {
    const f = detector(
      fight([{ tSec: 10, durationSec: 3, incoming: 200000, heal: 200000, outcome: 'survived' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).not.toBeNull();
    expect(f!.side).toBe('good');
  });

  it('does not fire when no bomb windows', () => {
    const f = detector(fight([]), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when all bombs broke', () => {
    const f = detector(
      fight([{ tSec: 10, durationSec: 3, incoming: 400000, heal: 100000, outcome: 'broke' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).toBeNull();
  });
});
