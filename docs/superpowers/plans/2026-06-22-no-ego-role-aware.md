# No Ego Role-Aware Comparisons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make No Ego "needs-improvement" outliers role-aware — judge each player against their own role cohort (support vs damage) instead of one squad-wide average, so e.g. a healer is not flagged for low down-contribution.

**Architecture:** A new pure `computeCohortStat` in `src/shared/squadStats.ts` partitions players by role, builds per-cohort and squad summaries via the existing `computeSquadStat`, and flags each player against the correct baseline (cohort if that cohort has ≥3 players, else squad), returning a signed σ-gap. `MetricDistributionCard` gains an opt-in `roleAware` mode that uses it: role-colored dots, per-cohort headline averages, and outlier rows showing `value · −Xσ`. The Squad Summary and Offense/Defense/Support No Ego card lists attach each player's `role` (from the aggregation's `roleClassifications`) and pass `roleAware={noEgoMode}`.

**Tech Stack:** TypeScript, React 18, Vitest + jsdom, Tailwind CSS variables.

## Global Constraints

- Run vitest with limited parallelism: `npx vitest run <file> --maxWorkers=2`.
- `npm run validate` (typecheck + ESLint, max-warnings 0) must pass before each commit that touches `.ts`/`.tsx`.
- `src/shared/squadStats.ts` must stay dependency-free (no imports). Reuse the existing `computeSquadStat` already in that file.
- Role values are the binary `'support' | 'damage'` from the existing classifier. A player with no/unknown role is always compared squad-wide.
- Outlier σ threshold stays **1.5**; minimum cohort size for a valid cohort baseline is **3**.
- Role-awareness is intrinsic to No Ego mode (gate on `noEgoMode`); there is no separate setting. When `roleAware` is false, `MetricDistributionCard` must behave byte-for-byte as it does today (default-off safety).
- The cross-report rollup is NOT changed by this work.
- The aggregation already emits `stats.roleClassifications`: an array of `{ account, profession, professionList, role, supportScore, confidenceScore, threshold, factors }` (see `incrementalAggregation.ts:1474-1483`). `role` is `'support' | 'damage'`.

---

### Task 1: `computeCohortStat` — role-aware squad stats

**Files:**
- Modify: `src/shared/squadStats.ts` (append new types + function; do not change `computeSquadStat`)
- Test: `src/shared/__tests__/squadStats.cohort.test.ts` (new)

