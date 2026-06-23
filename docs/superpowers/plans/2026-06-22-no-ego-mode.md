# No Ego Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single master "No Ego mode" toggle that, when on, removes all competitive/ranking framing across the desktop app and web report and replaces it with squad-level distribution readouts (average, deviation, needs-improvement outliers).

**Architecture:** A pure shared util (`src/shared/squadStats.ts`) summarizes any list of per-player values into `{mean, stdDev, min, max, players, needsImprovementOutliers}`, choosing the outlier end via the metric's `higherIsBetter` flag. A shared presentation component (`MetricDistributionCard`) renders one metric as a dot-plot + hard numbers + neutral low/needs-improvement callouts. A new `noEgoMode` boolean on `IStatsViewSettings` gates section behavior; when on it overrides `showMvp`/`showTopStats`, swaps Top Players and the Offense/Defense/Support sections to metric-card layouts, and hides Top Skills and Player Comparison. The web report reuses the same components and reads the baked flag from `report.json`.

**Tech Stack:** TypeScript, React 18, Vite (three targets), Vitest + jsdom, Tailwind CSS variables, lucide-react.

## Global Constraints

- Run vitest with limited parallelism: `npx vitest run --maxWorkers=2` (per global instructions; the project config may already cap this — respect it if ≤2).
- `npm run validate` (typecheck + ESLint with `--max-warnings 0`) must pass before any commit that touches `.ts`/`.tsx`.
- The leaderboard/per-player row shape used throughout is `{ account: string; value: number; profession?: string; professionList?: string[]; count?: number; rank?: number }`.
- The metric catalog is `TOP_STATS_CATALOG` in `src/renderer/stats/topStatsCatalog.ts`; each def carries `higherIsBetter: boolean`. Outlier direction MUST be derived from this flag, never hard-coded.
- Outlier threshold is fixed at **1.5σ** (population standard deviation). Do not add it to settings.
- `src/shared/` modules must NOT import lucide-react or other renderer-only deps (the audit TS sandbox breaks on them). `squadStats.ts` must stay dependency-free.
- High-end values are NEVER styled as "good"/celebrated. Only the needs-improvement end gets named callouts.
- New `noEgoMode` defaults to `false`. When off, behavior is byte-for-byte the existing behavior.

---

### Task 1: Squad-stat math util

