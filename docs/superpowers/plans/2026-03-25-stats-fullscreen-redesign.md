# Stats Fullscreen & Dense Table UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual refresh of both fullscreen patterns (chart+drilldown and dense table) to match the app's current design language — no functional changes.

**Architecture:** Two independent pattern refreshes. Pattern A touches one file (HealEffectivenessSection). Pattern B touches shared CSS + DenseStatsTable component + 13 section files' expanded toolbar markup. All changes are CSS class / className string edits.

**Tech Stack:** React, Tailwind CSS utility classes, CSS custom properties (design tokens from `index.css`)

**Spec:** `docs/superpowers/specs/2026-03-25-stats-fullscreen-redesign.md`

---

### Task 1: Dense Table CSS — Header, Row Padding, Active Column

**Files:**
- Modify: `src/renderer/index.css` (dense-table rules, ~line 566-770)

- [ ] **Step 1: Update `.dense-table__head` and `.dense-table__cell` padding**

In `src/renderer/index.css`, find the rule at approximately line 677:

```css
.dense-table__head,
.dense-table__cell {
    padding: 0.25rem 0.3rem;
```

Replace with:

```css
.dense-table__head,
.dense-table__cell {
    padding: 0.35rem 0.5rem;
```

- [ ] **Step 2: Update `.dense-table__head` border and background**

Find the `.dense-table__head` rule at approximately line 701:

```css
.dense-table__head {
    font-size: 0.65rem;
```

Add `border-bottom-width` and `background` to the existing rule. The full rule should become:

```css
.dense-table__head {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 3;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 2px solid rgba(255, 255, 255, 0.08);
}
```

Note: check that the existing rule has `position: sticky; top: 0; z-index: 3;` already — if it does, keep them; if not, add them. The key additions are `background` and `border-bottom`.

- [ ] **Step 3: Update `.dense-table__cell--active` and `.dense-table__head--active`**

Find the existing rule at approximately line 768:

```css
.dense-table__cell--active,
.dense-table__head--active {
    background: #111c33;
    color: #bfdbfe;
}
```

Replace with separate rules:

```css
.dense-table__head--active {
    background: rgba(56, 189, 248, 0.06);
    color: var(--brand-primary);
    border-bottom-color: rgba(56, 189, 248, 0.3);
}

.dense-table__cell--active {
    background: rgba(56, 189, 248, 0.03);
    color: var(--text-primary);
    font-weight: 500;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run validate && npx vitest run src/shared/__tests__/statsThemesContract.test.ts`

Expected: All pass — CSS changes don't break theme contract (contract tests check `.stats-view` component selectors, not `.dense-table` rules).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.css
git commit -m "style: update dense table header weight, row padding, and active column highlight"
```

---

### Task 2: DenseStatsTable — Apply Active Column Classes

**Files:**
- Modify: `src/renderer/stats/ui/DenseStatsTable.tsx`

- [ ] **Step 1: Add `--active` class to sorted column header**

In `src/renderer/stats/ui/DenseStatsTable.tsx`, find the column header rendering (approximately line 66-85). The current code:

```tsx
<div
    key={column.id}
    className={`dense-table__head ${column.align === 'right' ? 'dense-table__cell--right' : ''}`}
    style={column.minWidth ? { minWidth: column.minWidth } : undefined}
>
```

Replace with:

```tsx
<div
    key={column.id}
    className={`dense-table__head ${column.align === 'right' ? 'dense-table__cell--right' : ''} ${sortColumnId === column.id ? 'dense-table__head--active' : ''}`}
    style={column.minWidth ? { minWidth: column.minWidth } : undefined}
>
```

- [ ] **Step 2: Add `--active` class to sorted column cells**

Find the cell rendering inside the row map (approximately line 90-96). The current code:

```tsx
<div
    key={`${row.id}-${column.id}`}
    className={`dense-table__cell ${column.align === 'right' ? 'dense-table__cell--right' : ''}`}
>
```

Replace with:

```tsx
<div
    key={`${row.id}-${column.id}`}
    className={`dense-table__cell ${column.align === 'right' ? 'dense-table__cell--right' : ''} ${sortColumnId === column.id ? 'dense-table__cell--active' : ''}`}
>
```

- [ ] **Step 3: Run tests**

Run: `npm run validate`

Expected: PASS — no type changes, just className additions.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/ui/DenseStatsTable.tsx
git commit -m "feat: apply active column highlight classes to sorted DenseStatsTable columns"
```

