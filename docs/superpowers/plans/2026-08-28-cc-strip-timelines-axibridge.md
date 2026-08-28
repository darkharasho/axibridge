# CC and Strip Timelines — Part B: AxiBridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface axilog's new CC and boon-strip series on three AxiBridge surfaces — squad lanes in the replay timeline, two new player x 5s-bucket stats sections, and an incoming-strips overlay on Stab Performance.

**Architecture:** Two thin readers in `bridge-metrics` own all knowledge of the `blocks.series` shape. A new per-fight accumulator follows the `computeStabPerformance` contract so the Web Worker path works unchanged and the web report renders without log details. The replay reads the 1s squad series directly, bypassing the accumulator.

**Tech Stack:** TypeScript, React, Vite, vitest + jsdom, zustand (`statsStore`), recharts.

**Spec:** `docs/superpowers/specs/2026-08-28-cc-strip-timelines-design.md`

**Depends on:** `docs/superpowers/plans/2026-08-28-cc-strip-timelines-axilog.md` — Part A must be released as `@axiapps/axilog@1.8.0` before Task 1 here.

## Global Constraints

- **Run vitest with `--maxWorkers=2`.** This machine runs heavy apps alongside dev work.
- **Load fixtures with `readFileSync`, never a static `import`.** A static import of a 30 MB `test-fixtures/native/` JSON OOMs `tsc --noEmit` at 8 GB and takes `npm run validate` down with it.
- **The axilog pin is exact — no caret, no tilde.** A range spec has previously produced "Cannot find native binding" and `npm ci` "Invalid Version:" failures.
- **Absent is not zero.** Three distinct causes yield an all-zero grid: `rawTimelineArrays` off, a log parsed before 1.8.0, and a genuinely strip-free fight. Only the third is real data. Every layer distinguishes them.
- **Series are per-bucket counts, not cumulative.** Never pad a short run by repeating the last value.
- **Bucket resolution in the accumulator is 5000 ms**, matching `StabPerfFightData`. The native series is 1000 ms and is downsampled on ingest.
- **`showIncomingHeatmap` stays a boolean for every section except Stab Performance.** `BoonTimelineSection` and `BoonUptimeSection` also consume it; only `StabPerformanceSection` changes to a mode.

---

### Task 1: Bump the axilog pin and regenerate fixtures

**Files:**
- Modify: `package.json` (the `@axiapps/axilog` dependency)
- Modify: `package-lock.json`
- Modify: `test-fixtures/native/*.json` (regenerated)

**Interfaces:**
- Consumes: `@axiapps/axilog@1.8.0` from Part A
- Produces: fixtures carrying `blocks.series.squad.strips` and per-entity `cc_applied` / `strips` / `strips_taken`, which every later task's tests read

- [ ] **Step 1: Capture the pre-bump EI-compat output**

The EI-compat surface must not move. Snapshot it before touching anything:

```bash
node -e "
const { parseFileEi } = require('@axiapps/axilog');
const out = parseFileEi(process.argv[1], {});
require('fs').writeFileSync('/tmp/ei-before.json', JSON.stringify(out));
console.log('keys:', Object.keys(out).length);
" testdata/wvw-small.anon.zevtc
```

If `testdata/wvw-small.anon.zevtc` is not present, use any `.zevtc` under `testdata/` and keep using the same one for the rest of this task.

- [ ] **Step 2: Bump the pin**

```bash
npm install --save-exact @axiapps/axilog@1.8.0
```

Verify the spec is exact, not a range:

```bash
grep '"@axiapps/axilog"' package.json
```

Expected: `"@axiapps/axilog": "1.8.0"` — no `^`, no `~`.

- [ ] **Step 3: Diff the EI-compat output**

```bash
node -e "
const { parseFileEi } = require('@axiapps/axilog');
const out = parseFileEi(process.argv[1], {});
require('fs').writeFileSync('/tmp/ei-after.json', JSON.stringify(out));
" testdata/wvw-small.anon.zevtc
diff <(jq -S . /tmp/ei-before.json) <(jq -S . /tmp/ei-after.json) && echo "EI SURFACE UNCHANGED"
```

Expected: `EI SURFACE UNCHANGED`. Part A touched only the native v1 surface. **If this diff is non-empty, stop** — a change leaked into `axilog-ei` and must be understood before proceeding, because every metric in the app reads this surface.

- [ ] **Step 4: Confirm the new lanes are actually emitted**

```bash
node -e "
const { parseFile } = require('@axiapps/axilog');
const r = parseFile(process.argv[1], { timeseries: true, replay: true, skillDamage: true, rotation: true });
const s = r.blocks.series;
console.log('squad.strips:', !!s.squad.strips, s.squad.strips && s.squad.strips.len);
const first = Object.values(s.by_entity)[0];
console.log('entity lanes:', ['cc_applied','strips','strips_taken'].map(k => k + '=' + !!first[k]).join(' '));
" testdata/wvw-small.anon.zevtc
```

Expected: `squad.strips: true <n>` and all three entity lanes `true`.

- [ ] **Step 5: Regenerate fixtures**

```bash
npm run generate:fixtures
```

- [ ] **Step 6: Run the suite and triage the expected baseline failure**

```bash
npx vitest run --maxWorkers=2
```

Expected: the `facade_identity` / native-json baseline digest test FAILS. This is expected on every axilog bump — `axilog.version` is embedded in the report, so the digest necessarily moves. Re-digest the baseline per that test's own instructions. **Every other test must pass.** A failure anywhere else is a real regression.

- [ ] **Step 7: Validate**

```bash
npm run validate
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json test-fixtures/
git commit -m "chore(deps): bump @axiapps/axilog to 1.8.0

Adds squad and per-entity CC and boon-strip series. EI-compat output
verified byte-identical; native baseline digest re-cut for the version
field."
```

---

### Task 2: Series readers in `bridge-metrics`

