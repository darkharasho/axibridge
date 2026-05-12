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
  it('fires good when cleanses keep pace (>= 60% of conditions taken)', () => {
    const f = detector(fight(150, 200), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('good');
    expect(f!.evidence).toContain('75%');
  });

  it('fires when net positive', () => {
    const f = detector(fight(200, 100), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f!.side).toBe('good');
  });

  it('does not fire when cleanses lag well behind condi', () => {
    const f = detector(fight(50, 200), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when sample is too small to be meaningful', () => {
    const f = detector(fight(10, 10), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
