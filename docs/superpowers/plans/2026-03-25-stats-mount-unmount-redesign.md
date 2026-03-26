# Stats Mount/Unmount Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `display: none` stats page strategy with zustand external store + group-level lazy rendering + normal Framer Motion mount/unmount, and remove the screenshot/image generation system.

**Architecture:** A zustand store persists aggregation results across StatsView mount/unmount cycles. Only the active nav group's sections render on mount (3-10 instead of ~41). StatsView becomes a normal view with AnimatePresence transitions. The screenshot system is removed entirely since it was the only reason all sections ever needed simultaneous DOM presence.

**Tech Stack:** zustand (new dep), React 18, Framer Motion 10, vitest

**Spec:** `docs/superpowers/specs/2026-03-25-stats-mount-unmount-redesign.md`

---

## Phase 1: Screenshot & Image Generation Removal

This phase is independent of the mount/unmount redesign. It removes ~650-750 lines and the `html-to-image` dependency.

### Task 1: Remove screenshot hooks and ScreenshotContainer

**Files:**
- Delete: `src/renderer/stats/hooks/useStatsScreenshot.ts`
- Delete: `src/renderer/app/ScreenshotContainer.tsx`
- Modify: `src/renderer/StatsView.tsx:721-725` — remove useStatsScreenshot hook call
- Modify: `src/renderer/app/AppLayout.tsx:17,378-382` — remove ScreenshotContainer import and usage

- [ ] **Step 1: Remove useStatsScreenshot usage from StatsView.tsx**

In `src/renderer/StatsView.tsx`, find and remove:
```typescript
// Line 721-725: Remove this block
const {
    sharing,
    shareStage,
    handleShare
} = useStatsScreenshot(embedded);
```

Replace references to `sharing`, `shareStage`, `handleShare` throughout StatsView with removed/default values. The `sharing` variable may be referenced in `StatsHeader` props — set to `false`, `shareStage` to `'idle'`, and remove `onShare`.

Also remove the `useStatsScreenshot` import (line ~16 area, search for the import).

- [ ] **Step 2: Remove ScreenshotContainer from AppLayout.tsx**

In `src/renderer/app/AppLayout.tsx`:
- Remove import at line 17: `import { ScreenshotContainer } from './ScreenshotContainer';`
- Remove `<ScreenshotContainer ... />` usage at lines 378-382
- Remove `screenshotData` from the destructured props if it's only used by ScreenshotContainer

- [ ] **Step 3: Delete the files**

```bash
rm src/renderer/stats/hooks/useStatsScreenshot.ts
rm src/renderer/app/ScreenshotContainer.tsx
```

- [ ] **Step 4: Remove screenshotData state from App.tsx**

In `src/renderer/App.tsx`:
- Line 36: Remove `const [screenshotData, setScreenshotData] = useState<ILogData | null>(null);`
- Remove all references to `screenshotData` and `setScreenshotData` (check lines 388, 408, 987)
- Remove `screenshotData` from props passed to AppLayout

- [ ] **Step 5: Run typecheck to find remaining references**

```bash
npm run typecheck
```

Fix any remaining imports or references to deleted code. Expected: type errors for `sharing`, `shareStage`, `handleShare`, `screenshotData`, `ScreenshotContainer`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: remove screenshot hooks and ScreenshotContainer"
```

---

### Task 2: Remove screenshot IPC handlers and preload methods

**Files:**
- Modify: `src/main/handlers/discordHandlers.ts:33-87` — remove screenshot IPC handlers
- Modify: `src/preload/index.ts:46-56,101` — remove screenshot IPC methods
- Modify: `src/main/index.ts:198,513-520` — remove pendingDiscordLogs and request-screenshot send

- [ ] **Step 1: Remove screenshot handlers from discordHandlers.ts**

In `src/main/handlers/discordHandlers.ts`, remove these IPC handlers:
- `ipcMain.on('send-screenshot', ...)` (lines 33-40)
- `ipcMain.on('send-screenshots', ...)` (lines 42-55)
- `ipcMain.on('send-screenshots-groups', ...)` (lines 57-66)
- `ipcMain.on('send-stats-screenshot', ...)` (lines 68-87)

Keep any non-screenshot handlers in this file. If the file becomes empty/trivial, delete it and remove its registration.

- [ ] **Step 2: Remove screenshot IPC methods from preload**

In `src/preload/index.ts`, remove:
- `onRequestScreenshot` (line 46-51)
- `fetchImageAsDataUrl` (line 53)
- `sendScreenshot` (line 54)
- `sendScreenshots` (line 55)
- `sendScreenshotsGroups` (line 56)
- `sendStatsScreenshot` (line 101)

- [ ] **Step 3: Remove pendingDiscordLogs and request-screenshot from main**

In `src/main/index.ts`:
- Line 198: Remove `const pendingDiscordLogs = new Map<...>();`
- Lines 513-520: Replace the image/image-beta branch with embed-only. The `if (notificationType === 'image' || notificationType === 'image-beta')` block should be removed, leaving only the `else` branch (embed mode):

```typescript
// Before:
if (notificationType === 'image' || notificationType === 'image-beta') {
    // ... screenshot request logic
} else {
    await discord?.sendLog({ ...result, filePath, mode: 'embed', splitEnemiesByTeam }, jsonDetails);
}

