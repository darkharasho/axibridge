# Fight Slicer Phase B — Web Report Slicing Implementation Plan

> **Status: SHIPPED.** All 21 tasks landed and merged to `main` in PR #41
> (merge commit `4149e1f8`, 2026-08-23). The checkboxes below were never ticked
> during subagent-driven implementation — the commit log, not this file, is the
> record of what was built. Kept for the design rationale and the global
> constraints, which still bind.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a viewer of a published AxiBridge web report select a subset of fights and see every stat recomputed for just those fights, and share that selection as a URL.

**Architecture:** At publish time the desktop app builds one **slice frame** per fight — a JSON snapshot of an `IncrementalAggregator` that ingested exactly that one log, before `finalize()` runs. All frames go into a gzipped `slice.json.gz` sidecar hosted on the user's Cloudflare R2 bucket (never on GitHub Pages). The published viewer lazily fetches the sidecar, merges the frames for the selected fights back into a fresh aggregator, and calls the existing `finalize()`. Because frames are pre-finalize state, every derived section (leaderboards, MVPs, topStats) recomputes in the browser for free and cannot bloat the sidecar.

**Tech Stack:** TypeScript, React 18, Vite (three targets), Electron main, vitest (`pool: 'forks'`, `maxWorkers: 2`), Playwright, zustand, `@axiapps/bridge-metrics` workspace package, Cloudflare R2 via `r2PutObject`, `DecompressionStream('gzip')`.

**Spec:** `docs/superpowers/specs/2026-08-22-fight-slicer-phase-b-design.md`

## Global Constraints

- **The correctness invariant, verbatim from the spec:** `finalize(merge(frame(A), frame(B))) === finalize(ingest(A); ingest(B))`. Every module task ends with a test asserting exactly this against real fixtures. A module that cannot satisfy it is excluded from slice mode — per-section, never all-or-nothing.
- **Structural, not a strip list.** Frames carry pre-`finalize` state only. Never add a finalized/derived section to a frame to "make merging easier". If a merge is hard, factor the fold out of `ingest` and share it — that is the pattern used throughout this plan.
- **Sidecars never fall back to GitHub Pages.** With no R2 configured the report publishes byte-for-byte as it does today, with no slicer and one notice. This is the design's central tradeoff; do not "helpfully" add a Pages path.
- **The sidecar is never fetched on report load.** Only on first tray-open or on landing with a `slice=` query parameter.
- **Sidecar filename is `slice.json.gz`** (gzipped at build time, `Content-Type: application/gzip`, **no** `Content-Encoding` header — `r2PutObject` sets Content-Type explicitly and sets no Content-Encoding, so the browser hands back compressed bytes for `DecompressionStream`).
- **Addressing is a query parameter**, `?report=<id>&slice=Bx4` — never the fragment. The hash is already the section-anchor channel (`src/web/reportApp.tsx:747`, `resolveSectionTarget`).
- **Slice mode uses the publisher's settings**, read from `report.stats.statsViewSettings`. A `settingsHash` mismatch disables slicing rather than rendering wrong numbers.
- **Per-fight sidecar byte budget: 200 KB gzipped.** Enforced by a size-regression test (Task 15). A section that starts carrying raw log details must fail loudly.
- **vitest parallelism:** the repo's `vitest.config.ts` pins `pool: 'forks'`, `maxWorkers: 2`. Respect it; never pass a higher `--maxWorkers`.
- **`@axiapps/bridge-metrics` resolves via `dist/`, not `src/`.** After editing anything under `packages/bridge-metrics/src/`, run `npm run build --workspace @axiapps/bridge-metrics` (which runs `tsup`) before running tests, or you will debug a phantom stale-type failure. This affects Task 11 only.
- **`npm run validate`** (`typecheck` + `lint --max-warnings 0`) must pass before every commit.

---

## File Structure

**New — the slice module (`src/renderer/stats/slice/`).** Shared by the desktop publisher, the stats worker, and the web viewer, exactly like the rest of `src/renderer/stats/` already is.

| File | Responsibility |
|---|---|
| `sliceTypes.ts` | `SliceFrame`, `SliceSidecar`, `SliceFightEntry`, `SLICE_SIDECAR_VERSION`. Types only, no logic. |
| `stateCodec.ts` | `encodeState` / `decodeState` — the structural JSON codec for `Map` and `Set`, which accumulators use freely and `JSON.stringify` silently turns into `{}`. |
| `sliceBitmask.ts` | `encodeSliceMask` / `decodeSliceMask` — base64url bitmask over fight ordinals. |
| `buildSliceFrames.ts` | `buildSliceFrames(logs, options)` — one fresh single-log aggregator per log, exported as frames. Renderer-side, called at publish. |
| `mergeSliceFrames.ts` | `mergeSliceFrames(frames, options)` — fresh aggregator, merge every frame, `finalize()`. The browser's recompute entry point. |
| `fetchSliceSidecar.ts` | Web-only: fetch `slice.json.gz`, inflate via `DecompressionStream('gzip')`, decode, validate `version` and `settingsHash`. |

**Modified — per-module frame support.** Each `compute*.ts` gains an `extract*Frame` / `merge*Frame` pair and, where the player fold currently lives inline in `ingestLog*`, that fold is extracted into an exported function so ingest and merge share one implementation. Merge-equivalence then holds by construction, and the test proves it rather than being the only thing holding it up.

`computeSpikeDamageData.ts`, `computeStripSpikesData.ts`, `computeAllDamageData.ts`, `computeIncomingStrikeDamageData.ts`, `computeSkillUsageData.ts`, `computeBoonTimeline.ts`, `computeBoonUptimeTimeline.ts`, `computeStabPerformance.ts`, `computeCommanderStats.ts`, and `packages/bridge-metrics/src/computePlayerAggregation.ts`.

**Modified — orchestration and delivery.**

| File | Change |
|---|---|
| `src/renderer/stats/incrementalAggregation.ts` | `exportFrame()` / `mergeFrame()` on `IncrementalAggregator`; merges the per-log arrays and scalar state it owns directly. |
| `src/renderer/workers/statsWorker.ts` | New `mergeFrames` message so the browser recompute runs off the main thread. |
| `src/renderer/stats/hooks/useStatsUploads.ts` | Build the sidecar at publish and attach it to the upload payload. |
| `src/renderer/app/hooks/useWebUpload.ts`, `src/preload/index.ts` | Widen the `uploadWebReport` payload type with `sliceSidecar`. |
| `src/main/handlers/githubHandlers.ts` | `planSidecarHosting` generalising `planReplayHosting`; gzip + R2 upload of `slice.json.gz`; `stats.sliceDataUrl` pointer; no-R2 notice. |
| `src/renderer/StatsView.tsx` | Un-gate the Phase A tray/pill/banner from `!embedded` to a new `sliceEnabled` prop. |
| `src/web/reportApp.tsx` | Sidecar lazy-fetch, slice recompute, roster from the sidecar, `?slice=` deep link, Copy slice link. |

**Unchanged, reused verbatim:** `src/renderer/stats/components/FightSliceTray.tsx` (pill, banner, tray) and `src/renderer/stats/statsStore.ts` (`excludedFightKeys`, `fightRoster`, `mergeFightRoster`, `toggleFightExcluded`, `setFightsExcluded`, `clearFightSlice`). Phase A already built the UI and the state; Phase B only feeds them from a different source.

---

### Task 1: Slice types and the Map/Set state codec

Accumulators hold their state in `Map`s (`playerMap`, `boonBuckets`, `skillTotals`, …). `JSON.stringify(new Map([['a',1]]))` is `{}` — silently, with no error. Every frame therefore goes through a structural codec before it is serialized, and comes back through it before it is merged.

**Files:**
- Create: `src/renderer/stats/slice/sliceTypes.ts`
- Create: `src/renderer/stats/slice/stateCodec.ts`
- Test: `src/renderer/stats/slice/__tests__/stateCodec.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SLICE_SIDECAR_VERSION: 1`; types `SliceFightEntry`, `SliceFrame`, `SliceSidecar`; `encodeState(value: unknown): unknown`; `decodeState(value: unknown): any`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/stateCodec.test.ts
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../stateCodec';

const roundTrip = (value: unknown) => decodeState(JSON.parse(JSON.stringify(encodeState(value))));

