# No Ego Mode — Design

**Date:** 2026-06-22
**Status:** Approved (pending spec review)

## Summary

"No Ego mode" is a single master toggle that removes all competitive / ranking
framing from AxiBridge's stats — across **both** the desktop app and the
published web report — and replaces it with squad-level distribution readouts.

The guiding philosophy: focus entirely on **areas of improvement**, not on "who
did best." Concretely that means:

- No MVP podium (gold/silver/bronze), no crown, no #1/#2/#3 rank numbers, no
  "best value" highlighting, no head-to-head "who won" comparison.
- Each metric is presented as a **distribution**: squad **average**,
  **deviation** (σ), range, shown as a **visual dot-plot plus hard numbers**.
- **Outliers are surfaced only on the needs-improvement end.** High performers
  are never celebrated — emphasizing the high end is just ego-boosting in
  reverse. The "needs-improvement" end is chosen per metric using the catalog's
  `higherIsBetter` flag (low end for damage/cleanses/healing; high end for
  deaths/downs/damage-taken).

The mode must **permeate every surface**.

## Decisions (from brainstorming)

- **Core behavior:** hide rankings, surface gaps. Lean on averages + deviation +
  outliers rather than top performers.
- **Outlier framing:** named, but neutral; only the needs-improvement end is
  called out. High end shows on the plot as a dot but is never labeled/celebrated.
- **Control:** a single master toggle. When on, it overrides
  `showMvp` / `showTopStats` everywhere. Value is baked into `report.json` at
  publish time. No per-viewer web toggle.
- **Tables (Offense/Defense/Support):** rethought — the per-player grid stops
  being the primary object. Each section becomes a **list of metric cards** (every
  metric gets a card) with dot-plot + hard numbers + needs-improvement callouts.
  The full per-player grid remains available but **secondary, collapsed behind an
  expander**.
- **Top Skills section:** hidden in No Ego mode.
- **Player Comparison:** hidden in No Ego mode.
- **Rollup (`rollup.ts`):** computations always run in full (never gated off);
  its **display** follows the same No-Ego reframing (leaderboards → average /
  deviation / outlier readout).
- **Outlier threshold:** fixed at **1.5σ** from the mean for named callouts.

## Architecture

### Where the reshaping happens — shared util (Approach C)

A single new helper `src/shared/squadStats.ts` computes the distribution summary
from the per-player metric arrays that aggregation already produces. This avoids
changing the heavy worker payload / `report.json` size, avoids duplicating math
across sections, and makes the math unit-testable in isolation.

```
squadStats(values: number[], higherIsBetter: boolean): {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  players: { account, value, profession }[];   // all players, for the dot-plot
  needsImprovementOutliers: { account, value, profession }[]; // beyond 1.5σ on the bad end
}
```

- "Needs-improvement end" = low end when `higherIsBetter`, high end otherwise.
- Outlier = a player whose value is more than **1.5σ** from the mean on the
  needs-improvement end.

### Setting & plumbing

- Add `noEgoMode: boolean` to `IStatsViewSettings` (`src/renderer/global.d.ts`),
  default `false`; add to `DEFAULT_STATS_VIEW_SETTINGS`.
- Add a toggle in `SettingsView.tsx` near the existing `showTopStats` /
  `showMvp` toggles, with a one-line description.
- When `noEgoMode` is on it **overrides** `showMvp` / `showTopStats` regardless
  of their values (in `StatsView.tsx` where those settings are read,
  ~lines 230-236).
- The value flows into `report.json` at publish time via the same settings path
  the web report already consumes.

### Desktop renderer changes

| Surface | File | No Ego behavior |
|---------|------|-----------------|
| Top Players / MVP podium | `stats/sections/TopPlayersSection.tsx` | Replace podium + leaderboard cards with a **Squad Summary**: one card per top-stat metric (dot-plot + hard numbers + needs-improvement callouts). No podium/crown/medals/rank numbers. |
| Offense table | `stats/sections/OffenseSection.tsx` | Becomes a list of metric cards (every metric); full grid collapsed behind an expander. No rank numbers / best-value highlight. |
| Defense table | `stats/sections/DefenseSection.tsx` | Same as Offense. |
| Support table | `stats/sections/SupportSection.tsx` | Same as Offense. |
| Top Skills | `stats/sections/TopSkillsSection.tsx` | Hidden. |
| Player Comparison | `stats/sections/PlayerComparisonSection.tsx` | Hidden. |

The MVP calculation in `incrementalAggregation.ts` (~lines 1225-1248) may be
skipped when `noEgoMode` is on (no MVP is rendered), but this is an
optimization, not a correctness requirement.

### Metric card (shared presentation component)

A reusable card component renders one metric's distribution:

- **Dot-plot:** each player is a dot positioned by value across the squad
  min→max range; mean marked; ±σ band shaded. High-end dots are not styled
  differently from any other dot.
- **Hard numbers:** average, σ (deviation), and range (min–max).
- **Needs-improvement callouts:** named players beyond 1.5σ on the bad end,
  framed neutrally (e.g. "below squad range: PlayerX, PlayerY"). When there are
  none, show nothing (or a quiet "squad is consistent here").

Used by the Squad Summary, the Offense/Defense/Support sections, and the web
rollup, so the language stays identical everywhere.

### Web report

The web report reuses the same React components and reads settings from
`report.json`, so all of the above applies automatically when the baked flag is
`noEgoMode: true`. The rollup (`rollup.ts`) continues to compute all aggregates;
its display is converted to the metric-card treatment.

## Testing

- **Unit:** `src/shared/__tests__/squadStats.test.ts` — mean/σ correctness;
  outlier direction for both `higherIsBetter: true` and `false` metrics;
  edge cases (single player, all-equal values → σ 0 / no outliers, empty input).
- **Integration:** a `StatsView` test asserting that with `noEgoMode: true` the
  podium, rank numbers, Top Skills, and Player Comparison are **absent**, and
  squad-summary metric cards are **present**; and the inverse with
  `noEgoMode: false`.
- **Web:** confirm the web report honors the baked `noEgoMode` flag from
  `report.json`.

## Out of scope (YAGNI)

- Per-viewer toggle inside the web report.
- Configurable σ threshold (fixed at 1.5σ to start).
- New animations / chart libraries — the dot-plot is a simple inline render.
- Changing the underlying aggregation payload or `report.json` schema beyond the
  single `noEgoMode` flag.
