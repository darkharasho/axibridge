# Add Logs Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Add Logs modal from a vertical stack layout into a two-panel side-by-side layout where filters live in a fixed left panel and the file list gets full height.

**Architecture:** The modal splits into two flex children — a 260px left panel (search, presets, filter tabs, calendar/time pickers) and a flex-1 right panel (header, file list, footer). The `useFilePicker` hook gains `activePreset` state and a `handleApplyPreset` function. The `FilePickerModal` component is restructured but reuses all existing sub-components (FilePickerItem, calendar grid, time picker, range inputs).

**Tech Stack:** React, Tailwind CSS, Framer Motion, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-24-add-logs-modal-redesign.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/app/hooks/useFilePicker.ts` | Modify | Add `activePreset`, `dateFilteredCount`, `handleApplyPreset` |
| `src/renderer/app/FilePickerModal.tsx` | Rewrite | Two-panel layout, left filter panel, right file list |
| `src/renderer/index.css` | Modify | Add `.file-picker-preset-chip` active styles if needed |

---

### Task 1: Add preset and filter count state to useFilePicker

**Files:**
- Modify: `src/renderer/app/hooks/useFilePicker.ts`

- [ ] **Step 1: Add `activePreset` state**

After line 35 (`selectBetweenOpen` state), add:

```typescript
const [activePreset, setActivePreset] = useState<string | null>(null);
```

- [ ] **Step 2: Add `handleApplyPreset` function**

After the `ensureMonthWindowForSince` function (after line 135), add a new function that computes date ranges for presets and auto-selects matching files:

```typescript
const handleApplyPreset = (preset: string | null) => {
    if (!preset || preset === activePreset) {
        // Deactivate
        setActivePreset(null);
        setFilePickerSelected(new Set());
        return;
    }
    // Clear any active calendar filter
    setSelectDayOpen(false);
    setSelectSinceOpen(false);
    setSelectBetweenOpen(false);
    setActivePreset(preset);

    const now = new Date();
    let startMs: number;

    switch (preset) {
        case 'Today':
            startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            break;
        case 'Yesterday': {
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            startMs = yesterday.getTime();
            // For Yesterday, also set an end time (end of yesterday)
            const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
            ensureMonthWindowForSince(startMs);
            const matching = filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs);
            setFilePickerSelected(new Set(matching.map((entry) => entry.path)));
            return;
        }
        case 'Last 3 days':
            startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getTime();
            break;
        case 'This week': {
            const dayOfWeek = now.getDay(); // Sunday = 0
            startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
            break;
        }
        default:
            return;
    }

    ensureMonthWindowForSince(startMs);
    const matching = filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs);
    setFilePickerSelected(new Set(matching.map((entry) => entry.path)));
};
```

- [ ] **Step 3: Add `dateFilteredCount` computed value**

After the `filePickerHasMore` memo (after line 123), add a memo that computes the count of files matching the current active date filter. **Important:** This uses `filePickerAll` (not `filePickerAvailable`) to match what the selection functions use — `handleApplyPreset` and `handleApplyDateFilters` both filter against `filePickerAll`. Using `filePickerAvailable` would cause count/selection mismatches when `ensureMonthWindowForSince` widens the month window.

```typescript
const dateFilteredCount = useMemo(() => {
    if (activePreset) {
        const now = new Date();
        let startMs: number;
        let endMs = Infinity;

        switch (activePreset) {
            case 'Today':
                startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                break;
            case 'Yesterday': {
                const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                startMs = yesterday.getTime();
                endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 1;
                break;
            }
            case 'Last 3 days':
                startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getTime();
                break;
            case 'This week': {
                const dayOfWeek = now.getDay();
                startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
                break;
            }
            default:
                return 0;
        }
        return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs).length;
    }

    if (selectDayOpen && selectDayDate) {
        const dayStart = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 0, 0, 0, 0).getTime();
        const dayEnd = new Date(selectDayDate.getFullYear(), selectDayDate.getMonth(), selectDayDate.getDate(), 23, 59, 59, 999).getTime();
        return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= dayStart && entry.mtimeMs <= dayEnd).length;
    }

    if (selectSinceOpen && selectSinceDate) {
        const base = new Date(selectSinceDate.getFullYear(), selectSinceDate.getMonth(), selectSinceDate.getDate());
        let hour24 = selectSinceHour % 12;
        if (selectSinceMeridiem === 'PM') hour24 += 12;
        base.setHours(hour24, selectSinceMinute, 0, 0);
        const sinceMs = base.getTime();
        return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= sinceMs).length;
    }

    if (selectBetweenOpen && selectBetweenStart && selectBetweenEnd) {
        const rawStartMs = new Date(selectBetweenStart).getTime();
        const rawEndMs = new Date(selectBetweenEnd).getTime();
        const startMs = Math.min(rawStartMs, rawEndMs);
        const endMs = Math.max(rawStartMs, rawEndMs);
        return filePickerAll.filter((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs >= startMs && entry.mtimeMs <= endMs).length;
    }

    return 0;
}, [activePreset, selectDayOpen, selectDayDate, selectSinceOpen, selectSinceDate, selectSinceHour, selectSinceMinute, selectSinceMeridiem, selectBetweenOpen, selectBetweenStart, selectBetweenEnd, filePickerAll]);
```

- [ ] **Step 4: Export new state from the return object**

Add these to the return object:

```typescript
activePreset,
setActivePreset,
handleApplyPreset,
dateFilteredCount,
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors (existing ones may be present)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/app/hooks/useFilePicker.ts
git commit -m "feat(file-picker): add preset state and dateFilteredCount to useFilePicker"
```

---

### Task 2: Rewrite FilePickerModal as Two-Panel Layout

**Files:**
- Modify: `src/renderer/app/FilePickerModal.tsx`

This task is a full rewrite of the modal's rendered JSX. The old vertical-stack layout (header, toolbar, inline filter panel, file list, footer) is replaced entirely with a two-panel horizontal layout. All old JSX from the `<motion.div className="app-modal-card ...">` down to its closing tag is deleted and rebuilt. The `<div className="relative z-10 flex min-h-0 flex-1 flex-col">` wrapper (line 314) is also removed — it would break the `flex-row` layout.

**Important:** Do NOT commit between building the left and right panels — the component must be complete before it compiles. The commit happens at the end of this task after both panels are built.

- [ ] **Step 1: Update imports and destructuring**

At the top of the `FilePickerModal` function (line 85-134):
- Add `activePreset`, `setActivePreset`, `handleApplyPreset`, `dateFilteredCount` to the destructured `ctx`
- Remove the `selectModeMenuOpen` local state (line 136) and `activeSelectMode` derived value (line 137) — these are replaced by segmented tabs

- [ ] **Step 2: Update `handleClose` to clear preset state**

In the `handleClose` function (line 281-290), remove `setSelectModeMenuOpen(false)` and add `setActivePreset(null)`:

```typescript
const handleClose = () => {
    setFilePickerOpen(false);
    setFilePickerError(null);
    setFilePickerSelected(new Set());
    setSelectDayOpen(false);
    setSelectSinceOpen(false);
    setSelectBetweenOpen(false);
    setActivePreset(null);
    setFocusedIndex(null);
};
```

- [ ] **Step 3: Add helper for segmented tab clicks**

After `handleClose`, add a handler for the segmented filter mode tabs that clears preset and sets the correct filter mode:

```typescript
const handleFilterTabClick = (mode: 'Day' | 'Since' | 'Between') => {
    const isActive = (mode === 'Day' && selectDayOpen) ||
                     (mode === 'Since' && selectSinceOpen) ||
                     (mode === 'Between' && selectBetweenOpen);

    if (isActive) {
        // Deactivate
        setSelectDayOpen(false);
        setSelectSinceOpen(false);
        setSelectBetweenOpen(false);
        setFilePickerSelected(new Set());
        return;
    }

    // Clear preset
    setActivePreset(null);
    setFilePickerSelected(new Set());

    // Activate the selected mode
    setSelectDayOpen(mode === 'Day');
    setSelectSinceOpen(mode === 'Since');
    setSelectBetweenOpen(mode === 'Between');

    // Set default dates if empty (same logic as current dropdown handler)
    const now = new Date();
    if (mode === 'Day' && !selectDayDate) {
        setSelectDayDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    }
    if (mode === 'Since' && !selectSinceDate) {
        setSelectSinceDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
        const hour24 = now.getHours();
        setSelectSinceMeridiem(hour24 >= 12 ? 'PM' : 'AM');
        setSelectSinceHour(hour24 % 12 || 12);
        setSelectSinceMinute(now.getMinutes());
    }
    if (mode === 'Between' && !selectBetweenEnd) {
        const isoLocal = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setSelectBetweenEnd(isoLocal);
        const start = new Date(now.getTime() - (2 * 60 * 60 * 1000));
        const startIsoLocal = new Date(start.getTime() - (start.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setSelectBetweenStart(startIsoLocal);
    }
};
```

- [ ] **Step 4: Add helper for filter summary text**

Add a function that produces the left panel footer summary string:

```typescript
const getFilterSummaryText = (): string => {
    if (activePreset) return activePreset;
    if (selectDayOpen && selectDayDate) {
        return selectDayDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    }
    if (selectSinceOpen && selectSinceDate) {
        const hour = selectSinceHour.toString().padStart(2, '0');
        const min = selectSinceMinute.toString().padStart(2, '0');
        return `Since ${selectSinceDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${hour}:${min} ${selectSinceMeridiem}`;
    }
    if (selectBetweenOpen && selectBetweenStart && selectBetweenEnd) {
        const s = new Date(selectBetweenStart);
        const e = new Date(selectBetweenEnd);
        const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `${fmt(s)} – ${fmt(e)}`;
    }
    return '';
};
```

- [ ] **Step 5: Rewrite the modal shell to two-panel layout**

Replace the entire rendered JSX starting from the `<motion.div className="app-modal-card ...">` (line 305) through the closing `</motion.div>` with the new two-panel structure.

The outer card becomes:
```tsx
<motion.div
    className="app-modal-card file-picker-card relative isolate w-full max-w-[1100px] max-h-[92vh] flex flex-row rounded-[4px] overflow-hidden"
    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    initial={{ opacity: 0, y: 20, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 20, scale: 0.98 }}
    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
>
    {/* Left Panel */}
    <div className="w-[260px] min-w-[260px] flex flex-col overflow-y-auto border-r" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-card)' }}>
        {/* ... left panel content (steps 6-9) */}
    </div>

    {/* Right Panel */}
    <div className="flex-1 flex flex-col min-w-0">
        {/* ... right panel content (Task 3) */}
    </div>
</motion.div>
```

- [ ] **Step 6: Build left panel — Search box**

Inside the left panel div, add:

```tsx
{/* Search */}
<div className="p-3 pb-0">
    <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
            type="text"
            value={filePickerFilter}
            onChange={(event) => setFilePickerFilter(event.target.value)}
            placeholder="Search..."
            className="file-picker-panel w-full rounded-[4px] pl-8 pr-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}
        />
    </div>
</div>
```

- [ ] **Step 7: Build left panel — Quick preset chips**

Below search, add:

```tsx
{/* Quick Presets */}
<div className="px-3 pt-2.5 flex flex-wrap gap-1.5">
    {['Today', 'Yesterday', 'Last 3 days', 'This week'].map((preset) => (
        <button
            key={preset}
            onClick={() => handleApplyPreset(preset)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                activePreset === preset
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
            }`}
        >
            {preset}
        </button>
    ))}
</div>
```

- [ ] **Step 8: Build left panel — Segmented filter tabs**

Below presets, add:

```tsx
{/* Filter Mode Tabs */}
<div className="px-3 pt-3">
    <div className="flex rounded-[4px] overflow-hidden" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)' }}>
        {(['Day', 'Since', 'Range'] as const).map((mode) => {
            const modeKey = mode === 'Range' ? 'Between' : mode;
            const isActive = (modeKey === 'Day' && selectDayOpen) ||
                             (modeKey === 'Since' && selectSinceOpen) ||
                             (modeKey === 'Between' && selectBetweenOpen);
            return (
                <button
                    key={mode}
                    onClick={() => handleFilterTabClick(modeKey as 'Day' | 'Since' | 'Between')}
                    className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                        isActive
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    }`}
                >
                    {mode}
                </button>
            );
        })}
    </div>
