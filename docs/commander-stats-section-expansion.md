# Commander Stats Section Expansion

## Purpose

This document defines net new sections for the Commander Stats area and gives explicit implementation instructions suitable for an LLM or coding agent.

These sections are intended to add new commander-specific analysis, not just reorganize the existing `Commander Stats` section.

## Scope

Target UI:

- [src/renderer/stats/sections/CommanderStatsSection.tsx](~/Documents/GitHub/ArcBridge/src/renderer/stats/sections/CommanderStatsSection.tsx)
- [src/renderer/StatsView.tsx](~/Documents/GitHub/ArcBridge/src/renderer/StatsView.tsx)
- [src/renderer/stats/hooks/useStatsNavigation.ts](~/Documents/GitHub/ArcBridge/src/renderer/stats/hooks/useStatsNavigation.ts)

Target aggregation:

- [src/renderer/stats/computeStatsAggregation.ts](~/Documents/GitHub/ArcBridge/src/renderer/stats/computeStatsAggregation.ts)

The implementation should preserve the current commander summary table and detailed lower panels unless a section explicitly replaces them.

## High-Priority New Sections

Implement these first, in this order:

1. `Push Timing`
2. `Tag Movement`
3. `Target Conversion`
4. `Squad Response To Tag Death`

These have the best value-to-effort ratio and are the most commander-specific.

## Section Specifications

### 1. Push Timing

#### User Goal

Show how quickly a commander converts an engage into downs and kills.

#### New Metrics

Per commander:

- `avgTimeToFirstEnemyDownMs`
- `avgTimeToFirstEnemyDeathMs`
- `avgDownToKillConversionMs`
- `pushesWithEarlyDownPct`
- `stalledPushPct`

Per fight:

- `timeToFirstEnemyDownMs`
- `timeToFirstEnemyDeathMs`
- `downToKillConversionMs`
- `hadEarlyDown`
- `wasStalledPush`

#### Data Source Guidance

Use existing fight-level data where possible:

- enemy downs / deaths already derive from `statsTargets`
- fight duration is already available

If exact timestamped down/death events are not available in parsed log data, use a fallback approximation based on cumulative squad pressure data already present in the fight:

- first non-zero bucket in an existing cumulative or 1s/5s series
- otherwise mark the metric as unavailable (`null`)

Do not invent fake precision. If exact timing cannot be derived, store `null` and render `N/A`.

#### UI Requirements

Add a new subsection under commander details:

- title: `Push Timing`
- top row: 4-5 compact summary cards
- below: a per-fight mini-table sorted chronologically

Suggested summary cards:

- Avg To First Down
- Avg To First Kill
- Avg Down To Kill
- Early Push Success %
- Stalled Push %

Suggested fight table columns:

- Fight
- Result
- To First Down
- To First Kill
- Down To Kill
- Status

#### Implementation Steps

1. Extend the commander aggregation object in `computeStatsAggregation.ts` with nullable timing fields at both per-fight and per-commander levels.
2. Add helper functions that calculate the first detectable enemy down and first detectable enemy death time.
3. Aggregate commander averages using only fights with non-null values.
4. Render a new `Push Timing` block in `CommanderStatsSection.tsx` below the top summary table and above the current incoming-damage detail tables.
5. Keep formatting consistent with existing cards and table styling.

#### Acceptance Criteria

- If timing data is available, at least one card and one fight row show non-null values.
- If timing data is unavailable, the UI shows `N/A` instead of misleading zeroes.
- No existing commander summary fields regress.

### 2. Tag Movement

#### User Goal

Show how the commander physically moved during fights and whether movement patterns correlate with success or failure.

#### New Metrics

Per commander:

- `avgCommanderDistanceTraveled`
- `avgCommanderMovementPerMinute`
- `avgTagStationaryPct`
- `avgTagMovementBurstCount`

Per fight:

- `distanceTraveled`
- `movementPerMinute`
- `stationaryPct`
- `movementBurstCount`

#### Data Source Guidance

Use the commander player's `combatReplayData.positions` when present.

