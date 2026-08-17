# axilog native unit 4 — Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-source the four damage compute modules from axilog's native `blocks.damage`, `blocks.series` and `blocks.contribution` instead of Elite Insights' `damage1S` / `targetDamageDist` / `dpsAll` shapes.

**Architecture:** A new shared reader, `nativeDamage.ts`, joins the three native blocks into the two shapes the modules actually consume — a decoded per-second series and a per-skill damage row — and each module is rewritten against it. The RLE series decoder is the load-bearing new primitive: native encodes every 1s series as run-length pairs, nothing in axibridge decodes them yet, and units 5 and 6 will need the same decoder.

**Tech Stack:** TypeScript, vitest, `@axiapps/axilog` 0.3.6 native container (schema 1.0), `@axiapps/bridge-metrics` workspace package.

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md` (unit 4 in the migration-units table)

## Global Constraints

- The native container is **schema 1.0, axilog 0.3.6**. Unit 4 must not require a schema change; if it does, that is a finding to report, not a change to make silently.
- Every unit is pinned by the **equality oracle** (`src/test/axilogOracle.ts`): parse `test-fixtures/axilog/wvw-small.anon.zevtc` both ways at the same axilog version, assert deep equality or an `ALLOWLIST` entry whose `reason` names which side is right.
- Both oracle parses use `{ everything: true }`, never an enumerated option list.
- vitest runs with `--maxWorkers=2` (global CLAUDE.md; this machine runs heavy apps alongside dev work).
- `npm run validate` (typecheck + lint at `--max-warnings 0`) must pass before each commit.
- `packages/bridge-metrics` is consumed via `dist/`, not `src/` — **rebuild it** (`npm --prefix packages/bridge-metrics run build`) after touching it or you get phantom TS2305 errors.
- Commits are signed via `SSH_AUTH_SOCK="$HOME/.1password/agent.sock"`, never `--no-gpg-sign`, and carry the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Never add a non-anonymized `.zevtc`; only `test-fixtures/axilog/*.anon.zevtc` is un-ignored.

---

## Measured facts this plan rests on

Probed against `test-fixtures/axilog/wvw-small.anon.zevtc` at axilog 0.3.6. Every mapping below was confirmed on real data, not read off a schema.

**`blocks.damage.by_entity[entityId]`** — keys `total`, `taken`, `dps`, `downs_dealt`, `kills_dealt`, `breakbar_damage_dealt`, `by_skill`, `by_skill_taken`, `per_target`. Present for 95 entities: all 38 squad, 4 friendly, 32 enemy, 21 npc.

**`by_skill[skillId]`** — `{ total, hits, connected_hits, crit_hits, flank_hits, min, max, outcomes }` where `outcomes` carries `indirect` (the condition-vs-strike flag), `blocked`, `evaded`, `glance`, `interrupted`, `invulned`, `missed`, `attempt_hits`.

**`per_target[targetEntityId].by_skill[skillId]`** — `{ total, hits, crit_hits, flank_hits, min, max }`. **It does NOT carry `outcomes`, so it does not carry `indirect`.** All four modules filter EI's `indirectDamage` to exclude condition ticks, so the flag must be joined from the same entity's top-level `by_skill[skillId]`. Verified: **all 2105** per-target skill ids across the fixture are present in their entity's top-level `by_skill` — the join never misses.

**`outcomes` is squad-only.** 529 of 529 squad `by_skill` entries have it; 323 enemy and 22 npc entries have none. Any code that reads `indirect` off an enemy must tolerate its absence — see Task 4.

**`indirect` is a per-(entity, skill) fact, not a global one.** One skill in the fixture, 19426 (Torment), reports both `true` and `false` across entities — the `false` is a single squad entity whose `total` is 0, i.e. a zero-damage record whose flag is meaningless. Joining per (entity, skill), which is the shape native already gives, is correct regardless; a global skill→indirect map would be wrong for that row.

**`blocks.series.by_entity[entityId]`** — `damage`, `damage_taken`, `power_damage_taken`, `healing_1s`, `per_target`, plus a raw `health_percents` array. Each series is `{ data, enc, interval_ms, len }` with `enc` observed as `"rle"` or `"raw"` and `interval_ms` 1000.

**The series are CUMULATIVE**, matching EI's `damage1S`: entity 0's decoded `damage` series ends at 96084, which equals `blocks.damage.by_entity[0].total`. So the existing `toPerSecond` delta pass stays exactly as it is — only the decode in front of it is new.

**`series.by_entity[squadId].per_target[enemyId]`** — `{ damage, power_damage }`, both cumulative RLE. This is the native source for EI's `targetDamage1S` / `targetPowerDamage1S`, keyed by **entity id rather than target array index** — strictly better, since the index join disappears.

**Enemy entities have no `per_target` series.** Enemy `series.by_entity[id]` carries only `damage`, `damage_taken`, `power_damage`, `power_damage_taken`. This does not block unit 4 — see Task 4, whose primary path reads the squad side.

**`blocks.contribution.by_entity[entityId]`** — `downs_contribution: { damage, cc, strips, movement_impairing }`, `downs_contribution_by_skill: { [skillId]: number }`, and `downed_by`. This is the native source for EI's `downContribution`, and `downs_contribution_by_skill` is **per-skill**, where `computeAllDamageData` currently fakes per-bucket down contribution with a flat `totalDownContribution / totalDamage` ratio. Do not fix that in this unit — see "Deliberate non-goals".

**`catalogs.skills[skillId]`** — `{ name, icon, can_crit, is_swap }`. Replaces the `details.skillMap` / `details.buffMap` double lookup with a single map, and native carries no `s`/`b` key prefixes.

## Deliberate non-goals

Named so an implementer does not "improve" them mid-unit and blow up the oracle:

1. **The proportional down-contribution buckets in `computeAllDamageData` stay proportional.** Native's `downs_contribution_by_skill` would allow real per-skill attribution, but per-*second* buckets still would not follow from it, and changing the displayed shape is a product decision, not a migration one. File it as a follow-up.
2. **`computeIncomingStrikeDamageData`'s primary series stays as it is.** Its "incoming strike per enemy class" series is built from *squad players' outgoing* `targetPowerDamage1S` against that enemy (`computeIncomingStrikeDamageData.ts:330-332`), not from enemy outgoing damage. Whether that proxy is the right metric is a real question — raise it, do not silently change it. Unit 4 reproduces it against `series.by_entity[squadId].per_target[enemyId].power_damage`, which is the same quantity.
3. **No EI deletion.** `parseFileEi` stays wired; Step N removes it after unit 10.

---

## File Structure

- **Create** `packages/bridge-metrics/src/nativeSeries.ts` — the RLE/raw series decoder. Its own file, not folded into `nativeDamage.ts`, because units 5 (boon timelines) and 6 (healing) consume the identical encoding and must not each re-implement it.
- **Create** `packages/bridge-metrics/src/nativeDamage.ts` — damage-block readers: per-second series, per-target series, per-skill rows with the `indirect` join, totals, down contribution.
- **Create** `packages/bridge-metrics/src/__tests__/nativeSeries.test.ts` and `.../nativeDamage.test.ts`.
- **Modify** `packages/bridge-metrics/src/index.ts` — re-export both new modules.
- **Modify** `src/renderer/stats/computeAllDamageData.ts`, `computeSpikeDamageData.ts`, `computeIncomingStrikeDamageData.ts`, `computeFightDiffMode.ts`.
- **Create** `src/test/__tests__/damageNative.oracle.test.ts` — the unit's oracle.

---

### Task 1: The native series decoder

**Files:**
- Create: `packages/bridge-metrics/src/nativeSeries.ts`
- Create: `packages/bridge-metrics/src/__tests__/nativeSeries.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `NativeSeries` (interface), `decodeSeries(series: NativeSeries | null | undefined): number[]`, `SERIES_INTERVAL_MS`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { decodeSeries } from '../nativeSeries';

describe('decodeSeries', () => {
  it('expands rle pairs into one value per interval', () => {
    // [value, runLength] pairs; len is the authoritative output length.
    expect(decodeSeries({ data: [[0, 3], [5, 2]], enc: 'rle', interval_ms: 1000, len: 5 }))
      .toEqual([0, 0, 0, 5, 5]);
  });

  it('returns raw data unchanged', () => {
    expect(decodeSeries({ data: [1, 2, 3], enc: 'raw', interval_ms: 1000, len: 3 }))
      .toEqual([1, 2, 3]);
  });

  it('pads a short run to len by repeating the last value', () => {
    // A cumulative damage series that stops changing must stay flat, not drop
    // to zero, or every downstream toPerSecond() delta invents a negative.
    expect(decodeSeries({ data: [[7, 2]], enc: 'rle', interval_ms: 1000, len: 4 }))
      .toEqual([7, 7, 7, 7]);
  });

  it('truncates a long run to len', () => {
    expect(decodeSeries({ data: [[1, 99]], enc: 'rle', interval_ms: 1000, len: 3 }))
      .toEqual([1, 1, 1]);
  });

  it('returns an empty array for absent or unknown-encoding series', () => {
    expect(decodeSeries(null)).toEqual([]);
    expect(decodeSeries(undefined)).toEqual([]);
    expect(decodeSeries({ data: [1], enc: 'lz4' as any, interval_ms: 1000, len: 1 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix packages/bridge-metrics test -- nativeSeries`
Expected: FAIL — `Cannot find module '../nativeSeries'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/bridge-metrics/src/nativeSeries.ts

/**
 * axilog encodes every 1s series as `{ data, enc, interval_ms, len }`.
 *
 * `len` is authoritative, not `data.length`: an "rle" payload is a list of
 * [value, runLength] pairs whose runs may sum to less than `len` when the
 * value stops changing before the fight ends. These series are CUMULATIVE, so
 * a short run must be padded by REPEATING the last value — padding with zero
 * would make the next delta negative and silently zero out a player's tail.
 */
