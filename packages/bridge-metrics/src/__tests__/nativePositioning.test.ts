import { describe, it, expect } from 'vitest';
import {
    getPollMs, getArena, worldToPixel, getPositionTracks, getPositionTrack,
    positionAt, getDistanceScalars, NO_DISTANCE,
    replayCanvas, pixelsPerInch, REPLAY_CANVAS_MAX,
} from '../nativePositioning';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'https://example/x.png',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

const log = (over: any = {}) => ({
    native: {
        axilog: { schema: '1.0' },
        coverage: { replay: 'present' },
        blocks: {
            replay: {
                by_entity: {
                    3: { start_ms: 2, end_ms: 49266, active_ms: 49264, down: [], dead: [], dc: [], dist_to_com: 0, stack_dist: 179.5 },
                    7: { start_ms: 0, end_ms: 49266, active_ms: 49266, down: [[1200, 1800]], dead: [], dc: [], dist_to_com: 307.35, stack_dist: 189.23 },
                },
                tracks: {
                    poll_ms: 300,
                    arena: ARENA,
                    by_entity: {
                        3: { samples: [[300, -11146.1, -23783.8], [600, -11100, -23700]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                        7: { samples: [[300, -11000, -23000], [900, -10900, -22900]], down_intervals: [[1200, 1800]], dead_intervals: [], dc_intervals: [] },
                    },
                },
            },
        },
        ...over,
    },
});

describe('nativePositioning — arena projection', () => {
    it('reads the arena', () => {
        expect(getArena(log())).toEqual(ARENA);
    });

    it('returns null when the log has no native report', () => {
        expect(getArena({})).toBeNull();
        expect(getPollMs({})).toBeNull();
    });

    it('projects the world rect corners onto the image corners', () => {
        const a = getArena(log())!;
        // min_x/max_y is the TOP-LEFT: world y grows north, image y grows down.
        expect(worldToPixel(a, -30720, 43008)).toEqual([0, 0]);
        expect(worldToPixel(a, 30720, -43008)).toEqual([697, 1000]);
    });

    it('projects the centre to the image centre', () => {
        const a = getArena(log())!;
        const [px, py] = worldToPixel(a, 0, 0);
        expect(px).toBeCloseTo(348.5, 6);
        expect(py).toBeCloseTo(500, 6);
    });

    it('scales to an arbitrary canvas without re-deriving the rect', () => {
        const a = getArena(log())!;
        const [px, py] = worldToPixel(a, 0, 0, [523, 750]);
        expect(px).toBeCloseTo(261.5, 6);
        expect(py).toBeCloseTo(375, 6);
    });
});

describe('nativePositioning — render canvas', () => {
    it('reproduces EI\'s sizes for the reference arena', () => {
        // EI reported [523, 750] for this exact arena; 697 × 0.75 = 522.75.
        // Matching EI's rounding is the point — the landmark table was
        // calibrated against 523, not against 522.75.
        expect(replayCanvas(ARENA)).toEqual([523, 750]);
    });

    it('caps the LARGER dimension, whichever axis it is', () => {
        expect(replayCanvas({ ...ARENA, image_width: 1000, image_height: 697 }))
            .toEqual([REPLAY_CANVAS_MAX, 523]);
    });

    it('leaves an already-750 canvas alone', () => {
        expect(replayCanvas({ ...ARENA, image_width: 750, image_height: 750 }))
            .toEqual([750, 750]);
    });

    it('degrades to [0, 0] rather than dividing by zero', () => {
        expect(replayCanvas({ ...ARENA, image_width: 0, image_height: 0 })).toEqual([0, 0]);
    });

    it('gives an exact per-axis inch scale, not EI\'s rounded scalar', () => {
        const ppi = pixelsPerInch(ARENA);
        // EI rounded both of these to a single 0.009.
        expect(ppi.x).toBeCloseTo(523 / 61440, 12);
        expect(ppi.y).toBeCloseTo(750 / 86016, 12);
    });

    it('keeps the two axes distinct — the projection is anisotropic', () => {
        const ppi = pixelsPerInch(ARENA);
        // ~2.4% apart. A caller averaging these would reintroduce EI's error.
        expect(ppi.x).not.toBeCloseTo(ppi.y, 5);
        expect(ppi.y / ppi.x).toBeCloseTo(1.0248, 3);
    });

    it('honours an explicit canvas', () => {
        const ppi = pixelsPerInch(ARENA, [697, 1000]);
        expect(ppi.x).toBeCloseTo(697 / 61440, 12);
    });

    it('returns 0 for a degenerate world rect instead of Infinity', () => {
        const ppi = pixelsPerInch({ ...ARENA, world_min_x: 0, world_max_x: 0 });
        expect(ppi.x).toBe(0);
        expect(Number.isFinite(ppi.y)).toBe(true);
    });
});

describe('nativePositioning — tracks', () => {
    it('reads poll_ms', () => {
        expect(getPollMs(log())).toBe(300);
    });

    it('keys tracks by entity id with self-timestamped samples', () => {
        const tracks = getPositionTracks(log());
        expect([...tracks.keys()].sort()).toEqual([3, 7]);
        expect(tracks.get(3)!.samples[0]).toEqual([300, -11146.1, -23783.8]);
    });

    it('returns an empty map when tracks are ungated off', () => {
        const bare = { native: { axilog: {}, blocks: { replay: { by_entity: {} } } } };
        expect(getPositionTracks(bare).size).toBe(0);
        expect(getArena(bare)).toBeNull();
    });

    it('finds a sample by timestamp, not by index arithmetic', () => {
        const t = getPositionTrack(log(), 7)!;
        expect(positionAt(t, 300)).toEqual([-11000, -23000]);
        expect(positionAt(t, 900)).toEqual([-10900, -22900]);
    });

    it('returns null for an instant the track does not cover', () => {
        // Entity 7 has NO sample at 600 — it is a gap, not an interpolation
        // point. Returning the neighbour would invent a position.
        const t = getPositionTrack(log(), 7)!;
        expect(positionAt(t, 600)).toBeNull();
        expect(positionAt(t, 0)).toBeNull();
        expect(positionAt(t, 99999)).toBeNull();
    });

    it('honours requireActive against down/dead/dc intervals', () => {
        const t = getPositionTrack(log(), 7)!;
        // 1200..1800 is a down window; no sample there anyway, so use a
        // track that has one.
        const withDown = getPositionTrack(log(), 3)!;
        expect(positionAt(withDown, 300, true)).toEqual([-11146.1, -23783.8]);
        // And the down window itself is refused even when a sample exists.
        t.samples.push([1500, -1, -2]);
        expect(positionAt(t, 1500)).toEqual([-1, -2]);
        expect(positionAt(t, 1500, true)).toBeNull();
    });
});

describe('nativePositioning — distance scalars', () => {
    it('reads dist_to_com and stack_dist in world inches', () => {
        const s = getDistanceScalars(log());
        expect(s.get(3)).toEqual({ distToCom: 0, stackDist: 179.5 });
        expect(s.get(7)).toEqual({ distToCom: 307.35, stackDist: 189.23 });
    });

    it('keeps absent and -1 distinct', () => {
        // absent  => the position pass never ran; we know nothing.
        // -1      => the pass ran and nothing qualified (GW2EI's sentinel).
        // Collapsing them makes "not measured" look like "measured as none".
        const l = log();
        (l.native as any).blocks.replay.by_entity[3] = { start_ms: 0, end_ms: 1, active_ms: 1, down: [], dead: [], dc: [] };
        (l.native as any).blocks.replay.by_entity[7].dist_to_com = NO_DISTANCE;
        const s = getDistanceScalars(l);
        expect(s.get(3)).toEqual({ distToCom: null, stackDist: null });
        expect(s.get(7)!.distToCom).toBe(NO_DISTANCE);
    });

    it('is empty for a log with no native report', () => {
        expect(getDistanceScalars({}).size).toBe(0);
    });
});
