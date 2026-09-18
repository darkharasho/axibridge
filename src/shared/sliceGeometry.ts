import { WvwMap, findNearestLandmark } from './wvwLandmarks';
import { WVW_TILE_DATA, MAX_TILE_ZOOM, MAX_HIRES_ZOOM, HIRES_TILE_BASE } from './wvwTiles';
import { resolveMapFromDetails, squadPixelTracks, type PixelSample } from './mapUtils';

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

/** Output pixels kept clear between the path's bounding box and the frame
 *  edge. Sized to the beacon's outermost ring (26px) plus a little, so an
 *  endpoint at the extreme of the path still draws whole. */
export const SLICE_MARGIN_PX = 28;

/** Bbox inflation that buys `SLICE_MARGIN_PX` on the binding axis. */
const MARGIN_SCALE = SLICE_HEIGHT / (SLICE_HEIGHT - 2 * SLICE_MARGIN_PX);

/** How far from either edge the beacon is held, as a fraction of the frame,
 *  so it reads as the subject of the picture rather than something that drifted
 *  into a corner. Must stay under 0.5 or the two bounds it implies cross. */
export const BEACON_BAND_INSET = 0.33;

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

    // The path must fit both axes before clamping decides the final width,
    // and it must fit INSIDE the margin: fitting the bbox flush to the frame
    // puts the start beacon and end marker on the frame edge, where half of
    // each is clipped away (verified by eye on a real Green Alpine log, whose
    // end marker landed exactly on y=0). The margin is measured against the
    // beacon's outermost ring, the largest thing drawn at a path endpoint.
    const needed =
        Math.max(maxX - minX, (maxY - minY) * SLICE_ASPECT) * MARGIN_SCALE;
    // The clamps still win: a path so sprawling that MAX_SLICE_UNITS binds
    // gives the margin up rather than zooming out past the legibility limit.
    const width = Math.min(MAX_SLICE_UNITS, Math.max(MIN_SLICE_UNITS, needed));
    const height = width / SLICE_ASPECT;

    // Centred on the path, then shifted the minimum distance that brings the
    // beacon inside the margin. When MAX_SLICE_UNITS binds -- a roaming fight
    // whose route is far longer than any crop this wide can hold -- centring
    // on the path's midpoint puts the beacon off the image entirely: a real
    // Sunnyhill log mapped its start to y = -994 of a 215px slice, so the
    // picture showed a red streak and no ping at all. The beacon is the whole
    // point of the image and the caption names its landmark, so it wins; the
    // end marker and the far end of the trail are what run off the edge.
    // A minimum shift rather than re-centring on the beacon keeps as much of
    // the trail in frame as the crop allows.
    const marginX = (SLICE_MARGIN_PX / SLICE_WIDTH) * width;
    const marginY = (SLICE_MARGIN_PX / SLICE_HEIGHT) * height;
    // The first FINITE point, not `points[0]`: the bbox loop above already
    // skips non-finite samples, so a single NaN in bin 0 would otherwise make
    // both clamp bounds NaN and poison an otherwise perfectly good frame.
    const beacon = points.find(([x, y]) => Number.isFinite(x) && Number.isFinite(y))!;
    const [beaconX, beaconY] = beacon;
    const cx1 = placeAxis(midX - width / 2, beaconX, minX, maxX, width, marginX);
    const cy1 = placeAxis(midY - height / 2, beaconY, minY, maxY, height, marginY);

    return { cx1, cy1, cx2: cx1 + width, cy2: cy1 + height };
}

/**
 * Where one axis of the frame starts, given the path centred at `centred`.
 *
 * Two pulls, in priority order. The beacon is drawn toward the middle of the
 * frame: holding it merely inside `margin` is enough to draw it whole, but on
 * a real roaming report that put the ping in a top corner with the trail
 * running off the edge -- it read as something that had drifted out of shot
 * rather than as the subject. Against that, the whole path stays in frame
 * whenever a crop this wide can hold it; centring the beacon by pushing the
 * end of the trail off the image trades away the thing the trail is for.
 *
 * When the path is longer than the crop the fit bounds cross, there is no
 * framing that holds all of it, and the beacon band wins uncontested.
 */
