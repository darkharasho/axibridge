# MVP Weighting on the Full Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users weight any of the 38 catalog stats toward the Offensive and/or Defensive MVP via three buckets (General/Offensive/Defensive), with custom weights, defaulting to today's exact MVP behavior.

**Architecture:** Replace the fixed `IMvpWeights` scoring inputs with three id-keyed weight maps (`IMvpWeightProfiles`). The aggregation builds MVP metrics by filtering the existing `TOP_STATS_CATALOG` to weighted stats and reusing the current `Σ(ratio × weight)` engine. The in-memory `mvpWeights` carrier (App state → worker → aggregation, already in cache keys) is retyped to hold an `IMvpWeightProfiles` so no cache-key/deps-array churn is needed; persistence uses a new `mvpWeightProfiles` field migrated from legacy `mvpWeights`.

**Tech Stack:** React + TypeScript, Vitest + jsdom, Tailwind, lucide-react. Aggregation in `incrementalAggregation.ts`; settings in `SettingsView.tsx`/`settingsHandlers.ts`.

**Spec:** `docs/superpowers/specs/2026-06-10-mvp-weighting-catalog-design.md`

**CRITICAL LESSON (from v2.8.0):** `global.d.ts` must NOT import `topStatsCatalog.ts` (it pulls in lucide-react and breaks the audit scripts' require-less TS sandbox). Keep catalog-referencing helpers in renderer modules; inline plain literals in `global.d.ts`. **Run `npm run audit:boons audit:metrics audit:conditions:consistency` before declaring done** (see Task 6).

Run tests with: `npx vitest run --maxWorkers=2 <file>` (Vitest 4; keep workers ≤ 2).

---

## File Structure

- **Create** `src/renderer/stats/mvpWeightProfiles.ts` — `normalizeMvpWeightProfiles` (migration + validation), `DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG` (catalog-derived, for the sync test), and `buildMvpMetrics(profileWeights, leaderboards, boonLeaderboards, getVal)` helper. One responsibility: turn weight maps + leaderboards into scoring metrics.
- **Create** `src/renderer/stats/__tests__/mvpWeightProfiles.test.ts` — migration/normalizer/build tests.
- **Modify** `src/renderer/global.d.ts` — `IMvpWeightProfiles` type + inlined `DEFAULT_MVP_WEIGHT_PROFILES`.
- **Modify** `src/renderer/stats/incrementalAggregation.ts` — consume profiles; catalog-driven metric building.
- **Modify** `src/renderer/SettingsView.tsx` — bucket-tab weight UI; load/save `mvpWeightProfiles`.
- **Modify** `src/renderer/StatsView.tsx` — MVP pill visibility from `contribs`.
- **Modify** `src/renderer/app/hooks/useSettings.ts` (and/or wherever App initializes `mvpWeights`) — load migrates to profiles.
- **Modify** `src/main/handlers/settingsHandlers.ts` — persist/pass through `mvpWeightProfiles`.
- **Modify** tests: `src/renderer/__tests__/SettingsView.test.tsx`.

---

## Task 1: Types, defaults, normalizer + migration

**Files:**
- Modify: `src/renderer/global.d.ts`
- Create: `src/renderer/stats/mvpWeightProfiles.ts`
- Create: `src/renderer/stats/__tests__/mvpWeightProfiles.test.ts`

- [ ] **Step 1: Add the type + default to `global.d.ts`**

After the `IMvpWeights` interface, add:

```ts
export interface IMvpWeightProfiles {
    general: Record<string, number>;
    offensive: Record<string, number>;
    defensive: Record<string, number>;
}
```

Near `DEFAULT_MVP_WEIGHTS`, add the inlined default (plain literal — do NOT import the catalog here):

```ts
// Keep in sync with the catalog-derived value in stats/mvpWeightProfiles.ts
// (a unit test enforces this). Inlined as plain data so global.d.ts does not
// import the lucide-bearing catalog (which breaks the audit TS sandbox).
export const DEFAULT_MVP_WEIGHT_PROFILES: IMvpWeightProfiles = {
    offensive: { downContrib: 1, dps: 0.2, damage: 0.2 },
    general: { strips: 1, cc: 0.7, closestToTag: 0.7, participation: 0.7, dodges: 0.4 },
    defensive: { healing: 1, downedHealing: 0.7, cleanses: 1, stability: 1, revives: 0.7 },
};
```

- [ ] **Step 2: Write the failing test**

```ts
// src/renderer/stats/__tests__/mvpWeightProfiles.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeMvpWeightProfiles } from '../mvpWeightProfiles';
import { DEFAULT_MVP_WEIGHT_PROFILES } from '../../global.d';

describe('normalizeMvpWeightProfiles', () => {
  it('returns defaults for undefined', () => {
    expect(normalizeMvpWeightProfiles(undefined)).toEqual(DEFAULT_MVP_WEIGHT_PROFILES);
  });

  it('migrates a legacy flat IMvpWeights object into buckets', () => {
    const legacy = {
      offensiveDownContribution: 1, offensiveDps: 0.2, offensiveDamage: 0.2,
      generalStrips: 1, generalCc: 0.7, generalDistanceToTag: 0.7,
      generalParticipation: 0.7, generalDodging: 0.4,
      defensiveHealing: 1, defensiveDownedHealing: 0.7, defensiveCleanses: 1,
      defensiveStability: 1, defensiveRevives: 0.7,
    };
    const out = normalizeMvpWeightProfiles(legacy);
    expect(out.offensive).toEqual({ downContrib: 1, dps: 0.2, damage: 0.2 });
    expect(out.general).toEqual({ strips: 1, cc: 0.7, closestToTag: 0.7, participation: 0.7, dodges: 0.4 });
    expect(out.defensive).toEqual({ healing: 1, downedHealing: 0.7, cleanses: 1, stability: 1, revives: 0.7 });
  });

  it('keeps an already-profiled object, dropping unknown ids and non-numbers', () => {
    const input = {
      offensive: { downContrib: 0.5, bogus: 3, dps: 'x' as any },
      general: { 'boon:might': 0.3 },
      defensive: {},
    };
    const out = normalizeMvpWeightProfiles(input);
    expect(out.offensive).toEqual({ downContrib: 0.5 });
    expect(out.general).toEqual({ 'boon:might': 0.3 });
    expect(out.defensive).toEqual({});
  });

  it('default profiles match the catalog-derived defaults', async () => {
    const { DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG } = await import('../mvpWeightProfiles');
    expect(DEFAULT_MVP_WEIGHT_PROFILES).toEqual(DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG);
  });
});
```

- [ ] **Step 3: Run it — confirm FAIL** (`Cannot find module '../mvpWeightProfiles'`).

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/mvpWeightProfiles.test.ts`

- [ ] **Step 4: Create `src/renderer/stats/mvpWeightProfiles.ts`**

```ts
import { TOP_STATS_CATALOG, type TopStatDef } from './topStatsCatalog';
import { DEFAULT_MVP_WEIGHT_PROFILES, type IMvpWeightProfiles } from '../global.d';

const VALID_IDS = new Set(TOP_STATS_CATALOG.map((d) => d.id));

// Legacy IMvpWeights key -> [bucket, catalog id]
const LEGACY_MAP: Record<string, [keyof IMvpWeightProfiles, string]> = {
  offensiveDownContribution: ['offensive', 'downContrib'],
  offensiveDps: ['offensive', 'dps'],
  offensiveDamage: ['offensive', 'damage'],
  generalStrips: ['general', 'strips'],
  generalCc: ['general', 'cc'],
  generalDistanceToTag: ['general', 'closestToTag'],
  generalParticipation: ['general', 'participation'],
  generalDodging: ['general', 'dodges'],
  defensiveHealing: ['defensive', 'healing'],
  defensiveDownedHealing: ['defensive', 'downedHealing'],
  defensiveCleanses: ['defensive', 'cleanses'],
  defensiveStability: ['defensive', 'stability'],
  defensiveRevives: ['defensive', 'revives'],
};

const cleanBucket = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, w] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(w);
      if (VALID_IDS.has(id) && Number.isFinite(n) && n > 0) out[id] = n;
    }
  }
  return out;
};

