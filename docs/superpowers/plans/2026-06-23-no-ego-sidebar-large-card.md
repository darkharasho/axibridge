# No Ego Sidebar + Large Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In No Ego mode, the Offense/Defense/Support detailed sections keep their left metric-selector sidebar (as in normal mode) and render ONE large `MetricDistributionCard` for the selected metric, instead of the current grid of small cards. The "Per-player detail" expander stays, now showing the table for the selected metric.

**Architecture:** Each section's `if (noEgoMode && ...)` branch is restructured to use the existing `StatsTableLayout` (240–280px sidebar + content). The sidebar is the section's existing metric-selector list (search box + `activeXStat` buttons) already present in normal mode. The content is a single large `MetricDistributionCard` built for the active metric, followed by the existing "Per-player detail" expander whose table is keyed to the active metric. `MetricDistributionCard` gains an opt-in `large` mode (taller dot-plot, larger headline) used here.

**Tech Stack:** TypeScript, React 18, Vitest + jsdom, Tailwind CSS variables.

## Global Constraints

- Run vitest with `--maxWorkers=2`. `npm run validate` (typecheck + ESLint, max-warnings 0) must pass before each commit.
- Scope: Offense, Defense, Support sections ONLY. Do NOT change the Squad Summary (TopPlayersSection) — it stays a grid.
- Role-awareness, σ math, and outlier selection are unchanged — this is layout only. `MetricDistributionCard` already renders ALL needs-improvement outliers (no cap) and is `roleAware`; keep that.
- Default-off safety: when `noEgoMode` is false, every section renders exactly as before (the normal-mode `StatsTableLayout` path is untouched). When `large` is absent/false, `MetricDistributionCard` renders byte-for-byte as today.
- Reuse existing pieces — do not duplicate: `StatsTableLayout` (`src/renderer/stats/ui/StatsTableLayout.tsx`), the section's existing sidebar markup (search input + `filteredXMetrics.map` buttons using `activeXStat`/`setActiveXStat` and `sidebarListClass`), `StatsTableShell`, and the per-metric `players`-array + `formatValue` builders already in the No Ego branch.
- The active metric drives BOTH the large card and the detail table: use `activeOffenseStat` / `activeDefenseStat` / `activeSupportStat` (already props, already available in the No Ego branch).

---

### Task 1: `large` mode for `MetricDistributionCard`

**Files:**
- Modify: `src/renderer/stats/components/MetricDistributionCard.tsx`
- Test: `src/renderer/stats/components/__tests__/MetricDistributionCard.large.test.tsx` (new)

**Interfaces:**
- Produces: `MetricDistributionCardProps.large?: boolean` (default false → current sizing).

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/stats/components/__tests__/MetricDistributionCard.large.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MetricDistributionCard } from '../MetricDistributionCard';

const players = (vals: number[]) =>
  vals.map((value, i) => ({ account: `P${i}`, value, profession: 'Guardian' }));