// After:
await discord?.sendLog({ ...result, filePath, mode: 'embed', splitEnemiesByTeam }, jsonDetails);
```

- [ ] **Step 4: Remove electronAPI type declarations for screenshot methods**

In `src/renderer/global.d.ts`, remove the screenshot-related method declarations from the `ElectronAPI` interface:
- `onRequestScreenshot`
- `fetchImageAsDataUrl`
- `sendScreenshot`
- `sendScreenshots`
- `sendScreenshotsGroups`
- `sendStatsScreenshot`

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Fix remaining references.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: remove screenshot IPC handlers and preload methods"
```

---

### Task 3: Simplify Discord notification settings to embed-only

**Files:**
- Modify: `src/renderer/global.d.ts:115,270,305` — remove image/image-beta from type unions
- Modify: `src/renderer/app/hooks/useSettings.ts:17,66-67` — default to embed, remove image types
- Modify: `src/renderer/App.tsx:303,581-610` — remove image/image-beta notification type switches
- Modify: `src/renderer/app/hooks/useDevDatasets.ts:22,168` — remove image type references
- Modify: `src/main/index.ts:477` — default to embed

- [ ] **Step 1: Update type definitions**

In `src/renderer/global.d.ts`, change the notification type to embed-only:
- Line 115: Remove `notificationType?: 'image' | 'image-beta' | 'embed'` (or change to just `'embed'`)
- Line 270: Change `discordNotificationType: 'image' | 'image-beta' | 'embed'` to `discordNotificationType: 'embed'`
- Line 305: Same

- [ ] **Step 2: Update useSettings.ts**

In `src/renderer/app/hooks/useSettings.ts`:
- Line 17: Change `useState<'image' | 'image-beta' | 'embed'>('image')` to just `'embed'` constant (or remove state entirely if no longer needed)
- Lines 66-67: Remove the notification type restoration from settings

- [ ] **Step 3: Remove notification type UI from App.tsx**

In `src/renderer/App.tsx`:
- Line 303: Remove `showClassIcons` logic (was tied to image mode)
- Lines 581-610: Remove the notification type toggle buttons (image/embed/tiled)
- Remove `notificationType` and `setNotificationType` state if no longer needed

- [ ] **Step 4: Update main process default**

In `src/main/index.ts`:
- Line 477: Change `store.get('discordNotificationType', 'image')` to `'embed'` (hardcoded, or remove the setting entirely)

- [ ] **Step 5: Remove notification type from SettingsView**

In `src/renderer/SettingsView.tsx`:
- Line 65: Remove the `discordNotificationType` settings entry from the settings list

- [ ] **Step 6: Run typecheck and lint**

```bash
npm run validate
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: simplify Discord notification to embed-only"
```

---

### Task 4: Remove screenshot upload listener code

**Files:**
- Modify: `src/renderer/app/hooks/useUploadListeners.ts` — remove screenshot capture chain (~130 lines)

- [ ] **Step 1: Remove screenshot code from useUploadListeners.ts**

In `src/renderer/app/hooks/useUploadListeners.ts`:
- Remove `import { toPng } from 'html-to-image'` at top
- Remove `dataUrlToUint8Array()` function (lines 5-20)
- Remove `safeToPng()` function (lines 112-117)
- Remove `screenshotCaptureChainRef` ref (line 49)
- Remove `captureScreenshotForLog()` function and the `onRequestScreenshot` listener setup (lines 118-274)
- Remove the `setScreenshotData` calls