---

### Task 3: Toolbar Box Wrapper Removal — OffenseSection

This task establishes the pattern. The remaining 8 sections follow this exact same transformation in Tasks 4-5.

**Files:**
- Modify: `src/renderer/stats/sections/OffenseSection.tsx` (lines ~93-193)

- [ ] **Step 1: Replace the toolbar box wrapper with inline layout**

Find the expanded branch (approximately line 93). The current structure is:

```tsx
<div className="flex flex-col gap-4">
    <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Offensive Tabs</div>
        <div className="flex flex-wrap items-center gap-2">
            {/* SearchSelectDropdown, ColumnFilterDropdowns, PillToggleGroup */}
        </div>
        {/* filter chips section */}
    </div>
    <div className="overflow-hidden">
        {/* DenseStatsTable */}
    </div>
</div>
```

Replace with this structure (keep all the existing controls unchanged — only the wrapper markup changes):

```tsx
<div className="flex flex-col gap-4">
    <div>
        <div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {/* All existing controls: SearchSelectDropdown, ColumnFilterDropdowns */}
            <div className="h-5 w-px" style={{ background: 'var(--border-subtle)' }} />
            {/* PillToggleGroup */}
        </div>
        {/* filter chips section — moved outside the border-bottom div */}
    </div>
    <div className="overflow-hidden">
        {/* DenseStatsTable */}
    </div>
</div>
```

Specifically in OffenseSection.tsx:

1. Remove the outer `<div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>` wrapper
2. Remove the `<div className="text-xs uppercase tracking-widest mb-2" ...>Offensive Tabs</div>` label
3. Wrap the controls row in `<div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>`
4. Add a vertical divider `<div className="h-5 w-px" style={{ background: 'var(--border-subtle)' }} />` before the PillToggleGroup
5. Keep the filter chips section below the controls row but outside the border-bottom div

- [ ] **Step 2: Update filter chip styling**

Find the filter chip buttons (the ones rendered from `selectedOffenseColumnIds.map` and `selectedOffensePlayers.map`). Each chip currently looks like:

```tsx
<button
    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
    style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
>
```

Replace the style on each **active filter chip** (not the "Clear All" button) with:

```tsx
<button
    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
    style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
>
```

Leave the "Clear All" button styling unchanged.

- [ ] **Step 3: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/OffenseSection.tsx
git commit -m "style: refresh OffenseSection expanded toolbar — inline layout, brand chips"
```

---

### Task 4: Toolbar Box Wrapper Removal — DefenseSection, SupportSection, HealingSection, BoonOutputSection

Apply the exact same transformation from Task 3 to these 4 sections. Each has the identical pattern: bordered box wrapper with "X Tabs" label → inline controls row with border-bottom + vertical divider + brand-tinted chips.

**Files:**
- Modify: `src/renderer/stats/sections/DefenseSection.tsx`
- Modify: `src/renderer/stats/sections/SupportSection.tsx`
- Modify: `src/renderer/stats/sections/HealingSection.tsx`
- Modify: `src/renderer/stats/sections/BoonOutputSection.tsx`

- [ ] **Step 1: Update DefenseSection expanded toolbar**

Same transformation as Task 3:
1. Remove `<div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>`
2. Remove `<div className="text-xs uppercase tracking-widest mb-2" ...>Defensive Tabs</div>`
3. Wrap controls in `<div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>`
4. Add `<div className="h-5 w-px" style={{ background: 'var(--border-subtle)' }} />` before the first PillToggleGroup
5. Update chip styles: `border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)'`

DefenseSection has two PillToggleGroups (Total/Stat/1s/Stat/60s and Combined/Separate for minions). Place the vertical divider before the first toggle group.

- [ ] **Step 2: Update SupportSection expanded toolbar**

Same transformation. SupportSection has two PillToggleGroups (Total/Per1s/Per60s and All/Squad for cleanse scope). Place the vertical divider before the first toggle group.

- [ ] **Step 3: Update HealingSection expanded toolbar**

Same transformation. HealingSection has PillToggleGroups for scope (Total/Squad/Group/Self/OffSquad) and a conditional res utility toggle. Place the vertical divider before the first toggle group.

- [ ] **Step 4: Update BoonOutputSection expanded toolbar**

Same transformation. BoonOutputSection has two PillToggleGroups (Self/Group/Squad/Total and Total Gen/Gen/Sec/Uptime). Place the vertical divider before the first toggle group.

