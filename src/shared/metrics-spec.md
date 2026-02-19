# Combat Metrics Spec

This document describes the project-defined combat metrics used in the UI,
Discord summaries, and aggregate stats. The intent is to define the metrics
independently from any third-party implementation while staying consistent
with EI JSON inputs. It also records the exact fields and aggregation rules
so the stats dashboard, Discord, and cards produce identical values.

Spec version: `v5` (see `src/shared/metrics-methods.json`).

## Input Contract (EI JSON)

All metrics are derived from the EI JSON payload produced by dps.report. The
minimum fields consumed are:

- `players[*].dpsAll[0].damage`, `players[*].dpsAll[0].dps`, `players[*].dpsAll[0].breakbarDamage`
- `players[*].defenses[0].damageTaken`, `deadCount`, `downCount`,
  `missedCount`, `blockedCount`, `evadedCount`, `dodgeCount`,
  `receivedCrowdControl`, `receivedCrowdControlDuration`,
  `boonStrips`, `boonStripsTime`
- `players[*].minions[*].totalDamageTakenDist[0][*].totalDamage` (fallback:
  `damageTaken`) for minion incoming damage totals
- `players[*].support[0].condiCleanse`, `condiCleanseSelf`, `boonStrips`,
  `boonStripsTime`, `resurrects`
- `players[*].statsAll[0].stackDist`, `players[*].statsAll[0].distToCom`
- `players[*].statsTargets[*][0].downContribution`, `killed`, `downed`,
  `againstDownedCount`
- `players[*].extHealingStats.outgoingHealingAllies`
- `players[*].extBarrierStats.outgoingBarrierAllies`
- `players[*].totalDamageDist`, `players[*].targetDamageDist`, `players[*].totalDamageTaken`
- `players[*].damage1S`, `players[*].targetDamage1S`,
  `players[*].powerDamageTaken1S`, `players[*].targetPowerDamage1S`
- `players[*].activeTimes`
- `players[*].rotation`
- `players[*].buffUptimes`
- `players[*].selfBuffs`, `players[*].groupBuffs`, `players[*].squadBuffs`
- `players[*].selfBuffsActive`, `players[*].groupBuffsActive`, `players[*].squadBuffsActive`
- `players[*].group`
- `buffMap`, `skillMap`, and `durationMS` for stability generation, boon output/uptime, and skill labeling
- `targets[*].buffs[*].statesPerSource` when available for condition application counts
- `details.fightName`, `details.uploadTime` (or `details.timeStartStd` / `details.timeStart` fallback),
  `details.zone`/`mapName`/`map`/`location`, `details.success`,
  `details.targets`, `details.durationMS`
- `targets[*].totalDamageDist`, `targets[*].powerDamage1S`, `targets[*].damage1S`,
  `targets[*].enemyPlayer`, `targets[*].isFake`, `targets[*].profession`

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

## Damage Mitigation (Player + Minion)

Damage mitigation is an **estimate** of avoided damage based on enemy skill
damage averages and avoidance events (block/evade/miss/invuln/interrupted).
It is intended for relative comparisons between players/minions and logs, not
as a literal “damage prevented” total.

### Inputs Used

Per-log data sources:

- Enemy damage distribution: `targets[*].totalDamageDist[0]`
- Player avoided events: `players[*].totalDamageTaken[0]`
- Minion avoided events: `players[*].minions[*].totalDamageTakenDist[0]`
- Skill names: `skillMap` / `buffMap` (for UI labels only)

### Enemy Skill Damage Averages

For each skill id across **all logs in the aggregation**:

1. Gather `totalDamage` and `connectedHits` from every target’s
   `totalDamageDist[0]` entry with the same `id`.
2. Compute:
   - `avgDamage = sum(totalDamage) / sum(connectedHits)`
   - `minDamage = average(entry.min over all occurrences)`

These averages are computed **once for the aggregation window** and used for
all player/minion mitigation calculations.

### Avoided Damage Per Skill (Formula)

For a given skill id `S` with enemy averages `avgDamage` and `minDamage`:

```
avoidCount = blocked + evaded + missed + invulned + interrupted
avoidDamage = (glanced * avgDamage / 2) + (avoidCount * avgDamage)
minAvoidDamage = (glanced * minDamage / 2) + (avoidCount * minDamage)
```