Keep all non-screenshot IPC listeners (upload progress, log-detected, etc.).

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: remove screenshot capture chain from upload listeners"
```

---

### Task 5: Clean up ExpandableLogCard and section files

**Files:**
- Modify: `src/renderer/ExpandableLogCard.tsx:955-981` — remove screenshot props/attributes
- Modify: 25 section files — remove `stats-share-exclude` class

- [ ] **Step 1: Remove screenshot props from ExpandableLogCard**

In `src/renderer/ExpandableLogCard.tsx`:
- Remove `screenshotMode` prop from the component's props interface
- Remove `screenshotSection` prop from the component's props interface
- Remove `id={!screenshotSection ? \`log-screenshot-...\` : undefined}` (line 980)
- Remove `data-screenshot-id`, `data-screenshot-group`, `data-screenshot-transparent` attributes (lines 955-957)
- Remove any conditional rendering based on `screenshotMode` (line 556 area)

- [ ] **Step 2: Remove stats-share-exclude from section files**

In each of these 25 files under `src/renderer/stats/sections/`, find and remove the `stats-share-exclude` CSS class from the modal/overlay div classNames:

```
ApmSection.tsx, BoonOutputSection.tsx, BoonTimelineSection.tsx, BoonUptimeSection.tsx,
ConditionsSection.tsx, DamageBreakdownSection.tsx, DamageMitigationSection.tsx,
DamageModifiersSection.tsx, DefenseSection.tsx, FightBreakdownSection.tsx,
FightDiffModeSection.tsx, HealEffectivenessSection.tsx, HealingBreakdownSection.tsx,
HealingSection.tsx, OffenseSection.tsx, PlayerBreakdownSection.tsx,
SigilRelicUptimeSection.tsx, SkillUsageSection.tsx, SpecialBuffsSection.tsx,
SpikeDamageSection.tsx, SquadDamageComparisonSection.tsx, SquadKillPressureSection.tsx,
SquadTagDistanceDeathsSection.tsx, SupportSection.tsx, TopPlayersSection.tsx
```

For each file, search for `stats-share-exclude` and remove it from the className string. The surrounding modal/overlay functionality stays — only the screenshot exclusion class is removed.

- [ ] **Step 3: Remove screenshot CSS rules from index.css**

In `src/renderer/index.css`:
- Remove `.stats-share-mode` rules (lines 879-910)
- Remove `.stats-share-tooltip` rule (line 140 area)
- Remove `.stats-share-table` if referenced

- [ ] **Step 4: Run typecheck and lint**

```bash
npm run validate
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove screenshot props and CSS from components"
```

---

### Task 6: Remove html-to-image dependency and verify

**Files:**
- Modify: `package.json` — remove html-to-image

- [ ] **Step 1: Uninstall html-to-image**

```bash
npm uninstall html-to-image
```

- [ ] **Step 2: Verify no remaining references**

```bash
grep -r "html-to-image" src/ --include="*.ts" --include="*.tsx"
grep -r "toPng" src/ --include="*.ts" --include="*.tsx"
grep -r "screenshotMode" src/ --include="*.ts" --include="*.tsx"
grep -r "stats-share" src/ --include="*.ts" --include="*.tsx" --include="*.css"
grep -r "sendScreenshot\|sendStatsScreenshot\|onRequestScreenshot" src/ --include="*.ts" --include="*.tsx"
```

All should return empty. Fix any stragglers.

- [ ] **Step 3: Run full validation**

```bash
npm run validate && npm run test:unit
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove html-to-image dependency, verify clean removal"
```

---

## Phase 2: Zustand Store

### Task 7: Install zustand and create stats store

**Files:**
- Create: `src/renderer/stats/statsStore.ts`
- Create: `src/renderer/stats/__tests__/statsStore.test.ts`
- Modify: `package.json` — add zustand

- [ ] **Step 1: Install zustand**

```bash
npm install zustand
```

- [ ] **Step 2: Write failing tests for the store**

Create `src/renderer/stats/__tests__/statsStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../statsStore';

describe('statsStore', () => {
    beforeEach(() => {
        // Reset store between tests
        useStatsStore.setState(useStatsStore.getInitialState());
    });

    describe('result management', () => {
        it('starts with null result', () => {
            const state = useStatsStore.getState();
            expect(state.result).toBeNull();
            expect(state.inputsHash).toBeNull();
        });

        it('stores result with inputs hash', () => {
            const mockResult = { total: 5, players: [] };
            useStatsStore.getState().setResult(mockResult, 'hash-abc');

            const state = useStatsStore.getState();
            expect(state.result).toBe(mockResult);
            expect(state.inputsHash).toBe('hash-abc');
        });

        it('clears result', () => {
            useStatsStore.getState().setResult({ total: 5 }, 'hash-abc');
            useStatsStore.getState().clearResult();

            const state = useStatsStore.getState();
            expect(state.result).toBeNull();
            expect(state.inputsHash).toBeNull();
        });
    });

    describe('progress tracking', () => {
        it('starts with idle progress', () => {
            const state = useStatsStore.getState();
            expect(state.progress.phase).toBe('idle');
            expect(state.progress.active).toBe(false);
        });

        it('updates progress', () => {
            useStatsStore.getState().setProgress({
                active: true,
                phase: 'computing',
                streamed: 5,
                total: 10,
                startedAt: 1000,
                completedAt: 0,
            });
            expect(useStatsStore.getState().progress.phase).toBe('computing');
        });
    });

    describe('group heights', () => {
        it('starts with empty heights', () => {
            expect(useStatsStore.getState().groupHeights).toEqual({});
        });

        it('stores group height', () => {
            useStatsStore.getState().setGroupHeight('overview', 450);
            expect(useStatsStore.getState().groupHeights.overview).toBe(450);
        });

        it('preserves other group heights when setting one', () => {
            useStatsStore.getState().setGroupHeight('overview', 450);
            useStatsStore.getState().setGroupHeight('offense', 600);
            expect(useStatsStore.getState().groupHeights.overview).toBe(450);
            expect(useStatsStore.getState().groupHeights.offense).toBe(600);
        });
    });

    describe('active nav group', () => {
        it('defaults to overview', () => {
            expect(useStatsStore.getState().activeNavGroup).toBe('overview');
        });

        it('updates active nav group', () => {
            useStatsStore.getState().setActiveNavGroup('defense');
            expect(useStatsStore.getState().activeNavGroup).toBe('defense');
        });
    });

    describe('diagnostics', () => {
        it('starts with null diagnostics', () => {
            expect(useStatsStore.getState().diagnostics).toBeNull();
        });

        it('stores and clears diagnostics', () => {
            const diag = { mode: 'worker' as const, logsInPayload: 10, streamedLogs: 10, totalLogs: 10, startedAt: 0, completedAt: 100, streamMs: 50, computeMs: 50, totalMs: 100, flushId: 1 };
            useStatsStore.getState().setDiagnostics(diag);
            expect(useStatsStore.getState().diagnostics).toBe(diag);

            useStatsStore.getState().setDiagnostics(null);
            expect(useStatsStore.getState().diagnostics).toBeNull();
        });
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/renderer/stats/__tests__/statsStore.test.ts
```

Expected: FAIL — `statsStore` module doesn't exist yet.

- [ ] **Step 4: Implement the store**

Create `src/renderer/stats/statsStore.ts`:

```typescript
import { create } from 'zustand';
import type { AggregationProgressState, AggregationDiagnosticsState } from './hooks/useStatsAggregationWorker';

/**
 * Create a hash of settings for cache key generation.
 * Moved from aggregationCache.ts — used by App.tsx store sync.
 */
export function hashAggregationSettings(mvpWeights: any, statsViewSettings: any, disruptionMethod: any): string {
    const key = JSON.stringify({ mvpWeights, statsViewSettings, disruptionMethod });
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

interface StatsStoreState {
    // Aggregation result
    result: any | null;
    inputsHash: string | null;

    // Computation lifecycle
    progress: AggregationProgressState;
    diagnostics: AggregationDiagnosticsState | null;

    // Group height cache (persists across mount/unmount)
    groupHeights: Record<string, number>;

    // Sidebar state (persists across mount/unmount)
    activeNavGroup: string;

    // Actions
    setResult: (result: any, inputsHash: string) => void;
    setProgress: (progress: AggregationProgressState) => void;
    setDiagnostics: (diagnostics: AggregationDiagnosticsState | null) => void;
    setGroupHeight: (groupId: string, height: number) => void;
    setActiveNavGroup: (groupId: string) => void;
    clearResult: () => void;
}

export const useStatsStore = create<StatsStoreState>()((set) => ({
    result: null,
    inputsHash: null,
    progress: {
        active: false,
        phase: 'idle' as const,
        streamed: 0,
        total: 0,
        startedAt: 0,
        completedAt: 0,
    },
    diagnostics: null,
    groupHeights: {},
    activeNavGroup: 'overview',

    setResult: (result, inputsHash) => set({ result, inputsHash }),
    setProgress: (progress) => set({ progress }),
    setDiagnostics: (diagnostics) => set({ diagnostics }),
    setGroupHeight: (groupId, height) =>
        set((state) => ({
            groupHeights: { ...state.groupHeights, [groupId]: height },
        })),
    setActiveNavGroup: (groupId) => set({ activeNavGroup: groupId }),
    clearResult: () => set({ result: null, inputsHash: null }),
}));
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/renderer/stats/__tests__/statsStore.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/__tests__/statsStore.test.ts package.json package-lock.json
git commit -m "feat: add zustand stats store with tests"
```

---

### Task 8: Wire store sync in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx:215-234` — add store sync after useStatsAggregationWorker

- [ ] **Step 1: Add store sync effect**

First, move `hashAggregationSettings` from `aggregationCache.ts` to `statsStore.ts` (it will be deleted with the cache later). Copy the function and add an export. Then update App.tsx:

```typescript
import { useStatsStore, hashAggregationSettings } from './stats/statsStore';

// After the existing useStatsAggregationWorker destructuring:
const { stats: computedStats, skillUsageData: computedSkillUsageData } = aggregationResult;

// Sync aggregation results to zustand store
useEffect(() => {
    const store = useStatsStore.getState();
    if (computedStats) {
        const inputsHash = hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod)
            + ':logs' + logsForStats.length;
        store.setResult(
            { stats: computedStats, skillUsageData: computedSkillUsageData },
            inputsHash,
        );
    }
    store.setProgress(aggregationProgress);
    store.setDiagnostics(aggregationDiagnostics ?? null);
}, [computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, mvpWeights, statsViewSettings, disruptionMethod, logsForStats.length]);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Run unit tests**

```bash
npm run test:unit
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: sync aggregation results to zustand store"
```

---

## Phase 3: Lazy Groups Hook

### Task 9: Create useLazyGroups hook

**Files:**
- Create: `src/renderer/stats/hooks/useLazyGroups.ts`
- Create: `src/renderer/stats/hooks/__tests__/useLazyGroups.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/stats/hooks/__tests__/useLazyGroups.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLazyGroups } from '../useLazyGroups';
import { useStatsStore } from '../../statsStore';