const isProfiles = (v: any): boolean =>
  v && typeof v === 'object' && ('general' in v || 'offensive' in v || 'defensive' in v)
    && !('offensiveDownContribution' in v);

export const normalizeMvpWeightProfiles = (value: unknown): IMvpWeightProfiles => {
  if (isProfiles(value)) {
    const v = value as Partial<IMvpWeightProfiles>;
    return { general: cleanBucket(v.general), offensive: cleanBucket(v.offensive), defensive: cleanBucket(v.defensive) };
  }
  if (value && typeof value === 'object') {
    // Legacy flat IMvpWeights -> buckets
    const out: IMvpWeightProfiles = { general: {}, offensive: {}, defensive: {} };
    let matched = false;
    for (const [legacyKey, [bucket, id]] of Object.entries(LEGACY_MAP)) {
      const n = Number((value as Record<string, unknown>)[legacyKey]);
      if (Number.isFinite(n)) { matched = true; if (n > 0) out[bucket][id] = n; }
    }
    if (matched) return out;
  }
  return {
    general: { ...DEFAULT_MVP_WEIGHT_PROFILES.general },
    offensive: { ...DEFAULT_MVP_WEIGHT_PROFILES.offensive },
    defensive: { ...DEFAULT_MVP_WEIGHT_PROFILES.defensive },
  };
};

