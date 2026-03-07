import { describe, expect, it } from 'vitest';
import observedAuraOutputs from './fixtures/auraOutputObserved.last16Logs.json';

const CORE_PROFESSIONS = new Set([
    'Guardian',
    'Revenant',
    'Warrior',
    'Engineer',
    'Ranger',
    'Thief',
    'Elementalist',
    'Mesmer',
    'Necromancer'
]);

const KNOWN_AURAS = new Set([
    'Chaos Aura',
    'Dark Aura',
    'Fire Aura',
    'Frost Aura',
    'Light Aura',
    'Magnetic Aura',
    'Shocking Aura'
]);

describe('Aura output eligibility (wiki cross-check)', () => {
    it('keeps observed aura output professions within valid GW2 profession set', () => {
        const auraMap = (observedAuraOutputs as any)?.auras || {};
        const disallowed: Array<{ aura: string; profession: string }> = [];

        Object.entries(auraMap).forEach(([aura, professions]) => {
            expect(KNOWN_AURAS.has(aura)).toBe(true);
            (Array.isArray(professions) ? professions : []).forEach((profession) => {
                if (!CORE_PROFESSIONS.has(String(profession))) {
                    disallowed.push({ aura, profession: String(profession) });
                }
            });
        });

        expect(disallowed).toEqual([]);
    });
});
