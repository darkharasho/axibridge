# Replay: map-first layout

Date: 2026-08-29
Status: design, awaiting review

## Problem

The replay view spends most of its area on chrome. Before the map draws a
single pixel it gives up:

- **~270px vertically** — `FightPickerBar` (34px), `SyncedTimeline` (19px
  header + 152px SVG + a wrapping row of phase chips), and a controls bar
  (~40px).
- **~450px horizontally** — `LayersPanel` (220px) and `ReplaySquadPanel`
  (230px), both docked as columns that squeeze the map rather than sitting
  over it.

The chrome is also redundant and hard to read. The clock is printed twice
(timeline header and controls bar). The layers panel is 20 stacked
checkboxes plus two inline legends, so the explanation of what a mark means
lives 400px away from the mark. The map itself has no legend and no scale,
and its objective labels are drawn at a weight that competes with the squad.

The goal: make the map the subject. Everything else floats over it, stays
legible, collapses when it is not being read, and explains itself where the
marks actually are.

## Direction

Full-bleed map with a floating HUD ("direction A" of three mocked options).
The SVG canvas fills the entire replay area edge to edge. Layers, squad,
fight identity, legend, zoom and transport become absolutely-positioned
cards over it. Nothing is docked.

This trades a little occlusion (cards sit on map content) for the largest
possible map and a resting state that can be reduced to almost nothing.
Direction B (drawers) and C (slim docked columns) were mocked and rejected:
B costs a click to see the roster, which is wanted permanently; C keeps the
map boxed in.

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│ ┌─Layers──┐        ┌─Fight identity─┐         ┌─Squad───────┐ │
│ │ chips   │        │ ◀ map · mm:ss ▶│         │ health strip│ │
│ │ grouped │        │ 3 of 11 · 40v34│         │ party 1  ⊙ ▾│ │
│ └─────────┘        └────────────────┘         │  member card│ │
│                                               │  member card│ │
│                    M A P   (full bleed)       │ party 2  ⊙ ▾│ │
│                                               │  ...        │ │
│ ┌─Legend──┐                            [+][-] │             │ │
│ │ ○ CC    │                            [↺][⛶] └─────────────┘ │
│ │ ✚ Down  │                                                   │
│ └─────────┘  ┌─Transport────────────────────────────────────┐ │
│              │ ▶ 1× 2× 4× 8× 01:52/03:04 [scrubber] [▲Lanes]│ │
│              │ (lanes band, collapsed by default)           │ │
│              └──────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

Card geometry: layers 216px wide top-left; squad 216px wide right, top to
just above the transport card; fight identity centred at top; legend
bottom-left above the transport; zoom cluster right, left of the squad
card; transport spanning between the legend and the zoom cluster.

## Components

Files are listed with what each one owns after the change. `ReplayView.tsx`
is 625 lines today and does layout, member rendering, objective rendering,
tooltips, viewport and keyboard handling all at once; the redesign is the
right moment to pull the two pure-render layers out of it.

### New

| File | Owns |
|---|---|
| `map/layers/MemberLayer.tsx` | Every squad/enemy marker: icon, trail, follow ring, downed cross, squad marker, hover tooltip target. Extracted verbatim from `ReplayView` first, restyled second. |
| `map/layers/ObjectiveLayer.tsx` | Landmark dots + labels, owner-tinted. Extracted from `ReplayView`, then restyled per *Map legibility*. |
| `map/ScaleBar.tsx` | A world-units ruler derived from `movementData.pixelsPerInch` and the current `viewport.scale`. |
| `map/MapLegend.tsx` | The "on the map now" card. Rows derive from which layers are enabled, so it never explains a mark that is not drawn. |
| `map/FightIdentityPill.tsx` | Map name, duration, "N of M", squad-vs-enemy counts, prev/next, and the chevron that opens the existing `FightPicker` overlay. Replaces `FightPickerBar`. |
| `map/TransportBar.tsx` | Play/pause, speed, single clock, the scrubber, and the lanes collapse toggle. Absorbs today's controls bar and the `SyncedTimeline` header. |
| `map/TimelineLanes.tsx` | The CC/strip mirrored lanes, split out of `SyncedTimeline`, rendered only when expanded. |

### Changed

