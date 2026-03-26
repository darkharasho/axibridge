# Stats Section Fullscreen & Dense Table UI Refresh

## Problem

The stats sections have two fullscreen patterns that have fallen behind the app's evolving design language:

1. **Chart + Drilldown sections** (HealEffectiveness, and pattern shared by SpikeDamage/BoonTimeline) — the `SkillTable` component and fight details area use plain grids without bordered containers, stat summary cards, or proper fullscreen space utilization. Tables have fixed `max-h-[320px]` caps that waste space in fullscreen.

2. **Dense table sections** (Offense, Defense, Support, Conditions, DamageModifiers, BoonOutput, Healing, SpecialBuffs, Apm, DamageMitigation, PlayerBreakdown, FightBreakdown, HealingBreakdown — 13 sections) — the fullscreen toolbar sits in a flat bordered box that feels disconnected, the table header has weak visual weight, there's no active sort column highlighting, and filter chips are unstyled gray.

## Goal

Visual-only refresh of both fullscreen patterns to match the app's current design aesthetic. No functional changes — same data, same interactions, same components.

## Constraints

- Pure UI refresh — no data flow, prop, or interaction changes
- Must work in both Electron app and web report contexts
- CSS changes go in `index.css` (shared between Electron and web)
- Existing theme CSS variables (`--bg-card`, `--border-default`, `--text-secondary`, etc.) must be used — no hardcoded colors
- Web report theme contract tests (`statsThemesContract.test.ts`) must pass

## Design

### Pattern A: Chart + Drilldown Fullscreen

Applies to: `HealEffectivenessSection.tsx` (primary target). The pattern is also used by SpikeDamage and BoonTimeline but those already have most of the polish — HealEffectiveness is the main gap.

#### A1. Summary Stat Cards

Replace the inline text spans in the fight details area:
```
Incoming: 42,300 · Healing: 38,100 · Barrier: 4,200 · Healing + Barrier: 42,300
```

With a proper `grid md:grid-cols-4 gap-3` stat card row matching SpikeDamage/BoonTimeline's layout:
- Each stat: `text-[10px] uppercase tracking-[0.35em]` label + large `text-lg font-black font-mono` value
- Incoming damage: `text-rose-200` accent
- Healing: `text-[#86efac]` accent (green)
- Barrier: `text-[color:var(--text-primary)]` (white)
- Selected fight label: `text-sm text-[color:var(--text-primary)]` with truncation

When no fight is selected, show "Select a fight to view details" in the fight label slot.

#### A2. Skill Tables → Bordered Containers

Replace the current `SkillTable` component styling:

**Current:** `rounded-[var(--radius-md)] overflow-hidden min-h-[260px]` with internal borders only.

**Proposed:** Wrap in `border border-[color:var(--border-default)] rounded-[var(--radius-md)]` container with:
- Header bar: title + skill count badge (`{rows.length} skills`) in `flex justify-between`
- Column headers: same grid but inside the container
- Scrollable body: `overflow-y-auto` with flex-based height instead of fixed `max-h-[320px]`

Skill icon treatment: keep existing `InlineIconLabel` for healing skills. For incoming damage skills, keep the existing rose-tinted text color.

#### A3. Fullscreen Layout

**Current:** Content stacks vertically with fixed heights. Tables use `max-h-[320px]`.

**Proposed:** Use `flex flex-col gap-4` wrapper:
- Chart area: `flex-shrink-0` with height `h-[360px]` (already exists for expanded)
- Summary stat cards: `flex-shrink-0`
- Skill tables container: `flex: 1 1 auto; min-height: 0` — tables fill remaining viewport height
- Each table column: `flex flex-col` with scrollable body taking `flex: 1; min-height: 0; overflow-y: auto`

This matches the CSS rules already in place for `.modal-pane > .flex.flex-col.gap-4 > :last-child` which sets `flex: 1 1 auto; min-height: 0`.

#### A4. Minor Polish

- "Clear" button: match `text-[10px] uppercase tracking-[0.2em]` style from SpikeDamage
- Empty state: already uses dashed border pattern (no change needed)
- Chart description text: shorten to "Click a point to view skill breakdown" (remove color legend — the tooltip already explains)

### Pattern B: Dense Table Fullscreen

Applies to: all 13 sections using `DenseStatsTable` in their expanded (fullscreen) view. Changes are in `DenseStatsTable.tsx`, `index.css` dense-table rules, and the toolbar layout in each section's expanded branch.

#### B1. Toolbar Layout

**Current:** Toolbar controls are wrapped in a bordered box div (`border rounded-[var(--radius-md)] px-4 py-3` with `bg-hover` background).

**Proposed:** Remove the box wrapper. Controls sit directly under the section header:
- Controls row: `flex gap-2 flex-wrap items-center` with `padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle)` as the visual separator
- Add a `h-5 w-px bg-[color:var(--border-subtle)]` vertical divider between filter controls (SearchSelect, ColumnFilter, PlayerFilter) and the PillToggleGroup
- PillToggleGroup: wrap in a subtle container `bg-white/[0.03] rounded-[var(--radius-md)] p-0.5`

#### B2. Filter Chips

