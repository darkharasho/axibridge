# axilog Native Migration — Unit 2: Encounter & Fight-Level

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every encounter-level fact axibridge reads — duration, map/zone, fight timestamps, WvW team colours — off EI-shaped fields and onto axilog's native `encounter` block, and stand up the seam that carries native alongside EI for the rest of the migration.

**Architecture:** The parse seam (`AxilogManager.parseLog`) gains a second, native parse whose result is pruned to a **carry-set** — only the blocks migrated units actually read — and attached to the returned EI details under one key, `details.native`. The carry-set grows one unit at a time; the EI half is deleted at Step N. Encounter readers move to a new `nativeEncounter.ts` in `packages/bridge-metrics`, pinned by an equality oracle against the committed fixture.

**Tech Stack:** TypeScript, Electron main/renderer, vitest, `@axiapps/axilog` 0.3.4 (`parseFile` + `parseFileEi`), npm workspace `@axiapps/bridge-metrics` (tsup → `dist/`).

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`

## Global Constraints

- `@axiapps/axilog` is pinned to exactly `0.3.4` (no caret). Do not change it.
- Every native parse uses `{ everything: true }` — never an individual option list.
- Run vitest with `--maxWorkers=2` (machine constraint; see the global CLAUDE.md).
- `packages/bridge-metrics` is consumed through `dist/`. After editing its `src/`, run `npm run build -w @axiapps/bridge-metrics` before any test that imports it from `src/`.
- The root vitest config only includes `src/**`. Package tests must be run separately with `npm test -w @axiapps/bridge-metrics`. Both suites must be green at every commit.
- Fixture: `test-fixtures/axilog/wvw-small.anon.zevtc`. Never add a non-anonymized `.zevtc`.
- **Sentinel gate (spec, "The sentinel hazard"):** this unit must include at least one test asserting behaviour against an absent/`not_computed`/sentinel value, not only populated data.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Two spec corrections this plan applies

Both established by probing the real 0.3.4 artifact and reading the current code. Task 10 writes them back into the spec.

1. **`reportMetrics.ts` is not a unit-2 file.** The spec's unit table lists it, but `packages/bridge-metrics/src/reportMetrics.ts` reads the published `report.json` (`extractRunSummary(report)`, `RunSummary`, `ReportSchemaError`), not EI details. Under decision 2 the published artifact keeps its shape during the migration, so this file moves to **unit 9**.
2. **`applyEiCompatShims` is only *partly* retired here.** Its `players[].name = player.character_name` alias feeds `playerIdentity.getPlayerAccountKey` and several displays that stay EI-shaped until **unit 8**. Retiring the whole shim now would blank player names app-wide. Unit 2 retires the encounter-level branches (`zone`, `encounterDuration`, `timeStart`/`timeEnd`/`*Std`); the name alias survives, with a comment naming unit 8 as its owner.

## Measured inputs (already probed — do not re-derive)

| Fact | Value |
|---|---|
| EI payload, fixture | 3.40 MB |
| Native payload, fixture | 2.38 MB |
| **Unit 1+2 carry-set** (`axilog`+`encounter`+`entities`+`coverage`) | **0.022 MB** |
| `blocks.replay.tracks` | 0.278 MB (the block that must never enter the carry-set untrimmed) |
| `encounter` fields | `build`, `duration_ms`, `kind`, `map`, `markers[]`, `objectives[]`, `recorded_by`, `revision`, `started_at_unix`, `teams[]` |
| Fixture `encounter.teams` | `[{team_id:0,color:'unknown'}, {team_id:433,color:'blue'}, {team_id:2767,color:'green'}]` |
| Fixture `encounter` values | `map:'Green Alpine Borderlands'`, `duration_ms:49285`, `started_at_unix:1768702180` |

The carry-set being 22 KB is what makes the option-A seam viable; the memory objection that motivated the spec's "no dual payload" stance does not apply at this size.

## File Structure

**Create:**
- `packages/bridge-metrics/src/nativeEncounter.ts` — encounter-block readers. One responsibility: turn `report.encounter` into the scalars axibridge displays.
- `packages/bridge-metrics/src/__tests__/nativeEncounter.test.ts`
- `src/main/nativeCarrySet.ts` — builds the pruned native payload attached at the seam. Separate from `axilogParser.ts` so the carry-set's growth per unit is a one-file diff.
- `src/main/__tests__/nativeCarrySet.test.ts`
- `src/test/__tests__/unit2Encounter.oracle.test.ts`

**Modify:**
- `src/main/axilogParser.ts` — attach the carry-set in `parseLog`; retire the shim's encounter branches (Task 10).
- `packages/bridge-metrics/src/index.ts` — export the new module.
- `packages/bridge-metrics/src/timestampUtils.ts` — `resolveFightTimestamp` reads native first.
- `src/renderer/stats/utils/labelUtils.ts` — `resolveMapName` reads native first.
- `src/shared/wvwTeams.ts` — `teamMapFromLog` reads `encounter.teams` first.
- `src/renderer/stats/computeFightBreakdown.ts` — duration/zone/teams via the new readers.
- `src/renderer/stats/hooks/useStatsUploads.ts` — report-meta timestamps via native; delete the unit-2 TODO.

---

### Task 1: The native carry-set builder

**Files:**
- Create: `src/main/nativeCarrySet.ts`
- Test: `src/main/__tests__/nativeCarrySet.test.ts`

**Interfaces:**
- Produces: `buildNativeCarrySet(report: unknown): NativeCarrySet | null`, where `NativeCarrySet = { axilog, encounter, entities, coverage }`. Task 2 attaches it; every later unit widens it.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { buildNativeCarrySet, CARRIED_KEYS } from '../nativeCarrySet';

const report = () => ({
    axilog: { schema: '1.0', version: '0.3.4' },
    encounter: { map: 'Green Alpine Borderlands', duration_ms: 49285 },
    entities: [{ id: 0, role: 'squad' }],
    coverage: { damage: 'present' },
    catalogs: { skills: { 1: 'x' } },
    blocks: { replay: { tracks: [1, 2, 3] }, damage: { big: true } },
});

describe('buildNativeCarrySet', () => {
    it('carries exactly the migrated blocks and nothing else', () => {
        const out = buildNativeCarrySet(report())!;
        expect(Object.keys(out).sort()).toEqual([...CARRIED_KEYS].sort());
    });

    it('never carries blocks or catalogs — the payload that dominates report.json', () => {
        const out = buildNativeCarrySet(report()) as any;
        expect(out.blocks).toBeUndefined();
        expect(out.catalogs).toBeUndefined();
    });

    it('returns null for a non-report so the seam can attach nothing', () => {
        expect(buildNativeCarrySet(null)).toBeNull();
        expect(buildNativeCarrySet('nope')).toBeNull();
        expect(buildNativeCarrySet({})).toBeNull();
    });

    it('preserves an empty entities array rather than dropping the key', () => {
        // "ran, found nobody" must stay distinguishable from "never parsed".
        const out = buildNativeCarrySet({ ...report(), entities: [] })!;
        expect(out.entities).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/main/__tests__/nativeCarrySet.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../nativeCarrySet`.

- [ ] **Step 3: Implement**

```typescript
/**
 * The slice of axilog's native report that rides along with the EI details
 * for the duration of the migration.
 *
 * It is a WHITELIST, and it grows one migration unit at a time. Keeping it
 * narrow is the whole reason the option-A seam is affordable: measured on
 * `wvw-small.anon.zevtc`, the unit 1+2 carry-set is 22 KB against a 2.38 MB
 * full native report, because `blocks` — and inside it `replay.tracks`, the
 * payload that dominates `report.json` — never enters it.
 *
 * When a unit migrates, widen CARRIED_KEYS and re-measure. Never carry
 * `blocks` wholesale; carry the specific block that unit reads.
 */
