import { describe, it, expect } from 'vitest';
import { getPlayerCleanses, getPlayerStrips, getPlayerDodges, VINDICATOR_DODGE_SKILL_ID } from '../dashboardMetrics';
import { computeDownContribution, computeSquadHealing } from '../combatMetrics';
import { normalizeConditionLabel, NON_DAMAGING_CONDITIONS } from '../conditionsMetrics';
import { PROFESSION_COLORS } from '../professionUtils';

describe('bridge-metrics extractors', () => {
    it('exposes the dashboard metric extractors', () => {
        const player: any = { support: [{ condiCleanse: 3, condiCleanseSelf: 1 }] };
        expect(getPlayerCleanses(player)).toBe(4);
        expect(typeof getPlayerStrips).toBe('function');
    });
    it('counts Vindicator Death Drop casts as dodges (EI leaves dodgeCount at 0)', () => {
        const vindicator: any = {
            defenses: [{ dodgeCount: 0 }],
            rotation: [
                { id: VINDICATOR_DODGE_SKILL_ID, skills: [{}, {}, {}, {}, {}, {}, {}] },
                { id: 62913, skills: [{}] },
            ],
        };
        expect(getPlayerDodges(vindicator)).toBe(7);

        // Non-Vindicators keep EI's dodgeCount untouched.
        const firebrand: any = { defenses: [{ dodgeCount: 2 }], rotation: [{ id: 9153, skills: [{}] }] };
        expect(getPlayerDodges(firebrand)).toBe(2);
    });
    it('exposes the combat metric extractors', () => {
        expect(typeof computeDownContribution).toBe('function');
        expect(typeof computeSquadHealing).toBe('function');
    });
    it('exposes condition helpers and profession colors', () => {
        expect(normalizeConditionLabel('Chilled')).toBe('Chill');
        expect(NON_DAMAGING_CONDITIONS.size).toBeGreaterThan(0);
        expect(Object.keys(PROFESSION_COLORS).length).toBeGreaterThan(0);
    });
});
