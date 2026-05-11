import { describe, it, expect } from 'vitest';
import detector from '../stabCoverageGood';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(stab: number) {
  return baseFight({
    engage: { squadHpAtEngage: 1, keyCdsUsed0to10s: 0, preEngageDowns: 0, stab0to10s: stab, dodgeStarvation: 'low' },
  });
}

describe('stabCoverageGood detector', () => {
  it('fires good when stab >= threshold', () => {
    const f = detector(fight(0.85), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('good');
  });

  it('does not fire when stab below threshold', () => {
    const f = detector(fight(0.5), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('fires at threshold boundary', () => {
    const f = detector(fight(0.75), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
  });
});
