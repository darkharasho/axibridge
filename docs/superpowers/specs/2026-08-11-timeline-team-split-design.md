# Squad vs Enemy Size — split enemies by WvW team

Date: 2026-08-11

## Problem

The "Squad vs Enemy Size" chart (`src/renderer/stats/sections/TimelineSection.tsx`)
plots one green friendly line and one red enemy line per log. In a three-way WvW
matchup the single enemy line hides which team you were actually fighting, and how
the two enemy teams traded off across a session.

## Goal

Make a team-split view the default: one line per WvW team, drawn in that team's real
colour, with your own team's line differentiated by a glow. Keep a toggle that
collapses the enemy lines back into today's single combined line.

## Scope

In scope: the timeline chart's data shape, its rendering, and its toggles. The chart
is rendered from `StatsView.tsx`, which the web report also mounts, so the web report
gets the change for free.

Out of scope: persisting the new toggle, the Discord surfaces, the commander matchup
view, and any change to how enemy totals are counted today.

## Approach

Per-team enemy counts are computed in `src/renderer/stats/incrementalAggregation.ts`.

> **Correction (2026-08-11, before planning):** an earlier draft of this spec named
> `src/renderer/stats/computeTimelineAndMapData.ts` as the site. That file is dead
> code — nothing in `src/` imports it; `incrementalAggregation.ts` only references it
> in a comment. The live path builds `timelineEntries` per log in `ingestLog`
> (~line 638) and emits `timelineData` in `finalize()` (~line 844). All of this
> spec's rules apply there instead.

`ingestLog` already iterates `details.targets` per log to produce the `enemies` total,
so bucketing the same targets by team is one extra pass over data already in hand, and
the no-roster fallback path lives in the same block.

Two alternatives were rejected:

- **Reuse `computeMatchup` (`src/shared/commanderMetrics/matchup.ts`)**, which already
  produces `enemyByTeam`. It is computed on the commander path with a much heavier
  payload, is not run for every log in a stats set, and filters enemies on
  `enemyPlayer === true` rather than the timeline's `!isFake`. Wiring it in would
  silently change enemy totals users already read off this chart.
- **Compute in `TimelineSection.tsx`.** The component receives `timelineData`, not raw
  logs.

## Data shape

Each `timelineData` point gains **three** fixed numeric keys, always present,
defaulting to `0`:

```
enemyRed, enemyGreen, enemyBlue
```

Fixed keys rather than a nested map, because a recharts `dataKey` must be a static
string per `<Line>`.

There is deliberately **no** stored `enemyUnknown`. The unknown bucket is derived at
render time as `max(0, enemies - (enemyRed + enemyGreen + enemyBlue))`.

> **Correction (2026-08-11, before planning):** an earlier draft stored a fourth
> `enemyUnknown` key. Deriving it instead makes the sum invariant structural rather
> than something tests must police, and — decisively — it makes the precomputed-stats
> path work for free. Web reports published before this change carry a `timelineData`
> with none of these keys; with a derived unknown, every point in such a report falls
> entirely into Unknown automatically, which is exactly the intended behaviour for a
> log set that cannot be split.

The existing `enemies` total is left exactly as it is, so Combined mode is identical to
the current chart.

### Bucketing rule, per log

1. Resolve `teamMapFromLog(details)` once.
2. For each non-fake target, resolve `getWvwTeamColor(t.teamID, map)` and add to the
   matching key.
3. `'unknown'` is not stored — it falls out of the derivation above.
4. **Collision guard:** the session squad colour's key is zeroed on every point in
   `finalize()`, so enemies resolving to your own colour fall into derived unknown. A
   bad id mapping must not draw enemies on your line.
5. **No roster** — `targets` is empty and the count came from
   `dashboardSummary.enemyCount` — no colour key is incremented, so the whole count
   lands in derived unknown.

Invariant: `enemyRed + enemyGreen + enemyBlue <= enemies`, for every log, with the
remainder being Unknown. This is what keeps By Team and Combined from disagreeing.

### Your team's colour

Session-level, not per-log, because there is one friendly line.

Per log, the squad's colour is `getWvwTeamColor(teamID, map)` for the first squad
player with a positive `teamID` — the same derivation `computeMatchup` already uses.
The session colour is then the most common non-unknown per-log colour across the set;
ties break red → green → blue. If no log resolves one, fall back to today's green
`#22c55e` and label the line "You".

Because aggregation is incremental — logs arrive one at a time and are never re-read —
this is accumulate-then-resolve rather than two passes: `ingestLog` increments a
`squadTeamColorCounts` tally and buckets enemies by their own colour, and `finalize()`
resolves the session colour, then zeroes that colour's key on every timeline point to
apply the collision guard.

The resolved colour is returned on the stats object as `squadTeamColor`. On the
precomputed-stats path it will be `undefined`, which takes the green/"You" fallback.

This matters when a set spans a matchup reset and your colour changed mid-set: the
majority colour wins and the chart stays readable rather than flickering.

## Rendering

