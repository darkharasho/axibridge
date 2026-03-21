# EI JSON Pruning Audit

**Date**: 2026-03-20
**Context**: Non-damaging conditions (Vulnerability, Chill, Weakness, etc.) showed identical data for outgoing/incoming. Root cause investigation revealed the pruning system was stripping `target.buffs` and `conditionMetrics` before the renderer could use them for outgoing condition tracking.

## What the pruner does

Two pruning passes strip fields from the EI JSON returned by dps.report:

1. **Main process** — `pruneDetailsForStats()` in `src/main/detailsProcessing.ts` — runs when details are first fetched and stored
2. **Renderer** — `pruneLogForStats()` / `pruneDetailsForStats()` in `src/renderer/stats/utils/pruneStatsLog.ts` — runs before stats computation

Both use allowlists (`TOP_LEVEL_KEYS`, `TARGET_KEYS`, and inline player key arrays). Any EI JSON field not in the allowlist is silently dropped.

## Size impact

Measured against 14 test fixtures (4–36 MB each):

| Metric | Value |
|---|---|
| Average savings | ~35–40% per log |
| Typical log: raw | 10 MB |
| Typical log: pruned | 6 MB |
| Savings per log | ~3–4 MB |
| For 20 loaded logs | ~60–80 MB total savings |
| Configured heap | 6,144 MB |

## What gets pruned

### Player fields removed (~2.5 MB/log)

| Field | Size (typical) | Used by existing metrics? |
|---|---|---|
| `buffUptimesActive` | ~874 KB | No (has `generated` attribution data — potential future use) |
| `offGroupBuffVolumes` | ~317 KB | No |
| `offGroupBuffVolumesActive` | ~317 KB | No |
| `buffVolumes` | ~309 KB | No |
| `buffVolumesActive` | ~310 KB | No |
| `groupBuffVolumes` | ~154 KB | No |
| `groupBuffVolumesActive` | ~154 KB | No |
| `selfBuffVolumes` | ~92 KB | No |
| `selfBuffVolumesActive` | ~92 KB | No |
| `offGroupBuffs` | ~26 KB | No |
| `offGroupBuffsActive` | ~26 KB | No |
| `damageModifiersTarget` | ~18 KB | No |
| `incomingDamageModifiersTarget` | ~19 KB | No |
| `boonsStates` | ~12 KB | No (time series of boon stacks) |
| `conditionsStates` | ~11 KB | No (time series of condition stacks) |
| `powerDamage1S` | ~8 KB | No (player-level; target-level IS kept) |
| `healthPercents` | ~8 KB | No |
| `damageTaken1S` | ~7 KB | No (player-level; accessed on unpruned path in StatsView) |
| `targetConditionDamage1S` | ~6 KB | No |
| `conditionDamage1S` | ~6 KB | No |
| `conditionDamageTaken1S` | ~6 KB | No |
| `consumables` | ~5 KB | No |
| `barrierPercents` | ~5 KB | No |
| `weaponSets` / `weapons` | ~7 KB | No |
| `guildID` | ~1 KB | No |

### Top-level fields removed (~3 KB/log)

| Field | Used? |
|---|---|
| `mechanics` | No |

### Target fields — now preserved

| Field | Why it was added |
|---|---|
| `buffs` | Outgoing non-damaging condition tracking via `statesPerSource` |

### Top-level fields — now preserved

| Field | Why it was added |
|---|---|
| `conditionMetrics` | Precomputed outgoing conditions from full EI JSON (before target pruning) |

## Correctness impact

**Zero currently-pruned fields affect existing metric accuracy.** Every field that existing code reads is in the allowlists.

The pruner's risk is not current correctness — it's that new features silently get `undefined` when they reference fields the pruner strips. Known incidents:

| Incident | Field | Symptom |
|---|---|---|
| Damage modifier support | `damageModMap` | Modifiers showed empty; required re-fetch migration |
| Outgoing non-damaging conditions | `target.buffs`, `conditionMetrics` | Outgoing/incoming showed identical data |

Both required code fixes to the allowlists AND a re-fetch mechanism for already-stored logs.

## Decision framework

**Keep pruning if**: disk I/O or IPC transfer size is a bottleneck (e.g., low-memory machines, very large sessions with 50+ logs).

**Remove pruning if**: the recurring "phantom data loss" debugging cost outweighs ~3 MB/log savings against a 6 GB heap. Each new EI JSON field used by a future feature will require:
1. Adding to both allowlists (main + renderer)
2. A re-fetch migration for stored logs
3. Debugging time to discover the pruner was the cause

**Middle ground**: Replace allowlists with a denylist of known-large, never-needed fields. This inverts the default — new fields survive automatically, and only explicitly excluded fields are stripped.
