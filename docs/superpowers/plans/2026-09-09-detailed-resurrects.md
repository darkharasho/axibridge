# Detailed Resurrects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AxiBridge's single misleading "Revives" number with completed-revive tracking, attribution to hand-resurrects vs. specific resurrect utilities, and post–Illusion of Life survival.

**Architecture:** A pure derivation layer in `packages/bridge-metrics` turns each player's `combatReplayData.down`/`.dead` intervals into *recoveries* (downs that ended in a stand-up) and attributes each one to a hand-resurrect channel, a resurrect utility, self-resurrect, or unattributed. `computePlayerAggregation` consumes it for leaderboards, MVP and Discord; a renderer accumulator consumes it for a new Defense section with per-player, per-utility and IoL-survival breakdowns.

**Tech Stack:** TypeScript, React, vitest, Electron. Workspace package `@axiapps/bridge-metrics` (tsup → `dist/`).

**Spec:** `docs/superpowers/specs/2026-09-09-detailed-resurrects-design.md`

## Global Constraints

- Run vitest with `--maxWorkers=2` (e.g. `npx vitest run <file> --maxWorkers=2`). This machine has limited RAM.
- `@axiapps/bridge-metrics` resolves through `dist/index.cjs`, **not** `src/`. After **any** edit under `packages/bridge-metrics/src/`, run `npm run build --workspace packages/bridge-metrics` before running consumer tests, or you will debug phantom failures against stale code.
- Metric **IDs are frozen** — `revives`, `resurrects`, `defensiveRevives`, `showResurrects` are persisted in user settings and saved reports. Change labels only; never rename an id.
- No "rez" shorthand anywhere — labels, column headers, comments, and identifiers use **"Resurrect"** and **"Revive"** spelled out.
- Skill id `12502` ("Signet of Renewal") is a condition cleanse, **not** a resurrect. It must never be treated as one.
- `revivesCompleted` is `null`, never `0`, when a log lacks the `rotation` or `replay` data needed to derive it.
- Positions poll at 300ms and a missing sample means the entity was **stationary**. Never interpolate positions across a gap.
- After editing `src/shared/metrics-spec.md`, run `npm run sync:metrics-spec`.

## Architectural note (deviation from spec, deliberate)

The spec placed the derivation in `src/renderer/stats/computeReviveDetail.ts`. During
planning it emerged that `packages/bridge-metrics/src/computePlayerAggregation.ts:1184`
(`s.revives += p.support?.[0]?.resurrects || 0`) already receives full `details`, including
`rotation` and `combatReplayData`, and is the single feed for leaderboards, MVP and Discord.

Therefore the **pure derivation lives in `packages/bridge-metrics`** and has two consumers:
`computePlayerAggregation` (per-player completed counts) and the renderer accumulator (the
section's richer breakdown). This avoids deriving the same thing twice from two codepaths
that could drift.

## Prior art discovered during planning

`packages/bridge-metrics/src/statsMetrics.ts:198-209` already holds a resurrect-utility
catalog (`RES_UTILITY_NAME_MATCHES`, `RES_UTILITY_IDS`) and
`computePlayerAggregation.ts:1057-1066` already counts utility **casts** into the healing
metric `resUtility` (and per-skill `resUtility_s<id>`). **Extend this catalog; do not create
a second one.**

Also note `finalizeSkillUsage` hardcodes `resUtilitySkills: []`, so the per-utility filter
pills in `HealingSection.tsx:90` and `:196` never populate. Task 2 fixes that.

## File Structure

**Create:**
- `packages/bridge-metrics/src/resurrectCatalog.ts` — skill catalog: id → name, kind, window
- `packages/bridge-metrics/src/reviveDerivation.ts` — pure recovery + attribution functions
- `packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts`
- `src/renderer/stats/computeReviveDetail.ts` — accumulator contract for the section
- `src/renderer/stats/__tests__/computeReviveDetail.test.ts`
- `src/renderer/stats/sections/ReviveDetailSection.tsx` — the UI
- `src/renderer/stats/__tests__/ReviveDetailSection.test.tsx`

**Modify:**
- `packages/bridge-metrics/src/resUtility.ts` — source its ids/names from the new catalog
- `packages/bridge-metrics/src/computePlayerAggregation.ts:1184` — add `revivesCompleted`
- `packages/bridge-metrics/src/reportMetrics.ts:30,78` — totals type
- `src/renderer/stats/computeSkillUsageData.ts:126` — populate `resUtilitySkills`
- `src/renderer/stats/incrementalAggregation.ts` — accumulator wiring + leaderboard
- `src/renderer/stats/statsTaxonomy.ts:78-83` — register the section under Defense
- `src/renderer/stats/topStatsCatalog.ts:58` — relabel
- `src/renderer/stats/utils/comparisonMetrics.ts:79` — relabel
- `src/renderer/StatsView.tsx` — render the section
- `src/main/discord.ts:774,851-854` — repoint the embed column
- `src/renderer/ExpandableLogCard.tsx:587,809-812` — relabel the embed column
- `src/shared/metrics-spec.md:584-588` — rewrite § Resurrects

---

### Task 1: Resurrect skill catalog

**Files:**
- Create: `packages/bridge-metrics/src/resurrectCatalog.ts`
- Create: `packages/bridge-metrics/src/__tests__/resurrectCatalog.test.ts`
- Modify: `packages/bridge-metrics/src/resUtility.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: `RES_UTILITY_NAME_MATCHES`, `RES_UTILITY_IDS` from `./statsMetrics` (existing)
- Produces:
  - `type ResurrectKind = 'hand' | 'utility' | 'self'`
  - `interface ResurrectSkill { id: number; name: string; kind: ResurrectKind; windowMs: number }`
  - `RESURRECT_SKILLS: ReadonlyMap<number, ResurrectSkill>`
  - `classifyResurrectSkill(id: number, skillMap): ResurrectSkill | null`
  - `DEFAULT_UTILITY_WINDOW_MS: number`

- [ ] **Step 1: Write the failing test**

Create `packages/bridge-metrics/src/__tests__/resurrectCatalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyResurrectSkill, RESURRECT_SKILLS } from '../resurrectCatalog';

