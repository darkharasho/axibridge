# Squad Distance-to-Tag Table — Design

**Date**: 2026-04-26
**Status**: Approved (pending plan)

## Summary

Add a per-player table to the Squad Stats area showing each player's distance-to-commander statistics (avg, median, p95) aggregated across all fights in the current view. Hybrid data source: use replay position samples when available, fall back to per-fight `stackDist` averages when not.

## Motivation

Players want to see who consistently runs with the tag versus who tends to drift. The existing `SquadTagDistanceDeathsSection` only surfaces distance at moment-of-death; it does not show overall stickiness. A simple sortable table gives that view.

## Data Sources

The EI JSON exposes two relevant signals:

1. **`statsAll[0].stackDist`** — a single average distance per player per fight. Always present.
2. **Combat replay position tracks** — per-tick player and commander positions. Present only when `eiSettings.parseCombatReplay` is enabled (already used by `computeTagDistanceDeaths` and the Map Replay viewer).

### Per-fight source selection

For each `(player, fight)` pair:

- If the fight has replay data **and** a commander position track **and** the player has a position track → contribute raw per-tick distance samples.
- Otherwise → contribute the single `stackDist` value as one data point.

### Aggregation

Per player account across all fights they appeared in. The aggregation strategy depends on `source`:

- **Pure `replay`** (every contributing fight has replay samples): aggregate at the **sample level** — pool every per-tick distance sample across all fights, then compute avg/median/p95 from that pool. This preserves within-fight spike information (the main reason to use replay data).
- **Pure `fightAvg` or `mixed`**: aggregate at the **per-fight level** — collapse each fight to a single value (its `stackDist` for fightAvg fights, or the mean of replay samples for replay fights), then compute avg/median/p95 from those per-fight values. This prevents one heavily-sampled replay fight from drowning out other fights.

Output fields:

- `avg`, `median`, `p95`: as described above, rounded to integer for display.
- `sampleCount`: in pure replay mode, the total tick samples; in per-fight mode, equal to `fightCount`.
- `fightCount`: number of distinct fights the player appeared in.
- `source`: `'replay'` if every contributing fight used replay samples, `'fightAvg'` if every fight used the fallback, `'mixed'` otherwise.

p95 uses nearest-rank for simplicity. Values are reported raw — no 1200 cap.

## Commander Handling

Distinct commander accounts in the dataset = accounts flagged commander in any fight.

- If **commander count ≤ 2**: exclude commander accounts from the table entirely. They are not counted in any ranking/index (i.e., the table is built from non-commander rows only).
- If **commander count > 2**: include commander accounts as regular rows.

Rationale: with 1–2 commanders, their distance-to-self is structurally near zero and just noise. With 3+ tags present (e.g., multi-tag squads, raids), it becomes meaningful to compare them.

## UI

### Section component

`src/renderer/stats/sections/SquadDistanceToTagSection.tsx`, rendered in `StatsView` near `SquadTagDistanceDeathsSection`. Follows the same expandable-section pattern (uses `useStatsSharedContext`, `expandedSection`/`openExpandedSection`/`closeExpandedSection`).

### Table columns

| Column | Sortable | Notes |
|--------|----------|-------|
| Player | yes (alpha) | account name |
| Prof | no | profession icon + color via `professionUtils` |
| # Fights | yes | distinct fight count |
| Samples | yes | total contributed values |
| Avg | yes (default desc) | rounded integer |
| Median | yes | rounded integer |
| p95 | yes | rounded integer |
| Source | no | small badge: replay / fightAvg / mixed (tooltip explains caveat for fightAvg) |

### Min-attendance toggle

A toggle + numeric input above the table:

- Toggle: "Hide players under N fights" (default off).
- Numeric input: default 3 when enabled, min 1.
- When on, rows with `fightCount < N` are hidden. Hidden count surfaced as small text ("3 hidden").

### Empty state

If zero players qualify (e.g., no fights with `stackDist` data and no replay tracks), render the same dashed-border empty card pattern used elsewhere.

## Files to add / change

- `src/renderer/stats/computeDistanceToTag.ts` — new compute module + types.
- `src/renderer/stats/__tests__/computeDistanceToTag.test.ts` — unit tests.
- `src/renderer/stats/sections/SquadDistanceToTagSection.tsx` — new section.
- `src/renderer/StatsView.tsx` — wire the section into the squad stats layout.
- `src/renderer/stats/computeStatsAggregation.ts` (if needed) — surface inputs the new compute needs (replay tracks, stackDist, commander flags) on the aggregation result. Reuse what `computeTagDistanceDeaths` and `computeCommanderStats` already produce where possible.

## Tests

`computeDistanceToTag.test.ts` covers:

- Replay-only data: percentile computed from sample-level pool (pure replay mode).
- fightAvg-only data: percentile computed from per-fight values; `source === 'fightAvg'`.
- Mixed: some fights with replay, some without; replay fights collapse to per-fight mean before aggregation; `source === 'mixed'`.
- Mixed-mode anti-skew check: one fight with 1000 replay samples + four fightAvg fights produces output equivalent to 5 per-fight values, not 1004.
- Commander exclusion: ≤2 commanders → excluded; >2 commanders → included.
- Small N edge cases: N=1 (median = avg = p95), N=2.
- Player with zero data points → omitted from result.

## Out of scope

- Distance-to-tag charts/timelines (the deaths section already covers spatial drilldown).
- Per-fight breakdown view (only aggregate is requested).
- Exporting to CSV/Discord (not asked for).
- Auto-tuning the min-attendance threshold based on dataset size.
