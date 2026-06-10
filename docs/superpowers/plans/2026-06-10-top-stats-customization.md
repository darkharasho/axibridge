# Top Stats Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard's Top Stats leader-card grid fully user-configurable from Settings — enable/disable each of ~27 stat cards across 5 categories (Offense, Defense/Support, Control, Utility, Boons), defaulting to today's exact 9 cards.

**Architecture:** A single ordered catalog array (`topStatsCatalog.ts`) is the source of truth consumed by both the Settings chip-grid picker and `TopPlayersSection`. Non-boon cards read existing `stats.leaderboards`; boon cards read a new `stats.boonLeaderboards` derived from the already-computed `boonTables` via `getBoonMetricValue`. A new `enabledTopStats: string[]` setting (with a normalizer that defaults to the legacy 9) drives which cards render.

**Tech Stack:** React + TypeScript, Vitest + jsdom, Tailwind, lucide-react icons. Aggregation in `incrementalAggregation.ts`. Settings persisted via existing `statsViewSettings` flow.

**Spec:** `docs/superpowers/specs/2026-06-10-top-stats-customization-design.md`

---

## File Structure

- **Create** `src/renderer/stats/topStatsCatalog.ts` — catalog types, the ordered catalog array, boon-id map, and helpers (`DEFAULT_ENABLED_TOP_STATS`, `normalizeEnabledTopStats`). One responsibility: describe the stat catalog.
- **Create** `src/renderer/components/BoonGlyph.tsx` — the shared generic boon glyph (hexagon + up-arrow).
- **Create** `src/renderer/stats/__tests__/topStatsCatalog.test.ts` — catalog/normalizer tests.
- **Create** `src/shared/__tests__/buildBoonLeaderboards.test.ts` — boon leaderboard math tests.
- **Modify** `src/shared/boonGeneration.ts` — add `buildBoonLeaderboards`.
- **Modify** `src/renderer/stats/incrementalAggregation.ts` — emit `boonLeaderboards` from `finalize()`.
- **Modify** `src/renderer/global.d.ts` — add `enabledTopStats` to `IStatsViewSettings`, its default, and re-export catalog helpers' default.
- **Modify** `src/renderer/stats/sections/TopPlayersSection.tsx` — catalog-driven rendering + boon cards.
- **Modify** `src/renderer/StatsView.tsx` — derive and pass `enabledTopStats`.
- **Modify** `src/renderer/SettingsView.tsx` — chip-grid picker + load normalization.
- **Modify** `src/renderer/__tests__/TopPlayersSection.test.tsx` — rendering tests.
- **Modify** `src/renderer/__tests__/SettingsView.test.tsx` — picker tests.

Run tests with: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 <file>`

---

## Task 1: Stat catalog module

**Files:**
- Create: `src/renderer/stats/topStatsCatalog.ts`
- Test: `src/renderer/stats/__tests__/topStatsCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/__tests__/topStatsCatalog.test.ts
import { describe, it, expect } from 'vitest';
import {
  TOP_STATS_CATALOG,
  DEFAULT_ENABLED_TOP_STATS,
  normalizeEnabledTopStats,
} from '../topStatsCatalog';

