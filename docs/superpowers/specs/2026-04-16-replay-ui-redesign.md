# Replay UI Redesign — Design Spec

## Goal

Redesign the Replay section so the map fills all available space, the squad panel is a collapsible right-side panel (not a fixed sidebar), the fight picker is collapsible, and member cards match the axipulse player card style with real GW2 boon icons, HP%, and per-second skill display.

---

## Architecture

The redesign is contained entirely within `src/renderer/stats/map/`. No new data pipeline work is needed — all required data (`healthPercents`, `boonStates`, `skillCasts`, `boonIcons`, `skillIcons`, `deadRanges`, `downRanges`) is already present in `ReplayFightPayload`. The layout restructures `ReplayView` from a `260px sidebar + 1fr map` grid into a `flex row` of `map area + collapsible right panel`, with the fight picker above as a collapsible strip.

The two new pieces of UI state (picker collapsed, panel collapsed) are local `useState` in `ReplayView` — they don't need to persist to the zustand store.

---

## Components

### `ReplayView.tsx` (modified)
Top-level layout owner. Replaces the `260px 1fr` grid with:
```
[FightPickerBar — collapsible]
[map SVG | ReplaySquadPanel — collapsible]
[controls bar]
```
- Owns `pickerCollapsed: boolean` and `panelCollapsed: boolean` local state
- Moves zoom controls to float left on the map (was top-right toolbar)
- Attaches wheel zoom handler directly to the SVG container ref (cursor-centered, axipulse algorithm)
- SVG `style.flex = 1` so it fills all remaining height

### `FightPickerBar.tsx` (new, replaces inline `FightPicker` usage)
Wraps `FightPicker` with a collapse toggle:
- **Expanded**: left-edge collapse button (▲) + horizontal card strip with thumbnails
- **Collapsed**: 34px slim bar — "▼ Show all fights" button + active fight chip + fight count ("2 of 5") + ◀▶ prev/next arrows

### `ReplaySquadPanel.tsx` (new, replaces `PartyPanel`)
Right-side collapsible panel, 230px wide:
- **Expanded**: header ("Squad · N members" + ▶ collapse button) + scrollable member list grouped by party with `PartyMemberCard` per member
- **Collapsed**: 28px vertical rail with ◀ arrow + rotated "SQUAD" label

### `PartyMemberCard.tsx` (new)
Axipulse-style member card. Three rows:
1. **Identity row**: profession icon (24px circle) + optional commander diamond tag above icon + member name + spec + HP% (numeric, color-coded)
2. **HP bar**: 3px thin bar, color matches HP%
3. **Boon row**: all active boons at current second — 22px icons from `boonIcons[id].icon`, grey ring = inactive
4. **Skills row**: all skill casts within `[timeMs, timeMs + 1000)` — 22px icons from `skillIcons[id].icon`

Status states:
- **Down**: orange HP bar, spec label appends "· DOWN" in orange
- **Dead**: red prof icon border, spec label appends "· DEAD" in red, no boons, no skills, HP shown as "—"

### `useReplayViewport.ts` (modified)
- `MIN_SCALE = 1`, `MAX_SCALE = 50`, `ZOOM_STEP = 0.15`
- Add `attachWheelZoom(ref: RefObject<HTMLElement>): () => void` — attaches passive:false wheel listener using axipulse cursor-centered algorithm:
  ```ts
  const next = clamp(prev.scale * (1 - Math.sign(e.deltaY) * ZOOM_STEP), MIN_SCALE, MAX_SCALE);
  const ratio = next / prev.scale;
  tx = prev.tx - (ratio - 1) * (mouseX - prev.tx);
  ty = prev.ty - (ratio - 1) * (mouseY - prev.ty);
  ```
  where `mouseX = e.clientX - rect.left - rect.width/2`, `mouseY` analogous.
- Button zoom (`zoomIn`, `zoomOut`) uses `ZOOM_STEP * 2` (same as axipulse button zoom)
- Remove container dimension args (no longer needed for viewport math — only `centerOn` needs them, pass separately)

---

## Data Queries

All computed per render tick in `PartyMemberCard` (same pattern as existing `PartyPanel`):

| Field | Source | Logic |
|---|---|---|
| `hp` | `member.healthPercents` | Walk series up to `timeMs`, take last value |
| `status` | `member.deadRanges`, `member.downRanges` | Check if `timeMs` falls in any range |
| `activeBoons` | `member.boonStates` | All boon IDs where stacks > 0 at `timeMs` |
| `activeSkills` | `member.skillCasts` | All casts where `time >= timeMs && time < timeMs + 1000` |

---

## Commander Marking

Use `CommanderTagIcon` (already exists at `src/renderer/ui/CommanderTagIcon.tsx`) as:

**In the map SVG**: render a `<foreignObject>` or inline SVG diamond above the commander's dot. Simpler: add a `<polygon points="..."/>` diamond shape in amber (#fbbf24) positioned above the dot, 14×14px, same approach as `WVW_LANDMARKS` circles.

**In the party panel**: `PartyMemberCard` renders a `<div>` diamond overlay (14px, amber, clip-path diamond) absolutely positioned above the profession icon when `member.isCommander`.

---

## Fight Picker State

When collapsed:
- Active fight label: `fight.label` (e.g. "Green BL: Bay")
- Count: `currentIndex + 1` of `fights.length`
- ◀▶ arrows call existing `step(-1)` / `step(1)` from `FightPicker`

When expanded:
- Existing `FightPicker` card layout is preserved — thumbnails, label, meta line

---

## What Is Removed

- The `260px` left sidebar layout in `ReplayView`
- The `PartyPanel` component (replaced by `ReplaySquadPanel` + `PartyMemberCard`)
- The party tab buttons (P1–P5 selector) — replaced by scrolled party section headers
- `SquadHealthStrip` rendered above the SVG — no longer needed (HP is visible per-member in the panel). The `layers.squadHealthStrip` toggle in `LayersPopover` can remain but defaults off.
- The top toolbar row (map name, follow label, spotlight chip, zoom buttons, layers button) — map name and time move into the controls bar; chips float on the map; zoom/layers float left on map.

---

## Layout Dimensions

```
FightPickerBar:  expanded = ~68px tall | collapsed = 34px
map + panel:     flex:1 (fills remaining height)
  map:           flex:1 (fills remaining width)
  panel:         expanded = 230px | collapsed = 28px
controls bar:    ~42px
```

`ReplaySection` sets the container to `height: 720px` — no change needed there.

---

## Testing

- Existing e2e smoke tests for layer toggles and spotlight (`test/e2e/replay*`) should continue to pass — the SVG canvas and overlay chips remain in the DOM.
- Add unit tests for `PartyMemberCard` helper functions: `hpAt`, `statusAt`, `activeBoons`, `activeSkillsAt` (new: skills within 1s window).
- Manually verify: wheel zoom in/out stays centered on cursor; fight picker ◀▶ arrows cycle correctly; panel collapse/expand doesn't shift map layout.
