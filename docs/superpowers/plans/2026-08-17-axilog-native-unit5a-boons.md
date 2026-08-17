# axilog native unit 5a — Boons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-source boon uptime, boon generation and the stability timeline from axilog's native `blocks.boons` and `catalogs.buffs` instead of Elite Insights' `buffUptimes` / `selfBuffs` / `groupBuffs` / `squadBuffs` / `buffMap` shapes.

**Architecture:** A new shared reader, `nativeBoons.ts`, exposes the three shapes the modules consume — a per-buff uptime scalar, a per-buff generation triple, and a raw `[timeMs, stacks]` state timeline — from `blocks.boons.by_entity`. Buff metadata (name, boon-vs-condition, intensity-vs-duration stacking) comes from `catalogs.buffs`, which retires the hardcoded `BOON_IDS` table and the `classification` string sniffing. The measured evidence says this unit cannot move a displayed number: 504/504 uptimes, 203/203 generation values and 504/504 `states` arrays already match EI exactly.

**Tech Stack:** TypeScript, vitest, `@axiapps/axilog` 0.3.6 native container (schema 1.0), `@axiapps/bridge-metrics` workspace package.

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md` (unit 5 in the migration-units table)

## Scope: this is unit 5a of 5

The spec lists unit 5 as "Boons & conditions" over five modules. Probing showed those five split along a hard seam, so they are planned and merged separately:

- **5a (this plan)** — boons. `boonGeneration.ts`, `computeBoonTimeline.ts`, `computeBoonUptimeTimeline.ts`, `computeStabPerformance.ts`. An equality port: every number already matches.
- **5b (separate plan, written after 5a merges)** — conditions. `conditionsMetrics.ts` and retiring `attachConditionMetrics` into `blocks.conditions`. A restructure, not a port: native models conditions as *outgoing applications per source entity*, with no uptime and no per-target `states`.

Do not touch `conditionsMetrics.ts` or `attachConditionMetrics` in this unit.

## Global Constraints

- The native container is **schema 1.0, axilog 0.3.6**. Unit 5a must not require a schema change; if it does, that is a finding to report, not a change to make silently.
- Every unit is pinned by the **equality oracle** (`src/test/axilogOracle.ts`): parse `test-fixtures/axilog/wvw-small.anon.zevtc` both ways at the same axilog version, assert deep equality or an `ALLOWLIST` entry whose `reason` names which side is right.
- Both oracle parses use `{ everything: true }`, never an enumerated option list.
- vitest runs with `--maxWorkers=2` (global CLAUDE.md; this machine runs heavy apps alongside dev work).
- `npm run validate` (typecheck + lint at `--max-warnings 0`) must pass before each commit.
- `packages/bridge-metrics` is consumed via `dist/`, not `src/` — **rebuild it** (`npm --prefix packages/bridge-metrics run build`) after touching it or you get phantom TS2305 errors. Its own tests do not run under `npm run test:unit`; run `npm --prefix packages/bridge-metrics test`.
- Commits are signed via `SSH_AUTH_SOCK="$HOME/.1password/agent.sock"`, never `--no-gpg-sign`, and carry the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Never add a non-anonymized `.zevtc`; only `test-fixtures/axilog/*.anon.zevtc` is un-ignored.

---

## Measured facts this plan rests on

Probed against `test-fixtures/axilog/wvw-small.anon.zevtc` at axilog 0.3.6. Every mapping below was confirmed on real data, not read off a schema.

**`blocks.boons.by_entity[entityId][buffId]`** — `{ uptime_pct, generation, per_source, states }`, plus `avg_stacks` **only on intensity-stacking buffs**. Present for 42 entities: all 38 squad and 4 friendly players.

**`blocks.boons` and `blocks.conditions` are disjoint by role.** `boons.by_entity` holds squad + friendly only; `conditions.by_entity` holds enemy + npc only. There is no entity in both. A "condition on a squad member" uptime does not exist anywhere in the native container — do not go looking for it in this unit, and do not assume 5b will find it either.

**The uptime rule, and the trap in it.** EI reports two numbers per buff, `uptime` and `presence`. Native reports `avg_stacks` and `uptime_pct`. The correct mapping is:

| `catalogs.buffs[id].stacking` | EI `buffData[0].uptime` equals | EI `buffData[0].presence` equals |
|---|---|---|
| `'intensity'` | native `avg_stacks` | native `uptime_pct` |
| `'duration'` | native `uptime_pct` | native `uptime_pct` |

**Verified across 504 of 504 buff/player pairs, zero diffs above 0.011.** Getting this backwards is silent and severe: Might's EI `uptime` is 19.43 while its `presence` is 99.86, so reading `uptime_pct` for an intensity buff would render Might as ~99 stacks. Task 1's test pins this directly.

**`generation`** — `{ self_pct, group_pct, squad_pct, self_wasted, group_wasted, squad_wasted }`. Maps onto EI's `player.selfBuffs` / `groupBuffs` / `squadBuffs` arrays' `buffData[0].{generation, wasted}`. **Verified: 203 of 203 squad-generation values match, zero diffs above 0.011.** Note native carries **no `overstack`** field and EI's shim emits none either, so nothing is lost.

**`states`** — `[[timeMs, stacks], ...]`, a step function in **fight-relative** ms, where the final entry runs to fight end. **Verified: all 504 `states` arrays are byte-identical between EI and native** — the EI shim is passing native's own states through. Confirmed independently: for buff 717 the `1`-valued intervals sum to 28664ms against `encounter.duration_ms` of 49285, which is 58.16%, exactly the reported `uptime_pct`.

**`per_source.by_source[sourceEntityId]`** — the same `[[timeMs, stacks]]` state shape, per contributing source. This is the native source for EI's `buffUptimes[].statesPerSource`, **keyed by entity id rather than by character name**. That is strictly better and is the one join that genuinely changes: axilog emits one entity per agent instance, so character names are not unique, while entity ids are.

**`catalogs.buffs[buffId]`** — `{ name, kind, stacking, max_stacks }` where `kind` is `'boon' | 'condition'` and `stacking` is `'intensity' | 'duration'`. **Verified: `stacking === 'intensity'` maps to EI's `stacking === true` on all 26 buffs, with no exceptions.** This retires the hardcoded `BOON_IDS` table that once had Resolution and Aegis wrong (Resolution is emitted under `b873`, Aegis under `b743`; `31484` is never emitted) and shipped a Resolution card reading 0 until v2.13.8.

**EI's `buffMap` carries no icons at all** — all 26 entries are `{ name, stacking }`, zero have an `icon`, and `classification` is `undefined` on every one. So `catalogs.buffs` lacking an `icon` field is **parity, not a regression**: boon icons already come from `stats.replayIcons.boonIcons` (see `StatsView.tsx:211-218`), not from `buffMap`. Do not add an icon map, and do not file an axilog change for it.

**`classification` is dead code on this path.** `isBoon()` in `boonGeneration.ts:48-51` returns `true` whenever `classification` is absent, which is always. Conditions nonetheless never reach the boon tables, because they never appear in a player's `selfBuffs`/`groupBuffs`/`squadBuffs` arrays. **Verified: `buildBoonTables` returns exactly 12 tables — Stability, Quickness, Resistance, Alacrity, Protection, Regeneration, Swiftness, Fury, Vigor, Might, Aegis, Resolution — and no conditions.** Replacing `isBoon` with native `kind === 'boon'` is therefore *hardening*, and Task 2 pins that the table count stays 12.

**`active_ms`** — `blocks.replay.by_entity[entityId].active_ms`. **Verified equal to EI's `player.activeTimes[0]`** (49263 on the probed entity, against a 49285ms fight).

**Subgroup and duration** — `entities[].subgroup` replaces `player.group`; `encounter.duration_ms` replaces `details.durationMS`. Both landed in units 1 and 2 and are already used elsewhere in the codebase.

## Deliberate non-goals

Named so an implementer does not "improve" them mid-unit and blow up the oracle:

1. **Do not touch conditions.** `conditionsMetrics.ts`, `attachConditionMetrics`, and `NON_DAMAGING_CONDITIONS` all belong to 5b. In particular, native's condition names are `Crippled` and `Immobile` where axibridge's canonical names are `Cripple` and `Immobilize` — that mismatch is 5b's central trap and must not be half-addressed here.
2. **Do not change the boon table's displayed math.** `computeBoonMetrics`, `getBoonMetricValue` and `formatBoonMetricDisplay` (`boonGeneration.ts:86-178`) stay exactly as they are. This unit changes only where `BoonRow.categories` gets its numbers from.
3. **Do not add icons to `catalogs.buffs`.** See the measured fact above — EI supplies none either.
4. **No EI deletion.** `parseFileEi` stays wired; Step N removes it after unit 10.
5. **Do not migrate `computeStripSpikesData.ts`.** Strips live in `blocks.support` (`strips`, `strips_duration_ms`) and belong to unit 6.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/bridge-metrics/src/nativeBoons.ts` (create) | The only file that knows `blocks.boons` / `catalogs.buffs` shape. Exposes buff metadata, uptime, generation and state timelines by entity id. |
| `packages/bridge-metrics/src/__tests__/nativeBoons.test.ts` (create) | Unit tests for the reader, including the intensity/duration uptime rule against the real fixture. |
| `packages/bridge-metrics/src/index.ts` (modify) | Add `export * from './nativeBoons';`. |
| `packages/bridge-metrics/src/boonGeneration.ts` (modify) | `buildBoonTables` and `getPlayerBoonGenerationMs` re-sourced from native. Display math untouched. |
| `src/renderer/stats/computeBoonUptimeTimeline.ts` (modify) | Per-source stack timelines from `per_source.by_source`, keyed by entity id. |
| `src/renderer/stats/computeStabPerformance.ts` (modify) | Stability `states` from `blocks.boons.by_entity[id]['1122'].states`. |
| `src/renderer/stats/computeBoonTimeline.ts` (modify) | Generation-over-time from native generation percentages. |
| `src/test/__tests__/boonsNative.oracle.test.ts` (create) | The unit's equality oracle. |
| `docs/axilog-cutover-report.md` (modify) | Record unit 5a's measured findings. |

---

### Task 1: The native boons reader

**Files:**
- Create: `packages/bridge-metrics/src/nativeBoons.ts`
- Create: `packages/bridge-metrics/src/__tests__/nativeBoons.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. `squadEntities` and `getEntityProfession` already exist in `packages/bridge-metrics/src/nativeRoster.ts` from unit 1.
- Produces: everything Tasks 2–4 consume —
  - `interface NativeBuffMeta { id: number; name: string; kind: 'boon' | 'condition'; stacking: boolean; maxStacks: number }` (note `stacking` is normalized to a **boolean** here, `true` for `'intensity'`, to match the boolean the existing display math already takes)
  - `getBuffMeta(details: any, buffId: number | string): NativeBuffMeta | null`
  - `listBoonIds(details: any): number[]` — every `catalogs.buffs` id whose `kind === 'boon'`, ascending
  - `getEntityBuffUptime(details: any, entityId: number, buffId: number): number` — `avg_stacks` for intensity, `uptime_pct` for duration
  - `getEntityBuffPresence(details: any, entityId: number, buffId: number): number` — always `uptime_pct`
  - `getEntityBuffGeneration(details: any, entityId: number, buffId: number): { self: number; group: number; squad: number; selfWasted: number; groupWasted: number; squadWasted: number }`
  - `getEntityBuffStates(details: any, entityId: number, buffId: number): Array<[number, number]>`
  - `getEntityBuffStatesPerSource(details: any, entityId: number, buffId: number): Map<number, Array<[number, number]>>`
  - `getEntityActiveMs(details: any, entityId: number, fallbackMs: number): number`

- [ ] **Step 1: Write the failing test**

Create `packages/bridge-metrics/src/__tests__/nativeBoons.test.ts`:

```ts
/**
 * The load-bearing test here is the intensity/duration uptime rule. EI reports
 * `uptime` and `presence`; native reports `avg_stacks` and `uptime_pct`, and
 * the correspondence flips depending on `catalogs.buffs[id].stacking`. Reading
 * `uptime_pct` for an intensity buff is silent and renders Might at ~99 stacks
 * instead of ~19, so this pins the rule against the real fixture rather than a
 * hand-built one.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile } from '@axiapps/axilog';
import {
    getBuffMeta,
    listBoonIds,
    getEntityBuffUptime,
    getEntityBuffPresence,
    getEntityBuffGeneration,
    getEntityBuffStates,
    getEntityBuffStatesPerSource,
    getEntityActiveMs,
} from '../nativeBoons';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('nativeBoons', () => {
    const native: any = parseFile(FIXTURE, { everything: true } as any);
    const details = { native } as any;
    const squadId = native.entities.find((e: any) => e.role === 'squad').id;

    it('normalizes intensity stacking to the boolean the display math takes', () => {
        expect(getBuffMeta(details, 740)).toEqual({
            id: 740, name: 'Might', kind: 'boon', stacking: true, maxStacks: 25,
        });
        expect(getBuffMeta(details, 717)?.stacking).toBe(false);
        expect(getBuffMeta(details, 736)?.kind).toBe('condition');
    });

    it('returns null for a buff the catalog does not carry', () => {
        expect(getBuffMeta(details, 31484)).toBeNull();
    });

    it('lists only boons, not conditions', () => {
        const ids = listBoonIds(details);
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(getBuffMeta(details, id)?.kind).toBe('boon');
        expect(ids).toContain(740);
        expect(ids).not.toContain(736);
        // Resolution is emitted under 873 and Aegis under 743 -- the pair the
        // old hardcoded BOON_IDS table had wrong.
        expect(ids).toContain(873);
        expect(ids).toContain(743);
    });

    it('reads avg_stacks for intensity buffs and uptime_pct for duration buffs', () => {
        for (const entity of native.entities.filter((e: any) => e.role === 'squad')) {
            const raw = native.blocks.boons.by_entity[String(entity.id)] ?? {};
            for (const [buffId, value] of Object.entries<any>(raw)) {
                const meta = getBuffMeta(details, buffId);
                if (!meta) continue;
                const expected = meta.stacking ? value.avg_stacks : value.uptime_pct;
                expect(getEntityBuffUptime(details, entity.id, Number(buffId))).toBe(expected);
                expect(getEntityBuffPresence(details, entity.id, Number(buffId))).toBe(value.uptime_pct);
            }
        }
    });

    it('only intensity buffs carry avg_stacks, which is why the rule is needed', () => {
        const raw = native.blocks.boons.by_entity[String(squadId)];
        const intensity = Object.entries<any>(raw).filter(([id]) => getBuffMeta(details, id)?.stacking);
        const duration = Object.entries<any>(raw).filter(([id]) => getBuffMeta(details, id)?.stacking === false);
        expect(intensity.length).toBeGreaterThan(0);
        expect(duration.length).toBeGreaterThan(0);
        for (const [, v] of intensity) expect(v.avg_stacks).toBeDefined();
        for (const [, v] of duration) expect(v.avg_stacks).toBeUndefined();
    });

    it('reads the generation triple with wasted, defaulting absent buffs to zero', () => {
        const gen = getEntityBuffGeneration(details, squadId, 740);
        expect(gen.self).toBeGreaterThanOrEqual(0);
        expect(Object.keys(gen).sort()).toEqual(
            ['group', 'groupWasted', 'self', 'selfWasted', 'squad', 'squadWasted'],
        );
        expect(getEntityBuffGeneration(details, squadId, 999999)).toEqual({
            self: 0, group: 0, squad: 0, selfWasted: 0, groupWasted: 0, squadWasted: 0,
        });
    });

    it('returns states as fight-relative [timeMs, stacks] pairs that integrate to uptime_pct', () => {
        // Independent check that `states` means what we think: the time-weighted
        // mean of the step function must reproduce the reported percentage.
        const duration = native.encounter.duration_ms;
        const buffId = 717;
        const states = getEntityBuffStates(details, squadId, buffId);
        if (states.length === 0) return;
        let onMs = 0;
        for (let i = 0; i < states.length; i++) {
            const [t, v] = states[i];
            const next = i + 1 < states.length ? states[i + 1][0] : duration;
            if (v >= 1) onMs += next - t;
        }
        const pct = (onMs / duration) * 100;
        expect(pct).toBeCloseTo(getEntityBuffPresence(details, squadId, buffId), 4);
    });

    it('keys per-source states by entity id, not character name', () => {
        const bySource = getEntityBuffStatesPerSource(details, squadId, 718);
        expect(bySource.size).toBeGreaterThan(0);
        for (const key of bySource.keys()) {
            expect(Number.isFinite(key)).toBe(true);
            // Every source must resolve to a real entity -- the join that
            // replaces EI's name-keyed statesPerSource.
            expect(native.entities.some((e: any) => e.id === key)).toBe(true);
        }
    });

    it('reads active_ms and falls back when the entity has no replay row', () => {
        expect(getEntityActiveMs(details, squadId, 1234)).toBe(
            native.blocks.replay.by_entity[String(squadId)].active_ms,
        );
        expect(getEntityActiveMs(details, 999999, 1234)).toBe(1234);
    });

    it('returns empty for a missing native container rather than throwing', () => {
        expect(getEntityBuffStates({} as any, 1, 740)).toEqual([]);
        expect(listBoonIds({} as any)).toEqual([]);
        expect(getBuffMeta({} as any, 740)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/bridge-metrics test -- nativeBoons`
Expected: FAIL — `Cannot find module '../nativeBoons'`.

- [ ] **Step 3: Write the implementation**

Create `packages/bridge-metrics/src/nativeBoons.ts`:

```ts
/**
 * The only reader that knows `blocks.boons` and `catalogs.buffs` shape.
 *
 * Two facts drive this file. First, native reports `avg_stacks` (intensity
 * buffs only) alongside `uptime_pct`, and EI's `uptime` corresponds to
 * whichever of the two matches the buff's stacking mode -- so callers must go
 * through `getEntityBuffUptime` rather than reaching for a field. Second,
 * `catalogs.buffs` states `kind` and `stacking` outright, which retires both
 * the hardcoded boon-id table and the `classification` string sniffing.
 */

