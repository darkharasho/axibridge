# Add Logs Modal Redesign — Side Panel Layout

**Date:** 2026-03-24
**Status:** Approved
**Files affected:** `src/renderer/app/FilePickerModal.tsx`, `src/renderer/app/hooks/useFilePicker.ts`, `src/renderer/index.css`

## Problem

The current Add Logs modal uses a vertical stack layout where date filter panels (calendar, time picker) expand inline between the toolbar and file list, pushing the file list down. With a filter active, only 2-3 file rows remain visible within the `max-h-[92vh]` constraint.

## Solution

Restructure the modal into a two-panel side-by-side layout. Filters live in a fixed-width left panel; the file list occupies the full height of the right panel. Filters never compete with the file list for vertical space.

## Layout

### Modal Shell

- Width: `max-w-[1100px]` (up from `max-w-4xl` / 896px)
- Height: `max-h-[92vh]` (unchanged)
- Border radius, shadow, backdrop: unchanged
- Internal layout: `display: flex; flex-direction: row`
- Responsive fallback: not needed. This is an Electron desktop app with a minimum practical window size well above 700px. If implemented later, a simple approach would be hiding the left panel behind a toggle button.

### Left Panel (~260px fixed)

Separated from right panel by `1px solid var(--border-default)` vertical border. Has its own vertical scroll if content overflows.

Top to bottom:

1. **Search box** — Full width. Same styling as current (icon left, placeholder "Search..."). Moves from the toolbar into this panel.

2. **Quick preset chips** — Flex-wrap row of pill-shaped buttons:
   - Options: Today, Yesterday, Last 3 days, This week
   - Click: computes date range for the preset, calls `ensureMonthWindowForSince` if needed to widen the month window (e.g. "Last 3 days" near a month boundary), then auto-selects all matching files via `setFilePickerSelected`. Non-matching files remain visible in the list but unselected (same behavior as current Day/Since/Range "Select Matching" — presets do NOT hide non-matching files).
   - Active preset gets cyan highlight (`bg-cyan-500/20 text-cyan-200 border-cyan-500/40`). Click active preset again to deactivate (clears selection).
   - Mutually exclusive with Day/Since/Range filters — activating a preset clears any active calendar filter and selection, and vice versa.

3. **Filter mode tabs** — Segmented control replacing the current dropdown menu:
   - Three segments: Day | Since | Range
   - Styled as a connected row of buttons with shared border/background
   - Active tab: cyan fill. Click active tab to deactivate.
   - Activating a tab clears any active quick preset.

4. **Filter content area** — Fills remaining panel height below tabs:
   - **Day mode:** Calendar grid matching current implementation (month/year nav, 7-column day grid, year/month popup). Clicking a day sets `selectDayDate` and immediately calls `handleApplyDateFilters` to auto-select matching files — the separate "Select Matching Files" button is removed since the action is unambiguous with a single click.
   - **Since mode:** Calendar grid + time picker below it (hour 1-12, minute 0-59, AM/PM — same 3-column scrollable lists as current). "Select Since" apply button at bottom calls `handleApplyDateFilters`.
   - **Range mode:** Two `datetime-local` inputs stacked vertically (Start / End) with "Select Range" apply button calling `handleApplyDateFilters`.
   - **No filter active:** Gentle empty state text: "Select a filter mode or use a quick preset above."

5. **Panel footer** (fixed at bottom of left panel, visible when any date filter or quick preset is active — not triggered by search alone):
   - Summary line format varies by mode:
     - Day: "March 24 · 12 logs found"
     - Since: "Since Mar 24 2:30 PM · 8 logs found"
     - Range: "Mar 22 – Mar 24 · 15 logs found"
     - Preset: "Last 3 days · 23 logs found"
   - Count reflects date-filtered matches from `filePickerAll` (consistent with what `handleApplyPreset` and `handleApplyDateFilters` use for selection)
   - "Select All N" button (full width) — sets `filePickerSelected` to all date-matching files. If all are already selected, button text changes to "Deselect All" and clears selection.

### Right Panel (flex remaining ~840px)

Full-height column layout:

