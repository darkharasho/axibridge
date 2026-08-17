# axilog Native Migration — Unit 3: Positioning & Replay

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every distance-to-tag, squad-cohesion and out-of-position computation off EI's `combatReplayData` pixel arrays and onto axilog's native `blocks.replay`, deleting `deriveDistanceScalars` and the five duplicated poll-indexing loops in the process.

**Architecture:** One new reader module, `packages/bridge-metrics/src/nativePositioning.ts`, exposes native replay as a self-timestamped, world-inch surface (`PositionTrack`, `ArenaProjection`, per-entity `distToCom`/`stackDist`). The five existing consumers each collapse from "index into `positions[]` with a hand-rolled poll offset, then divide by `inchToPixel`" onto that surface. `src/shared/movementData.ts` becomes a thin re-export of the native types rather than a second implementation of the same arithmetic.

**Tech Stack:** TypeScript, `@axiapps/axilog` 0.3.5 (native `parseFile`), vitest, tsup (bridge-metrics build).

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md` (unit 3 in the table at line 247; the `deriveDistanceScalars` deletion deferred at line 177)

---

## Global Constraints

- **axilog pin is exact: `"@axiapps/axilog": "0.3.5"`.** Native `map_id` and `tracks.arena` do not exist before 0.3.5. Do not widen to a range.
- **`packages/bridge-metrics` is consumed via `dist/`, not `src/`.** After ANY edit under `packages/bridge-metrics/src/`, run `npm --prefix packages/bridge-metrics run build` before running the root test suite, or you will debug a phantom `TS2305`.
- **`src/shared/**` is also compiled by `electron/tsconfig.json`,** whose Node10 resolver cannot read the package root `exports` map. Shared modules MUST import bridge-metrics **subpaths** (`@axiapps/bridge-metrics/nativePositioning`), never the root. Add the new subpath to `packages/bridge-metrics/package.json` `exports` in Task 1 or every later task fails to typecheck.
- **vitest parallelism is capped at 2** (machine-wide rule): `npx vitest run --maxWorkers=2 <path>`.
- **Never add a non-anonymized `.zevtc`.** The gitignore has exactly one negation, `!test-fixtures/axilog/*.anon.zevtc`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Every unit is pinned by the equality oracle** (`src/test/axilogOracle.ts`). A divergence is landed as an allowlist entry with a written `reason` naming which side is right — never by loosening an assertion.
- **Native distances are world inches.** EI's were map pixels needing `/ inchToPixel`. Every migrated call site must DELETE its division, not re-derive the scale.

---

## Measured Inputs

All figures from `test-fixtures/axilog/wvw-small.anon.zevtc` parsed at axilog 0.3.5 with `{ everything: true }`. Reproduce before trusting.

| Fact | Value |
|---|---|
| `encounter.map_id` / `map` | `95` / `Green Alpine Borderlands` |
| `encounter.duration_ms` | `49285` |
| `coverage.replay` | `"present"` |
| `blocks.replay.tracks.poll_ms` | `300` |
| `blocks.replay.by_entity` | 42 entries — roles `squad` (38) + `friendly_player` (4) |
| `blocks.replay.tracks.by_entity` | 74 entries — adds `enemy_player` (32) |
| `tracks.arena` | `{image_width: 697, image_height: 1000, world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008, image_url: "https://i.imgur.com/nVu2ivF.png"}` |
| `samples` shape | `[t_ms, x, y]`, `x`/`y` world inches to 1dp; track 0 runs `300 … 49500`, n=165 |
| `by_entity[].dist_to_com` | present for all 42, range `0.0 … 21195.1`, zero `-1` sentinels |
| EI `combatReplayMetaData` | `{inchToPixel: 0.009, pollingRate: 300, sizes: [523, 750]}` |
| EI `statsAll[0].distToCom` / `.stackDist` | **absent** — axilog's ei-json never emitted them |

### Payload cost of widening the carry-set

| Slice | Size |
|---|---|
| Full native report | 2441.5 KB |
| Unit 1+2 carry-set (`axilog`+`encounter`+`entities`+`coverage`) | 22.8 KB |
| `blocks.replay` whole | 290.5 KB |
| `blocks.replay.by_entity` | **6.0 KB** |
| `tracks.arena` + `poll_ms` + `bounds` | **0.3 KB** |
| `tracks.by_entity` (all 74) | 284.4 KB |
| `tracks.by_entity` (42 squad+friendly only) | 174.5 KB |

**Reading:** everything unit 3 needs *except raw sample arrays* costs **6.3 KB**. The 284 KB of tracks is the payload `nativeCarrySet.ts` warns about — but it *replaces* EI's `combatReplayData.positions`, which is already carried today and already governed by the user's `parseCombatReplay` retention setting via `pruneDetailsForStats`. Net payload is therefore roughly flat, not +290 KB. Task 2 asserts this rather than assuming it.

### The two bugs this unit fixes

These are not hypotheticals; both are measured on the fixture and both ship today.

**Bug 1 — the poll-offset off-by-one.** `movementData.ts:64` and `axilogParser.ts:194` compute an actor's first poll index as `Math.ceil(start / pollingRate)`, which is correct: EI emits `positions[i]` for the i-th multiple of `pollingRate` that falls **inside** `[start, end]`, so an actor first seen at `t=1ms` starts at poll 1 (`t=300`), not poll 0. All five consumer implementations use `Math.floor` instead:

- `packages/bridge-metrics/src/positioning.ts:94, 154, 249, 323, 353`
- `src/renderer/stats/computeDistanceToTag.ts:70`
- `src/renderer/stats/computeOnTagReview.ts:90`
- `src/renderer/stats/computeTagDistanceDeaths.ts:77`
- `src/renderer/stats/computeStabPerformance.ts:106, 177`

`floor` and `ceil` differ for every actor whose `start` is not an exact multiple of 300ms. **On the fixture that is 36 of 42 players (86%)** — starts read `0,1,2,2,0,1,4,4,3,5,1,7,…`. Each affected player's entire distance track is shifted one 300ms poll against the tag.

Native's `samples` are `[t_ms, x, y]` triples. There is no index arithmetic to get wrong; the bug cannot be reintroduced.

**Bug 2 — `inchToPixel` is rounded to 3 decimals.** EI's `combatReplayMetaData.inchToPixel` is `0.009`. The true scale is `sizes[1] / (world_max_y - world_min_y)` = `750 / 86016` = `0.0087193`. Every distance in the app is computed as `pixels / 0.009` and therefore reads **3.12% too small, systematically**. This is the dominant term in the cutover report's "3.7% mean error on `distToCom`" — the commander-segment approximation was the smaller half.

Native samples are already world inches. The division disappears, and with it the error.

### The one divergence to allowlist

GW2EI's `ei_replay::handle_position` freezes an actor across a `>600ms` gap whose last velocity reads ~zero, then snaps to the next real point. axilog's native downsampler interpolates straight through. Median projected difference is 0.0005px (pure rounding), but a minority of instants hold genuinely different positions. Native's trajectory is the more faithful reconstruction and is golden-tested in axilog. **Unit 3's oracle must allowlist this, not "fix" it.**

---

## File Structure

**Create:**
- `packages/bridge-metrics/src/nativePositioning.ts` — the whole native replay reader surface
- `packages/bridge-metrics/src/__tests__/nativePositioning.test.ts`
- `src/test/__tests__/unit3Positioning.oracle.test.ts`

**Modify:**
- `packages/bridge-metrics/package.json` — add the `./nativePositioning` export
- `src/main/nativeCarrySet.ts` — carry `blocks.replay` by path, not `blocks` wholesale
- `src/main/axilogParser.ts` — delete `deriveDistanceScalars` (lines 120–365) and its call site (line 568)
- `src/shared/movementData.ts` — re-point onto the native types
- `packages/bridge-metrics/src/positioning.ts` — rewrite onto `PositionTrack`
- `src/renderer/stats/computeDistanceToTag.ts`
- `src/renderer/stats/computeOnTagReview.ts`
- `src/renderer/stats/computeTagDistanceDeaths.ts`
- `src/renderer/stats/computeStabPerformance.ts`

**Explicitly OUT of scope — unit 3b.** The renderer's *visual* replay surface (`src/renderer/stats/map/ReplayView.tsx`, `map/SquadOverlay.tsx`, `map/EventOverlay.tsx`, `map/hooks/useHeatmapData.ts`, `map/hooks/useSquadDerived.ts`, `src/shared/wvwTiles.ts`, `src/shared/wvwLandmarks.ts`, `src/shared/mapUtils.ts`) still consumes EI pixel coordinates. Those files are calibrated against `wvwTiles.ts`'s `continentRect` and are the most visually fragile part of the app; they migrate together, in one unit, against `ArenaProjection` — not piecemeal here. Unit 3 leaves them reading EI and unbroken.

---

## Task 1: The native positioning reader

**Files:**
- Create: `packages/bridge-metrics/src/nativePositioning.ts`
- Modify: `packages/bridge-metrics/package.json`
- Test: `packages/bridge-metrics/src/__tests__/nativePositioning.test.ts`

**Interfaces:**
- Consumes: `getNativeReport(details)` from `./nativeEncounter`.
- Produces: `getPollMs`, `getArena`, `worldToPixel`, `getPositionTracks`, `getPositionTrack`, `positionAt`, `getDistanceScalars`, and the types `ArenaProjection`, `PositionTrack`, `PositionSample`, `DistanceScalars`. Tasks 3–7 use these names exactly.

- [ ] **Step 1: Write the failing test**

```ts
// packages/bridge-metrics/src/__tests__/nativePositioning.test.ts
import { describe, it, expect } from 'vitest';
import {
    getPollMs, getArena, worldToPixel, getPositionTracks, getPositionTrack,
    positionAt, getDistanceScalars, NO_DISTANCE,
} from '../nativePositioning';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'https://example/x.png',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

const log = (over: any = {}) => ({
    native: {
        axilog: { schema: '1.0' },
        coverage: { replay: 'present' },
        blocks: {
            replay: {
                by_entity: {
                    3: { start_ms: 2, end_ms: 49266, active_ms: 49264, down: [], dead: [], dc: [], dist_to_com: 0, stack_dist: 179.5 },
                    7: { start_ms: 0, end_ms: 49266, active_ms: 49266, down: [[1200, 1800]], dead: [], dc: [], dist_to_com: 307.35, stack_dist: 189.23 },
                },
                tracks: {
                    poll_ms: 300,
                    arena: ARENA,
                    by_entity: {
                        3: { samples: [[300, -11146.1, -23783.8], [600, -11100, -23700]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                        7: { samples: [[300, -11000, -23000], [900, -10900, -22900]], down_intervals: [[1200, 1800]], dead_intervals: [], dc_intervals: [] },
                    },
                },
            },
        },
        ...over,
    },
});

describe('nativePositioning — arena projection', () => {
    it('reads the arena', () => {
        expect(getArena(log())).toEqual(ARENA);
    });

    it('returns null when the log has no native report', () => {
        expect(getArena({})).toBeNull();
        expect(getPollMs({})).toBeNull();
    });

    it('projects the world rect corners onto the image corners', () => {
        const a = getArena(log())!;
        // min_x/max_y is the TOP-LEFT: world y grows north, image y grows down.
        expect(worldToPixel(a, -30720, 43008)).toEqual([0, 0]);
        expect(worldToPixel(a, 30720, -43008)).toEqual([697, 1000]);
    });

    it('projects the centre to the image centre', () => {
        const a = getArena(log())!;
        const [px, py] = worldToPixel(a, 0, 0);
        expect(px).toBeCloseTo(348.5, 6);
        expect(py).toBeCloseTo(500, 6);
    });

    it('scales to an arbitrary canvas without re-deriving the rect', () => {
        const a = getArena(log())!;
        const [px, py] = worldToPixel(a, 0, 0, [523, 750]);
        expect(px).toBeCloseTo(261.5, 6);
        expect(py).toBeCloseTo(375, 6);
    });
});

describe('nativePositioning — tracks', () => {
    it('reads poll_ms', () => {
        expect(getPollMs(log())).toBe(300);
    });

    it('keys tracks by entity id with self-timestamped samples', () => {
        const tracks = getPositionTracks(log());
        expect([...tracks.keys()].sort()).toEqual([3, 7]);
        expect(tracks.get(3)!.samples[0]).toEqual([300, -11146.1, -23783.8]);
    });

    it('returns an empty map when tracks are ungated off', () => {
        const bare = { native: { axilog: {}, blocks: { replay: { by_entity: {} } } } };
        expect(getPositionTracks(bare).size).toBe(0);
        expect(getArena(bare)).toBeNull();
    });

    it('finds a sample by timestamp, not by index arithmetic', () => {
        const t = getPositionTrack(log(), 7)!;
        expect(positionAt(t, 300)).toEqual([-11000, -23000]);
        expect(positionAt(t, 900)).toEqual([-10900, -22900]);
    });

    it('returns null for an instant the track does not cover', () => {
        // Entity 7 has NO sample at 600 — it is a gap, not an interpolation
        // point. Returning the neighbour would invent a position.
        const t = getPositionTrack(log(), 7)!;
        expect(positionAt(t, 600)).toBeNull();
        expect(positionAt(t, 0)).toBeNull();
        expect(positionAt(t, 99999)).toBeNull();
    });

    it('honours requireActive against down/dead/dc intervals', () => {
        const t = getPositionTrack(log(), 7)!;
        // 1200..1800 is a down window; no sample there anyway, so use a
        // track that has one.
        const withDown = getPositionTrack(log(), 3)!;
        expect(positionAt(withDown, 300, true)).toEqual([-11146.1, -23783.8]);
    });
});

describe('nativePositioning — distance scalars', () => {
    it('reads dist_to_com and stack_dist in world inches', () => {
        const s = getDistanceScalars(log());
        expect(s.get(3)).toEqual({ distToCom: 0, stackDist: 179.5 });
        expect(s.get(7)).toEqual({ distToCom: 307.35, stackDist: 189.23 });
    });

    it('keeps absent and -1 distinct', () => {
        // absent  => the position pass never ran; we know nothing.
        // -1      => the pass ran and nothing qualified (GW2EI's sentinel).
        // Collapsing them makes "not measured" look like "measured as none".
        const l = log();
        (l.native as any).blocks.replay.by_entity[3] = { start_ms: 0, end_ms: 1, active_ms: 1, down: [], dead: [], dc: [] };
        (l.native as any).blocks.replay.by_entity[7].dist_to_com = NO_DISTANCE;
        const s = getDistanceScalars(l);
        expect(s.get(3)).toEqual({ distToCom: null, stackDist: null });
        expect(s.get(7)!.distToCom).toBe(NO_DISTANCE);
    });

    it('is empty for a log with no native report', () => {
        expect(getDistanceScalars({}).size).toBe(0);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 packages/bridge-metrics/src/__tests__/nativePositioning.test.ts --root packages/bridge-metrics`
Expected: FAIL — `Cannot find module '../nativePositioning'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/bridge-metrics/src/nativePositioning.ts
import { getNativeReport } from './nativeEncounter';

/**
 * Native replay readers.
 *
 * Two things distinguish this surface from the EI one it replaces, and both
 * delete a class of bug rather than merely relocating it:
 *
 * 1. **Samples are self-timestamped** (`[t_ms, x, y]`). EI emitted a bare
 *    `positions[]` whose i-th entry belonged to poll `ceil(start / pollingRate)
 *    + i`, and five separate call sites re-derived that offset with `floor`
 *    instead of `ceil` — wrong for 36 of 42 players on the committed fixture.
 *    There is no offset to derive here.
 * 2. **Coordinates are world inches**, not map pixels. EI's `inchToPixel` is
 *    rounded to three decimals (`0.009` against a true `0.0087193`), so every
 *    `pixels / inchToPixel` in the old path read 3.12% short. Callers migrating
 *    onto this module must DELETE their division, not re-derive the scale.
 *
 * Readers return `null`/empty — never `0` — when a fact is absent, so no
 * missing value is ever mistaken for a measured one.
 */

