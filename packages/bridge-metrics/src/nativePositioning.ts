import { getNativeReport } from './nativeEncounter';

/**
 * Native replay readers.
 *
 * Two things distinguish this surface from the EI one it replaces, and both
 * delete a class of bug rather than merely relocating it:
 *
 * 1. **Samples are self-timestamped** (`[t_ms, x, y]`). EI emitted a bare
 *    `positions[]` whose i-th entry belonged to poll `ceil(start / pollingRate)
 *    + i`, and five separate call sites re-derived that offset with `floor`
 *    instead of `ceil` — wrong for 36 of 42 players on the committed fixture.
 *    There is no offset to derive here.
 * 2. **Coordinates are world inches**, not map pixels. EI's `inchToPixel` is
 *    rounded to three decimals (`0.009` against a true `0.0087193`), so every
 *    `pixels / inchToPixel` in the old path read 3.12% short. Callers migrating
 *    onto this module must DELETE their division, not re-derive the scale.
 *
 * Readers return `null`/empty — never `0` — when a fact is absent, so no
 * missing value is ever mistaken for a measured one.
 */

/** GW2EI's "no samples qualified" sentinel, preserved verbatim by axilog. */
export const NO_DISTANCE = -1;

/**
 * The static geometry that turns world coordinates into a picture. Native
 * emits it un-rounded and un-rescaled: EI's `combatReplayMetaData.sizes` is
 * squeezed to a 750px max dimension and its `inchToPixel` rounded to 3dp, and
 * while both are derivable from this, this is not derivable from them.
 */
export interface ArenaProjection {
    image_width: number;
    image_height: number;
    image_url: string;
    world_min_x: number;
    world_min_y: number;
    world_max_x: number;
    world_max_y: number;
}

/** `[t_ms, x, y]` — milliseconds from log start, then world inches. */
export type PositionSample = [number, number, number];

export interface PositionTrack {
    entityId: number;
    samples: PositionSample[];
    down: Array<[number, number]>;
    dead: Array<[number, number]>;
    dc: Array<[number, number]>;
}

export interface DistanceScalars {
    /** Mean distance to the commander in world inches; `null` when unmeasured, {@link NO_DISTANCE} when measured-but-empty. */
    distToCom: number | null;
    stackDist: number | null;
}

const replayOf = (details: any): any => {
    const block = (getNativeReport(details) as any)?.blocks?.replay;
    return block && typeof block === 'object' ? block : null;
};

const finiteOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

export const getPollMs = (details: any): number | null =>
    finiteOrNull(replayOf(details)?.tracks?.poll_ms);

export const getArena = (details: any): ArenaProjection | null => {
    const arena = replayOf(details)?.tracks?.arena;
    if (!arena || typeof arena !== 'object') return null;
    for (const k of ['image_width', 'image_height', 'world_min_x', 'world_min_y', 'world_max_x', 'world_max_y']) {
        if (finiteOrNull((arena as any)[k]) === null) return null;
    }
    return arena as ArenaProjection;
};

/**
 * Project world coordinates onto the arena image.
 *
 * `canvas` defaults to the image's native size; pass a smaller pair to draw at
 * any scale without re-deriving the world rect. The `1 -` on `fy` is the y
 * flip: world y grows northward, image y grows downward.
 */
export const worldToPixel = (
    arena: ArenaProjection,
    x: number,
    y: number,
    canvas?: [number, number],
): [number, number] => {
    const [w, h] = canvas ?? [arena.image_width, arena.image_height];
    const fx = (x - arena.world_min_x) / (arena.world_max_x - arena.world_min_x);
    const fy = (y - arena.world_min_y) / (arena.world_max_y - arena.world_min_y);
    return [fx * w, (1 - fy) * h];
};

/**
 * The largest dimension of the replay render canvas, in map pixels.
 *
 * This is not a rendering preference — it is the coordinate space every
 * hand-calibrated map constant already lives in. `wvwLandmarks.ts` stores each
 * WvW objective at a fixed pixel position (523×750 for the alpine borderlands,
 * 716×750 for Eternal Battlegrounds), and `wvwTiles.ts` carries per-map
 * `pixelOffset` values tuned by hand against that same canvas. GW2EI squeezed
 * its arena image to a 750px max dimension and those constants were calibrated
 * against the result.
 *
 * Native emits the arena un-squeezed (697×1000 on the reference fixture), so
 * projecting at native size would silently invalidate every one of those
 * constants. Reproducing EI's canvas keeps them exact.
 */
export const REPLAY_CANVAS_MAX = 750;

/**
 * The render canvas for an arena: its image scaled so the larger dimension is
 * {@link REPLAY_CANVAS_MAX}, rounded.
 *
 * Reproduces GW2EI's `combatReplayMetaData.sizes` — 697×1000 becomes 523×750
 * on the reference fixture, matching EI's `[523, 750]` exactly (EI rounds
 * 522.75 up, and so does this). Rounding identically matters: the landmark
 * table was calibrated against EI's rounded value, not the exact ratio.
 */
export const replayCanvas = (arena: ArenaProjection): [number, number] => {
    const max = Math.max(arena.image_width, arena.image_height);
    if (!(max > 0)) return [0, 0];
    const k = REPLAY_CANVAS_MAX / max;
    return [Math.round(arena.image_width * k), Math.round(arena.image_height * k)];
};