- [ ] **Step 5: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx src/renderer/stats/sections/HealingSection.tsx src/renderer/stats/sections/BoonOutputSection.tsx
git commit -m "style: refresh expanded toolbar in Defense, Support, Healing, BoonOutput sections"
```

---

### Task 5: Toolbar Box Wrapper Removal — Remaining 5 Sections

**Files:**
- Modify: `src/renderer/stats/sections/ConditionsSection.tsx`
- Modify: `src/renderer/stats/sections/DamageModifiersSection.tsx`
- Modify: `src/renderer/stats/sections/SpecialBuffsSection.tsx`
- Modify: `src/renderer/stats/sections/DamageMitigationSection.tsx`
- Modify: `src/renderer/stats/sections/ApmSection.tsx`

- [ ] **Step 1: Update ConditionsSection expanded toolbar**

Same transformation as Task 3. ConditionsSection uses `className="border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] px-4 py-3"` (slightly different syntax but same visual). Has PillToggleGroups for direction (Outgoing/Incoming) and metric type. Place vertical divider before the first toggle group.

- [ ] **Step 2: Update DamageModifiersSection expanded toolbar**

Same wrapper removal. DamageModifiersSection has NO PillToggleGroup — just SearchSelectDropdown and two ColumnFilterDropdowns. No vertical divider needed (no toggle to separate from). Just remove the box wrapper, add the border-bottom controls row, and update chip styling.

- [ ] **Step 3: Update SpecialBuffsSection expanded toolbar**

Same transformation. Has PillToggleGroup for sort mode (Total/Per Sec/Fight Time). Place vertical divider before it.

- [ ] **Step 4: Update DamageMitigationSection expanded toolbar**

Same transformation. Has two PillToggleGroups (Player/Minions and Total/Stat/1s/Stat/60s) plus a conditional minion ColumnFilterDropdown. Place vertical divider before the first toggle group. DamageMitigationSection also has a separate minion chips section — apply the same brand-tinted chip style to those too.

- [ ] **Step 5: Update ApmSection expanded toolbar**

ApmSection uses `<div className="rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>`. Same transformation — remove the box, replace with inline controls row + border-bottom. Has PillToggleGroup (Total/Per Sec). Place vertical divider before it.

- [ ] **Step 6: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/ConditionsSection.tsx src/renderer/stats/sections/DamageModifiersSection.tsx src/renderer/stats/sections/SpecialBuffsSection.tsx src/renderer/stats/sections/DamageMitigationSection.tsx src/renderer/stats/sections/ApmSection.tsx
git commit -m "style: refresh expanded toolbar in Conditions, DamageModifiers, SpecialBuffs, DamageMitigation, Apm sections"
```

---

### Task 6: Dense Table Container Border + Scrubber Repositioning

**Files:**
- Modify: `src/renderer/stats/ui/DenseStatsTable.tsx`
- Modify: `src/renderer/index.css`

- [ ] **Step 1: Wrap dense table grid in a bordered container**

In `DenseStatsTable.tsx`, the current outer structure is:

```tsx
<div className={`dense-table ${className}`}>
    {(title || subtitle) && (
        <div className="dense-table__header">...</div>
    )}
    {controls && <div className="dense-table__controls">{controls}</div>}
    <div ref={scrollRef} className="dense-table__scroll">
        <div className="dense-table__grid" ...>
            {/* headers and rows */}
        </div>
    </div>
    <HorizontalScrollScrubber containerRef={scrollRef} />
</div>
```

Wrap the scroll div and scrubber in a bordered container:

```tsx
<div className={`dense-table ${className}`}>
    {(title || subtitle) && (
        <div className="dense-table__header">...</div>
    )}
    {controls && <div className="dense-table__controls">{controls}</div>}
    <div className="dense-table__container">
        <div ref={scrollRef} className="dense-table__scroll">
            <div className="dense-table__grid" ...>
                {/* headers and rows */}
            </div>
        </div>
        <HorizontalScrollScrubber containerRef={scrollRef} />
    </div>
</div>
```

- [ ] **Step 2: Add CSS for `.dense-table__container`**

In `index.css`, add after the `.dense-table` rule (approximately line 566):

```css
.dense-table__container {
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
}
```

Also update `.dense-table__scroll` to work within the container — add `flex: 1 1 auto; min-height: 0;` if not already present.

- [ ] **Step 3: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/ui/DenseStatsTable.tsx src/renderer/index.css
git commit -m "style: wrap dense table grid in bordered container, move scrubber inside"
```

