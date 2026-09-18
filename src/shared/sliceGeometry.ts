import { WvwMap } from './wvwLandmarks';
import { WVW_TILE_DATA } from './wvwTiles';
import type { PixelSample } from './mapUtils';

export const SLICE_WIDTH = 1120;
export const SLICE_HEIGHT = 215;
export const SLICE_ASPECT = SLICE_WIDTH / SLICE_HEIGHT;

/** Crop width bounds, in continent units. Below the minimum a stationary
 *  fight zooms into featureless ground; above the maximum the hi-res detail
 *  that makes the image worth showing is lost. */
export const MIN_SLICE_UNITS = 400;
export const MAX_SLICE_UNITS = 1000;

/** Time bins the squad path is reduced to. Tracks are sampled independently,
 *  so binning is what makes "the squad's position at time t" well defined. */
export const CENTROID_BINS = 64;

export interface ContinentFrame { cx1: number; cy1: number; cx2: number; cy2: number; }

/**
 * EI canvas pixel -> continent coordinate, using the map's hand-calibrated
 * `continentRect` / `pixelSize` / `pixelOffset`.
 *
 * Verified: EBG pixel (287, 314) -> (10249.44, 14002.22), which lands on
 * Anzalias Pass tower in the rendered tiles.
 */
export function eiPixelToContinent(map: WvwMap, px: number, py: number): [number, number] | null {
    const data = WVW_TILE_DATA[map];
    if (!data) return null;
    const [[cx1, cy1], [cx2, cy2]] = data.continentRect;
    const [pw, ph] = data.pixelSize;
    const [ox, oy] = data.pixelOffset;
    if (!(pw > 0) || !(ph > 0)) return null;
    return [
        (px - ox) / pw * (cx2 - cx1) + cx1,
        (py - oy) / ph * (cy2 - cy1) + cy1,
    ];
}

/** The squad's centre of mass over time, in the tracks' own space. */
export function centroidPath(tracks: PixelSample[][], bins: number = CENTROID_BINS): Array<[number, number]> {
    const nonEmpty = tracks.filter(t => t.length > 0);
    if (nonEmpty.length === 0) return [];

    let tMin = Infinity;
    let tMax = -Infinity;
    for (const track of nonEmpty) {
        for (const [t] of track) {
            if (t < tMin) tMin = t;
            if (t > tMax) tMax = t;
        }
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return [];

    const span = tMax - tMin;
    const binCount = Math.max(1, Math.floor(bins));
    const sums = Array.from({ length: binCount }, () => ({ x: 0, y: 0, n: 0 }));

    for (const track of nonEmpty) {
        for (const [t, x, y] of track) {
            // A zero-length fight collapses to bin 0.
            const idx = span > 0
                ? Math.min(binCount - 1, Math.floor((t - tMin) / span * binCount))
                : 0;
            const bin = sums[idx];
            bin.x += x;
            bin.y += y;
            bin.n += 1;
        }
    }

    const path: Array<[number, number]> = [];
    for (const bin of sums) {
        if (bin.n === 0) continue;       // an unsampled bin is a hole, not an origin
        path.push([bin.x / bin.n, bin.y / bin.n]);
    }
    return path;
}

/** The clamped, aspect-forced crop around a path of continent points. */
export function frameForPath(points: Array<[number, number]>): ContinentFrame | null {
    if (points.length === 0) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    // The path must fit both axes before clamping decides the final width.
    const needed = Math.max(maxX - minX, (maxY - minY) * SLICE_ASPECT);
    const width = Math.min(MAX_SLICE_UNITS, Math.max(MIN_SLICE_UNITS, needed));
    const height = width / SLICE_ASPECT;

    return {
        cx1: midX - width / 2,
        cy1: midY - height / 2,
        cx2: midX + width / 2,
        cy2: midY + height / 2,
    };
}

/** Continent coordinate -> output pixel within the slice. */
export function continentToOutput(frame: ContinentFrame, cx: number, cy: number): [number, number] {
    const w = frame.cx2 - frame.cx1;
    const h = frame.cy2 - frame.cy1;
    return [
        (cx - frame.cx1) / w * SLICE_WIDTH,
        (cy - frame.cy1) / h * SLICE_HEIGHT,
    ];
}
