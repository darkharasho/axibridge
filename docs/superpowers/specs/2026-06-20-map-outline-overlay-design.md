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

**Step B — Pre-threshold with ImageMagick.**
`object-trace` in Inkscape 1.4 has no per-call threshold flag (it reads trace params
from preferences). To make the trace robust and parameter-stable, pre-process the
composite into a clean high-contrast bitmap: grayscale → level/threshold → despeckle.
ImageMagick 7 (`magick`) is available on the dev box. This yields a near-1-bit image
where the default brightness-cutoff trace produces clean lines.

**Step C — Trace headlessly with the Inkscape CLI.**
Inkscape is installed as a Flatpak: `org.inkscape.Inkscape` version **1.4.4**. Invoke:

```
flatpak run --filesystem=<work-dir> org.inkscape.Inkscape \
  <map>-threshold.png \
  --actions="select-all; object-trace; ..." \
  --export-type=svg \
  --export-filename=<map>-outline.svg
```

`object-trace` (confirmed present in `--action-list`) performs the headless Trace
Bitmap using preference params. The script:
  - removes the embedded source `<image>` so only traced paths remain,
  - sets the document `viewBox` to `0 0 <pw> <ph>` (matching the map's reference
    `pixelSize`),
  - exports a plain SVG.

The `--filesystem=<work-dir>` override is required because the Flatpak sandbox cannot
read arbitrary host paths by default.

> Tuning note: thresholds and despeckle radius are tuned per map by eye during
> proof-of-concept; once dialed in they are committed as script constants so
> regeneration is deterministic.

**Proof-of-concept first:** Build and validate the full pipeline on **EBG only**
before generating the other maps. There are realistically three distinct drawings:
EBG, Alpine BL (Green + Blue share the layout), Desert BL (Red).

### 2. Shared Asset Lookup

- Outline SVGs live in a shared location (e.g. `src/shared/mapOutlines/`), one per
  distinct map, keyed by the `WvwMap` enum already used throughout.
- A small helper `getMapOutline(map: WvwMap): string | undefined` returns the bundled
  asset URL (Vite resolves the import for both `dist-react` and `dist-web` builds), or
  `undefined` for maps without an outline yet.
- Green and Blue borderlands map to the same Alpine asset.

### 3. Render Layer

In `ReplayView.tsx`, inside the existing `translate/scale` group, immediately after
the tile images and before the landmarks layer:

```jsx
{outlineUrl && (
  <image
    href={outlineUrl}
    x={0} y={0}
    width={mapWidth} height={mapHeight}
    preserveAspectRatio="none"
    opacity={0.7}
  />
)}
```

`outlineUrl = selectedFight.mapKey ? getMapOutline(selectedFight.mapKey) : undefined`.
No viewport math — the layer inherits the group transform, so it pans and zooms with
the tiles and player dots automatically. Identical code path serves desktop and web.

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