**Files:**
- Modify: `packages/bridge-metrics/src/nativeSeries.ts`
- Test: `packages/bridge-metrics/src/__tests__/nativeSeries.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  ```ts
  export const decodeCountSeries: (series: NativeSeries | null | undefined) => number[]
  export type SquadSeriesLane = 'damage' | 'cc_applied' | 'downs' | 'strips'
  export type EntitySeriesLane = 'cc_applied' | 'strips' | 'strips_taken'
  export const readSquadSeries: (native: any, lane: SquadSeriesLane) => number[] | null
  export const readEntitySeries: (native: any, entityId: string, lane: EntitySeriesLane) => number[] | null
  ```
  Both readers return `null` for "not recorded" and `[]` only for a genuinely empty series. Callers must not conflate them.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { decodeCountSeries, readSquadSeries, readEntitySeries } from '../nativeSeries';

describe('decodeCountSeries', () => {
    it('pads a short rle run with zeros, not the last value', () => {
        // Two CC applications at t=0, then nothing. `len` is 5 but the runs
        // cover only the first 2 buckets.
        const series = { enc: 'rle', interval_ms: 1000, len: 5, data: [[2, 1], [0, 1]] as Array<[number, number]> };
        expect(decodeCountSeries(series)).toEqual([2, 0, 0, 0, 0]);
    });

    it('does not invent events when the trailing value is non-zero', () => {
        const series = { enc: 'rle', interval_ms: 1000, len: 4, data: [[3, 1]] as Array<[number, number]> };
        expect(decodeCountSeries(series)).toEqual([3, 0, 0, 0]);
    });

    it('passes raw encoding through', () => {
        const series = { enc: 'raw', interval_ms: 1000, len: 3, data: [1, 0, 2] };
        expect(decodeCountSeries(series)).toEqual([1, 0, 2]);
    });
});

describe('readSquadSeries', () => {
    const native = {
        blocks: { series: { squad: { strips: { enc: 'raw', interval_ms: 1000, len: 3, data: [1, 0, 2] } }, by_entity: {} } },
    };

    it('decodes a present lane', () => {
        expect(readSquadSeries(native, 'strips')).toEqual([1, 0, 2]);
    });

    it('returns null for a missing lane rather than an empty array', () => {
        expect(readSquadSeries(native, 'cc_applied')).toBeNull();
    });

    it('returns null when there is no native report at all', () => {
        expect(readSquadSeries(null, 'strips')).toBeNull();
    });
});

describe('readEntitySeries', () => {
    const native = {
        blocks: { series: { squad: {}, by_entity: { 'e1': { cc_applied: { enc: 'raw', interval_ms: 1000, len: 2, data: [4, 1] } } } } },
    };

    it('decodes a present per-entity lane', () => {
        expect(readEntitySeries(native, 'e1', 'cc_applied')).toEqual([4, 1]);
    });

    it('returns null for an ungated lane that was not emitted', () => {
        expect(readEntitySeries(native, 'e1', 'strips')).toBeNull();
    });

    it('returns null for an unknown entity', () => {
        expect(readEntitySeries(native, 'nope', 'cc_applied')).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run --maxWorkers=2 packages/bridge-metrics/src/__tests__/nativeSeries.test.ts
```

Expected: FAIL — the three exports do not exist.

- [ ] **Step 3: Implement**

Append to `packages/bridge-metrics/src/nativeSeries.ts`:

```ts
/**
 * `decodeSeries`'s counterpart for NON-cumulative series — per-bucket counts
 * such as `cc_applied`, `downs` and `strips`.
 *
 * The difference is the padding rule and it is not cosmetic. `decodeSeries`
 * pads a short run by REPEATING the last value, which is correct for a
 * cumulative series and catastrophic for a count series: a fight whose last
 * encoded run is `[3, 1]` would report 3 CC applications in every remaining
 * second of the fight. Counts pad with zero.
 */
export const decodeCountSeries = (series: NativeSeries | null | undefined): number[] => {
    if (!series || !Array.isArray(series.data)) return [];
    const len = Number(series.len);
    if (!Number.isFinite(len) || len <= 0) return [];

    const out: number[] = [];
    if (series.enc === 'raw') {
        for (const v of series.data as number[]) {
            if (out.length >= len) break;
            out.push(Number(v) || 0);
        }
    } else if (series.enc === 'rle') {
        for (const pair of series.data as Array<[number, number]>) {
            if (!Array.isArray(pair)) continue;
            const value = Number(pair[0]) || 0;
            const run = Number(pair[1]) || 0;
            for (let i = 0; i < run && out.length < len; i++) out.push(value);
            if (out.length >= len) break;
        }
    } else {
        return [];
    }
    while (out.length < len) out.push(0);
    return out;
};

export type SquadSeriesLane = 'damage' | 'cc_applied' | 'downs' | 'strips';
export type EntitySeriesLane = 'cc_applied' | 'strips' | 'strips_taken';

/**
 * Read a squad-level lane out of a native report.
 *
 * Returns `null` when the lane was not recorded — a report parsed by an
 * axilog older than 1.8.0, or no native report at all — and an array
 * otherwise. `null` and `[]` mean different things and callers must keep
 * them apart: an all-zero grid drawn from `null` is a lie.
 */
export const readSquadSeries = (native: any, lane: SquadSeriesLane): number[] | null => {
    const series = native?.blocks?.series?.squad?.[lane];
    if (!series) return null;
    return decodeCountSeries(series as NativeSeries);
};

/**
 * Read a per-entity lane. These are gated on axilog's `timeseries` option
 * (bound to the `rawTimelineArrays` setting), so `null` additionally means
 * "the user has raw timeline arrays switched off".
 */
export const readEntitySeries = (
    native: any,
    entityId: string,
    lane: EntitySeriesLane,
): number[] | null => {
    const series = native?.blocks?.series?.by_entity?.[entityId]?.[lane];
    if (!series) return null;
    return decodeCountSeries(series as NativeSeries);
};
```

Note `readSquadSeries(native, 'damage')` uses the count decoder as well, because `squad_damage` is also accumulated per bucket (`squad_damage[b] += d`), not cumulatively.

- [ ] **Step 4: Run to verify they pass**

```bash
npx vitest run --maxWorkers=2 packages/bridge-metrics/src/__tests__/nativeSeries.test.ts
```

Expected: PASS, all nine.

- [ ] **Step 5: Rebuild the workspace package**

`@axiapps/bridge-metrics` resolves through `dist/`, not `src/`. Without this, every consumer gets phantom `TS2305` errors and stale behaviour:

```bash
npm run build --workspace=@axiapps/bridge-metrics
```

If that script name does not exist, read `packages/bridge-metrics/package.json` and run whichever script emits `dist/`.

- [ ] **Step 6: Commit**

```bash
git add packages/bridge-metrics/
git commit -m "feat(bridge-metrics): readers for CC and strip series

decodeCountSeries pads with zero rather than repeating the last value,
which decodeSeries does for cumulative series and which would invent
events for a count series."
```

---

### Task 3: The `computeControlTimeline` accumulator

**Files:**
- Create: `src/renderer/stats/computeControlTimeline.ts`
- Test: `src/renderer/stats/__tests__/computeControlTimeline.test.ts`