Colours come from `WVW_TEAM_COLOR_META` in `src/shared/wvwTeams.ts` — red `#f87171`,
green `#4ade80`, blue `#60a5fa`, unknown `#9ca3af`. No new palette.

**Which lines render.** In By Team mode: your team's line, plus one line per enemy
colour with a non-zero count in at least one log of the set. The Unknown line appears
only if some log has unattributed enemies, so a set of modern logs draws three clean
lines and a set of old logs gets an honest grey line rather than a silent undercount.
Series render in `WVW_TEAM_COLOR_ORDER`, with your line last so it paints on top.

**The glow.** Your team's line is drawn twice: a `strokeWidth={7}` underlay at ~0.25
opacity in the same colour, then the normal `strokeWidth={2}` line on top. This is
preferred over an SVG `<filter>` because recharts' prop pass-through to the underlying
`<path>` is not contractual, and a blur filter costs per frame on a chart that
re-renders on hover. Only the top line carries `dot`/`activeDot`, so the tooltip fires
once per point.

**Toggle.** A second `PillToggleGroup` in the header row: `Enemies: [By Team |
Combined]`. Plain `useState` in `StatsView.tsx` defaulting to `'byTeam'`, styled like
the existing Friendly Count group. Not persisted — `timelineFriendlyScope` is not
persisted either, and a settings key for one chart toggle is scope this does not need.
The header already has `flex-wrap`, so it wraps at narrow widths.

**Legend.** A `<Legend>` is added; with up to four lines the colours are no longer
self-evident. Labels are colour names: "Red", "Green", "Unknown", and your own line as
"Blue (You)" — or "Blue (You + Allies)" when the Friendly Count toggle is on
Squad + Allies, since that line then includes non-squad allies.

**Combined mode** renders exactly today's chart: your team's line plus one red total
enemy line, legend "Blue (You)" and "Enemies".

The Squad / Squad + Allies toggle is unchanged and independent — it only controls what
feeds your team's line.

The empty state is unchanged.

## Testing

Run with `npx vitest run --maxWorkers=2`, per the repo's parallelism limit.

> **Correction (2026-08-11, before planning):** an earlier draft put the
> series-selection assertions in a `TimelineSection` component test. That cannot work.
> `ChartContainer` wraps recharts' `ResponsiveContainer`, which measures to 0×0 under
> jsdom — the test setup at `src/renderer/test/setup.ts` even suppresses the resulting
> "width(0) and height(0)" warning — so no `<Line>` or `<Legend>` ever reaches the DOM.
> Those assertions move to a pure series-resolver function instead, which is better
> isolation regardless. The component test keeps only what renders outside the chart:
> the header toggles.

**Unit — bucketing and squad colour**, driving `IncrementalStatsAggregator` end to end
(ingest logs, `finalize()`, assert on `stats.timelineData` / `stats.squadTeamColor`):

- Enemies split across two `teamID`s resolve to the right colour keys.
- The invariant `enemyRed + enemyGreen + enemyBlue <= enemies` holds for every point.
- A target with no `teamID` increments no colour key.
- A roster-less log increments no colour key, so its whole count derives as Unknown.
- An enemy sharing the session squad colour is zeroed by the collision guard.
- `enemies`, `squadCount`, and `friendlyCount` are unchanged from current behaviour on
  a fixture with no team ids at all.
- Squad colour: majority across logs wins; a tie breaks red → green → blue; all-unknown
  yields `'unknown'`.

**Unit — series resolver** (`resolveTimelineSeries`), the pure function that decides
which lines exist and how they are labelled:

- By Team yields one series per enemy colour present in at least one point.
- The Unknown series is absent when every point's colours sum to `enemies`, present
  when some point falls short.
- Combined yields exactly two series: friendly and "Enemies".
- The friendly label follows the friendly scope between "(You)" and "(You + Allies)".
- An unknown squad colour yields the green fallback and the bare label "You".
- A `timelineData` with no colour keys at all (legacy precomputed report) yields
  friendly plus Unknown only.

**Component — `TimelineSection`:** both pill groups render, the Enemies group shows By
Team as active on mount, and clicking Combined invokes the setter. Chart internals are
out of reach under jsdom, per the correction above.

Deliberately not covered: the glow underlay's visual appearance, and any Playwright
e2e. This is a presentational change inside an already-e2e-covered view, and asserting
on a decorative stroke would be brittle.

## Files touched

- `src/renderer/stats/timelineTeamSplit.ts` *(new)* — colour bucketing and session
  squad-colour resolution helpers.
- `src/renderer/stats/incrementalAggregation.ts` — `TimelineEntry` gains the three
  colour keys, `ingestLog` buckets and tallies, `finalize()` resolves and guards.
- `src/renderer/stats/sections/timelineSeries.ts` *(new)* — `resolveTimelineSeries`.
- `src/renderer/stats/sections/TimelineSection.tsx` — lines, glow, legend, toggle.
- `src/renderer/StatsView.tsx` — new `useState` for the enemy mode, plus
  `squadTeamColor`, passed to the section at both of its two call sites.
- New test files for the three layers.
