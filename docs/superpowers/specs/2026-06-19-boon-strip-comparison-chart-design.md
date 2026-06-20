# Boon Strip Comparison Chart — Design

**Date:** 2026-06-19
**Status:** Approved for implementation planning
**Branch:** `feat/boon-strip-comparison-chart`

## Summary

Add a new per-fight diverging bar chart to the **Defense** section group that
compares squad **outgoing** boon disruption/generation against **incoming** boon
strips, one bar-pair per fight. The "up" (outgoing) series is switchable between
**Outgoing Strips** and **Boon Generation**; the "down" series is always
**Incoming Strips**. All three metrics are expressed as raw boon counts so they
share one Y axis cleanly.

The section ships to both the desktop renderer and the web report (it is a shared
`StatsView` section).

## Motivation

Players want to see, fight by fight, how much boon pressure the squad applied
(strips on enemies, or boons generated) versus how badly the squad was stripped.
The existing `SquadDamageComparisonSection` already establishes the exact visual
pattern (per-fight diverging bars, outgoing up / incoming down), so this mirrors
a familiar component.

## User-facing behavior

- **Location:** new section in the Defense TOC group, id `boon-strip-comparison`.
- **Chart:** recharts diverging `BarChart`, `stackOffset="sign"`.
  - **X axis:** fights (`F1`, `F2`, …), one entry per fight.
  - **Up (green):** the selected outgoing metric (positive values).
  - **Down (red):** Incoming Strips (negative values).
- **Mode selector:** a `PillToggleGroup` (mirroring `ConditionsSection`) with two
  options:
  - `Outgoing Strips`
  - `Boon Generation`
  - The toggle changes **only the up series**. The down series stays Incoming
    Strips in both modes.
- **Tooltip:** per fight — fight label, W/L marker, the active outgoing metric
  value, and incoming strips value. Labels reflect the active mode.
- **Legend:** two entries (outgoing/incoming) whose outgoing label updates with
  the mode.
- **Expand/collapse:** same maximize-to-modal behavior as the damage chart.
- **Empty state:** "No fight data available" when there are no fights.

## Units (why raw counts)

All three series are **raw boon counts**, so the shared Y axis is meaningful:

- **Outgoing Strips** = number of boons the squad stripped from enemies.
- **Incoming Strips** = number of boons enemies stripped from the squad.
- **Boon Generation** = number of boons the squad applied to allies (the count
  that strips remove), **not** boon-seconds / uptime generation.

This was an explicit decision: boon generation is a count of boons applied,
because that is the quantity strips take away. It keeps both up-modes in the same
unit as the down series.

## Data

### New per-fight aggregation (single source)

Add three fields to each `stats.fightBreakdown` entry, computed in the existing
per-fight squad-player loop in
`src/renderer/stats/computeFightBreakdown.ts` (where `totalOutgoingDamage` /
`totalIncomingDamage` are already produced):

| Field | Source (summed over squad players in the fight) |
|---|---|
| `totalOutgoingStrips` | `player.support[0].boonStrips` |
| `totalIncomingStrips` | `player.defenses[0].boonStrips` |
| `totalBoonsGenerated` | sum of `player.squadBuffVolumes[].buffVolumeData[].outgoing` |

The chart reads **only** `fightBreakdown` — the same source the sibling damage
chart uses. No reads from `fightDiffMode` or `boonTimeline`.

Counts are raw EI counts (no Disruption-Method weighting), matching the "raw
count" decision.

### Existing data confirmed

- `support[0].boonStrips` and `defenses[0].boonStrips` exist per player (already
  surfaced as the "Boon Strips" support metric and "Boon Strips (Incoming)"
  defense metric).
- `SquadBuffVolume = { id: number; buffVolumeData: { outgoing: number }[] }`
  exists on the player (`squadBuffVolumes?`). `outgoing` is a raw count of boons
  applied to the squad.

### Open verification (planning phase)

1. **`squadBuffVolumes` availability at aggregation time.** The worker prune
   deny-list (`useStatsAggregationWorker.ts` `PLAYER_DENY`) lists
   `squadBuffVolumesActive` but **not** `squadBuffVolumes`. Confirm
   `computeFightBreakdown` runs over details that still contain
   `squadBuffVolumes` (it ingests during `ingestLog` with full details). If the
   field is pruned or absent (e.g. depends on the Detailed WvW parser setting),
   `totalBoonsGenerated` falls back to `0` and the Boon Generation bars are empty
   — degrade gracefully, do not crash.
2. **Field naming/shape** of `buffVolumeData` entries in real fixtures, to be
   sure `outgoing` is the correct accessor across boon ids.

## Components and wiring

### New component

`src/renderer/stats/sections/BoonStripComparisonSection.tsx`

- Consumes `useStatsSharedContext()` (`stats`, `formatWithCommas`, expand/collapse
  helpers) like `SquadDamageComparisonSection`.
- Local state: `mode: 'strips' | 'generation'` (default `'strips'`).
- Pure transform `buildBoonStripChartData(fightBreakdown, mode)` →
  `{ index, fightId, shortLabel, fullLabel, isWin, outgoing, incoming }[]`,
  where `outgoing` is `totalOutgoingStrips` or `totalBoonsGenerated` per mode and
  `incoming` is `-Math.abs(totalIncomingStrips)`. This transform is exported for
  unit testing.

### Registration (follow existing pattern)

- `src/renderer/stats/hooks/useStatsNavigation.ts`: add `boon-strip-comparison`
  to the Defense group `sectionIds` and a TOC item (label "Boon Strips",
  icon `Eraser`).
- `src/renderer/stats/sectionColors.ts`: `'boon-strip-comparison':
  'var(--section-defense)'`.
- `src/renderer/StatsView.tsx`: import the component and register it in the two
  section lists (the `renderSectionWrap(...)` placement and the
  `{ id, element }` list), positioned within the Defense group.

## Testing

- **Unit (aggregation):** `computeFightBreakdown` produces correct
  `totalOutgoingStrips`, `totalIncomingStrips`, `totalBoonsGenerated` for a fight
  with multiple squad players; handles missing `support`/`defenses`/
  `squadBuffVolumes` (→ 0), and players in only one bucket.
- **Unit (transform):** `buildBoonStripChartData` selects the correct up-metric
  per mode, keeps incoming negative, preserves fight order/labels, and handles an
  empty `fightBreakdown`.
- Existing aggregation tests must stay green (the new fields are additive).

## Scope (YAGNI)

- **In:** per-fight squad totals, two up-modes, raw counts, desktop + web.
- **Out:** per-player-per-fight breakdown; Disruption-Method weighting;
  per-second/timeline view; boon-seconds/uptime generation; configurable down
  series.

## Risks

- `squadBuffVolumes` may be unavailable depending on parser settings → Boon
  Generation mode shows zeros. Acceptable degrade; surfaced via the empty bars
  (no separate error UI in v1).
- Adding fields to `fightBreakdown` increases `report.json` size negligibly
  (three numbers per fight).