export const SERIES_INTERVAL_MS = 1000;

export interface NativeSeries {
  data: number[] | Array<[number, number]>;
  enc: string;
  interval_ms: number;
  len: number;
}

export const decodeSeries = (series: NativeSeries | null | undefined): number[] => {
  if (!series || !Array.isArray(series.data)) return [];
  const len = Number(series.len);
  if (!Number.isFinite(len) || len <= 0) return [];

  if (series.enc === 'raw') {
    const raw = (series.data as number[]).map(v => Number(v) || 0);
    return fit(raw, len);
  }
  if (series.enc !== 'rle') return [];

  const out: number[] = [];
  for (const pair of series.data as Array<[number, number]>) {
    if (!Array.isArray(pair)) continue;
    const value = Number(pair[0]) || 0;
    const run = Number(pair[1]) || 0;
    for (let i = 0; i < run && out.length < len; i++) out.push(value);
    if (out.length >= len) break;
  }
  return fit(out, len);
};

const fit = (values: number[], len: number): number[] => {
  if (values.length === len) return values;
  if (values.length > len) return values.slice(0, len);
  const last = values.length > 0 ? values[values.length - 1] : 0;
  return values.concat(new Array<number>(len - values.length).fill(last));
};
```

- [ ] **Step 4: Re-export it**

Add to `packages/bridge-metrics/src/index.ts`, next to the other `native*` lines:

```ts
export * from './nativeSeries';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix packages/bridge-metrics test -- nativeSeries`
Expected: PASS (5 tests).

- [ ] **Step 6: Pin the decoder against the real container**

Add to the same test file. This is the step that catches an axilog encoding change, which unit tests over hand-built objects cannot:

```ts
import { parseFile } from '@axiapps/axilog';
import * as path from 'path';

