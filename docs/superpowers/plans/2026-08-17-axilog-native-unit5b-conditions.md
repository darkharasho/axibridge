# axilog native unit 5b — Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-source outgoing condition applications, condition damage and condition uptime from axilog's native `blocks.conditions` and `blocks.damage.by_entity[].by_skill` instead of Elite Insights' `targets[].buffs[].statesPerSource` / `players[].totalDamageDist` shapes, and retire `attachConditionMetrics` from the parse path.

**Architecture:** A new shared reader, `nativeConditions.ts`, is the only file that knows `blocks.conditions` shape. `computeOutgoingConditions` keeps its exact return type (`OutgoingConditionsResult`) so every consumer — `computePlayerAggregation`, `StatsView`, `computeCommanderStats` — is untouched. The two halves of the current function map cleanly: the damage half comes from `by_skill` filtered to condition catalog ids, the buff-states half from `blocks.conditions.by_entity[target][buff].per_source.by_source[source]`, keyed by **entity id instead of character name**.

**Tech Stack:** TypeScript, vitest, `@axiapps/axilog` 0.3.6 native container (schema 1.0), `@axiapps/bridge-metrics` workspace package.

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md` (unit 5 in the migration-units table)

## Scope: this is unit 5b of 5

Unit 5a (boons) merged at `f6e75ac0`. This plan is the other half of spec unit 5 and covers `conditionsMetrics.ts` and `attachConditionMetrics`. Do not touch `boonGeneration.ts` or any `nativeBoons.ts` consumer.

Unlike 5a — which was a pure equality port where every number already matched — **this unit changes one displayed number by design.** See "The npc ruling" below.

## Global Constraints

- The native container is **schema 1.0, axilog 0.3.6**. Unit 5b must not require a schema change; if it does, that is a finding to report, not a change to make silently.
- Every unit is pinned by the **equality oracle** (`src/test/axilogOracle.ts`): parse `test-fixtures/axilog/wvw-small.anon.zevtc` both ways at the same axilog version, assert deep equality or an `ALLOWLIST` entry whose `reason` names which side is right.
- Both oracle parses use `{ everything: true }`, never an enumerated option list.
- vitest runs with `--maxWorkers=2` (global CLAUDE.md; this machine runs heavy apps alongside dev work).
- `npm run validate` (typecheck + lint at `--max-warnings 0`) must pass before each commit.
- `packages/bridge-metrics` is consumed via `dist/`, not `src/` — **rebuild it** (`npm --prefix packages/bridge-metrics run build`) after touching it or you get phantom TS2305 errors. Its own tests do not run under `npm run test:unit`; run `npm --prefix packages/bridge-metrics test`.
- Commits are signed via `SSH_AUTH_SOCK="$HOME/.1password/agent.sock"`, never `--no-gpg-sign`, and carry the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Never add a non-anonymized `.zevtc`; only `test-fixtures/axilog/*.anon.zevtc` is un-ignored.

---

## Measured facts this plan rests on

Probed against `test-fixtures/axilog/wvw-small.anon.zevtc` at axilog 0.3.6. Every mapping below was confirmed on real data.

**`coverage.conditions` is `present`.** `blocks.conditions` has exactly one key, `by_entity`.

**`blocks.conditions.by_entity[targetEntityId][buffId]`** — the entry has exactly one field, `per_source`, which has exactly one field, `by_source`. Confirmed across all **420 (entity, buff) pairs**: no `uptime_pct`, no `avg_stacks`, no top-level `states`. Native models conditions purely as *outgoing applications attributed to a source*, which is precisely what the consumer needs — but it means **there is no per-target condition uptime scalar to read**. `uptimeMs` must keep being derived from the state timeline, exactly as `computeUptimeFromStates` does today.

**`per_source.by_source[sourceEntityId]`** — `[[timeMs, stacks], ...]`, the same step-function shape as boons. **Verified: 1158 of 1158 source-state arrays that both sides carry are byte-identical to EI's `targets[].buffs[].statesPerSource[characterName]`, zero diffs.** The EI shim is passing native's own arrays through, so `countAppliedFromStates`, `countActiveStateEntries` and `computeUptimeFromStates` all keep producing identical numbers over identical input.

**`blocks.conditions.by_entity` holds enemy and npc entities only** — 31 `enemy_player` + 15 `npc`, no squad, no friendly. This confirms 5a's finding that `boons.by_entity` and `conditions.by_entity` are disjoint by role. **A condition on a squad member does not exist anywhere in the native container.** No consumer asks for one today; do not add a reader for it.

**The EI↔native entity join is `agent_addr` and `instid`, never `id`.** EI `targets[].id` equals native `entity.agent_addr`; EI `targets[].instanceID` and `players[].instanceID` equal native `entity.instid`. EI's `players[]` has **no `id` field at all** — joining on it silently matches nothing, which is how the first probe of this unit produced a clean-looking zero-diff result over zero comparisons. Use `instid`.

**Enemy entities carry `name`, not `character`.** `entity.character` is `undefined` on every `enemy_player`. Any name-based lookup must read `character ?? name`. This unit does not need one — the native join is by id — but the oracle's cross-check does.

### The condition-name trap is already defused

Native's catalog names differ from axibridge's canonical names on exactly two conditions: **`Crippled`** (canonical `Cripple`) and **`Immobile`** (canonical `Immobilize`). The 5a plan flagged this as 5b's central trap.

It is not a trap, because `CONDITION_NAME_MAP` in `conditionsMetrics.ts:13-38` already carries `['crippled', 'Cripple']` and `['immobile', 'Immobilize']` alongside the canonical spellings. **All 14 native condition catalog names normalize correctly through the existing `getConditionName`:**

| native `catalogs.buffs[id].name` | `getConditionName` → |
|---|---|
| `Blind` (720) | `Blind` |
| `Crippled` (721) | `Cripple` |
| `Chilled` (722) | `Chill` |
| `Poison` (723) | `Poison` |
| `Immobile` (727) | `Immobilize` |
| `Bleeding` (736) | `Bleeding` |
| `Burning` (737) | `Burning` |
| `Vulnerability` (738) | `Vulnerability` |
| `Weakness` (742) | `Weakness` |
| `Fear` (791) | `Fear` |
| `Confusion` (861) | `Confusion` |
| `Torment` (19426) | `Torment` |
| `Slow` (26766) | `Slow` |
| `Taunt` (27705) | `Taunt` |

Task 1 pins this table directly. Do NOT "simplify" `CONDITION_NAME_MAP` down to the native spellings — `normalizeConditionLabel` is also called on user-facing and EI-legacy strings from `StatsView.tsx:27` and `computeCommanderStats.ts:1`.

### The damage half maps on `connected_hits` and `attempt_hits`

`computeOutgoingConditions` reads three numbers per `totalDamageDist` entry: `connectedHits`, `hits` (fallback when `connectedHits` is 0) and `totalDamage`. Against native `blocks.damage.by_entity[eid].by_skill[id]`, restricted to ids whose `catalogs.buffs[id].kind === 'condition'`:

| EI field | native field | result |
|---|---|---|
| `totalDamage` | `total` | **73/73 exact** |
| `connectedHits` | `connected_hits` | **73/73 exact** |
| `hits` | `outcomes.attempt_hits` | **73/73 exact** |
| `hits` | `hits` | **17/73 mismatch — WRONG** |

**Native `hits` is not EI `hits`.** Native splits the concept: `hits` counts landed hits, `outcomes.attempt_hits` counts attempts including `invulned`/`blocked`/`evaded`. EI's `hits` is the attempt count. The 4 condition entries in this fixture with `connected_hits === 0` are exactly the ones that take the fallback path — e.g. a Vulnerability application with `attempt_hits: 1, invulned: 1, total: 0` — and they are the only place the distinction is observable, so a reader that uses native `hits` passes casual inspection and is still wrong.

`getEntitySkillRows` in `nativeDamage.ts:83` returns native `hits` in its `hits` field. **Do not reuse it for this unit** — add `attemptHits` to the new conditions reader instead, and leave `nativeDamage.ts` alone (its own consumers were pinned by unit 4 against native `hits` and must not shift).

### The npc ruling

**`blocks.conditions` covers 15 npc entities that EI's `targets[]` array does not.** EI emits exactly 32 targets, all `enemyPlayer: true, isFake: false`. Native additionally attributes **362 source-state arrays against npc targets** — `Blood Fiend`, `Function Gyro`, `Juvenile Black Bear`, `Juvenile Siege Turtle` and similar: pets and minions.

**Every one of those 362 is sourced from a `squad` entity.** Squad members do not apply conditions to their own pets, so these are enemy-side pets and minions, and the applications are real. EI drops them because its `targets[]` curation is enemy-players-only.

**Ruling: include npc targets.** Native is right; EI is silently discarding roughly a quarter of the squad's condition applications. This is the one number this unit moves, and it moves **up**: `applicationsFromBuffs`, `applicationsFromBuffsActive` and `uptimeMs` all rise for players who condi-cleave onto pets. `applications` and `damage` (the `by_skill` half) do **not** move — they were never per-target.

Cost if wrong: condition-application leaderboards inflate for AoE condition builds relative to previously published reports. Reversible by filtering the reader to `enemy_player` role in one place. Task 1 puts that filter behind a named, documented constant so the reversal is a one-line change, and the oracle carries an explicit `ALLOWLIST` entry rather than a silent pass.

---

## Deliberate non-goals

Named so an implementer does not "improve" them mid-unit and blow up the oracle:

1. **`OutgoingConditionsResult` does not change shape.** Same fields, same optionality, same `meta` counters. Every consumer stays untouched. If a field looks vestigial (`meta.targetBuffEntriesSeen`), leave it.
2. **Do not touch `nativeDamage.ts`.** See the `attempt_hits` note above.
3. **Do not collapse `CONDITION_NAME_MAP`.** It serves non-native callers.
4. **Do not add condition uptime for squad members.** It does not exist in the container and nothing consumes it.
5. **No EI deletion.** `parseFileEi` stays wired; Step N removes it after unit 10.
6. **Do not migrate `computeStripSpikesData.ts`.** Strips belong to unit 6.
7. **Do not change `DEFAULT_CONDITION_ICONS` or `buildConditionIconMap`.** `catalogs.buffs` carries no `icon` field — same as EI's `buffMap`, which has zero icons on all 26 entries. The defaults table is already the real icon source.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/bridge-metrics/src/nativeConditions.ts` (create) | The only file that knows `blocks.conditions` shape. Condition catalog ids/names, per-source application states by target entity, condition damage rows. |
| `packages/bridge-metrics/src/__tests__/nativeConditions.test.ts` (create) | Reader unit tests, including the 14-name normalization table and the `attempt_hits` rule, against the real fixture. |
| `packages/bridge-metrics/src/index.ts` (modify) | Add `export * from './nativeConditions';`. |
| `packages/bridge-metrics/src/conditionsMetrics.ts` (modify) | `computeOutgoingConditions` re-sourced from native. Return type and every helper export unchanged. |
| `src/main/detailsProcessing.ts` (modify) | `attachConditionMetrics` reads `details.native` and drops the `players`/`targets` precondition. |
| `src/test/__tests__/conditionsNative.oracle.test.ts` (create) | The unit's equality oracle, carrying the npc `ALLOWLIST` entry. |
| `docs/axilog-cutover-report.md` (modify) | Record unit 5b's measured findings and the npc ruling. |

---

### Task 1: The native conditions reader

**Files:**
- Create: `packages/bridge-metrics/src/nativeConditions.ts`
- Create: `packages/bridge-metrics/src/__tests__/nativeConditions.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: `entitiesById`, `squadEntities`, `getEntityAccountKey` from `nativeRoster.ts` (unit 1); `getBuffMeta` from `nativeBoons.ts` (unit 5a).
- Produces, for Task 2:
  - `interface NativeConditionApplication { targetEntityId: number; buffId: number; conditionName: string; sourceEntityId: number; states: Array<[number, number]> }`
  - `listConditionIds(details: any): number[]` — every `catalogs.buffs` id whose `kind === 'condition'`, ascending
  - `CONDITION_TARGET_ROLES: readonly EntityRole[]` — the exported, documented constant carrying the npc ruling; `['enemy_player', 'npc']`
  - `listConditionApplications(details: any): NativeConditionApplication[]` — every (target, buff, source) triple whose target role is in `CONDITION_TARGET_ROLES`
  - `interface NativeConditionDamageRow { buffId: number; conditionName: string; skillId: number; damage: number; connectedHits: number; attemptHits: number }`
  - `getEntityConditionDamageRows(details: any, entityId: number): NativeConditionDamageRow[]` — `by_skill` entries whose id is a condition id, carrying `outcomes.attempt_hits` as `attemptHits`

- [ ] **Step 1: Write the failing test**

Create `packages/bridge-metrics/src/__tests__/nativeConditions.test.ts`:

```ts
/**
 * Two rules carry this unit and both are silent when broken.
 *
 * 1. Native names two conditions differently from axibridge's canon —
 *    `Crippled` for `Cripple`, `Immobile` for `Immobilize`. The existing
 *    CONDITION_NAME_MAP already covers both, so this pins the whole 14-name
 *    table rather than trusting that it stays covered.
 * 2. EI's `hits` is native's `outcomes.attempt_hits`, NOT native's `hits`.
 *    Native `hits` matches on 56 of 73 condition rows, so a reader using it
 *    looks correct until it reaches a fully-invulned application.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile } from '@axiapps/axilog';
import {
    CONDITION_TARGET_ROLES,
    getEntityConditionDamageRows,
    listConditionApplications,
    listConditionIds,
} from '../nativeConditions';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');
const details = { native: parseFile(FIXTURE, { everything: true }) };

describe('listConditionIds', () => {
    it('returns every condition in the catalog and no boons', () => {
        expect(listConditionIds(details)).toEqual(
            [720, 721, 722, 723, 727, 736, 737, 738, 742, 791, 861, 19426, 26766, 27705],
        );
    });
});

describe('condition name normalization', () => {
    // The two rows that matter are 721 and 727; the rest are here so a
    // catalog rename anywhere in the set fails loudly.
    it.each([
        [720, 'Blind'], [721, 'Cripple'], [722, 'Chill'], [723, 'Poison'],
        [727, 'Immobilize'], [736, 'Bleeding'], [737, 'Burning'],
        [738, 'Vulnerability'], [742, 'Weakness'], [791, 'Fear'],
        [861, 'Confusion'], [19426, 'Torment'], [26766, 'Slow'], [27705, 'Taunt'],
    ])('maps buff %i to the canonical name %s', (buffId, expected) => {
        const app = listConditionApplications(details).find((a) => a.buffId === buffId);
        expect(app?.conditionName).toBe(expected);
    });
});

describe('listConditionApplications', () => {
    it('covers enemy players and npcs, and never squad or friendly entities', () => {
        expect(CONDITION_TARGET_ROLES).toEqual(['enemy_player', 'npc']);
        const byId = new Map(details.native.entities.map((e: any) => [e.id, e]));
        const roles = new Set(
            listConditionApplications(details).map((a) => byId.get(a.targetEntityId)?.role),
        );
        expect([...roles].sort()).toEqual(['enemy_player', 'npc']);
    });

    it('carries the raw state timeline through untouched', () => {
        const app = listConditionApplications(details).find(
            (a) => a.targetEntityId === 42 && a.buffId === 720 && a.sourceEntityId === 9,
        );
        expect(app?.states).toEqual([[0, 0], [22300, 1], [25300, 0]]);
    });
});

describe('getEntityConditionDamageRows', () => {
    it('reads EI-equivalent hits from outcomes.attempt_hits, not hits', () => {
        // Entity 18 (:Anon104.4848) skill 736 Bleeding: native hits is 62 and
        // attempt_hits is 63; EI reports 63.
        const row = getEntityConditionDamageRows(details, 18).find((r) => r.skillId === 736);
        expect(row).toMatchObject({
            conditionName: 'Bleeding',
            damage: 13782,
            connectedHits: 62,
            attemptHits: 63,
        });
    });

    it('returns condition skills only', () => {
        const ids = new Set(listConditionIds(details));
        for (const row of getEntityConditionDamageRows(details, 18)) {
            expect(ids.has(row.skillId)).toBe(true);
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/bridge-metrics test -- nativeConditions`
Expected: FAIL — `Cannot find module '../nativeConditions'`.

- [ ] **Step 3: Write the reader**

Create `packages/bridge-metrics/src/nativeConditions.ts`:

```ts
import { getBuffMeta } from './nativeBoons';
import { entitiesById, type EntityRole } from './nativeRoster';
import { normalizeConditionLabel } from './conditionsMetrics';

/**
 * Which target roles count as somewhere a condition can be applied.
 *
 * Elite Insights curates `targets[]` down to enemy players, so every
 * condition a squad member landed on an enemy pet or minion — Blood Fiends,
 * Juvenile pets, Function Gyros — was dropped on the floor. Native attributes
 * them, and on the reference fixture they are 362 of 1520 source-state
 * arrays, all sourced from squad entities.
 *
 * Including them is the ruling recorded in the unit 5b plan. Dropping
 * 'npc' here is the one-line reversal if published leaderboards need to
 * match pre-migration numbers.
 */
