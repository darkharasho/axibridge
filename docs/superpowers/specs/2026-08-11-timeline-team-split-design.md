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

Per-team enemy counts are computed in `src/renderer/stats/computeTimelineAndMapData.ts`.
That function already iterates `details.targets` per log to produce the `enemies`
total, so bucketing the same targets by team is one extra pass over data already in
hand, and the no-roster fallback path lives in the same block.

Two alternatives were rejected:

- **Reuse `computeMatchup` (`src/shared/commanderMetrics/matchup.ts`)**, which already
  produces `enemyByTeam`. It is computed on the commander path with a much heavier
  payload, is not run for every log in a stats set, and filters enemies on
  `enemyPlayer === true` rather than the timeline's `!isFake`. Wiring it in would
  silently change enemy totals users already read off this chart.
- **Compute in `TimelineSection.tsx`.** The component receives `timelineData`, not raw
  logs.

## Data shape

Each `timelineData` point gains four fixed numeric keys, always present, defaulting to
`0`:

```
enemyRed, enemyGreen, enemyBlue, enemyUnknown
```

Fixed keys rather than a nested map, because a recharts `dataKey` must be a static
string per `<Line>`.

The existing `enemies` total is left exactly as it is, so Combined mode is identical to
the current chart.

### Bucketing rule, per log

1. Resolve `teamMapFromLog(details)` once.
2. For each non-fake target, resolve `getWvwTeamColor(t.teamID, map)` and add to the
   matching key.
3. `'unknown'` goes to `enemyUnknown`.
4. **Collision guard:** an enemy resolving to your own team's colour goes to
   `enemyUnknown`. A bad id mapping must not draw enemies on your line.
5. **No roster** — `targets` is empty and the count came from
   `dashboardSummary.enemyCount` — the whole count goes to `enemyUnknown`.

Invariant: `enemyRed + enemyGreen + enemyBlue + enemyUnknown === enemies`, for every
log. This is what keeps By Team and Combined from disagreeing.

### Your team's colour

Session-level, not per-log, because there is one friendly line.

Per log, the squad's colour is `getWvwTeamColor(teamID, map)` for the first squad
player with a positive `teamID` — the same derivation `computeMatchup` already uses.
The session colour is then the most common non-unknown per-log colour across the set;
ties break red → green → blue. If no log resolves one, fall back to today's green
`#22c55e` and label the line "You".

This makes the computation two passes over the sorted logs: the first derives the
session squad colour, the second buckets enemies, since the collision guard in step 4
above needs the session colour to be known.

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

**Unit — bucketing**, alongside `computeTimelineAndMapData`:

- Enemies split across two `teamID`s resolve to the right colour keys.
- The sum invariant holds for every log.
- A target with no `teamID` lands in Unknown.
- A roster-less log routes `dashboardSummary.enemyCount` entirely to Unknown.
- An enemy sharing your own team colour is folded into Unknown by the collision guard.
- `enemies` is unchanged from current behaviour on a fixture with no team ids at all.

**Unit — squad colour derivation:**

- Majority across logs wins.
- A tie breaks red → green → blue.
- All-unknown falls back to green, with the line labelled "You".

**Component — `TimelineSection`:**

- Defaults to By Team on mount.
- The Unknown line is absent when no log has unknowns, present when one does.
- Combined renders a single enemy line.
- The legend label follows the friendly toggle between "(You)" and "(You + Allies)".

Deliberately not covered: the glow underlay's visual appearance, and any Playwright
e2e. This is a presentational change inside an already-e2e-covered view, and asserting
on a decorative stroke would be brittle.

## Files touched

- `src/renderer/stats/computeTimelineAndMapData.ts` — per-team bucketing, squad colour
  derivation.
- `src/renderer/stats/sections/TimelineSection.tsx` — lines, glow, legend, toggle.
- `src/renderer/StatsView.tsx` — new `useState` for the enemy mode, passed to the
  section at both of its two call sites.
- New test files for the two unit layers and the component layer.