Notes:
- `glanced` is treated as half damage.
- If `connectedHits` for the enemy skill is `0`, the skill is excluded from
  mitigation totals (both avoid and min avoid).

### Player Mitigation Aggregation

For each player (account key):

1. Sum avoidance counts **per skill id** across all logs:
   - `hits`, `blocked`, `evaded`, `glanced`, `missed`, `invulned`, `interrupted`.
2. For each skill id, compute `avoidDamage` / `minAvoidDamage` using the global
   enemy averages (above).
3. **Include only skills with `avoidDamage > 0`** in totals.
4. Totals are the sum of:
   - `totalHits` (from `hits`)
   - `blocked`, `evaded`, `glanced`, `missed`, `invulned`, `interrupted`
   - `totalMitigation` (sum of avoidDamage)
   - `minMitigation` (sum of minAvoidDamage)

### Minion Mitigation Aggregation

For each minion (player account + minion name):

1. Sum avoidance counts **per skill id** across all logs using
   `minion.totalDamageTakenDist[0]`.
2. Use the **same enemy averages** (from targets).
3. Compute totals using the same formula and inclusion rules as player
   mitigation.

Minion names are normalized by:
- Removing `"Juvenile "` prefix.
- Converting names containing `"UNKNOWN"` to `"Unknown"`.

### Field Mapping in UI

The Damage Mitigation table uses the following totals:

- `Total Hits` → summed `hits` for included skills
- `Evaded`, `Blocked`, `Glanced`, `Missed`, `Invulned`, `Interrupted`
- `Damage Mitigation` → `totalMitigation`
- `Min Damage Mitigation` → `minMitigation`

### Why This Diverges From Some External Tools

Some tools compute mitigation differently (e.g., per-log accumulation with
running averages, name-based skill bucketing, or repeated adding across logs).
This spec intentionally computes **one consistent estimate** across all logs
using **global enemy averages** and **per-skill cumulative counts**, which
avoids log-count bias.

### Known Limitations

- If a skill’s `connectedHits` is zero in targets data, mitigation for that
  skill is excluded.
- Some skills share names across different ids; we bucket by **skill id** to
  avoid collisions.
- Enemy damage averages are computed from `targets[*].totalDamageDist[0]` and
  can be skewed by target mix, fake targets, or atypical fights.

### How-To: Validate Against Raw EI JSON

1. Choose a player or minion and a specific skill id from:
   - `players[*].totalDamageTaken[0]` or `minions[*].totalDamageTakenDist[0]`.
2. Compute counts: `blocked`, `evaded`, `glanced`, `missed`, `invulned`,
   `interrupted`, `hits`.
3. Compute enemy averages from all logs’ `targets[*].totalDamageDist[0]` for
   the same skill id.
4. Apply the formula above and verify the per-skill avoided damage.
5. Sum over skills with `avoidDamage > 0` to confirm table totals.

### How-To: Debug Mismatches

1. Confirm the same log set is being aggregated.
2. Verify skill ids match (name collisions can hide differences).
3. Check if the target data includes the skill id with non-zero
   `connectedHits`.
4. Validate that minion names are normalized (`Juvenile` prefix removed).
5. Compare against a single skill id first, then widen to all skills.

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

### Current Condition Labels (Normalization)

Condition detection normalizes skill/buff names to the following labels. Only
these are counted as conditions:

- Bleeding
- Burning
- Confusion
- Poison
- Torment
- Vulnerability
- Weakness
- Blind
- Cripple
- Chill
- Immobilize
- Slow
- Fear
- Taunt

Notes:
- The matcher lowercases and trims names, then maps variants like `crippled`
  → `Cripple` and `chilled` → `Chill`.
- If a skill/buff name does not normalize to one of the labels above, it is
  excluded from condition totals.

### Limitation (Hosted JSON)

Accurate application counts for non-damaging conditions (e.g., vulnerability,
weakness, blind, slow) require target buff state timelines
(`targets[*].buffs[*].statesPerSource`). If hosted JSON lacks this data (common
in older logs or trimmed outputs), the app falls back to damage distribution
(`totalDamageDist`) hit counts, which can significantly under-count
applications for those conditions.

### Condition Application Counting (States Per Source)

When `targets[*].buffs[*].statesPerSource` is available, the app computes two
separate application counts per condition:

- **Stack Delta Applications (`applicationsFromBuffs`)**  
  Counts the **sum of positive stack increases** across the states timeline.
  Example timeline: `0 → 1 → 3 → 2 → 5` contributes `+1 +2 +3 = 6`.  
  This aligns with the technical definition of “applications” as **stacks
  actually added**.

- **Active State Entries (`applicationsFromBuffsActive`)**  
  Counts **each non-zero state entry** (each time the state updates while the
  condition is active). This tracks **how often the buff state changed while
  active**, which often matches external tooling that counts active segments,
  but can **over-count** true applications for stacking conditions.

**Tradeoffs:**
- *Stack delta* is closer to “how many stacks were applied” but can be lower
  than tools that count refreshes/active entries.
- *Active entries* better match some log combiner views but can overstate
  application counts when stacks are refreshed without adding stacks.

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
`statsAll[0].stackDist`. If both are missing but combat replay positions are
available, compute the average distance to the commander tag over the
available timeline. Otherwise `0`.

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

Implementation: `src/renderer/stats/computeStatsAggregation.ts` (skill usage tracker aggregation).

## APM Breakdown

APM is derived from the Skill Usage Tracker data (rotation casts). For each
player:
- `totalCasts = sum(rotationSkill.skills.length)`
- `apm = totalCasts / (activeSeconds / 60)`
- `aps = totalCasts / activeSeconds`
- Auto-attack counts are excluded for the "No Auto" variants.

The APM Breakdown groups players by profession and aggregates per-skill cast
counts across the group.

Implementation: `src/renderer/stats/hooks/useApmStats.ts`.

## Player Skill Breakdown (Damage / Down Contribution / DPS)

Per-player skill damage breakdown is built from the same damage distribution
inputs as Top Skills (see below):
- Outgoing skill damage uses `targetDamageDist` (default) or `totalDamageDist`
  based on settings.
- Each entry contributes `totalDamage` and `downContribution`.

For each player and skill:
- `totalDamage = sum(entry.totalDamage)`
- `downContribution = sum(entry.downContribution)`
- `dps = totalDamage / (totalFightSeconds)`

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

## Top Skills (Outgoing / Incoming)

Top Outgoing Skills are derived from the squad-wide aggregation of
`targetDamageDist` (default) or `totalDamageDist` entries:
- `damage = sum(entry.totalDamage)`
- `hits = sum(entry.connectedHits)`
- `downContribution = sum(entry.downContribution)`

When using target-based outgoing aggregation, total-distribution supplementation
is mode-sensitive:
- non-detailed logs (`detailedWvW !== true`): missing/under-reported target
  skill ids may be supplemented from `totalDamageDist` deltas
- detailed WvW logs (`detailedWvW === true`): supplementation from
  `totalDamageDist` is disabled to avoid known outlier max/damage artifacts
  observed in some EI exports

Top Incoming Skills are derived from `totalDamageTaken`:
- `damage = sum(entry.totalDamage)`
- `hits = sum(entry.hits)`

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

## Boon Output

Boon output tables are computed from player boon generation data:
- `selfBuffs`, `groupBuffs`, `squadBuffs` (and their `Active` variants)
- `buffMap` for name/icon/stacking metadata
- `durationMS`, `activeTimes`, and `group` for normalization

Implementation: `src/shared/boonGeneration.ts`.

### Boon Timeline (Defense)

The Boon Timeline section uses the same generation foundation as Boon Output
with **Total** semantics:

- Per-player per-boon totals use:
  - `selfBuffs + squadBuffs`
  - `groupBuffs` is intentionally excluded to avoid double counting
    (group is a subset of squad in this model)
- Scope toggle:
  - `Self` = `selfBuffs`
  - `Squad` = `squadBuffs` (default)
  - `Group` = `groupBuffs`
  - `All` = `selfBuffs + squadBuffs` (`totalBuffs`)

For each fight and boon:

1. Compute player total generation milliseconds:
   - stacking boons:
     - `generationMs = generation * durationMs * recipientCount`
   - non-stacking boons:
     - `generationMs = (generation / 100) * durationMs * recipientCount`
   - where:
     - `recipientCount = 1` for self
     - `recipientCount = squadCount - 1` for squad

