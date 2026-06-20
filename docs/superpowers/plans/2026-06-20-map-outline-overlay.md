# Map Outline Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay a crisp, resolution-independent black-line outline of terrain and structures on top of the WvW replay map tiles, in both the desktop renderer and the published web report.

**Architecture:** A dev-time scripted pipeline (Node tile-compositing → ImageMagick threshold → Inkscape `object-trace`) produces one outline SVG per distinct map. Those SVGs are bundled as base64 data URIs and rendered as a single `<image>` inside the existing replay SVG transform group, so the overlay inherits tile scaling and aligns by construction with no projection code.

**Tech Stack:** TypeScript, React, Vite (`import.meta.glob` raw asset inlining), Node (`.mjs` dev script), ImageMagick 7 (`magick`), Inkscape 1.4.4 (Flatpak `org.inkscape.Inkscape`), vitest + @testing-library/react.

## Global Constraints

- Outline alignment relies on tracing a raster composited at the map's **reference `pixelSize`** from `src/shared/wvwTiles.ts` (EBG `[716,750]`, Green/Blue BL `[523,750]`, Red BL `[750,750]`). The traced SVG's `viewBox` MUST equal `0 0 <pw> <ph>` for that map.
- SVG assets MUST be inlined as base64 data URIs (`data:image/svg+xml;base64,...`). URL-based `<image href>` fails in Electron's renderer — follow the existing `classIconUtils.ts` / `commander_tag.svg` pattern.
- Map → outline keying uses the `WvwMap` enum (`src/shared/wvwLandmarks.ts`). Green and Blue borderlands share one **Alpine** asset; Red uses **Desert**; EBG is unique. Three distinct drawings total.
- Overlay is always on, layered on top of tiles, single color (black), default opacity `0.7`. No visibility toggle, no schematic/outline-only mode.
- Inkscape runs via Flatpak with `--filesystem=<work-dir>` so the sandbox can read/write the working directory.
- Respect the repo test-runner limit: run vitest with `--maxWorkers=2`.

---

### Task 1: Export map reference size from `wvwTiles.ts`

The compositing script (Task 2) needs each map's reference `pixelSize` to size the trace canvas and the SVG `viewBox`. Today `WVW_TILE_DATA` is module-private. Expose a typed getter.

**Files:**
- Modify: `src/shared/wvwTiles.ts`
- Test: `src/shared/__tests__/wvwTiles.test.ts` (create)

