# Squad Distance-to-Tag Visual — Design

**Date**: 2026-04-26
**Status**: Approved (pending plan)

## Summary

Add a circular target visualisation below the Distance-to-Tag table. Each player is plotted as a profession-colored chip placed at a radius proportional to a chosen distance metric (avg / p25 / median / p75 / p95). Coloured threshold zones (green / yellow / orange / red) give immediate spatial feedback for "who's tight on the tag" vs "who's drifting".

## Motivation

The table answers "what are the numbers" but is dense to scan. A target/dartboard view makes squad cohesion legible at a glance: tight clusters near the centre = good, scattered chips toward the outside = drifting. Toggling between percentiles surfaces different stories — `avg` shows typical positioning, `p95` exposes the worst spike moments.

## Compute

### Add p25 and p75 to `DistanceToTagRow`

`src/renderer/stats/computeDistanceToTag.ts`:

```typescript
export type DistanceToTagRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    sampleCount: number;
    avg: number;
    p25: number;       // NEW
    median: number;
    p75: number;       // NEW
    p95: number;
    source: 'replay' | 'fightAvg' | 'mixed';
    isCommander: boolean;
};
```

`finalizeDistanceToTag` computes p25 and p75 with the same nearest-rank logic already used for p95 (`idx = ceil(P * N) - 1`, clamped). No other math changes.

The `DistanceContribution` and ingest layer are unchanged.

## UI

### Section component

`src/renderer/stats/sections/SquadDistanceToTagVisualSection.tsx`, rendered immediately after `SquadDistanceToTagSection` (in both the legacy squad block and the grouped squad-stats block in `StatsView.tsx`). Same expandable-section pattern.

### Layout

Pure SVG, no chart library.

- Square viewbox, e.g. `400 × 400`. Outer radius = `190` (10px padding).
- Outer radius represents `1500` units. Distances `> 1500` clamp to the outer edge.
- **Threshold zones** (semi-transparent fills, layered from outer to inner):
  - 1201–1500+: `rgba(239, 68, 68, 0.20)` (red)
  - 801–1200: `rgba(249, 115, 22, 0.18)` (orange)
  - 601–800: `rgba(234, 179, 8, 0.18)` (yellow)
  - 0–600: `rgba(34, 197, 94, 0.15)` (green)
- **Boundary rings**: dashed strokes at 600, 800, 1200 (`stroke-dasharray="3 3"`, `stroke="rgba(255,255,255,0.25)"`). Each labelled with a small numeric tag (`fontSize: 9`, `var(--text-muted)`) at the 3-o'clock edge.
- **Centre tag**: `r=8` filled circle in `var(--status-warning)` (gold), with a `★` glyph or a small `TAG` label below.

### Player chips

For each non-commander row (or all rows if commanders are included per the table's rule):

- **Radial placement**: `r = clamp(metric, 0, 1500) / 1500 * outerRadius`.
- **Angular placement**: deterministic per account name. Use a string-hash → angle in `[0, 2π)`, so toggling metrics moves chips inward/outward but never sideways. After the initial layout, run a single-pass collision-avoidance: for any pair within `2 × chipRadius` of each other, nudge them apart angularly (only along the same ring); cap iterations to keep render cheap.
- **Chip render**: `g` containing a `circle` (radius `7`) filled with `getProfessionColor(profession)` and a thin white stroke. Profession icon (`renderProfessionIcon`) overlaid only when expanded view (icons too small at default size).
- **Multi-class indicator**: small dot at the chip's edge if `professionList.length > 1` (matching the existing icon helper convention — already handled by the shared icon if used).
- **Hover tooltip**: account, profession, all five metric values, `# fights`, and source badge. Mirrors the table's tooltip content.
- **Commander chip(s)**: when included (commanderCount > 2), render with the `★` overlay so they're identifiable.

### Toolbar

Inline with the section title (matches the table's toolbar pattern). Pill-button group:

```
[ Avg ] [ p25 ] [ Median ] [ p75 ] [ p95 ]
```

Active button: `background: var(--brand-primary); color: var(--bg-elevated)`. Inactive: `background: var(--bg-card-inner); color: var(--text-secondary)`. Default selection: `avg`.

### Min-fights filter

Shares state with the table — same `filterEnabled` and `minFights` toggle. Implementation: lift those two pieces of state up to a small parent component (`SquadDistanceToTagGroup` wrapper) that renders both sections and threads the values + setters down. Both sections receive the filtered row list and render the same filter toolbar UI (table's toolbar already exists; the visual section reads the same values but does NOT render its own toggle to avoid duplication).

### Empty state

If zero rows after filter: dashed-border card "No distance data for the loaded fights." (same as table).

### Expanded mode

Standard `expandedSection` modal pattern; in expanded mode, viewbox grows to e.g. `600 × 600`, profession icons render inside chips, and chip radius bumps to `10`.

## Performance

- Layout cost: `O(N²)` collision pass capped at ~3 iterations. Typical squad ≤ 50 players → trivial.
- Chip positions memoised on `[rows, selectedMetric, expandedMode]`.

## Files to add / change

- `src/renderer/stats/computeDistanceToTag.ts` — add p25, p75 to row type and finalize.
- `src/renderer/stats/__tests__/computeDistanceToTag.test.ts` — extend tests to cover p25/p75.
- `src/renderer/stats/sections/SquadDistanceToTagVisualSection.tsx` — new component.
- `src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx` — basic render tests.
- `src/renderer/stats/sections/SquadDistanceToTagSection.tsx` — accept `filterEnabled` / `minFights` / setters as optional props (with internal-state fallback for backward compat / standalone use).
- `src/renderer/StatsView.tsx` — wrap the two sections in a small group component that owns the shared filter state, wire into both render locations.
- `src/renderer/stats/hooks/useStatsNavigation.ts` — add `squad-distance-to-tag-visual` to nav.
- `src/web/reportApp.tsx` — same nav entry.
- `src/renderer/stats/sectionColors.ts` — same defense color.
- `src/renderer/StatsView.tsx` section ID order list — add new ID after `squad-distance-to-tag`.

## Tests

`computeDistanceToTag.test.ts` additions:
- p25 and p75 emitted with correct nearest-rank values for known inputs.
- Single-data-point edge case: `p25 === p75 === avg`.

`SquadDistanceToTagVisualSection.test.tsx`:
- Renders empty state when no rows.
- Renders one chip per row with correct count.
- Toggle button click changes the active metric (verified by testing tooltip / data attribute).
- Chips with metric ≤ 600 sit inside the green zone radius (verified by attribute or computed style).

## Out of scope

- Animated transitions when toggling metrics (could be added later as a polish pass).
- Click-to-drilldown on chips (table already has hover tooltip with full info).
- Custom thresholds (zones are fixed at 600 / 800 / 1200).
- Per-fight overlay (this is an aggregate view).
