# Replay High-Resolution Maps — Design

**Date:** 2026-08-06
**Status:** Approved (pending spec review)

## Problem

The fight replay's map background is blurry, worst when zoomed into a fight
(the primary way replays are watched), and slightly soft even at the default
view. The user wants visibly higher-resolution map art.

## Investigation Findings (current state)

- Tiles come live from the official service:
  `https://tiles.guildwars2.com/2/3/{z}/{x}/{y}.jpg` (continent 2, floor 3).
- `ReplayView.tsx` picks tile zoom inline: `floor(5 + log2(viewport.scale))`
  clamped to [3, 7]. It ignores the panel's CSS pixel size and
  `devicePixelRatio`, so at default/mid zoom it fetches tiles 2–4× below what
  the screen can show. This is the "soft default view" bug.
- The GW2 API (`/v2/continents/2`) claims `max_zoom: 6`, but **zoom 7 tiles
  exist and contain genuinely sharper art** (verified by pixel comparison of a
  Stonemist-area tile against an upscaled z6 quadrant). Zoom 7 is the native
  ceiling: 1 tile px per continent unit.
- Native art density example (EBG): continentRect is 3072 units wide rendered
  into a 716-unit map space → ~4.3 art px per map unit at z7. On a typical
  panel this is exhausted around viewport scale 2 (hidpi) to 4 (1× display).
  `MAX_SCALE` is 50, so deep zoom is heavily upscaled mush today.
- `getMapTiles()` (`src/shared/wvwTiles.ts`) returns **all** tiles covering a
  map's continentRect — no viewport culling. At z7 EBG that is 169 `<image>`
  elements (13×13; the rect is not tile-aligned) regardless of what's
  visible.
- The default replay viewport scale is 3 (`statsStore`), so the "default
  view" is already 3× zoomed.
- The web report re-exports the same component
  (`src/web/ReplayViewWeb.tsx` → `renderer/stats/map/ReplayView`), so one code
  path serves both the desktop app and published reports.

## Goals

1. Default and mid-zoom views fetch tiles matching actual screen density
   (panel size × viewport scale × devicePixelRatio) — native-crisp wherever
   native art suffices.
2. Deep zoom (the main complaint) shows AI-upscaled art (synthetic z8/z9)
   markedly sharper than today, in both the desktop app and published web
   reports, with zero user configuration.
3. Offline or hi-res-host-unreachable degrades silently to today's quality —
   no holes, no error states.
4. Bounded tile counts at every zoom (culling), no blank flashes when
   crossing tile-zoom levels.

## Non-Goals

- Bundling tiles into the installer (hosted on GitHub Pages instead).
- New vector overlays (walls/gates/icons) beyond the existing sector
  outlines.
- A settings toggle — the feature is always on.
- Changes to heatmap, landmarks, or any non-tile replay layer.

## Design

### 1. Screen-aware tile zoom selection

New `pickTileZoom(map, mapWidth, panelCssWidth, viewportScale, dpr, maxZoom)`
in `src/shared/wvwTiles.ts`, replacing the inline formula in `ReplayView.tsx`.

- Needed density: `(panelCssWidth / mapWidth) × viewportScale × dpr` (CSS→
  device px per map unit).
- Available density at zoom z: `(continentRectWidth / mapWidth) × 2^(z−7)`.
- Pick the smallest z whose available density ≥ needed (i.e. round **up**),
  clamped to `[3, MAX_HIRES_ZOOM]` where `MAX_HIRES_ZOOM` is a constant in
  `wvwTiles.ts`, initially 9 (the §5 ship gate may lower it to 8).
- Panel CSS size is tracked with a ResizeObserver on the map container
  (attached once a fight is selected, re-attached on fullscreen toggle);
  `dpr` is read live (`window.devicePixelRatio`) so moving the window
  between monitors adapts on the next render.

### 2. Viewport culling + layered rendering

`getMapTiles()` gains an optional visible-rect parameter (in map units,
derived from `viewport.tx/ty/scale` and panel size) and only returns tiles
intersecting it, expanded by a 1-tile margin. The existing tile-span math
(`256 × 2^(7−z)` continent units) generalizes unchanged to z8 (128 units) and
z9 (64 units).

Tile rendering becomes up to three stacked layers inside the existing
transform group:

1. **Coverage layer** — full-extent z5 (16 tiles on EBG), never culled.
   Cheap, browser-cached after first view; guarantees the map is never blank.
