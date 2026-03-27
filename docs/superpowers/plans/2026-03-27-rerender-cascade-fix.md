# Re-render Cascade Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the re-render cascade caused by unmemoized theme state flowing through the component tree, then re-enable recharts chart animations.

**Architecture:** Add memoization boundaries at three levels: stabilize the `useSettings` return object, memoize context objects in App.tsx, and wrap StatsView in `React.memo` with stabilized props. Then remove the `disableAnimations` workaround from ChartContainer.

**Tech Stack:** React (useMemo, useCallback, React.memo), recharts, Electron renderer

**Spec:** `docs/superpowers/specs/2026-03-27-rerender-cascade-fix-design.md`

---

### Task 1: Stabilize `useSettings` return object

**Files:**
- Modify: `src/renderer/app/hooks/useSettings.ts:1,116-134`

- [ ] **Step 1: Add `useMemo` to import**

In `src/renderer/app/hooks/useSettings.ts`, line 1 currently imports:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

Change to:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Wrap return object in `useMemo`**

Replace the return block (lines 116-134):

```ts
    return {
        logDirectory, setLogDirectory,
        notificationType, setNotificationType,
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        colorPalette, setColorPalette,
        glassSurfaces, setGlassSurfaces,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        settingsLoaded,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        shouldOpenWhatsNew,
    };
```

With:

```ts
    return useMemo(() => ({
        logDirectory, setLogDirectory,
        notificationType, setNotificationType,
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        colorPalette, setColorPalette,
        glassSurfaces, setGlassSurfaces,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        settingsLoaded,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        shouldOpenWhatsNew,
    }), [
        logDirectory, notificationType, embedStatSettings, mvpWeights,
        statsViewSettings, disruptionMethod, colorPalette, glassSurfaces,
        webhooks, selectedWebhookId, handleUpdateSettings, handleSelectDirectory,
        settingsLoaded, whatsNewVersion, whatsNewNotes, walkthroughSeen,
        shouldOpenWhatsNew,
    ]);
```

Note: `useState` setters (`setLogDirectory`, `setColorPalette`, etc.) are stable by React guarantee and excluded from the dependency array.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no type changes, just wrapping an existing object.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/hooks/useSettings.ts
git commit -m "perf: stabilize useSettings return object with useMemo"
```

---

### Task 2: Memoize context objects in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx:914-922`

- [ ] **Step 1: Wrap `devDatasetsCtx` in `useMemo`**

Replace the inline object at line 914-916:

```ts
    const devDatasetsCtx = {
        devDatasetsEnabled, devDatasetsOpen, loadDevDatasets, devDatasetRefreshing, setDevDatasetsOpen, devDatasetName, setDevDatasetName, devDatasetSaving, setDevDatasetSaving, devDatasetSavingIdRef, setDevDatasetSaveProgress, computedStats, computedSkillUsageData, appVersion, view, expandedLogId, notificationType, embedStatSettings, mvpWeights, statsViewSettings, disruptionMethod, colorPalette, selectedWebhookId, bulkUploadMode, logs, setDevDatasets, setDevDatasetLoadModes, devDatasetSaveProgress, devDatasets, devDatasetLoadModes, setDevDatasetLoadingId, setDevDatasetLoadProgress, setLogs, setLogsForStats, logsRef, setPrecomputedStats, canceledLogsRef, datasetLoadRef, devDatasetStreamingIdRef, applyDevDatasetSnapshot, setDevDatasetDeleteConfirmId, devDatasetDeleteConfirmId, devDatasetLoadingId
    };
```

With:

```ts
    const devDatasetsCtx = useMemo(() => ({
        devDatasetsEnabled, devDatasetsOpen, loadDevDatasets, devDatasetRefreshing, setDevDatasetsOpen, devDatasetName, setDevDatasetName, devDatasetSaving, setDevDatasetSaving, devDatasetSavingIdRef, setDevDatasetSaveProgress, computedStats, computedSkillUsageData, appVersion, view, expandedLogId, notificationType, embedStatSettings, mvpWeights, statsViewSettings, disruptionMethod, colorPalette, selectedWebhookId, bulkUploadMode, logs, setDevDatasets, setDevDatasetLoadModes, devDatasetSaveProgress, devDatasets, devDatasetLoadModes, setDevDatasetLoadingId, setDevDatasetLoadProgress, setLogs, setLogsForStats, logsRef, setPrecomputedStats, canceledLogsRef, datasetLoadRef, devDatasetStreamingIdRef, applyDevDatasetSnapshot, setDevDatasetDeleteConfirmId, devDatasetDeleteConfirmId, devDatasetLoadingId
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [
        devDatasetsEnabled, devDatasetsOpen, loadDevDatasets, devDatasetRefreshing,
        devDatasetName, devDatasetSaving, computedStats, computedSkillUsageData,
        appVersion, view, expandedLogId, notificationType, embedStatSettings,
        mvpWeights, statsViewSettings, disruptionMethod, colorPalette,
        selectedWebhookId, bulkUploadMode, logs, devDatasetSaveProgress,
        devDatasets, devDatasetLoadModes, devDatasetDeleteConfirmId, devDatasetLoadingId,
    ]);
```

Note: Refs (`devDatasetSavingIdRef`, `logsRef`, `canceledLogsRef`, `datasetLoadRef`, `devDatasetStreamingIdRef`) and `useState` setters are stable and excluded from deps. The eslint-disable is for the refs/setters that appear in the object but not the dep array.

- [ ] **Step 2: Wrap `filePickerCtx` in `useMemo`**

Replace the inline object at line 917-918:

```ts
    const filePickerCtx = {
        ...filePickerState, logDirectory
    };
```

With:

```ts
    const filePickerCtx = useMemo(() => ({
        ...filePickerState, logDirectory
    }), [filePickerState, logDirectory]);
```

- [ ] **Step 3: Wrap `appLayoutCtx` in `useMemo`**

Replace the inline object at line 920-922:

```ts
    const appLayoutCtx = {
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded, updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason, view, settingsUpdateCheckRef, versionClickTimesRef, versionClickTimeoutRef, setDeveloperSettingsTrigger, appVersion, setView, showTerminal, setShowTerminal, devDatasetsEnabled, setDevDatasetsOpen, webUploadState, setWebUploadState, logsForStats, mvpWeights, disruptionMethod, statsViewSettings, precomputedStats, computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, statsDataProgress, setStatsViewSettings, colorPalette, setColorPalette, glassSurfaces, setGlassSurfaces, handleWebUpload, selectedWebhookId, setEmbedStatSettings, setMvpWeights, setDisruptionMethod, developerSettingsTrigger, helpUpdatesFocusTrigger, handleHelpUpdatesFocusConsumed, setWalkthroughOpen, setWhatsNewOpen, activityPanel, configurationPanel, devDatasetsCtx, filePickerCtx, webhookDropdownOpen, webhookDropdownStyle, webhookDropdownPortalRef, webhooks, handleUpdateSettings, setSelectedWebhookId, setWebhookDropdownOpen, webhookModalOpen, setWebhookModalOpen, setWebhooks, showUpdateErrorModal, setShowUpdateErrorModal, updateError, whatsNewOpen, handleWhatsNewClose, whatsNewVersion, whatsNewNotes, walkthroughOpen, handleWalkthroughClose, handleWalkthroughLearnMore, isBulkUploadActive
    };
```

With:

```ts
    const appLayoutCtx = useMemo(() => ({
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded, updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason, view, settingsUpdateCheckRef, versionClickTimesRef, versionClickTimeoutRef, setDeveloperSettingsTrigger, appVersion, setView, showTerminal, setShowTerminal, devDatasetsEnabled, setDevDatasetsOpen, webUploadState, setWebUploadState, logsForStats, mvpWeights, disruptionMethod, statsViewSettings, precomputedStats, computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, statsDataProgress, setStatsViewSettings, colorPalette, setColorPalette, glassSurfaces, setGlassSurfaces, handleWebUpload, selectedWebhookId, setEmbedStatSettings, setMvpWeights, setDisruptionMethod, developerSettingsTrigger, helpUpdatesFocusTrigger, handleHelpUpdatesFocusConsumed, setWalkthroughOpen, setWhatsNewOpen, activityPanel, configurationPanel, devDatasetsCtx, filePickerCtx, webhookDropdownOpen, webhookDropdownStyle, webhookDropdownPortalRef, webhooks, handleUpdateSettings, setSelectedWebhookId, setWebhookDropdownOpen, webhookModalOpen, setWebhookModalOpen, setWebhooks, showUpdateErrorModal, setShowUpdateErrorModal, updateError, whatsNewOpen, handleWhatsNewClose, whatsNewVersion, whatsNewNotes, walkthroughOpen, handleWalkthroughClose, handleWalkthroughLearnMore, isBulkUploadActive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded,
        updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason,
        view, appVersion, showTerminal, devDatasetsEnabled, webUploadState,
        logsForStats, mvpWeights, disruptionMethod, statsViewSettings,
        precomputedStats, computedStats, computedSkillUsageData, aggregationProgress,
        aggregationDiagnostics, statsDataProgress, colorPalette, glassSurfaces,
        selectedWebhookId, developerSettingsTrigger, helpUpdatesFocusTrigger,
        activityPanel, configurationPanel, devDatasetsCtx, filePickerCtx,
        webhookDropdownOpen, webhookDropdownStyle, webhooks, handleUpdateSettings,
        webhookModalOpen, showUpdateErrorModal, updateError, whatsNewOpen,
        whatsNewVersion, whatsNewNotes, walkthroughOpen, isBulkUploadActive,
        handleWebUpload, handleWhatsNewClose, handleWalkthroughClose,
        handleWalkthroughLearnMore, handleHelpUpdatesFocusConsumed,
    ]);
```

Note: Refs (`settingsUpdateCheckRef`, `versionClickTimesRef`, `versionClickTimeoutRef`, `webhookDropdownPortalRef`) and `useState` setters are stable and excluded from deps.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "perf: memoize context objects in App.tsx to prevent cascade re-renders"
```

---

### Task 3: Stabilize StatsView props in AppLayout

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx:2,327-342`

- [ ] **Step 1: Add `useMemo` to import**

In `src/renderer/app/AppLayout.tsx`, line 2 currently imports:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

Change to:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Add stable callbacks and memoized aggregationResult**

After the existing `stableSetDisruptionMethod` callback (line 120), add:

```ts
    const stableOnBack = useCallback(() => setView('dashboard'), [setView]);

    const stableOnStatsViewSettingsChange = useCallback((next: any) => {
        setStatsViewSettings(next);
        window.electronAPI?.saveSettings?.({ statsViewSettings: next });
    }, [setStatsViewSettings]);

    const stableAggregationResult = useMemo(() => ({
        stats: computedStats,
        skillUsageData: computedSkillUsageData,
        aggregationProgress,
        aggregationDiagnostics,
    }), [computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics]);
```

- [ ] **Step 3: Update StatsView JSX to use stable props**

Replace the StatsView JSX (lines 327-342):

```tsx
                                    <StatsView
                                        logs={logsForStats}
                                        onBack={() => setView('dashboard')}
                                        mvpWeights={mvpWeights}
                                        disruptionMethod={disruptionMethod}
                                        statsViewSettings={statsViewSettings}
                                        precomputedStats={precomputedStats || undefined}
                                        aggregationResult={{ stats: computedStats, skillUsageData: computedSkillUsageData, aggregationProgress, aggregationDiagnostics }}
                                        statsDataProgress={statsDataProgress}
                                        onStatsViewSettingsChange={(next) => {
                                            setStatsViewSettings(next);
                                            window.electronAPI?.saveSettings?.({ statsViewSettings: next });
                                        }}
                                        webUploadState={webUploadState}
                                        onWebUpload={handleWebUpload}
                                    />
```

With:

```tsx
                                    <StatsView
                                        logs={logsForStats}
                                        onBack={stableOnBack}
                                        mvpWeights={mvpWeights}
                                        disruptionMethod={disruptionMethod}
                                        statsViewSettings={statsViewSettings}
                                        precomputedStats={precomputedStats || undefined}
                                        aggregationResult={stableAggregationResult}
                                        statsDataProgress={statsDataProgress}
                                        onStatsViewSettingsChange={stableOnStatsViewSettingsChange}
                                        webUploadState={webUploadState}
                                        onWebUpload={handleWebUpload}
                                    />
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app/AppLayout.tsx
git commit -m "perf: stabilize StatsView props with useCallback/useMemo in AppLayout"
```

---

### Task 4: Wrap StatsView in React.memo + memoize inline styles

**Files:**
- Modify: `src/renderer/StatsView.tsx:1,151,3768-3779,4736`