**Interfaces:**
- Consumes: `readEntitySeries`, `EntitySeriesLane` from Task 2; `squadEntities` from `@axiapps/bridge-metrics/nativeRoster` (already used by `computeStabPerformance.ts`)
- Produces:
  ```ts
  export type ControlLane = 'cc' | 'stripsOut' | 'stripsIn';
  export type ControlPlayerData = { group: number; displayName: string; cc: number[]; stripsOut: number[]; stripsIn: number[] };
  export type ControlFightData = { id: string; bucketCount: number; durationMs: number; players: Record<string, ControlPlayerData> };
  export type ControlTimelineAccumulator = { fights: ControlFightData[]; recorded: boolean };
  export type ControlTimelineFrame = ControlTimelineAccumulator;
  export function createControlTimelineAccumulator(): ControlTimelineAccumulator;
  export function ingestLogControlTimeline(log: any, acc: ControlTimelineAccumulator): void;
  export function extractControlTimelineFrame(acc: ControlTimelineAccumulator): ControlTimelineFrame;
  export function mergeControlTimelineFrame(target: ControlTimelineAccumulator, frame: ControlTimelineFrame): void;
  export function finalizeControlTimeline(acc: ControlTimelineAccumulator): { fights: ControlFightData[]; recorded: boolean };
  ```
  `recorded` is the absent-vs-empty signal: `false` means no ingested log carried per-entity lanes, so the UI must show a "needs raw timeline arrays" state rather than an empty grid.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
    createControlTimelineAccumulator,
    ingestLogControlTimeline,
    extractControlTimelineFrame,
    mergeControlTimelineFrame,
    finalizeControlTimeline,
} from '../computeControlTimeline';

/** A native report with one squad player and 10s of 1s CC buckets. */
const nativeLog = (lanes: Record<string, number[]> | null) => ({
    id: 'log-1',
    details: {
        durationMs: 10_000,
        players: [{ account: 'Alice.1234', name: 'Alice', group: 1, profession: 'Guardian' }],
        __native: {
            entities: { e1: { account: 'Alice.1234', role: 'Squad' } },
            blocks: {
                series: {
                    squad: {},
                    by_entity: lanes
                        ? { e1: Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, { enc: 'raw', interval_ms: 1000, len: v.length, data: v }])) }
                        : { e1: {} },
                },
            },
        },
    },
});

describe('computeControlTimeline', () => {
    it('downsamples 1s native buckets into 5s buckets', () => {
        const acc = createControlTimelineAccumulator();
        // 1 CC in each of the first five seconds, 2 in the sixth.
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 1, 1, 1, 1, 2, 0, 0, 0, 0] }), acc);
        const out = finalizeControlTimeline(acc);
        const player = Object.values(out.fights[0].players)[0];
        expect(player.cc[0]).toBe(5);
        expect(player.cc[1]).toBe(2);
    });

    it('reports recorded=false when no log carried per-entity lanes', () => {
        const acc = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog(null), acc);
        expect(finalizeControlTimeline(acc).recorded).toBe(false);
    });

    it('reports recorded=true for a genuinely all-zero fight', () => {
        const acc = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [0, 0, 0, 0, 0] }), acc);
        const out = finalizeControlTimeline(acc);
        expect(out.recorded).toBe(true);
        expect(Object.values(out.fights[0].players)[0].cc.every(v => v === 0)).toBe(true);
    });

    it('round-trips through a JSON frame exactly, as the worker sends it', () => {
        const direct = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 0, 3, 0, 0] }), direct);

        const solo = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 0, 3, 0, 0] }), solo);
        const frame = JSON.parse(JSON.stringify(extractControlTimelineFrame(solo)));

        const merged = createControlTimelineAccumulator();
        mergeControlTimelineFrame(merged, frame);

        expect(finalizeControlTimeline(merged)).toEqual(finalizeControlTimeline(direct));
    });
});
```

The `nativeLog` shape above is a minimal stand-in. Before writing the implementation, open `src/renderer/stats/computeStabPerformance.ts` and read how it reaches the native report and the squad roster — use the identical access path (`squadEntities`, and whatever property holds the carried native report) rather than the `__native` placeholder above, and update the test fixture to match. The test must exercise the real access path or it proves nothing.

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/computeControlTimeline.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
/**
 * Per-fight precomputed drilldown data for the CC Timeline and Strip
 * Timeline sections.
 *
 * Captures, per 5s bucket and per squad player: outgoing CC applied,
 * outgoing boon strips, and boons stripped off that player. Like
 * `computeStabPerformance`, this must run during aggregation so the web
 * report — which has no log details at render time — can still draw it.
 *
 * The native series are 1s; they are summed down to 5s here so the grid
 * lands on the same buckets as `StabPerfFightData`, which the Stab
 * Performance strips-taken overlay depends on.
 */

import { readEntitySeries } from '@axiapps/bridge-metrics';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

export const CONTROL_BUCKET_MS = 5000;
const NATIVE_INTERVAL_MS = 1000;
const PER_BUCKET = CONTROL_BUCKET_MS / NATIVE_INTERVAL_MS;

export type ControlLane = 'cc' | 'stripsOut' | 'stripsIn';

export type ControlPlayerData = {
    group: number;
    displayName: string;
    cc: number[];
    stripsOut: number[];
    stripsIn: number[];
};

export type ControlFightData = {
    id: string;
    bucketCount: number;
    durationMs: number;
    players: Record<string, ControlPlayerData>;
};

export type ControlTimelineAccumulator = {
    fights: ControlFightData[];
    /**
     * False until at least one ingested log carried per-entity lanes. The UI
     * uses this to tell "raw timeline arrays are off / this log predates
     * axilog 1.8.0" apart from "nobody stripped anything", which would
     * otherwise render identically.
     */
    recorded: boolean;
};

export type ControlTimelineFrame = ControlTimelineAccumulator;

export function createControlTimelineAccumulator(): ControlTimelineAccumulator {
    return { fights: [], recorded: false };
}

/** Sum PER_BUCKET consecutive 1s values into each 5s bucket. */
const downsample = (native: number[] | null, bucketCount: number): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    if (!native) return out;
    for (let i = 0; i < native.length; i++) {
        const b = Math.floor(i / PER_BUCKET);
        if (b < bucketCount) out[b] += Number(native[i]) || 0;
    }
    return out;
};

export function ingestLogControlTimeline(log: any, acc: ControlTimelineAccumulator): void {
    const details = log?.details;
    if (!details) return;
    const native = /* the carried native report, via the same accessor computeStabPerformance uses */ null as any;
    if (!native) return;

    const durationMs = Number(details.durationMs) || 0;
    if (durationMs <= 0) return;
    const bucketCount = Math.max(1, Math.ceil(durationMs / CONTROL_BUCKET_MS));

    const players: Record<string, ControlPlayerData> = {};
    let sawLane = false;

    for (const entity of squadEntities(native)) {
        const cc = readEntitySeries(native, entity.id, 'cc_applied');
        const stripsOut = readEntitySeries(native, entity.id, 'strips');
        const stripsIn = readEntitySeries(native, entity.id, 'strips_taken');
        if (cc || stripsOut || stripsIn) sawLane = true;

        players[entity.key] = {
            group: entity.group,
            displayName: entity.displayName,
            cc: downsample(cc, bucketCount),
            stripsOut: downsample(stripsOut, bucketCount),
            stripsIn: downsample(stripsIn, bucketCount),
        };
    }

    if (sawLane) acc.recorded = true;
    acc.fights.push({ id: String(log.id ?? ''), bucketCount, durationMs, players });
}

export function extractControlTimelineFrame(acc: ControlTimelineAccumulator): ControlTimelineFrame {
    return { fights: acc.fights, recorded: acc.recorded };
}

export function mergeControlTimelineFrame(
    target: ControlTimelineAccumulator,
    frame: ControlTimelineFrame,
): void {
    if (!frame) return;
    target.fights.push(...(frame.fights || []));
    if (frame.recorded) target.recorded = true;
}

export function finalizeControlTimeline(
    acc: ControlTimelineAccumulator,
): { fights: ControlFightData[]; recorded: boolean } {
    return { fights: acc.fights, recorded: acc.recorded };
}
```