Derive movement from the existing replay position arrays:

- compute point-to-point distance across the commander position path
- normalize by duration for per-minute movement
- count stationary spans using a small movement threshold
- count movement bursts as transitions from low movement to sustained movement over threshold

If `combatReplayData.positions` is missing, set movement fields to `null`.

#### UI Requirements

Add a `Tag Movement` subsection with:

- 4 summary cards
- a compact movement trend chart or per-fight table

Preferred initial version:

- summary cards only
- per-fight table

Charting can be added later if implementation cost is high.

Suggested cards:

- Avg Distance Traveled
- Movement / Min
- Stationary %
- Movement Bursts

Suggested table columns:

- Fight
- Distance
- Move / Min
- Stationary %
- Bursts

#### Implementation Steps

1. In `computeStatsAggregation.ts`, locate the existing commander replay position handling.
2. Add a reusable helper that computes path distance from replay positions.
3. Derive movement metrics per fight for the tagged commander.
4. Aggregate averages at the commander level.
5. Render a new `Tag Movement` block in `CommanderStatsSection.tsx`.

#### Acceptance Criteria

- Movement data uses replay positions only when available.
- Missing replay data renders as `N/A`.
- Movement is not double-counted or mixed with squad positions.

### 3. Target Conversion

#### User Goal

Show whether the commander’s fights are converting downs into kills efficiently.

#### New Metrics

Per commander:

- `totalEnemyDowns`
- `totalEnemyDeaths`
- `downToKillConversionPct`
- `avgKillsPerFight`
- `avgDownsPerFight`
- `failedDownEstimate`

Per fight:

- `enemyDowns`
- `enemyDeaths`
- `downToKillConversionPct`
- `failedDownEstimate`

#### Data Source Guidance

This section should use the same fight-level source as the rest of the app:

- use `getFightDownsDeaths(details)`
- define:
  - enemy kills = `enemyDeaths`
  - enemy downs = `max(0, enemyDownsDeaths - enemyDeaths)`
  - total enemy down events = `enemyDowns`
  - conversion % = `enemyDeaths / max(1, enemyDowns)`

Be explicit in code comments and UI labels that `Downs` here means enemy down events excluding kills.

#### UI Requirements

Add a `Target Conversion` subsection with:

- 4 summary cards
- 1 per-fight table

Suggested cards:

- Down To Kill %
- Avg Downs / Fight
- Avg Kills / Fight
- Failed Downs

Suggested table columns:

- Fight
- Enemy Downs
- Enemy Kills
- Conversion %
- Failed Downs

#### Implementation Steps

1. Reuse the existing fight-level down/death helper rather than adding another custom calculator.
2. Store target conversion metrics in each commander fight row.
3. Aggregate totals and averages at the commander level.
4. Render a new `Target Conversion` section near the top of the commander detail area.
5. If naming is ambiguous, rename existing commander row columns from `Kills` / `Downs` to `Squad Kills` / `Enemy Downs` or similar for consistency.

#### Acceptance Criteria

- This section matches the same kills/downs logic used in Fight Breakdown.
- Conversion never divides by zero.
- Labels are explicit enough to avoid user confusion.

### 4. Squad Response To Tag Death

#### User Goal

Show what happens to the squad after the commander dies.

#### New Metrics

Per commander:

- `fightsWithCommanderDeath`
- `squadCollapseAfterTagDeathPct`
- `avgSquadDeathsAfterTagDeath`
- `avgEnemyKillsAfterTagDeath`
- `recoveryAfterTagDeathPct`

Per fight:

- `commanderDied`
- `squadDeathsAfterTagDeath`
- `enemyKillsAfterTagDeath`
- `collapsedAfterTagDeath`
- `recoveredAfterTagDeath`

#### Data Source Guidance

This section requires event-order logic.

Use:

- commander death timing from commander replay death markers where available
- post-death windows from 1s or 5s fight series if available

If exact post-death event slicing is not currently possible with available data:

- implement an MVP approximation
- define a fixed post-death window using available time buckets
- count changes in squad deaths and enemy kills after the commander death bucket