---

### Task 7: HealEffectivenessSection — Summary Stat Cards

**Files:**
- Modify: `src/renderer/stats/sections/HealEffectivenessSection.tsx`

- [ ] **Step 1: Replace the inline stats text with a grid of stat cards**

Find the fight details area (approximately lines 213-261). The current summary when a fight is selected shows inline text spans:

```tsx
<div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--text-secondary)]">
    <span>Incoming: {formatWithCommas(selectedFight.incomingDamage, 0)}</span>
    <span>Healing: {formatWithCommas(selectedFight.healing, 0)}</span>
    <span>Barrier: {formatWithCommas(selectedFight.barrier, 0)}</span>
    <span>Healing + Barrier: {formatWithCommas(selectedFight.healing + selectedFight.barrier, 0)}</span>
</div>
```

Replace the entire fight details header area (from the `<div className="flex items-center justify-between gap-3 mb-3">` down to the closing `</div>` of the summary spans) with:

```tsx
<div className="grid gap-3 md:grid-cols-4 mb-3">
    <div>
        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Incoming</div>
        <div className="mt-1 text-lg font-black font-mono text-rose-200">
            {selectedFight ? formatWithCommas(selectedFight.incomingDamage, 0) : '—'}
        </div>
    </div>
    <div>
        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Healing</div>
        <div className="mt-1 text-lg font-black font-mono" style={{ color: '#86efac' }}>
            {selectedFight ? formatWithCommas(selectedFight.healing, 0) : '—'}
        </div>
    </div>
    <div>
        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Barrier</div>
        <div className="mt-1 text-lg font-black font-mono text-[color:var(--text-primary)]">
            {selectedFight ? formatWithCommas(selectedFight.barrier, 0) : '—'}
        </div>
    </div>
    <div>
        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">
            {selectedFight ? 'Selected Fight' : 'Fight Details'}
        </div>
        <div className="mt-1 text-sm text-[color:var(--text-primary)] truncate">
            {selectedFight ? selectedFight.fullLabel : 'Select a fight to view details'}
        </div>
    </div>
</div>
```

Also update the "Clear" button to sit in the grid's last column — add it after the fight label:

```tsx
{selectedFight && (
    <button
        type="button"
        onClick={() => setSelectedFightIndex(null)}
        className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
    >
        Clear
    </button>
)}
```

This replaces the current separate `flex items-center justify-between` header that contained the title, inline stats, and clear button.

- [ ] **Step 2: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/HealEffectivenessSection.tsx
git commit -m "style: replace inline stat spans with grid stat cards in HealEffectivenessSection"
```

---

### Task 8: HealEffectivenessSection — Bordered Skill Tables

**Files:**
- Modify: `src/renderer/stats/sections/HealEffectivenessSection.tsx`

- [ ] **Step 1: Update the SkillTable component styling**

Find the `SkillTable` component (approximately lines 13-60). Replace the outer container and header:

Current:
```tsx
<div className="rounded-[var(--radius-md)] overflow-hidden min-h-[260px]">
    <div className="px-4 py-3 border-b border-[color:var(--border-default)]">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">{title}</div>
    </div>
```

Replace with:
```tsx
<div className="rounded-[var(--radius-md)] overflow-hidden border border-[color:var(--border-default)] flex flex-col">
    <div className="px-4 py-3 border-b border-[color:var(--border-default)] flex items-center justify-between flex-shrink-0">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">{title}</div>
        <div className="text-[10px] text-[color:var(--text-muted)]">{rows.length} {rows.length === 1 ? 'skill' : 'skills'}</div>
    </div>
```

- [ ] **Step 2: Update the scrollable body to use flex-based height**

Find the scrollable body container:

Current:
```tsx
<div className="max-h-[320px] overflow-y-auto">
```

Replace with:
```tsx
<div className="flex-1 min-h-0 overflow-y-auto">
```

Remove the `min-h-[260px]` from the outer container (already done in step 1 — the new outer div uses `flex flex-col` instead).

- [ ] **Step 3: Update the empty state to sit inside the bordered container**

The current empty state:
```tsx
<div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No skill data available for this fight.</div>
```

This already renders inside the container after step 1, so just remove the redundant `rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)]` since the parent now has the border. Replace with:

```tsx
<div className="px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No skill data available for this fight.</div>
```

- [ ] **Step 4: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/HealEffectivenessSection.tsx
git commit -m "style: wrap skill tables in bordered containers with skill count badge"
```