| File | Change |
|---|---|
| `ReplayView.tsx` | Becomes a layout host: viewport, playhead, hit-testing, and absolutely-positioned HUD children. Target ≈250 lines. |
| `SyncedTimeline.tsx` | Reduces to the always-visible scrubber: phase ribbon, squad-DPS area, kill marks, playhead. Lanes move to `TimelineLanes`. Phase chips move into the scrubber as clickable segments rather than a separate wrapping row. |
| `LayersPopover.tsx` | Checkbox rows become wrapping toggle chips, colour-coded to the mark they control (amber = CC, fuchsia = strips). The two inline legend blocks move out: mark meanings to `MapLegend`, the per-lane-normalisation caveat to the lane chips' `title`. |
| `ReplaySquadPanel.tsx` | Collapsible party groups, thin scrollbar, health strip hosted in its header. |
| `PartyMemberCard.tsx` | Denser card, condition cluster added. |
| `SquadHealthStrip.tsx` | Unchanged component; moves from an absolute overlay across the top of the map into the squad panel header. |

### Deleted

`FightPickerBar.tsx` — superseded by `FightIdentityPill`. `FightPicker`
(the full overlay list) is kept as-is.

## Behaviour

### Timeline

Resting state is one row, ~66px: play, speed buttons, one clock
(`01:52 / 03:04`), and a single scrubber carrying the phase ribbon, the
squad-DPS area, ally/enemy kill marks and the playhead. The amber **Lanes**
button expands a ~52px band beneath it with the CC and strip lanes, giving
~132px expanded.

Lane labels move to a left gutter outside the plotting area. Today they are
drawn as an opaque plate at `x=0..92` *on top of* the bars, which hides the
opening seconds of every lane.

Collapsed is the default. The `ccLane` / `ccInLane` / `stripLane` /
`stripInLane` layer toggles keep their current meaning (which lanes exist);
the new collapse state is separate and lives in the store as
`replayLanesExpanded`.

The "not recorded" dashed-baseline treatment for absent series is preserved
exactly — it is the only thing distinguishing "never captured" from
"genuinely all zero".

### Legend

Rows: CC taken (amber ring), downed (orange cross), rallied (green ring),
killed (violet ring + dot), death heat (red blur), commander (tag), enemy
(red marker). Ownership colours are deliberately *not* in this legend —
sector tints are self-evident and the marks are not.

Rows backed by a layer toggle — CC taken (`ccTakenMarks`), rallied
(`rallyRings`), death heat (`heatmap !== 'off'`) — are emitted only when
that layer is on. Rows for marks that are always drawn — downed, killed,
commander, enemy — are always present. The card therefore shrinks as layers
are turned off but never empties.

### Squad panel

- Party groups render **expanded by default**; clicking a party header row
  collapses/expands that group. Collapsed state is per-party, session-scoped
  (`replayCollapsedParties: Set<number>` in the store).
- The header row is no longer the spotlight control. Spotlight moves to a
  small crosshair button at the right of the header, `aria-pressed` as
  today. This is the one behavioural collision the redesign creates and it
  is resolved in favour of collapse-on-row, because collapse is the more
  frequent action.
- A thin scrollbar: new `.replay-scroll` class in `index.css` overriding
  `--scrollbar-size` to 6px with a transparent track, scoped to the replay
  panels. The app-wide 10px/12px scrollbars stay untouched.
