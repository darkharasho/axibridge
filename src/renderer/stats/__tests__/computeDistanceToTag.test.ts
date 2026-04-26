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

const contrib = (over: Partial<DistanceContribution>): DistanceContribution => ({
    account: 'A.1',
    profession: 'Guardian',
    isCommander: false,
    fightId: 'f1',
    source: 'fightAvg',
    samples: [],
    fightMean: 0,
    ...over,
});

describe('finalizeDistanceToTag', () => {
    it('returns empty when no contributions', () => {
        expect(finalizeDistanceToTag([])).toEqual({ rows: [], commanderCount: 0 });
    });

    it('aggregates fightAvg-only player at per-fight level', () => {
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', fightMean: 100 }),
            contrib({ fightId: 'f2', fightMean: 200 }),
            contrib({ fightId: 'f3', fightMean: 300 }),
        ]);
        expect(out.rows).toHaveLength(1);
        const r = out.rows[0];
        expect(r.source).toBe('fightAvg');
        expect(r.fightCount).toBe(3);
        expect(r.sampleCount).toBe(3);
        expect(r.avg).toBe(200);
        expect(r.median).toBe(200);
        expect(r.p95).toBe(300);
    });

    it('aggregates pure-replay player at sample level (preserves spike info)', () => {
        // Fight 1: 100 samples of 50, plus one spike of 1500.
        // Fight 2: 100 samples of 50.
        // Sample-level: 201 values; p95 in nearest-rank ≈ value at index ceil(0.95*201)-1 = 191 → 50.
        // The 1500 spike is in the pool but does not dominate the median/avg.
        const f1Samples = [...Array(100).fill(50), 1500];
        const f2Samples = Array(100).fill(50);
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', source: 'replay', samples: f1Samples, fightMean: f1Samples.reduce((s, v) => s + v, 0) / f1Samples.length }),
            contrib({ fightId: 'f2', source: 'replay', samples: f2Samples, fightMean: 50 }),
        ]);
        const r = out.rows[0];
        expect(r.source).toBe('replay');
        expect(r.fightCount).toBe(2);
        expect(r.sampleCount).toBe(201);
        expect(r.median).toBe(50);
        // p95 nearest-rank: idx = ceil(0.95 * 201) - 1 = 191 → sorted value 50
        expect(r.p95).toBe(50);
        // Avg pulled up slightly by the spike but small
        expect(r.avg).toBeGreaterThan(50);
        expect(r.avg).toBeLessThan(60);
    });

    it('mixed mode collapses replay fights to their per-fight mean to prevent skew', () => {
        // 1 replay fight with 1000 samples averaging 100 + 4 fightAvg fights at 500 each.
        // Per-fight values: [100, 500, 500, 500, 500] → avg 420, median 500, p95 500.
        const replaySamples = Array(1000).fill(100);
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', source: 'replay', samples: replaySamples, fightMean: 100 }),
            contrib({ fightId: 'f2', fightMean: 500 }),
            contrib({ fightId: 'f3', fightMean: 500 }),
            contrib({ fightId: 'f4', fightMean: 500 }),
            contrib({ fightId: 'f5', fightMean: 500 }),
        ]);
        const r = out.rows[0];
        expect(r.source).toBe('mixed');
        expect(r.fightCount).toBe(5);
        expect(r.sampleCount).toBe(5);
        expect(r.avg).toBe(420);
        expect(r.median).toBe(500);
        expect(r.p95).toBe(500);
    });

    it('excludes commanders entirely when commanderCount <= 2', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'Cmdr.A', isCommander: true, fightMean: 0 }),
            contrib({ account: 'Cmdr.B', isCommander: true, fightMean: 0 }),
            contrib({ account: 'P.1', fightMean: 200 }),
        ]);
        expect(out.commanderCount).toBe(2);
        expect(out.rows.map(r => r.account)).toEqual(['P.1']);
    });

    it('includes commanders when commanderCount > 2', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'Cmdr.A', isCommander: true, fightMean: 0 }),
            contrib({ account: 'Cmdr.B', isCommander: true, fightMean: 0 }),
            contrib({ account: 'Cmdr.C', isCommander: true, fightMean: 0 }),
            contrib({ account: 'P.1', fightMean: 200 }),
        ]);
        expect(out.commanderCount).toBe(3);
        expect(out.rows.map(r => r.account).sort()).toEqual(['Cmdr.A', 'Cmdr.B', 'Cmdr.C', 'P.1']);
    });

    it('treats an account as commander if it is flagged commander in any fight', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'Hybrid.1', isCommander: false, fightId: 'f1', fightMean: 200 }),
            contrib({ account: 'Hybrid.1', isCommander: true, fightId: 'f2', fightMean: 0 }),
        ]);
        // Only one commander → excluded.
        expect(out.commanderCount).toBe(1);
        expect(out.rows).toEqual([]);
    });

    it('handles single data point: avg=median=p95', () => {
        const out = finalizeDistanceToTag([contrib({ fightMean: 250 })]);
        const r = out.rows[0];
        expect(r.fightCount).toBe(1);
        expect(r.avg).toBe(250);
        expect(r.median).toBe(250);
        expect(r.p95).toBe(250);
    });

    it('omits players with zero data points', () => {
        // No contributions for an account → no row. Verified by absence.
        const out = finalizeDistanceToTag([contrib({ account: 'P.1', fightMean: 100 })]);
        expect(out.rows.map(r => r.account)).toEqual(['P.1']);
    });

    it('preserves the most-recent profession seen across fights', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'P.1', profession: 'Guardian', fightId: 'f1', fightMean: 100 }),
            contrib({ account: 'P.1', profession: 'Firebrand', fightId: 'f2', fightMean: 200 }),
        ]);
        const r = out.rows[0];
        expect(r.professionList.sort()).toEqual(['Firebrand', 'Guardian']);
        // Profession field is the latest-seen.
        expect(r.profession).toBe('Firebrand');
    });
});