**Files:**
- Create: `src/shared/squadStats.ts`
- Test: `src/shared/__tests__/squadStats.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SquadStatPlayer {
    account: string;
    value: number;
    profession?: string;
    professionList?: string[];
  }
  export interface SquadStatSummary {
    mean: number;
    stdDev: number;        // population standard deviation
    min: number;
    max: number;
    count: number;
    players: SquadStatPlayer[];               // sorted by value ascending (for the dot-plot)
    needsImprovementOutliers: SquadStatPlayer[]; // players beyond threshold*stdDev on the bad end
  }
  export function computeSquadStat(
    players: SquadStatPlayer[],
    higherIsBetter: boolean,
    sigmaThreshold?: number, // default 1.5
  ): SquadStatSummary;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/__tests__/squadStats.test.ts
import { describe, it, expect } from 'vitest';
import { computeSquadStat } from '../squadStats';

const players = (vals: number[]) =>
  vals.map((value, i) => ({ account: `P${i}`, value, profession: 'Guardian' }));

describe('computeSquadStat', () => {
  it('computes mean, population stdDev, min, max, count', () => {
    const s = computeSquadStat(players([2, 4, 4, 4, 5, 5, 7, 9]), true);
    expect(s.mean).toBe(5);
    expect(s.stdDev).toBeCloseTo(2, 5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
    expect(s.count).toBe(8);
  });

  it('sorts players ascending for the dot-plot', () => {
    const s = computeSquadStat(players([9, 1, 5]), true);
    expect(s.players.map((p) => p.value)).toEqual([1, 5, 9]);
  });

  it('flags LOW outliers when higherIsBetter (low end needs improvement)', () => {
    // mean 100, one player far below
    const s = computeSquadStat(players([100, 100, 100, 100, 0]), true, 1.5);
    expect(s.needsImprovementOutliers.map((p) => p.value)).toEqual([0]);
  });

  it('flags HIGH outliers when NOT higherIsBetter (e.g. deaths/damage taken)', () => {
    const s = computeSquadStat(players([0, 0, 0, 0, 100]), false, 1.5);
    expect(s.needsImprovementOutliers.map((p) => p.value)).toEqual([100]);
  });

  it('never flags the celebrated end as needs-improvement', () => {
    // higherIsBetter: a single very HIGH player must NOT be an outlier
    const s = computeSquadStat(players([0, 0, 0, 0, 100]), true, 1.5);
    expect(s.needsImprovementOutliers).toEqual([]);
  });

  it('returns no outliers when stdDev is 0 (all equal)', () => {
    const s = computeSquadStat(players([3, 3, 3]), true);
    expect(s.stdDev).toBe(0);
    expect(s.needsImprovementOutliers).toEqual([]);
  });

  it('handles single player and empty input safely', () => {
    const single = computeSquadStat(players([42]), true);
    expect(single.mean).toBe(42);
    expect(single.stdDev).toBe(0);
    expect(single.needsImprovementOutliers).toEqual([]);

    const empty = computeSquadStat([], true);
    expect(empty.count).toBe(0);
    expect(empty.mean).toBe(0);
    expect(empty.players).toEqual([]);
    expect(empty.needsImprovementOutliers).toEqual([]);
  });

  it('ignores non-finite values', () => {
    const s = computeSquadStat(
      [{ account: 'A', value: 10 }, { account: 'B', value: NaN }, { account: 'C', value: 20 }],
      true,
    );
    expect(s.count).toBe(2);
    expect(s.mean).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/squadStats.test.ts --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "../squadStats"` / `computeSquadStat is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/squadStats.ts
export interface SquadStatPlayer {
  account: string;
  value: number;
  profession?: string;
  professionList?: string[];
}

export interface SquadStatSummary {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
  players: SquadStatPlayer[];
  needsImprovementOutliers: SquadStatPlayer[];
}

export function computeSquadStat(
  players: SquadStatPlayer[],
  higherIsBetter: boolean,
  sigmaThreshold = 1.5,
): SquadStatSummary {
  const valid = (Array.isArray(players) ? players : [])
    .map((p) => ({ ...p, value: Number(p?.value) }))
    .filter((p) => Number.isFinite(p.value));

  const count = valid.length;
  if (count === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0, players: [], needsImprovementOutliers: [] };
  }

  const sorted = [...valid].sort((a, b) => a.value - b.value);
  const values = sorted.map((p) => p.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / count;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);
  const min = values[0];
  const max = values[values.length - 1];

  let needsImprovementOutliers: SquadStatPlayer[] = [];
  if (stdDev > 0) {
    const cutoff = sigmaThreshold * stdDev;
    needsImprovementOutliers = sorted.filter((p) =>
      higherIsBetter ? p.value < mean - cutoff : p.value > mean + cutoff,
    );
  }

  return { mean, stdDev, min, max, count, players: sorted, needsImprovementOutliers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/squadStats.test.ts --maxWorkers=2`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/squadStats.ts src/shared/__tests__/squadStats.test.ts
git commit -m "feat: add squadStats util for No Ego distribution math"
```

---

### Task 2: Add `noEgoMode` setting + override plumbing

**Files:**
- Modify: `src/renderer/global.d.ts:76-91` (interface) and `:223-244` (defaults)
- Modify: `src/renderer/StatsView.tsx:230-236` (read + override)
- Test: `src/renderer/__tests__/noEgoSettings.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `IStatsViewSettings.noEgoMode: boolean`; `DEFAULT_STATS_VIEW_SETTINGS.noEgoMode = false`. In `StatsView`, a derived `const noEgoMode = activeStatsViewSettings.noEgoMode === true;` and overridden `showTopStats`/`showMvp` (see Step 4).

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/__tests__/noEgoSettings.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global';

describe('noEgoMode setting', () => {
  it('defaults to false', () => {
    expect(DEFAULT_STATS_VIEW_SETTINGS.noEgoMode).toBe(false);
  });
});
```

Note: `global.d.ts` is imported via `../global` (no extension) — confirm an existing test imports the same path; if the project re-exports defaults from `global.d.ts` directly, mirror whatever path neighboring tests already use (`grep -rn "from '../global'" src/renderer/__tests__`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/noEgoSettings.test.ts --maxWorkers=2`
Expected: FAIL — `expected undefined to be false`.

- [ ] **Step 3: Add the field and default**

In `src/renderer/global.d.ts`, inside `interface IStatsViewSettings` (after `mvpBoonMetric` on line ~90), add:

```ts
    // No Ego mode: removes ranking/MVP framing everywhere; shows squad
    // average/deviation/needs-improvement outliers instead. Overrides
    // showTopStats/showMvp when true.
    noEgoMode: boolean;
```

In `DEFAULT_STATS_VIEW_SETTINGS` (after `mvpBoonMetric: 'uptime',` on line ~235), add:

```ts
    noEgoMode: false,
```

- [ ] **Step 4: Wire the override in StatsView**

In `src/renderer/StatsView.tsx`, replace lines 232-233:

```ts
    const showTopStats = activeStatsViewSettings.showTopStats;
    const showMvp = activeStatsViewSettings.showMvp;
```

with:

```ts
    const noEgoMode = activeStatsViewSettings.noEgoMode === true;
    // No Ego mode forces the squad-summary layout on and the MVP podium off.
    const showTopStats = noEgoMode ? true : activeStatsViewSettings.showTopStats;
    const showMvp = noEgoMode ? false : activeStatsViewSettings.showMvp;
```

(`noEgoMode` is now available to pass into sections in later tasks.)

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/renderer/__tests__/noEgoSettings.test.ts --maxWorkers=2`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/global.d.ts src/renderer/StatsView.tsx src/renderer/__tests__/noEgoSettings.test.ts
git commit -m "feat: add noEgoMode setting and StatsView override plumbing"
```

---

### Task 3: Settings UI toggle

**Files:**
- Modify: `src/renderer/SettingsView.tsx` (near the `showTopStats`/`showMvp` toggles, ~lines 2188-2195)

**Interfaces:**
- Consumes: `IStatsViewSettings.noEgoMode` (Task 2).
- Produces: a user-visible toggle that sets `noEgoMode`.

- [ ] **Step 1: Read the existing toggle markup**

Run: `sed -n '2180,2200p' src/renderer/SettingsView.tsx` to see how `showTopStats`/`showMvp` toggles are wired (the `onChange` handler that updates stats-view settings, and the toggle component used).

- [ ] **Step 2: Add the No Ego toggle**

Immediately before the `showTopStats` toggle, add a toggle following the exact same pattern the file already uses (same toggle component, same settings-update handler), bound to `noEgoMode`. Label: **"No Ego mode"**. Description: **"Hide MVP, rankings, and leaderboards. Show squad averages, spread, and areas to improve instead — across the app and web reports."**

When `noEgoMode` is on, render the `showTopStats` and `showMvp` toggles as disabled (greyed) since they have no effect — match however the file disables dependent toggles elsewhere (look for an existing `disabled=` usage to copy the idiom). If no such idiom exists, leave them enabled but unaffected; do not invent new styling.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`
Manually: open Settings → stats section, confirm the "No Ego mode" toggle appears, flips, and persists across an app reload (it writes through the same handler the neighbors use, so persistence is automatic). Stop the dev server.

- [ ] **Step 4: Validate + commit**

Run: `npm run validate`
Expected: pass.

```bash
git add src/renderer/SettingsView.tsx
git commit -m "feat: add No Ego mode toggle to settings"
```

---

### Task 4: `MetricDistributionCard` shared component

**Files:**
- Create: `src/renderer/stats/components/MetricDistributionCard.tsx`
- Test: `src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx`

**Interfaces:**
- Consumes: `computeSquadStat`, `SquadStatSummary`, `SquadStatPlayer` from `src/shared/squadStats` (Task 1).
- Produces:
  ```ts
  export interface MetricDistributionCardProps {
    title: string;
    accentColor: string;                 // hex, from catalog def.color
    higherIsBetter: boolean;
    players: SquadStatPlayer[];           // per-player values for this metric
    formatValue: (n: number) => string;  // caller supplies metric-aware formatting
    unit?: string;
    renderProfessionIcon?: (profession: string, professionList: string[] | undefined, className: string) => React.ReactNode;
  }
  export const MetricDistributionCard: React.FC<MetricDistributionCardProps>;
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricDistributionCard } from '../MetricDistributionCard';

const players = (vals: number[]) =>
  vals.map((value, i) => ({ account: `Player${i}`, value, profession: 'Guardian' }));