- The health strip sits in the panel header, gated by the existing
  `squadHealthStrip` layer toggle (which now means "show the strip in the
  squad panel" rather than "overlay it on the map").

### Member card

One row of identity — profession icon, name, spec/status, HP%, and the
current cast as a bare 20px icon — then the HP bar, then a buff row:
boons with stack badges, a hairline divider, then conditions. Roughly 62px
against ~90px today; the saving comes from dropping the skill *name* string,
which forced its own 20px row.

### Conditions on the card

Conditions are not in the payload today. `buildMovementData` filters
`buffUptimes` through `TRACKED_REPLAY_BUFF_IDS` — 12 boons, no conditions.

Extend `src/shared/replayBuffs.ts` with a second exported set,
`TRACKED_REPLAY_CONDI_IDS`, and union the two at the single call site in
`incrementalAggregation.ts`. Ship a curated set rather than all conditions,
because `replayFights` is already ~66% of `report.json` and every tracked
id adds a per-member state series:

```
738 Vulnerability · 722 Chilled · 727 Immobile · 720 Blind
742 Weakness      · 791 Fear    · 721 Crippled · 26766 Slow
```

Eight ids, chosen because they change what a player can *do* in a WvW
fight. Damage conditions (bleed/burn/poison/torment/confusion) are excluded
from the default set: five more series per member for information the
health bar already conveys. `movementData.boonIcons` is keyed by id and
built from the same catalog, so condition icons resolve with no further
plumbing; the card distinguishes the clusters by border tint and the
divider, not by a separate icon map.

Expected payload cost: +8/12 ≈ +67% on the `boonStates` portion of each
member. This is the one part of the design that is not free, and it is
worth confirming against a real report before merging — if it lands badly,
the fallback is to cut the set to four (Vulnerability, Immobile, Chilled,
Blind).

### Map legibility

- Player markers keep the existing counter-scaled group so they stay a
  constant screen size at any zoom. Unchanged — this is what makes the map
  readable when zoomed out, and the mocks confirmed it reads correctly at
  ~11px against a 40-player blob.
- Objectives shrink: a 5px dot for keeps/towers, 3.5px for camps/ruins,
  with a 9px letter-spaced muted label. Today they are 6px dots with 9px
  labels painted with a 2.5px black stroke and white fill, which makes text
  the loudest element on the map. The label may now be occluded by the
  squad, which is correct at fight zoom.
- Sector fills drop to 5% alpha and strokes to 1.6px, so ownership reads as
  a tint rather than as a set of hard borders across the fight.
- A scale bar bottom-left, gated by a new `scaleBar` layer toggle.

### Responsive behaviour

`ReplayView` is re-exported unchanged by `src/web/ReplayViewWeb.tsx`, so
the HUD has to survive the web report's narrower containers. Floating cards
that eat the whole map are worse than docked ones. Rules, driven by a
`ResizeObserver` on the map container that already exists for viewport
sizing:

- container < 1100px: layers auto-collapses to its rail button.
- container < 900px: squad auto-collapses too.

Auto-collapse never overwrites an explicit user choice made at a wider
size — it sets a derived "forced collapsed" flag, not the stored one.

## State

All new state is session-scoped in `useStatsStore`, consistent with the
existing replay state (nothing in this store is persisted today):

```ts
replayLanesExpanded: boolean;              // default false
replayCollapsedParties: Set<number>;       // default empty = all expanded
replayLayers.scaleBar: boolean;            // default true
```

`resetReplayLayers` gains `scaleBar`. No changes to `replayViewport`,
`replayPlayhead`, `replaySpotlightParty` or the layer keys that already
exist.

## Data flow

Unchanged. `ReplayFightPayload` gains nothing; `movementData.boonStates`
simply carries more ids once the condi set is unioned in. The HUD reads the
same store slices the current panels read. `useSquadDerived`, `useHeatmapData`
and `useReplayViewport` are untouched.

## Testing

Existing tests that must be updated rather than deleted:

- `FightPickerBar.test.tsx` → rewritten as `FightIdentityPill.test.tsx`,
  keeping the prev/next stepping and boundary-disable assertions.
- `SyncedTimeline.test.tsx` / `SyncedTimeline.phases.test.tsx` → split to
  match the scrubber/lanes split. The "not recorded" assertions move to
  `TimelineLanes` and must keep asserting the dashed-baseline testids.
- `ReplaySquadPanel.test.tsx` → add collapse/expand per party, assert
  spotlight moved to the crosshair button and that the header row no longer
  toggles it.
- `SquadHealthStrip.test.tsx` → unchanged component, but its mount point
  moves; the test asserting it renders should render it via the squad panel.

New tests:

- `MapLegend` emits a row per active layer and nothing when all are off.
- `TransportBar` starts collapsed and expands the lanes band on click.
- `PartyMemberCard` renders condition icons after the divider and boons
  before it, and reserves stable height when neither is present.
- `ObjectiveLayer` sizes major vs minor objectives differently.

`npm run validate` and `npm run test:unit` must pass. The Playwright
electron suite touches the replay; check `test:e2e:electron` before merge.

## Out of scope

- Persisting layer/panel state across sessions. Nothing in the replay store
  persists today; changing that is its own decision.
- Damage-condition tracking (see *Conditions on the card*).
- Any change to how positions, phases, CC or strip series are computed.
- The `FightPicker` overlay's own layout.

## Open question for review

The condition set. Eight ids is a judgement call with a real payload cost
attached; four would be safer, twelve richer. Worth a decision before
implementation starts.
