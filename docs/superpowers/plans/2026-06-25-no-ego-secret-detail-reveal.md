# No-Ego Secret Per-Player Detail Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible "Per-player detail" button in no-ego sections with a silent triple-click gesture on the section header icon.

**Architecture:** All logic lives in `NoEgoMetricSection.tsx`. The rendered icon is wrapped in a `<span>` that records click timestamps in a ref; 3 clicks within a 600ms rolling window toggle the existing `detailOpen` state. The visible button is deleted. No prop/signature changes; consuming sections (Offense/Defense/Support) are untouched.

**Tech Stack:** React (function component, `React.useRef`), TypeScript, vitest + @testing-library/react.

## Global Constraints

- Gesture: exactly 3 clicks within a **600ms** rolling window toggles the table.
- No visual affordance: no cursor change, no `role`/`aria`, no tooltip, no pulse.
- Per-section/per-instance: timestamp buffer is local to each `NoEgoMetricSection`.
- The icon wrapper carries `data-testid="noego-secret-icon"` (sole testability hook).
- Use `performance.now()` for timestamps.
- Lint runs with `--max-warnings 0`; no unused imports/vars.

---

### Task 1: Replace visible button with secret triple-click gesture

**Files:**
- Modify: `src/renderer/stats/sections/NoEgoMetricSection.tsx`
- Test (modify): `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx`
- Test (modify): `src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx`
- Test (modify): `src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx`

**Interfaces:**
- Consumes: existing `NoEgoMetricSectionProps` — `icon: React.ReactNode`, `detailOpen: boolean`, `setDetailOpen: (v: boolean | ((p: boolean) => boolean)) => void`. No new props.
- Produces: the per-player detail table (identified in tests by the unique `Fight Time` column header) is hidden on mount and toggled by 3 clicks on `[data-testid="noego-secret-icon"]`.

- [ ] **Step 1: Update the OffenseSection no-ego test to expect the secret gesture**

In `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx`, change the import on line 2 to add `fireEvent`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
```

Replace the first test (`it('renders sidebar + single large card + expander button', ...)`, lines 100–125) with:

```tsx
    it('renders sidebar + single large card, hides per-player table behind secret gesture', () => {
        render(
            <StatsSharedContext.Provider value={ctx}>
                <OffenseSection
                    offenseSearch=""
                    setOffenseSearch={() => {}}
                    activeOffenseStat="damage"
                    setActiveOffenseStat={() => {}}
                    offenseViewMode="total"
                    setOffenseViewMode={() => {}}
                    noEgoMode
                />
            </StatsSharedContext.Provider>,
        );
        // Sidebar metric selector is present
        expect(screen.getByText('Offensive Tabs')).toBeInTheDocument();
        // Exactly one large card (one mean readout) is shown for the active metric
        expect(screen.getAllByTestId('metric-card-mean').length).toBe(1);
        // The large dot-plot is rendered (h-14 from large prop)
        expect(document.querySelector('[data-testid="metric-card-plot"]')?.className).toContain('h-14');
        // view-mode toggle present in No Ego mode
        expect(screen.getByText('Stat/1s')).toBeInTheDocument();
        expect(screen.getByText('Stat/60s')).toBeInTheDocument();

        // No visible "Per-player detail" button exists
        expect(screen.queryByRole('button', { name: /per-player detail/i })).toBeNull();
        // Per-player detail table is hidden on mount (unique "Fight Time" column header absent)
        expect(screen.queryByText('Fight Time')).toBeNull();

        // Secret gesture: 3 rapid clicks on the section icon reveal the table
        const secretIcon = screen.getByTestId('noego-secret-icon');
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        expect(screen.getByText('Fight Time')).toBeInTheDocument();

        // 3 more clicks hide it again
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        expect(screen.queryByText('Fight Time')).toBeNull();
    });
```

- [ ] **Step 2: Run the OffenseSection test to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL — `getByTestId('noego-secret-icon')` throws (no matching element), and/or "Per-player detail" button still present.

- [ ] **Step 3: Wrap the icon and delete the visible button in NoEgoMetricSection**

In `src/renderer/stats/sections/NoEgoMetricSection.tsx`:

(a) Add a click-buffer ref and handler inside the component body, immediately after the `const { renderProfessionIcon, sidebarListClass } = useStatsSharedContext();` line (line 64):

```tsx
    const clickTimesRef = React.useRef<number[]>([]);
    const handleSecretIconClick = () => {
        const now = performance.now();
        const recent = clickTimesRef.current.filter((t) => now - t < 600);
        recent.push(now);
        if (recent.length >= 3) {
            clickTimesRef.current = [];
            setDetailOpen((v) => !v);
        } else {
            clickTimesRef.current = recent;
        }
    };
