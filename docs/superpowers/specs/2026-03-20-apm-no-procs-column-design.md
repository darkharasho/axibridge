# APM (No Procs) Column — Design Spec

## Summary

Add a third column to the APM Breakdown table: **APM (No Procs)**. This column excludes auto attacks, trait procs, and gear procs from the APM calculation, giving a more accurate measure of deliberate player actions.

## Motivation

Community feedback identified that the current APM and APM (No Auto) columns don't distinguish between deliberate skill activations and passive procs (trait-triggered skills like "Windborne Notes", gear-triggered skills like "Sigil of Fire"). The EI JSON `skillMap` already provides `isTraitProc` and `isGearProc` booleans on every skill entry, making this data readily available.

## Column Definitions

| Column | Formula | Excludes |
|--------|---------|----------|
| **APM** | `totalCasts / activeMinutes` | Nothing |
| **APM (No Auto)** | `(totalCasts - autoCasts) / activeMinutes` | `autoAttack === true` |
| **APM (No Procs)** | `(totalCasts - excludedCasts) / activeMinutes` | `autoAttack === true` OR `isTraitProc === true` OR `isGearProc === true` |

A skill that is both an auto attack and a proc is only counted once in the exclusion set (union, not sum).

All three columns also have APS (actions per second) variants toggled by the existing APM/APS view switch.

## Data Pipeline Changes

### 1. Pruning — `src/renderer/stats/utils/pruneStatsLog.ts`

`pruneMetaMap` gains an `includeProc?: boolean` option. When true, preserves `isTraitProc` and `isGearProc` booleans on skillMap entries. The `skillMap` call site passes `includeProc: true`.

### 2. Skill Options — `src/renderer/stats/computeSkillUsageData.ts`

Two new maps (`skillTraitProcMap`, `skillGearProcMap`) are populated from `skillMap[sId].isTraitProc` and `skillMap[sId].isGearProc`, following the same pattern as `skillAutoAttackMap`. These are passed through to `skillOptions`.

### 3. Types — `src/renderer/stats/statsTypes.ts`

`SkillOption` gains:
- `isTraitProc?: boolean`
- `isGearProc?: boolean`

`ApmPlayerRow` gains:
- `totalProcCasts: number` — count of casts for skills where `isTraitProc || isGearProc` (but not also auto attack, to avoid double-counting with `totalAutoCasts`)
- `apmNoProcs: number`
- `apsNoProcs: number`

`ApmSpecBucket` gains:
- `totalProcCasts: number`

### 4. Classification — `src/renderer/stats/hooks/useApmStats.ts`

A new `isProc(id)` helper checks `option.isTraitProc === true || option.isGearProc === true`. The per-player loop tracks:
- `pProcCasts`: count of casts for skills where `isProc && !isAuto` (proc-only, not already counted in `pAutoCasts`)

Then:
- `excludedCasts = pAutoCasts + pProcCasts`
- `castsNoProcs = Math.max(0, pCasts - excludedCasts)`
- `apmNoProcs = castsNoProcs / activeMinutes`
- `apsNoProcs = castsNoProcs / safeActiveSeconds`

Bucket-level totals follow the same pattern: `totalProcCasts` aggregated, then `totalApmNoProcs` / `totalApsNoProcs` computed.

## UI Changes — `src/renderer/stats/sections/ApmSection.tsx`

### All Skills View

Grid changes from 3 columns to 4:
- Layout: `grid-cols-[1.6fr_0.7fr_0.9fr]` → `grid-cols-[1.6fr_0.6fr_0.7fr_0.8fr]`
- New header: sortable `APM (No Procs)` / `APS (No Procs)`
- `allSkillsSort.key` type: `'apm' | 'apmNoAuto'` → `'apm' | 'apmNoAuto' | 'apmNoProcs'`
- New data cell renders `apmNoProcs` / `apsNoProcs`

### Per-Skill View

No change. A single skill is either a proc or it isn't — the "No Procs" concept doesn't apply at the individual skill level.

### Dense Table View

No change. Shows per-skill cast counts per player, orthogonal to proc classification.

## Testing

### New Tests

1. **`useApmStats` unit test**: Feed skill options with `isTraitProc: true` and `isGearProc: true`. Verify:
   - `apmNoProcs` excludes auto + trait proc + gear proc casts
   - `apmNoAuto` still only excludes auto casts (regression check)
   - `apm` still includes everything
   - A skill that is both auto and proc is not double-counted in exclusion

2. **`computeSkillUsageData` unit test**: Feed a log with `skillMap` entries containing `isTraitProc`/`isGearProc` and verify they appear on output `skillOptions`.

3. **`pruneStatsLog` unit test**: Verify `isTraitProc` and `isGearProc` survive pruning on skillMap entries.

### Existing Tests

All existing APM tests pass unchanged — `apmNoProcs` is purely additive.

No e2e or integration test changes needed.

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/stats/utils/pruneStatsLog.ts` | `pruneMetaMap` gains `includeProc` option; `skillMap` call site uses it |
| `src/renderer/stats/computeSkillUsageData.ts` | Pass `isTraitProc`/`isGearProc` through to `skillOptions` |
| `src/renderer/stats/statsTypes.ts` | Add fields to `SkillOption`, `ApmPlayerRow`, `ApmSpecBucket` |
| `src/renderer/stats/hooks/useApmStats.ts` | `isProc` helper, `pProcCasts` tracking, new metric computation |
| `src/renderer/stats/sections/ApmSection.tsx` | 4-column grid, new header, new data cell, sort key expansion |
| `src/renderer/__tests__/useApmStats.test.tsx` | New test cases for proc exclusion |
| `src/renderer/__tests__/computeSkillUsageData.test.ts` | New test case for proc field passthrough |
