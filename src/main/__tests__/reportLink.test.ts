import { describe, expect, it } from 'vitest';
import { toReportLink } from '../discord';

describe('toReportLink', () => {
    it('passes through a real dps.report permalink', () => {
        expect(toReportLink('https://dps.report/abc-123')).toBe('https://dps.report/abc-123');
    });

    it('trims surrounding whitespace', () => {
        expect(toReportLink('  https://dps.report/abc  ')).toBe('https://dps.report/abc');
    });

    // The regression: the local-parse path posts with permalink '' when the
    // parallel dps.report upload has not resolved. An empty embed url / empty
    // markdown target must degrade to no link, not to "[dps.report]()".
    it.each(['', '   ', undefined, null, 'not-a-url'])('rejects unusable permalink %p', (value) => {
        expect(toReportLink(value as any)).toBeUndefined();
    });
});
