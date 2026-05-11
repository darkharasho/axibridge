import { describe, it, expect } from 'vitest';
import detector from '../cleanseRaceLost';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(cleansed: number, taken: number) {
  return baseFight({
    sustain: {
      cleansesApplied: cleansed,
      conditionsTaken: taken,
      stripsLanded: 0,
      stripsReceived: 0,
      stabThroughBombs: 0,
      resistanceAtBurst: 0,
      aegisAtBurst: 0,
    },
  });
}

describe('cleanseRaceLost detector', () => {
  it('fires bad when net deficit beyond threshold', () => {
    const f = detector(fight(50, 200), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
  });

  it('does not fire when deficit within threshold', () => {
    const f = detector(fight(100, 130), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when winning the race', () => {
    const f = detector(fight(200, 100), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
