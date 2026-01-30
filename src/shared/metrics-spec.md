# Combat Metrics Spec

This document describes the project-defined combat metrics used in the UI,
Discord summaries, and aggregate stats. The intent is to define the metrics
independently from any third-party implementation while staying consistent
with EI JSON inputs. It also records the exact fields and aggregation rules
so the stats dashboard, Discord, and cards produce identical values.

Spec version: `v3` (see `src/shared/metrics-methods.json`).

## Input Contract (EI JSON)

All metrics are derived from the EI JSON payload produced by dps.report. The
minimum fields consumed are:

- `players[*].dpsAll[0].damage`, `players[*].dpsAll[0].dps`, `players[*].dpsAll[0].breakbarDamage`
- `players[*].defenses[0].damageTaken`, `deadCount`, `downCount`,
  `missedCount`, `blockedCount`, `evadedCount`, `dodgeCount`
- `players[*].support[0].condiCleanse`, `condiCleanseSelf`, `boonStrips`,
  `resurrects`
- `players[*].statsAll[0].stackDist`, `players[*].statsAll[0].distToCom`
- `players[*].statsTargets[*][0].downContribution`, `killed`, `downed`,
  `againstDownedCount`
- `players[*].extHealingStats.outgoingHealingAllies`
- `players[*].extBarrierStats.outgoingBarrierAllies`
- `players[*].totalDamageDist`, `players[*].totalDamageTaken`
- `players[*].activeTimes`
- `buffMap` and `durationMS` for stability generation

If any of these are missing, the metric falls back to `0` as defined below.

## Crowd Control & Strips Methodology

The app supports three user-selectable methodologies (default: `count`),
configured in `src/shared/metrics-methods.json`:

1. **Count Events** (`count`)  
   Uses EI summary counts for CC/strips. Best for stable, comparable totals.

2. **Duration (Seconds)** (`duration`)  
   Uses EI summary durations (converted to seconds). Best for impact-weighted
   totals, but units are time not event counts.

3. **Tiered Impact** (`tiered`)  
   Uses average duration per event to apply tiered weights. Best for balancing
   short vs long control with a simple, configurable heuristic.

These methodologies apply to:
- Outgoing CC totals
- Incoming CC totals
- Incoming strips totals

## Outgoing Crowd Control

For each player:
- `count`: `statsAll[0].appliedCrowdControl`
- `duration`: `statsAll[0].appliedCrowdControlDuration / 1000`
- `tiered`: `appliedCrowdControl * tierWeight(avgDurationMs)`

Implementation: `src/shared/combatMetrics.ts` (computeOutgoingCrowdControl).

## Incoming Strips and Crowd Control

For each player:
- Incoming CC uses `defenses[0].receivedCrowdControl` and
  `defenses[0].receivedCrowdControlDuration`.
- Incoming strips use `defenses[0].boonStrips` and `defenses[0].boonStripsTime`.

Method application is the same as outgoing CC (count/duration/tiered).

Implementation: `src/shared/combatMetrics.ts` (computeIncomingDisruptions).

## Cleanses

`cleanses = support[0].condiCleanse + support[0].condiCleanseSelf`.

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerCleanses).

UI note: the Support table can display either **All** (condiCleanse + condiCleanseSelf) or **Squad** (condiCleanse only) via the cleanse-scope toggle. Discord and top summaries use **All**.

## Strips

`strips` uses the configured methodology:
- `count`: `support[0].boonStrips`
- `duration`: `support[0].boonStripsTime / 1000`
- `tiered`: `boonStrips * tierWeight(avgDurationMs)`

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerStrips).

## Down Contribution

Down contribution is the sum of `statsTargets[*][0].downContribution` across
all targets for the player.

Implementation: `src/shared/combatMetrics.ts` (computeDownContribution).

## Squad Barrier and Squad Healing

Squad barrier and healing sum all phases of `extBarrierStats.outgoingBarrierAllies`
and `extHealingStats.outgoingHealingAllies` respectively.

Implementation: `src/shared/combatMetrics.ts` (computeSquadBarrier, computeSquadHealing).

## Stability Generation

Stability generation uses the EI buff data via `getPlayerBoonGenerationMs`
and writes `player.stabGeneration` in seconds.

Implementation: `src/shared/combatMetrics.ts` (applySquadStabilityGeneration).

## Damage and DPS

`damage = dpsAll[0].damage`  
`dps = dpsAll[0].dps`

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerDamage, getPlayerDps).

## Breakbar Damage

