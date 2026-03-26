# Stats Page Mount/Unmount Redesign

## Problem

StatsView uses `display: none` to avoid a ~1,800ms remount cost (~41 sections across 7 groups, recharts charts, SVG icons). This prevents the stats page from participating in normal app patterns:

- **Framer Motion** entrance/exit animations can't work — the component never unmounts
- **Dissolve tracking** requires special `dissolveCompletedForLogKey` ref logic because the component is perpetually mounted
- **Settling state** had to be split into `aggregationSettling` vs `detailsProgress` to work around hidden/visible duality
- **Freeze component** was added then removed due to conflicts with entrance animations
- **CSS animation classes** (`stats-view-fade-in`, `stats-view-entering`) are custom hacks instead of Framer Motion

The result: the stats page is treated as special, requiring its own lifecycle management separate from every other view.

## Goal

Make StatsView a normal component that mounts and unmounts like every other view (settings, history, dashboard). Framer Motion entrance/exit animations should work. No special treatment.

## Constraints

- **Web uploads** are data-only (aggregation JSON) — unaffected by rendering strategy
- **Nav scrolling** uses `document.getElementById(sectionId)` — section elements must exist when scrolled to
- **Section visibility** is group-based — only one nav group's sections are visible at a time (7 groups, 3-10 sections each; defense group is the largest at 10)

## Design

### Layer 1: External Aggregation Store (zustand)

**What:** A zustand store holds the aggregation result, UI state, and layout metadata outside the React tree, so they persist across StatsView mount/unmount cycles.