describe('MetricDistributionCard', () => {
  it('renders title, average and deviation hard numbers', () => {
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={players([2, 4, 4, 4, 5, 5, 7, 9])}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    expect(screen.getByText('Cleanses')).toBeInTheDocument();
    expect(screen.getByTestId('metric-card-mean')).toHaveTextContent('5');
    expect(screen.getByTestId('metric-card-stddev')).toHaveTextContent('2');
  });

  it('names needs-improvement outliers and never celebrates the high end', () => {
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={players([100, 100, 100, 100, 0]).map((p, i) => ({ ...p, account: i === 4 ? 'LowGuy' : p.account }))}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    const callouts = screen.getByTestId('metric-card-outliers');
    expect(callouts).toHaveTextContent('LowGuy');
    // No "MVP"/"top"/crown language anywhere
    expect(screen.queryByText(/MVP|top performer|#1/i)).toBeNull();
  });

  it('shows a quiet consistent-squad note when there are no outliers', () => {
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={players([5, 5, 5])}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    expect(screen.getByTestId('metric-card-outliers')).toHaveTextContent(/consistent/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../MetricDistributionCard`.

- [ ] **Step 3: Implement the component**

```tsx
// src/renderer/stats/components/MetricDistributionCard.tsx
import React from 'react';
import { computeSquadStat, type SquadStatPlayer } from '../../../shared/squadStats';

export interface MetricDistributionCardProps {
  title: string;
  accentColor: string;
  higherIsBetter: boolean;
  players: SquadStatPlayer[];
  formatValue: (n: number) => string;
  unit?: string;
  renderProfessionIcon?: (
    profession: string,
    professionList: string[] | undefined,
    className: string,
  ) => React.ReactNode;
}

export const MetricDistributionCard: React.FC<MetricDistributionCardProps> = ({
  title,
  accentColor,
  higherIsBetter,
  players,
  formatValue,
  unit = '',
  renderProfessionIcon,
}) => {
  const s = computeSquadStat(players, higherIsBetter);
  const range = s.max - s.min;
  const pos = (v: number) => (range > 0 ? ((v - s.min) / range) * 100 : 50);
  const outlierKeys = new Set(s.needsImprovementOutliers.map((p) => p.account));

  // σ band as a fraction of the plotted range, centered on the mean
  const bandLeft = range > 0 ? Math.max(0, ((s.mean - s.stdDev - s.min) / range) * 100) : 0;
  const bandRight = range > 0 ? Math.min(100, ((s.mean + s.stdDev - s.min) / range) * 100) : 100;

  return (
    <div
      className="border rounded-[var(--radius-md)] p-4 flex flex-col gap-3"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div
          className="text-xs font-bold uppercase tracking-wider truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {title}
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">{s.count} players</div>
      </div>

      {/* Hard numbers */}
      <div className="flex items-end gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Avg</div>
          <div data-testid="metric-card-mean" className="text-2xl font-bold text-white">
            {formatValue(s.mean)} <span className="text-sm font-normal text-[color:var(--text-secondary)]">{unit}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">σ Deviation</div>
          <div data-testid="metric-card-stddev" className="text-lg font-semibold text-[color:var(--text-secondary)]">
            {formatValue(s.stdDev)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Range</div>
          <div className="text-sm text-[color:var(--text-secondary)]">
            {formatValue(s.min)}–{formatValue(s.max)}
          </div>
        </div>
      </div>

      {/* Dot-plot: every player a neutral dot; σ band shaded; mean line. */}
      <div className="relative h-8 mt-1">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
          style={{ left: `${bandLeft}%`, width: `${Math.max(0, bandRight - bandLeft)}%`, background: `${accentColor}22` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: `${pos(s.mean)}%`, background: 'var(--border-hover)' }}
        />
        {s.players.map((p) => (
          <div
            key={p.account}
            title={`${p.account}: ${formatValue(p.value)}`}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{
              left: `${pos(p.value)}%`,
              background: outlierKeys.has(p.account) ? accentColor : 'var(--text-muted)',
              outline: outlierKeys.has(p.account) ? `1px solid ${accentColor}` : 'none',
            }}
          />
        ))}
      </div>

      {/* Needs-improvement callouts (neutral language, low/bad end only) */}
      <div
        data-testid="metric-card-outliers"
        className="border-t border-[color:var(--border-subtle)] pt-2 text-xs text-[color:var(--text-secondary)]"
      >
        {s.needsImprovementOutliers.length ? (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
              Most room to improve
            </div>
            {s.needsImprovementOutliers.map((p) => (
              <div key={p.account} className="flex items-center gap-2 min-w-0">
                {renderProfessionIcon?.(p.profession || 'Unknown', p.professionList, 'w-4 h-4')}
                <span className="truncate flex-1">{p.account}</span>
                <span className="font-mono text-[color:var(--text-secondary)]">{formatValue(p.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[color:var(--text-muted)]">Squad is consistent here.</span>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx --maxWorkers=2`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/components/MetricDistributionCard.tsx src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx
git commit -m "feat: add MetricDistributionCard for No Ego squad readouts"
```

---

### Task 5: Top Players → Squad Summary in No Ego mode

**Files:**
- Modify: `src/renderer/stats/sections/TopPlayersSection.tsx`
- Modify: `src/renderer/StatsView.tsx` (both `TopPlayersSection` render sites: ~4264 and ~4709 — pass the new prop)
- Test: `src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx` (new)

**Interfaces:**
- Consumes: `noEgoMode` (Task 2), `MetricDistributionCard` (Task 4), `computeSquadStat` (Task 1), `TOP_STATS_CATALOG` + `enabledTopStats`, and the leaderboard maps already read in this file (`stats.leaderboards`, `stats.topStatsLeaderboardsPerSecond`, `stats.topStatsLeaderboardsPerMinute`).
- Produces: `TopPlayersSectionProps.noEgoMode?: boolean`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopPlayersSection } from '../TopPlayersSection';
import { StatsSharedContext } from '../../StatsViewContext';

// Minimal context value; fill required fields per StatsSharedContextValue.
const ctx: any = {
  stats: {
    leaderboards: {
      cleanses: [
        { account: 'A', value: 100, profession: 'Guardian' },
        { account: 'B', value: 100, profession: 'Guardian' },
        { account: 'C', value: 100, profession: 'Guardian' },
        { account: 'LowGuy', value: 0, profession: 'Guardian' },
      ],
    },
  },
  formatWithCommas: (n: number) => String(n),
  renderProfessionIcon: () => null,
};

const renderWith = (props: any) =>
  render(
    <StatsSharedContext.Provider value={ctx}>
      <TopPlayersSection {...props} />
    </StatsSharedContext.Provider>,
  );

const base = {
  showTopStats: true,
  showMvp: false,
  topStatsMode: 'total' as const,
  expandedLeader: null,
  setExpandedLeader: () => {},
  formatTopStatValue: (n: number) => String(Math.round(n)),
  isMvpStatEnabled: () => true,
  enabledTopStats: ['cleanses'],
};

describe('TopPlayersSection — No Ego', () => {
  it('shows squad-summary cards and no podium when noEgoMode', () => {
    renderWith({ ...base, noEgoMode: true });
    expect(screen.getByTestId('squad-summary')).toBeInTheDocument();
    expect(screen.queryByText('Offensive MVP')).toBeNull();
    expect(screen.getByTestId('metric-card-outliers')).toHaveTextContent('LowGuy');
  });

  it('shows the normal leaderboard layout when noEgoMode is off', () => {
    renderWith({ ...base, noEgoMode: false });
    expect(screen.queryByTestId('squad-summary')).toBeNull();
  });
});
```

Before implementing, confirm `StatsSharedContext` is exported from `src/renderer/stats/StatsViewContext.tsx`. If only the hook `useStatsSharedContext` is exported, export the raw context too (add `export const StatsSharedContext = ...` if needed) so the test can wrap it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL — `noEgoMode` not handled / no `squad-summary` testid.

- [ ] **Step 3: Add the prop and the No Ego branch**

In `TopPlayersSectionProps` add:

```ts
    noEgoMode?: boolean;
```

In the component destructuring add `noEgoMode = false,`. Then, right after computing `topStatsLeaderboards`, `enabledSet`, `enabledDefs`, and `formatValue` (the existing code around lines 156-179), insert a No Ego early return that reuses the same leaderboard source and per-def formatting:

```tsx
  if (noEgoMode) {
    return (
      <div data-testid="squad-summary">
        <div className="flex items-center gap-2 mb-3.5">
          <Trophy className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
            Squad Summary
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enabledDefs.map((def) => {
            const rows =
              def.source.kind === 'boon'
                ? (stats.boonLeaderboards?.[def.id] ?? [])
                : (topStatsLeaderboards?.[def.source.key] ?? []);
            const players = (Array.isArray(rows) ? rows : []).map((r: any) => ({
              account: r.account,
              value: Number(r.value ?? 0),
              profession: r.profession,
              professionList: r.professionList,
            }));
            return (
              <MetricDistributionCard
                key={def.id}
                title={getCardTitle(def, isPerSecond, isPerMinute)}
                accentColor={def.color}
                higherIsBetter={def.higherIsBetter}
                players={players}
                unit={def.unit ?? ''}
                formatValue={(n) => formatValue(def, n)}
                renderProfessionIcon={renderProfessionIcon}
              />
            );
          })}
        </div>
      </div>
    );
  }
```

Add the import at the top: `import { MetricDistributionCard } from '../components/MetricDistributionCard';`

Note on boon source: confirm the boon leaderboard map name by reading how the existing non-No-Ego code resolves boon cards in this file (search for `boon` / `boonLeaderboards` / `def.source.kind === 'boon'`). Use whatever map/getter the existing leader cards use for boons; the placeholder `stats.boonLeaderboards?.[def.id]` above must be replaced with the real accessor if it differs.

- [ ] **Step 4: Pass the prop from StatsView**

At BOTH `TopPlayersSection` render sites in `src/renderer/StatsView.tsx` (~line 4264 and ~line 4709), add the prop `noEgoMode={noEgoMode}` alongside the existing `showTopStats`/`showMvp` props.

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx --maxWorkers=2`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/sections/TopPlayersSection.tsx src/renderer/StatsView.tsx src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx
git commit -m "feat: Top Players becomes Squad Summary in No Ego mode"
```

---

### Task 6: Offense / Defense / Support → metric cards + collapsed grid

**Files:**
- Modify: `src/renderer/stats/sections/OffenseSection.tsx`
- Modify: `src/renderer/stats/sections/DefenseSection.tsx`
- Modify: `src/renderer/stats/sections/SupportSection.tsx`
- Modify: `src/renderer/StatsView.tsx` (all six render sites: ~4363, ~4471, ~4532, ~4796, ~4909, ~5057 — pass `noEgoMode`)
- Test: `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx` (new)

**Interfaces:**
- Consumes: `noEgoMode` (Task 2), `MetricDistributionCard` (Task 4).
- Produces: a `noEgoMode?: boolean` prop on each of the three section prop types.

Each section currently renders a player×metric grid. In No Ego mode it must render a **list of `MetricDistributionCard`s (one per metric column the table shows)** with the **full grid collapsed behind an expander** (default collapsed).

- [ ] **Step 1: Read one section to learn its metric set + row data**

Run: `sed -n '1,120p' src/renderer/stats/sections/OffenseSection.tsx`
Identify (a) the array of metric column definitions the table iterates (id, label, higherIsBetter or a lookup into `TOP_STATS_CATALOG`, accent color, value formatter) and (b) the per-player row array and how each player's value for a metric is read. You will reuse exactly those to build `players` arrays per metric.

- [ ] **Step 2: Write the failing test (Offense as the representative)**

```tsx
// src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OffenseSection } from '../OffenseSection';
import { StatsSharedContext } from '../../StatsViewContext';

// Build a context + props matching OffenseSection's real shape (read the file
// in Step 1 and fill these to match). The assertions below are the contract.
const ctx: any = { /* minimal stats with >=4 players having offense metrics */ };

describe('OffenseSection — No Ego', () => {
  it('renders metric distribution cards and hides rank numbers', () => {
    render(
      <StatsSharedContext.Provider value={ctx}>
        {/* spread the section's required props; add noEgoMode */}
        <OffenseSection {...({} as any)} noEgoMode />
      </StatsSharedContext.Provider>,
    );
    // At least one distribution card present
    expect(screen.getAllByTestId('metric-card-mean').length).toBeGreaterThan(0);
    // Full grid is collapsed by default behind an expander
    expect(screen.getByRole('button', { name: /per-player detail|show detail|detailed/i })).toBeInTheDocument();
  });
});
```

Note: this test's context/props MUST be completed against the real `OffenseSection` signature found in Step 1. Do not leave `{}` — populate with a 4+ player fixture so `computeSquadStat` produces a card. Treat the two assertions (cards present, expander present) as the fixed contract.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 4: Implement the No Ego branch in each section**

For each of `OffenseSection`, `DefenseSection`, `SupportSection`:
1. Add `noEgoMode?: boolean` to the props type and destructure with default `false`.
2. Add `import { MetricDistributionCard } from '../components/MetricDistributionCard';`.
3. When `noEgoMode` is true, render:
   - A responsive grid of `MetricDistributionCard`, one per metric column the table shows. Build each card's `players` array from the same per-player rows the grid uses: `{ account, value: <that player's value for this metric>, profession, professionList }`. Use the metric's `higherIsBetter` (from `TOP_STATS_CATALOG` lookup by id, or the column def if it already carries the flag), `color`, `unit`, and the section's existing value formatter for that metric.
   - Below the cards, an expander button (default collapsed) labeled "Per-player detail" that, when expanded, renders the **existing grid unchanged** (no rank numbers/best-value highlight needed inside — but if the existing grid adds a `{idx + 1}` rank marker or best-value highlight, suppress those when `noEgoMode` by guarding that markup with `!noEgoMode`).
   - Use a local `useState(false)` for the expander. Match the expander idiom already used elsewhere in the codebase if one exists (search for `aria-expanded` / existing collapsible sections); otherwise a plain button toggling the state is fine.

- [ ] **Step 5: Pass `noEgoMode` from StatsView**

Add `noEgoMode={noEgoMode}` to all six section render sites listed in **Files**.

- [ ] **Step 6: Run test + validate**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: PASS.
Run: `npm run validate`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/OffenseSection.tsx src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx src/renderer/StatsView.tsx src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx
git commit -m "feat: Offense/Defense/Support show metric cards in No Ego mode"
```

---

### Task 7: Hide Top Skills and Player Comparison in No Ego mode

**Files:**
- Modify: `src/renderer/StatsView.tsx` (TopSkills sites ~4276, ~4719; PlayerComparison site ~5155)
- Test: extend `src/renderer/stats/sections/__tests__/` via the integration test in Task 8 (no separate test here — covered by Task 8 assertions).

**Interfaces:**
- Consumes: `noEgoMode` (Task 2).

- [ ] **Step 1: Gate the render sites**

In `src/renderer/StatsView.tsx`, wrap each `TopSkillsSection` and the `PlayerComparisonSection` render so it is omitted when `noEgoMode` is true. Two patterns appear in the file:
- Direct render via `renderSectionWrap(<TopSkillsSection .../>)` (~4276): change to `{!noEgoMode && renderSectionWrap(<TopSkillsSection .../>)}`.
- Section-list entries `{ id: 'top-skills-outgoing', element: <TopSkillsSection .../> }` (~4719) and `{ id: 'player-comparison', element: <PlayerComparisonSection .../> }` (~5155): these are array items. After the array is built, filter them out when `noEgoMode`, OR guard each with a conditional spread. Concretely, find where this array is defined and add a `.filter(...)` that drops `top-skills-outgoing`, `top-skills-incoming` (if present), and `player-comparison` ids when `noEgoMode`. Read the surrounding code to choose the cleaner of the two; prefer the post-build `.filter` so all skill/comparison variants are caught.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: hide Top Skills and Player Comparison in No Ego mode"
```

---

### Task 8: StatsView integration test for No Ego mode

**Files:**
- Create: `src/renderer/__tests__/StatsView.noego.integration.test.tsx` (mirror the setup of the existing `StatsView.integration.test.tsx`)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Read the existing integration test for setup conventions**

Run: `sed -n '1,80p' src/renderer/__tests__/StatsView.integration.test.tsx`
Reuse its data fixture/builder and the way it passes `statsViewSettings`.

- [ ] **Step 2: Write the test**

Using the same fixture, render `StatsView` twice via its `statsViewSettings` prop:

```tsx
// Assertions for noEgoMode: true
expect(screen.getByTestId('squad-summary')).toBeInTheDocument();
expect(screen.queryByText('Offensive MVP')).toBeNull();
expect(screen.queryByText('Defensive MVP')).toBeNull();
// Top Skills section header absent
expect(screen.queryByText(/Top Skills/i)).toBeNull();
// Player comparison absent
expect(screen.queryByText(/Player Comparison|head-to-head/i)).toBeNull();

// Assertions for noEgoMode: false (control)
expect(screen.queryByTestId('squad-summary')).toBeNull();
```

Match the exact section header strings to what the components render (grep the section files for their `<h3>`/title text and use those literals).

- [ ] **Step 3: Run + validate**

Run: `npx vitest run src/renderer/__tests__/StatsView.noego.integration.test.tsx --maxWorkers=2`
Expected: PASS.
Run: `npm run validate`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/__tests__/StatsView.noego.integration.test.tsx
git commit -m "test: StatsView No Ego mode integration coverage"
```

---

### Task 9: Web report + rollup honor the baked flag

**Files:**
- Inspect/Modify: `src/web/reportApp.tsx`, `src/web/rollup.ts`
- Inspect: the main-process web-report builder that writes `report.json` (search for where `statsViewSettings` / settings are serialized into the report payload)
- Test: `src/web/__tests__/rollup.noego.test.ts` (new, only if rollup display logic is extracted as testable functions; otherwise a reportApp render test)

**Interfaces:**
- Consumes: `noEgoMode` baked in `report.json` (already part of `IStatsViewSettings`), `MetricDistributionCard`, `computeSquadStat`.

- [ ] **Step 1: Confirm the flag bakes into report.json automatically**

Run: `grep -rn "statsViewSettings\|noEgoMode\|StatsViewSettings" src/main src/web | grep -iv test`
Confirm `report.json` carries the full `IStatsViewSettings` (so `noEgoMode` rides along with no extra work). If the builder cherry-picks individual settings fields rather than spreading the whole object, add `noEgoMode` to that projection. Document which case applies in the commit message.

- [ ] **Step 2: Verify StatsView path already covers the web report**

Because `reportApp.tsx` renders the same `StatsView` with settings from `report.json`, Tasks 5–7 already apply to the web report. Confirm by reading `reportApp.tsx` to ensure it passes `statsViewSettings` straight from the payload into `StatsView` (it should). No change needed if so.

- [ ] **Step 3: Reframe the rollup display (cross-report aggregates only)**

In `src/web/rollup.ts` + its renderer in `reportApp.tsx`: the rollup builder must **keep computing all aggregates unconditionally** (do NOT gate any computation on `noEgoMode`). Only the **display** changes: when the report's `noEgoMode` is true, render the cross-report "top commanders / top players" leaderboards as `MetricDistributionCard`s (per aggregated metric, building `players` arrays from the rollup's per-player aggregates and the metric's `higherIsBetter`) instead of ranked lists. Read `rollup.ts` to find the per-player aggregate arrays and reuse them as the card `players`.

- [ ] **Step 4: Test**

If rollup exposes pure builder functions, add `src/web/__tests__/rollup.noego.test.ts` asserting the builder still returns full aggregates regardless of `noEgoMode` (computation is never gated). If display logic is inline in `reportApp.tsx`, add a render test asserting that with `noEgoMode: true` the rollup shows distribution cards and no rank numbers, and with it false shows the existing leaderboard.

Run: `npx vitest run src/web/__tests__/rollup.noego.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Build the web report to confirm it compiles**

Run: `npm run build:web`
Expected: build succeeds.

- [ ] **Step 6: Validate + commit**

Run: `npm run validate`
Expected: pass.

```bash
git add src/web/reportApp.tsx src/web/rollup.ts src/web/__tests__/rollup.noego.test.ts
git commit -m "feat: web report + rollup honor baked No Ego flag (compute always, reframe display)"
```

---

### Task 10: Full validation sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `npm run test:unit -- --maxWorkers=2` (if the script doesn't forward args, use `npx vitest run --maxWorkers=2`)
Expected: all pass, including the new No Ego tests and the pre-existing suite (catches any regression in the default-off path).

- [ ] **Step 2: Validate**

Run: `npm run validate`
Expected: typecheck + lint clean (0 warnings).

- [ ] **Step 3: Manual smoke in the app**

Run: `npm run dev`
- Toggle No Ego on: Top Players → "Squad Summary" cards; Offense/Defense/Support show metric cards with a collapsed "Per-player detail" expander; Top Skills and Player Comparison gone; no crown/medals/rank numbers anywhere.
- Toggle off: everything returns to the original layout.
Stop the dev server.

- [ ] **Step 4: Final commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "chore: No Ego mode smoke-test fixes"
```

---

## Notes for the implementer

- The leaderboard maps (`stats.leaderboards`, `...PerSecond`, `...PerMinute`) already contain one row per player per metric — these ARE the per-player value arrays `computeSquadStat` needs. You rarely need to recompute from raw player stats.
- Keep the default-off path untouched: every change is additive behind `noEgoMode`. The pre-existing test suite is your regression guard.
- Never style the high end as good. The dot-plot colors only needs-improvement outliers with the accent; everyone else is neutral `--text-muted`.
- Boon metrics live in a separate leaderboard map than the numeric `leaderboards`; confirm the exact accessor in `TopPlayersSection.tsx` before relying on the placeholder in Task 5 Step 3.