describe('MetricDistributionCard — large mode', () => {
  it('renders a taller dot-plot when large is set', () => {
    const small = render(
      <MetricDistributionCard title="Cleanses" accentColor="#60a5fa" higherIsBetter
        players={players([2, 4, 6, 8])} formatValue={(n) => String(n)} />,
    );
    const smallPlot = small.container.querySelector('[data-testid="metric-card-plot"]');
    expect(smallPlot?.className).toContain('h-8');

    const big = render(
      <MetricDistributionCard title="Cleanses" accentColor="#60a5fa" higherIsBetter large
        players={players([2, 4, 6, 8])} formatValue={(n) => String(n)} />,
    );
    const bigPlot = big.container.querySelector('[data-testid="metric-card-plot"]');
    expect(bigPlot?.className).toContain('h-14');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.large.test.tsx --maxWorkers=2`
Expected: FAIL — no `metric-card-plot` testid / `h-14` not present.

- [ ] **Step 3: Implement**

In `MetricDistributionCard.tsx`:
1. Add `large?: boolean` to `MetricDistributionCardProps`; destructure with default `false`.
2. On the dot-plot wrapper `<div className="relative h-8 mt-1">`, add `data-testid="metric-card-plot"` and make the height conditional: `` `relative ${large ? 'h-14' : 'h-8'} mt-1` ``.
3. (Optional polish, keep minimal) when `large`, you MAY bump the single-Avg headline value class from `text-2xl` to `text-3xl`. Do not change any other behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.large.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Confirm existing card tests still pass**

Run: `npx vitest run src/renderer/stats/components/__tests__/ --maxWorkers=2`
Expected: PASS (existing card + role-aware tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/components/MetricDistributionCard.tsx src/renderer/stats/components/__tests__/MetricDistributionCard.large.test.tsx
git commit -m "feat: large mode (taller plot) for MetricDistributionCard"
```

---

### Task 2: Offense section — sidebar + large card layout

**Files:**
- Modify: `src/renderer/stats/sections/OffenseSection.tsx` (the `if (noEgoMode && stats.offensePlayers.length > 0)` branch)
- Test: `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx` (update)

**Interfaces:**
- Consumes: `StatsTableLayout`, `MetricDistributionCard` (`large`, `roleAware`), `activeOffenseStat`/`setActiveOffenseStat`, `offenseSearch`/`setOffenseSearch`, `sidebarListClass`, `StatsTableShell`.

- [ ] **Step 1: Read the current No Ego branch and the normal-mode sidebar**

Run: `sed -n '57,247p' src/renderer/stats/sections/OffenseSection.tsx` and `sed -n '480,628p' src/renderer/stats/sections/OffenseSection.tsx`.
Identify: (a) the per-metric `players`-array + `formatValue` builders in the No Ego grid loop; (b) the normal-mode sidebar markup (search input + `filteredOffenseMetrics.map` buttons); (c) the per-player detail `StatsTableShell` already inside the current expander.

- [ ] **Step 2: Update the test to the new layout contract**

In `OffenseSection.noego.test.tsx`, the existing No Ego test currently asserts `metric-card-mean` present and a "Per-player detail" expander present. Update/extend it so it also asserts the sidebar metric buttons render. Add assertions (keep the existing role-aware test from prior work intact):

```tsx
// within the existing noEgoMode render:
// sidebar metric selector is present
expect(screen.getByText('Offensive Tabs')).toBeInTheDocument();
// exactly one large card (one mean readout) is shown for the active metric
expect(screen.getAllByTestId('metric-card-mean').length).toBe(1);
// the large dot-plot is rendered
expect(document.querySelector('[data-testid="metric-card-plot"]')?.className).toContain('h-14');
// the per-player detail expander still exists
expect(screen.getByRole('button', { name: /per-player detail/i })).toBeInTheDocument();
```

(If the section's sidebar label text differs from `Offensive Tabs`, use the actual literal found in Step 1.)

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL — grid currently renders many `metric-card-mean` (not exactly 1) and no `h-14` plot / no sidebar in the No Ego branch.

- [ ] **Step 4: Restructure the No Ego branch**

Replace the grid-of-cards + the current expander (which had its own inner `StatsTableLayout`) with a single `StatsTableLayout`:

- **sidebar**: the SAME search input + `filteredOffenseMetrics.map(...)` button list used in normal mode (reuse the markup; it already calls `setActiveOffenseStat` and styles the `activeOffenseStat` button). Reuse `offenseSearch`/`setOffenseSearch` and `sidebarListClass`.
- **content**: 
  1. Resolve the active metric: `const metric = OFFENSE_METRICS.find((e) => e.id === activeOffenseStat) || OFFENSE_METRICS[0];`
  2. Build the `players` array + `higherIsBetter` + `formatValue` for THAT metric using the existing builders (the same ones the grid loop used, applied to the single active metric; include `role: roleOf(row.account)` exactly as the current grid does).
  3. Render ONE `<MetricDistributionCard large roleAware title={metric.label} accentColor="var(--section-offense)" higherIsBetter={...} players={players} formatValue={...} renderProfessionIcon={renderProfessionIcon} />`.
  4. Below the card, keep the existing "Per-player detail" expander (`detailOpen`/`setDetailOpen` + chevrons), but its content is now just the per-player `StatsTableShell` table for the ACTIVE metric (the same table that was already in the old expander) — it no longer needs its own sidebar since the section sidebar drives the selection.

Keep the section header (`Offense Detailed`) above the `StatsTableLayout`.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Validate + commit**

Run: `npm run validate`
Expected: pass.

```bash
git add src/renderer/stats/sections/OffenseSection.tsx src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx
git commit -m "feat: No Ego Offense uses sidebar + large card layout"
```

---

### Task 3: Defense + Support sections — mirror the Offense layout

**Files:**
- Modify: `src/renderer/stats/sections/DefenseSection.tsx`, `src/renderer/stats/sections/SupportSection.tsx` (their `if (noEgoMode && ...)` branches)

**Interfaces:**
- Same as Task 2, using each section's own `activeDefenseStat`/`setActiveDefenseStat` + `DEFENSE_METRICS` (accent `var(--section-defense)`) and `activeSupportStat`/`setActiveSupportStat` + `SUPPORT_METRICS` (accent `var(--section-support)`), and each section's existing sidebar markup, `players`/`formatValue` builders, `roleOf`, and detail `StatsTableShell`.

- [ ] **Step 1: Apply the Task 2 restructure to DefenseSection**

Mirror Task 2 Step 4 exactly in `DefenseSection.tsx`: replace the grid + inner-sidebar expander with one `StatsTableLayout` (sidebar = existing defense metric selector; content = one `large roleAware` `MetricDistributionCard` for the active defense metric + the per-player detail expander showing the active-metric table). Use `var(--section-defense)` for `accentColor` and the existing defense `higherIsBetter`/`formatValue`/`roleOf` logic.

- [ ] **Step 2: Apply the same restructure to SupportSection**

Mirror in `SupportSection.tsx` using `activeSupportStat`, `SUPPORT_METRICS`, `var(--section-support)`, and the existing support `formatValue` (respect `condiCleanse`/`cleanseScope` and `isTime` handling already present) + `roleOf`.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run validate`
Expected: pass.

- [ ] **Step 4: Sanity-check both sections render**

Run: `npx vitest run src/renderer/stats/sections/__tests__/ --maxWorkers=2`
Expected: PASS (Offense No Ego test + any Defense/Support tests; nothing regressed).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx
git commit -m "feat: No Ego Defense/Support use sidebar + large card layout"
```

---

### Task 4: Full validation sweep

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: all pass.

- [ ] **Step 2: Validate**

Run: `npm run validate`
Expected: typecheck + lint clean.

- [ ] **Step 3: Build the web report**

Run: `npm run build:web`
Expected: succeeds.

- [ ] **Step 4: Commit (only if a fix was needed)**

```bash
git add -A && git commit -m "chore: No Ego sidebar+large-card validation fixes"
```

---

## Notes for the implementer

- This is a layout refactor: do not change the squad/cohort math, role logic, or which outliers are flagged.
- The normal-mode (`!noEgoMode`) path in each section is untouched.
- The Squad Summary (TopPlayersSection) is explicitly out of scope.
- The detail expander's table already existed in the old No Ego branch keyed to the active stat — reuse it; just lift it out of the now-removed inner `StatsTableLayout`.
- If a section's existing No Ego branch built `players` only inside a `.map` over all metrics, refactor that into a small inline helper applied to the single active metric (and reused if you prefer), rather than duplicating the body.
