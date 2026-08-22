# Fight Slicer (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user check/uncheck individual fights in the desktop stats view and have every aggregation recompute over just that selection, without persisting anything.

**Architecture:** A `Set<string>` of *excluded* log keys lives in the existing zustand `statsStore`. `App.tsx` filters `logsForStats` through it before handing the array to `useStatsAggregationWorker`; because every stats section already reads the aggregation result rather than raw logs, filtering one upstream array slices the entire view consistently. A separate sticky "fight roster" in the store remembers every fight ever seen so the picker keeps listing fights that are currently unchecked.

**Tech Stack:** TypeScript, React 18, zustand, vitest + jsdom, Tailwind with CSS custom properties from `src/renderer/index.css`.

**Spec:** `docs/superpowers/specs/2026-08-22-fight-slicer-design.md`

## Global Constraints

- The slice is **never** persisted — not to `electron-store`, not to `localStorage`, not to settings. It dies with the app session.
- **Publish always publishes every fight.** Never route the slice into the publish path.
- Phase A is **desktop only**. Do not touch `src/web/` or `report.json`.
- No named/saved slice groups. No shareable links. Those are Phase B.
- No "vs all fights" delta stats — that requires a second live aggregation and is deferred.
- Run vitest as `npx vitest run <file>`; the repo config already pins `maxWorkers: 2`.
- `npm run validate` (typecheck + eslint at `--max-warnings 0`) must pass before every commit.
- Log identity is `String(log.filePath || log.id || \`idx-${index}\`)` — this exact expression, because it is what the worker already keys its payload store on.

---

### Task 1: Shared log-identity helper

That identity expression is currently written out by hand in at least four places
(`useLogsForStats.ts` twice, `useStatsAggregationWorker.ts:532`, `statsWorker.ts`).
The slicer adds two more. Extract it once, first, so every consumer provably agrees
— a slice that keys fights differently than the worker keys payloads would silently
exclude the wrong fight.

**Files:**
- Create: `src/renderer/stats/utils/statsLogKey.ts`
- Create: `src/renderer/stats/utils/__tests__/statsLogKey.test.ts`
- Modify: `src/renderer/app/hooks/useLogsForStats.ts` (the two inline copies)
- Modify: `src/renderer/stats/hooks/useStatsAggregationWorker.ts:532`

**Interfaces:**
- Consumes: nothing.
- Produces: `statsLogKey(log: any, index?: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/utils/__tests__/statsLogKey.test.ts
import { describe, it, expect } from 'vitest';
import { statsLogKey } from '../statsLogKey';

describe('statsLogKey', () => {
    it('prefers filePath', () => {
        expect(statsLogKey({ filePath: '/logs/a.zevtc', id: 'x' }, 0)).toBe('/logs/a.zevtc');
    });

    it('falls back to id when filePath is missing or empty', () => {
        expect(statsLogKey({ id: 'log-7' }, 3)).toBe('log-7');
        expect(statsLogKey({ filePath: '', id: 'log-7' }, 3)).toBe('log-7');
    });

    it('falls back to a positional key when both are missing', () => {
        expect(statsLogKey({}, 3)).toBe('idx-3');
    });

    it('uses index 0 when no index is supplied', () => {
        expect(statsLogKey({})).toBe('idx-0');
    });

    it('never returns an empty string', () => {
        expect(statsLogKey(null as any, 2)).toBe('idx-2');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/utils/__tests__/statsLogKey.test.ts`
Expected: FAIL — cannot resolve module `../statsLogKey`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/stats/utils/statsLogKey.ts

/**
 * The identity of a log for stats purposes.
 *
 * This exact expression is what the stats worker keys its `payloadStore` on, and
 * what `useLogsForStats` builds its snapshot key from. The fight slicer keys its
 * exclusion set on it too, so all three must agree — a divergence here excludes
 * the wrong fight silently.
 */
