import { describe, it, expect } from 'vitest';
import detector from '../rallyRateHealthy';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';

function fight(rallyRate: number, downs: number, rallies: number) {
  return baseFight({
    survival: {
      firstSquadDeath: null,
      firstSupportDeath: null,
      squadAliveAtEnd: 20,
      squadTotal: 25,
      rallyRate,
      rallies,
      downs,
      avgTimeDownedSec: 3,
    },
  });
}

describe('rallyRateHealthy detector', () => {
  it('fires good when rally rate above threshold with enough downs', () => {
    const f = detector(fight(0.7, 10, 7), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('good');
  });

  it('does not fire when too few downs', () => {
    const f = detector(fight(0.9, 2, 2), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when rally rate below threshold', () => {
    const f = detector(fight(0.3, 10, 3), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