Replace the `native` binding and the `squadEntities(native)` destructuring (`entity.id`, `entity.key`, `entity.group`, `entity.displayName`) with whatever `computeStabPerformance.ts` actually uses — read it and mirror it exactly. The property names above are the shape this module needs, not a claim about the roster helper's API.

- [ ] **Step 4: Run to verify they pass**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/computeControlTimeline.test.ts
```

Expected: PASS, all four.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeControlTimeline.ts src/renderer/stats/__tests__/computeControlTimeline.test.ts
git commit -m "feat(stats): per-fight CC and strip timeline accumulator

Downsamples axilog's 1s per-entity lanes to the 5s grid the stab-perf
sections use. Tracks recorded separately from all-zero so the UI can
distinguish 'not captured' from 'nothing happened'."
```

---

### Task 4: Wire the accumulator into `IncrementalAggregator`

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` (five sites — mirror `stabPerfAcc` at `:559`, `:610`, `:755`, `:883`/`:987`, `:1025`, `:1630`)
- Test: `src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts`

**Interfaces:**
- Consumes: the five functions from Task 3
- Produces: `controlTimelineDrilldown: { fights: ControlFightData[]; recorded: boolean }` on the aggregator result, and `controlTimeline` on the exported frame

- [ ] **Step 1: Write the failing frame test**

Append to `src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts`, following the file's existing `framesFor` helper:

```ts
it('control timeline survives the frame round-trip', () => {
    const direct = computeStatsSync({ logs: LOGS });

    const merged = new IncrementalAggregator();
    framesFor(LOGS).forEach((frame) => merged.mergeFrame(frame));

    expect(merged.finalize().controlTimelineDrilldown)
        .toEqual(direct.controlTimelineDrilldown);
});
```

If `mergeFrame` / `finalize` are named differently in this file's existing tests, use the names those tests use.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts -t "control timeline"
```

Expected: FAIL — both sides `undefined`, so the assertion passes vacuously OR fails on a missing property. If it passes vacuously, tighten it first:

```ts
    expect(direct.controlTimelineDrilldown).toBeDefined();
```

- [ ] **Step 3: Add the import and the field**

At the top of `src/renderer/stats/incrementalAggregation.ts`:

```ts
import {
    createControlTimelineAccumulator,
    ingestLogControlTimeline,
    extractControlTimelineFrame,
    mergeControlTimelineFrame,
    finalizeControlTimeline,
} from './computeControlTimeline';
```

Near `private stabPerfAcc;` (line ~559):

```ts
    private controlTimelineAcc;
```

- [ ] **Step 4: Wire the four lifecycle sites**

Next to `this.stabPerfAcc = createStabPerformanceAccumulator();` (~line 610):

```ts
        this.controlTimelineAcc = createControlTimelineAccumulator();
```

Next to `ingestLogStabPerformance(log, this.stabPerfAcc);` (~line 755):

```ts
        ingestLogControlTimeline(log, this.controlTimelineAcc);
```

Next to `stabPerformance: extractStabPerformanceFrame(this.stabPerfAcc),` (~line 883):

```ts
                controlTimeline: extractControlTimelineFrame(this.controlTimelineAcc),
```

Next to the stab-perf merge (~line 987):

```ts
        if (frame.controlTimeline) mergeControlTimelineFrame(this.controlTimelineAcc, frame.controlTimeline);
```

- [ ] **Step 5: Finalize and return it**

Next to `const stabPerformanceDrilldown = finalizeStabPerformance(this.stabPerfAcc);` (~line 1025):

```ts
        const controlTimelineDrilldown = finalizeControlTimeline(this.controlTimelineAcc);
```

and add `controlTimelineDrilldown,` to the returned object at ~line 1630, next to `stabPerformanceDrilldown`.

- [ ] **Step 6: Check the worker deny-list**

`src/renderer/stats/hooks/useStatsAggregationWorker.ts` carries `const PLAYER_DENY = ['targetBreakbarDamage1S', 'squadBuffVolumesActive'];`, which strips heavy per-player fields from the worker payload. Read that file and confirm nothing there strips the native `blocks.series` the accumulator reads. If it does, the worker path will silently produce empty grids while the inline path works — add a test for the worker path before changing anything.

- [ ] **Step 7: Run the tests**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts
```

Expected: PASS, including the pre-existing frame tests.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts
git commit -m "feat(stats): wire control timeline into the aggregator

Follows the stab-perf accumulator contract at all five lifecycle sites,
so the worker path and the inline path agree."
```

---

### Task 5: Replay squad lanes

**Files:**
- Modify: `src/renderer/stats/map/replayTypes.ts` (`ReplayFightPayload`)
- Modify: `src/renderer/stats/incrementalAggregation.ts:190` (fight payload construction)
- Modify: `src/renderer/stats/statsStore.ts:48-60` and `:116` (`replayLayers`)
- Modify: `src/renderer/stats/map/SyncedTimeline.tsx`
- Test: `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `readSquadSeries` from Task 2
- Produces: `ReplayFightPayload.ccSamples: number[] | null` and `.stripSamples: number[] | null`, both 1s-resolution; `replayLayers.ccLane` and `replayLayers.stripLane` booleans

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SyncedTimeline } from '../SyncedTimeline';

const fight = (over: any = {}) => ({
    fightId: 'f1', fightIndex: 0, label: 'Fight 1', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null, nearestLandmark: null,
    squadSize: 1, kills: 0, deaths: 0,
    movementData: { players: [] } as any,
    dpsSamples: [{ timeMs: 0, squadDps: 100 }, { timeMs: 5000, squadDps: 200 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
    ccSamples: null, stripSamples: null,
    ...over,
});

describe('SyncedTimeline CC and strip lanes', () => {
    it('renders a CC sub-lane when samples are present', () => {
        const { container } = render(<SyncedTimeline fight={fight({ ccSamples: [0, 2, 1, 0] }) as any} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
    });

    it('renders no CC sub-lane when the series was not recorded', () => {
        const { container } = render(<SyncedTimeline fight={fight() as any} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
    });
});
```