// Catalog-derived mirror of DEFAULT_MVP_WEIGHT_PROFILES, used only by the sync test.
// (Built from a small explicit table so it stays a single source the test checks.)
const DEFAULT_TABLE: Array<[keyof IMvpWeightProfiles, string, number]> = [
  ['offensive', 'downContrib', 1], ['offensive', 'dps', 0.2], ['offensive', 'damage', 0.2],
  ['general', 'strips', 1], ['general', 'cc', 0.7], ['general', 'closestToTag', 0.7],
  ['general', 'participation', 0.7], ['general', 'dodges', 0.4],
  ['defensive', 'healing', 1], ['defensive', 'downedHealing', 0.7], ['defensive', 'cleanses', 1],
  ['defensive', 'stability', 1], ['defensive', 'revives', 0.7],
];
export const DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG: IMvpWeightProfiles = (() => {
  const out: IMvpWeightProfiles = { general: {}, offensive: {}, defensive: {} };
  for (const [bucket, id, w] of DEFAULT_TABLE) {
    if (!VALID_IDS.has(id)) throw new Error(`Unknown MVP default stat id: ${id}`);
    out[bucket][id] = w;
  }
  return out;
})();

export interface MvpMetric {
  name: string;
  weight: number;
  leaderboard: any[];
  getter: (s: any) => number;
  higher?: boolean;
}

// Build scoring metrics for one weight bucket. `getVal(s, key)` returns a
// player's leaderboard-stat value; boon values come from the boon leaderboard.
export const buildMvpMetrics = (
  weights: Record<string, number>,
  leaderboards: Record<string, any[]>,
  boonLeaderboards: Record<string, any[]>,
  getVal: (s: any, key: string) => number,
): MvpMetric[] => {
  const metrics: MvpMetric[] = [];
  for (const def of TOP_STATS_CATALOG as TopStatDef[]) {
    const weight = weights[def.id] || 0;
    if (weight <= 0) continue;
    if (def.source.kind === 'boon') {
      const lb = boonLeaderboards[def.source.boonId] || [];
      const valueByAccount = new Map<string, number>(lb.map((r: any) => [String(r.account), Number(r.value) || 0]));
      metrics.push({ name: def.label, weight, higher: def.higherIsBetter, leaderboard: lb, getter: (s) => valueByAccount.get(String(s.account)) ?? 0 });
    } else {
      const key = def.source.key;
      metrics.push({ name: def.label, weight, higher: def.higherIsBetter, leaderboard: leaderboards[key] || [], getter: (s) => getVal(s, key) });
    }
  }
  return metrics;
};
```

- [ ] **Step 5: Run the test — confirm all 4 pass.**

- [ ] **Step 6: Typecheck.** `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/global.d.ts src/renderer/stats/mvpWeightProfiles.ts src/renderer/stats/__tests__/mvpWeightProfiles.test.ts
git commit -m "feat(mvp): add weight profiles type, defaults, and migration normalizer"
```

---

## Task 2: Catalog-driven MVP scoring in aggregation

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` (options ~line 235; constructor ~line 548; metric arrays ~line 1245-1283; scoring calls ~line 1330-1344; `computeStatsSync` ~line 1777-1800)