export interface NativeBuffMeta {
    id: number;
    name: string;
    kind: 'boon' | 'condition';
    /** True for intensity stacking. Normalized to the boolean the display math takes. */
    stacking: boolean;
    maxStacks: number;
}

export interface NativeBuffGeneration {
    self: number;
    group: number;
    squad: number;
    selfWasted: number;
    groupWasted: number;
    squadWasted: number;
}

const ZERO_GENERATION: NativeBuffGeneration = {
    self: 0, group: 0, squad: 0, selfWasted: 0, groupWasted: 0, squadWasted: 0,
};

const nativeOf = (details: any): any => details?.native ?? null;

const boonsOf = (details: any, entityId: number): any =>
    nativeOf(details)?.blocks?.boons?.by_entity?.[String(entityId)] ?? null;

const entryOf = (details: any, entityId: number, buffId: number): any =>
    boonsOf(details, entityId)?.[String(buffId)] ?? null;

export const getBuffMeta = (details: any, buffId: number | string): NativeBuffMeta | null => {
    const raw = nativeOf(details)?.catalogs?.buffs?.[String(buffId)];
    if (!raw) return null;
    return {
        id: Number(buffId),
        name: String(raw.name ?? `Buff ${buffId}`),
        kind: raw.kind === 'condition' ? 'condition' : 'boon',
        stacking: raw.stacking === 'intensity',
        maxStacks: Number(raw.max_stacks ?? 0),
    };
};

