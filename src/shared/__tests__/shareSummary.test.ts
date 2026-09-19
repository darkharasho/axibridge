import { describe, expect, it } from 'vitest';
import { buildShareSummary, SUMMARY_BUDGET_BYTES } from '../shareSummary';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    targets: [{ name: 'E1' }, { name: 'E2' }]
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
        // Verify no broken UTF-8: can round-trip through encode/decode
        expect(() => new TextDecoder().decode(new TextEncoder().encode(summary.f))).not.toThrow();
    });

    it('respects 128-byte field cap for zone with multi-byte UTF-8', () => {
        // 100 copies of '字' (3 bytes each) = 300 bytes, 100 chars
        const mbInput = '字'.repeat(100);
        const summary = buildShareSummary({ ...details, zone: mbInput });
        const mBytes = new TextEncoder().encode(summary.m).length;
        expect(mBytes).toBeLessThanOrEqual(128);
        // Verify no broken UTF-8: can round-trip through encode/decode
        expect(() => new TextDecoder().decode(new TextEncoder().encode(summary.m))).not.toThrow();
    });
});