```

(b) Replace the icon render (line 100, `{icon}`) with a wrapping span:

```tsx
                    <span data-testid="noego-secret-icon" onClick={handleSecretIconClick}>
                        {icon}
                    </span>
```

(c) Delete the entire visible toggle button block (lines 165–174), i.e. remove:

```tsx
                            <button
                                type="button"
                                aria-expanded={detailOpen}
                                onClick={() => setDetailOpen((v) => !v)}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-[var(--radius-md)]"
                                style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
                            >
                                {detailOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                Per-player detail
                            </button>
```

The surrounding `<div>` and the `{detailOpen && activeMetric && ( … table … )}` block stay. After deletion, the `<div>` opening at line 164 wraps only the conditional table render.

(d) Remove the now-unused `ChevronDown, ChevronRight` import on line 2:

```tsx
import React from 'react';
```

(delete the entire `import { ChevronDown, ChevronRight } from 'lucide-react';` line).

- [ ] **Step 4: Run the OffenseSection test to verify it passes**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: PASS (both tests).

- [ ] **Step 5: Update the DefenseSection no-ego test**

In `src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx`:
- Add `fireEvent` to the `@testing-library/react` import.
- At line ~89–90, replace the assertion
  `expect(screen.getByRole('button', { name: /per-player detail/i })).toBeInTheDocument();`
  with the hidden-table + gesture assertions:

```tsx
        // No visible "Per-player detail" button; table hidden until secret gesture
        expect(screen.queryByRole('button', { name: /per-player detail/i })).toBeNull();
        expect(screen.queryByText('Fight Time')).toBeNull();
        const secretIcon = screen.getByTestId('noego-secret-icon');
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        expect(screen.getByText('Fight Time')).toBeInTheDocument();
```

- [ ] **Step 6: Update the SupportSection no-ego test**

In `src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx`:
- Add `fireEvent` to the `@testing-library/react` import.
- At line ~104–105, replace the assertion
  `expect(screen.getByRole('button', { name: /per-player detail/i })).toBeInTheDocument();`
  with the same block as Step 5:

```tsx
        // No visible "Per-player detail" button; table hidden until secret gesture
        expect(screen.queryByRole('button', { name: /per-player detail/i })).toBeNull();
        expect(screen.queryByText('Fight Time')).toBeNull();
        const secretIcon = screen.getByTestId('noego-secret-icon');
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        fireEvent.click(secretIcon);
        expect(screen.getByText('Fight Time')).toBeInTheDocument();
```

- [ ] **Step 7: Run all three no-ego section tests**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx --maxWorkers=2`
Expected: PASS (all files).

- [ ] **Step 8: Validate types and lint**

Run: `npm run validate`
Expected: typecheck + lint pass with no errors (confirms no unused `ChevronDown`/`ChevronRight` import remains).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stats/sections/NoEgoMetricSection.tsx \
  src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx \
  src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx \
  src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx
git commit -m "feat(no-ego): hide per-player detail behind secret triple-click on section icon"
```

---

## Self-Review

**Spec coverage:**
- Remove visible button → Step 3(c). ✓
- Triple-click (3 within 600ms) toggles → Step 3(a) handler. ✓
- Per-section/independent → buffer is per-instance ref; sections own their own `detailOpen` (unchanged). ✓
- Silent, no affordance → wrapper span has no role/aria/cursor. ✓
- `detailOpen` table render unchanged → Step 3(c) keeps the conditional block. ✓
- Tests updated for all three sections → Steps 1, 5, 6. ✓

**Placeholder scan:** No TBD/TODO; all code shown verbatim.

**Type consistency:** `setDetailOpen((v) => !v)` matches the prop signature `(v: boolean | ((p: boolean) => boolean)) => void`. `clickTimesRef` typed `number[]`. `performance.now()` returns `number`. Test marker `Fight Time` matches the column header at NoEgoMetricSection line 205.