export const listBoonIds = (details: any): number[] => {
    const buffs = nativeOf(details)?.catalogs?.buffs;
    if (!buffs) return [];
    return Object.keys(buffs)
        .filter((id) => buffs[id]?.kind === 'boon')
        .map(Number)
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b);
};

export const getEntityBuffUptime = (details: any, entityId: number, buffId: number): number => {
    const entry = entryOf(details, entityId, buffId);
    if (!entry) return 0;
    // Intensity buffs report a mean stack count; duration buffs report a
    // percentage. EI collapsed both into `uptime`, so the branch lives here.
    const meta = getBuffMeta(details, buffId);
    if (meta?.stacking) return Number(entry.avg_stacks ?? 0);
    return Number(entry.uptime_pct ?? 0);
};

export const getEntityBuffPresence = (details: any, entityId: number, buffId: number): number =>
    Number(entryOf(details, entityId, buffId)?.uptime_pct ?? 0);

export const getEntityBuffGeneration = (
    details: any, entityId: number, buffId: number,
): NativeBuffGeneration => {
    const gen = entryOf(details, entityId, buffId)?.generation;
    if (!gen) return { ...ZERO_GENERATION };
    return {
        self: Number(gen.self_pct ?? 0),
        group: Number(gen.group_pct ?? 0),
        squad: Number(gen.squad_pct ?? 0),
        selfWasted: Number(gen.self_wasted ?? 0),
        groupWasted: Number(gen.group_wasted ?? 0),
        squadWasted: Number(gen.squad_wasted ?? 0),
    };
};

