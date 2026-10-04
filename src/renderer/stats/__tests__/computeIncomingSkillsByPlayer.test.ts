import { describe, it, expect } from 'vitest';
import {
    ingestLogIncomingSkillsByPlayer,
    finalizeIncomingSkillsByPlayer,
} from '../computeIncomingSkillsByPlayer';

/**
 * An EI-shaped log whose squad took damage from `taken`, with a native focus
 * block carrying `castsBySkill` per entity.
 */
const makeLog = (opts: {
    build?: string;
    taken?: Record<string, Array<{ id: number; totalDamage: number; hits: number }>>;
    casts?: Record<string, Array<{ skill: number; casts: number }> | undefined>;
    focus?: boolean;
    skillMap?: Record<string, { name: string; icon?: string }>;
    catalogSkills?: Record<string, { name: string; icon?: string }>;
}) => {
    const taken = opts.taken ?? {};
    const casts = opts.casts ?? {};
    const accounts = [...new Set([...Object.keys(taken), ...Object.keys(casts)])];
    return {
        details: {
            players: accounts.map(account => ({
                account,
                profession: 'Firebrand',
                notInSquad: false,
                totalDamageTaken: [taken[account] ?? []],
            })),
            skillMap: opts.skillMap ?? {},
            buffMap: {},
            native: {
                encounter: { build: opts.build ?? '20260816' },
                entities: accounts.map((account, i) => ({ id: i + 1, role: 'squad', account, elite_spec: 'Firebrand' })),
                catalogs: { skills: opts.catalogSkills ?? {} },
                blocks: opts.focus === false ? {} : {
                    focus: {
                        squad_size: accounts.length,
                        total_casts: 0,
                        total_minion_casts: 0,
                        pre_down_window_ms: 3000,
                        by_entity: Object.fromEntries(accounts.map((account, i) => {
                            const split = casts[account] ?? [];
                            return [String(i + 1), {
                                casts_drawn: split.reduce((s, r) => s + r.casts, 0),
                                casts_drawn_minions: 0, focus_index: 0, downs: 0, pre_down_casts: 0,
                                ...(split.length > 0 ? { casts_by_skill: split } : {}),
                            }];
                        })),
                    },
                },
            },
        },
    };
};

describe('ingestLogIncomingSkillsByPlayer', () => {
    it('joins damage taken and aimed casts per player and per skill', () => {
        const ingest = ingestLogIncomingSkillsByPlayer(makeLog({
            taken: { 'A.1': [{ id: 10, totalDamage: 5000, hits: 4 }], 'B.2': [{ id: 11, totalDamage: 900, hits: 1 }] },
            casts: { 'A.1': [{ skill: 10, casts: 3 }, { skill: 12, casts: 2 }], 'B.2': [{ skill: 11, casts: 1 }] },
            skillMap: { s10: { name: 'Meteor Shower' }, s11: { name: 'Fireball' } },
            catalogSkills: { 12: { name: 'Chilling Nova' } },
        }));
        expect(ingest.castsMeasurable).toBe(true);
        const a = ingest.players.find(p => p.account === 'A.1')!;
        expect(a.skills['10']).toEqual({ damage: 5000, hits: 4, casts: 3 });
        // Aimed but never connected: casts with no damage, still a row.
        expect(a.skills['12']).toEqual({ damage: 0, hits: 0, casts: 2 });
        const b = ingest.players.find(p => p.account === 'B.2')!;
        expect(b.skills['11']).toEqual({ damage: 900, hits: 1, casts: 1 });
        // A cast-only skill absent from skillMap resolves through the native catalog.
        expect(ingest.skillMeta['12'].name).toBe('Chilling Nova');
    });

    it('reports a pre-rework log as unable to measure casts, but keeps its damage', () => {
        const ingest = ingestLogIncomingSkillsByPlayer(makeLog({
            build: '20260114',
            taken: { 'A.1': [{ id: 10, totalDamage: 5000, hits: 4 }] },
            casts: { 'A.1': [{ skill: 10, casts: 3 }] },
        }));
        expect(ingest.castsMeasurable).toBe(false);
        expect(ingest.players[0].skills['10']).toEqual({ damage: 5000, hits: 4, casts: 0 });
    });

    it('reports a parse from before axilog emitted the split as unable to measure casts', () => {
        // casts_drawn > 0 but no casts_by_skill anywhere: an axilog < 1.16.0 parse.
        const log = makeLog({ taken: { 'A.1': [{ id: 10, totalDamage: 1, hits: 1 }] }, casts: { 'A.1': [{ skill: 10, casts: 3 }] } });
        delete (log.details.native.blocks as any).focus.by_entity['1'].casts_by_skill;
        expect(ingestLogIncomingSkillsByPlayer(log).castsMeasurable).toBe(false);
    });

    it('treats a post-rework fight with no aimed casts as measured, not unmeasurable', () => {
        const ingest = ingestLogIncomingSkillsByPlayer(makeLog({ taken: { 'A.1': [{ id: 10, totalDamage: 1, hits: 1 }] } }));
        expect(ingest.castsMeasurable).toBe(true);
    });

    it('skips non-squad players', () => {
        const log = makeLog({ taken: { 'A.1': [{ id: 10, totalDamage: 1, hits: 1 }], 'Pug.9': [{ id: 10, totalDamage: 7, hits: 1 }] } });
        (log.details.players[1] as any).notInSquad = true;
        const ingest = ingestLogIncomingSkillsByPlayer(log);
        expect(ingest.players.map(p => p.account)).toEqual(['A.1']);
    });
});

describe('finalizeIncomingSkillsByPlayer', () => {
    it('pools across fights and counts cast fights only where casts were measurable', () => {
        const measured = ingestLogIncomingSkillsByPlayer(makeLog({
            taken: { 'A.1': [{ id: 10, totalDamage: 1000, hits: 2 }] },
            casts: { 'A.1': [{ skill: 10, casts: 4 }] },
            skillMap: { s10: { name: 'Meteor Shower' } },
        }));
        const old = ingestLogIncomingSkillsByPlayer(makeLog({
            build: '20260114',
            taken: { 'A.1': [{ id: 10, totalDamage: 500, hits: 1 }] },
            skillMap: { s10: { name: 'Meteor Shower' } },
        }));
        const result = finalizeIncomingSkillsByPlayer([measured, old]);
        expect(result.castMeasuredFightCount).toBe(1);
        expect(result.castUnmeasuredFightCount).toBe(1);
        const a = result.players[0];
        expect(a.fightCount).toBe(2);
        expect(a.castFightCount).toBe(1);
        expect(a.totalDamage).toBe(1500);
        expect(a.totalCasts).toBe(4);
        expect(a.skills).toEqual([{ id: 10, name: 'Meteor Shower', icon: undefined, damage: 1500, hits: 3, casts: 4 }]);
    });

    it('keeps the top skills by casts even when they fall outside the top by damage', () => {
        const taken = Array.from({ length: 45 }, (_, i) => ({ id: 100 + i, totalDamage: 1000 - i, hits: 1 }));
        const ingest = ingestLogIncomingSkillsByPlayer(makeLog({
            taken: { 'A.1': taken },
            casts: { 'A.1': [{ skill: 999, casts: 50 }] },
        }));
        const skills = finalizeIncomingSkillsByPlayer([ingest]).players[0].skills;
        expect(skills.some(s => s.id === 999)).toBe(true);
        expect(skills.length).toBeLessThan(46);
    });
});