/** GW2EI's "no samples qualified" sentinel, preserved verbatim by axilog. */
export const NO_DISTANCE = -1;

/**
 * The static geometry that turns world coordinates into a picture. Native
 * emits it un-rounded and un-rescaled: EI's `combatReplayMetaData.sizes` is
 * squeezed to a 750px max dimension and its `inchToPixel` rounded to 3dp, and
 * while both are derivable from this, this is not derivable from them.
 */
export interface ArenaProjection {
    image_width: number;
    image_height: number;
    image_url: string;
    world_min_x: number;
    world_min_y: number;
    world_max_x: number;
    world_max_y: number;
}

/** `[t_ms, x, y]` — milliseconds from log start, then world inches. */
export type PositionSample = [number, number, number];

export interface PositionTrack {
    entityId: number;
    samples: PositionSample[];
    down: Array<[number, number]>;
    dead: Array<[number, number]>;
    dc: Array<[number, number]>;
}

export interface DistanceScalars {
    /** Mean distance to the commander in world inches; `null` when unmeasured, {@link NO_DISTANCE} when measured-but-empty. */
    distToCom: number | null;
    stackDist: number | null;
}

const replayOf = (details: any): any => {
    const block = (getNativeReport(details) as any)?.blocks?.replay;
    return block && typeof block === 'object' ? block : null;
};

const finiteOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

export const getPollMs = (details: any): number | null =>
    finiteOrNull(replayOf(details)?.tracks?.poll_ms);

export const getArena = (details: any): ArenaProjection | null => {
    const arena = replayOf(details)?.tracks?.arena;
    if (!arena || typeof arena !== 'object') return null;
    for (const k of ['image_width', 'image_height', 'world_min_x', 'world_min_y', 'world_max_x', 'world_max_y']) {
        if (finiteOrNull((arena as any)[k]) === null) return null;
    }
    return arena as ArenaProjection;
};

/**
 * Project world coordinates onto the arena image.
 *
 * `canvas` defaults to the image's native size; pass a smaller pair to draw at
 * any scale without re-deriving the world rect. The `1 -` on `fy` is the y
 * flip: world y grows northward, image y grows downward.
 */
export const worldToPixel = (
    arena: ArenaProjection,
    x: number,
    y: number,
    canvas?: [number, number],
): [number, number] => {
    const [w, h] = canvas ?? [arena.image_width, arena.image_height];
    const fx = (x - arena.world_min_x) / (arena.world_max_x - arena.world_min_x);
    const fy = (y - arena.world_min_y) / (arena.world_max_y - arena.world_min_y);
    return [fx * w, (1 - fy) * h];
};

const toIntervals = (raw: unknown): Array<[number, number]> => {
    if (!Array.isArray(raw)) return [];
    const out: Array<[number, number]> = [];
    for (const e of raw) {
        if (!Array.isArray(e)) continue;
        const a = finiteOrNull(Number(e[0]));
        const b = finiteOrNull(Number(e[1]));
        if (a === null || b === null) continue;
        out.push([a, b]);
    }
    return out;
};

/**
 * Every entity with a position track, keyed by entity id.
 *
 * WIDER than `blocks.replay.by_entity`: tracks include enemy players (74 vs 42
 * on the fixture). Callers wanting squad-only must filter by role via
 * `nativeRoster`, not by assuming these two maps agree.
 *
 * Empty when the parse ran without `{ replay: true }` — note that
 * `coverage.replay === "present"` does NOT imply positions exist, because the
 * interval half of the block is computed on every parse.
 */
export const getPositionTracks = (details: any): Map<number, PositionTrack> => {
    const out = new Map<number, PositionTrack>();
    const byEntity = replayOf(details)?.tracks?.by_entity;
    if (!byEntity || typeof byEntity !== 'object') return out;
    for (const [key, raw] of Object.entries(byEntity as Record<string, any>)) {
        const entityId = Number(key);
        if (!Number.isFinite(entityId)) continue;
        const samples = Array.isArray(raw?.samples) ? (raw.samples as PositionSample[]) : [];
        out.set(entityId, {
            entityId,
            samples,
            down: toIntervals(raw?.down_intervals),
            dead: toIntervals(raw?.dead_intervals),
            dc: toIntervals(raw?.dc_intervals),
        });
    }
    return out;
};

export const getPositionTrack = (details: any, entityId: number): PositionTrack | null =>
    getPositionTracks(details).get(entityId) ?? null;

const inAnyInterval = (t: number, intervals: Array<[number, number]>): boolean => {
    for (const [start, end] of intervals) if (t >= start && t <= end) return true;
    return false;
};

/**
 * The position at an EXACT instant, or `null`.
 *
 * Deliberately not interpolating: a missing sample means the actor was not
 * polled then, and inventing a midpoint would put a player somewhere they
 * provably were not. Callers wanting a nearest-sample lookup should say so at
 * their own call site, where the tolerance is a visible decision.
 */
export const positionAt = (
    track: PositionTrack,
    tMs: number,
    requireActive = false,
): [number, number] | null => {
    // Samples are ascending in t; binary search rather than scan, because the
    // cohesion loops call this O(players x polls) times.
    let lo = 0;
    let hi = track.samples.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = track.samples[mid][0];
        if (t === tMs) {
            if (requireActive
                && (inAnyInterval(tMs, track.down)
                    || inAnyInterval(tMs, track.dead)
                    || inAnyInterval(tMs, track.dc))) return null;
            return [track.samples[mid][1], track.samples[mid][2]];
        }
        if (t < tMs) lo = mid + 1;
        else hi = mid - 1;
    }
    return null;
};

/**
 * axilog's own `distToCom`/`stackDist`, in world inches.
 *
 * These replace `deriveDistanceScalars`, which reconstructed them in axibridge
 * from EI pixel arrays because axilog's ei-json never emitted them. That
 * reconstruction carried two errors the native values do not: EI's rounded
 * `inchToPixel` (-3.12% systematic) and a first-commander-track approximation
 * standing in for real commander segments.
 */
export const getDistanceScalars = (details: any): Map<number, DistanceScalars> => {
    const out = new Map<number, DistanceScalars>();
    const byEntity = replayOf(details)?.by_entity;
    if (!byEntity || typeof byEntity !== 'object') return out;
    for (const [key, raw] of Object.entries(byEntity as Record<string, any>)) {
        const entityId = Number(key);
        if (!Number.isFinite(entityId)) continue;
        out.set(entityId, {
            distToCom: finiteOrNull(raw?.dist_to_com),
            stackDist: finiteOrNull(raw?.stack_dist),
        });
    }
    return out;
};
```

- [ ] **Step 4: Add the subpath export**

In `packages/bridge-metrics/package.json`, after the `"./nativeEncounter"` line in `exports`:

```json
        "./nativePositioning": { "types": "./dist/nativePositioning.d.ts", "import": "./dist/nativePositioning.js", "require": "./dist/nativePositioning.cjs" }
```

Add `nativePositioning` to the `entry` list in `packages/bridge-metrics/tsup.config.ts` alongside `nativeEncounter`, and re-export it from `packages/bridge-metrics/src/index.ts` the same way `nativeEncounter` is.

- [ ] **Step 5: Build and run the tests**

```bash
npm --prefix packages/bridge-metrics run build
npx vitest run --maxWorkers=2 packages/bridge-metrics/src/__tests__/nativePositioning.test.ts --root packages/bridge-metrics
```
Expected: PASS, all cases.

- [ ] **Step 6: Commit**

```bash
git add packages/bridge-metrics/src/nativePositioning.ts \
        packages/bridge-metrics/src/__tests__/nativePositioning.test.ts \
        packages/bridge-metrics/src/index.ts \
        packages/bridge-metrics/package.json packages/bridge-metrics/tsup.config.ts