export const CONDITION_TARGET_ROLES: readonly EntityRole[] = ['enemy_player', 'npc'];

export interface NativeConditionApplication {
    targetEntityId: number;
    buffId: number;
    conditionName: string;
    sourceEntityId: number;
    states: Array<[number, number]>;
}

export interface NativeConditionDamageRow {
    buffId: number;
    conditionName: string;
    skillId: number;
    damage: number;
    connectedHits: number;
    /**
     * EI's `totalDamageDist[].hits`. Native splits the concept: `hits` counts
     * landed hits while `outcomes.attempt_hits` counts attempts including
     * invulned/blocked/evaded. EI reports the attempt count, and the two agree
     * on all but the fully-mitigated rows — so reading native `hits` here is
     * wrong in exactly the cases the consumer's fallback path exists for.
     */
    attemptHits: number;
}

const nativeOf = (details: any): any => details?.native ?? null;

export const listConditionIds = (details: any): number[] => {
    const buffs = nativeOf(details)?.catalogs?.buffs ?? {};
    return Object.entries<any>(buffs)
        .filter(([, meta]) => meta?.kind === 'condition')
        .map(([id]) => Number(id))
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b);
};

export const listConditionApplications = (details: any): NativeConditionApplication[] => {
    const native = nativeOf(details);
    const byEntity = native?.blocks?.conditions?.by_entity;
    if (!byEntity) return [];

    const roles = entitiesById(native);
    const allowed = new Set<EntityRole>(CONDITION_TARGET_ROLES);
    const out: NativeConditionApplication[] = [];

    for (const [targetId, buffs] of Object.entries<any>(byEntity)) {
        const target = roles.get(Number(targetId));
        if (!target || !allowed.has(target.role)) continue;
        for (const [buffId, entry] of Object.entries<any>(buffs ?? {})) {
            const conditionName = normalizeConditionLabel(
                getBuffMeta(details, buffId)?.name,
            );
            if (!conditionName) continue;
            for (const [sourceId, states] of Object.entries<any>(entry?.per_source?.by_source ?? {})) {
                if (!Array.isArray(states)) continue;
                out.push({
                    targetEntityId: Number(targetId),
                    buffId: Number(buffId),
                    conditionName,
                    sourceEntityId: Number(sourceId),
                    states: states as Array<[number, number]>,
                });
            }
        }
    }
    return out;
};

