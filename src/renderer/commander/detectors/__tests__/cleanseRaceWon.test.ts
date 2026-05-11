import { describe, it, expect } from 'vitest';
import detector from '../cleanseRaceWon';
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

describe('cleanseRaceWon detector', () => {
  it('fires good when net positive', () => {
    const f = detector(fight(200, 100), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('good');
    expect(f!.evidence).toContain('+100');
  });

  it('does not fire when net is zero', () => {
    const f = detector(fight(100, 100), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when net negative', () => {
    const f = detector(fight(50, 200), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