export const CARRIED_KEYS = ['axilog', 'encounter', 'entities', 'coverage'] as const;

export type NativeCarrySet = Pick<any, never> & Record<(typeof CARRIED_KEYS)[number], unknown>;

export const buildNativeCarrySet = (report: unknown): NativeCarrySet | null => {
    if (!report || typeof report !== 'object') return null;
    const src = report as Record<string, unknown>;
    // A real native report always carries `axilog`. Its absence means we were
    // handed something else, and attaching a half-built carry-set would make
    // readers believe native data is present.
    if (!src.axilog || typeof src.axilog !== 'object') return null;
    const out: Record<string, unknown> = {};
    for (const key of CARRIED_KEYS) {
        if (src[key] !== undefined) out[key] = src[key];
    }
    return out as NativeCarrySet;
};
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/main/__tests__/nativeCarrySet.test.ts --maxWorkers=2`

- [ ] **Step 5: Commit**

```bash
git add src/main/nativeCarrySet.ts src/main/__tests__/nativeCarrySet.test.ts
git commit -m "feat: native carry-set builder for the migration seam"
```

---

### Task 2: Attach the carry-set at the parse seam

**Files:**
- Modify: `src/main/axilogParser.ts` (the `AxilogBinding` interface ~line 453, `loadBinding` ~459, `AxilogManager.parseLog` ~524)
- Test: `src/main/__tests__/axilogParser.test.ts`

**Interfaces:**
- Consumes: `buildNativeCarrySet` from Task 1.
- Produces: `details.native` on every successfully parsed log — the key every later task reads.

- [ ] **Step 1: Write the failing test** (append to the existing file)

```typescript
describe('native carry-set at the seam', () => {
    const fakeBinding = (native: any) => ({
        parseFileEi: () => ({ players: [], durationMS: 1000 }),
        parseFile: () => native,
    });

    it('attaches the pruned native report as details.native', async () => {
        const mgr = new AxilogManager(fakeBinding({
            axilog: { schema: '1.0' },
            encounter: { map: 'Green Alpine Borderlands' },
            entities: [],
            coverage: {},
            blocks: { replay: { tracks: [1, 2, 3] } },
        }) as any);
        const details: any = await mgr.parseLog(FIXTURE, 'log-1');
        expect(details.native.encounter.map).toBe('Green Alpine Borderlands');
        expect(details.native.blocks).toBeUndefined();
    });

    it('leaves details.native absent when the native parse throws', async () => {
        const binding: any = {
            parseFileEi: () => ({ players: [] }),
            parseFile: () => { throw new Error('native boom'); },
        };
        const details: any = await new AxilogManager(binding).parseLog(FIXTURE, 'log-1');
        // Absent, NOT null and NOT {}: readers must be able to tell
        // "no native data" from "native data that is empty".
        expect('native' in details).toBe(false);
        expect(details.players).toEqual([]);
    });

    it('leaves details.native absent when the binding has no parseFile', async () => {
        const details: any = await new AxilogManager({ parseFileEi: () => ({ players: [] }) } as any)
            .parseLog(FIXTURE, 'log-1');
        expect('native' in details).toBe(false);
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/main/__tests__/axilogParser.test.ts --maxWorkers=2`
Expected: FAIL — `details.native` is undefined.

- [ ] **Step 3: Implement**

Widen the binding interface (`parseFile` is optional so existing test doubles keep working):

```typescript
export interface AxilogBinding {
    parseFileEi: (path: string, opts?: AxilogParseOptions) => any;
    parseFile?: (path: string, opts?: AxilogParseOptions) => unknown;
}
```

In `loadBinding`, keep the `parseFileEi` check as the availability test — `parseFile` riding along on the same module needs no second guard.

In `parseLog`, after `applyEiCompatShims`/`deriveDistanceScalars`:

```typescript
// Carry native alongside EI for the duration of the migration. Migrated
// readers read `details.native`; unmigrated ones keep reading EI. Both
// halves come from ONE axilog version, so they cannot disagree about
// anything except shape. The EI half is deleted at Step N.
//
// A native failure must never fail the parse: EI-shaped compute is still
// the majority of the app. It degrades the migrated readers only.
if (typeof binding.parseFile === 'function') {
    try {
        const carry = buildNativeCarrySet(binding.parseFile(logPath, options));
        if (carry) (details as any).native = carry;
    } catch (err) {
        this.parseProgressCallback?.(`[axilog] native parse failed for ${logId}: ${String(err)}\n`);
    }
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/main/__tests__/axilogParser.test.ts --maxWorkers=2`

- [ ] **Step 5: Measure the added parse cost and record it**

```bash
node -e "
const {parseFile,parseFileEi}=require('@axiapps/axilog');
const F='test-fixtures/axilog/wvw-small.anon.zevtc';
const t=f=>{const s=Date.now();f();return Date.now()-s;};
console.log('ei   ', t(()=>parseFileEi(F,{everything:true})),'ms');
console.log('native', t(()=>parseFile(F,{everything:true})),'ms');
"
```

Paste the numbers into the commit message. The double parse is the standing cost of option A and disappears at Step N; if native comes in at more than ~2× the EI parse, say so in the commit body — it changes nothing in this plan but it is the number a future reader will want.

- [ ] **Step 6: Verify both suites and commit**

```bash
npx vitest run --maxWorkers=2 && npm test -w @axiapps/bridge-metrics
git add src/main/axilogParser.ts src/main/__tests__/axilogParser.test.ts
git commit -m "feat: carry the native report alongside EI at the parse seam"
```

---

### Task 3: Native encounter readers

**Files:**
- Create: `packages/bridge-metrics/src/nativeEncounter.ts`
- Test: `packages/bridge-metrics/src/__tests__/nativeEncounter.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Produces, all taking the EI details object (which may carry `.native`) so call sites need no plumbing change:
  - `getNativeReport(details): NativeReportLike | null`
  - `getEncounterDurationMs(details): number | null`
  - `getEncounterZone(details): string | null`
  - `getEncounterStartMs(details): number | null`
  - `getEncounterEndMs(details): number | null`
  - `getEncounterTeamMap(details): { red: number; green: number; blue: number } | null`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import {
    getNativeReport, getEncounterDurationMs, getEncounterZone,
    getEncounterStartMs, getEncounterEndMs, getEncounterTeamMap,
} from '../nativeEncounter';

const details = (encounter: any) => ({
    players: [],
    native: { axilog: { schema: '1.0' }, encounter, entities: [], coverage: {} },
});

const FIXTURE_ENCOUNTER = {
    map: 'Green Alpine Borderlands',
    duration_ms: 49285,
    started_at_unix: 1768702180,
    kind: 'wvw',
    teams: [
        { team_id: 0, color: 'unknown' },
        { team_id: 433, color: 'blue' },
        { team_id: 2767, color: 'green' },
    ],
};

describe('nativeEncounter readers', () => {
    it('reads duration, zone and start from the encounter block', () => {
        const d = details(FIXTURE_ENCOUNTER);
        expect(getEncounterDurationMs(d)).toBe(49285);
        expect(getEncounterZone(d)).toBe('Green Alpine Borderlands');
        expect(getEncounterStartMs(d)).toBe(1768702180 * 1000);
    });

    it('derives the end as start + duration', () => {
        expect(getEncounterEndMs(details(FIXTURE_ENCOUNTER))).toBe(1768702180 * 1000 + 49285);
    });

    it('builds the team map from encounter.teams', () => {
        expect(getEncounterTeamMap(details(FIXTURE_ENCOUNTER))).toEqual({ red: 0, green: 2767, blue: 433 });
    });

    it('returns null for every reader when no native report is carried', () => {
        const d = { players: [] };
        expect(getNativeReport(d)).toBeNull();
        expect(getEncounterDurationMs(d)).toBeNull();
        expect(getEncounterZone(d)).toBeNull();
        expect(getEncounterStartMs(d)).toBeNull();
        expect(getEncounterTeamMap(d)).toBeNull();
    });
});

describe('nativeEncounter sentinels', () => {
    it('does not turn the unknown team into a colour slot', () => {
        // team_id 0 / colour 'unknown' is present in EVERY fixture. A reader
        // that trusted presence would emit a fourth, phantom team column.
        const map = getEncounterTeamMap(details({ teams: [{ team_id: 0, color: 'unknown' }] }));
        expect(map).toEqual({ red: 0, green: 0, blue: 0 });
    });

    it('distinguishes duration 0 from an absent duration', () => {
        // A real 0-ms encounter is degenerate but parseable; `|| null` would
        // erase the difference between it and "the field was never emitted".
        expect(getEncounterDurationMs(details({ duration_ms: 0 }))).toBe(0);
        expect(getEncounterDurationMs(details({}))).toBeNull();
    });

    it('returns null for start when started_at_unix is absent, never 0/epoch', () => {
        expect(getEncounterStartMs(details({ duration_ms: 100 }))).toBeNull();
        expect(getEncounterEndMs(details({ duration_ms: 100 }))).toBeNull();
    });

    it('rejects an empty or non-string map rather than returning ""', () => {
        expect(getEncounterZone(details({ map: '' }))).toBeNull();
        expect(getEncounterZone(details({ map: '  ' }))).toBeNull();
        expect(getEncounterZone(details({ map: 42 }))).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --root packages/bridge-metrics src/__tests__/nativeEncounter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import type { NativeReportLike } from './nativeRoster';

/**
 * Encounter-block readers.
 *
 * Every reader takes the EI details object and reaches through `.native`,
 * so call sites migrate by swapping one expression, not by re-plumbing the
 * details flow. They return `null` — never `0`, `''` or a default — when the
 * fact is absent, so callers keep their own fallback and no absent value is
 * ever mistaken for a measured one.
 */
export interface NativeEncounterLike {
    map?: unknown;
    duration_ms?: unknown;
    started_at_unix?: unknown;
    kind?: unknown;
    teams?: Array<{ team_id?: unknown; color?: unknown }>;
}

export const getNativeReport = (details: any): NativeReportLike | null => {
    const native = details?.native;
    return native && typeof native === 'object' ? (native as NativeReportLike) : null;
};

const encounterOf = (details: any): NativeEncounterLike | null => {
    const enc = (getNativeReport(details) as any)?.encounter;
    return enc && typeof enc === 'object' ? (enc as NativeEncounterLike) : null;
};

const finiteOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

export const getEncounterDurationMs = (details: any): number | null =>
    finiteOrNull(encounterOf(details)?.duration_ms);

export const getEncounterZone = (details: any): string | null => {
    const map = encounterOf(details)?.map;
    if (typeof map !== 'string') return null;
    const trimmed = map.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const getEncounterStartMs = (details: any): number | null => {
    const started = finiteOrNull(encounterOf(details)?.started_at_unix);
    return started === null ? null : started * 1000;
};

export const getEncounterEndMs = (details: any): number | null => {
    const start = getEncounterStartMs(details);
    if (start === null) return null;
    return start + (getEncounterDurationMs(details) ?? 0);
};

/**
 * `encounter.teams` is authoritative per log — it comes from the same arcdps
 * team statechange EI exposes as `wvWMapData`, but keyed by colour directly.
 * The `unknown`-coloured team (id 0) is present in every log and is not a
 * team; it is dropped rather than given a slot.
 */
export const getEncounterTeamMap = (details: any): { red: number; green: number; blue: number } | null => {
    const teams = encounterOf(details)?.teams;
    if (!Array.isArray(teams)) return null;
    const out = { red: 0, green: 0, blue: 0 };
    for (const team of teams) {
        const id = finiteOrNull(team?.team_id);
        const color = typeof team?.color === 'string' ? team.color : '';
        if (id === null || id <= 0) continue;
        if (color === 'red' || color === 'green' || color === 'blue') out[color] = id;
    }
    return out;
};
```

- [ ] **Step 4: Export and build**

Append to `packages/bridge-metrics/src/index.ts`, after the `nativeRoster` export:

```typescript
export * from './nativeEncounter';
```

Run: `npm run build -w @axiapps/bridge-metrics`

- [ ] **Step 5: Run the tests — expect PASS**

Run: `npm test -w @axiapps/bridge-metrics`

- [ ] **Step 6: Confirm the export actually reaches consumers through `dist/`**

```bash
node -e "const m=require('@axiapps/bridge-metrics');
['getNativeReport','getEncounterDurationMs','getEncounterZone','getEncounterStartMs','getEncounterEndMs','getEncounterTeamMap']
  .forEach(k=>console.log(k, typeof m[k]));"
```

Expected: six `function` lines. (This guards the known `dist/` staleness trap — a stale `dist/` yields phantom TS2305 errors in later tasks.)

- [ ] **Step 7: Commit**

```bash
git add packages/bridge-metrics/src/nativeEncounter.ts \
        packages/bridge-metrics/src/__tests__/nativeEncounter.test.ts \
        packages/bridge-metrics/src/index.ts
git commit -m "feat(metrics): native encounter readers"
```

---

### Task 4: The unit-2 equality oracle

**Files:**
- Create: `src/test/__tests__/unit2Encounter.oracle.test.ts`

**Interfaces:**
- Consumes: `oracleFixture`, `expectEqualOrAllowlisted`, `FIXTURE_PATH` from `src/test/axilogOracle.ts` (unit 1); the Task 3 readers.

**Note on the allowlist:** unlike unit 1's, this one is **not** empty. The timestamp divergence is the point of the unit — EI-via-shim infers the fight time from the `.zevtc` mtime; native reports the real `started_at_unix`. Write the entry, state which side is right, and move on.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, FIXTURE_PATH, type DivergenceAllowlist } from '../axilogOracle';
import { applyEiCompatShims } from '../../main/axilogParser';
import {
    getEncounterDurationMs, getEncounterZone, getEncounterStartMs, getEncounterTeamMap,
} from '@axiapps/bridge-metrics';
import { teamMapFromLog } from '../../shared/wvwTeams';

const ALLOWLIST: DivergenceAllowlist = {
    'encounter start': {
        reason:
            'Native is right. EI emits no log-start event through to_ei_json, so '
            + 'applyEiCompatShims inferred the fight time from the .zevtc mtime (fight END, '
            + 'minus durationMS). Native reports encounter.started_at_unix, the real start. '
            + 'The delta is the inference error, and it is why this unit exists.',
    },
};

describe('unit 2 oracle — encounter facts, EI vs native', () => {
    const { ei, native } = oracleFixture();
    // The shim is what today's EI readers actually see; compare against that,
    // not against raw ei-json, or the oracle flatters the migration.
    const shimmed = applyEiCompatShims(JSON.parse(JSON.stringify(ei)), FIXTURE_PATH);
    const withNative = { ...shimmed, native };

    it('agrees on encounter duration', () => {
        expectEqualOrAllowlisted('duration', Number(shimmed.durationMS), getEncounterDurationMs(withNative), {});
    });

    it('agrees on the zone', () => {
        expectEqualOrAllowlisted('zone', shimmed.zone, getEncounterZone(withNative), {});
    });

    it('agrees on the WvW team map', () => {
        expectEqualOrAllowlisted('team map', teamMapFromLog(shimmed), getEncounterTeamMap(withNative), {});
    });

    it('records the timestamp divergence as reviewed, not as agreement', () => {
        expectEqualOrAllowlisted(
            'encounter start', shimmed.timeStart * 1000, getEncounterStartMs(withNative), ALLOWLIST,
        );
    });

    it('quantifies that divergence so a regression in either source is visible', () => {
        const deltaMs = Math.abs(getEncounterStartMs(withNative)! - shimmed.timeStart * 1000);
        // The mtime is the file close, so the inference lands near the truth but
        // not on it. A delta of hours would mean one of the two sources broke.
        expect(deltaMs).toBeLessThan(60 * 60 * 1000);
    });

    it('reads a real map name, not a fightName-derived one', () => {
        expect(getEncounterZone(withNative)).toBe('Green Alpine Borderlands');
    });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/__tests__/unit2Encounter.oracle.test.ts --maxWorkers=2`

If `team map` or `zone` fails, **do not** widen the allowlist to make it pass — that is the failure mode the oracle exists to catch. Investigate which side is wrong; only add an entry once you can state which is right and why.

- [ ] **Step 3: Verify the oracle is not passing vacuously**

```bash
node -e "
const {parseFile,parseFileEi}=require('@axiapps/axilog');
const F='test-fixtures/axilog/wvw-small.anon.zevtc';
const n=parseFile(F,{everything:true});
console.log('teams   ', JSON.stringify(n.encounter.teams));
console.log('map     ', n.encounter.map, '| duration', n.encounter.duration_ms);
console.log('ei wvw  ', JSON.stringify(parseFileEi(F,{everything:true}).wvWMapData));
"
```

Confirm the EI `wvWMapData` team ids and the native `teams` ids are the same numbers. If EI's is absent, note in the commit that the team-map assertion is comparing native against the fixed id-table fallback rather than against EI's event.

- [ ] **Step 4: Commit**

```bash
git add src/test/__tests__/unit2Encounter.oracle.test.ts
git commit -m "test: unit 2 equality oracle for encounter facts"
```

---

### Task 5: `resolveFightTimestamp` reads native first

**Files:**
- Modify: `packages/bridge-metrics/src/timestampUtils.ts`
- Test: `packages/bridge-metrics/src/__tests__/timestampUtils.test.ts` (create if absent)

**Interfaces:**
- Consumes: `getEncounterStartMs` from Task 3.
- `resolveFightTimestamp(details, log)` keeps its signature. Only its source order changes.

- [ ] **Step 1: Read the current implementation**

```bash
cat -n packages/bridge-metrics/src/timestampUtils.ts
```

Note the existing fallback order before changing it — the native source goes **in front of** that chain, and every existing fallback stays.

- [ ] **Step 2: Write the failing test**

```typescript
it('prefers the native encounter start over the shimmed EI timestamp', () => {
    const details = {
        timeStart: 1000, timeStartStd: '1970-01-01 00:16:40 +00',
        native: { axilog: {}, encounter: { started_at_unix: 1768702180, duration_ms: 49285 } },
    };
    expect(resolveFightTimestamp(details, {})).toBe(1768702180 * 1000);
});

it('falls back to the EI timestamp when no native report is carried', () => {
    expect(resolveFightTimestamp({ timeStart: 1000 }, {})).toBe(1000 * 1000);
});
```

Adjust the expected units to whatever the existing function returns (seconds vs ms vs Date) — read it first, and keep that contract.

- [ ] **Step 3: Run, confirm failure, implement, re-run**

```bash
npx vitest run --root packages/bridge-metrics src/__tests__/timestampUtils.test.ts
```

Implementation: add, as the first source in the existing chain:

```typescript
// Native reports the real fight start; the EI path below reaches this
// number only through an mtime inference (see the unit 2 oracle allowlist).
const nativeStart = getEncounterStartMs(details);
if (nativeStart !== null) return /* in this function's units */ nativeStart;
```

- [ ] **Step 4: Build, run both suites, commit**

```bash
npm run build -w @axiapps/bridge-metrics
npm test -w @axiapps/bridge-metrics && npx vitest run --maxWorkers=2
git add packages/bridge-metrics/src/timestampUtils.ts packages/bridge-metrics/src/__tests__/timestampUtils.test.ts
git commit -m "refactor: resolve fight timestamps from the native encounter"
```

---

### Task 6: `resolveMapName` and `teamMapFromLog` read native first

**Files:**
- Modify: `src/renderer/stats/utils/labelUtils.ts:32-42`
- Modify: `src/shared/wvwTeams.ts:38-50`
- Test: `src/renderer/__tests__/labelUtils.test.ts`, `src/shared/__tests__/wvwTeams.test.ts` (extend; create if absent)

**Interfaces:**
- Consumes: `getEncounterZone`, `getEncounterTeamMap` from Task 3. Both functions keep their signatures.

- [ ] **Step 1: Write the failing tests**

```typescript
// labelUtils
it('prefers the native map name over the fightName-derived zone', () => {
    const details = {
        fightName: 'Detailed WvW - Eternal Battlegrounds',
        native: { axilog: {}, encounter: { map: 'Green Alpine Borderlands' } },
    };
    expect(resolveMapName(details, {})).toBe('Green Alpine Borderlands');
});

it('keeps the whole existing fallback chain when native is absent', () => {
    expect(resolveMapName({ fightName: 'Detailed WvW - Eternal Battlegrounds' }, {}))
        .toBe(normalizeMapLabel('Detailed WvW - Eternal Battlegrounds'));
});

// wvwTeams
it('prefers encounter.teams over wvWMapData', () => {
    const details = {
        wvWMapData: { redTeamID: 1, greenTeamID: 2, blueTeamID: 3 },
        native: { axilog: {}, encounter: { teams: [{ team_id: 2767, color: 'green' }, { team_id: 433, color: 'blue' }] } },
    };
    expect(teamMapFromLog(details)).toEqual({ red: 0, green: 2767, blue: 433 });
});

it('falls back to wvWMapData for a log with no native report', () => {
    expect(teamMapFromLog({ wvWMapData: { redTeamID: 1, greenTeamID: 2, blueTeamID: 3 } }))
        .toEqual({ red: 1, green: 2, blue: 3 });
});

it('still returns null when neither source is present', () => {
    expect(teamMapFromLog({})).toBeNull();
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npx vitest run src/renderer/__tests__/labelUtils.test.ts src/shared/__tests__/wvwTeams.test.ts --maxWorkers=2`

- [ ] **Step 3: Implement**

`labelUtils.ts` — put native at the head of the existing chain, changing nothing else:

```typescript
export const resolveMapName = (details: any, log: any): string =>
    normalizeMapLabel(
        getEncounterZone(details)
        || details?.zone
        || details?.mapName
        // ...the rest of the existing chain, unchanged
    );
```

`wvwTeams.ts` — native first, EI event second, and leave the fixed id-table fallback in `getWvwTeamColor` alone:

```typescript
export function teamMapFromLog(log: unknown): WvwTeamMap | null {
  if (!log || typeof log !== 'object') return null;
  // Native carries the same arcdps team statechange EI exposes as
  // `wvWMapData`, but keyed by colour, so no id-table guessing is needed.
  const fromNative = getEncounterTeamMap(log);
  if (fromNative) return fromNative;
  // ...existing wvWMapData path, unchanged
}
```

`src/shared/wvwTeams.ts` importing from `@axiapps/bridge-metrics` is consistent with how `computeDominantGuildId.ts` consumes `nativeRoster` (unit 1). If an import cycle appears, move the two readers' import to a type-only import and call through a passed-in accessor rather than restructuring the package.

- [ ] **Step 4: Run both suites — expect PASS**

```bash
npx vitest run --maxWorkers=2 && npm test -w @axiapps/bridge-metrics
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/utils/labelUtils.ts src/shared/wvwTeams.ts \
        src/renderer/__tests__/labelUtils.test.ts src/shared/__tests__/wvwTeams.test.ts
git commit -m "refactor: read map name and WvW teams from the native encounter"
```

---

### Task 7: `computeFightBreakdown` duration reads native

**Files:**
- Modify: `src/renderer/stats/computeFightBreakdown.ts:24-29`
- Test: `src/renderer/__tests__/computeFightBreakdown.test.ts` (extend; create if absent)

**Interfaces:**
- Consumes: `getEncounterDurationMs` from Task 3. `ingestLogFightBreakdown`'s return shape does not change.

Tasks 5 and 6 already moved this file's `timestamp` and `mapName` — they route through `resolveFightTimestamp` and `resolveMapName`. Only the duration is read inline here.

- [ ] **Step 1: Write the failing test**

```typescript
it('takes the fight duration from the native encounter', () => {
    const log = { filePath: 'a.zevtc', details: {
        players: [], targets: [], durationMS: 999,
        native: { axilog: {}, encounter: { duration_ms: 49285 } },
    } };
    expect(ingestLogFightBreakdown(log, 0).duration).toBe(formatDurationMs(49285));
});

it('falls back to EI durationMS when native is absent', () => {
    const log = { filePath: 'a.zevtc', details: { players: [], targets: [], durationMS: 12000 } };
    expect(ingestLogFightBreakdown(log, 0).duration).toBe(formatDurationMs(12000));
});

it('does not render a zero-length fight as "--:--"', () => {
    // duration 0 is a real parse result, distinct from "no duration".
    const log = { filePath: 'a.zevtc', details: {
        players: [], targets: [], native: { axilog: {}, encounter: { duration_ms: 0 } },
    } };
    expect(ingestLogFightBreakdown(log, 0).duration).toBe(formatDurationMs(0));
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npx vitest run src/renderer/__tests__/computeFightBreakdown.test.ts --maxWorkers=2`

- [ ] **Step 3: Implement**

```typescript
const resolveFightDurationLabel = (details: any, log: any): string => {
    // Native first. `?? ` not `||`: a real 0-ms encounter must not fall through
    // to the EI value or to the "--:--" placeholder.
    const nativeMs = getEncounterDurationMs(details);
    if (nativeMs !== null) return formatDurationMs(nativeMs);
    const durationMs = Number(details?.durationMS || 0);
    if (durationMs > 0) return formatDurationMs(durationMs);
    const fallback = typeof log?.encounterDuration === 'string' ? log.encounterDuration.trim() : '';
    return fallback || '--:--';
};
```

- [ ] **Step 4: Run the suite — expect PASS**

Run: `npx vitest run --maxWorkers=2`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeFightBreakdown.ts src/renderer/__tests__/computeFightBreakdown.test.ts
git commit -m "refactor: read fight duration from the native encounter"
```

---

### Task 8: Report meta timestamps read native

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts:98-151`
- Test: `src/renderer/__tests__/useStatsUploads.test.ts` (extend; create if absent)

**Interfaces:**
- Consumes: `getEncounterStartMs`, `getEncounterEndMs` from Task 3.
- `buildReportMeta`'s output keys do not change — `dateStart`/`dateEnd`/`dateLabel` keep their formats, because the published `report.json` keeps its shape during the migration (decision 2).

- [ ] **Step 1: Write the failing test**

Test `buildReportMeta` through the hook's public surface, or extract `buildReportMeta` to a module-level pure function taking `(logs, detailsFor)` if the hook is awkward to drive — the extraction is in scope and makes this and unit 9 testable.

```typescript
it('bounds the report window with native encounter times', () => {
    const meta = buildReportMeta([
        { id: '1', details: { players: [], native: { axilog: {}, encounter: { started_at_unix: 1768702180, duration_ms: 49285 } } } },
    ]);
    expect(new Date(meta.dateStart).getTime()).toBe(1768702180 * 1000);
    expect(new Date(meta.dateEnd).getTime()).toBe(1768702180 * 1000 + 49285);
});

it('still uses the EI/uploadTime chain for a log with no native report', () => {
    const meta = buildReportMeta([{ id: '1', details: { players: [], timeStartStd: '2026-01-18 01:00:00 +00' } }]);
    expect(meta.dateStart).toBeTruthy();
});
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

Inside the `logs.forEach`, put native at the head of the existing `timeStart`/`timeEnd` chain:

```typescript
const nativeStart = getEncounterStartMs(details);
const nativeEnd = getEncounterEndMs(details);
const timeStart = nativeStart ?? details.timeStartStd ?? details.timeStart ?? details.uploadTime ?? log.uploadTime;
const timeEnd = nativeEnd ?? details.timeEndStd ?? details.timeEnd ?? details.uploadTime ?? log.uploadTime;
```

`new Date(number)` and `new Date(string)` both work for the existing `startDate`/`endDate` construction, so the surrounding validity guards stay as they are.

- [ ] **Step 4: Close unit 1's interim regression**

`computeDominantGuildId` now receives details that carry `.native`, so its squad-guild read starts working again. Replace the TODO at line 141:

```typescript
guildId: computeDominantGuildId(detailsList.map(getNativeReport).filter(Boolean) as any[]),
```

Add a test asserting a non-empty guild id for a details list carrying native entities with a real `guild_id`. This is the interim regression the unit-1 plan opened and named unit 2 as the closer of — the branch is releasable again once it is green.

- [ ] **Step 5: Run the suite — expect PASS**

Run: `npx vitest run --maxWorkers=2`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/hooks/useStatsUploads.ts src/renderer/__tests__/useStatsUploads.test.ts
git commit -m "refactor: build report meta from native encounter times

Closes the interim guild regression opened in unit 1: computeDominantGuildId
now receives native reports at runtime."
```

---

### Task 9: Retire the encounter branches of `applyEiCompatShims`

**Files:**
- Modify: `src/main/axilogParser.ts:389-448`
- Modify: `src/main/__tests__/axilogParser.test.ts:267-310`

**Interfaces:**
- `applyEiCompatShims(details, logPath)` keeps its signature and its `players[].name` alias. Everything else in it goes.

Do this **last** among the code tasks: it is the step that removes the EI fallback the earlier tasks were still leaning on, so it only becomes safe once every reader above is native-first.

- [ ] **Step 1: Confirm nothing still reads the shimmed encounter fields from a native-carrying log**

```bash
grep -rn "\.encounterDuration\|\.timeStartStd\|\.timeEndStd\|details\?\?\.zone\|details\.zone" src --include=*.ts --include=*.tsx | grep -v __tests__
```

Every remaining hit must be either (a) a fallback branch that only runs when `details.native` is absent — legacy history entries — or (b) a `log.*` read, which is `ILogData`, not parse output. If a hit is neither, migrate it before continuing; do not delete the shim out from under it.

- [ ] **Step 2: Update the tests first**

In `describe('applyEiCompatShims')`, delete the zone / encounterDuration / timestamp cases and keep the name-alias case. Add:

```typescript
it('no longer invents timestamps from the .zevtc mtime', () => {
    const details: any = { players: [], durationMS: 1000 };
    applyEiCompatShims(details, FIXTURE);
    expect(details.timeStart).toBeUndefined();
    expect(details.timeEnd).toBeUndefined();
    expect(details.zone).toBeUndefined();
    expect(details.encounterDuration).toBeUndefined();
});

it('still aliases the character name, which unit 8 owns', () => {
    const details: any = { players: [{ character_name: 'Someone' }] };
    applyEiCompatShims(details, FIXTURE);
    expect(details.players[0].name).toBe('Someone');
});
```

- [ ] **Step 3: Run — expect the new tests to fail**

Run: `npx vitest run src/main/__tests__/axilogParser.test.ts --maxWorkers=2`

- [ ] **Step 4: Implement**

Reduce `applyEiCompatShims` to the name alias, and replace its doc block:

```typescript
/**
 * The last EI-shaped field axibridge fills by hand.
 *
 * `players[].name` — axilog spells the character name `character_name`;
 * `playerIdentity.getPlayerAccountKey` and several displays fall back to
 * `name`, and those readers stay EI-shaped until unit 8. This alias dies
 * with them.
 *
 * The zone / encounterDuration / timestamp branches were retired in unit 2:
 * all three now come from `details.native.encounter`, where the start time
 * is a real `started_at_unix` rather than the `.zevtc` mtime inference this
 * function used to perform.
 */
export const applyEiCompatShims = (details: any, logPath: string): any => { /* name alias only */ };
```

`logPath` becomes unused. Keep the parameter (the call site and tests pass it, and unit 8 deletes the function outright) and silence the lint with the codebase's existing convention for unused parameters — check how other files in `src/main/` do it rather than inventing one.

Delete `toStdTimestamp`, `formatEncounterDuration` and the `fs` import **only if** nothing else in the file uses them. Check first:

```bash
grep -n "toStdTimestamp\|formatEncounterDuration\|fs\." src/main/axilogParser.ts
```

- [ ] **Step 5: Run everything**

```bash
npx vitest run --maxWorkers=2 && npm test -w @axiapps/bridge-metrics && npm run validate
```

- [ ] **Step 6: Commit**

```bash
git add src/main/axilogParser.ts src/main/__tests__/axilogParser.test.ts
git commit -m "refactor: retire the encounter-level EI compat shims"
```

---

### Task 10: Update the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`

- [ ] **Step 1: Record the seam decision**

In "The seam", document option A as chosen, with the measured carry-set size (22 KB against a 2.38 MB native report on the fixture) and the standing double-parse cost measured in Task 2. State plainly that this does not contradict decision 3: the oracle compares implementations in *tests*, and no two full detail payloads are in flight — the carry-set is a whitelist that grows per unit, and `blocks` never enters it wholesale.

- [ ] **Step 2: Apply the two corrections**

Move `reportMetrics.ts` from the unit-2 row to unit 9, with the reason (it reads `report.json`, not EI details). Amend the unit-2 row to say the shim is *partly* retired, with `players[].name` deferred to unit 8.

- [ ] **Step 3: Record the timestamp allowlist entry**

Add a row to the "Expected entries" divergence table: `timeStart`/`timeEnd` → native is right, the EI path reached them only through the `.zevtc` mtime inference.

- [ ] **Step 4: Note that native is the smaller payload**

In "Pruning becomes block-shaped": the full native report measures 2.38 MB against EI's 3.40 MB on the fixture, so the Step N end state is cheaper than today, not merely differently shaped.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md
git commit -m "docs: record the unit 2 seam decision and spec corrections"
```

---

## Definition of done

- `npx vitest run --maxWorkers=2` and `npm test -w @axiapps/bridge-metrics` both green; `npm run validate` clean.
- `details.native` is attached on every successful parse, carrying `axilog`/`encounter`/`entities`/`coverage` and never `blocks` or `catalogs`.
- Fight duration, map name, fight timestamps, WvW team map and report-meta window all read `encounter` when it is present, and every EI fallback still works for a log parsed without it.
- The unit-1 guild regression is closed — `computeDominantGuildId` receives native reports at runtime.
- `applyEiCompatShims` contains only the `players[].name` alias, and no code path infers a timestamp from a file mtime.
- The unit-2 oracle passes with exactly one allowlist entry, and that entry states which side is right.

**Releasable at the end of this plan.** Unlike unit 1, this plan closes the regression it inherits rather than opening a new one. Task 9 is the only task that removes a fallback, and it runs after every reader is native-first.

## What this plan does not do

- Units 3–10 are untouched; their readers stay EI-shaped and keep working off the EI half of the seam.
- The published `report.json` keeps its current shape (decision 2, C1).
- Elite Insights removal is Step N.
- The history migration for existing EI-shaped `dpsReportCache` entries is unplanned; a legacy log carries no `.native`, so every reader here falls back — which is the behaviour that makes the history question deferrable, not solved.
