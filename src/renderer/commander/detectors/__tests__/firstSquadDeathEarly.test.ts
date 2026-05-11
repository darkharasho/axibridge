import { describe, it, expect } from 'vitest';
import detector from '../firstSquadDeathEarly';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { baseFight } from './_detectorFixture';
import type { DeathEvent } from '../../../../shared/commanderTypes';

function withDeath(over: Partial<DeathEvent> | null) {
  return baseFight({
    survival: {
      firstSquadDeath:
        over === null
          ? null
          : { tSec: 8, account: 'Hadrik.4218', profession: 'Firebrand', role: 'support', distFromTag: 1412, ...over },
      firstSupportDeath: null,
      squadAliveAtEnd: 4,
      squadTotal: 25,
      rallyRate: 0.5,
      rallies: 5,
      downs: 10,
      avgTimeDownedSec: 4,
    },
  });
}

describe('firstSquadDeathEarly detector', () => {
  it('fires bad when first death is before threshold', () => {
    const f = detector(withDeath({ tSec: 8, distFromTag: 200 }), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
    expect(f!.evidence).toContain('0:08');
  });

  it('fires bad when first death is far from tag, even if late', () => {
    const f = detector(withDeath({ tSec: 40, distFromTag: 1400 }), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f!.side).toBe('bad');
    expect(f!.evidence).toContain('1,400');
  });

  it('does not fire when first death is late and close to tag', () => {
    const f = detector(withDeath({ tSec: 40, distFromTag: 300 }), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when no squad death occurred', () => {
    const f = detector(withDeath(null), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
