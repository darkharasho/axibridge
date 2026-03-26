# Stats Dashboard Stability Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three regressions in the StatsView dissolve loading: re-triggering on tab switch, stuck settling after bulk upload, and broken section animations.

**Architecture:** Three targeted, independent fixes. Fix 2 changes the aggregation hook's fallback path. Fix 3 splits the settling memo in StatsView. Fix 1 replaces the dissolve tracking mechanism. Order: Fix 2 first (smallest, unblocks Fix 3 consistency), then Fix 3 (core bug), then Fix 1 (dissolve identity tracking, depends on Fix 3's renamed memo).

**Tech Stack:** React (hooks, useMemo, useEffect, useState), TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-03-24-stats-dashboard-stability-fixes.md`

---

### Task 1: Fix 2 — Fallback path emits 'settled' phase

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsAggregationWorker.ts:481-490`

- [ ] **Step 1: Change the fallback `resolvedAggregationProgress`**

In `src/renderer/stats/hooks/useStatsAggregationWorker.ts`, replace lines 483-490:

```typescript
// BEFORE (lines 483-490):
        : {
            active: false,
            phase: 'idle' as const,
            streamed: logs.length,
            total: logs.length,
            startedAt: 0,
            completedAt: Date.now()
        };
```

```typescript
// AFTER:
        : {
            active: logs.length > 0,
            phase: logs.length > 0 ? 'settled' as const : 'idle' as const,
            streamed: logs.length,
            total: logs.length,
            startedAt: 0,
            completedAt: Date.now()
        };
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `npx vitest run src/renderer/__tests__/StatsView.integration.test.tsx`
Expected: All tests PASS

Run: `npx vitest run src/renderer/stats/__tests__/aggregationCache.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/hooks/useStatsAggregationWorker.ts
git commit -m "fix: fallback aggregation path emits 'settled' phase to match worker path"
```

---

### Task 2: Fix 3 — Decouple details hydration from dissolve gate

**Files:**
- Modify: `src/renderer/StatsView.tsx:200-263`

This is the core fix. The current `statsSettling` memo (lines 200-260) mixes aggregation progress and details hydration into a single `active` flag. We split it into two memos: `aggregationSettling` (gates dissolve) and `detailsProgress` (display-only).

- [ ] **Step 1: Replace `statsSettling` memo with `aggregationSettling` memo**

In `src/renderer/StatsView.tsx`, replace the `statsSettling` memo (lines 200-260) with an `aggregationSettling` memo that only checks aggregation phase:

```typescript
    const aggregationSettling = useMemo(() => {
        // "Syncing" state: statsDataProgress reports logs but logs prop hasn't updated yet
        const detailsTotal = Math.max(0, Number(statsDataProgress?.total || logs.length || 0));
        if (detailsTotal > 0 && logs.length === 0) {
            return {
                active: true,
                phaseLabel: 'Preparing fights for stats',
                progressText: 'Syncing uploaded fights into the stats dashboard',
                progressPercent: 5
            };
        }
        const total = Math.max(0, Number(aggregationProgress?.total || logs.length || 0));
        const phase = aggregationProgress?.phase;
        const active = Boolean(aggregationProgress?.active)
            && (phase === 'streaming' || phase === 'computing')
            && total > 0;
        if (!active) {
            return {
                active: false,
                phaseLabel: '',
                progressText: '',
                progressPercent: 0
            };
        }
        const streamed = Math.min(Math.max(Number(aggregationProgress?.streamed || 0), 0), total);
        const phaseLabel = phase === 'streaming'
            ? 'Loading fight data'
            : 'Finalizing squad stats';
        const progressText = phase === 'streaming'
            ? `${streamed} of ${total} fights loaded`
            : 'All fights loaded \u2022 calculating final totals';
        const progressPercent = phase === 'streaming'
            ? Math.max(1, Math.min(99, Math.round((streamed / total) * 100)))
            : 99;
        return {
            active: true,
            phaseLabel,
            progressText,
            progressPercent
        };
    }, [aggregationProgress, statsDataProgress, logs.length]);