**Interfaces:**
- Consumes: existing `computeSquadStat`, `SquadStatPlayer`, `SquadStatSummary` from the same file.
- Produces:
  ```ts
  export type PlayerRole = 'support' | 'damage';
  export interface CohortStatPlayer extends SquadStatPlayer { role?: PlayerRole; }
  export interface CohortOutlier extends SquadStatPlayer {
    role?: PlayerRole;
    baseline: 'support' | 'damage' | 'squad';
    sigmaGap: number; // >= sigmaThreshold, distance past the mean on the needs-improvement side
  }
  export interface CohortStatSummary {
    support?: SquadStatSummary;
    damage?: SquadStatSummary;
    squad: SquadStatSummary;
    needsImprovementOutliers: CohortOutlier[];
  }
  export function computeCohortStat(
    players: CohortStatPlayer[],
    higherIsBetter: boolean,
    sigmaThreshold?: number, // default 1.5
    minCohortSize?: number,  // default 3
  ): CohortStatSummary;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/__tests__/squadStats.cohort.test.ts
import { describe, it, expect } from 'vitest';
import { computeCohortStat, type CohortStatPlayer } from '../squadStats';

// 5 damage players with high down-contrib, 4 support players with low down-contrib.
const downContribSquad: CohortStatPlayer[] = [
  { account: 'D1', value: 40, role: 'damage' },
  { account: 'D2', value: 42, role: 'damage' },
  { account: 'D3', value: 44, role: 'damage' },
  { account: 'D4', value: 46, role: 'damage' },
  { account: 'D5', value: 48, role: 'damage' },
  { account: 'Healer1', value: 3, role: 'support' },
  { account: 'Healer2', value: 4, role: 'support' },
  { account: 'Healer3', value: 5, role: 'support' },
  { account: 'Healer4', value: 4, role: 'support' },
];

describe('computeCohortStat', () => {
  it('does NOT flag a support player on a damage-metric just for being below the squad', () => {
    const s = computeCohortStat(downContribSquad, true);
    const flagged = s.needsImprovementOutliers.map((o) => o.account);
    // None of the healers should be flagged: their low down-contrib is normal AMONG supports.
    expect(flagged).not.toContain('Healer1');
    expect(flagged).not.toContain('Healer2');
    expect(flagged).not.toContain('Healer3');
    expect(flagged).not.toContain('Healer4');
  });

  it('flags a support player who is genuinely low among supports', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'S1', value: 100, role: 'support' },
      { account: 'S2', value: 100, role: 'support' },
      { account: 'S3', value: 100, role: 'support' },
      { account: 'SLow', value: 0, role: 'support' },
    ];
    const s = computeCohortStat(squad, true);
    const low = s.needsImprovementOutliers.find((o) => o.account === 'SLow');
    expect(low).toBeTruthy();
    expect(low!.baseline).toBe('support');
    expect(low!.sigmaGap).toBeGreaterThanOrEqual(1.5);
  });

  it('falls back to squad baseline when a cohort has fewer than 3 players', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'D1', value: 10, role: 'damage' },
      { account: 'D2', value: 10, role: 'damage' },
      { account: 'D3', value: 10, role: 'damage' },
      { account: 'D4', value: 10, role: 'damage' },
      { account: 'S1', value: 9, role: 'support' },   // support cohort size 2 -> fallback
      { account: 'S2', value: 11, role: 'support' },
    ];
    const s = computeCohortStat(squad, true);
    expect(s.support).toBeUndefined();          // too small to be its own baseline
    expect(s.damage).toBeDefined();
    // Every flagged player (if any) must be judged against 'squad' or 'damage', never 'support'.
    for (const o of s.needsImprovementOutliers) expect(o.baseline).not.toBe('support');
  });

  it('uses squad baseline for players with no role', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'A', value: 100 },
      { account: 'B', value: 100 },
      { account: 'C', value: 100 },
      { account: 'NoRoleLow', value: 0 },
    ];
    const s = computeCohortStat(squad, true);
    const low = s.needsImprovementOutliers.find((o) => o.account === 'NoRoleLow');
    expect(low?.baseline).toBe('squad');
  });

  it('flags the HIGH end for lower-is-better metrics (deaths) within cohort', () => {
    const squad: CohortStatPlayer[] = [
      { account: 'D1', value: 1, role: 'damage' },
      { account: 'D2', value: 1, role: 'damage' },
      { account: 'D3', value: 1, role: 'damage' },
      { account: 'DHigh', value: 9, role: 'damage' },
    ];
    const s = computeCohortStat(squad, false); // lower is better
    const hi = s.needsImprovementOutliers.find((o) => o.account === 'DHigh');
    expect(hi).toBeTruthy();
    expect(hi!.baseline).toBe('damage');
  });

  it('populates squad always and both cohort summaries when both are large enough', () => {
    const s = computeCohortStat(downContribSquad, true);
    expect(s.squad.count).toBe(9);
    expect(s.damage?.count).toBe(5);
    expect(s.support?.count).toBe(4);
  });

  it('is safe on empty input', () => {
    const s = computeCohortStat([], true);
    expect(s.squad.count).toBe(0);
    expect(s.needsImprovementOutliers).toEqual([]);
    expect(s.support).toBeUndefined();
    expect(s.damage).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/squadStats.cohort.test.ts --maxWorkers=2`
Expected: FAIL — `computeCohortStat is not a function`.

- [ ] **Step 3: Implement (append to `src/shared/squadStats.ts`)**

