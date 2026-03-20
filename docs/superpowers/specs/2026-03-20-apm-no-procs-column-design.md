# APM (No Procs) Column — Design Spec

## Summary

Add a third column to the APM Breakdown table: **APM (No Procs)**. This column excludes auto attacks, trait procs, gear procs, and unconditional procs from the APM calculation, giving a more accurate measure of deliberate player actions.

## Motivation

Community feedback identified that the current APM and APM (No Auto) columns don't distinguish between deliberate skill activations and passive procs (trait-triggered skills like "Windborne Notes", gear-triggered skills like "Sigil of Fire", unconditional procs like "Selfless Daring"). The EI JSON `skillMap` provides `isTraitProc`, `isGearProc`, and `isUnconditionalProc` booleans on every skill entry, making this data readily available.

## Column Definitions

| Column | Formula | Excludes |
|--------|---------|----------|
| **APM** | `totalCasts / activeMinutes` | Nothing |
| **APM (No Auto)** | `(totalCasts - autoCasts) / activeMinutes` | `autoAttack === true` |
| **APM (No Procs)** | `(totalCasts - excludedCasts) / activeMinutes` | `autoAttack === true` OR `isTraitProc === true` OR `isGearProc === true` OR `isUnconditionalProc === true` |

A skill matching multiple exclusion criteria is only counted once in the exclusion set (union, not sum). In practice, the EI data shows no overlap between auto attacks and proc categories, but the union approach is the correct defensive implementation.

All three columns also have APS (actions per second) variants toggled by the existing APM/APS view switch.

## Data Pipeline Changes

### 1. Pruning — `src/renderer/stats/utils/pruneStatsLog.ts`

`pruneMetaMap` gains an `includeProcFlags?: boolean` option. When true, preserves `isTraitProc`, `isGearProc`, and `isUnconditionalProc` booleans on skillMap entries. The `skillMap` call site passes `includeProcFlags: true`.

### 2. Skill Options — `src/renderer/stats/computeSkillUsageData.ts`

A new `skillProcMap` of type `Map<string, { isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean }>` is populated from `skillMap[sId]`, following the same pattern as `skillAutoAttackMap`. Fields are passed through to `skillOptions`.

### 3. Types — `src/renderer/stats/statsTypes.ts`

`SkillOption` gains:
- `isTraitProc?: boolean`
- `isGearProc?: boolean`
- `isUnconditionalProc?: boolean`

`ApmPlayerRow` gains:
- `totalProcCasts: number` — count of casts for skills where `isTraitProc || isGearProc || isUnconditionalProc` (but not also auto attack, to avoid double-counting with `totalAutoCasts`)
- `apmNoProcs: number`
- `apsNoProcs: number`

`ApmSpecBucket` gains:
- `totalProcCasts: number`

### 4. Classification — `src/renderer/stats/hooks/useApmStats.ts`

A new `isProc(id)` helper checks `option.isTraitProc === true || option.isGearProc === true || option.isUnconditionalProc === true`. The per-player loop tracks:
- `pProcCasts`: count of casts for skills where `isProc && !isAuto` (proc-only, not already counted in `pAutoCasts`)

Then:
- `excludedCasts = pAutoCasts + pProcCasts`
- `castsNoProcs = Math.max(0, pCasts - excludedCasts)`
- `apmNoProcs = castsNoProcs / activeMinutes`
- `apsNoProcs = castsNoProcs / safeActiveSeconds`

Bucket-level totals follow the same pattern: `totalProcCasts` aggregated, then `totalApmNoProcs` / `totalApsNoProcs` computed.

### 5. Type definition — `src/shared/dpsReportTypes.ts`

Update the `skillMap` value type from `{ name: string; icon: string }` to include the EI proc fields:
```ts
skillMap?: { [key: string]: { name: string; icon: string; autoAttack?: boolean; isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean } };
```

This aligns the TypeScript type with the actual EI JSON payload.

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

## Web Report

The web report shares `StatsView` and `useApmStats`, so it automatically gets the new column. When `skillUsageData.skillOptions` is trimmed by the GitHub upload handler for large reports, proc fields will be absent (`undefined`). In this case, `isProc` returns false for all skills, making "APM (No Procs)" equivalent to "APM (No Auto)" — a reasonable graceful degradation.

## Documentation — `src/shared/metrics-spec.md`

Update the APM Breakdown section to document the new "No Procs" variant and its exclusion criteria. Run `npm run sync:metrics-spec` afterward to sync to `docs/`.

## Testing

### New Tests

1. **`useApmStats` unit test**: Feed skill options with `isTraitProc: true`, `isGearProc: true`, and `isUnconditionalProc: true`. Verify:
   - `apmNoProcs` excludes auto + trait proc + gear proc + unconditional proc casts
   - `apmNoAuto` still only excludes auto casts (regression check)
   - `apm` still includes everything
   - A skill that is both auto and proc is not double-counted in exclusion

2. **`computeSkillUsageData` unit test**: Feed a log with `skillMap` entries containing `isTraitProc`/`isGearProc`/`isUnconditionalProc` and verify they appear on output `skillOptions`.

3. **`pruneStatsLog` unit test**: New test file. Verify `isTraitProc`, `isGearProc`, and `isUnconditionalProc` survive pruning on skillMap entries.

### Existing Tests

All existing APM tests pass unchanged — `apmNoProcs` is purely additive.

No e2e or integration test changes needed.

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/stats/utils/pruneStatsLog.ts` | `pruneMetaMap` gains `includeProcFlags` option; `skillMap` call site uses it |
| `src/renderer/stats/computeSkillUsageData.ts` | Pass `isTraitProc`/`isGearProc`/`isUnconditionalProc` through to `skillOptions` |
| `src/renderer/stats/statsTypes.ts` | Add fields to `SkillOption`, `ApmPlayerRow`, `ApmSpecBucket` |
| `src/renderer/stats/hooks/useApmStats.ts` | `isProc` helper, `pProcCasts` tracking, new metric computation |
| `src/renderer/stats/sections/ApmSection.tsx` | 4-column grid, new header, new data cell, sort key expansion |
| `src/shared/dpsReportTypes.ts` | Update `skillMap` value type to include proc booleans |
| `src/shared/metrics-spec.md` | Document "No Procs" variant (+ run `sync:metrics-spec`) |
| `src/renderer/__tests__/useApmStats.test.tsx` | New test cases for proc exclusion |
| `src/renderer/__tests__/computeSkillUsageData.test.ts` | New test case for proc field passthrough |
| `src/renderer/__tests__/pruneStatsLog.test.ts` | New test file for pruning proc field preservation |