</div>
```

- [ ] **Step 9: Build left panel — Filter content area**

Below tabs, add the filter content area. The outer wrapper uses `AnimatePresence mode="wait"` for crossfade transitions. Each mode is wrapped in a `motion.div` with opacity animation only (no height animation — the panel is fixed layout).

The content for each mode is copied from the current JSX with these specific changes:

**Day mode** (copy current lines 470-579 with these changes):
1. Remove `max-w-sm mx-auto` from the calendar panel div (it needs to fill the 260px panel width)
2. Remove `min-w-[280px]` if present
3. **Change the day button `onClick`** from `() => setSelectDayDate(new Date(year, month, day))` to inline the filter logic directly (avoids React 18 batching issue where `handleApplyDateFilters` would read stale state):
   ```tsx
   onClick={() => {
       setSelectDayDate(new Date(year, month, day));
       const dayStart = new Date(year, month, day, 0, 0, 0, 0).getTime();
       const dayEnd = new Date(year, month, day, 23, 59, 59, 999).getTime();
       ensureMonthWindowForSince(dayStart);
       const matching = filePickerAll.filter((e: any) =>
           Number.isFinite(e.mtimeMs) && e.mtimeMs >= dayStart && e.mtimeMs <= dayEnd
       );
       setFilePickerSelected(new Set(matching.map((e: any) => e.path)));
   }}
   ```
4. **Delete** the entire "Select Matching Files" button div at the bottom (lines 571-578)

**Since mode** (copy current lines 581-749 with these changes):
1. Change the outer flex container from `flex items-stretch gap-4 flex-wrap` to `flex flex-col gap-3` (stack vertically instead of side-by-side)
2. Remove `min-w-[280px]` from both the calendar panel and the time picker panel
3. Keep the "Select Matching Files" button but rename its text to "Select Since" and keep `onClick={handleApplyDateFilters}`

**Range mode** (copy current lines 751-786 with these changes):
1. Change the flex container from `flex items-stretch gap-4 flex-wrap` to `flex flex-col gap-3`
2. Remove `min-w-[200px]` from both input panels
3. Rename button text from "Select Matching Files" to "Select Range"

**Empty state** (new):
```tsx
{!selectDayOpen && !selectSinceOpen && !selectBetweenOpen && !activePreset && (
    <div className="flex items-center justify-center h-24 text-xs text-gray-500 text-center px-2">
        Select a filter mode or use a quick preset above.
    </div>
)}
```

The full wrapper structure:
```tsx
{/* Filter Content */}
<div className="flex-1 overflow-y-auto px-3 pt-3 min-h-0">
    <AnimatePresence mode="wait">
        {selectDayOpen && (
            <motion.div key="day" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {/* Day mode calendar JSX with changes described above */}
            </motion.div>
        )}
        {selectSinceOpen && (
            <motion.div key="since" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {/* Since mode calendar + time picker JSX with changes described above */}
            </motion.div>
        )}
        {selectBetweenOpen && (
            <motion.div key="between" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {/* Range mode inputs JSX with changes described above */}
            </motion.div>
        )}
    </AnimatePresence>
    {/* Empty state */}
