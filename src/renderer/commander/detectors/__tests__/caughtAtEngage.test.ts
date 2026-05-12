import { describe, it, expect } from 'vitest';
import detector from '../caughtAtEngage';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(squadHpAtEngage: number, preEngageDowns: number) {
  return baseFight({
    engage: {
      squadHpAtEngage,
      keyCdsUsed0to10s: 0,
      preEngageDowns,
      stab0to10s: 0,
      dodgeStarvation: 'low',
    },
  });
}

describe('caughtAtEngage detector', () => {
  it('fires when HP at engage is below 0.6', () => {
    const f = detector(fight(0.4, 0), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
    expect(f!.id).toBe('caught-at-engage');
  });

  it('fires when preEngageDowns >= 2 even with full HP', () => {
    const f = detector(fight(1.0, 2), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
  });

  it('does not fire when HP healthy and few pre-engage downs', () => {
    const f = detector(fight(0.9, 1), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
