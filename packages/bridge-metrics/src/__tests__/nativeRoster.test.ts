import { describe, expect, it } from 'vitest';
import {
    squadEntities,
    friendlyPlayerEntities,
    enemyPlayerEntities,
    combatParticipantEnemies,
    getEntityAccountKey,
    getEntityProfession,
    entitiesById,
} from '../nativeRoster';

const entity = (over: any = {}) => ({
    id: 0,
    account: ':Someone.1234',
    character: 'Someone',
    role: 'squad',
    combat_participant: true,
    profession: 'Engineer',
    elite_spec: 'Holosmith',
    subgroup: 1,
    agent_addr: 1,
    instid: 1,
    ...over,
});

const report = (entities: any[]) => ({ entities } as any);

describe('nativeRoster filters', () => {
    const r = report([
        entity({ id: 0, role: 'squad', account: ':A.1' }),
        entity({ id: 1, role: 'squad', account: ':B.2' }),
        entity({ id: 2, role: 'friendly_player', account: ':C.3' }),
        entity({ id: 3, role: 'enemy_player', account: ':D.4', combat_participant: true }),
        entity({ id: 4, role: 'enemy_player', account: ':E.5', combat_participant: false }),
        entity({ id: 5, role: 'npc', account: '', combat_participant: true }),
        entity({ id: 6, role: 'npc', account: '', combat_participant: false }),
    ]);

    it('selects squad by role', () => {
        expect(squadEntities(r).map((e) => e.id)).toEqual([0, 1]);
    });

    it('selects non-squad allies by role', () => {
        expect(friendlyPlayerEntities(r).map((e) => e.id)).toEqual([2]);
    });

    it("selects EI's curated targets equivalent by role", () => {
        expect(enemyPlayerEntities(r).map((e) => e.id)).toEqual([3, 4]);
    });

    it('selects combat-participant enemies as non-squad AND participating', () => {
        expect(combatParticipantEnemies(r).map((e) => e.id)).toEqual([2, 3, 5]);
    });

    it('tolerates a report with no entities array', () => {
        expect(squadEntities({} as any)).toEqual([]);
        expect(enemyPlayerEntities({ entities: null } as any)).toEqual([]);
    });
});

describe('getEntityAccountKey', () => {
    it('prefers the account', () => {
        expect(getEntityAccountKey(entity({ account: ':A.1', character: 'Char' }))).toBe('acct::A.1');
    });

    it('falls back to the character name', () => {
        expect(getEntityAccountKey(entity({ account: '', character: 'Char' }))).toBe('name:Char');
    });

    it('rejects the literal Unknown on both fields', () => {
        expect(getEntityAccountKey(entity({ account: 'Unknown', character: 'Unknown' }))).toBeNull();
    });

    it('returns null when neither is usable', () => {
        expect(getEntityAccountKey(entity({ account: '  ', character: '' }))).toBeNull();
    });
});

describe('getEntityProfession', () => {
    it('returns the elite spec, which is what EI called profession', () => {
        expect(getEntityProfession(entity({ profession: 'Engineer', elite_spec: 'Holosmith' })))
            .toBe('Holosmith');
    });

    it('falls back to the base class for a core build with no elite spec', () => {
        expect(getEntityProfession(entity({ profession: 'Engineer', elite_spec: undefined })))
            .toBe('Engineer');
    });

    it('returns Unknown when neither is present', () => {
        expect(getEntityProfession(entity({ profession: '', elite_spec: undefined })))
            .toBe('Unknown');
    });
});

describe('entitiesById', () => {
    it('keys entities by their native id', () => {
        const map = entitiesById(report([entity({ id: 7, account: ':Z.9' })]));
        expect(map.get(7)?.account).toBe(':Z.9');
        expect(map.get(99)).toBeUndefined();
    });
});

describe('sentinel handling — the three states EI collapsed into one', () => {
    it('distinguishes a squad with zero members from a report that has no roster', () => {
        // "ran, found nothing" vs "never ran". Both yield an empty array here,
        // but they must be distinguishable at the coverage layer, not inferred
        // from emptiness. This test pins that the FILTER never invents members
        // for either case.
        expect(squadEntities({ entities: [] } as any)).toEqual([]);
        expect(squadEntities({} as any)).toEqual([]);
    });

    it('treats combat_participant absent as NOT participating, never as true', () => {
        const r = {
            entities: [
                { id: 0, role: 'npc', account: '', combat_participant: undefined },
                { id: 1, role: 'npc', account: '', combat_participant: false },
                { id: 2, role: 'npc', account: '', combat_participant: true },
            ],
        } as any;
        // Strict === true, so an absent flag cannot be silently promoted.
        expect(combatParticipantEnemies(r).map((e) => e.id)).toEqual([2]);
    });

    it('treats an unrecognised role as not-squad rather than defaulting to squad', () => {
        const r = { entities: [{ id: 0, role: 'some_future_role', combat_participant: true }] } as any;
        expect(squadEntities(r)).toEqual([]);
        expect(enemyPlayerEntities(r)).toEqual([]);
        // But it IS a combat participant, because that is a separate fact.
        expect(combatParticipantEnemies(r).map((e) => e.id)).toEqual([0]);
    });

    it('does not confuse subgroup 0 with an absent subgroup', () => {
        const zero = { id: 0, role: 'squad', account: ':A.1', subgroup: 0 } as any;
        const absent = { id: 1, role: 'squad', account: ':B.2' } as any;
        expect(zero.subgroup).toBe(0);
        expect(absent.subgroup).toBeUndefined();
        // The trap: `entity.subgroup || 1` would turn a real 0 into 1.
        expect(squadEntities({ entities: [zero, absent] } as any).map((e) => e.subgroup))
            .toEqual([0, undefined]);
    });

    it('does not treat the zero guild id as a repped guild', () => {
        // Anonymized fixtures carry the zero guild on every entity. A reader
        // that trusted presence over value would report a session guild of
        // all-zeros for every anonymized log.
        const ZERO = '00000000-0000-0000-0000-000000000000';
        const e = { id: 0, role: 'squad', account: ':A.1', guild_id: ZERO } as any;
        expect(e.guild_id).toBe(ZERO);
        expect(squadEntities({ entities: [e] } as any)).toHaveLength(1);
    });
});
