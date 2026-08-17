import { describe, it, expect } from 'vitest';
import { computePositioning, classifyDegree, OUT_OF_POSITION } from '../positioning';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'x',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

/** Two players 200 and 2000 inches out on x, plus a commander at the origin. */
const report = (): any => ({
    details: {
        native: {
            axilog: { schema: '1.0' },
            entities: [
                { id: 1, account: 'Cmdr.1111', role: 'squad', commander: { guid: 'g', segments: [[0, 900]], variant: 'blue' } },
                { id: 2, account: 'Near.2222', role: 'squad' },
                { id: 3, account: 'Far.3333', role: 'squad' },
            ],
            blocks: {
                replay: {
                    by_entity: {
                        1: { start_ms: 0, end_ms: 900, active_ms: 900, down: [], dead: [], dc: [], dist_to_com: 0, stack_dist: 500 },
                        2: { start_ms: 0, end_ms: 900, active_ms: 900, down: [], dead: [], dc: [], dist_to_com: 200, stack_dist: 300 },
                        3: { start_ms: 0, end_ms: 900, active_ms: 900, down: [], dead: [], dc: [], dist_to_com: 2000, stack_dist: 1500 },
                    },
                    tracks: {
                        poll_ms: 300,
                        arena: ARENA,
                        by_entity: {
                            1: { samples: [[300, 0, 0], [600, 0, 0], [900, 0, 0]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                            2: { samples: [[300, 200, 0], [600, 200, 0], [900, 200, 0]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                            3: { samples: [[300, 2000, 0], [600, 2000, 0], [900, 2000, 0]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                        },
                    },
                },
            },
        },
        durationMS: 900,
    },
});

describe('computePositioning on native', () => {
    it('classifies a log with tracks as full', () => {
        expect(classifyDegree(report())).toBe('full');
    });

    it('falls back to coarse when only the scalars are present', () => {
        const r = report();
        delete r.details.native.blocks.replay.tracks;
        expect(classifyDegree(r)).toBe('coarse');
    });

    it('reports distances in world inches with no pixel conversion', () => {
        // 200 inches is 200 inches. Under the old path this was
        // hypot(px) / 0.009 and read ~3.12% short.
        const out = computePositioning(report());
        const near = out.perPlayer.find((p) => p.account === 'Near.2222')!;
        expect(near.avgDistToTag).toBe(200);
        expect(near.peakDistToTag).toBe(200);
    });

    it('omits the commander from the distance ranking', () => {
        const out = computePositioning(report());
        expect(out.perPlayer.map((p) => p.account)).toEqual(['Far.3333', 'Near.2222']);
    });

    it('carries the arena instead of sizes/inchToPixel', () => {
        const out = computePositioning(report());
        expect(out.figure!.map).toEqual({ arena: ARENA });
        expect((out.figure!.map as any).inchToPixel).toBeUndefined();
        expect((out.figure!.map as any).sizes).toBeUndefined();
    });

    it('emits tagPath in world inches', () => {
        const out = computePositioning(report());
        expect(out.figure!.tagPath[0]).toEqual([0, 0]);
    });

    it('computes squad spread as the mean non-commander distance to tag', () => {
        const out = computePositioning(report());
        // (200 + 2000) / 2 = 1100 at every tick
        expect(out.squad!.avgSpread).toBe(1100);
    });

    it('measures commander lead against the squad centroid', () => {
        const out = computePositioning(report());
        // centroid of (200,0) and (2000,0) is (1100,0); tag is at origin
        expect(out.commander!.squadFollowLag).toBe(1100);
        expect(out.commander!.account).toBe('Cmdr.1111');
    });

    it('does not shift a track whose start is mid-poll', () => {
        // The regression this unit exists for. Entity 2's first sample is at
        // t=300 regardless of a start_ms of 2; the old floor(2/300)=0 offset
        // read it as t=0 and compared it against the wrong tag tick. 36 of 42
        // players on the committed fixture had a non-multiple start.
        const r = report();
        r.details.native.blocks.replay.by_entity[2].start_ms = 2;
        expect(computePositioning(r).perPlayer.find((p) => p.account === 'Near.2222')!.avgDistToTag).toBe(200);
    });

    it('degrades to coarse numbers from the native scalars', () => {
        const r = report();
        delete r.details.native.blocks.replay.tracks;
        const out = computePositioning(r);
        expect(out.degree).toBe('coarse');
        expect(out.perPlayer).toEqual([
            { account: 'Far.3333', avgDistToTag: 2000, peakDistToTag: 2000 },
            { account: 'Near.2222', avgDistToTag: 200, peakDistToTag: 200 },
        ]);
        expect(out.figure).toBeUndefined();
    });

    it('returns degree none for a log with no native replay at all', () => {
        const out = computePositioning({ details: {} });
        expect(out.degree).toBe('none');
        expect(out.perPlayer).toEqual([]);
        expect(out.squad).toBeNull();
    });

    it('still flags out-of-position deaths past the threshold', () => {
        const r = report();
        r.details.native.blocks.replay.tracks.by_entity[3].dead_intervals = [[600, 900]];
        r.details.native.blocks.replay.by_entity[3].dead = [[600, 900]];
        const out = computePositioning(r);
        expect(OUT_OF_POSITION).toBe(1200);
        expect(out.outOfPositionDeaths[0]).toMatchObject({ account: 'Far.3333', distAtDown: 2000 });
    });

    it('clusters deaths at their world-inch positions', () => {
        const r = report();
        r.details.native.blocks.replay.tracks.by_entity[3].dead_intervals = [[600, 900]];
        r.details.native.blocks.replay.by_entity[3].dead = [[600, 900]];
        r.details.native.blocks.replay.by_entity[2].dead = [[600, 900]];
        r.details.native.blocks.replay.tracks.by_entity[2].dead_intervals = [[600, 900]];
        const out = computePositioning(r);
        // 200 and 2000 on x fall in different 150-inch cells, so two clusters.
        expect(out.deathClusters.length).toBe(2);
        expect(out.figure!.deaths).toEqual(expect.arrayContaining([[2000, 0], [200, 0]]));
    });

    it('takes downs from the native down intervals', () => {
        const r = report();
        r.details.native.blocks.replay.by_entity[2].down = [[600, 900]];
        const out = computePositioning(r);
        expect(out.figure!.downs).toEqual([[200, 0]]);
    });
});