**Current:** Plain `border: 1px solid var(--border-default)` with `bg-hover`.

**Proposed:** Brand-tinted styling:
- Active chips: `border-[color:var(--accent-border)] bg-[var(--accent-bg)] text-[color:var(--brand-primary)]`
- "Clear All" button: keeps current neutral styling
- Close `×` icon: `opacity-60` for subtlety

This matches the selected player chip style already used in SkillUsageSection.

#### B3. Table Container

**Current:** Table grid sits directly in an `overflow-hidden` div.

**Proposed:** Wrap in a bordered container:
- `border border-[color:var(--border-default)] rounded-[var(--radius-md)] overflow-hidden`
- `display: flex; flex-direction: column` so the table body and scrubber stack properly
- The `HorizontalScrollScrubber` moves inside this container (after the scroll area, before the closing border)
- Container gets `flex: 1; min-height: 0` to fill remaining fullscreen height

#### B4. Header Row

**Current:** `border-bottom: 1px solid` with low-contrast text color.

**Proposed CSS changes to `.dense-table__head`:**
- `border-bottom-width: 2px` for stronger visual weight
- `background: rgba(255, 255, 255, 0.03)` subtle tint
- `padding: 0.4rem 0.5rem` (up from `0.25rem 0.3rem`) for more breathing room

#### B5. Active Sort Column Highlight

**Current:** `.dense-table__cell--active` and `.dense-table__head--active` classes exist in CSS (`background: #111c33`) but are not applied by `DenseStatsTable.tsx`.

**Proposed:** Apply `dense-table__head--active` to the sorted column header and `dense-table__cell--active` to all cells in the sorted column. Update the CSS:
- Header: `background: rgba(56, 189, 248, 0.06)` — subtle brand tint
- Cells: `background: rgba(56, 189, 248, 0.03)` — very subtle stripe
- Active cell values: `color: var(--text-primary); font-weight: 500` instead of `var(--text-secondary)`

In `DenseStatsTable.tsx`, add the `--active` class conditionally:
```tsx
// Header
className={`dense-table__head ${isActive ? 'dense-table__head--active' : ''} ...`}
// Cell
className={`dense-table__cell ${column.id === sortColumnId ? 'dense-table__cell--active' : ''} ...`}
```

#### B6. Row Padding

**Current:** `padding: 0.25rem 0.3rem` (4px 4.8px).

**Proposed:** `padding: 0.35rem 0.5rem` (5.6px 8px) — slightly more vertical and horizontal breathing room. This is a CSS-only change in `.dense-table__head, .dense-table__cell`.

## Files Changed

### Pattern A (Chart + Drilldown)

| File | Change |
|------|--------|
| `src/renderer/stats/sections/HealEffectivenessSection.tsx` | Restyle `SkillTable`, add summary stat cards, update fullscreen layout to flex |

### Pattern B (Dense Table)

**Shared (all 13 sections benefit):**

| File | Change |
|------|--------|
| `src/renderer/stats/ui/DenseStatsTable.tsx` | Add `--active` class to sorted column header and cells |
| `src/renderer/index.css` | Update `.dense-table__head` padding/border, `.dense-table__cell--active` colors, `.dense-table__head--active` colors |

**9 sections with toolbar box wrapper (remove box, add inline layout + divider + chip styling):**

| File | Change |
|------|--------|
| `src/renderer/stats/sections/OffenseSection.tsx` | Remove toolbar box wrapper, add inline layout with divider, update chip styling |
| `src/renderer/stats/sections/DefenseSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/SupportSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/ConditionsSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/DamageModifiersSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/BoonOutputSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/HealingSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/SpecialBuffsSection.tsx` | Same toolbar changes |
| `src/renderer/stats/sections/DamageMitigationSection.tsx` | Same toolbar changes |

**4 sections with custom expanded layouts (table container + chip styling only, no toolbar box to remove):**

| File | Change |
|------|--------|
| `src/renderer/stats/sections/ApmSection.tsx` | Wrap DenseStatsTable in bordered container, update chip styling |
| `src/renderer/stats/sections/PlayerBreakdownSection.tsx` | Same |
| `src/renderer/stats/sections/FightBreakdownSection.tsx` | Same |
| `src/renderer/stats/sections/HealingBreakdownSection.tsx` | Same |

### No changes needed

- `DenseStatsTable.tsx` grid structure — unchanged
- `HorizontalScrollScrubber.tsx` — unchanged (just moves inside the container border)
- `StatsTableShell.tsx` — unchanged
- `StatsTableLayout.tsx` — unchanged (only used in non-expanded view)
- `ChartContainer.tsx` — unchanged
- `SectionPanel.tsx` — unchanged

## Testing

- **Visual:** All 13 dense table sections in fullscreen — toolbar layout, chip styling, sort column highlight, row padding
- **Visual:** HealEffectivenessSection — normal view and fullscreen, with and without a fight selected
- **Visual:** Web report — verify themed rendering still works
- **Unit tests:** Existing tests should pass — no functional changes
- **Theme contract:** `npm run test:unit -- statsThemesContract` must pass
- **Typecheck + lint:** `npm run validate`
