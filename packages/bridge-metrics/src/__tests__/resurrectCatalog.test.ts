import { describe, it, expect } from 'vitest';
import { classifyResurrectSkill, INSTANT_UTILITY_WINDOW_MS, RESURRECT_SKILLS } from '../resurrectCatalog';

describe('resurrectCatalog', () => {
    it('classifies the hand resurrect channel', () => {
        expect(classifyResurrectSkill(1066, {})?.kind).toBe('hand');
    });

    it('classifies Bandage as a self resurrect', () => {
        expect(classifyResurrectSkill(1175, {})?.kind).toBe('self');
    });

    it('classifies known utilities by id', () => {
        expect(classifyResurrectSkill(10244, {})?.kind).toBe('utility');
        expect(classifyResurrectSkill(14419, {})?.kind).toBe('utility');
        expect(classifyResurrectSkill(12569, {})?.kind).toBe('utility');
    });

    it('classifies Signet of Undeath by id, on both of its ids', () => {
        // Missing from the catalog until 2026-09-17: a necro staple in WvW, so
        // every signet pickup was landing in `unattributed` or being credited
        // to whatever banner happened to still be inside its 45s window.
        expect(classifyResurrectSkill(10611, {})?.kind).toBe('utility');
        expect(classifyResurrectSkill(24544, {})?.kind).toBe('utility');
    });

    it('classifies Glyph of Renewal by its attunement variant ids', () => {
        // The glyph never casts under id 5573 / the name "Glyph of Renewal" —
        // it casts as Renewal of Air/Earth/Fire/Water, which is why the name
        // match alone could never fire. Same four ids arcdps special-cases.
        for (const id of [5760, 5761, 5762, 5763]) {
            expect(classifyResurrectSkill(id, {})?.kind).toBe('utility');
        }
    });

    it('gives instant utilities a short window and ground utilities a long one', () => {
        expect(classifyResurrectSkill(10611, {})?.windowMs).toBe(INSTANT_UTILITY_WINDOW_MS);
        expect(classifyResurrectSkill(5762, {})?.windowMs).toBe(INSTANT_UTILITY_WINDOW_MS);
        expect(classifyResurrectSkill(14419, {})!.windowMs).toBeGreaterThan(INSTANT_UTILITY_WINDOW_MS);
        expect(classifyResurrectSkill(12569, {})!.windowMs).toBeGreaterThan(INSTANT_UTILITY_WINDOW_MS);
    });

    it('classifies the duplicate ids the game also emits', () => {
        // 14569 was observed as a real cast in the validation sample, so these
        // are not theoretical.
        for (const id of [14569, 69300, 25541, 24414, 55024, 55046]) {
            expect(classifyResurrectSkill(id, {})?.kind).toBe('utility');
        }
    });

    it('classifies unknown ids as utilities by skill name', () => {
        const skillMap = { s99999: { name: 'Glyph of Renewal' } };
        expect(classifyResurrectSkill(99999, skillMap)?.kind).toBe('utility');
    });

    it('never classifies Signet of Renewal as a resurrect', () => {
        const skillMap = { s12502: { name: 'Signet of Renewal' } };
        expect(classifyResurrectSkill(12502, skillMap)).toBeNull();
        expect(RESURRECT_SKILLS.has(12502)).toBe(false);
    });

    it('returns null for an unrelated skill', () => {
        expect(classifyResurrectSkill(5491, { s5491: { name: 'Fireball' } })).toBeNull();
    });
});
