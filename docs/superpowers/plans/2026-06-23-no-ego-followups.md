# No Ego Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clear the non-blocking follow-ups accumulated across the No Ego reviews: stronger tests, role color on outlier dots, a typed role-classification accessor, a Total/Stat-1s/Stat-60s view-mode toggle in No Ego sections, Defense/Support role-aware tests, an exact rollup card-count assertion, and a shared `NoEgoMetricSection` to de-duplicate the three section branches.

**Architecture:** Mostly small, isolated changes. The one structural change (Task 7) extracts the identical No Ego section shell (header + view-mode toggle + `StatsTableLayout` sidebar + large card + per-player detail expander) into a single reusable `NoEgoMetricSection` component; each section passes its data/behavior (metrics, active-stat state, value resolver, formatter, direction, fight-time accessor, accent, icon) as props.

**Tech Stack:** TypeScript, React 18, Vitest + jsdom, Tailwind CSS variables.

## Global Constraints

- Run vitest with `--maxWorkers=2`. `npm run validate` (typecheck + ESLint, max-warnings 0) must pass before each commit.
- Work in the main checkout `/var/home/mstephens/Documents/GitHub/axibridge` on branch `feat/no-ego-mode`. Do NOT use git worktrees. After each commit, confirm it is the tip of `feat/no-ego-mode`.
- Behavior-preserving except where a task explicitly adds UI (Task 4 toggle) or fixes a display nuance (Task 2 dot color). Role/σ/outlier math is unchanged throughout.
- Default-off safety: when `noEgoMode`/`roleAware`/`large` are off, all components render exactly as before.
- Scope: Offense/Defense/Support detailed sections + `MetricDistributionCard` + web rollup test. The Squad Summary (TopPlayersSection) view stays a grid (but Task 3's typed accessor and Task 7's role map may touch its role-lookup code — keep its behavior identical).
- Reuse `PillToggleGroup` (already used in normal mode: `value`/`onChange`/`options=[{value:'total',label:'Total'},{value:'per1s',label:'Stat/1s'},{value:'per60s',label:'Stat/60s'}]`, `activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"`, `inactiveClassName="text-[color:var(--text-secondary)]"`).
- The role-classification runtime shape (emitted in `incrementalAggregation.ts:1474`) is `{ account: string; profession: string; professionList: string[]; role: 'support' | 'damage'; supportScore: number; confidenceScore: number; threshold: number; factors: unknown[] }`.

---

### Task 1: Widen the no-celebration regex

**Files:**
- Modify: `src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx:38`

- [ ] **Step 1: Strengthen the assertion**

Replace the existing line:

```tsx
    expect(screen.queryByText(/MVP|top performer|#1/i)).toBeNull();
```

with a wider guard that also catches crown/best/elite/winner/podium language:

```tsx
    expect(screen.queryByText(/\bMVP\b|top performer|#1|crown|\bbest\b|elite|winner|podium|champion/i)).toBeNull();
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx --maxWorkers=2`
Expected: PASS (the card has no such language, so the wider regex still finds nothing).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx
git commit -m "test: widen No Ego no-celebration guard (crown/best/elite/winner/podium)"
```

---

### Task 2: Role color on outlier dots

**Files:**
- Modify: `src/renderer/stats/components/MetricDistributionCard.tsx:102-119`
- Test: `src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx` (add a case)

**Interfaces:**
- Consumes: existing `roleAware`, `roleOf` map, `outlierKeys`.

Problem: today an outlier dot is filled with `accentColor`, so in role-aware mode you can't tell if the flagged player was support or damage. Fix: in role-aware mode, fill every dot (outlier or not) by its role color; mark outliers with a thicker accent ring (and slightly larger size) instead of overriding the fill. Non-role-aware behavior is unchanged (outliers keep `accentColor` fill).

- [ ] **Step 1: Write the failing test**

Add to `MetricDistributionCard.roleaware.test.tsx`:

```tsx
  it('keeps role color on a flagged outlier dot (role-aware)', () => {
    const squad = [
      { account: 'S1', value: 100, role: 'support' as const },
      { account: 'S2', value: 100, role: 'support' as const },
      { account: 'S3', value: 100, role: 'support' as const },
      { account: 'SLow', value: 0, role: 'support' as const },
    ];
    const { container } = render(
      <MetricDistributionCard
        title="Cleanses" accentColor="#60a5fa" higherIsBetter roleAware
        players={squad} formatValue={(n) => String(Math.round(n))} />,
    );
    // The outlier dot for SLow is identified by its title attribute.
    const dot = container.querySelector('[title^="SLow:"]') as HTMLElement;
    expect(dot).toBeTruthy();
    // Support role color is cyan (#22d3ee); it must remain the fill even though SLow is an outlier.
    expect(dot.style.background).toMatch(/34,\s*211,\s*238|#22d3ee/i);
    // And it is marked as an outlier via an outline.
    expect(dot.style.outline).toContain('solid');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx --maxWorkers=2`
Expected: FAIL — outlier dot background is currently `accentColor` (#60a5fa), not the support color.

- [ ] **Step 3: Implement**

Replace the dot `.map` body (lines 102-119) so role color is the fill in role-aware mode regardless of outlier status, and outliers are marked by ring + size:

```tsx
        {s.players.map((p) => {
          const isOutlier = outlierKeys.has(p.account);
          const roleColor = roleOf.get(p.account) === 'support' ? '#22d3ee'
            : roleOf.get(p.account) === 'damage' ? '#fb923c'
            : 'var(--text-muted)';
          const fill = roleAware ? roleColor : (isOutlier ? accentColor : 'var(--text-muted)');
          return (
            <div
              key={p.account}
              title={`${p.account}: ${formatValue(p.value)}`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ${isOutlier ? 'w-3 h-3' : 'w-2 h-2'}`}
              style={{
                left: `${pos(p.value)}%`,
                background: fill,
                outline: isOutlier ? `2px solid ${accentColor}` : 'none',
              }}
            />
          );
        })}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/renderer/stats/components/__tests__/ --maxWorkers=2`
Expected: PASS (new case + existing card/role-aware/large tests). Note the `large.test.tsx` asserts the plot wrapper height (`h-14`/`h-8`), not dot classes, so it is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/components/MetricDistributionCard.tsx src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx
git commit -m "feat: keep role color on outlier dots; mark outliers with ring"
```

---

### Task 3: Typed role-classification accessor

**Files:**
- Modify: `src/renderer/stats/statsTypes.ts` (add an exported type)
- Modify: `src/renderer/stats/sections/OffenseSection.tsx`, `DefenseSection.tsx`, `SupportSection.tsx`, `TopPlayersSection.tsx` (replace `(stats as any).roleClassifications` reads)

**Interfaces:**
- Produces:
  ```ts
  export interface RoleClassificationEntry {
    account: string;
    profession?: string;
    professionList?: string[];
    role: 'support' | 'damage';
    supportScore?: number;
    confidenceScore?: number;
    threshold?: number;
    factors?: unknown[];
  }
  ```

Context: `StatsSharedContextValue.stats` is typed `any`, so the `as any` cast is redundant rather than wrong; this task removes the cast noise and gives the role map a real element type. It does NOT attempt to type the whole `stats` object.

- [ ] **Step 1: Add the type**

Append `RoleClassificationEntry` (above interface) to `src/renderer/stats/statsTypes.ts`.

- [ ] **Step 2: Replace the four read sites**

In each of the four files, the current pattern is:

```tsx
      (Array.isArray((stats as any).roleClassifications) ? (stats as any).roleClassifications : [])
        .filter((r: any) => r && (r.role === 'support' || r.role === 'damage'))
        .map((r: any) => [String(r.account), r.role as 'support' | 'damage']),
```

Replace with a typed read (import `RoleClassificationEntry` from `../statsTypes` in the sections, `../statsTypes` path adjusted as needed; `TopPlayersSection` is in the same `sections/` dir):

```tsx
      ((stats.roleClassifications as RoleClassificationEntry[] | undefined) ?? [])
        .filter((r): r is RoleClassificationEntry => !!r && (r.role === 'support' || r.role === 'damage'))
        .map((r) => [String(r.account), r.role] as [string, 'support' | 'damage']),
```

Keep the surrounding `new Map<string, 'support' | 'damage'>(...)` and the `roleOf` helper unchanged.

- [ ] **Step 3: Validate**

Run: `npm run validate`
Expected: typecheck + lint clean.

- [ ] **Step 4: Run section + card tests (no behavior change expected)**

Run: `npx vitest run src/renderer/stats/sections/__tests__/ --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/statsTypes.ts src/renderer/stats/sections/OffenseSection.tsx src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx src/renderer/stats/sections/TopPlayersSection.tsx
git commit -m "refactor: typed RoleClassificationEntry accessor, drop as-any casts"
```

---

### Task 4: View-mode toggle in No Ego section branches

**Files:**
- Modify: `src/renderer/stats/sections/OffenseSection.tsx`, `DefenseSection.tsx`, `SupportSection.tsx` (the `if (noEgoMode && ...)` branch header)
- Test: `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx` (add an assertion)

**Interfaces:**
- Consumes: `PillToggleGroup`, the section's `{x}ViewMode`/`set{X}ViewMode`.

Add the Total/Stat-1s/Stat-60s toggle (same as normal mode) into each No Ego branch header, so users can switch the rate mode that the card + detail table already honor.

- [ ] **Step 1: Write the failing test**

Add to `OffenseSection.noego.test.tsx` (inside the existing No Ego render test, or a new one rendering the section with `noEgoMode`):

```tsx
    // view-mode toggle present in No Ego mode
    expect(screen.getByText('Stat/1s')).toBeInTheDocument();
    expect(screen.getByText('Stat/60s')).toBeInTheDocument();
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL — the toggle is not rendered in the No Ego branch yet.

- [ ] **Step 3: Add the toggle to each section's No Ego header**

In each section's No Ego branch, change the header row to include the `PillToggleGroup` on the right. For OffenseSection replace the header `<div className="flex flex-wrap items-center gap-2 mb-3.5">…</div>` with one that keeps the icon + title and appends the toggle:

```tsx
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                <div className="flex items-center gap-2">
                    <Swords className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                        Offense Detailed
                    </h3>
                </div>
                <PillToggleGroup
                    value={offenseViewMode}
                    onChange={setOffenseViewMode}
                    options={[
                        { value: 'total', label: 'Total' },
                        { value: 'per1s', label: 'Stat/1s' },
                        { value: 'per60s', label: 'Stat/60s' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
            </div>
```

Do the analogous edit in DefenseSection (icon `Shield`/its existing icon, title "Defense Detailed", `defenseViewMode`/`setDefenseViewMode`, accent `var(--section-defense)`) and SupportSection (its existing icon, title "Support Detailed", `supportViewMode`/`setSupportViewMode`, accent `var(--section-support)`). Use each section's existing header icon component — read the current No Ego header to copy it.

Ensure `PillToggleGroup` is imported in each section (it already is for normal mode — verify).

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Validate + commit**

Run: `npm run validate`

```bash
git add src/renderer/stats/sections/OffenseSection.tsx src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx
git commit -m "feat: view-mode toggle in No Ego Offense/Defense/Support sections"
```

---

### Task 5: Defense + Support role-aware section tests

**Files:**
- Create: `src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx`
- Create: `src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx`

**Interfaces:**
- Consumes: the same rendering harness as `OffenseSection.noego.test.tsx`.

Mirror the Offense No Ego role-aware test for Defense and Support so their (currently untested) role-aware path is guarded before Task 7's refactor.

- [ ] **Step 1: Read the Offense test as the template**

Run: `cat src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx`
Note the context fixture shape, how props are passed, and the discriminating-fixture pattern (many damage tightly high, ≥3 support tightly low; active stat set to the damage-style metric; assert support accounts absent from `metric-card-outliers`).

- [ ] **Step 2: Write DefenseSection.noego.test.tsx**

Create a test that renders `DefenseSection` with `noEgoMode`, a `stats.defensePlayers` fixture (≥10 damage-role players tightly high on a higher-is-better defense metric like `damageBarrier`, and ≥3 support-role players tightly low), `stats.roleClassifications` tagging them, and `activeDefenseStat` set to that metric. Assert: a `metric-card-mean` renders, the per-player detail expander button exists, and the low support accounts are NOT in `metric-card-outliers`. Use the section's real required props (read `DefenseSection`'s prop type and provide them, `as any` casts acceptable in the fixture as the Offense test does).

Use a metric where `higherIsBetter` is true for defense (e.g. `damageBarrier`, which is in `DEFENSE_HIGHER_IS_BETTER`) so "low = needs improvement" and the support cohort discriminates.

- [ ] **Step 3: Write SupportSection.noego.test.tsx**

Same shape for `SupportSection` with `stats.supportPlayers`, `activeSupportStat` set to a higher-is-better support metric (e.g. `condiCleanse`), supports vs damage role tags, assert low-role players absent from outliers.

- [ ] **Step 4: Run both**

Run: `npx vitest run src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx --maxWorkers=2`
Expected: PASS. (If a test passes vacuously — i.e. would pass even without role-awareness — adjust the fixture so the low players are >1.5σ below the SQUAD mean but within their cohort, matching the Offense test's discriminating design; verify by temporarily rendering with role-awareness conceptually disabled is not required, but ensure the squad-wide σ math flags them.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx
git commit -m "test: role-aware No Ego coverage for Defense and Support sections"
```

---

### Task 6: Exact rollup card-count assertion

**Files:**
- Modify: `src/web/__tests__/rollup.noego.test.tsx:73-74,83-84`

The rollup No Ego view renders a fixed set of cards (5 commander metrics: Raids Led, Fights Led, Kills, Commander Deaths, KDR; 2 player metrics: Raids Attended, Combat Time). Tighten the loose `>= 1` assertions to the exact counts so a dropped card is caught.

- [ ] **Step 1: Update assertions**

Replace the commander assertion:

```tsx
    const meanEls = commanderSection.querySelectorAll('[data-testid="metric-card-mean"]');
    expect(meanEls.length).toBeGreaterThanOrEqual(1);
```

with:

```tsx
    const meanEls = commanderSection.querySelectorAll('[data-testid="metric-card-mean"]');
    expect(meanEls.length).toBe(5);
```

and the player assertion's `toBeGreaterThanOrEqual(1)` with `toBe(2)`.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/web/__tests__/rollup.noego.test.tsx --maxWorkers=2`
Expected: PASS. If the actual rendered counts differ from 5/2 (e.g. a metric card is skipped because its fixture rows are empty), make the fixture populate all metrics (non-zero values for each commander/player field the cards read) so all 5/2 cards render; do NOT change the assertion to match a partial render.

- [ ] **Step 3: Commit**

```bash
git add src/web/__tests__/rollup.noego.test.tsx
git commit -m "test: assert exact No Ego rollup card counts (5 commander, 2 player)"
```

---

### Task 7: Extract shared `NoEgoMetricSection` component

**Files:**
- Create: `src/renderer/stats/sections/NoEgoMetricSection.tsx`
- Modify: `src/renderer/stats/sections/OffenseSection.tsx`, `DefenseSection.tsx`, `SupportSection.tsx` (replace each `if (noEgoMode && ...)` branch body with a single `<NoEgoMetricSection .../>`)

**Interfaces:**
- Consumes: `StatsTableLayout`, `StatsTableShell`, `MetricDistributionCard`, `PillToggleGroup`, `RoleClassificationEntry` (Task 3), the shared context (`renderProfessionIcon`, `formatWithCommas`, `sidebarListClass`).
- Produces:
  ```ts
  export interface NoEgoMetricDef { id: string; label: string; }
  export interface NoEgoMetricSectionProps {
    title: string;
    icon: React.ReactNode;          // section header icon element
    accentColor: string;            // e.g. 'var(--section-offense)'
    sidebarLabel: string;           // e.g. 'Offensive Tabs'
    metrics: NoEgoMetricDef[];      // full metric list for the sidebar
    filteredMetrics: NoEgoMetricDef[];
    players: any[];                 // section player rows (stats.{x}Players)
    roleClassifications?: RoleClassificationEntry[];
    activeStatId: string;
    setActiveStatId: (id: string) => void;
    search: string;
    setSearch: (v: string) => void;
    viewMode: 'total' | 'per1s' | 'per60s';
    setViewMode: (v: 'total' | 'per1s' | 'per60s') => void;
    detailOpen: boolean;
    setDetailOpen: (v: boolean | ((p: boolean) => boolean)) => void;
    higherIsBetter: (metric: NoEgoMetricDef) => boolean;
    // pre-view-mode total for a row+metric (the section's totalValue):
    resolveTotal: (row: any, metric: NoEgoMetricDef) => number;
    // true when the metric is a percent/rate (skip per-1s/per-60s division):
    isRateOrPercent: (metric: NoEgoMetricDef) => boolean;
    // fight time in ms for a row (offense: totalFightMs; defense/support: activeMs/totalFightMs):
    fightTimeMs: (row: any) => number;
    formatValue: (metric: NoEgoMetricDef, val: number) => string;
  }
  export const NoEgoMetricSection: React.FC<NoEgoMetricSectionProps>;
  ```

The component owns: the header (icon + title + view-mode `PillToggleGroup`), the `StatsTableLayout` (sidebar metric selector built from `filteredMetrics`/`activeStatId`/`setActiveStatId`/`search`, content = large `roleAware` `MetricDistributionCard` for the active metric + the per-player detail expander). It computes the role map from `roleClassifications`, resolves the active metric, derives per-view-mode values via `resolveTotal`+`isRateOrPercent`+`fightTimeMs`, and renders the detail table (same columns/sort as today).

This is a refactor: the rendered output must match the current per-section output. Tasks 1–6 (esp. the Offense/Defense/Support No Ego tests) are the regression guard.

- [ ] **Step 1: Read the three current branches**

Run: `sed -n '/if (noEgoMode/,/^    }/p' src/renderer/stats/sections/OffenseSection.tsx` (and the Defense/Support equivalents) to capture the exact shell, detail-table columns, sort, and per-section differences (offenseTotals vs defenseTotals vs supportTotals — these live inside each section's `resolveTotal`; the `condiCleanse`/`cleanseScope` handling stays inside Support's `resolveTotal`; the fight-time field differs).

- [ ] **Step 2: Create `NoEgoMetricSection.tsx`**

Implement the component per the interface above, lifting the shell verbatim from the current Offense branch (header now includes the Task 4 toggle; card has `large roleAware`; detail expander + `StatsTableShell` table identical, parameterized by the props). The role map + `roleOf` (with `split('::')[0]` fallback) live here, typed via `RoleClassificationEntry`.

- [ ] **Step 3: Switch OffenseSection to use it**

Replace the Offense `if (noEgoMode && stats.offensePlayers.length > 0) { ... return (...) }` body with:

```tsx
    if (noEgoMode && stats.offensePlayers.length > 0) {
        return (
            <NoEgoMetricSection
                title="Offense Detailed"
                icon={<Swords className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />}
                accentColor="var(--section-offense)"
                sidebarLabel="Offensive Tabs"
                metrics={OFFENSE_METRICS}
                filteredMetrics={filteredOffenseMetrics}
                players={stats.offensePlayers}
                roleClassifications={stats.roleClassifications}
                activeStatId={activeOffenseStat}
                setActiveStatId={setActiveOffenseStat}
                search={offenseSearch}
                setSearch={setOffenseSearch}
                viewMode={offenseViewMode}
                setViewMode={setOffenseViewMode}
                detailOpen={detailOpen}
                setDetailOpen={setDetailOpen}
                higherIsBetter={(m) => !OFFENSE_LOWER_IS_BETTER.has(m.id)}
                resolveTotal={(row, m) => /* the section's existing totalValue(row, m) */ totalValue(row, m)}
                isRateOrPercent={(m) => !!(m as any).isPercent || !!(m as any).isRate}
                fightTimeMs={(row) => row.totalFightMs || 0}
                formatValue={(m, val) => {
                    const decimals = roundCountStats && !(m as any).isPercent && offenseViewMode === 'total' ? 0 : 2;
                    const formatted = formatWithCommas(val, decimals);
                    return (m as any).isPercent ? `${formatted}%` : formatted;
                }}
            />
        );
    }
```

Keep the section's `totalValue` helper (move it above the branch if needed). Run the Offense No Ego test after this step:
Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: PASS (output unchanged).

- [ ] **Step 4: Switch DefenseSection and SupportSection the same way**

Defense: `DEFENSE_METRICS`, `filteredDefenseMetrics`, `stats.defensePlayers`, `activeDefenseStat`, `defenseViewMode`, accent `var(--section-defense)`, `higherIsBetter={(m)=>DEFENSE_HIGHER_IS_BETTER.has(m.id)}`, `resolveTotal` = the section's defense total helper, `fightTimeMs` = the section's fight-time field (e.g. `row.activeMs` or `row.totalFightMs` — use whatever the current Defense detail table uses).
Support: `SUPPORT_METRICS`, `filteredSupportMetrics`, `stats.supportPlayers`, `activeSupportStat`, `supportViewMode`, accent `var(--section-support)`, `higherIsBetter={(m)=>!SUPPORT_LOWER_IS_BETTER.has(m.id)}`, `resolveTotal` = the section's support total helper (including `condiCleanse`/`cleanseScope`), `isRateOrPercent` per support metric, `formatValue` honoring `isTime` decimals.

Run: `npx vitest run src/renderer/stats/sections/__tests__/ --maxWorkers=2`
Expected: PASS (Offense/Defense/Support No Ego tests all green).

- [ ] **Step 5: Confirm no leftover dead code**

Search each section for now-unused helpers/imports (e.g. a stale `makeFormatValue`, unused `ChevronDown`/`StatsTableShell` if fully moved). Remove them. Run `npm run validate` (lint will flag unused).

If the abstraction turns out to require section-specific branching that makes `NoEgoMetricSection` significantly more complex than the three current branches combined, STOP and report DONE_WITH_CONCERNS describing the leak — a forced bad abstraction is worse than the reviewed duplication.

- [ ] **Step 6: Validate + commit**

Run: `npm run validate`
Expected: pass.

```bash
git add src/renderer/stats/sections/NoEgoMetricSection.tsx src/renderer/stats/sections/OffenseSection.tsx src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx
git commit -m "refactor: extract shared NoEgoMetricSection for Offense/Defense/Support"
```

---

### Task 8: Full validation sweep

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite** — Run: `npx vitest run --maxWorkers=2` — Expected: all pass.
- [ ] **Step 2: Validate** — Run: `npm run validate` — Expected: typecheck + lint clean.
- [ ] **Step 3: Web build** — Run: `npm run build:web` — Expected: succeeds.
- [ ] **Step 4: Commit (only if a fix was needed)** — `git add -A && git commit -m "chore: No Ego follow-ups validation fixes"`

---

## Notes for the implementer

- Tasks 1–6 are independent and low-risk; Task 7 is the only structural change and relies on the section No Ego tests (Offense from prior work + Defense/Support from Task 5) as its regression net — do Task 5 before Task 7.
- Task 7 must preserve rendered output; it is a DRY refactor, not a redesign. The view-mode toggle added in Task 4 should live in `NoEgoMetricSection` after extraction (it moves from the three branches into the one component).
- `stats` is typed `any`; Task 3 only adds an element type for the role array, it does not type the whole `stats` object.