</div>
```

- [ ] **Step 10: Build left panel — Panel footer (filter summary)**

At the bottom of the left panel (after filter content, still inside the left panel div):

```tsx
{/* Left Panel Footer — filter summary */}
{(activePreset || selectDayOpen || selectSinceOpen || selectBetweenOpen) && dateFilteredCount > 0 && (
    <div className="flex-none p-3 border-t" style={{ borderColor: 'var(--border-default)' }}>
        <div className="text-[10px] text-gray-400 mb-2">
            {getFilterSummaryText()} · <span className="text-cyan-300">{dateFilteredCount} log{dateFilteredCount === 1 ? '' : 's'} found</span>
        </div>
        <button
            onClick={() => {
                if (filePickerSelected.size >= dateFilteredCount && dateFilteredCount > 0) {
                    setFilePickerSelected(new Set());
                } else {
                    // Re-apply the current filter to select all matching
                    if (activePreset) {
                        handleApplyPreset(activePreset);
                    } else {
                        handleApplyDateFilters();
                    }
                }
            }}
            className="w-full py-1.5 rounded-[4px] text-[11px] font-medium border transition-colors bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/25"
        >
            {filePickerSelected.size >= dateFilteredCount && dateFilteredCount > 0
                ? 'Deselect All'
                : `Select All ${dateFilteredCount}`}
        </button>
    </div>
)}
```

- [ ] **Step 11: Build right panel — Header**

Inside the right panel div, add a compact header replacing the old header + toolbar:

```tsx
{/* Right Panel Header */}
<div className="flex-none px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <FileText className="w-4 h-4 text-cyan-400" />
        Add Logs
    </h3>
    <div className="flex items-center gap-1.5">
        <button
            onClick={() => loadLogFiles(logDirectory)}
            className="p-1.5 rounded-[4px] text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            style={{ border: '1px solid var(--border-subtle)' }}
            title="Refresh"
        >
            <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
            onClick={handleClose}
            className="p-1.5 rounded-[4px] text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            style={{ border: '1px solid var(--border-subtle)' }}
            aria-label="Close log picker"
        >
            <X className="w-3.5 h-3.5" />
        </button>
    </div>
