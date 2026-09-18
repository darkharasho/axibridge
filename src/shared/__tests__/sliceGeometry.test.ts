import { describe, it, expect } from 'vitest';
import { WvwMap } from '../wvwLandmarks';
import {
    eiPixelToContinent, centroidPath, frameForPath, continentToOutput,
    SLICE_ASPECT, SLICE_WIDTH, SLICE_HEIGHT, MIN_SLICE_UNITS, MAX_SLICE_UNITS,
} from '../sliceGeometry';

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

    it('clamps a sprawling path down to the maximum width, keeping it centred', () => {
        const f = frameForPath([[9000, 14000], [12000, 14000]])!;
        expect(width(f)).toBeCloseTo(MAX_SLICE_UNITS, 6);
        expect((f.cx1 + f.cx2) / 2).toBeCloseTo(10500, 6);
    });

    it('centres the frame on the path', () => {
        const f = frameForPath([[10000, 14000], [10400, 14200]])!;
        expect((f.cx1 + f.cx2) / 2).toBeCloseTo(10200, 6);
        expect((f.cy1 + f.cy2) / 2).toBeCloseTo(14100, 6);
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
