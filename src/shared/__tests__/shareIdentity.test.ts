import { describe, expect, it } from 'vitest';
import { shareIdentity } from '../shareIdentity';

describe('shareIdentity', () => {
    it('prefers the share url when both are present', () => {
        expect(shareIdentity({ shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2', permalink: 'https://dps.report/abc' }))
            .toBe('https://bridge.axi.link/r/k3Xm9qR2');
    });

    it('falls back to the permalink for a pre-existing log', () => {
        expect(shareIdentity({ permalink: 'https://dps.report/abc' })).toBe('https://dps.report/abc');
    });

    it('uses the share url when there is no permalink', () => {
        expect(shareIdentity({ shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2' }))
            .toBe('https://bridge.axi.link/r/k3Xm9qR2');
    });

    it('returns empty string when neither is present', () => {
        expect(shareIdentity({})).toBe('');
    });

    it.each([null, undefined])('returns empty string for %s', (log) => {
        expect(shareIdentity(log as any)).toBe('');
    });

    it('ignores an empty or whitespace share url', () => {
        expect(shareIdentity({ shareUrl: '   ', permalink: 'https://dps.report/abc' })).toBe('https://dps.report/abc');
    });

    it('trims surrounding whitespace', () => {
        expect(shareIdentity({ shareUrl: ' https://bridge.axi.link/r/k3Xm9qR2 ' }))
            .toBe('https://bridge.axi.link/r/k3Xm9qR2');
    });
});
