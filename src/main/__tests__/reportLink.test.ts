import { describe, expect, it } from 'vitest';
import { toReportLink, reportLinkFor } from '../discord';

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

describe('reportLinkFor', () => {
    const SHARE = 'https://bridge.axi.link/r/k3Xm9qR2';
    const PERMALINK = 'https://dps.report/abc-123';

    it('prefers the share link and names it AxiBridge', () => {
        expect(reportLinkFor({ shareUrl: SHARE, permalink: PERMALINK }))
            .toEqual({ url: SHARE, label: 'AxiBridge' });
    });

    // Thousands of already-persisted logs carry only a permalink. They must keep
    // posting exactly as before, under the name of the site they point at.
    it('falls back to the permalink and keeps the dps.report name', () => {
        expect(reportLinkFor({ permalink: PERMALINK }))
            .toEqual({ url: PERMALINK, label: 'dps.report' });
    });

    it('ignores a blank share link rather than posting an empty url', () => {
        expect(reportLinkFor({ shareUrl: '   ', permalink: PERMALINK }))
            .toEqual({ url: PERMALINK, label: 'dps.report' });
    });

    it('tolerates whitespace around the share link', () => {
        expect(reportLinkFor({ shareUrl: `  ${SHARE}  ` }))
            .toEqual({ url: SHARE, label: 'AxiBridge' });
    });

    it('returns undefined when there is no usable link at all', () => {
        expect(reportLinkFor({ shareUrl: '', permalink: '' })).toBeUndefined();
        expect(reportLinkFor({})).toBeUndefined();
    });
});