```

- [ ] **Step 2: Add `detailsProgress` memo after `aggregationSettling`**

Add a new memo right after `aggregationSettling`:

```typescript
    const detailsProgress = useMemo(() => {
        const detailsTotal = Math.max(0, Number(statsDataProgress?.total || logs.length || 0));
        const detailsPending = Math.min(detailsTotal, Math.max(0, Number(statsDataProgress?.pending || 0)));
        const detailsProcessed = Math.min(detailsTotal, Math.max(0, Number(statsDataProgress?.processed || (detailsTotal - detailsPending))));
        const detailsUnavailable = Math.max(0, Number(statsDataProgress?.unavailable || 0));
        const detailsActive = Boolean(statsDataProgress?.active) && detailsTotal > 0 && detailsPending > 0;
        if (detailsActive) {
            const unavailableText = detailsUnavailable > 0 ? ` \u2022 ${detailsUnavailable} unavailable` : '';
            return {
                active: true,
                phaseLabel: 'Loading fight details',
                progressText: `${detailsProcessed} of ${detailsTotal} fights prepared${unavailableText}`,
                progressPercent: detailsTotal > 0
                    ? Math.max(1, Math.min(99, Math.round((detailsProcessed / detailsTotal) * 100)))
                    : 0
            };
        }
        if (detailsTotal > 0 && detailsUnavailable >= detailsTotal) {
            return {
                active: true,
                phaseLabel: 'Fight details unavailable',
                progressText: `${detailsUnavailable} of ${detailsTotal} fights could not be loaded from dps.report`,
                progressPercent: 100
            };
        }
        return { active: false, phaseLabel: '', progressText: '', progressPercent: 0 };
    }, [statsDataProgress, logs.length]);
```

- [ ] **Step 3: Update all `statsSettling` references to use `aggregationSettling`**

Rename **all** downstream references. In `src/renderer/StatsView.tsx`:

| Line | Old | New |
|------|-----|-----|
| 261 | `statsSettling.active` | `aggregationSettling.active` |
| 262 | `statsSettling.phaseLabel` | `aggregationSettling.phaseLabel` |
| 263 | `statsSettling.progressText` | `aggregationSettling.progressText` |
| 314 | `statsSettling.progressPercent >= 100 && statsSettling.active` | `aggregationSettling.progressPercent >= 100 && aggregationSettling.active` |
| 319 | `[statsSettling.progressPercent, statsSettling.active, embedded]` | `[aggregationSettling.progressPercent, aggregationSettling.active, embedded]` |
| 323 | `!statsSettling.active && statsSettling.progressPercent < 100` | `!aggregationSettling.active && aggregationSettling.progressPercent < 100` |
| 326 | `[statsSettling.active, statsSettling.progressPercent, embedded]` | `[aggregationSettling.active, aggregationSettling.progressPercent, embedded]` |
| 330 | `!statsSettling.active && stats != null` | `!aggregationSettling.active && stats != null` |
| 332 | `showDissolveLoading && statsSettling.progressPercent < 100` | `showDissolveLoading && aggregationSettling.progressPercent < 100` |
| 336 | `!statsSettling.active` | `!aggregationSettling.active` |
| 339 | `statsSettling.active, dissolveCompletedOnce` | `aggregationSettling.active, dissolveCompletedOnce` |

**Note:** Lines 330-340 (the `dissolveCompletedOnce` block) will be replaced entirely in Task 3, but they must compile between commits, so we rename `statsSettling` → `aggregationSettling` here too. The variable name `statsSettlingBannerJoke` (line 166) is a state variable unrelated to the memo — no rename needed.

- [ ] **Step 4: Update the dissolve bar UI to show details progress after dissolve completes**

At line 3770, the dissolve bar renders when `statsSettling.active && !dissolveCompletedOnce`. After the split, the bar should show aggregation settling during dissolve, AND details progress after dissolve completes. Replace lines 3770-3797:

```typescript
            {/* Dissolve bar: aggregation settling OR details progress (non-blocking) */}
            {(aggregationSettling.active && !dissolveCompletedOnce) && (
                <div className="mb-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {!embedded && <span className="stats-dissolve-heartbeat" />}
                            <span className="font-medium">{dissolveBarTitle}</span>
                            <span style={{ opacity: 0.7 }}>{dissolveBarMeta}</span>
                        </div>
                    </div>
                    {!embedded && aggregationSettling.active && (
                        <div className="stats-dissolve-bar">
                            <div
                                className="stats-dissolve-bar__fill"
                                style={{ width: `${aggregationSettling.progressPercent}%` }}
                            />
                            <div style={{ position: 'absolute', left: `${aggregationSettling.progressPercent}%`, top: '50%', transform: 'translateY(-50%)', transition: 'left 0.6s ease' }}>
                                <span className="stats-dissolve-bar__particle" />
                                <span className="stats-dissolve-bar__particle" />
                                <span className="stats-dissolve-bar__particle" />
                                <span className="stats-dissolve-bar__particle" />
                                <span className="stats-dissolve-bar__particle" />
                            </div>
                        </div>
                    )}
                    {!embedded && dissolveActive && statsSettlingBannerJoke && (
                        <div className="stats-dissolve-joke mt-2">{statsSettlingBannerJoke}</div>
                    )}
                </div>
            )}
            {/* Details progress: non-blocking indicator shown after dissolve completes */}
            {!aggregationSettling.active && detailsProgress.active && !embedded && (
                <div className="mb-3 text-xs">
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="stats-dissolve-heartbeat" />
                        <span className="font-medium">{detailsProgress.phaseLabel}</span>
                        <span style={{ opacity: 0.7 }}>{detailsProgress.progressText}</span>
                    </div>
                    <div className="stats-dissolve-bar">
                        <div
                            className="stats-dissolve-bar__fill"
                            style={{ width: `${detailsProgress.progressPercent}%` }}
                        />
                    </div>
                </div>
            )}