function placeAxis(
    centred: number, beacon: number,
    lo: number, hi: number,
    span: number, margin: number,
): number {
    // Never closer to an edge than the margin that keeps the beacon whole,
    // however the band is tuned.
    const inset = Math.max(margin, span * BEACON_BAND_INSET);
    const banded = clamp(centred, beacon + inset - span, beacon - inset);

    const fitLo = hi + margin - span;
    const fitHi = lo - margin;
    return fitLo <= fitHi ? clamp(banded, fitLo, fitHi) : banded;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Continent coordinate -> output pixel within the slice. */
export function continentToOutput(frame: ContinentFrame, cx: number, cy: number): [number, number] {
    const w = frame.cx2 - frame.cx1;
    const h = frame.cy2 - frame.cy1;
    return [
        (cx - frame.cx1) / w * SLICE_WIDTH,
        (cy - frame.cy1) / h * SLICE_HEIGHT,
    ];
}

const TILE_SIZE = 256;
const CONTINENT_ID = 2;
const FLOOR_ID = 3;
const GW2_TILE_BASE = 'https://tiles.guildwars2.com';
const MIN_SLICE_ZOOM = 3;

export interface SliceTilePlacement { url: string; x: number; y: number; width: number; height: number; }

export interface SliceDrawList {
    width: number;
    height: number;
    tiles: SliceTilePlacement[];
    /** Output pixels. `path[0]` is the beacon; the last entry is the end marker. */
    path: Array<[number, number]>;
    caption: string | null;
}

/**
 * The lowest zoom whose art is at least as dense as the output.
 *
 * A tile covers `TILE_SIZE * 2^(MAX_TILE_ZOOM - z)` continent units in
 * `TILE_SIZE` pixels, so zoom z supplies `2^(z - MAX_TILE_ZOOM)` px/unit.
 * We need `SLICE_WIDTH / frameWidthUnits`.
 */
export function pickSliceZoom(map: WvwMap, frameWidthUnits: number): number {
    const data = WVW_TILE_DATA[map];
    const cap = Math.min(data?.maxZoom ?? MAX_HIRES_ZOOM, MAX_HIRES_ZOOM);
    if (!(frameWidthUnits > 0)) return cap;
    const needed = SLICE_WIDTH / frameWidthUnits;
    const zoom = MAX_TILE_ZOOM + Math.ceil(Math.log2(needed));
    return Math.min(cap, Math.max(MIN_SLICE_ZOOM, zoom));
}

/** Every tile overlapping the frame, placed in output pixel coordinates. */
export function tilesForFrame(map: WvwMap, frame: ContinentFrame): SliceTilePlacement[] {
    const data = WVW_TILE_DATA[map];
    if (!data) return [];

    const frameW = frame.cx2 - frame.cx1;
    const frameH = frame.cy2 - frame.cy1;
    if (!(frameW > 0) || !(frameH > 0)) return [];

    const zoom = pickSliceZoom(map, frameW);
    const span = TILE_SIZE * Math.pow(2, MAX_TILE_ZOOM - zoom);
    const base = zoom > MAX_TILE_ZOOM ? HIRES_TILE_BASE : GW2_TILE_BASE;

    const txMin = Math.floor(frame.cx1 / span);
    const txMax = Math.floor((frame.cx2 - 1e-6) / span);
    const tyMin = Math.floor(frame.cy1 / span);
    const tyMax = Math.floor((frame.cy2 - 1e-6) / span);

    const scaleX = SLICE_WIDTH / frameW;
    const scaleY = SLICE_HEIGHT / frameH;

    const tiles: SliceTilePlacement[] = [];
    for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
            if (tx < 0 || ty < 0) continue;
            tiles.push({
                url: `${base}/${CONTINENT_ID}/${FLOOR_ID}/${zoom}/${tx}/${ty}.jpg`,
                x: (tx * span - frame.cx1) * scaleX,
                y: (ty * span - frame.cy1) * scaleY,
                width: span * scaleX,
                height: span * scaleY,
            });
        }
    }
    return tiles;
}

/**
 * The complete draw list for a fight, or `null` if no slice is possible.
 *
 * Never throws: a slice is decorative, so every unusable input is a `null`
 * the caller skips over.
 */
export function buildSliceDrawList(details: any, zone: string): SliceDrawList | null {
    try {
        const map = resolveMapFromDetails(details, zone);
        if (!map || !WVW_TILE_DATA[map]) return null;

        const pixelPath = centroidPath(squadPixelTracks(details));
        if (pixelPath.length === 0) return null;

        const continentPath: Array<[number, number]> = [];
        // The pixel samples that survived projection, index-aligned with
        // `continentPath`, so the caption can name the same point the beacon
        // is drawn at rather than a sample that was thrown away.
        const keptPixels: Array<[number, number]> = [];
        for (const [px, py] of pixelPath) {
            const c = eiPixelToContinent(map, px, py);
            // Both components must be finite, not merely `c` non-null: a NaN
            // sample projects to [NaN, NaN], which is truthy and would produce
            // a NaN frame -> no tiles -> no image at all.
            if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
                continentPath.push(c);
                keptPixels.push([px, py]);
            }
        }
        if (continentPath.length === 0) return null;

        const frame = frameForPath(continentPath);
        if (!frame) return null;

        const tiles = tilesForFrame(map, frame);
        if (tiles.length === 0) return null;

        // The caption names where the fight STARTED, matching the beacon --
        // which is the first point that SURVIVED projection, not the first
        // sample. Reading `pixelPath[0]` here would hand a NaN pixel to
        // `findNearestLandmark`, whose `d < minDist` comparisons are then all
        // false, so it returns its first landmark: a caption naming an
        // arbitrary place while the beacon is drawn somewhere else entirely.
        const [startPx, startPy] = keptPixels[0];
        const landmark = findNearestLandmark(map, startPx, startPy);

        return {
            width: SLICE_WIDTH,
            height: SLICE_HEIGHT,
            tiles,
            path: continentPath.map(([cx, cy]) => continentToOutput(frame, cx, cy)),
            caption: landmark?.name ?? null,
        };
    } catch {
        return null;
    }
}