```ts
export type PlayerRole = 'support' | 'damage';

export interface CohortStatPlayer extends SquadStatPlayer {
  role?: PlayerRole;
}

export interface CohortOutlier extends SquadStatPlayer {
  role?: PlayerRole;
  baseline: 'support' | 'damage' | 'squad';
  sigmaGap: number;
}

export interface CohortStatSummary {
  support?: SquadStatSummary;
  damage?: SquadStatSummary;
  squad: SquadStatSummary;
  needsImprovementOutliers: CohortOutlier[];
}

export function computeCohortStat(
  players: CohortStatPlayer[],
  higherIsBetter: boolean,
  sigmaThreshold = 1.5,
  minCohortSize = 3,
): CohortStatSummary {
  const valid = (Array.isArray(players) ? players : [])
    .map((p) => ({ ...p, value: Number(p?.value) }))
    .filter((p) => Number.isFinite(p.value));

  const squad = computeSquadStat(valid, higherIsBetter, sigmaThreshold);
  const supportPlayers = valid.filter((p) => p.role === 'support');
  const damagePlayers = valid.filter((p) => p.role === 'damage');
  const support = supportPlayers.length >= minCohortSize
    ? computeSquadStat(supportPlayers, higherIsBetter, sigmaThreshold)
    : undefined;
  const damage = damagePlayers.length >= minCohortSize
    ? computeSquadStat(damagePlayers, higherIsBetter, sigmaThreshold)
    : undefined;

  const baselineFor = (role?: PlayerRole): { summary: SquadStatSummary; label: 'support' | 'damage' | 'squad' } => {
    if (role === 'support' && support) return { summary: support, label: 'support' };
    if (role === 'damage' && damage) return { summary: damage, label: 'damage' };
    return { summary: squad, label: 'squad' };
  };

  const needsImprovementOutliers: CohortOutlier[] = [];
  for (const p of valid) {
    const { summary, label } = baselineFor(p.role);
    if (summary.stdDev <= 0) continue;
    const diff = higherIsBetter ? summary.mean - p.value : p.value - summary.mean;
    const sigmaGap = diff / summary.stdDev;
    if (sigmaGap >= sigmaThreshold) {
      needsImprovementOutliers.push({
        account: p.account,
        value: p.value,
        profession: p.profession,
        professionList: p.professionList,
        role: p.role,
        baseline: label,
        sigmaGap,
      });
    }
  }
  needsImprovementOutliers.sort((a, b) => b.sigmaGap - a.sigmaGap);

  return { support, damage, squad, needsImprovementOutliers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/squadStats.cohort.test.ts --maxWorkers=2`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the existing squadStats test to confirm no regression**

Run: `npx vitest run src/shared/__tests__/squadStats.test.ts --maxWorkers=2`
Expected: PASS (existing 8 tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/shared/squadStats.ts src/shared/__tests__/squadStats.cohort.test.ts
git commit -m "feat: add computeCohortStat for role-aware No Ego outliers"
```

---

### Task 2: `MetricDistributionCard` role-aware mode

**Files:**
- Modify: `src/renderer/stats/components/MetricDistributionCard.tsx`
- Test: `src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx` (new)

**Interfaces:**
- Consumes: `computeCohortStat`, `CohortStatPlayer`, `PlayerRole` from `../../../shared/squadStats` (Task 1).
- Produces: extended `MetricDistributionCardProps`:
  ```ts
  players: Array<SquadStatPlayer & { role?: 'support' | 'damage' }>;
  roleAware?: boolean; // default false → existing behavior
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricDistributionCard } from '../MetricDistributionCard';

const downContrib = [
  { account: 'D1', value: 40, role: 'damage' as const },
  { account: 'D2', value: 42, role: 'damage' as const },
  { account: 'D3', value: 44, role: 'damage' as const },
  { account: 'D4', value: 46, role: 'damage' as const },
  { account: 'D5', value: 48, role: 'damage' as const },
  { account: 'Healer1', value: 3, role: 'support' as const },
  { account: 'Healer2', value: 4, role: 'support' as const },
  { account: 'Healer3', value: 5, role: 'support' as const },
  { account: 'Healer4', value: 4, role: 'support' as const },
];

