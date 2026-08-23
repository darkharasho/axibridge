import { describe, it, expect } from 'vitest';
import { computeIncludedOrdinals } from '../computeIncludedOrdinals';

const SIDECAR: any = { fights: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };

describe('computeIncludedOrdinals', () => {
    it('returns null when no sidecar has loaded', () => {
        expect(computeIncludedOrdinals(null, new Set(['a']))).toBeNull();
    });

    it('returns null when nothing is excluded, so the published stats are used', () => {
        expect(computeIncludedOrdinals(SIDECAR, new Set())).toBeNull();
    });

    it('returns the ordinals of the fights that survive the exclusion set', () => {
        expect(computeIncludedOrdinals(SIDECAR, new Set(['b']))).toEqual([0, 2]);
    });

    /**
     * C2, and the one case a plain `.filter()` gets wrong. Excluding every
     * fight is a SLICE THAT SELECTS NOTHING, not "no slice". Folding it into
     * `null` sent the viewer back to `report.stats` — the full report — under
     * a banner claiming 0 of N fights.
     */
    it('returns an empty array, not null, when every fight is excluded', () => {
        const result = computeIncludedOrdinals(SIDECAR, new Set(['a', 'b', 'c']));
        expect(result).not.toBeNull();
        expect(result).toEqual([]);
    });

    it('ignores excluded ids that are not in the sidecar', () => {
        expect(computeIncludedOrdinals(SIDECAR, new Set(['zzz']))).toEqual([0, 1, 2]);
    });
});
