# Stats Dashboard Stability Fixes

**Date:** 2026-03-24
**Scope:** Regression fixes for StatsView dissolve loading, settling state, and section animations
**Approach:** Targeted fixes (Approach A) — minimum changes to restore prior behavior

## Problem

Recent performance optimizations (OOM fix, aggregation caching, bulk upload animation disabling) introduced three regressions in the stats dashboard:

1. The dissolve loading animation re-triggers every time the user switches tabs and returns to stats
2. After bulk upload completes, the dashboard stays stuck in a "settling" state while details hydrate
3. Section materializing animations (particles, fade-in transitions) no longer play — sections pop in instantly

## Root Causes

### 1. Dissolve re-triggers on tab switch

`StatsView.tsx:330` uses a `useRef(alreadySettledOnMount)` to decide whether to skip the dissolve on mount. But StatsView is never unmounted — it uses `display: none` when hidden. The ref captures state from the very first render and never updates. If the first render happened before stats were ready, `dissolveCompletedOnce` starts as `false` and the dissolve replays on every tab return.

**Location:** `src/renderer/StatsView.tsx` lines 330-340

### 2. Fallback path phase divergence

When <8 logs are loaded, the aggregation runs on the main thread (fallback path). The fallback `resolvedAggregationProgress` always returns `{ active: false, phase: 'idle' }`. The worker path returns `{ active: true, phase: 'settled' }` on completion. This causes `statsSettling` in StatsView to evaluate differently depending on log count, creating inconsistent settling behavior.

**Location:** `src/renderer/stats/hooks/useStatsAggregationWorker.ts` lines 481-490

### 3. Details hydration blocks dissolve completion

The `statsSettling` memo treats details hydration progress (`statsDataProgress.active`) as a reason to keep the dissolve loading active. After bulk upload, details trickle in slowly (3 concurrent fetches). With 30+ logs, the dissolve bar sits at partial progress for a long time, blocking sections from appearing. The dissolve was meant to gate on aggregation, not details.

**Location:** `src/renderer/StatsView.tsx` lines 200-260

## Fixes

### Fix 1: Track dissolve completion by log count

**Files changed:** `src/renderer/StatsView.tsx`

Remove:
- `alreadySettledOnMount` ref (line 330)
- `dissolveCompletedOnce` boolean state (line 331)
- The effect that sets `dissolveCompletedOnce` (lines 333-339)

Replace with:
- `dissolveCompletedForLogCount` state (`number | null`, initial `null`)
- When dissolve completes (the existing condition: `!rawDissolveActive && !dissolveCompleting && !statsSettling.active && stats != null`), store `logs.length`
- `dissolveActive` check becomes: `rawDissolveActive && dissolveCompletedForLogCount !== logs.length`
- When `logs.length` changes to a new value, the dissolve can play again for the new data set

This means:
- Tab switch with same logs = no dissolve replay (log count matches)
- New logs added = dissolve plays once for the new set
- No stale refs involved

### Fix 2: Fallback path emits 'settled' phase

**Files changed:** `src/renderer/stats/hooks/useStatsAggregationWorker.ts`

Change `resolvedAggregationProgress` (lines 481-490) from:
```typescript
{
    active: false,
    phase: 'idle' as const,
    streamed: logs.length,
    total: logs.length,
    startedAt: 0,
    completedAt: Date.now()
}
```

To:
```typescript
{
    active: logs.length > 0,
    phase: logs.length > 0 ? 'settled' as const : 'idle' as const,
    streamed: logs.length,
    total: logs.length,
    startedAt: 0,
    completedAt: Date.now()
}
```

This aligns the fallback path with the worker path's completion semantics.

### Fix 3: Decouple details hydration from dissolve gate

**Files changed:** `src/renderer/StatsView.tsx`

Split the `statsSettling` memo into two concerns:

**a) `aggregationSettling` memo** — gates the dissolve animation:
- `active` is `true` only when `aggregationProgress.phase === 'streaming'` (actively computing)
- Becomes `false` when phase is `'settled'` or `'idle'`
- This drives `dissolveActive`, particles, section materializing classes

**b) `detailsProgress` memo** — display-only indicator:
- Computes the "Loading fight details" / "X of Y fights prepared" text from `statsDataProgress`
- Drives a non-blocking status line in the UI (not the dissolve bar)
- Does NOT affect `dissolveActive` or `sectionContentReady`

The existing dissolve bar UI can show `detailsProgress` text after the dissolve completes, but it should not gate section rendering. Sections render with whatever data is available and update in-place as details arrive.

## Files Affected

| File | Change |
|------|--------|
| `src/renderer/StatsView.tsx` | Fixes 1 and 3: dissolve tracking, settling memo split |
| `src/renderer/stats/hooks/useStatsAggregationWorker.ts` | Fix 2: fallback phase alignment |

## Testing

- **Manual scenario A:** Load a few logs, switch to stats tab, navigate away, navigate back. Dissolve should NOT replay.
- **Manual scenario B:** Bulk upload 20+ logs. After upload completes, stats should finish settling promptly (once aggregation completes), not wait for all details to hydrate.
- **Manual animation check:** On first load with new logs, dissolve particles should animate, sections should materialize with fade-in transition, then particles fade out.
- **Unit tests:** Existing `StatsView.integration.test.tsx` and `useStatsAggregationWorker` tests should still pass. No new test files needed for these regression fixes.

## Out of Scope

- State machine consolidation of settling logic (planned as Approach B follow-up)
- MotionConfig / Framer Motion changes (not present in current code — removed during theme redesign)
- Performance optimizations to the settling/dissolve system