describe('topStatsCatalog', () => {
  it('has 27 entries across 5 categories', () => {
    expect(TOP_STATS_CATALOG).toHaveLength(27);
    const cats = new Set(TOP_STATS_CATALOG.map((d) => d.category));
    expect([...cats].sort()).toEqual(['boon', 'control', 'defense', 'offense', 'utility']);
  });

  it('default enabled set equals the legacy 9 cards', () => {
    expect(DEFAULT_ENABLED_TOP_STATS).toEqual([
      'downContrib', 'healing', 'barrier', 'cleanses', 'strips',
      'stability', 'cc', 'dodges', 'closestToTag',
    ]);
  });

  it('every default id exists in the catalog and is marked defaultOn', () => {
    for (const id of DEFAULT_ENABLED_TOP_STATS) {
      const def = TOP_STATS_CATALOG.find((d) => d.id === id);
      expect(def, id).toBeTruthy();
      expect(def!.defaultOn).toBe(true);
    }
  });

  it('all ids are unique', () => {
    const ids = TOP_STATS_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('normalizeEnabledTopStats falls back to defaults for undefined/non-array', () => {
    expect(normalizeEnabledTopStats(undefined)).toEqual(DEFAULT_ENABLED_TOP_STATS);
    expect(normalizeEnabledTopStats('nope' as unknown)).toEqual(DEFAULT_ENABLED_TOP_STATS);
  });

  it('normalizeEnabledTopStats filters unknown ids but keeps empty selection', () => {
    expect(normalizeEnabledTopStats(['healing', 'bogus', 'boon:might'])).toEqual(['healing', 'boon:might']);
    expect(normalizeEnabledTopStats([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/renderer/stats/__tests__/topStatsCatalog.test.ts`
Expected: FAIL — `Cannot find module '../topStatsCatalog'`.

- [ ] **Step 3: Write the catalog module**

```ts
// src/renderer/stats/topStatsCatalog.ts
import {
  Activity, Ban, Crosshair, Crown, Flame, Hammer, HelpingHand, Heart,
  Shield, ShieldCheck, Swords, Wind, Zap, type LucideIcon,
} from 'lucide-react';

export type TopStatCategory = 'offense' | 'defense' | 'control' | 'utility' | 'boon';

export type TopStatSource =
  | { kind: 'leaderboard'; key: string }
  | { kind: 'boon'; boonId: string; stacking: boolean };

export interface TopStatDef {
  id: string;
  label: string;
  category: TopStatCategory;
  color: string;          // hex accent used by chip + card
  icon: LucideIcon | 'boon';
  unit?: string;
  higherIsBetter: boolean;
  source: TopStatSource;
  defaultOn: boolean;
  supportsRate: boolean;  // per-second/per-minute applies
}

// GW2 boon skill ids (see src/shared/replayBuffs.ts)
export const BOON_IDS = {
  might: 'b740', quickness: 'b1187', alacrity: 'b30328', fury: 'b725',
  protection: 'b717', resistance: 'b26980', resolution: 'b31484',
  stability: 'b1122', aegis: 'b873', regeneration: 'b718', swiftness: 'b719',
} as const;

const CAT_COLOR: Record<TopStatCategory, string> = {
  offense: '#fb923c', defense: '#34d399', control: '#f472b6',
  utility: '#818cf8', boon: '#22d3ee',
};

const lb = (key: string): TopStatSource => ({ kind: 'leaderboard', key });
const boon = (boonId: string, stacking: boolean): TopStatSource => ({ kind: 'boon', boonId, stacking });

export const TOP_STATS_CATALOG: TopStatDef[] = [
  // Offense
  { id: 'dps', label: 'DPS', category: 'offense', color: CAT_COLOR.offense, icon: Swords, higherIsBetter: true, source: lb('dps'), defaultOn: false, supportsRate: true },
  { id: 'damage', label: 'Damage', category: 'offense', color: CAT_COLOR.offense, icon: Flame, higherIsBetter: true, source: lb('damage'), defaultOn: false, supportsRate: true },
  { id: 'downContrib', label: 'Down Contribution', category: 'offense', color: '#f87171', icon: HelpingHand, higherIsBetter: true, source: lb('downContrib'), defaultOn: true, supportsRate: true },
  // Defense / Support
  { id: 'healing', label: 'Healing', category: 'defense', color: CAT_COLOR.defense, icon: Activity, higherIsBetter: true, source: lb('healing'), defaultOn: true, supportsRate: true },
  { id: 'downedHealing', label: 'Downed Healing', category: 'defense', color: CAT_COLOR.defense, icon: Heart, higherIsBetter: true, source: lb('downedHealing'), defaultOn: false, supportsRate: true },
  { id: 'barrier', label: 'Barrier', category: 'defense', color: '#facc15', icon: Shield, higherIsBetter: true, source: lb('barrier'), defaultOn: true, supportsRate: true },
  { id: 'cleanses', label: 'Cleanses', category: 'defense', color: '#60a5fa', icon: Flame, higherIsBetter: true, source: lb('cleanses'), defaultOn: true, supportsRate: true },
  { id: 'strips', label: 'Strips', category: 'defense', color: '#a78bfa', icon: Zap, higherIsBetter: true, source: lb('strips'), defaultOn: true, supportsRate: true },
  { id: 'stability', label: 'Stability Gen', category: 'defense', color: '#22d3ee', icon: ShieldCheck, higherIsBetter: true, source: lb('stability'), defaultOn: true, supportsRate: true },
  { id: 'revives', label: 'Revives', category: 'defense', color: CAT_COLOR.defense, icon: HelpingHand, higherIsBetter: true, source: lb('revives'), defaultOn: false, supportsRate: true },
  // Control
  { id: 'cc', label: 'CC', category: 'control', color: CAT_COLOR.control, icon: Hammer, higherIsBetter: true, source: lb('cc'), defaultOn: true, supportsRate: true },
  { id: 'interrupts', label: 'Interrupts', category: 'control', color: '#fb923c', icon: Ban, higherIsBetter: true, source: lb('interrupts'), defaultOn: false, supportsRate: true },
  { id: 'ccAndInterrupts', label: 'CC + Interrupts', category: 'control', color: CAT_COLOR.control, icon: Hammer, higherIsBetter: true, source: lb('ccAndInterrupts'), defaultOn: false, supportsRate: true },
  // Utility
  { id: 'dodges', label: 'Dodges', category: 'utility', color: '#22d3ee', icon: Wind, higherIsBetter: true, source: lb('dodges'), defaultOn: true, supportsRate: true },
  { id: 'closestToTag', label: 'Closest to Tag', category: 'utility', color: '#818cf8', icon: Crosshair, unit: 'dist', higherIsBetter: false, source: lb('closestToTag'), defaultOn: true, supportsRate: false },
  { id: 'participation', label: 'Participation', category: 'utility', color: CAT_COLOR.utility, icon: Crown, higherIsBetter: true, source: lb('participation'), defaultOn: false, supportsRate: false },
  // Boons (squad generation output; stacking => avg stacks, else uptime %)
  { id: 'boon:might', label: 'Might', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'avg stacks', higherIsBetter: true, source: boon(BOON_IDS.might, true), defaultOn: false, supportsRate: false },
  { id: 'boon:quickness', label: 'Quickness', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.quickness, false), defaultOn: false, supportsRate: false },
  { id: 'boon:alacrity', label: 'Alacrity', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.alacrity, false), defaultOn: false, supportsRate: false },
  { id: 'boon:fury', label: 'Fury', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.fury, false), defaultOn: false, supportsRate: false },
  { id: 'boon:protection', label: 'Protection', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.protection, false), defaultOn: false, supportsRate: false },
  { id: 'boon:resistance', label: 'Resistance', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.resistance, false), defaultOn: false, supportsRate: false },
  { id: 'boon:resolution', label: 'Resolution', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.resolution, false), defaultOn: false, supportsRate: false },
  { id: 'boon:stability', label: 'Stability', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'avg stacks', higherIsBetter: true, source: boon(BOON_IDS.stability, true), defaultOn: false, supportsRate: false },
  { id: 'boon:aegis', label: 'Aegis', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.aegis, false), defaultOn: false, supportsRate: false },
  { id: 'boon:regeneration', label: 'Regeneration', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.regeneration, false), defaultOn: false, supportsRate: false },
  { id: 'boon:swiftness', label: 'Swiftness', category: 'boon', color: CAT_COLOR.boon, icon: 'boon', unit: 'uptime', higherIsBetter: true, source: boon(BOON_IDS.swiftness, false), defaultOn: false, supportsRate: false },
];

export const DEFAULT_ENABLED_TOP_STATS: string[] = TOP_STATS_CATALOG
  .filter((d) => d.defaultOn)
  .map((d) => d.id);

const VALID_IDS = new Set(TOP_STATS_CATALOG.map((d) => d.id));

export const normalizeEnabledTopStats = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [...DEFAULT_ENABLED_TOP_STATS];
  return value.filter((id): id is string => typeof id === 'string' && VALID_IDS.has(id));
};