2. **Native underlay** — culled z7 official tiles, rendered only when the
   chosen zoom is ≥ 8. This is the silent fallback if hi-res tiles 404 or the
   host is unreachable.
3. **Detail layer** — culled tiles at the chosen zoom (official for ≤ 7,
   hi-res host for 8–9). Skipped when chosen zoom ≤ 5 (coverage layer already
   is the detail).

No load-error tracking in JS: a failed `<image>` simply doesn't paint and the
layer beneath shows through.

The detail layer is additionally **tile-budgeted**: because the default
viewport scale is 3, a pure round-up zoom choice can demand ~300 culled z9
tiles (~7 MB) with most of the map visible. If the culled tile count at the
chosen zoom exceeds `TILE_BUDGET` (140), the detail zoom steps down one
level at a time until it fits. Deep zoom (small visible area) is unaffected;
wide views cap at roughly 3.5 MB of tile fetches.

### 3. Hi-res tile pack generation (one-time script)

`scripts/generate-hires-tiles.mjs`, run manually (not CI):

- For each of the four `WVW_TILE_DATA` regions: download its z7 tiles
  (throttled, cached in a local work dir so re-runs are cheap).
- Stitch the region into one image **before** upscaling so tile borders get
  full context — avoids visible seams. (EBG stitched: 3072². If z9 memory is
  a concern, process in overlapping chunks and trim the margins.)
- Upscale **4× in one native pass** with Real-ESRGAN
  (`realesrgan-ncnn-vulkan` prebuilt binary; the script checks for it and
  prints install instructions if missing). The `realesrgan-x4plus` model
  only supports its native 4× — requesting `-s 2` makes the ncnn build
  misassemble its internal tiles (verified empirically 2026-08-06: content
  scrambled/shifted while output dimensions stay correct). The 2× level is
  derived by downscaling the 4× output with sharp.
- Slice 256px tiles: z8 from the derived 2× image, z9 from the native 4×
  image.
- Output layout mirrors the official service: `2/3/{z}/{x}/{y}.jpg`, JPEG
  quality ≈ 85. Expected total ~250–300 MB for all four maps, z8+z9.

### 4. Hosting + URL routing

- New public repo `darkharasho/axibridge-map-tiles` with GitHub Pages
  enabled; the generation script pushes the tile tree into it.
- `src/shared/wvwTiles.ts` gets a `HIRES_TILE_BASE` constant
  (`https://darkharasho.github.io/axibridge-map-tiles`). URL routing inside
  `getMapTiles()`: z ≤ 7 → `tiles.guildwars2.com`, z ≥ 8 → hi-res host.
- Because the constant lives in shared code, the desktop app and every
  published web report pick it up automatically.
- SVG `<image>` needs no CORS for display, so plain Pages hosting suffices.
- License note: the pack is derivative of ArenaNet map art, hosted as
  non-commercial fan content in line with ArenaNet's content terms — the same
  category as wiki-hosted map imagery.

### 5. Testing & quality gate

- Unit tests (vitest) for `pickTileZoom`: matrix over panel width, scale,
  dpr; verifies round-up behavior and clamps.
- Unit tests for `getMapTiles`: culling correctness (visible-rect + margin),
  z8/z9 tile spans and indices, URL routing per zoom.
- Existing replay tests (`src/renderer/stats/map/__tests__/`) stay green.
- Manual visual QA before publishing the pack: inspect busy tiles (Stonemist,
  towers, bridges) at z8 and z9. **Ship gate:** if z9 looks smeary or
  artifact-ridden, publish z8 only and lower the zoom clamp to 8. Decision is
  made on pixels, not assumption.
- Manual end-to-end: dev app on an EBG fight, zoom sweep 1× → 20×, confirm
  layer transitions have no flashes and offline mode (hi-res host blocked)
  shows today's quality.

## Success Criteria

- At default view on a hidpi display, tiles match screen density (no more
  z5-on-a-2×-panel).
- Zoomed to ~8× on a typical panel, map art comes from z8/z9 and is visibly
  sharper than current z7 upscaling.
- With the hi-res host unreachable, the replay looks exactly like today — no
  holes or blanks.
- Rendered tile `<image>` count stays bounded (≤ 16 coverage +
  ≤ `TILE_BUDGET` (140) per culled layer) at all zoom levels.

## Addendum (2026-08-06): commander tag z-order

Rider request, same branch: the commander tag icon must render **above** all
other member icons in the replay. SVG paints in document order, so member
rendering stable-sorts commanders last (pure helper in `replaySelectors.ts`,
unit-tested). No other ordering changes.