</div>
```

- [ ] **Step 12: Build right panel — Column headers**

Same as current but scoped to right panel:

```tsx
{/* Column Headers */}
{!filePickerLoading && filteredAvailable.length > 0 && (
    <div className="flex-none px-4 py-2 bg-black/40 border-b border-white/5 grid grid-cols-[minmax(0,3.2fr)_minmax(140px,1.1fr)_86px] gap-4 text-[11px] uppercase tracking-[0.24em] text-gray-500 font-semibold">
        <div>Name</div>
        <div>Modified</div>
        <div className="text-right">Size</div>
    </div>
)}
```

- [ ] **Step 13: Build right panel — File list**

Same as current file list (lines 802-854) but with adjusted padding:

```tsx
{/* File List */}
<div className="file-picker-panel min-h-[140px] flex-1 overflow-hidden flex flex-col relative mx-3 my-3 rounded-[4px]" style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}>
    {/* Loading, empty, and list states — identical to current (lines 804-853) */}
</div>
```

Keep all FilePickerItem rendering, scroll handler, and "Load older logs" button exactly as-is.

- [ ] **Step 14: Build right panel — Footer**

Simplified footer without keyboard hints:

```tsx
{/* Footer */}
<div className="flex-none px-4 py-3 border-t border-white/5 bg-black/30">
    {filePickerError && (
        <div className="text-xs text-rose-400 mb-3 font-medium px-2.5 py-1.5 bg-rose-500/10 rounded-[4px] border border-rose-500/20">{filePickerError}</div>
    )}
    <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
            <div className="text-xs text-gray-300">
                {filePickerSelected.size > 0
                    ? `${filePickerSelected.size} log${filePickerSelected.size === 1 ? '' : 's'} selected`
                    : `${filteredAvailable.length} log${filteredAvailable.length === 1 ? '' : 's'} available`}
            </div>
            {filePickerSelected.size > 0 && (
                <button
                    onClick={() => setFilePickerSelected(new Set())}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                >
                    Clear
                </button>
            )}
        </div>
        <div className="flex items-center gap-2">
            <button
                onClick={handleClose}
                className="px-4 py-2 rounded-[4px] text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={() => {
                    if (filePickerSelected.size > 0) handleAddSelectedFiles();
                }}
                disabled={filePickerSelected.size === 0}
                className="px-4 py-2 rounded-[4px] text-xs font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
                Add to Recent Activity
                {filePickerSelected.size > 0 && (
                    <span className="bg-emerald-500/30 text-emerald-100 px-1.5 py-0.5 rounded-lg text-[10px]">
                        {filePickerSelected.size}
                    </span>
                )}
            </button>
        </div>
    </div>