export const CATEGORY_ORDER: TopStatCategory[] = ['offense', 'defense', 'control', 'utility', 'boon'];

export const CATEGORY_META: Record<TopStatCategory, { label: string; color: string }> = {
  offense: { label: 'Offense', color: CAT_COLOR.offense },
  defense: { label: 'Defense / Support', color: CAT_COLOR.defense },
  control: { label: 'Control', color: CAT_COLOR.control },
  utility: { label: 'Utility', color: CAT_COLOR.utility },
  boon: { label: 'Boons', color: CAT_COLOR.boon },
};
```

> Note: `DEFAULT_ENABLED_TOP_STATS` is derived by filtering `defaultOn`, and the catalog lists those 9 in the exact order asserted by the test (downContrib, healing, barrier, cleanses, strips, stability, cc, dodges, closestToTag). Keep that relative order when editing the catalog.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/renderer/stats/__tests__/topStatsCatalog.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/topStatsCatalog.ts src/renderer/stats/__tests__/topStatsCatalog.test.ts
git commit -m "feat(stats): add top stats catalog and enabled-set normalizer"
```

---

## Task 2: `enabledTopStats` setting + default

**Files:**
- Modify: `src/renderer/global.d.ts` (interface `IStatsViewSettings` ~line 76-88; `DEFAULT_STATS_VIEW_SETTINGS` ~line 205-217)

- [ ] **Step 1: Add the field to the interface**

In `src/renderer/global.d.ts`, add to `IStatsViewSettings` (after `interruptMode`):

```ts
    interruptMode: 'ccOnly' | 'separate' | 'combined';
    enabledTopStats: string[];
}
```

- [ ] **Step 2: Add the default**

Import the default at the top of `global.d.ts` (with the existing imports):

```ts
import { DEFAULT_ENABLED_TOP_STATS } from './stats/topStatsCatalog';
```

Add to `DEFAULT_STATS_VIEW_SETTINGS` (after `interruptMode: 'separate'`):

```ts
    interruptMode: 'separate',
    enabledTopStats: DEFAULT_ENABLED_TOP_STATS,
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If a circular-import warning arises (global.d.ts ↔ topStatsCatalog), it is safe because `topStatsCatalog.ts` does not import from `global.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/global.d.ts
git commit -m "feat(stats): add enabledTopStats to stats view settings"
```

---

## Task 3: `buildBoonLeaderboards` helper

**Files:**
- Modify: `src/shared/boonGeneration.ts` (append new export; reuse existing `getBoonMetricValue`, `BoonTable`, `BoonRow`)
- Test: `src/shared/__tests__/buildBoonLeaderboards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/__tests__/buildBoonLeaderboards.test.ts
import { describe, it, expect } from 'vitest';
import { buildBoonLeaderboards, type BoonTable } from '../boonGeneration';

