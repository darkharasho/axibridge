# Fix Re-render Cascade to Re-enable Recharts Animations

## Problem

The unified theme refactor introduced `colorPalette` and `glassSurfaces` as separate state in `useSettings`. These values flow through the component tree without memoization boundaries, causing excessive re-renders that interrupt recharts animations mid-draw (corrupting SVG state). As a workaround, `ChartContainer` force-disables all recharts animations via a `disableAnimations` wrapper that sets `isAnimationActive = false` on every chart series element.

### Re-render cascade path

```
setColorPalette() called
  -> useSettings hook state changes
  -> App re-renders (hook state changed)
  -> appLayoutCtx object recreated (inline literal, new reference)
  -> AppLayout re-renders (new ctx prop)
  -> StatsView re-renders (not memoized, parent re-rendered)
  -> All section components re-render
  -> recharts animation frame interrupted -> SVG state corrupts -> blank charts
```

## Approach: Full Pipeline Stabilization (Approach B)

Add memoization boundaries at every level of the render pipeline, then remove the animation workaround.

## Changes

### 1. Stabilize `useSettings` return object

**File:** `src/renderer/app/hooks/useSettings.ts`

Wrap the return object (line 116) in `useMemo`. Dependency array includes all state values; `useState` setters are omitted (stable by React guarantee). `handleUpdateSettings` and `handleSelectDirectory` are already `useCallback`-wrapped.

This ensures the return object reference stays stable when App re-renders for unrelated reasons (e.g. new log arriving), while still producing a new reference when any settings value actually changes.

### 2. Stabilize context objects in App.tsx

**File:** `src/renderer/App.tsx`

Wrap three inline object literals in `useMemo`:
- `appLayoutCtx` (line 920) — the massive context bag passed to AppLayout
- `devDatasetsCtx` (line 914) — passed to DevDatasetsModal
- `filePickerCtx` (line 917) — passed to FilePickerModal

Dependency arrays include the constituent values of each object. This prevents AppLayout, DevDatasetsModal, and FilePickerModal from re-rendering when App re-renders but their relevant values haven't changed.

### 3. React.memo on StatsView + stabilize its props

**File:** `src/renderer/StatsView.tsx`

Wrap the `StatsView` export with `React.memo`. This is the critical memoization boundary. StatsView does NOT receive `colorPalette` or `glassSurfaces` as props — theme is applied via CSS classes on `document.body` — so memo comparison correctly skips re-renders on theme changes.

**File:** `src/renderer/app/AppLayout.tsx`

Stabilize three unstable props passed to StatsView (lines 327-342):

| Prop | Problem | Fix |
|------|---------|-----|
| `onBack={() => setView('dashboard')}` | Inline arrow, new ref every render | `useCallback` in AppLayout |
| `onStatsViewSettingsChange={(next) => { ... }}` | Inline arrow with side effect | `useCallback` in AppLayout |
| `aggregationResult={{ stats, skillUsageData, ... }}` | Inline object literal | `useMemo` in AppLayout |

### 4. Memoize inline style objects in StatsView

**File:** `src/renderer/StatsView.tsx`

Wrap `scrollContainerStyle` and `resolvedScrollContainerStyle` (lines 3768-3779) in `useMemo`, keyed on `embedded` and `dissolveActive`. Both values rarely change mid-lifecycle, keeping these stable during normal rendering.

Other inline styles in StatsView (progress bars, dissolve particles) are not worth memoizing — they're either primitives, inside conditional/transient blocks, or don't propagate to chart components.

### 5. Remove `disableAnimations` from ChartContainer

**File:** `src/renderer/stats/ui/ChartContainer.tsx`

Remove the `disableAnimations` function and the `cloneElement` wrapper entirely. `ChartContainer` becomes a thin `ResponsiveContainer` wrapper that passes children through unmodified.

Each section already controls its own `isAnimationActive`. With the re-render cascade fixed, these per-section settings take effect:

| Section | `isAnimationActive` | Reasoning |
|---------|-------------------|-----------|
| SkillUsageSection `<Line>` | `selectedPlayers.length <= 16` | Line draw-in for reasonable player counts; disabled for large sets |
| BoonTimelineSection `<Bar>` | `false` (explicit) | Stacked bar animation is disorienting for dense timeline data |
| SpikeDamageSection `<Line>` markers | `false` (explicit) | Invisible connector lines with dot markers — nothing to animate |

No per-section animation settings need to change.

## Files touched

| File | Change |
|------|--------|
| `src/renderer/app/hooks/useSettings.ts` | `useMemo` wrap return object |
| `src/renderer/App.tsx` | `useMemo` wrap `appLayoutCtx`, `devDatasetsCtx`, `filePickerCtx` |
| `src/renderer/StatsView.tsx` | `React.memo` wrap export, `useMemo` two inline style objects |
| `src/renderer/app/AppLayout.tsx` | `useCallback` for `onBack` and `onStatsViewSettingsChange`, `useMemo` for `aggregationResult` |
| `src/renderer/stats/ui/ChartContainer.tsx` | Remove `disableAnimations`, simplify to passthrough |

## Verification

1. **Render count check:** Use React DevTools Profiler to confirm StatsView does not re-render when switching color palette in Settings.
2. **Animation check:** Navigate to Stats view with logs loaded. SkillUsageSection line charts should animate on initial render and when switching players (when <= 16 selected).
3. **No regressions:** All existing recharts sections (BoonTimeline bars, SpikeDamage markers) should render correctly with their explicit `isAnimationActive={false}`.
4. **Run existing tests:** `npm run test:unit` and `npm run validate` must pass.

## Out of scope

- `React.memo` on section components (SkillUsageSection, BoonTimelineSection, etc.) — not needed since the StatsView boundary prevents the cascade from reaching them.
- ThemeContext extraction — unnecessary since theme is CSS-class-based and no component reads `colorPalette`/`glassSurfaces` for rendering.
- Memoizing dissolve particle styles or progress bar styles — transient/ephemeral, don't affect chart stability.