**Context:** The in-memory `mvpWeights` option now carries an `IMvpWeightProfiles` (or legacy/ undefined). We normalize it to profiles and build metrics from the catalog.

- [ ] **Step 1: Update imports + the option type**

At the top of `incrementalAggregation.ts`, change the global.d import to also bring the profiles type/default, and import the new helpers:

```ts
import type { DisruptionMethod, IMvpWeightProfiles, IStatsViewSettings } from '../global.d';
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { normalizeMvpWeightProfiles, buildMvpMetrics } from './mvpWeightProfiles';
```

Remove the now-unused `IMvpWeights`, `DEFAULT_MVP_WEIGHTS`, `normalizeMvpWeights` imports (only if nothing else in the file uses them — grep first; if used elsewhere, keep).

In `IncrementalAggregatorOptions` change `mvpWeights?: IMvpWeights;` to:

```ts
    mvpWeights?: IMvpWeightProfiles | unknown; // carries profiles; legacy/undefined tolerated by the normalizer
```

- [ ] **Step 2: Update the constructor field**

Replace the `activeMvpWeights` field (`private activeMvpWeights: IMvpWeights;`) with:

```ts
    private activeMvpProfiles: IMvpWeightProfiles;
```

And in the constructor, replace the assignment:

```ts
        this.activeMvpProfiles = normalizeMvpWeightProfiles(options.mvpWeights);
```

- [ ] **Step 3: Replace the hardcoded metric arrays with profile-built metrics**

In `finalize()`, find the three arrays `offensiveMetrics`, `generalMetrics`, `defensiveMetrics` (lines ~1245-1283) and the lines that build `computeCategoryScores([...offensiveMetrics, ...generalMetrics], …)` and `([...defensiveMetrics, ...generalMetrics], …)`.

Delete the three array literals and replace with:

```ts
            const offensiveMetrics = buildMvpMetrics(this.activeMvpProfiles.offensive, leaderboards as any, boonLeaderboards, getVal);
            const generalMetrics = buildMvpMetrics(this.activeMvpProfiles.general, leaderboards as any, boonLeaderboards, getVal);
            const defensiveMetrics = buildMvpMetrics(this.activeMvpProfiles.defensive, leaderboards as any, boonLeaderboards, getVal);
```

Leave the `computeCategoryScores([...offensiveMetrics, ...generalMetrics], offensivePool)` and defensive equivalents UNCHANGED — they already accept this metric shape (`{name, weight, leaderboard, getter, higher?}`).

> `getVal` and `boonLeaderboards` are both in scope inside `finalize()` (defined earlier in the function). The `MvpMetric` shape matches `computeCategoryScores`'s expected `{name, weight, leaderboard, getter, higher?}`.

- [ ] **Step 4: Update `computeStatsSync` typing**

In the `computeStatsSync` param block (~line 1787), change `mvpWeights?: IMvpWeights;` to `mvpWeights?: IMvpWeightProfiles | unknown;`. It already forwards `mvpWeights` into the aggregator unchanged — no other change.

- [ ] **Step 5: Write a regression test — defaults reproduce a deterministic winner**

