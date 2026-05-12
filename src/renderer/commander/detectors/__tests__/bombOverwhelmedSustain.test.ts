import { describe, it, expect } from 'vitest';
import detector from '../bombOverwhelmedSustain';
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

describe('bombOverwhelmedSustain detector', () => {
  it('fires bad when any bomb window broke', () => {
    const f = detector(
      fight([{ tSec: 15, durationSec: 3, incoming: 300000, heal: 100000, outcome: 'broke' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
    expect(f!.evidence).toContain('3.00x');
  });

  it('does not fire when all bombs survived', () => {
    const f = detector(
      fight([{ tSec: 15, durationSec: 3, incoming: 200000, heal: 200000, outcome: 'survived' }]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f).toBeNull();
  });

  it('picks the worst broken window when multiple', () => {
    const f = detector(
      fight([
        { tSec: 10, durationSec: 3, incoming: 200000, heal: 100000, outcome: 'broke' },
        { tSec: 25, durationSec: 3, incoming: 400000, heal: 100000, outcome: 'broke' },
      ]),
      DEFAULT_COMMANDER_THRESHOLDS,
    );
    expect(f!.evidence).toContain('0:25');
  });
});