**Current state:** `useStatsAggregationWorker` already runs at the App level (`App.tsx`, line 226) and passes results down to StatsView via props. The computation itself already survives StatsView mount/unmount. However, the result still flows through React props/state, which means:
- StatsView must re-derive `safeStats` on every mount (even when data hasn't changed)
- Aggregation progress/diagnostics state is lost on unmount
- Group heights, sidebar active group, and other UI state has no persistence layer
- The `aggregationCache.ts` LRU exists as a secondary cache in the fallback (inline) computation path only

The zustand store centralizes this into a single, component-lifecycle-independent store.

**Store shape:**

```typescript
interface StatsStoreState {
  // Aggregation result (written by useStatsAggregationWorker at App level)
  result: AggregationResult | null;
  inputsHash: string | null;

  // Computation lifecycle
  progress: AggregationProgressState;
  diagnostics: AggregationDiagnosticsState | null;

  // Group height cache (for placeholder sizing, persists across mount/unmount)
  groupHeights: Record<string, number>;

  // Sidebar state (persists active group across mount/unmount)
  activeNavGroup: string;

  // Actions
  setResult: (result: AggregationResult, inputsHash: string) => void;
  setProgress: (progress: AggregationProgressState) => void;
  setDiagnostics: (diagnostics: AggregationDiagnosticsState | null) => void;
  setGroupHeight: (groupId: string, height: number) => void;
  setActiveNavGroup: (groupId: string) => void;
  clearResult: () => void;
}
```

**How computation integrates:**

`useStatsAggregationWorker` stays at the App level where it already lives. It gains a thin sync layer that writes results to the zustand store:

```typescript
// In App.tsx, after existing useStatsAggregationWorker call:
const { result, aggregationProgress, aggregationDiagnostics } = useStatsAggregationWorker({ ... });

// Sync to store (replaces prop drilling to StatsView)
useEffect(() => {
  if (result) statsStore.setResult(result, currentInputsHash);
  statsStore.setProgress(aggregationProgress);
  statsStore.setDiagnostics(aggregationDiagnostics);
}, [result, aggregationProgress, aggregationDiagnostics]);
```

StatsView reads from the store instead of receiving aggregation results via props. On mount, if the store has a result, sections render immediately.

**What this replaces:**
- Prop drilling of aggregation result, progress, and diagnostics from App → AppLayout → StatsView
- `aggregationCache.ts` (LRU) — the store is the cache. The LRU was only used in the fallback (inline) computation path; the worker path already had its own result handling
- Sidebar active group state (currently internal to `StatsNavSidebar`, lost on unmount)

**What stays in StatsView:**
- `safeStats` normalization (defaulting nulls, formatting) — this is a view concern
- All section-specific hooks (useSkillCharts, useApmStats, etc.)
- StatsSharedContext provider
- `sectionVisibility` prop — still needed for embedded consumers (web report `reportApp.tsx`, `FightReportHistoryView`). `useLazyGroups` only replaces it in the main (non-embedded) stats path

**Why zustand over alternatives:** zustand is ~1KB gzipped, zero peer deps, and is the most widely adopted external store for React (15M+ weekly downloads). It provides `useSyncExternalStore` under the hood with a cleaner API. Alternatives considered: bare `useSyncExternalStore` + module-level state (viable but more boilerplate), jotai (atom-based, more complexity than needed for a single store).

### Layer 2: Group-Level Lazy Rendering

**What:** Only render the active nav group's sections. Other groups render as lightweight placeholder divs.

**How it works:**

Each of the 7 nav groups gets a render state:
- `mounted`: group's sections are real React components
- `placeholder`: group renders as a single `<div>` with estimated height

Group sizes: overview (7), commanders (5), squad-stats (4), roster (3), offense (6), defense (10), other (5). Total: ~41 sections.

On StatsView mount:
- Active nav group → `mounted` (3-10 sections render depending on group)
- All other groups → `placeholder` (6 lightweight divs)

On nav group switch:
- New group → `mounted` (sections render for the first time)
- Previous group stays `mounted` (already rendered, hidden via existing CSS)
- Groups accumulate: once visited, always mounted. This is an intentional trade-off — the benefit is fast initial mount and first few group switches. After visiting all groups, all sections are mounted (same as today). A future optimization could unmount groups after an idle timeout, but this is not in scope.

Mount cost: ~150-500ms for 3-10 sections (worst case: defense group at 10 sections) instead of ~1,800ms for all 41. The overview group (7 sections, typical first view) should be ~200-350ms.

**Integration with `sectionVisibility`:**

Currently, `StatsNavSidebar` pushes a visibility function up to `AppLayout` via `onSectionVisibilityChange`, which passes it to StatsView as the `sectionVisibility` prop. This function returns `true` for sections in the active nav group and `false` for all others.

With lazy groups, `useLazyGroups` consumes the sidebar's active group ID directly (from `store.activeNavGroup`). The `sectionVisibility` callback is no longer needed as the mount/unmount boundary — `useLazyGroups` replaces it. Within a mounted group, all sections render (the user's per-section show/hide settings are a separate concern handled inside each section).

**Placeholder sizing:**

Placeholder divs need reasonable heights to prevent layout jumps:
- `ResizeObserver` on each group container records actual height after first render
- Heights stored in zustand (`groupHeights`) — persist across mount/unmount
- First-ever mount uses a default (~400px per group)
- Subsequent mounts use the stored height

**Placeholder structure:**

```tsx
// Placeholder for an unmounted group
<div
  id={`group-${groupId}`}
  style={{ height: store.groupHeights[groupId] ?? 400 }}
  className="pointer-events-none"
/>
```

**Section-level mounting within a group:**

Within a mounted group, sections render based on `isSectionVisible` (user-configured visibility). This existing behavior is unchanged — it controls which sections the user has enabled/disabled, not viewport visibility.

### Layer 3: Normal Mount/Unmount + Framer Motion

**What:** StatsView mounts and unmounts normally, wrapped in AnimatePresence like every other view.

**AppLayout view rendering:**

```tsx
<AnimatePresence mode="wait">
  {view === 'dashboard' && (
    <motion.div key="dashboard" {...pageTransition}>
      {/* dashboard content */}
    </motion.div>
  )}
  {view === 'stats' && (
    <motion.div key="stats" {...pageTransition}>
      <StatsNavSidebar ... />
      <StatsErrorBoundary>
        <StatsView />
      </StatsErrorBoundary>
    </motion.div>
  )}
  {view === 'history' && (
    <motion.div key="history" {...pageTransition}>
      <FightReportHistoryView ... />
    </motion.div>
  )}
  {view === 'settings' && (
    <motion.div key="settings" {...pageTransition}>
      <SettingsView ... />
    </motion.div>
  )}
</AnimatePresence>
```