**Interfaces:**
- Consumes: `WvwMap` from `./wvwLandmarks`; existing private `WVW_TILE_DATA`.
- Produces: `getMapReferenceSize(map: WvwMap): [number, number] | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/wvwTiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getMapReferenceSize } from '../wvwTiles';
import { WvwMap } from '../wvwLandmarks';

describe('getMapReferenceSize', () => {
    it('returns the calibrated pixel size for each WvW map', () => {
        expect(getMapReferenceSize(WvwMap.EternalBattlegrounds)).toEqual([716, 750]);
        expect(getMapReferenceSize(WvwMap.GreenBorderlands)).toEqual([523, 750]);
        expect(getMapReferenceSize(WvwMap.BlueBorderlands)).toEqual([523, 750]);
        expect(getMapReferenceSize(WvwMap.RedBorderlands)).toEqual([750, 750]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: FAIL — `getMapReferenceSize is not a function` / not exported.

- [ ] **Step 3: Add the export**

In `src/shared/wvwTiles.ts`, after the `getMapTiles` function, add:

```ts
/** Returns the calibrated reference pixel size [width, height] for a WvW map, or undefined if untiled. */
export function getMapReferenceSize(map: WvwMap): [number, number] | undefined {
    return WVW_TILE_DATA[map]?.pixelSize;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/wvwTiles.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwTiles.ts src/shared/__tests__/wvwTiles.test.ts
git commit -m "feat(maps): export getMapReferenceSize for outline tooling"
```

---

### Task 2: Outline-generation pipeline script + EBG proof-of-concept

Build the dev-time pipeline and validate it end-to-end on **EBG only** before doing the other maps. This task is a manual dev run (network fetch + Flatpak), not TDD — its deliverable is the committed script plus a visually-verified `eternalbattlegrounds-outline.svg`.

**Files:**
- Create: `scripts/build-map-outline.mjs`
- Create: `src/shared/mapOutlines/eternalbattlegrounds-outline.svg` (generated output, committed)
- Create: `src/shared/mapOutlines/.gitignore` (ignore intermediate rasters)
- Modify: `package.json` (add `build:map-outline` script)

**Interfaces:**
- Consumes: tile geometry equivalent to `wvwTiles.getMapTiles`. The script inlines the four maps' `continentRect` + `pixelSize` constants (dev-only tool; `src/shared/wvwTiles.ts` remains the source of truth — keep a comment cross-referencing it).
- Produces: `src/shared/mapOutlines/<map>-outline.svg` files with `viewBox="0 0 <pw> <ph>"`.

- [ ] **Step 1: Create the pipeline script**

Create `scripts/build-map-outline.mjs`:

```js
// Dev-time pipeline: composite GW2 WvW tiles -> threshold -> Inkscape trace -> outline SVG.
// Usage: node scripts/build-map-outline.mjs <ebg|alpine-green|alpine-blue|desert>
// Requires: ImageMagick `magick` on PATH, Inkscape Flatpak `org.inkscape.Inkscape`.
// Geometry constants are mirrored from src/shared/wvwTiles.ts (the source of truth).
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const CONTINENT_ID = 2, FLOOR_ID = 3, MAX_TILE_ZOOM = 7, TILE_SIZE = 256;

// map key -> { continentRect, pixelSize, outFile }. Green/Blue both feed the Alpine asset.
const MAPS = {
    ebg:          { rect: [[8958, 12798], [12030, 15870]], size: [716, 750], out: 'eternalbattlegrounds-outline.svg' },
    'alpine-green': { rect: [[5630, 11518], [8190, 15102]], size: [523, 750], out: 'alpine-outline.svg' },
    'alpine-blue':  { rect: [[12798, 10878], [15358, 14462]], size: [523, 750], out: 'alpine-outline.svg' },
    desert:       { rect: [[9214, 8958], [12286, 12030]], size: [750, 750], out: 'desert-outline.svg' },
};

const key = process.argv[2];
const cfg = MAPS[key];
if (!cfg) { console.error(`Unknown map "${key}". One of: ${Object.keys(MAPS).join(', ')}`); process.exit(1); }

const [[cx1, cy1], [cx2, cy2]] = cfg.rect;
const [pw, ph] = cfg.size;
const cw = cx2 - cx1, ch = cy2 - cy1;
const tileSpan = TILE_SIZE * Math.pow(2, MAX_TILE_ZOOM - MAX_TILE_ZOOM); // zoom 7 => span 256
const txMin = Math.floor(cx1 / tileSpan), tyMin = Math.floor(cy1 / tileSpan);
const txMax = Math.floor((cx2 - 1) / tileSpan), tyMax = Math.floor((cy2 - 1) / tileSpan);

const work = mkdtempSync(path.join(tmpdir(), 'map-outline-'));
const outDir = path.resolve('src/shared/mapOutlines');
mkdirSync(outDir, { recursive: true });

console.log(`[${key}] compositing ${(txMax - txMin + 1) * (tyMax - tyMin + 1)} tiles into ${pw}x${ph}`);

// 1) Download tiles and build the composite args (each tile resized to its WxH, placed at X,Y).
const compositeArgs = ['-size', `${pw}x${ph}`, 'xc:white'];
for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
        const url = `https://tiles.guildwars2.com/${CONTINENT_ID}/${FLOOR_ID}/${MAX_TILE_ZOOM}/${tx}/${ty}.jpg`;
        const res = await fetch(url);
        if (!res.ok) { console.warn(`  tile ${tx},${ty} -> ${res.status}, skipping`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        const file = path.join(work, `t_${tx}_${ty}.jpg`);
        writeFileSync(file, buf);
        const px = Math.round((tx * tileSpan - cx1) / cw * pw);
        const py = Math.round((ty * tileSpan - cy1) / ch * ph);
        const w = Math.ceil(tileSpan / cw * pw);
        const h = Math.ceil(tileSpan / ch * ph);
        compositeArgs.push('(', file, '-resize', `${w}x${h}!`, ')', '-geometry', `+${px}+${py}`, '-composite');
    }
}
const composite = path.join(work, 'composite.png');
compositeArgs.push(composite);
execFileSync('magick', compositeArgs, { stdio: 'inherit' });

// 2) Threshold to a clean high-contrast bitmap so the default brightness-cutoff trace is stable.
//    Tunables: grayscale -> contrast stretch -> threshold -> despeckle.
const threshold = path.join(work, 'threshold.png');
execFileSync('magick', [
    composite,
    '-colorspace', 'Gray',
    '-auto-level',
    '-threshold', '55%',
    '-despeckle',
    threshold,
], { stdio: 'inherit' });

// 3) Trace with Inkscape (Flatpak). object-trace uses trace prefs; the pre-threshold makes it deterministic.
const tracedRaw = path.join(work, 'traced.svg');
execFileSync('flatpak', [
    'run', `--filesystem=${work}`, 'org.inkscape.Inkscape',
    threshold,
    '--actions=select-all;object-trace;delete;export-do',
    '--export-type=svg',
    `--export-filename=${tracedRaw}`,
], { stdio: 'inherit' });

// 4) Normalise the viewBox to the map's reference pixel size and write the committed asset.
let svg = readFileSync(tracedRaw, 'utf8');
svg = svg.replace(/(<svg[^>]*?)\sviewBox="[^"]*"/, '$1').replace(/(<svg\b)/, `$1 viewBox="0 0 ${pw} ${ph}"`);
const outPath = path.join(outDir, cfg.out);
writeFileSync(outPath, svg);
rmSync(work, { recursive: true, force: true });
console.log(`[${key}] wrote ${outPath}`);
```

- [ ] **Step 2: Add the gitignore for intermediates and the npm script**

Create `src/shared/mapOutlines/.gitignore`:

```
*.png
```

In `package.json` `scripts`, add:

```json
"build:map-outline": "node scripts/build-map-outline.mjs",
```

- [ ] **Step 3: Generate the EBG outline**

Run: `npm run build:map-outline ebg`
Expected: console logs compositing/tracing steps and `wrote src/shared/mapOutlines/eternalbattlegrounds-outline.svg`. The SVG opens to recognizable EBG terrain/structure outlines.

If the trace is too noisy or too sparse, tune the `-threshold 55%` value (lower = more black detail, higher = sparser) and/or add a second `-despeckle`, then re-run. Commit the tuned values once dialed in.

- [ ] **Step 4: Verify the viewBox**

Run: `grep -o 'viewBox="[^"]*"' src/shared/mapOutlines/eternalbattlegrounds-outline.svg`
Expected: `viewBox="0 0 716 750"`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-map-outline.mjs package.json src/shared/mapOutlines/.gitignore src/shared/mapOutlines/eternalbattlegrounds-outline.svg
git commit -m "feat(maps): outline-generation pipeline + EBG outline asset"
```

---

### Task 3: `getMapOutline` shared lookup

Resolve a `WvwMap` to a bundled outline data URI. Split the pure filename mapping (deterministic, file-independent) from the data-URI resolution so the mapping is testable regardless of which assets exist yet.

**Files:**
- Create: `src/shared/mapOutlines.ts`
- Test: `src/shared/__tests__/mapOutlines.test.ts`

**Interfaces:**
- Consumes: `WvwMap` from `./wvwLandmarks`; SVGs in `./mapOutlines/*.svg` (EBG exists after Task 2).
- Produces:
  - `mapOutlineFileName(map: WvwMap): string` — base name without extension (e.g. `'eternalbattlegrounds-outline'`).
  - `getMapOutline(map: WvwMap): string | undefined` — base64 data URI, or `undefined` if that asset isn't bundled.

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/mapOutlines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapOutlineFileName, getMapOutline } from '../mapOutlines';
import { WvwMap } from '../wvwLandmarks';