const mkRow = (account: string, squadGenMs: number) => ({
  account, profession: 'Firebrand', professionList: ['Firebrand'],
  activeTimeMs: 10000, numFights: 1, groupSupported: 6, squadSupported: 6,
  categories: {
    selfBuffs: { generationMs: 0, wastedMs: 0 },
    groupBuffs: { generationMs: 0, wastedMs: 0 },
    squadBuffs: { generationMs: squadGenMs, wastedMs: 0 },
  },
});

const tables: BoonTable[] = [
  { id: 'b1187', name: 'Quickness', stacking: false, rows: [mkRow('A.1', 40000), mkRow('B.2', 20000)] },
  { id: 'b740', name: 'Might', stacking: true, rows: [mkRow('A.1', 200000), mkRow('B.2', 50000)] },
];

describe('buildBoonLeaderboards', () => {
  it('ranks players by squad generation, descending', () => {
    const lbs = buildBoonLeaderboards(tables);
    expect(lbs['b1187'].map((r) => r.account)).toEqual(['A.1', 'B.2']);
    expect(lbs['b1187'][0].rank).toBe(1);
    expect(lbs['b1187'][1].rank).toBe(2);
  });

  it('non-stacking boon value is a uptime percentage', () => {
    const lbs = buildBoonLeaderboards(tables);
    // squadSupported(6) - numFights(1) = 5; denom = 5/1 = 5
    // generationMs/activeTimeMs = 40000/10000 = 4; /denom 5 = 0.8; *100 = 80
    expect(lbs['b1187'][0].value).toBeCloseTo(80, 5);
  });

  it('stacking boon value is average stacks (no percentage)', () => {
    const lbs = buildBoonLeaderboards(tables);
    // 200000/10000 = 20; /5 = 4 stacks
    expect(lbs['b740'][0].value).toBeCloseTo(4, 5);
  });

  it('drops rows with non-finite or zero value', () => {
    const t: BoonTable[] = [{ id: 'b717', name: 'Protection', stacking: false, rows: [mkRow('A.1', 0)] }];
    expect(buildBoonLeaderboards(t)['b717']).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/shared/__tests__/buildBoonLeaderboards.test.ts`
Expected: FAIL — `buildBoonLeaderboards is not a function`.

- [ ] **Step 3: Implement `buildBoonLeaderboards`**

Append to `src/shared/boonGeneration.ts`:

```ts
export interface BoonLeaderboardRow {
  rank: number;
  account: string;
  profession: string;
  professionList?: string[];
  value: number;
  count?: number;
}

// Ranks players by SQUAD boon generation output for each boon table.
// Stacking boons (Might/Stability) => average stacks; others => uptime %.
export const buildBoonLeaderboards = (
  tables: BoonTable[],
): Record<string, BoonLeaderboardRow[]> => {
  const result: Record<string, BoonLeaderboardRow[]> = {};
  for (const table of tables) {
    const ranked = table.rows
      .map((row) => ({
        account: row.account,
        profession: row.profession,
        professionList: row.professionList,
        value: getBoonMetricValue(row, 'squadBuffs', table.stacking, 'uptime'),
        count: row.numFights,
      }))
      .filter((r) => Number.isFinite(r.value) && r.value > 0)
      .sort((a, b) => (b.value - a.value) || a.account.localeCompare(b.account));

    let lastValue: number | null = null;
    let lastRank = 0;
    result[table.id] = ranked.map((row, index) => {
      if (lastValue === null || row.value !== lastValue) {
        lastRank = index + 1;
        lastValue = row.value;
      }
      return { ...row, rank: lastRank };
    });
  }
  return result;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/shared/__tests__/buildBoonLeaderboards.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/boonGeneration.ts src/shared/__tests__/buildBoonLeaderboards.test.ts
git commit -m "feat(boons): derive squad-output boon leaderboards"
```

---

## Task 4: Emit `boonLeaderboards` from aggregation

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` (`finalize()` — `boonTables` built ~line 818; return object ~line 1400-1418)

- [ ] **Step 1: Import the helper**

At the top of `incrementalAggregation.ts`, extend the existing import from `boonGeneration`:

```ts
import { buildBoonTables, buildBoonLeaderboards } from '../../shared/boonGeneration';
```

- [ ] **Step 2: Compute boon leaderboards after boon tables are built**

Find where `boonTables` is produced in `finalize()` (around line 818: `const { boonTables } = buildBoonTables(...)`). Immediately after that line add:

```ts
        const boonLeaderboards = buildBoonLeaderboards(boonTables);
```

- [ ] **Step 3: Add it to the returned stats object**

In the `finalize()` return object (the one containing `leaderboards,` ~line 1400 and `boonTables,` ~line 1418), add `boonLeaderboards` next to `boonTables`:

```ts
            mapData, timelineData, boonTables, boonLeaderboards, boonTimeline, boonUptimeTimeline, stabPerformanceDrilldown, incomingDamagePerSecondByFightId,
```

- [ ] **Step 4: Verify aggregation regression suite still passes**

Run: `npm run test:regression:stats`
Expected: PASS — output shape gains `boonLeaderboards` without breaking existing assertions.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts
git commit -m "feat(stats): expose boonLeaderboards in aggregation output"
```

---

## Task 5: `BoonGlyph` component

**Files:**
- Create: `src/renderer/components/BoonGlyph.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/components/BoonGlyph.tsx
// Generic boon glyph: hexagon + upward arrow. Uses currentColor so callers
// control the color via text color / the `color` style.
export const BoonGlyph = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinejoin="round"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 2l8.5 5v10L12 22 3.5 17V7z" />
    <path d="M12 16V9M9 12l3-3 3 3" />
  </svg>
);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/BoonGlyph.tsx
git commit -m "feat(ui): add generic BoonGlyph icon"
```

---

## Task 6: Catalog-driven `TopPlayersSection`

**Files:**
- Modify: `src/renderer/stats/sections/TopPlayersSection.tsx`
- Test: `src/renderer/__tests__/TopPlayersSection.test.tsx`

The goal: replace the hardcoded `leaderCards` array (lines ~332-347) with a catalog-driven list filtered by `enabledTopStats`, resolve boon cards from `stats.boonLeaderboards`, render the boon glyph + BOON badge + unit, and show a placeholder when nothing is enabled. The `showMvp` block and `isMvpStatEnabled` logic are untouched.

- [ ] **Step 1: Write/extend the failing tests**

Add these tests to `src/renderer/__tests__/TopPlayersSection.test.tsx` (keep existing tests). If the file mounts `TopPlayersSection` through a context provider, follow the existing harness in that file; the assertions below are the new behavior to cover:

```tsx
// New prop: enabledTopStats: string[]
it('renders only enabled non-boon cards in catalog order', () => {
  renderSection({ enabledTopStats: ['healing', 'downContrib'] });
  const titles = screen.getAllByTestId('leader-card-title').map((n) => n.textContent);
  // catalog order places downContrib (offense) before healing (defense)
  expect(titles).toEqual(['Down Contribution', 'Healing']);
});

it('renders a boon card with glyph, BOON badge and unit', () => {
  renderSection({ enabledTopStats: ['boon:quickness'] });
  expect(screen.getByText('Quickness')).toBeInTheDocument();
  expect(screen.getByText('BOON')).toBeInTheDocument();
  expect(screen.getByText('uptime')).toBeInTheDocument();
});

it('shows placeholder when no stats are enabled', () => {
  renderSection({ enabledTopStats: [] });
  expect(screen.getByText(/No top stats selected/i)).toBeInTheDocument();
});
```

> The existing test file already constructs `stats`/context. Extend its mock `stats` with a `boonLeaderboards` map, e.g. `boonLeaderboards: { b1187: [{ rank: 1, account: 'A.1', profession: 'Chronomancer', professionList: ['Chronomancer'], value: 74, count: 5 }] }`, and add a `renderSection` helper that passes `enabledTopStats` (defaulting to `DEFAULT_ENABLED_TOP_STATS` for pre-existing tests). Add `data-testid="leader-card-title"` to the title element in Step 3 so the order assertion can read it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/renderer/__tests__/TopPlayersSection.test.tsx`
Expected: FAIL — `enabledTopStats` not used; no boon/placeholder rendering.

- [ ] **Step 3: Implement catalog-driven rendering**

In `TopPlayersSection.tsx`:

a) Add imports at the top:

```ts
import { TOP_STATS_CATALOG, type TopStatDef } from '../topStatsCatalog';
import { BoonGlyph } from '../../components/BoonGlyph';
```

b) Add `enabledTopStats` to `TopPlayersSectionProps`:

```ts
    isMvpStatEnabled: (name: string) => boolean;
    enabledTopStats: string[];
```

c) Add `enabledTopStats` to the destructured props in the component signature.

d) Replace the IIFE block that builds `leaderCards` and renders the grid (the `{(() => { ... })()}` starting ~line 317) with catalog-driven logic. Keep the per-second/per-minute data selection for leaderboard-sourced cards; boon cards ignore rate mode. Use this body:

```tsx
            {(() => {
                const isPerSecond = topStatsMode === 'perSecond';
                const isPerMinute = topStatsMode === 'perMinute';
                const enabledSet = new Set(enabledTopStats);
                const enabledDefs = TOP_STATS_CATALOG.filter((d) => enabledSet.has(d.id));

                if (enabledDefs.length === 0) {
                    return (
                        <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-8 text-center text-sm text-[color:var(--text-secondary)]">
                            No top stats selected — enable some in Settings → Dashboard - Top Stats &amp; MVP.
                        </div>
                    );
                }

                const rateOn = isPerSecond || isPerMinute;
                const lbBase = isPerSecond && stats.topStatsLeaderboardsPerSecond
                    ? stats.topStatsLeaderboardsPerSecond
                    : isPerMinute && stats.topStatsLeaderboardsPerMinute
                        ? stats.topStatsLeaderboardsPerMinute
                        : stats.leaderboards;
                const titleSuffix = isPerSecond ? ' /s' : isPerMinute ? ' /m' : '';
                const totalPrefix = rateOn ? '' : 'Total ';

                const formatValue = (value: number) => {
                    if (!rateOn || !Number.isFinite(value)) return formatTopStatValue(value);
                    return formatWithCommas(value, 2);
                };

                const resolve = (def: TopStatDef) => {
                    if (def.source.kind === 'boon') {
                        const rows = normalizeLeaderboardRows(
                            (stats.boonLeaderboards?.[def.source.boonId]) || [],
                            def.higherIsBetter,
                        );
                        return { rows, isBoon: true, rateApplies: false };
                    }
                    const applyRate = rateOn && def.supportsRate;
                    const src = applyRate ? lbBase : stats.leaderboards;
                    const rows = normalizeLeaderboardRows(src?.[def.source.key] || [], def.higherIsBetter);
                    return { rows, isBoon: false, rateApplies: applyRate };
                };

                const cardTitle = (def: TopStatDef, rateApplies: boolean) => {
                    if (def.id === 'closestToTag') return 'Closest to Tag';
                    if (def.category === 'boon') return def.label;
                    if (!rateApplies) {
                        // mirror legacy: prefix "Total " for count stats; keep proper names otherwise
                        const prefixed = ['barrier', 'healing', 'dodges', 'strips', 'cleanses', 'cc', 'interrupts', 'ccAndInterrupts', 'stability'];
                        return `${prefixed.includes(def.id) ? totalPrefix : ''}${def.label}`;
                    }
                    return `${def.label}${titleSuffix}`;
                };

                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {enabledDefs.map((def) => {
                            const { rows, isBoon, rateApplies } = resolve(def);
                            const topRow = rows[0];
                            const data = {
                                value: Number(topRow?.value ?? 0),
                                player: topRow?.account ?? '-',
                                count: topRow?.count ?? 0,
                                profession: topRow?.profession ?? 'Unknown',
                                professionList: topRow?.professionList ?? [],
                            };
                            const valueFmt = isBoon
                                ? (v: number) => (def.unit === 'uptime' ? `${formatWithCommas(v, 1)}%` : formatWithCommas(v, 1))
                                : formatValue;
                            return (
                                <LeaderCard
                                    key={def.id}
                                    icon={def.icon === 'boon' ? undefined : def.icon}
                                    isBoon={isBoon}
                                    accentColor={def.color}
                                    title={cardTitle(def, rateApplies)}
                                    unit={def.unit && (def.unit === 'avg stacks' || def.unit === 'uptime' || def.unit === 'dist') ? def.unit : ''}
                                    data={data}
                                    active={expandedLeader === 'all'}
                                    onClick={() => setExpandedLeader((prev) => (prev === 'all' ? null : 'all'))}
                                    rows={rows}
                                    formatValue={valueFmt}
                                    renderProfessionIcon={renderProfessionIcon}
                                />
                            );
                        })}
                    </div>
                );
            })()}
```

