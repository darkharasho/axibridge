# Map Replay Section — Design

**Date:** 2026-04-15
**Status:** Approved, ready for planning

## 1. Overview

Add a new top-level **"Map"** group to the stats navigation, containing one section: a full-squad fight replay viewer inspired by axipulse's `MovementView`, but extended from a player-centric single view into a holistic commander-centric squad view. The replay supports fight selection via a thumbnail strip, a fullscreen mode, synchronized timeline scrubbing, heatmap layers, event overlays, and per-party controls.

Separately, fight labels across the app adopt a new compact `Green BL: Bay (2:30)` format that estimates the fight's WvW location by nearest landmark.

The feature ships in both the Electron app and the static web report (GitHub Pages export).

**Non-negotiables:**
- Flip `ParseCombatReplay` default to `true` in the local EI integration so new logs carry full replay data.
- No back-compat work for old logs that lack replay data — they simply show a "no replay data" state.

## 2. Goals

- Give commanders a replayable, scrubbable, squad-wide view of any fight they've parsed.
- Make fight labels informative at a glance ("where on the borderland did this happen?") without requiring drill-in.
- Embrace axibridge's holistic-squad perspective: default views, defaults, and overlays center on the commander and the whole squad, not the local player.

## 3. Non-goals

- Cross-fight replay aggregation (replaying multiple fights back-to-back as one stream).
- Camera auto-direction / cinematic auto-pans.
- Annotation / editing of replays.
- Exporting replay clips as video or GIF.
- Back-filling replay data for historical logs that were parsed before the default flip.

## 4. Data pipeline

### 4.1 Local EI default flip

`src/main/eiParser.ts` — `DEFAULT_EI_SETTINGS.parseCombatReplay` becomes `true`. The Settings UI toggle stays so advanced users can turn it off. Going forward, every locally parsed log carries full combat replay data.

### 4.2 Required fields

Consumed from the EI JSON (same shape as axipulse uses):

- `combatReplayMetaData`: `pollingRate` (ms per sample), `inchToPixel`, `sizes: [w, h]`, `maps[0].url`.
- Per ally (`players[i]`): `combatReplayData.positions: [x, y][]`, `combatReplayData.down: [start, end][]`, `combatReplayData.dead: [start, end][]`, `rotation` (skill casts), `buffUptimes[*].states` (boon stack timelines), `healthPercents`, `hasCommanderTag`, `notInSquad`, `group`.
- Per enemy (`targets[i]` with `enemyPlayer=true`): same `combatReplayData` fields.
- `skillMap`, `buffMap` — for icon/name lookup.

Axibridge already reads `combatReplayData.positions` for tag-distance sections. This extends consumption — no new IPC.

### 4.3 Movement extraction

New file: **`src/shared/movementData.ts`**.

Ports axipulse's `buildMovementData` (currently in `axipulse/src/shared/extractPlayerData.ts:135-229`) to produce a `MovementData` object per fight:

```ts
export interface SquadMemberMovement {
    name: string;
    account: string;
    profession: string;
    eliteSpec: string | number;
    group: number;
    isCommander: boolean;
    isLocal: boolean;
    isEnemy: boolean;
    inSquad: boolean;
    positions: [number, number][];
    downRanges: [number, number][];
    deadRanges: [number, number][];
    boonStates?: Record<number, [number, number][]>;
    healthPercents?: [number, number][];
    skillCasts?: { id: number; time: number; duration: number }[];
}

export interface MovementData {
    pollingRate: number;
    durationMs: number;
    inchToPixel: number;
    members: SquadMemberMovement[];
    boonIcons: Record<number, { name: string; icon: string }>;
    skillIcons: Record<number, { name: string; icon: string }>;
}
```

`buildMovementData` is pure (no DOM, no IO). It runs lazily — only when the Map section requests it for a specific fight, via `useMovementData` (see §8).

### 4.4 WvW geography

Ported verbatim from axipulse:

- **`src/shared/wvwLandmarks.ts`** — `WvwMap` enum, `WvwLandmark` interface, landmark coordinate tables for EBG / Blue BL / Green BL / Red BL, and `findNearestLandmark(map, x, y)`.
- **`src/shared/wvwTiles.ts`** — `getMapTiles(map, zoom)` returning GW2 official tile URLs in EI pixel space, plus `hasTileData(map)`.
- **`src/shared/mapUtils.ts`** — `resolveMapFromZone(zone)`, `normalizeMapName(zone)` (for long form), and a new `normalizeMapNameShort(zone)` returning `"Green BL"` / `"Blue BL"` / `"Red BL"` / `"EBG"` / `<original>`. `formatDuration(ms)` ported as well.

### 4.5 Hydration & pruning

The replay needs full details in memory. Reuse the existing details-hydration scheduler:

- When the user picks a fight in the Map section, `useMovementData` requests that fight's details if not resident.
- If details were pruned and can't be re-hydrated (no dps.report permalink, no local `.evtc`), the viewer renders a "no replay data for this fight" empty state.
- Newly parsed logs with `parseCombatReplay=true` carry the required fields automatically.

No new pipeline is introduced; the existing hydration code already knows how to refetch.

### 4.6 Web report bundle

The web report (`vite.web.config.ts` → `dist-web/`) embeds the full `report.json`. We extend `report.json` to include, per fight:

- `combatReplayMetaData`
- Per player / enemy target: `combatReplayData`, and the minimal `rotation` / `buffUptimes[*].states` / `healthPercents` needed for replay features.
- The relevant entries from `skillMap` and `buffMap` (icons + names).

Size impact: ~200–500 KB of positional data per fight depending on duration and squad size. Report JSON is already compressed on the GitHub Pages side by the server. If bundles grow unmanageable we can lazy-fetch replay data per fight as separate JSON chunks, but we start with inline embedding.

The web report runs the same `buildMovementData` helper on demand when a fight is picked.

## 5. Fight naming

### 5.1 Landmark estimator

Fight average position is computed as the median of the commander's `combatReplayData.positions` (fall back to the local player if no commander). Done once per fight at aggregation time and cached on the per-fight record alongside `fightNumber`, `mapName`, etc.

### 5.2 New label helper

In `src/renderer/stats/utils/labelUtils.ts`:

```ts
buildFightLabelV2(fightRecord) → string
```

Output:

- `"Green BL: Bay (2:30)"` when both map and landmark resolve.
- `"EBG: Stonemist (2:30)"` likewise for EBG using its short code.
- `"Green BL (2:30)"` when the map resolves but no landmark (fight with no position data or unknown landmark).
- `"{sanitizedZone} (2:30)"` when the zone can't be short-coded (raw zone name with WvW prefixes stripped).
- `"{sanitizedZone}"` when duration is unavailable.

### 5.3 Rollout

`buildFightLabelV2` replaces `buildFightLabel` at every call site. The old helper is deleted (no dual path; user directive: no back-compat). Callers to update:

- `src/renderer/StatsView.tsx`
- `src/renderer/stats/computeIncomingStrikeDamageData.ts`
- `src/renderer/stats/computeFightDiffMode.ts`
- `src/renderer/__tests__/labelUtils.test.ts` (rewritten against new format)
- Any other grep hit for `buildFightLabel(`

### 5.4 Surfaces

The new label shows up in all places that display a fight identifier:

- Fight history cards (`ExpandableLogCard.tsx`, `FightReportHistoryView.tsx`)
- Replay fight picker (new)
- Discord webhook summaries (`src/main/discord.ts`)
- Web report (`src/web/reportApp.tsx` + rollup UI)
- Any other user-facing surface that prints a fight name

## 6. Stats nav placement

`src/renderer/stats/hooks/useStatsNavigation.ts` — `STATS_TOC_GROUPS` gains a new top-level entry at the end:

```ts
{
    id: 'map',
    label: 'Map',
    icon: MapIcon,
    sectionIds: ['replay'],
    items: [{ id: 'replay', label: 'Replay', icon: Play }],
}
```

No sections are relocated.

## 7. Replay viewer

The viewer lives at **`src/renderer/stats/map/ReplayView.tsx`** and is a ported + extended version of axipulse's `MovementView.tsx`. A thin wrapper in **`src/web/ReplayViewWeb.tsx`** reuses it in the web report.

### 7.0 Fight picker

A horizontal, scrollable strip pinned above the replay canvas. One card per fight currently included in the stats-view aggregation (honors the active fight filter).

Each card shows:
- A thumbnail — the map image cropped + zoomed to the fight's average position, with a glowing dot at `avgPosition`.
- The new-format label (`Green BL: Bay (2:30)`).
- Timestamp (short).
- Squad size and a kills/deaths mini-indicator.

Default selection: the most recent fight with replay data. If none, the viewer renders an empty state with a one-line hint about enabling `parseCombatReplay`. Keyboard: ← / → steps through cards when the picker or canvas is focused. Selection persists via `selectedReplayFightId` in `statsStore`.

### 7.1 Layers (bottom to top)

