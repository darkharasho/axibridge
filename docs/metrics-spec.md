# Combat Metrics Spec

This document describes the project-defined combat metrics used in the UI,
Discord summaries, and aggregate stats. The intent is to define the metrics
independently from any third-party implementation while staying consistent
with EI JSON inputs. It also records the exact fields and aggregation rules
so the stats dashboard, Discord, and cards produce identical values.

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

## Outgoing Crowd Control

We compute a weighted count of crowd control skill hits by scanning each
player's `totalDamageDist` entries. Each skill id is mapped to a coefficient
that normalizes multi-hit effects into a single "CC unit". Only skills that
match the player's profession group (or relics) are counted.

Implementation: `src/shared/combatMetrics.ts` (OUTGOING_CC_SKILLS).

## Incoming Strips and Crowd Control

We compute incoming strips and incoming CC by scanning each player's
`totalDamageTaken` entries. Each skill id is mapped to a coefficient, then
`hits`, `missed`, and `blocked` are multiplied by that coefficient and summed.

Implementation: `src/shared/combatMetrics.ts`
(INCOMING_STRIP_SKILL_WEIGHTS, INCOMING_CC_SKILL_WEIGHTS).

## Cleanses

`cleanses = support[0].condiCleanse + support[0].condiCleanseSelf`.

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerCleanses).

## Strips

`strips = support[0].boonStrips`.

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

## Known Caveats

- EI JSON versions can add/remove fields; missing fields always fall back to `0`.
- `distToCom` and `stackDist` are not guaranteed to exist in every log; `distanceToTag` may be `0`.
- Incoming CC/strips use weighted skill mappings; mismatches can occur if EI changes skill ids or hit accounting.
- Stability generation depends on buff metadata presence (`buffMap`) and correct `durationMS`.
