import { describe, it, expect } from 'vitest';
import {
    createReviveDetailAccumulator, ingestLogReviveDetail, finalizeReviveDetail,
    extractReviveDetailFrame, mergeReviveDetailFrame,
} from '../computeReviveDetail';

const player = (over: any) => ({
    account: over.account, profession: over.profession || 'Guardian',
    combatReplayData: { down: over.down || [], dead: over.dead || [] },
    rotation: over.rotation || [],
});

const handReviveLog = () => ({
    details: {
        skillMap: {},
        players: [
            player({ account: 'Reviver', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000]] }),
        ],
    },
});

describe('computeReviveDetail', () => {
    it('aggregates one log into per-player rows', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), acc);
        const result = finalizeReviveDetail(acc);

        expect(result.squad).toMatchObject({ downs: 1, recovered: 1, died: 0, hand: 1 });
        const reviver = result.players.find((p) => p.account === 'Reviver')!;
        expect(reviver).toMatchObject({ attempts: 1, handRevives: 1, successRate: 1, totalRevives: 1 });
    });

    it('sums two logs', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), acc);
        ingestLogReviveDetail(handReviveLog(), acc);
        const result = finalizeReviveDetail(acc);
        expect(result.squad.recovered).toBe(2);
        expect(result.players.find((p) => p.account === 'Reviver')!.handRevives).toBe(2);
    });

    it('merging two single-log frames equals ingesting both logs', () => {
        const direct = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), direct);
        ingestLogReviveDetail(handReviveLog(), direct);

        const a = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), a);
        const b = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), b);
        mergeReviveDetailFrame(a, extractReviveDetailFrame(b));

        expect(finalizeReviveDetail(a)).toEqual(finalizeReviveDetail(direct));
    });

    it('counts a log without rotation as uncovered', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            { account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } },
        ] } }, acc);
        const result = finalizeReviveDetail(acc);
        expect(result.coverage).toEqual({ logsWithData: 0, logsWithoutData: 1 });
        expect(result.squad.downs).toBe(0);
    });

    it('reports Illusion of Life re-down median time', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000], [8000, 12000]], dead: [[12000, 20000]] }),
        ] } }, acc);
        const result = finalizeReviveDetail(acc);
        expect(result.iol).toMatchObject({ revives: 1, reDowned: 1, survived: 0 });
        expect(result.iol!.medianTimeToReDownMs).toBe(3000);
    });

    it('reports Illusion of Life survival when the revived player never goes down again', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000]] }),
        ] } }, acc);
        const result = finalizeReviveDetail(acc);
        expect(result.iol).toMatchObject({ revives: 1, reDowned: 0, survived: 1, medianTimeToReDownMs: null });
    });

    it('merges utility byCaster counts across logs and selects the correct top caster', () => {
        // Log A: CasterA revives one downed player once via Battle Standard (14419).
        const logA = {
            details: { skillMap: {}, players: [
                player({ account: 'CasterA', rotation: [{ id: 14419, skills: [{ castTime: 0, duration: 0 }] }] }),
                player({ account: 'DownedZ', down: [[1000, 5000]] }),
            ] },
        };
        // Log B: CasterB's single Battle Standard cast covers two different players'
        // stand-ups, crediting CasterB with two revives from one cast.
        const logB = {
            details: { skillMap: {}, players: [
                player({ account: 'CasterB', rotation: [{ id: 14419, skills: [{ castTime: 0, duration: 0 }] }] }),
                player({ account: 'DownedX', down: [[1000, 5000]] }),
                player({ account: 'DownedY', down: [[2000, 6000]] }),
            ] },
        };

        const accA = createReviveDetailAccumulator();
        ingestLogReviveDetail(logA, accA);
        const frameA = extractReviveDetailFrame(accA);

        const accB = createReviveDetailAccumulator();
        ingestLogReviveDetail(logB, accB);
        const frameB = extractReviveDetailFrame(accB);

        // Neither accA nor accB has ever seen the other's players — merging frameB
        // into a target that already holds frameA exercises the "new player row"
        // branch of mergeReviveDetailFrame, not just "sum into existing row".
        const target = createReviveDetailAccumulator();
        mergeReviveDetailFrame(target, frameA);
        mergeReviveDetailFrame(target, frameB);

        const result = finalizeReviveDetail(target);

        const battleStandard = result.utilities.find((u) => u.skillId === 14419)!;
        expect(battleStandard.casts).toBe(2);
        expect(battleStandard.revives).toBe(3);
        expect(battleStandard.revivesPerCast).toBe(1.5);
        expect(battleStandard.topCasterKey).toBe('CasterB|Guardian');

        const casterA = result.players.find((p) => p.account === 'CasterA')!;
        const casterB = result.players.find((p) => p.account === 'CasterB')!;
        expect(casterA.utilityRevives).toBe(1);
        expect(casterB.utilityRevives).toBe(2);
    });

    it('extracts a frame after ingesting a single uncovered log without throwing', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            { account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } },
        ] } }, acc);

        expect(() => extractReviveDetailFrame(acc)).not.toThrow();
        const frame = extractReviveDetailFrame(acc);
        expect(frame.acc.logsWithData).toBe(0);
        expect(frame.acc.logsWithoutData).toBe(1);

        const target = createReviveDetailAccumulator();
        mergeReviveDetailFrame(target, frame);
        const result = finalizeReviveDetail(target);
        expect(result.coverage).toEqual({ logsWithData: 0, logsWithoutData: 1 });
        expect(result.squad.downs).toBe(0);
    });

    it('finalizes an empty accumulator with no data at all', () => {
        const acc = createReviveDetailAccumulator();
        const result = finalizeReviveDetail(acc);
        expect(result.coverage).toEqual({ logsWithData: 0, logsWithoutData: 0 });
        expect(result.squad).toEqual({ downs: 0, recovered: 0, died: 0, hand: 0, utility: 0, self: 0, unattributed: 0 });
        expect(result.players).toEqual([]);
        expect(result.utilities).toEqual([]);
        expect(result.iol).toBeNull();
    });
});