All views share the same `pageTransition` config (slide/fade, ~300ms, spring easing matching existing settings page entrance).

**Sidebar state persistence:** `StatsNavSidebar` currently holds its active group in local state, which is lost on unmount. With mount/unmount, the sidebar reads `activeNavGroup` from the zustand store, so the user returns to the same group they left.

**What gets deleted:**
- `statsViewMounted` state and its management in `useDevDatasets`
- `display: none` conditional styling in AppLayout
- `dissolveCompletedForLogKey` ref tracking — dissolve plays naturally on mount
- `sectionContentReady` / `requestIdle` deferred section enabling — group-level lazy rendering handles this
- `stats-view-fade-in` and `stats-view-entering` CSS animation classes — replaced by Framer Motion
- Settling state split (`aggregationSettling` vs `detailsProgress` for hidden/visible duality)
- `aggregationCache.ts` — the zustand store replaces it
- `sectionVisibility` callback plumbing from sidebar → AppLayout → StatsView

**Dissolve behavior simplifies to:**
- Mount with no store result → show loading/dissolve → computation finishes → sections appear
- Mount with store result → sections render immediately, Framer Motion entrance is the only transition
- New logs arrive while viewing stats → store updates → sections re-render (no dissolve)

### Screenshot & Image Generation Removal

The stats screenshot feature (tiled + share to Discord) is removed as part of this redesign. Screenshots were the only reason all sections ever needed to be in the DOM simultaneously — removing them eliminates the hardest constraint on lazy group rendering.

**What gets removed (~650-750 lines):**

| File | Change |
|------|--------|
| `src/renderer/stats/hooks/useStatsScreenshot.ts` (290 lines) | Delete entirely |
| `src/renderer/app/ScreenshotContainer.tsx` (117 lines) | Delete entirely |
| `src/main/handlers/discordHandlers.ts` | Remove screenshot IPC handlers (`send-screenshot`, `send-screenshots`, `send-screenshots-groups`, `send-stats-screenshot`) |
| `src/renderer/app/hooks/useUploadListeners.ts` (~130 lines) | Remove screenshot capture chain, `safeToPng`, `dataUrlToUint8Array`, `onRequestScreenshot` listener |
| `src/renderer/stats/ui/StatsHeader.tsx` (~50 lines) | Remove share button, `shareStage` state, `canShareDiscord` prop |
| `src/renderer/StatsView.tsx` (~20 lines) | Remove `useStatsScreenshot` hook usage, `handleShare`, `shareStage` props |
| `src/renderer/ExpandableLogCard.tsx` (~10 lines) | Remove `screenshotMode` prop, `log-screenshot-*` ID |
| `src/preload/index.ts` (6 lines) | Remove 5 screenshot IPC methods |
| `src/main/index.ts` | Remove `pendingDiscordLogs` map, `request-screenshot` IPC send |
| `src/renderer/index.css` (40 lines) | Remove `.stats-share-mode`, `.stats-share-exclude`, `.stats-share-table`, `.stats-share-tooltip` rules |
| 27 section component files | Remove `.stats-share-exclude` CSS class (one class per file) |

**Dependency removed:** `html-to-image` package.

**Note:** Discord webhook posting of text/embed summaries is unaffected — only the image capture and tiled screenshot system is removed. The `discord.ts` module and its text-based webhook formatting remain.

### Nav Scrolling

Placeholder divs keep group container IDs in the DOM. When the user clicks a section in the nav sidebar:

1. Sidebar switches the active nav group → `store.activeNavGroup` updates → triggers group mount
2. Group's sections render (fast — zustand has the data)
3. `scrollToSection(sectionId)` finds the element and scrolls