describe('stateCodec', () => {
    it('round-trips a Map through JSON', () => {
        const value = new Map<string, number>([['a', 1], ['b', 2]]);
        const out = roundTrip(value);
        expect(out).toBeInstanceOf(Map);
        expect([...out.entries()]).toEqual([['a', 1], ['b', 2]]);
    });

    it('round-trips a Set through JSON', () => {
        const out = roundTrip(new Set(['d1', 'd2']));
        expect(out).toBeInstanceOf(Set);
        expect([...out]).toEqual(['d1', 'd2']);
    });

    it('round-trips Maps nested inside Maps, arrays and plain objects', () => {
        const value = {
            buckets: new Map([['b1', { players: new Map([['acct', { n: 3 }]]), fights: [1, 2] }]]),
            rows: [new Map([['k', 'v']])],
        };
        const out = roundTrip(value);
        expect(out.buckets.get('b1').players.get('acct')).toEqual({ n: 3 });
        expect(out.buckets.get('b1').fights).toEqual([1, 2]);
        expect(out.rows[0].get('k')).toBe('v');
    });

    it('preserves numeric Map keys, which JSON object keys would stringify', () => {
        const out = roundTrip(new Map<number, string>([[42, 'x']]));
        expect(out.get(42)).toBe('x');
        expect(out.get('42')).toBeUndefined();
    });

    it('leaves plain values untouched', () => {
        expect(roundTrip({ a: 1, b: 'two', c: null, d: [1, 2], e: true })).toEqual({
            a: 1, b: 'two', c: null, d: [1, 2], e: true,
        });
    });

    it('does not mistake a plain object that happens to have a __map key for an encoded Map', () => {
        // Guards a real collision: skill maps are keyed by arbitrary strings.
        const out = roundTrip({ __map: 'not an array' });
        expect(out).toEqual({ __map: 'not an array' });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/stateCodec.test.ts`
Expected: FAIL — `Failed to resolve import "../stateCodec"`.

- [ ] **Step 3: Write the codec**

```ts
// src/renderer/stats/slice/stateCodec.ts

/**
 * JSON codec for accumulator state.
 *
 * Accumulators store their state in Maps and Sets, and `JSON.stringify` turns
 * both into `{}` without complaining — a silent, total data loss. Everything
 * that crosses the sidecar boundary goes through here first.
 *
 * The `__map` / `__set` sentinels are only honoured when their payload is an
 * array, so a plain object that happens to carry a `__map` string key survives
 * as itself.
 */

const MAP_KEY = '__map';
const SET_KEY = '__set';

export function encodeState(value: unknown): unknown {
    if (value instanceof Map) {
        return { [MAP_KEY]: [...value.entries()].map(([k, v]) => [encodeState(k), encodeState(v)]) };
    }
    if (value instanceof Set) {
        return { [SET_KEY]: [...value].map(encodeState) };
    }
    if (Array.isArray(value)) return value.map(encodeState);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encodeState(v);
        return out;
    }
    return value;
}

export function decodeState(value: unknown): any {
    if (Array.isArray(value)) return value.map(decodeState);
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj[MAP_KEY])) {
            const entries = obj[MAP_KEY] as Array<[unknown, unknown]>;
            return new Map(entries.map(([k, v]) => [decodeState(k), decodeState(v)]));
        }
        if (Array.isArray(obj[SET_KEY])) {
            return new Set((obj[SET_KEY] as unknown[]).map(decodeState));
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = decodeState(v);
        return out;
    }
    return value;
}
```

- [ ] **Step 4: Write the types**

```ts
// src/renderer/stats/slice/sliceTypes.ts
import type { FightRosterEntry } from '../statsStore';

/** Bumped whenever a frame's internal shape changes. A viewer that sees a
 *  version it does not know disables slicing rather than guessing. */
export const SLICE_SIDECAR_VERSION = 1;

/** The tray's view of a fight. Deliberately the Phase A roster shape, so
 *  `FightSliceTray` renders sidecar fights with no changes at all. */
export type SliceFightEntry = FightRosterEntry;

/**
 * Pre-finalize aggregator state for exactly one fight, Map/Set-encoded.
 * Opaque by design: only `IncrementalAggregator.exportFrame` writes it and
 * only `IncrementalAggregator.mergeFrame` reads it.
 */
export interface SliceFrame {
    [section: string]: unknown;
}

export interface SliceSidecar {
    version: number;
    /** Hash of the settings the frames were built under. A viewer whose report
     *  disagrees disables slicing rather than rendering wrong numbers. */
    settingsHash: string;
    /** Frozen publish order. Ordinal addressing is stable because of this. */
    fights: SliceFightEntry[];
    /** `frames[i]` is the frame for `fights[i]`. */
    frames: SliceFrame[];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/stateCodec.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/slice/
git commit -m "feat(slice): add slice frame types and Map/Set state codec"
```

---

### Task 2: The slice bitmask codec

A slice is a set of fight ordinals. The URL carries it as a base64url bitmask: fourteen fights in three characters, sixty in eleven.

**Files:**
- Create: `src/renderer/stats/slice/sliceBitmask.ts`
- Test: `src/renderer/stats/slice/__tests__/sliceBitmask.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `encodeSliceMask(includedOrdinals: number[], width: number): string`; `decodeSliceMask(token: string, width: number): number[] | null` — returns the sorted included ordinals, or `null` when the token is malformed or encodes a different width.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/sliceBitmask.test.ts
import { describe, it, expect } from 'vitest';
import { encodeSliceMask, decodeSliceMask } from '../sliceBitmask';

describe('sliceBitmask', () => {
    it('round-trips a subset', () => {
        const token = encodeSliceMask([0, 2, 5], 7);
        expect(decodeSliceMask(token, 7)).toEqual([0, 2, 5]);
    });

    it('round-trips every fight included', () => {
        const token = encodeSliceMask([0, 1, 2, 3, 4, 5, 6], 7);
        expect(decodeSliceMask(token, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('round-trips no fights included', () => {
        expect(decodeSliceMask(encodeSliceMask([], 7), 7)).toEqual([]);
    });

    it('keeps fourteen fights inside three characters', () => {
        expect(encodeSliceMask([0, 3, 13], 14).length).toBeLessThanOrEqual(3);
    });

    it('keeps sixty fights inside eleven characters', () => {
        const all = Array.from({ length: 60 }, (_, i) => i);
        expect(encodeSliceMask(all, 60).length).toBeLessThanOrEqual(11);
    });

    it('emits URL-safe characters only', () => {
        const all = Array.from({ length: 60 }, (_, i) => i);
        expect(encodeSliceMask(all, 60)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects a token whose width disagrees with the roster', () => {
        // A stale link must degrade to the truth, not to silently-wrong numbers.
        const token = encodeSliceMask([0, 2], 7);
        expect(decodeSliceMask(token, 9)).toBeNull();
    });

    it('rejects malformed input', () => {
        expect(decodeSliceMask('!!!!', 7)).toBeNull();
        expect(decodeSliceMask('', 7)).toBeNull();
    });

    it('ignores ordinals outside the width when encoding', () => {
        expect(decodeSliceMask(encodeSliceMask([0, 99, -1], 3), 3)).toEqual([0]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/sliceBitmask.test.ts`
Expected: FAIL — `Failed to resolve import "../sliceBitmask"`.

- [ ] **Step 3: Write the codec**

```ts
// src/renderer/stats/slice/sliceBitmask.ts

/**
 * Base64url bitmask over fight ordinals — the whole persistence model for a
 * slice. Bit `i` set means `fights[i]` is included; bytes are little-endian by
 * ordinal, so the first fight is the low bit of the first byte.
 *
 * The first byte of the payload is the width, which is what lets a stale link
 * (a report republished with more fights) be rejected instead of silently
 * decoding into the wrong fights.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const toBase64Url = (bytes: number[]): string => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const chunk = (b0 << 16) | (b1 << 8) | b2;
        const chars = [chunk >> 18, (chunk >> 12) & 63, (chunk >> 6) & 63, chunk & 63];
        const keep = i + 2 < bytes.length ? 4 : (i + 1 < bytes.length ? 3 : 2);
        for (let c = 0; c < keep; c++) out += ALPHABET[chars[c]];
    }
    return out;
};

const fromBase64Url = (token: string): number[] | null => {
    const values: number[] = [];
    for (const ch of token) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) return null;
        values.push(v);
    }
    const bytes: number[] = [];
    for (let i = 0; i < values.length; i += 4) {
        const keep = Math.min(4, values.length - i);
        if (keep === 1) return null;
        const chunk = (values[i] << 18)
            | (values[i + 1] << 12)
            | ((keep > 2 ? values[i + 2] : 0) << 6)
            | (keep > 3 ? values[i + 3] : 0);
        bytes.push((chunk >> 16) & 255);
        if (keep > 2) bytes.push((chunk >> 8) & 255);
        if (keep > 3) bytes.push(chunk & 255);
    }
    return bytes;
};

export function encodeSliceMask(includedOrdinals: number[], width: number): string {
    const byteCount = Math.ceil(Math.max(0, width) / 8);
    const bytes = new Array(byteCount + 1).fill(0);
    bytes[0] = Math.min(255, Math.max(0, width));
    includedOrdinals.forEach((ordinal) => {
        if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= width) return;
        bytes[1 + (ordinal >> 3)] |= 1 << (ordinal & 7);
    });
    return toBase64Url(bytes);
}

export function decodeSliceMask(token: string, width: number): number[] | null {
    if (!token) return null;
    const bytes = fromBase64Url(token);
    if (!bytes || bytes.length < 1) return null;
    if (bytes[0] !== Math.min(255, Math.max(0, width))) return null;
    if (bytes.length < 1 + Math.ceil(width / 8)) return null;
    const included: number[] = [];
    for (let ordinal = 0; ordinal < width; ordinal++) {
        if (bytes[1 + (ordinal >> 3)] & (1 << (ordinal & 7))) included.push(ordinal);
    }
    return included;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/sliceBitmask.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/slice/sliceBitmask.ts src/renderer/stats/slice/__tests__/sliceBitmask.test.ts
git commit -m "feat(slice): add base64url fight-ordinal bitmask codec"
```

---

### Task 3: Spike damage frames — the exemplar module

This is the pattern every accumulator module follows, so read it carefully even if you are implementing a later task.

`ingestLogSpikeDamage` does two things in one pass: it builds a per-fight `values` record, and it folds each player's fight value into a running `playerMap`. Only the first is naturally per-fight; the second is what makes merging hard. So **extract the fold into an exported function that both `ingest` and `merge` call.** Merge-equivalence then holds because there is one fold, not two — the test proves it rather than being the only thing holding it up.

The fold reads three fields that live on the entity and not on the fight value: `account`, `characterName`, `profession`. A frame carries those in a small parallel `seeds` record. They are **not** added to `SpikeDamageFightValue`, because that type ships inside `report.json` and this data is only needed by the sidecar.

**Known limitation to preserve, not fix:** `buildFightLabelV2` falls back to `Fight ${index + 1}` when a log has no `fightName`. A frame is built by an aggregator that has seen one log, so that fallback always reads `Fight 1`. Real logs always carry a `fightName`, so this only affects synthetic fixtures. Do not try to renumber labels at merge time — `finalizeSpikeDamage` already reassigns `shortLabel` by timestamp, which is the label the UI shows.

**Files:**
- Modify: `src/renderer/stats/computeSpikeDamageData.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeSpikeDamage.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface SpikeDamagePlayerSeed { account: string; characterName: string; profession: string }`
  - `interface SpikeDamageFrame { fight: SpikeDamageFight; seeds: Record<string, SpikeDamagePlayerSeed> }`
  - `foldSpikeFightIntoPlayers(fight: SpikeDamageFight, seeds: Record<string, SpikeDamagePlayerSeed>, playerMap: Map<string, SpikeDamagePlayer>): void`
  - `extractSpikeDamageFrame(acc: SpikeDamageAccumulator): SpikeDamageFrame`
  - `mergeSpikeDamageFrame(target: SpikeDamageAccumulator, frame: SpikeDamageFrame): void`
  - `SpikeDamageAccumulator` gains `fightSeeds: Array<Record<string, SpikeDamagePlayerSeed>>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeSpikeDamage.test.ts
import { describe, it, expect } from 'vitest';
import {
    createSpikeDamageAccumulator,
    ingestLogSpikeDamage,
    finalizeSpikeDamage,
    extractSpikeDamageFrame,
    mergeSpikeDamageFrame,
} from '../../computeSpikeDamageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTS = { splitPlayersByClass: false };

/** finalize(ingest A; ingest B; ...) — the reference result. */
const directFinalize = (logs: any[]) => {
    const acc = createSpikeDamageAccumulator();
    logs.forEach((log) => ingestLogSpikeDamage(log, acc, OPTS));
    return finalizeSpikeDamage(acc);
};

/** finalize(merge(frame(A), frame(B), ...)) — the slice-mode result. */
const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createSpikeDamageAccumulator();
        ingestLogSpikeDamage(log, solo, OPTS);
        const frame = extractSpikeDamageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createSpikeDamageAccumulator();
    frames.forEach((frame) => mergeSpikeDamageFrame(merged, frame));
    return finalizeSpikeDamage(merged);
};

describe('spike damage merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('produces peak values that actually differ between subsets', () => {
        // Guards a vacuous pass: if the fold were dropped entirely both sides
        // would be equal-and-empty and every assertion above would still hold.
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.players[0].peakHit).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createSpikeDamageAccumulator();
        LOGS.forEach((log) => ingestLogSpikeDamage(log, acc, OPTS));
        expect(() => extractSpikeDamageFrame(acc)).toThrow(/exactly one fight/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeSpikeDamage.test.ts`
Expected: FAIL — `"extractSpikeDamageFrame" is not exported by ".../computeSpikeDamageData.ts"`.

- [ ] **Step 3: Add `fightSeeds` to the accumulator**

In `src/renderer/stats/computeSpikeDamageData.ts`, extend the accumulator interface and factory:

```ts
export interface SpikeDamagePlayerSeed {
    account: string;
    characterName: string;
    profession: string;
}

export interface SpikeDamageAccumulator {
    fights: SpikeDamageFight[];
    playerMap: Map<string, SpikeDamagePlayer>;
    /** Running fight index counter. */
    fightIndex: number;
    /** Per-fight player identity, parallel to `fights`. Not part of any
     *  finalize output — this exists so a slice frame can re-run the player
     *  fold without the original log. */
    fightSeeds: Array<Record<string, SpikeDamagePlayerSeed>>;
}

export function createSpikeDamageAccumulator(): SpikeDamageAccumulator {
    return {
        fights: [],
        playerMap: new Map(),
        fightIndex: 0,
        fightSeeds: [],
    };
}
```

- [ ] **Step 4: Extract the player fold**

Add this exported function to `src/renderer/stats/computeSpikeDamageData.ts`, above `ingestLogSpikeDamage`:

```ts
/**
 * Fold one fight's player values into the running player map.
 *
 * Shared by `ingestLogSpikeDamage` and `mergeSpikeDamageFrame` on purpose:
 * one fold means slice-mode peaks cannot drift from all-fights peaks.
 */
export function foldSpikeFightIntoPlayers(
    fight: SpikeDamageFight,
    seeds: Record<string, SpikeDamagePlayerSeed>,
    playerMap: Map<string, SpikeDamagePlayer>,
): void {
    Object.entries(fight.values).forEach(([key, value]) => {
        const seed = seeds[key] || { account: key, characterName: '', profession: 'Unknown' };
        const existing = playerMap.get(key) || {
            key,
            account: seed.account,
            displayName: seed.account,
            characterName: seed.characterName,
            profession: seed.profession,
            professionList: [seed.profession],
            logs: 0,
            peakHit: 0,
            peak1s: 0,
            peak5s: 0,
            peak30s: 0,
            peakHitDown: 0,
            peak1sDown: 0,
            peak5sDown: 0,
            peak30sDown: 0,
            peakFightLabel: '',
            peakSkillName: '',
        };
        existing.logs += 1;
        if (!existing.professionList.includes(seed.profession)) {
            existing.professionList.push(seed.profession);
        }
        if (!existing.characterName && seed.characterName) {
            existing.characterName = seed.characterName;
        }
        const hit = Number(value.hit || 0);
        if (hit > existing.peakHit) {
            existing.peakHit = hit;
            existing.peakFightLabel = fight.fullLabel;
            existing.peakSkillName = value.skillName || 'Unknown Skill';
        }
        if (value.burst1s > existing.peak1s) existing.peak1s = value.burst1s;
        if (value.burst5s > existing.peak5s) existing.peak5s = value.burst5s;
        if (value.burst30s > existing.peak30s) existing.peak30s = value.burst30s;
        if (value.hitDown > existing.peakHitDown) existing.peakHitDown = value.hitDown;
        if (value.burst1sDown > existing.peak1sDown) existing.peak1sDown = value.burst1sDown;
        if (value.burst5sDown > existing.peak5sDown) existing.peak5sDown = value.burst5sDown;
        if (value.burst30sDown > existing.peak30sDown) existing.peak30sDown = value.burst30sDown;
        playerMap.set(key, existing);
    });
}
```

- [ ] **Step 5: Rewire `ingestLogSpikeDamage` to use the fold**

Inside `ingestLogSpikeDamage`, collect seeds alongside `values` in the existing `members.forEach` loop — add this immediately after `values[key] = { ... }`:

```ts
        seeds[key] = { account, characterName, profession };
```

Declare `const seeds: Record<string, SpikeDamagePlayerSeed> = {};` next to `const values: Record<string, SpikeDamageFightValue> = {};`, then **delete the entire inline fold** (everything from `const existing = acc.playerMap.get(key) || {` through `acc.playerMap.set(key, existing);`) from that loop. Finally, replace the trailing `acc.fights.push({ ... })` with:

```ts
    const fight: SpikeDamageFight = {
        id: log.filePath || log.id || `fight-${index + 1}`,
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        values,
        maxHit,
        max1s,
        max5s,
        max30s,
        maxHitDown,
        max1sDown,
        max5sDown,
        max30sDown
    };
    acc.fights.push(fight);
    acc.fightSeeds.push(seeds);
    foldSpikeFightIntoPlayers(fight, seeds, acc.playerMap);
```

The `maxHit`/`max1s`/… reductions over `Object.values(values)` stay exactly where they are, immediately above this block.

- [ ] **Step 6: Add the frame extract and merge**

Append to `src/renderer/stats/computeSpikeDamageData.ts`:

```ts
export interface SpikeDamageFrame {
    fight: SpikeDamageFight;
    seeds: Record<string, SpikeDamagePlayerSeed>;
}

export function extractSpikeDamageFrame(acc: SpikeDamageAccumulator): SpikeDamageFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractSpikeDamageFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0], seeds: acc.fightSeeds[0] || {} };
}

export function mergeSpikeDamageFrame(target: SpikeDamageAccumulator, frame: SpikeDamageFrame): void {
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    target.fightSeeds.push(frame.seeds);
    foldSpikeFightIntoPlayers(frame.fight, frame.seeds, target.playerMap);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeSpikeDamage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Run the existing spike-damage tests to confirm the refactor is behaviour-preserving**

Run: `npx vitest run src/renderer/stats/__tests__/ --testNamePattern="spike|Spike"`
Expected: PASS — the fold moved, its behaviour did not.

- [ ] **Step 9: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeSpikeDamageData.ts src/renderer/stats/slice/__tests__/mergeSpikeDamage.test.ts
git commit -m "feat(slice): add spike damage frame extract/merge with a shared player fold"
```

---

### Task 4: Strip spikes frames

Same shape as spike damage: a `fights` array plus a `playerMap` folded inline during ingest, and the fold reads `account` / `characterName` / `profession` off the entity, so a frame needs seeds.

**Files:**
- Modify: `src/renderer/stats/computeStripSpikesData.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeStripSpikes.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface StripSpikesPlayerSeed { account: string; characterName: string; profession: string }`
  - `interface StripSpikesFrame { fight: StripFight; seeds: Record<string, StripSpikesPlayerSeed> }`
  - `foldStripFightIntoPlayers(fight: StripFight, seeds: Record<string, StripSpikesPlayerSeed>, playerMap: Map<string, StripPlayer>): void`
  - `extractStripSpikesFrame(acc: StripSpikesAccumulator): StripSpikesFrame`
  - `mergeStripSpikesFrame(target: StripSpikesAccumulator, frame: StripSpikesFrame): void`
  - `StripSpikesAccumulator` gains `fightSeeds: Array<Record<string, StripSpikesPlayerSeed>>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeStripSpikes.test.ts
import { describe, it, expect } from 'vitest';
import {
    createStripSpikesAccumulator,
    ingestLogStripSpikes,
    finalizeStripSpikes,
    extractStripSpikesFrame,
    mergeStripSpikesFrame,
} from '../../computeStripSpikesData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTS = { splitPlayersByClass: false };

const directFinalize = (logs: any[]) => {
    const acc = createStripSpikesAccumulator();
    logs.forEach((log) => ingestLogStripSpikes(log, acc, OPTS));
    return finalizeStripSpikes(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createStripSpikesAccumulator();
        ingestLogStripSpikes(log, solo, OPTS);
        const frame = extractStripSpikesFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createStripSpikesAccumulator();
    frames.forEach((frame) => mergeStripSpikesFrame(merged, frame));
    return finalizeStripSpikes(merged);
};

describe('strip spikes merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('sums strip totals across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
        const allTotal = all.players.reduce((sum, p) => sum + p.totalStrips, 0);
        const oneTotal = one.players.reduce((sum, p) => sum + p.totalStrips, 0);
        expect(allTotal).toBeGreaterThan(oneTotal);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createStripSpikesAccumulator();
        LOGS.forEach((log) => ingestLogStripSpikes(log, acc, OPTS));
        expect(() => extractStripSpikesFrame(acc)).toThrow(/exactly one fight/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeStripSpikes.test.ts`
Expected: FAIL — `"extractStripSpikesFrame" is not exported by ".../computeStripSpikesData.ts"`.

- [ ] **Step 3: Add `fightSeeds` to the accumulator**

```ts
export interface StripSpikesPlayerSeed {
    account: string;
    characterName: string;
    profession: string;
}

export interface StripSpikesAccumulator {
    fights: StripFight[];
    playerMap: Map<string, StripPlayer>;
    /** Running fight index counter (incremented per ingested log with details). */
    fightIndex: number;
    /** Per-fight player identity, parallel to `fights`. Slice frames only —
     *  never part of any finalize output. */
    fightSeeds: Array<Record<string, StripSpikesPlayerSeed>>;
}

export function createStripSpikesAccumulator(): StripSpikesAccumulator {
    return {
        fights: [],
        playerMap: new Map(),
        fightIndex: 0,
        fightSeeds: [],
    };
}
```

- [ ] **Step 4: Extract the player fold**

Add to `src/renderer/stats/computeStripSpikesData.ts`, above `ingestLogStripSpikes`:

```ts
/**
 * Fold one fight's strip values into the running player map. Shared by
 * `ingestLogStripSpikes` and `mergeStripSpikesFrame` so slice-mode totals
 * cannot drift from all-fights totals.
 */
export function foldStripFightIntoPlayers(
    fight: StripFight,
    seeds: Record<string, StripSpikesPlayerSeed>,
    playerMap: Map<string, StripPlayer>,
): void {
    Object.entries(fight.values).forEach(([key, value]) => {
        const seed = seeds[key] || { account: key, characterName: '', profession: 'Unknown' };
        const { strips, stripTime, stripDownContrib } = value;
        const existing = playerMap.get(key);
        if (existing) {
            existing.logs += 1;
            existing.totalStrips += strips;
            existing.totalStripTime += stripTime;
            existing.totalStripDownContrib += stripDownContrib;
            if (!existing.professionList.includes(seed.profession)) {
                existing.professionList.push(seed.profession);
            }
            if (strips > existing.peakStrips) {
                existing.peakStrips = strips;
                existing.peakFightLabel = fight.fullLabel;
            }
            if (stripTime > existing.peakStripTime) existing.peakStripTime = stripTime;
            if (stripDownContrib > existing.peakStripDownContrib) existing.peakStripDownContrib = stripDownContrib;
        } else {
            playerMap.set(key, {
                key,
                account: seed.account,
                displayName: seed.account,
                characterName: seed.characterName,
                profession: seed.profession,
                professionList: [seed.profession],
                logs: 1,
                totalStrips: strips,
                totalStripTime: stripTime,
                totalStripDownContrib: stripDownContrib,
                peakStrips: strips,
                peakStripTime: stripTime,
                peakStripDownContrib: stripDownContrib,
                peakFightLabel: fight.fullLabel,
            });
        }
    });
}
```

- [ ] **Step 5: Rewire `ingestLogStripSpikes` to use the fold**

Declare `const seeds: Record<string, StripSpikesPlayerSeed> = {};` alongside the existing `values` record. In the member loop, immediately after `values[key] = { strips, stripTime, stripDownContrib };`, add:

```ts
        seeds[key] = { account, characterName, profession };
```

Delete the whole inline fold — everything from `const existing = acc.playerMap.get(key);` through the closing brace of its `else` branch — leaving the `maxStrips` / `maxStripTime` / `maxStripDownContrib` updates in place. Then replace the trailing `acc.fights.push({ ... })` with:

```ts
    const fight: StripFight = {
        id: fightId,
        shortLabel,
        fullLabel,
        timestamp,
        values,
        maxStrips,
        maxStripTime,
        maxStripDownContrib,
    };
    acc.fights.push(fight);
    acc.fightSeeds.push(seeds);
    foldStripFightIntoPlayers(fight, seeds, acc.playerMap);
```

- [ ] **Step 6: Add the frame extract and merge**

```ts
export interface StripSpikesFrame {
    fight: StripFight;
    seeds: Record<string, StripSpikesPlayerSeed>;
}

export function extractStripSpikesFrame(acc: StripSpikesAccumulator): StripSpikesFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractStripSpikesFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0], seeds: acc.fightSeeds[0] || {} };
}

export function mergeStripSpikesFrame(target: StripSpikesAccumulator, frame: StripSpikesFrame): void {
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    target.fightSeeds.push(frame.seeds);
    foldStripFightIntoPlayers(frame.fight, frame.seeds, target.playerMap);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeStripSpikes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeStripSpikesData.ts src/renderer/stats/slice/__tests__/mergeStripSpikes.test.ts
git commit -m "feat(slice): add strip spikes frame extract/merge with a shared player fold"
```

---

### Task 5: All-damage frames

`AllDamageFight.players` already carries `key`, `account`, `displayName`, `profession` and `professionList` on every bucket, so this module needs **no seeds** — the fold is fully derivable from the fight object.

**One ordering caveat.** `ingestLogAllDamage` folds players into `playerAgg` in member order, then sorts `fightPlayers` by `totalDamage` before pushing the fight. A frame-driven fold therefore iterates in damage order, not member order. That changes only the Map's insertion order, which surfaces as the tie-break order among players with byte-identical `totalDamage` in `finalizeAllDamage`'s stable sort. If the equivalence test fails on ordering alone, fix it by folding over a member-ordered copy: keep the unsorted array on the fight as it is built and sort a shallow copy for `fight.players`.

**Files:**
- Modify: `src/renderer/stats/computeAllDamageData.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeAllDamage.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface AllDamageFrame { fight: AllDamageFight }`
  - `foldAllDamageFightIntoPlayers(fight: AllDamageFight, playerAgg: Map<string, AllDamagePlayer>): void`
  - `extractAllDamageFrame(acc: AllDamageAccumulator): AllDamageFrame`
  - `mergeAllDamageFrame(target: AllDamageAccumulator, frame: AllDamageFrame): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeAllDamage.test.ts
import { describe, it, expect } from 'vitest';
import {
    createAllDamageAccumulator,
    ingestLogAllDamage,
    finalizeAllDamage,
    extractAllDamageFrame,
    mergeAllDamageFrame,
} from '../../computeAllDamageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTS = { splitPlayersByClass: false };

const directFinalize = (logs: any[]) => {
    const acc = createAllDamageAccumulator();
    logs.forEach((log) => ingestLogAllDamage(log, acc, OPTS));
    return finalizeAllDamage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createAllDamageAccumulator();
        ingestLogAllDamage(log, solo, OPTS);
        const frame = extractAllDamageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createAllDamageAccumulator();
    frames.forEach((frame) => mergeAllDamageFrame(merged, frame));
    return finalizeAllDamage(merged);
};

describe('all damage merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('sums damage across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.players[0].totalDamage).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createAllDamageAccumulator();
        LOGS.forEach((log) => ingestLogAllDamage(log, acc, OPTS));
        expect(() => extractAllDamageFrame(acc)).toThrow(/exactly one fight/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeAllDamage.test.ts`
Expected: FAIL — `"extractAllDamageFrame" is not exported by ".../computeAllDamageData.ts"`.

- [ ] **Step 3: Extract the player fold**

Add to `src/renderer/stats/computeAllDamageData.ts`, above `ingestLogAllDamage`:

```ts
/**
 * Fold one fight's player buckets into the running player aggregate. Shared by
 * `ingestLogAllDamage` and `mergeAllDamageFrame`, so slice-mode totals cannot
 * drift from all-fights totals. Every field it needs already lives on the
 * bucket, which is why this module's frame carries no seeds.
 */
export function foldAllDamageFightIntoPlayers(
    fight: AllDamageFight,
    playerAgg: Map<string, AllDamagePlayer>,
): void {
    fight.players.forEach((bucket) => {
        const existing = playerAgg.get(bucket.key);
        if (existing) {
            existing.logs += 1;
            existing.totalDamage += bucket.totalDamage;
            existing.totalDownContribution += bucket.totalDownContribution;
            if (!existing.professionList.includes(bucket.profession) && bucket.profession !== 'Unknown') {
                existing.professionList.push(bucket.profession);
            }
        } else {
            playerAgg.set(bucket.key, {
                key: bucket.key,
                account: bucket.account,
                displayName: bucket.displayName,
                profession: bucket.profession,
                professionList: [bucket.profession].filter((p) => p !== 'Unknown'),
                logs: 1,
                totalDamage: bucket.totalDamage,
                totalDownContribution: bucket.totalDownContribution,
            });
        }
    });
}
```

- [ ] **Step 4: Rewire `ingestLogAllDamage` to use the fold**

Delete the inline `// Aggregate player totals` block — everything from `const existing = acc.playerAgg.get(key);` through the closing brace of its `else` branch — from the member loop. Keep `fightTotalDamage` / `fightTotalDown` accumulating where they are. Then replace the trailing `acc.fights.push({ ... })` with:

```ts
    const fight: AllDamageFight = {
        id: String(log?.filePath || log?.id || `fight-${index + 1}`),
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        totalDamage: fightTotalDamage,
        totalDownContribution: fightTotalDown,
        durationMs,
        isWin,
        players: fightPlayers,
    };
    acc.fights.push(fight);
    foldAllDamageFightIntoPlayers(fight, acc.playerAgg);
```

The existing `fightPlayers.sort(...)` and `const isWin = ...` lines stay immediately above this block, unchanged.

- [ ] **Step 5: Add the frame extract and merge**

```ts
export interface AllDamageFrame {
    fight: AllDamageFight;
}

export function extractAllDamageFrame(acc: AllDamageAccumulator): AllDamageFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractAllDamageFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0] };
}

export function mergeAllDamageFrame(target: AllDamageAccumulator, frame: AllDamageFrame): void {
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    foldAllDamageFightIntoPlayers(frame.fight, target.playerAgg);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeAllDamage.test.ts`
Expected: PASS (6 tests). If only the ordering test fails, apply the member-order fix described in this task's preamble and re-run.

- [ ] **Step 7: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeAllDamageData.ts src/renderer/stats/slice/__tests__/mergeAllDamage.test.ts
git commit -m "feat(slice): add all-damage frame extract/merge with a shared player fold"
```

---

### Task 6: Incoming strike damage frames

This module keys its `playerMap` by **profession**, not by account — `key`, `account`, `displayName` and `profession` are all the profession string, and `characterName` is always `''`. Everything the fold needs is therefore already on the fight, so this module needs **no seeds and no accumulator change**.

**Files:**
- Modify: `src/renderer/stats/computeIncomingStrikeDamageData.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeIncomingStrike.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface IncomingStrikeFrame { fight: IncomingStrikeFight }`
  - `foldIncomingStrikeFightIntoPlayers(fight: IncomingStrikeFight, playerMap: Map<string, IncomingStrikePlayer>): void`
  - `extractIncomingStrikeFrame(acc: IncomingStrikeDamageAccumulator): IncomingStrikeFrame`
  - `mergeIncomingStrikeFrame(target: IncomingStrikeDamageAccumulator, frame: IncomingStrikeFrame): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeIncomingStrike.test.ts
import { describe, it, expect } from 'vitest';
import {
    createIncomingStrikeDamageAccumulator,
    ingestLogIncomingStrikeDamage,
    finalizeIncomingStrikeDamage,
    extractIncomingStrikeFrame,
    mergeIncomingStrikeFrame,
} from '../../computeIncomingStrikeDamageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const directFinalize = (logs: any[]) => {
    const acc = createIncomingStrikeDamageAccumulator();
    logs.forEach((log) => ingestLogIncomingStrikeDamage(log, acc));
    return finalizeIncomingStrikeDamage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createIncomingStrikeDamageAccumulator();
        ingestLogIncomingStrikeDamage(log, solo);
        const frame = extractIncomingStrikeFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createIncomingStrikeDamageAccumulator();
    frames.forEach((frame) => mergeIncomingStrikeFrame(merged, frame));
    return finalizeIncomingStrikeDamage(merged);
};

describe('incoming strike damage merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('accumulates incoming damage across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
        const allTotal = all.players.reduce((sum, p) => sum + p.totalDamage, 0);
        const oneTotal = one.players.reduce((sum, p) => sum + p.totalDamage, 0);
        expect(allTotal).toBeGreaterThan(oneTotal);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createIncomingStrikeDamageAccumulator();
        LOGS.forEach((log) => ingestLogIncomingStrikeDamage(log, acc));
        expect(() => extractIncomingStrikeFrame(acc)).toThrow(/exactly one fight/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeIncomingStrike.test.ts`
Expected: FAIL — `"extractIncomingStrikeFrame" is not exported by ".../computeIncomingStrikeDamageData.ts"`.

- [ ] **Step 3: Extract the fold**

Add to `src/renderer/stats/computeIncomingStrikeDamageData.ts`, above `ingestLogIncomingStrikeDamage`:

```ts
/**
 * Fold one fight's per-profession values into the running player map. Shared by
 * `ingestLogIncomingStrikeDamage` and `mergeIncomingStrikeFrame`. This map is
 * keyed by profession, so the fight object already carries every identity field
 * the fold needs — hence no seeds.
 */
export function foldIncomingStrikeFightIntoPlayers(
    fight: IncomingStrikeFight,
    playerMap: Map<string, IncomingStrikePlayer>,
): void {
    Object.entries(fight.values).forEach(([profession, value]) => {
        const existing = playerMap.get(profession) || {
            key: profession,
            account: profession,
            displayName: profession,
            characterName: '',
            profession,
            professionList: [profession],
            logs: 0,
            peakHit: 0,
            peak1s: 0,
            peak5s: 0,
            peak30s: 0,
            totalDamage: 0,
            peakFightLabel: '',
            peakSkillName: ''
        };
        existing.totalDamage += Number(value.totalDamage || 0);
        existing.logs += 1;
        const hit = Number(value.hit || 0);
        if (hit > existing.peakHit) {
            existing.peakHit = hit;
            existing.peakFightLabel = fight.fullLabel;
            existing.peakSkillName = value.skillName || 'Unknown Skill';
        }
        if (value.burst1s > existing.peak1s) existing.peak1s = value.burst1s;
        if (value.burst5s > existing.peak5s) existing.peak5s = value.burst5s;
        if (value.burst30s > existing.peak30s) existing.peak30s = value.burst30s;
        playerMap.set(profession, existing);
    });
}
```

- [ ] **Step 4: Rewire `ingestLogIncomingStrikeDamage` to use the fold**

In the `classSeries.forEach` loop, delete the inline fold — everything from `const existing = acc.playerMap.get(key) || {` through `acc.playerMap.set(key, existing);` — leaving the `values[key] = { ... }` assignment in place. Then replace the trailing `acc.fights.push({ ... })` so the fight is built as a named const, pushed, and folded:

```ts
    const fight: IncomingStrikeFight = {
        id: log.filePath || log.id || `fight-${index + 1}`,
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        values,
        maxHit,
        max1s,
        max5s,
        max30s,
        maxTotal
    };
    acc.fights.push(fight);
    foldIncomingStrikeFightIntoPlayers(fight, acc.playerMap);
```

Keep the existing `maxHit` / `max1s` / `max5s` / `max30s` / `maxTotal` computations exactly as they are, immediately above this block.

- [ ] **Step 5: Add the frame extract and merge**

```ts
export interface IncomingStrikeFrame {
    fight: IncomingStrikeFight;
}

export function extractIncomingStrikeFrame(acc: IncomingStrikeDamageAccumulator): IncomingStrikeFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractIncomingStrikeFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0] };
}

export function mergeIncomingStrikeFrame(
    target: IncomingStrikeDamageAccumulator,
    frame: IncomingStrikeFrame,
): void {
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    foldIncomingStrikeFightIntoPlayers(frame.fight, target.playerMap);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeIncomingStrike.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeIncomingStrikeDamageData.ts src/renderer/stats/slice/__tests__/mergeIncomingStrike.test.ts
git commit -m "feat(slice): add incoming strike damage frame extract/merge"
```

---

### Task 7: Boon timeline frames

`BoonTimelineAccumulator` is `{ boonBuckets: Map<boonId, BoonBucket>, logIndex }`, and each bucket holds `players: Map<key, BoonPlayer>` plus `fights: BoonFight[]`. Unlike the damage modules, the ingest fold here is deeply interleaved with boon iteration and is not worth extracting. Instead, merge **bucket-wise**: every field of `BoonPlayer` is a sum or a union, because ingest only ever adds. A single-log frame's player map is therefore already the correct per-fight contribution, and merging is adding it in.

**Files:**
- Modify: `src/renderer/stats/computeBoonTimeline.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeBoonTimeline.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface BoonTimelineFrame { boonBuckets: BoonTimelineAccumulator['boonBuckets'] }`
  - `extractBoonTimelineFrame(acc: BoonTimelineAccumulator): BoonTimelineFrame`
  - `mergeBoonTimelineFrame(target: BoonTimelineAccumulator, frame: BoonTimelineFrame): void`
- Note: `BoonBucket` and `BoonPlayer` are currently module-private `type` declarations. Add `export` to both so the frame type and the test can name them.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeBoonTimeline.test.ts
import { describe, it, expect } from 'vitest';
import {
    createBoonTimelineAccumulator,
    ingestLogBoonTimeline,
    finalizeBoonTimeline,
    extractBoonTimelineFrame,
    mergeBoonTimelineFrame,
} from '../../computeBoonTimeline';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const directFinalize = (logs: any[]) => {
    const acc = createBoonTimelineAccumulator();
    logs.forEach((log) => ingestLogBoonTimeline(log, acc));
    return finalizeBoonTimeline(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createBoonTimelineAccumulator();
        ingestLogBoonTimeline(log, solo);
        const frame = extractBoonTimelineFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createBoonTimelineAccumulator();
    frames.forEach((frame) => mergeBoonTimelineFrame(merged, frame));
    return finalizeBoonTimeline(merged);
};

describe('boon timeline merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('produces non-empty boon output that grows with the slice', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.length).toBeGreaterThan(0);
        expect(all[0].fights.length).toBeGreaterThan(one[0].fights.length);
    });

    it('refuses to export a frame from an accumulator that ingested more than one log', () => {
        const acc = createBoonTimelineAccumulator();
        LOGS.forEach((log) => ingestLogBoonTimeline(log, acc));
        expect(() => extractBoonTimelineFrame(acc)).toThrow(/exactly one log/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeBoonTimeline.test.ts`
Expected: FAIL — `"extractBoonTimelineFrame" is not exported by ".../computeBoonTimeline.ts"`.

- [ ] **Step 3: Export the bucket and player types**

In `src/renderer/stats/computeBoonTimeline.ts`, change `type BoonPlayer = {` to `export type BoonPlayer = {` and `type BoonBucket = {` to `export type BoonBucket = {`. Leave both bodies unchanged.

- [ ] **Step 4: Add the frame extract and merge**

Append to `src/renderer/stats/computeBoonTimeline.ts`:

```ts
export interface BoonTimelineFrame {
    boonBuckets: Map<string, BoonBucket>;
}

export function extractBoonTimelineFrame(acc: BoonTimelineAccumulator): BoonTimelineFrame {
    if (acc.logIndex !== 1) {
        throw new Error(`extractBoonTimelineFrame expects exactly one log, got ${acc.logIndex}`);
    }
    return { boonBuckets: acc.boonBuckets };
}

/**
 * Merge one fight's boon buckets into a running accumulator.
 *
 * Every `BoonPlayer` field is a sum or a union — `ingestLogBoonTimeline` only
 * ever adds — so a single-log frame's player map IS that fight's contribution
 * and merging is adding it in. `fights` concatenates; `finalizeBoonTimeline`
 * re-sorts and renumbers.
 */
export function mergeBoonTimelineFrame(target: BoonTimelineAccumulator, frame: BoonTimelineFrame): void {
    target.logIndex += 1;
    frame.boonBuckets.forEach((sourceBucket, boonId) => {
        let bucket = target.boonBuckets.get(boonId);
        if (!bucket) {
            bucket = {
                id: sourceBucket.id,
                name: sourceBucket.name,
                icon: sourceBucket.icon,
                stacking: sourceBucket.stacking,
                players: new Map<string, BoonPlayer>(),
                fights: [],
            };
            target.boonBuckets.set(boonId, bucket);
        } else {
            if ((!bucket.name || bucket.name === boonId) && sourceBucket.name) bucket.name = sourceBucket.name;
            if (!bucket.icon && sourceBucket.icon) bucket.icon = sourceBucket.icon;
            if (!bucket.stacking && sourceBucket.stacking) bucket.stacking = true;
        }
        sourceBucket.fights.forEach((fight) => bucket!.fights.push(fight));
        sourceBucket.players.forEach((sourcePlayer, key) => {
            const existing = bucket!.players.get(key);
            if (!existing) {
                bucket!.players.set(key, {
                    ...sourcePlayer,
                    professionList: [...sourcePlayer.professionList],
                    totals: { ...sourcePlayer.totals },
                });
                return;
            }
            existing.logs += sourcePlayer.logs;
            existing.totals.selfBuffs += sourcePlayer.totals.selfBuffs;
            existing.totals.groupBuffs += sourcePlayer.totals.groupBuffs;
            existing.totals.squadBuffs += sourcePlayer.totals.squadBuffs;
            existing.totals.totalBuffs += sourcePlayer.totals.totalBuffs;
            sourcePlayer.professionList.forEach((profession) => {
                if (!existing.professionList.includes(profession)) existing.professionList.push(profession);
            });
            if ((!existing.profession || existing.profession === 'Unknown')
                && sourcePlayer.profession && sourcePlayer.profession !== 'Unknown') {
                existing.profession = sourcePlayer.profession;
            }
        });
    });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeBoonTimeline.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeBoonTimeline.ts src/renderer/stats/slice/__tests__/mergeBoonTimeline.test.ts
git commit -m "feat(slice): add boon timeline frame extract/merge"
```

---

### Task 8: Boon uptime timeline frames

Same bucket-wise merge as boon timeline, with a different player shape: `UptimePlayer` is `{ key, account, displayName, profession, professionList, logs, total, peak }`. `total` and `logs` are sums; `peak` is a max (`playerEntry.peak = Math.max(playerEntry.peak, fightValue.peak)` at `computeBoonUptimeTimeline.ts:218`). The bucket also carries `intervalMs`, which is derived from settings, not from the log — a merged bucket keeps the target's value and never overwrites it.

**Files:**
- Modify: `src/renderer/stats/computeBoonUptimeTimeline.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeBoonUptime.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface BoonUptimeFrame { boonBuckets: Map<string, UptimeBucket> }`
  - `extractBoonUptimeFrame(acc: BoonUptimeTimelineAccumulator): BoonUptimeFrame`
  - `mergeBoonUptimeFrame(target: BoonUptimeTimelineAccumulator, frame: BoonUptimeFrame): void`
- Note: `UptimeBucket` and `UptimePlayer` are module-private `type` declarations. Add `export` to both.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeBoonUptime.test.ts
import { describe, it, expect } from 'vitest';
import {
    createBoonUptimeTimelineAccumulator,
    ingestLogBoonUptimeTimeline,
    finalizeBoonUptimeTimeline,
    extractBoonUptimeFrame,
    mergeBoonUptimeFrame,
} from '../../computeBoonUptimeTimeline';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const SETTINGS = { boonBucketIntervalMs: 5000, stackingBoonBucketIntervalMs: 5000 };

const directFinalize = (logs: any[]) => {
    const acc = createBoonUptimeTimelineAccumulator(SETTINGS);
    logs.forEach((log) => ingestLogBoonUptimeTimeline(log, acc));
    return finalizeBoonUptimeTimeline(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createBoonUptimeTimelineAccumulator(SETTINGS);
        ingestLogBoonUptimeTimeline(log, solo);
        const frame = extractBoonUptimeFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createBoonUptimeTimelineAccumulator(SETTINGS);
    frames.forEach((frame) => mergeBoonUptimeFrame(merged, frame));
    return finalizeBoonUptimeTimeline(merged);
};

describe('boon uptime timeline merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('produces non-empty uptime output that grows with the slice', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.length).toBeGreaterThan(0);
        expect(all[0].fights.length).toBeGreaterThan(one[0].fights.length);
    });

    it('refuses to export a frame from an accumulator that ingested more than one log', () => {
        const acc = createBoonUptimeTimelineAccumulator(SETTINGS);
        LOGS.forEach((log) => ingestLogBoonUptimeTimeline(log, acc));
        expect(() => extractBoonUptimeFrame(acc)).toThrow(/exactly one log/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeBoonUptime.test.ts`
Expected: FAIL — `"extractBoonUptimeFrame" is not exported by ".../computeBoonUptimeTimeline.ts"`.

- [ ] **Step 3: Export the bucket and player types**

Change `type UptimePlayer = {` to `export type UptimePlayer = {` and `type UptimeBucket = {` to `export type UptimeBucket = {`.

- [ ] **Step 4: Add the frame extract and merge**

Append to `src/renderer/stats/computeBoonUptimeTimeline.ts`:

```ts
export interface BoonUptimeFrame {
    boonBuckets: Map<string, UptimeBucket>;
}

export function extractBoonUptimeFrame(acc: BoonUptimeTimelineAccumulator): BoonUptimeFrame {
    if (acc.logIndex !== 1) {
        throw new Error(`extractBoonUptimeFrame expects exactly one log, got ${acc.logIndex}`);
    }
    return { boonBuckets: acc.boonBuckets };
}

/**
 * Merge one fight's uptime buckets into a running accumulator.
 *
 * `total` and `logs` are sums; `peak` is a max, mirroring the ingest fold.
 * `intervalMs` comes from settings rather than from the log, so the target's
 * value always wins — a frame built under different settings is rejected far
 * earlier, by the sidecar's settingsHash check.
 */
export function mergeBoonUptimeFrame(target: BoonUptimeTimelineAccumulator, frame: BoonUptimeFrame): void {
    target.logIndex += 1;
    frame.boonBuckets.forEach((sourceBucket, boonId) => {
        let bucket = target.boonBuckets.get(boonId);
        if (!bucket) {
            bucket = {
                id: sourceBucket.id,
                name: sourceBucket.name,
                icon: sourceBucket.icon,
                stacking: sourceBucket.stacking,
                intervalMs: sourceBucket.stacking
                    ? target.defaultStackingIntervalMs
                    : target.defaultBoonIntervalMs,
                players: new Map<string, UptimePlayer>(),
                fights: [],
            };
            target.boonBuckets.set(boonId, bucket);
        } else {
            if ((!bucket.name || bucket.name === boonId) && sourceBucket.name) bucket.name = sourceBucket.name;
            if (!bucket.icon && sourceBucket.icon) bucket.icon = sourceBucket.icon;
        }
        sourceBucket.fights.forEach((fight) => bucket!.fights.push(fight));
        sourceBucket.players.forEach((sourcePlayer, key) => {
            const existing = bucket!.players.get(key);
            if (!existing) {
                bucket!.players.set(key, {
                    ...sourcePlayer,
                    professionList: [...sourcePlayer.professionList],
                });
                return;
            }
            existing.logs += sourcePlayer.logs;
            existing.total += sourcePlayer.total;
            existing.peak = Math.max(existing.peak, sourcePlayer.peak);
            sourcePlayer.professionList.forEach((profession) => {
                if (!existing.professionList.includes(profession)) existing.professionList.push(profession);
            });
            if ((!existing.profession || existing.profession === 'Unknown')
                && sourcePlayer.profession && sourcePlayer.profession !== 'Unknown') {
                existing.profession = sourcePlayer.profession;
            }
        });
    });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeBoonUptime.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeBoonUptimeTimeline.ts src/renderer/stats/slice/__tests__/mergeBoonUptime.test.ts
git commit -m "feat(slice): add boon uptime timeline frame extract/merge"
```

---

### Task 9: Skill usage frames

`SkillUsageAccumulator` has no `fights` array — it has `logRecords` (per-log, concatenates), three sums (`skillTotals`, and per-player `logs` / `totalActiveSeconds` / `skillTotals`), and four metadata maps. Two different metadata rules apply and getting them backwards is silent: `skillNameMap` is `set` unconditionally on every ingest so **the last log wins**, while `skillIconMap`, `skillAutoAttackMap` and `skillProcMap` are guarded by `has()` so **the first log wins**. Merging in frame order reproduces both.

**Files:**
- Modify: `src/renderer/stats/computeSkillUsageData.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeSkillUsage.test.ts`

**Interfaces:**
- Consumes: `encodeState` / `decodeState` from `src/renderer/stats/slice/stateCodec.ts`.
- Produces:
  - `interface SkillUsageFrame { acc: SkillUsageAccumulator }`
  - `extractSkillUsageFrame(acc: SkillUsageAccumulator): SkillUsageFrame`
  - `mergeSkillUsageFrame(target: SkillUsageAccumulator, frame: SkillUsageFrame): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeSkillUsage.test.ts
import { describe, it, expect } from 'vitest';
import {
    createSkillUsageAccumulator,
    ingestLogSkillUsage,
    finalizeSkillUsage,
    extractSkillUsageFrame,
    mergeSkillUsageFrame,
} from '../../computeSkillUsageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const directFinalize = (logs: any[]) => {
    const acc = createSkillUsageAccumulator();
    logs.forEach((log) => ingestLogSkillUsage(log, acc));
    return finalizeSkillUsage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createSkillUsageAccumulator();
        ingestLogSkillUsage(log, solo);
        const frame = extractSkillUsageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createSkillUsageAccumulator();
    frames.forEach((frame) => mergeSkillUsageFrame(merged, frame));
    return finalizeSkillUsage(merged);
};

describe('skill usage merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('sums cast counts across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.skillOptions.length).toBeGreaterThan(0);
        expect(all.logRecords).toHaveLength(3);
        expect(one.logRecords).toHaveLength(1);
        const allTotal = all.skillOptions.reduce((sum, s) => sum + s.total, 0);
        const oneTotal = one.skillOptions.reduce((sum, s) => sum + s.total, 0);
        expect(allTotal).toBeGreaterThan(oneTotal);
    });

    it('refuses to export a frame from an accumulator holding more than one log record', () => {
        const acc = createSkillUsageAccumulator();
        LOGS.forEach((log) => ingestLogSkillUsage(log, acc));
        expect(() => extractSkillUsageFrame(acc)).toThrow(/exactly one log/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeSkillUsage.test.ts`
Expected: FAIL — `"extractSkillUsageFrame" is not exported by ".../computeSkillUsageData.ts"`.

- [ ] **Step 3: Add the frame extract and merge**

Append to `src/renderer/stats/computeSkillUsageData.ts`:

```ts
export interface SkillUsageFrame {
    acc: SkillUsageAccumulator;
}

export function extractSkillUsageFrame(acc: SkillUsageAccumulator): SkillUsageFrame {
    if (acc.logRecords.length !== 1) {
        throw new Error(`extractSkillUsageFrame expects exactly one log, got ${acc.logRecords.length}`);
    }
    return { acc };
}

/**
 * Merge one fight's skill usage into a running accumulator.
 *
 * Two metadata rules, and they are opposites — `skillNameMap` is `set`
 * unconditionally during ingest, so the LAST log wins; the icon, auto-attack
 * and proc maps are `has()`-guarded, so the FIRST log wins. Merging frames in
 * fight order reproduces both.
 */
export function mergeSkillUsageFrame(target: SkillUsageAccumulator, frame: SkillUsageFrame): void {
    const source = frame.acc;

    source.skillTotals.forEach((total, sId) => {
        target.skillTotals.set(sId, (target.skillTotals.get(sId) || 0) + total);
    });

    source.playerMap.forEach((sourcePlayer, key) => {
        const existing = target.playerMap.get(key);
        if (!existing) {
            target.playerMap.set(key, {
                ...sourcePlayer,
                professionList: [...sourcePlayer.professionList],
                skillTotals: { ...sourcePlayer.skillTotals },
            });
            return;
        }
        existing.logs += sourcePlayer.logs;
        existing.totalActiveSeconds = (existing.totalActiveSeconds || 0) + (sourcePlayer.totalActiveSeconds || 0);
        Object.entries(sourcePlayer.skillTotals).forEach(([sId, count]) => {
            existing.skillTotals[sId] = (existing.skillTotals[sId] || 0) + count;
        });
        sourcePlayer.professionList.forEach((profession) => {
            if (!existing.professionList.includes(profession)) existing.professionList.push(profession);
        });
    });

    source.logRecords.forEach((record) => target.logRecords.push(record));

    // Last-wins.
    source.skillNameMap.forEach((name, sId) => target.skillNameMap.set(sId, name));

    // First-wins.
    source.skillIconMap.forEach((icon, sId) => {
        if (!target.skillIconMap.has(sId)) target.skillIconMap.set(sId, icon);
    });
    source.skillAutoAttackMap.forEach((autoAttack, sId) => {
        if (!target.skillAutoAttackMap.has(sId)) target.skillAutoAttackMap.set(sId, autoAttack);
    });
    source.skillProcMap.forEach((proc, sId) => {
        if (!target.skillProcMap.has(sId)) target.skillProcMap.set(sId, proc);
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeSkillUsage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeSkillUsageData.ts src/renderer/stats/slice/__tests__/mergeSkillUsage.test.ts
git commit -m "feat(slice): add skill usage frame extract/merge"
```

---

### Task 10: Player aggregation frames

The largest accumulator by far, and the only one living in the `@axiapps/bridge-metrics` workspace package. `PlayerAggregationAccumulators` has twenty-odd fields and `PlayerStats` alone has about fifty, so the merge is written as an explicit **field-rule table** rather than as hand-written per-field code, and guarded by a **coverage test** that fails if a real fixture produces a `PlayerStats` key with no rule. That converts "fifty fields, one silently wrong" into a loud failure the first time upstream adds a field.

**Read this before you start:** `@axiapps/bridge-metrics` resolves through `dist/`, not `src/`. After every edit under `packages/bridge-metrics/src/`, run `npm run build --workspace @axiapps/bridge-metrics` before running any test, or you will debug a stale build and conclude the code is wrong when it is merely not compiled.

**Expect to iterate.** The rule table below is the starting classification, not a guarantee. Run the equivalence test, read the diff, correct the rule, re-run. That loop is the point of the task; a rule that survives the seven-fixture deep-equal is a rule that is right.

**Files:**
- Create: `packages/bridge-metrics/src/mergePlayerAggregation.ts`
- Modify: `packages/bridge-metrics/src/computePlayerAggregation.ts` (one re-export line)
- Test: `src/renderer/stats/slice/__tests__/mergePlayerAggregation.test.ts`

**Interfaces:**
- Consumes: `PlayerAggregationAccumulators`, `PlayerStats`, `DamageMitigationTotals`, `SpecialBuffAggEntry` from `./computePlayerAggregation`.
- Produces: `mergePlayerAggregationAccumulators(target: PlayerAggregationAccumulators, source: PlayerAggregationAccumulators): void`; `PLAYER_STATS_MERGE_RULES: Record<string, MergeRule>`; `type MergeRule = 'sum' | 'max' | 'min' | 'first' | 'or' | 'setUnion' | 'arrayUnion' | 'recordSum' | 'recordDeepSum' | 'firstKnown' | 'derived'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergePlayerAggregation.test.ts
import { describe, it, expect } from 'vitest';
import {
    createPlayerAggregationAccumulators,
    precomputeGlobalEnemySkillStats,
    ingestLogPlayerData,
    finalizePlayerAggregation,
    mergePlayerAggregationAccumulators,
    PLAYER_STATS_MERGE_RULES,
} from '../../computePlayerAggregation';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTIONS = { method: 'strict' as const, skillDamageSource: 'target', splitPlayersByClass: false };

const ingestAll = (logs: any[]) => {
    const acc = createPlayerAggregationAccumulators();
    logs.forEach((log) => {
        precomputeGlobalEnemySkillStats(log, acc);
        ingestLogPlayerData(log, acc, OPTIONS);
    });
    return acc;
};

const soloAcc = (log: any) => {
    const acc = createPlayerAggregationAccumulators();
    precomputeGlobalEnemySkillStats(log, acc);
    ingestLogPlayerData(log, acc, OPTIONS);
    return acc;
};

const mergedAcc = (logs: any[], viaJson = false) => {
    const target = createPlayerAggregationAccumulators();
    logs.forEach((log) => {
        const solo = soloAcc(log);
        const source = viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(solo)))) : solo;
        mergePlayerAggregationAccumulators(target, source);
    });
    return target;
};

describe('player aggregation merge equivalence', () => {
    it('gives every PlayerStats field produced by a real log a merge rule', () => {
        // Guards the silent failure mode: an upstream field added to PlayerStats
        // with no rule would otherwise be dropped from every sliced report.
        const acc = ingestAll([LOGS[0]]);
        const sample = [...acc.playerStats.values()][0];
        expect(sample).toBeTruthy();
        const missing = Object.keys(sample).filter((key) => !(key in PLAYER_STATS_MERGE_RULES));
        expect(missing).toEqual([]);
    });

    it('reproduces the all-fights player stats from per-fight accumulators', () => {
        expect(mergedAcc(LOGS).playerStats).toEqual(ingestAll(LOGS).playerStats);
    });

    it('reproduces the all-fights finalize output', () => {
        const direct = finalizePlayerAggregation(ingestAll(LOGS), OPTIONS);
        const merged = finalizePlayerAggregation(mergedAcc(LOGS), OPTIONS);
        expect(merged).toEqual(direct);
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        const direct = finalizePlayerAggregation(ingestAll(subset), OPTIONS);
        const merged = finalizePlayerAggregation(mergedAcc(subset), OPTIONS);
        expect(merged).toEqual(direct);
    });

    it('survives a JSON round trip through the state codec', () => {
        const direct = finalizePlayerAggregation(ingestAll(LOGS), OPTIONS);
        const merged = finalizePlayerAggregation(mergedAcc(LOGS, true), OPTIONS);
        expect(merged).toEqual(direct);
    });

    it('accumulates rather than replacing — totals grow with the slice', () => {
        const all = mergedAcc(LOGS);
        const one = mergedAcc([LOGS[0]]);
        const sum = (acc: any) => [...acc.playerStats.values()].reduce((t: number, p: any) => t + p.damage, 0);
        expect(sum(all)).toBeGreaterThan(sum(one));
        expect(all.wins + all.losses).toBe(3);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/renderer/stats/slice/__tests__/mergePlayerAggregation.test.ts
```
Expected: FAIL — `"mergePlayerAggregationAccumulators" is not exported`.

- [ ] **Step 3: Write the merge helpers and rule table**

```ts
// packages/bridge-metrics/src/mergePlayerAggregation.ts
import type {
    PlayerAggregationAccumulators,
    PlayerStats,
    DamageMitigationTotals,
} from './computePlayerAggregation';

export type MergeRule =
    | 'sum' | 'max' | 'min' | 'first' | 'or'
    | 'setUnion' | 'arrayUnion' | 'recordSum' | 'recordDeepSum'
    | 'firstKnown' | 'derived';

/**
 * How each PlayerStats field combines when two accumulators are merged.
 *
 * `derived` means finalizePlayerAggregation recomputes the field, so the merge
 * leaves the target's value alone. `firstKnown` takes the source's value only
 * when the target's is missing or 'Unknown'. Everything else is what it says.
 *
 * A field produced by a real log with no rule here is a test failure, not a
 * silent drop — see the coverage test in mergePlayerAggregation.test.ts.
 */
export const PLAYER_STATS_MERGE_RULES: Record<string, MergeRule> = {
    name: 'first',
    account: 'first',
    characterNames: 'setUnion',
    downContrib: 'sum',
    cleanses: 'sum',
    strips: 'sum',
    stab: 'sum',
    healing: 'sum',
    barrier: 'sum',
    cc: 'sum',
    interrupts: 'sum',
    logsJoined: 'sum',
    totalDist: 'sum',
    distCount: 'sum',
    stackedLogCount: 'sum',
    dodges: 'sum',
    downs: 'sum',
    deaths: 'sum',
    kills: 'sum',
    enemyDowns: 'sum',
    damageTaken: 'sum',
    breakbar: 'sum',
    blocks: 'sum',
    evades: 'sum',
    misses: 'sum',
    totalFightMs: 'sum',
    offenseTotals: 'recordSum',
    offenseRateWeights: 'recordSum',
    defenseActiveMs: 'sum',
    defenseTotals: 'recordSum',
    defenseMinionDamageTaken: 'recordSum',
    supportActiveMs: 'sum',
    supportTotals: 'recordSum',
    healingActiveMs: 'sum',
    healingTotals: 'recordSum',
    hasHealAddon: 'or',
    profession: 'firstKnown',
    professions: 'setUnion',
    professionList: 'arrayUnion',
    professionTimeMs: 'recordSum',
    squadActiveMs: 'sum',
    firstSeenFightTs: 'min',
    lastSeenFightTs: 'max',
    lastSeenFightDurationMs: 'derived',
    isCommander: 'or',
    damage: 'sum',
    dps: 'derived',
    revives: 'sum',
    outgoingConditions: 'recordDeepSum',
    incomingConditions: 'recordDeepSum',
    damageModTotals: 'recordDeepSum',
    incomingDamageModTotals: 'recordDeepSum',
    roleClassification: 'derived',
};

/** Sum every numeric leaf of `source` into `target`, first-wins for strings. */
export const deepSumInto = (target: any, source: any): void => {
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([key, value]) => {
        if (typeof value === 'number') {
            target[key] = Number(target[key] || 0) + value;
        } else if (Array.isArray(value)) {
            if (!Array.isArray(target[key])) target[key] = [...value];
            else value.forEach((v, i) => {
                if (typeof v === 'number') target[key][i] = Number(target[key][i] || 0) + v;
            });
        } else if (value && typeof value === 'object') {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            deepSumInto(target[key], value);
        } else if (target[key] === undefined) {
            target[key] = value;
        }
    });
};

const applyRule = (rule: MergeRule, targetValue: any, sourceValue: any): any => {
    switch (rule) {
        case 'sum': return Number(targetValue || 0) + Number(sourceValue || 0);
        case 'max': return Math.max(Number(targetValue || 0), Number(sourceValue || 0));
        case 'min': {
            const t = Number(targetValue || 0);
            const s = Number(sourceValue || 0);
            if (!t) return s;
            if (!s) return t;
            return Math.min(t, s);
        }
        case 'or': return Boolean(targetValue) || Boolean(sourceValue);
        case 'first': return targetValue !== undefined && targetValue !== '' ? targetValue : sourceValue;
        case 'firstKnown':
            return targetValue && targetValue !== 'Unknown' ? targetValue : sourceValue;
        case 'setUnion': {
            const out = targetValue instanceof Set ? targetValue : new Set(targetValue || []);
            (sourceValue instanceof Set ? sourceValue : new Set(sourceValue || []))
                .forEach((v: any) => out.add(v));
            return out;
        }
        case 'arrayUnion': {
            const out = Array.isArray(targetValue) ? targetValue : [];
            (Array.isArray(sourceValue) ? sourceValue : []).forEach((v) => {
                if (!out.includes(v)) out.push(v);
            });
            return out;
        }
        case 'recordSum': {
            const out = targetValue && typeof targetValue === 'object' ? targetValue : {};
            Object.entries(sourceValue || {}).forEach(([k, v]) => {
                out[k] = Number(out[k] || 0) + Number(v || 0);
            });
            return out;
        }
        case 'recordDeepSum': {
            const out = targetValue && typeof targetValue === 'object' ? targetValue : {};
            deepSumInto(out, sourceValue || {});
            return out;
        }
        case 'derived':
        default:
            return targetValue === undefined ? sourceValue : targetValue;
    }
};

const mergePlayerStatsInto = (target: PlayerStats, source: PlayerStats): void => {
    // `lastSeenFightDurationMs` belongs to whichever side saw the later fight,
    // so it is resolved before `lastSeenFightTs` is overwritten by the rule pass.
    const sourceIsLater = Number((source as any).lastSeenFightTs || 0)
        >= Number((target as any).lastSeenFightTs || 0);
    Object.entries(source as any).forEach(([key, value]) => {
        const rule = PLAYER_STATS_MERGE_RULES[key] || 'sum';
        (target as any)[key] = applyRule(rule, (target as any)[key], value);
    });
    if (sourceIsLater) {
        (target as any).lastSeenFightDurationMs = (source as any).lastSeenFightDurationMs;
    }
};

const mergeMapInto = <V>(
    target: Map<string, V>,
    source: Map<string, V>,
    combine: (existing: V, incoming: V) => void,
    clone: (incoming: V) => V,
): void => {
    source.forEach((incoming, key) => {
        const existing = target.get(key);
        if (!existing) target.set(key, clone(incoming));
        else combine(existing, incoming);
    });
};

const cloneDeep = <T>(value: T): T => {
    if (value instanceof Set) return new Set(value) as unknown as T;
    if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, cloneDeep(v)])) as unknown as T;
    if (Array.isArray(value)) return value.map(cloneDeep) as unknown as T;
    if (value && typeof value === 'object') {
        const out: any = {};
        Object.entries(value as any).forEach(([k, v]) => { out[k] = cloneDeep(v); });
        return out;
    }
    return value;
};

const mergeMitigationTotalsInto = (target: DamageMitigationTotals, source: DamageMitigationTotals): void => {
    target.totalHits += source.totalHits;
    target.blocked += source.blocked;
    target.evaded += source.evaded;
    target.glanced += source.glanced;
    target.missed += source.missed;
    target.invulned += source.invulned;
    target.interrupted += source.interrupted;
    target.totalMitigation += source.totalMitigation;
    target.minMitigation = target.minMitigation === 0
        ? source.minMitigation
        : (source.minMitigation === 0 ? target.minMitigation : Math.min(target.minMitigation, source.minMitigation));
};

/**
 * Merge one fight's player aggregation state into a running accumulator.
 *
 * Every field here accumulates during ingest and never averages, so merging is
 * addition — with the exceptions the rule table names explicitly.
 */
export function mergePlayerAggregationAccumulators(
    target: PlayerAggregationAccumulators,
    source: PlayerAggregationAccumulators,
): void {
    mergeMapInto(target.playerStats, source.playerStats, mergePlayerStatsInto, cloneDeep);

    deepSumInto(target.skillDamageMap, source.skillDamageMap);
    deepSumInto(target.incomingSkillDamageMap, source.incomingSkillDamageMap);
    deepSumInto(target.outgoingCondiTotals, source.outgoingCondiTotals);
    deepSumInto(target.incomingCondiTotals, source.incomingCondiTotals);
    deepSumInto(target.enemyProfessionCounts, source.enemyProfessionCounts);

    mergeMapInto(target.playerSkillBreakdownMap, source.playerSkillBreakdownMap, (existing, incoming) => {
        existing.totalFightMs += incoming.totalFightMs;
        incoming.professionList.forEach((p) => {
            if (!existing.professionList.includes(p)) existing.professionList.push(p);
        });
        mergeMapInto(existing.skills, incoming.skills, (a, b) => deepSumInto(a, b), cloneDeep);
    }, cloneDeep);

    mergeMapInto(target.healingBreakdownMap, source.healingBreakdownMap, (existing, incoming) => {
        existing.hasHealAddon = existing.hasHealAddon || incoming.hasHealAddon;
        incoming.professionList.forEach((p) => {
            if (!existing.professionList.includes(p)) existing.professionList.push(p);
        });
        mergeMapInto(existing.healingSkills, incoming.healingSkills, (a, b) => deepSumInto(a, b), cloneDeep);
        mergeMapInto(existing.barrierSkills, incoming.barrierSkills, (a, b) => deepSumInto(a, b), cloneDeep);
    }, cloneDeep);

    // First-wins metadata: name, icon and stacking never change across logs.
    source.specialBuffMeta.forEach((meta, key) => {
        if (!target.specialBuffMeta.has(key)) target.specialBuffMeta.set(key, meta);
    });

    const mergeBuffAgg = (
        targetAgg: Map<string, Map<string, any>>,
        sourceAgg: Map<string, Map<string, any>>,
    ) => {
        sourceAgg.forEach((sourceInner, buffId) => {
            let inner = targetAgg.get(buffId);
            if (!inner) { inner = new Map(); targetAgg.set(buffId, inner); }
            mergeMapInto(inner, sourceInner, (existing, incoming) => {
                existing.totalMs += incoming.totalMs;
                existing.uptimeMs += incoming.uptimeMs;
                existing.durationMs += incoming.durationMs;
                incoming.professions.forEach((p: string) => existing.professions.add(p));
                Object.entries(incoming.professionTimeMs).forEach(([p, ms]) => {
                    existing.professionTimeMs[p] = Number(existing.professionTimeMs[p] || 0) + Number(ms || 0);
                });
                if (!existing.profession || existing.profession === 'Unknown') existing.profession = incoming.profession;
            }, cloneDeep);
        });
    };
    mergeBuffAgg(target.specialBuffAgg, source.specialBuffAgg);
    mergeBuffAgg(target.specialBuffOutputAgg, source.specialBuffOutputAgg);

    const mergeMitigationRows = (targetRows: Map<string, any>, sourceRows: Map<string, any>) => {
        mergeMapInto(targetRows, sourceRows, (existing, incoming) => {
            existing.activeMs += incoming.activeMs;
            incoming.professionList.forEach((p: string) => {
                if (!existing.professionList.includes(p)) existing.professionList.push(p);
            });
            if (!existing.profession || existing.profession === 'Unknown') existing.profession = incoming.profession;
            mergeMitigationTotalsInto(existing.mitigationTotals, incoming.mitigationTotals);
        }, cloneDeep);
    };
    mergeMitigationRows(target.damageMitigationPlayersMap, source.damageMitigationPlayersMap);
    mergeMitigationRows(target.damageMitigationMinionsMap, source.damageMitigationMinionsMap);

    mergeMapInto(target.mitigationCumulativeCounts, source.mitigationCumulativeCounts,
        mergeMitigationTotalsInto, cloneDeep);
    mergeMapInto(target.mitigationMinionCumulativeCounts, source.mitigationMinionCumulativeCounts,
        mergeMitigationTotalsInto, cloneDeep);

    source.globalEnemySkillStats.forEach((incoming, skillId) => {
        const existing = target.globalEnemySkillStats.get(skillId);
        if (!existing) { target.globalEnemySkillStats.set(skillId, { ...incoming }); return; }
        existing.totalDamage += incoming.totalDamage;
        existing.connectedHits += incoming.connectedHits;
        existing.minTotal += incoming.minTotal;
        existing.minCount += incoming.minCount;
    });

    target.wins += source.wins;
    target.losses += source.losses;
    target.totalSquadSizeAccum += source.totalSquadSizeAccum;
    target.totalEnemiesAccum += source.totalEnemiesAccum;
    target.totalSquadDeaths += source.totalSquadDeaths;
    target.totalSquadKills += source.totalSquadKills;
    target.totalEnemyDeaths += source.totalEnemyDeaths;
    target.totalEnemyKills += source.totalEnemyKills;
    target.totalSquadDowns += source.totalSquadDowns;
    target.totalEnemyDowns += source.totalEnemyDowns;
}
```

- [ ] **Step 4: Re-export from the package's public surface**

Add to the end of `packages/bridge-metrics/src/computePlayerAggregation.ts`:

```ts
export {
    mergePlayerAggregationAccumulators,
    PLAYER_STATS_MERGE_RULES,
    deepSumInto,
    type MergeRule,
} from './mergePlayerAggregation';
```

`src/renderer/stats/computePlayerAggregation.ts` already does `export * from '@axiapps/bridge-metrics/computePlayerAggregation'`, so no other wiring is needed.

- [ ] **Step 5: Rebuild the workspace package**

```bash
npm run build --workspace @axiapps/bridge-metrics
```
Expected: `tsup` completes with no errors. **Do not skip this** — the renderer imports `dist/`, and skipping it produces a "not exported" failure that looks exactly like forgetting Step 4.

- [ ] **Step 6: Run the test**

```bash
npx vitest run src/renderer/stats/slice/__tests__/mergePlayerAggregation.test.ts
```
Expected on the first run: the coverage test passes, and one or more equivalence tests may fail. For each failure, read the diff, identify the field, correct its entry in `PLAYER_STATS_MERGE_RULES` (or the corresponding hand-written branch), rebuild the workspace package, and re-run. Iterate until all six pass.

- [ ] **Step 7: Run the existing bridge-metrics tests to confirm nothing regressed**

```bash
npm run test --workspace @axiapps/bridge-metrics
```
Expected: PASS. The merge is purely additive — no existing function changed.

- [ ] **Step 8: Validate and commit**

```bash
npm run validate
git add packages/bridge-metrics/src/mergePlayerAggregation.ts packages/bridge-metrics/src/computePlayerAggregation.ts src/renderer/stats/slice/__tests__/mergePlayerAggregation.test.ts
git commit -m "feat(slice): add player aggregation accumulator merge with a field-rule table"
```

---

### Task 11: Commander stats frames

`IncrementalAggregator` holds commander stats as a bare `Map<string, any>` (`incrementalAggregation.ts:542`) filled by `ingestLogCommanderStats(log, idx, commanders)` (`computeCommanderStats.ts:457`). Like every other module here it only ever adds, so merging is addition — but the entry shape lives in `computeCommanderStats.ts` and you must read it before writing the merge.

**Do this first:** open `src/renderer/stats/computeCommanderStats.ts`, find the `CommanderEntry` type and read every field `ingestLogCommanderStats` writes. Classify each field by the same rules Task 10 used: per-fight arrays concatenate, counters and totals sum, identity strings are first-wins, `professionList`-style arrays union, peaks take a max. `computeCommanderStats`'s finalize sorts fight rows by timestamp internally, so do not attempt to renumber labels during the merge.

**Files:**
- Modify: `src/renderer/stats/computeCommanderStats.ts`
- Test: `src/renderer/stats/slice/__tests__/mergeCommanderStats.test.ts`

**Interfaces:**
- Consumes: `CommanderEntry` from `./computeCommanderStats`.
- Produces: `mergeCommanderStatsInto(target: Map<string, CommanderEntry>, source: Map<string, CommanderEntry>): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/mergeCommanderStats.test.ts
import { describe, it, expect } from 'vitest';
import {
    ingestLogCommanderStats,
    finalizeCommanderStats,
    mergeCommanderStatsInto,
    type CommanderEntry,
} from '../../computeCommanderStats';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const direct = (logs: any[]) => {
    const acc = new Map<string, CommanderEntry>();
    logs.forEach((log, i) => ingestLogCommanderStats(log, i, acc));
    return finalizeCommanderStats(acc);
};

const framed = (logs: any[], viaJson = false) => {
    const target = new Map<string, CommanderEntry>();
    logs.forEach((log, i) => {
        const solo = new Map<string, CommanderEntry>();
        ingestLogCommanderStats(log, i, solo);
        const source = viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(solo)))) : solo;
        mergeCommanderStatsInto(target, source);
    });
    return finalizeCommanderStats(target);
};

describe('commander stats merge equivalence', () => {
    it('reproduces the all-fights result from per-fight maps', () => {
        expect(framed(LOGS)).toEqual(direct(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framed(subset)).toEqual(direct(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framed([LOGS[1]])).toEqual(direct([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framed(LOGS, true)).toEqual(direct(LOGS));
    });
});
```

If `finalizeCommanderStats` is not the exported finalize name in this module, use whatever `incrementalAggregation.ts` calls with `this.commanderStatsAcc` in its `finalize()` — grep for `commanderStatsAcc` to find it — and adjust the two call sites above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeCommanderStats.test.ts`
Expected: FAIL — `"mergeCommanderStatsInto" is not exported by ".../computeCommanderStats.ts"`.

- [ ] **Step 3: Write the merge**

Add to `src/renderer/stats/computeCommanderStats.ts`, using the field classification you made above:

```ts
/**
 * Merge one fight's commander state into a running map.
 *
 * `ingestLogCommanderStats` only ever adds, so merging is addition: fight-row
 * arrays concatenate, counters and durations sum, identity strings are
 * first-wins. `finalizeCommanderStats` sorts fight rows by timestamp itself, so
 * nothing here renumbers labels.
 */
export function mergeCommanderStatsInto(
    target: Map<string, CommanderEntry>,
    source: Map<string, CommanderEntry>,
): void {
    source.forEach((incoming, account) => {
        const existing = target.get(account);
        if (!existing) {
            target.set(account, structuredClone(incoming));
            return;
        }
        // One line per CommanderEntry field, applying the rule you classified:
        //   arrays of fight rows  -> existing.<field>.push(...incoming.<field>)
        //   counters / durations  -> existing.<field> += incoming.<field>
        //   identity strings      -> if (!existing.<field>) existing.<field> = incoming.<field>
        //   professionList        -> union, preserving existing order
        //   peaks                 -> Math.max(existing.<field>, incoming.<field>)
    });
}
```

Replace the comment block with the actual per-field lines. Every field the type declares must appear — a field you skip is a field that silently reads zero in every sliced report.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/slice/__tests__/mergeCommanderStats.test.ts`
Expected: PASS (4 tests). A failing deep-equal names the field you misclassified; fix that field's rule and re-run.

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/computeCommanderStats.ts src/renderer/stats/slice/__tests__/mergeCommanderStats.test.ts
git commit -m "feat(slice): add commander stats merge"
```

---

### Task 12: `exportFrame` and `mergeFrame` on the aggregator

The last piece of state is what `IncrementalAggregator` owns directly: ten per-log arrays, four scalar collections, the stab-performance accumulator (which is just `{ fights: [] }`, so it concatenates), and `boonTableLogs`.

**`boonTableLogs` is not the landmine the spec feared.** `incrementalAggregation.ts:791` already stores a narrow projection — `durationMS`, `buffMap`, a trimmed `native` and a trimmed `players` — precisely because keeping full details OOMs at ~89 logs. That projection is per-log and concatenates, which gives **exact** equivalence with no duration re-weighting and no risk. Carry it verbatim. The spec's weighted-merge fallback exists only if the size-regression test in Task 15 shows this projection blowing the 200 KB/fight budget; if that happens, stop and re-open the spec's §3 rather than improvising.

**`originalIndex` must be renumbered on merge.** Every per-log array entry carries `originalIndex`, and `finalize()` sorts by `sortByFightOrder` which uses it as the tie-break. Frames are built by solo aggregators, so every frame's `originalIndex` is `0`. `mergeFrame` therefore rewrites it to the running merge count — without this, fights with identical timestamps scramble.

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts`
- Modify: `src/renderer/stats/computeStabPerformance.ts`
- Test: `src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts`

**Interfaces:**
- Consumes: every `extract*Frame` / `merge*Frame` from Tasks 3–9, `mergePlayerAggregationAccumulators` (Task 10), `mergeCommanderStatsInto` (Task 11), `encodeState` / `decodeState` (Task 1), `SliceFrame` (Task 1).
- Produces:
  - `extractStabPerformanceFrame(acc: StabPerfAccumulator): { fights: StabPerfFightData[] }` and `mergeStabPerformanceFrame(target: StabPerfAccumulator, frame: { fights: StabPerfFightData[] }): void` in `computeStabPerformance.ts`.
  - `IncrementalAggregator.exportFrame(): SliceFrame`
  - `IncrementalAggregator.mergeFrame(frame: SliceFrame): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts
import { describe, it, expect } from 'vitest';
import { IncrementalAggregator, computeStatsSync } from '../../incrementalAggregation';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';
import fixture4 from '../../../../../test-fixtures/native/20260117-180458.json';

const LOGS = [fixture1, fixture2, fixture3, fixture4].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

/** Frames as they actually travel: through JSON, exactly like the sidecar. */
const framesFor = (logs: any[]) => logs.map((log) => {
    const solo = new IncrementalAggregator();
    solo.ingestLog(log);
    return JSON.parse(JSON.stringify(solo.exportFrame()));
});

const framedStats = (logs: any[]) => {
    const merged = new IncrementalAggregator();
    framesFor(logs).forEach((frame) => merged.mergeFrame(frame));
    return merged.finalize().stats;
};

/** replayFights is excluded from frames by design — drop it from both sides. */
const comparable = (stats: any) => {
    const { replayFights, ...rest } = stats || {};
    return rest;
};

describe('aggregator frame export/merge', () => {
    it('reproduces the all-fights aggregation from per-fight frames', () => {
        const direct = computeStatsSync({ logs: LOGS }).stats;
        expect(comparable(framedStats(LOGS))).toEqual(comparable(direct));
    });

    it('reproduces a three-of-four slice', () => {
        const subset = [LOGS[0], LOGS[1], LOGS[3]];
        const direct = computeStatsSync({ logs: subset }).stats;
        expect(comparable(framedStats(subset))).toEqual(comparable(direct));
    });

    it('reproduces a single-fight slice', () => {
        const direct = computeStatsSync({ logs: [LOGS[2]] }).stats;
        expect(comparable(framedStats([LOGS[2]]))).toEqual(comparable(direct));
    });

    it('recomputes derived sections that frames never carried', () => {
        // The whole point of shipping pre-finalize state: leaderboards and MVPs
        // are absent from every frame and reappear after finalize.
        const frame = framesFor([LOGS[0]])[0];
        expect(frame).not.toHaveProperty('leaderboards');
        expect(frame).not.toHaveProperty('mvpSummary');
        const stats = framedStats(LOGS);
        expect(stats.leaderboards).toBeTruthy();
    });

    it('carries no replay payload in a frame', () => {
        // replayFights is ~66% of report.json; a frame that carried it would
        // blow the sidecar budget on its own.
        expect(JSON.stringify(framesFor([LOGS[0]])[0])).not.toContain('replayFights');
    });

    it('refuses to export a frame from an aggregator that ingested more than one log', () => {
        const acc = new IncrementalAggregator();
        LOGS.forEach((log) => acc.ingestLog(log));
        expect(() => acc.exportFrame()).toThrow(/exactly one log/i);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts`
Expected: FAIL — `acc.exportFrame is not a function`.

- [ ] **Step 3: Add the stab performance frame**

Append to `src/renderer/stats/computeStabPerformance.ts`:

```ts
export interface StabPerformanceFrame {
    fights: StabPerfFightData[];
}

export function extractStabPerformanceFrame(acc: StabPerfAccumulator): StabPerformanceFrame {
    if (acc.fights.length > 1) {
        throw new Error(`extractStabPerformanceFrame expects at most one fight, got ${acc.fights.length}`);
    }
    return { fights: acc.fights };
}

/** The accumulator is a bare per-fight array, so merging is concatenation. */
export function mergeStabPerformanceFrame(target: StabPerfAccumulator, frame: StabPerformanceFrame): void {
    frame.fights.forEach((fight) => target.fights.push(fight));
}
```

- [ ] **Step 4: Add `exportFrame` to `IncrementalAggregator`**

Add these imports at the top of `src/renderer/stats/incrementalAggregation.ts`:

```ts
import { encodeState, decodeState } from './slice/stateCodec';
import type { SliceFrame } from './slice/sliceTypes';
import { extractSpikeDamageFrame, mergeSpikeDamageFrame } from './computeSpikeDamageData';
import { extractAllDamageFrame, mergeAllDamageFrame } from './computeAllDamageData';
import { extractStripSpikesFrame, mergeStripSpikesFrame } from './computeStripSpikesData';
import { extractIncomingStrikeFrame, mergeIncomingStrikeFrame } from './computeIncomingStrikeDamageData';
import { extractSkillUsageFrame, mergeSkillUsageFrame } from './computeSkillUsageData';
import { extractBoonTimelineFrame, mergeBoonTimelineFrame } from './computeBoonTimeline';
import { extractBoonUptimeFrame, mergeBoonUptimeFrame } from './computeBoonUptimeTimeline';
import { extractStabPerformanceFrame, mergeStabPerformanceFrame } from './computeStabPerformance';
import { mergeCommanderStatsInto } from './computeCommanderStats';
import { mergePlayerAggregationAccumulators } from './computePlayerAggregation';
```

Then add these two methods to the class, immediately after `ingestLog`:

```ts
    /**
     * Snapshot this aggregator's pre-finalize state as a slice frame.
     *
     * Only valid on an aggregator that ingested exactly one log — a frame IS a
     * single fight's contribution. Replay payloads are deliberately excluded:
     * they are two thirds of report.json and slice mode never needs them.
     */
    exportFrame(): SliceFrame {
        if (this.logCount !== 1) {
            throw new Error(`exportFrame expects exactly one log, got ${this.logCount}`);
        }
        return encodeState({
            logCount: this.logCount,
            validLogCount: this.validLogCount,
            logMetas: this.logMetas,
            timelineEntries: this.timelineEntries,
            fightBreakdowns: this.fightBreakdowns,
            fightDiffModes: this.fightDiffModes,
            healEffectivenessResults: this.healEffectivenessResults,
            tagDistanceDeathsResults: this.tagDistanceDeathsResults,
            distanceToTagContribs: this.distanceToTagContribs,
            onTagReviewContribs: this.onTagReviewContribs,
            incomingDamageEntries: this.incomingDamageEntries,
            squadCompEntries: this.squadCompEntries,
            boonTableLogs: this.boonTableLogs,
            mergedDamageModMap: this.mergedDamageModMap,
            personalDamageModKeys: this.personalDamageModKeys,
            mapCounts: this.mapCounts,
            enemyNameCounts: this.enemyNameCounts,
            playerAcc: this.playerAcc,
            commanderStatsAcc: this.commanderStatsAcc,
            spike: extractSpikeDamageFrame(this.spikeAcc),
            allDamage: extractAllDamageFrame(this.allDamageAcc),
            stripSpikes: extractStripSpikesFrame(this.stripSpikesAcc),
            incomingStrike: extractIncomingStrikeFrame(this.incomingStrikeAcc),
            skillUsage: extractSkillUsageFrame(this.skillUsageAcc),
            boonTimeline: extractBoonTimelineFrame(this.boonTimelineAcc),
            boonUptime: extractBoonUptimeFrame(this.boonUptimeAcc),
            stabPerformance: extractStabPerformanceFrame(this.stabPerfAcc),
        }) as SliceFrame;
    }
```

Note the invalid-log case: a log with no detailed roster leaves the module accumulators empty, and `extractSpikeDamageFrame` and friends throw on zero fights. Guard by exporting the module sections only when `this.validLogCount === 1`; when it is `0`, omit those keys and let `mergeFrame` skip whatever is absent. Write it as `...(this.validLogCount === 1 ? { spike: ..., allDamage: ..., /* … */ } : {})`.

- [ ] **Step 5: Add `mergeFrame` to `IncrementalAggregator`**

```ts
    /**
     * Merge one slice frame into this aggregator. Call once per selected fight,
     * then `finalize()`.
     *
     * `originalIndex` is rewritten to the running merge count: every frame was
     * built by a solo aggregator and so carries `0`, and `finalize()` uses it as
     * the tie-break in `sortByFightOrder`. Without the rewrite, fights sharing a
     * timestamp scramble.
     */
    mergeFrame(rawFrame: SliceFrame): void {
        const frame: any = decodeState(rawFrame);
        const index = this.logCount;
        this.logCount += 1;
        this.validLogCount += Number(frame.validLogCount || 0);

        const appendIndexed = (target: any[], entries: any[] | undefined) => {
            (entries || []).forEach((entry) => {
                target.push(entry && typeof entry === 'object' && 'originalIndex' in entry
                    ? { ...entry, originalIndex: index }
                    : entry);
            });
        };

        appendIndexed(this.logMetas, frame.logMetas);
        appendIndexed(this.timelineEntries, frame.timelineEntries);
        appendIndexed(this.fightBreakdowns, frame.fightBreakdowns);
        appendIndexed(this.fightDiffModes, frame.fightDiffModes);
        appendIndexed(this.healEffectivenessResults, frame.healEffectivenessResults);
        appendIndexed(this.tagDistanceDeathsResults, frame.tagDistanceDeathsResults);
        appendIndexed(this.distanceToTagContribs, frame.distanceToTagContribs);
        appendIndexed(this.onTagReviewContribs, frame.onTagReviewContribs);
        appendIndexed(this.incomingDamageEntries, frame.incomingDamageEntries);
        appendIndexed(this.squadCompEntries, frame.squadCompEntries);
        (frame.boonTableLogs || []).forEach((entry: any) => this.boonTableLogs.push(entry));

        Object.entries(frame.mergedDamageModMap || {}).forEach(([key, value]) => {
            if (!this.mergedDamageModMap[key]) this.mergedDamageModMap[key] = value as any;
        });
        (frame.personalDamageModKeys instanceof Set ? frame.personalDamageModKeys : new Set())
            .forEach((key: string) => this.personalDamageModKeys.add(key));
        Object.entries(frame.mapCounts || {}).forEach(([name, count]) => {
            this.mapCounts[name] = (this.mapCounts[name] || 0) + Number(count || 0);
        });
        Object.entries(frame.enemyNameCounts || {}).forEach(([name, count]) => {
            this.enemyNameCounts[name] = (this.enemyNameCounts[name] || 0) + Number(count || 0);
        });

        if (frame.playerAcc) mergePlayerAggregationAccumulators(this.playerAcc, frame.playerAcc);
        if (frame.commanderStatsAcc) mergeCommanderStatsInto(this.commanderStatsAcc, frame.commanderStatsAcc);

        if (frame.spike) mergeSpikeDamageFrame(this.spikeAcc, frame.spike);
        if (frame.allDamage) mergeAllDamageFrame(this.allDamageAcc, frame.allDamage);
        if (frame.stripSpikes) mergeStripSpikesFrame(this.stripSpikesAcc, frame.stripSpikes);
        if (frame.incomingStrike) mergeIncomingStrikeFrame(this.incomingStrikeAcc, frame.incomingStrike);
        if (frame.skillUsage) mergeSkillUsageFrame(this.skillUsageAcc, frame.skillUsage);
        if (frame.boonTimeline) mergeBoonTimelineFrame(this.boonTimelineAcc, frame.boonTimeline);
        if (frame.boonUptime) mergeBoonUptimeFrame(this.boonUptimeAcc, frame.boonUptime);
        if (frame.stabPerformance) mergeStabPerformanceFrame(this.stabPerfAcc, frame.stabPerformance);
    }
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts`
Expected: PASS (6 tests). Deep-equal failures name the section that diverged — go back to that section's task, fix the merge there, and re-run both its test and this one.

- [ ] **Step 7: Run the full aggregation suite to confirm no regression**

Run: `npx vitest run src/renderer/stats/__tests__/incrementalAggregation.test.ts`
Expected: PASS.

- [ ] **Step 8: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/incrementalAggregation.ts src/renderer/stats/computeStabPerformance.ts src/renderer/stats/slice/__tests__/aggregatorFrames.test.ts
git commit -m "feat(slice): add exportFrame/mergeFrame to IncrementalAggregator"
```

---

### Task 13: Sidecar assembly and the browser recompute entry point

Two functions bracket the whole feature: one builds the sidecar at publish time, one turns a selection back into stats in the browser. Fight order is the frozen publish order, which is what makes ordinal addressing stable — so `frames[i]` must correspond to `fights[i]`, and `fights` is the Phase A roster (`useStatsStore.fightRoster`, already sorted oldest-first by `mergeFightRoster`).

**Files:**
- Create: `src/renderer/stats/slice/buildSliceSidecar.ts`
- Create: `src/renderer/stats/slice/mergeSliceFrames.ts`
- Test: `src/renderer/stats/slice/__tests__/sliceSidecar.test.ts`

**Interfaces:**
- Consumes: `IncrementalAggregator` (`exportFrame`, `mergeFrame`, `finalize`), `SliceSidecar` / `SLICE_SIDECAR_VERSION` (Task 1), `hashAggregationSettings` from `../statsStore`, `statsLogKey` from `../utils/statsLogKey`, `FightRosterEntry` from `../statsStore`.
- Produces:
  - `buildSliceSidecar(args: { logs: any[]; roster: FightRosterEntry[]; mvpWeights: any; statsViewSettings: any; disruptionMethod: any }): SliceSidecar`
  - `mergeSliceFrames(args: { sidecar: SliceSidecar; includedOrdinals: number[]; mvpWeights: any; statsViewSettings: any; disruptionMethod: any }): { stats: any; skillUsageData: any }`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/sliceSidecar.test.ts
import { describe, it, expect } from 'vitest';
import { computeStatsSync } from '../../incrementalAggregation';
import { buildSliceSidecar } from '../buildSliceSidecar';
import { mergeSliceFrames } from '../mergeSliceFrames';
import { statsLogKey } from '../../utils/statsLogKey';
import { SLICE_SIDECAR_VERSION } from '../sliceTypes';
import f1 from '../../../../../test-fixtures/native/20260117-175120.json';
import f2 from '../../../../../test-fixtures/native/20260117-180135.json';
import f3 from '../../../../../test-fixtures/native/20260117-180259.json';
import f4 from '../../../../../test-fixtures/native/20260117-180458.json';
import f5 from '../../../../../test-fixtures/native/20260117-180636.json';
import f6 from '../../../../../test-fixtures/native/20260117-180826.json';
import f7 from '../../../../../test-fixtures/native/20260117-181030.json';

const LOGS = [f1, f2, f3, f4, f5, f6, f7].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const ROSTER = LOGS.map((log, i) => ({
    id: statsLogKey(log, i),
    label: `Fight ${i + 1}`,
    timestamp: i + 1,
    duration: '1:00',
}));

const SETTINGS = { mvpWeights: undefined, statsViewSettings: undefined, disruptionMethod: undefined };

const sidecar = () => buildSliceSidecar({ logs: LOGS, roster: ROSTER, ...SETTINGS });

const comparable = (stats: any) => {
    const { replayFights, ...rest } = stats || {};
    return rest;
};

describe('slice sidecar', () => {
    it('emits one frame per roster fight, in roster order', () => {
        const out = sidecar();
        expect(out.version).toBe(SLICE_SIDECAR_VERSION);
        expect(out.fights).toHaveLength(7);
        expect(out.frames).toHaveLength(7);
        expect(out.fights.map((f) => f.id)).toEqual(ROSTER.map((f) => f.id));
    });

    it('records a settings hash', () => {
        expect(typeof sidecar().settingsHash).toBe('string');
        expect(sidecar().settingsHash.length).toBeGreaterThan(0);
    });

    it('serializes to JSON without losing Map state', () => {
        const revived = JSON.parse(JSON.stringify(sidecar()));
        const direct = computeStatsSync({ logs: LOGS }).stats;
        const merged = mergeSliceFrames({
            sidecar: revived,
            includedOrdinals: [0, 1, 2, 3, 4, 5, 6],
            ...SETTINGS,
        }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('reproduces every three-fight subset exactly', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const subsets = [[0, 1, 2], [0, 3, 6], [4, 5, 6], [1, 3, 5]];
        subsets.forEach((ordinals) => {
            const direct = computeStatsSync({ logs: ordinals.map((i) => LOGS[i]) }).stats;
            const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: ordinals, ...SETTINGS }).stats;
            expect(comparable(merged)).toEqual(comparable(direct));
        });
    });

    it('reproduces a single-fight slice', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const direct = computeStatsSync({ logs: [LOGS[3]] }).stats;
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [3], ...SETTINGS }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('ignores ordinals outside the frame range instead of throwing', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [0, 99], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [LOGS[0]] }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/sliceSidecar.test.ts`
Expected: FAIL — `Failed to resolve import "../buildSliceSidecar"`.

- [ ] **Step 3: Write the sidecar builder**

```ts
// src/renderer/stats/slice/buildSliceSidecar.ts
import { IncrementalAggregator } from '../incrementalAggregation';
import { hashAggregationSettings, type FightRosterEntry } from '../statsStore';
import { statsLogKey } from '../utils/statsLogKey';
import { SLICE_SIDECAR_VERSION, type SliceSidecar, type SliceFrame } from './sliceTypes';

/**
 * Build the published report's slice sidecar: one pre-finalize frame per fight.
 *
 * Frames are ordered to match `roster`, not `logs` — the roster is the frozen
 * publish order the viewer's ordinals address, and `mergeFightRoster` sorts it
 * oldest-first while `logs` arrives in whatever order the session produced.
 *
 * Cost is one fresh single-log aggregation per fight (~23ms each), which is
 * noise next to the upload it precedes.
 */
export function buildSliceSidecar({ logs, roster, mvpWeights, statsViewSettings, disruptionMethod }: {
    logs: any[];
    roster: FightRosterEntry[];
    mvpWeights: any;
    statsViewSettings: any;
    disruptionMethod: any;
}): SliceSidecar {
    const logsByKey = new Map<string, any>();
    logs.forEach((log, index) => logsByKey.set(statsLogKey(log, index), log));

    const fights: FightRosterEntry[] = [];
    const frames: SliceFrame[] = [];
    roster.forEach((entry) => {
        const log = logsByKey.get(entry.id);
        if (!log) return;
        const solo = new IncrementalAggregator({ mvpWeights, statsViewSettings, disruptionMethod });
        solo.ingestLog(log);
        fights.push(entry);
        frames.push(solo.exportFrame());
    });

    return {
        version: SLICE_SIDECAR_VERSION,
        settingsHash: hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod),
        fights,
        frames,
    };
}
```

- [ ] **Step 4: Write the recompute entry point**

```ts
// src/renderer/stats/slice/mergeSliceFrames.ts
import { IncrementalAggregator } from '../incrementalAggregation';
import type { SliceSidecar } from './sliceTypes';

/**
 * Recompute stats for a subset of a published report's fights.
 *
 * The browser's whole slice path: merge the selected frames into a fresh
 * aggregator and run the real `finalize()`. Everything derived — leaderboards,
 * top stats, MVPs — is rebuilt here, which is why frames never carry it.
 *
 * Out-of-range ordinals are ignored rather than throwing: a stale link is a
 * routine event and the viewer already renders a notice for it.
 */
export function mergeSliceFrames({ sidecar, includedOrdinals, mvpWeights, statsViewSettings, disruptionMethod }: {
    sidecar: SliceSidecar;
    includedOrdinals: number[];
    mvpWeights: any;
    statsViewSettings: any;
    disruptionMethod: any;
}): { stats: any; skillUsageData: any } {
    const aggregator = new IncrementalAggregator({ mvpWeights, statsViewSettings, disruptionMethod });
    [...includedOrdinals]
        .sort((a, b) => a - b)
        .forEach((ordinal) => {
            const frame = sidecar.frames[ordinal];
            if (frame) aggregator.mergeFrame(frame);
        });
    return aggregator.finalize();
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/renderer/stats/slice/__tests__/sliceSidecar.test.ts`
Expected: PASS (6 tests). This is the spec's end-to-end invariant over the full seven-fight night — if it passes, slice mode is correct.

- [ ] **Step 6: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/slice/buildSliceSidecar.ts src/renderer/stats/slice/mergeSliceFrames.ts src/renderer/stats/slice/__tests__/sliceSidecar.test.ts
git commit -m "feat(slice): add sidecar builder and browser recompute entry point"
```

---

### Task 14: `planSidecarHosting`

`planReplayHosting` (`src/main/handlers/githubHandlers.ts:669`) already routes an artifact to R2, Pages, or nowhere. Generalise it to take a `kind`, keeping the `{ mode, url, warning }` contract, and give slice sidecars a **different policy**: no Pages fallback. For a replay, Pages is a sensible second choice. For slice frames it would silently spend 1.56x of the repo's storage budget — the exact cost this whole design exists to avoid.

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts:663-691`
- Test: `src/main/handlers/__tests__/r2ReplayHosting.test.ts`

**Interfaces:**
- Consumes: `MAX_GITHUB_BLOB_BYTES`, `formatBytes` (both already in `githubHandlers.ts`).
- Produces: `planSidecarHosting(args: { kind: 'replay' | 'slice'; bytes: number; r2Url: string | null; reportId: string; baseUrl: string | null }): { mode: 'r2' | 'pages' | 'dropped'; url: string | null; warning: string | null }`. `planReplayHosting` is removed; its two call sites move to `planSidecarHosting({ kind: 'replay', bytes: replayBuffer.length, ... })`.

- [ ] **Step 1: Write the failing tests**

Append to `src/main/handlers/__tests__/r2ReplayHosting.test.ts` (and change the import at the top from `planReplayHosting` to `planSidecarHosting`):

```ts
describe('planSidecarHosting', () => {
    const BASE = 'https://user.github.io/repo';

    it('prefers R2 for a replay', () => {
        expect(planSidecarHosting({
            kind: 'replay', bytes: 1024, r2Url: 'https://pub-x.r2.dev/reports/a/replay.json',
            reportId: 'a', baseUrl: BASE,
        })).toEqual({ mode: 'r2', url: 'https://pub-x.r2.dev/reports/a/replay.json', warning: null });
    });

    it('falls back to Pages for a replay with no R2', () => {
        const plan = planSidecarHosting({ kind: 'replay', bytes: 1024, r2Url: null, reportId: 'a', baseUrl: BASE });
        expect(plan.mode).toBe('pages');
        expect(plan.url).toBe(`${BASE}/reports/a/replay.json`);
    });

    it('drops an oversized Pages replay rather than failing the upload with a 422', () => {
        const plan = planSidecarHosting({
            kind: 'replay', bytes: MAX_GITHUB_BLOB_BYTES + 1, r2Url: null, reportId: 'a', baseUrl: BASE,
        });
        expect(plan.mode).toBe('dropped');
        expect(plan.url).toBeNull();
        expect(plan.warning).toMatch(/Cloudflare R2/);
    });

    it('prefers R2 for a slice sidecar', () => {
        expect(planSidecarHosting({
            kind: 'slice', bytes: 1024, r2Url: 'https://pub-x.r2.dev/reports/a/slice.json.gz',
            reportId: 'a', baseUrl: BASE,
        })).toEqual({ mode: 'r2', url: 'https://pub-x.r2.dev/reports/a/slice.json.gz', warning: null });
    });

    it('never falls back to Pages for a slice sidecar', () => {
        // The whole point: a Pages-hosted sidecar would spend the repo storage
        // budget this design exists to protect. No R2 means no web slicer.
        const plan = planSidecarHosting({ kind: 'slice', bytes: 1024, r2Url: null, reportId: 'a', baseUrl: BASE });
        expect(plan.mode).toBe('dropped');
        expect(plan.url).toBeNull();
        expect(plan.warning).toMatch(/Cloudflare R2/);
    });

    it('drops a slice sidecar with no R2 regardless of how small it is', () => {
        const plan = planSidecarHosting({ kind: 'slice', bytes: 1, r2Url: null, reportId: 'a', baseUrl: null });
        expect(plan.mode).toBe('dropped');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/handlers/__tests__/r2ReplayHosting.test.ts`
Expected: FAIL — `"planSidecarHosting" is not exported by "../githubHandlers"`.

- [ ] **Step 3: Replace `planReplayHosting`**

Replace the whole `planReplayHosting` block at `src/main/handlers/githubHandlers.ts:663-691` with:

```ts
/**
 * Decide where a report's out-of-band artifact lives.
 *
 * Replays prefer R2 and fall back to GitHub Pages, since one artifact on Pages
 * is affordable and losing the replay outright costs a feature. A Pages-hosted
 * replay travels through the GitHub blob API, which 422s past
 * MAX_GITHUB_BLOB_BYTES, so an oversized one is dropped rather than allowed to
 * fail the whole upload.
 *
 * Slice sidecars are R2-only, deliberately. A Pages fallback would spend ~1.56x
 * of the repo's storage budget per report — precisely the cost the web slicer
 * was designed to avoid. With no R2 the report publishes exactly as it does
 * today and simply has no slicer.
 */
export const planSidecarHosting = ({ kind, bytes, r2Url, reportId, baseUrl }: {
    kind: 'replay' | 'slice';
    bytes: number;
    r2Url: string | null;
    reportId: string;
    baseUrl: string | null;
}): { mode: 'r2' | 'pages' | 'dropped'; url: string | null; warning: string | null } => {
    if (r2Url) {
        return { mode: 'r2', url: r2Url, warning: null };
    }
    if (kind === 'slice') {
        return {
            mode: 'dropped',
            url: null,
            warning:
                'Fight slicing in the published report needs Cloudflare R2 — configure it in Settings. ' +
                'The report itself publishes normally either way.'
        };
    }
    if (bytes > MAX_GITHUB_BLOB_BYTES) {
        return {
            mode: 'dropped',
            url: null,
            warning:
                `Replay data (${formatBytes(bytes)}) is too large to host on GitHub Pages ` +
                `(limit ${formatBytes(MAX_GITHUB_BLOB_BYTES)}) — publishing the report without the map replay. ` +
                `Configure Cloudflare R2 in Settings to keep replays on large sessions.`
        };
    }
    const relativePath = `reports/${reportId}/replay.json`;
    return {
        mode: 'pages',
        url: baseUrl ? `${baseUrl.replace(/\/$/, '')}/${relativePath}` : relativePath,
        warning: null
    };
};
```

- [ ] **Step 4: Update the replay call site**

At `src/main/handlers/githubHandlers.ts:1843`, change:

```ts
                const replayPlan = planSidecarHosting({
                    kind: 'replay',
                    bytes: replayBuffer.length,
                    r2Url,
                    reportId: reportMeta.id,
                    baseUrl
                });
```

Then grep for any remaining `planReplayHosting` reference and update it the same way:

```bash
grep -rn "planReplayHosting" src/
```
Expected after the edit: no matches.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/main/handlers/__tests__/r2ReplayHosting.test.ts`
Expected: PASS — the pre-existing `resolveR2Config` tests plus the six above.

- [ ] **Step 6: Validate and commit**

```bash
npm run validate
git add src/main/handlers/githubHandlers.ts src/main/handlers/__tests__/r2ReplayHosting.test.ts
git commit -m "feat(slice): generalise replay hosting to planSidecarHosting, R2-only for sidecars"
```

---

### Task 15: Publish the sidecar

The sidecar is built in the renderer at publish time (that is where the logs live), travels to main over the existing `upload-web-report` IPC, and is gzipped and pushed to R2 there. The pointer lands in the payload as `stats.sliceDataUrl`, mirroring `stats.replayDataUrl` (`githubHandlers.ts:1857`).

This task also adds the **size-regression test**, which is the guard the spec asks for: a future section that starts carrying raw log details must fail loudly rather than quietly tripling the sidecar.

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts:192-198`
- Modify: `src/renderer/app/hooks/useWebUpload.ts:125`
- Modify: `src/preload/index.ts:122`
- Modify: `src/main/handlers/githubHandlers.ts:1691` and the staging block around `:1860`
- Test: `src/renderer/stats/slice/__tests__/sliceSidecarSize.test.ts`

**Interfaces:**
- Consumes: `buildSliceSidecar` (Task 13), `planSidecarHosting` (Task 14), `r2PutObject` (`githubHandlers.ts:605`), `useStatsStore.fightRoster`.
- Produces: the `uploadWebReport` payload gains an optional `sliceSidecar?: SliceSidecar`; the published payload gains `stats.sliceDataUrl?: string` and `stats.sliceSettingsHash?: string`.

- [ ] **Step 1: Write the failing size-regression test**

```ts
// src/renderer/stats/slice/__tests__/sliceSidecarSize.test.ts
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildSliceSidecar } from '../buildSliceSidecar';
import { statsLogKey } from '../../utils/statsLogKey';
import f1 from '../../../../../test-fixtures/native/20260117-175120.json';
import f2 from '../../../../../test-fixtures/native/20260117-180135.json';
import f3 from '../../../../../test-fixtures/native/20260117-180259.json';
import f4 from '../../../../../test-fixtures/native/20260117-180458.json';
import f5 from '../../../../../test-fixtures/native/20260117-180636.json';
import f6 from '../../../../../test-fixtures/native/20260117-180826.json';
import f7 from '../../../../../test-fixtures/native/20260117-181030.json';

/**
 * The sidecar's whole reason to exist is that it stays small enough to live on
 * a free R2 tier. The spec budgets ~124 KB/fight gzipped and this asserts 200
 * KB/fight — headroom for larger rosters, but far below the ~4 MB a frame would
 * reach if a section started carrying raw log details.
 *
 * If this fails: something now serializes `details` (or a replay track) into a
 * frame. Find it and narrow the projection. Do NOT raise the budget.
 */
const MAX_GZIPPED_BYTES_PER_FIGHT = 200 * 1024;

const LOGS = [f1, f2, f3, f4, f5, f6, f7].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const ROSTER = LOGS.map((log, i) => ({
    id: statsLogKey(log, i),
    label: `Fight ${i + 1}`,
    timestamp: i + 1,
    duration: '1:00',
}));

describe('slice sidecar size', () => {
    it('stays inside the per-fight gzipped budget', () => {
        const sidecar = buildSliceSidecar({
            logs: LOGS, roster: ROSTER,
            mvpWeights: undefined, statsViewSettings: undefined, disruptionMethod: undefined,
        });
        const gzipped = gzipSync(Buffer.from(JSON.stringify(sidecar), 'utf8'), { level: 9 });
        const perFight = gzipped.length / sidecar.frames.length;
        // Logged so a regression report carries the number, not just a boolean.
        console.info(`[slice] ${(gzipped.length / 1024).toFixed(0)} KB gzipped, ${(perFight / 1024).toFixed(0)} KB/fight`);
        expect(perFight).toBeLessThan(MAX_GZIPPED_BYTES_PER_FIGHT);
    });

    it('carries no replay tracks', () => {
        const sidecar = buildSliceSidecar({
            logs: LOGS, roster: ROSTER,
            mvpWeights: undefined, statsViewSettings: undefined, disruptionMethod: undefined,
        });
        const json = JSON.stringify(sidecar);
        expect(json).not.toContain('replayFights');
        expect(json).not.toContain('"tracks"');
    });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/renderer/stats/slice/__tests__/sliceSidecarSize.test.ts`
Expected: PASS. If the budget assertion fails, stop and report the measured KB/fight before continuing — that is the signal the spec's §3 boon-table contingency has become live, and it is a design decision, not an implementation one.

- [ ] **Step 3: Build the sidecar at publish time**

In `src/renderer/stats/hooks/useStatsUploads.ts`, add the import and the store read near the existing `excludedFightKeys` read at line 45:

```ts
import { buildSliceSidecar } from '../slice/buildSliceSidecar';
...
    const fightRoster = useStatsStore((s) => s.fightRoster);
```

Then in `runWebUpload`, immediately before the `await onWebUpload({...})` call at line 192:

```ts
            // The web slicer's payload. Publishing is already blocked while a
            // slice is active, so `logs` here is always the full night.
            const sliceSidecar = buildSliceSidecar({
                logs,
                roster: fightRoster,
                mvpWeights,
                statsViewSettings,
                disruptionMethod,
            });
```

and add `sliceSidecar,` to the object passed to `onWebUpload`.

If `mvpWeights`, `statsViewSettings` or `disruptionMethod` are not already in scope in this hook, take them from the same source `buildReportStats()` uses — grep for `statsViewSettings` inside `useStatsUploads.ts` to find it.

- [ ] **Step 4: Widen the IPC payload types**

In `src/renderer/app/hooks/useWebUpload.ts:125`, add `sliceSidecar?: any;` to the `payload` parameter type. In `src/preload/index.ts:122`, add `sliceSidecar?: any` to the `uploadWebReport` payload type. In `src/main/handlers/githubHandlers.ts:1691`, add `sliceSidecar?: any` to the handler's `payload` type.

`useWebUpload` destructures `const { logIds, ...ipcPayload } = payload;` — `sliceSidecar` rides along in `ipcPayload` with no further change.

- [ ] **Step 5: Upload the sidecar in main**

In `src/main/handlers/githubHandlers.ts`, add `import { gzipSync } from 'node:zlib';` at the top if it is not already imported. Then, immediately after the replay hosting block closes (just before `sendWebUploadStatus('Packaging', 'Preparing report bundle...', 40);` around line 1861), insert:

```ts
            // Slice sidecar — R2 only. With no R2 the report publishes exactly as
            // it always has and the published viewer simply has no slicer.
            const sliceSidecar = (payload as any)?.sliceSidecar;
            if (sliceSidecar && Array.isArray(sliceSidecar.frames) && sliceSidecar.frames.length > 0) {
                const sliceBuffer = gzipSync(Buffer.from(JSON.stringify(sliceSidecar), 'utf8'), { level: 9 });
                let sliceR2Url: string | null = null;
                if (r2Config) {
                    sendWebUploadStatus('Uploading', 'Uploading fight slice data to R2...', 39);
                    const sliceKey = `reports/${reportMeta.id}/slice.json.gz`;
                    // Content-Type only, no Content-Encoding: the viewer inflates
                    // these bytes itself with DecompressionStream('gzip'), so the
                    // browser must NOT transparently inflate them first.
                    const sliceResult = await r2PutObject(sliceKey, sliceBuffer, 'application/gzip', r2Config);
                    if (sliceResult.success && sliceResult.url) {
                        sliceR2Url = sliceResult.url;
                        log.info(`[Main] R2 slice upload succeeded: ${sliceResult.url} (${formatBytes(sliceBuffer.length)})`);
                    } else {
                        log.warn(`[Main] R2 slice upload failed: ${sliceResult.error} — publishing without the web slicer.`);
                    }
                }
                const slicePlan = planSidecarHosting({
                    kind: 'slice',
                    bytes: sliceBuffer.length,
                    r2Url: sliceR2Url,
                    reportId: reportMeta.id,
                    baseUrl
                });
                if (slicePlan.mode === 'r2' && slicePlan.url) {
                    (builtReport.payload.stats as any).sliceDataUrl = slicePlan.url;
                    // The viewer compares this against the sidecar's own hash and
                    // disables slicing on a mismatch rather than rendering numbers
                    // computed under different settings.
                    (builtReport.payload.stats as any).sliceSettingsHash = sliceSidecar.settingsHash;
                } else {
                    delete (builtReport.payload.stats as any).sliceDataUrl;
                    delete (builtReport.payload.stats as any).sliceSettingsHash;
                    if (slicePlan.warning) {
                        log.info(`[Main] ${slicePlan.warning}`);
                        sendWebUploadStatus('Packaging', slicePlan.warning, 39);
                    }
                }
                builtReport.jsonBuffer = Buffer.from(JSON.stringify(builtReport.payload), 'utf8');
            }
```

Note the sidecar is **never** written into `stagingRoot` — unlike `replay.json`, it has no Pages path, so there is nothing to stage.

- [ ] **Step 6: Verify the report is byte-identical without R2**

Run: `npx vitest run src/main/handlers/__tests__/`
Expected: PASS. The no-R2 path deletes `sliceDataUrl` and adds nothing to staging, so a report published without R2 is the same bytes it was before this task.

- [ ] **Step 7: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/hooks/useStatsUploads.ts src/renderer/app/hooks/useWebUpload.ts src/preload/index.ts src/main/handlers/githubHandlers.ts src/renderer/stats/slice/__tests__/sliceSidecarSize.test.ts
git commit -m "feat(slice): build and publish the slice sidecar to R2"
```

---

### Task 16: `mergeFrames` in the stats worker

Merging 25 frames and running `finalize()` is the same order of work as a full aggregation, so it belongs off the main thread. The worker already owns an `IncrementalAggregator`; this adds a message that feeds it frames instead of logs.

**Files:**
- Modify: `src/renderer/workers/statsWorker.ts`
- Test: `src/renderer/stats/slice/__tests__/workerMergeFrames.test.ts`

**Interfaces:**
- Consumes: `SliceSidecar` (Task 1), `IncrementalAggregator.mergeFrame` (Task 12).
- Produces: worker message `{ type: 'mergeFrames', token, frames: SliceFrame[], settings: { mvpWeights, statsViewSettings, disruptionMethod } }`, answered with the existing `{ type: 'result', result, computeId, token, ... }` shape so the main-thread hook needs no new result handling.

- [ ] **Step 1: Write the failing test**

The worker module runs `self.onmessage`, so the test drives the handler directly rather than spawning a real Worker.

```ts
// src/renderer/stats/slice/__tests__/workerMergeFrames.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncrementalAggregator, computeStatsSync } from '../../incrementalAggregation';
import f1 from '../../../../../test-fixtures/native/20260117-175120.json';
import f2 from '../../../../../test-fixtures/native/20260117-180135.json';

const LOGS = [f1, f2].map((details, i) => ({ id: `log-${i}`, filePath: `t-${i}.zevtc`, details }));

const frames = () => LOGS.map((log) => {
    const solo = new IncrementalAggregator();
    solo.ingestLog(log);
    return JSON.parse(JSON.stringify(solo.exportFrame()));
});

const comparable = (stats: any) => {
    const { replayFights, ...rest } = stats || {};
    return rest;
};

describe('statsWorker mergeFrames', () => {
    let posted: any[];

    beforeEach(async () => {
        posted = [];
        vi.stubGlobal('self', {
            postMessage: (msg: any) => posted.push(msg),
            onmessage: null as any,
        });
        vi.stubGlobal('performance', { now: () => 0 });
        vi.resetModules();
        await import('../../../workers/statsWorker');
    });

    const send = (data: any) => (globalThis as any).self.onmessage({ data } as MessageEvent);

    it('posts a result whose stats match a direct aggregation over the same logs', () => {
        send({ type: 'mergeFrames', token: 0, frames: frames(), settings: {} });
        const result = posted.find((m) => m.type === 'result');
        expect(result).toBeTruthy();
        expect(comparable(result.result.stats)).toEqual(comparable(computeStatsSync({ logs: LOGS }).stats));
    });

    it('posts a result for a single-frame slice', () => {
        send({ type: 'mergeFrames', token: 0, frames: [frames()[1]], settings: {} });
        const result = posted.find((m) => m.type === 'result');
        expect(comparable(result.result.stats)).toEqual(comparable(computeStatsSync({ logs: [LOGS[1]] }).stats));
    });

    it('posts a null-stats result for an empty selection rather than throwing', () => {
        send({ type: 'mergeFrames', token: 0, frames: [], settings: {} });
        const result = posted.find((m) => m.type === 'result');
        expect(result).toBeTruthy();
    });

    it('ignores a mergeFrames message carrying a stale token', () => {
        send({ type: 'reset', token: 7, totalLogs: 0 });
        posted.length = 0;
        send({ type: 'mergeFrames', token: 3, frames: frames(), settings: {} });
        expect(posted.find((m) => m.type === 'result')).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/workerMergeFrames.test.ts`
Expected: FAIL — no `result` is posted, because the worker ignores the unknown message type.

- [ ] **Step 3: Handle the message**

In `src/renderer/workers/statsWorker.ts`, inside `self.onmessage`, add this branch immediately after the existing `if (data?.type === 'settings') { ... }` block (so it sits below the `hasMismatchedToken` guard and therefore inherits stale-token rejection):

```ts
    if (data?.type === 'mergeFrames') {
        // The published web report's slice path: no logs, just pre-finalize
        // frames for the fights the viewer selected.
        const settings = data.settings || {};
        aggregator = new IncrementalAggregator({
            mvpWeights: settings.mvpWeights,
            statsViewSettings: settings.statsViewSettings,
            disruptionMethod: settings.disruptionMethod,
        });
        const frames = Array.isArray(data.frames) ? data.frames : [];
        frames.forEach((frame: any) => aggregator!.mergeFrame(frame));
        ingestedLogCount = frames.length;
        ingestedLogIds = frames.map((_: any, i: number) => `slice-${i}`);
        ingestedOwnedLogIds = [];
        expectedLogCount = frames.length;
        droppedLogMessages = 0;
        // Slice mode never renders the map replay, so skip the replay transfer.
        computeAndPost(true);
        return;
    }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/stats/slice/__tests__/workerMergeFrames.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/workers/statsWorker.ts src/renderer/stats/slice/__tests__/workerMergeFrames.test.ts
git commit -m "feat(slice): add a mergeFrames message to the stats worker"
```

---

### Task 17: Fetching and validating the sidecar

The sidecar is served from R2 as `application/gzip` with **no** `Content-Encoding`, so the browser hands back the compressed bytes and the viewer inflates them itself with `DecompressionStream('gzip')`. Validation happens here: a wrong `version` or a `settingsHash` that disagrees with the report disables slicing rather than rendering wrong numbers.

**Files:**
- Create: `src/renderer/stats/slice/fetchSliceSidecar.ts`
- Test: `src/renderer/stats/slice/__tests__/fetchSliceSidecar.test.ts`

**Interfaces:**
- Consumes: `SliceSidecar`, `SLICE_SIDECAR_VERSION` (Task 1).
- Produces: `fetchSliceSidecar(url: string, expectedSettingsHash: string | null): Promise<{ ok: true; sidecar: SliceSidecar } | { ok: false; reason: 'network' | 'version' | 'settings' | 'malformed'; message: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/slice/__tests__/fetchSliceSidecar.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchSliceSidecar } from '../fetchSliceSidecar';
import { SLICE_SIDECAR_VERSION } from '../sliceTypes';

const SIDECAR = {
    version: SLICE_SIDECAR_VERSION,
    settingsHash: 'abc123',
    fights: [{ id: 'a', label: 'EBG: Klovan', timestamp: 1, duration: '1:00' }],
    frames: [{}],
};

/** Serve gzipped bytes the way R2 does: compressed body, no Content-Encoding. */
const serve = (body: Uint8Array, ok = true) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok,
        status: ok ? 200 : 404,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    })));
};

const gz = (value: unknown) => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(value), 'utf8')));

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchSliceSidecar', () => {
    it('inflates and returns a valid sidecar', async () => {
        serve(gz(SIDECAR));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.sidecar.fights).toHaveLength(1);
    });

    it('accepts a sidecar when the report has no settings hash to compare against', async () => {
        serve(gz(SIDECAR));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', null);
        expect(result.ok).toBe(true);
    });

    it('rejects a settings hash mismatch rather than rendering wrong numbers', async () => {
        serve(gz(SIDECAR));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'different');
        expect(result).toMatchObject({ ok: false, reason: 'settings' });
    });

    it('rejects an unknown sidecar version', async () => {
        serve(gz({ ...SIDECAR, version: 99 }));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'version' });
    });

    it('reports a network failure', async () => {
        serve(gz(SIDECAR), false);
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'network' });
    });

    it('reports malformed bytes rather than throwing', async () => {
        serve(new Uint8Array([1, 2, 3, 4]));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'malformed' });
    });

    it('reports a sidecar whose frames do not line up with its fights', async () => {
        serve(gz({ ...SIDECAR, frames: [] }));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'malformed' });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/slice/__tests__/fetchSliceSidecar.test.ts`
Expected: FAIL — `Failed to resolve import "../fetchSliceSidecar"`.

- [ ] **Step 3: Write the fetcher**

```ts
// src/renderer/stats/slice/fetchSliceSidecar.ts
import { SLICE_SIDECAR_VERSION, type SliceSidecar } from './sliceTypes';

export type FetchSliceResult =
    | { ok: true; sidecar: SliceSidecar }
    | { ok: false; reason: 'network' | 'version' | 'settings' | 'malformed'; message: string };

/**
 * Inflate gzipped bytes in the browser.
 *
 * R2 serves the sidecar as `application/gzip` with no `Content-Encoding`, so
 * the browser does NOT transparently inflate it — these are the compressed
 * bytes and this is where they are decompressed. Node's test environment
 * provides DecompressionStream from Node 18 on, so the same path runs in tests.
 */
const inflate = async (buffer: ArrayBuffer): Promise<string> => {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
};

/**
 * Fetch and validate a published report's slice sidecar.
 *
 * Never called on report load — only when the viewer opens the slice tray or
 * lands on a `slice=` URL. A version or settings mismatch disables slicing
 * rather than rendering numbers computed under different settings.
 */
export async function fetchSliceSidecar(
    url: string,
    expectedSettingsHash: string | null,
): Promise<FetchSliceResult> {
    let buffer: ArrayBuffer;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return { ok: false, reason: 'network', message: `Slice data unavailable (HTTP ${response.status}).` };
        }
        buffer = await response.arrayBuffer();
    } catch (err) {
        return {
            ok: false,
            reason: 'network',
            message: `Could not load slice data: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    let sidecar: SliceSidecar;
    try {
        sidecar = JSON.parse(await inflate(buffer));
    } catch {
        return { ok: false, reason: 'malformed', message: 'Slice data could not be read.' };
    }

    if (sidecar?.version !== SLICE_SIDECAR_VERSION) {
        return {
            ok: false,
            reason: 'version',
            message: 'This report’s slice data was published by a different app version.',
        };
    }
    if (!Array.isArray(sidecar.fights) || !Array.isArray(sidecar.frames)
        || sidecar.fights.length === 0 || sidecar.fights.length !== sidecar.frames.length) {
        return { ok: false, reason: 'malformed', message: 'Slice data is incomplete.' };
    }
    if (expectedSettingsHash && sidecar.settingsHash !== expectedSettingsHash) {
        return {
            ok: false,
            reason: 'settings',
            message: 'Slice data does not match this report’s settings — slicing is unavailable.',
        };
    }
    return { ok: true, sidecar };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/stats/slice/__tests__/fetchSliceSidecar.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Validate and commit**

```bash
npm run validate
git add src/renderer/stats/slice/fetchSliceSidecar.ts src/renderer/stats/slice/__tests__/fetchSliceSidecar.test.ts
git commit -m "feat(slice): fetch and validate the slice sidecar in the browser"
```

---

### Task 18: Slice mode in the published viewer

Phase A already built the pill, tray and banner, and they read `useStatsStore` — which the web bundle also has. The only thing stopping them rendering in a published report is that `StatsView` gates them on `!embedded`, and the web report is embedded. Replace that gate with an explicit `sliceEnabled` prop, then wire `reportApp` to fetch the sidecar on first tray-open and swap `precomputedStats` for the recomputed result.

**Files:**
- Modify: `src/renderer/StatsView.tsx:105` (props), `:4345-4346` (the gate)
- Modify: `src/web/reportApp.tsx:1774` (the `StatsView` call site) and its state block around `:293`
- Test: `src/renderer/stats/components/__tests__/FightSliceTray.test.tsx` (extend), `src/web/__tests__/reportSliceMode.test.tsx` (create)

**Interfaces:**
- Consumes: `fetchSliceSidecar` (Task 17), `mergeSliceFrames` (Task 13), `useStatsStore` (`mergeFightRoster`, `excludedFightKeys`, `clearFightSlice`).
- Produces: `StatsViewProps` gains `sliceEnabled?: boolean`; `reportApp` holds `sliceState: { status: 'idle' | 'loading' | 'ready' | 'unavailable'; sidecar: SliceSidecar | null; message: string | null }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/web/__tests__/reportSliceMode.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatsView } from '../../renderer/StatsView';
import { useStatsStore, type FightRosterEntry } from '../../renderer/stats/statsStore';

const ROSTER: FightRosterEntry[] = [
    { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', isWin: true, enemyClassCounts: {} },
    { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', isWin: false, enemyClassCounts: {} },
];

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(ROSTER, ['a', 'b']);
});

const renderEmbedded = (sliceEnabled: boolean) => render(
    <StatsView
        logs={[]}
        onBack={() => {}}
        mvpWeights={undefined}
        precomputedStats={{ statsViewSettings: {} }}
        embedded
        sliceEnabled={sliceEnabled}
    />
);

describe('published report slice mode', () => {
    it('shows the slice banner in an embedded view when slicing is enabled', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        renderEmbedded(true);
        expect(screen.getByText(/1 of 2 fights/i)).toBeInTheDocument();
    });

    it('shows no slice banner in an embedded view when slicing is not enabled', () => {
        // A historical FightReportHistoryView must never surface the live slice.
        useStatsStore.getState().setFightsExcluded(['b'], true);
        renderEmbedded(false);
        expect(screen.queryByText(/1 of 2 fights/i)).not.toBeInTheDocument();
    });

    it('clears the slice from the embedded banner', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        renderEmbedded(true);
        fireEvent.click(screen.getByRole('button', { name: /clear slice/i }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/web/__tests__/reportSliceMode.test.tsx`
Expected: FAIL — the banner is absent in both cases, because `StatsView` gates it on `!embedded`.

- [ ] **Step 3: Add the `sliceEnabled` prop and re-gate**

In `src/renderer/StatsView.tsx`, add `sliceEnabled?: boolean;` to `StatsViewProps` and `sliceEnabled = false` to the destructured parameter list at line 259. Then replace lines 4345-4346:

```tsx
            {(!embedded || sliceEnabled) && sliceTrayOpen && <FightSliceTray onClose={() => setSliceTrayOpen(false)} />}
            {(!embedded || sliceEnabled) && <FightSliceBanner />}
```

Leave the `mergeFightRoster` effect at `:4185` gated on `!embedded` exactly as it is — in slice mode the roster comes from the sidecar, not from the (empty) `logs` prop, and `reportApp` populates it.

Also make the pill reachable in the web header: `StatsHeader` already renders `FightSlicePill` when it receives `onToggleSliceTray` (`src/renderer/stats/ui/StatsHeader.tsx:134`). Find where `StatsView` passes `onToggleSliceTray` and widen its condition from `!embedded` to `!embedded || sliceEnabled` the same way.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/web/__tests__/reportSliceMode.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm Phase A's desktop behaviour is unchanged**

Run: `npx vitest run src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`
Expected: PASS — all 15 existing tests, untouched.

- [ ] **Step 6: Wire the sidecar into `reportApp`**

In `src/web/reportApp.tsx`, add the imports and state:

```tsx
import { fetchSliceSidecar } from '../renderer/stats/slice/fetchSliceSidecar';
import { mergeSliceFrames } from '../renderer/stats/slice/mergeSliceFrames';
import { useStatsStore } from '../renderer/stats/statsStore';
import type { SliceSidecar } from '../renderer/stats/slice/sliceTypes';
...
    const [sliceState, setSliceState] = useState<{
        status: 'idle' | 'loading' | 'ready' | 'unavailable';
        sidecar: SliceSidecar | null;
        message: string | null;
    }>({ status: 'idle', sidecar: null, message: null });
```

Add the loader. **It is never called on mount** — only from the tray toggle (this step) and the deep link (Task 19):

```tsx
    const excludedFightKeys = useStatsStore((s) => s.excludedFightKeys);
    const mergeFightRoster = useStatsStore((s) => s.mergeFightRoster);

    const loadSliceSidecar = useCallback(async (): Promise<SliceSidecar | null> => {
        if (sliceState.sidecar) return sliceState.sidecar;
        const url = (report?.stats as any)?.sliceDataUrl;
        if (!url) {
            setSliceState({ status: 'unavailable', sidecar: null, message: 'This report was published without slice data.' });
            return null;
        }
        setSliceState({ status: 'loading', sidecar: null, message: null });
        const result = await fetchSliceSidecar(url, (report?.stats as any)?.sliceSettingsHash || null);
        if (!result.ok) {
            setSliceState({ status: 'unavailable', sidecar: null, message: result.message });
            return null;
        }
        // The tray reads fightRoster, so the sidecar's frozen publish order
        // becomes the roster — ordinals and tray cards agree by construction.
        mergeFightRoster(result.sidecar.fights, result.sidecar.fights.map((f) => f.id));
        setSliceState({ status: 'ready', sidecar: result.sidecar, message: null });
        return result.sidecar;
    }, [report, sliceState.sidecar, mergeFightRoster]);
```

Recompute whenever the selection changes:

```tsx
    const slicedStats = useMemo(() => {
        const sidecar = sliceState.sidecar;
        if (!sidecar || excludedFightKeys.size === 0) return null;
        const included = sidecar.fights
            .map((fight, ordinal) => ({ fight, ordinal }))
            .filter(({ fight }) => !excludedFightKeys.has(fight.id))
            .map(({ ordinal }) => ordinal);
        if (included.length === 0) return null;
        return mergeSliceFrames({
            sidecar,
            includedOrdinals: included,
            // Task 15 review round 2 (R15-6): the viewer has no settings of
            // its own in slice mode, so it must hash/merge from the SAME
            // published values the sidecar was built under, or its
            // settingsHash can never agree with the publisher's.
            mvpWeights: (report?.stats as any)?.mvpWeights,
            statsViewSettings: (report?.stats as any)?.statsViewSettings,
            disruptionMethod: (report?.stats as any)?.disruptionMethod,
        }).stats;
    }, [sliceState.sidecar, excludedFightKeys, report]);
```

Finally, at the `StatsView` call site (`:1774`), pass the sliced result and enable the UI:

```tsx
                                precomputedStats={slicedStats || report.stats}
                                sliceEnabled={Boolean((report.stats as any)?.sliceDataUrl)}
                                onOpenSliceTray={loadSliceSidecar}
```

`onOpenSliceTray` is a new optional `StatsViewProps` callback: `StatsView` awaits it before opening the tray, so the first open is what triggers the fetch. Declare it as `onOpenSliceTray?: () => Promise<unknown>` and call it from the same handler that sets `sliceTrayOpen`.

This runs the recompute on the main thread. That is deliberate for this task — it is the simplest thing that can be verified end to end. Task 20 replaces it with the worker path from Task 16; do not skip ahead, because a failure here is much easier to read without a worker in the way.

- [ ] **Step 7: Build the web target to confirm the bundle resolves**

Run: `npm run build:web`
Expected: build succeeds. This is the check that `src/renderer/stats/slice/` imports cleanly into the web target — a Node-only import (`node:zlib`) leaking into `fetchSliceSidecar` or `mergeSliceFrames` would fail here.

- [ ] **Step 8: Validate and commit**

```bash
npm run validate
git add src/renderer/StatsView.tsx src/web/reportApp.tsx src/web/__tests__/reportSliceMode.test.tsx
git commit -m "feat(slice): enable the fight slicer in the published web report"
```

---

### Task 19: The shareable link

The URL is the entire persistence model: no saved slices, no named groups, no server state. A slice is a base64url bitmask in the **`slice` query parameter**, alongside the existing `report` and `view` params (`src/web/reportApp.tsx:38-45`). Not the fragment — the hash is already the section-anchor channel (`:747`, `resolveSectionTarget`), and a slice has to survive a jump to a section.

Landing on a `slice=` URL **paints the full report first**, then applies the slice when the sidecar resolves, with the banner reading "Applying slice…" in between. Blocking first paint on a multi-megabyte fetch is a worse trade than a brief flash of unsliced numbers.

**Files:**
- Modify: `src/web/reportApp.tsx`
- Modify: `src/renderer/stats/components/FightSliceTray.tsx` (the banner gains one control)
- Test: `src/renderer/stats/components/__tests__/FightSliceTray.test.tsx` (extend)
- Test: `tests/e2e/web/fight-slice.spec.ts` (create)

**Interfaces:**
- Consumes: `encodeSliceMask` / `decodeSliceMask` (Task 2), `loadSliceSidecar` and `sliceState` (Task 18), `useStatsStore.setFightsExcluded`.
- Produces: `FightSliceBanner` gains an optional `onCopyLink?: () => void` prop rendering a **Copy slice link** button when supplied.

- [ ] **Step 1: Write the failing banner test**

Append to `src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`, inside the existing `describe('FightSliceBanner', ...)` block:

```tsx
    it('renders no copy control when no handler is supplied', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        render(<FightSliceBanner />);
        expect(screen.queryByRole('button', { name: /copy slice link/i })).not.toBeInTheDocument();
    });

    it('renders a copy control when a handler is supplied and calls it', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        const onCopyLink = vi.fn();
        render(<FightSliceBanner onCopyLink={onCopyLink} />);
        fireEvent.click(screen.getByRole('button', { name: /copy slice link/i }));
        expect(onCopyLink).toHaveBeenCalledTimes(1);
    });
```

Add `vi` to the existing `import { describe, it, expect, beforeEach } from 'vitest';` line.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`
Expected: FAIL — no "Copy slice link" button exists.

- [ ] **Step 3: Add the copy control to the banner**

In `src/renderer/stats/components/FightSliceTray.tsx`, change the banner signature and add the button before the existing "Clear slice" button:

```tsx
export const FightSliceBanner = ({ onCopyLink }: { onCopyLink?: () => void } = {}) => {
```

```tsx
            {onCopyLink && (
                <button
                    type="button"
                    onClick={onCopyLink}
                    className="ml-auto rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]"
                >
                    Copy slice link
                </button>
            )}
```

Change the existing "Clear slice" button's class from `ml-auto rounded-...` to `rounded-...` when `onCopyLink` is present, so only the first of the two carries `ml-auto`. The simplest form that keeps both cases right: give the copy button `ml-auto` as above and change the clear button's className to drop `ml-auto` and add `ml-2`, then wrap the pair so the group is right-aligned — `<span className="ml-auto flex items-center gap-2">` around both buttons, with neither carrying `ml-auto` itself.

Then thread the prop through `StatsView.tsx`: add `onCopySliceLink?: () => void` to `StatsViewProps` and pass it at the banner call site — `<FightSliceBanner onCopyLink={onCopySliceLink} />`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/stats/components/__tests__/FightSliceTray.test.tsx`
Expected: PASS — 17 tests (the 15 from Phase A plus the two above).

- [ ] **Step 5: Read the slice parameter on load**

In `src/web/reportApp.tsx`, add the imports and the deep-link effect. It runs **after** the report has painted, which is what gives the paint-first-then-apply order the spec asks for:

```tsx
import { encodeSliceMask, decodeSliceMask } from '../renderer/stats/slice/sliceBitmask';
...
    const requestedSlice = useMemo(() => (initialSearchParams.get('slice') || '').trim(), [initialSearchParams]);
    const [sliceLinkStatus, setSliceLinkStatus] = useState<string | null>(null);
    const deepLinkApplied = useRef(false);

    useEffect(() => {
        if (!requestedSlice || deepLinkApplied.current || !report) return;
        deepLinkApplied.current = true;
        setSliceLinkStatus('Applying slice…');
        void (async () => {
            const sidecar = await loadSliceSidecar();
            if (!sidecar) { setSliceLinkStatus(null); return; }
            const included = decodeSliceMask(requestedSlice, sidecar.fights.length);
            if (!included) {
                // A stale link degrades to the truth, never to wrong numbers.
                setSliceLinkStatus('This slice link does not match the report — showing all fights.');
                return;
            }
            const includedIds = new Set(included.map((ordinal) => sidecar.fights[ordinal]?.id).filter(Boolean));
            useStatsStore.getState().setFightsExcluded(
                sidecar.fights.filter((f) => !includedIds.has(f.id)).map((f) => f.id),
                true,
            );
            setSliceLinkStatus(null);
        })();
    }, [requestedSlice, report, loadSliceSidecar]);
```

Render `sliceLinkStatus` wherever `sliceState.message` is rendered, so both the "Applying slice…" transition and a rejected link surface in the same place.

- [ ] **Step 6: Write the slice link**

```tsx
    const handleCopySliceLink = useCallback(() => {
        const sidecar = sliceState.sidecar;
        if (!sidecar) return;
        const included = sidecar.fights
            .map((fight, ordinal) => ({ fight, ordinal }))
            .filter(({ fight }) => !excludedFightKeys.has(fight.id))
            .map(({ ordinal }) => ordinal);
        const url = new URL(window.location.href);
        // Query, not hash: the hash is the section-anchor channel, and a slice
        // has to survive jumping to a section.
        url.searchParams.set('slice', encodeSliceMask(included, sidecar.fights.length));
        void navigator.clipboard?.writeText(url.toString());
        setSliceLinkStatus('Slice link copied.');
        window.setTimeout(() => setSliceLinkStatus(null), 2000);
    }, [sliceState.sidecar, excludedFightKeys]);
```

Pass it at the `StatsView` call site: `onCopySliceLink={handleCopySliceLink}`.

- [ ] **Step 7: Write the end-to-end test**

```ts
// tests/e2e/web/fight-slice.spec.ts
import { test, expect } from '@playwright/test';

test.describe('published report fight slicer', () => {
    test('a cold report load issues no sidecar request', async ({ page }) => {
        // The feature must be free for the overwhelming majority of views.
        const sidecarRequests: string[] = [];
        page.on('request', (req) => {
            if (req.url().includes('slice.json')) sidecarRequests.push(req.url());
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        expect(sidecarRequests).toEqual([]);
    });

    test('a report without slice data shows no slice pill', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('button', { name: /slice fights/i })).toHaveCount(0);
    });
});
```

The local fixture in `web/report.json` is published without R2, so it carries no `sliceDataUrl` — which is exactly what makes these two assertions meaningful: they pin the "no R2, no slicer, no cost" contract. A positive-path e2e needs a fixture report with a `sliceDataUrl` and a served `slice.json.gz`; add it when one exists rather than fabricating one here.

- [ ] **Step 8: Run the tests**

```bash
npx vitest run src/renderer/stats/components/__tests__/FightSliceTray.test.tsx
npm run test:e2e:web -- fight-slice
```
Expected: PASS.

- [ ] **Step 9: Validate and commit**

```bash
npm run validate
git add src/web/reportApp.tsx src/renderer/StatsView.tsx src/renderer/stats/components/FightSliceTray.tsx src/renderer/stats/components/__tests__/FightSliceTray.test.tsx tests/e2e/web/fight-slice.spec.ts
git commit -m "feat(slice): add shareable slice links to the published report"
```

---

### Task 20: Move the slice recompute onto the worker

Task 18 wires the recompute as a synchronous `useMemo` on the main thread, which is the right first cut — it is easy to verify and it works. But merging 25 frames and running `finalize()` is the same order of work as a full aggregation, and the spec is explicit that it belongs in the worker Task 16 already taught to accept frames. This task replaces the `useMemo` with the worker round-trip and deletes the synchronous path.

**Files:**
- Create: `src/web/hooks/useSliceRecompute.ts`
- Modify: `src/web/reportApp.tsx` (replace the `slicedStats` `useMemo` from Task 18)
- Test: `src/web/__tests__/useSliceRecompute.test.ts`

**Interfaces:**
- Consumes: the worker message `{ type: 'mergeFrames', token, frames, settings }` and the `{ type: 'result', result, token }` reply (Task 16); `SliceSidecar` (Task 1).
- Produces: `useSliceRecompute(args: { sidecar: SliceSidecar | null; includedOrdinals: number[] | null; statsViewSettings: any; disruptionMethod: any }): { stats: any | null; computing: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/web/__tests__/useSliceRecompute.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSliceRecompute } from '../hooks/useSliceRecompute';

const posted: any[] = [];
let handler: ((e: any) => void) | null = null;

class FakeWorker {
    onmessage: ((e: any) => void) | null = null;
    constructor() { handler = null; }
    postMessage(msg: any) {
        posted.push(msg);
        handler = this.onmessage;
    }
    terminate() {}
}

vi.stubGlobal('Worker', FakeWorker as any);

const SIDECAR: any = {
    version: 1, settingsHash: 'h',
    fights: [{ id: 'a' }, { id: 'b' }],
    frames: [{ n: 1 }, { n: 2 }],
};

afterEach(() => { posted.length = 0; handler = null; });

describe('useSliceRecompute', () => {
    it('posts only the selected frames', async () => {
        renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [1], statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(posted.length).toBeGreaterThan(0));
        const msg = posted[posted.length - 1];
        expect(msg.type).toBe('mergeFrames');
        expect(msg.frames).toEqual([{ n: 2 }]);
    });

    it('returns null stats and stops computing when nothing is selected', () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: null, statsViewSettings: {}, disruptionMethod: undefined,
        }));
        expect(result.current.stats).toBeNull();
        expect(result.current.computing).toBe(false);
        expect(posted).toHaveLength(0);
    });

    it('surfaces the worker result', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(handler).toBeTruthy());
        const token = posted[posted.length - 1].token;
        handler!({ data: { type: 'result', token, result: { stats: { ok: true } } } });
        await waitFor(() => expect(result.current.stats).toEqual({ ok: true }));
        expect(result.current.computing).toBe(false);
    });

    it('ignores a result carrying a stale token', async () => {
        const { result } = renderHook(() => useSliceRecompute({
            sidecar: SIDECAR, includedOrdinals: [0], statsViewSettings: {}, disruptionMethod: undefined,
        }));
        await waitFor(() => expect(handler).toBeTruthy());
        handler!({ data: { type: 'result', token: 9999, result: { stats: { stale: true } } } });
        expect(result.current.stats).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/web/__tests__/useSliceRecompute.test.ts`
Expected: FAIL — `Failed to resolve import "../hooks/useSliceRecompute"`.

- [ ] **Step 3: Write the hook**

```ts
// src/web/hooks/useSliceRecompute.ts
import { useEffect, useRef, useState } from 'react';
import type { SliceSidecar } from '../../renderer/stats/slice/sliceTypes';

/**
 * Recompute a slice in the stats worker.
 *
 * Merging 25 frames and running `finalize()` costs about what a full
 * aggregation costs, so it does not belong on the main thread. Results carry
 * the token of the request that asked for them; a late reply from a superseded
 * selection is dropped rather than painted.
 *
 * The worker URL is resolved the same way the desktop hook resolves it
 * (`useStatsAggregationWorker.ts:256`), so the bundler emits one shared chunk.
 */
export function useSliceRecompute({ sidecar, includedOrdinals, statsViewSettings, disruptionMethod }: {
    sidecar: SliceSidecar | null;
    includedOrdinals: number[] | null;
    statsViewSettings: any;
    disruptionMethod: any;
}): { stats: any | null; computing: boolean } {
    const [stats, setStats] = useState<any | null>(null);
    const [computing, setComputing] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const tokenRef = useRef(0);

    useEffect(() => () => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }, []);

    const key = includedOrdinals ? includedOrdinals.join(',') : '';

    useEffect(() => {
        if (!sidecar || !includedOrdinals || includedOrdinals.length === 0) {
            setStats(null);
            setComputing(false);
            return;
        }
        if (!workerRef.current) {
            workerRef.current = new Worker(
                new URL('../../renderer/workers/statsWorker.ts', import.meta.url),
                { type: 'module' },
            );
        }
        const worker = workerRef.current;
        const token = ++tokenRef.current;
        setComputing(true);
        worker.onmessage = (event: MessageEvent) => {
            const data = event.data;
            if (data?.type !== 'result' || data.token !== tokenRef.current) return;
            setStats(data.result?.stats ?? null);
            setComputing(false);
        };
        worker.postMessage({
            type: 'mergeFrames',
            token,
            frames: includedOrdinals.map((ordinal) => sidecar.frames[ordinal]).filter(Boolean),
            settings: { statsViewSettings, disruptionMethod },
        });
    }, [sidecar, key, statsViewSettings, disruptionMethod, includedOrdinals]);

    return { stats, computing };
}
```

- [ ] **Step 4: Replace the synchronous recompute in `reportApp`**

In `src/web/reportApp.tsx`, delete the `slicedStats` `useMemo` added in Task 18 (and its now-unused `mergeSliceFrames` import), and replace it with:

```tsx
    const includedOrdinals = useMemo(() => {
        const sidecar = sliceState.sidecar;
        if (!sidecar || excludedFightKeys.size === 0) return null;
        const included = sidecar.fights
            .map((fight, ordinal) => ({ fight, ordinal }))
            .filter(({ fight }) => !excludedFightKeys.has(fight.id))
            .map(({ ordinal }) => ordinal);
        return included.length > 0 ? included : null;
    }, [sliceState.sidecar, excludedFightKeys]);

    const { stats: slicedStats, computing: sliceComputing } = useSliceRecompute({
        sidecar: sliceState.sidecar,
        includedOrdinals,
        statsViewSettings: (report?.stats as any)?.statsViewSettings,
        disruptionMethod: (report?.stats as any)?.disruptionMethod,
    });
```

Add `import { useSliceRecompute } from './hooks/useSliceRecompute';`. The `StatsView` call site keeps `precomputedStats={slicedStats || report.stats}` unchanged, so the report stays fully readable while a slice computes. Render `sliceComputing` next to `sliceLinkStatus` as "Recomputing…" so the transition is legible rather than a silent stale view.

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/web/__tests__/useSliceRecompute.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Rebuild the web target**

Run: `npm run build:web`
Expected: build succeeds and emits a worker chunk. `mergeSliceFrames` is now referenced only by its own unit test, which is fine — it is the synchronous reference implementation the worker path is checked against in Task 13.

- [ ] **Step 7: Validate and commit**

```bash
npm run validate
git add src/web/hooks/useSliceRecompute.ts src/web/reportApp.tsx src/web/__tests__/useSliceRecompute.test.ts
git commit -m "feat(slice): move the published-report slice recompute onto the stats worker"
```

---

### Task 21: Full-suite verification

Every prior task ran its own tests. This one proves the feature did not break anything else, and is the gate before the branch is proposed.

**Files:** none — verification only.

- [ ] **Step 1: Rebuild the workspace package**

```bash
npm run build --workspace @axiapps/bridge-metrics
```
Expected: `tsup` succeeds. Anything that resolves `@axiapps/bridge-metrics` reads `dist/`, so a stale build here makes the rest of this task meaningless.

- [ ] **Step 2: Run the full unit suite**

```bash
npm run test:unit
```
Expected: PASS. `vitest.config.ts` pins `maxWorkers: 2` — do not override it.

- [ ] **Step 3: Run typecheck and lint**

```bash
npm run validate
```
Expected: PASS with zero warnings (`--max-warnings 0`).

- [ ] **Step 4: Run the metric audits**

```bash
npm run audit:boons && npm run audit:metrics && npm run audit:conditions && npm run audit:conditions:consistency
```
Expected: PASS. These validate metric values against `test-fixtures/`, and Tasks 3–12 moved player folds inside seven metric modules — this is the check that none of those moves changed a number.

- [ ] **Step 5: Run the web e2e suite**

```bash
npm run test:e2e:web
```
Expected: PASS, including `fight-slice.spec.ts`.

- [ ] **Step 6: Commit any fixes and open the PR**

```bash
npm run validate && npm run test:unit
git log --oneline main..HEAD
```
Expected: the task commits, in order. Open the pull request from this branch.

---

## Notes for the implementer

**If a module's merge-equivalence test cannot be made to pass**, that section is excluded from slice mode — per-section, never all-or-nothing, as the spec requires. Concretely: omit its `extract*Frame` from `exportFrame`, guard its `merge*Frame` call in `mergeFrame`, and have the tray say the section is unavailable in slice mode. Do not weaken the test to make it pass.

**Do not add anything derived to a frame.** Leaderboards, top stats, MVPs, role classifications and boon leaderboards all recompute from `finalize()`. A frame that carries one of them is both redundant and a silent budget regression; Task 15's size test is the backstop, not the first line of defence.

**Publishing is already blocked while a desktop slice is active** (`useStatsUploads.ts:21`, `canPublishWithSlice`). That Phase A guard is what lets `buildSliceSidecar` assume `logs` is the whole night. Do not relax it.
