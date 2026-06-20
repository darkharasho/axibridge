# Map Outline Overlay Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)

## Problem

The WvW replay map renders JPEG tiles fetched from `tiles.guildwars2.com`. Those
tiles go blurry the moment the user zooms past their native zoom level, and they
carry little structural clarity at a glance. We want to overlay a crisp,
resolution-independent black-line outline of terrain and structures on top of the
tiles, adding detail that stays sharp at any zoom.

## Goals

- Add a vector outline layer (terrain + structure edges, black lines) over the
  existing tile imagery in the replay map.
- Stay pixel-aligned with the tiles at every zoom level, with no hand-calibration.
- Work in **both** the desktop renderer (`ReplayView`) and the published web
  report (`dist-web/`), from one shared set of assets.
- Keep the outline always on, layered on top of the tiles (augment-only — no
  schematic / outline-only mode, no toggle for now).

## Non-Goals

- Color theming of the outline (outline is a single color, default black; not
  worried about per-theme tinting in this iteration).
- An outline-only / "schematic" view mode.
- A user-facing visibility toggle.
- GW2-API-derived objective/sector polygons (we hand-trace the tile imagery
  instead, which captures terrain the API does not expose).

## Key Insight: Alignment Is Free

The replay SVG uses `viewBox="0 0 ${mapWidth} ${mapHeight}"` where `mapWidth/Height`
are EI pixel space, and tiles are positioned inside a single
`translate(tx ty) scale(scale)` group (`ReplayView.tsx:303-329`). The single-image
fallback path already renders `<image href x=0 y=0 width={mapWidth} height={mapHeight}
preserveAspectRatio="none">` (`ReplayView.tsx:327`).

