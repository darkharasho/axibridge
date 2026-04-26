import { describe, it, expect } from 'vitest';
import {
    ingestLogDistanceToTag,
    finalizeDistanceToTag,
    computeDistanceToTag,
    type DistanceContribution,
} from '../computeDistanceToTag';

const makeLog = (overrides: any = {}) => ({
    log: {
        filePath: overrides.filePath ?? 'fight-1',
        details: {
            combatReplayMetaData: {
                pollingRate: overrides.pollingRate ?? 150,
                inchToPixel: overrides.inchToPixel ?? 1,
            },
            players: overrides.players ?? [],
            ...(overrides.detailsExtra ?? {}),
        },
    },
});

const makePlayer = (opts: {
    account: string;
    profession?: string;
    hasCommanderTag?: boolean;
    notInSquad?: boolean;
    positions?: Array<[number, number]>;
    start?: number;
    stackDist?: number;
}) => ({
    account: opts.account,
    profession: opts.profession ?? 'Guardian',
    hasCommanderTag: opts.hasCommanderTag ?? false,
    notInSquad: opts.notInSquad ?? false,
    statsAll: [{ stackDist: opts.stackDist ?? 0 }],
    combatReplayData: opts.positions
        ? { positions: opts.positions, start: opts.start ?? 0 }
        : undefined,
});

describe('ingestLogDistanceToTag', () => {
    it('returns empty when no players', () => {
        const out = ingestLogDistanceToTag(makeLog().log, 0);
        expect(out).toEqual([]);
    });

    it('emits fightAvg contribution per non-squad-excluded player when replay data is missing', () => {
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({ account: 'A.1', stackDist: 200 }),
                    makePlayer({ account: 'B.2', stackDist: 500 }),
                    makePlayer({ account: 'C.3', notInSquad: true, stackDist: 999 }),
                ],
            }).log,
            0
        );
        expect(out).toHaveLength(2);
        expect(out.every(c => c.source === 'fightAvg')).toBe(true);
        expect(out.find(c => c.account === 'A.1')!.fightMean).toBe(200);
        expect(out.find(c => c.account === 'B.2')!.fightMean).toBe(500);
    });

    it('emits replay contribution with samples when commander + player have positions', () => {
        // Commander at origin; player at (3,4) → distance 5 (inchToPixel=1)
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({
                        account: 'Cmdr.0',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0]],
                        stackDist: 0,
                    }),
                    makePlayer({
                        account: 'A.1',
                        positions: [[3, 4], [6, 8], [9, 12]],
                        stackDist: 999,
                    }),
                ],
            }).log,
            0
        );
        const a = out.find(c => c.account === 'A.1')!;
        expect(a.source).toBe('replay');
        expect(a.samples).toEqual([5, 10, 15]);
        expect(a.fightMean).toBe(10);
    });

    it('flags commander contributions with isCommander=true', () => {
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({ account: 'Cmdr.0', hasCommanderTag: true, stackDist: 0 }),
                    makePlayer({ account: 'A.1', stackDist: 200 }),
                ],
            }).log,
            0
        );
        expect(out.find(c => c.account === 'Cmdr.0')!.isCommander).toBe(true);
        expect(out.find(c => c.account === 'A.1')!.isCommander).toBe(false);
    });

    it('handles offset replay starts', () => {
        // pollingRate=150, player starts 300ms in (offset=2)
        // Commander positions: 5 ticks at origin
        // Player positions (start=300): 3 ticks at (3,4), (6,8), (9,12)
        // Aligned tag indices: 2,3,4 (still origin) → distances 5,10,15
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({
                        account: 'Cmdr.0',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                    }),
                    makePlayer({
                        account: 'A.1',
                        positions: [[3, 4], [6, 8], [9, 12]],
                        start: 300,
                    }),
                ],
            }).log,
            0
        );
        const a = out.find(c => c.account === 'A.1')!;
        expect(a.samples).toEqual([5, 10, 15]);
    });
});
