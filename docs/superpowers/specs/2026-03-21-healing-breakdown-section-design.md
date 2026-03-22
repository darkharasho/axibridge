# Healing Breakdown Section Design

## Overview

Add a new stats section that shows per-player, per-skill healing and barrier breakdowns aggregated across selected fights. Similar to DamageBreakdownSection but for healing/barrier, with side-by-side tables.

## Data Source

EI JSON provides per-skill healing and barrier distribution data:

- `player.extHealingStats.totalHealingDist[0]` — phase-0 array of healing skill entries
  - Each entry: `{ id: number, totalHealing: number, totalDownedHealing: number, min: number, max: number, hits: number, indirectHealing: boolean }`
- `player.extBarrierStats.totalBarrierDist[0]` — phase-0 array of barrier skill entries
  - Each entry: `{ id: number, totalBarrier: number, min: number, max: number, hits: number, indirectBarrier: boolean }`

Skill name and icon are resolved via `details.skillMap` and `details.buffMap` using the same `resolveSkillMeta` pattern used in damage breakdown and heal effectiveness.

## Types

New types in `src/renderer/stats/statsTypes.ts`:

```typescript
interface PlayerHealingSkillEntry {
    id: string;           // skill ID (e.g. "s59562")
    name: string;         // resolved skill name
    icon?: string;        // skill icon URL
    totalHealing: number; // sum across all fights
    hits: number;         // sum across all fights
    max: number;          // global max single hit across all fights
}

interface PlayerHealingBreakdown {
    key: string;              // "{account}|{profession}"
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    totalHealing: number;     // sum of all healing skills
    totalBarrier: number;     // sum of all barrier skills
    healingSkills: PlayerHealingSkillEntry[];  // sorted by totalHealing DESC
    barrierSkills: PlayerHealingSkillEntry[];  // same shape, totalHealing field holds barrier value
}
```

The `PlayerHealingSkillEntry` type is reused for both healing and barrier tables. For barrier entries, `totalHealing` holds the barrier amount (the field name is reused to keep one type).

## Aggregation

### Location

Inside `computePlayerAggregation.ts`, in the existing per-player loop, after the current healing totals block (lines ~803-849) and near the skill damage aggregation block (lines ~898-970).

### Logic

For each player in each log:

1. **Healing skills**: Iterate `player.extHealingStats.totalHealingDist[0]`. For each entry:
   - Resolve skill name/icon via `resolveSkillMeta(entry.id)`
   - Accumulate into `healingSkillMap[skillId]`: `totalHealing += entry.totalHealing`, `hits += entry.hits`, `max = Math.max(current.max, entry.max)`

2. **Barrier skills**: Same pattern for `player.extBarrierStats.totalBarrierDist[0]`:
   - Accumulate into `barrierSkillMap[skillId]`: `totalHealing += entry.totalBarrier`, `hits += entry.hits`, `max = Math.max(current.max, entry.max)`

3. After all logs processed for a player, convert maps to sorted arrays (descending by total).

4. Build `PlayerHealingBreakdown` with totals and sorted skill arrays.

### Output

Add `healingBreakdownPlayers: PlayerHealingBreakdown[]` to the aggregation result object, following the same pattern as `playerSkillBreakdowns: PlayerSkillBreakdown[]`.

Wire through the worker/inline aggregation path — no new worker messages needed since it's part of the existing aggregation result.

## UI Component

### File

`src/renderer/stats/sections/HealingBreakdownSection.tsx`

### Props

```typescript
type HealingBreakdownSectionProps = {
    healingBreakdownPlayers: PlayerHealingBreakdown[];
};
```

### Layout

- **Left pane**: Player list sorted by total healing, each row shows profession icon + player name + formatted total healing value
- **Right pane**: Two side-by-side tables when a player is selected:
  - **Total Healing** table (left): columns — Skill Name (with icon), Hits, Total, Avg, Max, Pct
  - **Total Barrier** table (right): same columns
- Avg = total / hits (computed at render time)
- Pct = skill total / player total healing or barrier (computed at render time)
- If a player has no barrier data, the barrier table shows an empty state
- Player filter text input (same as DamageBreakdownSection)