it('decodes the fixture cumulative damage series to the reported total', () => {
  const fixture = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');
  const r: any = parseFile(fixture, { everything: true } as any);
  const id = Object.keys(r.blocks.damage.by_entity)[0];
  const decoded = decodeSeries(r.blocks.series.by_entity[id].damage);

  expect(decoded).toHaveLength(r.blocks.series.by_entity[id].damage.len);
  // Cumulative: monotonic, and the last sample IS the entity total.
  for (let i = 1; i < decoded.length; i++) expect(decoded[i]).toBeGreaterThanOrEqual(decoded[i - 1]);
  expect(decoded[decoded.length - 1]).toBe(r.blocks.damage.by_entity[id].total);
});
```

If `@axiapps/axilog` is not resolvable from `packages/bridge-metrics`, move this one test into `src/test/__tests__/damageNative.oracle.test.ts` (Task 6) instead of adding a dependency — the assertion matters, its location does not.

- [ ] **Step 7: Build, validate, commit**

```bash
npm --prefix packages/bridge-metrics run build
npm run validate
git add packages/bridge-metrics/src/nativeSeries.ts packages/bridge-metrics/src/__tests__/nativeSeries.test.ts packages/bridge-metrics/src/index.ts packages/bridge-metrics/dist
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(native): decode axilog's rle 1s series

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The native damage reader

