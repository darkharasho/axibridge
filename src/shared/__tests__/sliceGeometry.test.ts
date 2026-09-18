import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A pass-through spy on the one expensive step past map resolution. The
// unknown-map guard is a SHORT-CIRCUIT: with it deleted, buildSliceDrawList
// still returns null (eiPixelToContinent returns null with no tile data), so
// an output-only assertion cannot be load-bearing. What the guard actually
// buys is not walking a real log's position tracks for a map we can never
// draw, and that is what this spy observes.
const mapUtilsHooks = vi.hoisted(() => ({
    squadPixelTracksSpy: vi.fn(),
    /** When set, stands in for the real tracks so a synthetic (e.g. NaN-bearing)
     *  track can be pushed through the real projection + framing code. */
    trackOverride: null as null | Array<Array<[number, number, number]>>,
}));
const { squadPixelTracksSpy } = mapUtilsHooks;
vi.mock('../mapUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../mapUtils')>();
    return {
        ...actual,
        squadPixelTracks: (details: any) => {
            mapUtilsHooks.squadPixelTracksSpy(details);
            return mapUtilsHooks.trackOverride ?? actual.squadPixelTracks(details);
        },
    };
});
import { WvwMap } from '../wvwLandmarks';
import {
    eiPixelToContinent, centroidPath, frameForPath, continentToOutput,
    SLICE_ASPECT, SLICE_WIDTH, SLICE_HEIGHT, MIN_SLICE_UNITS, MAX_SLICE_UNITS,
    pickSliceZoom, tilesForFrame, buildSliceDrawList, SLICE_MARGIN_PX,
} from '../sliceGeometry';
import { MAX_TILE_ZOOM, MAX_HIRES_ZOOM } from '../wvwTiles';

describe('eiPixelToContinent', () => {
    // Anzalias Pass, verified during design: EI pixel (287, 314) on EBG lands
    // exactly on the tower in the rendered hi-res tiles.
    it('projects Anzalias Pass to its known continent position', () => {
        const p = eiPixelToContinent(WvwMap.EternalBattlegrounds, 287, 314);
        expect(p).not.toBeNull();
        expect(p![0]).toBeCloseTo(10249.44, 1);
        expect(p![1]).toBeCloseTo(14002.22, 1);
    });

    it('returns null for a map with no tile data', () => {
        expect(eiPixelToContinent('NotAMap' as WvwMap, 1, 1)).toBeNull();
    });
});