2. Build 5-second bucket shape from `buffUptimes[*].statesPerSource`:
   - integrate source state value over time (time-weighted area) into each 5s bucket
   - this yields relative bucket weights (not final totals)

3. Scale bucket weights to the player fight total from step 1:
   - `bucketValue = bucketWeight * (fightTotal / sum(bucketWeights))`
   - fallback when timeline weights are unavailable: uniform distribution across buckets

Units shown in the UI are **boon-seconds** (`generationMs / 1000`), aggregated
across recipients. Because this is recipient-aggregated generation, 5s bucket
values can exceed `5` and may be large for stacking boons or `All`-player view.

Timeline player identity is account-level (`account`) to match Boon Output row
grouping across profession swaps.

Implementation: `src/renderer/stats/computeStatsAggregation.ts`,
`src/renderer/StatsView.tsx`.

### Boon Uptime (Defense)

The Boon Uptime section is derived from `players[*].buffUptimes[*].statesPerSource`
for boon-classified buffs and reports **stack state over time on the selected
player**, not outgoing generation.

Source/eligibility:
- include only `players[*].buffUptimes[*]` entries where `buffMap[b{id}]` (or fallback)
  has `classification === "Boon"` (or empty classification treated as boon-compatible)
- use `buffMap` metadata for `name`, `icon`, and `stacking`

Per-fight timeline buckets:
- sample every 5 seconds (`t = 0, 5, 10, ...`) and read current state value from
  each source timeline in `statesPerSource`
- sum active source values for that sample into the player bucket

Stack semantics (enforced):
- non-stacking boons: binary only
  - `bucket = 1` when sampled value is `> 0`
  - `bucket = 0` otherwise
  - no fractional values are permitted
- stacking boons: integer stack counts only
  - sampled values are rounded to whole stacks
  - stacks are clamped to a max cap

Uptime percentage semantics:
- uptime% is **presence-based** for all boons:
  - a 5s bucket counts as uptime when sampled bucket value is `> 0`
  - otherwise that bucket counts as no uptime
- this rule applies to both non-stacking and stacking boons (stack amount does
  not scale uptime%)
- denominator includes all 5s buckets across all fights for that player/boon
  (including fights where that player has no states for the boon)

Stack caps:
- `Might`: `25`
- `Stability`: `25`
- current implementation applies cap `25` for stacking boons

UI behavior:
- main chart:
  - stacking boons: per-fight **average stacks**
  - non-stacking boons: per-fight **uptime percentage** (active 5s buckets / total 5s buckets)
- drilldown chart: selected fight 5-second stack buckets
- for stacking boons, UI may render a reference line at stack cap (`25`)
- player list and summary card use the same shared uptime% source, so selected
  player row uptime% equals displayed overall uptime%

Aggregation notes:
- uptime view is account-keyed per player and does not use an aggregated `__all__`
  synthetic row for timeline values

Implementation: `src/renderer/stats/computeStatsAggregation.ts`,
`src/renderer/StatsView.tsx`, `src/renderer/stats/sections/BoonUptimeSection.tsx`.

## Special Buffs

Special (non-boon) buff tables are computed from `buffUptimes` using
`buffMap` classification and icon metadata. Durations are normalized by
`activeTimes` and `durationMS`.

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

### Sigil/Relic Uptime (Other Metrics)

The `Sigil/Relic Uptime` section is derived from `specialTables` and filtered
to entries whose buff name matches `sigil` or `relic` (case-insensitive).

#### Data source and eligibility

For each squad player and each non-boon buff in `players[*].buffUptimes`:

- Buff metadata source:
  - `details.buffMap[b{id}]` (fallback `details.buffMap[id]`)
- Include only:
  - non-boons (`classification !== "Boon"`)
  - rows with valid positive uptime signal:
    - `buffData[0].uptime > 0` or `buffData[0].presence > 0`

#### Two parallel measures stored for each row

1. **Stack/Intensity measure** (`total`, `perSecond`)
   - used by the generic Special Buffs table
   - formula:
     - if stacking buff: `uptimeFactor = uptimeRaw`
     - else: `uptimeFactor = uptimeRaw / 100`
     - `totalMs += uptimeFactor * activeMs`
   - output:
     - `total = totalMs / 1000`
     - `perSecond = totalMs / durationMs`