1. **GW2 tile server tiles** when the map has tile data (ported `wvwTiles.ts`), falling back to the flat `mapImageUrl` image.
2. **Landmark pins** (ported `wvwLandmarks.ts`) — keeps / towers / camps / ruins / named points, with hardcoded coordinates.
3. **Heatmap layer** (new, toggle-able). Three modes: *death density*, *time-spent density*, *damage-taken density*. Rendered as a coarse 2D histogram rasterized to a canvas and blurred; composited under markers at low opacity. Computed once per fight per mode; cached.
4. **Enemy markers** — red-tinted class icons, down / dead status swaps.
5. **Per-party convex hulls** (toggle). Faint colored polygons outlining each party's current footprint.
6. **Ally trails** — recent solid polyline + older dashed polyline — plus class icons, commander tag, follow-target halo.
7. **Squad centroid + spread ring** (toggle). Persistent marker at squad-average position with a translucent ring whose radius is squad position stdev.
8. **Tag range rings** (toggle). Fixed 600 / 1200 unit rings around the commander (not the local player).
9. **Event overlay** (toggle). Pulse rings tied to existing axibridge timelines:
    - Spike-damage moment → yellow pulse ring on the ally dealing it.
    - Incoming-heal spike → green pulse ring.
    - Down → blue pin with a quick shrink.
    - Death → red skull burst at the player's last position.
    - **Rally rings** (toggle) → brief green ring when a downed ally is rallied.
    - **Target-focus lines** (toggle) → faint colored lines from each ally to the enemy they dealt the most damage to in the last ~2s.
    Pulses fade over ~1.5s of replay time, clipped to the current playhead.

### 7.2 Canvas overlay — squad health strip (toggle)

A thin band across the top of the canvas rendering ~50 tiny HP bars, ordered by party, colored by profession. Watch a whole party collapse at once.

### 7.3 Controls row (top of the canvas)

From left to right:
- Map short name (`Green BL`) and current-time readout.
- Selected-fight chip with an X to clear and re-pick.
- Follow chip (`Follow: {name}`) with X to clear (returns to commander default).
- Spotlight chip (`Spotlight: Party 3`) when active.
- **Layers popover** (gear icon) — see §7.4.
- Zoom in / out / reset.
- Fullscreen toggle.

### 7.4 Layers popover

Grouped toggles:

- **Squad overlay:** Centroid + spread ring · Tag range rings (600/1200) · Squad health strip · Per-party hulls · All-parties panel (swap from single-party panel to 5 mini-panels, see §7.5).
- **Events:** Fight phases on timeline · Rally rings · Target-focus lines · Damage/death pulses.
- **Heatmap (radio):** Off / Deaths / Time spent / Damage taken.

All toggle states live in `statsStore` so they persist through fullscreen toggles and nav.

### 7.5 Party panel (left sidebar)

Replaces axipulse's local-party-only panel with a **party selector** at the top (1–5, default = party with the most action, or commander's party). Selected party's members render with HP bars, status, boons, and recent skill casts — same UX as axipulse.

**All-parties panel** toggle switches the sidebar to 5 vertical mini-panels (one per party), each showing a compact HP bar stack + status dots + party number. Clicking a mini-panel swaps the main panel to that party.

Member tiles, tooltips, and markers on the canvas are clickable — clicking a player sets them as the **follow target**; clicking a party number sets them as the **spotlight target** (see §7.6).

### 7.6 Follow & spotlight

**Follow** centers the viewport on a selected player (any squad member). Default target is the commander when no explicit selection is made. Triggered by:
- Clicking a player marker on the canvas.
- Clicking a player entry in the party panel.
- The "Follow" chip in the controls row shows the current target; an X clears it back to commander default.

**Spotlight** dims everyone *except* the selected party. Opposite of follow — instead of moving the camera, it mutes unrelated markers to 0.2 opacity. Triggered by clicking a party number. Cleared via the Spotlight chip's X.

### 7.7 Synchronized side timeline

A 120px-tall strip below the map. Stacked mini-chart:

- Squad DPS (line).
- Kills / deaths tick marks.
- **Fight phase bands** (toggle) — auto-detected opening / push / retreat / cleanup phases from squad centroid velocity + enemy HP deltas + death bursts, labeled as clickable chips along the top edge of the strip.

The playhead syncs to `timeMs`. Click anywhere on the chart to scrub; drag the playhead to scrub. Replaces axipulse's bare `<input type="range">` slider.

### 7.8 Playback controls

Under the side timeline:
- Play / Pause button.
- Speed selector: 0.5× / 1× / 1.5× / 2× / 4×.
- Time readout: `M:SS / M:SS`.
- `Space` toggles play/pause when the Map section is focused.

## 8. File layout