e) Update `LeaderCard` to support boon styling, the accent color, and the glyph. Replace the `LeaderCard` signature/header (lines ~27-54) with:

```tsx
const LeaderCard = ({ icon: Icon, isBoon, accentColor, title, data, unit = '', onClick, active, rows, formatValue, renderProfessionIcon }: any) => {
    const value = data?.value ?? 0;
    const displayValue = formatValue ? formatValue(value) : Math.round(value).toLocaleString();
    const tint = accentColor || '#60a5fa';
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick?.();
                }
            }}
            className={`relative overflow-hidden border rounded-[var(--radius-md)] p-4 flex flex-col gap-3 group cursor-pointer ${active ? 'ring-1 ring-white/20' : ''}`}
            style={{ borderColor: isBoon ? `${tint}66` : 'var(--border-default)', background: isBoon ? `${tint}0f` : undefined }}
        >
            {isBoon && (
                <span className="absolute top-2 right-2 text-[8px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded" style={{ color: tint, background: `${tint}1f` }}>BOON</span>
            )}
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-[var(--radius-md)] shrink-0" style={{ background: `${tint}1f`, color: tint }}>
                    {isBoon ? <BoonGlyph className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div data-testid="leader-card-title" className="text-[color:var(--text-secondary)] text-xs font-bold uppercase tracking-wider truncate">{title}</div>
                    <div className="text-2xl font-bold text-white mt-0.5 break-words">
                        {displayValue} <span className="text-sm font-normal text-[color:var(--text-secondary)]">{unit}</span>
                    </div>
                </div>
            </div>
```