```ts
// src/renderer/stats/__tests__/incrementalAggregation.mvpProfiles.test.ts
import { describe, it, expect } from 'vitest';
import { computeStatsSync } from '../incrementalAggregation';
import { DEFAULT_MVP_WEIGHT_PROFILES, DEFAULT_STATS_VIEW_SETTINGS } from '../../global.d';

function player(account: string, over: any = {}) {
  return {
    account, name: account, profession: 'Firebrand', notInSquad: false,
    activeTimes: [60_000], dpsAll: [{ damage: over.damage ?? 1000, breakbarDamage: 0 }],
    statsAll: [{}], support: [{ resurrects: over.revives ?? 0 }],
    statsTargets: [[{ killed: 0, downed: 0 }]],
    defenses: [{ downCount: 0, deadCount: 0, damageTaken: 0, blockedCount: 0, evadedCount: 0, missedCount: 0 }],
    extHealingStats: over.extHealingStats,
    ...over.extra,
  };
}

function makeLog(players: any[]) {
  return { status: 'success', filePath: 'l1', details: { durationMS: 60_000, players, targets: [], skillMap: {}, buffMap: {} } };
}

describe('MVP profiles scoring', () => {
  it('with default profiles, the higher-damage player wins Offensive MVP', () => {
    const logs = [makeLog([
      player('hi.1', { damage: 5_000_000 }),
      player('lo.2', { damage: 1_000 }),
    ])];
    const { stats } = computeStatsSync({
      logs: logs as any[],
      mvpWeights: DEFAULT_MVP_WEIGHT_PROFILES as any,
      statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, showMvp: true },
    });
    expect(stats.offensiveMvp.account).toBe('hi.1');
  });

  it('zero weights everywhere yields no MVP', () => {
    const logs = [makeLog([player('a.1', { damage: 5_000_000 })])];
    const { stats } = computeStatsSync({
      logs: logs as any[],
      mvpWeights: { general: {}, offensive: {}, defensive: {} } as any,
      statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, showMvp: true },
    });
    expect(stats.offensiveMvp.account).toBe('None');
  });
});
```

- [ ] **Step 6: Run the new test + the existing MVP regression**

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/incrementalAggregation.mvpProfiles.test.ts`
Expected: PASS. Then `npm run test:regression:stats` → PASS.

If `extHealingStats` shape causes the damage-role classification to misfire and `hi.1` isn't classed as damage, the offensive pool falls back to all players (existing behavior), so the assertion still holds; if it fails, inspect `roleClassification` and adjust the fixture's `dpsAll.damage` so `hi.1` is clearly the damage leader.

- [ ] **Step 7: Typecheck + lint.** `npm run typecheck` and `npx eslint src/renderer/stats/incrementalAggregation.ts src/renderer/stats/mvpWeightProfiles.ts` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts src/renderer/stats/__tests__/incrementalAggregation.mvpProfiles.test.ts
git commit -m "feat(mvp): score MVP from catalog-driven weight profiles"
```

---

## Task 3: Load/migrate profiles into app state + persistence

**Files:**
- Modify: `src/renderer/app/hooks/useSettings.ts` (where `mvpWeights` is initialized/loaded — grep `mvpWeights` in that file; if absent, find the hook that returns `mvpWeights, setMvpWeights` used by `App.tsx:58`)
- Modify: `src/main/handlers/settingsHandlers.ts` (persist pass-through)

**Context:** The in-memory `mvpWeights` carrier now holds an `IMvpWeightProfiles`. On load we migrate from persisted `mvpWeightProfiles ?? mvpWeights`. On save we write `mvpWeightProfiles` (Task 4 does the SettingsView save).

- [ ] **Step 1: Locate the loader**

Run: `grep -rn "mvpWeights" src/renderer/app/hooks/useSettings.ts src/renderer/App.tsx`
Identify where the persisted settings initialize the `mvpWeights` state (e.g. `setMvpWeights(settings.mvpWeights ...)` or a default).

- [ ] **Step 2: Migrate on load**

Where the loaded settings hydrate `mvpWeights`, change the value to:

```ts
import { normalizeMvpWeightProfiles } from '../stats/mvpWeightProfiles'; // adjust relative path
// ...
setMvpWeights(normalizeMvpWeightProfiles(loaded?.mvpWeightProfiles ?? loaded?.mvpWeights));
```