2. **True uptime percentage measure** (`uptimePerSecond`)
   - used by `Sigil/Relic Uptime`
   - formula:
     - non-stacking buff:
       - `uptimePctRaw = uptimeRaw`
     - stacking buff:
       - `uptimePctRaw = presenceRaw`
     - clamp to percentage domain:
       - `uptimePct = clamp(uptimePctRaw, 0, 100) / 100`
     - accumulate:
       - `uptimeMs += uptimePct * activeMs`
   - final denominator:
     - `fullPlayerDurationMs = player.supportActiveMs`
     - `uptimePerSecond = uptimeMs / fullPlayerDurationMs`
   - rendered as:
     - `Uptime% = uptimePerSecond * 100`

#### Why this is the accuracy model

This method intentionally uses the **same activity window in numerator and
denominator** (player active time):

- Numerator:
  - uptime milliseconds accumulated from each fight over player active time
- Denominator:
  - total player active time across selected fights

That produces a direct interpretation:

- "Percent of the time this player was active that this sigil/relic effect was
  present."

For stacking gear buffs, `presence` is used for percent uptime because
`uptime` on stacking buffs represents average stack intensity, not time-up
percentage. This avoids under/over-reporting caused by treating stack-average
as uptime%.

### Fight Comparison (Other Metrics)

`Fight Comparison` compares two selected fights using two focused views:

1. `Target Focus Comparison`
- Aggregates squad outgoing damage into enemy profession buckets using
  `players[*].statsTargets[targetIndex][0].damage`.
- Target labels are resolved from `targets[targetIndex]` with profession-first
  fallback (`profession -> name -> id`).
- Per fight, each target bucket includes:
  - `damage`
  - `hits`
  - `share = damage / totalTargetDamage`
- Comparison table uses the union of target buckets and highlights
  `shareDelta = fightB.share - fightA.share`.

2. `Squad Metric Comparison`
- Compares squad-level fight aggregates instead of individual player leaders.
- Includes broad outcome/pressure/support metrics, including:
  - win flag, squad size, enemy count, squad KDR
  - enemy deaths/downs, squad deaths/downs
  - outgoing/incoming damage and damage delta
  - cleanses, strips, stability, healing, barrier out
  - incoming barrier absorption, enemy barrier absorption
  - squad CC, down contribution, revived players
- Delta shown is `fightB.value - fightA.value`; color semantics account for
  metric direction (`higherIsBetter`).

Implementation:
- aggregation payload build: `src/renderer/stats/computeStatsAggregation.ts` (`fightDiffMode`)
- section rendering: `src/renderer/stats/sections/FightDiffModeSection.tsx`

## Offense / Defense / Support / Healing Tables

Detailed tables aggregate the per-player totals defined in:
- `src/renderer/stats/statsMetrics.ts` (metric definitions)
- `src/shared/dashboardMetrics.ts` (per-player metric extraction)
- `src/renderer/stats/computeStatsAggregation.ts` (aggregation)

Defense Detailed includes a derived metric:
- `Minion Damage Taken`:
  sum `players[*].minions[*].totalDamageTakenDist[0][*].totalDamage`, with
  fallback to `damageTaken` when `totalDamage` is absent.

## Spike Damage

Spike Damage has four modes:
- `hit`: highest single skill hit in a fight
- `1s`: highest rolling 1-second damage burst in a fight
- `5s`: highest rolling 5-second damage burst in a fight
- `30s`: highest rolling 30-second damage burst in a fight

### Player Identity

Per-fight player keys are resolved as:
- `key = "${account}|${profession}"`
- `account = player.account || player.name || "Unknown"`
- `profession = player.profession || "Unknown"`

This same key is used to join:
- player list
- per-fight values
- selected-player chart/drilldown

### Highest Single Hit (`hit`)

For each squad player (`!notInSquad`), the highest single-hit value is scanned
from damage distributions (skill maps used for names).

Value:
- candidate fields per entry:
  - `entry.max`
  - `entry.maxDamage`
  - `entry.maxHit`
- no inferred single-hit estimate is used (for example,
  `totalDamage / connectedHits` is intentionally excluded)

Source priority:
- primary: `targetDamageDist`
- fallback: `totalDamageDist` only when no target entries are present (or no
  positive peak was found from target entries)

