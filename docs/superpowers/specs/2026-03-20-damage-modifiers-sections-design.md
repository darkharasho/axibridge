# Damage Modifiers Sections — Design Spec

Two new stats sections that show how buffs, traits, relics, and food affect outgoing and incoming damage using EI's damage modifier data.

## Overview

| Property | Value |
|----------|-------|
| Sections | `damage-modifiers` (offense), `incoming-damage-modifiers` (defense) |
| Data source | EI JSON `damageModifiers`, `incomingDamageModifiers`, `damageModMap` |
| Aggregation | Sum `damageGain`/`hitCount`/`totalHitCount`/`totalDamage` per modifier across fights |
| Layout | Sidebar (modifier list) + content (bar chart + table), fullscreen dense table |

## Data Layer

### New Types (`src/shared/dpsReportTypes.ts` and `src/main/dpsReportTypes.ts`)

```typescript
export interface DamageModifierInfo {
    name: string;
    icon: string;
    description: string;
    nonMultiplier: boolean;
    skillBased: boolean;
    approximate: boolean;
    incoming: boolean;
}

export interface DamageModifierData {
    id: number;
    damageModifiers: Array<{
        hitCount: number;
        totalHitCount: number;
        damageGain: number;
        totalDamage: number;
    }>;
}
```

**On `DPSReportJSON`** — add:
- `damageModMap?: Record<string, DamageModifierInfo>`
- `personalDamageMods?: Record<string, number[]>`

**On `Player`** — add:
- `damageModifiers?: DamageModifierData[]`
- `incomingDamageModifiers?: DamageModifierData[]`

### Pruning (`src/renderer/stats/utils/pruneStatsLog.ts`)

**Top-level**: Add `damageModMap` to preserved fields. Prune it like `skillMap`/`buffMap` — keep only `name`, `icon`, `description`, `incoming`.

**Per-player**: Add `damageModifiers` and `incomingDamageModifiers` to the `pick()` list. These arrays are already compact (just id + stats), no sub-pruning needed.

### Aggregation (`src/renderer/stats/computePlayerAggregation.ts`)

New fields on `PlayerStats`:

```typescript
damageModTotals: Record<string, {
    damageGain: number;
    hitCount: number;
    totalHitCount: number;
    totalDamage: number;
}>
incomingDamageModTotals: Record<string, {
    damageGain: number;
    hitCount: number;
    totalHitCount: number;
    totalDamage: number;
}>
```

**Logic**: For each fight's player, iterate the outer `damageModifiers` array (or `incomingDamageModifiers`). For each entry, access `entry.damageModifiers[0]` (the phase-0 / full-fight stats). Key is `"d${id}"` to match `damageModMap`. Sum all four numeric fields (`damageGain`, `hitCount`, `totalHitCount`, `totalDamage`) across fights per modifier ID.

### Aggregated modifier map

The stats aggregation output needs a merged `damageModMap` across all logs (since different logs may have different modifier sets). Store this on the aggregated stats object alongside existing maps like `skillMap`/`buffMap`.

## UI Sections

### Shared Component: `DamageModifiersSection.tsx`

A single component at `src/renderer/stats/sections/DamageModifiersSection.tsx` parameterized by:

| Prop | Offense value | Defense value |
|------|--------------|---------------|
| `incoming` | `false` | `true` |
| `sectionId` | `'damage-modifiers'` | `'incoming-damage-modifiers'` |
| `title` | `"Damage Modifiers"` | `"Incoming Damage Modifiers"` |
| `accentColor` | rose/red | blue |
| `dataKey` | `damageModTotals` | `incomingDamageModTotals` |

### Section Placement (`ORDERED_SECTION_IDS`)

- `'damage-modifiers'` — after `'offense-detailed'`
- `'incoming-damage-modifiers'` — after `'defense-detailed'`

### Collapsed View

**Sidebar** (left pane via `StatsTableLayout`):
- Search input to filter modifiers by name
- Modifier list sorted by total squad `damageGain` descending (absolute value for incoming)
- Each item: modifier icon (from `damageModMap`), name, total squad damage gain subtitle
- Active item highlighted with section accent color

**Content pane** (right):
1. **Header**: Modifier name + description from `damageModMap`
2. **Bar chart**: Horizontal bars, one per player who had this modifier
   - Width proportional to `damageGain / maxDamageGain * 100%` (relative to top player)
   - Rendered as styled `div` elements (no charting library)
   - Label inside bar: `+damageGain (% of total damage)`
   - Player name + profession icon left of bar
   - Sorted by damage gain descending
   - **Offense**: rose/red gradient bars, all positive
   - **Defense (incoming)**: bidirectional — negative `damageGain` = green/teal bars extending left (damage reduced, good), positive = red bars extending right (damage increased, bad)
3. **Detail table** (below bars): sortable via column headers
   - Columns: Rank, Player, Damage Gain, % of Total Damage, Hit Coverage (hitCount/totalHitCount), Fight Time
   - Default sort: Damage Gain descending

### Expanded/Fullscreen View

Uses existing `DenseStatsTable` component:
- **Columns**: Each modifier found across the squad (filterable via `ColumnFilterDropdown`)
- **Rows**: Each player (filterable via player dropdown)
- **Cell values**: Formatted `damageGain` or "—" if modifier wasn't active for that player
- **Sort**: Click column header to sort by that modifier's damage gain
- Standard expanded view controls: `SearchSelectDropdown`, `ColumnFilterDropdown`, player filter, clear all button, active filter pills

### State Management

Props from `StatsView.tsx` (same pattern as other sections):

```typescript
type DamageModifiersSectionProps = {
    search: string;
    setSearch: (value: string) => void;
    activeMod: string;        // selected modifier ID
    setActiveMod: (value: string) => void;
};
```

Uses `useStatsSharedContext()` for shared values (stats, expanded section, format helpers, etc.).

The hook `useMetricSectionState` won't directly apply since modifiers aren't static metrics — instead, the section builds its own modifier list dynamically from the aggregated data. However, the expanded view's column/player filtering and sort state follow the same patterns.

## Files Changed

| File | Change |
|------|--------|
| `src/shared/dpsReportTypes.ts` | Add `DamageModifierInfo`, `DamageModifierData` interfaces; add fields to `DPSReportJSON` and `Player` |
| `src/main/dpsReportTypes.ts` | Mirror same changes |
| `src/renderer/stats/utils/pruneStatsLog.ts` | Preserve `damageModMap` (top-level, pruned to name/icon/incoming) and `damageModifiers`/`incomingDamageModifiers` (per-player) |
| `src/renderer/stats/computePlayerAggregation.ts` | Add `damageModTotals`/`incomingDamageModTotals` to `PlayerStats`; aggregate modifier data in player loop |
| `src/renderer/stats/statsTypes.ts` | Add modifier totals to `PlayerStats` type if defined there |
| `src/renderer/stats/sections/DamageModifiersSection.tsx` | **New file** — shared component for both sections |
| `src/renderer/StatsView.tsx` | Add section IDs to `ORDERED_SECTION_IDS`; add state variables; render both section instances; add to `StatsSharedContext` if needed |
| `src/renderer/stats/computeStatsAggregation.ts` | Merge `damageModMap` across logs into aggregated output |

## Out of Scope

- Per-fight breakdown of modifier activity (future enhancement)
- Grouping modifiers by type (shared vs personal) — sorted by damage gain instead
- `damageModifiersTarget` (per-target modifier breakdown) — not needed for squad-level view
- `personalDamageMods` usage — not needed since we discover modifiers from player data directly
