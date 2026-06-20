# Map Outline Detail Setting Design

**Date:** 2026-06-20
**Status:** Approved (pending spec review)

## Problem

The shipped map-outline overlay uses one fixed edge-detection recipe that misses
low-contrast structure edges (e.g. tower/keep walls that tone-match the ground), so
parts of structures go un-outlined. Different fights/users want different amounts of
detail. We want the outline detail level to be a user-selectable setting, defaulting to
a more sensitive recipe than what shipped.

## Goals

- Let the user pick the outline detail level in the replay Layers panel: **Off**,
  **Standard**, **High detail**, **Max detail**. Default **Standard**.
- Each level is a distinct, pre-baked outline asset per map (potrace/ImageMagick can't
  run at render time).
- Standard fixes the "structures partially outlined" problem; higher levels capture
  progressively more edges at the cost of busier terrain.
- Render the chosen outline at full opacity (the thin @ 100% look chosen during review).

## Non-Goals

- Runtime/adjustable opacity or line-weight sliders (fixed opacity 1.0, thin lines).
- Lazy-loading the outline assets (eager bundle is acceptable for now; noted as a
  future trim).
- Per-fight memory of the setting — it's a global replay layer preference like heatmap.

## Edge Recipes (the detail levels)

All operate on the composited tile raster, grayscale, producing black thin line art
(`-negate` to dark-on-white) then traced with potrace (thin, no dilation). Determined
by visual comparison on the EBG Stonemist crop:

| Level    | ImageMagick edge recipe                                        |
|----------|----------------------------------------------------------------|
| standard | `-blur 0x0.4 -canny 0x1+6%+18%`                                 |
| high     | `-clahe 25x25%+128+2 -blur 0x0.4 -canny 0x1+6%+18%`            |
| max      | `-clahe 12x12%+128+3 -canny 0x1+4%+12%`                         |

`standard` (R2) captures structures cleanly; `high` (R3) adds CLAHE local-contrast so
more subtle edges trace, busier terrain; `max` (R4) is the densest. (`max` is likely to
be dropped after in-app judging — keep the design extensible so removing a level is a
one-line change to the level list.)

## Architecture

### 1. Bake pipeline (`scripts/build-map-outline.mjs`)

- Gains a `recipe` selection (one of `standard|high|max`), passed per run or looped.
- Step 2 (edge detection) uses the recipe's ImageMagick args instead of the single
  hard-coded Canny call. Steps 1 (composite), 3 (potrace), 4 (viewBox normalise)
  unchanged.
- Output filename includes the level: `src/shared/mapOutlines/<map>-outline-<level>.svg`.
- The recipe constants live in the script as a `RECIPES` map (the source of truth for
  the bake; the spec table mirrors them).
- The old single `<map>-outline.svg` assets are replaced by the per-level files.

There are 3 maps (EBG, Alpine = Green+Blue, Desert = Red) × 3 levels = **9 SVGs**.

### 2. Lookup (`src/renderer/stats/map/mapOutlines.ts`)

- `OutlineLevel = 'standard' | 'high' | 'max'`.
- `mapOutlineFileName(map: WvwMap, level: OutlineLevel): string` — e.g.
  `eternalbattlegrounds-outline-standard`. Green/Blue → `alpine-outline-<level>`.
- `getMapOutline(map: WvwMap, level: OutlineLevel): string | undefined` — base64 data
  URI of that variant, or `undefined` if not bundled. (Eager `import.meta.glob` raw +
  base64, same pattern as today.)

### 3. Store (`src/renderer/stats/statsStore.ts`)

- Add `outline: 'off' | OutlineLevel` to `replayLayers` (default `'standard'`).
- Add `setReplayOutlineMode(mode)` action mirroring `setReplayHeatmapMode`.
- Include `outline: 'standard'` in the reset defaults block.
- Persistence identical to existing `replayLayers` fields.

### 4. UI (`src/renderer/stats/map/LayersPopover.tsx`)

- Add an "Outline" section (radio group, same markup as the Heatmap section) with
  options Off / Standard / High detail / Max detail, each with a hover `title`.
- Bound to `layers.outline` via `setReplayOutlineMode`.

### 5. Render (`src/renderer/stats/map/ReplayView.tsx`)

- Compute `outlineUrl = (selectedFight.mapKey && layers.outline !== 'off')
  ? getMapOutline(selectedFight.mapKey, layers.outline) : undefined`.
- Pass to `<MapOutlineLayer>` with `opacity={1}` (was 0.7). Offset wiring
  (`getMapPixelOffset`) unchanged. `MapOutlineLayer` itself is unchanged.

## Data Flow

1. Dev bakes 3 levels × 3 maps → commits 9 SVGs.
2. User picks a level in the Layers panel → `replayLayers.outline` updates (persisted).
3. `ReplayView` resolves the variant for the current map + level and renders it (or
   nothing when `off`).

## Error Handling / Fallbacks

- `off` or an unbundled (map, level) → `getMapOutline` path yields `undefined` →
  `MapOutlineLayer` renders `null`. No crash; tiles unaffected.
- Removing a level later (e.g. `max`): drop it from `OutlineLevel`, the UI option list,
  and delete its 3 SVGs. Any persisted `outline: 'max'` value would resolve to
  `undefined` → renders nothing until the user reselects (acceptable; could clamp to
  `standard` on read if desired).

## Testing

- **Store:** default `outline === 'standard'`; `setReplayOutlineMode` updates it; reset
  restores `'standard'`.
- **Lookup:** `mapOutlineFileName` for each (map, level) incl. Green/Blue → same alpine
  base name; `getMapOutline` returns a data URI for bundled levels and `undefined` for
  an unknown level.
- **UI:** `LayersPanel` renders the four outline radios; selecting one calls
  `setReplayOutlineMode` with the right value.
- **Render:** `MapOutlineLayer` gets the correct variant URL for a given
  (mapKey, level) and `undefined` when `outline === 'off'`.

## Open Decisions (defaults chosen)

- Default level: **Standard**. Opacity: **1.0**. `max` included for now, pending in-app
  judgment (designed to be removable in one step).