---

### Task 9: HealEffectivenessSection — Fullscreen Flex Layout

**Files:**
- Modify: `src/renderer/stats/sections/HealEffectivenessSection.tsx`

- [ ] **Step 1: Update the content area below the chart to use flex layout**

The fight details + skill tables area (approximately lines 213-261) currently sits in:

```tsx
<div className={`mt-4 px-4 py-3 transition-all duration-300 ${
    selectedFight ? 'opacity-100 translate-y-0' : 'opacity-90'
}`}>
```

Replace with a flex-aware wrapper that fills remaining fullscreen height:

```tsx
<div className={`mt-4 px-4 py-3 ${isExpanded ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
```

- [ ] **Step 2: Make the skill tables grid fill remaining space in fullscreen**

The skill tables grid container:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
```

Replace with:

```tsx
<div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isExpanded ? 'flex-1 min-h-0' : 'items-start'}`}>
```

This allows the tables to stretch vertically in fullscreen while keeping `items-start` in normal view.

- [ ] **Step 3: Shorten the chart description text**

Find the description text (approximately line 126):

```tsx
<div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
    Red is incoming damage, green is healing, white is healing plus barrier. Click a point to show that fight&apos;s skill tables.
</div>
```

Replace with:

```tsx
<div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
    Click a point to view skill breakdown
</div>
```

- [ ] **Step 4: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/HealEffectivenessSection.tsx
git commit -m "style: flex fullscreen layout and shortened chart description in HealEffectivenessSection"
```

---

### Task 10: Custom Layout Sections — Table Container + Chip Styling

PlayerBreakdownSection and HealingBreakdownSection have custom expanded layouts that need chip styling and wrapper cleanup. FightBreakdownSection needs no changes (no toolbar/chips in expanded, and the DenseStatsTable container from Task 6 handles the border).

**Files:**
- Modify: `src/renderer/stats/sections/PlayerBreakdownSection.tsx`
- Modify: `src/renderer/stats/sections/HealingBreakdownSection.tsx`

- [ ] **Step 1: Update PlayerBreakdownSection chip styling**

Find the filter chip buttons in the expanded view (rendered from `selectedSkillIds.map` and `selectedPlayers.map`). Update each active chip's style from:

```tsx
style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
```

to:

```tsx
style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
```

Leave "Clear All" unchanged. Also update PlayerBreakdownSection's toolbar wrapper: the expanded toolbar currently uses `<div className="px-4 py-3">`. Replace with the inline controls row pattern:

```tsx
<div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
```

Remove the `<div className="text-xs uppercase tracking-widest mb-2" ...>Player Breakdown</div>` label.

- [ ] **Step 2: Update HealingBreakdownSection**

HealingBreakdownSection wraps DenseStatsTable in `<div className="rounded-[var(--radius-md)] overflow-hidden">`. This wrapper becomes redundant now that DenseStatsTable has its own container (Task 6). Remove it:

Current:
```tsx
<div className="rounded-[var(--radius-md)] overflow-hidden">
    {(() => {
        // ...
        return <DenseStatsTable ... />;
    })()}
</div>
```

Replace with:
```tsx
{(() => {
    // ...
    return <DenseStatsTable ... />;
})()}
```

- [ ] **Step 3: Run tests**

Run: `npm run validate`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/PlayerBreakdownSection.tsx src/renderer/stats/sections/HealingBreakdownSection.tsx
git commit -m "style: update chip styling and clean up redundant wrappers in custom layout sections"
```

---

### Task 11: Final Validation

- [ ] **Step 1: Run full validation**

Run: `npm run validate`

Expected: PASS — no type errors, no lint violations.

- [ ] **Step 2: Run unit tests**

Run: `npm run test:unit`

Expected: All tests pass. No functional changes were made.

- [ ] **Step 3: Visual check list (manual)**

Open the app with `npm run dev` and verify:
- HealEffectiveness: summary stat cards render with colored values, skill tables have borders and skill counts, fullscreen fills space
- Any dense table section (e.g., Offense): active sort column has subtle blue tint, header has stronger border, toolbar has no box wrapper, chips are brand-tinted
- Web report (`npm run dev:web`): verify dense table and heal effectiveness render correctly with theme

- [ ] **Step 4: Commit any fixups if needed**

If visual check reveals issues, fix and commit individually.