Retype the `mvpWeights` state to `IMvpWeightProfiles` (and its default to `DEFAULT_MVP_WEIGHT_PROFILES`). If the hook initializes `useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS)`, change to `useState<IMvpWeightProfiles>(DEFAULT_MVP_WEIGHT_PROFILES)`.

- [ ] **Step 3: Main-process persistence pass-through**

In `src/main/handlers/settingsHandlers.ts`, ensure `mvpWeightProfiles` is saved and returned alongside other settings. Find where the settings object is assembled for save/load and include `mvpWeightProfiles` verbatim (no transformation needed in main; the renderer normalizes). If there is a normalize-on-save for `mvpWeights`, leave it; just also pass `mvpWeightProfiles` through untouched.

- [ ] **Step 4: Typecheck.** `npm run typecheck` → exit 0. Fix any remaining `IMvpWeights`-typed references that now receive profiles by widening to `IMvpWeightProfiles` (e.g. the App→StatsView→hook prop chain; grep `mvpWeights` and retype the prop/option types to `IMvpWeightProfiles`). The aggregator option already accepts `IMvpWeightProfiles | unknown` from Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app/hooks/useSettings.ts src/main/handlers/settingsHandlers.ts src/renderer/App.tsx
git commit -m "feat(mvp): load/migrate weight profiles and persist them"
```

---

## Task 4: Settings UI — bucket tabs + weighted chips

**Files:**
- Modify: `src/renderer/SettingsView.tsx` (MVP Weighting section ~line 2427+; state ~line 205; save object ~line 899; load ~line 511)
- Modify: `src/renderer/__tests__/SettingsView.test.tsx`

- [ ] **Step 1: State, load, save**

- Add imports:
```ts
import { TOP_STATS_CATALOG, CATEGORY_ORDER, CATEGORY_META, type TopStatCategory } from './stats/topStatsCatalog';
import { normalizeMvpWeightProfiles } from './stats/mvpWeightProfiles';
import { DEFAULT_MVP_WEIGHT_PROFILES, type IMvpWeightProfiles } from './global.d';
```
- Replace the `mvpWeights` state (`useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS)`) with:
```ts
    const [mvpProfiles, setMvpProfiles] = useState<IMvpWeightProfiles>(DEFAULT_MVP_WEIGHT_PROFILES);
    const [mvpBucket, setMvpBucket] = useState<keyof IMvpWeightProfiles>('offensive');
```
- On settings load (the effect around line 511 that calls `setMvpWeights(normalizeMvpWeights(...))`), replace with:
```ts
        setMvpProfiles(normalizeMvpWeightProfiles(settings.mvpWeightProfiles ?? settings.mvpWeights));
```
- In the save-settings object (around line 899 where `mvpWeights: mvpWeights` is set), add `mvpWeightProfiles: mvpProfiles,` (keep the existing `mvpWeights` line as-is for back-compat).
- In `onMvpWeightsSaved?.(...)` (around line 922), pass the profiles instead: `onMvpWeightsSaved?.(mvpProfiles as any);` (App's setter now stores profiles — Task 3).

- [ ] **Step 2: Weight handlers**

Near other `useCallback` setting helpers, add:

```ts
    const setMvpWeight = useCallback((bucket: keyof IMvpWeightProfiles, id: string, weight: number) => {
        const w = Math.max(0, Math.min(1, Math.round(weight * 20) / 20)); // 0..1 step 0.05
        setMvpProfiles((prev) => {
            const nextBucket = { ...prev[bucket] };
            if (w > 0) nextBucket[id] = w; else delete nextBucket[id];
            return { ...prev, [bucket]: nextBucket };
        });
    }, []);

    const resetMvpProfiles = useCallback(() => setMvpProfiles({
        general: { ...DEFAULT_MVP_WEIGHT_PROFILES.general },
        offensive: { ...DEFAULT_MVP_WEIGHT_PROFILES.offensive },
        defensive: { ...DEFAULT_MVP_WEIGHT_PROFILES.defensive },
    }), []);