```
src/shared/
  wvwLandmarks.ts            # ported verbatim from axipulse
  wvwTiles.ts                # ported verbatim
  mapUtils.ts                # ported + normalizeMapNameShort
  movementData.ts            # buildMovementData + MovementData, SquadMemberMovement types

src/renderer/stats/map/
  ReplayView.tsx             # the main viewer
  FightPicker.tsx            # horizontal thumbnail strip
  PartyPanel.tsx             # sidebar: party selector + member tiles, or all-parties view
  SyncedTimeline.tsx         # 120px strip with playhead + phases
  HeatmapLayer.tsx           # canvas-based heatmap
  EventOverlay.tsx           # pulse rings, skull bursts, rally rings, target-focus lines
  SquadOverlay.tsx           # centroid + spread, tag range rings, per-party hulls
  SquadHealthStrip.tsx       # thin band of ~50 tiny HP bars
  LayersPopover.tsx          # gear-icon popover containing the toggle groups
  FullscreenPortal.tsx       # portal + Esc handling + auto-hide picker
  hooks/
    useMovementData.ts       # builds + memoizes MovementData; requests hydration; LRU cap 3
    useReplayPlayback.ts     # timeMs / playing / speed — rAF loop
    useReplayViewport.ts     # scale / tx / ty, pan / zoom, follow-target
    useHeatmapData.ts        # computes + caches histogram buffers
    useSquadDerived.ts       # centroid, spread, hulls, phases (memoized per fight)

src/renderer/stats/sections/
  ReplaySection.tsx          # thin wrapper wiring the above into the stats section shell

src/web/
  ReplayViewWeb.tsx          # thin wrapper around ReplayView for the web report
```

## 9. Store additions

`src/renderer/stats/statsStore.ts` adds:

```ts
selectedReplayFightId: string | null
replayPlayhead: { timeMs: number; playing: boolean; speed: number }
replayViewport: { scale: number; tx: number; ty: number; followTarget: string | null }
replayLayers: {
    centroidSpread: boolean
    tagRangeRings: boolean
    allPartiesPanel: boolean
    squadHealthStrip: boolean
    partyHulls: boolean
    phases: boolean
    rallyRings: boolean
    targetFocusLines: boolean
    damagePulses: boolean
    heatmap: 'off' | 'deaths' | 'time' | 'damage-taken'
}
replaySelectedParty: number  // 0 = default (heuristic); 1–5 = explicit
replaySpotlightParty: number | null
```

All persist across fullscreen toggles and nav within the stats view.

## 10. Performance

- **Lazy loading.** `MovementData` is built only when the user picks a fight. Memoized by fight id in an LRU cache (cap: 3 fights).
- **Polyline downsampling.** Non-party / non-commander / non-local allies have their trails downsampled at low zoom; full-rate polyline returns for members currently zoomed in or selected.
- **Heatmap caching.** Per-fight, per-mode; invalidated only when the fight selection changes.
- **Squad-derived caching.** Centroid, spread, party hulls, phase boundaries computed once per fight at a coarse tick rate (~1 s) and interpolated for playback.
- **rAF playback.** One shared rAF loop drives `timeMs`; children derive visual state from it — no per-marker state updates.
- **Picker thumbnails.** Generated once per fight when the picker mounts: map image cropped + zoomed to the fight's average position with an SVG dot overlay. Cached on the fight record. Static — no per-frame cost.
- **Worker boundary.** `buildMovementData` is pure; if profiling shows it's slow for big fights, move it into `statsWorker.ts`. Start inline.

## 11. Testing

- **Unit (vitest):**
    - `mapUtils.resolveMapFromZone` / `normalizeMapNameShort` / `formatDuration`.
    - `wvwLandmarks.findNearestLandmark`.
    - `labelUtils.buildFightLabelV2` covering: both resolve, only map resolves, neither resolves, WvW prefix variants.
    - `movementData.buildMovementData` fixture-driven against `test-fixtures/ei/` (existing `ParseCombatReplay=True` fixture).
    - `useSquadDerived` — centroid, spread, phase-detection output shape.
- **Regression:** snapshot tests covering the label change in fight lists, Discord payloads, web report rollup.
- **E2E (Playwright):**
    - Open stats view → navigate to Map group → assert picker renders.
    - Select a fight → assert the replay canvas renders.
    - Play / pause / scrub via timeline.
    - Toggle fullscreen and back; selection + playhead persist.
    - Toggle each layer group; assert DOM markers appear / disappear.
    - Click a player marker → assert Follow chip shows their name.
    - Click a party number → assert Spotlight chip shows the party.
- **Audit scripts:** no changes. Replay is pure presentation.

## 12. Open questions

None at spec time. Defer minor UI-polish calls (icon choices, chip colors, phase-detection thresholds) to implementation.

## 13. Rollout notes

- Flipping `ParseCombatReplay` to `true` slows local EI parses modestly and grows on-disk / in-memory JSON size. Monitor; revisit if regressions show up on low-RAM setups.
- Web report bundle size grows by ~200–500 KB per fight. If total reports start exceeding GitHub Pages comfort limits (~100 MB), chunk replay data into per-fight JSON files loaded on demand.
