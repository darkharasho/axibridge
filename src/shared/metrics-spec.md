# Combat Metrics Spec

This document describes the project-defined combat metrics used in the UI,
Discord summaries, and aggregate stats. The intent is to define the metrics
independently from any third-party implementation while staying consistent
with EI JSON inputs. It also records the exact fields and aggregation rules
so the stats dashboard, Discord, and cards produce identical values.

Spec version: `v4` (see `src/shared/metrics-methods.json`).

## Input Contract (EI JSON)

All metrics are derived from the EI JSON payload produced by dps.report. The
minimum fields consumed are:

- `players[*].dpsAll[0].damage`, `players[*].dpsAll[0].dps`, `players[*].dpsAll[0].breakbarDamage`
- `players[*].defenses[0].damageTaken`, `deadCount`, `downCount`,
  `missedCount`, `blockedCount`, `evadedCount`, `dodgeCount`,
  `receivedCrowdControl`, `receivedCrowdControlDuration`,
  `boonStrips`, `boonStripsTime`
- `players[*].support[0].condiCleanse`, `condiCleanseSelf`, `boonStrips`,
  `boonStripsTime`, `resurrects`
- `players[*].statsAll[0].stackDist`, `players[*].statsAll[0].distToCom`
- `players[*].statsTargets[*][0].downContribution`, `killed`, `downed`,
  `againstDownedCount`
- `players[*].extHealingStats.outgoingHealingAllies`
- `players[*].extBarrierStats.outgoingBarrierAllies`
- `players[*].totalDamageDist`, `players[*].targetDamageDist`, `players[*].totalDamageTaken`
- `players[*].activeTimes`
- `players[*].rotation`
- `players[*].buffUptimes`
- `players[*].selfBuffs`, `players[*].groupBuffs`, `players[*].squadBuffs`
- `players[*].selfBuffsActive`, `players[*].groupBuffsActive`, `players[*].squadBuffsActive`
- `players[*].group`
- `buffMap`, `skillMap`, and `durationMS` for stability generation, boon output, and skill labeling
- `targets[*].buffs[*].statesPerSource` when available for condition application counts
- `details.fightName`, `details.uploadTime` (or `details.timeStartStd` / `details.timeStart` fallback),
  `details.zone`/`mapName`/`map`/`location`, `details.success`,
  `details.targets`, `details.durationMS`

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

## Special Buffs

Special (non-boon) buff tables are computed from `buffUptimes` using
`buffMap` classification and icon metadata. Durations are normalized by
`activeTimes` and `durationMS`.

Implementation: `src/renderer/stats/computeStatsAggregation.ts`.

## Offense / Defense / Support / Healing Tables

Detailed tables aggregate the per-player totals defined in:
- `src/renderer/stats/statsMetrics.ts` (metric definitions)
- `src/shared/dashboardMetrics.ts` (per-player metric extraction)
- `src/renderer/stats/computeStatsAggregation.ts` (aggregation)

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