```

- [ ] **Step 3: Replace the MVP Weighting section body**

In the `SettingsSection title="MVP Weighting"` block, replace its inner content (the General/Offensive/Defensive slider lists) with the bucket-tab + chip-stepper UI:

```tsx
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex gap-2">
                                {(['offensive', 'defensive', 'general'] as const).map((b) => (
                                    <button
                                        key={b}
                                        type="button"
                                        onClick={() => setMvpBucket(b)}
                                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${mvpBucket === b ? 'bg-blue-500/20 text-blue-200 border-blue-500/40' : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'}`}
                                    >
                                        {b === 'offensive' ? 'Offensive' : b === 'defensive' ? 'Defensive' : 'General'}
                                        {b === 'general' && <span className="opacity-60 font-normal"> (both)</span>}
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={resetMvpProfiles} className="text-xs text-blue-300 hover:text-blue-200">Reset to defaults</button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Weight any stat toward this MVP. 0 = ignored. Offensive &amp; Defensive also include the General weights.</p>
                        {CATEGORY_ORDER.map((cat: TopStatCategory) => {
                            const meta = CATEGORY_META[cat];
                            const defs = TOP_STATS_CATALOG.filter((d) => d.category === cat);
                            return (
                                <div key={cat} className="mb-3.5 last:mb-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                                        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: meta.color }}>{meta.label}</span>
                                        <span className="flex-1 h-px bg-white/5" />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {defs.map((def) => {
                                            const w = mvpProfiles[mvpBucket][def.id] || 0;
                                            const on = w > 0;
                                            return (
                                                <div key={def.id} className="inline-flex items-center rounded-lg border overflow-hidden"
                                                    style={on ? { borderColor: `${meta.color}66`, background: `${meta.color}1f` } : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                                                    <span className="pl-2.5 pr-1 py-1 text-xs font-semibold" style={{ color: on ? meta.color : '#6b7280' }}>{def.label}</span>
                                                    <button type="button" aria-label={`decrease ${def.label}`} onClick={() => setMvpWeight(mvpBucket, def.id, w - 0.05)} className="w-5 h-6 text-sm leading-none" style={{ color: on ? meta.color : '#4b5563' }}>−</button>
                                                    <span className="min-w-[30px] text-center text-xs font-bold tabular-nums" style={{ color: on ? meta.color : '#4b5563' }}>{w.toFixed(2)}</span>
                                                    <button type="button" aria-label={`increase ${def.label}`} onClick={() => setMvpWeight(mvpBucket, def.id, w + 0.05)} className="w-5 h-6 text-sm leading-none pr-1" style={{ color: on ? meta.color : '#9ca3af' }}>+</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
```

Match the file's actual indentation. Remove the now-dead `updateMvpWeight`, `mvpWeights` slider list, and `formatWeight` usage IF nothing else uses them (grep; `formatWeight` may be exported/used elsewhere — keep it if so).

- [ ] **Step 4: Tests**

Add to `src/renderer/__tests__/SettingsView.test.tsx` (reuse the existing mount harness):

```tsx
it('increments an MVP weight via the stepper', async () => {
  // render SettingsView via existing harness, ensure MVP Weighting section is visible
  const inc = await screen.findByRole('button', { name: /increase Down Contribution/i });
  // Down Contribution defaults to 1.00 in Offensive; clamp keeps it at 1.00
  fireEvent.click(inc);
  expect(screen.getByText('1.00')).toBeInTheDocument();
});

it('switches MVP buckets', async () => {
  const defensiveTab = await screen.findByRole('button', { name: /^Defensive$/i });
  fireEvent.click(defensiveTab);
  // Healing defaults to 1.00 in the Defensive bucket
  expect(await screen.findByRole('button', { name: /increase Healing/i })).toBeInTheDocument();
});
```

If existing SettingsView tests assert an exact saved object containing `mvpWeights`, update them to also include `mvpWeightProfiles`.

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx` → green.
`npx eslint src/renderer/SettingsView.tsx` → clean (remove dead imports/vars it flags).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/SettingsView.tsx src/renderer/__tests__/SettingsView.test.tsx
git commit -m "feat(settings): bucket-tab MVP weighting over the full catalog"
```

---

## Task 5: MVP pill visibility from contribs

**Files:**
- Modify: `src/renderer/StatsView.tsx` (`mvpStatWeightKeys`/`isMvpStatEnabled` ~line 766-785; usage passed to `TopPlayersSection` ~line 4281/4724)
- Modify: `src/renderer/stats/sections/TopPlayersSection.tsx` (the `isMvpStatEnabled` prop + pill filters)

**Context:** Pills inside the MVP cards come from each placement's `topStats` (built from weighted `contribs`). Since only weighted stats appear in `contribs`, every pill is already "enabled" — so the `isMvpStatEnabled` filter can return true (show all).

- [ ] **Step 1: Simplify `isMvpStatEnabled` in `StatsView.tsx`**

Replace the `mvpStatWeightKeys` map and `isMvpStatEnabled` function with:

```ts
    // MVP pills are built only from weighted stats (contribs), so all are shown.
    const isMvpStatEnabled = (_name: string) => true;
```

Remove the now-unused `mvpStatWeightKeys` object and any now-unused `IMvpWeights`/`activeMvpWeights` references in `StatsView.tsx` (grep; retype the `mvpWeights` prop on `StatsView` to `IMvpWeightProfiles` if it was `IMvpWeights`).

- [ ] **Step 2: Typecheck.** `npm run typecheck` → exit 0.

- [ ] **Step 3: Run the TopPlayers tests** (pills still render):

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/TopPlayersSection.test.tsx` → green.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/StatsView.tsx src/renderer/stats/sections/TopPlayersSection.tsx
git commit -m "feat(mvp): show all weighted-stat pills on MVP cards"
```

---

## Task 6: Full validation (incl. audits)

**Files:** none (verification).

- [ ] **Step 1: Typecheck + lint.** `npm run validate` → PASS.

- [ ] **Step 2: Audits (the v2.8.0 gate).**

Run each and confirm PASS / no `require is not defined`:
```bash
npm run audit:boons
npm run audit:metrics
npm run audit:conditions:consistency
```
If any fails with a sandbox/require error, a renderer module that imports the lucide catalog has leaked into `global.d.ts` or a `shared/*` module — fix by keeping catalog imports renderer-side.

- [ ] **Step 3: Full unit suite.** `npx vitest run --maxWorkers=2` → all pass. Update any fixture that asserts an exact settings/aggregation object to include the new fields.

- [ ] **Step 4: Regression.** `npm run test:regression:stats` → PASS.

- [ ] **Step 5: Manual smoke (recommended).** `npm run dev`; Settings → MVP Weighting: switch buckets, bump a boon weight in Defensive, confirm the Defensive MVP card/score reacts and the pills reflect weighted stats. Confirm an existing profile (legacy `mvpWeights`) still produces the same MVP as before the change.

- [ ] **Step 6: Commit any fixture updates**

```bash
git add -A
git commit -m "test: update fixtures for mvpWeightProfiles"
```

---

## Self-Review Notes

- **Spec coverage:** data model + default (T1), migration/normalizer (T1), catalog-driven scoring incl. boons & lower-is-better (T2), load/persist (T3), bucket-tab UI (T4), pill visibility (T5), audits gate (T6). All spec sections mapped.
- **Lucide/audit lesson:** `global.d.ts` holds only the inlined literal + type; the catalog-referencing normalizer/builder live in `stats/mvpWeightProfiles.ts`; Task 6 runs the audits explicitly.
- **Carrier decision:** the in-memory `mvpWeights` prop/option/state carries `IMvpWeightProfiles`; persisted field is `mvpWeightProfiles` (migrated from legacy `mvpWeights`). This avoids touching cache-key code and App dependency arrays.
- **Type consistency:** `IMvpWeightProfiles`, `normalizeMvpWeightProfiles`, `buildMvpMetrics`, `DEFAULT_MVP_WEIGHT_PROFILES`, `mvpProfiles`/`mvpBucket`, and the `{name,weight,leaderboard,getter,higher}` metric shape are used identically across tasks; the metric shape matches the existing `computeCategoryScores` consumer.