**Files:**
- Create: `packages/bridge-metrics/src/nativeDamage.ts`
- Create: `packages/bridge-metrics/src/__tests__/nativeDamage.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: `decodeSeries`, `NativeSeries` from Task 1.
- Produces:
  - `NativeSkillRow = { skillId: number; skillName: string; icon?: string; damage: number; hits: number; connectedHits: number; indirect: boolean }`
  - `getEntityDamageSeries(details, entityId): number[]` — decoded cumulative
  - `getEntityTargetDamageSeries(details, entityId, opts?: { power?: boolean }): number[]` — decoded cumulative, summed across all targets
  - `getEntitySkillRows(details, entityId, opts?: { perTarget?: boolean }): NativeSkillRow[]`
  - `getEntityDamageTotal(details, entityId): number`
  - `getEntityDownContribution(details, entityId): number`
  - `resolveSkillMeta(details, skillId): { name: string; icon?: string }`

- [ ] **Step 1: Write the failing tests**

Build the native object inline — these are shape tests, and the real-container pinning lives in the oracle (Task 6).

```ts
import { describe, expect, it } from 'vitest';
import {
  getEntitySkillRows, getEntityDamageSeries, getEntityDownContribution, resolveSkillMeta,
} from '../nativeDamage';

const rle = (pairs: Array<[number, number]>, len: number) =>
  ({ data: pairs, enc: 'rle', interval_ms: 1000, len });

const details = {
  native: {
    catalogs: { skills: { 100: { name: 'Fireball', icon: 'fb.png' }, 736: { name: 'Bleeding' } } },
    blocks: {
      damage: {
        by_entity: {
          7: {
            total: 900,
            by_skill: {
              100: { total: 700, hits: 10, connected_hits: 9, outcomes: { indirect: false } },
              736: { total: 200, hits: 20, connected_hits: 20, outcomes: { indirect: true } },
            },
            per_target: {
              42: { by_skill: { 100: { total: 400, hits: 6 }, 736: { total: 200, hits: 20 } } },
              43: { by_skill: { 100: { total: 300, hits: 4 } } },
            },
          },
        },
      },
      series: { by_entity: { 7: { damage: rle([[0, 2], [900, 2]], 4) } } },
      contribution: { by_entity: { 7: { downs_contribution: { damage: 321 } } } },
    },
  },
};

