import { describe, expect, it } from 'vitest';
import { buildNativeCarrySet, CARRIED_PATHS } from '../nativeCarrySet';

const report = () => ({
    axilog: { schema: '1.0', version: '0.3.5' },
    encounter: { map: 'Green Alpine Borderlands', duration_ms: 49285 },
    entities: [{ id: 0, role: 'squad' }],
    coverage: { damage: 'present' },
    catalogs: { skills: { 1: 'x' } },
    blocks: { replay: { tracks: [1, 2, 3] }, damage: { big: true } },
});

describe('buildNativeCarrySet', () => {
    it('carries exactly the migrated paths and nothing else', () => {
        const out = buildNativeCarrySet(report())!;
        const topLevel = [...new Set(CARRIED_PATHS.map((p) => p.split('.')[0]))];
        expect(Object.keys(out).sort()).toEqual(topLevel.sort());
    });

    it('never carries catalogs — payload the migration has no reader for', () => {
        const out = buildNativeCarrySet(report()) as any;
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

describe('carry-set — blocks.replay (unit 3)', () => {
    const unit3Report = {
        axilog: { schema: '1.0' },
        encounter: { map_id: 95 },
        entities: [],
        coverage: { replay: 'present' },
        blocks: {
            replay: { by_entity: { 3: { dist_to_com: 0 } }, tracks: { poll_ms: 300 } },
            damage: { by_entity: { 3: { total: 999 } } },
            boons: { by_entity: {} },
        },
    };

    it('carries blocks.replay', () => {
        const set: any = buildNativeCarrySet(unit3Report);
        expect(set.blocks.replay.tracks.poll_ms).toBe(300);
        expect(set.blocks.replay.by_entity['3'].dist_to_com).toBe(0);
    });

    it('carries no other block', () => {
        // The whole point of the whitelist: `blocks` is 2.4 MB and
        // `replay.tracks` alone is the payload that dominates report.json.
        // A wholesale carry would be a silent 100x regression.
        const set: any = buildNativeCarrySet(unit3Report);
        expect(Object.keys(set.blocks)).toEqual(['replay']);
    });

    it('omits blocks entirely when the report has no replay block', () => {
        const set: any = buildNativeCarrySet({ ...unit3Report, blocks: { damage: {} } });
        expect(set.blocks).toBeUndefined();
    });

    it('still returns null for a non-native object', () => {
        expect(buildNativeCarrySet({ encounter: {} })).toBeNull();
    });

    it('declares blocks.replay in CARRIED_PATHS', () => {
        expect(CARRIED_PATHS).toContain('blocks.replay');
    });
});