1. **Header row** — Single compact line:
   - Left: "Add Logs" title with FileText icon
   - Right: Refresh button + Close (X) button
   - Subtitle and "Recent Activity" eyebrow label removed to save space

2. **Column headers** — Sticky. Same 3-column grid as current: `grid-cols-[minmax(0,3.2fr)_minmax(140px,1.1fr)_86px]` (Name | Modified | Size)

3. **File list** — Scrollable, fills all remaining vertical space between header and footer:
   - Same `FilePickerItem` component (checkbox, filename, encounter badge, timestamp, size)
   - Same keyboard navigation (arrow keys, Space, Enter, Escape)
   - Same shift-click range selection
   - "Load older logs" button at bottom when `filePickerAtBottom && filePickerHasMore` (preserves current scroll-detection behavior)

4. **Footer** — Fixed at bottom:
   - Left: Selection counter ("2 of 12 logs selected" or "47 logs available")
   - Left: Clear Selection button (visible when selection > 0)
   - Right: Cancel + "Add to Recent Activity" primary button with count badge
   - Error display (rose/red) stays here
   - Keyboard shortcuts hint removed (discoverable enough)

## Behavior

### Filter application
- Quick presets and Day mode: instant apply — click immediately auto-selects matching files
- Since mode and Range mode: require explicit apply button (multiple inputs to configure)
- Switching between any filter mode or preset clears the current selection but preserves configured date values (e.g. switching Day→Since→Day remembers the previously selected day). This matches current behavior.
- Deactivating a filter tab (clicking the active tab) clears selection and hides the filter content, but preserves the configured date values for that mode

### Search + filter stacking
- Search is independent of date filters — they compose. Picking "Today" + typing "wvw" shows only today's WvW logs.
- Search text persists when switching filter modes

### Selection persistence
- Changing a filter clears selection (matches current behavior)
- Manual row selections persist across search changes but clear on filter changes

### Animation
- Modal enter/exit: same spring animation as current
- Filter content area: crossfade when switching between Day/Since/Range (no height animation — panel is fixed layout)
- Bulk upload: same AnimatePresence bypass as current

## What stays the same

- `FilePickerItem` component — unchanged
- `useFilePicker` hook — all state/logic preserved, no new state needed beyond quick preset tracking
- Keyboard navigation behavior
- Shift-click range selection
- Month-window pagination and "Load older logs"
- Error handling in footer
- All filter matching logic (day matching, since matching, range matching) — `handleApplyDateFilters` is unchanged; Day mode just calls it automatically on day click instead of requiring a separate button
- Framer Motion bulk-upload bypass

## What changes

| Aspect | Before | After |
|--------|--------|-------|
| Modal width | `max-w-4xl` (896px) | `max-w-[1100px]` |
| Layout | Vertical stack | Two-panel horizontal split |
| Filter panel | Inline expandable, pushes file list down | Fixed left panel, never affects file list |
| Filter mode selector | Dropdown menu | Segmented control tabs |
| Quick presets | None | Today, Yesterday, Last 3 days, This week |
| Search location | Toolbar (right panel area) | Left panel (top) |
| Subtitle text | Present | Removed |
| Keyboard shortcuts hint | In footer | Removed |
| Apply button (Day mode) | Separate button | Implicit on day click |
| Filter mode selector state | `selectModeMenuOpen` local state for dropdown | Removed — segmented tabs need no popup state |
| Toolbar section | Dedicated toolbar div between header and filter panel | Eliminated — search moves to left panel, Refresh/Close move to right header |
| Search placeholder | "Search by file name..." | "Search..." |

## New state

- `activePreset: string | null` — tracks which quick preset is active (Today, Yesterday, Last 3 days, This week, or null). Added to `useFilePicker`.
- `dateFilteredCount: number` — count of files matching the active date filter (before search narrowing), used for the left panel footer summary. Computed in `useFilePicker`.
- `selectModeMenuOpen` local state in FilePickerModal is removed (dropdown replaced by segmented tabs).
- All existing state variables (`selectDayOpen`, `selectSinceOpen`, `selectBetweenOpen`, `selectDayDate`, `selectSinceDate`, etc.) are preserved and continue to work as before.