If no commander death time exists, set the fight values to `null` or `false` as appropriate.

#### UI Requirements

Add a `Squad Response To Tag Death` subsection with:

- 4 summary cards
- a fight-level table that only shows fights where the commander died

Suggested cards:

- Fights With Tag Death
- Collapse Rate
- Avg Squad Deaths After Tag Death
- Recovery Rate

Suggested table columns:

- Fight
- Commander Died At
- Squad Deaths After
- Enemy Kills After
- Outcome

#### Implementation Steps

1. Add a helper to resolve the commander’s first death timestamp from replay data.
2. Map that timestamp into the nearest available fight bucket series.
3. Compute post-death squad and enemy changes using existing bucketed fight data where possible.
4. Aggregate per commander.
5. Render the section below `Target Conversion`.

#### Acceptance Criteria

- Fights with no commander death are excluded or clearly marked.
- The section never reports post-death metrics for fights where the commander survived.
- Approximation rules are documented in code comments.

## Recommended UI Layout Order

Inside `CommanderStatsSection.tsx`, prefer this order:

1. existing commander summary table
2. `Push Timing`
3. `Target Conversion`
4. `Tag Movement`
5. `Squad Response To Tag Death`
6. existing commander-specific survival cards
7. existing incoming-damage / incoming-boon detail tables
8. existing fight timeline and fight drilldown

This keeps strategic summary content above low-level diagnostic detail.

## Navigation Updates

If these sections should be independently navigable:

1. Add stable IDs for each new subsection.
2. Update [useStatsNavigation.ts](~/Documents/GitHub/ArcBridge/src/renderer/stats/hooks/useStatsNavigation.ts) to include child items under the commander group.
3. Keep the group label as `Commander Stats`.
4. Use the existing `CommanderTagIcon` for the group and child entries unless design explicitly changes.

Suggested IDs:

- `commander-push-timing`
- `commander-target-conversion`
- `commander-tag-movement`
- `commander-tag-death-response`

## Data Model Instructions

When extending commander data:

1. Add new fields to the commander fight row type in `CommanderStatsSection.tsx`.
2. Add matching fields to the aggregated commander row type in `CommanderStatsSection.tsx`.
3. Extend the object returned from `computeStatsAggregation.ts` so the UI consumes typed fields directly.
4. Prefer `null` for unavailable values instead of `0` when the value is unknown.
5. Only render percentages when the denominator is valid.

Avoid:

- deriving the same metric in both aggregation and render layers
- mixing commander-only values with squad-wide values under the same ambiguous label
- silently substituting `0` for missing event timing data

## Testing Instructions For LLMs

When implementing any of these sections:

1. Add or update unit tests in `src/renderer/__tests__/computeStatsAggregation.commanderStats.test.ts`.
2. Add fixture coverage for:
   - fights with commander death
   - fights without commander death
   - fights with missing replay positions
   - multi-phase `statsTargets`
3. Verify that values remain stable when `precomputedStats` is used.
4. Run:
   - `npm run test:unit -- computeStatsAggregation.commanderStats`
   - `npm run typecheck`

If exact data cannot be produced from current parsed logs:

1. implement the data field as nullable
2. render the section with `N/A`
3. leave a short code comment documenting which upstream log field would be needed for full fidelity

## Implementation Strategy For LLMs

Use this order:

1. Implement `Target Conversion` first because it reuses existing trusted fight-level metrics.
2. Implement `Tag Movement` second because replay positions already exist in the codebase.
3. Implement `Push Timing` third only if reliable timing can be derived from existing per-fight data.
4. Implement `Squad Response To Tag Death` last because it has the most approximation risk.

Do not try to implement all sections in one patch unless the change is small and well-contained. Prefer one section per PR or one section per commit.

## Definition Of Done

A section is considered complete only if:

1. the aggregation code exposes stable typed data for the new fields
2. the commander UI renders the section with clear labels
3. unknown values render as `N/A`, not fake zeroes
4. the focused commander stats test passes
5. `npm run typecheck` passes
