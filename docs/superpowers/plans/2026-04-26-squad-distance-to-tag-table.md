# Squad Distance-to-Tag Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-player table to the Squad Stats area showing avg / median / p95 distance from each player to the commander tag, aggregated across the loaded fights.

**Architecture:** A new pure compute module `computeDistanceToTag.ts` ingests one log at a time (mirroring `computeTagDistanceDeaths`), producing a per-player per-fight contribution. A finalizer aggregates all contributions per account using a hybrid strategy: pure replay → sample-level percentiles; mixed/fightAvg → per-fight percentiles. Wired into `IncrementalAggregator` so output is precomputed on the stats payload, then consumed by a new section component `SquadDistanceToTagSection.tsx` rendered next to `SquadTagDistanceDeathsSection` in `StatsView`.

**Tech Stack:** TypeScript, React, vitest, existing project conventions (recharts not used here — plain table; styled with the project's `var(--*)` tokens).

**Spec:** `docs/superpowers/specs/2026-04-26-squad-distance-to-tag-table-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/renderer/stats/computeDistanceToTag.ts` | Pure computation: `ingestLogDistanceToTag(log, idx)` returns per-player per-fight contribution; `finalizeDistanceToTag(contributions[])` collapses contributions per account into final rows. |
| `src/renderer/stats/__tests__/computeDistanceToTag.test.ts` | Unit tests for ingest + finalize. |
| `src/renderer/stats/incrementalAggregation.ts` | Wire ingest into `ingestLog`, finalize on `finalize()`, expose result on returned `stats`. |
| `src/renderer/stats/statsTypes.ts` (or wherever `StatsAggregation` is declared) | Add `distanceToTag` field to the stats payload type. |
| `src/renderer/stats/sections/SquadDistanceToTagSection.tsx` | Sortable table UI with min-attendance toggle. |
| `src/renderer/StatsView.tsx` | Read `safeStats.distanceToTag`, pass to the new section, render in both the legacy squad block and the grouped squad-stats group. |

---

## Task 1: computeDistanceToTag — Types and Ingest Skeleton

**Files:**
- Create: `src/renderer/stats/computeDistanceToTag.ts`

- [ ] **Step 1: Create the module with types and stub functions**

Create `src/renderer/stats/computeDistanceToTag.ts`:

```typescript
export type DistanceContributionSource = 'replay' | 'fightAvg';

/** One player's contribution from a single fight. */
export type DistanceContribution = {
    account: string;
    profession: string;
    isCommander: boolean;
    fightId: string;
    source: DistanceContributionSource;
    /** When source==='replay': raw per-tick distance samples for this fight. */
    samples: number[];
    /** Per-fight mean distance (used in per-fight aggregation mode). */
    fightMean: number;
};

export type DistanceToTagRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    sampleCount: number;
    avg: number;
    median: number;
    p95: number;
    source: 'replay' | 'fightAvg' | 'mixed';
    isCommander: boolean;
};

export type DistanceToTagResult = {
    rows: DistanceToTagRow[];
    /** Number of distinct commander accounts across all fights. */
    commanderCount: number;
};

export const ingestLogDistanceToTag = (_log: any, _fightIndex: number): DistanceContribution[] => {
    return [];
};

export const finalizeDistanceToTag = (_contributions: DistanceContribution[]): DistanceToTagResult => {
    return { rows: [], commanderCount: 0 };
};

export const computeDistanceToTag = (sortedFightLogs: Array<{ log: any }>): DistanceToTagResult => {
    const all: DistanceContribution[] = [];
    sortedFightLogs.forEach(({ log }, idx) => {
        all.push(...ingestLogDistanceToTag(log, idx));
    });
    return finalizeDistanceToTag(all);
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/stats/computeDistanceToTag.ts
git commit -m "feat: scaffold computeDistanceToTag module"
```

---

## Task 2: computeDistanceToTag — Failing Tests for ingestLogDistanceToTag

**Files:**
- Create: `src/renderer/stats/__tests__/computeDistanceToTag.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/renderer/stats/__tests__/computeDistanceToTag.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    ingestLogDistanceToTag,
    finalizeDistanceToTag,
    computeDistanceToTag,
    type DistanceContribution,
} from '../computeDistanceToTag';

const makeLog = (overrides: any = {}) => ({
    log: {
        filePath: overrides.filePath ?? 'fight-1',
        details: {
            combatReplayMetaData: {
                pollingRate: overrides.pollingRate ?? 150,
                inchToPixel: overrides.inchToPixel ?? 1,
            },
            players: overrides.players ?? [],
            ...(overrides.detailsExtra ?? {}),
        },
    },
});

const makePlayer = (opts: {
    account: string;
    profession?: string;
    hasCommanderTag?: boolean;
    notInSquad?: boolean;
    positions?: Array<[number, number]>;
    start?: number;
    stackDist?: number;
}) => ({
    account: opts.account,
    profession: opts.profession ?? 'Guardian',
    hasCommanderTag: opts.hasCommanderTag ?? false,
    notInSquad: opts.notInSquad ?? false,
    statsAll: [{ stackDist: opts.stackDist ?? 0 }],
    combatReplayData: opts.positions
        ? { positions: opts.positions, start: opts.start ?? 0 }
        : undefined,
});

describe('ingestLogDistanceToTag', () => {
    it('returns empty when no players', () => {
        const out = ingestLogDistanceToTag(makeLog().log, 0);
        expect(out).toEqual([]);
    });

    it('emits fightAvg contribution per non-squad-excluded player when replay data is missing', () => {
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({ account: 'A.1', stackDist: 200 }),
                    makePlayer({ account: 'B.2', stackDist: 500 }),
                    makePlayer({ account: 'C.3', notInSquad: true, stackDist: 999 }),
                ],
            }).log,
            0
        );
        expect(out).toHaveLength(2);
        expect(out.every(c => c.source === 'fightAvg')).toBe(true);
        expect(out.find(c => c.account === 'A.1')!.fightMean).toBe(200);
        expect(out.find(c => c.account === 'B.2')!.fightMean).toBe(500);
    });

    it('emits replay contribution with samples when commander + player have positions', () => {
        // Commander at origin; player at (3,4) → distance 5 (inchToPixel=1)
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({
                        account: 'Cmdr.0',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0]],
                        stackDist: 0,
                    }),
                    makePlayer({
                        account: 'A.1',
                        positions: [[3, 4], [6, 8], [9, 12]],
                        stackDist: 999,
                    }),
                ],
            }).log,
            0
        );
        const a = out.find(c => c.account === 'A.1')!;
        expect(a.source).toBe('replay');
        expect(a.samples).toEqual([5, 10, 15]);
        expect(a.fightMean).toBe(10);
    });

    it('flags commander contributions with isCommander=true', () => {
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({ account: 'Cmdr.0', hasCommanderTag: true, stackDist: 0 }),
                    makePlayer({ account: 'A.1', stackDist: 200 }),
                ],
            }).log,
            0
        );
        expect(out.find(c => c.account === 'Cmdr.0')!.isCommander).toBe(true);
        expect(out.find(c => c.account === 'A.1')!.isCommander).toBe(false);
    });

    it('handles offset replay starts', () => {
        // pollingRate=150, player starts 300ms in (offset=2)
        // Commander positions: 5 ticks at origin
        // Player positions (start=300): 3 ticks at (3,4), (6,8), (9,12)
        // Aligned tag indices: 2,3,4 (still origin) → distances 5,10,15
        const out = ingestLogDistanceToTag(
            makeLog({
                players: [
                    makePlayer({
                        account: 'Cmdr.0',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                    }),
                    makePlayer({
                        account: 'A.1',
                        positions: [[3, 4], [6, 8], [9, 12]],
                        start: 300,
                    }),
                ],
            }).log,
            0
        );
        const a = out.find(c => c.account === 'A.1')!;
        expect(a.samples).toEqual([5, 10, 15]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/computeDistanceToTag.test.ts`
Expected: ingest tests FAIL ("expected length 2, received 0" etc.).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/__tests__/computeDistanceToTag.test.ts
git commit -m "test: add failing tests for ingestLogDistanceToTag"
```

---

## Task 3: computeDistanceToTag — Implement ingestLogDistanceToTag

**Files:**
- Modify: `src/renderer/stats/computeDistanceToTag.ts`

- [ ] **Step 1: Replace the stub `ingestLogDistanceToTag` with the real implementation**

Replace the body of `ingestLogDistanceToTag` (and the surrounding helpers) so the file's middle section reads:

```typescript
const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const getStackDist = (player: any): number | null => {
    const stats = player?.statsAll?.[0];
    const v = stats?.stackDist;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export const ingestLogDistanceToTag = (log: any, fightIndex: number): DistanceContribution[] => {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;
    const players = Array.isArray(details?.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return [];

    const replayMeta = details?.combatReplayMetaData || {};
    const pollingRate = replayMeta?.pollingRate > 0 ? replayMeta.pollingRate : 0;
    const inchToPixel = replayMeta?.inchToPixel > 0 ? replayMeta.inchToPixel : 0;

    const commander = squadPlayers.find((p: any) => p?.hasCommanderTag);
    const tagPositions: Array<[number, number]> = commander?.combatReplayData?.positions || [];
    const replayUsable = !!commander && tagPositions.length > 0 && pollingRate > 0 && inchToPixel > 0;

    const out: DistanceContribution[] = [];

    for (const player of squadPlayers) {
        const account = player?.account || 'Unknown';
        const profession = player?.profession || 'Unknown';
        const isCommander = !!player?.hasCommanderTag;

        const playerPositions: Array<[number, number]> | undefined = player?.combatReplayData?.positions;
        if (replayUsable && Array.isArray(playerPositions) && playerPositions.length > 0) {
            const playerStart = Number(player?.combatReplayData?.start || 0);
            const playerOffset = Math.floor(playerStart / pollingRate);
            const samples: number[] = [];
            for (let i = 0; i < playerPositions.length; i++) {
                const tagIdx = clamp(i + playerOffset, 0, tagPositions.length - 1);
                const [px, py] = playerPositions[i];
                const [tx, ty] = tagPositions[tagIdx];
                const dist = isCommander ? 0 : Math.hypot(px - tx, py - ty) / inchToPixel;
                samples.push(dist);
            }
            const fightMean = samples.length > 0
                ? samples.reduce((s, v) => s + v, 0) / samples.length
                : 0;
            out.push({ account, profession, isCommander, fightId, source: 'replay', samples, fightMean });
            continue;
        }

        const stack = getStackDist(player);
        if (stack === null) continue;
        out.push({
            account, profession, isCommander, fightId,
            source: 'fightAvg', samples: [], fightMean: stack,
        });
    }

    return out;
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeDistanceToTag.test.ts`
Expected: ingest tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/computeDistanceToTag.ts
git commit -m "feat: implement ingestLogDistanceToTag (replay + fightAvg sources)"
```

---

## Task 4: computeDistanceToTag — Failing Tests for finalizeDistanceToTag

**Files:**
- Modify: `src/renderer/stats/__tests__/computeDistanceToTag.test.ts`

- [ ] **Step 1: Append finalize tests to the existing test file**

Append to `src/renderer/stats/__tests__/computeDistanceToTag.test.ts`:

```typescript
const contrib = (over: Partial<DistanceContribution>): DistanceContribution => ({
    account: 'A.1',
    profession: 'Guardian',
    isCommander: false,
    fightId: 'f1',
    source: 'fightAvg',
    samples: [],
    fightMean: 0,
    ...over,
});

describe('finalizeDistanceToTag', () => {
    it('returns empty when no contributions', () => {
        expect(finalizeDistanceToTag([])).toEqual({ rows: [], commanderCount: 0 });
    });

    it('aggregates fightAvg-only player at per-fight level', () => {
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', fightMean: 100 }),
            contrib({ fightId: 'f2', fightMean: 200 }),
            contrib({ fightId: 'f3', fightMean: 300 }),
        ]);
        expect(out.rows).toHaveLength(1);
        const r = out.rows[0];
        expect(r.source).toBe('fightAvg');
        expect(r.fightCount).toBe(3);
        expect(r.sampleCount).toBe(3);
        expect(r.avg).toBe(200);
        expect(r.median).toBe(200);
        expect(r.p95).toBe(300);
    });

    it('aggregates pure-replay player at sample level (preserves spike info)', () => {
        // Fight 1: 100 samples of 50, plus one spike of 1500.
        // Fight 2: 100 samples of 50.
        // Sample-level: 201 values; p95 in nearest-rank ≈ value at index ceil(0.95*201)-1 = 191 → 50.
        // The 1500 spike is in the pool but does not dominate the median/avg.
        const f1Samples = [...Array(100).fill(50), 1500];
        const f2Samples = Array(100).fill(50);
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', source: 'replay', samples: f1Samples, fightMean: f1Samples.reduce((s, v) => s + v, 0) / f1Samples.length }),
            contrib({ fightId: 'f2', source: 'replay', samples: f2Samples, fightMean: 50 }),
        ]);
        const r = out.rows[0];
        expect(r.source).toBe('replay');
        expect(r.fightCount).toBe(2);
        expect(r.sampleCount).toBe(201);
        expect(r.median).toBe(50);
        // p95 nearest-rank: idx = ceil(0.95 * 201) - 1 = 191 → sorted value 50
        expect(r.p95).toBe(50);
        // Avg pulled up slightly by the spike but small
        expect(r.avg).toBeGreaterThan(50);
        expect(r.avg).toBeLessThan(60);
    });

    it('mixed mode collapses replay fights to their per-fight mean to prevent skew', () => {
        // 1 replay fight with 1000 samples averaging 100 + 4 fightAvg fights at 500 each.
        // Per-fight values: [100, 500, 500, 500, 500] → avg 420, median 500, p95 500.
        const replaySamples = Array(1000).fill(100);
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', source: 'replay', samples: replaySamples, fightMean: 100 }),
            contrib({ fightId: 'f2', fightMean: 500 }),
            contrib({ fightId: 'f3', fightMean: 500 }),
            contrib({ fightId: 'f4', fightMean: 500 }),
            contrib({ fightId: 'f5', fightMean: 500 }),
        ]);
        const r = out.rows[0];
        expect(r.source).toBe('mixed');
        expect(r.fightCount).toBe(5);
        expect(r.sampleCount).toBe(5);
        expect(r.avg).toBe(420);
        expect(r.median).toBe(500);
        expect(r.p95).toBe(500);
    });

    it('excludes commanders entirely when commanderCount <= 2', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'Cmdr.A', isCommander: true, fightMean: 0 }),
            contrib({ account: 'Cmdr.B', isCommander: true, fightMean: 0 }),
            contrib({ account: 'P.1', fightMean: 200 }),
        ]);
        expect(out.commanderCount).toBe(2);
        expect(out.rows.map(r => r.account)).toEqual(['P.1']);
    });

    it('includes commanders when commanderCount > 2', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'Cmdr.A', isCommander: true, fightMean: 0 }),
            contrib({ account: 'Cmdr.B', isCommander: true, fightMean: 0 }),
            contrib({ account: 'Cmdr.C', isCommander: true, fightMean: 0 }),
            contrib({ account: 'P.1', fightMean: 200 }),
        ]);
        expect(out.commanderCount).toBe(3);
        expect(out.rows.map(r => r.account).sort()).toEqual(['Cmdr.A', 'Cmdr.B', 'Cmdr.C', 'P.1']);
    });

    it('treats an account as commander if it is flagged commander in any fight', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'Hybrid.1', isCommander: false, fightId: 'f1', fightMean: 200 }),
            contrib({ account: 'Hybrid.1', isCommander: true, fightId: 'f2', fightMean: 0 }),
        ]);
        // Only one commander → excluded.
        expect(out.commanderCount).toBe(1);
        expect(out.rows).toEqual([]);
    });

    it('handles single data point: avg=median=p95', () => {
        const out = finalizeDistanceToTag([contrib({ fightMean: 250 })]);
        const r = out.rows[0];
        expect(r.fightCount).toBe(1);
        expect(r.avg).toBe(250);
        expect(r.median).toBe(250);
        expect(r.p95).toBe(250);
    });

    it('omits players with zero data points', () => {
        // No contributions for an account → no row. Verified by absence.
        const out = finalizeDistanceToTag([contrib({ account: 'P.1', fightMean: 100 })]);
        expect(out.rows.map(r => r.account)).toEqual(['P.1']);
    });

    it('preserves the most-recent profession seen across fights', () => {
        const out = finalizeDistanceToTag([
            contrib({ account: 'P.1', profession: 'Guardian', fightId: 'f1', fightMean: 100 }),
            contrib({ account: 'P.1', profession: 'Firebrand', fightId: 'f2', fightMean: 200 }),
        ]);
        const r = out.rows[0];
        expect(r.professionList.sort()).toEqual(['Firebrand', 'Guardian']);
        // Profession field is the latest-seen.
        expect(r.profession).toBe('Firebrand');
    });
});

describe('computeDistanceToTag (end-to-end)', () => {
    it('runs full pipeline on minimal logs', () => {
        const out = computeDistanceToTag([
            makeLog({
                players: [
                    makePlayer({ account: 'Cmdr.0', hasCommanderTag: true, stackDist: 0 }),
                    makePlayer({ account: 'A.1', stackDist: 250 }),
                ],
            }),
        ]);
        // 1 commander → excluded; A.1 should be present
        expect(out.commanderCount).toBe(1);
        expect(out.rows.map(r => r.account)).toEqual(['A.1']);
        expect(out.rows[0].avg).toBe(250);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/computeDistanceToTag.test.ts`
Expected: finalize tests FAIL.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/__tests__/computeDistanceToTag.test.ts
git commit -m "test: add failing tests for finalizeDistanceToTag"
```

---

## Task 5: computeDistanceToTag — Implement finalizeDistanceToTag

**Files:**
- Modify: `src/renderer/stats/computeDistanceToTag.ts`

- [ ] **Step 1: Replace the `finalizeDistanceToTag` stub with the real implementation**

In `src/renderer/stats/computeDistanceToTag.ts`, replace the stub `finalizeDistanceToTag` with:

```typescript
const median = (sortedAsc: number[]): number => {
    if (sortedAsc.length === 0) return 0;
    const n = sortedAsc.length;
    if (n % 2 === 1) return sortedAsc[(n - 1) / 2];
    return (sortedAsc[n / 2 - 1] + sortedAsc[n / 2]) / 2;
};

const nearestRankP95 = (sortedAsc: number[]): number => {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(0.95 * sortedAsc.length) - 1);
    return sortedAsc[idx];
};

export const finalizeDistanceToTag = (contributions: DistanceContribution[]): DistanceToTagResult => {
    if (contributions.length === 0) return { rows: [], commanderCount: 0 };

    // Group contributions by account.
    const byAccount = new Map<string, DistanceContribution[]>();
    for (const c of contributions) {
        const list = byAccount.get(c.account);
        if (list) list.push(c);
        else byAccount.set(c.account, [c]);
    }

    // Identify commander accounts (any fight where they were commander).
    const commanderAccounts = new Set<string>();
    for (const [account, list] of byAccount) {
        if (list.some(c => c.isCommander)) commanderAccounts.add(account);
    }
    const commanderCount = commanderAccounts.size;
    const includeCommanders = commanderCount > 2;

    const rows: DistanceToTagRow[] = [];

    for (const [account, list] of byAccount) {
        const isCommander = commanderAccounts.has(account);
        if (isCommander && !includeCommanders) continue;

        const fightIds = new Set<string>();
        const sources = new Set<DistanceContributionSource>();
        for (const c of list) {
            fightIds.add(c.fightId);
            sources.add(c.source);
        }

        const sourceLabel: DistanceToTagRow['source'] =
            sources.size > 1 ? 'mixed' : (sources.has('replay') ? 'replay' : 'fightAvg');

        // Profession bookkeeping.
        const professionList = Array.from(new Set(list.map(c => c.profession).filter(p => p && p !== 'Unknown')));
        const profession = list[list.length - 1].profession;

        let values: number[];
        if (sourceLabel === 'replay') {
            // Pure replay: pool every sample.
            values = [];
            for (const c of list) {
                if (c.samples.length > 0) {
                    for (const s of c.samples) values.push(s);
                } else {
                    values.push(c.fightMean);
                }
            }
        } else {
            // fightAvg or mixed: per-fight values.
            values = list.map(c => c.fightMean);
        }

        if (values.length === 0) continue;

        const sorted = [...values].sort((a, b) => a - b);
        const avg = values.reduce((s, v) => s + v, 0) / values.length;

        rows.push({
            account,
            profession,
            professionList,
            fightCount: fightIds.size,
            sampleCount: values.length,
            avg: Math.round(avg),
            median: Math.round(median(sorted)),
            p95: Math.round(nearestRankP95(sorted)),
            source: sourceLabel,
            isCommander,
        });
    }

    return { rows, commanderCount };
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeDistanceToTag.test.ts`
Expected: ALL tests PASS.

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/computeDistanceToTag.ts
git commit -m "feat: implement finalizeDistanceToTag with hybrid aggregation"
```

---

## Task 6: Wire computeDistanceToTag into IncrementalAggregator

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts`

- [ ] **Step 1: Add stored-contribution type and accumulator field**

Find the existing `interface StoredTagDistanceDeaths { ... }` (around line 282) and add directly below it:

```typescript
// Stored per-valid-log contributions from ingestLogDistanceToTag
interface StoredDistanceToTagContrib {
    timestamp: number;
    contributions: any; // DistanceContribution[]
}
```

In the imports near the top of the file, add:

```typescript
import { ingestLogDistanceToTag, finalizeDistanceToTag, type DistanceToTagResult } from './computeDistanceToTag';
```

- [ ] **Step 2: Add the accumulator field**

Find the line `private tagDistanceDeathsResults: StoredTagDistanceDeaths[] = [];` (around line 506) and add directly below it:

```typescript
    private distanceToTagContribs: StoredDistanceToTagContrib[] = [];
```

- [ ] **Step 3: Ingest in `ingestLog`**

Find the existing block that begins `// Tag distance deaths` (around line 681) and immediately after the `this.tagDistanceDeathsResults.push(...)` block, add:

```typescript
        // Distance to tag (per-player aggregation)
        this.distanceToTagContribs.push({
            timestamp,
            contributions: ingestLogDistanceToTag(log, idx),
        });
```

- [ ] **Step 4: Finalize on `finalize()`**

Find the existing line `const tagDistanceDeaths = this.tagDistanceDeathsResults.map(stored => stored.result);` (around line 877) and immediately after it, add:

```typescript
        // Distance to tag — finalize from all collected contributions
        const distanceToTag: DistanceToTagResult = finalizeDistanceToTag(
            this.distanceToTagContribs.flatMap(s => s.contributions || [])
        );
```

- [ ] **Step 5: Expose on the returned `stats`**

Find the returned `stats` object literal (around line 1445 where `tagDistanceDeaths,` appears) and add directly after that line:

```typescript
            distanceToTag,
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. If type errors arise about `DistanceToTagResult` not being a known field of stats, that's expected — Task 7 fixes the type.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts
git commit -m "feat: precompute distanceToTag in IncrementalAggregator"
```

---

## Task 7: Surface distanceToTag on the stats payload type

**Files:**
- Modify: `src/renderer/stats/statsTypes.ts`

- [ ] **Step 1: Locate the stats result type**

Run: `npx grep -n "tagDistanceDeaths" src/renderer/stats/statsTypes.ts`

If `tagDistanceDeaths` is declared on a type/interface in this file, add a sibling `distanceToTag?: DistanceToTagResult` field. If `statsTypes.ts` does not declare it, run `npx grep -rn "tagDistanceDeaths\??:" src/renderer src/shared` to find the correct type and add it there.

Add the import at the top of the chosen file:

```typescript
import type { DistanceToTagResult } from './computeDistanceToTag';
```

(Adjust the relative path if not in `src/renderer/stats/`.)

Add the field next to `tagDistanceDeaths`:

```typescript
    distanceToTag?: DistanceToTagResult;
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/statsTypes.ts
git commit -m "feat: add distanceToTag to stats payload type"
```

---

## Task 8: Section component — failing render test

**Files:**
- Create: `src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx`

- [ ] **Step 1: Look at the existing peer test as a pattern reference**

Read: `src/renderer/stats/sections/__tests__/PlayerComparisonSection.test.tsx` for the `useStatsSharedContext` mock approach. Mirror the same setup style in the new test.

- [ ] **Step 2: Write the failing test**

Create `src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SquadDistanceToTagSection } from '../SquadDistanceToTagSection';
import type { DistanceToTagResult } from '../../computeDistanceToTag';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        formatWithCommas: (n: number, d: number) => Number(n).toFixed(d),
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
    }),
}));

const result = (rows: DistanceToTagResult['rows']): DistanceToTagResult => ({ rows, commanderCount: 1 });

describe('SquadDistanceToTagSection', () => {
    it('renders empty state when no rows', () => {
        render(<SquadDistanceToTagSection result={result([])} />);
        expect(screen.getByText(/no distance data/i)).toBeInTheDocument();
    });

    it('renders one row per player with avg/median/p95', () => {
        render(<SquadDistanceToTagSection result={result([
            {
                account: 'Player.1',
                profession: 'Guardian',
                professionList: ['Guardian'],
                fightCount: 5,
                sampleCount: 5,
                avg: 250,
                median: 200,
                p95: 600,
                source: 'fightAvg',
                isCommander: false,
            },
            {
                account: 'Player.2',
                profession: 'Necromancer',
                professionList: ['Necromancer'],
                fightCount: 3,
                sampleCount: 3000,
                avg: 100,
                median: 90,
                p95: 350,
                source: 'replay',
                isCommander: false,
            },
        ])} />);
        expect(screen.getByText('Player.1')).toBeInTheDocument();
        expect(screen.getByText('Player.2')).toBeInTheDocument();
        expect(screen.getByText('250')).toBeInTheDocument();
        expect(screen.getByText('600')).toBeInTheDocument();
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx`
Expected: FAIL — "Cannot find module '../SquadDistanceToTagSection'".

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx
git commit -m "test: add failing render tests for SquadDistanceToTagSection"
```

---

## Task 9: Implement SquadDistanceToTagSection

**Files:**
- Create: `src/renderer/stats/sections/SquadDistanceToTagSection.tsx`

- [ ] **Step 1: Implement the component**

Create `src/renderer/stats/sections/SquadDistanceToTagSection.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor, getProfessionAbbrev } from '../../../shared/professionUtils';
import type { DistanceToTagResult, DistanceToTagRow } from '../computeDistanceToTag';

type Props = {
    result: DistanceToTagResult;
};

type SortKey = 'account' | 'fightCount' | 'sampleCount' | 'avg' | 'median' | 'p95';
type SortDir = 'asc' | 'desc';

export const SquadDistanceToTagSection = ({ result }: Props) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'squad-distance-to-tag';
    const isExpanded = expandedSection === sectionId;

    const [sortKey, setSortKey] = useState<SortKey>('avg');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [filterEnabled, setFilterEnabled] = useState(false);
    const [minFights, setMinFights] = useState(3);

    const rows = result?.rows ?? [];

    const visibleRows = useMemo(() => {
        const filtered = filterEnabled ? rows.filter(r => r.fightCount >= minFights) : rows;
        const cmp = (a: DistanceToTagRow, b: DistanceToTagRow) => {
            let av: string | number;
            let bv: string | number;
            if (sortKey === 'account') { av = a.account; bv = b.account; }
            else { av = a[sortKey]; bv = b[sortKey]; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        };
        return [...filtered].sort(cmp);
    }, [rows, sortKey, sortDir, filterEnabled, minFights]);

    const hiddenCount = rows.length - visibleRows.length;

    const onSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'account' ? 'asc' : 'desc');
        }
    };

    const sortIcon = (key: SortKey) =>
        key !== sortKey ? null : sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline-block" /> : <ArrowDown className="w-3 h-3 inline-block" />;

    const sourceBadge = (source: DistanceToTagRow['source']) => {
        const label = source === 'replay' ? 'replay' : source === 'fightAvg' ? 'avg' : 'mixed';
        const tip = source === 'replay'
            ? 'Aggregated from per-tick replay samples.'
            : source === 'fightAvg'
                ? 'Aggregated from per-fight averages (replay data not available).'
                : 'Some fights had replay samples, others did not. Aggregated per-fight to avoid skew.';
        return (
            <span
                title={tip}
                className="inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide"
                style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >{label}</span>
        );
    };

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Distance to Tag</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Distance to Tag' : 'Expand Distance to Tag'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No distance data for the loaded fights.
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-3 mb-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterEnabled}
                                onChange={e => setFilterEnabled(e.target.checked)}
                            />
                            <span>Hide players under</span>
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={minFights}
                            disabled={!filterEnabled}
                            onChange={e => setMinFights(Math.max(1, Number(e.target.value) || 1))}
                            className="w-12 px-1 py-0.5 rounded text-center"
                            style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <span>fights</span>
                        {filterEnabled && hiddenCount > 0 && <span>· {hiddenCount} hidden</span>}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
                            <thead>
                                <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th className="text-left px-2 py-1 cursor-pointer" onClick={() => onSort('account')}>Player {sortIcon('account')}</th>
                                    <th className="text-left px-2 py-1">Prof</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('fightCount')}># Fights {sortIcon('fightCount')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('sampleCount')}>Samples {sortIcon('sampleCount')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('avg')}>Avg {sortIcon('avg')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('median')}>Median {sortIcon('median')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('p95')}>p95 {sortIcon('p95')}</th>
                                    <th className="text-left px-2 py-1">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(r => (
                                    <tr key={r.account} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-2 py-1">
                                            {r.account}
                                            {r.isCommander && <span title="Commander" className="ml-1" style={{ color: 'var(--status-warning)' }}>★</span>}
                                        </td>
                                        <td className="px-2 py-1" style={{ color: getProfessionColor(r.profession) }}>{getProfessionAbbrev(r.profession)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{r.fightCount}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.sampleCount, 0)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.avg, 0)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.median, 0)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.p95, 0)}</td>
                                        <td className="px-2 py-1">{sourceBadge(r.source)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Run the section test**

Run: `npx vitest run src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/SquadDistanceToTagSection.tsx
git commit -m "feat: add SquadDistanceToTagSection table component"
```

---

## Task 10: Wire the section into StatsView

**Files:**
- Modify: `src/renderer/StatsView.tsx`

- [ ] **Step 1: Add the import**

Find the line `import { SquadTagDistanceDeathsSection } from './stats/sections/SquadTagDistanceDeathsSection';` (around line 70) and add directly below it:

```typescript
import { SquadDistanceToTagSection } from './stats/sections/SquadDistanceToTagSection';
import type { DistanceToTagResult } from './stats/computeDistanceToTag';
```

- [ ] **Step 2: Read the precomputed result**

Find the `tagDistanceDeathsData` `useMemo` block (around line 711). Directly after that block, add:

```typescript
    const distanceToTagResult: DistanceToTagResult = useMemo(() => {
        const v = (safeStats as any)?.distanceToTag;
        return v && Array.isArray(v.rows) ? v : { rows: [], commanderCount: 0 };
    }, [safeStats]);
```

- [ ] **Step 3: Render in the legacy squad block**

Find the `renderSectionWrap(<SquadTagDistanceDeathsSection ... />)` block (around line 4643). Directly after the closing `)}` of that wrap, add:

```typescript
                            {renderSectionWrap(<SquadDistanceToTagSection
                                result={distanceToTagResult}
                            />)}
```

- [ ] **Step 4: Render in the grouped squad-stats block**

Find the `{ id: 'squad-tag-distance-deaths', element: <SquadTagDistanceDeathsSection ... /> }` entry (around line 4736). Directly after that entry (still inside the same array), add:

```typescript
                            { id: 'squad-distance-to-tag', element: <SquadDistanceToTagSection
                                result={distanceToTagResult}
                            /> },
```

- [ ] **Step 5: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 6: Run the unit test suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: render SquadDistanceToTagSection in stats view"
```

---

## Task 11: Manual smoke + final verification

- [ ] **Step 1: Manual smoke (dev app)**

Run: `npm run dev`

Load a dataset that includes at least one fight with replay data (combat replay parsed) and one without. Navigate to the Squad Stats area and confirm:

- The "Distance to Tag" section renders next to "Tag Distance Deaths".
- Players appear with avg/median/p95 columns populated.
- Source badges show `replay`, `avg`, or `mixed` as expected.
- The "Hide players under N fights" toggle filters rows; the hidden count appears.
- All numeric columns sort ascending/descending on click.
- With ≤2 commanders in the dataset, no commander appears in the table.

If the UI cannot be tested in this environment, state that explicitly rather than claiming success.

- [ ] **Step 2: Run the broader test/audit suite**

Run: `npm run test:unit && npm run validate`
Expected: PASS.

- [ ] **Step 3: Final review commit (if any cleanup was needed)**

If any cleanup edits were made during smoke testing, commit them with a clear message. Otherwise, no further commit is required.
