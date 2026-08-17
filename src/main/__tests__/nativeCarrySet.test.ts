import { describe, expect, it } from 'vitest';
import { buildNativeCarrySet, CARRIED_KEYS } from '../nativeCarrySet';

const report = () => ({
    axilog: { schema: '1.0', version: '0.3.4' },
    encounter: { map: 'Green Alpine Borderlands', duration_ms: 49285 },
    entities: [{ id: 0, role: 'squad' }],
    coverage: { damage: 'present' },
    catalogs: { skills: { 1: 'x' } },
    blocks: { replay: { tracks: [1, 2, 3] }, damage: { big: true } },
});

describe('buildNativeCarrySet', () => {
    it('carries exactly the migrated blocks and nothing else', () => {
        const out = buildNativeCarrySet(report())!;
        expect(Object.keys(out).sort()).toEqual([...CARRIED_KEYS].sort());
    });

    it('never carries blocks or catalogs — the payload that dominates report.json', () => {
        const out = buildNativeCarrySet(report()) as any;
        expect(out.blocks).toBeUndefined();
        expect(out.catalogs).toBeUndefined();
    });

    it('returns null for a non-report so the seam can attach nothing', () => {
        expect(buildNativeCarrySet(null)).toBeNull();
        expect(buildNativeCarrySet('nope')).toBeNull();
        expect(buildNativeCarrySet({})).toBeNull();
    });

    it('preserves an empty entities array rather than dropping the key', () => {
        // "ran, found nobody" must stay distinguishable from "never parsed".
        const out = buildNativeCarrySet({ ...report(), entities: [] })!;
        expect(out.entities).toEqual([]);
    });
});