export const getEntityConditionDamageRows = (
    details: any,
    entityId: number,
): NativeConditionDamageRow[] => {
    const bySkill = nativeOf(details)?.blocks?.damage?.by_entity?.[String(entityId)]?.by_skill ?? {};
    const conditionIds = new Set(listConditionIds(details));
    const out: NativeConditionDamageRow[] = [];

    for (const [skillId, row] of Object.entries<any>(bySkill)) {
        const id = Number(skillId);
        if (!conditionIds.has(id)) continue;
        const conditionName = normalizeConditionLabel(getBuffMeta(details, id)?.name);
        if (!conditionName) continue;
        out.push({
            buffId: id,
            conditionName,
            skillId: id,
            damage: Number(row?.total ?? 0),
            connectedHits: Number(row?.connected_hits ?? 0),
            attemptHits: Number(row?.outcomes?.attempt_hits ?? 0),
        });
    }
    return out;
};
```

- [ ] **Step 4: Export it and rebuild**

Add to `packages/bridge-metrics/src/index.ts`, in the existing alphabetical run of native exports:

```ts
export * from './nativeConditions';
```

Run: `npm --prefix packages/bridge-metrics run build`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix packages/bridge-metrics test -- nativeConditions`
Expected: PASS, 5 cases (the `it.each` counts as 14).