const toStates = (raw: any): Array<[number, number]> => {
    if (!Array.isArray(raw)) return [];
    const out: Array<[number, number]> = [];
    for (const pair of raw) {
        if (!Array.isArray(pair)) continue;
        const time = Number(pair[0]);
        const stacks = Number(pair[1]);
        if (!Number.isFinite(time) || !Number.isFinite(stacks)) continue;
        out.push([time, stacks]);
    }
    return out;
};

export const getEntityBuffStates = (
    details: any, entityId: number, buffId: number,
): Array<[number, number]> => toStates(entryOf(details, entityId, buffId)?.states);

export const getEntityBuffStatesPerSource = (
    details: any, entityId: number, buffId: number,
): Map<number, Array<[number, number]>> => {
    const bySource = entryOf(details, entityId, buffId)?.per_source?.by_source ?? {};
    const out = new Map<number, Array<[number, number]>>();
    for (const [sourceId, states] of Object.entries<any>(bySource)) {
        const id = Number(sourceId);
        if (!Number.isFinite(id)) continue;
        out.set(id, toStates(states));
    }
    return out;
};

export const getEntityActiveMs = (details: any, entityId: number, fallbackMs: number): number => {
    const active = nativeOf(details)?.blocks?.replay?.by_entity?.[String(entityId)]?.active_ms;
    const value = Number(active);
    return Number.isFinite(value) && value > 0 ? value : fallbackMs;
};
```

- [ ] **Step 4: Export the reader**

In `packages/bridge-metrics/src/index.ts`, add after the `nativeDamage` export line:

```ts
export * from './nativeBoons';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix packages/bridge-metrics run build && npm --prefix packages/bridge-metrics test`
Expected: PASS, all files.

- [ ] **Step 6: Commit**

```bash
git add packages/bridge-metrics/src/nativeBoons.ts \
        packages/bridge-metrics/src/__tests__/nativeBoons.test.ts \
        packages/bridge-metrics/src/index.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(native): read boon uptime, generation and states from blocks.boons

