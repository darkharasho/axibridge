import { describe, it, expect } from 'vitest';
import { classifyResurrectSkill, RESURRECT_SKILLS } from '../resurrectCatalog';

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