git commit -m "feat(bridge-metrics): native positioning reader

Self-timestamped world-inch replay tracks plus the arena projection,
replacing EI's pixel positions[] and its rounded inchToPixel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Widen the carry-set to `blocks.replay`

**Files:**
- Modify: `src/main/nativeCarrySet.ts`
- Test: `src/main/__tests__/nativeCarrySet.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CARRIED_PATHS` (replacing `CARRIED_KEYS`), still building a `NativeCarrySet` shaped `{axilog, encounter, entities, coverage, blocks: {replay}}`.

`CARRIED_KEYS` is a flat whitelist and its own doc forbids what unit 3 needs: *"Never carry `blocks` wholesale; carry the specific block that unit reads."* So the whitelist gains one level of depth.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/main/__tests__/nativeCarrySet.test.ts
import { buildNativeCarrySet, CARRIED_PATHS } from '../nativeCarrySet';

describe('carry-set — blocks.replay (unit 3)', () => {
    const report = {
        axilog: { schema: '1.0' },
        encounter: { map_id: 95 },
        entities: [],
        coverage: { replay: 'present' },
        blocks: {
            replay: { by_entity: { 3: { dist_to_com: 0 } }, tracks: { poll_ms: 300 } },
            damage: { by_entity: { 3: { total: 999 } } },
            boons: { by_entity: {} },
        },
    };

    it('carries blocks.replay', () => {
        const set: any = buildNativeCarrySet(report);
        expect(set.blocks.replay.tracks.poll_ms).toBe(300);
        expect(set.blocks.replay.by_entity['3'].dist_to_com).toBe(0);
    });

    it('carries no other block', () => {
        // The whole point of the whitelist: `blocks` is 2.4 MB and
        // `replay.tracks` alone is the payload that dominates report.json.
        // A wholesale carry would be a silent 100x regression.
        const set: any = buildNativeCarrySet(report);
        expect(Object.keys(set.blocks)).toEqual(['replay']);
    });

    it('omits blocks entirely when the report has no replay block', () => {
        const set: any = buildNativeCarrySet({ ...report, blocks: { damage: {} } });
        expect(set.blocks).toBeUndefined();
    });

    it('still returns null for a non-native object', () => {
        expect(buildNativeCarrySet({ encounter: {} })).toBeNull();
    });

    it('declares blocks.replay in CARRIED_PATHS', () => {
        expect(CARRIED_PATHS).toContain('blocks.replay');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/nativeCarrySet.test.ts`
Expected: FAIL — `CARRIED_PATHS` is not exported; `set.blocks` is `undefined`.

- [ ] **Step 3: Implement**

Replace the body of `src/main/nativeCarrySet.ts`:

```ts
/**
 * The slice of axilog's native report that rides along with the EI details
 * for the duration of the migration.
 *
 * It is a WHITELIST, and it grows one migration unit at a time. Entries are
 * dotted PATHS, not top-level keys, because `blocks` must never be carried
 * wholesale: it is 2.4 MB against a 22.8 KB unit-1+2 carry-set, and
 * `replay.tracks` inside it is the payload that dominates `report.json`.
 *
 * Unit 3 adds `blocks.replay`. Measured on `wvw-small.anon.zevtc`: the
 * interval half (`by_entity`) plus `arena`/`poll_ms` is 6.3 KB; the 284 KB of
 * `tracks.by_entity` replaces EI's `combatReplayData.positions`, which the
 * details object already carries and which `pruneDetailsForStats` already
 * governs via the user's `parseCombatReplay` setting — so the net is roughly
 * flat, not +290 KB.
 *
 * When a unit migrates, add its path and re-measure.
 */
export const CARRIED_PATHS = [
    'axilog',
    'encounter',
    'entities',
    'coverage',
    'blocks.replay',
] as const;

export type CarriedPath = (typeof CARRIED_PATHS)[number];

export type NativeCarrySet = Record<string, unknown>;

export const buildNativeCarrySet = (report: unknown): NativeCarrySet | null => {
    if (!report || typeof report !== 'object') return null;
    const src = report as Record<string, any>;
    // A real native report always carries `axilog`. Its absence means we were
    // handed something else, and attaching a half-built carry-set would make
    // readers believe native data is present.
    if (!src.axilog || typeof src.axilog !== 'object') return null;

    const out: NativeCarrySet = {};
    for (const path of CARRIED_PATHS) {
        const parts = path.split('.');
        let from: any = src;
        for (const part of parts) {
            if (from === undefined || from === null) break;
            from = from[part];
        }
        if (from === undefined) continue;

        // Materialise only the containers this path actually needs, so a
        // carried `blocks` holds `replay` and nothing else.
        let to: any = out;
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof to[parts[i]] !== 'object' || to[parts[i]] === null) to[parts[i]] = {};
            to = to[parts[i]];
        }
        to[parts[parts.length - 1]] = from;
    }
    return out;
};
```

Update the `CARRIED_KEYS` import in every consumer (`grep -rn CARRIED_KEYS src/`) to `CARRIED_PATHS`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/nativeCarrySet.test.ts`
Expected: PASS.

- [ ] **Step 5: Measure the real payload delta**

```bash
node -e "
const {parseFile}=require('@axiapps/axilog');
const {buildNativeCarrySet}=require('./dist-electron/main/nativeCarrySet.js');
const n=parseFile('test-fixtures/axilog/wvw-small.anon.zevtc',{everything:true});
const kb=o=>(Buffer.byteLength(JSON.stringify(o))/1024).toFixed(1)+' KB';
console.log('carry-set now:', kb(buildNativeCarrySet(n)));
"
```
Expected: ~307 KB (22.8 + 6.3 + 284.4 for tracks). Record the number in the commit message. If it exceeds 320 KB, stop — something beyond `blocks.replay` is being carried.

- [ ] **Step 6: Commit**

```bash
git add src/main/nativeCarrySet.ts src/main/__tests__/nativeCarrySet.test.ts
git commit -m "feat(main): carry blocks.replay via a path-based carry-set

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Delete `deriveDistanceScalars`

**Files:**
- Modify: `src/main/axilogParser.ts` (delete lines 120–365 and the call at 568)
- Modify: `src/main/__tests__/axilogParser.test.ts` (delete its tests)

This is the deletion the spec deferred at line 177. It is safe only once Task 1 lands, because `distToCom`/`stackDist` had no other source.

- [ ] **Step 1: Confirm nothing else calls it**

```bash
grep -rn "deriveDistanceScalars\|NO_DISTANCE\|DEFAULT_POLLING_RATE_MS" src/ packages/ --include=*.ts --include=*.tsx
```
Expected: hits only in `src/main/axilogParser.ts`, its test file, and the new `nativePositioning.ts` (which defines its own `NO_DISTANCE`). If any renderer file imports `NO_DISTANCE` from the parser, re-point it at `@axiapps/bridge-metrics/nativePositioning` in this step.

- [ ] **Step 2: Write the failing test**

```ts
// src/main/__tests__/axilogParser.test.ts — replace the deriveDistanceScalars describe block
describe('the parser no longer fabricates distance scalars', () => {
    it('exports no deriveDistanceScalars', async () => {
        const mod = await import('../axilogParser');
        expect((mod as any).deriveDistanceScalars).toBeUndefined();
    });

    it('leaves statsAll[0].distToCom absent on parsed details', async () => {
        // Absent beats invented. The EI side never carried these; axibridge
        // reconstructed them from pixel arrays with a rounded inchToPixel
        // (-3.12% systematic) and a first-commander-track approximation.
        // Native measures them properly — see nativePositioning.
        const { parseAxilog } = await import('../axilogParser');
        const details: any = await parseAxilog(FIXTURE_PATH);
        expect(details.players[0].statsAll?.[0]?.distToCom).toBeUndefined();
        expect(details.players[0].statsAll?.[0]?.stackDist).toBeUndefined();
    });
});
```

(Match `parseAxilog`'s real exported name and signature from the file; adjust the call, not the assertion.)

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/axilogParser.test.ts`
Expected: FAIL — `deriveDistanceScalars` is still defined and still writes the fields.

- [ ] **Step 4: Delete**

Remove from `src/main/axilogParser.ts`:
- the entire `// ─── Derived distance-to-tag scalars ───` section, lines 120–365 (`NO_DISTANCE`, `DEFAULT_POLLING_RATE_MS`, `Interval`, `isFiniteNumber`, `toIntervals`, `inAnyInterval`, `PolledTrack`, `readTrack`, `positionAtPoll`, `deriveDistanceScalars`)
- the `deriveDistanceScalars(details);` call at line 568
- the paragraph in `mapEiSettingsToAxilogOptions`' doc comment (lines 90–92) that justifies `replay: true` by "it is the input to the derived `distToCom`/`stackDist` scalars below" — `replay: true` is still correct, but now because it gates `blocks.replay.tracks` and the `dist_to_com` pass. Rewrite that clause rather than deleting the flag.

If `isFiniteNumber` is used elsewhere in the file, keep it and delete only the rest.

- [ ] **Step 5: Run tests**

```bash
npx vitest run --maxWorkers=2 src/main/__tests__/axilogParser.test.ts
npm run typecheck
```
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/axilogParser.ts src/main/__tests__/axilogParser.test.ts
git commit -m "refactor(main): delete deriveDistanceScalars

axilog measures dist_to_com/stack_dist in-core; the axibridge
reconstruction carried a -3.12% inchToPixel rounding error and a
first-commander-track approximation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Rewrite `positioning.ts` onto native

**Files:**
- Modify: `packages/bridge-metrics/src/positioning.ts`
- Test: `packages/bridge-metrics/src/__tests__/positioning.test.ts`

**Interfaces:**
- Consumes: `getArena`, `getPollMs`, `getPositionTracks`, `positionAt`, `getDistanceScalars`, `worldToPixel` from `./nativePositioning`; `getNativeEntities` from `./nativeRoster` (for squad membership and the commander).
- Produces: unchanged public API — `computePositioning`, `classifyDegree`, `OUT_OF_POSITION`, and every exported type. `PositioningFigure.map` changes shape (see below); that is the one breaking change and it is deliberate.

The five poll-offset loops collapse into one `positionAt(track, tMs)` call each. Every `/ inchToPixel` is deleted — samples are already inches.

`PositioningFigure.map` currently carries `{ sizes, inchToPixel }`, both EI renderer artifacts. It becomes `{ arena: ArenaProjection | null }`. Consumers project with `worldToPixel(arena, x, y, canvasSize)` at draw time, which is what lets unit 3b keep the tiles calibrated. `figure.tagPath`, `.deaths`, `.downs` and `.squadMass` are now **world inches**, not pixels.

- [ ] **Step 1: Write the failing test**

```ts
// packages/bridge-metrics/src/__tests__/positioning.test.ts
import { describe, it, expect } from 'vitest';
import { computePositioning, classifyDegree, OUT_OF_POSITION } from '../positioning';

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'x',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

/** Two players 1000 inches apart on x, plus a commander at the origin. */
const report = () => ({
    details: {
        native: {
            axilog: { schema: '1.0' },
            entities: [
                { id: 1, account: 'Cmdr.1111', role: 'squad', commander: { guid: 'g', segments: [[0, 900]], variant: 'blue' } },
                { id: 2, account: 'Near.2222', role: 'squad' },
                { id: 3, account: 'Far.3333', role: 'squad' },
            ],
            blocks: {
                replay: {
                    by_entity: {
                        1: { start_ms: 0, end_ms: 900, active_ms: 900, down: [], dead: [], dc: [], dist_to_com: 0, stack_dist: 500 },
                        2: { start_ms: 0, end_ms: 900, active_ms: 900, down: [], dead: [], dc: [], dist_to_com: 200, stack_dist: 300 },
                        3: { start_ms: 0, end_ms: 900, active_ms: 900, down: [], dead: [], dc: [], dist_to_com: 2000, stack_dist: 1500 },
                    },
                    tracks: {
                        poll_ms: 300,
                        arena: ARENA,
                        by_entity: {
                            1: { samples: [[300, 0, 0], [600, 0, 0], [900, 0, 0]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                            2: { samples: [[300, 200, 0], [600, 200, 0], [900, 200, 0]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                            3: { samples: [[300, 2000, 0], [600, 2000, 0], [900, 2000, 0]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                        },
                    },
                },
            },
        },
        durationMS: 900,
    },
});

describe('computePositioning on native', () => {
    it('classifies a log with tracks as full', () => {
        expect(classifyDegree(report())).toBe('full');
    });

    it('falls back to coarse when only the scalars are present', () => {
        const r = report();
        delete (r.details.native.blocks.replay as any).tracks;
        expect(classifyDegree(r)).toBe('coarse');
    });

    it('reports distances in world inches with no pixel conversion', () => {
        // 200 inches is 200 inches. Under the old path this was
        // hypot(px) / 0.009 and read ~3.12% short.
        const out = computePositioning(report());
        const near = out.perPlayer.find((p) => p.account === 'Near.2222')!;
        expect(near.avgDistToTag).toBe(200);
        expect(near.peakDistToTag).toBe(200);
    });

    it('omits the commander from the distance ranking', () => {
        const out = computePositioning(report());
        expect(out.perPlayer.map((p) => p.account)).toEqual(['Far.3333', 'Near.2222']);
    });

    it('carries the arena instead of sizes/inchToPixel', () => {
        const out = computePositioning(report());
        expect(out.figure!.map).toEqual({ arena: ARENA });
        expect((out.figure!.map as any).inchToPixel).toBeUndefined();
    });

    it('emits tagPath in world inches', () => {
        const out = computePositioning(report());
        expect(out.figure!.tagPath[0]).toEqual([0, 0]);
    });

    it('computes squad spread as the mean non-commander distance to tag', () => {
        const out = computePositioning(report());
        // (200 + 2000) / 2 = 1100 at every tick
        expect(out.squad!.avgSpread).toBe(1100);
    });

    it('measures commander lead against the squad centroid', () => {
        const out = computePositioning(report());
        // centroid of (200,0) and (2000,0) is (1100,0); tag is at origin
        expect(out.commander!.squadFollowLag).toBe(1100);
    });

    it('does not shift a track whose start is mid-poll', () => {
        // The regression this unit exists for. Entity 2's first sample is at
        // t=300 regardless of a start_ms of 2; the old floor(2/300)=0 offset
        // read it as t=0 and compared it against the wrong tag tick. 36 of 42
        // players on the committed fixture had a non-multiple start.
        const r = report();
        r.details.native.blocks.replay.by_entity[2].start_ms = 2;
        expect(computePositioning(r).perPlayer.find((p) => p.account === 'Near.2222')!.avgDistToTag).toBe(200);
    });

    it('degrades to coarse numbers from the native scalars', () => {
        const r = report();
        delete (r.details.native.blocks.replay as any).tracks;
        const out = computePositioning(r);
        expect(out.degree).toBe('coarse');
        expect(out.perPlayer).toEqual([
            { account: 'Far.3333', avgDistToTag: 2000, peakDistToTag: 2000 },
            { account: 'Near.2222', avgDistToTag: 200, peakDistToTag: 200 },
        ]);
        expect(out.figure).toBeUndefined();
    });

    it('returns degree none for a log with no native replay at all', () => {
        const out = computePositioning({ details: {} });
        expect(out.degree).toBe('none');
        expect(out.perPlayer).toEqual([]);
        expect(out.squad).toBeNull();
    });

    it('still flags out-of-position deaths past the threshold', () => {
        const r = report();
        r.details.native.blocks.replay.tracks.by_entity[3].dead_intervals = [[600, 900]];
        r.details.native.blocks.replay.by_entity[3].dead = [[600, 900]];
        const out = computePositioning(r);
        expect(OUT_OF_POSITION).toBe(1200);
        expect(out.outOfPositionDeaths[0]).toMatchObject({ account: 'Far.3333', distAtDown: 2000 });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 packages/bridge-metrics/src/__tests__/positioning.test.ts --root packages/bridge-metrics`
Expected: FAIL — `classifyDegree` reads `report.details.combatReplayMetaData` and returns `'none'`.

- [ ] **Step 3: Rewrite**

Replace the EI plumbing at the top of `positioning.ts`:

```ts
import {
    getArena, getPollMs, getPositionTracks, getDistanceScalars, positionAt,
    type ArenaProjection, type PositionTrack, NO_DISTANCE,
} from './nativePositioning'
import { getNativeEntities } from './nativeRoster'

export type ReplayDegree = 'full' | 'coarse' | 'none'

/** The details object, reached through `.native`. Kept loose for the migration. */
export type ParsedReport = { details?: any }
```

Change `PositioningFigure.map`:

```ts
export type PositioningFigure = {
  /**
   * The static geometry a renderer needs to project the world-inch
   * coordinates below. Replaces EI's `{sizes, inchToPixel}` — both were
   * renderer artifacts (a 750px-max squeeze and a 3dp rounding) derivable
   * from this, while this is not derivable from them. `null` for maps with no
   * arena image, where a caller must fall back to a bounding box.
   */
  map: { arena: ArenaProjection | null }
  /** Down-sampled tag path in WORLD INCHES, ~1 point/sec. */
  tagPath: Array<[number, number]>
  squadMass: { x: number; y: number; r: number }
  deaths: Array<[number, number]>
  downs: Array<[number, number]>
  spread: Array<[number, number]>
  peakSpread: number
}
```

Rewrite the body against these rules, applied uniformly:

1. **Squad membership** comes from `getNativeEntities(report.details)` filtered to `role === 'squad'`, not from `!p.notInSquad`. Keep a per-entity-id map so tracks and roster join on `id`.
2. **The commander** is the entity carrying `commander`, not `hasCommanderTag`.
3. **The tick grid** is `poll_ms` from `getPollMs`; iterate `t = poll_ms, 2*poll_ms, …` up to the last sample time across all tracks. Never index by array position.
4. **Every lookup** is `positionAt(track, t)` — no `playerOffset`, no `clamp` into an array.
5. **Every distance** is `Math.hypot(px - tx, py - ty)`. Delete `/ inchToPixel` everywhere.
6. **`classifyDegree`** returns `'full'` when a commander track with samples and a positive `poll_ms` exist; `'coarse'` when `getDistanceScalars` yields any entry whose `distToCom` is non-null and not `NO_DISTANCE`; else `'none'`.
7. **Coarse `perPlayer`** reads `getDistanceScalars` directly rather than `resolveCommanderDistance(statsAll[0].distToCom)`; drop the `dashboardMetrics` import if it becomes unused.
8. **Death and down positions** come from `by_entity[id].dead` / `.down` intervals joined to `positionAt(track, interval[0])`. The old `linkedDeathHits` "down entry whose second value exists in the dead set" heuristic goes away — native's `dead` intervals are already the deaths.

- [ ] **Step 4: Build and run**

```bash
npm --prefix packages/bridge-metrics run build
npx vitest run --maxWorkers=2 packages/bridge-metrics/src/__tests__/positioning.test.ts --root packages/bridge-metrics
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bridge-metrics/src/positioning.ts packages/bridge-metrics/src/__tests__/positioning.test.ts
git commit -m "refactor(bridge-metrics): positioning on native world coordinates

Collapses five hand-rolled poll-offset loops onto positionAt() and
drops every inchToPixel division.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `movementData.ts` re-points at the native surface

**Files:**
- Modify: `src/shared/movementData.ts`
- Test: `src/shared/__tests__/movementData.test.ts`

`movementData.ts` exists to hold the poll-index arithmetic in one place, and it is one of only two call sites that got `ceil` right. Native's self-timestamped samples make the arithmetic itself unnecessary, so the module becomes a shared *shape* rather than a shared *calculation*.

**Interfaces:**
- Consumes: `PositionTrack`, `positionAt`, `getPositionTracks`, `getPollMs`, `getArena` from `@axiapps/bridge-metrics/nativePositioning` — the **subpath**, because `src/shared/**` is compiled by `electron/tsconfig.json`.
- Produces: `MovementData` (`{ pollMs, arena, tracks }`), `buildMovementData(details)`, and re-exports of `PositionTrack`/`positionAt`. `firstPollOf` and the `pollingRate`/`inchToPixel` fields are DELETED.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/__tests__/movementData.test.ts
import { describe, it, expect } from 'vitest';
import { buildMovementData, positionAt } from '../movementData';

const log = {
    native: {
        axilog: { schema: '1.0' },
        blocks: {
            replay: {
                by_entity: { 5: { start_ms: 7, end_ms: 900, active_ms: 893, down: [], dead: [], dc: [] } },
                tracks: {
                    poll_ms: 300,
                    arena: { image_width: 697, image_height: 1000, image_url: 'x', world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008 },
                    by_entity: { 5: { samples: [[300, 10, 20], [600, 30, 40]], down_intervals: [], dead_intervals: [], dc_intervals: [] } },
                },
            },
        },
    },
};

describe('buildMovementData', () => {
    it('carries pollMs, arena and tracks', () => {
        const md = buildMovementData(log)!;
        expect(md.pollMs).toBe(300);
        expect(md.arena!.image_width).toBe(697);
        expect(md.tracks.get(5)!.samples).toHaveLength(2);
    });

    it('returns null without a native replay block', () => {
        expect(buildMovementData({})).toBeNull();
    });

    it('resolves a position by timestamp, ignoring start_ms entirely', () => {
        // start_ms is 7 — a non-multiple of the 300ms grid. The old
        // firstPoll arithmetic is what 36 of 42 fixture players tripped;
        // there is now nothing to compute.
        const md = buildMovementData(log)!;
        expect(positionAt(md.tracks.get(5)!, 300)).toEqual([10, 20]);
        expect(positionAt(md.tracks.get(5)!, 600)).toEqual([30, 40]);
    });

    it('exposes no poll-index helpers any more', async () => {
        const mod: any = await import('../movementData');
        expect(mod.firstPollOf).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/shared/__tests__/movementData.test.ts`
Expected: FAIL — `buildMovementData` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/shared/movementData.ts
/**
 * The shared movement surface.
 *
 * This module used to own the poll-index arithmetic — `positions[i]` belongs
 * to poll `ceil(start / pollingRate) + i` — because five call sites each
 * re-derived it and four of them used `floor`, shifting 86% of players by one
 * 300ms tick. axilog's native samples are `[t_ms, x, y]`, so there is no index
 * to derive and the whole class of bug is gone. What remains shared is the
 * SHAPE, not the calculation.
 *
 * Subpath import, not the package root: `src/shared/**` is also compiled by
 * `electron/tsconfig.json`, whose Node10 resolver cannot see the root
 * `exports` map. See `src/main/bridgeMetricsRoot.d.ts`.
 */
import {
    getArena, getPollMs, getPositionTracks, positionAt,
    type ArenaProjection, type PositionTrack,
} from '@axiapps/bridge-metrics/nativePositioning';

export type { ArenaProjection, PositionTrack };
export { positionAt };

export interface MovementData {
    /** The replay polling interval in ms. */
    pollMs: number;
    /** `null` for maps GW2EI ships no arena image for. */
    arena: ArenaProjection | null;
    /** Keyed by entity id. Includes enemy players, not just the squad. */
    tracks: Map<number, PositionTrack>;
}

export const buildMovementData = (details: any): MovementData | null => {
    const pollMs = getPollMs(details);
    if (pollMs === null || pollMs <= 0) return null;
    const tracks = getPositionTracks(details);
    if (tracks.size === 0) return null;
    return { pollMs, arena: getArena(details), tracks };
};
```

Update every importer found by `grep -rn "from '.*movementData'" src/`.

- [ ] **Step 4: Run tests and typecheck**

```bash
npx vitest run --maxWorkers=2 src/shared/__tests__/movementData.test.ts
npm run typecheck
```
Expected: PASS; typecheck clean (this is where a package-root import would fail).

- [ ] **Step 5: Commit**

```bash
git add src/shared/movementData.ts src/shared/__tests__/movementData.test.ts
git commit -m "refactor(shared): movementData re-points at native tracks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The four renderer compute modules

**Files:**
- Modify: `src/renderer/stats/computeDistanceToTag.ts`
- Modify: `src/renderer/stats/computeOnTagReview.ts`
- Modify: `src/renderer/stats/computeTagDistanceDeaths.ts`
- Modify: `src/renderer/stats/computeStabPerformance.ts`
- Test: the existing `__tests__` file beside each

**Interfaces:**
- Consumes: `buildMovementData`, `positionAt` from `../../shared/movementData`; `getDistanceScalars` from `@axiapps/bridge-metrics/nativePositioning`; `getNativeEntities` from `@axiapps/bridge-metrics/nativeRoster`.
- Produces: unchanged public signatures. Only the internals change.

All four run the same transformation. Do them **one file per commit**, running that file's tests between, so a regression is bisectable.

For each file:

- [ ] **Step 1: Add the regression test to that file's existing test suite**

```ts
it('does not shift a mid-poll track against the tag', () => {
    // The bug: playerOffset = Math.floor(start / pollingRate) where the
    // correct answer is ceil — samples are emitted for multiples of the
    // polling rate INSIDE [start, end], so a start of 2ms means the first
    // sample is at t=300, poll 1, not poll 0. 36 of 42 players on the
    // committed fixture have a non-multiple start.
    //
    // Native samples carry their own t_ms, so this asserts the value is
    // simply correct rather than asserting which rounding was used.
    const result = <the module's entry point>(logWithMidPollStart);
    expect(<the distance for the mid-poll player>).toBe(<the exact expected inches>);
});

it('reports world inches, not pixels divided by a rounded scale', () => {
    // EI's inchToPixel is rounded to 3dp (0.009 vs a true 0.0087193), so
    // every distance the old path produced read 3.12% short.
    const result = <entry point>(logWithTwoPlayers1000InchesApart);
    expect(<the distance>).toBe(1000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/<file>.test.ts`
Expected: FAIL.

- [ ] **Step 3: Migrate the module**

Apply, in each file:

| Delete | Replace with |
|---|---|
| `const replayMeta = details?.combatReplayMetaData \|\| {}` | `const md = buildMovementData(details)` |
| `const pollingRate = replayMeta?.pollingRate > 0 ? … : 0` | `md?.pollMs` |
| `const inchToPixel = replayMeta?.inchToPixel > 0 ? … : 0` | *(nothing — delete every use)* |
| `commander = players.find(p => p?.hasCommanderTag)` | the `getNativeEntities` entry carrying `commander` |
| `tagPositions = commander?.combatReplayData?.positions` | `md.tracks.get(commanderEntityId)` |
| `const playerOffset = Math.floor(start / pollingRate)` | *(nothing)* |
| `positions[clamp(i - playerOffset, 0, len - 1)]` | `positionAt(track, t)` |
| `Math.hypot(px - tx, py - ty) / inchToPixel` | `Math.hypot(px - tx, py - ty)` |
| `player?.statsAll?.[0]?.distToCom` | `getDistanceScalars(details).get(entityId)?.distToCom` |
| `Math.floor(downStartMs / pollingRate)` then index | `positionAt(track, downStartMs)`, and if that is `null`, snap to the nearest sample at or before `downStartMs` — a down event is not on the polling grid, so an exact hit is not expected here |

`computeStabPerformance.ts` has two offsets (lines 106, 177) reading `playerSeg`/`cmdSeg`; both become `positionAt` calls on the respective tracks.

`computeOnTagReview.ts` additionally computes `tagDeathPoll` from `Math.floor(tagDeathMs / pollingRate)` and compares poll indices; compare **timestamps** instead and delete the poll conversion.

- [ ] **Step 4: Run that file's tests**

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/<file>.test.ts`
Expected: PASS.

Where an existing assertion's expected number moves, that is Bug 2 surfacing: the old value was 3.12% short. Recompute the expectation from the fixture and note the old/new pair in the commit message. Do not adjust a tolerance to make an old number pass.

- [ ] **Step 5: Commit (one per file)**

```bash
git add src/renderer/stats/<file>.ts src/renderer/stats/__tests__/<file>.test.ts
git commit -m "refactor(stats): <file> on native positions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The unit-3 oracle

**Files:**
- Create: `src/test/__tests__/unit3Positioning.oracle.test.ts`

This is the gate the whole unit is pinned by, and it is the deliverable that states — in writing, per divergence — which side is right.

**Interfaces:**
- Consumes: `oracleFixture`, `expectEqualOrAllowlisted`, `FIXTURE_PATH`, `DivergenceAllowlist` from `../axilogOracle`.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { getArena, getPollMs, getPositionTracks, getDistanceScalars, worldToPixel } from '@axiapps/bridge-metrics/nativePositioning';

const ALLOWLIST: DivergenceAllowlist = {
    'per-instant position': {
        reason:
            'Native is right, and the difference is a sampling divergence, not a '
            + 'projection error. GW2EI\'s ei_replay::handle_position freezes an actor '
            + 'across a >600ms gap whose last velocity reads ~zero and then snaps to '
            + 'the next real point; axilog\'s native downsampler interpolates straight '
            + 'through. Median projected difference across 6,877 samples on this '
            + 'fixture is 0.0005px (pure rounding), but a minority of instants hold '
            + 'genuinely different positions -- one player held for three polls then '
            + 'jumped ~40 inches. Native\'s trajectory is the more faithful '
            + 'reconstruction and is golden-tested in axilog; changing it would move '
            + 'calibrated distance goldens there.',
    },
    'distance scalars': {
        reason:
            'There is no EI side to compare. axilog\'s to_ei_json never emitted '
            + 'statsAll[0].distToCom/stackDist -- measured absent for all 42 players '
            + 'on this fixture -- which is precisely why axibridge carried '
            + 'deriveDistanceScalars. That reconstruction is wrong twice over: it '
            + 'divided by EI\'s inchToPixel, rounded to 3dp (0.009 against a true '
            + '0.0087193, so every distance read 3.12% short), and it used the first '
            + 'player carrying hasCommanderTag as the reference for the whole fight '
            + 'because ei-json exposes no commander segments. Native computes both '
            + 'in-core from real segments in world inches. Unit 3 deletes the '
            + 'reconstruction rather than reconciling it.',
    },
};

describe('unit 3 oracle — positioning, EI vs native', () => {
    const { ei, native } = oracleFixture();
    const withNative = { native } as any;

    it('agrees on the polling rate', () => {
        expectEqualOrAllowlisted('polling rate', ei.combatReplayMetaData.pollingRate, getPollMs(withNative), {});
    });

    it('reproduces EI\'s canvas size from the arena', () => {
        // EI squeezes the arena to a 750px max dimension. That is recoverable
        // from the native geometry; the native geometry is not recoverable
        // from it. Asserting the direction that holds.
        const a = getArena(withNative)!;
        const [w, h] = ei.combatReplayMetaData.sizes;
        const scale = Math.min(750 / a.image_width, 750 / a.image_height);
        expect(Math.round(a.image_width * scale)).toBe(w);
        expect(Math.round(a.image_height * scale)).toBe(h);
    });

    it('projects onto EI\'s own pixel space to sub-pixel median error', () => {
        const a = getArena(withNative)!;
        const sizes = ei.combatReplayMetaData.sizes as [number, number];
        const poll = getPollMs(withNative)!;
        const eiByAccount = new Map<string, any>();
        for (const p of ei.players ?? []) eiByAccount.set(p.account, p.combatReplayData);

        const errors: number[] = [];
        for (const [id, track] of getPositionTracks(withNative)) {
            const entity = native.entities.find((e) => e.id === id);
            const crd = entity ? eiByAccount.get(entity.account) : null;
            if (!crd?.positions?.length) continue;
            // CEIL: a track's first polled instant is its first-aware time
            // rounded UP onto the polling grid. Flooring shifts the whole
            // track one poll and makes a correct projection look broken.
            const first = Math.ceil(Number(crd.start) / poll) * poll;
            for (const [t, x, y] of track.samples) {
                const idx = (t - first) / poll;
                if (!Number.isInteger(idx) || idx < 0 || idx >= crd.positions.length) continue;
                const [px, py] = worldToPixel(a, x, y, sizes);
                const [ex, ey] = crd.positions[idx];
                errors.push(Math.hypot(px - ex, py - ey));
            }
        }
        expect(errors.length).toBeGreaterThan(1000);
        errors.sort((p, q) => p - q);
        const median = errors[Math.floor(errors.length / 2)];
        // MEDIAN, not max, and that is the only honest assertion here -- see
        // the 'per-instant position' allowlist entry.
        expect(median).toBeLessThan(0.01);
    });

    it('records the sampling divergence as reviewed, not as agreement', () => {
        expectEqualOrAllowlisted('per-instant position', 'ei-holds', 'native-interpolates', ALLOWLIST);
    });

    it('records that EI has no distance scalars to compare against', () => {
        expectEqualOrAllowlisted('distance scalars', null, null, ALLOWLIST);
    });

    it('confirms the EI side really is empty, so the allowlist entry is honest', () => {
        // If a future axilog starts emitting these, this fails and the
        // allowlist entry above must be revisited rather than kept on faith.
        for (const p of ei.players ?? []) {
            expect(p.statsAll?.[0]?.distToCom).toBeUndefined();
            expect(p.statsAll?.[0]?.stackDist).toBeUndefined();
        }
    });

    it('measures every squad member and reports a plausible spread', () => {
        const scalars = getDistanceScalars(withNative);
        expect(scalars.size).toBe(42);
        const measured = [...scalars.values()].map((s) => s.distToCom).filter((v): v is number => v !== null && v >= 0);
        expect(measured).toHaveLength(42);
        expect(Math.min(...measured)).toBe(0);          // the commander's own value
        expect(Math.max(...measured)).toBeGreaterThan(20000); // a genuine straggler
    });

    it('has an arena for this map and lands every sample inside it', () => {
        const a = getArena(withNative)!;
        expect(native.encounter.map_id).toBe(95);
        expect(a.image_width).toBe(697);
        let checked = 0;
        for (const track of getPositionTracks(withNative).values()) {
            for (const [, x, y] of track.samples) {
                const [px, py] = worldToPixel(a, x, y);
                expect(px).toBeGreaterThanOrEqual(0);
                expect(px).toBeLessThanOrEqual(a.image_width);
                expect(py).toBeGreaterThanOrEqual(0);
                expect(py).toBeLessThanOrEqual(a.image_height);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(1000);
    });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run --maxWorkers=2 src/test/__tests__/unit3Positioning.oracle.test.ts`
Expected: PASS. If the median projection assertion fails, check the `ceil` first — that is the single most likely cause and it is not a real divergence.

- [ ] **Step 3: Commit**

```bash
git add src/test/__tests__/unit3Positioning.oracle.test.ts
git commit -m "test: unit 3 equality oracle for positioning

Two reviewed divergences: EI's hold-across-stalled-velocity sampling,
and EI having no distance scalars at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Full-suite verification and the cutover report

**Files:**
- Modify: `docs/axilog-cutover-report.md`

- [ ] **Step 1: Run everything**

```bash
npm --prefix packages/bridge-metrics run build
npm --prefix packages/bridge-metrics test
npm run validate
npm run test:unit
```
Expected: all green. `npm run validate` is `typecheck + lint` with `--max-warnings 0`.

**Note the known gap:** the root vitest config globs only `src/**`, so `packages/bridge-metrics`' tests do NOT run under `npm run test:unit` and no CI workflow invokes the package's own `test` script. Run it explicitly as above. Do not "fix" the config in this unit — it is a separate ticket.

- [ ] **Step 2: Re-run the metric audits**

```bash
npm run audit:metrics
```
Expected: no new failures. Any distance-related audit value that moves by ~3.12% is Bug 2 being fixed; record the before/after rather than pinning the audit to the old number.

- [ ] **Step 3: Update the cutover report**

Add a unit-3 section to `docs/axilog-cutover-report.md` recording:
- `deriveDistanceScalars` deleted; its "3.7% mean on `distToCom`, 4.3% on `stackDist`" follow-up is **closed**, and the breakdown: ~3.12% was EI's rounded `inchToPixel`, the remainder the first-commander-track approximation.
- The poll-offset off-by-one: 36 of 42 fixture players affected, five call sites, fixed structurally by self-timestamped samples.
- Carry-set now includes `blocks.replay`; the measured size from Task 2 Step 5.
- The two oracle allowlist entries and why each stands.
- Unit 3b's remaining scope (the renderer map surface, `wvwTiles`, `wvwLandmarks`, `mapUtils`).

- [ ] **Step 4: Commit**

```bash
git add docs/axilog-cutover-report.md
git commit -m "docs: record unit 3 in the cutover report

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Finish the branch**

**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch. Base branch is `main`.

---

## Self-Review

**Spec coverage.** The spec's unit 3 row names `positioning.ts` (Task 4), `computeDistanceToTag.ts` / `computeOnTagReview.ts` / `computeTagDistanceDeaths.ts` (Task 6), and `computeTimelineAndMapData.ts`. The last does not exist under that name in the tree; its responsibilities live in `src/renderer/stats/map/` and are deferred to unit 3b with a written reason (they are pixel-calibrated against `wvwTiles.ts` and must migrate as one piece). `computeStabPerformance.ts` is added to unit 3 because it carries the same two offset bugs at lines 106 and 177 and would otherwise be the last EI position reader in the stats path. The spec's line-177 deferral of `deriveDistanceScalars` is Task 3.

**Placeholders.** Task 6's steps are templated across four files rather than written out four times, because the transformation is a fixed table applied per file and the per-file specifics (line numbers, the two extra `computeStabPerformance` offsets, `computeOnTagReview`'s poll comparison) are named explicitly. The `<entry point>` placeholders in its Step 1 are the one deliberate exception: each module's signature differs and the implementer reads it in Step 3's table.

**Type consistency.** `ArenaProjection`, `PositionTrack`, `PositionSample`, `DistanceScalars`, `NO_DISTANCE`, `getArena`, `getPollMs`, `getPositionTracks`, `getPositionTrack`, `positionAt`, `getDistanceScalars`, `worldToPixel` are defined in Task 1 and used under those exact names in Tasks 4–7. `buildMovementData` / `MovementData` are defined in Task 5 and used in Task 6. `CARRIED_PATHS` replaces `CARRIED_KEYS` in Task 2 and is referenced nowhere earlier.
