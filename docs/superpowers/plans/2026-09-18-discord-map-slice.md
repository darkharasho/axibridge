# Discord Map Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach a thin horizontal slice of the WvW map, marked with a beacon and trail showing where the squad fought, to the bottom of the Discord fight-report embed.

**Architecture:** The Electron main process owns all logic — it projects the squad's replay path into continent coordinates, frames a clamped 5.2:1 crop, resolves the tile set, and fetches those tiles through a disk cache. It then hands the renderer a complete draw list whose tile URLs are `data:` URLs, and the renderer paints it to an offscreen canvas and returns PNG bytes over IPC. Main attaches the PNG to the embed as `attachment://slice.png` via multipart. Every failure path skips the image and sends today's embed unchanged.

**Tech Stack:** TypeScript, Electron (main + renderer + preload IPC), DOM Canvas 2D, vitest, `form-data`, `axios`. Python/aiohttp for the one axitools change.

**Spec:** `docs/superpowers/specs/2026-09-18-discord-map-slice-design.md`

## Global Constraints

- Output image is exactly **1120x215** pixels. `SLICE_ASPECT` is `1120 / 215`.
- Crop width is clamped to **[400, 1000] continent units**, inclusive.
- Tile zoom is clamped to **[3, min(map maxZoom, MAX_HIRES_ZOOM)]**. Never request a zoom above a map's `maxZoom`.
- **Main fetches every tile.** The renderer must only ever receive `data:` URLs. `tiles.guildwars2.com` sends no `Access-Control-Allow-Origin`, so an `http(s)` tile URL reaching the renderer's canvas taints it and `toBlob()` throws `SecurityError`.
- The slice is **decorative**. Any failure — no positions, unknown map, renderer timeout, all tiles failed, relay rejection — results in the embed being sent with no image. A slice failure must never fail or block a report.
- Bridged embed images use the **`attachment://` scheme only**. The axitools validator must reject every other scheme.
- Setting key is `includeMapSlice`, a member of `IEmbedStatSettings`, **default `true`**.
- Renderer→main PNG transfer uses `Uint8Array`. Main converts with `Buffer.from(...)`.
- When running vitest, always limit parallelism: `npx vitest run <file> --maxWorkers=2`.
- Never log tile URLs at info level in a loop; a slice can involve dozens of tiles.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/sliceGeometry.ts` (create) | Pure geometry: centroid path, EI-pixel→continent projection, clamped framing, tile selection, draw-list assembly. No canvas, no network, no Electron imports. |
| `src/shared/__tests__/sliceGeometry.test.ts` (create) | Unit tests for all of the above. |
| `src/shared/mapUtils.ts` (modify) | Extract the shared `squadPixelTracks` helper that `computeFightAvgPosition` already needs. |
| `src/main/mapSlice/tileCache.ts` (create) | Fetch tile URLs through a userData disk cache; return data URLs. |
| `src/main/mapSlice/__tests__/tileCache.test.ts` (create) | Cache-hit, partial-failure, total-failure tests with a stub fetcher. |
| `src/main/mapSlice/index.ts` (create) | Orchestration: details → PNG buffer or `null`. Owns the renderer round trip and its timeout. |
| `src/main/mapSlice/__tests__/buildMapSlice.test.ts` (create) | Skip-path tests. |
| `src/renderer/mapSlice/paintSlice.ts` (create) | Draw list → PNG bytes on an offscreen canvas. |
| `src/renderer/mapSlice/useMapSlicePainter.ts` (create) | Hook registering the IPC listener that calls `paintSlice`. |
| `src/preload/index.ts` (modify) | Expose `onMapSlicePaint` / `sendMapSliceResult`. |
| `src/renderer/global.d.ts` (modify) | `includeMapSlice` on `IEmbedStatSettings` + `DEFAULT_EMBED_STATS`; the two new `electronAPI` members. |
| `src/main/discord.ts` (modify) | `includeMapSlice` on its own `IEmbedStatSettings` + defaults; `postEmbedsWithImage`; accept `mapSlicePng` in `sendLog`. |
| `src/main/handlers/settingsHandlers.ts` (modify) | `includeMapSlice: true` in `DEFAULT_EMBED_STATS`. |
| `src/renderer/SettingsView.tsx` (modify) | The toggle. |
| `src/main/index.ts` (modify) | Build the slice before each of the two `sendLog` calls. |
| `axitools/api/bridge_payload.py` (modify, other repo) | Allow `image` with an `attachment://` URL only. |

---

### Task 1: Shared squad pixel tracks

`src/shared/mapUtils.ts` already extracts per-entity replay positions in EI canvas pixel space inside `computeFightAvgPosition`, but keeps it in a local closure. The slice needs the same tracks. Extract it.

EI canvas pixel space is the space `wvwLandmarks.ts` and `wvwTiles.ts`'s `pixelOffset` are calibrated in — do not project to any other space here.

**Files:**
- Modify: `src/shared/mapUtils.ts` (`computeFightAvgPosition`, around lines 96-133)
- Test: `src/shared/__tests__/mapUtils.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
```ts
/** A squad member's replay path: [t_ms, pixelX, pixelY] per sample, EI canvas pixel space. */
export type PixelSample = [number, number, number];
export function squadPixelTracks(details: any): PixelSample[][];
```
  Returns one entry per squad member that has samples, in `squadEntities` order. Returns `[]` when there is no arena or no track data.

- [ ] **Step 1: Write the failing test**

Create/append `src/shared/__tests__/mapUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { squadPixelTracks } from '../mapUtils';

// A minimal fake matching what getArena/getPositionTracks/squadEntities read.
const fakeDetails = () => ({
    native: {
        blocks: {
            replay: {
                arena: {
                    image_width: 716, image_height: 750, image_url: '',
                    world_min_x: 0, world_min_y: 0, world_max_x: 71600, world_max_y: 75000,
                },
                tracks: [
                    { entity_id: 1, positions: [[0, 0, 75000], [1000, 35800, 37500]] },
                    { entity_id: 2, positions: [[0, 71600, 0]] },
                ],
            },
            players: [
                { id: 1, account: 'a.1111', is_squad: true },
                { id: 2, account: 'b.2222', is_squad: true },
            ],
        },
    },
});