- [ ] **Step 6: Commit**

```bash
git add packages/bridge-metrics/src/nativeConditions.ts \
        packages/bridge-metrics/src/__tests__/nativeConditions.test.ts \
        packages/bridge-metrics/src/index.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(conditions): read applications and condition damage from native

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Re-source `computeOutgoingConditions`

**Files:**
- Modify: `packages/bridge-metrics/src/conditionsMetrics.ts:207-361`
- Modify: `packages/bridge-metrics/src/__tests__/conditionsMetrics.test.ts` (if present; otherwise create)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `computeOutgoingConditions(payload: { details: any; getPlayerKey?: GetPlayerKey }): OutgoingConditionsResult` — **the return type is unchanged**; only the input changes from `{ players, targets, skillMap, buffMap }` to `{ details }`.

The three counting helpers — `countAppliedFromStates`, `countActiveStateEntries`, `computeUptimeFromStates` (`conditionsMetrics.ts:157-205`) — are **unchanged and still load-bearing**. Native carries no condition uptime scalar, so `uptimeMs` stays derived. Their input arrays are byte-identical to what they receive today, so their output is too.

The player key comes from `getEntityAccountKey(entity)` rather than the `nameToKey` character-name join. This is the join that genuinely improves: axilog emits one entity per agent instance, so character names are not unique (see the `ei-duplicate-player-entries` finding), while entity ids are.

- [ ] **Step 1: Write the failing test**

Add to `packages/bridge-metrics/src/__tests__/conditionsMetrics.test.ts`:

```ts
/**
 * The summary/playerConditions shape is consumed by computePlayerAggregation,
 * StatsView and computeCommanderStats without a schema between them, so this
 * pins the contract rather than the numbers — the oracle pins the numbers.
 */
