# Replay Map Zone Outlines + Capture Rings — Design

Date: 2026-07-31
Status: awaiting approval

## Goal

Make the combat replay map look alive, like the in-game WvW map: each map sector
outlined in its owning team's colour, and (later) animated white capture rings when
the squad caps an objective mid-fight. Purely cosmetic.

Approved visual (mocked in-session on real tiles + real sector polygons):

- **Outline style, no fill** — terrain stays fully visible.
- **Independent shared sides** — every sector renders its own complete closed loop
  in its owner's colour. Along a shared border the two owners' lines sit side by
  side; nothing overdraws. Technique: stroke at 2× width clipped to the sector's
  polygon interior (per-sector SVG `clipPath`), giving an inner-aligned outline.
- Cap ring: white circle + sweeping progress arc + soft pulse at the objective.

## Background / findings

- The replay already renders the coloured GW2 tile map (`ReplayView.tsx`,
  `wvwTiles.ts`, shipped in #25). This feature adds the ownership layer on top.
- The GW2 API publishes real sector polygons: `/v2/continents/2/floors/3`,
  region 7, maps 38 (EBG), 95 (Green Alpine — has Dreadfall Bay), 96 (Blue
  Alpine — has Ascension Bay), 1099 (Red Desert). ~21 sectors per map, each with
  `bounds` (continent-coord polygon), plus `/v2/wvw/objectives` maps every
  objective to its `sector_id`.
- Elite Insights ≥ v3.26.0.0 parses the new arcdps gadget-capture statechanges
  (`GadgetCaptureEvent`: owner, circle geometry, split percent; EI constant
  `GadgetCapturesAdded = 20260602`) and animates rings in its **own HTML replay**,
  but exposes **none of it in the JSON** AxiBridge consumes. Phase 2 depends on
  getting that data (upstream PR preferred, local evtc reader as fallback).
- No historical ownership API exists — old logs cannot be backfilled. They fall
  back to neutral outlines.

## Phase 1 — sector outlines

### Static data: `src/shared/wvwSectors.ts` (generated)

New script `scripts/generate-wvw-sectors.mjs` (run manually, output committed):

1. Fetch `/v2/continents/2/floors/3` and `/v2/wvw/objectives?ids=all`.
2. For each of the four `WvwMap` maps (38/95/96/1099), convert sector `bounds`
   from continent coords to EI pixel space using the same
   `continentRect`/`pixelSize`/`pixelOffset` calibration as `WVW_TILE_DATA` in
   `wvwTiles.ts` (including EBG's `[-14, 20]` offset). Round to 1 decimal.
3. Emit per map: `sectors: { id, name, bounds: [x, y][] }[]` and
   `objectiveSectors: Record<objectiveId, sectorId>`.
4. Spawn sectors need no special casing: match data includes `Spawn`-type
   objectives with real owners (verified live: `95-111 type Spawn owner
   Green`), so spawn/citadel sectors are coloured through the same
   objective→sector mapping. Sectors with no mapped objective stay neutral.

Bundle cost ≈ 10–15 KB. No report.json growth from static data.

### Ownership snapshot (per log, at processing time)

- Optional new setting **WvW match** in SettingsView: a region + tier picker
  (match ids `1-1`…`1-4` NA, `2-1`…`2-5` EU are stable across weeks; verified
  live — there is no team-names endpoint, so a match picker beats a team
  dropdown; the squad's own team identity is irrelevant to outline colours).
  Unset → feature still works, outlines neutral. Known limitation: teams move
  tiers weekly, so a stale tier gives cosmetically wrong colours until updated.
- When a log finishes processing and a match is configured, fetch
  `/v2/wvw/matches/<matchId>` (objectives carry `owner` for every type,
  including Spawn — verified live), take the log's map, and map each
  objective's `owner` through `objectiveSectors` →
  `sectorOwners: Record<sectorId, 'Red' | 'Blue' | 'Green'>` (~21 entries,
  ~200 B). Stored on `ILogData`, threaded into `ReplayFightPayload` by
  `buildReplayFightPayload`, and included in web report payloads (size budget:
  negligible; respects the 90 MB→31 MB trim work).
- Match responses are cached ~60 s so a burst of logs is one fetch.
- Honest limitation: the snapshot is taken minutes after the fight, so a sector
  that flipped in between may be briefly wrong. Acceptable for cosmetics;
  Phase 2 capture events correct the fight's own sector live.

### Rendering: `SectorOutlineLayer`

New `src/renderer/stats/map/SectorOutlineLayer.tsx`, mounted in `ReplayView`
between the tile layer and `HeatmapLayer` (and therefore shared by the web
report automatically):

- Props: `mapKey`, `sectorOwners?`, `scale`, `mapWidth`, `mapHeight`.
- Scales baked EI-px polygons to the fight's actual `mapSize` the same way
  `getMapTiles` does (guards against EI size drift).
- Per sector: `<clipPath>` + `<polygon>` stroked at `2 × (2 / scale)` px and
  clipped to its own interior → constant ~2 screen px inner-aligned outline at
  any zoom (same `1/scale` convention as player icons).
- Colours: red `#ef4444`, blue `#3b82f6`, green `#22c55e`; neutral
  `rgba(148, 163, 184, 0.55)` when owner unknown. Stroke opacity ~0.9.
- Memoized; ~21 polygons per map, negligible cost.
- New Layers-panel toggle **Zone borders** (`replayLayers.zoneBorders`), default
  **on**, persisted like the other layer toggles.

### Testing

- Unit: generator conversion math cross-checked against known landmark
  positions (e.g. the Dreadfall Bay keep point from `wvwLandmarks.ts` lies
  inside the converted Dreadfall Bay sector polygon; same for Ascension Bay on
  map 96 and Stonemist on 38).
- Unit: `sectorOwners` threads from log → payload → layer; absent data renders
  neutral; toggle hides the layer (jsdom component test).
- Vitest with `--maxWorkers=2` per repo convention.

## Phase 2 — capture rings (separate plan, after Phase 1 ships)

- Data source, in order of preference:
  1. Upstream PR to Elite Insights serializing its parsed `GadgetCaptureEvent`s
     (+ split percents) into the JSON combat-replay metadata.
  2. Fallback: minimal `.zevtc` statechange reader in the main process (we
     already have the raw file and run EI locally) extracting only the
     gadget-capture events.
- Payload per fight: `captureEvents: { timeMs, x, y, radiusPx?, owner,
  progressPct }[]` (small; new logs only — arcdps started writing these
  events summer 2026; older logs simply have none).
- Rendering: white ring at the objective position, sweep arc driven by real
  progress, pulse while contested; on completion the sector's outline flips to
  the capturing team's colour for the rest of playback — the payoff moment.

## Non-goals

- Maps without tile/sector support (EotM, Obsidian Sanctum, Armistice Bastion,
  unresolved `mapKey`) — layer simply absent, as today.
- Historical ownership backfill for old logs.
- Live API polling during replay playback.
- Filled/tinted sectors (explicitly rejected in favour of outlines).