describe('centroidPath', () => {
    it('averages concurrent squad positions into one point per bin', () => {
        const tracks: Array<Array<[number, number, number]>> = [
            [[0, 0, 0], [1000, 100, 100]],
            [[0, 200, 200], [1000, 300, 300]],
        ];
        const path = centroidPath(tracks, 2);
        expect(path).toHaveLength(2);
        expect(path[0]).toEqual([100, 100]);   // (0+200)/2
        expect(path[1]).toEqual([200, 200]);   // (100+300)/2
    });

    it('drops empty bins rather than emitting holes', () => {
        const tracks: Array<Array<[number, number, number]>> = [[[0, 10, 10], [1000, 20, 20]]];
        const path = centroidPath(tracks, 8);
        expect(path.length).toBeGreaterThan(0);
        expect(path.length).toBeLessThanOrEqual(8);
        expect(path.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
    });

    it('returns [] for no tracks', () => {
        expect(centroidPath([], 8)).toEqual([]);
    });

    it('returns a single point for a single sample', () => {
        expect(centroidPath([[[0, 5, 7]]], 8)).toEqual([[5, 7]]);
    });
});

describe('frameForPath', () => {
    const width = (f: { cx1: number; cx2: number }) => f.cx2 - f.cx1;
    const height = (f: { cy1: number; cy2: number }) => f.cy2 - f.cy1;

    it('always produces the output aspect ratio', () => {
        const f = frameForPath([[10000, 14000], [10300, 14100]])!;
        expect(width(f) / height(f)).toBeCloseTo(SLICE_ASPECT, 6);
    });

    it('clamps a tiny path up to the minimum width', () => {
        const f = frameForPath([[10000, 14000], [10001, 14000]])!;
        expect(width(f)).toBeCloseTo(MIN_SLICE_UNITS, 6);
    });

    it('clamps a sprawling path down to the maximum width', () => {
        const f = frameForPath([[9000, 14000], [12000, 14000]])!;
        expect(width(f)).toBeCloseTo(MAX_SLICE_UNITS, 6);
    });

    it('centres the frame on a path that fits', () => {
        const f = frameForPath([[10000, 14000], [10400, 14050]])!;
        expect((f.cx1 + f.cx2) / 2).toBeCloseTo(10200, 6);
        expect((f.cy1 + f.cy2) / 2).toBeCloseTo(14025, 6);
    });

    it('takes the beacon from the first FINITE point, not points[0]', () => {
        // One NaN sample landing in bin 0 gave `[NaN, NaN]` as the beacon,
        // which made both clamp bounds NaN -> a NaN frame -> tilesForFrame
        // returns [] -> no image at all, despite every other bin being good.
        const path: Array<[number, number]> = [
            [NaN, NaN], [10000, 14000], [10050, 14500], [10100, 15000],
        ];
        const f = frameForPath(path)!;
        expect(f).not.toBeNull();
        for (const v of [f.cx1, f.cy1, f.cx2, f.cy2]) expect(Number.isFinite(v)).toBe(true);

        // The beacon constraint is applied to the first GOOD point.
        const [bx, by] = continentToOutput(f, 10000, 14000);
        expect(bx).toBeGreaterThanOrEqual(SLICE_MARGIN_PX - 1e-6);
        expect(bx).toBeLessThanOrEqual(SLICE_WIDTH - SLICE_MARGIN_PX + 1e-6);
        expect(by).toBeGreaterThanOrEqual(SLICE_MARGIN_PX - 1e-6);
        expect(by).toBeLessThanOrEqual(SLICE_HEIGHT - SLICE_MARGIN_PX + 1e-6);

        // ...and the frame is usable: tiles come back for it.
        expect(tilesForFrame(WvwMap.EternalBattlegrounds, f).length).toBeGreaterThan(0);
    });

    it('keeps the beacon in frame when the path is far longer than the crop', () => {
        // A roaming fight: the route spans ~1000 continent units vertically,
        // which no crop this wide can hold. Centring on the path midpoint put
        // the beacon at y = -994 on a real Sunnyhill log -- a picture with no
        // ping in it. The beacon is the point of the image, so it stays in.
        const path: Array<[number, number]> = [
            [10000, 14000], [10050, 14500], [10100, 15000],
        ];
        const f = frameForPath(path)!;
        expect(width(f)).toBeCloseTo(MAX_SLICE_UNITS, 6);
        const [bx, by] = continentToOutput(f, path[0][0], path[0][1]);
        expect(bx).toBeGreaterThanOrEqual(SLICE_MARGIN_PX - 1e-6);
        expect(bx).toBeLessThanOrEqual(SLICE_WIDTH - SLICE_MARGIN_PX + 1e-6);
        expect(by).toBeGreaterThanOrEqual(SLICE_MARGIN_PX - 1e-6);
        expect(by).toBeLessThanOrEqual(SLICE_HEIGHT - SLICE_MARGIN_PX + 1e-6);
    });

    it('keeps the whole path clear of the frame edge', () => {
        // Fitting the bbox flush to the frame puts the beacon and the end
        // marker half off the image — seen on a real Green Alpine log, whose
        // end marker mapped to exactly y=0. Neither clamp binds at this size,
        // so the margin is the only thing holding the path off the edge.
        const path: Array<[number, number]> = [
            [10000, 14000], [10150, 14050], [10300, 14100],
        ];
        const f = frameForPath(path)!;
        // The binding axis lands exactly on the margin by construction, so
        // allow a float epsilon; flush fitting would put these at 0 and 215.
        const eps = 1e-6;
        for (const [cx, cy] of path) {
            const [x, y] = continentToOutput(f, cx, cy);
            expect(x).toBeGreaterThanOrEqual(SLICE_MARGIN_PX - eps);
            expect(x).toBeLessThanOrEqual(SLICE_WIDTH - SLICE_MARGIN_PX + eps);
            expect(y).toBeGreaterThanOrEqual(SLICE_MARGIN_PX - eps);
            expect(y).toBeLessThanOrEqual(SLICE_HEIGHT - SLICE_MARGIN_PX + eps);
        }
    });

    it('returns null for an empty path', () => {
        expect(frameForPath([])).toBeNull();
    });
});

describe('continentToOutput', () => {
    it('maps the frame corners to the output corners', () => {
        const frame = { cx1: 10000, cy1: 14000, cx2: 11000, cy2: 14000 + 1000 / SLICE_ASPECT };
        expect(continentToOutput(frame, 10000, 14000)).toEqual([0, 0]);
        const [x, y] = continentToOutput(frame, frame.cx2, frame.cy2);
        expect(x).toBeCloseTo(SLICE_WIDTH, 6);
        expect(y).toBeCloseTo(SLICE_HEIGHT, 6);
    });
});

describe('pickSliceZoom', () => {
    it('picks the hi-res zoom for a typical clamped crop', () => {
        // 1120px / 800 units = 1.4 px/unit; z8 gives 2 px/unit, z7 gives 1.
        expect(pickSliceZoom(WvwMap.EternalBattlegrounds, 800)).toBe(8);
    });

    it('never exceeds a map that caps at MAX_TILE_ZOOM', () => {
        // Obsidian Sanctum sets maxZoom: MAX_TILE_ZOOM.
        expect(pickSliceZoom(WvwMap.ObsidianSanctum, 400)).toBeLessThanOrEqual(MAX_TILE_ZOOM);
    });

    it('never exceeds MAX_HIRES_ZOOM even for a tiny crop', () => {
        expect(pickSliceZoom(WvwMap.EternalBattlegrounds, 1)).toBeLessThanOrEqual(MAX_HIRES_ZOOM);
    });
});

describe('tilesForFrame', () => {
    const frame = { cx1: 10000, cy1: 14000, cx2: 10800, cy2: 14000 + 800 / SLICE_ASPECT };

    it('covers the frame with a bounded number of tiles', () => {
        const tiles = tilesForFrame(WvwMap.EternalBattlegrounds, frame);
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.length).toBeLessThan(60);
    });

    it('spans the full output width and height', () => {
        const tiles = tilesForFrame(WvwMap.EternalBattlegrounds, frame);
        expect(Math.min(...tiles.map(t => t.x))).toBeLessThanOrEqual(0);
        expect(Math.min(...tiles.map(t => t.y))).toBeLessThanOrEqual(0);
        expect(Math.max(...tiles.map(t => t.x + t.width))).toBeGreaterThanOrEqual(SLICE_WIDTH);
        expect(Math.max(...tiles.map(t => t.y + t.height))).toBeGreaterThanOrEqual(SLICE_HEIGHT);
    });

    it('builds hi-res pack URLs at zooms above MAX_TILE_ZOOM', () => {
        const tiles = tilesForFrame(WvwMap.EternalBattlegrounds, frame);
        expect(tiles[0].url).toMatch(/^https:\/\/darkharasho\.github\.io\/axibridge-map-tiles\/2\/3\/8\/\d+\/\d+\.jpg$/);
    });

    it('returns [] for a map with no tile data', () => {
        expect(tilesForFrame('NotAMap' as WvwMap, frame)).toEqual([]);
    });
});