### Behavior

- Click a player in the left pane to select and show their skill tables
- Skills sorted descending by total
- Expand button for full-screen modal view (same as other sections)
- Consumes shared values from `StatsSharedContext`

## Registration

### Section ID

`healing-breakdown`

### ORDERED_SECTION_IDS

Insert after `'healing-stats'` and before `'heal-effectiveness'` in `StatsView.tsx`:

```
'healing-stats',
'healing-breakdown',   // <-- new
'heal-effectiveness',
```

### Navigation

In `useStatsNavigation.ts`, add to the `defense` group's `sectionIds` and `items` arrays, after `healing-stats`:

```typescript
{ id: 'healing-breakdown', label: 'Healing Breakdown', icon: ListTree }
```

Using `ListTree` (from lucide-react) to match the "breakdown" pattern used by Player Breakdown / Damage Breakdown. This differentiates it from the `HeartPulse` icon used by Healing Stats.

### StatsView.tsx

- Import `HealingBreakdownSection`
- Add `healingBreakdownPlayers` to `safeStats` normalization (as array fallback)
- Render `<HealingBreakdownSection>` after `<HealingSection>`, gated by `isSectionVisible('healing-breakdown')`
- Add `'healing-breakdown'` to any `needsXData` checks if lazy-loading applies (check if healing sections have this pattern)

### Web Report

No separate web-specific work needed. The web report renders the same `StatsView` component tree, so the section automatically works in both Electron and web as long as:
- The section is in `ORDERED_SECTION_IDS`
- The aggregation data is included in the stats output
- Shared CSS in `index.css` handles theming

## Metrics Spec

Add a new section to `src/shared/metrics-spec.md`:

```markdown
## Healing Breakdown (Per-Skill)

Per-player, per-skill healing and barrier totals aggregated across all selected fights.

### Source Fields

- `players[*].extHealingStats.totalHealingDist[0]` — per-skill healing distribution (phase 0)
- `players[*].extBarrierStats.totalBarrierDist[0]` — per-skill barrier distribution (phase 0)

### Entry Fields

Each entry contains: `id` (skill ID), `totalHealing`/`totalBarrier`, `hits`, `min`, `max`.

### Aggregation

For each player across all logs:
- **totalHealing/totalBarrier**: summed across fights
- **hits**: summed across fights
- **max**: global maximum single hit across all fights
- **avg**: derived at render time as total / hits
- **pct**: derived at render time as skill total / player grand total

### Implementation

- Aggregation: `src/renderer/stats/computePlayerAggregation.ts`
- Types: `src/renderer/stats/statsTypes.ts` (PlayerHealingSkillEntry, PlayerHealingBreakdown)
- UI: `src/renderer/stats/sections/HealingBreakdownSection.tsx`
```

After editing, run `npm run sync:metrics-spec`.

## Testing

- Unit test for aggregation logic: verify that `healingBreakdownPlayers` is produced with correct totals, hits, max across multiple logs
- Verify skill name/icon resolution from skillMap/buffMap
- Verify barrier skills are populated separately
- Verify empty/missing `totalHealingDist`/`totalBarrierDist` produces empty arrays gracefully
- Existing audit tests should continue to pass (no changes to existing metric outputs)

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/stats/statsTypes.ts` | Add `PlayerHealingSkillEntry`, `PlayerHealingBreakdown` |
| `src/renderer/stats/computePlayerAggregation.ts` | Add healing/barrier skill aggregation in per-player loop |
| `src/renderer/stats/computeStatsAggregation.ts` | Wire `healingBreakdownPlayers` into aggregation output |
| `src/renderer/stats/sections/HealingBreakdownSection.tsx` | New section component |
| `src/renderer/StatsView.tsx` | Import, register, render the new section |
| `src/renderer/stats/hooks/useStatsNavigation.ts` | Add nav entry in defense group |
| `src/shared/metrics-spec.md` | Add Healing Breakdown documentation |
| `docs/metrics-spec.md` | Synced copy (via `npm run sync:metrics-spec`) |