Detailed WvW safeguard:
- for logs with `detailedWvW === true`, target-side data is treated as the
  authoritative source for spike-hit computations whenever present, because
  some logs can contain total-distribution outlier maxima that are inconsistent
  with target-distribution entries.

Skill label:
- `skillName` from `skillMap`/`buffMap` by id fallback (`Unknown Skill` if missing)

### Rolling Burst (`1s` / `5s`)

Burst uses per-second **delta** damage:
1. Build cumulative damage for phase 0:
   - prefer aggregated target phase 0 from `targetDamage1S` when available
   - fallback to `damage1S[0]`
2. Convert cumulative -> per-second deltas:
   - `delta[i] = max(0, cumulative[i] - cumulative[i-1])` (`i=0` uses prev `0`)
3. Compute rolling windows:
- `burst1s = max(sum(delta[i..i]))`
- `burst5s = max(sum(delta[i..i+4]))`
- `burst30s = max(sum(delta[i..i+29]))`

Implementation includes support for EI shape variants:
- Shape A: `[phase][target][time]`
- Shape B: `[target][phase][time]`

### Per-Fight Max Reference Line

For each fight:
- `maxHit = max(values[*].hit)`
- `max1s = max(values[*].burst1s)`
- `max5s = max(values[*].burst5s)`
- `max30s = max(values[*].burst30s)`

The selected mode uses the corresponding max series as the dashed reference line.

### Drilldown (5s Buckets)

Selected fight drilldown is always rendered as 5-second buckets.

Bucket source:
- preferred: precomputed `buckets5s`
- fallback: recompute from selected player per-second delta series

Bucket value:
- `bucket[k] = sum(delta[k*5 .. k*5+4])`

Bucket count:
- extended to full fight duration (`ceil(durationMS / 5000)`) so trailing
  down/death events are representable even if damage is zero late-fight.

### Down / Death Markers

Marker events are read from `combatReplayData`:
- supports both replay object and segmented replay-array forms
- uses `down` and `dead` arrays

Timestamp normalization:
- handles mixed encodings (ms/seconds/large scales) and offset baselines
  using replay starts/global starts/log offsets
- selects the shift/scale that maximizes in-range alignment with fight buckets

Marker placement:
- convert normalized time to bucket index:
  - `index = floor(timeMs / 5000)`
- constrain to visible drilldown bucket range
- render:
  - down marker: yellow
  - death marker: red

Web report parity:
- precomputed spike payload stores marker indices as:
  - `downIndices5s`
  - `deathIndices5s`
- embedded/web mode can render markers without raw `logs` by consuming these fields.

Implementation:
- Aggregation/precompute: `src/renderer/stats/computeStatsAggregation.ts`
- Runtime selection/drilldown + fallbacks: `src/renderer/StatsView.tsx`
- Chart rendering/interaction: `src/renderer/stats/sections/SpikeDamageSection.tsx`

## Incoming Strike Damage

Incoming Strike Damage mirrors Spike Damage interactions (same chart modes,
selection, drilldown, animations, and fight navigation) but changes the data
source and grouping:

- grouped by **enemy class** (`targets[*].profession`) instead of squad player
- uses **incoming strike timelines** and target damage distributions
- selected-fight expansion includes a **skill-level incoming strike table**

### Identity and Grouping

Per-fight keys are enemy profession labels:

- `key = resolveProfessionLabel(target.profession || target.name || target.id)`
- fallback key: `"Unknown"`

All enemy targets in a fight that resolve to the same profession are merged
into one class bucket for that fight.

### Damage Modes (`hit`, `1s`, `5s`, `30s`)

Modes are defined the same way as Spike Damage:

- `hit`: highest single incoming strike hit seen in the class bucket
- `1s`: highest rolling 1-second incoming strike burst
- `5s`: highest rolling 5-second incoming strike burst
- `30s`: highest rolling 30-second incoming strike burst

`hit` source:

- scan target strike distributions (`totalDamageDist`) and keep max of:
  - `entry.max`
  - `entry.maxDamage`
  - `entry.maxHit`
- ignore `indirectDamage` entries

### Incoming Timeline Construction

For each enemy target, incoming strike series is built with the following
priority:

1. Squad-attributed incoming-vs-target cumulative strike:
   - sum `players[*].targetPowerDamage1S[targetIndex]` across all squad players
2. Fallback target timeline:
   - `targets[targetIndex].powerDamage1S`