```

Note: `dissolveBarTitle` and `dissolveBarMeta` (lines 262-263) still derive from `aggregationSettling`.

- [ ] **Step 5: Run existing tests**

Run: `npx vitest run src/renderer/__tests__/StatsView.integration.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "fix: decouple details hydration from dissolve gate

Split statsSettling memo into aggregationSettling (gates dissolve) and
detailsProgress (display-only). Details hydration no longer blocks
section rendering after aggregation completes."
```

---

### Task 3: Fix 1 — Track dissolve completion by log identity

**Files:**
- Modify: `src/renderer/StatsView.tsx:328-341`

This replaces the `dissolveCompletedOnce` boolean with identity-based tracking, so the dissolve replays when the log set changes but not on tab switch.

- [ ] **Step 1: Add `logIdentityKey` memo**

After the `aggregationSettling` and `detailsProgress` memos (around line 260 after Task 2), add:

```typescript
    const logIdentityKey = useMemo(
        () => `${logs.length}:${logs[0]?.id || ''}:${logs[logs.length - 1]?.id || ''}`,
        [logs]
    );
```

- [ ] **Step 2: Replace `alreadySettledOnMount` + `dissolveCompletedOnce` with `dissolveCompletedForLogKey`**

Remove these lines (around 328-340 after Task 2 — note these already reference `aggregationSettling` from Task 2's rename):

```typescript
    // Once dissolve has completed once, never show it again (prevents re-trigger on tab switch).
    // If stats are already settled on mount (e.g. navigating back), skip dissolve immediately.
    const alreadySettledOnMount = useRef(!aggregationSettling.active && stats != null);
    const [dissolveCompletedOnce, setDissolveCompletedOnce] = useState(() => alreadySettledOnMount.current);
    const rawDissolveActive = (showDissolveLoading && aggregationSettling.progressPercent < 100) || dissolveCompleting;
    useEffect(() => {
        if (dissolveCompletedOnce) return;
        // Mark completed after the dissolve completion animation finishes
        if (!rawDissolveActive && !dissolveCompleting && !aggregationSettling.active && stats != null) {
            setDissolveCompletedOnce(true);
        }
    }, [rawDissolveActive, dissolveCompleting, aggregationSettling.active, dissolveCompletedOnce, stats]);
    const dissolveActive = rawDissolveActive && !dissolveCompletedOnce;
```

Replace with:

```typescript
    const [dissolveCompletedForLogKey, setDissolveCompletedForLogKey] = useState<string | null>(null);
    const rawDissolveActive = (showDissolveLoading && aggregationSettling.progressPercent < 100) || dissolveCompleting;
    useEffect(() => {
        if (dissolveCompletedForLogKey === logIdentityKey) return;
        // Mark completed after the dissolve completion animation finishes
        if (!rawDissolveActive && !dissolveCompleting && !aggregationSettling.active && stats != null) {
            setDissolveCompletedForLogKey(logIdentityKey);
        }
    }, [rawDissolveActive, dissolveCompleting, aggregationSettling.active, dissolveCompletedForLogKey, logIdentityKey, stats]);
    const dissolveActive = rawDissolveActive && dissolveCompletedForLogKey !== logIdentityKey;
```

- [ ] **Step 3: Update the dissolve bar UI reference**

In the dissolve bar JSX (around line 3770 after Task 2), replace the `!dissolveCompletedOnce` check:

```typescript
// BEFORE:
            {(aggregationSettling.active && !dissolveCompletedOnce) && (
// AFTER:
            {(aggregationSettling.active && dissolveCompletedForLogKey !== logIdentityKey) && (
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run src/renderer/__tests__/StatsView.integration.test.tsx`
Expected: All tests PASS

Run: `npx vitest run src/renderer/__tests__/StatsView.healing.integration.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "fix: track dissolve completion by log identity instead of boolean

Replace dissolveCompletedOnce with dissolveCompletedForLogKey using a
composite key from log count + boundary IDs. Dissolve no longer
re-triggers on tab switch but replays when the log set changes."
```

---

### Task 4: Validate and run full test suite

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors (max-warnings 0)

- [ ] **Step 3: Run full unit test suite**

Run: `npm run test:unit`
Expected: All tests PASS

- [ ] **Step 4: Fix any failures**

If any tests fail, investigate and fix. Common issues:
- Tests that reference `statsSettling` directly (now renamed to `aggregationSettling`)
- Tests that mock `aggregationProgress` with the old fallback shape (`active: false, phase: 'idle'`)
- Type errors from the new `detailsProgress` memo

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "fix: address test/lint issues from stats stability fixes"
```
