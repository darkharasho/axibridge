# Pruning Denylist Conversion

**Date**: 2026-03-20
**Status**: Approved
**Context**: [Pruning Audit](../../pruning-audit.md)

## Problem

The EI JSON pruning system uses allowlists — only explicitly listed fields survive. This has caused two "phantom data loss" incidents where new features silently got `undefined` for fields the pruner stripped:

1. **Damage modifiers** — `damageModMap` was stripped; required re-fetch migration
2. **Outgoing conditions** — `target.buffs` and `conditionMetrics` stripped; outgoing/incoming showed identical data

Each new EI JSON field used by a future feature requires: adding to both allowlists (main + renderer), a re-fetch migration for stored logs, and debugging time to discover the pruner was the cause.

## Solution

Convert both pruning sites from allowlist (pick) to denylist (omit). New fields survive automatically. Only explicitly denied fields are stripped.

### Pruning Sites

| Site | File | When it runs |
|------|------|-------------|
| Main process | `src/main/detailsProcessing.ts` | At fetch time, before persisting to disk |
| Renderer | `src/renderer/stats/utils/pruneStatsLog.ts` | Before stats computation |

Note: The two pruners are asymmetric. The main-process pruner only reshapes target `combatReplayData`. The renderer pruner additionally reshapes player minions, player `combatReplayData` (with conditional position keeping), and `damageModMap` entries. This asymmetry is intentional — the renderer does a second, more detailed pass.

### Denylists

**Top-level denylist:**
- `mechanics` — PvE boss mechanics, irrelevant for WvW

**Player denylist:** empty — all player fields pass through.

**Target denylist:** empty — all target fields pass through.

### Reshaping Operations (unchanged)

These four renderer operations remain as-is. They reshape internal structure of kept fields rather than filtering whole fields:

1. **`pruneMetaMap`** — strips `skillMap`/`buffMap` entries to essential metadata (name, icon, classification, stacking, autoAttack, proc flags)
2. **`damageModMap` reshaping** — strips each entry to `{name, icon, description, incoming}`
3. **`pruneCombatReplayData`** — strips replay data to `start`/`down`/`dead` (plus `positions` for commanders when needed for distance calculations)
4. **Minion pruning** — reduces each minion to `name` + `totalDamageTakenDist`

The main-process `pruneCombatReplayData` (strips target replay to `start`/`down`/`dead`) also remains.

## Implementation

1. Add an `omit` helper alongside `pick` in both files. The `pick` helper is still used by reshaping operations (`pruneCombatReplayData`, minion pruning) and must be retained.
2. Replace `pick(details, TOP_LEVEL_KEYS)` → `omit(details, TOP_LEVEL_DENY)` where `TOP_LEVEL_DENY = ['mechanics']`
3. For players: shallow-copy the player object (e.g. `{...player}`), then overwrite `minions` with the pruned minion array and overwrite `combatReplayData` with the pruned replay data on the copy. Do not mutate the original.
4. For targets: shallow-copy the target object, then overwrite `combatReplayData` with the pruned version on the copy.
5. Apply remaining reshaping steps (`pruneMetaMap`, `damageModMap` reshaping) on the top-level pruned object.
6. Remove the now-unused allowlist constants (`TOP_LEVEL_KEYS`, `PLAYER_KEYS`, `TARGET_KEYS` in both files).
7. Update tests:
   - **Invert existing unknown-field assertions**: tests currently assert unknown fields are stripped (e.g. `__unknown__`, `__secret__`, `__extra__`). These must be updated to assert unknown fields **survive**.
   - Add tests verifying denied fields (`mechanics`) are stripped.
   - Verify reshaping operations still work correctly.

## Migration: `__statsPruned` Sentinel

The renderer uses `__statsPruned` to skip re-pruning logs that were already pruned. After this change, logs pruned under the old allowlist code and stored with `__statsPruned = true` will not be re-pruned — they keep their more aggressively stripped data. This is acceptable: those logs already work correctly with existing metrics, they just have fewer fields available. If a future feature needs a field that was stripped from an old log, the existing re-fetch mechanism handles it (same as today).

## Memory Impact

~2.5 MB more per log stays in memory (player fields previously stripped by the renderer). The main-process pruner already kept most player fields, so the increase is primarily on the renderer side. For a 20-log session that's ~50 MB extra against the 6 GB configured heap — negligible.

## What This Fixes

- New EI JSON fields automatically survive both pruning passes
- No more "phantom data loss" when new features reference fields the pruner previously stripped
- No more needing allowlist updates + re-fetch migrations for new features
