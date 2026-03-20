# APM (No Procs) Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "APM (No Procs)" column to the APM Breakdown table that excludes auto attacks, trait procs, gear procs, and unconditional procs.

**Architecture:** The EI JSON `skillMap` provides `isTraitProc`, `isGearProc`, and `isUnconditionalProc` booleans per skill. These flow through pruning → `computeSkillUsageData` → `useApmStats` → `ApmSection` UI. Each layer needs a small extension to pass through and consume the proc flags.

**Tech Stack:** TypeScript, React (hooks), Vitest, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-20-apm-no-procs-column-design.md`

---

### Task 1: Preserve proc flags through renderer-side pruning

**Files:**
- Modify: `src/renderer/stats/utils/pruneStatsLog.ts:13-36` (pruneMetaMap)
- Modify: `src/renderer/stats/utils/pruneStatsLog.ts:101` (skillMap call site)
- Create: `src/renderer/__tests__/pruneStatsLog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/pruneStatsLog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pruneDetailsForStats } from '../stats/utils/pruneStatsLog';

describe('pruneDetailsForStats — skillMap proc flags', () => {
    it('preserves isTraitProc, isGearProc, and isUnconditionalProc on skillMap entries', () => {
        const details = {
            players: [],
            targets: [],
            skillMap: {
                s100: { name: 'Windborne Notes', icon: 'https://example.com/icon.png', autoAttack: false, isTraitProc: true, isGearProc: false, isUnconditionalProc: false },
                s200: { name: 'Sigil of Fire', icon: 'https://example.com/fire.png', autoAttack: false, isTraitProc: false, isGearProc: true, isUnconditionalProc: false },
                s300: { name: 'Selfless Daring', icon: 'https://example.com/sd.png', autoAttack: false, isTraitProc: false, isGearProc: false, isUnconditionalProc: true },
                s400: { name: 'Sword Strike', icon: 'https://example.com/sword.png', autoAttack: true, isTraitProc: false, isGearProc: false, isUnconditionalProc: false },
            },
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.skillMap.s100.isTraitProc).toBe(true);
        expect(pruned.skillMap.s100.isGearProc).toBe(false);
        expect(pruned.skillMap.s100.isUnconditionalProc).toBe(false);
        expect(pruned.skillMap.s200.isGearProc).toBe(true);
        expect(pruned.skillMap.s300.isUnconditionalProc).toBe(true);
        expect(pruned.skillMap.s400.autoAttack).toBe(true);
        expect(pruned.skillMap.s400.isTraitProc).toBe(false);
    });

    it('omits proc flags when they are not present on the source entry', () => {
        const details = {
            players: [],
            targets: [],
            skillMap: {
                s500: { name: 'Plain Skill', icon: 'https://example.com/plain.png' },
            },
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.skillMap.s500.name).toBe('Plain Skill');
        expect(pruned.skillMap.s500.isTraitProc).toBeUndefined();
        expect(pruned.skillMap.s500.isGearProc).toBeUndefined();
        expect(pruned.skillMap.s500.isUnconditionalProc).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/pruneStatsLog.test.ts`
Expected: FAIL — `pruned.skillMap.s100.isTraitProc` is `undefined` (stripped by pruneMetaMap)

- [ ] **Step 3: Add `includeProcFlags` option to `pruneMetaMap`**

In `src/renderer/stats/utils/pruneStatsLog.ts`, update the `pruneMetaMap` function signature at line 13:

```ts
const pruneMetaMap = (source: any, options?: { includeClassification?: boolean; includeStacking?: boolean; includeAutoAttack?: boolean; includeProcFlags?: boolean }) => {
```

After the `includeAutoAttack` block (after line 33), add:

```ts
        if (options?.includeProcFlags) {
            if (typeof (value as any).isTraitProc === 'boolean') next.isTraitProc = (value as any).isTraitProc;
            if (typeof (value as any).isGearProc === 'boolean') next.isGearProc = (value as any).isGearProc;
            if (typeof (value as any).isUnconditionalProc === 'boolean') next.isUnconditionalProc = (value as any).isUnconditionalProc;
        }
```

Then update the `skillMap` call site (line 101) from:

```ts
    pruned.skillMap = pruneMetaMap(pruned.skillMap, { includeClassification: false, includeStacking: false, includeAutoAttack: true });
```

to:

```ts
    pruned.skillMap = pruneMetaMap(pruned.skillMap, { includeClassification: false, includeStacking: false, includeAutoAttack: true, includeProcFlags: true });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/pruneStatsLog.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run src/renderer/__tests__/useApmStats.test.tsx src/renderer/__tests__/computeSkillUsageData.test.ts src/renderer/__tests__/StatsView.integration.test.tsx src/main/__tests__/detailsProcessing.test.ts`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/utils/pruneStatsLog.ts src/renderer/__tests__/pruneStatsLog.test.ts
git commit -m "feat(apm): preserve proc flags through renderer-side pruning"
```

---

### Task 2: Pass proc flags through `computeSkillUsageData`

**Files:**
- Modify: `src/renderer/stats/computeSkillUsageData.ts:14,56-58,68-71`
- Modify: `src/renderer/stats/statsTypes.ts:13-19` (SkillOption)
- Modify: `src/renderer/__tests__/computeSkillUsageData.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the end of `src/renderer/__tests__/computeSkillUsageData.test.ts`:

```ts
describe('computeSkillUsageData — proc flag passthrough', () => {
    it('passes isTraitProc, isGearProc, and isUnconditionalProc from skillMap to skillOptions', () => {
        const log = makeLog({
            skillMap: {
                s1001: { name: 'Windborne Notes', icon: 'https://example.com/wn.png', autoAttack: false, isTraitProc: true, isGearProc: false, isUnconditionalProc: false },
                s1002: { name: 'Sigil of Fire', icon: 'https://example.com/fire.png', autoAttack: false, isTraitProc: false, isGearProc: true, isUnconditionalProc: false },
            },
        });
        const result = computeSkillUsageData([log]);
        const wnOption = result.skillOptions.find((o) => o.id === 's1001');
        const sigOption = result.skillOptions.find((o) => o.id === 's1002');
        expect(wnOption?.isTraitProc).toBe(true);
        expect(wnOption?.isGearProc).toBe(false);
        expect(sigOption?.isGearProc).toBe(true);
        expect(sigOption?.isTraitProc).toBe(false);
    });

    it('leaves proc flags undefined when skillMap entries lack them', () => {
        const result = computeSkillUsageData([makeLog()]);
        const option = result.skillOptions.find((o) => o.id === 's1001');
        expect(option?.isTraitProc).toBeUndefined();
        expect(option?.isGearProc).toBeUndefined();
        expect(option?.isUnconditionalProc).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/computeSkillUsageData.test.ts`
Expected: FAIL — `wnOption?.isTraitProc` is `undefined`

- [ ] **Step 3: Add proc fields to `SkillOption` type**

In `src/renderer/stats/statsTypes.ts`, update the `SkillOption` interface (lines 13-19):

```ts
export interface SkillOption {
    id: string;
    name: string;
    total: number;
    autoAttack?: boolean;
    isTraitProc?: boolean;
    isGearProc?: boolean;
    isUnconditionalProc?: boolean;
    icon?: string;
}
```

- [ ] **Step 4: Add proc maps and passthrough in `computeSkillUsageData`**

In `src/renderer/stats/computeSkillUsageData.ts`, after line 14 (`skillAutoAttackMap`), add:

```ts
    const skillProcMap = new Map<string, { isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean }>();
```

After the `skillAutoAttackMap` block (lines 56-58), add:

```ts
                if (!skillProcMap.has(sId)) {
                    const entry = skillMap[sId];
                    if (entry) {
                        const proc: { isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean } = {};
                        if (typeof entry.isTraitProc === 'boolean') proc.isTraitProc = entry.isTraitProc;
                        if (typeof entry.isGearProc === 'boolean') proc.isGearProc = entry.isGearProc;
                        if (typeof entry.isUnconditionalProc === 'boolean') proc.isUnconditionalProc = entry.isUnconditionalProc;
                        if (Object.keys(proc).length > 0) skillProcMap.set(sId, proc);
                    }
                }
```

Update the `skillOptions` builder (lines 68-71) from:

```ts
    const skillOptions = Array.from(skillTotals.entries()).map(([id, total]) => ({
        id, name: skillNameMap.get(id) || id, total, icon: skillIconMap.get(id),
        autoAttack: skillAutoAttackMap.get(id)
    })).sort((a, b) => b.total - a.total);
```

to:

```ts
    const skillOptions = Array.from(skillTotals.entries()).map(([id, total]) => ({
        id, name: skillNameMap.get(id) || id, total, icon: skillIconMap.get(id),
        autoAttack: skillAutoAttackMap.get(id),
        ...skillProcMap.get(id)
    })).sort((a, b) => b.total - a.total);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/computeSkillUsageData.test.ts`
Expected: PASS (all 30 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/statsTypes.ts src/renderer/stats/computeSkillUsageData.ts src/renderer/__tests__/computeSkillUsageData.test.ts
git commit -m "feat(apm): pass proc flags through computeSkillUsageData to skillOptions"
```

---

### Task 3: Compute `apmNoProcs` in `useApmStats`

**Files:**
- Modify: `src/renderer/stats/statsTypes.ts:56-70,80-89` (ApmPlayerRow, ApmSpecBucket)
- Modify: `src/renderer/stats/hooks/useApmStats.ts`
- Modify: `src/renderer/__tests__/useApmStats.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('useApmStats', ...)` block in `src/renderer/__tests__/useApmStats.test.tsx` (before the closing `});` on line 79):

```ts
    it('computes apmNoProcs excluding auto + trait proc + gear proc + unconditional proc casts', () => {
        const data = {
            logRecords: [],
            skillOptions: [
                { id: 's1', name: 'Sword Strike', total: 0, autoAttack: true },
                { id: 's2', name: 'Fireball', total: 0, autoAttack: false },
                { id: 's3', name: 'Windborne Notes', total: 0, autoAttack: false, isTraitProc: true },
                { id: 's4', name: 'Sigil of Fire', total: 0, autoAttack: false, isGearProc: true },
                { id: 's5', name: 'Selfless Daring', total: 0, autoAttack: false, isUnconditionalProc: true },
            ],
            players: [
                {
                    key: 'acct|Guardian',
                    account: 'acct',
                    displayName: 'acct',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 10, s2: 20, s3: 5, s4: 3, s5: 2 }
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        const row = result.current.apmSpecBuckets[0].playerRows[0];
        // Total: 10+20+5+3+2 = 40
        expect(row.apm).toBe(40);
        // No auto: 40-10 = 30
        expect(row.apmNoAuto).toBe(30);
        // No procs: 40-10(auto)-5(trait)-3(gear)-2(uncond) = 20 (only Fireball)
        expect(row.apmNoProcs).toBe(20);
    });

    it('does not double-count a skill that is both auto and proc', () => {
        const data = {
            logRecords: [],
            skillOptions: [
                { id: 's1', name: 'Weird Skill', total: 0, autoAttack: true, isTraitProc: true },
                { id: 's2', name: 'Normal Skill', total: 0, autoAttack: false },
            ],
            players: [
                {
                    key: 'acct|Mesmer',
                    account: 'acct',
                    displayName: 'acct',
                    profession: 'Mesmer',
                    professionList: ['Mesmer'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 10, s2: 20 }
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        const row = result.current.apmSpecBuckets[0].playerRows[0];
        expect(row.apm).toBe(30);
        expect(row.apmNoAuto).toBe(20);
        // s1 excluded (auto+proc), only s2 remains = 20
        expect(row.apmNoProcs).toBe(20);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/useApmStats.test.tsx`
Expected: FAIL — `row.apmNoProcs` is `undefined`

- [ ] **Step 3: Add `totalProcCasts`, `apmNoProcs`, `apsNoProcs` to types**

In `src/renderer/stats/statsTypes.ts`, update `ApmPlayerRow` (after line 65):

```ts
export interface ApmPlayerRow {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totalActiveSeconds: number;
    totalCasts: number;
    totalAutoCasts: number;
    totalProcCasts: number;
    apm: number;
    apmNoAuto: number;
    apmNoProcs: number;
    aps: number;
    apsNoAuto: number;
    apsNoProcs: number;
}
```

Update `ApmSpecBucket` (after line 86):

```ts
export interface ApmSpecBucket {
    profession: string;
    players: SkillUsagePlayer[];
    playerRows: ApmPlayerRow[];
    totalActiveSeconds: number;
    totalCasts: number;
    totalAutoCasts: number;
    totalProcCasts: number;
    skills: ApmSkillEntry[];
    skillMap: Map<string, ApmSkillEntry>;
}
```

- [ ] **Step 4: Implement proc classification and computation in `useApmStats`**

In `src/renderer/stats/hooks/useApmStats.ts`:

After the `isAuto` helper (after line 27), add:

```ts
        const procCache = new Map<string, boolean>();
        const isProc = (id: string) => {
            if (procCache.has(id)) return procCache.get(id)!;
            const option = skillOptionsById.get(id);
            const val = option?.isTraitProc === true || option?.isGearProc === true || option?.isUnconditionalProc === true;
            procCache.set(id, val);
            return val;
        };
```

Update the bucket initializer (line 39) to include `totalProcCasts: 0`:

```ts
                    totalProcCasts: 0,
```

After `let pAutoCasts = 0;` (line 52), add:

```ts
            let pProcCasts = 0;
```

Inside the skill iteration loop, after `if (auto) pAutoCasts += count;` (line 67), add:

```ts
                if (!auto && isProc(skillId)) pProcCasts += count;
```

After `bucket.totalAutoCasts += pAutoCasts;` (line 88), add:

```ts
            bucket.totalProcCasts += pProcCasts;
```

Update the metric computation block (lines 90-95) to:

```ts
            const activeMinutes = safeActiveSeconds / 60;
            const apm = activeMinutes > 0 ? pCasts / activeMinutes : 0;
            const castsNoAuto = Math.max(0, pCasts - pAutoCasts);
            const apmNoAuto = activeMinutes > 0 ? castsNoAuto / activeMinutes : 0;
            const castsNoProcs = Math.max(0, pCasts - pAutoCasts - pProcCasts);
            const apmNoProcs = activeMinutes > 0 ? castsNoProcs / activeMinutes : 0;
            const aps = safeActiveSeconds > 0 ? pCasts / safeActiveSeconds : 0;
            const apsNoAuto = safeActiveSeconds > 0 ? castsNoAuto / safeActiveSeconds : 0;
            const apsNoProcs = safeActiveSeconds > 0 ? castsNoProcs / safeActiveSeconds : 0;
```

Update the row construction (lines 97-111) to include the new fields:

```ts
                totalProcCasts: pProcCasts,
                apm,
                apmNoAuto,
                apmNoProcs,
                aps,
                apsNoAuto,
                apsNoProcs
```

Update the bucket-level totals section (lines 120-124) to add after `nonAutoCasts`:

```ts
            const nonAutoNonProcCasts = Math.max(0, nonAutoCasts - Number(bucket.totalProcCasts || 0));
```

And add after the existing `totalApsNoAuto` line:

```ts
            (bucket as any).totalApmNoProcs = totalMinutes > 0 ? nonAutoNonProcCasts / totalMinutes : 0;
            (bucket as any).totalApsNoProcs = safeBucketSeconds > 0 ? nonAutoNonProcCasts / safeBucketSeconds : 0;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/useApmStats.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/statsTypes.ts src/renderer/stats/hooks/useApmStats.ts src/renderer/__tests__/useApmStats.test.tsx
git commit -m "feat(apm): compute apmNoProcs excluding auto+trait+gear+unconditional procs"
```

---

### Task 4: Add the APM (No Procs) column to the UI

**Files:**
- Modify: `src/renderer/stats/sections/ApmSection.tsx:58,68,74-87,475,489-491,506,516-520`

- [ ] **Step 1: Expand the sort key type**

In `src/renderer/stats/sections/ApmSection.tsx`, update line 58 from:

```ts
    const [allSkillsSort, setAllSkillsSort] = useState<{ key: 'apm' | 'apmNoAuto'; dir: 'asc' | 'desc' }>({ key: 'apm', dir: 'desc' });
```

to:

```ts
    const [allSkillsSort, setAllSkillsSort] = useState<{ key: 'apm' | 'apmNoAuto' | 'apmNoProcs'; dir: 'asc' | 'desc' }>({ key: 'apm', dir: 'desc' });
```

- [ ] **Step 2: Update `toggleAllSkillsSort` parameter type**

Update line 68 from:

```ts
    const toggleAllSkillsSort = (key: 'apm' | 'apmNoAuto') => {
```

to:

```ts
    const toggleAllSkillsSort = (key: 'apm' | 'apmNoAuto' | 'apmNoProcs') => {
```

- [ ] **Step 3: Update the sort comparator to handle the new key**

Update `sortedAllSkillsRows` (lines 74-87). Replace the `rows.sort` callback:

```ts
        rows.sort((a: any, b: any) => {
            const resolveVal = (row: any) => {
                if (allSkillsSort.key === 'apm') return Number(apmView === 'perSecond' ? row.aps : row.apm);
                if (allSkillsSort.key === 'apmNoAuto') return Number(apmView === 'perSecond' ? row.apsNoAuto : row.apmNoAuto);
                return Number(apmView === 'perSecond' ? row.apsNoProcs : row.apmNoProcs);
            };
            const diff = allSkillsSort.dir === 'desc' ? resolveVal(b) - resolveVal(a) : resolveVal(a) - resolveVal(b);
            return diff || String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
```

- [ ] **Step 4: Update the All Skills header grid to 4 columns**

Update line 475 from:

```tsx
                                                <div className="stats-table-column-header grid grid-cols-[1.6fr_0.7fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
```

to:

```tsx
                                                <div className="stats-table-column-header grid grid-cols-[1.4fr_0.6fr_0.7fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
```

After the "No Auto" button (after line 490), add the new header button:

```tsx
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAllSkillsSort('apmNoProcs')}
                                                        className={`text-right transition-colors ${allSkillsSort.key === 'apmNoProcs' ? 'text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                    >
                                                        {apmView === 'perSecond' ? 'APS' : 'APM'} (No Procs){allSkillsSort.key === 'apmNoProcs' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                    </button>
```

- [ ] **Step 5: Update the All Skills data row grid to 4 columns**

Update line 506 from:

```tsx
                                                            className="grid grid-cols-[1.6fr_0.7fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5"
```

to:

```tsx
                                                            className="grid grid-cols-[1.4fr_0.6fr_0.7fr_0.8fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5"
```

After the "No Auto" data cell (after line 520), add the new cell:

```tsx
                                                            <div className="text-right font-mono text-gray-300">
                                                                {formatApmValue(apmView === 'perSecond' ? row.apsNoProcs : row.apmNoProcs)}
                                                            </div>
```

- [ ] **Step 6: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 7: Run integration test**

Run: `npx vitest run src/renderer/__tests__/StatsView.integration.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/ApmSection.tsx
git commit -m "feat(apm): add APM (No Procs) column to All Skills view"
```

---

### Task 5: Update types and documentation

**Files:**
- Modify: `src/shared/dpsReportTypes.ts:35`
- Modify: `src/shared/metrics-spec.md:409-421`

- [ ] **Step 1: Update `skillMap` type in `dpsReportTypes.ts`**

In `src/shared/dpsReportTypes.ts`, update line 35 from:

```ts
    skillMap?: { [key: string]: { name: string; icon: string } };
```

to:

```ts
    skillMap?: { [key: string]: { name: string; icon: string; autoAttack?: boolean; isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean } };
```

Also update the identical line in `src/main/dpsReportTypes.ts` (same line number).

- [ ] **Step 2: Update metrics-spec.md APM Breakdown section**

In `src/shared/metrics-spec.md`, replace lines 409-421 with:

```md
## APM Breakdown

APM is derived from the Skill Usage Tracker data (rotation casts). For each
player:
- `totalCasts = sum(rotationSkill.skills.length)`
- `apm = totalCasts / (activeSeconds / 60)`
- `aps = totalCasts / activeSeconds`
- Auto-attack counts are excluded for the "No Auto" variants.
- Auto-attack, trait proc (`isTraitProc`), gear proc (`isGearProc`), and
  unconditional proc (`isUnconditionalProc`) counts are excluded for the
  "No Procs" variants. A skill matching multiple categories is excluded once
  (union, not sum).

The APM Breakdown groups players by profession and aggregates per-skill cast
counts across the group.

Implementation: `src/renderer/stats/hooks/useApmStats.ts`.
```

- [ ] **Step 3: Sync metrics-spec to docs/**

Run: `npm run sync:metrics-spec`

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/dpsReportTypes.ts src/main/dpsReportTypes.ts src/shared/metrics-spec.md docs/metrics-spec.md
git commit -m "docs(apm): update dpsReportTypes and metrics-spec for proc flags"
```

---

### Task 6: Final validation

- [ ] **Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 2: Run validate (typecheck + lint)**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Load a dataset with rotation data. Navigate to APM Breakdown. Verify:
- Three columns visible: APM, APM (No Auto), APM (No Procs)
- APM (No Procs) values are ≤ APM (No Auto) values
- APM/APS toggle switches all three column labels
- Sorting works on all three columns
- Per-skill view still shows only Casts + APM (unchanged)
