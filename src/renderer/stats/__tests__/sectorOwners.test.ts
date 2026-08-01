import { describe, it, expect } from 'vitest';
import { buildWvwMatchOptions } from '../utils/sectorOwners';

describe('buildWvwMatchOptions', () => {
    it('sorts NA before EU, tiers ascending, with readable labels', () => {
        expect(buildWvwMatchOptions(['2-1', '1-3', '2-5', '1-1'])).toEqual([
            { value: '1-1', label: 'NA — Tier 1' },
            { value: '1-3', label: 'NA — Tier 3' },
            { value: '2-1', label: 'EU — Tier 1' },
            { value: '2-5', label: 'EU — Tier 5' },
        ]);
    });
    it('ignores malformed ids', () => {
        expect(buildWvwMatchOptions(['bogus', '3-1', '1-2'])).toEqual([{ value: '1-2', label: 'NA — Tier 2' }]);
    });
});