Fill any missing `ReplayFightPayload` fields from the interface at `replayTypes.ts:32`; the literal must typecheck.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx
```

Expected: FAIL — no `cc-lane` element.

- [ ] **Step 3: Add the payload fields**

In `src/renderer/stats/map/replayTypes.ts`, inside `ReplayFightPayload` next to `dpsSamples`:

```ts
    /** Squad CC applied per second, or null if the report predates axilog 1.8.0. */
    ccSamples: number[] | null;
    /** Squad boons stripped off enemies per second, or null if not recorded. */
    stripSamples: number[] | null;
```

- [ ] **Step 4: Populate them during aggregation**

In `src/renderer/stats/incrementalAggregation.ts` next to line 190, using the same native-report accessor `computeStabPerformance` uses:

```ts
    const ccSamples = readSquadSeries(native, 'cc_applied');
    const stripSamples = readSquadSeries(native, 'strips');
```

and add `ccSamples,` and `stripSamples,` to the fight payload object at ~line 212. Import `readSquadSeries` from `@axiapps/bridge-metrics`.

- [ ] **Step 5: Add the layer toggles**

`src/renderer/stats/statsStore.ts`, inside the `replayLayers` type block (~line 48):

```ts
        /** Squad CC-applied lane under the DPS area. */
        ccLane: boolean;
        /** Squad boon-strip lane under the DPS area. */
        stripLane: boolean;
```

and in `initialState.replayLayers` (~line 116):

```ts
        ccLane: true,
        stripLane: true,
```

Both are cheap squad-level lanes available on every log, so they default on — unlike `enemyPulses`, which defaults off for volume reasons.

- [ ] **Step 6: Render the sub-lanes**

In `src/renderer/stats/map/SyncedTimeline.tsx`, add a builder next to the existing `pathData` memo:

```tsx
    /**
     * CC and strips get their own normalized sub-lanes rather than sharing the
     * DPS y-axis: squad DPS runs in the hundreds of thousands and CC counts in
     * single digits, so a shared axis flattens the counts onto the baseline.
     */
    const subLane = useCallback((samples: number[] | null, top: number, height: number) => {
        if (!samples || samples.length === 0 || fight.durationMs <= 0) return '';
        const max = Math.max(1, ...samples);
        const step = 1000 / samples.length;
        return samples
            .map((v, i) => `M ${(i * step).toFixed(1)},${top + height} V ${(top + height - (v / max) * height).toFixed(1)}`)
            .join(' ');
    }, [fight.durationMs]);

    const ccPath = useMemo(() => subLane(fight.ccSamples, 104, 10), [subLane, fight.ccSamples]);
    const stripPath = useMemo(() => subLane(fight.stripSamples, 118, 10), [subLane, fight.stripSamples]);
```

Then, inside the SVG after the DPS area path:

```tsx
                {layersState.ccLane && ccPath && (
                    <g data-testid="cc-lane">
                        <path d={ccPath} stroke="#f59e0b" strokeWidth={2} fill="none" opacity={0.85} />
                    </g>
                )}
                {layersState.stripLane && stripPath && (
                    <g data-testid="strip-lane">
                        <path d={stripPath} stroke="#e879f9" strokeWidth={2} fill="none" opacity={0.85} />
                    </g>
                )}
```

The SVG `viewBox` height must grow to accommodate y=104..128. Read the current `viewBox` on the `<svg>` element and extend its height by 32; leave the width at 1000 so every existing x coordinate is unaffected.

- [ ] **Step 7: Run the tests**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx
```

Expected: PASS, both.

- [ ] **Step 8: Add the toggles to the replay layer controls UI**

Find the component rendering the existing layer checkboxes:

```bash
grep -rn "setReplayLayer" --include=*.tsx src/renderer/stats/map/ | head
```

Add two entries labelled "CC lane" and "Strip lane" alongside the existing ones, following that file's existing markup exactly.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stats/map/ src/renderer/stats/statsStore.ts src/renderer/stats/incrementalAggregation.ts
git commit -m "feat(replay): squad CC and boon-strip lanes on the synced timeline

Independently normalized sub-lanes below the DPS area — a shared y-axis
would flatten single-digit counts against six-figure DPS."
```

---

### Task 6: The shared `BucketGridTable` component

**Files:**
- Create: `src/renderer/stats/sections/BucketGridTable.tsx`
- Test: `src/renderer/stats/sections/__tests__/BucketGridTable.test.tsx`

**Interfaces:**
- Consumes: `ControlFightData`, `ControlPlayerData` from Task 3
- Produces:
  ```tsx
  export type BucketGridRow = { key: string; displayName: string; group: number; buckets: number[] };
  export interface BucketGridTableProps {
      rows: BucketGridRow[];
      bucketCount: number;
      bucketMs: number;
      /** Cell tint at full intensity. Intensity is value / max across the grid. */
      accent: string;
      /** Rendered in place of the grid when the data was never captured. */
      notRecordedMessage?: string;
      recorded: boolean;
  }
  export const BucketGridTable: React.FC<BucketGridTableProps>;
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BucketGridTable } from '../BucketGridTable';

const rows = [
    { key: 'a', displayName: 'Alice', group: 1, buckets: [0, 4, 2] },
    { key: 'b', displayName: 'Bob', group: 1, buckets: [1, 0, 0] },
];