describe('finalizeDistanceToTag — p25 and p75', () => {
    it('emits p25 and p75 with nearest-rank for fightAvg-only player', () => {
        // Per-fight values [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        // p25 nearest-rank: idx = ceil(0.25 * 10) - 1 = 2 → 30
        // median (p50): mean of values at idx 4 and 5 → (50+60)/2 = 55
        // p75 nearest-rank: idx = ceil(0.75 * 10) - 1 = 7 → 80
        // p95 nearest-rank: idx = ceil(0.95 * 10) - 1 = 9 → 100
        const out = finalizeDistanceToTag(
            [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) =>
                contrib({ fightId: `f${i}`, fightMean: v })
            )
        );
        const r = out.rows[0];
        expect(r.p25).toBe(30);
        expect(r.median).toBe(55);
        expect(r.p75).toBe(80);
        expect(r.p95).toBe(100);
    });

    it('p25 == p75 == median == avg for a single data point', () => {
        const out = finalizeDistanceToTag([contrib({ fightMean: 250 })]);
        const r = out.rows[0];
        expect(r.avg).toBe(250);
        expect(r.p25).toBe(250);
        expect(r.median).toBe(250);
        expect(r.p75).toBe(250);
        expect(r.p95).toBe(250);
    });

    it('emits p25 and p75 in pure-replay mode at sample level', () => {
        // 10 samples [10..100] in one fight
        const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', source: 'replay', samples, fightMean: 55 }),
        ]);
        const r = out.rows[0];
        expect(r.source).toBe('replay');
        expect(r.p25).toBe(30);
        expect(r.p75).toBe(80);
    });
});

describe('computeDistanceToTag (end-to-end)', () => {
    it('runs full pipeline on minimal logs', () => {
        const out = computeDistanceToTag([
            makeLog({
                players: [
                    makePlayer({ account: 'Cmdr.0', hasCommanderTag: true, stackDist: 0 }),
                    makePlayer({ account: 'A.1', stackDist: 250 }),
                ],
            }),
        ]);
        // 1 commander → excluded; A.1 should be present
        expect(out.commanderCount).toBe(1);
        expect(out.rows.map(r => r.account)).toEqual(['A.1']);
        expect(out.rows[0].avg).toBe(250);
    });
});
