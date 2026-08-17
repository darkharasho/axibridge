import { describe, it, expect } from 'vitest';
import { computeOnTagReview, ON_TAG_RANGE, RUN_BACK_RANGE } from '../computeOnTagReview';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'x',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

/**
 * A native-shaped log at a 150ms poll. Positions are WORLD INCHES: 600 is the
 * On-Tag boundary, 5000 the Run-Back boundary. A track's first sample lands at
 * `ceil(start_ms / pollMs) * pollMs`, matching what axilog emits.
 *
 * Only `dead` produces an event. Native records deaths as their own intervals,
 * already linked to the down that caused them, so there is no "does this down's
 * second value appear in the dead set" inference left to make.
 */
const makeLog = (overrides: any = {}) => {
    const entities = overrides.entities ?? [];
    const pollMs = overrides.pollMs ?? 150;
    const byEntity: any = {};
    const trackByEntity: any = {};
    for (const e of entities) {
        byEntity[e.id] = {
            start_ms: e.start_ms ?? 0, end_ms: 120_000, active_ms: 120_000,
            down: e.down ?? [], dead: e.dead ?? [], dc: [],
            dist_to_com: e.dist_to_com ?? null, stack_dist: e.stack_dist ?? null,
        };
        if (e.positions?.length) {
            trackByEntity[e.id] = {
                samples: e.positions.map((pt: [number, number], i: number) => [
                    (Math.ceil((e.start_ms ?? 0) / pollMs) + i) * pollMs, pt[0], pt[1],
                ]),
                down_intervals: e.down ?? [], dead_intervals: e.dead ?? [], dc_intervals: [],
            };
        }
    }
    return {
        log: {
            filePath: overrides.filePath ?? 'fight-1',
            encounterName: 'Skirmish',
            details: {
                fightName: 'Skirmish',
                durationMS: 120000,
                players: [],
                targets: [],
                native: {
                    axilog: { schema: '1.0' },
                    entities: entities.map((e: any) => ({
                        id: e.id, account: e.account,
                        profession: e.profession ?? 'Guardian', role: e.role ?? 'squad',
                        ...(e.commander ? { commander: { guid: 'g', segments: [[0, 120_000]], variant: 'blue' } } : {}),
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
            dashboardSummary: { isWin: true },
        },
    };
};

/** A stationary tag at the origin, sampled `n` times from t=0. */
const stationaryCommander = (n = 3, over: any = {}) => ({
    id: 1, account: 'Cmdr.5678', commander: true,
    positions: Array.from({ length: n }, () => [0, 0] as [number, number]),
    ...over,
});

const findRow = (result: any, account: string) =>
    result.rows.find((r: any) => r.account === account);

describe('computeOnTagReview', () => {
    it('exports the Drevarr thresholds', () => {
        expect(ON_TAG_RANGE).toBe(600);
        expect(RUN_BACK_RANGE).toBe(5000);
    });

    it('returns empty result for empty input', () => {
        expect(computeOnTagReview([])).toEqual({ rows: [], usableFightCount: 0 });
    });

    it('produces no rows when no fight has a commander with a track', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    { id: 2, account: 'Player.1234', positions: [[0, 0], [500, 500]], dead: [[150, 300]] },
                ],
            }),
        ]);
        expect(result.rows).toEqual([]);
        expect(result.usableFightCount).toBe(0);
    });

    it('classifies a death at exactly 600 inches as On-Tag', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[600, 0], [600, 0], [600, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.onTag).toBe(1);
        expect(row.offTag).toBe(0);
        expect(row.runBack).toBe(0);
        expect(row.total).toBe(1);
        expect(row.offTagRanges).toEqual([]);
        expect(result.usableFightCount).toBe(1);
    });

    it('classifies a death at exactly 5000 inches as Off-Tag and records the range', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[5000, 0], [5000, 0], [5000, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.onTag).toBe(0);
        expect(row.offTag).toBe(1);
        expect(row.runBack).toBe(0);
        expect(row.total).toBe(1);
        expect(row.offTagRanges).toEqual([5000]);
    });

    it('classifies a death beyond 5000 inches as Run-Back without recording a range', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[10000, 0], [10000, 0], [10000, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.onTag).toBe(0);
        expect(row.offTag).toBe(0);
        expect(row.runBack).toBe(1);
        expect(row.total).toBe(1);
        expect(row.offTagRanges).toEqual([]);
    });

    it('reports world inches, not pixels divided by a rounded scale', () => {
        // EI's inchToPixel is rounded to 3dp (0.009 against a true 0.0087193),
        // so a player parked 1000 inches out used to be reported at ~969 --
        // 3.12% short, systematically, and enough to move a borderline death
        // across the 600-inch On-Tag line.
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[1000, 0], [1000, 0], [1000, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        expect(findRow(result, 'Player.1234').offTagRanges).toEqual([1000]);
        expect(findRow(result, 'Player.1234').avgDist).toBe(1000);
    });

    it('counts After-Tag as an overlay when the death is after the tag first died', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(4, { dead: [[100, 5000]] }),
                    { id: 2, account: 'Late.1234', positions: [[300, 0], [300, 0], [300, 0], [300, 0]], dead: [[300, 600]] },
                    { id: 3, account: 'Early.1234', positions: [[300, 0], [300, 0], [300, 0], [300, 0]], dead: [[50, 600]] },
                ],
            }),
        ]);
        const late = findRow(result, 'Late.1234');
        expect(late.afterTag).toBe(1);
        expect(late.onTag).toBe(1); // still distance-classified
        expect(late.total).toBe(1); // Total = onTag + offTag + runBack
        const early = findRow(result, 'Early.1234');
        expect(early.afterTag).toBe(0);
        expect(early.onTag).toBe(1);
    });

    it('does not count After-Tag when the commander never died', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(4),
                    { id: 2, account: 'Player.1234', positions: [[300, 0], [300, 0], [300, 0], [300, 0]], dead: [[300, 600]] },
                ],
            }),
        ]);
        expect(findRow(result, 'Player.1234').afterTag).toBe(0);
    });

    it('excludes rallied downs but keeps the player as a zero-death row', () => {
        // A down the player got back up from has no dead interval at all.
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[1200, 0], [1200, 0], [1200, 0]], down: [[150, 300]], dead: [] },
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.total).toBe(0);
        expect(row.onTag).toBe(0);
        expect(row.avgDist).toBe(1200);
        expect(row.fightCount).toBe(1);
    });

    it('ignores a death interval that starts before the fight', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[1200, 0], [1200, 0], [1200, 0]], dead: [[-50, 300]] },
                ],
            }),
        ]);
        expect(findRow(result, 'Player.1234').total).toBe(0);
    });

    it("counts the commander's own death as On-Tag at distance 0", () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [[15000, 0], [15000, 0], [15000, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        const row = findRow(result, 'Cmdr.5678');
        expect(row.isCommander).toBe(true);
        expect(row.onTag).toBe(1);
        expect(row.total).toBe(1);
        expect(row.avgDist).toBe(0);
    });

    it("truncates Avg Dist samples at the player's first death", () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Player.1234', positions: [[1200, 0], [5000, 0], [5000, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        // Death at t=150 => only the t=0 sample counts => 1200, not the mean
        // of 1200/5000/5000.
        expect(findRow(result, 'Player.1234').avgDist).toBe(1200);
    });

    it("truncates Avg Dist samples at the tag's death even if the player survived", () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(3, { dead: [[150, 5000]] }),
                    { id: 2, account: 'Player.1234', positions: [[1200, 0], [10000, 0], [10000, 0]], dead: [], down: [] },
                ],
            }),
        ]);
        expect(findRow(result, 'Player.1234').avgDist).toBe(1200);
    });

    it('does not shift a mid-poll track against the tag', () => {
        // The regression this unit exists for: the old path derived the
        // player's first poll as floor(start / pollingRate) where ceil is
        // correct. 36 of 42 players on the committed fixture have a start that
        // is not a multiple of the poll rate. Here the player joins at 150ms,
        // so their samples are t=150/300 and both sides are read at the same
        // instant rather than at two separately-derived indices.
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(4),
                    { id: 2, account: 'Late.9999', start_ms: 150, positions: [[2000, 0], [2000, 0]], dead: [[300, 600]] },
                ],
            }),
        ]);
        const row = findRow(result, 'Late.9999');
        expect(row.offTag).toBe(1);
        expect(row.offTagRanges).toEqual([2000]);
        expect(row.avgDist).toBe(2000);
    });

    it('falls back to the native dist_to_com when the player has no track', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'NoReplay.1111', dist_to_com: 800.4 },
                ],
            }),
        ]);
        expect(findRow(result, 'NoReplay.1111').avgDist).toBe(800);
    });

    it('ignores the -1 no-distance sentinel and out-of-range values', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Neg.2222', dist_to_com: -1 },
                    { id: 3, account: 'Far.3333', dist_to_com: 999999 },
                ],
            }),
        ]);
        expect(findRow(result, 'Neg.2222')).toBeUndefined();
        expect(findRow(result, 'Far.3333')).toBeUndefined();
    });

    it('excludes non-squad players', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(),
                    { id: 2, account: 'Enemy.3333', role: 'enemy_player', positions: [[600, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        expect(findRow(result, 'Enemy.3333')).toBeUndefined();
    });

    it('aggregates counts, ranges, fights, and Avg Dist across fights by account', () => {
        const fight = (range: number, filePath: string) => makeLog({
            filePath,
            entities: [
                stationaryCommander(),
                {
                    id: 2, account: 'Player.1234',
                    profession: filePath === 'f1' ? 'Guardian' : 'Firebrand',
                    positions: [[range, 0], [range, 0], [range, 0]],
                    dead: [[150, 300]],
                },
            ],
        });
        const result = computeOnTagReview([fight(2000, 'f1'), fight(1000, 'f2')]);
        const row = findRow(result, 'Player.1234');
        expect(row.fightCount).toBe(2);
        expect(row.offTag).toBe(2);
        expect(row.total).toBe(2);
        expect(row.offTagRanges).toEqual([2000, 1000]); // sorted desc
        expect(row.avgDist).toBe(1500); // mean of per-fight means (2000, 1000)
        expect(row.profession).toBe('Firebrand');
        expect(row.professionList).toEqual(['Guardian', 'Firebrand']);
        expect(result.usableFightCount).toBe(2);
    });

    it('sorts rows by total deaths descending by default', () => {
        const result = computeOnTagReview([
            makeLog({
                entities: [
                    stationaryCommander(5),
                    { id: 2, account: 'Zero.1111', positions: [[600, 0], [600, 0], [600, 0]] },
                    { id: 3, account: 'Two.2222', positions: [[600, 0], [600, 0], [600, 0], [600, 0], [600, 0]], dead: [[150, 300], [450, 600]] },
                    { id: 4, account: 'One.3333', positions: [[600, 0], [600, 0], [600, 0]], dead: [[150, 300]] },
                ],
            }),
        ]);
        expect(result.rows.map((r: any) => r.account)).toEqual(['Two.2222', 'One.3333', 'Cmdr.5678', 'Zero.1111']);
    });
});