const TEST_GROUPS = [
    { id: 'overview', sectionIds: ['overview', 'fight-breakdown', 'top-players'] },
    { id: 'offense', sectionIds: ['offense-detailed', 'damage-modifiers'] },
    { id: 'defense', sectionIds: ['defense-detailed', 'boon-output'] },
];

describe('useLazyGroups', () => {
    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
    });

    it('mounts only the active group initially', () => {
        useStatsStore.getState().setActiveNavGroup('overview');
        const { result } = renderHook(() => useLazyGroups(TEST_GROUPS));

        expect(result.current.isGroupMounted('overview')).toBe(true);
        expect(result.current.isGroupMounted('offense')).toBe(false);
        expect(result.current.isGroupMounted('defense')).toBe(false);
    });

    it('mounts a new group when activeNavGroup changes', () => {
        useStatsStore.getState().setActiveNavGroup('overview');
        const { result, rerender } = renderHook(() => useLazyGroups(TEST_GROUPS));

        act(() => {
            useStatsStore.getState().setActiveNavGroup('offense');
        });
        rerender();

        expect(result.current.isGroupMounted('overview')).toBe(true);
        expect(result.current.isGroupMounted('offense')).toBe(true);
        expect(result.current.isGroupMounted('defense')).toBe(false);
    });

    it('accumulates mounted groups (never unmounts visited)', () => {
        useStatsStore.getState().setActiveNavGroup('overview');
        const { result, rerender } = renderHook(() => useLazyGroups(TEST_GROUPS));

        act(() => useStatsStore.getState().setActiveNavGroup('offense'));
        rerender();
        act(() => useStatsStore.getState().setActiveNavGroup('defense'));
        rerender();
        act(() => useStatsStore.getState().setActiveNavGroup('overview'));
        rerender();

        expect(result.current.isGroupMounted('overview')).toBe(true);
        expect(result.current.isGroupMounted('offense')).toBe(true);
        expect(result.current.isGroupMounted('defense')).toBe(true);
    });

    it('returns placeholder height from store', () => {
        useStatsStore.getState().setGroupHeight('offense', 600);
        useStatsStore.getState().setActiveNavGroup('overview');
        const { result } = renderHook(() => useLazyGroups(TEST_GROUPS));

        expect(result.current.getPlaceholderHeight('offense')).toBe(600);
    });

    it('returns default height when no stored height', () => {
        useStatsStore.getState().setActiveNavGroup('overview');
        const { result } = renderHook(() => useLazyGroups(TEST_GROUPS));

        expect(result.current.getPlaceholderHeight('offense')).toBe(400);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/renderer/stats/hooks/__tests__/useLazyGroups.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement useLazyGroups**

Create `src/renderer/stats/hooks/useLazyGroups.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStatsStore } from '../statsStore';

interface GroupDef {
    id: string;
    sectionIds: string[];
}

const DEFAULT_PLACEHOLDER_HEIGHT = 400;

export function useLazyGroups(groups: GroupDef[]) {
    const activeNavGroup = useStatsStore((s) => s.activeNavGroup);
    const groupHeights = useStatsStore((s) => s.groupHeights);
    const setGroupHeight = useStatsStore((s) => s.setGroupHeight);

    // Track which groups have been mounted (accumulates, never shrinks)
    const [mountedGroups, setMountedGroups] = useState<Set<string>>(
        () => new Set([activeNavGroup]),
    );

    // When activeNavGroup changes, add it to mounted set
    useEffect(() => {
        setMountedGroups((prev) => {
            if (prev.has(activeNavGroup)) return prev;
            return new Set([...prev, activeNavGroup]);
        });
    }, [activeNavGroup]);

    const isGroupMounted = useCallback(
        (groupId: string) => mountedGroups.has(groupId),
        [mountedGroups],
    );

    const getPlaceholderHeight = useCallback(
        (groupId: string) => groupHeights[groupId] ?? DEFAULT_PLACEHOLDER_HEIGHT,
        [groupHeights],
    );

    // Track ResizeObservers per group, disconnect old before creating new
    const observersRef = useRef<Map<string, ResizeObserver>>(new Map());

    // Returns a ref callback for ResizeObserver — attach to each group container
    const groupResizeRef = useCallback(
        (groupId: string) => (el: HTMLDivElement | null) => {
            // Disconnect previous observer for this group
            const prev = observersRef.current.get(groupId);
            if (prev) {
                prev.disconnect();
                observersRef.current.delete(groupId);
            }
            if (!el) return;
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const height = entry.contentRect.height;
                    if (height > 0) {
                        setGroupHeight(groupId, Math.round(height));
                    }
                }
            });
            observer.observe(el);
            observersRef.current.set(groupId, observer);
        },
        [setGroupHeight],
    );

    // Cleanup all observers on unmount
    useEffect(() => {
        return () => {
            observersRef.current.forEach((obs) => obs.disconnect());
            observersRef.current.clear();
        };
    }, []);

    return {
        activeNavGroup,
        isGroupMounted,
        getPlaceholderHeight,
        groupResizeRef,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/renderer/stats/hooks/__tests__/useLazyGroups.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/hooks/useLazyGroups.ts src/renderer/stats/hooks/__tests__/useLazyGroups.test.ts
git commit -m "feat: add useLazyGroups hook with tests"
```

---

## Phase 4: Integration — Wire Everything Together

### Task 10: Update StatsNavSidebar to use zustand store

**Files:**
- Modify: `src/renderer/stats/StatsNavSidebar.tsx`

- [ ] **Step 1: Replace local activeGroup state with store**

In `src/renderer/stats/StatsNavSidebar.tsx`:

Replace:
```typescript
const [activeGroup, setActiveGroup] = useState('overview');
```

With:
```typescript
import { useStatsStore } from '../statsStore';
const activeGroup = useStatsStore((s) => s.activeNavGroup);
const setActiveGroup = useStatsStore((s) => s.setActiveNavGroup);
```

- [ ] **Step 2: Make onSectionVisibilityChange optional**

Make `onSectionVisibilityChange` an **optional** prop (it's still needed by `FightReportHistoryView` at line 635, which uses its own `StatsNavSidebar` instance for embedded report viewing). Change the `useEffect` that calls it to be conditional:

```typescript
// Keep prop as optional:
onSectionVisibilityChange?: (fn: (id: string) => boolean) => void;

// Guard the effect:
useEffect(() => {
    if (!onSectionVisibilityChange) return;
    const sectionIds = ...;
    onSectionVisibilityChange((id: string) => sectionIds.includes(id));
}, [activeGroupDef, onSectionVisibilityChange]);
```

This preserves the callback for `FightReportHistoryView` (which passes `sectionVisibility` to its embedded `StatsView`) while making it unnecessary for the main AppLayout path.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: AppLayout.tsx will need the `onSectionVisibilityChange` prop removed in Task 12. FightReportHistoryView should still typecheck since the prop is now optional.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/StatsNavSidebar.tsx
git commit -m "refactor: StatsNavSidebar reads activeNavGroup from zustand store"
```

---

### Task 11: Update StatsView to read from store and use lazy groups

**Files:**
- Modify: `src/renderer/StatsView.tsx`

This is the largest single change. StatsView needs to:
1. Read aggregation result from zustand store instead of props
2. Use `useLazyGroups` for group rendering
3. Remove dissolve/settling hacks

- [ ] **Step 1: Read from store instead of props**

In `src/renderer/StatsView.tsx`:

Add imports:
```typescript
import { useStatsStore } from './stats/statsStore';
import { useLazyGroups } from './stats/hooks/useLazyGroups';
```

Replace the aggregation result consumption. Currently StatsView receives `aggregationResult` as a prop and destructures it. Instead, read from the store:

```typescript
// Replace prop-based aggregation result with store read:
const storeResult = useStatsStore((s) => s.result);
const storeProgress = useStatsStore((s) => s.progress);
const storeDiagnostics = useStatsStore((s) => s.diagnostics);

// Use store result, falling back to prop (for embedded/web report consumers)
const aggregationSource = storeResult ?? aggregationResult;
const stats = aggregationSource?.stats;
const skillUsageData = aggregationSource?.skillUsageData;
const aggregationProgress = storeProgress ?? aggregationResult?.aggregationProgress;
const aggregationDiagnostics = storeDiagnostics ?? aggregationResult?.aggregationDiagnostics;
```

Keep the `aggregationResult` prop for embedded consumers (web report, FightReportHistoryView).

- [ ] **Step 2: Integrate useLazyGroups**

Initialize the hook with group definitions from `STATS_TOC_GROUPS`:

```typescript
const { activeNavGroup, isGroupMounted, getPlaceholderHeight, groupResizeRef } = useLazyGroups(
    STATS_TOC_GROUPS.map(g => ({ id: g.id, sectionIds: g.sectionIds }))
);
```

Modify the existing `renderGroup` helper (line 451) to integrate lazy groups. `StatsGroupContainer` is not wrapped in `forwardRef`, so attach the ResizeObserver via a wrapper div:

```typescript
const renderGroup = (groupId: string, sections: Array<{ id: string; element: React.ReactNode }>) => {
    const group = STATS_TOC_GROUPS.find(g => g.id === groupId);
    if (!group) return null;

    // For embedded mode (web report), always render all groups
    // For non-embedded, use lazy groups
    if (!embedded && !isGroupMounted(groupId)) {
        return (
            <div
                key={groupId}
                id={`group-${groupId}`}
                style={{ height: getPlaceholderHeight(groupId) }}
                className="pointer-events-none"
            />
        );
    }

    const anyVisible = embedded
        ? group.sectionIds.some(id => isSectionVisible(id))
        : groupId === activeNavGroup;

    return (
        <div key={groupId} ref={groupResizeRef(groupId)}>
            <StatsGroupContainer
                groupId={groupId}
                visible={anyVisible}
                label={group.label}
                icon={group.icon as React.ComponentType<{ className?: string }>}
                accentColor={GROUP_ACCENT_COLORS[groupId] || 'var(--brand-primary)'}
                sectionCount={sections.length}
            >
                {sections.map((s, i) => (
                    <SectionPanel key={s.id} sectionId={s.id} isLast={i === sections.length - 1}>
                        {renderSectionWrap(s.element)}
                    </SectionPanel>
                ))}
            </StatsGroupContainer>
        </div>
    );
};
```

This modifies the single `renderGroup` helper. All 7 call sites (lines ~4311-4611) automatically get lazy behavior without individual changes. The embedded path (web report) skips lazy groups entirely.

- [ ] **Step 3: Remove dissolve/settling hacks**

Remove:
- `dissolveCompletedForLogKey` state and its tracking effect (lines 360-376)
- `sectionContentReady` state and the `requestIdleCallback` effect (lines 474-504)
- The `logIdentityKey` computation used for dissolve tracking

Simplify dissolve to: if store has result on mount → no dissolve, sections render immediately. If no result → show loading until store gets populated.

- [ ] **Step 4: Remove sectionVisibility prop consumption**

The `sectionVisibility` prop from AppLayout is no longer needed in the non-embedded path. The lazy group system replaces it. Keep the prop for embedded consumers.

In the non-embedded render path, remove `isSectionVisibleFast` checks that were based on `sectionVisibility`. The `useLazyGroups` hook handles which groups are mounted.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Fix type errors incrementally.

- [ ] **Step 6: Run unit tests**

```bash
npm run test:unit
```

Some existing StatsView integration tests may need updates if they rely on the old prop-based aggregation flow.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "refactor: StatsView reads from zustand store, uses lazy groups"
```

---

### Task 12: Update AppLayout — remove display:none, add AnimatePresence

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx`

- [ ] **Step 1: Remove display:none and statsViewMounted conditional**

Replace the current stats rendering block (lines 307-335):

```typescript
// Before:
{statsViewMounted && (
    <div className="flex flex-1 min-h-0 relative" style={view !== 'stats' ? { display: 'none' } : undefined}>
        ...
    </div>
)}
```

With AnimatePresence-based view switching. Add imports:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
```

Define a shared page transition:

```typescript
const pageTransition = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};
```

Replace the view rendering with:

```tsx
<AnimatePresence mode="wait">
    {view === 'dashboard' && (
        <motion.div key="dashboard" {...pageTransition} className="flex flex-1 min-h-0 relative flex-col">
            {/* existing dashboard content */}
        </motion.div>
    )}
    {view === 'stats' && (
        <motion.div key="stats" {...pageTransition} className="flex flex-1 min-h-0 relative">
            <div className="flex-1 min-h-0 flex gap-3">
                <StatsNavSidebar />
                <div className="flex-1 min-h-0 flex flex-col">
                    <StatsErrorBoundary>
                        <StatsView
                            logs={logsForStats}
                            onBack={() => setView('dashboard')}
                            mvpWeights={mvpWeights}
                            disruptionMethod={disruptionMethod}
                            statsViewSettings={statsViewSettings}
                            precomputedStats={precomputedStats || undefined}
                            statsDataProgress={statsDataProgress}
                            onStatsViewSettingsChange={(next) => {
                                setStatsViewSettings(next);
                                window.electronAPI?.saveSettings?.({ statsViewSettings: next });
                            }}
                            webUploadState={webUploadState}
                            onWebUpload={handleWebUpload}
                        />
                    </StatsErrorBoundary>
                </div>
            </div>
        </motion.div>
    )}
    {view === 'history' && (
        <motion.div key="history" {...pageTransition} className="flex flex-1 min-h-0 relative flex-col">
            {/* existing history content */}
        </motion.div>
    )}
    {view === 'settings' && (
        <motion.div key="settings" {...pageTransition} className="flex flex-1 min-h-0 relative flex-col">
            {/* existing settings content */}
        </motion.div>
    )}
</AnimatePresence>
```

- [ ] **Step 2: Remove sectionVisibility plumbing**

Remove:
- `statsSectionVisibility` state (line 102)
- `handleStatsSectionVisibilityChange` callback (lines 103-105)
- `onSectionVisibilityChange` prop on `<StatsNavSidebar>`
- `sectionVisibility` prop on `<StatsView>`
- `canShareDiscord` prop on `<StatsView>` (screenshot removed)

- [ ] **Step 3: Remove CSS animation classes**

In `src/renderer/index.css`, remove:
- `.stats-view-fade-in` keyframe and rule
- `.stats-view-entering` keyframe and rule

These are replaced by the Framer Motion `pageTransition`.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app/AppLayout.tsx src/renderer/index.css
git commit -m "refactor: replace display:none with AnimatePresence view transitions"
```

---

### Task 13: Remove statsViewMounted from useDevDatasets

**Files:**
- Modify: `src/renderer/app/hooks/useDevDatasets.ts`

- [ ] **Step 1: Remove statsViewMounted state and effect**

In `src/renderer/app/hooks/useDevDatasets.ts`:
- Line 72: Remove `const [statsViewMounted, setStatsViewMounted] = useState(false);`
- Lines 385-387: Remove `statsViewMounted` from the hook's return value

**publishLogsForStats effects analysis** — there are 4 effects that call it. Here's what happens to each:

1. **Lines 240-258 (batch timer during bulk):** Gates on `view === 'stats'` and `bulkUploadMode`. This effect batches log updates during bulk upload so stats don't recompute on every log. **Keep as-is** — still needed. The `view === 'stats'` gate is fine; with the new architecture, computation runs at the App level regardless of view, but we still want to debounce during bulk. However, remove the `view === 'stats'` gate so that `publishLogsForStats` fires regardless of current view — this is the whole point of the zustand store: computation runs in the background.

2. **Lines 273-280 (view === 'stats' mount):** Sets `statsViewMounted` and publishes logs on first stats view. **Remove entirely** — `statsViewMounted` is deleted, and with the store sync at the App level, computation already runs when logs change regardless of view.

3. **Lines 282-287 (logsForStats.length sync):** Publishes when `logsForStats.length !== logs.length` while on stats view. **Remove the `view === 'stats'` gate** — logs should always be synced to `logsForStats` so computation can run in the background.

4. **Lines 289-295 (details hydration settle):** Publishes when `hasPendingStatsDetails` transitions to false while on stats view. **Remove the `view === 'stats'` gate** — same reasoning.

The pattern is: remove all `view === 'stats'` gates from `publishLogsForStats` effects, since computation now runs at the App level regardless of which view is active. This is what makes "switch to stats and see results immediately" work.

- [ ] **Step 2: Update consumers of statsViewMounted**

Search for `statsViewMounted` in AppLayout.tsx and remove references. The AnimatePresence `view === 'stats'` conditional replaces it.

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run validate && npm run test:unit
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/hooks/useDevDatasets.ts src/renderer/app/AppLayout.tsx
git commit -m "refactor: remove statsViewMounted state"
```

---

### Task 14: Remove aggregationCache.ts

**Files:**
- Delete: `src/renderer/stats/aggregationCache.ts`
- Delete: `src/renderer/stats/__tests__/aggregationCache.test.ts`
- Modify: `src/renderer/stats/hooks/useStatsAggregationWorker.ts` — remove cache import/usage

- [ ] **Step 1: Remove cache usage from useStatsAggregationWorker**

In `src/renderer/stats/hooks/useStatsAggregationWorker.ts`:
- Remove import: `import { getAggregationCache, hashAggregationSettings } from '../aggregationCache';`
- In the fallback computation path (around lines 420-434), remove the cache check and cache write. The zustand store now serves as the cache.

`hashAggregationSettings` was already moved to `statsStore.ts` in Task 8. Update `useStatsAggregationWorker.ts` to import from `statsStore` instead of `aggregationCache`:

```typescript
// Change:
import { getAggregationCache, hashAggregationSettings } from '../aggregationCache';
// To:
import { hashAggregationSettings } from '../statsStore';
```

Remove all `getAggregationCache()` calls in the fallback path.

- [ ] **Step 2: Delete cache files**

```bash
rm src/renderer/stats/aggregationCache.ts
rm src/renderer/stats/__tests__/aggregationCache.test.ts
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run validate && npm run test:unit
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: remove aggregationCache, zustand store replaces it"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run full validation suite**

```bash
npm run validate
```

- [ ] **Step 2: Run all unit tests**

```bash
npm run test:unit
```

- [ ] **Step 3: Verify no stale references remain**

```bash
grep -r "display.*none.*stats\|statsViewMounted\|stats-view-fade-in\|stats-view-entering\|aggregationCache\|screenshotMode\|stats-share-exclude\|html-to-image\|toPng\|sendScreenshot\|ScreenshotContainer\|dissolveCompletedForLogKey\|sectionContentReady" src/ --include="*.ts" --include="*.tsx" --include="*.css"
```

Should return empty (or only references in comments/docs).

- [ ] **Step 4: Manual smoke test**

Start the dev server and verify:
```bash
npm run dev
```

Test:
1. Navigate to stats tab — content appears with Framer Motion entrance animation
2. Switch to dashboard and back — stats re-appears smoothly, data preserved
3. Switch nav groups within stats — groups load on first visit, stay mounted after
4. Upload a log — aggregation runs, stats update without full remount
5. Discord webhook posting still works (embed mode)

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: final verification — stats mount/unmount redesign complete"
```