3. Final fallback:
   - `targets[targetIndex].damage1S`

Each chosen cumulative series is converted to per-second deltas:

- `delta[i] = max(0, cumulative[i] - cumulative[i-1])`
- `delta[0] = max(0, cumulative[0])`

Class series is then:

- sum of target delta series for all targets in that class

Burst windows are computed from class per-second deltas with the same rolling
window logic used by Spike Damage.

### Timeline Fallback When Target Timelines Are Missing

If enemy target timelines are empty/unusable for a fight:

1. Build squad incoming strike series from `players[*].powerDamageTaken1S`
   (cumulative -> per-second deltas).
2. Compute enemy class counts from `targets[*]` (enemy player targets only).
3. Distribute squad incoming per-second totals across classes proportionally by
   class count in that fight.

This preserves non-zero burst/drilldown behavior for logs lacking complete
target timeline detail.

### Per-Fight Max Reference Line

For each fight:

- `maxHit = max(values[*].hit)`
- `max1s = max(values[*].burst1s)`
- `max5s = max(values[*].burst5s)`
- `max30s = max(values[*].burst30s)`

The selected mode uses its corresponding fight max as the dashed reference
series in the chart.

### Fight Drilldown (5s Buckets)

Selected-fight drilldown is 5-second buckets from class per-second deltas:

- `bucket[k] = sum(delta[k*5 .. k*5+4])`

Bucket count extends to at least `ceil(durationMS / 5000)` so late-fight
marker events can still be shown even when trailing bucket damage is zero.

Down/death markers use replay event times from squad players and are converted
to indices with the same normalization/indexing logic as Spike Damage
(ms/sec scaling, offset hints, then `floor(timeMs / 5000)` clamp).

### Selected Fight Skill Table (Incoming Skill Damage)

The expanded table for the selected fight/class is generated from enemy target
strike distributions:

1. For each target in the selected class:
   - read `target.totalDamageDist` entries
   - ignore `indirectDamage`
2. Resolve each skill id via:
   - `skillMap[s{id}]`, then `skillMap[id]`
   - fallback `buffMap[b{id}]`, then `buffMap[id]`
3. Aggregate per skill name:
   - `damage += entry.totalDamage`
   - `hits += entry.connectedHits || entry.hits`
   - preserve first available icon URL
4. Sort desc by damage and keep top rows for rendering.

### Why Some Skill Names Can Look Off-Class

Skill names in incoming strike tables are tied to damage event ids in EI
damage distributions, not to profession skill catalogs. Because of that,
off-class-looking names can appear in a class bucket (for example via
reflected/returned projectiles, transformed skills, or attribution context).
This is expected under the current event-id attribution model.

### Implementation

- Aggregation/precompute:
  - `src/renderer/stats/computeStatsAggregation.ts` (`incomingStrikeDamage`)
- Runtime selection/drilldown/table rows:
  - `src/renderer/StatsView.tsx`
- UI rendering (card, chart, drilldown, skill table):
  - `src/renderer/stats/sections/SpikeDamageSection.tsx`

## Timeline / Map Distribution / Fight Breakdown

These sections use log-level metadata:
- `details.uploadTime`, `details.durationMS`, `details.success`
- `details.targets` (enemy counts, fake target filtering)
- `details.zone`/`mapName`/`map`/`location`/`fightName` for map labels

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

## Squad Composition

Squad composition is derived from each player's resolved profession name
and aggregated across logs.

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

## Attendance Ledger

Attendance is computed from squad-player participation across all valid logs.

### Inputs Used

- `details.players[*]` (squad membership, account/name/profession/group)
- `players[*].activeTimes[0]`
- `details.durationMS` (fallback when active time is missing)

### Player Inclusion

- Include only squad players: `!player.notInSquad`.
- Player key for aggregation is:
  - `player.account` when present and not `"Unknown"`
  - otherwise `player.name`

### Time Aggregation

Per squad player entry:

- `activeMs = players[*].activeTimes[0]` when numeric, else `details.durationMS || 0`
- `combatTimeMs[player] += activeMs`
- if profession is known:
  - `professionTimeMs[player][profession] += activeMs`

Also track appearance window per player:

- `firstSeenFightTs`: earliest fight timestamp where player appears in squad
- `lastSeenFightTs`: latest fight timestamp where player appears in squad
- `lastSeenFightDurationMs`: duration of that latest fight

