import { describe, expect, it } from 'vitest';
import {
    getEntitySkillRows, getEntityDamageSeries, getEntityDownContribution, resolveSkillMeta,
} from '../nativeDamage';

const rle = (pairs: Array<[number, number]>, len: number) =>
    ({ data: pairs, enc: 'rle', interval_ms: 1000, len });

const details = {
    native: {
        catalogs: { skills: { 100: { name: 'Fireball', icon: 'fb.png' }, 736: { name: 'Bleeding' } } },
        blocks: {
            damage: {
                by_entity: {
                    7: {
                        total: 900,
                        by_skill: {
                            100: { total: 700, hits: 10, connected_hits: 9, outcomes: { indirect: false } },
                            736: { total: 200, hits: 20, connected_hits: 20, outcomes: { indirect: true } },
                        },
                        per_target: {
                            42: { by_skill: { 100: { total: 400, hits: 6 }, 736: { total: 200, hits: 20 } } },
                            43: { by_skill: { 100: { total: 300, hits: 4 } } },
                        },
                    },
                },
            },
            series: { by_entity: { 7: { damage: rle([[0, 2], [900, 2]], 4) } } },
            contribution: { by_entity: { 7: { downs_contribution: { damage: 321 } } } },
        },
    },
};

describe('nativeDamage', () => {
    it('resolves skill names and icons from the catalog', () => {
        expect(resolveSkillMeta(details, 100)).toEqual({ name: 'Fireball', icon: 'fb.png' });
        // Unknown ids get a stable placeholder, never `undefined` in the UI.
        expect(resolveSkillMeta(details, 999)).toEqual({ name: 'Skill 999', icon: undefined });
    });

    it('decodes the cumulative per-entity damage series', () => {
        expect(getEntityDamageSeries(details, 7)).toEqual([0, 0, 900, 900]);
    });

    it('reads down contribution from the contribution block', () => {
        expect(getEntityDownContribution(details, 7)).toBe(321);
    });

    it('joins the indirect flag onto per-target skill rows', () => {
        // per_target.by_skill carries no `outcomes`, so `indirect` can only come
        // from the same entity's top-level by_skill. Without the join every
        // condition tick would be counted as strike damage.
        const rows = getEntitySkillRows(details, 7, { perTarget: true });
        const bleed = rows.find((r) => r.skillId === 736)!;
        const fireball = rows.find((r) => r.skillId === 100)!;
        expect(bleed.indirect).toBe(true);
        expect(fireball.indirect).toBe(false);
        // Summed across both targets.
        expect(fireball.damage).toBe(700);
    });

    it('defaults indirect to false when the entity has no outcomes at all', () => {
        // Enemies and npcs carry no `outcomes` anywhere in the real container.
        const noOutcomes = {
            native: {
                ...details.native,
                blocks: {
                    ...details.native.blocks,
                    damage: {
                        by_entity: {
                            9: { total: 5, by_skill: { 100: { total: 5, hits: 1 } }, per_target: {} },
                        },
                    },
                },
            },
        };
        expect(getEntitySkillRows(noOutcomes, 9)[0].indirect).toBe(false);
    });

    it('returns empty rather than throwing for an unknown entity', () => {
        expect(getEntitySkillRows(details, 12345)).toEqual([]);
        expect(getEntityDamageSeries(details, 12345)).toEqual([]);
        expect(getEntityDownContribution(details, 12345)).toBe(0);
    });
});
