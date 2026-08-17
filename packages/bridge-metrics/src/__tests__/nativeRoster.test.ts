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
