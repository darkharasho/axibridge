import { describe, it, expect } from 'vitest';
import { computeTagDistanceDeaths } from '../computeTagDistanceDeaths';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'x',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

/**
 * A native-shaped log. Positions are WORLD INCHES on a `pollMs` grid; the first
 * sample of an entity lands on the first multiple of `pollMs` at or after its
 * `start_ms`, exactly as axilog emits them.
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
            encounterName: overrides.encounterName ?? 'Skirmish',
            details: {
                fightName: overrides.fightName ?? 'Skirmish',
                durationMS: overrides.durationMS ?? 120000,
                players: [],
                targets: [],
                native: {
                    axilog: { schema: '1.0' },
                    entities: entities.map((e: any) => ({
                        id: e.id, account: e.account, profession: 'Guardian', role: e.role ?? 'squad',
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
            dashboardSummary: overrides.dashboardSummary ?? { isWin: true },
        },
    };
};

describe('computeTagDistanceDeaths', () => {
    it('returns empty array for empty input', () => {
        expect(computeTagDistanceDeaths([])).toEqual([]);
    });

    it('returns hasReplayData=false when no commander is tagged', () => {
        const result = computeTagDistanceDeaths([
            makeLog({ entities: [{ id: 1, account: 'Player.1234', positions: [[0, 0], [10, 10]] }] }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(false);
        expect(result[0].events).toEqual([]);
    });

    it('returns hasReplayData=false when the commander has no track', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [] },
                    { id: 2, account: 'Player.1234', positions: [[0, 0]], dead: [[300, 600]] },
                ],
            }),
        ]);
        expect(result[0].hasReplayData).toBe(false);
    });

    it('returns hasReplayData=false in coarse mode, where tracks were pruned', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                noTracks: true,
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true },
                    { id: 2, account: 'Player.1234', dead: [[150, 300]] },
                ],
            }),
        ]);
        expect(result[0].hasReplayData).toBe(false);
    });

    it('computes point-in-time distance for a death event, in world inches', () => {
        // Commander stationary at the origin; the player is 200 inches out on x
        // at the second poll. 200 inches must read as 200 — the old path
        // computed hypot(pixels) / inchToPixel with a scale EI rounds to 3dp,
        // so every distance here read 3.12% short.
        const result = computeTagDistanceDeaths([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [[0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'Player.1234', positions: [[100, 0], [200, 0], [300, 0]], dead: [[150, 900]] },
                ],
            }),
        ]);
        expect(result[0].hasReplayData).toBe(true);
        expect(result[0].eventCount).toBe(1);
        expect(result[0].events[0].playerAccount).toBe('Player.1234');
        expect(result[0].events[0].timeIntoFightMs).toBe(150);
        expect(result[0].events[0].distanceFromTag).toBe(200);
    });

    it('excludes rallied downs — only dead intervals become events', () => {
        // Native records down and dead separately and already linked, so a
        // down with no death simply has no dead interval. The old path had to
        // infer the link by matching a down entry's second value against a set
        // built from the dead array.
        const result = computeTagDistanceDeaths([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [[0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'Player.1234', positions: [[100, 0], [200, 0], [300, 0]], down: [[150, 450]], dead: [] },
                ],
            }),
        ]);
        expect(result[0].eventCount).toBe(0);
        expect(result[0].events).toEqual([]);
    });

    it('resolves a death that falls between polls to the last known position', () => {
        // Deaths are arcdps timestamps and do not land on the polling grid.
        // The track runs t=0/150/300; a death at 170ms resolves to the t=150
        // sample — where the actor was last seen — not to an interpolation.
        const result = computeTagDistanceDeaths([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [[0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'Player.1234', positions: [[100, 0], [200, 0], [300, 0]], dead: [[170, 900]] },
                ],
            }),
        ]);
        expect(result[0].events[0].distanceFromTag).toBe(200);
        expect(result[0].events[0].timeIntoFightMs).toBe(170);
    });

    it('does not shift a mid-poll track against the tag', () => {
        // The player joins at 300ms, so their samples are t=300,450,600 while
        // the tag's run t=150,300,450. The old code derived the player's first
        // poll as floor(300/150)=2 and the tag index as floor(deathMs/150),
        // comparing samples that were never simultaneous. Here both sides are
        // looked up by the same timestamp, so a stationary tag gives exactly
        // the player's own offset from the origin.
        const result = computeTagDistanceDeaths([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [[0, 0], [0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'Player.1234', start_ms: 300, positions: [[500, 0], [600, 0]], dead: [[450, 900]] },
                ],
            }),
        ]);
        expect(result[0].events[0].distanceFromTag).toBe(600);
    });

    it('orders events by time so the fight reads chronologically', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                entities: [
                    { id: 1, account: 'Cmdr.5678', commander: true, positions: [[0, 0], [0, 0], [0, 0]] },
                    { id: 2, account: 'Late.1', positions: [[100, 0], [200, 0], [300, 0]], dead: [[450, 900]] },
                    { id: 3, account: 'Early.2', positions: [[10, 0], [20, 0], [30, 0]], dead: [[150, 900]] },
                ],
            }),
        ]);
        expect(result[0].events.map(e => e.playerAccount)).toEqual(['Early.2', 'Late.1']);
    });
});
