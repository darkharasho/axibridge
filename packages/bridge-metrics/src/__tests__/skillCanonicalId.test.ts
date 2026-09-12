import { describe, expect, it } from 'vitest';
import { canonicalSkillId, withVariantLabel } from '../skillCanonicalId';
import { resolveSkillMeta } from '../nativeDamage';

describe('canonicalSkillId', () => {
    const details = {
        skillMap: {
            s5703: { name: 'Arcane Shield' },
            s5641: { name: 'Arcane Shield' },
            s72911: { name: "Harrier's Toss (Adrenaline 1)" },
            s73006: { name: "Harrier's Toss (Adrenaline 3)" },
            s80001: { name: 'Skill 80001' },
            s80002: { name: 'Skill 80001' },
        },
    };

    it('folds same-name ids onto the smallest id', () => {
        expect(canonicalSkillId(details, 5703)).toBe(5641);
        expect(canonicalSkillId(details, '5641')).toBe(5641);
    });

    it('keeps labelled variants apart', () => {
        expect(canonicalSkillId(details, 72911)).toBe(72911);
        expect(canonicalSkillId(details, 73006)).toBe(73006);
    });

    it('never groups placeholder names or unknown ids', () => {
        expect(canonicalSkillId(details, 80002)).toBe(80002);
        expect(canonicalSkillId(details, 12345)).toBe(12345);
        expect(canonicalSkillId({}, 5703)).toBe(5703);
    });
});

describe('withVariantLabel', () => {
    it('appends a label once and ignores a missing one', () => {
        expect(withVariantLabel('Deploy Jade Sphere', 'Fire')).toBe('Deploy Jade Sphere (Fire)');
        expect(withVariantLabel('Deploy Jade Sphere (Fire)', 'Fire')).toBe('Deploy Jade Sphere (Fire)');
        expect(withVariantLabel('Arcane Shield', undefined)).toBe('Arcane Shield');
    });

    it('is applied by the native skill resolver', () => {
        const details = { native: { catalogs: { skills: { 62813: { name: 'Deploy Jade Sphere', variant_label: 'Fire' } } } } };
        expect(resolveSkillMeta(details, 62813).name).toBe('Deploy Jade Sphere (Fire)');
    });
});