describe('resurrectCatalog', () => {
    it('classifies the hand resurrect channel', () => {
        expect(classifyResurrectSkill(1066, {})?.kind).toBe('hand');
    });

    it('classifies Bandage as a self resurrect', () => {
        expect(classifyResurrectSkill(1175, {})?.kind).toBe('self');
    });

    it('classifies known utilities by id', () => {
        expect(classifyResurrectSkill(10244, {})?.kind).toBe('utility');
        expect(classifyResurrectSkill(14419, {})?.kind).toBe('utility');
        expect(classifyResurrectSkill(12569, {})?.kind).toBe('utility');
    });

    it('classifies unknown ids as utilities by skill name', () => {
        const skillMap = { s99999: { name: 'Glyph of Renewal' } };
        expect(classifyResurrectSkill(99999, skillMap)?.kind).toBe('utility');
    });

    it('never classifies Signet of Renewal as a resurrect', () => {
        const skillMap = { s12502: { name: 'Signet of Renewal' } };
        expect(classifyResurrectSkill(12502, skillMap)).toBeNull();
        expect(RESURRECT_SKILLS.has(12502)).toBe(false);
    });

    it('returns null for an unrelated skill', () => {
        expect(classifyResurrectSkill(5491, { s5491: { name: 'Fireball' } })).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/resurrectCatalog.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../resurrectCatalog`.

- [ ] **Step 3: Write the implementation**

Create `packages/bridge-metrics/src/resurrectCatalog.ts`:

```ts
import { RES_UTILITY_NAME_MATCHES } from './statsMetrics';

export type ResurrectKind = 'hand' | 'utility' | 'self';

export interface ResurrectSkill {
    id: number;
    name: string;
    kind: ResurrectKind;
    /**
     * How long after the cast starts a revive may still be credited to it.
     * Ground-placed utilities persist; instant ones do not. These values are
     * provisional and are validated against real logs in Task 6.
     */
    windowMs: number;
}

/** Instant-effect utilities and anything matched only by name use this window. */
export const DEFAULT_UTILITY_WINDOW_MS = 5000;

/**
 * Skill 12502 "Signet of Renewal" is a CONDITION CLEANSE, not a resurrect. It
 * matches a naive /res|renew/ name probe, which is exactly how a metric like
 * this silently acquires a false positive. It is excluded by construction:
 * name matching below uses the full phrase "glyph of renewal", never "renewal".
 */
const ENTRIES: ResurrectSkill[] = [
    { id: 1066, name: 'Resurrect', kind: 'hand', windowMs: 0 },
    { id: 1175, name: 'Bandage', kind: 'self', windowMs: 0 },
    { id: 10244, name: 'Illusion of Life', kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS },
    { id: 12569, name: 'Spirit of Nature', kind: 'utility', windowMs: 60000 },
    { id: 14419, name: 'Battle Standard', kind: 'utility', windowMs: 45000 },
];

export const RESURRECT_SKILLS: ReadonlyMap<number, ResurrectSkill> = new Map(
    ENTRIES.map((entry) => [entry.id, entry])
);

/**
 * Resolve a cast skill id to a resurrect skill, or null.
 *
 * Id lookup first (authoritative), then a full-phrase name match against the
 * shared utility name list, so utilities we have not catalogued by id are still
 * counted. Name matching cannot produce a 'hand' or 'self' classification —
 * those are id-only, because "resurrect" appears in too many unrelated names.
 */
export const classifyResurrectSkill = (
    id: number,
    skillMap: Record<string, { name?: string }> | undefined
): ResurrectSkill | null => {
    const known = RESURRECT_SKILLS.get(id);
    if (known) return known;

    const entry = skillMap?.[`s${id}`] || skillMap?.[`${id}`];
    const name = entry?.name?.toLowerCase() || '';
    if (!name) return null;

    const match = RES_UTILITY_NAME_MATCHES.find((candidate) => name.includes(candidate));
    if (!match) return null;

    return { id, name: entry?.name || match, kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/resurrectCatalog.test.ts --maxWorkers=2`
Expected: PASS (6 tests).

- [ ] **Step 5: Point `resUtility.ts` at the shared catalog**

Replace the body of `packages/bridge-metrics/src/resUtility.ts` so the two catalogs cannot drift:

```ts
import { classifyResurrectSkill } from './resurrectCatalog';

/**
 * True when a cast skill is a resurrect UTILITY (not the hand-resurrect channel
 * and not a self-resurrect). Kept as its own export because the `resUtility`
 * healing metric counts utility casts only.
 */
export const isResUtilitySkill = (id: number, skillMap: Record<string, { name?: string }> | undefined) =>
    classifyResurrectSkill(id, skillMap)?.kind === 'utility';
```

Add to `packages/bridge-metrics/src/index.ts`:

```ts
export { classifyResurrectSkill, RESURRECT_SKILLS, DEFAULT_UTILITY_WINDOW_MS } from './resurrectCatalog';
export type { ResurrectKind, ResurrectSkill } from './resurrectCatalog';
```

- [ ] **Step 6: Rebuild the package and run its full suite**

Run: `npm run build --workspace packages/bridge-metrics && npx vitest run packages/bridge-metrics --maxWorkers=2`
Expected: PASS. `isResUtilitySkill` behaviour is unchanged for every previously-matched skill; only 1066 and 1175 are newly classified, and they are excluded from `isResUtilitySkill` by the `kind === 'utility'` check.

- [ ] **Step 7: Commit**

```bash
git add packages/bridge-metrics/src/resurrectCatalog.ts packages/bridge-metrics/src/__tests__/resurrectCatalog.test.ts packages/bridge-metrics/src/resUtility.ts packages/bridge-metrics/src/index.ts
git commit -m "feat(metrics): add shared resurrect skill catalog"
```

---

### Task 2: Populate `resUtilitySkills` (fixes the empty utility filter)

**Files:**
- Modify: `src/renderer/stats/computeSkillUsageData.ts:126`
- Test: `src/renderer/__tests__/computeSkillUsageData.test.ts:345`

**Interfaces:**
- Consumes: `classifyResurrectSkill` (Task 1)
- Produces: `SkillUsageSummary.resUtilitySkills` populated with `{ id, name, icon }`

`finalizeSkillUsage` returns `resUtilitySkills: []` unconditionally, so the utility filter
pills in `HealingSection.tsx` only ever render "All". The accumulator already holds every
cast skill id and name, so this is a filter, not new data collection.

- [ ] **Step 1: Replace the obsolete test**

In `src/renderer/__tests__/computeSkillUsageData.test.ts`, replace the test at line 345
(`'always returns resUtilitySkills as empty array'`) with:

```ts
    it('lists resurrect utilities that were actually cast', () => {
        const logs = [makeLog([
            { id: 10244, casts: 2 },
            { id: 5491, casts: 9 },
        ], { s10244: { name: 'Illusion of Life' }, s5491: { name: 'Fireball' } })];
        const result = computeSkillUsageData(logs);
        expect(result.resUtilitySkills.map((s) => s.id)).toEqual(['s10244']);
        expect(result.resUtilitySkills[0].name).toBe('Illusion of Life');
    });

    it('excludes the hand resurrect channel from resurrect utilities', () => {
        const logs = [makeLog([{ id: 1066, casts: 4 }], { s1066: { name: 'Resurrect' } })];
        expect(computeSkillUsageData(logs).resUtilitySkills).toEqual([]);
    });
```

Also update the assertion at line 52 (`expect(result.resUtilitySkills).toEqual([])`) — it
stays valid only if that fixture casts no resurrect utilities. Read the fixture; if it does
cast one, assert that skill instead.

If the file has no `makeLog` helper, build the log inline in the shape
`{ details: { players: [{ account: 'A', profession: 'Guardian', rotation: [{ id, skills: [...] }] }], skillMap } }`,
matching the surrounding tests in that file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/computeSkillUsageData.test.ts --maxWorkers=2`
Expected: FAIL — `resUtilitySkills` is `[]`.

- [ ] **Step 3: Implement**

In `src/renderer/stats/computeSkillUsageData.ts`, add the import:

```ts
import { classifyResurrectSkill } from '@axiapps/bridge-metrics';
```

Replace `resUtilitySkills: []` in `finalizeSkillUsage` with:

```ts
        resUtilitySkills: skillOptions
            .filter((option) => {
                const id = Number(String(option.id).replace(/^s/, ''));
                if (!Number.isFinite(id)) return false;
                return classifyResurrectSkill(id, { [option.id]: { name: option.name } })?.kind === 'utility';
            })
            .map((option) => ({ id: option.id, name: option.name, icon: option.icon }))
```

`skillOptions` is already sorted by total casts descending, so the most-used utility leads
the filter pills.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/renderer/__tests__/computeSkillUsageData.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeSkillUsageData.ts src/renderer/__tests__/computeSkillUsageData.test.ts
git commit -m "fix(stats): populate resurrect utility filter options"
```

---

### Task 3: Recovery derivation

**Files:**
- Create: `packages/bridge-metrics/src/reviveDerivation.ts`
- Create: `packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts`

**Interfaces:**
- Produces:
  - `interface Recovery { playerKey: string; playerIndex: number; downStart: number; standUpAt: number }`
  - `deriveRecoveries(player: any, playerKey: string, playerIndex: number): Recovery[]`
  - `hasReviveData(player: any): boolean`
  - `DEATH_MATCH_TOLERANCE_MS: number`

- [ ] **Step 1: Write the failing test**

Create `packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveRecoveries, hasReviveData } from '../reviveDerivation';

const player = (down: number[][], dead: number[][]) => ({
    combatReplayData: { down, dead },
});

describe('deriveRecoveries', () => {
    it('counts a down that ended without a death as a recovery', () => {
        const result = deriveRecoveries(player([[1000, 5000]], []), 'A|Guardian', 0);
        expect(result).toEqual([{ playerKey: 'A|Guardian', playerIndex: 0, downStart: 1000, standUpAt: 5000 }]);
    });

    it('does not count a down that ended in death', () => {
        expect(deriveRecoveries(player([[1000, 5000]], [[5000, 9000]]), 'A|Guardian', 0)).toEqual([]);
    });

    it('tolerates a small gap between the down ending and the death starting', () => {
        expect(deriveRecoveries(player([[1000, 5000]], [[5120, 9000]]), 'A|Guardian', 0)).toEqual([]);
    });

    it('counts a later, separate death as a death and not a recovery match', () => {
        const result = deriveRecoveries(player([[1000, 5000]], [[40000, 50000]]), 'A|Guardian', 0);
        expect(result).toHaveLength(1);
    });

    it('handles several downs in one fight independently', () => {
        const result = deriveRecoveries(
            player([[1000, 2000], [8000, 9000], [20000, 21000]], [[9000, 30000]]),
            'A|Guardian', 0
        );
        expect(result.map((r) => r.standUpAt)).toEqual([2000, 21000]);
    });

    it('returns nothing when replay data is absent', () => {
        expect(deriveRecoveries({}, 'A|Guardian', 0)).toEqual([]);
    });
});

describe('hasReviveData', () => {
    it('is false without replay data', () => {
        expect(hasReviveData({ rotation: [] })).toBe(false);
    });

    it('is false without rotation', () => {
        expect(hasReviveData({ combatReplayData: { down: [], dead: [] } })).toBe(false);
    });

    it('is true with both', () => {
        expect(hasReviveData({ combatReplayData: { down: [], dead: [] }, rotation: [] })).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reviveDerivation`.

- [ ] **Step 3: Implement**

Create `packages/bridge-metrics/src/reviveDerivation.ts`:

```ts
/**
 * A down interval that ended in a stand-up rather than a death.
 *
 * This is the atomic unit of revive tracking and it is ground truth from the
 * log: it depends on no attribution heuristic. `support[0].resurrects`, by
 * contrast, is a count of hand-resurrect CHANNEL STARTS — attempts, not
 * pickups — which is the defect this module exists to correct.
 */
export interface Recovery {
    playerKey: string;
    playerIndex: number;
    downStart: number;
    standUpAt: number;
}

/**
 * A death is recorded as a `dead` interval starting where the `down` interval
 * ended. Allow a small slop for ordering jitter between the two event streams.
 */
export const DEATH_MATCH_TOLERANCE_MS = 250;

const intervals = (value: unknown): number[][] =>
    Array.isArray(value) ? value.filter((entry) => Array.isArray(entry) && entry.length >= 2) : [];

/**
 * True when this player's data can support revive derivation at all.
 *
 * Requires BOTH replay intervals (for recoveries) and rotation (for
 * attribution). Logs parsed without `replay: true` or `rotation: true`, and
 * logs cached before this feature shipped, have neither — for those, completed
 * revives must be reported as null, never as zero.
 */
export const hasReviveData = (player: any): boolean =>
    Array.isArray(player?.combatReplayData?.down)
    && Array.isArray(player?.combatReplayData?.dead)
    && Array.isArray(player?.rotation);

export const deriveRecoveries = (player: any, playerKey: string, playerIndex: number): Recovery[] => {
    const down = intervals(player?.combatReplayData?.down);
    const dead = intervals(player?.combatReplayData?.dead);
    const recoveries: Recovery[] = [];

    for (const [downStart, downEnd] of down) {
        const diedHere = dead.some(([deadStart]) => Math.abs(deadStart - downEnd) <= DEATH_MATCH_TOLERANCE_MS);
        if (diedHere) continue;
        recoveries.push({ playerKey, playerIndex, downStart, standUpAt: downEnd });
    }

    return recoveries;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts --maxWorkers=2`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/bridge-metrics/src/reviveDerivation.ts packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts
git commit -m "feat(metrics): derive recoveries from down and dead intervals"
```

---

### Task 4: Cast extraction and the attribution ladder

**Files:**
- Modify: `packages/bridge-metrics/src/reviveDerivation.ts`
- Modify: `packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts`

**Interfaces:**
- Consumes: `Recovery`, `deriveRecoveries` (Task 3); `classifyResurrectSkill`, `ResurrectKind` (Task 1)
- Produces:
  - `interface ResurrectCast { playerKey: string; playerIndex: number; skillId: number; skillName: string; kind: ResurrectKind; start: number; end: number }`
  - `extractResurrectCasts(player, playerKey, playerIndex, skillMap): ResurrectCast[]`
  - `interface Attribution { recovery: Recovery; kind: 'hand' | 'utility' | 'self' | 'unattributed'; primaryKey: string | null; skillId: number | null; assistKeys: string[] }`
  - `attributeRecovery(recovery, casts, opts?): Attribution`
  - `interface AttributionOptions { isWithinRadius?: (casterIndex: number, revivedIndex: number, atMs: number) => boolean }`

- [ ] **Step 1: Write the failing tests**

Append to `packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts`:

```ts
import { extractResurrectCasts, attributeRecovery } from '../reviveDerivation';

const recovery = { playerKey: 'Downed|Scourge', playerIndex: 1, downStart: 1000, standUpAt: 5000 };

const cast = (over: Partial<any> = {}) => ({
    playerKey: 'Rezzer|Firebrand', playerIndex: 0, skillId: 1066, skillName: 'Resurrect',
    kind: 'hand' as const, start: 3000, end: 6000, ...over,
});

describe('extractResurrectCasts', () => {
    it('emits one cast per entry in skills[], not one per rotation entry', () => {
        const player = {
            rotation: [{ id: 1066, skills: [
                { castTime: 1000, duration: 500 },
                { castTime: 4000, duration: 900 },
            ] }],
        };
        const casts = extractResurrectCasts(player, 'Rezzer|Firebrand', 0, {});
        expect(casts).toHaveLength(2);
        expect(casts[1]).toMatchObject({ start: 4000, end: 4900, kind: 'hand' });
    });

    it('ignores skills that are not resurrects', () => {
        const player = { rotation: [{ id: 5491, skills: [{ castTime: 0, duration: 100 }] }] };
        expect(extractResurrectCasts(player, 'A|Elementalist', 0, { s5491: { name: 'Fireball' } })).toEqual([]);
    });

    it('extends a utility cast to its catalogued window', () => {
        const player = { rotation: [{ id: 14419, skills: [{ castTime: 1000, duration: 200 }] }] };
        const casts = extractResurrectCasts(player, 'A|Warrior', 0, {});
        expect(casts[0]).toMatchObject({ kind: 'utility', start: 1000, end: 46000 });
    });
});

describe('attributeRecovery', () => {
    it('credits a hand channel that covers the stand-up', () => {
        const result = attributeRecovery(recovery, [cast()]);
        expect(result).toMatchObject({ kind: 'hand', primaryKey: 'Rezzer|Firebrand', skillId: 1066, assistKeys: [] });
    });

    it('does NOT credit a channel that ended before the stand-up', () => {
        const result = attributeRecovery(recovery, [cast({ start: 1500, end: 2500 })]);
        expect(result.kind).toBe('unattributed');
        expect(result.primaryKey).toBeNull();
    });

    it('gives primary credit to the largest overlap and records the other as an assist', () => {
        const long = cast({ playerKey: 'Long|Guardian', playerIndex: 2, start: 1200, end: 6000 });
        const short = cast({ playerKey: 'Short|Druid', playerIndex: 3, start: 4800, end: 6000 });
        const result = attributeRecovery(recovery, [short, long]);
        expect(result.primaryKey).toBe('Long|Guardian');
        expect(result.assistKeys).toEqual(['Short|Druid']);
    });

    it('ignores a hand channel cast by the downed player themselves', () => {
        const self = cast({ playerKey: 'Downed|Scourge', playerIndex: 1 });
        expect(attributeRecovery(recovery, [self]).kind).toBe('unattributed');
    });

    it('falls through to a utility when no hand channel covers the stand-up', () => {
        const utility = cast({ playerKey: 'Mesmer|Chronomancer', playerIndex: 4, skillId: 10244,
            skillName: 'Illusion of Life', kind: 'utility', start: 4000, end: 9000 });
        const result = attributeRecovery(recovery, [utility]);
        expect(result).toMatchObject({ kind: 'utility', primaryKey: 'Mesmer|Chronomancer', skillId: 10244 });
    });

    it('prefers a hand channel over a utility when both cover the stand-up', () => {
        const utility = cast({ playerKey: 'Mesmer|Chronomancer', playerIndex: 4, skillId: 10244,
            kind: 'utility', start: 4000, end: 9000 });
        expect(attributeRecovery(recovery, [utility, cast()]).kind).toBe('hand');
    });

    it('rejects a utility whose caster was out of range', () => {
        const utility = cast({ playerKey: 'Far|Warrior', playerIndex: 5, skillId: 14419,
            kind: 'utility', start: 1000, end: 46000 });
        const result = attributeRecovery(recovery, [utility], { isWithinRadius: () => false });
        expect(result.kind).toBe('unattributed');
    });

    it('credits a self resurrect to the downed player', () => {
        const bandage = cast({ playerKey: 'Downed|Scourge', playerIndex: 1, skillId: 1175,
            skillName: 'Bandage', kind: 'self', start: 3000, end: 6000 });
        expect(attributeRecovery(recovery, [bandage])).toMatchObject({ kind: 'self', primaryKey: 'Downed|Scourge' });
    });

    it('reports unattributed rather than dropping the recovery', () => {
        expect(attributeRecovery(recovery, [])).toMatchObject({ kind: 'unattributed', primaryKey: null, assistKeys: [] });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts --maxWorkers=2`
Expected: FAIL — `extractResurrectCasts` / `attributeRecovery` are not exported.

- [ ] **Step 3: Implement**

Append to `packages/bridge-metrics/src/reviveDerivation.ts`:

```ts
import { classifyResurrectSkill, type ResurrectKind } from './resurrectCatalog';

export interface ResurrectCast {
    playerKey: string;
    playerIndex: number;
    skillId: number;
    skillName: string;
    kind: ResurrectKind;
    start: number;
    end: number;
}

/**
 * EI groups every cast of one skill into a SINGLE rotation entry with a
 * `skills[]` array. Counting rotation entries reports 1 where the player cast
 * the skill nine times, so always flat-map `skills[]`.
 *
 * Channelled resurrects use their real cast duration. Utilities use their
 * catalogued window instead: a banner is planted in an instant but keeps
 * reviving for its lifetime, so the cast duration is not the credit window.
 */
export const extractResurrectCasts = (
    player: any,
    playerKey: string,
    playerIndex: number,
    skillMap: Record<string, { name?: string }> | undefined
): ResurrectCast[] => {
    const rotation = Array.isArray(player?.rotation) ? player.rotation : [];
    const casts: ResurrectCast[] = [];

    for (const entry of rotation) {
        if (!entry?.id) continue;
        const skill = classifyResurrectSkill(Number(entry.id), skillMap);
        if (!skill) continue;

        for (const instance of Array.isArray(entry.skills) ? entry.skills : []) {
            const start = Number(instance?.castTime);
            if (!Number.isFinite(start)) continue;
            const duration = Number(instance?.duration) || 0;
            const end = skill.kind === 'utility' ? start + skill.windowMs : start + duration;
            casts.push({
                playerKey, playerIndex,
                skillId: skill.id, skillName: skill.name, kind: skill.kind,
                start, end,
            });
        }
    }

    return casts;
};

export interface AttributionOptions {
    /**
     * Optional proximity gate for ground-placed utilities. Omitted means
     * window-only attribution. Implementations must use the last known position
     * sample and never interpolate across a gap: a missing position sample
     * means the entity was stationary, not that it moved.
     */
    isWithinRadius?: (casterIndex: number, revivedIndex: number, atMs: number) => boolean;
}

export interface Attribution {
    recovery: Recovery;
    kind: 'hand' | 'utility' | 'self' | 'unattributed';
    primaryKey: string | null;
    skillId: number | null;
    assistKeys: string[];
}

const covers = (cast: ResurrectCast, atMs: number) => cast.start <= atMs && cast.end >= atMs;

/**
 * Resolve one recovery through the attribution ladder: hand, then utility, then
 * self, then unattributed.
 *
 * Unattributed is a REPORTED outcome, not a dropped one. Its rate is how we
 * measure whether this heuristic is trustworthy, and it is displayed in the UI.
 */
export const attributeRecovery = (
    recovery: Recovery,
    casts: ResurrectCast[],
    opts: AttributionOptions = {}
): Attribution => {
    const at = recovery.standUpAt;
    const base = { recovery, assistKeys: [] as string[] };

    const hands = casts.filter((cast) =>
        cast.kind === 'hand' && cast.playerKey !== recovery.playerKey && covers(cast, at));

    if (hands.length > 0) {
        // Every candidate covers the stand-up; the one that channelled longest
        // over this down did the work. Earliest start breaks a tie.
        const overlap = (cast: ResurrectCast) =>
            Math.min(cast.end, at) - Math.max(cast.start, recovery.downStart);
        const sorted = [...hands].sort((a, b) => (overlap(b) - overlap(a)) || (a.start - b.start));
        const [primary, ...assists] = sorted;
        return {
            ...base,
            kind: 'hand',
            primaryKey: primary.playerKey,
            skillId: primary.skillId,
            assistKeys: assists.map((cast) => cast.playerKey),
        };
    }

    const utilities = casts.filter((cast) =>
        cast.kind === 'utility'
        && covers(cast, at)
        && (!opts.isWithinRadius || opts.isWithinRadius(cast.playerIndex, recovery.playerIndex, at)));

    if (utilities.length > 0) {
        // Most recent activation wins: it is the one that plausibly did it.
        const primary = utilities.reduce((best, cast) => (cast.start > best.start ? cast : best));
        return { ...base, kind: 'utility', primaryKey: primary.playerKey, skillId: primary.skillId };
    }

    const self = casts.find((cast) =>
        cast.kind === 'self' && cast.playerKey === recovery.playerKey && covers(cast, at));
    if (self) {
        return { ...base, kind: 'self', primaryKey: self.playerKey, skillId: self.skillId };
    }

    return { ...base, kind: 'unattributed', primaryKey: null, skillId: null };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts --maxWorkers=2`
Expected: PASS (all tests, Task 3's included).

- [ ] **Step 5: Rebuild and commit**

```bash
npm run build --workspace packages/bridge-metrics
git add packages/bridge-metrics/src/reviveDerivation.ts packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts
git commit -m "feat(metrics): attribute recoveries to hand, utility, or self resurrects"
```

---

### Task 5: Per-log revive summary

**Files:**
- Modify: `packages/bridge-metrics/src/reviveDerivation.ts`
- Modify: `packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 3-4
- Produces:
  - `interface ReviveLogSummary { hasData: boolean; downs: number; recovered: number; died: number; byKind: Record<'hand'|'utility'|'self'|'unattributed', number>; players: Map<string, RevivePlayerCounts>; utilities: Map<number, { name: string; casts: number; revives: number; byCaster: Map<string, number> }>; iolRevives: Array<{ playerKey: string; playerIndex: number; at: number }> }`
  - `interface RevivePlayerCounts { attempts: number; attemptTimeMs: number; handRevives: number; utilityCasts: number; utilityRevives: number; selfRevives: number; assists: number }`
  - `deriveReviveLogSummary(details: any, opts?: AttributionOptions): ReviveLogSummary`
  - `ILLUSION_OF_LIFE_ID: number`

- [ ] **Step 1: Write the failing test**

Append to the derivation test file:

```ts
import { deriveReviveLogSummary } from '../reviveDerivation';

const details = (players: any[], skillMap: any = {}) => ({ players, skillMap });

const squadPlayer = (over: any) => ({
    account: over.account, profession: over.profession || 'Guardian',
    combatReplayData: { down: over.down || [], dead: over.dead || [] },
    rotation: over.rotation || [],
});

describe('deriveReviveLogSummary', () => {
    it('summarises a hand revive across two players', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Rezzer', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
        ]));

        expect(summary.hasData).toBe(true);
        expect(summary.downs).toBe(1);
        expect(summary.recovered).toBe(1);
        expect(summary.died).toBe(0);
        expect(summary.byKind.hand).toBe(1);
        expect(summary.players.get('Rezzer|Guardian')).toMatchObject({
            attempts: 1, attemptTimeMs: 3000, handRevives: 1,
        });
    });

    it('counts an attempt that did not land as an attempt only', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Rezzer', rotation: [{ id: 1066, skills: [{ castTime: 1000, duration: 500 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]], dead: [[5000, 9000]] }),
        ]));

        expect(summary.recovered).toBe(0);
        expect(summary.died).toBe(1);
        expect(summary.players.get('Rezzer|Guardian')).toMatchObject({ attempts: 1, handRevives: 0 });
    });

    it('reports hasData false when a log has no rotation', () => {
        const summary = deriveReviveLogSummary({
            players: [{ account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } }],
            skillMap: {},
        });
        expect(summary.hasData).toBe(false);
    });

    it('tallies utility casts and revives per utility with a top caster', () => {
        const summary = deriveReviveLogSummary(details([
            squadPlayer({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            squadPlayer({ account: 'Downed', down: [[1000, 5000]] }),
        ]));

        const iol = summary.utilities.get(10244);
        expect(iol).toMatchObject({ casts: 1, revives: 1 });
        expect(iol!.byCaster.get('Mes|Chronomancer')).toBe(1);
        expect(summary.iolRevives).toEqual([{ playerKey: 'Downed|Guardian', playerIndex: 1, at: 5000 }]);
    });

    it('excludes non-squad players', () => {
        const pug = { ...squadPlayer({ account: 'Pug', down: [[1000, 5000]] }), notInSquad: true };
        expect(deriveReviveLogSummary(details([pug])).downs).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts --maxWorkers=2`
Expected: FAIL — `deriveReviveLogSummary` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/bridge-metrics/src/reviveDerivation.ts`:

```ts
export const ILLUSION_OF_LIFE_ID = 10244;

export interface RevivePlayerCounts {
    attempts: number;
    attemptTimeMs: number;
    handRevives: number;
    utilityCasts: number;
    utilityRevives: number;
    selfRevives: number;
    assists: number;
}

export interface ReviveLogSummary {
    hasData: boolean;
    downs: number;
    recovered: number;
    died: number;
    byKind: Record<'hand' | 'utility' | 'self' | 'unattributed', number>;
    players: Map<string, RevivePlayerCounts>;
    utilities: Map<number, { name: string; casts: number; revives: number; byCaster: Map<string, number> }>;
    iolRevives: Array<{ playerKey: string; playerIndex: number; at: number }>;
}

const emptyCounts = (): RevivePlayerCounts => ({
    attempts: 0, attemptTimeMs: 0, handRevives: 0,
    utilityCasts: 0, utilityRevives: 0, selfRevives: 0, assists: 0,
});

const playerKeyOf = (player: any) =>
    `${player?.account || player?.name || 'Unknown'}|${player?.profession || 'Unknown'}`;

export const deriveReviveLogSummary = (details: any, opts: AttributionOptions = {}): ReviveLogSummary => {
    const summary: ReviveLogSummary = {
        hasData: false, downs: 0, recovered: 0, died: 0,
        byKind: { hand: 0, utility: 0, self: 0, unattributed: 0 },
        players: new Map(), utilities: new Map(), iolRevives: [],
    };

    const roster = (Array.isArray(details?.players) ? details.players : [])
        .map((player: any, index: number) => ({ player, index }))
        .filter(({ player }: any) => !player?.notInSquad);
    if (roster.length === 0) return summary;

    summary.hasData = roster.some(({ player }: any) => hasReviveData(player));
    if (!summary.hasData) return summary;

    const counts = (key: string) => {
        let entry = summary.players.get(key);
        if (!entry) { entry = emptyCounts(); summary.players.set(key, entry); }
        return entry;
    };

    const allCasts: ResurrectCast[] = [];
    const allRecoveries: Recovery[] = [];

    for (const { player, index } of roster) {
        const key = playerKeyOf(player);
        counts(key);

        const casts = extractResurrectCasts(player, key, index, details?.skillMap);
        allCasts.push(...casts);

        for (const cast of casts) {
            const entry = counts(key);
            if (cast.kind === 'hand') {
                entry.attempts += 1;
                entry.attemptTimeMs += Math.max(0, cast.end - cast.start);
            } else if (cast.kind === 'utility') {
                entry.utilityCasts += 1;
                let utility = summary.utilities.get(cast.skillId);
                if (!utility) {
                    utility = { name: cast.skillName, casts: 0, revives: 0, byCaster: new Map() };
                    summary.utilities.set(cast.skillId, utility);
                }
                utility.casts += 1;
            }
        }

        const downCount = Array.isArray(player?.combatReplayData?.down) ? player.combatReplayData.down.length : 0;
        summary.downs += downCount;
        allRecoveries.push(...deriveRecoveries(player, key, index));
    }

    summary.recovered = allRecoveries.length;
    summary.died = summary.downs - summary.recovered;

    for (const recovery of allRecoveries) {
        const attribution = attributeRecovery(recovery, allCasts, opts);
        summary.byKind[attribution.kind] += 1;

        if (attribution.primaryKey) {
            const entry = counts(attribution.primaryKey);
            if (attribution.kind === 'hand') entry.handRevives += 1;
            if (attribution.kind === 'self') entry.selfRevives += 1;
            if (attribution.kind === 'utility') {
                entry.utilityRevives += 1;
                const utility = summary.utilities.get(attribution.skillId!);
                if (utility) {
                    utility.revives += 1;
                    utility.byCaster.set(
                        attribution.primaryKey,
                        (utility.byCaster.get(attribution.primaryKey) || 0) + 1
                    );
                }
                if (attribution.skillId === ILLUSION_OF_LIFE_ID) {
                    summary.iolRevives.push({
                        playerKey: recovery.playerKey,
                        playerIndex: recovery.playerIndex,
                        at: recovery.standUpAt,
                    });
                }
            }
        }

        for (const assistKey of attribution.assistKeys) counts(assistKey).assists += 1;
    }

    return summary;
};
```

Export the new surface from `packages/bridge-metrics/src/index.ts`:

```ts
export { deriveReviveLogSummary, deriveRecoveries, extractResurrectCasts, attributeRecovery, hasReviveData, ILLUSION_OF_LIFE_ID } from './reviveDerivation';
export type { Recovery, ResurrectCast, Attribution, AttributionOptions, ReviveLogSummary, RevivePlayerCounts } from './reviveDerivation';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Rebuild and commit**

```bash
npm run build --workspace packages/bridge-metrics
git add packages/bridge-metrics/src/reviveDerivation.ts packages/bridge-metrics/src/__tests__/reviveDerivation.test.ts packages/bridge-metrics/src/index.ts
git commit -m "feat(metrics): summarise revives per log"
```

---

### Task 6: Empirical validation gate

**Files:**
- Create (throwaway): `reviveprobe.mjs` at the repo root — **deleted before this task's commit**

This task produces a **measurement, not a feature**. It reports the unattributed rate,
which determines whether the heuristic ships as-is and specifies future native work.

The probe must live at the repo root: `/tmp` cannot resolve `@axiapps/axilog`.

- [ ] **Step 1: Write the probe**

```js
// reviveprobe.mjs — THROWAWAY. Delete after recording results.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import binding from '@axiapps/axilog';
import { deriveReviveLogSummary } from './packages/bridge-metrics/dist/index.cjs';

const DIR = process.argv[2];
const LIMIT = Number(process.argv[3] || 300);

const files = readdirSync(DIR).filter((f) => f.endsWith('.zevtc') || f.endsWith('.evtc')).slice(0, LIMIT);
const totals = { logs: 0, skipped: 0, downs: 0, recovered: 0, hand: 0, utility: 0, self: 0, unattributed: 0 };
const utilityTotals = new Map();

for (const file of files) {
    let details;
    try {
        details = binding.parseFileEi(join(DIR, file), { replay: true, rotation: true, skillDamage: true, timeseries: true, modifiers: false });
    } catch { totals.skipped++; continue; }

    const summary = deriveReviveLogSummary(details);
    if (!summary.hasData) { totals.skipped++; continue; }

    totals.logs++;
    totals.downs += summary.downs;
    totals.recovered += summary.recovered;
    for (const kind of ['hand', 'utility', 'self', 'unattributed']) totals[kind] += summary.byKind[kind];
    for (const [id, u] of summary.utilities) {
        const prev = utilityTotals.get(id) || { name: u.name, casts: 0, revives: 0 };
        prev.casts += u.casts; prev.revives += u.revives;
        utilityTotals.set(id, prev);
    }
}

const pct = (n) => (totals.recovered ? ((n / totals.recovered) * 100).toFixed(1) : '0.0');
console.log(totals);
console.log(`recovery rate: ${totals.downs ? ((totals.recovered / totals.downs) * 100).toFixed(1) : 0}% of downs`);
console.log(`attribution: hand ${pct(totals.hand)}% | utility ${pct(totals.utility)}% | self ${pct(totals.self)}% | UNATTRIBUTED ${pct(totals.unattributed)}%`);
for (const [id, u] of utilityTotals) console.log(`  ${id} ${u.name}: ${u.casts} casts -> ${u.revives} revives`);
```

- [ ] **Step 2: Run it against real logs**

The log directory is the `logDirectory` value in `~/.config/AxiBridge-Dev/config.json`
(a Steam Proton compatdata path, not under `$HOME`). Read it with:

```bash
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.config/AxiBridge-Dev/config.json')))['logDirectory'])"
```

Run: `node reviveprobe.mjs "<that path>" 300`

- [ ] **Step 3: Record the result and decide**

Report the unattributed percentage to the user. Interpretation:

- **under ~15%** — heuristic is sound, continue as planned.
- **15-40%** — continue, but the UI's unattributed figure is load-bearing; make sure it is prominent.
- **over ~40%** — STOP and report. Likely causes to check before proceeding: utility
  `windowMs` values too short (Task 1 constants are provisional), or `DEATH_MATCH_TOLERANCE_MS`
  mis-set so deaths are being counted as recoveries. Tune those constants, re-run, and report
  both numbers.

Also record, for the spec's provisional constants: the per-utility casts→revives ratios. A
utility with many casts and near-zero revives suggests its window is wrong rather than that
it is ineffective.

- [ ] **Step 4: Delete the probe and commit the findings**

```bash
rm -f reviveprobe.mjs
git status --porcelain   # must show no stray probe file
```

Add the measured numbers to the spec under a new "## Empirical validation" section, then:

```bash
git add docs/superpowers/specs/2026-09-09-detailed-resurrects-design.md
git commit -m "docs: record revive attribution rates measured on real logs"
```

---

### Task 7: Renderer accumulator

**Files:**
- Create: `src/renderer/stats/computeReviveDetail.ts`
- Create: `src/renderer/stats/__tests__/computeReviveDetail.test.ts`
- Modify: `src/renderer/stats/statsTypes.ts`

**Interfaces:**
- Consumes: `deriveReviveLogSummary`, `ReviveLogSummary` (Task 5)
- Produces:
  - `interface ReviveDetailAccumulator { logsWithData: number; logsWithoutData: number; squad: {...}; players: Map<string, RevivePlayerCounts & { account: string; profession: string }>; utilities: Map<number, {...}>; iol: { revives: number; survived: number; reDowned: number; timesToReDownMs: number[] } }`
  - `createReviveDetailAccumulator()`
  - `ingestLogReviveDetail(log: any, acc: ReviveDetailAccumulator): void`
  - `finalizeReviveDetail(acc): ReviveDetailSummary`
  - `extractReviveDetailFrame(acc): ReviveDetailFrame`
  - `mergeReviveDetailFrame(target, frame): void`
  - `ReviveDetailSummary` as defined in the design spec, with `players: RevivePlayerRow[]`
    where `RevivePlayerRow = { key; account; profession; attempts; attemptTimeMs; handRevives; successRate; utilityCasts; utilityRevives; revivesPerCast; assists; totalRevives }`

Note `totalRevives = handRevives + utilityRevives`. **Self-revives are excluded** from a
player's total (crediting someone for reviving themselves would distort the leaderboard);
they appear in the squad split only.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/__tests__/computeReviveDetail.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    createReviveDetailAccumulator, ingestLogReviveDetail, finalizeReviveDetail,
    extractReviveDetailFrame, mergeReviveDetailFrame,
} from '../computeReviveDetail';

const player = (over: any) => ({
    account: over.account, profession: over.profession || 'Guardian',
    combatReplayData: { down: over.down || [], dead: over.dead || [] },
    rotation: over.rotation || [],
});

const handRezLog = () => ({
    details: {
        skillMap: {},
        players: [
            player({ account: 'Rezzer', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000]] }),
        ],
    },
});

describe('computeReviveDetail', () => {
    it('aggregates one log into per-player rows', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), acc);
        const result = finalizeReviveDetail(acc);

        expect(result.squad).toMatchObject({ downs: 1, recovered: 1, died: 0, hand: 1 });
        const rezzer = result.players.find((p) => p.account === 'Rezzer')!;
        expect(rezzer).toMatchObject({ attempts: 1, handRevives: 1, successRate: 1, totalRevives: 1 });
    });

    it('sums two logs', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), acc);
        ingestLogReviveDetail(handRezLog(), acc);
        const result = finalizeReviveDetail(acc);
        expect(result.squad.recovered).toBe(2);
        expect(result.players.find((p) => p.account === 'Rezzer')!.handRevives).toBe(2);
    });

    it('merging two single-log frames equals ingesting both logs', () => {
        const direct = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), direct);
        ingestLogReviveDetail(handRezLog(), direct);

        const a = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), a);
        const b = createReviveDetailAccumulator();
        ingestLogReviveDetail(handRezLog(), b);
        mergeReviveDetailFrame(a, extractReviveDetailFrame(b));

        expect(finalizeReviveDetail(a)).toEqual(finalizeReviveDetail(direct));
    });

    it('counts a log without rotation as uncovered', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            { account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } },
        ] } }, acc);
        const result = finalizeReviveDetail(acc);
        expect(result.coverage).toEqual({ logsWithData: 0, logsWithoutData: 1 });
        expect(result.squad.downs).toBe(0);
    });

    it('reports Illusion of Life survival', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000], [8000, 12000]], dead: [[12000, 20000]] }),
        ] } }, acc);
        const result = finalizeReviveDetail(acc);
        expect(result.iol).toMatchObject({ revives: 1, reDowned: 1, survived: 0 });
        expect(result.iol!.medianTimeToReDownMs).toBe(3000);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/computeReviveDetail.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/stats/computeReviveDetail.ts` following the accumulator contract used
by `computeSkillUsageData.ts` (create / ingest / finalize / extract / merge).

Implementation requirements:

- `ingestLogReviveDetail(log, acc)` calls `deriveReviveLogSummary(log.details)` and folds the
  result in. When `summary.hasData` is false, increment `acc.logsWithoutData` and **return
  without touching any counter** — an uncovered log must contribute no zeros.
- Fold `summary.byKind` into `acc.squad`, `summary.players` into `acc.players` (adding
  `account` and `profession` split from the `account|profession` key on first insert), and
  `summary.utilities` into `acc.utilities` (summing `casts`, `revives`, and each `byCaster`
  entry).
- IoL survival: for each entry in `summary.iolRevives`, find that player in
  `log.details.players` by `playerIndex` and look for the next `down` interval starting after
  `at`. If one exists, `reDowned++` and push `(nextDownStart - at)` into `timesToReDownMs`;
  otherwise `survived++`. Always `revives++`.
- `finalizeReviveDetail` computes `successRate = attempts > 0 ? handRevives / attempts : 0`,
  `revivesPerCast = utilityCasts > 0 ? utilityRevives / utilityCasts : 0`,
  `totalRevives = handRevives + utilityRevives`, sorts `players` by `totalRevives` descending,
  and sorts `utilities` by `revives` descending with `topCasterKey` = the highest `byCaster`
  entry (null when there are none). `iol` is `null` when `revives === 0`.
- Median: sort `timesToReDownMs` ascending; for even length take the mean of the two middle
  values; `null` when empty.
- `extractReviveDetailFrame(acc)` throws
  `new Error('extractReviveDetailFrame expects exactly one log, got N')` when
  `acc.logsWithData + acc.logsWithoutData !== 1`, matching `extractSkillUsageFrame`.
  The frame is `{ acc }`.
- `mergeReviveDetailFrame(target, frame)` sums every scalar, merges the player and utility
  maps (deep-copying nested `byCaster` maps rather than sharing references), and concatenates
  `timesToReDownMs`.

Reference implementation of the parts the tests pin exactly:

```ts
import { deriveReviveLogSummary, type RevivePlayerCounts } from '@axiapps/bridge-metrics';

interface ReviveDetailPlayer extends RevivePlayerCounts { account: string; profession: string; }

export interface ReviveDetailAccumulator {
    logsWithData: number;
    logsWithoutData: number;
    squad: { downs: number; recovered: number; died: number; hand: number; utility: number; self: number; unattributed: number };
    players: Map<string, ReviveDetailPlayer>;
    utilities: Map<number, { name: string; casts: number; revives: number; byCaster: Map<string, number> }>;
    iol: { revives: number; survived: number; reDowned: number; timesToReDownMs: number[] };
}

export function createReviveDetailAccumulator(): ReviveDetailAccumulator {
    return {
        logsWithData: 0, logsWithoutData: 0,
        squad: { downs: 0, recovered: 0, died: 0, hand: 0, utility: 0, self: 0, unattributed: 0 },
        players: new Map(), utilities: new Map(),
        iol: { revives: 0, survived: 0, reDowned: 0, timesToReDownMs: [] },
    };
}

export function ingestLogReviveDetail(log: any, acc: ReviveDetailAccumulator): void {
    const details = log?.details;
    const summary = deriveReviveLogSummary(details);

    // An uncovered log contributes NO zeros to any counter — it is absent data,
    // not evidence that nobody was revived.
    if (!summary.hasData) { acc.logsWithoutData += 1; return; }
    acc.logsWithData += 1;

    acc.squad.downs += summary.downs;
    acc.squad.recovered += summary.recovered;
    acc.squad.died += summary.died;
    for (const kind of ['hand', 'utility', 'self', 'unattributed'] as const) {
        acc.squad[kind] += summary.byKind[kind];
    }

    summary.players.forEach((counts, key) => {
        let row = acc.players.get(key);
        if (!row) {
            const [account, profession] = key.split('|');
            row = { account, profession, attempts: 0, attemptTimeMs: 0, handRevives: 0,
                utilityCasts: 0, utilityRevives: 0, selfRevives: 0, assists: 0 };
            acc.players.set(key, row);
        }
        row.attempts += counts.attempts;
        row.attemptTimeMs += counts.attemptTimeMs;
        row.handRevives += counts.handRevives;
        row.utilityCasts += counts.utilityCasts;
        row.utilityRevives += counts.utilityRevives;
        row.selfRevives += counts.selfRevives;
        row.assists += counts.assists;
    });

    summary.utilities.forEach((utility, skillId) => {
        let row = acc.utilities.get(skillId);
        if (!row) { row = { name: utility.name, casts: 0, revives: 0, byCaster: new Map() }; acc.utilities.set(skillId, row); }
        row.casts += utility.casts;
        row.revives += utility.revives;
        utility.byCaster.forEach((count, caster) => row!.byCaster.set(caster, (row!.byCaster.get(caster) || 0) + count));
    });

    const roster = Array.isArray(details?.players) ? details.players : [];
    for (const revive of summary.iolRevives) {
        acc.iol.revives += 1;
        const down = roster[revive.playerIndex]?.combatReplayData?.down;
        const next = (Array.isArray(down) ? down : [])
            .map((interval: number[]) => interval[0])
            .filter((start: number) => start > revive.at)
            .sort((a: number, b: number) => a - b)[0];
        if (next === undefined) acc.iol.survived += 1;
        else { acc.iol.reDowned += 1; acc.iol.timesToReDownMs.push(next - revive.at); }
    }
}

const median = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export function finalizeReviveDetail(acc: ReviveDetailAccumulator): ReviveDetailSummary {
    const players = Array.from(acc.players.entries()).map(([key, row]) => ({
        key, account: row.account, profession: row.profession,
        attempts: row.attempts, attemptTimeMs: row.attemptTimeMs,
        handRevives: row.handRevives,
        successRate: row.attempts > 0 ? row.handRevives / row.attempts : 0,
        utilityCasts: row.utilityCasts, utilityRevives: row.utilityRevives,
        revivesPerCast: row.utilityCasts > 0 ? row.utilityRevives / row.utilityCasts : 0,
        assists: row.assists,
        totalRevives: row.handRevives + row.utilityRevives,
    })).sort((a, b) => b.totalRevives - a.totalRevives);

    const utilities = Array.from(acc.utilities.entries()).map(([skillId, row]) => {
        let topCasterKey: string | null = null;
        let topCount = 0;
        row.byCaster.forEach((count, caster) => { if (count > topCount) { topCount = count; topCasterKey = caster; } });
        return {
            skillId, name: row.name, casts: row.casts, revives: row.revives,
            revivesPerCast: row.casts > 0 ? row.revives / row.casts : 0,
            topCasterKey,
        };
    }).sort((a, b) => b.revives - a.revives);

    return {
        coverage: { logsWithData: acc.logsWithData, logsWithoutData: acc.logsWithoutData },
        squad: { ...acc.squad },
        players,
        utilities,
        iol: acc.iol.revives > 0
            ? { revives: acc.iol.revives, survived: acc.iol.survived, reDowned: acc.iol.reDowned,
                medianTimeToReDownMs: median(acc.iol.timesToReDownMs) }
            : null,
    };
}
```

Note `revivesPerCast` is computed for BOTH player rows and utility rows — the Task 10 test
fixture relies on the utility one.

Add `ReviveDetailSummary`, `RevivePlayerRow`, and `ReviveDetailFrame` to
`src/renderer/stats/statsTypes.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeReviveDetail.test.ts --maxWorkers=2`
Expected: PASS (5 tests). The frame-equivalence test is the important one: it is what proves
the Web Worker path (used above 8 logs) produces identical numbers to the inline path.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeReviveDetail.ts src/renderer/stats/__tests__/computeReviveDetail.test.ts src/renderer/stats/statsTypes.ts
git commit -m "feat(stats): add revive detail accumulator"
```

---

### Task 8: Aggregator wiring

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` (lines 39, 737, 892, 1023, 1130, 1167 are the sibling `skillUsage` wiring sites — add alongside each)

**Interfaces:**
- Consumes: all of Task 7
- Produces: `stats.reviveDetail: ReviveDetailSummary` on the aggregator output

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/stats/__tests__/computeReviveDetail.test.ts` (or the aggregation test
file if one already covers `computeStatsSync`):

```ts
import { computeStatsSync } from '../incrementalAggregation';

it('exposes reviveDetail on aggregated stats', () => {
    const stats: any = computeStatsSync([handRezLog()] as any);
    expect(stats.reviveDetail.squad.recovered).toBe(1);
});
```

Check `computeStatsSync`'s real signature before writing this — other tests in
`src/renderer/stats/__tests__/` show the expected log shape, which needs more fields
(`filePath`, `details.durationMS`, a fight name) than the derivation tests use. Copy a
minimal valid log from `computeFightBreakdown.test.ts` and add the revive fields to it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/computeReviveDetail.test.ts --maxWorkers=2`
Expected: FAIL — `stats.reviveDetail` is undefined.

- [ ] **Step 3: Wire it in**

Six edits in `incrementalAggregation.ts`, each mirroring the `skillUsage` line beside it:

```ts
// near line 39
import { createReviveDetailAccumulator, ingestLogReviveDetail, finalizeReviveDetail, extractReviveDetailFrame, mergeReviveDetailFrame } from './computeReviveDetail';

// near line 737, in the constructor
this.reviveDetailAcc = createReviveDetailAccumulator();

// near line 892, in the per-log ingest
ingestLogReviveDetail(log, this.reviveDetailAcc);

// near line 1023, inside exportFrame's moduleSections
reviveDetail: extractReviveDetailFrame(this.reviveDetailAcc),

// near line 1130, in mergeFrame
if (frame.reviveDetail) mergeReviveDetailFrame(this.reviveDetailAcc, frame.reviveDetail);

// near line 1167, in finalize
const reviveDetail = finalizeReviveDetail(this.reviveDetailAcc);
```

Declare the `reviveDetailAcc` field next to `skillUsageAcc`, add `reviveDetail` to the
`SliceFrame` type, and include `reviveDetail` in the object `finalize()` returns.

Note the guard already documented at line 1013: `moduleSections` is only populated when
`validLogCount === 1`, because extractors throw on zero fights. `extractReviveDetailFrame`
follows that same contract, so no special-casing is needed.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/renderer/stats/__tests__/ --maxWorkers=2`
Expected: PASS, including the existing aggregation and slice-frame tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/stats/incrementalAggregation.ts src/renderer/stats/__tests__/computeReviveDetail.test.ts
git commit -m "feat(stats): wire revive detail into the aggregator"
```

---

### Task 9: `revivesCompleted` for leaderboards, MVP and Discord

**Files:**
- Modify: `packages/bridge-metrics/src/computePlayerAggregation.ts:1184`
- Modify: `packages/bridge-metrics/src/reportMetrics.ts:30,78`
- Modify: `src/renderer/stats/incrementalAggregation.ts:1436,1474`
- Modify: `src/renderer/stats/topStatsCatalog.ts:58`
- Modify: `src/renderer/stats/utils/comparisonMetrics.ts:79`
- Modify: `src/main/discord.ts:774,851-854`
- Modify: `src/renderer/ExpandableLogCard.tsx:587,809-812`

**Interfaces:**
- Consumes: `deriveReviveLogSummary` (Task 5)
- Produces: `supportTotals.revivesCompleted: number | null`; leaderboard id `revivesCompleted`

**The null rule.** `revivesCompleted` is `null` when the log lacks the data, never `0`. Zero
would read as "revived nobody", which is false, and would propagate into MVP scores and
published web reports.

- [ ] **Step 1: Write the failing test**

In `packages/bridge-metrics/src/__tests__/` (alongside the existing player-aggregation
tests — check the directory for the established fixture helper and reuse it):

```ts
it('accumulates completed revives separately from attempts', () => {
    // A log where Rezzer channels once and the ally stands up.
    const totals = aggregateOneLog(handRezDetails());
    expect(totals.revives).toBe(1);          // attempts, unchanged behaviour
    expect(totals.revivesCompleted).toBe(1);
});

it('leaves revivesCompleted null when the log has no rotation data', () => {
    const totals = aggregateOneLog(detailsWithoutRotation());
    expect(totals.revives).toBe(0);
    expect(totals.revivesCompleted).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/bridge-metrics --maxWorkers=2`
Expected: FAIL — `revivesCompleted` is undefined.

- [ ] **Step 3: Implement the aggregation**

In `computePlayerAggregation.ts`, derive the log summary **once per log** (not per player —
`deriveReviveLogSummary` walks the whole roster) and look each player up by key. Keep the
existing line 1184 exactly as it is; `revives` continues to mean attempts:

```ts
s.revives += p.support?.[0]?.resurrects || 0;

// Completed revives: null, never 0, when the log cannot support the derivation.
const reviveCounts = reviveSummary.hasData
    ? reviveSummary.players.get(`${account}|${profession}`)
    : undefined;
if (reviveCounts) {
    s.revivesCompleted = (s.revivesCompleted ?? 0) + reviveCounts.handRevives + reviveCounts.utilityRevives;
}
```

Initialise `revivesCompleted: null` in the totals factory and add
`revivesCompleted: number | null` to the totals type in `reportMetrics.ts:30,78`.

Use the same player key format as Task 5 (`account|profession`); if
`computePlayerAggregation` keys players differently, use its own key and pass a matching key
function into the derivation rather than maintaining two conventions.

- [ ] **Step 4: Add the leaderboard entry**

In `incrementalAggregation.ts`:

```ts
// near line 1436, beside case 'revives'
case 'revivesCompleted': return s.revivesCompleted ?? 0;

// near line 1474, beside revives: createLB('revives', true)
revivesCompleted: createLB('revivesCompleted', true),
```

- [ ] **Step 5: Relabel and add the new metric**

`src/renderer/stats/topStatsCatalog.ts:58` — change the label only, then add the new entry
directly after it:

```ts
  { id: 'revives', label: 'Resurrect Attempts', category: 'defense', color: CAT_COLOR.defense, icon: 'HelpingHand', higherIsBetter: true, source: lb('revives'), defaultOn: false, supportsRate: true },
  { id: 'revivesCompleted', label: 'Revives', category: 'defense', color: CAT_COLOR.defense, icon: 'HelpingHand', higherIsBetter: true, source: lb('revivesCompleted'), defaultOn: false, supportsRate: true },
```

`src/renderer/stats/utils/comparisonMetrics.ts:79` — label only:

```ts
  { id: 'resurrects', label: 'Resurrect Attempts', totalsKey: 'supportTotals', field: 'resurrects' },
```

**Do not change either `id`.** They are persisted in user settings and saved reports.

- [ ] **Step 6: Repoint MVP**

`defensiveRevives` currently scores attempts. Point it at `revivesCompleted`, falling back to
`revives` when the completed value is null so historical logs do not score zero. Find where
the weight is applied (search for `defensiveRevives` in the MVP scoring path) and use:

```ts
const reviveScore = totals.revivesCompleted ?? totals.revives;
```

Keep the setting key `defensiveRevives` unchanged so tuned weights survive.

- [ ] **Step 7: Repoint the Discord embed**

`src/main/discord.ts:851-854` and `src/renderer/ExpandableLogCard.tsx:809-812` render the
"Resurrects" column behind the `showResurrects` setting. Change the header to **"Revives"**
and the value to `revivesCompleted`. When it is null, **omit the column entirely** rather
than rendering `0`. `ExpandableLogCard.tsx:587`
(`const getResurrects = (p: any) => p.support?.[0]?.resurrects || 0;`) stays — it still backs
the attempts value — but rename it to `getResurrectAttempts` for honesty and update its call
site at line 372.

- [ ] **Step 8: Run everything**

```bash
npm run build --workspace packages/bridge-metrics
npx vitest run --maxWorkers=2
npm run validate
```
Expected: PASS. Existing assertions on `revives` must still pass — ids were not changed.

- [ ] **Step 9: Commit**

```bash
git add packages/bridge-metrics/src src/renderer/stats src/main/discord.ts src/renderer/ExpandableLogCard.tsx
git commit -m "feat(stats): report completed revives in leaderboards, MVP and Discord"
```

---

### Task 10: The Revives section

**Files:**
- Create: `src/renderer/stats/sections/ReviveDetailSection.tsx`
- Create: `src/renderer/stats/__tests__/ReviveDetailSection.test.tsx`
- Modify: `src/renderer/stats/statsTaxonomy.ts:78-83`
- Modify: `src/renderer/StatsView.tsx`

**Interfaces:**
- Consumes: `ReviveDetailSummary` (Task 7), delivered via `stats.reviveDetail` (Task 8)

- [ ] **Step 1: Register the section in the taxonomy**

In `statsTaxonomy.ts`, inside the `defense` category's `sections` array, after
`defense-detailed`:

```ts
            { id: 'revive-detail', label: 'Revives', icon: HelpingHand, description: 'Completed revives, resurrect attempts, and which utilities picked people up.', keywords: ['revives', 'resurrects', 'resurrect attempts', 'battle standard', 'illusion of life', 'spirit of nature', 'banner', 'rally', 'picked up'] },
```

Import `HelpingHand` from `lucide-react` alongside the other icon imports if it is not
already imported (`topStatsCatalog.ts` already uses this icon name for revives).

- [ ] **Step 2: Write the failing test**

Create `src/renderer/stats/__tests__/ReviveDetailSection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviveDetailSection } from '../sections/ReviveDetailSection';

const summary: any = {
    coverage: { logsWithData: 3, logsWithoutData: 0 },
    squad: { downs: 44, recovered: 22, died: 22, hand: 14, utility: 6, self: 1, unattributed: 1 },
    players: [{ key: 'A|Firebrand', account: 'A', profession: 'Firebrand', attempts: 9, attemptTimeMs: 10945,
        handRevives: 3, successRate: 3 / 9, utilityCasts: 0, utilityRevives: 0, revivesPerCast: 0,
        assists: 1, totalRevives: 3 }],
    utilities: [{ skillId: 14419, name: 'Battle Standard', casts: 4, revives: 6, revivesPerCast: 1.5, topCasterKey: 'B|Berserker' }],
    iol: null,
};

describe('ReviveDetailSection', () => {
    it('shows the squad recovery split', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByText(/22/)).toBeTruthy();
        expect(screen.getByText(/Unattributed/i)).toBeTruthy();
    });

    it('shows attempts alongside completed revives', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByText('9')).toBeTruthy();   // attempts
        expect(screen.getByText('3')).toBeTruthy();   // completed
    });

    it('renders a coverage notice when some logs lack the data', () => {
        const partial = { ...summary, coverage: { logsWithData: 2, logsWithoutData: 5 } };
        render(<ReviveDetailSection reviveDetail={partial} />);
        expect(screen.getByText(/5 logs/i)).toBeTruthy();
    });

    it('omits the Illusion of Life panel when there were none', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.queryByText(/Illusion of Life/i)).toBeNull();
    });

    it('shows Illusion of Life survival when present', () => {
        const withIol = { ...summary, iol: { revives: 8, survived: 3, reDowned: 5, medianTimeToReDownMs: 6200 } };
        render(<ReviveDetailSection reviveDetail={withIol} />);
        expect(screen.getByText(/Illusion of Life/i)).toBeTruthy();
        expect(screen.getByText(/6\.2s/)).toBeTruthy();
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/ReviveDetailSection.test.tsx --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 4: Build the section**

Create `ReviveDetailSection.tsx` modelled on an existing simple section — read
`src/renderer/stats/sections/DefenseSection.tsx` first and reuse its table primitives,
heading structure and theme variables rather than inventing new markup.

Contents, in order:

1. **Coverage notice** — rendered only when `coverage.logsWithoutData > 0`: "N logs predate
   revive tracking and are excluded from these counts." Not an error style; this is expected
   for historical data.
2. **Squad summary strip** — `Downs · Recovered (rate) · Died`, then the split
   `Hand · Utility · Self · Unattributed`. Unattributed is shown plainly, never hidden.
3. **Per-player table** — columns exactly: Player, Resurrect Attempts, Resurrect Time,
   Hand Revives, Success Rate, Utility Casts, Utility Revives, Revives per Cast, Assists,
   Total Revives. Sortable, defaulting to Total Revives descending. Format Resurrect Time as
   seconds with one decimal; Success Rate and Revives per Cast as percentage and ratio
   respectively, rendering "—" (not "0%") when the denominator is zero.
4. **Per-utility table** — Utility, Casts, Revives, Revives per Cast, Top Caster.
5. **Illusion of Life panel** — only when `iol` is non-null: revives, survived, re-downed,
   median time to re-down formatted as seconds with one decimal.

Wire per-minute rate support the way sibling sections do — check how `DefenseSection`
receives and applies the rate toggle and follow it exactly.

- [ ] **Step 5: Render it from StatsView**

Add the `revive-detail` case to `StatsView.tsx` where the other Defense sections are
rendered, passing `stats.reviveDetail`. Follow the neighbouring sections' prop and
memoisation pattern, including the `precomputedStats` fallback used for web reports (see the
`skillUsageData` handling at `StatsView.tsx:815-822` for the established shape).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/renderer/stats/__tests__/ --maxWorkers=2 && npm run validate`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/ReviveDetailSection.tsx src/renderer/stats/__tests__/ReviveDetailSection.test.tsx src/renderer/stats/statsTaxonomy.ts src/renderer/StatsView.tsx
git commit -m "feat(stats): add the Revives section under Defense"
```

---

### Task 11: Cross-link and metrics spec

**Files:**
- Modify: `src/renderer/stats/statsTaxonomy.ts:102-105` (support-detailed description)
- Modify: `src/renderer/stats/sections/SupportSection.tsx` (find the actual filename with `grep -rln "support-detailed" src/renderer/stats/sections/`)
- Modify: `src/shared/metrics-spec.md:584-588`

- [ ] **Step 1: Relabel the Support Detailed resurrect column**

The resurrect column in the Support Detailed section shows attempts. Rename its header to
**"Resurrect Attempts"** and add a short link or note pointing at the Revives section.

Update the `support-detailed` taxonomy description from
`'Cleanses, strips, stun breaks, and resurrects per player.'` to
`'Cleanses, strips, stun breaks, and resurrect attempts per player.'`

- [ ] **Step 2: Rewrite the metrics spec section**

Replace `src/shared/metrics-spec.md:584-588` entirely:

```markdown
## Resurrects and Revives

Two different things, tracked separately.

**Resurrect Attempts** — `resurrects = support[0].resurrects`.

Despite the name, this is the count of hand-resurrect CHANNEL STARTS: it tracks skill 1066
("Resurrect") cast segments. It counts attempts, not completed revives — a player who
channels six times on one ally who then dies scores six — and it includes no resurrect
utilities at all. It is surfaced as "Resurrect Attempts".

Implementation: `src/shared/dashboardMetrics.ts` (getPlayerResurrects).

**Revives** — completed pickups, derived rather than read from a field.

A *recovery* is a `combatReplayData.down` interval that ended without a matching
`combatReplayData.dead` interval starting at its end (within 250ms). Recoveries are ground
truth and require no heuristic.

Each recovery is attributed through a ladder: a hand-resurrect channel (skill 1066) covering
the moment of stand-up; else an active resurrect utility within its effect window and radius;
else a self-resurrect (Bandage, 1175); else **unattributed**, which is reported in the UI
rather than hidden. Where several channels overlap one recovery, the largest overlap takes
primary credit and the others are recorded as assists; the recovery is counted once.

A player's Total Revives is hand + utility primary credits. Self-revives appear in the squad
split only, never in a player's total.

`revivesCompleted` is **null, not zero**, for any log lacking `rotation` or `replay` data.
Consumers fall back to Resurrect Attempts (MVP) or omit the field (Discord). A zero would
read as "revived nobody", which is false.

Resurrect utility casts are also counted as the healing metric `resUtility` (and per-skill
`resUtility_s<id>`). That metric is a CAST count, not a revive count.

Known upstream gap: axilog returns `resurrectTime = 0` for every player, a field Elite
Insights populates. Resurrect Time is therefore derived from channel durations instead.

Implementation: `packages/bridge-metrics/src/reviveDerivation.ts`,
`packages/bridge-metrics/src/resurrectCatalog.ts`,
`src/renderer/stats/computeReviveDetail.ts`.
```

- [ ] **Step 3: Sync the spec**

Run: `npm run sync:metrics-spec`

- [ ] **Step 4: Full validation**

```bash
npm run validate
npx vitest run --maxWorkers=2
npm run audit:metrics
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats src/shared/metrics-spec.md docs/
git commit -m "docs(metrics): document the revive model and relabel resurrect attempts"
```

---

## Definition of done

- The Defense category has a Revives section showing squad recovery split, per-player
  attempts vs. completed, per-utility effectiveness, and IoL survival.
- "Revives" in leaderboards, MVP and Discord means completed revives, with attempts as the
  labelled fallback for logs that cannot support the derivation.
- No metric id changed; no saved user configuration breaks.
- The unattributed rate has been measured on real logs and recorded in the spec.
- `npm run validate` and the full vitest suite pass.