The existing `scrollToSection` in `StatsNavSidebar` already has a `requestAnimationFrame` retry mechanism (up to 10 attempts, ~167ms) for cases where the target element isn't in the DOM yet. With lazy group mounting, the newly-mounted group's sections need to render before `getElementById` can find them.

For most groups (3-7 sections), React renders within 1-2 frames — the existing retry is sufficient. For the defense group (10 sections), rendering may take 3-5 frames. The retry budget of 10 frames covers this comfortably. If profiling reveals edge cases where the retry is insufficient, `useLazyGroups` can expose an `onGroupMounted` callback, but this is unlikely to be needed.

## Files Changed

### New files
- `src/renderer/stats/statsStore.ts` — zustand store definition
- `src/renderer/stats/hooks/useLazyGroups.ts` — group mount/placeholder logic with ResizeObserver

### Modified files
- `src/renderer/app/AppLayout.tsx` — remove display:none, add AnimatePresence with pageTransition, remove `sectionVisibility` callback plumbing
- `src/renderer/StatsView.tsx` — read from store instead of props for aggregation result, render groups via useLazyGroups, remove dissolve/settling hacks, remove `useStatsScreenshot` usage
- `src/renderer/App.tsx` — add sync layer writing `useStatsAggregationWorker` results to zustand store
- `src/renderer/app/hooks/useDevDatasets.ts` — remove `statsViewMounted` state
- `src/renderer/stats/StatsNavSidebar.tsx` — read/write `activeNavGroup` from store instead of local state
- `src/renderer/stats/hooks/useStatsAggregationWorker.ts` — remove `aggregationCache` usage from fallback path (store replaces it)
- `src/renderer/stats/ui/StatsHeader.tsx` — remove share button, shareStage, canShareDiscord
- `src/renderer/ExpandableLogCard.tsx` — remove screenshotMode prop, log-screenshot ID
- `src/renderer/app/hooks/useUploadListeners.ts` — remove screenshot capture chain (~130 lines)
- `src/preload/index.ts` — remove 5 screenshot IPC methods
- `src/main/index.ts` — remove pendingDiscordLogs map, request-screenshot IPC
- `src/main/handlers/discordHandlers.ts` — remove screenshot IPC handlers
- `src/renderer/index.css` — remove `.stats-share-mode`, `.stats-share-exclude`, `.stats-share-table`, `.stats-share-tooltip` rules
- 27 section component files — remove `.stats-share-exclude` CSS class

### Deleted files
- `src/renderer/stats/aggregationCache.ts` — replaced by zustand store
- `src/renderer/stats/__tests__/aggregationCache.test.ts` — tests for deleted cache
- `src/renderer/stats/hooks/useStatsScreenshot.ts` — screenshot feature removed
- `src/renderer/app/ScreenshotContainer.tsx` — screenshot feature removed

## Testing

- **Unit tests:** zustand store (set/get/clear result, hash matching, group heights)
- **Unit tests:** `useLazyGroups` hook (mount active group, placeholder others, accumulate on switch)
- **Unit tests:** Store sync layer (writes worker results to store, no-ops when inputsHash unchanged)
- **Integration test:** StatsView mount with pre-populated store → sections render without delay
- **Manual test:** Tab switching with Framer Motion entrance/exit animations
- **Manual test:** Bulk upload → switch to stats → results available immediately
- **Verify:** No references to `html-to-image`, `toPng`, `screenshotMode`, `stats-share-exclude` remain in codebase
- **Verify:** Discord text/embed webhook posting still works (only image capture removed)
- **Regression:** Existing StatsView integration tests should pass with minimal changes (they test section rendering, not mount strategy)

## Migration Path

This is a clean swap — the external store replaces internal hook state, and lazy groups replace the display:none strategy. No feature flags or backwards compatibility needed. The screenshot removal touches some main process IPC handlers but is otherwise self-contained.

Dependencies to add: `zustand` (~1KB gzipped, zero peer deps).
Dependencies to remove: `html-to-image`.
