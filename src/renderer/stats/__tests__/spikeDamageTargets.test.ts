import { describe, it, expect } from 'vitest';
import { createSpikeDamageAccumulator, ingestLogSpikeDamage } from '../computeSpikeDamageData';

const skill = (max: number) => ({ max, total: max, hits: 1, connected_hits: 1, outcomes: { indirect: false } });

// One squad player who hit an enemy player for 5,000 and an ambient critter
// for 157,297 — the shape of a real log (a Ghastly Breach crit on a Mosquito).
const buildLog = (entities: any[]) => ({
    filePath: 'fight-1',
    details: {
        fightName: 'EBG',
        durationMS: 60_000,
        native: {
            entities,
            catalogs: { skills: { 100: { name: 'Ghastly Breach' }, 101: { name: 'Fierce Blow' } } },
            blocks: {
                damage: {
                    by_entity: {
                        1: {
                            by_skill: { 100: skill(157_297), 101: skill(5_000) },
                            per_target: {
                                2: { by_skill: { 101: skill(5_000) } },
                                3: { by_skill: { 100: skill(157_297) } },
                            },
                        },
                    },
                },
            },
        },
    },
});

const peakOf = (entities: any[]) => {
    const acc = createSpikeDamageAccumulator();
    ingestLogSpikeDamage(buildLog(entities), acc);
    return acc.fights[0].values['Tester.1234'];
};

const squad = { id: 1, role: 'squad', account: 'Tester.1234', character: 'Tester', elite_spec: 'Reaper' };

describe('spike damage highest hit targets', () => {
    it('ignores hits on NPCs when the log has enemy players', () => {
        const value = peakOf([squad, { id: 2, role: 'enemy_player' }, { id: 3, role: 'npc', name: 'Mosquito' }]);
        expect(value.hit).toBe(5_000);
        expect(value.skillName).toBe('Fierce Blow');
    });

    it('keeps NPC hits when there are no enemy players to measure against', () => {
        const value = peakOf([squad, { id: 2, role: 'npc' }, { id: 3, role: 'npc', name: 'Golem' }]);
        expect(value.hit).toBe(157_297);
    });
});