Leave the rest of `LeaderCard` (the footer with profession/player/count and the expanded rows block, lines ~55-83) unchanged. Remove the now-unused `colorClasses` map and the `color` prop usage, and drop now-unused icon imports only if ESLint flags them (the catalog imports its own icons; this file may keep `Trophy`/`Sparkles`/`Crown`/`Star`/`Flame`/`ShieldCheck` used by the MVP block).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/renderer/__tests__/TopPlayersSection.test.tsx`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Lint the file**

Run: `npx eslint src/renderer/stats/sections/TopPlayersSection.tsx`
Expected: no errors. Remove any unused imports it reports.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/sections/TopPlayersSection.tsx src/renderer/__tests__/TopPlayersSection.test.tsx
git commit -m "feat(stats): drive Top Stats grid from catalog + boon cards"
```

---

## Task 7: Wire `enabledTopStats` through `StatsView`

**Files:**
- Modify: `src/renderer/StatsView.tsx` (settings derivation ~line 228-234; `TopPlayersSection` call sites ~line 4273 and ~line 4721)

- [ ] **Step 1: Derive the enabled set**

After `const interruptMode = activeStatsViewSettings.interruptMode || 'ccOnly';` (~line 234) add:

```ts
    const enabledTopStats = normalizeEnabledTopStats(activeStatsViewSettings.enabledTopStats);
```

Add the import near the other stats imports at the top of `StatsView.tsx`:

```ts
import { normalizeEnabledTopStats } from './stats/topStatsCatalog';
```

- [ ] **Step 2: Pass the prop at both call sites**

In **both** `<TopPlayersSection ... />` usages (~line 4273 and ~line 4721), add the prop:

```tsx
                                    isMvpStatEnabled={isMvpStatEnabled}
                                    enabledTopStats={enabledTopStats}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat(stats): pass enabledTopStats into TopPlayersSection"
```

---

## Task 8: Settings chip-grid picker

**Files:**
- Modify: `src/renderer/SettingsView.tsx` (load merge ~line 512; helpers ~line 1215-1228; the "Dashboard - Top Stats & MVP" section ~line 2123-2198)
- Test: `src/renderer/__tests__/SettingsView.test.tsx`

- [ ] **Step 1: Normalize on load**

Replace the load line (~512):

```ts
        setStatsViewSettings({ ...DEFAULT_STATS_VIEW_SETTINGS, ...(settings.statsViewSettings || {}) });
```

with:

```ts
        setStatsViewSettings({
            ...DEFAULT_STATS_VIEW_SETTINGS,
            ...(settings.statsViewSettings || {}),
            enabledTopStats: normalizeEnabledTopStats(settings.statsViewSettings?.enabledTopStats),
        });
```

Add imports at the top of `SettingsView.tsx`:

```ts
import { TOP_STATS_CATALOG, CATEGORY_ORDER, CATEGORY_META, DEFAULT_ENABLED_TOP_STATS, normalizeEnabledTopStats, type TopStatCategory } from './stats/topStatsCatalog';
import { BoonGlyph } from './components/BoonGlyph';
import { Swords, Shield, Hammer, Wind } from 'lucide-react';
```

- [ ] **Step 2: Add toggle + reset handlers**

Near the other `setStatsViewSettings` helpers (~line 1215), add:

```ts
    const toggleTopStat = useCallback((id: string) => {
        setStatsViewSettings((prev) => {
            const current = normalizeEnabledTopStats(prev.enabledTopStats);
            const next = current.includes(id)
                ? current.filter((x) => x !== id)
                : [...current, id];
            return { ...prev, enabledTopStats: next };
        });
    }, []);

    const resetTopStats = useCallback(() => {
        setStatsViewSettings((prev) => ({ ...prev, enabledTopStats: [...DEFAULT_ENABLED_TOP_STATS] }));
    }, []);
```

- [ ] **Step 3: Render the picker**

Inside the "Dashboard - Top Stats & MVP" `SettingsSection` (after the "Top Stats Calculation" mode block, ~line 2198, before the Interrupt Display block), insert:

```tsx
                            <div className="py-3 border-t border-white/5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm font-medium text-gray-200">Top Stats Cards</div>
                                    <div className="text-xs text-gray-500">
                                        {normalizeEnabledTopStats(statsViewSettings.enabledTopStats).length} of {TOP_STATS_CATALOG.length} enabled
                                        <button type="button" onClick={resetTopStats} className="ml-2 text-blue-300 hover:text-blue-200">Reset to defaults</button>
                                    </div>
                                </div>
                                {CATEGORY_ORDER.map((cat: TopStatCategory) => {
                                    const meta = CATEGORY_META[cat];
                                    const defs = TOP_STATS_CATALOG.filter((d) => d.category === cat);
                                    const enabled = new Set(normalizeEnabledTopStats(statsViewSettings.enabledTopStats));
                                    const CatIcon = cat === 'offense' ? Swords : cat === 'defense' ? Shield : cat === 'control' ? Hammer : cat === 'utility' ? Wind : null;
                                    return (
                                        <div key={cat} className="mb-3.5 last:mb-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span style={{ color: meta.color }} className="inline-flex">
                                                    {cat === 'boon' ? <BoonGlyph className="w-3.5 h-3.5" /> : CatIcon ? <CatIcon className="w-3.5 h-3.5" /> : null}
                                                </span>
                                                <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: meta.color }}>{meta.label}</span>
                                                <span className="flex-1 h-px bg-white/5" />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {defs.map((def) => {
                                                    const on = enabled.has(def.id);
                                                    return (
                                                        <button
                                                            key={def.id}
                                                            type="button"
                                                            onClick={() => toggleTopStat(def.id)}
                                                            aria-pressed={on}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors"
                                                            style={on
                                                                ? { color: def.color, background: `${def.color}1f`, borderColor: `${def.color}66` }
                                                                : { color: '#6b7280', background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                                        >
                                                            <span
                                                                className="w-3 h-3 rounded-sm inline-flex items-center justify-center border"
                                                                style={{ borderColor: on ? def.color : 'rgba(255,255,255,0.18)', background: on ? def.color : 'transparent' }}
                                                            >
                                                                {on && (
                                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0f1115" strokeWidth={4}><path d="M20 6L9 17l-5-5" /></svg>
                                                                )}
                                                            </span>
                                                            {def.category === 'boon' && <BoonGlyph className="w-3 h-3" />}
                                                            {def.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
```

- [ ] **Step 4: Write the failing test**

Add to `src/renderer/__tests__/SettingsView.test.tsx` (follow the file's existing render harness / mocked `electronAPI`):

```tsx
it('toggles a top stat card and persists on save', async () => {
  renderSettings(); // existing helper in this file
  // DPS is default-off; enabling it should add 'dps' to enabledTopStats on save
  const dpsChip = await screen.findByRole('button', { name: /DPS/i });
  expect(dpsChip).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(dpsChip);
  expect(dpsChip).toHaveAttribute('aria-pressed', 'true');
});

it('reset to defaults restores the 9 default cards', async () => {
  renderSettings();
  const reset = await screen.findByRole('button', { name: /Reset to defaults/i });
  fireEvent.click(reset);
  // Down Contribution is a default; its chip should be pressed
  const dc = screen.getByRole('button', { name: /Down Contribution/i });
  expect(dc).toHaveAttribute('aria-pressed', 'true');
});
```

> If the existing test file lacks a `renderSettings` helper, reuse whatever mount pattern the other tests in the file use (they already mount `SettingsView` with mocked props/electronAPI). The assertions above only depend on the chips' `aria-pressed` state.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2 src/renderer/__tests__/SettingsView.test.tsx`
Expected: PASS (existing + 2 new). If existing tests assert an exact saved-settings object shape, update those fixtures to include `enabledTopStats: DEFAULT_ENABLED_TOP_STATS`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/SettingsView.tsx src/renderer/__tests__/SettingsView.test.tsx
git commit -m "feat(settings): add Top Stats Cards chip-grid picker"
```

---

## Task 9: Full validation pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint**

Run: `npm run validate`
Expected: PASS (typecheck clean, ESLint max-warnings 0).

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run --pool=forks --poolOptions.forks.maxForks=2`
Expected: PASS. Pay attention to any snapshot/shape tests touching `statsViewSettings` or aggregation output; update fixtures to include `enabledTopStats` / `boonLeaderboards` where an exact object is asserted.

- [ ] **Step 3: Regression suite**

Run: `npm run test:regression:stats`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`, open Settings → "Dashboard - Top Stats & MVP", toggle a few cards incl. a boon, confirm the dashboard grid updates and boon cards show glyph + uptime/stacks. Confirm existing users (no `enabledTopStats` saved) still see the original 9.

- [ ] **Step 5: Commit any fixture updates**

```bash
git add -A
git commit -m "test: update fixtures for enabledTopStats and boonLeaderboards"
```

---

## Self-Review Notes

- **Spec coverage:** catalog (Task 1), boon leaderboards (Tasks 3-4), `enabledTopStats` + migration (Tasks 2, 7, 8), rendering + boon cards + empty state + rate handling (Task 6), generic glyph (Task 5), Settings picker (Task 8), web report inherits via persisted setting (no extra task needed — `StatsView` is shared). All spec sections map to a task.
- **Stability dual-card:** `stability` (count, Defense) and `boon:stability` (uptime/stacks, Boons) are distinct catalog ids — matches spec.
- **interruptMode:** Top Stats grid is now driven solely by `enabledTopStats`; `cc`/`interrupts`/`ccAndInterrupts` are independent toggles. `interruptMode` remains for other surfaces.
- **Type consistency:** `normalizeEnabledTopStats`, `DEFAULT_ENABLED_TOP_STATS`, `TOP_STATS_CATALOG`, `buildBoonLeaderboards`, `BoonLeaderboardRow`, `BoonGlyph`, and the `enabledTopStats` prop names are used identically across tasks.
