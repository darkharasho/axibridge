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
    playerKey: 'Reviver|Firebrand', playerIndex: 0, skillId: 1066, skillName: 'Resurrect',
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
        const casts = extractResurrectCasts(player, 'Reviver|Firebrand', 0, {});
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
        expect(result).toMatchObject({ kind: 'hand', primaryKey: 'Reviver|Firebrand', skillId: 1066, assistKeys: [] });
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

import { deriveReviveLogSummary, reviveePlayerKey } from '../reviveDerivation';

const details = (players: any[], skillMap: any = {}) => ({ players, skillMap });

const squadPlayer = (over: any) => ({
    account: over.account, profession: over.profession || 'Guardian',
    combatReplayData: { down: over.down || [], dead: over.dead || [] },
    rotation: over.rotation || [],
});

describe('reviveePlayerKey', () => {
    it('builds a key from account and profession', () => {
        expect(reviveePlayerKey({ account: 'A', profession: 'Guardian' })).toBe('A|Guardian');
    });

    it('falls back to name when account is absent', () => {
        expect(reviveePlayerKey({ name: 'Charname', profession: 'Guardian' })).toBe('Charname|Guardian');
    });

    it('falls back to Unknown for both account and profession when absent', () => {
        expect(reviveePlayerKey({})).toBe('Unknown|Unknown');
    });
});

describe('deriveReviveLogSummary', () => {
    it('summarises a hand revive across two players', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Reviver', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
        ]));

        expect(summary.hasData).toBe(true);
        expect(summary.downs).toBe(1);
        expect(summary.recovered).toBe(1);
        expect(summary.died).toBe(0);
        expect(summary.byKind.hand).toBe(1);
        expect(summary.players.get('Reviver|Guardian')).toMatchObject({
            attempts: 1, attemptTimeMs: 3000, handRevives: 1,
        });
    });

    it('counts an attempt that did not land as an attempt only', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Reviver', rotation: [{ id: 1066, skills: [{ castTime: 1000, duration: 500 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]], dead: [[5000, 9000]] }),
        ]));

        expect(summary.recovered).toBe(0);
        expect(summary.died).toBe(1);
        expect(summary.players.get('Reviver|Guardian')).toMatchObject({ attempts: 1, handRevives: 0 });
    });

    it('reports hasData false when a log has no rotation', () => {
        const summary = deriveReviveLogSummary({
            players: [{ account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } }],
            skillMap: {},
        });
        expect(summary.hasData).toBe(false);
    });

    it('tallies utility casts and revives per utility with a top caster', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
        ]));

        const iol = summary.utilities.get(10244);
        expect(iol).toMatchObject({ casts: 1, revives: 1 });
        expect(iol!.byCaster.get('Mes|Chronomancer')).toEqual({ casts: 1, revives: 1 });
        expect(summary.iolRevives).toEqual([{ playerKey: 'Downed|Guardian', playerIndex: 1, at: 5000 }]);
    });

    it('counts a caster who cast but never landed a revive, with zero revives', () => {
        // Two chronomancers cast Illusion of Life; only one of them is credited.
        // The other must still appear in byCaster — a per-caster breakdown that
        // silently omits unsuccessful casters cannot compute revives per cast.
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Hit', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            squadPlayer({ account: 'Miss', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 100, duration: 0 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
        ]));

        const iol = summary.utilities.get(10244)!;
        expect(iol.casts).toBe(2);
        expect(iol.revives).toBe(1);
        expect(iol.byCaster.get('Hit|Chronomancer')).toEqual({ casts: 1, revives: 1 });
        expect(iol.byCaster.get('Miss|Chronomancer')).toEqual({ casts: 1, revives: 0 });
    });

    it('carries the skill icon from the skill map onto the utility row', () => {
        const summary = deriveReviveLogSummary({
            ...details([
                squadPlayer({ account: 'Mes', profession: 'Chronomancer',
                    rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
                squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
            ]),
            skillMap: { s10244: { name: 'Illusion of Life', icon: 'https://example.test/iol.png' } },
        });

        expect(summary.utilities.get(10244)!.icon).toBe('https://example.test/iol.png');
    });

    it('leaves the icon null when the skill map carries none', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
        ]));

        expect(summary.utilities.get(10244)!.icon).toBeNull();
    });

    it('excludes non-squad players', () => {
        const pug = { ...squadPlayer({ account: 'Pug', down: [[1000, 5000]] }), notInSquad: true };
        expect(deriveReviveLogSummary(details([pug])).downs).toBe(0);
    });
});