If we **trace a raster that is itself the composited tile space** for a map (sized
to that map's reference `pixelSize` from `wvwTiles.ts` — e.g. EBG 716×750), the
resulting SVG authored with `viewBox="0 0 <pw> <ph>"` drops into the same group with
`preserveAspectRatio="none"` and scales **identically to the tiles**. Alignment is
guaranteed by construction; no projection or calibration code is required.

There is precedent for a per-`mapKey` overlay layer: `WVW_LANDMARKS` already draws
objective markers at calibrated x/y in this same pixel space (`ReplayView.tsx:331-337`).

## Architecture

Three pieces: an **asset-generation pipeline** (dev-time, scripted), a **shared asset
lookup**, and a **render layer**.

### 1. Asset Generation Pipeline (dev-time, scripted)

A reproducible script chain, run by a developer to (re)generate outline SVGs. Not
shipped to end users — only the resulting `.svg` files are bundled.

**Step A — Composite the tiles into a trace source (Node).**
A dev script (e.g. `scripts/build-map-outline.mjs`) reuses the existing
`getMapTiles(map, 7, pw, ph)` logic to fetch every tile for a map at max tile zoom,
draws each tile into a `pw × ph` canvas at its `{x, y, width, height}` (clipping the
grid-snapped tiles to the map extent), and writes `<map>-source.png`. This guarantees
the trace source matches the tile coordinate space pixel-for-pixel.

**Step B — Edge-detect with ImageMagick.**
A brightness threshold was the original plan, but the WvW maps are uniformly dark, so
a brightness cut wipes out the detail (the thresholded image is nearly all black). The
features we want are *boundaries* — cliffs, water edges, walls, roads — so we use Canny
edge detection instead: `magick composite.png -colorspace Gray -blur 0x0.6
-canny 0x1+10%+30% -negate <map>-threshold.png`. This yields clean black feature
outlines on white. ImageMagick 7 (`magick`) is on the dev box.

**Step C — Trace with potrace.**
The original plan used Inkscape's headless CLI, but Inkscape 1.4's `object-trace`
action only traces the page border in headless mode (a known limitation; confirmed by
experiment). We instead drive **potrace** — the exact tracing engine Inkscape's Trace
Bitmap wraps — via its npm library (a `devDependency`, used only by the dev script):

```
potrace.trace(threshold, { threshold: 128, turdSize: 4, optTolerance: 0.4,
  color: '#000000', background: 'transparent' }, cb)
```

The script then normalises the SVG header to `width/height/viewBox="0 0 <pw> <ph>"`
(matching the map's reference `pixelSize`) and writes the committed asset. potrace
already emits paths in input-pixel coordinates (= `pw × ph`), so no `<image>` stripping
is needed and coordinates land in the right space directly.

> Tuning note: `turdSize` (speck removal) and `optTolerance` (curve simplification),
> plus the Canny hysteresis thresholds, are tuned per map by eye during
> proof-of-concept; once dialed in they live as script constants so regeneration is
> deterministic.

**Proof-of-concept first:** Build and validate the full pipeline on **EBG only**
before generating the other maps. There are realistically three distinct drawings:
EBG, Alpine BL (Green + Blue share the layout), Desert BL (Red).

### 2. Shared Asset Lookup

- Outline SVGs live in `src/shared/mapOutlines/`, one per distinct map, keyed by the
  `WvwMap` enum already used throughout.
- The lookup module itself lives at `src/renderer/stats/map/mapOutlines.ts` (NOT in
  `src/shared`): it uses Vite-only `import.meta.glob`, and `src/shared` is also compiled
  by the electron-main `tsc`, which cannot handle `import.meta`. This matches the repo
  convention set by `src/renderer/classIconUtils.ts`.
- `getMapOutline(map: WvwMap): string | undefined` returns a **base64 data URI**
  (`data:image/svg+xml;base64,…`), not a file URL — URL-based SVG `<image>` hrefs fail
  in Electron's renderer, so the SVGs are inlined via eager `import.meta.glob('…/*.svg',
  { query: '?raw' })` and base64-encoded (same pattern as `classIconUtils`). Works for
  both `dist-react` and `dist-web`. Returns `undefined` for maps without an outline yet.
- A companion pure helper `mapOutlineFileName(map)` resolves the asset base name;
  Green and Blue borderlands map to the same `alpine-outline` asset.

### 3. Render Layer

A small presentational component `MapOutlineLayer` (in `src/renderer/stats/map/`,
modelled on the sibling `HeatmapLayer`) renders the overlay or `null`:

```jsx
function MapOutlineLayer({ outlineUrl, mapWidth, mapHeight, offsetX = 0, offsetY = 0, opacity = 0.7 }) {
  if (!outlineUrl) return null;
  return <image href={outlineUrl} x={offsetX} y={offsetY}
    width={mapWidth} height={mapHeight} preserveAspectRatio="none" opacity={opacity} />;
}
```

In `ReplayView.tsx`, inside the existing `translate/scale` group, immediately after the
tile images and before the heatmap/landmarks layer:

```jsx
<MapOutlineLayer
  outlineUrl={selectedFight.mapKey ? getMapOutline(selectedFight.mapKey) : undefined}
  mapWidth={mapWidth} mapHeight={mapHeight}
  offsetX={outlineOffsetX} offsetY={outlineOffsetY}
/>
```

`outlineOffsetX/Y` come from `getMapPixelOffset(mapKey, mapWidth, mapHeight)`, which
mirrors the calibration offset `getMapTiles` applies to the tiles (EBG's `pixelOffset`
is `[-14, 20]`; the borderlands are `[0, 0]`). Without this, the EBG outline — traced
from an un-offset composite — would sit ~14/20px off from the offset-positioned tiles.
No other viewport math: the layer inherits the group transform, so it pans and zooms
with the tiles and player dots automatically. Identical code path serves desktop and web.

## Data Flow

1. Dev runs the pipeline (Steps A–C) → commits `<map>-outline.svg` assets.
2. At render time, `ReplayView` looks up the outline for the current fight's `mapKey`.
3. The outline `<image>` renders in the transform group on top of the tiles; the
   browser scales the vector crisply at any zoom.

## Error Handling / Fallbacks

- **No outline for a map:** `getMapOutline` returns `undefined`; the layer renders
  nothing. Tiles and everything else behave exactly as today.
- **Asset fails to load:** a broken `<image>` href renders nothing visible; tiles
  remain. No crash path — it is an additive layer.
- **EI returns a non-reference render size:** tiles already handle this via
  `mapWidth/mapHeight`; the outline uses the same `width/height`, so it stretches in
  lockstep with the tiles. Any minor EI size variance affects outline and tiles
  equally, preserving alignment.

## Testing

- **Unit:** `getMapOutline` returns the right asset per `WvwMap` (incl. Green/Blue →
  Alpine) and `undefined` for unmapped maps.
- **Render:** a `ReplayView` test asserts the outline `<image>` is present with the
  correct `href`, `width/height` equal to `mapWidth/mapHeight`, and that it is absent
  when no outline exists for the map.
- **Visual (manual):** verify EBG outline aligns with tile features at multiple zoom
  levels in-app before generating the remaining maps.

## Open Decisions (defaults chosen)

- Overlay opacity: default `0.7`, adjustable as a single constant.
- Always on, no toggle (per user decision). A toggle/opacity control can be added
  later without changing the asset or projection design.
</content>
</invoke>