describe('MetricDistributionCard — role-aware', () => {
  it('does not flag a support player on a damage metric', () => {
    render(
      <MetricDistributionCard
        title="Down Contribution"
        accentColor="#f87171"
        higherIsBetter
        roleAware
        players={downContrib}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    const outliers = screen.getByTestId('metric-card-outliers');
    expect(outliers).not.toHaveTextContent('Healer1');
    expect(outliers).not.toHaveTextContent('Healer2');
  });

  it('shows the σ gap on a flagged outlier row', () => {
    const squad = [
      { account: 'S1', value: 100, role: 'support' as const },
      { account: 'S2', value: 100, role: 'support' as const },
      { account: 'S3', value: 100, role: 'support' as const },
      { account: 'SLow', value: 0, role: 'support' as const },
    ];
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        roleAware
        players={squad}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    const outliers = screen.getByTestId('metric-card-outliers');
    expect(outliers).toHaveTextContent('SLow');
    expect(outliers.textContent || '').toMatch(/σ/); // gap rendered with a sigma marker
  });

  it('falls back to current behavior when roleAware is false', () => {
    // With a single squad-wide baseline, the lone low player IS flagged.
    const squad = [
      { account: 'A', value: 100 },
      { account: 'B', value: 100 },
      { account: 'C', value: 100 },
      { account: 'Low', value: 0 },
    ];
    render(
      <MetricDistributionCard
        title="Cleanses"
        accentColor="#60a5fa"
        higherIsBetter
        players={squad}
        formatValue={(n) => String(Math.round(n))}
      />,
    );
    expect(screen.getByTestId('metric-card-outliers')).toHaveTextContent('Low');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx --maxWorkers=2`
Expected: FAIL — `roleAware` not handled (Healer rows still present / no σ in outlier rows).

- [ ] **Step 3: Implement the role-aware branch**

In `MetricDistributionCard.tsx`:

1. Update the import:

```tsx
import { computeSquadStat, computeCohortStat, type SquadStatPlayer, type PlayerRole } from '../../../shared/squadStats';
```

2. Update the props interface:

```tsx
export interface MetricDistributionCardProps {
  title: string;
  accentColor: string;
  higherIsBetter: boolean;
  players: Array<SquadStatPlayer & { role?: PlayerRole }>;
  formatValue: (n: number) => string;
  unit?: string;
  roleAware?: boolean;
  renderProfessionIcon?: (
    profession: string,
    professionList: string[] | undefined,
    className: string,
  ) => React.ReactNode;
}
```

3. Add `roleAware = false` to the destructured props.

4. Replace the single `const s = computeSquadStat(players, higherIsBetter);` with a branch that
   keeps the squad summary for the dot-plot/headline extent and derives the outliers + role colors:

```tsx
  const cohort = roleAware ? computeCohortStat(players, higherIsBetter) : null;
  const s = cohort ? cohort.squad : computeSquadStat(players, higherIsBetter);
  const outliers = cohort ? cohort.needsImprovementOutliers : s.needsImprovementOutliers;
  const outlierKeys = new Set(outliers.map((p) => p.account));
  const roleOf = new Map(players.map((p) => [p.account, (p as { role?: PlayerRole }).role]));
```

5. Dot color: in the dot `.map`, color by role when `roleAware` (damage warm, support cool,
   unknown neutral); keep the outlier outline. Replace the existing dot background expression:

```tsx
            style={{
              left: `${pos(p.value)}%`,
              background: outlierKeys.has(p.account)
                ? accentColor
                : roleAware
                  ? (roleOf.get(p.account) === 'support' ? '#22d3ee'
                     : roleOf.get(p.account) === 'damage' ? '#fb923c'
                     : 'var(--text-muted)')
                  : 'var(--text-muted)',
              outline: outlierKeys.has(p.account) ? `1px solid ${accentColor}` : 'none',
            }}
```

6. Headline averages: when `roleAware` and both cohorts exist, render two compact averages
   instead of the single Avg block. Keep the single-Avg block for the non-role-aware path and
   for the case where only one cohort exists. Concretely, replace the existing Avg `<div>` with:

```tsx
        {cohort && cohort.support && cohort.damage ? (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Avg by role</div>
            <div data-testid="metric-card-mean" className="text-lg font-bold text-white">
              <span style={{ color: '#fb923c' }}>DPS {formatValue(cohort.damage.mean)}</span>
              {' · '}
              <span style={{ color: '#22d3ee' }}>Sup {formatValue(cohort.support.mean)}</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Avg</div>
            <div data-testid="metric-card-mean" className="text-2xl font-bold text-white">
              {formatValue(s.mean)} <span className="text-sm font-normal text-[color:var(--text-secondary)]">{unit}</span>
            </div>
          </div>
        )}
```

   (Leave the σ Deviation and Range blocks as they are — they describe the squad summary `s`.)

7. Outlier rows: render the σ gap next to the value. Replace the value `<span>` in each
   outlier row so it shows `value · −Xσ` when a `sigmaGap` is present:

```tsx
              <span className="font-mono text-[color:var(--text-secondary)]">
                {formatValue(p.value)}
                {'sigmaGap' in p && typeof (p as { sigmaGap?: number }).sigmaGap === 'number'
                  ? ` · −${(p as { sigmaGap: number }).sigmaGap.toFixed(1)}σ`
                  : ''}
              </span>
```

   (In the non-role-aware path the outliers come from `s.needsImprovementOutliers` which have no
   `sigmaGap`, so the suffix is omitted and behavior is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx --maxWorkers=2`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm the original card test still passes (default-off safety)**

Run: `npx vitest run src/renderer/stats/components/__tests__/MetricDistributionCard.test.tsx --maxWorkers=2`
Expected: PASS (existing 3 tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/components/MetricDistributionCard.tsx src/renderer/stats/components/__tests__/MetricDistributionCard.roleaware.test.tsx
git commit -m "feat: role-aware mode for MetricDistributionCard"
```

---

### Task 3: Attach role + enable roleAware in the Squad Summary

**Files:**
- Modify: `src/renderer/stats/sections/TopPlayersSection.tsx` (the `if (noEgoMode)` Squad Summary branch)
- Test: `src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx` (extend)

**Interfaces:**
- Consumes: `stats.roleClassifications` (array of `{ account, role, ... }`), `MetricDistributionCard` `roleAware` + per-player `role` (Task 2).

- [ ] **Step 1: Add a failing assertion to the existing No Ego test**

Open `src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx`. Extend the
context fixture `ctx.stats` to include a `roleClassifications` array and a leaderboard where a
support player has a low value, then assert the support player is NOT flagged. Add this test
inside the existing `describe`:

```tsx
  it('does not flag a support player on a damage-style leaderboard (role-aware)', () => {
    const ctxRole: any = {
      stats: {
        leaderboards: {
          downContrib: [
            { account: 'D1', value: 40, profession: 'Guardian' },
            { account: 'D2', value: 42, profession: 'Guardian' },
            { account: 'D3', value: 44, profession: 'Guardian' },
            { account: 'D4', value: 46, profession: 'Guardian' },
            { account: 'D5', value: 48, profession: 'Guardian' },
            { account: 'Healer1', value: 3, profession: 'Druid' },
            { account: 'Healer2', value: 4, profession: 'Druid' },
            { account: 'Healer3', value: 5, profession: 'Druid' },
            { account: 'Healer4', value: 4, profession: 'Druid' },
          ],
        },
        roleClassifications: [
          { account: 'D1', role: 'damage' }, { account: 'D2', role: 'damage' },
          { account: 'D3', role: 'damage' }, { account: 'D4', role: 'damage' },
          { account: 'D5', role: 'damage' },
          { account: 'Healer1', role: 'support' }, { account: 'Healer2', role: 'support' },
          { account: 'Healer3', role: 'support' }, { account: 'Healer4', role: 'support' },
        ],
      },
      formatWithCommas: (n: number) => String(n),
      renderProfessionIcon: () => null,
    };
    render(
      <StatsSharedContext.Provider value={ctxRole}>
        <TopPlayersSection {...base} noEgoMode enabledTopStats={['downContrib']} />
      </StatsSharedContext.Provider>,
    );
    const outliers = screen.getByTestId('metric-card-outliers');
    expect(outliers).not.toHaveTextContent('Healer1');
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL — a Healer is currently flagged because the card is squad-wide.

- [ ] **Step 3: Implement role attachment in the Squad Summary branch**

In the `if (noEgoMode)` branch of `TopPlayersSection.tsx`, before the `enabledDefs.map(...)`,
build a role lookup from `stats.roleClassifications`:

```tsx
    const roleByAccount = new Map<string, 'support' | 'damage'>(
      (Array.isArray((stats as any).roleClassifications) ? (stats as any).roleClassifications : [])
        .filter((r: any) => r && (r.role === 'support' || r.role === 'damage'))
        .map((r: any) => [String(r.account), r.role as 'support' | 'damage']),
    );
    const roleOf = (account: string): 'support' | 'damage' | undefined =>
      roleByAccount.get(account) ?? roleByAccount.get(String(account).split('::')[0]);
```

(The `split('::')[0]` fallback handles `splitPlayersByClass` composite keys; harmless otherwise.)

Then where each card's `players` array is built (the `rows.map((r: any) => ({ account: r.account, value: ..., profession: r.profession, professionList: r.professionList }))`), add `role: roleOf(r.account)`, and pass `roleAware` to the card:

```tsx
            const players = (Array.isArray(rows) ? rows : []).map((r: any) => ({
              account: r.account,
              value: Number(r.value ?? 0),
              profession: r.profession,
              professionList: r.professionList,
              role: roleOf(r.account),
            }));
            return (
              <MetricDistributionCard
                key={def.id}
                title={getCardTitle(def, isPerSecond, isPerMinute)}
                accentColor={def.color}
                higherIsBetter={def.higherIsBetter}
                players={players}
                unit={def.unit ?? ''}
                roleAware
                formatValue={(n) => formatValue(def, n)}
                renderProfessionIcon={renderProfessionIcon}
              />
            );
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx --maxWorkers=2`
Expected: PASS (existing tests + the new role-aware test).

- [ ] **Step 5: Validate + commit**

Run: `npm run validate`
Expected: pass.

```bash
git add src/renderer/stats/sections/TopPlayersSection.tsx src/renderer/stats/sections/__tests__/TopPlayersSection.noego.test.tsx
git commit -m "feat: role-aware Squad Summary outliers in No Ego mode"
```

---

### Task 4: Attach role + enable roleAware in Offense/Defense/Support cards

**Files:**
- Modify: `src/renderer/stats/sections/OffenseSection.tsx`
- Modify: `src/renderer/stats/sections/DefenseSection.tsx`
- Modify: `src/renderer/stats/sections/SupportSection.tsx`
- Test: `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx` (extend)

**Interfaces:**
- Consumes: `stats.roleClassifications`, `MetricDistributionCard` `roleAware` + per-player `role`.

- [ ] **Step 1: Add a failing assertion to the Offense No Ego test**

Extend `OffenseSection.noego.test.tsx`'s context fixture to add `roleClassifications` marking
the low-value players as `support`, and assert that on a damage metric a support player is not
in `metric-card-outliers`. (Mirror the role data shape used in Task 3 Step 1; use the section's
existing fixture player accounts, tagging the intended healers as `support` and the rest as
`damage`, with at least 3 players per role so cohorts are valid.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 3: Implement role attachment in all three sections**

For EACH of `OffenseSection.tsx`, `DefenseSection.tsx`, `SupportSection.tsx`, inside the
`if (noEgoMode && ...)` branch, add the same role lookup helper before the metric-card map:

```tsx
        const roleByAccount = new Map<string, 'support' | 'damage'>(
          (Array.isArray((stats as any).roleClassifications) ? (stats as any).roleClassifications : [])
            .filter((r: any) => r && (r.role === 'support' || r.role === 'damage'))
            .map((r: any) => [String(r.account), r.role as 'support' | 'damage']),
        );
        const roleOf = (account: string): 'support' | 'damage' | undefined =>
          roleByAccount.get(account) ?? roleByAccount.get(String(account).split('::')[0]);
```

Then, where each section builds the per-metric `players` array for its `MetricDistributionCard`,
add `role: roleOf(row.account)` to each player object and add the `roleAware` prop to the card.
(The exact variable name for the row is whatever that section already uses — e.g. `row.account`.
Read the section's existing No Ego branch and add the field there.)

- [ ] **Step 4: Run the Offense test to confirm it passes**

Run: `npx vitest run src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Validate + commit**

Run: `npm run validate`
Expected: pass.

```bash
git add src/renderer/stats/sections/OffenseSection.tsx src/renderer/stats/sections/DefenseSection.tsx src/renderer/stats/sections/SupportSection.tsx src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx
git commit -m "feat: role-aware Offense/Defense/Support cards in No Ego mode"
```

---

### Task 5: Full validation sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: all pass, including the new cohort/role-aware tests and the full pre-existing suite (regression guard for the default-off path).

- [ ] **Step 2: Validate**

Run: `npm run validate`
Expected: typecheck + lint clean (0 warnings).

- [ ] **Step 3: Build the web report (web report reuses these components)**

Run: `npm run build:web`
Expected: build succeeds.

- [ ] **Step 4: Commit (only if a fix was needed)**

```bash
git add -A
git commit -m "chore: role-aware No Ego validation fixes"
```

---

## Notes for the implementer

- `roleClassifications` is keyed by account; when `splitPlayersByClass` is on, leaderboard
  row accounts may be `account::profession` composites — the `roleOf` helper's `split('::')[0]`
  fallback covers that.
- Players missing from `roleClassifications` (or with an unexpected role) get `undefined` role
  and are compared squad-wide — that's the intended fallback, never an error.
- Keep `computeSquadStat` untouched; all role logic lives in `computeCohortStat`.
- Do not touch the rollup (`reportApp.tsx` / `rollup.ts`) — role-awareness is out of scope there.
- The web report needs no separate wiring: it renders the same sections with the same
  `noEgoMode`, so `roleAware` flows through automatically.
