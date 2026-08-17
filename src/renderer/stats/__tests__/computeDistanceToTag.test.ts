import { describe, it, expect } from 'vitest';
import {
    ingestLogDistanceToTag,
    finalizeDistanceToTag,
    computeDistanceToTag,
    type DistanceContribution,
} from '../computeDistanceToTag';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'x',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

/**
 * A native-shaped log. `entities` is the roster; `blocks.replay.by_entity`
 * carries the intervals and the in-core distance scalars; `tracks.by_entity`
 * carries `[t_ms, x, y]` samples in WORLD INCHES.
 */
const makeLog = (overrides: any = {}) => {
    const entities = overrides.entities ?? [];
    const pollMs = overrides.pollMs ?? 150;
    const byEntity: any = {};
    const trackByEntity: any = {};
    for (const e of entities) {
        byEntity[e.id] = {
            start_ms: e.start_ms ?? 0, end_ms: 10_000, active_ms: 10_000,
            down: e.down ?? [], dead: e.dead ?? [], dc: [],
            dist_to_com: e.dist_to_com ?? null, stack_dist: e.stack_dist ?? null,
        };
        if (e.positions) {
            trackByEntity[e.id] = {
                // Samples land on the shared grid, starting at the first
                // multiple of pollMs at or after this entity's start.
                samples: e.positions.map((pt: [number, number], i: number) => [
                    (Math.max(1, Math.ceil((e.start_ms ?? 0) / pollMs)) + i) * pollMs,
                    pt[0], pt[1],
                ]),
                down_intervals: e.down ?? [], dead_intervals: e.dead ?? [], dc_intervals: [],
            };
        }
    }
    return {
        log: {
            filePath: overrides.filePath ?? 'fight-1',
            details: {
                durationMS: 10_000,
                native: {
                    axilog: { schema: '1.0' },
                    entities: entities.map((e: any) => ({
                        id: e.id,
                        account: e.account,
                        profession: e.profession ?? 'Guardian',
                        role: e.role ?? 'squad',
                        ...(e.commander ? { commander: { guid: 'g', segments: [[0, 10_000]], variant: 'blue' } } : {}),
                    })),
                    blocks: {
                        replay: {
                            by_entity: byEntity,
                            ...(overrides.noTracks ? {} : {
                                tracks: { poll_ms: pollMs, arena: ARENA, by_entity: trackByEntity },
                            }),
                        },
                    },
                },
            },
        },
    };
};

describe('ingestLogDistanceToTag', () => {
    it('returns empty when no players', () => {
        const out = ingestLogDistanceToTag(makeLog().log, 0);
        expect(out).toEqual([]);
    });

    it('emits fightAvg contributions from the native scalars when tracks are absent', () => {
        // Coarse mode: the user turned off position retention, so
        // pruneDetailsForStats dropped `tracks` but kept `by_entity`.
        const out = ingestLogDistanceToTag(
            makeLog({
                noTracks: true,
                entities: [
                    { id: 1, account: 'A.1', stack_dist: 200 },
                    { id: 2, account: 'B.2', stack_dist: 500 },
                    { id: 3, account: 'C.3', role: 'friendly_player', stack_dist: 999 },
                ],
            }).log,
            0,
        );
        expect(out).toHaveLength(2);
        expect(out.every(c => c.source === 'fightAvg')).toBe(true);
        expect(out.find(c => c.account === 'A.1')!.fightMean).toBe(200);
        expect(out.find(c => c.account === 'B.2')!.fightMean).toBe(500);
    });

    it('emits replay contribution with samples when commander + player have tracks', () => {
        // Commander at origin; player at (3,4) -> 5 WORLD INCHES. No
        // inchToPixel division, so 5 is 5 rather than 5/0.009.
        const out = ingestLogDistanceToTag(
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.0', commander: true, positions: [[0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'A.1', positions: [[3, 4], [6, 8], [9, 12]] },
                ],
            }).log,
            0,
        );
        const a = out.find(c => c.account === 'A.1')!;
        expect(a.source).toBe('replay');
        expect(a.samples).toEqual([5, 10, 15]);
        expect(a.fightMean).toBe(10);
    });

    it('flags commander contributions with isCommander=true', () => {
        const out = ingestLogDistanceToTag(
            makeLog({
                noTracks: true,
                entities: [
                    { id: 1, account: 'Cmdr.0', commander: true, stack_dist: 0 },
                    { id: 2, account: 'A.1', stack_dist: 200 },
                ],
            }).log,
            0,
        );
        expect(out.find(c => c.account === 'Cmdr.0')!.isCommander).toBe(true);
        expect(out.find(c => c.account === 'A.1')!.isCommander).toBe(false);
    });

    it('does not shift a mid-poll track against the tag', () => {
        // The bug this unit deletes: the old code derived the player's first
        // poll as floor(start / pollingRate) where ceil is correct, so a
        // player starting 300ms in was compared against the wrong tag tick.
        // 36 of 42 players on the committed fixture have a non-multiple start.
        // Native samples carry their own t_ms, so there is nothing to derive.
        const out = ingestLogDistanceToTag(
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.0', commander: true, positions: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'A.1', start_ms: 300, positions: [[3, 4], [6, 8], [9, 12]] },
                ],
            }).log,
            0,
        );
        expect(out.find(c => c.account === 'A.1')!.samples).toEqual([5, 10, 15]);
    });

    it('is unaffected by a start that is not a multiple of the poll rate', () => {
        // start_ms 2 with a 150ms grid: the first sample is still at t=150.
        const out = ingestLogDistanceToTag(
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.0', commander: true, positions: [[0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'A.1', start_ms: 2, positions: [[3, 4], [6, 8], [9, 12]] },
                ],
            }).log,
            0,
        );
        expect(out.find(c => c.account === 'A.1')!.samples).toEqual([5, 10, 15]);
    });

    it('reports world inches, not pixels divided by a rounded scale', () => {
        // EI's inchToPixel is rounded to 3dp (0.009 against a true 0.0087193),
        // so every distance the old path produced read 3.12% short. 1000
        // inches must read as exactly 1000.
        const out = ingestLogDistanceToTag(
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.0', commander: true, positions: [[0, 0]] },
                    { id: 2, account: 'A.1', positions: [[1000, 0]] },
                ],
            }).log,
            0,
        );
        expect(out.find(c => c.account === 'A.1')!.fightMean).toBe(1000);
    });

    it('returns nothing for a log with no native report at all', () => {
        expect(ingestLogDistanceToTag({ filePath: 'f', details: { players: [] } }, 0)).toEqual([]);
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
                noTracks: true,
                entities: [
                    { id: 1, account: 'Cmdr.0', commander: true, stack_dist: 0 },
                    { id: 2, account: 'A.1', stack_dist: 250 },
                ],
            }),
        ]);
        // 1 commander → excluded; A.1 should be present
        expect(out.commanderCount).toBe(1);
        expect(out.rows.map(r => r.account)).toEqual(['A.1']);
        expect(out.rows[0].avg).toBe(250);
    });
});