catalogs.buffs states kind and stacking outright, so the hardcoded boon-id
table and the classification sniffing both retire. The uptime rule is the
load-bearing part: EI's \`uptime\` is native's \`avg_stacks\` for intensity
buffs and \`uptime_pct\` for duration ones, verified 504/504 on the fixture.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Boon tables and generation from native

**Files:**
- Modify: `packages/bridge-metrics/src/boonGeneration.ts` (`buildBoonTables` at :180-330, `getPlayerBoonGenerationMs` at :396-417)
- Test: `packages/bridge-metrics/src/__tests__/boonGeneration.native.test.ts` (create)

**Interfaces:**
- Consumes: `getBuffMeta`, `listBoonIds`, `getEntityBuffGeneration`, `getEntityActiveMs` from Task 1; `squadEntities` and `getEntityProfession` from `nativeRoster.ts`.
- Produces: `getEntityBoonGenerationMs(details, entityId, category, boonId, durationMs, groupCount, squadCount)` returning `{ generationMs: number; wastedMs: number }`, replacing `getPlayerBoonGenerationMs`. `buildBoonTables` keeps its exact signature and return shape `{ boonTables: BoonTable[] }`.

**Do not change** `computeGenerationMs`, `computeBoonMetrics`, `getBoonMetricValue` or `formatBoonMetricDisplay`. Only the ingest changes.

- [ ] **Step 1: Write the failing test**

Create `packages/bridge-metrics/src/__tests__/boonGeneration.native.test.ts`:

```ts
/**
 * Pins the ingest swap in buildBoonTables. The numbers must not move: EI's
 * generation values and native's generation percentages were measured equal
 * on 203/203 squad pairs, so this asserts the table set and the row values
 * against the real fixture parsed both ways.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { buildBoonTables, getEntityBoonGenerationMs } from '../boonGeneration';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('buildBoonTables over native', () => {
    const native: any = parseFile(FIXTURE, { everything: true } as any);
    const ei: any = parseFileEi(FIXTURE, { everything: true } as any);
    const details = { ...ei, native } as any;

    it('builds the same twelve boon tables as the EI path', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        expect(boonTables.map((t) => t.id).sort()).toEqual([
            'b1122', 'b1187', 'b26980', 'b30328', 'b717', 'b718',
            'b719', 'b725', 'b726', 'b740', 'b743', 'b873',
        ]);
        // Conditions must not leak in now that `kind` is a real filter.
        expect(boonTables.some((t) => t.name === 'Bleeding')).toBe(false);
    });

    it('marks intensity boons as stacking', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        expect(boonTables.find((t) => t.id === 'b740')?.stacking).toBe(true);
        expect(boonTables.find((t) => t.id === 'b717')?.stacking).toBe(false);
    });

    it('gives every squad member a row with a real active time', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        const squad = native.entities.filter((e: any) => e.role === 'squad');
        const might = boonTables.find((t) => t.id === 'b740');
        expect(might?.rows).toHaveLength(squad.length);
        for (const row of might!.rows) {
            expect(row.activeTimeMs).toBeGreaterThan(0);
            expect(row.squadSupported).toBe(squad.length);
        }
    });

    it('reads generation from native without any EI buff payload', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        const stripped = {
            details: {
                ...details,
                players: ei.players.map((p: any) => ({
                    ...p, selfBuffs: undefined, groupBuffs: undefined,
                    squadBuffs: undefined, buffUptimes: undefined, activeTimes: undefined,
                })),
                buffMap: undefined,
            },
        };
        expect(buildBoonTables([stripped]).boonTables).toEqual(boonTables);
    });

    it('returns zero generation for a boon the entity never generated', () => {
        const squadId = native.entities.find((e: any) => e.role === 'squad').id;
        expect(getEntityBoonGenerationMs(details, squadId, 'selfBuffs', 999999, 50000, 5, 38))
            .toEqual({ generationMs: 0, wastedMs: 0 });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/bridge-metrics test -- boonGeneration.native`
Expected: FAIL — `getEntityBoonGenerationMs` is not exported.

- [ ] **Step 3: Add the native generation reader**

In `packages/bridge-metrics/src/boonGeneration.ts`, add this import at the top:

```ts
import { getBuffMeta, listBoonIds, getEntityBuffGeneration, getEntityActiveMs } from './nativeBoons';
import { squadEntities, getEntityProfession } from './nativeRoster';
```

Then add, directly after `getPlayerBoonGenerationMs`:

```ts
const GENERATION_FIELD: Record<Exclude<BoonCategory, 'totalBuffs'>, keyof ReturnType<typeof getEntityBuffGeneration>> = {
    selfBuffs: 'self',
    groupBuffs: 'group',
    squadBuffs: 'squad',
};

const WASTED_FIELD: Record<Exclude<BoonCategory, 'totalBuffs'>, keyof ReturnType<typeof getEntityBuffGeneration>> = {
    selfBuffs: 'selfWasted',
    groupBuffs: 'groupWasted',
    squadBuffs: 'squadWasted',
};

export const getEntityBoonGenerationMs = (
    details: any,
    entityId: number,
    category: Exclude<BoonCategory, 'totalBuffs'>,
    boonId: number,
    durationMs: number,
    groupCount: number,
    squadCount: number,
) => {
    const gen = getEntityBuffGeneration(details, entityId, boonId);
    const stacking = getBuffMeta(details, boonId)?.stacking ?? false;
    return computeGenerationMs(
        category,
        stacking,
        Number(gen[GENERATION_FIELD[category]] ?? 0),
        Number(gen[WASTED_FIELD[category]] ?? 0),
        durationMs,
        groupCount,
        squadCount,
    );
};
```

- [ ] **Step 4: Re-source `buildBoonTables`**

Replace the body of the `logs.forEach` ingest in `buildBoonTables` so it iterates native entities instead of EI players. The per-log preamble becomes:

```ts
    logs.forEach((log) => {
        const details = log.details;
        if (!details) return;

        const durationMs = Number(details?.native?.encounter?.duration_ms ?? details.durationMS ?? 0);

        // Buff metadata comes from the catalog, which states `kind` outright.
        // The old path sniffed a `classification` string that EI never sets,
        // so every buff passed -- conditions simply never reached these arrays.
        listBoonIds(details).forEach((id) => {
            const meta = getBuffMeta(details, id);
            if (!meta) return;
            boonMeta.set(toBoonId(id), { name: meta.name, stacking: meta.stacking, classification: 'Boon' });
        });

        const members = squadEntities(details?.native);
        const squadCount = members.length;

        const groupCounts = new Map<number, number>();
        members.forEach((entity) => {
            const group = entity.subgroup ?? 0;
            groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        });

        members.forEach((entity) => {
            const account = entity.account || entity.character || 'Unknown';
            const profession = getEntityProfession(entity) || 'Unknown';
            const group = entity.subgroup ?? 0;
            const groupCount = groupCounts.get(group) || 1;
            const activeTimeMs = getEntityActiveMs(details, entity.id, durationMs);
            const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;
            // ... existing per-player aggregation body, unchanged, except that
            // every `getPlayerBoonGenerationMs(player, category, boonIdNum, ...)`
            // call becomes:
            //   getEntityBoonGenerationMs(details, entity.id, category, boonIdNum, durationMs, groupCount, squadCount)
        });
    });
```

Keep the rest of the function — the `playerAgg` accumulation, the `boonIds` selection at :299, and the table assembly — exactly as it is, other than replacing the `isBoon` filter at :299 with the already-boon-only `boonMeta` keys:

```ts
    const boonIds = Array.from(boonMeta.keys());
```

Delete the now-unused `isBoon` function (`:48-51`) and the `classification` field from `BuffInfo` only if nothing else references them; `grep -rn "isBoon\|classification" packages/bridge-metrics/src src` first, and leave `classification` in place if `conditionsMetrics.ts` still uses it — that file belongs to 5b.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix packages/bridge-metrics run build && npm --prefix packages/bridge-metrics test`
Expected: PASS. Then run the root suite, which has existing boon coverage:
Run: `npm run test:unit -- --maxWorkers=2`
Expected: PASS.

If a pre-existing test fails, read it before changing it. A failure here means either the ingest swap moved a number (investigate — the probe says it should not) or the test hand-builds an EI-only fixture that now needs a `native:` block, exactly as unit 4's `computeStatsAggregation.skillDamage.test.ts` did.

- [ ] **Step 6: Commit**

```bash
git add packages/bridge-metrics/src/boonGeneration.ts \
        packages/bridge-metrics/src/__tests__/boonGeneration.native.test.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(boons): source boon tables and generation from blocks.boons

buildBoonTables now iterates native squad entities and reads generation
percentages from blocks.boons, with buff metadata from catalogs.buffs. The
display math is untouched. Drops isBoon, which sniffed a classification
string EI never sets -- catalogs.buffs states kind directly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Stability performance and the uptime timeline

**Files:**
- Modify: `src/renderer/stats/computeStabPerformance.ts` (`computeStabStacks` at :133-155, called from `ingestLogStabPerformance` at :204)
- Modify: `src/renderer/stats/computeBoonUptimeTimeline.ts` (`ingestLogBoonUptimeTimeline` at :144-253)

**Interfaces:**
- Consumes: `getEntityBuffStates`, `getEntityBuffStatesPerSource`, `getBuffMeta`, `listBoonIds` from Task 1; `squadEntities`, `getEntityProfession` from `nativeRoster.ts`.
- Produces: no new exported signatures. Both modules keep their current exports and return shapes.

These two modules are grouped because they consume the same primitive — a `[timeMs, stacks]` state timeline — and the measured evidence says both are pure substitutions: all 504 `states` arrays are byte-identical between EI and native.

- [ ] **Step 1: Re-source `computeStabPerformance`**

**Scope discipline: change only the stab-stacks source.** This module is already half-native — positions come from `buildNativeMovement` and are joined to EI player rows by account (`:176-186`). Its other two readers, `computeIncomingDamage` and `computeDeaths`, read EI damage and death rows and belong to units 4 and 6. Leave them, leave the `squadPlayers` iteration, and reuse the `entityByAccount` map the function already builds. This is a deliberate half-migration, the same call unit 4 made for `computeFightDiffMode`.

In `src/renderer/stats/computeStabPerformance.ts`, change `computeStabStacks` to take the native details and an entity id rather than an EI player:

```ts
const STABILITY_BUFF_ID = 1122;

const computeStabStacks = (
    details: any, entityId: number | undefined, bucketCount: number,
): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    if (entityId === undefined) return out;
    const states = getEntityBuffStates(details, entityId, STABILITY_BUFF_ID);
    if (states.length === 0) return out;
    // The bucket integration below is unchanged. Native `states` are a step
    // function in fight-relative ms whose last entry runs to fight end --
    // exactly what EI's `states` were, because the EI shim was passing these
    // very arrays through. All 504 are byte-identical on the fixture.
    for (let b = 0; b < bucketCount; b++) {
        // ... existing loop body from :143-155, unchanged
    }
    return out;
};
```

Note the signature now tolerates `undefined`: `entityByAccount.get(...)` returns `number | undefined`, and an account with no native entity must yield zeroed buckets rather than throw.

Add the import at the top of the file (`squadEntities` is already imported there):

```ts
import { getEntityBuffStates } from '@axiapps/bridge-metrics';
```

Then update the single call site at `:204`, reusing the `entityId` local the function already resolves two lines above it:

```ts
        const stacks = computeStabStacks(details, entityId, bucketCount).map(round1);
```

Delete nothing else in this function.

- [ ] **Step 2: Re-source `computeBoonUptimeTimeline`**

In `src/renderer/stats/computeBoonUptimeTimeline.ts`, replace the `buffUptimes.forEach` ingest at :170-219. The per-source join is the substantive change — EI keyed `statesPerSource` by character name, native keys it by entity id:

```ts
    const members = squadEntities(details?.native);
    const durationMs = Math.max(0, Number(details?.native?.encounter?.duration_ms ?? details?.durationMS ?? 0));

    members.forEach((entity) => {
        const key = entity.account || entity.character || 'Unknown';
        const profession = getEntityProfession(entity) || 'Unknown';

        listBoonIds(details).forEach((boonIdNum) => {
            const meta = getBuffMeta(details, boonIdNum);
            if (!meta) return;
            const boonId = `b${boonIdNum}`;

            // Native keys per-source states by entity id. EI keyed them by
            // character name, which is not unique -- axilog emits one entity
            // per agent instance, so two entries can share a name.
            const bySource = getEntityBuffStatesPerSource(details, entity.id, boonIdNum);
            if (bySource.size === 0) return;
            const statesPerSource: Record<string, Array<[number, number]>> = {};
            for (const [sourceId, states] of bySource) statesPerSource[String(sourceId)] = states;

            const boonBucket = ensureBoonBucket(
                boonBuckets, boonId, defaultBoonIntervalMs, defaultStackingIntervalMs,
                { name: meta.name, stacking: meta.stacking },
            );
            const intervalMs = boonBucket.intervalMs;
            const boonBucketCount = Math.max(1, Math.ceil(Math.max(1, durationMs) / intervalMs));
            const buckets = sampleStackTimeline(
                statesPerSource, boonBucketCount, meta.stacking, meta.name, intervalMs,
            );
            const fightValue = createFightValue(buckets);
            if (fightValue.total <= 0 && fightValue.peak <= 0) return;
            // ... existing playerEntry accumulation, unchanged
        });
    });
```

Add the imports:

```ts
import {
    getBuffMeta, listBoonIds, getEntityBuffStatesPerSource, squadEntities, getEntityProfession,
} from '@axiapps/bridge-metrics';
```

and delete the `buffMap` local at :155-157 and the `classification` guard at :176-177 — `listBoonIds` already filters to boons.

- [ ] **Step 3: Run the tests**

Run: `npm run test:unit -- --maxWorkers=2`
Expected: PASS. Existing tests for both modules must stay green without edits; if one fails, check whether it hand-builds an EI-only fixture needing a `native:` block rather than assuming the rewrite is wrong.

- [ ] **Step 4: Validate**

Run: `npm run validate`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeStabPerformance.ts \
        src/renderer/stats/computeBoonUptimeTimeline.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(boons): source stab and uptime timelines from native states

Both modules consume [timeMs, stacks] step functions that are byte-identical
between EI and native on the fixture (504/504 arrays). The one real change is
the per-source join: native keys by entity id where EI keyed by character
name, which is not unique across agent instances.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The boon generation timeline

**Files:**
- Modify: `src/renderer/stats/computeBoonTimeline.ts` (`ingestLogBoonTimeline` at :172-260)

**Interfaces:**
- Consumes: `getEntityBoonGenerationMs` from Task 2; `getBuffMeta`, `listBoonIds` from Task 1; `squadEntities`, `getEntityProfession` from `nativeRoster.ts`.
- Produces: no signature change. `ingestLogBoonTimeline(log, acc, _buffMap?)` keeps its shape; the unused third parameter stays for call-site compatibility.

- [ ] **Step 1: Re-source the ingest**

In `src/renderer/stats/computeBoonTimeline.ts`, replace the preamble at :179-191 and the per-player loop at :213-253:

```ts
    const members = squadEntities(details?.native);
    const squadCount = members.length;
    const durationMs = Math.max(0, Number(details?.native?.encounter?.duration_ms ?? details?.durationMS ?? 0));

    const groupCounts = new Map<number, number>();
    members.forEach((entity) => {
        const group = entity.subgroup ?? 0;
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    });

    members.forEach((entity) => {
        const group = entity.subgroup ?? 0;
        const groupCount = groupCounts.get(group) || 1;
        const key = entity.account || entity.character || 'Unknown';
        const profession = getEntityProfession(entity) || 'Unknown';
        const categories: Array<'selfBuffs' | 'groupBuffs' | 'squadBuffs'> = ['selfBuffs', 'groupBuffs', 'squadBuffs'];

        listBoonIds(details).forEach((boonIdNum) => {
            const meta = getBuffMeta(details, boonIdNum);
            if (!meta) return;
            const boonId = `b${boonIdNum}`;

            categories.forEach((category) => {
                const generationMs = getEntityBoonGenerationMs(
                    details, entity.id, category, boonIdNum, durationMs, groupCount, squadCount,
                ).generationMs || 0;
                // ... existing accumulation into boonBucket / playerEntry /
                // '__all__', unchanged, using `meta.name` and `meta.stacking`
                // where the old code read `buffMap[boonId]`
            });
        });
    });
```

Add the imports:

```ts
import {
    getBuffMeta, listBoonIds, getEntityBoonGenerationMs, squadEntities, getEntityProfession,
} from '@axiapps/bridge-metrics';
```

and delete the `buffMap` local at :185-186.

- [ ] **Step 2: Run the tests**

Run: `npm run test:unit -- --maxWorkers=2`
Expected: PASS.

- [ ] **Step 3: Validate**

Run: `npm run validate`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/computeBoonTimeline.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(boons): source the boon generation timeline from native

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The equality oracle

**Files:**
- Create: `src/test/__tests__/boonsNative.oracle.test.ts`

**Interfaces:**
- Consumes: `oracleFixture`, `expectEqualOrAllowlisted`, `DivergenceAllowlist` from `src/test/axilogOracle.ts`; the four migrated modules.
- Produces: nothing.

Model this on `src/test/__tests__/damageNative.oracle.test.ts`. **Start with an empty `ALLOWLIST`** — the probe measured full equality, so any divergence is a finding to investigate, not to allowlist reflexively.

- [ ] **Step 1: Write the oracle test**

Create `src/test/__tests__/boonsNative.oracle.test.ts`:

```ts
/**
 * Boons oracle -- EI buff shapes vs blocks.boons.
 *
 * Unit 5a is the closest thing to a pure substitution in this migration: the
 * EI shim was already passing native's own numbers through, so the oracle's
 * job is less "did the arithmetic survive" than "is every reader actually on
 * the native path". Hence the strip test, and hence the two invariants a
 * hand-built fixture cannot pin:
 *
 *   - the intensity/duration uptime rule, because reading `uptime_pct` for an
 *     intensity buff is silent and renders Might at ~99 stacks instead of ~19
 *   - the per-source join, because native keys by entity id where EI keyed by
 *     character name, and names are not unique across agent instances
 */
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { buildBoonTables } from '../../shared/boonGeneration';
import {
    createStabPerformanceAccumulator, ingestLogStabPerformance, finalizeStabPerformance,
} from '../../renderer/stats/computeStabPerformance';
import {
    createBoonUptimeTimelineAccumulator, ingestLogBoonUptimeTimeline, finalizeBoonUptimeTimeline,
} from '../../renderer/stats/computeBoonUptimeTimeline';