describe('squadPixelTracks', () => {
    it('returns one pixel path per squad member with samples', () => {
        const tracks = squadPixelTracks(fakeDetails());
        expect(tracks).toHaveLength(2);
        // world (0, 75000) is top-left: x=0, y=0 (worldToPixel flips y)
        expect(tracks[0][0][1]).toBeCloseTo(0, 5);
        expect(tracks[0][0][2]).toBeCloseTo(0, 5);
        // world (35800, 37500) is the centre
        expect(tracks[0][1][1]).toBeCloseTo(358, 5);
        expect(tracks[0][1][2]).toBeCloseTo(375, 5);
        // timestamps survive
        expect(tracks[0][1][0]).toBe(1000);
    });

    it('returns [] when there is no arena', () => {
        expect(squadPixelTracks({})).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/__tests__/mapUtils.test.ts --maxWorkers=2`
Expected: FAIL — `squadPixelTracks` is not exported from `../mapUtils`.

If instead it fails because the fake's shape does not match what `getArena`/`getPositionTracks`/`squadEntities` actually read, fix the FAKE, not the assertions: read `packages/bridge-metrics/src/nativePositioning.ts` (`getArena`, `getPositionTracks`) and `nativeRoster.ts` (`squadEntities`) and mirror their real field names. Confirm against an existing fixture-based test if one is available.

- [ ] **Step 3: Extract the helper**

In `src/shared/mapUtils.ts`, add above `computeFightAvgPosition`:

```ts
/** A squad member's replay path: `[t_ms, pixelX, pixelY]` per sample, EI canvas pixel space. */
export type PixelSample = [number, number, number];

/**
 * Every squad member's replay path, in EI canvas pixel space.
 *
 * Pixels rather than world inches because that is the space
 * `wvwLandmarks.ts` and `wvwTiles.ts`'s `pixelOffset` are calibrated in;
 * see REPLAY_CANVAS_MAX in nativePositioning for why.
 */
export function squadPixelTracks(details: any): PixelSample[][] {
    const arena = getArena(details);
    if (!arena) return [];
    const tracks = getPositionTracks(details);
    if (tracks.size === 0) return [];
    const canvas = replayCanvas(arena);
    const report = details?.native ?? {};

    const out: PixelSample[][] = [];
    for (const entity of squadEntities(report)) {
        const samples = tracks.get(entity.id)?.samples;
        if (!samples?.length) continue;
        out.push(samples.map(([t, x, y]) => {
            const [px, py] = worldToPixel(arena, x, y, canvas);
            return [t, px, py] as PixelSample;
        }));
    }
    return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/__tests__/mapUtils.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Verify nothing regressed**

Run: `npx vitest run src/shared --maxWorkers=2 && npm run typecheck`
Expected: PASS. `computeFightAvgPosition` is untouched behaviourally.

- [ ] **Step 6: Commit**

```bash
git add src/shared/mapUtils.ts src/shared/__tests__/mapUtils.test.ts
git commit -m "feat(map-slice): extract squadPixelTracks from mapUtils"
```

---

### Task 2: Geometry — projection and framing

The core of the feature and the part that can be silently wrong. All pure functions.

**Files:**
- Create: `src/shared/sliceGeometry.ts`
- Test: `src/shared/__tests__/sliceGeometry.test.ts`

**Interfaces:**
- Consumes: `PixelSample`, `squadPixelTracks` from Task 1. `WVW_TILE_DATA`, `MAX_TILE_ZOOM`, `MAX_HIRES_ZOOM`, `HIRES_TILE_BASE` from `src/shared/wvwTiles.ts`. `WvwMap` from `src/shared/wvwLandmarks.ts`.
- Produces:
```ts
export const SLICE_WIDTH = 1120;
export const SLICE_HEIGHT = 215;
export const SLICE_ASPECT: number;      // 1120 / 215
export const MIN_SLICE_UNITS = 400;
export const MAX_SLICE_UNITS = 1000;
export const CENTROID_BINS = 64;

export interface ContinentFrame { cx1: number; cy1: number; cx2: number; cy2: number; }

export function eiPixelToContinent(map: WvwMap, px: number, py: number): [number, number] | null;
export function centroidPath(tracks: PixelSample[][], bins?: number): Array<[number, number]>;
export function frameForPath(points: Array<[number, number]>): ContinentFrame | null;
export function continentToOutput(frame: ContinentFrame, cx: number, cy: number): [number, number];
```

- [ ] **Step 1: Write the failing tests**

Create `src/shared/__tests__/sliceGeometry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/sliceGeometry.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../sliceGeometry`.

- [ ] **Step 3: Implement**

Create `src/shared/sliceGeometry.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/sliceGeometry.test.ts --maxWorkers=2`
Expected: PASS, all cases.

The Anzalias Pass assertion is the load-bearing one — it is the only check that the projection matches reality rather than matching itself. If it fails, the arithmetic is wrong; do not adjust the expected numbers.

Note: `WVW_TILE_DATA`'s `WvwMapTileData` interface is not currently exported from `wvwTiles.ts`. Reading its fields does not require the type, so do not export it just for this; only add an export if `npm run typecheck` demands it.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/sliceGeometry.ts src/shared/__tests__/sliceGeometry.test.ts
git commit -m "feat(map-slice): continent projection and clamped slice framing"
```

---

### Task 3: Geometry — tiles and draw list

Turn a frame into the tile placements that cover it, then assemble the whole draw list.

**Files:**
- Modify: `src/shared/sliceGeometry.ts`
- Test: `src/shared/__tests__/sliceGeometry.test.ts`

**Interfaces:**
- Consumes: everything from Task 2; `squadPixelTracks` from Task 1; `findNearestLandmark` from `src/shared/wvwLandmarks.ts`; `resolveMapFromDetails` from `src/shared/mapUtils.ts`.
- Produces:
```ts
export interface SliceTilePlacement { url: string; x: number; y: number; width: number; height: number; }
export interface SliceDrawList {
    width: number;                          // always SLICE_WIDTH
    height: number;                         // always SLICE_HEIGHT
    tiles: SliceTilePlacement[];
    path: Array<[number, number]>;          // output pixels; [0] is the beacon
    caption: string | null;
}
export function pickSliceZoom(map: WvwMap, frameWidthUnits: number): number;
export function tilesForFrame(map: WvwMap, frame: ContinentFrame): SliceTilePlacement[];
export function buildSliceDrawList(details: any, zone: string): SliceDrawList | null;
```

`buildSliceDrawList` returns `null` — never throws — when the map is unknown, there are no positions, or the path projects to nothing.

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/__tests__/sliceGeometry.test.ts`:

```ts
import {
    pickSliceZoom, tilesForFrame, buildSliceDrawList, MAX_SLICE_UNITS as MAXU,
} from '../sliceGeometry';
import { MAX_TILE_ZOOM, MAX_HIRES_ZOOM } from '../wvwTiles';

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

    it('returns null for an unknown map', () => {
        expect(buildSliceDrawList({}, 'Some Raid Boss')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/sliceGeometry.test.ts --maxWorkers=2`
Expected: FAIL on the new describes — `pickSliceZoom` etc. are not exported. The Task 2 describes still PASS.

- [ ] **Step 3: Implement**

Add to `src/shared/sliceGeometry.ts` — extend the imports first:

```ts
import { WvwMap, findNearestLandmark } from './wvwLandmarks';
import { WVW_TILE_DATA, MAX_TILE_ZOOM, MAX_HIRES_ZOOM, HIRES_TILE_BASE } from './wvwTiles';
import { resolveMapFromDetails, squadPixelTracks, type PixelSample } from './mapUtils';
```

then append:

```ts
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
        for (const [px, py] of pixelPath) {
            const c = eiPixelToContinent(map, px, py);
            if (c) continentPath.push(c);
        }
        if (continentPath.length === 0) return null;

        const frame = frameForPath(continentPath);
        if (!frame) return null;

        const tiles = tilesForFrame(map, frame);
        if (tiles.length === 0) return null;

        // The caption names where the fight STARTED, matching the beacon.
        const [startPx, startPy] = pixelPath[0];
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/sliceGeometry.test.ts --maxWorkers=2`
Expected: PASS

If `WvwMap.ObsidianSanctum` is not the exact enum member name, read `src/shared/wvwLandmarks.ts` and use the real one; do not delete the test.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/sliceGeometry.ts src/shared/__tests__/sliceGeometry.test.ts
git commit -m "feat(map-slice): tile selection and draw-list assembly"
```

---

### Task 4: Tile cache in main

Fetch tile URLs and return data URLs, cached on disk. This lives in main because Node HTTP is not subject to CORS and because `fs` is here — see the Global Constraints.

**Files:**
- Create: `src/main/mapSlice/tileCache.ts`
- Test: `src/main/mapSlice/__tests__/tileCache.test.ts`

**Interfaces:**
- Consumes: `SliceTilePlacement` from `src/shared/sliceGeometry.ts`.
- Produces:
```ts
export interface TileFetcher { (url: string): Promise<Buffer>; }
export interface TileCacheOptions {
    cacheDir: string;
    fetcher?: TileFetcher;
    concurrency?: number;      // default 6
    maxBytes?: number;         // default 200 * 1024 * 1024
}
/** Resolves each placement's URL to a `data:` URL. Placements whose tile
 *  could not be fetched are omitted. Never throws. */
export function resolveTiles(
    tiles: SliceTilePlacement[],
    options: TileCacheOptions,
): Promise<SliceTilePlacement[]>;
```

- [ ] **Step 1: Write the failing tests**

Create `src/main/mapSlice/__tests__/tileCache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTiles } from '../tileCache';

const placement = (url: string) => ({ url, x: 0, y: 0, width: 10, height: 10 });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('resolveTiles', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'slice-tiles-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('returns data URLs and preserves placement geometry', async () => {
        const fetcher = vi.fn(async () => PNG);
        const out = await resolveTiles([placement('https://x/a.jpg')], { cacheDir: dir, fetcher });
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:image/jpeg;base64,')).toBe(true);
        expect(out[0].width).toBe(10);
    });

    it('does not re-fetch a cached tile', async () => {
        const fetcher = vi.fn(async () => PNG);
        const tiles = [placement('https://x/a.jpg')];
        await resolveTiles(tiles, { cacheDir: dir, fetcher });
        await resolveTiles(tiles, { cacheDir: dir, fetcher });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(readdirSync(dir).length).toBe(1);
    });

    it('omits tiles that fail and keeps the ones that succeed', async () => {
        const fetcher = vi.fn(async (url: string) => {
            if (url.includes('bad')) throw new Error('404');
            return PNG;
        });
        const out = await resolveTiles(
            [placement('https://x/good.jpg'), placement('https://x/bad.jpg')],
            { cacheDir: dir, fetcher },
        );
        expect(out).toHaveLength(1);
        expect(out[0].url.startsWith('data:')).toBe(true);
    });

    it('returns [] when every tile fails', async () => {
        const fetcher = vi.fn(async () => { throw new Error('offline'); });
        const out = await resolveTiles([placement('https://x/a.jpg')], { cacheDir: dir, fetcher });
        expect(out).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/mapSlice/__tests__/tileCache.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../tileCache`.

- [ ] **Step 3: Implement**

Create `src/main/mapSlice/tileCache.ts`:

```ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import type { SliceTilePlacement } from '../../shared/sliceGeometry';

export interface TileFetcher { (url: string): Promise<Buffer>; }

export interface TileCacheOptions {
    cacheDir: string;
    fetcher?: TileFetcher;
    concurrency?: number;
    maxBytes?: number;
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const httpFetcher: TileFetcher = async (url) => {
    const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: FETCH_TIMEOUT_MS,
    });
    return Buffer.from(res.data);
};

/** Cache filename for a tile URL. Hashed because a URL is not a safe path. */
const cacheKey = (url: string) => `${createHash('sha1').update(url).digest('hex')}.jpg`;

const toDataUrl = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`;

/**
 * Resolve tile URLs to `data:` URLs, reading through a disk cache.
 *
 * Data URLs rather than the originals because the renderer paints these onto
 * a canvas it must then read back: `tiles.guildwars2.com` sends no
 * `Access-Control-Allow-Origin`, so a remote URL would taint the canvas and
 * make `toBlob()` throw. See the design doc.
 *
 * A tile that cannot be fetched is omitted rather than fatal — a missing tile
 * is a gap in a decorative image.
 */
export async function resolveTiles(
    tiles: SliceTilePlacement[],
    options: TileCacheOptions,
): Promise<SliceTilePlacement[]> {
    if (tiles.length === 0) return [];
    const { cacheDir, fetcher = httpFetcher } = options;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

    try {
        await fs.mkdir(cacheDir, { recursive: true });
    } catch {
        // An unusable cache dir degrades to fetching every time, not to failing.
    }

    const resolved: Array<SliceTilePlacement | null> = new Array(tiles.length).fill(null);
    let cursor = 0;
    let fetched = 0;

    const worker = async () => {
        for (;;) {
            const index = cursor++;
            if (index >= tiles.length) return;
            const tile = tiles[index];
            const path = join(cacheDir, cacheKey(tile.url));

            try {
                const cached = await fs.readFile(path);
                resolved[index] = { ...tile, url: toDataUrl(cached) };
                continue;
            } catch {
                // Cache miss — fall through to the network.
            }

            try {
                const buffer = await fetcher(tile.url);
                if (!buffer?.length) continue;
                resolved[index] = { ...tile, url: toDataUrl(buffer) };
                fetched += 1;
                try {
                    await fs.writeFile(path, buffer);
                } catch {
                    // A tile we could not cache is still a tile we can draw.
                }
            } catch {
                // Omitted: a 404 on a synthetic hi-res tile is expected.
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(concurrency, tiles.length) }, worker),
    );

    if (fetched > 0) {
        void pruneCache(cacheDir, options.maxBytes ?? DEFAULT_MAX_BYTES);
    }

    return resolved.filter((t): t is SliceTilePlacement => t !== null);
}

/** Drop the least recently used tiles until the cache fits its budget. */
async function pruneCache(cacheDir: string, maxBytes: number): Promise<void> {
    try {
        const names = await fs.readdir(cacheDir);
        const entries: Array<{ path: string; size: number; atime: number }> = [];
        let total = 0;
        for (const name of names) {
            const path = join(cacheDir, name);
            try {
                const stat = await fs.stat(path);
                if (!stat.isFile()) continue;
                entries.push({ path, size: stat.size, atime: stat.atimeMs });
                total += stat.size;
            } catch {
                // Raced with another prune; skip it.
            }
        }
        if (total <= maxBytes) return;

        entries.sort((a, b) => a.atime - b.atime);
        for (const entry of entries) {
            if (total <= maxBytes) break;
            try {
                await fs.unlink(entry.path);
                total -= entry.size;
            } catch {
                // Already gone.
            }
        }
    } catch {
        // Pruning is housekeeping; failing it must not fail a report.
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/mapSlice/__tests__/tileCache.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/mapSlice/tileCache.ts src/main/mapSlice/__tests__/tileCache.test.ts
git commit -m "feat(map-slice): disk-cached tile fetching in main"
```

---

### Task 5: Renderer painter and the IPC round trip

Main has no existing request/response channel to the renderer — every `webContents.send` in `src/main/index.ts` is fire-and-forget. This task builds one, scoped to the slice: main sends a request carrying a `requestId`, the renderer paints and sends the result back, main resolves the matching pending promise or times out.

**Files:**
- Create: `src/renderer/mapSlice/paintSlice.ts`
- Create: `src/renderer/mapSlice/useMapSlicePainter.ts`
- Create: `src/renderer/mapSlice/__tests__/paintSlice.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts` (the `electronAPI` interface)
- Modify: `src/renderer/app/AppLayout.tsx` (call the hook once)

**Interfaces:**
- Consumes: `SliceDrawList` from `src/shared/sliceGeometry.ts`.
- Produces:
```ts
// paintSlice.ts
export function paintSlice(drawList: SliceDrawList): Promise<Uint8Array | null>;

// useMapSlicePainter.ts
export function useMapSlicePainter(): void;

// preload / electronAPI additions
onMapSlicePaint(callback: (payload: { requestId: string; drawList: SliceDrawList }) => void): () => void;
sendMapSliceResult(payload: { requestId: string; png: Uint8Array | null }): void;
```
- IPC channel names, used verbatim by Task 6: `'map-slice:paint'` (main→renderer), `'map-slice:result'` (renderer→main).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/mapSlice/__tests__/paintSlice.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paintSlice } from '../paintSlice';
import { SLICE_WIDTH, SLICE_HEIGHT } from '../../../shared/sliceGeometry';

const drawList = (tiles: any[] = []) => ({
    width: SLICE_WIDTH, height: SLICE_HEIGHT, tiles,
    path: [[100, 100], [200, 120]] as Array<[number, number]>,
    caption: 'Anzalias Pass',
});

describe('paintSlice', () => {
    beforeEach(() => {
        // jsdom has no canvas backend; assert on the 2D calls instead of pixels.
        (globalThis as any).Image = class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
        };
    });

    it('returns null when the canvas has no 2D context', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as any);
        expect(await paintSlice(drawList() as any)).toBeNull();
    });

    it('draws each tile, the trail, and the caption', async () => {
        const ctx = {
            drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
            stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
            fillText: vi.fn(), save: vi.fn(), restore: vi.fn(),
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            set fillStyle(_v: any) {}, set strokeStyle(_v: any) {},
            set lineWidth(_v: any) {}, set lineCap(_v: any) {},
            set font(_v: any) {}, set shadowBlur(_v: any) {}, set shadowColor(_v: any) {},
            set globalAlpha(_v: any) {},
        };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((cb: any) => {
            cb({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
        }) as any);

        const tiles = [{ url: 'data:image/jpeg;base64,AAA', x: 0, y: 0, width: 256, height: 256 }];
        const png = await paintSlice(drawList(tiles) as any);

        expect(png).toEqual(new Uint8Array([1, 2, 3]));
        expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        expect(ctx.stroke).toHaveBeenCalled();          // the trail
        expect(ctx.arc).toHaveBeenCalled();             // the beacon
        expect(ctx.fillText).toHaveBeenCalledWith('Anzalias Pass', expect.any(Number), expect.any(Number));
    });

    it('rejects a tile URL that is not a data URL', async () => {
        const ctx = { drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
            stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
            save: vi.fn(), restore: vi.fn(),
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            set fillStyle(_v: any) {}, set strokeStyle(_v: any) {}, set lineWidth(_v: any) {},
            set lineCap(_v: any) {}, set font(_v: any) {}, set shadowBlur(_v: any) {},
            set shadowColor(_v: any) {}, set globalAlpha(_v: any) {} };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((cb: any) => {
            cb({ arrayBuffer: async () => new Uint8Array([9]).buffer });
        }) as any);

        const tiles = [{ url: 'https://tiles.guildwars2.com/2/3/7/1/1.jpg', x: 0, y: 0, width: 8, height: 8 }];
        await paintSlice(drawList(tiles) as any);
        // A remote URL would taint the canvas, so it is never drawn.
        expect(ctx.drawImage).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/mapSlice/__tests__/paintSlice.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../paintSlice`.

- [ ] **Step 3: Implement the painter**

Create `src/renderer/mapSlice/paintSlice.ts`:

```ts
import type { SliceDrawList } from '../../shared/sliceGeometry';

const BEACON_RINGS = [
    { radius: 26, alpha: 0.14 },
    { radius: 18, alpha: 0.22 },
    { radius: 11, alpha: 0.32 },
];
const BEACON_CORE_RADIUS = 5.5;
const BEACON_RED = '#ff3b3b';
const TRAIL_WIDTH = 3.5;
const END_MARKER_RADIUS = 5;
const CAPTION_FONT = '600 20px "Segoe UI", system-ui, sans-serif';
const CAPTION_MARGIN = 14;

/** Decode a `data:` URL into an image. Rejects anything else — a remote URL
 *  would taint the canvas and make `toBlob` throw. */
const loadDataUrl = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
        if (!url.startsWith('data:')) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });

/**
 * Paint a draw list and return PNG bytes, or `null` if painting is impossible.
 *
 * This function knows nothing about maps, projections, or the network: main
 * resolved all of that into `drawList`. It only puts pixels down.
 */
export async function paintSlice(drawList: SliceDrawList): Promise<Uint8Array | null> {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = drawList.width;
        canvas.height = drawList.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tiles, loaded in parallel and drawn in list order.
        const images = await Promise.all(drawList.tiles.map(t => loadDataUrl(t.url)));
        images.forEach((img, i) => {
            if (!img) return;
            const t = drawList.tiles[i];
            ctx.drawImage(img, t.x, t.y, t.width, t.height);
        });

        drawTrail(ctx, drawList.path);
        if (drawList.path.length > 1) drawEndMarker(ctx, drawList.path[drawList.path.length - 1]);
        if (drawList.path.length > 0) drawBeacon(ctx, drawList.path[0]);
        if (drawList.caption) drawCaption(ctx, drawList.caption, canvas.height);

        return await canvasToPng(canvas);
    } catch {
        return null;
    }
}

/** The squad's route, fading out as it gets further from the beacon. */
function drawTrail(ctx: CanvasRenderingContext2D, path: Array<[number, number]>): void {
    if (path.length < 2) return;
    ctx.save();
    ctx.lineWidth = TRAIL_WIDTH;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    for (let i = 1; i < path.length; i++) {
        // Per-segment alpha rather than one gradient: the path doubles back on
        // itself, so a positional gradient would not track progress along it.
        ctx.globalAlpha = 1 - (i / path.length) * 0.8;
        ctx.strokeStyle = BEACON_RED;
        ctx.beginPath();
        ctx.moveTo(path[i - 1][0], path[i - 1][1]);
        ctx.lineTo(path[i][0], path[i][1]);
        ctx.stroke();
    }
    ctx.restore();
}

/** Layered rings, a glow, and a white-ringed core — readable at Discord's width. */
function drawBeacon(ctx: CanvasRenderingContext2D, [x, y]: [number, number]): void {
    ctx.save();
    for (const ring of BEACON_RINGS) {
        ctx.globalAlpha = ring.alpha;
        ctx.fillStyle = BEACON_RED;
        ctx.beginPath();
        ctx.arc(x, y, ring.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = BEACON_RED;
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, BEACON_CORE_RADIUS + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = BEACON_RED;
    ctx.beginPath();
    ctx.arc(x, y, BEACON_CORE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawEndMarker(ctx: CanvasRenderingContext2D, [x, y]: [number, number]): void {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x, y, END_MARKER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, canvasHeight: number): void {
    ctx.save();
    ctx.font = CAPTION_FONT;
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, CAPTION_MARGIN, canvasHeight - CAPTION_MARGIN);
    ctx.restore();
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                resolve(null);
                return;
            }
            blob.arrayBuffer()
                .then(buf => resolve(new Uint8Array(buf)))
                .catch(() => resolve(null));
        }, 'image/png');
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/mapSlice/__tests__/paintSlice.test.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 5: Add the preload channels**

In `src/preload/index.ts`, add to the `electronAPI` object (match the surrounding style — the `onUploadComplete` family is the model for a listener that returns a cleanup function):

```ts
    onMapSlicePaint: (callback: (value: { requestId: string; drawList: any }) => void) => {
        const listener = (_event: any, value: any) => callback(value);
        ipcRenderer.on('map-slice:paint', listener);
        return () => { ipcRenderer.removeListener('map-slice:paint', listener); };
    },
    sendMapSliceResult: (payload: { requestId: string; png: Uint8Array | null }) =>
        ipcRenderer.send('map-slice:result', payload),
```

Then declare both on the `electronAPI` interface in `src/renderer/global.d.ts`:

```ts
    onMapSlicePaint: (callback: (value: { requestId: string; drawList: import('../shared/sliceGeometry').SliceDrawList }) => void) => () => void;
    sendMapSliceResult: (payload: { requestId: string; png: Uint8Array | null }) => void;
```

- [ ] **Step 6: Add the painter hook and mount it**

Create `src/renderer/mapSlice/useMapSlicePainter.ts`:

```ts
import { useEffect } from 'react';
import { paintSlice } from './paintSlice';

/**
 * Answers main's slice-paint requests for the lifetime of the app.
 *
 * Main owns the geometry and the tiles; this is the only place in the
 * renderer that touches the slice at all. Mount it exactly once.
 */
export function useMapSlicePainter(): void {
    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onMapSlicePaint) return;
        return api.onMapSlicePaint(async ({ requestId, drawList }) => {
            let png: Uint8Array | null = null;
            try {
                png = await paintSlice(drawList);
            } catch {
                png = null;
            }
            // Always reply: main is holding a pending promise on this id.
            api.sendMapSliceResult({ requestId, png });
        });
    }, []);
}
```

In `src/renderer/app/AppLayout.tsx`, import and call it once in the component body alongside the other hooks:

```ts
import { useMapSlicePainter } from '../mapSlice/useMapSlicePainter';
// ...inside the component:
useMapSlicePainter();
```

- [ ] **Step 7: Verify**

Run: `npx vitest run src/renderer/mapSlice src/renderer/app --maxWorkers=2 && npm run validate`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/mapSlice src/preload/index.ts src/renderer/global.d.ts src/renderer/app/AppLayout.tsx
git commit -m "feat(map-slice): renderer canvas painter and paint IPC channel"
```

---

### Task 6: The `includeMapSlice` setting

One boolean across five declaration sites plus the UI. Adding a field to `IEmbedStatSettings` in only some of them typecheck-passes but silently defaults to `undefined` at runtime, so all five must move together.

**Files:**
- Modify: `src/main/discord.ts` (interface at line 62; `DEFAULT_EMBED_STATS` at line 89)
- Modify: `src/renderer/global.d.ts` (interface at line 27; `DEFAULT_EMBED_STATS` at line 159)
- Modify: `src/main/handlers/settingsHandlers.ts` (`DEFAULT_EMBED_STATS` at line 15)
- Modify: `src/renderer/SettingsView.tsx` (near the `showClassSummary` toggle, around line 2048)
- Modify: `src/renderer/__tests__/SettingsView.test.tsx` (its embed-settings fixture, around line 41)

**Interfaces:**
- Produces: `IEmbedStatSettings.includeMapSlice: boolean`, default `true`, readable in `discord.ts` as `this.embedStatSettings.includeMapSlice`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/SettingsView.test.tsx` (or create `src/main/handlers/__tests__/embedDefaults.test.ts` if `SettingsView.test.tsx` has no suitable place):

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_EMBED_STATS as RENDERER_DEFAULTS } from '../global.d';
import { DEFAULT_EMBED_STATS as HANDLER_DEFAULTS } from '../../main/handlers/settingsHandlers';

describe('includeMapSlice default', () => {
    it('defaults on in every declaration site', () => {
        expect(RENDERER_DEFAULTS.includeMapSlice).toBe(true);
        expect((HANDLER_DEFAULTS as any).includeMapSlice).toBe(true);
    });
});
```

If `global.d.ts` cannot be imported as a value module in this project's test setup, assert only against `settingsHandlers` and `src/main/discord.ts`'s exported interface via a typecheck instead — do not delete the check.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/SettingsView.test.tsx --maxWorkers=2`
Expected: FAIL — `includeMapSlice` is `undefined`.

- [ ] **Step 3: Add the field everywhere**

In `src/main/discord.ts`, in `IEmbedStatSettings` after `classDisplay`:

```ts
    /** Attach a map slice showing where the fight happened. */
    includeMapSlice: boolean;
```

and in its `DEFAULT_EMBED_STATS`:

```ts
    includeMapSlice: true,
```

Make the identical two additions in `src/renderer/global.d.ts` (interface at line 27, `DEFAULT_EMBED_STATS` at line 159) and the value addition in `src/main/handlers/settingsHandlers.ts`'s `DEFAULT_EMBED_STATS`.

In `src/renderer/__tests__/SettingsView.test.tsx`, add `includeMapSlice: true` to the embed-settings fixture.

- [ ] **Step 4: Add the toggle**

In `src/renderer/SettingsView.tsx`, after the `showClassSummary` `<Toggle>` block (around line 2053):

```tsx
                            <Toggle
                                enabled={embedStats.includeMapSlice}
                                onChange={(v) => updateEmbedStat('includeMapSlice', v)}
                                label="Map Slice"
                                description="A strip of the map showing where the fight happened"
                            />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/SettingsView.test.tsx --maxWorkers=2 && npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/discord.ts src/renderer/global.d.ts src/main/handlers/settingsHandlers.ts src/renderer/SettingsView.tsx src/renderer/__tests__/SettingsView.test.tsx
git commit -m "feat(map-slice): add the includeMapSlice setting, default on"
```

---

### Task 7: Orchestration in main

Tie geometry, tiles, and the renderer round trip together behind one function, with the timeout and every skip path.

**Files:**
- Create: `src/main/mapSlice/index.ts`
- Test: `src/main/mapSlice/__tests__/buildMapSlice.test.ts`

**Interfaces:**
- Consumes: `buildSliceDrawList` (Task 3), `resolveTiles` (Task 4), the `'map-slice:paint'` / `'map-slice:result'` channels (Task 5).
- Produces:
```ts
export interface BuildMapSliceDeps {
    /** Send the paint request to the renderer. Returns false if no window exists. */
    requestPaint: (requestId: string, drawList: SliceDrawList) => boolean;
    cacheDir: string;
    timeoutMs?: number;         // default 10_000
    resolveTilesFn?: typeof resolveTiles;
}
export function registerMapSliceResult(ipcMain: Electron.IpcMain): void;
export function buildMapSlice(
    details: any, zone: string, deps: BuildMapSliceDeps,
): Promise<Buffer | null>;
```

- [ ] **Step 1: Write the failing tests**

Create `src/main/mapSlice/__tests__/buildMapSlice.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildMapSlice, __resolvePendingForTest } from '../index';

const deps = (over: any = {}) => ({
    requestPaint: vi.fn(() => true),
    cacheDir: '/tmp/does-not-matter',
    timeoutMs: 50,
    resolveTilesFn: vi.fn(async (tiles: any[]) => tiles.map(t => ({ ...t, url: 'data:image/jpeg;base64,AA' }))),
    ...over,
});

describe('buildMapSlice', () => {
    it('returns null when there is no draw list (no positions)', async () => {
        const d = deps();
        expect(await buildMapSlice({}, 'Eternal Battlegrounds', d)).toBeNull();
        expect(d.requestPaint).not.toHaveBeenCalled();
    });

    it('returns null for an unknown map without touching the network', async () => {
        const d = deps();
        expect(await buildMapSlice({}, 'Not A WvW Map', d)).toBeNull();
        expect(d.resolveTilesFn).not.toHaveBeenCalled();
    });

    it('returns null when the renderer never answers', async () => {
        // Force a valid draw list by stubbing the geometry module.
        const d = deps({ requestPaint: vi.fn(() => true) });
        vi.doMock('../../../shared/sliceGeometry', async (orig) => ({
            ...(await orig() as any),
            buildSliceDrawList: () => ({ width: 10, height: 10, tiles: [{ url: 'x', x: 0, y: 0, width: 1, height: 1 }], path: [[0, 0]], caption: null }),
        }));
        const { buildMapSlice: fresh } = await import('../index');
        expect(await fresh({}, 'Eternal Battlegrounds', d)).toBeNull();
        vi.doUnmock('../../../shared/sliceGeometry');
    });

    it('returns null when there is no window to paint in', async () => {
        const d = deps({ requestPaint: vi.fn(() => false) });
        expect(await buildMapSlice({}, 'Eternal Battlegrounds', d)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/mapSlice/__tests__/buildMapSlice.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Implement**

Create `src/main/mapSlice/index.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { buildSliceDrawList, type SliceDrawList } from '../../shared/sliceGeometry';
import { resolveTiles } from './tileCache';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface BuildMapSliceDeps {
    /** Send the paint request to the renderer; `false` when no window exists. */
    requestPaint: (requestId: string, drawList: SliceDrawList) => boolean;
    cacheDir: string;
    timeoutMs?: number;
    resolveTilesFn?: typeof resolveTiles;
}

type Pending = (png: Uint8Array | null) => void;
const pending = new Map<string, Pending>();

/** Wire up the renderer's reply channel. Call once during app setup. */
export function registerMapSliceResult(ipcMain: Electron.IpcMain): void {
    ipcMain.on('map-slice:result', (_event, payload: { requestId?: string; png?: Uint8Array | null }) => {
        const id = payload?.requestId;
        if (!id) return;
        const resolve = pending.get(id);
        if (!resolve) return;          // already timed out
        pending.delete(id);
        resolve(payload?.png ?? null);
    });
}

/** Test seam: resolve a pending request without a real renderer. */
export function __resolvePendingForTest(requestId: string, png: Uint8Array | null): void {
    const resolve = pending.get(requestId);
    if (!resolve) return;
    pending.delete(requestId);
    resolve(png);
}

/**
 * The map slice for a fight, or `null` when one cannot be produced.
 *
 * Never throws and never rejects. The slice is decorative: a missing image
 * must cost the report nothing.
 */
export async function buildMapSlice(
    details: any,
    zone: string,
    deps: BuildMapSliceDeps,
): Promise<Buffer | null> {
    try {
        const drawList = buildSliceDrawList(details, zone);
        if (!drawList) return null;

        const resolveTilesFn = deps.resolveTilesFn ?? resolveTiles;
        const tiles = await resolveTilesFn(drawList.tiles, { cacheDir: deps.cacheDir });
        if (tiles.length === 0) {
            console.warn('[MapSlice] no tiles could be fetched; skipping the image.');
            return null;
        }

        const requestId = randomUUID();
        const png = await new Promise<Uint8Array | null>((resolve) => {
            const timer = setTimeout(() => {
                if (!pending.delete(requestId)) return;
                console.warn('[MapSlice] renderer did not answer in time; skipping the image.');
                resolve(null);
            }, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

            pending.set(requestId, (result) => {
                clearTimeout(timer);
                resolve(result);
            });

            if (!deps.requestPaint(requestId, { ...drawList, tiles })) {
                clearTimeout(timer);
                pending.delete(requestId);
                resolve(null);
            }
        });

        if (!png?.length) return null;
        return Buffer.from(png);
    } catch (err) {
        console.warn('[MapSlice] slice build failed; skipping the image.', err);
        return null;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/mapSlice --maxWorkers=2`
Expected: PASS

If the `vi.doMock` timeout case proves awkward to arrange, replace it with a direct test that `buildMapSlice` resolves `null` after `timeoutMs` when `requestPaint` returns `true` and nothing calls `__resolvePendingForTest` — the behaviour under test is the timeout, not the mocking mechanism.

- [ ] **Step 5: Commit**

```bash
git add src/main/mapSlice/index.ts src/main/mapSlice/__tests__/buildMapSlice.test.ts
git commit -m "feat(map-slice): orchestrate geometry, tiles, and the renderer round trip"
```

---

### Task 8: Attach the slice to the embed

`postPayload` sends pure JSON, so embed mode has no way to carry an attachment. Add a multipart sibling and use it when a slice exists.

**Files:**
- Modify: `src/main/discord.ts` (`sendLog` signature at line 423; `resend` signature at line 457; the `postPayload({ embeds })` call at line 1326)
- Modify: `src/main/index.ts` (the two `sendLog` calls at lines 799 and 948; register `registerMapSliceResult`)
- Test: `src/main/__tests__/discordMapSlice.test.ts` (create)

**Interfaces:**
- Consumes: `buildMapSlice`, `registerMapSliceResult` from Task 7; `includeMapSlice` from Task 6.
- Produces: `sendLog`/`resend` accept an optional `mapSlicePng?: Uint8Array` in their `logData` argument.

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/discordMapSlice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import FormData from 'form-data';

/**
 * The payload shape is the contract with both Discord and the relay, so assert
 * on it directly rather than reaching through a full sendLog.
 */
const buildSlicePayload = (embeds: any[], png: Buffer, isBridge: boolean) => {
    const withImage = embeds.map((e, i) =>
        i === embeds.length - 1 ? { ...e, image: { url: 'attachment://slice.png' } } : e);
    const payload: any = { embeds: withImage };
    if (!isBridge) {
        payload.username = 'AxiBridge';
    }
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    form.append('file', png, { filename: 'slice.png', contentType: 'image/png' });
    return { payload, form };
};

describe('map slice embed payload', () => {
    it('puts the attachment reference on the last embed only', () => {
        const { payload } = buildSlicePayload(
            [{ title: 'a' }, { title: 'b' }], Buffer.from([1]), false);
        expect(payload.embeds[0].image).toBeUndefined();
        expect(payload.embeds[1].image).toEqual({ url: 'attachment://slice.png' });
    });

    it('uses the attachment:// scheme, never a remote URL', () => {
        const { payload } = buildSlicePayload([{ title: 'a' }], Buffer.from([1]), true);
        expect(payload.embeds[0].image.url).toBe('attachment://slice.png');
        expect(payload.embeds[0].image.url.startsWith('http')).toBe(false);
    });

    it('omits username for a bridged destination', () => {
        const bridged = buildSlicePayload([{ title: 'a' }], Buffer.from([1]), true);
        expect(bridged.payload.username).toBeUndefined();
        const hooked = buildSlicePayload([{ title: 'a' }], Buffer.from([1]), false);
        expect(hooked.payload.username).toBe('AxiBridge');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails or passes trivially**

Run: `npx vitest run src/main/__tests__/discordMapSlice.test.ts --maxWorkers=2`
Expected: PASS — this test pins the contract that Step 3 must implement. After Step 3, replace the local `buildSlicePayload` with an import of the real exported helper and re-run; it must still pass.

- [ ] **Step 3: Add the multipart embed sender**

In `src/main/discord.ts`, add next to `postForm` (around line 380):

```ts
    /**
     * Post embeds plus a PNG attachment referenced as `attachment://slice.png`.
     *
     * Only the `attachment://` scheme is used: the relay's whitelist accepts
     * nothing else, deliberately, so a paired client cannot make the bot
     * render an arbitrary remote image.
     */
    private async postEmbedsWithImage(embeds: any[], png: Buffer): Promise<void> {
        const withImage = embeds.map((embed, i) =>
            i === embeds.length - 1
                ? { ...embed, image: { url: 'attachment://slice.png' } }
                : embed);

        const payload: Record<string, unknown> = { embeds: withImage };
        if (!this.isBridge) {
            payload.username = 'AxiBridge';
            payload.avatar_url = DISCORD_WEBHOOK_AVATAR_URL;
        }

        const form = new FormData();
        form.append('payload_json', JSON.stringify(payload));
        form.append('file', png, { filename: 'slice.png', contentType: 'image/png' });
        await this.postForm(form);
    }
```

Extend both `logData` parameter types (line 423 `sendLog`, line 457 `resend`) with `mapSlicePng?: Uint8Array`.

Replace the `await this.postPayload({ embeds });` call at line 1326 with:

```ts
                    const slicePng = this.embedStatSettings.includeMapSlice !== false && logData.mapSlicePng?.length
                        ? Buffer.from(logData.mapSlicePng)
                        : null;
                    if (slicePng && embeds.length > 0) {
                        try {
                            await this.postEmbedsWithImage(embeds, slicePng);
                        } catch (err: any) {
                            // A relay that predates the `image` whitelist entry 400s here.
                            // The report still matters; the picture does not.
                            if (err?.response?.status === 400) {
                                console.warn('[Discord] destination rejected the map slice; sending without it.');
                                await this.postPayload({ embeds });
                            } else {
                                throw err;
                            }
                        }
                    } else {
                        await this.postPayload({ embeds });
                    }
```

- [ ] **Step 4: Wire it into the send sites**

In `src/main/index.ts`, near the other `ipcMain` registrations, add:

```ts
import { buildMapSlice, registerMapSliceResult } from './mapSlice';
// ...during setup:
registerMapSliceResult(ipcMain);
```

Add a helper alongside `handleDiscordSendResult` (line 276):

```ts
const mapSliceCacheDir = () => path.join(app.getPath('userData'), 'map-tiles');

/** Build the slice for a report, or null. Never throws. */
const mapSliceFor = async (details: any, zone: string): Promise<Uint8Array | undefined> => {
    const png = await buildMapSlice(details, zone, {
        cacheDir: mapSliceCacheDir(),
        requestPaint: (requestId, drawList) => {
            if (!win || win.isDestroyed()) return false;
            win.webContents.send('map-slice:paint', { requestId, drawList });
            return true;
        },
    });
    return png ? new Uint8Array(png) : undefined;
};
```

Then at both send sites, build the slice first and pass it through. At line 799:

```ts
                        const mapSlicePng = await mapSliceFor(prunedDetails, syntheticResult.zone ?? '');
                        const sendResult = await discord?.sendLog({ ...syntheticResult, filePath, mode: 'embed', splitEnemiesByTeam, mapSlicePng }, prunedDetails);
```

and the matching change at line 948 using `result.zone`. Read the surrounding code for the actual zone field name on each result object and use it verbatim — if neither carries a zone, pass `''` and let `resolveMapFromDetails` fall back to `native.encounter.map_id`.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/main --maxWorkers=2 && npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/discord.ts src/main/index.ts src/main/__tests__/discordMapSlice.test.ts
git commit -m "feat(map-slice): attach the slice to fight-report embeds"
```

---

### Task 9: Allow `image` on bridged embeds (axitools repo)

**This task is in a different repository:** `/home/mstephens/Documents/GitHub/axitools`. Do not edit it from an axibridge worktree; work in the axitools checkout on its own branch.

`ALLOWED_EMBED_KEYS` has no `image`, so `_validate_embed` raises `embed key not allowed: image` and the relay 400s on any bridged report carrying a slice. The relay's multipart handling is already in place — this whitelist entry is the only gap.

**Files:**
- Modify: `axitools/api/bridge_payload.py` (`ALLOWED_EMBED_KEYS` at line 19; `_validate_embed` at line 69)
- Test: `tests/test_bridge_payload.py` (append; create if absent)

**Interfaces:**
- Consumes: the `attachment://slice.png` contract from Task 8.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Append to the axitools repo's `tests/test_bridge_payload.py`:

```python
import pytest

from axitools.api.bridge_payload import validate_report


def _report(image):
    return {"embeds": [{"title": "t", "image": image}]}


def test_attachment_image_is_allowed():
    validate_report(_report({"url": "attachment://slice.png"}))


def test_remote_image_url_is_rejected():
    # An unrestricted image.url would let any paired client make the bot
    # render an arbitrary remote image.
    with pytest.raises(ValueError):
        validate_report(_report({"url": "https://evil.example/x.png"}))


def test_image_without_url_is_rejected():
    with pytest.raises(ValueError):
        validate_report(_report({}))


def test_unknown_image_key_is_rejected():
    with pytest.raises(ValueError):
        validate_report(_report({"url": "attachment://slice.png", "proxy_url": "https://x/y"}))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from the axitools repo root): `python -m pytest tests/test_bridge_payload.py -v`
Expected: FAIL — `test_attachment_image_is_allowed` raises `embed key not allowed: image`.

- [ ] **Step 3: Implement**

In `axitools/api/bridge_payload.py`, add `"image"` to `ALLOWED_EMBED_KEYS`:

```python
ALLOWED_EMBED_KEYS = frozenset(
    {"title", "description", "color", "url", "footer", "fields", "timestamp", "image"}
)
ALLOWED_IMAGE_KEYS = frozenset({"url"})
```

and add the validator, called from `_validate_embed` wherever the other per-key checks run:

```python
def _validate_image(image: object) -> None:
    """Embed images must reference a file uploaded in the same request.

    Only the ``attachment://`` scheme is accepted. Allowing arbitrary URLs
    would let any paired client make the bot render remote images, so the
    value is bound to a part the request already carries -- which the existing
    attachment count and byte limits already bound.
    """
    if not isinstance(image, dict):
        raise ValueError("embed image must be an object")
    unknown = set(image) - ALLOWED_IMAGE_KEYS
    if unknown:
        raise ValueError(f"embed image key not allowed: {sorted(unknown)[0]}")
    url = image.get("url")
    if not isinstance(url, str) or not url.startswith("attachment://"):
        raise ValueError("embed image url must use the attachment:// scheme")
```

Read `_validate_embed` (line 69) and call `_validate_image(embed["image"])` in the same style as its sibling checks.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_bridge_payload.py -v`
Expected: PASS, all four.

- [ ] **Step 5: Run the full relay test suite**

Run: `python -m pytest tests/ -q`
Expected: PASS — no existing test asserted that `image` is rejected.

- [ ] **Step 6: Commit (in the axitools repo)**

```bash
git add axitools/api/bridge_payload.py tests/test_bridge_payload.py
git commit -m "feat(bridge): allow embed images with attachment:// URLs only"
```

Deploying this to venus is a separate, explicitly-authorised step — not part of this task.

---

### Task 10: End-to-end verification against a real log

The geometry is unit-tested and the projection is pinned to a known landmark, but nothing so far has proved the image actually looks right. This task is manual and produces a judgement, not a test.

**Files:** none modified unless a defect is found.

**Interfaces:** consumes everything.

- [ ] **Step 1: Run the full suite**

Run: `npm run validate && npm run test:unit -- --maxWorkers=2`
Expected: PASS

- [ ] **Step 2: Send a real report and look at it**

Start the app (`npm run dev`), point it at a real WvW log with replay data, and send a fight report to the test Discord destination. Check, in the posted embed:

1. The image is present and is a recognisable piece of WvW terrain.
2. The beacon sits where the fight actually started — cross-check the caption against the map name and your own knowledge of the log.
3. The trail is visible and reads as direction of travel.
4. The caption names a plausible nearby objective.
5. The beacon is still legible at Discord's rendered width without clicking to expand.

- [ ] **Step 3: Verify the skip paths by hand**

1. Turn `includeMapSlice` off → the report posts with no image and no error.
2. Turn off `keepCombatReplayLocally`, re-parse a log, send → the report posts with no image and no error.
3. Send a report to a bridged destination against a relay **without** Task 9 deployed → the report still posts, without the image, and the log shows `destination rejected the map slice`.

- [ ] **Step 4: Confirm the cache works**

After several reports on one borderland, check that `<userData>/map-tiles/` holds tile files and that later reports on the same map issue no new tile requests. On Linux dev, userData is `~/.config/AxiBridge-Dev`.

- [ ] **Step 5: Report findings**

If any of the above is wrong, fix it with a new test covering the defect before declaring the feature done. If all pass, the feature is complete.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Framing: 5.2:1, clamped 400-1000 | 2 |
| Beacon, trail, end marker, caption | 5 (painter), 3 (caption text) |
| No minimap inset | n/a — nothing implements it |
| Renderer composition over IPC | 5, 7 |
| Modules split (main owns logic) | 2, 3, 4, 5, 7 |
| Coordinate pipeline + Anzalias pin | 2 |
| Positions reach the sender | 8 (send sites pass `prunedDetails`) |
| Tiles, zoom choice, hi-res fallback | 3 |
| Disk cache, concurrency, partial failure | 4 |
| Delivery via multipart `attachment://` | 8 |
| axitools `image` whitelist | 9 |
| Degradation: all five skip paths | 7 (no positions/unknown map/timeout/no tiles), 8 (relay 400) |
| Reduced quality: `maxZoom` cap, single-sample path | 3 (`pickSliceZoom`), 2 (`centroidPath`) |
| `includeMapSlice` setting, default on | 6 |
| Testing: geometry, tiles, delivery, axitools | 2, 3, 4, 8, 9 |
| Verified by eye against a real log | 10 |

No gaps.

**Placeholder scan:** no TBD/TODO, no "add error handling", no "write tests for the above", no "similar to Task N". Every code step carries real code. Task 10 is deliberately manual and says so.

**Type consistency checked:**
- `PixelSample` defined in Task 1, consumed in Tasks 2-3 with the same `[t, x, y]` shape.
- `ContinentFrame` defined Task 2, consumed Task 3.
- `SliceTilePlacement` / `SliceDrawList` defined Task 3, consumed Tasks 4, 5, 7.
- `resolveTiles(tiles, options)` signature identical in Tasks 4 and 7.
- Channel names `'map-slice:paint'` / `'map-slice:result'` identical in Tasks 5 and 7.
- `mapSlicePng?: Uint8Array` on `logData` in Task 8 matches `mapSliceFor`'s return.
- Renderer→main PNG is `Uint8Array` throughout; `Buffer.from` conversions happen only in main (Tasks 7, 8), per the Global Constraints.
