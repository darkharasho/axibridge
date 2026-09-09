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

const handRezLog = () => ({
    details: {
        skillMap: {},
        players: [
            player({ account: 'Rezzer', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000]] }),
        ],
    },
});

describe('computeReviveDetail', () => {
    it('aggregates one log into per-player rows', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), acc);
        const result = finalizeReviveDetail(acc);

        expect(result.squad).toMatchObject({ downs: 1, recovered: 1, died: 0, hand: 1 });
        const rezzer = result.players.find((p) => p.account === 'Rezzer')!;
        expect(rezzer).toMatchObject({ attempts: 1, handRevives: 1, successRate: 1, totalRevives: 1 });
    });

    it('sums two logs', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), acc);
        ingestLogReviveDetail(handRezLog(), acc);
        const result = finalizeReviveDetail(acc);
        expect(result.squad.recovered).toBe(2);
        expect(result.players.find((p) => p.account === 'Rezzer')!.handRevives).toBe(2);
    });

    it('merging two single-log frames equals ingesting both logs', () => {
        const direct = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), direct);
        ingestLogReviveDetail(handRezLog(), direct);

        const a = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), a);
        const b = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), b);
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

    it('reports Illusion of Life survival', () => {
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
});