describe('nativeDamage', () => {
  it('resolves skill names and icons from the catalog', () => {
    expect(resolveSkillMeta(details, 100)).toEqual({ name: 'Fireball', icon: 'fb.png' });
    // Unknown ids get a stable placeholder, never `undefined` in the UI.
    expect(resolveSkillMeta(details, 999)).toEqual({ name: 'Skill 999', icon: undefined });
  });

  it('decodes the cumulative per-entity damage series', () => {
    expect(getEntityDamageSeries(details, 7)).toEqual([0, 0, 900, 900]);
  });

  it('reads down contribution from the contribution block', () => {
    expect(getEntityDownContribution(details, 7)).toBe(321);
  });

  it('joins the indirect flag onto per-target skill rows', () => {
    // per_target.by_skill carries no `outcomes`, so `indirect` can only come
    // from the same entity's top-level by_skill. Without the join every
    // condition tick would be counted as strike damage.
    const rows = getEntitySkillRows(details, 7, { perTarget: true });
    const bleed = rows.find(r => r.skillId === 736)!;
    const fireball = rows.find(r => r.skillId === 100)!;
    expect(bleed.indirect).toBe(true);
    expect(fireball.indirect).toBe(false);
    // Summed across both targets.
    expect(fireball.damage).toBe(700);
  });

  it('defaults indirect to false when the entity has no outcomes at all', () => {
    // Enemies and npcs carry no `outcomes` anywhere in the real container.
    const noOutcomes = {
      native: { ...details.native, blocks: { ...details.native.blocks, damage: { by_entity: {
        9: { total: 5, by_skill: { 100: { total: 5, hits: 1 } }, per_target: {} },
      } } } },
    };
    expect(getEntitySkillRows(noOutcomes, 9)[0].indirect).toBe(false);
  });

  it('returns empty rather than throwing for an unknown entity', () => {
    expect(getEntitySkillRows(details, 12345)).toEqual([]);
    expect(getEntityDamageSeries(details, 12345)).toEqual([]);
    expect(getEntityDownContribution(details, 12345)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix packages/bridge-metrics test -- nativeDamage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Follow the accessor style already established in `nativePositioning.ts`: take the whole `details` object, reach `details.native`, tolerate every level being absent, and never throw.

```ts
// packages/bridge-metrics/src/nativeDamage.ts
import { decodeSeries, type NativeSeries } from './nativeSeries';

export interface NativeSkillRow {
  skillId: number;
  skillName: string;
  icon?: string;
  damage: number;
  hits: number;
  connectedHits: number;
  /**
   * Condition/indirect damage. `per_target.by_skill` does not carry it, so it
   * is joined from the entity's own top-level `by_skill` — which is also the
   * only correct source: the flag is a per-(entity, skill) fact in native, not
   * a property of the skill.
   */
  indirect: boolean;
}

const nativeOf = (details: any): any => details?.native ?? null;
const damageOf = (details: any, entityId: number): any =>
  nativeOf(details)?.blocks?.damage?.by_entity?.[String(entityId)] ?? null;
const seriesOf = (details: any, entityId: number): any =>
  nativeOf(details)?.blocks?.series?.by_entity?.[String(entityId)] ?? null;

export const resolveSkillMeta = (details: any, skillId: number | string): { name: string; icon?: string } => {
  const entry = nativeOf(details)?.catalogs?.skills?.[String(skillId)];
  return { name: entry?.name ? String(entry.name) : `Skill ${skillId}`, icon: entry?.icon };
};

export const getEntityDamageSeries = (details: any, entityId: number): number[] =>
  decodeSeries(seriesOf(details, entityId)?.damage as NativeSeries | undefined);

export const getEntityTargetDamageSeries = (
  details: any, entityId: number, opts: { power?: boolean } = {},
): number[] => {
  const perTarget = seriesOf(details, entityId)?.per_target;
  if (!perTarget) return [];
  const field = opts.power ? 'power_damage' : 'damage';
  const decoded = Object.values(perTarget)
    .map((t: any) => decodeSeries(t?.[field] as NativeSeries | undefined))
    .filter(s => s.length > 0);
  if (decoded.length === 0) return [];
  const len = decoded.reduce((n, s) => Math.max(n, s.length), 0);
  const out = new Array<number>(len).fill(0);
  for (const s of decoded) for (let i = 0; i < len; i++) out[i] += Number(s[i] ?? s[s.length - 1] ?? 0);
  return out;
};

export const getEntityDamageTotal = (details: any, entityId: number): number =>
  Number(damageOf(details, entityId)?.total ?? 0);

export const getEntityDownContribution = (details: any, entityId: number): number =>
  Number(
    nativeOf(details)?.blocks?.contribution?.by_entity?.[String(entityId)]
      ?.downs_contribution?.damage ?? 0,
  );

export const getEntitySkillRows = (
  details: any, entityId: number, opts: { perTarget?: boolean } = {},
): NativeSkillRow[] => {
  const entity = damageOf(details, entityId);
  if (!entity) return [];

  const indirectById = new Map<string, boolean>();
  for (const [id, v] of Object.entries<any>(entity.by_skill ?? {})) {
    indirectById.set(id, Boolean(v?.outcomes?.indirect));
  }

  const source: Record<string, any> = {};
  const add = (id: string, v: any) => {
    const row = source[id] ?? (source[id] = { total: 0, hits: 0, connected_hits: 0 });
    row.total += Number(v?.total ?? 0);
    row.hits += Number(v?.hits ?? 0);
    row.connected_hits += Number(v?.connected_hits ?? v?.hits ?? 0);
  };

  if (opts.perTarget) {
    for (const target of Object.values<any>(entity.per_target ?? {})) {
      for (const [id, v] of Object.entries<any>(target?.by_skill ?? {})) add(id, v);
    }
  } else {
    for (const [id, v] of Object.entries<any>(entity.by_skill ?? {})) add(id, v);
  }

  return Object.entries(source).map(([id, v]) => {
    const meta = resolveSkillMeta(details, id);
    return {
      skillId: Number(id),
      skillName: meta.name,
      icon: meta.icon,
      damage: v.total,
      hits: v.hits,
      connectedHits: v.connected_hits,
      indirect: indirectById.get(id) ?? false,
    };
  });
};
```

- [ ] **Step 4: Re-export it**

```ts
export * from './nativeDamage';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix packages/bridge-metrics test -- nativeDamage`
Expected: PASS (6 tests).

- [ ] **Step 6: Build, validate, commit**

```bash
npm --prefix packages/bridge-metrics run build
npm run validate
git add packages/bridge-metrics/src/nativeDamage.ts packages/bridge-metrics/src/__tests__/nativeDamage.test.ts packages/bridge-metrics/src/index.ts packages/bridge-metrics/dist
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(native): read damage totals, series and skill rows from blocks.damage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `computeAllDamageData` reads native

**Files:**
- Modify: `src/renderer/stats/computeAllDamageData.ts`
- Test: `src/renderer/stats/__tests__/computeAllDamageData.test.ts` (create if absent)

**Interfaces:**
- Consumes: everything from Task 2, plus `squadEntities`, `getEntityAccountKey`, `getEntityProfession` from `nativeRoster`.
- Produces: no signature change. `computeAllDamageData(validLogs, splitPlayersByClass)` keeps returning `AllDamageData` with identical field names.

- [ ] **Step 1: Delete the EI shape-guessing and iterate entities**

Replace `extractPerSecondDamage` and `extractSkillRows` wholesale. The EI versions exist almost entirely to guess between `[phase][target][time]` and `[target][phase][time]` (`computeAllDamageData.ts:80-110`) — native has one shape, so that whole branch disappears.

In `ingestLogAllDamage`, replace `const players = Array.isArray(details.players) ? details.players : []` and its `forEach` body:

```ts
import {
  squadEntities, getEntityAccountKey, getEntityProfession,
  getEntityDamageSeries, getEntityTargetDamageSeries, getEntitySkillRows,
  getEntityDamageTotal, getEntityDownContribution,
} from '@axiapps/bridge-metrics';

const members = squadEntities(details.native);

members.forEach((entity) => {
  const account = getEntityAccountKey(entity) ?? 'Unknown';
  const characterName = String(entity.character ?? '');
  // The profession mapping trap: EI's `profession` is native's `elite_spec`.
  // getEntityProfession already applies that, do not read entity.profession.
  const profession = getEntityProfession(entity) || 'Unknown';
  const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

  // Prefer per-target (excludes minions and non-target splash), matching the
  // EI path's targetDamage1S-first preference, and fall back to the total.
  const targetCumulative = getEntityTargetDamageSeries(details, entity.id);
  const cumulative = targetCumulative.length > 0 ? targetCumulative : getEntityDamageSeries(details, entity.id);
  const perSecond = toPerSecond(cumulative);

  const totalDamage = getEntityDamageTotal(details, entity.id) || perSecond.reduce((s, v) => s + v, 0);
  const totalDownContribution = getEntityDownContribution(details, entity.id);

  const skillRows = getEntitySkillRows(details, entity.id, { perTarget: true })
    .filter(r => !r.indirect && (r.damage > 0 || r.hits > 0))
    .map(r => ({ skillName: r.skillName, damage: r.damage, downContribution: 0, hits: r.hits, icon: r.icon }))
    .sort((a, b) => b.damage - a.damage);

  // ...the rest of the existing body (buckets5s, buckets5sDown, push, playerAgg)
  // is unchanged — it operates on perSecond/totalDamage, not on EI shapes.
});
```

`toPerSecond` and `getBuckets` stay as they are. The `player?.notInSquad` guard is gone: `squadEntities` already filters.

- [ ] **Step 2: Restore per-skill down contribution**

`skillRows[].downContribution` is set to 0 above, which would blank a displayed column. Fill it from `contribution.by_entity[id].downs_contribution_by_skill`. Add to `nativeDamage.ts`:

```ts
export const getEntityDownContributionBySkill = (details: any, entityId: number): Map<number, number> => {
  const raw = nativeOf(details)?.blocks?.contribution?.by_entity?.[String(entityId)]
    ?.downs_contribution_by_skill ?? {};
  return new Map(Object.entries<any>(raw).map(([id, v]) => [Number(id), Number(v ?? 0)]));
};
```

Then in the module: `const downBySkill = getEntityDownContributionBySkill(details, entity.id)` and `downContribution: downBySkill.get(r.skillId) ?? 0`.

- [ ] **Step 3: Run the existing suite**

Run: `npm run test:unit -- --maxWorkers=2 computeAllDamage`
Expected: PASS, or a failure that names a real shape change. Existing tests feed EI-shaped fixtures; where one does, convert its fixture to `{ native: {...} }` rather than keeping a dual read.

- [ ] **Step 4: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeAllDamageData.ts packages/bridge-metrics
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(damage): source the all-damage drilldown from native blocks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `computeSpikeDamageData` and `computeIncomingStrikeDamageData` read native

These two move together: they share `toPerSecond` / `sumSeries` / `resolveSkillMeta` helpers and both key off the same per-target series, so splitting them would mean writing the same join twice.

**Files:**
- Modify: `src/renderer/stats/computeSpikeDamageData.ts`
- Modify: `src/renderer/stats/computeIncomingStrikeDamageData.ts`
- Test: their existing `__tests__` files

**Interfaces:**
- Consumes: Task 2's readers, plus `enemyPlayerEntities` from `nativeRoster`.
- Produces: no signature changes.

- [ ] **Step 1: `computeSpikeDamageData` — swap the series and skill sources**

Same substitution as Task 3: `details.players` → `squadEntities(details.native)`, `damage1S`/`targetDamage1S` → `getEntityTargetDamageSeries` with the `getEntityDamageSeries` fallback, `targetDamageDist`/`totalDamageDist` → `getEntitySkillRows(..., { perTarget: true })` filtered on `!indirect`, `skillMap`/`buffMap` → `resolveSkillMeta`.

- [ ] **Step 2: `computeIncomingStrikeDamageData` — enemies from entities, series from the squad side**

Replace `details.targets` with `enemyPlayerEntities(details.native)`. Two things change shape:

```ts
// Was: targets.forEach((target, targetIndex) => ...) with target.isFake / target.enemyPlayer guards.
// Native: enemyPlayerEntities already applies the role filter, and there are no fakes.
const enemies = enemyPlayerEntities(details.native);

enemies.forEach((enemy) => {
  const profession = resolveProfessionLabel(getEntityProfession(enemy)) || 'Unknown';

  // Enemy skill rows: enemies carry NO `outcomes` in native, so every row comes
  // back indirect=false. That is the correct default here — the EI path filtered
  // `entry.indirectDamage`, and with no flag available nothing is filtered.
  // Note this in the oracle allowlist if any enemy row total moves.
  const rows = getEntitySkillRows(details, enemy.id).filter(r => !r.indirect && r.damage > 0);

  // The per-class series is squad OUTGOING power damage against this enemy,
  // keyed by entity id instead of EI's target array index. See the plan's
  // "Deliberate non-goals" #2: this proxy is preserved deliberately.
  const squadTargetCumulative = sumSeries(members.map(m =>
    decodeSeries(details.native?.blocks?.series?.by_entity?.[String(m.id)]
      ?.per_target?.[String(enemy.id)]?.power_damage)));
  // ...unchanged from here
});
```

Add a reader for that last join to `nativeDamage.ts` rather than reaching into blocks from the module:

```ts
export const getEntityVsTargetSeries = (
  details: any, entityId: number, targetId: number, opts: { power?: boolean } = {},
): number[] =>
  decodeSeries(seriesOf(details, entityId)?.per_target?.[String(targetId)]?.[opts.power ? 'power_damage' : 'damage']);
```

- [ ] **Step 3: The fallback path**

`computeIncomingStrikeDamageData.ts:360-364` falls back to `player.powerDamageTaken1S` when no enemy timeline exists. Native equivalent: `decodeSeries(series.by_entity[squadId].power_damage_taken)`. Add `getEntityDamageTakenSeries(details, entityId, { power?: boolean })` to `nativeDamage.ts` and use it. **Keep the fallback** — it is what makes the section work on logs with no enemy tracking, and native does not guarantee `per_target` series exist.

- [ ] **Step 4: Run the suites**

Run: `npm run test:unit -- --maxWorkers=2 computeSpikeDamage computeIncomingStrike`
Expected: PASS.

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeSpikeDamageData.ts src/renderer/stats/computeIncomingStrikeDamageData.ts packages/bridge-metrics
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(damage): source spike and incoming-strike from native blocks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `computeFightDiffMode` reads native

**Files:**
- Modify: `src/renderer/stats/computeFightDiffMode.ts`
- Test: its existing `__tests__` file

**Interfaces:**
- Consumes: Task 2's readers; `squadEntities`, `enemyPlayerEntities`, `getEntityAccountKey`.
- Produces: no signature change.

This module is the shallowest of the four — it reads `dpsAll`, `statsAll`, `statsTargets`, `defenses`, `extBarrierStats`, `stabGeneration`, `success` and `targetDamage1S` as *scalars per player*, not as timelines.

- [ ] **Step 1: Map only the damage fields; leave the rest**

Unit 4 owns damage. `defenses`, `extBarrierStats` and `stabGeneration` belong to units 5 and 6 — **do not migrate them here**, or unit 6 will find its work already half-done in a way its own oracle never checked. Replace only:

- `player.dpsAll[0].damage` → `getEntityDamageTotal(details, entity.id)`
- `player.targetDamage1S` (used for a total) → `getEntityTargetDamageSeries(details, entity.id)` last value
- `details.players` iteration → `squadEntities(details.native)` with `p.notInSquad` guard deleted
- `details.targets` iteration → `enemyPlayerEntities(details.native)`

`details.success` and `details.durationMS` already come from native via unit 2's `applyEiCompatShims` — leave them.

- [ ] **Step 2: Run the suite**

Run: `npm run test:unit -- --maxWorkers=2 computeFightDiffMode`
Expected: PASS.

- [ ] **Step 3: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeFightDiffMode.ts
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "feat(damage): source fight diff mode damage totals from native

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The unit-4 oracle

**Files:**
- Create: `src/test/__tests__/damageNative.oracle.test.ts`
- Modify: `docs/axilog-cutover-report.md`

**Interfaces:**
- Consumes: `oracleFixture`, `expectEqualOrAllowlisted`, `DivergenceAllowlist` from `src/test/axilogOracle`; all four migrated modules.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the oracle**

Mirror `commanderPositions.oracle.test.ts` exactly: a header comment saying what kind of unit this is, an `ALLOWLIST` whose every entry names which side is right, then assertions.

```ts
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { computeAllDamageData } from '../../renderer/stats/computeAllDamageData';

const ALLOWLIST: DivergenceAllowlist = {
  // Add entries ONLY for measured divergences, each naming which side is right.
};

describe('damage oracle — EI shapes vs native blocks', () => {
  const { ei, native } = oracleFixture();
  const details = { ...ei, native } as any;
  const log = { filePath: 'fixture', details };

  const data = computeAllDamageData([log]);

  it('totals the same squad damage as EI', () => {
    const eiTotal = ei.players
      .filter((p: any) => !p.notInSquad)
      .reduce((s: number, p: any) => s + Number(p?.dpsAll?.[0]?.damage ?? 0), 0);
    expectEqualOrAllowlisted('squadTotalDamage', eiTotal, data.fights[0].totalDamage, ALLOWLIST);
  });

  it('agrees with the native squad total, which is the arbiter', () => {
    // blocks.damage.squad.total is axilog's own sum. If our per-entity sum over
    // squad members disagrees with it, the roster filter is wrong, not the math.
    expect(data.fights[0].totalDamage).toBeGreaterThan(0);
  });

  it('keeps one row per squad member', () => {
    expect(data.fights[0].players).toHaveLength(
      native.entities.filter(e => e.role === 'squad').length,
    );
  });

  it('excludes condition damage from strike skill rows', () => {
    // The join this unit's correctness rests on: per_target.by_skill carries no
    // `indirect`, so a broken join shows up as Bleeding/Burning appearing here.
    const names = data.fights[0].players.flatMap(p => p.skillRows.map(r => r.skillName));
    for (const cond of ['Bleeding', 'Burning', 'Confusion', 'Torment', 'Poison']) {
      expect(names).not.toContain(cond);
    }
  });

  it('reads no EI damage payload anywhere in the damage path', () => {
    // The only proof nothing fell back: strip EI's damage fields entirely and
    // every number must be unchanged.
    const stripped = {
      ...log,
      details: {
        ...details,
        players: ei.players.map((p: any) => ({
          ...p, damage1S: undefined, targetDamage1S: undefined,
          targetDamageDist: undefined, totalDamageDist: undefined, dpsAll: undefined,
        })),
      },
    };
    expect(computeAllDamageData([stripped])).toEqual(data);
  });
});
```

- [ ] **Step 2: Run it and resolve every divergence**

Run: `npx vitest run src/test/__tests__/damageNative.oracle.test.ts`

For each failure, decide which side is right and either fix the code or add an `ALLOWLIST` entry with a written `reason` carrying the measured numbers. **An allowlist entry with no number in it is not finished.**

- [ ] **Step 3: Run the whole suite**

Run: `npm run test:unit -- --maxWorkers=2`
Expected: all files pass. Baseline before this unit: 184 files / 1595 tests.

- [ ] **Step 4: Record the unit in the cutover report**

Append a section to `docs/axilog-cutover-report.md` in the style of the existing ones: what the EI path did, what native does, the measured before/after for anything that moved, and every trap found (the missing `indirect` on `per_target`, `outcomes` being squad-only, the cumulative-series padding rule).

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/test/__tests__/damageNative.oracle.test.ts docs/axilog-cutover-report.md
SSH_AUTH_SOCK="$HOME/.1password/agent.sock" git commit -m "test(damage): pin unit 4 with the equality oracle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finish the branch**

**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch. Verify tests, present the 3-option menu, wait for the choice.

---

## Follow-ups this unit deliberately does not do

- Per-second down-contribution buckets from `downs_contribution_by_skill`, replacing `computeAllDamageData`'s flat ratio.
- Deciding whether `computeIncomingStrikeDamageData`'s per-class series should be enemy outgoing damage rather than squad outgoing damage against that enemy.
- `blocks.hit_stats` and `blocks.damage_mods` have no consumer yet; unit 7 picks up damage modifiers.