`breakbarDamage = dpsAll[0].breakbarDamage`.

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerBreakbarDamage).

## Incoming Damage (Taken)

`damageTaken = defenses[0].damageTaken`.

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerDamageTaken).

Incoming damage per skill (incoming damage distribution) is derived from
`players[*].totalDamageTaken[*]` entries and summed across players for the
squad view. This total can be large for siege skills because it aggregates
all hits and all players (and across multiple logs when viewing aggregates).

## Conditions (Outgoing + Incoming)

Outgoing condition totals are derived from `players[*].totalDamageDist[*]`
entries whose resolved skill name maps to a condition label (see
`CONDITION_NAME_MAP`). For each matching entry:

- `applications` uses `connectedHits` when available, otherwise falls back to
  `hits` (needed for non-damaging conditions like blind/slow/fear).
- `damage` uses `totalDamage`.

Totals are aggregated per player and across the squad. The UI can filter to a
single condition or show the all-conditions rollup.

Incoming condition totals are derived from `players[*].totalDamageTaken[*]`
entries whose resolved skill/buff ID maps to a condition. For each matching
entry:

- `applications` uses `hits`.
- `damage` uses `totalDamage`.

### Limitation (EI JSON)

Accurate application counts for non-damaging conditions (e.g., vulnerability,
weakness, blind, slow) require target buff state timelines
(`targets[*].buffs[*].statesPerSource`). When this data is absent in the EI JSON,
the app falls back to damage distribution (`totalDamageDist`) hit counts, which
can significantly under-count applications for those conditions.

### Local Parsing (EI CLI)

When enabled, the app can run a local Elite Insights parser (EI CLI) and use its
JSON output as a more complete data source for **all** metrics (not only
conditions). This is intended to fill gaps in hosted JSON outputs when they omit
certain fields.

**Linux note:** if no system `dotnet` runtime is detected and auto-setup is
enabled, the app will download and install a private .NET runtime under the app
user data directory and use it to run the EI CLI DLL. No extra manual setup is
required for local development beyond enabling the setting.

## Deaths / Downs (Taken)

`deaths = defenses[0].deadCount`  
`downsTaken = defenses[0].downCount`

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerDeaths, getPlayerDownsTaken).

## Dodges / Misses / Blocks / Evades (Taken)

`dodges = defenses[0].dodgeCount`  
`missed = defenses[0].missedCount`  
`blocked = defenses[0].blockedCount`  
`evaded = defenses[0].evadedCount`

Implementation: `src/shared/dashboardMetrics.ts`
(getPlayerDodges, getPlayerMissed, getPlayerBlocked, getPlayerEvaded).

## Resurrects

`resurrects = support[0].resurrects`.

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerResurrects).

## Distance to Tag

`distanceToTag = statsAll[0].distToCom` if present; otherwise use
`statsAll[0].stackDist`; otherwise `0`.

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerDistanceToTag).

## Kills / Downs / Against Downed (Target Stats)

For each player, aggregate from `statsTargets[*][0]`:

- `killed`
- `downed`
- `againstDownedCount`

Implementation: `src/shared/dashboardMetrics.ts` (getTargetStatTotal).

## Skill Usage Tracker (Rotation Casts)

Skill usage is derived from each player's `rotation` entries in EI JSON. For
each rotation skill entry:
- `castCount = rotationSkill.skills.length`
- `skillId = s{rotationSkill.id}`
- Counts are aggregated per player per log and summed across logs for totals.

The Skill Usage Tracker supports two display modes:
- **Total**: raw cast counts per player (per log in the timeline).
- **Per Second**: cast rate using active time, where
  `activeSeconds = players[*].activeTimes[0] / 1000` when available, otherwise
  `durationMS / 1000` from the log details.

Implementation: `src/renderer/StatsView.tsx` (skill usage tracker aggregation).

## Known Caveats

- EI JSON versions can add/remove fields; missing fields always fall back to `0`.
- `distToCom` and `stackDist` are not guaranteed to exist in every log; `distanceToTag` may be `0`.
- Incoming CC/strips use weighted skill mappings; mismatches can occur if EI changes skill ids or hit accounting.
- Stability generation depends on buff metadata presence (`buffMap`) and correct `durationMS`.
- Damage uses `dpsAll[0].damage` (player total) rather than summing per-target totals, which may differ when targets are filtered or merged.
- Skill usage totals are raw cast counts unless the per-second view is selected; missing `activeTimes` falls back to log duration for rate calculations.