describe('BucketGridTable', () => {
    it('renders one row per player and one cell per bucket', () => {
        const { container } = render(
            <BucketGridTable rows={rows} bucketCount={3} bucketMs={5000} accent="#f59e0b" recorded />,
        );
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(6);
    });

    it('scales cell intensity against the grid maximum', () => {
        const { container } = render(
            <BucketGridTable rows={rows} bucketCount={3} bucketMs={5000} accent="#f59e0b" recorded />,
        );
        const cells = container.querySelectorAll('[data-bucket-cell]');
        // Alice bucket 1 is the grid max (4) and must be fully saturated.
        expect(cells[1].getAttribute('data-intensity')).toBe('1');
        expect(cells[0].getAttribute('data-intensity')).toBe('0');
    });

    it('shows the not-recorded message instead of an empty grid', () => {
        render(
            <BucketGridTable
                rows={[]} bucketCount={0} bucketMs={5000} accent="#f59e0b"
                recorded={false} notRecordedMessage="Enable Raw timeline arrays and re-parse."
            />,
        );
        expect(screen.getByText('Enable Raw timeline arrays and re-parse.')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/sections/__tests__/BucketGridTable.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import React, { useMemo } from 'react';

/**
 * Player rows x time-bucket columns, intensity-shaded. Shared by the CC
 * Timeline and Strip Timeline sections.
 *
 * `StabPerformanceSection` deliberately does NOT use this: its cells layer
 * stack counts, death marks and distance semantics together, and
 * generalizing that is a separate refactor.
 */

export type BucketGridRow = {
    key: string;
    displayName: string;
    group: number;
    buckets: number[];
};

export interface BucketGridTableProps {
    rows: BucketGridRow[];
    bucketCount: number;
    bucketMs: number;
    accent: string;
    notRecordedMessage?: string;
    /** False means the series was never captured — render the message, not zeros. */
    recorded: boolean;
}

const fmtBucketLabel = (i: number, bucketMs: number) => {
    const s = Math.floor((i * bucketMs) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const BucketGridTable: React.FC<BucketGridTableProps> = ({
    rows, bucketCount, bucketMs, accent, notRecordedMessage, recorded,
}) => {
    const max = useMemo(
        () => rows.reduce((m, r) => Math.max(m, ...r.buckets), 0),
        [rows],
    );

    if (!recorded) {
        return <div className="stats-empty-state">{notRecordedMessage}</div>;
    }

    return (
        <table className="bucket-grid-table">
            <thead>
                <tr>
                    <th scope="col">Player</th>
                    {Array.from({ length: bucketCount }, (_, i) => (
                        <th key={i} scope="col">{fmtBucketLabel(i, bucketMs)}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.key}>
                        <th scope="row">{row.displayName}</th>
                        {Array.from({ length: bucketCount }, (_, i) => {
                            const value = row.buckets[i] || 0;
                            const intensity = max > 0 ? value / max : 0;
                            return (
                                <td
                                    key={i}
                                    data-bucket-cell
                                    data-intensity={String(intensity)}
                                    style={{ backgroundColor: accent, opacity: intensity }}
                                    title={`${row.displayName} — ${fmtBucketLabel(i, bucketMs)}: ${value}`}
                                >
                                    {value > 0 ? value : ''}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
```

Replace `className="stats-empty-state"` and `"bucket-grid-table"` with the class names this codebase already uses for empty states and stat tables — read a neighbouring file in `src/renderer/stats/sections/` and follow it, so the component inherits theming rather than shipping unstyled.

- [ ] **Step 4: Run to verify they pass**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/sections/__tests__/BucketGridTable.test.tsx
```

Expected: PASS, all three.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/BucketGridTable.tsx src/renderer/stats/sections/__tests__/BucketGridTable.test.tsx
git commit -m "feat(stats): shared bucket grid table component"
```

---

### Task 7: The CC Timeline section

**Files:**
- Create: `src/renderer/stats/sections/CcTimelineSection.tsx`
- Modify: `src/renderer/stats/statsTaxonomy.ts` (Offense category, after `offense-detailed`)
- Modify: `src/renderer/StatsView.tsx` (render the section)
- Test: `src/renderer/stats/__tests__/statsTaxonomy.test.ts`

**Interfaces:**
- Consumes: `BucketGridTable`, `BucketGridRow` from Task 6; `controlTimelineDrilldown` from Task 4
- Produces: taxonomy section id `cc-timeline`

- [ ] **Step 1: Write the failing taxonomy test**

Append to `src/renderer/stats/__tests__/statsTaxonomy.test.ts`, following the assertions the file already makes:

```ts
it('registers cc-timeline under offense', () => {
    const offense = STATS_TAXONOMY.find(c => c.id === 'offense');
    expect(offense?.sections.map(s => s.id)).toContain('cc-timeline');
});
```

Use whatever the file's existing tests import for the taxonomy constant — do not assume the name `STATS_TAXONOMY`.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/statsTaxonomy.test.ts
```

Expected: FAIL — `cc-timeline` not present. The file's existing id-uniqueness test must still pass.

- [ ] **Step 3: Add the taxonomy entry**

In `src/renderer/stats/statsTaxonomy.ts`, in the `offense` category's `sections` array immediately after the `offense-detailed` entry:

```ts
            { id: 'cc-timeline', label: 'CC Timeline', icon: Zap, description: 'Outgoing crowd control per player over the course of each fight.', keywords: ['cc over time', 'control timeline', 'cc timing', 'when cc'] },
```

`Zap` is already imported in this file (used by `spike-damage`).

- [ ] **Step 4: Write the section component**

```tsx
import React, { useMemo } from 'react';
import { BucketGridTable, type BucketGridRow } from './BucketGridTable';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';

interface CcTimelineSectionProps {
    fights: ControlFightData[];
    recorded: boolean;
    selectedFightId: string | null;
}

/**
 * Outgoing CC per player per 5s bucket. Outgoing only: axilog emits no
 * `cc_taken` lane, so there is no direction toggle here — incoming CC
 * remains the `received_cc_count` scalar shown in Defense Detailed.
 */
export const CcTimelineSection: React.FC<CcTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const fight = useMemo(
        () => fights.find(f => f.id === selectedFightId) || fights[0] || null,
        [fights, selectedFightId],
    );

    const rows = useMemo<BucketGridRow[]>(() => {
        if (!fight) return [];
        return Object.entries(fight.players)
            .map(([key, p]) => ({ key, displayName: p.displayName, group: p.group, buckets: p.cc }))
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight]);

    return (
        <BucketGridTable
            rows={rows}
            bucketCount={fight?.bucketCount || 0}
            bucketMs={CONTROL_BUCKET_MS}
            accent="#f59e0b"
            recorded={recorded}
            notRecordedMessage="Per-player CC timelines need Raw timeline arrays enabled — re-parse these logs to populate."
        />
    );
};
```

- [ ] **Step 5: Render it in `StatsView.tsx`**

Find where `stab-performance` is rendered and add a sibling branch for `cc-timeline`, passing `controlTimelineDrilldown.fights`, `.recorded`, and the currently selected fight id. Follow the surrounding section's exact pattern for how it reads the drilldown and the selected fight. Keep filter and selection state inside `CcTimelineSection` — do not add `useState` to `StatsView.tsx`, which is past 3,400 lines.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/statsTaxonomy.test.ts
```

Expected: PASS, including id uniqueness.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/CcTimelineSection.tsx src/renderer/stats/statsTaxonomy.ts src/renderer/StatsView.tsx src/renderer/stats/__tests__/statsTaxonomy.test.ts
git commit -m "feat(stats): CC Timeline section under Offense"
```

---

### Task 8: The Strip Timeline section

**Files:**
- Create: `src/renderer/stats/sections/StripTimelineSection.tsx`
- Modify: `src/renderer/stats/statsTaxonomy.ts` (Boons & Strips, after `strip-spikes`)
- Modify: `src/renderer/StatsView.tsx`
- Test: `src/renderer/stats/sections/__tests__/StripTimelineSection.test.tsx`

**Interfaces:**
- Consumes: `BucketGridTable`, `BucketGridRow` from Task 6; `ControlFightData` from Task 3
- Produces: taxonomy section id `strip-timeline`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StripTimelineSection } from '../StripTimelineSection';

const fights = [{
    id: 'f1', bucketCount: 2, durationMs: 10_000,
    players: {
        a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [3, 0], stripsIn: [0, 7] },
    },
}];

describe('StripTimelineSection', () => {
    it('shows outgoing strips by default', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(screen.getByTitle(/Alice — 0:00: 3/)).toBeTruthy();
    });

    it('switches to incoming strips when toggled', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        fireEvent.click(screen.getByRole('button', { name: /incoming/i }));
        expect(screen.getByTitle(/Alice — 0:05: 7/)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/sections/__tests__/StripTimelineSection.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import React, { useMemo, useState } from 'react';
import { BucketGridTable, type BucketGridRow } from './BucketGridTable';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';

type StripDirection = 'out' | 'in';

interface StripTimelineSectionProps {
    fights: ControlFightData[];
    recorded: boolean;
    selectedFightId: string | null;
}

/**
 * Boon strips per player per 5s bucket, in either direction.
 *
 * Distinct from `strip-spikes`, which holds per-FIGHT totals with peak-fight
 * tracking and has no time axis inside a fight.
 */
export const StripTimelineSection: React.FC<StripTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const [direction, setDirection] = useState<StripDirection>('out');

    const fight = useMemo(
        () => fights.find(f => f.id === selectedFightId) || fights[0] || null,
        [fights, selectedFightId],
    );

    const rows = useMemo<BucketGridRow[]>(() => {
        if (!fight) return [];
        return Object.entries(fight.players)
            .map(([key, p]) => ({
                key,
                displayName: p.displayName,
                group: p.group,
                buckets: direction === 'out' ? p.stripsOut : p.stripsIn,
            }))
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight, direction]);

    return (
        <>
            <div className="stats-section-controls">
                <button
                    type="button"
                    onClick={() => setDirection('out')}
                    aria-pressed={direction === 'out'}
                    title="Boons this player removed from enemies"
                >
                    Outgoing
                </button>
                <button
                    type="button"
                    onClick={() => setDirection('in')}
                    aria-pressed={direction === 'in'}
                    title="Boons removed from this player by enemies"
                >
                    Incoming
                </button>
            </div>
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent={direction === 'out' ? '#e879f9' : '#f87171'}
                recorded={recorded}
                notRecordedMessage="Per-player strip timelines need Raw timeline arrays enabled — re-parse these logs to populate."
            />
        </>
    );
};
```

Replace `"stats-section-controls"` and the bare `<button>` markup with the toggle pattern an existing section uses — `StabPerformanceSection.tsx:169` has a working toggle button with the codebase's classes. Follow it.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/sections/__tests__/StripTimelineSection.test.tsx
```

Expected: PASS, both.

- [ ] **Step 5: Add the taxonomy entry**

In `src/renderer/stats/statsTaxonomy.ts`, in the `boons-strips` category immediately after the `strip-spikes` entry:

```ts
            { id: 'strip-timeline', label: 'Strip Timeline', icon: Eraser, description: 'Boon strips per player over the course of each fight, incoming or outgoing.', keywords: ['strips over time', 'strip timing', 'when stripped', 'strip timeline'] },
```

`Eraser` is already imported for `boon-strip-comparison` and `strip-spikes`.

- [ ] **Step 6: Render it in `StatsView.tsx`**

Add a `strip-timeline` branch next to the `strip-spikes` one, following that section's pattern for reading the drilldown and the selected fight.

- [ ] **Step 7: Run the taxonomy and section tests**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/__tests__/statsTaxonomy.test.ts src/renderer/stats/sections/__tests__/StripTimelineSection.test.tsx
```

Expected: PASS, including id uniqueness.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/StripTimelineSection.tsx src/renderer/stats/statsTaxonomy.ts src/renderer/StatsView.tsx src/renderer/stats/sections/__tests__/StripTimelineSection.test.tsx
git commit -m "feat(stats): Strip Timeline section under Boons & Strips

Adds the within-fight time axis strip-spikes lacks; direction toggle
covers both strips dealt and strips taken."
```

---

### Task 9: Stab Performance strips-taken overlay

**Files:**
- Modify: `src/renderer/stats/sections/StabPerformanceSection.tsx:43`, `:65`, `:87`, `:169-175`, `:254`, `:285-296`
- Modify: `src/renderer/StatsView.tsx:3327`, `:3397`, `:4566` (the stab-perf call site only)
- Test: `src/renderer/stats/sections/__tests__/StabPerformanceSection.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `ControlFightData.stripsIn` from Task 3
- Produces: `StabPerformanceSection` prop `heatmapOverlay: 'none' | 'incoming-damage' | 'strips-taken'` replacing `showIncomingHeatmap`, and `StabPerfDrilldownEntry.stripsTakenIntensity?: number`

**Blast-radius note:** `showIncomingHeatmap` is also passed to `BoonTimelineSection` (`StatsView.tsx:4525`, `:5172`) and `BoonUptimeSection` (`:4549`, `:5138`), backed by separate state (`showBoonTimelineIncomingHeatmap`, `showBoonUptimeIncomingHeatmap`). **Those sections keep the boolean.** Only `showStabPerfHeatmap` at `:4566` changes.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StabPerformanceSection } from '../StabPerformanceSection';

// Build props from the shape StatsView passes at :4566 — read that call site
// and mirror it, then vary only `heatmapOverlay`.
const props = (overlay: 'none' | 'incoming-damage' | 'strips-taken') => ({
    /* ...the full prop set from StatsView.tsx:4566... */
    heatmapOverlay: overlay,
} as any);

describe('StabPerformanceSection heatmap overlay', () => {
    it('tints cells from incoming damage in incoming-damage mode', () => {
        const { container } = render(<StabPerformanceSection {...props('incoming-damage')} />);
        expect(container.querySelector('[data-overlay="incoming-damage"]')).not.toBeNull();
    });

    it('tints cells from strips taken in strips-taken mode', () => {
        const { container } = render(<StabPerformanceSection {...props('strips-taken')} />);
        expect(container.querySelector('[data-overlay="strips-taken"]')).not.toBeNull();
    });

    it('renders no overlay in none mode', () => {
        const { container } = render(<StabPerformanceSection {...props('none')} />);
        expect(container.querySelector('[data-overlay]')).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/sections/__tests__/StabPerformanceSection.test.tsx
```

Expected: FAIL — the component still takes `showIncomingHeatmap`.

- [ ] **Step 3: Change the prop to a mode**

In `StabPerformanceSection.tsx`, replace `showIncomingHeatmap: boolean;` (line 65) and its destructure (line 87):

```tsx
    /**
     * Overlay tinting the grid cells. A mode rather than two booleans:
     * both overlays paint the same cell background, so they cannot coexist
     * and the exclusivity belongs in the type, not in a runtime rule.
     */
    heatmapOverlay: 'none' | 'incoming-damage' | 'strips-taken';
    setHeatmapOverlay: (mode: 'none' | 'incoming-damage' | 'strips-taken') => void;
```

Add to `StabPerfDrilldownEntry` (line 43, next to `incomingIntensity`):

```tsx
    stripsTaken?: number;
    stripsTakenIntensity?: number;
```

- [ ] **Step 4: Update the toggle control**

Replace the single toggle button at line 169 with a three-way control cycling `none → incoming-damage → strips-taken → none`, keeping the existing button classes and adding a title per mode:

```tsx
                    onClick={() => setHeatmapOverlay(
                        heatmapOverlay === 'none' ? 'incoming-damage'
                        : heatmapOverlay === 'incoming-damage' ? 'strips-taken'
                        : 'none',
                    )}
                    title={
                        heatmapOverlay === 'none' ? 'Show party incoming damage intensity overlay'
                        : heatmapOverlay === 'incoming-damage' ? 'Show boon strips taken intensity overlay'
                        : 'Hide the intensity overlay'
                    }
```

- [ ] **Step 5: Update the two render sites**

At lines 254 and 285-296, replace `showIncomingHeatmap && ...` with a mode check, select the intensity field per mode, and stamp `data-overlay`:

```tsx
                        {heatmapOverlay !== 'none' && (() => {
                            const intensity = Math.max(0, Math.min(1, Number(
                                heatmapOverlay === 'strips-taken'
                                    ? entry?.stripsTakenIntensity
                                    : entry?.incomingIntensity,
                            ) || 0));
                            if (intensity <= 0) return null;
                            return (
                                <div
                                    data-overlay={heatmapOverlay}
                                    style={{ opacity: intensity, backgroundColor: heatmapOverlay === 'strips-taken' ? '#f87171' : '#ef4444' }}
                                />
                            );
                        })()}
```

Preserve the existing wrapper element's className and positioning — only the condition, the colour and the intensity source change.

- [ ] **Step 6: Feed the new intensity from `StatsView.tsx`**

At `:3327` add `stripsTaken: number; stripsTakenIntensity: number;` to the entry type, and at `:3397` compute it next to `incomingIntensity`, joining `controlTimelineDrilldown` on fight id and player key:

```ts
                stripsTakenIntensity: stripsMax > 0 ? Math.max(0, Math.min(1, stripsTaken / stripsMax)) : 0,
```

where `stripsMax` is the maximum `stripsIn` bucket across the fight, computed the same way `incomingMax` already is.

At `:4566` replace `showIncomingHeatmap={showStabPerfHeatmap}` with `heatmapOverlay={stabPerfOverlay}` and `setHeatmapOverlay={setStabPerfOverlay}`, renaming the `useState` at `:925`-adjacent from `showStabPerfHeatmap` to `stabPerfOverlay` with initial value `'none'`. **Leave `:4525`, `:4549`, `:5138` and `:5172` untouched.**

- [ ] **Step 7: Run the tests**

```bash
npx vitest run --maxWorkers=2 src/renderer/stats/sections/__tests__/StabPerformanceSection.test.tsx
```

Expected: PASS, all three. Then run the whole renderer suite to catch the boon sections:

```bash
npx vitest run --maxWorkers=2 src/renderer/
```

Expected: PASS. A failure in `BoonTimelineSection` or `BoonUptimeSection` means the prop change leaked past Stab Performance.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/StabPerformanceSection.tsx src/renderer/StatsView.tsx src/renderer/stats/sections/__tests__/StabPerformanceSection.test.tsx
git commit -m "feat(stats): strips-taken overlay on Stab Performance

showIncomingHeatmap becomes a three-way mode on this section only; the
boon sections keep the boolean. Two overlays paint the same cell, so
exclusivity belongs in the type."
```

---

### Task 10: Metrics documentation and full validation

**Files:**
- Modify: `src/shared/metrics-spec.md`
- Modify: `docs/metrics-spec.md` (generated — do not hand-edit)

**Interfaces:**
- Consumes: everything from Tasks 1-9
- Produces: documented metric definitions; a green `npm run validate` and full test suite

- [ ] **Step 1: Document the three series**

Add to `src/shared/metrics-spec.md`, in the section covering CC and support metrics:

```markdown
### CC Applied (timeline)

Outgoing crowd control applied by a player, bucketed per second by axilog
and summed to 5s buckets for display. Folded from the same `is_cc`
predicate as the whole-fight `CC` scalar, including pet and minion CC
credited to the owning player, so the buckets sum exactly to that scalar.

Outgoing only — there is no incoming CC timeline. Incoming CC remains the
`received_cc_count` scalar.

Requires `Raw timeline arrays` enabled at parse time.

### Boon Strips (timeline)

Boon removals over time, in either direction:

- **Outgoing** — boons this player removed from enemies. Credited to the
  REMOVER, counted at the boon-removal event, one per boon removed. Sums to
  the `Strips` scalar.
- **Incoming** — boons enemies removed from this player. Sums to the
  `Boon Strips Taken` scalar.

Both are counted at removal events on the twelve boons, not on conditions —
condition removal is `Cleanses`, a separate metric.

Requires `Raw timeline arrays` enabled at parse time.
```

Match the heading level and formatting of the surrounding entries in that file.

- [ ] **Step 2: Sync to docs**

```bash
npm run sync:metrics-spec
```

- [ ] **Step 3: Run the full suite**

```bash
npx vitest run --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 4: Validate**

```bash
npm run validate
```

Expected: PASS — typecheck and ESLint at `--max-warnings 0`.

- [ ] **Step 5: Run the metric audits**

```bash
npm run audit:metrics && npm run audit:boons
```

Expected: PASS. These validate metric values against `test-fixtures/`, which were regenerated in Task 1.

- [ ] **Step 6: Verify the web report end to end**

```bash
npm run build:web
```

Then run the web e2e suite:

```bash
npm run test:e2e:web
```

Expected: PASS. This is the surface that proves the accumulator did its job — the web report has no log details at render time, so if the CC and Strip Timeline sections render there, the precomputed drilldown is complete.

- [ ] **Step 7: Commit**

```bash
git add src/shared/metrics-spec.md docs/metrics-spec.md
git commit -m "docs(metrics): CC and boon-strip timeline definitions"
```
