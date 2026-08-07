# Replay High-Resolution Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharp replay map art at every zoom — screen-aware tile fetching up to native z7, plus AI-upscaled z8/z9 tiles hosted on GitHub Pages — and the commander tag icon rendered above all other member icons.

**Architecture:** All new tile logic is pure functions in `src/shared/wvwTiles.ts` (zoom picking, visible-rect culling, layered tile lists with a tile budget), unit-tested without DOM. `ReplayView.tsx` becomes thin plumbing: it tracks panel CSS size with a ResizeObserver and maps `getTileLayers()` output to `<image>` elements. A one-time Node script generates the z8/z9 pack with Real-ESRGAN; a public `axibridge-map-tiles` repo serves it via GitHub Pages. The web report re-exports the same component, so it inherits everything.

**Tech Stack:** TypeScript, React 18, vitest, sharp (devDependency, script-only), realesrgan-ncnn-vulkan (external binary, one-time), gh CLI + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-06-replay-hires-maps-design.md` (approved, incl. addendum for commander tag z-order).

## Global Constraints

- Run vitest with limited parallelism: `npx vitest run <files> --maxWorkers=2` (machine-wide memory rule).
- `npm run lint` must pass with **zero warnings**; `npm run typecheck` must pass.
- Work on branch `replay-hires-maps` (already created; spec is committed there).
- Constants, verbatim: `HIRES_TILE_BASE = 'https://darkharasho.github.io/axibridge-map-tiles'`, `MAX_HIRES_ZOOM = 9`, `TILE_BUDGET = 140`, official base `https://tiles.guildwars2.com`, continent 2, floor 3.
- No new runtime dependencies. `sharp` is devDependency-only (generation script).
- Commit messages: conventional style used in this repo (`feat: …`, `docs: …`, `chore: …`), one commit per task step where the task says so.
- WvW region reference data (already in `src/shared/wvwTiles.ts`, do not change values):
  | map | continentRect | pixelSize |
  |---|---|---|
  | EternalBattlegrounds | [[8958, 12798], [12030, 15870]] | [716, 750] |
  | GreenBorderlands | [[5630, 11518], [8190, 15102]] | [523, 750] |
  | BlueBorderlands | [[12798, 10878], [15358, 14462]] | [523, 750] |
  | RedBorderlands | [[9214, 8958], [12286, 12030]] | [750, 750] |
- Derived tile counts used in tests and dry-run checks (tile index range at zoom z is `floor(c1 / span)` … `floor((c2 − 1) / span)` with `span = 256·2^(7−z)`):
  - EBG: z5 = 4×4 = 16, z7 = 13×13 = 169, z8 = 25×25 = 625, z9 = 49×49 = 2401
  - Green/Blue (each): z7 = 11×15 = 165, z8 = 21×29 = 609, z9 = 41×57 = 2337
  - Red: z7 = 13×13 = 169, z8 = 25×25 = 625, z9 = 49×49 = 2401

---

### Task 1: `pickTileZoom` — screen-aware zoom selection

**Files:**
- Modify: `src/shared/wvwTiles.ts` (append)
- Test: `src/shared/__tests__/wvwTiles.test.ts` (new file)

**Interfaces:**
- Consumes: existing `WVW_TILE_DATA`, `MAX_TILE_ZOOM`, `WvwMap` (from `./wvwLandmarks`).
- Produces: `export const MAX_HIRES_ZOOM = 9` and `export function pickTileZoom(map: WvwMap, mapWidth: number, panelCssWidth: number, viewportScale: number, dpr: number): number`. Task 4 and ReplayView rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/__tests__/wvwTiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_HIRES_ZOOM, pickTileZoom } from '../wvwTiles';
import { WvwMap } from '../wvwLandmarks';

// EBG: continentRect width 3072 units rendered into 716 map units
// → native (z7) density ≈ 4.2905 art px per map unit.
const EBG = WvwMap.EternalBattlegrounds;
const MAP_W = 716;