describe('buildSliceDrawList', () => {
    it('returns null when there are no positions', () => {
        expect(buildSliceDrawList({}, 'Eternal Battlegrounds')).toBeNull();
    });

    // `{}` short-circuits on the no-positions check first, so it proves nothing
    // about the unknown-map guard. This needs a details object that really does
    // carry position tracks. Only `test-fixtures/native/*.json` drives the
    // pipeline at all: squadPixelTracks reads `details.native` exclusively, so
    // an EI-engine log yields no tracks no matter how much replay data it has.
    // readFileSync rather than a static import: a static import of a fixture
    // this size OOMs `tsc --noEmit` and breaks `npm run validate`.
    const nativeFixture = () => JSON.parse(readFileSync(
        join(__dirname, '../../../test-fixtures/native/20260117-180826.json'),
        'utf8',
    ));

    it('builds a draw list from a real native fixture (positive control)', () => {
        squadPixelTracksSpy.mockClear();
        const drawList = buildSliceDrawList(nativeFixture(), 'Green Alpine Borderlands');
        expect(drawList).not.toBeNull();
        expect(drawList!.tiles.length).toBeGreaterThan(0);
        expect(drawList!.path.length).toBeGreaterThan(1);
        // The same fixture DOES reach the track walk when the map resolves —
        // so the unknown-map case below is null for the map, not for want of
        // positions.
        expect(squadPixelTracksSpy).toHaveBeenCalledTimes(1);
    });

    it('drops a NaN sample from the path instead of drawing it', () => {
        // A non-finite pixel projects to [NaN, NaN], which is TRUTHY and so
        // passed the old `if (c)` check, putting a NaN vertex in the draw list.
        mapUtilsHooks.trackOverride = [[
            [0, NaN, NaN],
            [1000, 287, 314],
            [2000, 300, 330],
            [3000, 320, 350],
        ]];
        try {
            const drawList = buildSliceDrawList({}, 'Eternal Battlegrounds')!;
            expect(drawList).not.toBeNull();
            expect(drawList.path.length).toBeGreaterThan(1);
            for (const [x, y] of drawList.path) {
                expect(Number.isFinite(x)).toBe(true);
                expect(Number.isFinite(y)).toBe(true);
            }
            expect(drawList.tiles.length).toBeGreaterThan(0);
        } finally {
            mapUtilsHooks.trackOverride = null;
        }
    });

    it('captions the first SURVIVING point, not a dropped NaN sample', () => {
        // The caption must name the place the beacon is drawn at. Reading the
        // raw first sample hands NaN to findNearestLandmark, whose `d < minDist`
        // comparisons are then all false, so it returns its FIRST landmark --
        // an embed captioned with an arbitrary place while the beacon sits
        // somewhere else. Anzalias Pass is the verified projection anchor.
        const good: Array<[number, number, number]> = [
            [1000, 287, 314], [2000, 300, 330], [3000, 320, 350],
        ];
        try {
            mapUtilsHooks.trackOverride = [good];
            const clean = buildSliceDrawList({}, 'Eternal Battlegrounds')!;

            mapUtilsHooks.trackOverride = [[[0, NaN, NaN], ...good]];
            const withNaN = buildSliceDrawList({}, 'Eternal Battlegrounds')!;

            expect(clean.caption).not.toBeNull();
            expect(withNaN.caption).toBe(clean.caption);
        } finally {
            mapUtilsHooks.trackOverride = null;
        }
    });

    it('returns null for an unknown map even when positions exist', () => {
        const details = nativeFixture();
        // The map id is AUTHORITATIVE over the zone string
        // (resolveMapFromDetails tries native.encounter.map_id first), so both
        // have to be non-WvW or this still resolves to Green Alpine.
        details.native.encounter.map_id = 1062;      // Bastion of the Penitent
        details.native.encounter.map = 'Vale Guardian';
        details.fightName = 'Vale Guardian';
        details.zone = 'Vale Guardian';

        squadPixelTracksSpy.mockClear();
        expect(buildSliceDrawList(details, 'Vale Guardian')).toBeNull();
        // Short-circuited at map resolution: the track walk never ran.
        expect(squadPixelTracksSpy).not.toHaveBeenCalled();
    });
});
