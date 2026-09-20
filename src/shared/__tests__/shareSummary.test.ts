import { describe, expect, it } from 'vitest';
import { buildShareSummary, SUMMARY_BUDGET_BYTES, truncateToBytes } from '../shareSummary';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    targets: [{ name: 'E1' }, { name: 'E2' }]
};

/**
 * Detect lone surrogates (half of a surrogate pair left unpaired).
 * This catches corruption that TextEncoder silently replaces with U+FFFD.
 */
const hasLoneSurrogate = (s: string): boolean => {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff) {
            // high surrogate: must be followed by low surrogate
            const n = s.charCodeAt(i + 1);
            if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
            i++; // consumed the pair
        } else if (c >= 0xdc00 && c <= 0xdfff) {
            // unpaired low surrogate
            return true;
        }
    }
    return false;
};

describe('buildShareSummary', () => {
    it('extracts fight name, map, duration and start', () => {
        const summary = buildShareSummary(details);
        expect(summary.f).toBe('Detonator');
        expect(summary.m).toBe('Eternal Battlegrounds');
        expect(summary.d).toBe(182000);
        expect(summary.t).toBe(1758240000000);
    });

    it('counts squad and enemies from the rosters', () => {
        const summary = buildShareSummary(details);
        expect(summary.sq).toBe(3);
        expect(summary.en).toBe(2);
    });

    it('substitutes safe defaults for a details object missing everything', () => {
        expect(buildShareSummary({})).toEqual({ f: 'Unknown fight', m: 'Unknown', d: 0, t: 0, sq: 0, en: 0 });
    });

    it('tolerates a null details object', () => {
        expect(buildShareSummary(null).sq).toBe(0);
    });

    it('truncates an absurdly long fight name', () => {
        const summary = buildShareSummary({ ...details, fightName: 'x'.repeat(500) });
        expect(summary.f.length).toBeLessThanOrEqual(80);
    });

    it('stays within the KV summary budget even at worst case', () => {
        const summary = buildShareSummary({ ...details, fightName: 'x'.repeat(500), zone: 'y'.repeat(500) });
        expect(Buffer.byteLength(JSON.stringify(summary), 'utf8')).toBeLessThanOrEqual(SUMMARY_BUDGET_BYTES);
    });

    it('respects 128-byte field cap for fight name with multi-byte UTF-8', () => {
        // 100 copies of '字' (3 bytes each) = 300 bytes, 100 chars
        const mbInput = '字'.repeat(100);
        const summary = buildShareSummary({ ...details, fightName: mbInput });
        const fBytes = new TextEncoder().encode(summary.f).length;
        expect(fBytes).toBeLessThanOrEqual(128);
        // Verify no broken UTF-8: round-trip must reproduce the original string exactly
        // (a non-fatal TextDecoder never throws — it substitutes U+FFFD instead — so
        // equality, not "not.toThrow()", is what actually detects corruption).
        expect(new TextDecoder().decode(new TextEncoder().encode(summary.f))).toBe(summary.f);
    });

    it('respects 128-byte field cap for zone with multi-byte UTF-8', () => {
        // 100 copies of '字' (3 bytes each) = 300 bytes, 100 chars
        const mbInput = '字'.repeat(100);
        const summary = buildShareSummary({ ...details, zone: mbInput });
        const mBytes = new TextEncoder().encode(summary.m).length;
        expect(mBytes).toBeLessThanOrEqual(128);
        // Verify no broken UTF-8: round-trip must reproduce the original string exactly
        // (a non-fatal TextDecoder never throws — it substitutes U+FFFD instead — so
        // equality, not "not.toThrow()", is what actually detects corruption).
        expect(new TextDecoder().decode(new TextEncoder().encode(summary.m))).toBe(summary.m);
    });

    it('does not corrupt astral characters by splitting surrogate pairs', () => {
        // The exact probe: 'a'.repeat(79) + '𝕏' (U+1D54F is an astral character, a surrogate pair)
        // Old implementation: raw.slice(0, MAX_TEXT) = raw.slice(0, 80) cuts after the high
        // surrogate, leaving a lone high surrogate 0xD835. This should be rejected.
        const summary = buildShareSummary({ ...details, fightName: 'a'.repeat(79) + '\u{1D54F}' });
        expect(hasLoneSurrogate(summary.f)).toBe(false);
        // Round-trip must be stable: lone surrogates decode back as U+FFFD, changing the string
        const encoded = new TextEncoder().encode(summary.f);
        const decoded = new TextDecoder().decode(encoded);
        expect(decoded).toBe(summary.f);
    });

    it('truncates astral characters at byte boundaries without splitting them', () => {
        // 🔥 is U+1F525, 4 bytes in UTF-8. 128 / 4 = 32, so 32 emoji fit exactly.
        // But test with 100 to force truncation, which must land cleanly.
        const summary = buildShareSummary({ ...details, fightName: '🔥'.repeat(100) });
        expect(summary.f.length).toBeGreaterThan(0); // some emoji should remain
        expect(hasLoneSurrogate(summary.f)).toBe(false);
        const fBytes = new TextEncoder().encode(summary.f).length;
        expect(fBytes).toBeLessThanOrEqual(128);
    });

    it('truncateToBytes with small budgets does not create lone surrogates', () => {
        // Sweep small byte budgets against a string with astral characters.
        // '🔥' is 4 bytes, and 'x' is 1 byte. Mix to create potential split points.
        const testStr = '🔥'.repeat(3); // 12 bytes total
        for (let maxBytes = 1; maxBytes <= 8; maxBytes++) {
            const result = truncateToBytes(testStr, maxBytes);
            expect(hasLoneSurrogate(result)).toBe(false);
            const resultBytes = new TextEncoder().encode(result).length;
            expect(resultBytes).toBeLessThanOrEqual(maxBytes);
            // If maxBytes < 4 (one emoji's byte size), result must be empty
            if (maxBytes < 4) {
                expect(result).toBe('');
            }
        }
    });

    it('round-trips encoded fields through TextEncoder/Decoder without mutation', () => {
        // This is the most direct model of what KV does: it stores the JSON-stringified
        // summary, and later decodes it. A lone surrogate would be replaced by U+FFFD.
        const summary = buildShareSummary({ ...details, fightName: 'a'.repeat(79) + '\u{1D54F}', zone: '🔥'.repeat(100) });
        const fRoundTrip = new TextDecoder().decode(new TextEncoder().encode(summary.f));
        const mRoundTrip = new TextDecoder().decode(new TextEncoder().encode(summary.m));
        expect(fRoundTrip).toBe(summary.f);
        expect(mRoundTrip).toBe(summary.m);
    });
});