/**
 * Exact pixels-per-world-inch, per axis, replacing EI's `inchToPixel`.
 *
 * Two separate corrections over the scalar it replaces:
 *
 * 1. **It is exact.** EI rounded `inchToPixel` to three decimals — `0.009`
 *    against a true `0.008719` — so anything scaled by it was ~3% off.
 * 2. **It is per-axis, because the projection is genuinely anisotropic.** The
 *    reference fixture's world rect is 61440×86016 (ratio 0.714) while its
 *    arena image is 697×1000 (ratio 0.697): x and y scales differ by ~2.4%.
 *    EI collapsed that to one number, so a 600-range ring drawn with it was
 *    both oversized and wrongly circular. A caller wanting one scalar must
 *    choose an axis deliberately rather than be handed a hidden average.
 */
export const pixelsPerInch = (
    arena: ArenaProjection,
    canvas?: [number, number],
): { x: number; y: number } => {
    const [w, h] = canvas ?? replayCanvas(arena);
    const worldW = arena.world_max_x - arena.world_min_x;
    const worldH = arena.world_max_y - arena.world_min_y;
    return {
        x: worldW > 0 ? w / worldW : 0,
        y: worldH > 0 ? h / worldH : 0,
    };
};

const toIntervals = (raw: unknown): Array<[number, number]> => {
    if (!Array.isArray(raw)) return [];
    const out: Array<[number, number]> = [];
    for (const e of raw) {
        if (!Array.isArray(e)) continue;
        const a = finiteOrNull(Number(e[0]));
        const b = finiteOrNull(Number(e[1]));
        if (a === null || b === null) continue;
        out.push([a, b]);
    }
    return out;
};

/**
 * Every entity with a position track, keyed by entity id.
 *
 * WIDER than `blocks.replay.by_entity`: tracks include enemy players (74 vs 42
 * on the fixture). Callers wanting squad-only must filter by role via
 * `nativeRoster`, not by assuming these two maps agree.
 *
 * Empty when the parse ran without `{ replay: true }` — note that
 * `coverage.replay === "present"` does NOT imply positions exist, because the
 * interval half of the block is computed on every parse.
 */
export const getPositionTracks = (details: any): Map<number, PositionTrack> => {
    const out = new Map<number, PositionTrack>();
    const byEntity = replayOf(details)?.tracks?.by_entity;
    if (!byEntity || typeof byEntity !== 'object') return out;
    for (const [key, raw] of Object.entries(byEntity as Record<string, any>)) {
        const entityId = Number(key);
        if (!Number.isFinite(entityId)) continue;
        const samples = Array.isArray(raw?.samples) ? (raw.samples as PositionSample[]) : [];
        out.set(entityId, {
            entityId,
            samples,
            down: toIntervals(raw?.down_intervals),
            dead: toIntervals(raw?.dead_intervals),
            dc: toIntervals(raw?.dc_intervals),
        });
    }
    return out;
};

export const getPositionTrack = (details: any, entityId: number): PositionTrack | null =>
    getPositionTracks(details).get(entityId) ?? null;

const inAnyInterval = (t: number, intervals: Array<[number, number]>): boolean => {
    for (const [start, end] of intervals) if (t >= start && t <= end) return true;
    return false;
};

/**
 * The position at an EXACT instant, or `null`.
 *
 * Deliberately not interpolating: a missing sample means the actor was not
 * polled then, and inventing a midpoint would put a player somewhere they
 * provably were not. Callers wanting a nearest-sample lookup should say so at
 * their own call site, where the tolerance is a visible decision.
 */
export const positionAt = (
    track: PositionTrack,
    tMs: number,
    requireActive = false,
): [number, number] | null => {
    // Samples are ascending in t; binary search rather than scan, because the
    // cohesion loops call this O(players x polls) times.
    let lo = 0;
    let hi = track.samples.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = track.samples[mid][0];
        if (t === tMs) {
            if (requireActive
                && (inAnyInterval(tMs, track.down)
                    || inAnyInterval(tMs, track.dead)
                    || inAnyInterval(tMs, track.dc))) return null;
            return [track.samples[mid][1], track.samples[mid][2]];
        }
        if (t < tMs) lo = mid + 1;
        else hi = mid - 1;
    }
    return null;
};

/**
 * axilog's own `distToCom`/`stackDist`, in world inches.
 *
 * These replace `deriveDistanceScalars`, which reconstructed them in axibridge
 * from EI pixel arrays because axilog's ei-json never emitted them. That
 * reconstruction carried two errors the native values do not: EI's rounded
 * `inchToPixel` (-3.12% systematic) and a first-commander-track approximation
 * standing in for real commander segments.
 */
export const getDistanceScalars = (details: any): Map<number, DistanceScalars> => {
    const out = new Map<number, DistanceScalars>();
    const byEntity = replayOf(details)?.by_entity;
    if (!byEntity || typeof byEntity !== 'object') return out;
    for (const [key, raw] of Object.entries(byEntity as Record<string, any>)) {
        const entityId = Number(key);
        if (!Number.isFinite(entityId)) continue;
        out.set(entityId, {
            distToCom: finiteOrNull(raw?.dist_to_com),
            stackDist: finiteOrNull(raw?.stack_dist),
        });
    }
    return out;
};
