import { describe, it, expect } from 'vitest';
import detector from '../stripRaceLost';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(landed: number, received: number) {
  return baseFight({
    sustain: {
      cleansesApplied: 0,
      conditionsTaken: 0,
      stripsLanded: landed,
      stripsReceived: received,
      stabThroughBombs: 0,
      resistanceAtBurst: 0,
      aegisAtBurst: 0,
    },
  });
}

describe('stripRaceLost detector', () => {
  it('fires bad when receiving more strips than landing beyond threshold', () => {
    const f = detector(fight(20, 100), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
  });

  it('does not fire when deficit within threshold', () => {
    const f = detector(fight(50, 80), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when landing more strips', () => {
    const f = detector(fight(100, 20), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