const ALLOWLIST: DivergenceAllowlist = {};

/**
 * These modules expose accumulator triples rather than one-shot functions, so
 * the oracle drives them the way the aggregator does.
 */
const runStab = (logs: any[]) => {
    const acc = createStabPerformanceAccumulator();
    logs.forEach((log) => ingestLogStabPerformance(log, acc));
    return finalizeStabPerformance(acc);
};

const runUptime = (logs: any[]) => {
    const acc = createBoonUptimeTimelineAccumulator();
    logs.forEach((log) => ingestLogBoonUptimeTimeline(log, acc));
    return finalizeBoonUptimeTimeline(acc);
};

describe('boons oracle -- EI shapes vs blocks.boons', () => {
    const { ei, native } = oracleFixture();
    const details = { ...ei, native } as any;
    const log = { filePath: 'fixture', details };
    const squad = native.entities.filter((e: any) => e.role === 'squad');

    it('builds the same boon tables the EI path built', () => {
        const { boonTables } = buildBoonTables([log]);
        expectEqualOrAllowlisted('boonTableIds', 12, boonTables.length, ALLOWLIST);
        expect(boonTables.every((t) => t.rows.length === squad.length)).toBe(true);
    });

    it('matches EI uptime per buff under the intensity/duration rule', () => {
        // The rule, pinned against every buff/player pair rather than a sample:
        // EI's `uptime` is avg_stacks for intensity buffs and uptime_pct for
        // duration ones. 504 pairs on this fixture.
        const byAccount: Record<string, any> = {};
        for (const entity of native.entities) {
            const buffs = native.blocks.boons.by_entity[String(entity.id)];
            if (buffs) byAccount[entity.account] = buffs;
        }
        let compared = 0;
        for (const player of ei.players) {
            const buffs = byAccount[player.account];
            if (!buffs) continue;
            for (const buff of player.buffUptimes ?? []) {
                const entry = buffs[String(buff.id)];
                const eiUptime = buff.buffData?.[0]?.uptime;
                if (!entry || eiUptime == null) continue;
                const stacking = native.catalogs.buffs[String(buff.id)]?.stacking === 'intensity';
                const nativeUptime = stacking ? entry.avg_stacks : entry.uptime_pct;
                expect(Math.abs(Number(eiUptime) - Number(nativeUptime))).toBeLessThan(0.011);
                compared++;
            }
        }
        expect(compared).toBe(504);
    });

    it('resolves every per-source key to a real entity', () => {
        // A name-keyed join silently dropped sources whose names collided.
        let sources = 0;
        for (const entity of squad) {
            const buffs = native.blocks.boons.by_entity[String(entity.id)] ?? {};
            for (const value of Object.values<any>(buffs)) {
                for (const sourceId of Object.keys(value?.per_source?.by_source ?? {})) {
                    expect(native.entities.some((e: any) => e.id === Number(sourceId))).toBe(true);
                    sources++;
                }
            }
        }
        expect(sources).toBeGreaterThan(0);
    });

    it('never lets a condition into the boon path', () => {
        const { boonTables } = buildBoonTables([log]);
        const conditionNames = Object.values<any>(native.catalogs.buffs)
            .filter((b: any) => b.kind === 'condition')
            .map((b: any) => b.name);
        expect(conditionNames.length).toBeGreaterThan(0);
        for (const name of conditionNames) {
            expect(boonTables.some((t) => t.name === name)).toBe(false);
        }
    });

    it('reads no EI buff payload anywhere in the boon path', () => {
        // The only proof nothing fell back: strip EI's buff fields entirely
        // and every number must be unchanged.
        const stripped = {
            ...log,
            details: {
                ...details,
                players: ei.players.map((p: any) => ({
                    ...p,
                    buffUptimes: undefined,
                    buffUptimesActive: undefined,
                    selfBuffs: undefined,
                    groupBuffs: undefined,
                    squadBuffs: undefined,
                    activeTimes: undefined,
                })),
                buffMap: undefined,
            },
        };
        expect(buildBoonTables([stripped])).toEqual(buildBoonTables([log]));
        expect(runStab([stripped])).toEqual(runStab([log]));
        expect(runUptime([stripped])).toEqual(runUptime([log]));
    });

    it('keeps stability stacks within the game cap', () => {
        const stab = runStab([log]);
        expect(stab.fights).toHaveLength(1);
        const players = Object.values(stab.fights[0].players);
        expect(players.length).toBeGreaterThan(0);
        for (const player of players) {
            expect(player.stacks.length).toBe(stab.fights[0].bucketCount);
            for (const value of player.stacks) {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(25);
            }
        }
    });
});
```

Do not weaken an assertion to make it pass — if a shape differs from what is written above, use the real one.

- [ ] **Step 2: Run the oracle**

Run: `npx vitest run src/test/__tests__/boonsNative.oracle.test.ts --maxWorkers=2`
Expected: PASS with an empty allowlist. If a divergence appears, investigate which side is right and add an allowlist entry whose `reason` says so — do not delete the assertion.

- [ ] **Step 3: Run the full suites**

Run: `npm run test:unit -- --maxWorkers=2`
Run: `npm --prefix packages/bridge-metrics run build && npm --prefix packages/bridge-metrics test`
Run: `npm run validate`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/test/__tests__/boonsNative.oracle.test.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "test(boons): pin unit 5a with the equality oracle

Empty allowlist -- 504/504 uptimes, 203/203 generation values and 504/504
states arrays were measured equal before the rewrite.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Record the unit and finish the branch

**Files:**
- Modify: `docs/axilog-cutover-report.md`

- [ ] **Step 1: Write the cutover-report section**

Add a `### Unit 5a — boons, migrated (2026-08-17)` section before "### Other reconstructions", recording: the empty allowlist; the intensity/duration uptime rule and the Might-at-99 failure mode it prevents; that `catalogs.buffs.kind`/`stacking` retire both `BOON_IDS` and the dead `classification` sniffing; that EI's `buffMap` carries zero icons so losing `icon` is parity; the entity-id per-source join replacing the name-keyed one; that `blocks.boons` and `blocks.conditions` are disjoint by role and no condition-on-squad uptime exists natively; and that conditions are deferred to 5b along with the `Crippled`/`Cripple` name mismatch.

- [ ] **Step 2: Commit**

```bash
git add docs/axilog-cutover-report.md
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "docs: record the boons unit and its measured equalities

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Finish the branch**

**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch. Verify tests on the merged result, present the 3-option menu, and wait for the choice. The base branch is `main`.

- [ ] **Step 4: Report the deferred items**

Tell the user, briefly: unit 5b (conditions) is next and needs its own probe-first plan; the `Crippled`/`Cripple` name mismatch is its central trap; and `computeStripSpikesData` stayed on EI because strips live in `blocks.support`, which is unit 6.