Final elapsed squad time:

- `squadTimeMs = max(0, (lastSeenFightTs + lastSeenFightDurationMs) - firstSeenFightTs)`
- fallback to `combatTimeMs` when timestamps are unavailable

Character names shown in attendance are the unique set of `player.name` values
seen for that player key.

### Row Shape / Sorting

For each aggregated player:

- `account`: aggregation key
- `characterNames`: unique character names, sorted ascending
- `classTimes`: entries from `professionTimeMs`, filtered to
  - `profession !== "Unknown"`
  - `timeMs > 0`
- `combatTimeMs`: total active combat time
- `squadTimeMs`: elapsed time between first seen fight start and last seen fight end

Rows are sorted by:
1. `squadTimeMs` descending
2. `account` ascending

Rows with `account` missing/`"Unknown"` are excluded from final output.

Implementation: `src/renderer/stats/computeStatsAggregation.ts` (`attendanceData`).

## Squad Comp By Fight

This section provides per-fight party-line roster composition.

### Inputs Used

- `details.players[*]` (squad membership, group, account/name/profession)
- `details.durationMS`
- fight metadata/time fields used by `resolveFightTimestamp` and `resolveMapName`

### Fight Ordering

Fights are sorted by resolved fight timestamp ascending:

- `uploadTime`
- fallback: `timeStartStd`, `timeStart`, `timeEndStd`, `timeEnd`

### Party Assignment

For each squad player (`!player.notInSquad`) in a fight:

- `party = Number(player.group)` when finite and `> 0`, else `0` (`Unassigned`)
- profession label is normalized via `resolveProfessionLabel(...)`

Per party:

- append player row `{ account, characterName, profession }`
- increment `classCounts[profession] += 1`

### Party / Player Sorting

Within each party:

- players are sorted by `profession`, then `account` ascending

Party rows are sorted by:
1. party number ascending for `1..n`
2. party `0` (`Unassigned`) last

### Output Shape

Per fight:

- `id`: file/log id fallback chain
- `label`: `F{index+1}` in timestamp-sorted order
- `timestamp`: resolved fight timestamp
- `mapName`: resolved map name
- `duration`: `formatDurationMs(details.durationMS)`
- `parties`: sorted party rows with class counts and account list

Implementation: `src/renderer/stats/computeStatsAggregation.ts` (`squadCompByFight`).

## Top Stats / MVP

Top stats are computed by ranking the leaderboards for key metrics (down
contribution, barrier, healing, cleanses, strips, stability, CC, etc).
MVP scoring uses weighted ratios against these leaderboards and is configured
via `statsViewSettings` + `mvpWeights`.

Participation is computed as `logsJoined` (number of logs where the player
appears in the squad).

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

## Known Caveats

- EI JSON versions can add/remove fields; missing fields always fall back to `0`.
- `distToCom` and `stackDist` are not guaranteed to exist in every log; `distanceToTag` may be `0`.
- Incoming CC/strips use weighted skill mappings; mismatches can occur if EI changes skill ids or hit accounting.
- Stability generation depends on buff metadata presence (`buffMap`) and correct `durationMS`.
- Damage uses `dpsAll[0].damage` (player total) rather than summing per-target totals, which may differ when targets are filtered or merged.
- Skill usage totals are raw cast counts unless the per-second view is selected; missing `activeTimes` falls back to log duration for rate calculations.
- Some detailed WvW EI exports may contain outlier values in `totalDamageDist`
  (notably `max` on specific skill rows). Spike-hit and target-mode outgoing
  aggregations prefer/anchor to `targetDamageDist` to reduce false outliers.

## Manifest & Field Usage

The dev dataset manifest is generated by the app when exporting logs. It is
stored as `dev/datasets/<dataset>/manifest.json` and contains:

- `id`: log id or generated id
- `filePath`: relative path to the log JSON
- `fightName`
- `encounterDuration`
- `uploadTime`
- `timeStart`
- `timeStartStd`
- `durationMS`
- `success`
- `playerCount`
- `squadCount`
- `nonSquadCount`

Stats calculations **do not** use the manifest fields directly; the manifest
is used for listing logs and metadata only. All computations are derived from
the EI JSON log payload fields listed in the **Input Contract** and the
sections above.