describe('mapOutlineFileName', () => {
    it('maps each WvW map to its outline asset base name', () => {
        expect(mapOutlineFileName(WvwMap.EternalBattlegrounds)).toBe('eternalbattlegrounds-outline');
        expect(mapOutlineFileName(WvwMap.GreenBorderlands)).toBe('alpine-outline');
        expect(mapOutlineFileName(WvwMap.BlueBorderlands)).toBe('alpine-outline');
        expect(mapOutlineFileName(WvwMap.RedBorderlands)).toBe('desert-outline');
    });

    it('shares one asset between green and blue (Alpine) borderlands', () => {
        expect(mapOutlineFileName(WvwMap.GreenBorderlands))
            .toBe(mapOutlineFileName(WvwMap.BlueBorderlands));
    });
});

describe('getMapOutline', () => {
    it('returns a base64 SVG data URI for a bundled map (EBG)', () => {
        const uri = getMapOutline(WvwMap.EternalBattlegrounds);
        expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/mapOutlines.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../mapOutlines`.

- [ ] **Step 3: Implement the lookup**

Create `src/shared/mapOutlines.ts`:

```ts
import { WvwMap } from './wvwLandmarks';

// Outline SVGs are imported as raw text and encoded as base64 data URIs. URL-based
// SVG <image> hrefs fail in Electron's renderer, so data URIs are required (same
// approach as classIconUtils.ts / commander_tag.svg). The glob is eager so bundling
// works for both the desktop (dist-react) and web report (dist-web) builds.
const outlineModules = import.meta.glob<string>('./mapOutlines/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
});

const outlinesByName: Record<string, string> = {};
for (const [filePath, svg] of Object.entries(outlineModules)) {
    const name = filePath.split('/').pop()!.replace('.svg', '');
    outlinesByName[name] = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

const MAP_OUTLINE_FILE: Record<WvwMap, string> = {
    [WvwMap.EternalBattlegrounds]: 'eternalbattlegrounds-outline',
    [WvwMap.GreenBorderlands]: 'alpine-outline',
    [WvwMap.BlueBorderlands]: 'alpine-outline',
    [WvwMap.RedBorderlands]: 'desert-outline',
};

/** Base asset name (no extension) for a map's outline SVG. */
export function mapOutlineFileName(map: WvwMap): string {
    return MAP_OUTLINE_FILE[map];
}

/** Base64 SVG data URI for a map's outline, or undefined if the asset isn't bundled yet. */
export function getMapOutline(map: WvwMap): string | undefined {
    return outlinesByName[mapOutlineFileName(map)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/mapOutlines.test.ts --maxWorkers=2`
Expected: PASS (EBG asset from Task 2 resolves; mapping assertions hold).

- [ ] **Step 5: Commit**

```bash
git add src/shared/mapOutlines.ts src/shared/__tests__/mapOutlines.test.ts
git commit -m "feat(maps): getMapOutline data-URI lookup keyed by WvwMap"
```

---

### Task 4: `MapOutlineLayer` presentational component

A small SVG layer component (modeled on `HeatmapLayer`) that renders the outline `<image>` or nothing. Keeping it separate makes it unit-testable without mounting the whole `ReplayView`.

**Files:**
- Create: `src/renderer/stats/map/MapOutlineLayer.tsx`
- Test: `src/renderer/stats/map/__tests__/MapOutlineLayer.test.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (pure props).
- Produces: `MapOutlineLayer` React component with props `{ outlineUrl: string | undefined; mapWidth: number; mapHeight: number; opacity?: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/MapOutlineLayer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MapOutlineLayer } from '../MapOutlineLayer';

describe('MapOutlineLayer', () => {
    it('renders nothing when outlineUrl is undefined', () => {
        const { container } = render(
            <svg viewBox="0 0 716 750"><MapOutlineLayer outlineUrl={undefined} mapWidth={716} mapHeight={750} /></svg>
        );
        expect(container.querySelector('image')).toBeNull();
    });

    it('renders a full-extent image when an outline URL is provided', () => {
        const { container } = render(
            <svg viewBox="0 0 716 750">
                <MapOutlineLayer outlineUrl="data:image/svg+xml;base64,AAAA" mapWidth={716} mapHeight={750} opacity={0.7} />
            </svg>
        );
        const img = container.querySelector('image');
        expect(img).not.toBeNull();
        expect(img?.getAttribute('href')).toBe('data:image/svg+xml;base64,AAAA');
        expect(img?.getAttribute('width')).toBe('716');
        expect(img?.getAttribute('height')).toBe('750');
        expect(img?.getAttribute('preserveAspectRatio')).toBe('none');
        expect(img?.getAttribute('opacity')).toBe('0.7');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/MapOutlineLayer.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../MapOutlineLayer`.

- [ ] **Step 3: Implement the component**

Create `src/renderer/stats/map/MapOutlineLayer.tsx`:

```tsx
import React from 'react';

interface MapOutlineLayerProps {
    /** Base64 SVG data URI of the map outline, or undefined when no outline exists for the map. */
    outlineUrl: string | undefined;
    mapWidth: number;
    mapHeight: number;
    /** Layer opacity over the tiles. Defaults to 0.7. */
    opacity?: number;
}

/**
 * Crisp vector outline of terrain/structures, layered on top of the map tiles.
 * Authored in the map's reference pixel space, so it scales 1:1 with the tiles via
 * the parent transform group — no projection math here.
 */
export function MapOutlineLayer({ outlineUrl, mapWidth, mapHeight, opacity = 0.7 }: MapOutlineLayerProps) {
    if (!outlineUrl) return null;
    return (
        <image
            href={outlineUrl}
            x={0}
            y={0}
            width={mapWidth}
            height={mapHeight}
            preserveAspectRatio="none"
            opacity={opacity}
        />
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/MapOutlineLayer.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/MapOutlineLayer.tsx src/renderer/stats/map/__tests__/MapOutlineLayer.test.tsx
git commit -m "feat(maps): MapOutlineLayer overlay component"
```

---

### Task 5: Wire `MapOutlineLayer` into `ReplayView`

Render the outline layer inside the existing transform group, immediately after the tiles and before the heatmap/landmarks, so it sits on top of the tiles but under the player dots.

**Files:**
- Modify: `src/renderer/stats/map/ReplayView.tsx` (imports + JSX around line 329-330)

**Interfaces:**
- Consumes: `getMapOutline` (Task 3), `MapOutlineLayer` (Task 4); existing `selectedFight.mapKey`, `mapWidth`, `mapHeight`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add imports**

In `src/renderer/stats/map/ReplayView.tsx`, alongside the existing `wvwTiles` import (line 4) and component imports, add:

```tsx
import { getMapOutline } from '../../../shared/mapOutlines';
import { MapOutlineLayer } from './MapOutlineLayer';
```

- [ ] **Step 2: Render the layer after the tiles**

In the transform group, immediately after the tile-rendering ternary block (the `getMapTiles(...).map(...)` / `mapImageUrl` block ending at line 329) and before `<HeatmapLayer ... />` (line 330), insert:

```tsx
<MapOutlineLayer
    outlineUrl={selectedFight.mapKey ? getMapOutline(selectedFight.mapKey) : undefined}
    mapWidth={mapWidth}
    mapHeight={mapHeight}
/>
```

- [ ] **Step 3: Typecheck and run the map test suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx vitest run src/renderer/stats/map --maxWorkers=2`
Expected: PASS (existing map tests plus the new `MapOutlineLayer` test).

- [ ] **Step 4: Manual visual verification (EBG)**

Run: `npm run dev`, open a fight on Eternal Battlegrounds, open the replay map. Confirm the black outline sits on top of the tiles and stays aligned with tile features while zooming in and out. If it drifts, the trace source extent is wrong — revisit Task 2's compositing geometry (the outline must be `716×750`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx
git commit -m "feat(maps): render map outline overlay in replay view"
```

---

### Task 6: Generate Alpine and Desert outline assets

With the pipeline validated on EBG, generate the remaining two distinct maps. Manual dev run; deliverable is two committed SVGs that `getMapOutline` will now resolve for Green/Blue/Red.

**Files:**
- Create: `src/shared/mapOutlines/alpine-outline.svg` (generated, committed)
- Create: `src/shared/mapOutlines/desert-outline.svg` (generated, committed)

**Interfaces:**
- Consumes: `scripts/build-map-outline.mjs` (Task 2).
- Produces: the two assets; no code changes.

- [ ] **Step 1: Generate the Alpine outline**

Run: `npm run build:map-outline alpine-green`
Expected: writes `src/shared/mapOutlines/alpine-outline.svg`. (Green and Blue share the Alpine layout; the green continent rect is used as the source.)

- [ ] **Step 2: Generate the Desert outline**

Run: `npm run build:map-outline desert`
Expected: writes `src/shared/mapOutlines/desert-outline.svg`.

- [ ] **Step 3: Verify viewBoxes**

Run:
```bash
grep -o 'viewBox="[^"]*"' src/shared/mapOutlines/alpine-outline.svg
grep -o 'viewBox="[^"]*"' src/shared/mapOutlines/desert-outline.svg
```
Expected: `viewBox="0 0 523 750"` (Alpine) and `viewBox="0 0 750 750"` (Desert).

- [ ] **Step 4: Extend the lookup test to cover all three assets**

In `src/shared/__tests__/mapOutlines.test.ts`, add to the `getMapOutline` describe block:

```ts
    it('resolves alpine for both green and blue, and desert for red', () => {
        expect(getMapOutline(WvwMap.GreenBorderlands)).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(getMapOutline(WvwMap.GreenBorderlands)).toBe(getMapOutline(WvwMap.BlueBorderlands));
        expect(getMapOutline(WvwMap.RedBorderlands)).toMatch(/^data:image\/svg\+xml;base64,/);
    });
```

Run: `npx vitest run src/shared/__tests__/mapOutlines.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Manual visual verification + commit**

Run `npm run dev`, open fights on an Alpine borderland (green or blue) and the Desert (red) borderland, confirm alignment at multiple zooms. Then:

```bash
git add src/shared/mapOutlines/alpine-outline.svg src/shared/mapOutlines/desert-outline.svg src/shared/__tests__/mapOutlines.test.ts
git commit -m "feat(maps): Alpine and Desert outline assets"
```

---

## Self-Review Notes

- **Spec coverage:** Asset pipeline (Tasks 2, 6) ↔ spec §Architecture/1 & §Asset Generation; shared lookup (Task 3) ↔ §Architecture/2; render layer (Tasks 4, 5) ↔ §Architecture/3; both-targets bundling via eager `import.meta.glob` raw data URIs ↔ §Goals; always-on/no-toggle/opacity-0.7 ↔ §Non-Goals & §Open Decisions; reference-size `viewBox` alignment ↔ §Key Insight & Global Constraints.
- **Fallbacks:** `getMapOutline` returns `undefined` and `MapOutlineLayer` renders `null` when an asset is absent — matches spec §Error Handling. Until Task 6, Alpine/Desert simply render no overlay; EBG works from Task 5 on.
- **Type consistency:** `getMapReferenceSize` (Task 1), `mapOutlineFileName`/`getMapOutline` (Task 3), and `MapOutlineLayer` props (Task 4) are referenced with identical signatures where consumed (Tasks 2, 5).
</content>