describe('pickTileZoom', () => {
    it('matches the legacy default for a 1:1 panel at scale 1, dpr 1', () => {
        expect(pickTileZoom(EBG, MAP_W, 716, 1, 1)).toBe(5);
    });

    it('accounts for panel size (2× panel → one level up)', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 1, 1)).toBe(6);
    });

    it('accounts for devicePixelRatio', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 1, 2)).toBe(7);
    });

    it('reaches hi-res zooms at the default viewport scale of 3', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 3, 1)).toBe(8);
        expect(pickTileZoom(EBG, MAP_W, 1432, 3, 2)).toBe(9);
    });

    it('rounds up: picks the exact zoom when density matches exactly', () => {
        const nativeDensity = 3072 / MAP_W;
        // needed = 2× native → exactly z8
        expect(pickTileZoom(EBG, MAP_W, MAP_W, nativeDensity * 2, 1)).toBe(8);
    });

    it('clamps to MAX_HIRES_ZOOM at extreme zoom', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 50, 2)).toBe(MAX_HIRES_ZOOM);
    });

    it('clamps to 3 for tiny panels', () => {
        expect(pickTileZoom(EBG, MAP_W, 10, 1, 1)).toBe(3);
    });

    it('falls back to a 1:1 panel assumption when panel width is 0 (pre-layout)', () => {
        expect(pickTileZoom(EBG, MAP_W, 0, 1, 1)).toBe(5);
    });

    it('treats non-positive dpr as 1', () => {
        expect(pickTileZoom(EBG, MAP_W, 716, 1, 0)).toBe(5);
    });

    it('returns 5 for a map without tile data', () => {
        expect(pickTileZoom('Nope' as unknown as WvwMap, MAP_W, 1432, 3, 2)).toBe(5);
    });

    it('MAX_HIRES_ZOOM is 9 (ship gate in the hosting task may lower to 8)', () => {
        expect(MAX_HIRES_ZOOM).toBe(9);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: FAIL — `pickTileZoom`/`MAX_HIRES_ZOOM` are not exported.

- [ ] **Step 3: Implement**

Append to `src/shared/wvwTiles.ts`:

```ts
export const MAX_HIRES_ZOOM = 9;

/**
 * Pick the lowest tile zoom whose art density meets what the screen shows,
 * rounding UP (never a full level blurrier than needed).
 *
 * needed density  = (panelCssWidth / mapWidth) × viewportScale × dpr
 *                   (device px per map unit)
 * available at z  = (continentRectWidth / mapWidth) × 2^(z − MAX_TILE_ZOOM)
 */
export function pickTileZoom(
    map: WvwMap,
    mapWidth: number,
    panelCssWidth: number,
    viewportScale: number,
    dpr: number,
): number {
    const data = WVW_TILE_DATA[map];
    if (!data) return 5;
    const [[cx1], [cx2]] = data.continentRect;
    const nativeDensity = (cx2 - cx1) / mapWidth;
    // Panel width is 0 on the first render before layout; assume 1 CSS px
    // per map unit so the choice degrades to scale × dpr alone.
    const panelW = panelCssWidth > 0 ? panelCssWidth : mapWidth;
    const needed = (panelW / mapWidth) * viewportScale * (dpr > 0 ? dpr : 1);
    const zoom = MAX_TILE_ZOOM + Math.ceil(Math.log2(needed / nativeDensity));
    return Math.min(MAX_HIRES_ZOOM, Math.max(3, zoom));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwTiles.ts src/shared/__tests__/wvwTiles.test.ts
git commit -m "feat: screen-aware replay tile zoom selection (pickTileZoom)"
```

---

### Task 2: `visibleMapRect` — viewport → map-space rect

**Files:**
- Modify: `src/shared/wvwTiles.ts` (append)
- Test: `src/shared/__tests__/wvwTiles.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export interface TileViewportState { scale: number; tx: number; ty: number }`, `export interface MapRect { x: number; y: number; width: number; height: number }`, `export function visibleMapRect(panelWidth: number, panelHeight: number, mapWidth: number, mapHeight: number, viewport: TileViewportState): MapRect`. Tasks 3–4 use these exact names.

The math must mirror `screenToSvg` in `src/renderer/stats/map/hooks/useReplayViewport.ts:56` — the SVG uses `preserveAspectRatio="xMidYMid slice"` (uniform scale to FILL, centered), then the pan/zoom group maps map coords `m` to viewBox coords `v = m·scale + t`.

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/__tests__/wvwTiles.test.ts`:

```ts
import { visibleMapRect } from '../wvwTiles';

describe('visibleMapRect', () => {
    it('is the full map for a same-size panel at identity viewport', () => {
        expect(visibleMapRect(700, 700, 700, 700, { scale: 1, tx: 0, ty: 0 }))
            .toEqual({ x: 0, y: 0, width: 700, height: 700 });
    });

    it('accounts for slice cropping on a wide panel (vertical crop, centered)', () => {
        // rs = max(1400/700, 700/700) = 2 → rendered 1400×1400, panel shows
        // the middle 700 px vertically → viewBox y 175..525, x full.
        expect(visibleMapRect(1400, 700, 700, 700, { scale: 1, tx: 0, ty: 0 }))
            .toEqual({ x: 0, y: 175, width: 700, height: 350 });
    });

    it('inverts the pan/zoom transform', () => {
        // scale 2 centered on the map center: v = m·2 − 350 → m = (v+350)/2.
        expect(visibleMapRect(700, 700, 700, 700, { scale: 2, tx: -350, ty: -350 }))
            .toEqual({ x: 175, y: 175, width: 350, height: 350 });
    });

    it('returns the full map when the panel has no size yet', () => {
        expect(visibleMapRect(0, 0, 716, 750, { scale: 3, tx: 0, ty: 0 }))
            .toEqual({ x: 0, y: 0, width: 716, height: 750 });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: FAIL — `visibleMapRect` not exported.

- [ ] **Step 3: Implement**

Append to `src/shared/wvwTiles.ts`:

```ts
export interface TileViewportState { scale: number; tx: number; ty: number; }
export interface MapRect { x: number; y: number; width: number; height: number; }

/**
 * The map-unit rect currently visible in the panel, inverting both the
 * preserveAspectRatio="xMidYMid slice" fit and the pan/zoom group transform
 * (mirrors screenToSvg in useReplayViewport).
 */
export function visibleMapRect(
    panelWidth: number,
    panelHeight: number,
    mapWidth: number,
    mapHeight: number,
    viewport: TileViewportState,
): MapRect {
    if (!(panelWidth > 0) || !(panelHeight > 0)) {
        return { x: 0, y: 0, width: mapWidth, height: mapHeight };
    }
    const rs = Math.max(panelWidth / mapWidth, panelHeight / mapHeight);
    const ox = (panelWidth - mapWidth * rs) / 2;
    const oy = (panelHeight - mapHeight * rs) / 2;
    const vx0 = (0 - ox) / rs;
    const vy0 = (0 - oy) / rs;
    const vx1 = (panelWidth - ox) / rs;
    const vy1 = (panelHeight - oy) / rs;
    const { scale, tx, ty } = viewport;
    return {
        x: (vx0 - tx) / scale,
        y: (vy0 - ty) / scale,
        width: (vx1 - vx0) / scale,
        height: (vy1 - vy0) / scale,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwTiles.ts src/shared/__tests__/wvwTiles.test.ts
git commit -m "feat: visibleMapRect viewport inversion for tile culling"
```

---

### Task 3: `getMapTiles` — hi-res URL routing + visible-rect culling

**Files:**
- Modify: `src/shared/wvwTiles.ts` (edit `getMapTiles`, add constant)
- Test: `src/shared/__tests__/wvwTiles.test.ts` (append)

**Interfaces:**
- Consumes: `MapRect` from Task 2.
- Produces: `export const HIRES_TILE_BASE = 'https://darkharasho.github.io/axibridge-map-tiles'`; `getMapTiles` gains a 5th optional param: `getMapTiles(map, tileZoom, renderWidth?, renderHeight?, visibleRect?: MapRect)`. Existing callers (4-arg) must behave identically. z ≤ 7 URLs stay on `tiles.guildwars2.com`; z ≥ 8 use `HIRES_TILE_BASE`. Culling keeps tiles intersecting `visibleRect` expanded by one tile on all sides.

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/__tests__/wvwTiles.test.ts` (add `getMapTiles`, `HIRES_TILE_BASE`, and type `MapRect` to the wvwTiles import):

```ts
describe('getMapTiles — URL routing and culling', () => {
    it('returns the full EBG grid without a visible rect (unchanged behavior)', () => {
        expect(getMapTiles(EBG, 7, 716, 750)).toHaveLength(169);
        expect(getMapTiles(EBG, 5, 716, 750)).toHaveLength(16);
    });

    it('routes z ≤ 7 to the official service and z ≥ 8 to the hi-res host', () => {
        const z7 = getMapTiles(EBG, 7, 716, 750);
        expect(z7[0].url).toBe('https://tiles.guildwars2.com/2/3/7/34/49.jpg');
        const z8 = getMapTiles(EBG, 8, 716, 750);
        expect(z8).toHaveLength(625);
        expect(z8[0].url).toBe(`${HIRES_TILE_BASE}/2/3/8/69/99.jpg`);
        const z9 = getMapTiles(EBG, 9, 716, 750);
        expect(z9).toHaveLength(2401);
        expect(z9[0].url).toBe(`${HIRES_TILE_BASE}/2/3/9/139/199.jpg`);
    });

    it('culls to the visible rect plus a one-tile margin', () => {
        const rect: MapRect = { x: 330, y: 350, width: 60, height: 60 };
        const tiles = getMapTiles(EBG, 7, 716, 750, rect);
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.length).toBeLessThan(169);
        // Every returned tile overlaps the expanded rect (margin = 1 tile).
        const tw = tiles[0].width, th = tiles[0].height;
        for (const t of tiles) {
            expect(t.x + t.width).toBeGreaterThanOrEqual(rect.x - tw);
            expect(t.x).toBeLessThanOrEqual(rect.x + rect.width + tw);
            expect(t.y + t.height).toBeGreaterThanOrEqual(rect.y - th);
            expect(t.y).toBeLessThanOrEqual(rect.y + rect.height + th);
        }
        // The rect itself is fully covered: each corner falls inside a tile.
        for (const [px, py] of [
            [rect.x, rect.y], [rect.x + rect.width, rect.y],
            [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
        ] as const) {
            expect(tiles.some(t =>
                px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height
            )).toBe(true);
        }
    });

    it('an off-map rect yields no tiles beyond the margin ring', () => {
        const tiles = getMapTiles(EBG, 7, 716, 750, { x: -5000, y: -5000, width: 10, height: 10 });
        expect(tiles).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: FAIL — `HIRES_TILE_BASE` not exported, culling param not accepted (extra arg is ignored by TS? No — TS errors on arity; vitest will fail to compile the test file, which counts as the failing state).

- [ ] **Step 3: Implement**

In `src/shared/wvwTiles.ts`: add the constant near the top-of-file constants, then rework the `getMapTiles` loop (hoist `tileW`/`tileH`, add routing + culling):

```ts
export const HIRES_TILE_BASE = 'https://darkharasho.github.io/axibridge-map-tiles';
```

Replace the body of `getMapTiles` from `const tileSpan = …` down to the final `return tiles;` with:

```ts
    const tileSpan = TILE_SIZE * Math.pow(2, MAX_TILE_ZOOM - tileZoom);

    const txMin = Math.floor(cx1 / tileSpan);
    const tyMin = Math.floor(cy1 / tileSpan);
    const txMax = Math.floor((cx2 - 1) / tileSpan);
    const tyMax = Math.floor((cy2 - 1) / tileSpan);

    const tileW = tileSpan / cw * pw;
    const tileH = tileSpan / ch * ph;
    // Synthetic zooms (> MAX_TILE_ZOOM) come from the AxiBridge hi-res pack.
    const base = tileZoom > MAX_TILE_ZOOM ? HIRES_TILE_BASE : 'https://tiles.guildwars2.com';
    // Culling bounds: visible rect expanded by one tile on all sides.
    const bounds = visibleRect ? {
        x0: visibleRect.x - tileW,
        y0: visibleRect.y - tileH,
        x1: visibleRect.x + visibleRect.width + tileW,
        y1: visibleRect.y + visibleRect.height + tileH,
    } : null;

    const tiles: TileInfo[] = [];
    for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
            const px = (tx * tileSpan - cx1) / cw * pw + ox;
            const py = (ty * tileSpan - cy1) / ch * ph + oy;
            if (bounds && (px + tileW < bounds.x0 || px > bounds.x1 || py + tileH < bounds.y0 || py > bounds.y1)) continue;
            tiles.push({ url: `${base}/${CONTINENT_ID}/${FLOOR_ID}/${tileZoom}/${tx}/${ty}.jpg`, x: px, y: py, width: tileW, height: tileH });
        }
    }

    return tiles;
```

And extend the signature:

```ts
export function getMapTiles(map: WvwMap, tileZoom: number, renderWidth?: number, renderHeight?: number, visibleRect?: MapRect): TileInfo[] {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: PASS. Also run `npm run typecheck` — existing 4-arg callers still compile.

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwTiles.ts src/shared/__tests__/wvwTiles.test.ts
git commit -m "feat: hi-res tile URL routing and visible-rect culling in getMapTiles"
```

---

### Task 4: `getTileLayers` — layered, tile-budgeted tile lists

**Files:**
- Modify: `src/shared/wvwTiles.ts` (append)
- Test: `src/shared/__tests__/wvwTiles.test.ts` (append)

**Interfaces:**
- Consumes: `pickTileZoom` (T1), `visibleMapRect` (T2), culling `getMapTiles` (T3), existing `hasTileData`, `MAX_TILE_ZOOM`.
- Produces: `export const TILE_BUDGET = 140`, `export interface TileLayer { zoom: number; tiles: TileInfo[] }`, `export function getTileLayers(map: WvwMap, mapWidth: number, mapHeight: number, viewport: TileViewportState, panelWidth: number, panelHeight: number, dpr: number): TileLayer[]`. Task 5 renders exactly this.

Layer rules (spec §2): full-extent coverage at `min(chosen, 5)`; culled z7 underlay only when the final detail zoom is ≥ 8 (silent fallback for missing hi-res tiles); culled detail layer when the final detail zoom is > 5. Budget rule: while the culled detail tile count exceeds `TILE_BUDGET` and detail zoom > 6, step the detail zoom down and re-cull.

- [ ] **Step 1: Write the failing tests**

Append (add `getTileLayers`, `TILE_BUDGET` to imports):

```ts
describe('getTileLayers', () => {
    const identity = { scale: 1, tx: 0, ty: 0 };

    it('returns [] for a map without tile data', () => {
        expect(getTileLayers('Nope' as unknown as WvwMap, 716, 750, identity, 1432, 1500, 1)).toEqual([]);
    });

    it('collapses to a single full-extent layer when the chosen zoom ≤ 5', () => {
        const layers = getTileLayers(EBG, 716, 750, identity, 716, 750, 1);
        expect(layers.map(l => l.zoom)).toEqual([5]);
        expect(layers[0].tiles).toHaveLength(16);
    });

    it('coverage + culled detail at a native zoom (no underlay)', () => {
        // panel 1432, dpr 1, scale 2 → chosen 7; half the map visible →
        // ~64 culled tiles, within budget.
        const layers = getTileLayers(EBG, 716, 750, { scale: 2, tx: 0, ty: 0 }, 1432, 1500, 1);
        expect(layers.map(l => l.zoom)).toEqual([5, 7]);
        expect(layers[0].tiles).toHaveLength(16);
        expect(layers[1].tiles.length).toBeLessThanOrEqual(TILE_BUDGET);
    });

    it('budget steps down when the whole map is visible (scale 1, hidpi)', () => {
        // chosen 7, but the full 169-tile z7 grid exceeds TILE_BUDGET → z6.
        const layers = getTileLayers(EBG, 716, 750, identity, 1432, 1500, 2);
        expect(layers.map(l => l.zoom)).toEqual([5, 6]);
    });

    it('budget steps a wide z9 view down to z8 (default scale 3, hidpi)', () => {
        // chosen would be 9 (Task 1 case) but ~most of the map is visible →
        // z9 needs ~300 culled tiles > TILE_BUDGET → steps down to 8.
        const layers = getTileLayers(EBG, 716, 750, { scale: 3, tx: 0, ty: 0 }, 1432, 1500, 2);
        expect(layers.map(l => l.zoom)).toEqual([5, 7, 8]);
        for (const l of layers.slice(1)) expect(l.tiles.length).toBeLessThanOrEqual(TILE_BUDGET);
    });

    it('deep zoom keeps z9 (small visible area fits the budget) with z7 underlay', () => {
        const layers = getTileLayers(EBG, 716, 750, { scale: 10, tx: -3000, ty: -3200 }, 1432, 1500, 2);
        expect(layers.map(l => l.zoom)).toEqual([5, 7, 9]);
        for (const l of layers.slice(1)) expect(l.tiles.length).toBeLessThanOrEqual(TILE_BUDGET);
    });

    it('hi-res detail tiles come from the hi-res host, underlay from the official host', () => {
        const layers = getTileLayers(EBG, 716, 750, { scale: 10, tx: -3000, ty: -3200 }, 1432, 1500, 2);
        const underlay = layers.find(l => l.zoom === 7)!;
        const detail = layers.find(l => l.zoom === 9)!;
        expect(underlay.tiles[0].url).toContain('tiles.guildwars2.com');
        expect(detail.tiles[0].url).toContain(HIRES_TILE_BASE);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: FAIL — `getTileLayers`/`TILE_BUDGET` not exported.

- [ ] **Step 3: Implement**

Append to `src/shared/wvwTiles.ts`:

```ts
// Cap on culled tiles per layer: keeps a wide view from fetching hundreds of
// z9 tiles (~7 MB) when z8 is visually near-identical at that density.
export const TILE_BUDGET = 140;

export interface TileLayer { zoom: number; tiles: TileInfo[]; }

/**
 * Tile layers for the replay map, bottom to top:
 *  1. full-extent coverage at min(chosen, 5) — the map is never blank
 *  2. culled z7 official underlay when detail ≥ 8 — silent hi-res fallback
 *  3. culled detail layer at the (budgeted) chosen zoom when > 5
 */
export function getTileLayers(
    map: WvwMap,
    mapWidth: number,
    mapHeight: number,
    viewport: TileViewportState,
    panelWidth: number,
    panelHeight: number,
    dpr: number,
): TileLayer[] {
    if (!hasTileData(map)) return [];
    const rect = visibleMapRect(panelWidth, panelHeight, mapWidth, mapHeight, viewport);
    let detailZoom = pickTileZoom(map, mapWidth, panelWidth, viewport.scale, dpr);
    let detailTiles: TileInfo[] = [];
    if (detailZoom > 5) {
        detailTiles = getMapTiles(map, detailZoom, mapWidth, mapHeight, rect);
        while (detailZoom > 6 && detailTiles.length > TILE_BUDGET) {
            detailZoom--;
            detailTiles = getMapTiles(map, detailZoom, mapWidth, mapHeight, rect);
        }
    }
    const coverageZoom = Math.min(detailZoom, 5);
    const layers: TileLayer[] = [
        { zoom: coverageZoom, tiles: getMapTiles(map, coverageZoom, mapWidth, mapHeight) },
    ];
    if (detailZoom >= 8) {
        layers.push({ zoom: MAX_TILE_ZOOM, tiles: getMapTiles(map, MAX_TILE_ZOOM, mapWidth, mapHeight, rect) });
    }
    if (detailZoom > 5) {
        layers.push({ zoom: detailZoom, tiles: detailTiles });
    }
    return layers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: PASS (all wvwTiles suites).

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwTiles.ts src/shared/__tests__/wvwTiles.test.ts
git commit -m "feat: layered tile-budgeted getTileLayers for replay map"
```

---

### Task 5: ReplayView integration — panel tracking + layered rendering

**Files:**
- Modify: `src/renderer/stats/map/ReplayView.tsx` (imports; add panel-size state; replace the tile render block at ~line 339–347)

**Interfaces:**
- Consumes: `getTileLayers` (T4), existing `hasTileData`. The viewport object from `useReplayViewport` already has `scale`, `tx`, `ty` — structurally satisfies `TileViewportState`.
- Produces: no new exports. New logic stays in shared pure functions (fully covered by T1–T4 tests); this task is thin plumbing, verified by the existing suite + typecheck + a manual dev-app check.

- [ ] **Step 1: Update the import**

In `ReplayView.tsx` line 4, replace:

```ts
import { getMapTiles, hasTileData } from '../../../shared/wvwTiles';
```

with:

```ts
import { getTileLayers, hasTileData } from '../../../shared/wvwTiles';
```

- [ ] **Step 2: Track panel CSS size**

Next to the existing state hooks (after the `centeredOnFollow` state around line 89), add:

```tsx
    // Panel CSS size feeds screen-aware tile zoom + culling. The container
    // div only mounts once a fight is selected, so the effect depends on
    // selectedFight to (re)attach then; re-observed on fullscreen toggle
    // because the portal remounts the container node.
    const [panelSize, setPanelSize] = useState<[number, number]>([0, 0]);
    useEffect(() => {
        if (!selectedFight) return;
        const el = mapContainerRef.current;
        if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setPanelSize(prev => prev[0] === rect.width && prev[1] === rect.height ? prev : [rect.width, rect.height]);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fullscreen, selectedFight]);
```

(Amended 2026-08-06 after task review: the original `[fullscreen]`-only
dependency never re-attached when the container mounted after default-fight
selection, stranding `panelSize` at `[0,0]` on the mainline path — human
ruled to fix. The block must be placed AFTER the `const selectedFight =
useMovementData(...)` declaration — e.g. directly after the
`useReplayViewport` call — or the inline dependency array hits the TDZ. The
test setup already mocks `ResizeObserver` — `src/renderer/test/setup.ts:71`.)

- [ ] **Step 3: Replace the tile render block**

Replace lines ~340–347 (`{selectedFight.mapKey && hasTileData(...)` through the `mapImageUrl` fallback) with:

```tsx
                                    {selectedFight.mapKey && hasTileData(selectedFight.mapKey)
                                        ? getTileLayers(selectedFight.mapKey, mapWidth, mapHeight, viewport, panelSize[0], panelSize[1], (typeof window !== 'undefined' && window.devicePixelRatio) || 1).map(layer => (
                                            <g key={layer.zoom}>
                                                {layer.tiles.map(t => (
                                                    <image key={t.url} href={t.url} x={t.x} y={t.y} width={t.width} height={t.height} preserveAspectRatio="none" />
                                                ))}
                                            </g>
                                        ))
                                        : selectedFight.mapImageUrl && (
                                            <image href={selectedFight.mapImageUrl} x={0} y={0} width={mapWidth} height={mapHeight} />
                                        )
                                    }
```

Keying by `t.url` keeps already-loaded `<image>` nodes stable as culling shifts; layer zooms are unique by construction so cross-layer keys never collide.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass, zero warnings.

Run: `npx vitest run src/renderer/stats/map --maxWorkers=2`
Expected: all existing map tests PASS.

Manual (fast sanity, full sweep happens in Task 9): `npm run dev`, open a stats view with replay fights, confirm the map renders and zooming swaps in sharper tiles (network tab shows `tiles.guildwars2.com` z6/z7 requests at default view; z8/z9 requests will 404 until Task 8 — the z7 underlay must keep the map hole-free).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx
git commit -m "feat: layered screen-aware map tiles in ReplayView"
```

---

### Task 6: Commander tag renders above all other member icons

**Files:**
- Modify: `src/renderer/stats/map/replaySelectors.ts` (append)
- Modify: `src/renderer/stats/map/ReplayView.tsx` (member loop, ~line 369)
- Test: `src/renderer/stats/map/__tests__/replaySelectors.orderMembers.test.ts` (new file)

**Interfaces:**
- Consumes: nothing from earlier tasks (independent).
- Produces: `export function orderMembersForRender<T extends { isCommander?: boolean }>(members: T[]): T[]` in `replaySelectors.ts`.

SVG paints in document order, so rendering commanders last puts the tag icon above everyone else. Stable sort preserves all other relative ordering.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/replaySelectors.orderMembers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { orderMembersForRender } from '../replaySelectors';

describe('orderMembersForRender', () => {
    it('moves commanders to the end (SVG paint order = on top)', () => {
        const members = [
            { name: 'a', isCommander: false },
            { name: 'tag', isCommander: true },
            { name: 'b', isCommander: false },
        ];
        expect(orderMembersForRender(members).map(m => m.name)).toEqual(['a', 'b', 'tag']);
    });

    it('preserves relative order otherwise (stable)', () => {
        const members = [
            { name: 'e1' }, { name: 'tag1', isCommander: true },
            { name: 'e2' }, { name: 'tag2', isCommander: true }, { name: 'e3' },
        ];
        expect(orderMembersForRender(members).map(m => m.name))
            .toEqual(['e1', 'e2', 'e3', 'tag1', 'tag2']);
    });

    it('does not mutate the input array', () => {
        const members = [{ name: 'tag', isCommander: true }, { name: 'a' }];
        orderMembersForRender(members);
        expect(members[0].name).toBe('tag');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/replaySelectors.orderMembers.test.ts --maxWorkers=2`
Expected: FAIL — `orderMembersForRender` not exported.

- [ ] **Step 3: Implement**

Append to `src/renderer/stats/map/replaySelectors.ts`:

```ts
/** Stable-sort members so commanders render last — SVG paints in document
 *  order, so the tag icon ends up above every other member icon. */
export function orderMembersForRender<T extends { isCommander?: boolean }>(members: T[]): T[] {
    return [...members].sort((a, b) => Number(!!a.isCommander) - Number(!!b.isCommander));
}
```

In `ReplayView.tsx`, add `orderMembersForRender` to the existing `./replaySelectors` import (line 28) and wrap the member loop at ~line 369:

```tsx
{orderMembersForRender(selectedFight.movementData.members.filter(m => m.inSquad || m.isEnemy)).map(member => {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map --maxWorkers=2 && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/replaySelectors.ts src/renderer/stats/map/__tests__/replaySelectors.orderMembers.test.ts src/renderer/stats/map/ReplayView.tsx
git commit -m "feat: render commander tag above all other replay member icons"
```

---

### Task 7: Hi-res tile generation script

**Files:**
- Create: `scripts/generate-hires-tiles.mjs`
- Modify: `package.json` (script + sharp devDependency), `.gitignore` (add `tile-work/`)

**Interfaces:**
- Consumes: nothing from app code — region rects are duplicated as frozen calibration constants (documented pointer to `src/shared/wvwTiles.ts`; `.mjs` cannot import the TS module).
- Produces: CLI producing `tile-work/tiles/2/3/{8,9}/{x}/{y}.jpg` (+ `.nojekyll`, `README.md`), consumed by Task 8. Flags: `--map ebg|green|blue|red` (repeatable, default all), `--skip-z9`, `--skip-upscale` (stop after stitching, for inspection), `--dry-run`, `--work DIR` (default `tile-work`), `--binary PATH` (default `realesrgan-ncnn-vulkan`), `--model NAME` (default `realesrgan-x4plus`).

- [ ] **Step 1: Add sharp + wiring**

```bash
npm install -D sharp
```

In `package.json` scripts add: `"generate:hires-tiles": "node scripts/generate-hires-tiles.mjs"`.
In `.gitignore` add a line `tile-work/` (next to the other build-artifact entries around line 13).

- [ ] **Step 2: Write the script**

Create `scripts/generate-hires-tiles.mjs`:

```js
// Generates AxiBridge's hi-res replay tile pack (synthetic z8/z9) from the
// official GW2 tile service via Real-ESRGAN. One-time, run manually:
//   npm run generate:hires-tiles -- [--map ebg] [--skip-z9] [--dry-run]
// Requires realesrgan-ncnn-vulkan on PATH (or --binary /path/to/it):
//   https://github.com/xinntao/Real-ESRGAN/releases (ncnn-vulkan build)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Frozen calibration constants — keep in sync with WVW_TILE_DATA in
// src/shared/wvwTiles.ts (values never change; the map art is static).
const REGIONS = {
    ebg:   { name: 'EternalBattlegrounds', rect: [[8958, 12798], [12030, 15870]] },
    green: { name: 'GreenBorderlands',     rect: [[5630, 11518], [8190, 15102]] },
    blue:  { name: 'BlueBorderlands',      rect: [[12798, 10878], [15358, 14462]] },
    red:   { name: 'RedBorderlands',       rect: [[9214, 8958], [12286, 12030]] },
};
const OFFICIAL = 'https://tiles.guildwars2.com/2/3';
const TILE = 256;
const JPEG_QUALITY = 85;

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const mapKeys = args.flatMap((a, i) => a === '--map' ? [args[i + 1]] : []);
const targets = mapKeys.length ? mapKeys : Object.keys(REGIONS);
const WORK = opt('--work', 'tile-work');
const BINARY = opt('--binary', 'realesrgan-ncnn-vulkan');
const MODEL = opt('--model', 'realesrgan-x4plus');
const OUT = path.join(WORK, 'tiles');

/** Inclusive tile index range covering [c1, c2) at the given span. */
const range = (c1, c2, span) => ({ min: Math.floor(c1 / span), max: Math.floor((c2 - 1) / span) });

function planRegion(key) {
    const [[cx1, cy1], [cx2, cy2]] = REGIONS[key].rect;
    const z7x = range(cx1, cx2, 256), z7y = range(cy1, cy2, 256);
    const z8x = range(cx1, cx2, 128), z8y = range(cy1, cy2, 128);
    const z9x = range(cx1, cx2, 64),  z9y = range(cy1, cy2, 64);
    const count = r => (r.x.max - r.x.min + 1) * (r.y.max - r.y.min + 1);
    return { key, z7x, z7y, z8x, z8y, z9x, z9y,
        cols: z7x.max - z7x.min + 1, rows: z7y.max - z7y.min + 1,
        counts: { z7: count({ x: z7x, y: z7y }), z8: count({ x: z8x, y: z8y }), z9: count({ x: z9x, y: z9y }) } };
}

async function download(plan) {
    const dir = path.join(WORK, 'z7', plan.key);
    mkdirSync(dir, { recursive: true });
    const jobs = [];
    for (let ty = plan.z7y.min; ty <= plan.z7y.max; ty++)
        for (let tx = plan.z7x.min; tx <= plan.z7x.max; tx++)
            jobs.push({ tx, ty, file: path.join(dir, `${tx}_${ty}.jpg`) });
    let done = 0;
    const workers = Array.from({ length: 6 }, async () => {
        while (jobs.length) {
            const j = jobs.shift();
            if (!existsSync(j.file)) {
                const res = await fetch(`${OFFICIAL}/7/${j.tx}/${j.ty}.jpg`);
                if (!res.ok) throw new Error(`z7 ${j.tx}/${j.ty}: HTTP ${res.status}`);
                writeFileSync(`${j.file}.tmp`, Buffer.from(await res.arrayBuffer()));
                renameSync(`${j.file}.tmp`, j.file);
                await new Promise(r => setTimeout(r, 100));
            }
            if (++done % 50 === 0) console.log(`  ${plan.key}: ${done} z7 tiles`);
        }
    });
    await Promise.all(workers);
    return dir;
}

async function stitch(plan, dir) {
    const file = path.join(WORK, 'stitched', `${plan.key}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    if (existsSync(file)) return file;
    const composites = [];
    for (let ty = plan.z7y.min; ty <= plan.z7y.max; ty++)
        for (let tx = plan.z7x.min; tx <= plan.z7x.max; tx++)
            composites.push({ input: path.join(dir, `${tx}_${ty}.jpg`), left: (tx - plan.z7x.min) * TILE, top: (ty - plan.z7y.min) * TILE });
    // Temp + rename so an interrupted run can't leave a partial file that a
    // resume treats as complete (applies to every writer in this script).
    await sharp({ create: { width: plan.cols * TILE, height: plan.rows * TILE, channels: 3, background: '#000' }, limitInputPixels: false })
        .composite(composites).png().toFile(`${file}.tmp`);
    renameSync(`${file}.tmp`, file);
    return file;
}

function upscale2x(src, dst) {
    if (existsSync(dst)) return dst;
    mkdirSync(path.dirname(dst), { recursive: true });
    console.log(`  upscaling ${src} → ${dst} (this can take a while)`);
    // .tmp.png (not .png.tmp): the binary infers output format from extension.
    execFileSync(BINARY, ['-i', src, '-o', `${dst}.tmp.png`, '-s', '2', '-n', MODEL], { stdio: 'inherit' });
    renameSync(`${dst}.tmp.png`, dst);
    return dst;
}

async function slice(plan, image, zoom, unitPx) {
    // unitPx: image px per continent unit (2 for the 2× image, 4 for 4×).
    // One horizontal band per tile row — a single decode of the big image
    // per row instead of one per tile (the 4× image is ~13k×13k px).
    const span = 256 / (2 ** (zoom - 7));           // continent units per tile
    const originX = plan.z7x.min * 256, originY = plan.z7y.min * 256;
    const zx = zoom === 8 ? plan.z8x : plan.z9x;
    const zy = zoom === 8 ? plan.z8y : plan.z9y;
    for (let ty = zy.min; ty <= zy.max; ty++) {
        const { data, info } = await sharp(image, { limitInputPixels: false })
            .extract({ left: 0, top: (ty * span - originY) * unitPx, width: plan.cols * TILE * unitPx, height: TILE })
            .raw().toBuffer({ resolveWithObject: true });
        for (let tx = zx.min; tx <= zx.max; tx++) {
            const dir = path.join(OUT, '2', '3', String(zoom), String(tx));
            mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${ty}.jpg`);
            if (existsSync(file)) continue;
            await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
                .extract({ left: (tx * span - originX) * unitPx, top: 0, width: TILE, height: TILE })
                .jpeg({ quality: JPEG_QUALITY }).toFile(`${file}.tmp`);
            renameSync(`${file}.tmp`, file);
        }
        const row = ty - zy.min + 1;
        if (row % 8 === 0) console.log(`  ${plan.key} z${zoom}: row ${row}/${zy.max - zy.min + 1}`);
    }
}

const plans = targets.map(planRegion);
for (const p of plans) console.log(`${p.key}: z7 ${p.counts.z7} downloads → z8 ${p.counts.z8} tiles${flag('--skip-z9') ? '' : ` + z9 ${p.counts.z9} tiles`}`);
if (flag('--dry-run')) process.exit(0);

try { execFileSync(BINARY, ['-h'], { stdio: 'ignore' }); } catch {
    if (!flag('--skip-upscale')) {
        console.error(`Cannot run '${BINARY}'. Install realesrgan-ncnn-vulkan from`);
        console.error('https://github.com/xinntao/Real-ESRGAN/releases and put it on PATH (or pass --binary).');
        process.exit(1);
    }
}

for (const plan of plans) {
    console.log(`\n=== ${plan.key} ===`);
    const dir = await download(plan);
    const stitched = await stitch(plan, dir);
    if (flag('--skip-upscale')) continue;
    const up2 = upscale2x(stitched, path.join(WORK, 'up2', `${plan.key}.png`));
    await slice(plan, up2, 8, 2);
    if (!flag('--skip-z9')) {
        const up4 = upscale2x(up2, path.join(WORK, 'up4', `${plan.key}.png`));
        await slice(plan, up4, 9, 4);
    }
}
if (!flag('--skip-upscale')) {
    writeFileSync(path.join(OUT, '.nojekyll'), '');
    writeFileSync(path.join(OUT, 'README.md'),
        '# AxiBridge hi-res WvW map tiles\n\nAI-upscaled (Real-ESRGAN) derivatives of Guild Wars 2 map tiles for the AxiBridge fight replay. Non-commercial fan content under the ArenaNet Content Terms of Use. © ArenaNet / NCSOFT.\n');
}
console.log('\ndone');
```

(Amended 2026-08-06 after task review — human ruled to fix: every writer
(z7 download, stitch, upscale, slice) writes to a temp path and renames into
place, so an interrupted run cannot leave truncated files that a resume
treats as complete. The upscaler's temp is `.tmp.png` because the binary
infers output format from the extension; the sharp writers set their format
explicitly so a bare `.tmp` suffix is safe there.)

- [ ] **Step 3: Verify with dry-run (no network, no GPU)**

Run: `node scripts/generate-hires-tiles.mjs --dry-run`
Expected output (exact counts):
```
ebg: z7 169 downloads → z8 625 tiles + z9 2401 tiles
green: z7 165 downloads → z8 609 tiles + z9 2337 tiles
blue: z7 165 downloads → z8 609 tiles + z9 2337 tiles
red: z7 169 downloads → z8 625 tiles + z9 2401 tiles
```

Run: `node scripts/generate-hires-tiles.mjs --map ebg --skip-upscale`
Expected: downloads 169 tiles into `tile-work/z7/ebg/`, writes `tile-work/stitched/ebg.png` (3328×3328). Open it and confirm it looks like assembled EBG with no gaps or misordered tiles.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-hires-tiles.mjs package.json package-lock.json .gitignore
git commit -m "feat: hi-res tile pack generation script (Real-ESRGAN z8/z9)"
```

---

### Task 8: Generate the pack, publish `axibridge-map-tiles`, verify

This task runs on the user's machine (GPU + gh auth). It is operational, not code — no TDD cycle.

**Files:** none in this repo (new external repo `darkharasho/axibridge-map-tiles`).

**Interfaces:**
- Consumes: Task 7 script output.
- Produces: live tiles at `https://darkharasho.github.io/axibridge-map-tiles/2/3/{8,9}/{x}/{y}.jpg` — the URL `HIRES_TILE_BASE` (Task 3) already points at. **Quality ship gate for z9 lives here.**

- [ ] **Step 1: Ensure the upscaler binary exists**

`command -v realesrgan-ncnn-vulkan` — if missing: download `realesrgan-ncnn-vulkan-20220424-ubuntu.zip` from https://github.com/xinntao/Real-ESRGAN/releases, unzip to `~/.local/opt/realesrgan/`, `chmod +x` the binary, and either symlink it into `~/.local/bin/` (models dir must sit next to the binary — symlink, don't copy) or pass `--binary ~/.local/opt/realesrgan/realesrgan-ncnn-vulkan`.

- [ ] **Step 2: Generate (per-map to keep runs resumable)**

```bash
npm run generate:hires-tiles -- --map ebg
npm run generate:hires-tiles -- --map green
npm run generate:hires-tiles -- --map blue
npm run generate:hires-tiles -- --map red
```
Everything is cached/idempotent — re-running skips existing files.

- [ ] **Step 3: z9 quality ship gate (decision on pixels)**

Crop matching regions (Stonemist Castle area) from the z8 and z9 output and view at 1:1:
```bash
magick tile-work/tiles/2/3/8/81/111.jpg -scale 512x512 /tmp/gate-z8.png
magick montage tile-work/tiles/2/3/9/162/222.jpg tile-work/tiles/2/3/9/163/222.jpg tile-work/tiles/2/3/9/162/223.jpg tile-work/tiles/2/3/9/163/223.jpg -tile 2x2 -geometry +0+0 /tmp/gate-z9.png
```
Compare `/tmp/gate-z8.png` vs `/tmp/gate-z9.png` (same map area, same on-screen size). **Gate:** if z9 shows smearing/hallucinated texture worse than z8-upscaled, do NOT publish z9 and set `MAX_HIRES_ZOOM = 8` in `src/shared/wvwTiles.ts` (update the `MAX_HIRES_ZOOM is 9` test assertion + the Task 4 expectations that name zoom 9 accordingly, run the wvwTiles suite, commit `feat: clamp hi-res tiles to z8 after quality gate`).

- [ ] **Step 4: Publish**

```bash
gh repo create axibridge-map-tiles --public --description "AI-upscaled WvW map tiles for AxiBridge fight replays"
cd tile-work/tiles
git init -b main && git add -A && git commit -m "tile pack v1"
git remote add origin https://github.com/darkharasho/axibridge-map-tiles.git
git push -u origin main
gh api -X POST repos/darkharasho/axibridge-map-tiles/pages -f 'source[branch]=main' -f 'source[path]=/'
```
(HTTPS remote on purpose — 1Password SSH agent stalls pushes on this machine.)

- [ ] **Step 5: Verify live URLs**

Poll until Pages deploys (a few minutes), then:
```bash
curl -sI https://darkharasho.github.io/axibridge-map-tiles/2/3/8/69/99.jpg | head -1
curl -sI https://darkharasho.github.io/axibridge-map-tiles/2/3/9/139/199.jpg | head -1
```
Expected: `HTTP/2 200` for z8 (and z9 if published).

---

### Task 9: End-to-end QA sweep

**Files:** none (verification only).

- [ ] **Step 1: Full validation + unit suite**

```bash
npm run validate
npx vitest run --maxWorkers=2
```
Expected: typecheck + lint clean, all unit tests pass.

- [ ] **Step 2: Manual zoom sweep (desktop app)**

`npm run dev`, open a report with EBG replay fights:
- Default view (scale 3): map noticeably sharper than before; network tab shows z7/z8 requests (bounded — no 300-tile storms).
- Zoom to 6–12×: hi-res z8/z9 tiles load; no blank flashes crossing levels; panning streams tiles into view (culling working).
- Commander tag icon draws above overlapping player icons.
- Offline check: in devtools block `darkharasho.github.io`, pan to fresh area — z7 underlay fills, no holes.

- [ ] **Step 3: Web report check**

`npm run dev:web` — replay tab renders tiles identically (same component, hosted URLs).

- [ ] **Step 4: Wrap up**

Use superpowers:finishing-a-development-branch — the branch also carries the spec + this plan; merge target `main`.