export const statsLogKey = (log: any, index = 0): string =>
    String(log?.filePath || log?.id || `idx-${index}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/utils/__tests__/statsLogKey.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Replace the inline copies**

In `src/renderer/app/hooks/useLogsForStats.ts`, add
`import { statsLogKey } from '../../stats/utils/statsLogKey';` and replace both
occurrences of the inline expression:

```ts
// in buildStatsSnapshotKey
const identifier = statsLogKey(log, index);

// in mergeLogsForStatsSnapshot (both the `previous.forEach` and the `entries.map`)
const identity = statsLogKey(entry, index);
```

In `src/renderer/stats/hooks/useStatsAggregationWorker.ts`, add
`import { statsLogKey } from '../utils/statsLogKey';` and replace line 532:

```ts
const payloadKey = statsLogKey(log, index);
```

- [ ] **Step 6: Verify nothing regressed**

Run: `npx vitest run src/renderer/app/hooks/__tests__/useLogsForStats.debounce.test.tsx src/renderer/stats/__tests__/pruneDetailsForWorker.test.ts`
Expected: PASS.

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/utils/statsLogKey.ts \
        src/renderer/stats/utils/__tests__/statsLogKey.test.ts \
        src/renderer/app/hooks/useLogsForStats.ts \
        src/renderer/stats/hooks/useStatsAggregationWorker.ts
git commit -m "refactor: extract shared statsLogKey helper"
```

---

### Task 2: Slice state in the stats store

**Files:**
- Modify: `src/renderer/stats/statsStore.ts`
- Create: `src/renderer/stats/__tests__/statsStore.slice.test.ts`

**Interfaces:**
- Consumes: `statsLogKey` (Task 1).
- Produces, on `useStatsStore`:
  - `excludedFightKeys: Set<string>`
  - `toggleFightExcluded(key: string): void`
  - `setFightsExcluded(keys: string[], excluded: boolean): void`
  - `clearFightSlice(): void`

Excluded rather than included, so an empty set means "no slice". That makes
unsliced the free default and means a log that arrives mid-session joins the view
automatically instead of being silently omitted.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/__tests__/statsStore.slice.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../statsStore';

describe('statsStore fight slice', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts with an empty exclusion set', () => {
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('toggles a key in and back out', () => {
        useStatsStore.getState().toggleFightExcluded('a.zevtc');
        expect(useStatsStore.getState().excludedFightKeys.has('a.zevtc')).toBe(true);
        useStatsStore.getState().toggleFightExcluded('a.zevtc');
        expect(useStatsStore.getState().excludedFightKeys.has('a.zevtc')).toBe(false);
    });

    it('produces a new Set identity on every mutation so selectors re-render', () => {
        const before = useStatsStore.getState().excludedFightKeys;
        useStatsStore.getState().toggleFightExcluded('a.zevtc');
        expect(useStatsStore.getState().excludedFightKeys).not.toBe(before);
    });

    it('sets many keys at once in both directions', () => {
        useStatsStore.getState().setFightsExcluded(['a', 'b', 'c'], true);
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(3);
        useStatsStore.getState().setFightsExcluded(['b'], false);
        expect([...useStatsStore.getState().excludedFightKeys].sort()).toEqual(['a', 'c']);
    });

    it('clears the slice', () => {
        useStatsStore.getState().setFightsExcluded(['a', 'b'], true);
        useStatsStore.getState().clearFightSlice();
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/statsStore.slice.test.ts`
Expected: FAIL — `excludedFightKeys` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/stats/statsStore.ts`, add to the `StatsStoreState` interface:

```ts
    /** Log keys (see statsLogKey) excluded from aggregation. Empty = no slice.
     *  Ephemeral by design: never persisted, dies with the session. */
    excludedFightKeys: Set<string>;

    toggleFightExcluded: (key: string) => void;
    setFightsExcluded: (keys: string[], excluded: boolean) => void;
    clearFightSlice: () => void;
```

Add to `initialState`:

```ts
    excludedFightKeys: new Set<string>(),
```

Add to the store body:

```ts
    toggleFightExcluded: (key) => set((state) => {
        const next = new Set(state.excludedFightKeys);
        if (next.has(key)) next.delete(key); else next.add(key);
        return { excludedFightKeys: next };
    }),
    setFightsExcluded: (keys, excluded) => set((state) => {
        const next = new Set(state.excludedFightKeys);
        keys.forEach((key) => { if (excluded) next.add(key); else next.delete(key); });
        return { excludedFightKeys: next };
    }),
    clearFightSlice: () => set({ excludedFightKeys: new Set<string>() }),
```

Note: `initialState` is a shared object literal reused by `getInitialState()`. Because
every action above builds a **new** `Set` rather than mutating, the initial set is
never written to and stays safe to hand back on reset.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/statsStore.slice.test.ts src/renderer/stats/__tests__/statsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/__tests__/statsStore.slice.test.ts
git commit -m "feat: add ephemeral fight-slice state to stats store"
```

---

### Task 3: Wire the slice into aggregation, and fix the bulk-settle gate

The highest-risk task. `App.tsx:378` gates promotion of `calculating` logs to
`success` on `lastComputedLogCount < logsForStats.length`. `lastComputedLogCount` is
what the worker ingested — under a slice, the *sliced* count. Leave that comparison
against the unsliced length and any active slice wedges the check permanently true,
so logs never leave `calculating`. That is the same stuck-ingestion failure class as
the earlier Upload-to-Web regressions.

**Files:**
- Modify: `src/renderer/App.tsx` (~lines 206-210, 337, 350-359, 378, 406)
- Create: `src/renderer/app/__tests__/sliceGating.test.ts`

**Interfaces:**
- Consumes: `statsLogKey` (Task 1), `excludedFightKeys` (Task 2).
- Produces: `selectSlicedLogs(logsForStats: any[], excluded: Set<string>): any[]`, exported from `src/renderer/app/selectSlicedLogs.ts`.

Extracted as a pure function rather than an inline `useMemo` so it can be tested
without mounting `App.tsx`, which is far too large to render in a unit test.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/app/__tests__/sliceGating.test.ts
import { describe, it, expect } from 'vitest';
import { selectSlicedLogs } from '../selectSlicedLogs';

const logs = [
    { filePath: 'a.zevtc' },
    { filePath: 'b.zevtc' },
    { filePath: 'c.zevtc' },
];

describe('selectSlicedLogs', () => {
    it('returns the same array identity when nothing is excluded', () => {
        expect(selectSlicedLogs(logs, new Set())).toBe(logs);
    });

    it('drops excluded logs', () => {
        const out = selectSlicedLogs(logs, new Set(['b.zevtc']));
        expect(out.map(l => l.filePath)).toEqual(['a.zevtc', 'c.zevtc']);
    });

    it('ignores exclusions naming logs that are not loaded', () => {
        const out = selectSlicedLogs(logs, new Set(['gone.zevtc']));
        expect(out).toBe(logs);
    });

    it('can exclude everything', () => {
        expect(selectSlicedLogs(logs, new Set(['a.zevtc', 'b.zevtc', 'c.zevtc']))).toEqual([]);
    });
});

describe('bulk-settle gate uses the sliced length', () => {
    // Regression guard. The gate compares what the worker ingested against the
    // array the worker was given. Comparing against the unsliced length wedges
    // `calculating` logs forever whenever a slice is active during ingest.
    const gateBlocks = (lastComputedLogCount: number, comparisonLength: number) =>
        lastComputedLogCount < comparisonLength;

    it('does not block when the worker has ingested the whole sliced set', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc']));
        expect(gateBlocks(sliced.length, sliced.length)).toBe(false);
    });

    it('would block forever if compared against the unsliced length', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc']));
        expect(gateBlocks(sliced.length, logs.length)).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/app/__tests__/sliceGating.test.ts`
Expected: FAIL — cannot resolve module `../selectSlicedLogs`.

- [ ] **Step 3: Write the selector**

```ts
// src/renderer/app/selectSlicedLogs.ts
import { statsLogKey } from '../stats/utils/statsLogKey';

/**
 * Apply the ephemeral fight slice to the aggregation input.
 *
 * Returns the input array unchanged (same identity) when the slice removes
 * nothing. That matters: `logsForStats` identity is what restarts the stats
 * worker, so a no-op slice must not churn it.
 */
export const selectSlicedLogs = (logsForStats: any[], excluded: Set<string>): any[] => {
    if (excluded.size === 0) return logsForStats;
    const next = logsForStats.filter((log, index) => !excluded.has(statsLogKey(log, index)));
    return next.length === logsForStats.length ? logsForStats : next;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/app/__tests__/sliceGating.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire it into App.tsx**

Add imports near the existing `useStatsStore` import at `src/renderer/App.tsx:3`:

```ts
import { selectSlicedLogs } from './app/selectSlicedLogs';
```

Immediately after the `useLogsForStats({ logs })` destructure (~line 206-210), add:

```ts
    const excludedFightKeys = useStatsStore((s) => s.excludedFightKeys);
    // The aggregation input, after the ephemeral fight slice. Filtering *after*
    // useLogsForStats deliberately bypasses that hook's 400ms/2500ms publish
    // debounce, so slice toggles respond immediately rather than waiting on
    // ingest churn.
    const slicedLogsForStats = useMemo(
        () => selectSlicedLogs(logsForStats, excludedFightKeys),
        [logsForStats, excludedFightKeys]
    );
```

Change the worker input at `App.tsx:337`:

```ts
        logs: slicedLogsForStats,
```

Change the store-sync hash and deps (~lines 350-359) so a slice change is visible in
`inputsHash`:

```ts
            const inputsHash = hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod)
                + ':logs' + slicedLogsForStats.length
                + ':slice' + [...excludedFightKeys].sort().join(',');
```

and replace `logsForStats.length` with `slicedLogsForStats.length` in that effect's
dependency array, adding `excludedFightKeys`.

- [ ] **Step 6: Fix the bulk-settle gate**

At `App.tsx:378`, replace:

```ts
        if (lastComputedLogCount < logsForStats.length) {
```

with:

```ts
        // Compare against the array the worker was actually given. Using the
        // unsliced length here wedges this effect permanently whenever a slice
        // is active, and `calculating` logs never promote to `success`.
        if (lastComputedLogCount < slicedLogsForStats.length) {
```

and in that effect's dependency array at `App.tsx:406`, replace
`logsForStats.length` with `slicedLogsForStats.length`.

- [ ] **Step 7: Audit every other `logsForStats` use**

Run: `grep -n "logsForStats" src/renderer/App.tsx`

For each hit, decide by intent and leave a decision in place:
- Reasoning about **what the worker has seen** → `slicedLogsForStats`. This is only
  lines 337, 351, 359, 378 and 406, all changed above.
- Reasoning about **the whole session** (the streaming-progress mapping around
  lines 453-456 and 488, the `AppLayout` prop at 1080/1085) → stays `logsForStats`.

Do not change line 567's synchronous publish — it feeds `useLogsForStats`, upstream
of the slice.

- [ ] **Step 8: Verify**

Run: `npx vitest run src/renderer/app src/renderer/stats`
Expected: PASS.

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/app/selectSlicedLogs.ts \
        src/renderer/app/__tests__/sliceGating.test.ts \
        src/renderer/App.tsx
git commit -m "feat: apply fight slice to aggregation input, fix bulk-settle gate"
```

---

### Task 4: Sticky fight roster

The picker's fight list cannot come from the sliced aggregation. Uncheck a fight and
it would vanish from the aggregation, vanish from the picker, and become
impossible to re-check.

The roster is therefore additive: merge each aggregation result's fights into a
store-held map, never removing on slice change, and prune only to keys that are
still loaded. Because exclusions are the state, a log that arrives mid-slice is
*included* by default, so it appears in the sliced aggregation and merges into the
roster on its own. One aggregation, complete list.

**Files:**
- Modify: `src/renderer/stats/statsStore.ts`
- Create: `src/renderer/stats/__tests__/statsStore.roster.test.ts`

**Interfaces:**
- Consumes: `excludedFightKeys` (Task 2).
- Produces, on `useStatsStore`:
  - `fightRoster: FightRosterEntry[]` — insertion-ordered, then sorted by `timestamp`
  - `mergeFightRoster(fights: FightRosterEntry[], validKeys: string[]): void`
  - exported `interface FightRosterEntry { id: string; label: string; timestamp: number; duration: string; isWin?: boolean; enemyClassCounts?: Record<string, number>; }`

This shape is exactly `fightCompByFight` (`src/renderer/StatsView.tsx:4145`) minus
`parties`, so no new computation is needed.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/__tests__/statsStore.roster.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../statsStore';

const fight = (id: string, timestamp: number) => ({
    id, timestamp, label: `Fight ${id}`, duration: '1:00', isWin: true,
    enemyClassCounts: { Necromancer: 3 },
});

describe('fight roster', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts empty', () => {
        expect(useStatsStore.getState().fightRoster).toEqual([]);
    });

    it('keeps fights that later drop out of the aggregation', () => {
        const store = useStatsStore.getState();
        store.mergeFightRoster([fight('a', 1), fight('b', 2)], ['a', 'b']);
        // 'b' is now excluded, so aggregation only reports 'a' — but both are loaded.
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a', 'b']);
        expect(useStatsStore.getState().fightRoster.map(f => f.id)).toEqual(['a', 'b']);
    });

    it('prunes fights whose logs are no longer loaded', () => {
        const store = useStatsStore.getState();
        store.mergeFightRoster([fight('a', 1), fight('b', 2)], ['a', 'b']);
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        expect(useStatsStore.getState().fightRoster.map(f => f.id)).toEqual(['a']);
    });

    it('sorts by timestamp', () => {
        useStatsStore.getState().mergeFightRoster(
            [fight('late', 500), fight('early', 100)], ['late', 'early']);
        expect(useStatsStore.getState().fightRoster.map(f => f.id)).toEqual(['early', 'late']);
    });

    it('refreshes an existing entry rather than duplicating it', () => {
        const store = useStatsStore.getState();
        store.mergeFightRoster([fight('a', 1)], ['a']);
        useStatsStore.getState().mergeFightRoster(
            [{ ...fight('a', 1), label: 'Renamed' }], ['a']);
        const roster = useStatsStore.getState().fightRoster;
        expect(roster).toHaveLength(1);
        expect(roster[0].label).toBe('Renamed');
    });

    it('does not change array identity when the merge is a no-op', () => {
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        const before = useStatsStore.getState().fightRoster;
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        expect(useStatsStore.getState().fightRoster).toBe(before);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/statsStore.roster.test.ts`
Expected: FAIL — `fightRoster` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/stats/statsStore.ts`, above the state interface:

```ts
export interface FightRosterEntry {
    id: string;
    label: string;
    timestamp: number;
    duration: string;
    isWin?: boolean;
    enemyClassCounts?: Record<string, number>;
}
```

Add to `StatsStoreState`:

```ts
    /** Every fight currently loaded, whether or not the active slice includes it.
     *  The slice picker reads this, not the aggregation — a fight the user has
     *  unchecked leaves the aggregation and would otherwise become un-recheckable. */
    fightRoster: FightRosterEntry[];
    mergeFightRoster: (fights: FightRosterEntry[], validKeys: string[]) => void;
```

Add to `initialState`: `fightRoster: [] as FightRosterEntry[],`

Add to the store body:

```ts
    mergeFightRoster: (fights, validKeys) => set((state) => {
        const valid = new Set(validKeys);
        const byId = new Map<string, FightRosterEntry>();
        state.fightRoster.forEach((entry) => {
            if (valid.has(entry.id)) byId.set(entry.id, entry);
        });
        fights.forEach((entry) => {
            if (entry?.id && valid.has(entry.id)) byId.set(entry.id, entry);
        });
        const next = [...byId.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const unchanged = next.length === state.fightRoster.length
            && next.every((entry, i) => {
                const prev = state.fightRoster[i];
                return prev?.id === entry.id
                    && prev.label === entry.label
                    && prev.isWin === entry.isWin
                    && prev.duration === entry.duration;
            });
        return unchanged ? {} : { fightRoster: next };
    }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/statsStore.roster.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Feed the roster from StatsView**

In `src/renderer/StatsView.tsx`, directly after the `fightCompByFight` memo
(ends at line 4159), add:

```ts
    const mergeFightRoster = useStatsStore((s) => s.mergeFightRoster);
    useEffect(() => {
        if (embedded) return;
        mergeFightRoster(
            fightCompByFight.map((fight: any) => ({
                id: String(fight.id),
                label: String(fight.label || ''),
                timestamp: Number(fight.timestamp || 0),
                duration: String(fight.duration || ''),
                isWin: fight.isWin,
                enemyClassCounts: fight.enemyClassCounts,
            })),
            logs.map((log, index) => statsLogKey(log, index)),
        );
    }, [embedded, fightCompByFight, logs, mergeFightRoster]);
```

Add `import { statsLogKey } from './stats/utils/statsLogKey';` to the imports if it
is not already present. `embedded` is skipped because `FightReportHistoryView`
mounts `StatsView` with `embedded` for historical reports, which must not disturb
the live session's roster.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/renderer/stats src/renderer/__tests__`
Expected: PASS.

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/statsStore.ts \
        src/renderer/stats/__tests__/statsStore.roster.test.ts \
        src/renderer/StatsView.tsx
git commit -m "feat: track a sticky fight roster for the slice picker"
```

---

### Task 5: The slice UI — pill, tray, banner

**Files:**
- Create: `src/renderer/stats/components/FightSliceTray.tsx`
- Create: `src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`
- Modify: `src/renderer/StatsView.tsx` (header region and the content wrapper)

**Interfaces:**
- Consumes: `FightRosterEntry`, `excludedFightKeys`, `toggleFightExcluded`, `setFightsExcluded`, `clearFightSlice` (Tasks 2 and 4).
- Produces: `FightSlicePill`, `FightSliceTray`, `FightSliceBanner` — all exported from `FightSliceTray.tsx`.

Design decisions fixed by the spec: a pill in the header opening a drop-down tray of
fight cards; each card shows label, timestamp, duration, win/loss and
`enemyClassCounts`; toolbar has All / None / Invert, a text filter and a wins-only
filter; flat grid, no grouping; a banner over the content whenever a slice is
active. No "save as group". No per-stat deltas.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/stats/components/__tests__/FightSliceTray.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStatsStore } from '../../statsStore';
import { FightSliceTray, FightSliceBanner } from '../FightSliceTray';

const roster = [
    { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', isWin: true,
      enemyClassCounts: { Necromancer: 4 } },
    { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', isWin: false,
      enemyClassCounts: { Guardian: 2 } },
];

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(roster, ['a', 'b']);
});

describe('FightSliceTray', () => {
    it('lists every fight in the roster', () => {
        render(<FightSliceTray onClose={() => {}} />);
        expect(screen.getByText('EBG: Klovan')).toBeInTheDocument();
        expect(screen.getByText('Red BL: Bravost')).toBeInTheDocument();
    });

    it('still lists a fight after it is unchecked', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('checkbox', { name: /EBG: Klovan/i }));
        expect(useStatsStore.getState().excludedFightKeys.has('a')).toBe(true);
        expect(screen.getByText('EBG: Klovan')).toBeInTheDocument();
    });

    it('None excludes everything and All clears the slice', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'None' }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(2);
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('Invert flips the selection', () => {
        useStatsStore.getState().setFightsExcluded(['a'], true);
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Invert' }));
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);
    });

    it('filters the visible list by label without changing the slice', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'Bravost' } });
        expect(screen.queryByText('EBG: Klovan')).not.toBeInTheDocument();
        expect(screen.getByText('Red BL: Bravost')).toBeInTheDocument();
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('wins-only excludes losses', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /wins only/i }));
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);
    });
});

describe('FightSliceBanner', () => {
    it('renders nothing when no slice is active', () => {
        const { container } = render(<FightSliceBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('reports the slice size against the roster size', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        render(<FightSliceBanner />);
        expect(screen.getByText(/1 of 2 fights/i)).toBeInTheDocument();
    });

    it('clears the slice', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        render(<FightSliceBanner />);
        fireEvent.click(screen.getByRole('button', { name: /clear slice/i }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`
Expected: FAIL — cannot resolve module `../FightSliceTray`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/stats/components/FightSliceTray.tsx`. Use the CSS custom
properties from `src/renderer/index.css` (`--bg-card`, `--bg-card-inner`,
`--border-default`, `--accent-bg`, `--accent-border`, `--text-secondary`,
`--radius-md`) rather than hardcoded colors, so all UI themes work.

```tsx
import { useMemo, useState } from 'react';
import { useStatsStore } from '../statsStore';
import { getProfessionColor } from '../../../shared/professionUtils';

const formatClock = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '--:--';
    try {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '--:--'; }
};

export const FightSlicePill = ({ onClick }: { onClick: () => void }) => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const included = roster.length - roster.filter((f) => excluded.has(f.id)).length;
    const active = excluded.size > 0;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${active
                ? 'border-[color:var(--accent-border)] bg-[var(--accent-bg-strong)] text-[color:var(--text-primary)]'
                : 'border-[color:var(--border-default)] bg-[var(--bg-card)] text-[color:var(--text-secondary)]'}`}
        >
            {active
                ? `Slice: ${included} of ${roster.length} fights`
                : 'Slice fights'}
        </button>
    );
};

export const FightSliceBanner = () => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const clearFightSlice = useStatsStore((s) => s.clearFightSlice);
    if (excluded.size === 0) return null;
    const included = roster.length - roster.filter((f) => excluded.has(f.id)).length;
    return (
        <div className="flex items-center gap-2 border-b border-[color:var(--accent-border)] bg-[var(--accent-bg)] px-4 py-1.5 text-[11px] font-semibold text-[color:var(--text-primary)]">
            <span>Sliced view — {included} of {roster.length} fights</span>
            <button
                type="button"
                onClick={clearFightSlice}
                className="ml-auto rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
            >
                Clear slice
            </button>
        </div>
    );
};

export const FightSliceTray = ({ onClose }: { onClose: () => void }) => {
    const roster = useStatsStore((s) => s.fightRoster);
    const excluded = useStatsStore((s) => s.excludedFightKeys);
    const toggleFightExcluded = useStatsStore((s) => s.toggleFightExcluded);
    const setFightsExcluded = useStatsStore((s) => s.setFightsExcluded);
    const clearFightSlice = useStatsStore((s) => s.clearFightSlice);
    const [query, setQuery] = useState('');

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return roster;
        return roster.filter((f) => f.label.toLowerCase().includes(needle));
    }, [roster, query]);

    const allIds = roster.map((f) => f.id);

    return (
        <div className="border-b border-[color:var(--border-default)] bg-[var(--bg-card)] shadow-[var(--shadow-dropdown)]">
            <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] px-3 py-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">Fights</span>
                <button type="button" onClick={() => clearFightSlice()} className="slice-mini">All</button>
                <button type="button" onClick={() => setFightsExcluded(allIds, true)} className="slice-mini">None</button>
                <button
                    type="button"
                    className="slice-mini"
                    onClick={() => {
                        const nowExcluded = allIds.filter((id) => !excluded.has(id));
                        const nowIncluded = allIds.filter((id) => excluded.has(id));
                        setFightsExcluded(nowIncluded, false);
                        setFightsExcluded(nowExcluded, true);
                    }}
                >
                    Invert
                </button>
                <button
                    type="button"
                    className="slice-mini"
                    onClick={() => setFightsExcluded(
                        roster.filter((f) => f.isWin !== true).map((f) => f.id), true)}
                >
                    Wins only
                </button>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by map or landmark…"
                    className="ml-2 w-52 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-input)] px-2 py-1 text-[11px] text-[color:var(--text-primary)]"
                />
                <button type="button" onClick={onClose} className="slice-mini ml-auto">Close</button>
            </div>
            <div className="grid grid-cols-4 gap-2 p-3">
                {visible.map((fight) => {
                    const isExcluded = excluded.has(fight.id);
                    return (
                        <label
                            key={fight.id}
                            className={`flex items-start gap-2 rounded-[var(--radius-md)] border p-2 ${isExcluded
                                ? 'border-[color:var(--border-default)] bg-[var(--bg-card-inner)] opacity-40'
                                : 'border-[color:var(--accent-border)] bg-[var(--accent-bg)]'}`}
                        >
                            <input
                                type="checkbox"
                                aria-label={fight.label}
                                checked={!isExcluded}
                                onChange={() => toggleFightExcluded(fight.id)}
                            />
                            <span className="min-w-0">
                                <span className="block text-[11.5px] font-semibold">{fight.label}</span>
                                <span className="block text-[10px] text-[color:var(--text-secondary)]">
                                    {formatClock(fight.timestamp)} · {fight.duration}
                                    {fight.isWin === true ? ' · Win' : fight.isWin === false ? ' · Loss' : ''}
                                </span>
                                <span className="mt-1 flex flex-wrap gap-0.5">
                                    {Object.entries(fight.enemyClassCounts || {})
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 6)
                                        .map(([profession, count]) => (
                                            <span
                                                key={profession}
                                                title={`${profession}: ${count}`}
                                                className="h-3 w-3 rounded-[2px]"
                                                style={{ background: getProfessionColor(profession) }}
                                            />
                                        ))}
                                </span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};
```

Add a `.slice-mini` rule to `src/renderer/index.css` beside the other component
classes:

```css
.slice-mini {
  border: 1px solid var(--border-default);
  background: var(--bg-card-inner);
  border-radius: var(--radius-md);
  padding: 3px 8px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-secondary);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Mount it in StatsView**

In `src/renderer/StatsView.tsx`:

```tsx
import { FightSlicePill, FightSliceTray, FightSliceBanner } from './stats/components/FightSliceTray';
```

Add local state beside the other header state: `const [sliceTrayOpen, setSliceTrayOpen] = useState(false);`

Render `<FightSlicePill onClick={() => setSliceTrayOpen(o => !o)} />` in the header
button row, immediately before the existing Publish/Upload-to-Web control. Then,
between the category bar and the scroll container, render:

```tsx
{!embedded && sliceTrayOpen && <FightSliceTray onClose={() => setSliceTrayOpen(false)} />}
{!embedded && <FightSliceBanner />}
```

Gate all three on `!embedded` — `FightReportHistoryView` mounts `StatsView` with
`embedded` for frozen historical reports, which have no live aggregation to reslice.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/renderer`
Expected: PASS.

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/components/FightSliceTray.tsx \
        src/renderer/stats/components/__tests__/FightSliceTray.test.tsx \
        src/renderer/StatsView.tsx src/renderer/index.css
git commit -m "feat: add fight slice pill, tray and banner"
```

---

### Task 6: Pin publish behaviour, and harden the hash

Publish must keep publishing every fight. It does so today only because the publish
path reads `webUploadLogEntries` (`src/renderer/StatsView.tsx:4294`), a different
prop from the `logs` being filtered. That is accidental and load-bearing, so it gets
a test.

The `AggregationLRUCache` key collision is **not** a live bug — nothing in `src/`
imports `AggregationLRUCache` outside its own test, and the `inputsHash` written to
the store is never read in production. Fold the slice in anyway as cheap insurance,
and do not describe it in the commit message as a bug fix.

**Files:**
- Modify: `src/renderer/stats/aggregationCache.ts` (the `hashAggregationSettings` copy at line 22)
- Modify: `src/renderer/stats/statsStore.ts` (the duplicate copy at line 5)
- Modify: `src/renderer/stats/__tests__/aggregationCache.test.ts`
- Create: `src/renderer/app/__tests__/publishIgnoresSlice.test.ts`

**Interfaces:**
- Consumes: `excludedFightKeys` (Task 2), `selectSlicedLogs` (Task 3).
- Produces: `hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod, excludedFightKeys?: Set<string>): string` — the fourth parameter is optional so every existing call site keeps compiling and keeps its current hash.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/stats/__tests__/aggregationCache.test.ts`, inside the
existing `describe('hashAggregationSettings')` block:

```ts
        it('distinguishes two different slices of equal size', () => {
            const a = hashAggregationSettings({}, {}, 'disruption', new Set(['f1', 'f2']));
            const b = hashAggregationSettings({}, {}, 'disruption', new Set(['f3', 'f4']));
            expect(a).not.toBe(b);
        });

        it('is order-independent within a slice', () => {
            const a = hashAggregationSettings({}, {}, 'disruption', new Set(['f2', 'f1']));
            const b = hashAggregationSettings({}, {}, 'disruption', new Set(['f1', 'f2']));
            expect(a).toBe(b);
        });

        it('is unchanged for existing three-argument callers', () => {
            const a = hashAggregationSettings({}, {}, 'disruption');
            const b = hashAggregationSettings({}, {}, 'disruption', new Set());
            expect(a).toBe(b);
        });
```

Create `src/renderer/app/__tests__/publishIgnoresSlice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectSlicedLogs } from '../selectSlicedLogs';

/**
 * Publish must always publish every fight, never the active slice.
 *
 * It does so because the publish path reads `webUploadLogEntries`, a different
 * prop from the `logs` the slice filters. That separation is accidental and
 * load-bearing — this test fails loudly if someone "helpfully" routes the
 * sliced array into the publish payload.
 */
describe('publish ignores the active slice', () => {
    const logs = [{ filePath: 'a' }, { filePath: 'b' }, { filePath: 'c' }];

    it('slicing the aggregation input leaves the publish input untouched', () => {
        const webUploadLogEntries = [...logs];
        const sliced = selectSlicedLogs(logs, new Set(['b']));
        expect(sliced).toHaveLength(2);
        expect(webUploadLogEntries).toHaveLength(3);
    });

    it('the publish payload builder is not fed the sliced array', async () => {
        const source = await import('node:fs').then(fs =>
            fs.readFileSync('src/renderer/StatsView.tsx', 'utf8'));
        expect(source).toContain('logEntries={webUploadLogEntries}');
        expect(source).not.toContain('logEntries={slicedLogsForStats}');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/aggregationCache.test.ts src/renderer/app/__tests__/publishIgnoresSlice.test.ts`
Expected: the three hash tests FAIL (fourth argument ignored, so the first assertion
gets two equal hashes). The publish tests should PASS already — they are regression
guards for behaviour that is currently correct.

- [ ] **Step 3: Add the slice to both hash copies**

In `src/renderer/stats/aggregationCache.ts` and `src/renderer/stats/statsStore.ts`,
change both identical functions to:

```ts
export function hashAggregationSettings(
    mvpWeights: any,
    statsViewSettings: any,
    disruptionMethod: any,
    excludedFightKeys?: Set<string>
): string {
    // Sorted so the hash depends on which fights are excluded, not on the order
    // the user clicked them.
    const slice = excludedFightKeys && excludedFightKeys.size > 0
        ? [...excludedFightKeys].sort()
        : null;
    const key = JSON.stringify({ mvpWeights, statsViewSettings, disruptionMethod, slice });
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}
```

`slice` is `null` rather than `[]` for an empty set so that three-argument callers
and four-argument callers with an empty set hash identically.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/aggregationCache.test.ts src/renderer/app/__tests__/publishIgnoresSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass the slice at the App.tsx call site**

In `src/renderer/App.tsx`, the store-sync effect already appends the sorted slice to
`inputsHash` (Task 3, Step 5). Replace that manual concatenation with the parameter:

```ts
            const inputsHash = hashAggregationSettings(
                mvpWeights, statsViewSettings, disruptionMethod, excludedFightKeys
            ) + ':logs' + slicedLogsForStats.length;
```

- [ ] **Step 6: Full verification**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run validate`
Expected: exit 0.

Run: `npm run test:regression:stats`
Expected: PASS — confirms the refactor did not move any metric.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/aggregationCache.ts src/renderer/stats/statsStore.ts \
        src/renderer/stats/__tests__/aggregationCache.test.ts \
        src/renderer/app/__tests__/publishIgnoresSlice.test.ts \
        src/renderer/App.tsx
git commit -m "feat: include fight slice in aggregation hash, pin publish behaviour"
```

---

## Manual verification

Automated tests cannot cover the worker round-trip. After Task 6, run `npm run dev`
and confirm by hand:

1. Load a session with 10+ fights. Open the Slice tray, uncheck half.
2. Every category — Overview, Offense, Defense, Support, Fights, Replay, Data Map —
   reflects only the checked fights. No section shows a fight that is unchecked.
3. The banner reads the right count, and Clear slice restores the full numbers
   exactly.
4. In DevTools, confirm slice toggles do **not** re-send full log payloads: the
   worker's `payloadStore` should serve them as `ref` messages, so a toggle settles
   in roughly `23ms × sliced log count`.
5. Publish while a slice is active. The published report must contain **every**
   fight.
6. Start a bulk upload, slice mid-ingest, and confirm logs still promote from
   `calculating` to `success` — the Task 3 gate fix.
7. Open a historical report in Fight Report History. No slice pill, tray or banner
   appears, and the live session's slice is unaffected.