- [ ] **Step 1: Add `memo` to React import**

In `src/renderer/StatsView.tsx`, line 1 currently imports:

```ts
import { CSSProperties, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
```

Change to:

```ts
import { CSSProperties, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Convert export to React.memo**

Line 151 currently reads:

```ts
export function StatsView({ logs, onBack: _onBack, mvpWeights, statsViewSettings, onStatsViewSettingsChange, webUploadState, onWebUpload, disruptionMethod, precomputedStats, embedded = false, sectionVisibility, dashboardTitle, statsDataProgress, aggregationResult: externalAggregationResult }: StatsViewProps) {
```

Change to:

```ts
export const StatsView = memo(function StatsView({ logs, onBack: _onBack, mvpWeights, statsViewSettings, onStatsViewSettingsChange, webUploadState, onWebUpload, disruptionMethod, precomputedStats, embedded = false, sectionVisibility, dashboardTitle, statsDataProgress, aggregationResult: externalAggregationResult }: StatsViewProps) {
```

And at the very end of the file (line 4736 after the closing `}`), add the closing paren:

```ts
});
```

So the last lines become:

```ts
    );
});
```

- [ ] **Step 3: Memoize inline style objects**

Replace the style block at lines 3768-3779:

```ts
    const scrollContainerStyle: CSSProperties | undefined = embedded
        ? {
            backgroundColor: 'rgba(3, 7, 18, 0.75)',
            backgroundImage: 'linear-gradient(160deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.04) 70%)'
        }
        : undefined;
    const resolvedScrollContainerStyle: CSSProperties | undefined = dissolveActive
        ? {
            ...(scrollContainerStyle || {}),
            overflowY: 'hidden'
        }
        : scrollContainerStyle;
```

With:

```ts
    const scrollContainerStyle: CSSProperties | undefined = useMemo(() => embedded
        ? {
            backgroundColor: 'rgba(3, 7, 18, 0.75)',
            backgroundImage: 'linear-gradient(160deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.04) 70%)'
        }
        : undefined, [embedded]);
    const resolvedScrollContainerStyle: CSSProperties | undefined = useMemo(() => dissolveActive
        ? {
            ...(scrollContainerStyle || {}),
            overflowY: 'hidden' as const
        }
        : scrollContainerStyle, [dissolveActive, scrollContainerStyle]);
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "perf: wrap StatsView in React.memo and memoize inline styles"
```

---

### Task 5: Remove `disableAnimations` from ChartContainer

**Files:**
- Modify: `src/renderer/stats/ui/ChartContainer.tsx`

- [ ] **Step 1: Replace ChartContainer with simplified passthrough**

Replace the entire file contents of `src/renderer/stats/ui/ChartContainer.tsx`:

```ts
import { type ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

type ChartContainerProps = ComponentProps<typeof ResponsiveContainer>;

export function ChartContainer({ children, minWidth = 0, minHeight = 0, ...props }: ChartContainerProps) {
    return (
        <ResponsiveContainer minWidth={minWidth} minHeight={minHeight} {...props}>
            {children}
        </ResponsiveContainer>
    );
}
```

This removes the `disableAnimations` function and the `cloneElement` wrapping. Each chart section's own `isAnimationActive` prop now takes effect:

- SkillUsageSection `<Line>`: `isAnimationActive={selectedPlayers.length <= 16}` — animates for reasonable player counts
- BoonTimelineSection `<Bar>`: `isAnimationActive={false}` — stays disabled
- SpikeDamageSection `<Line>`: `isAnimationActive={false}` — stays disabled

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/ui/ChartContainer.tsx
git commit -m "perf: remove disableAnimations workaround from ChartContainer

Re-render cascade is now fixed via memoization boundaries (useSettings
return, App context objects, React.memo on StatsView). Each chart section
controls its own isAnimationActive prop."
```

---

### Task 6: Validate

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (max-warnings 0). Fix any lint errors introduced by the changes.

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit`
Expected: PASS — no behavioral changes, only memoization boundaries added.

- [ ] **Step 4: Mark TODO item as done**

In `TODO.md`, mark the re-render cascade fix item as complete (remove or check off the line about the re-render cascade).

- [ ] **Step 5: Final commit**

If TODO.md was updated:

```bash
git add TODO.md
git commit -m "chore: mark re-render cascade fix as complete in TODO.md"
```