it('produces the same result shape from a native container', () => {
    const details = { native: parseFile(FIXTURE, { everything: true }) };
    const result = computeOutgoingConditions({ details });

    expect(Object.keys(result).sort()).toEqual(['meta', 'playerConditions', 'summary']);
    expect(Object.keys(result.summary).length).toBeGreaterThan(0);

    const bleeding = result.summary.Bleeding;
    expect(bleeding.name).toBe('Bleeding');
    expect(bleeding.damage).toBeGreaterThan(0);
    expect(bleeding.applications).toBeGreaterThan(0);
    expect(bleeding.applicationsFromBuffs).toBeGreaterThan(0);
    expect(bleeding.uptimeMs).toBeGreaterThan(0);

    // Keys are account ids, not character names.
    for (const key of Object.keys(result.playerConditions)) {
        expect(key).toMatch(/^:?[^:]+\.\d{4}$/);
    }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix packages/bridge-metrics test -- conditionsMetrics`
Expected: FAIL — `computeOutgoingConditions` still destructures `players`/`targets` and returns empty structures for a `{ details }` payload.

- [ ] **Step 3: Rewrite the function body**

Replace `computeOutgoingConditions` (`conditionsMetrics.ts:207-361`). Keep `NON_DAMAGING_CONDITIONS`, `CONDITION_NAME_MAP`, `DEFAULT_CONDITION_ICONS`, `getDefaultConditionIcon`, `resolveBuffMetaById`, `getConditionName`, `normalizeConditionLabel`, `buildConditionIconMap`, `resolveConditionNameFromEntry` and all three state helpers exactly as they are.

```ts
export const computeOutgoingConditions = (payload: {
    details: any;
    getPlayerKey?: GetPlayerKey;
}): OutgoingConditionsResult => {
    const { details } = payload;
    const native = details?.native;
    const conditionIconMap = buildConditionIconMap(undefined);

    const playerConditions: Record<string, PlayerConditionTotals> = {};
    const summary: Record<string, OutgoingConditionSummaryEntry> = {};
    if (!native) return { playerConditions, summary, meta: { buffStateApplicationsTotal: 0, targetBuffEntriesSeen: 0, buffStateSourcesSeen: 0 } };

    const keyOf = new Map<number, string>();
    for (const entity of squadEntities(native)) {
        const key = payload.getPlayerKey
            ? payload.getPlayerKey(entity)
            : getEntityAccountKey(entity);
        if (key) keyOf.set(entity.id, key);
    }

    // --- damage half: by_skill, condition ids only ---
    for (const [entityId, key] of keyOf) {
        playerConditions[key] = playerConditions[key] || {};
        for (const row of getEntityConditionDamageRows(details, entityId)) {
            const conditionName = row.conditionName;
            const icon = conditionIconMap.get(conditionName);
            const hits = row.connectedHits > 0 ? row.connectedHits : row.attemptHits;

            const existing = summary[conditionName] || { name: conditionName, icon, applications: 0, damage: 0 };
            existing.applications += hits;
            existing.damage += row.damage;
            if (!existing.icon && icon) existing.icon = icon;
            summary[conditionName] = existing;

            const totals = playerConditions[key][conditionName] || { icon, applications: 0, damage: 0, skills: {} };
            totals.applications += hits;
            totals.damage += row.damage;
            const skillEntry = totals.skills[conditionName] || { name: conditionName, hits: 0, damage: 0, icon };
            skillEntry.hits += hits;
            skillEntry.damage += row.damage;
            totals.skills[conditionName] = skillEntry;
            if (!totals.icon && icon) totals.icon = icon;
            playerConditions[key][conditionName] = totals;
        }
    }

    // --- states half: blocks.conditions, source-attributed ---
    let buffStateApplicationsTotal = 0;
    let buffStateSourcesSeen = 0;
    const targetBuffPairs = new Set<string>();

    for (const app of listConditionApplications(details)) {
        const key = keyOf.get(app.sourceEntityId);
        if (!key) continue;
        targetBuffPairs.add(`${app.targetEntityId}:${app.buffId}`);
        buffStateSourcesSeen += 1;

        const appliedCounts = countAppliedFromStates(app.states);
        const activeCounts = countActiveStateEntries(app.states);
        const uptimeMs = computeUptimeFromStates(app.states);
        buffStateApplicationsTotal += appliedCounts;

        playerConditions[key] = playerConditions[key] || {};
        const totals = playerConditions[key][app.conditionName] || { applications: 0, damage: 0, skills: {} };
        totals.applicationsFromBuffs = (totals.applicationsFromBuffs || 0) + appliedCounts;
        totals.applicationsFromBuffsActive = (totals.applicationsFromBuffsActive || 0) + activeCounts;
        totals.uptimeMs = (totals.uptimeMs || 0) + uptimeMs;
        playerConditions[key][app.conditionName] = totals;

        const overall = summary[app.conditionName] || { name: app.conditionName, applications: 0, damage: 0 };
        overall.applicationsFromBuffs = (overall.applicationsFromBuffs || 0) + appliedCounts;
        overall.applicationsFromBuffsActive = (overall.applicationsFromBuffsActive || 0) + activeCounts;
        overall.uptimeMs = (overall.uptimeMs || 0) + uptimeMs;
        summary[app.conditionName] = overall;
    }

    return {
        playerConditions,
        summary,
        meta: {
            buffStateApplicationsTotal,
            targetBuffEntriesSeen: targetBuffPairs.size,
            buffStateSourcesSeen,
        },
    };
};
```

Add the imports at the top of the file:

```ts
import { getEntityAccountKey, squadEntities } from './nativeRoster';
import { getEntityConditionDamageRows, listConditionApplications } from './nativeConditions';
```

**Circular-import check:** `nativeConditions.ts` imports `normalizeConditionLabel` from `conditionsMetrics.ts`, and this change makes `conditionsMetrics.ts` import from `nativeConditions.ts`. That cycle is real. Break it by moving `CONDITION_NAME_MAP` and `getConditionName`/`normalizeConditionLabel` into a new leaf module `conditionNames.ts` that both import, and re-export `normalizeConditionLabel` from `conditionsMetrics.ts` so its existing consumers (`StatsView.tsx:27`, `computeCommanderStats.ts:1`) do not move. Do this as part of this step, not as a follow-up.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/bridge-metrics run build && npm --prefix packages/bridge-metrics test -- conditionsMetrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bridge-metrics/src/conditionsMetrics.ts \
        packages/bridge-metrics/src/conditionNames.ts \
        packages/bridge-metrics/src/__tests__/conditionsMetrics.test.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "refactor(conditions): compute outgoing conditions from the native container

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Rewire `attachConditionMetrics`

**Files:**
- Modify: `src/main/detailsProcessing.ts:310-330`
- Modify: `src/main/__tests__/detailsProcessing.test.ts`

**Interfaces:**
- Consumes: the new `computeOutgoingConditions({ details })` signature from Task 2.
- Produces: nothing downstream; the four call sites (`src/main/index.ts:492,621,822`, `src/main/handlers/reparseHandlers.ts:93`) keep calling `attachConditionMetrics(details)` unchanged.

The current guard is `if (!players.length || !targets.length) return details;`. **`targets` is the wrong precondition now** — a native container has no `targets` array, so leaving the guard in place makes this a silent no-op on every migrated log. Replace it with a `details.native` check.

- [ ] **Step 1: Write the failing test**

```ts
it('attaches metrics from a native container with no EI targets array', () => {
    const details: any = { native: parseFile(FIXTURE, { everything: true }) };
    attachConditionMetrics(details);
    expect(Object.keys(details.conditionMetrics.summary).length).toBeGreaterThan(0);
});

it('leaves an EI-only payload alone rather than half-filling it', () => {
    const details: any = { players: [{ account: 'a' }], targets: [{ buffs: [] }] };
    attachConditionMetrics(details);
    expect(details.conditionMetrics).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/main/__tests__/detailsProcessing.test.ts --maxWorkers=2`
Expected: FAIL on the first case — the `targets` guard returns early.

- [ ] **Step 3: Rewrite the guard**

```ts
export const attachConditionMetrics = (details: any): any => {
    if (!details || details.conditionMetrics) return details;
    // Conditions come from `blocks.conditions`; a log parsed before the native
    // migration has no container and no condition metrics to attach. The
    // coverage banner and the whole-history re-parse in Settings are how those
    // logs get one — do not try to synthesize it from the EI shape here.
    if (!details.native) return details;
    try {
        details.conditionMetrics = computeOutgoingConditions({ details });
    } catch (err: any) {
        console.warn('[Main] Condition metrics failed:', err?.message || err);
    }
    return details;
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/main/__tests__/detailsProcessing.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/detailsProcessing.ts src/main/__tests__/detailsProcessing.test.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "fix(conditions): gate metric attachment on the native container, not EI targets

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The equality oracle

**Files:**
- Create: `src/test/__tests__/conditionsNative.oracle.test.ts`

This is the gate that says the unit changed only what the npc ruling says it changed. It parses the fixture both ways, runs the *old* EI-shaped computation against `parseFileEi` output and the *new* native computation against `parseFile` output, and compares.

- [ ] **Step 1: Write the oracle**

```ts
/**
 * Unit 5b's equality oracle.
 *
 * `damage` and `applications` come from by_skill and must match EI exactly.
 * `applicationsFromBuffs`, `applicationsFromBuffsActive` and `uptimeMs` are
 * expected to be HIGHER than EI's, and only higher: native attributes
 * conditions landed on enemy pets and minions, which EI's enemy-players-only
 * `targets[]` curation drops. That is the allowlisted difference.
 */
import { describe, expect, it } from 'vitest';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { FIXTURE_PATH } from '../axilogOracle';
import { computeOutgoingConditions } from '@axiapps/bridge-metrics';
import { computeOutgoingConditionsEi } from '../legacy/conditionsMetricsEi';

const ALLOWLIST = [
    {
        field: 'applicationsFromBuffs | applicationsFromBuffsActive | uptimeMs',
        reason:
            'Native is right. EI curates targets[] to enemy players only, so '
            + 'conditions applied to enemy pets and minions (362 of 1520 '
            + 'source-state arrays on this fixture, all sourced from squad '
            + 'entities) are dropped. Native counts them. Direction is pinned '
            + 'below: native >= EI, never lower.',
    },
];

describe('unit 5b conditions oracle', () => {
    const native = computeOutgoingConditions({ details: { native: parseFile(FIXTURE_PATH, { everything: true }) } });
    const eiJson = parseFileEi(FIXTURE_PATH, { everything: true });
    const ei = computeOutgoingConditionsEi({
        players: eiJson.players, targets: eiJson.targets,
        skillMap: eiJson.skillMap, buffMap: eiJson.buffMap,
    });

    it('reports the same conditions', () => {
        expect(Object.keys(native.summary).sort()).toEqual(Object.keys(ei.summary).sort());
    });

    it('matches EI exactly on condition damage and by-skill applications', () => {
        for (const [name, row] of Object.entries(native.summary)) {
            expect([name, row.damage]).toEqual([name, ei.summary[name].damage]);
            expect([name, row.applications]).toEqual([name, ei.summary[name].applications]);
        }
    });

    it('is at least EI on the buff-state fields, never below (see ALLOWLIST)', () => {
        expect(ALLOWLIST).toHaveLength(1);
        for (const [name, row] of Object.entries(native.summary)) {
            expect([name, (row.uptimeMs ?? 0) >= (ei.summary[name].uptimeMs ?? 0)]).toEqual([name, true]);
            expect([name, (row.applicationsFromBuffs ?? 0) >= (ei.summary[name].applicationsFromBuffs ?? 0)]).toEqual([name, true]);
        }
    });
});
```

**Note for the implementer:** Task 2 replaces `computeOutgoingConditions` in place, so the oracle needs the pre-migration EI implementation to compare against. Copy it verbatim to `src/test/legacy/conditionsMetricsEi.ts` as `computeOutgoingConditionsEi` in Task 4 Step 1, sourced from `git show HEAD~2:packages/bridge-metrics/src/conditionsMetrics.ts`. It is test-only, never exported from the package, and is deleted at Step N with the rest of the EI path.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/test/__tests__/conditionsNative.oracle.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 3: Full suite + validate**

```bash
npm run validate
npx vitest run --maxWorkers=2
npm --prefix packages/bridge-metrics test
```

- [ ] **Step 4: Commit**

```bash
git add src/test/__tests__/conditionsNative.oracle.test.ts src/test/legacy/conditionsMetricsEi.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "test(conditions): pin unit 5b against the equality oracle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Record the findings

**Files:**
- Modify: `docs/axilog-cutover-report.md`

- [ ] **Step 1: Append a unit 5b section**

Record, at minimum: the `per_source.by_source` shape and its 1158/1158 state equality; the absence of any condition uptime scalar; the `instid`/`agent_addr` join and the zero-comparison trap; the `attempt_hits` rule and its 17/73 counterexample; the 14-name normalization table; and the npc ruling with its 362/1520 magnitude and its one-line reversal.

- [ ] **Step 2: Commit**

```bash
git add docs/axilog-cutover-report.md
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "docs(conditions): record unit 5b's measured findings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Spec unit 5 lists five modules: four boons (5a, merged) and `conditionsMetrics.ts` plus `attachConditionMetrics` (Tasks 2 and 3 here). Covered.

**Type consistency.** `NativeConditionApplication.conditionName` and `NativeConditionDamageRow.conditionName` are both post-normalization canonical names, so Task 2 never re-normalizes. `CONDITION_TARGET_ROLES` is typed `readonly EntityRole[]` against the `EntityRole` union already exported from `nativeRoster.ts`.

**Known risk carried forward.** The circular import between `conditionsMetrics.ts` and `nativeConditions.ts` is real and is resolved inside Task 2 Step 3 rather than deferred; an implementer who skips the `conditionNames.ts` extraction will get a runtime `undefined` from `normalizeConditionLabel` at module-init time, not a compile error.
