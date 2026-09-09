import { describe, it, expect } from 'vitest';
import { deriveRecoveries, hasReviveData, extractResurrectCasts, attributeRecovery } from '../reviveDerivation';

const player = (down: number[][], dead: number[][]) => ({
    combatReplayData: { down, dead },
});

describe('deriveRecoveries', () => {
    it('counts a down that ended without a death as a recovery', () => {
        const result = deriveRecoveries(player([[1000, 5000]], []), 'A|Guardian', 0);
        expect(result).toEqual([{ playerKey: 'A|Guardian', playerIndex: 0, downStart: 1000, standUpAt: 5000 }]);
    });

    it('does not count a down that ended in death', () => {
        expect(deriveRecoveries(player([[1000, 5000]], [[5000, 9000]]), 'A|Guardian', 0)).toEqual([]);
    });

    it('tolerates a small gap between the down ending and the death starting', () => {
        expect(deriveRecoveries(player([[1000, 5000]], [[5120, 9000]]), 'A|Guardian', 0)).toEqual([]);
    });

    it('counts a later, separate death as a death and not a recovery match', () => {
        const result = deriveRecoveries(player([[1000, 5000]], [[40000, 50000]]), 'A|Guardian', 0);
        expect(result).toHaveLength(1);
    });

    it('handles several downs in one fight independently', () => {
        const result = deriveRecoveries(
            player([[1000, 2000], [8000, 9000], [20000, 21000]], [[9000, 30000]]),
            'A|Guardian', 0
        );
        expect(result.map((r) => r.standUpAt)).toEqual([2000, 21000]);
    });

    it('returns nothing when replay data is absent', () => {
        expect(deriveRecoveries({}, 'A|Guardian', 0)).toEqual([]);
    });
});

describe('hasReviveData', () => {
    it('is false without replay data', () => {
        expect(hasReviveData({ rotation: [] })).toBe(false);
    });

    it('is false without rotation', () => {
        expect(hasReviveData({ combatReplayData: { down: [], dead: [] } })).toBe(false);
    });

    it('is true with both', () => {
        expect(hasReviveData({ combatReplayData: { down: [], dead: [] }, rotation: [] })).toBe(true);
    });
});

const recovery = { playerKey: 'Downed|Scourge', playerIndex: 1, downStart: 1000, standUpAt: 5000 };

const cast = (over: Partial<any> = {}) => ({
    playerKey: 'Rezzer|Firebrand', playerIndex: 0, skillId: 1066, skillName: 'Resurrect',
    kind: 'hand' as const, start: 3000, end: 6000, ...over,
});

describe('extractResurrectCasts', () => {
    it('emits one cast per entry in skills[], not one per rotation entry', () => {
        const player = {
            rotation: [{ id: 1066, skills: [
                { castTime: 1000, duration: 500 },
                { castTime: 4000, duration: 900 },
            ] }],
        };
        const casts = extractResurrectCasts(player, 'Rezzer|Firebrand', 0, {});
        expect(casts).toHaveLength(2);
        expect(casts[1]).toMatchObject({ start: 4000, end: 4900, kind: 'hand' });
    });

    it('ignores skills that are not resurrects', () => {
        const player = { rotation: [{ id: 5491, skills: [{ castTime: 0, duration: 100 }] }] };
        expect(extractResurrectCasts(player, 'A|Elementalist', 0, { s5491: { name: 'Fireball' } })).toEqual([]);
    });

    it('extends a utility cast to its catalogued window', () => {
        const player = { rotation: [{ id: 14419, skills: [{ castTime: 1000, duration: 200 }] }] };
        const casts = extractResurrectCasts(player, 'A|Warrior', 0, {});
        expect(casts[0]).toMatchObject({ kind: 'utility', start: 1000, end: 46000 });
    });
});

describe('attributeRecovery', () => {
    it('credits a hand channel that covers the stand-up', () => {
        const result = attributeRecovery(recovery, [cast()]);
        expect(result).toMatchObject({ kind: 'hand', primaryKey: 'Rezzer|Firebrand', skillId: 1066, assistKeys: [] });
    });

    it('does NOT credit a channel that ended before the stand-up', () => {
        const result = attributeRecovery(recovery, [cast({ start: 1500, end: 2500 })]);
        expect(result.kind).toBe('unattributed');
        expect(result.primaryKey).toBeNull();
    });

    it('gives primary credit to the largest overlap and records the other as an assist', () => {
        const long = cast({ playerKey: 'Long|Guardian', playerIndex: 2, start: 1200, end: 6000 });
        const short = cast({ playerKey: 'Short|Druid', playerIndex: 3, start: 4800, end: 6000 });
        const result = attributeRecovery(recovery, [short, long]);
        expect(result.primaryKey).toBe('Long|Guardian');
        expect(result.assistKeys).toEqual(['Short|Druid']);
    });

    it('ignores a hand channel cast by the downed player themselves', () => {
        const self = cast({ playerKey: 'Downed|Scourge', playerIndex: 1 });
        expect(attributeRecovery(recovery, [self]).kind).toBe('unattributed');
    });

    it('falls through to a utility when no hand channel covers the stand-up', () => {
        const utility = cast({ playerKey: 'Mesmer|Chronomancer', playerIndex: 4, skillId: 10244,
            skillName: 'Illusion of Life', kind: 'utility', start: 4000, end: 9000 });
        const result = attributeRecovery(recovery, [utility]);
        expect(result).toMatchObject({ kind: 'utility', primaryKey: 'Mesmer|Chronomancer', skillId: 10244 });
    });

    it('prefers a hand channel over a utility when both cover the stand-up', () => {
        const utility = cast({ playerKey: 'Mesmer|Chronomancer', playerIndex: 4, skillId: 10244,
            kind: 'utility', start: 4000, end: 9000 });
        expect(attributeRecovery(recovery, [utility, cast()]).kind).toBe('hand');
    });

    it('rejects a utility whose caster was out of range', () => {
        const utility = cast({ playerKey: 'Far|Warrior', playerIndex: 5, skillId: 14419,
            kind: 'utility', start: 1000, end: 46000 });
        const result = attributeRecovery(recovery, [utility], { isWithinRadius: () => false });
        expect(result.kind).toBe('unattributed');
    });

    it('credits a self resurrect to the downed player', () => {
        const bandage = cast({ playerKey: 'Downed|Scourge', playerIndex: 1, skillId: 1175,
            skillName: 'Bandage', kind: 'self', start: 3000, end: 6000 });
        expect(attributeRecovery(recovery, [bandage])).toMatchObject({ kind: 'self', primaryKey: 'Downed|Scourge' });
    });

    it('reports unattributed rather than dropping the recovery', () => {
        expect(attributeRecovery(recovery, [])).toMatchObject({ kind: 'unattributed', primaryKey: null, assistKeys: [] });
    });
});