</div>
```

- [ ] **Step 15: Remove unused imports**

Remove `ChevronDown` and `CalendarRange` from the lucide-react import (the dropdown menu is gone). Keep `ChevronLeft`, `ChevronRight`, `FileText`, `RefreshCw`, `Search`, `X`.

- [ ] **Step 16: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 17: Commit**

```bash
git add src/renderer/app/FilePickerModal.tsx
git commit -m "feat(file-picker): rewrite modal as two-panel layout with filter sidebar"
```

---

### Task 3: Visual Verification & Polish

**Files:**
- Modify: `src/renderer/app/FilePickerModal.tsx` (minor tweaks)
- Modify: `src/renderer/index.css` (if needed)

- [ ] **Step 1: Run dev server and open modal**

Run: `npm run dev`

Open the app, click "Add Logs" and visually verify:
- Two-panel layout renders correctly
- Left panel: search, presets, filter tabs all visible
- Right panel: file list takes full height
- No overflow/clipping issues

- [ ] **Step 2: Test quick presets**

Click each preset chip (Today, Yesterday, Last 3 days, This week):
- Matching files get selected
- Panel footer shows summary with correct count
- Clicking active preset deactivates and clears selection
- Switching between presets works

- [ ] **Step 3: Test Day filter**

Click "Day" tab → click a day in calendar:
- Files for that day are auto-selected (no separate apply button needed)
- Panel footer shows "March 24 · N logs found"
- Switching to a preset clears the Day filter
- Switching back to Day remembers the previously selected date

- [ ] **Step 4: Test Since filter**

Click "Since" tab → pick date + time → click "Select Since":
- Files are selected
- Calendar and time picker render properly in the 260px-wide panel

- [ ] **Step 5: Test Range filter**

Click "Range" tab → set start/end → click "Select Range":
- Files are selected
- datetime-local inputs stack vertically and render properly

- [ ] **Step 6: Test search + filter stacking**

Apply a date filter, then type in search box:
- Both compose correctly
- Search text persists when switching filters

- [ ] **Step 7: Test keyboard navigation**

- Arrow keys navigate the file list
- Space toggles selection
- Enter confirms
- Escape closes modal
- Typing in search box doesn't interfere with arrow keys

- [ ] **Step 8: Fix any visual issues found**

Adjust padding, font sizes, or spacing as needed to make the layout feel right within the 260px left panel.

- [ ] **Step 9: Run validate**

Run: `npm run validate`
Expected: No new errors

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "fix(file-picker): polish two-panel layout and fix visual issues"
```

---

### Task 4: Final Validation

- [ ] **Step 1: Run full unit test suite**

Run: `npm run test:unit`
Expected: All tests pass (no file picker tests exist, but ensure nothing was broken)

- [ ] **Step 2: Run validate**

Run: `npm run validate`
Expected: Clean

- [ ] **Step 3: Commit any remaining fixes**

If any fixes were needed, commit them.
