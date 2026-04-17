# Map Replay — Plan 3: Squad-Centric Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flesh out the `Replay` section with its full set of squad-centric overlays — heatmap, squad centroid + spread ring, tag range rings, per-party convex hulls, squad health strip, all-parties panel, spotlight dimming, rally rings, target-focus lines, damage pulses, fight phase bands — all gated behind a single Layers popover. State persists via `statsStore`.

**Architecture:** Derived squad data (centroid / spread / hulls / phases) is computed once per fight through a new `useSquadDerived` hook and cached in-memory keyed by `fightId`. Heatmap rasters are computed once per `(fightId, mode)` by `useHeatmapData`. Additional per-fight event streams (damage spikes, rally events, target-focus samples) are pre-computed at aggregation time and ride on `ReplayFightPayload` — same pipeline Plan 2 established, so the web report gets them for free. `ReplayView` wires new overlay layers + the LayersPopover into the single SVG canvas; layer visibility reads from new `replayLayers` state in `statsStore`.

**Tech Stack:** React 18 · SVG (primary) + HTML `<canvas>` rasterized into `<foreignObject>` for the heatmap · zustand (store) · lucide-react (icons). No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-04-15-map-replay-section-design.md` — §7.1 layers 3/5/7/8 (heatmap, party hulls, centroid/spread, tag rings), §7.1 item 9 (rally rings, target-focus lines, damage pulses), §7.2 (squad health strip), §7.4 (Layers popover), §7.5 (all-parties panel), §7.6 (spotlight), §7.7 (fight phase bands), §9 (store — `replayLayers` + `replaySpotlightParty`), §10 (performance).

**Prerequisite:** Plans 1 and 2 merged. This plan assumes:
- `src/shared/movementData.ts`, `wvwLandmarks.ts`, `wvwTiles.ts`, `mapUtils.ts` exist.
- `ReplayFightPayload` ships per fight under `result.replayFights` (Plan 2 Task 3).
- `ReplayView`, `FightPicker`, `PartyPanel`, `SyncedTimeline`, `EventOverlay`, `FullscreenPortal` exist in `src/renderer/stats/map/`.
- `statsStore` already has `selectedReplayFightId`, `replayPlayhead`, `replayViewport`, `replaySelectedParty`.

---

## File Structure

### New renderer files

```
src/renderer/stats/map/
    HeatmapLayer.tsx           # canvas-in-foreignObject heatmap renderer
    SquadOverlay.tsx           # centroid + spread ring, tag range rings, per-party hulls
    SquadHealthStrip.tsx       # ~50 tiny HP bars across the top edge
    LayersPopover.tsx          # gear-icon popover containing all toggle groups
    squadDerivedTypes.ts       # shared types for useSquadDerived output
    hooks/
        useSquadDerived.ts     # centroid/spread/hulls/phases, memoized per fightId
        useHeatmapData.ts      # 128×128 histogram buffers per (fightId, mode)
```

### Modified files

- `src/renderer/stats/statsStore.ts` — add `replayLayers`, `replaySpotlightParty`, setters, and a `resetReplayLayers()` for fresh-fight cleanup.
- `src/renderer/stats/map/replayTypes.ts` — add `DamageSpikeEvent`, `RallyEvent`, `TargetFocusSample`, extend `ReplayFightPayload`.
- `src/renderer/stats/computeStatsAggregation.ts` — extend `buildReplayFightPayload` to populate the new event arrays.
- `src/renderer/stats/map/EventOverlay.tsx` — add damage-pulse, rally-ring, target-focus-line rendering, gated by `replayLayers`.
- `src/renderer/stats/map/SyncedTimeline.tsx` — render fight-phase bands with clickable chips when `replayLayers.phases`.
- `src/renderer/stats/map/PartyPanel.tsx` — switch to all-parties 5-mini-panel variant when `replayLayers.allPartiesPanel`; clicking a party number sets spotlight.
- `src/renderer/stats/map/ReplayView.tsx` — mount `HeatmapLayer`, `SquadOverlay`, `SquadHealthStrip`, `EventOverlay` extensions; render a gear icon that opens `LayersPopover`; apply spotlight-dimming opacity to non-spotlight parties; expose commander centroid + tag rings.

### New tests

- `src/renderer/stats/map/hooks/__tests__/useSquadDerived.test.ts` — centroid, spread, per-party hull shape, phase detection output.
- `src/renderer/stats/map/hooks/__tests__/useHeatmapData.test.ts` — bucket counts, cache hit, mode switch.
- `src/renderer/stats/map/__tests__/HeatmapLayer.test.tsx` — renders canvas when mode != off, nothing when off.
- `src/renderer/stats/map/__tests__/SquadOverlay.test.tsx` — centroid circle, hull polygons, tag rings.
- `src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx` — one bar per ally, color by status.
- `src/renderer/stats/map/__tests__/LayersPopover.test.tsx` — toggles update `replayLayers`; radio flips heatmap mode.
- `src/renderer/stats/map/__tests__/EventOverlay.test.tsx` — rally rings appear after a rally event; target-focus lines drawn when enabled.
- `src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx` — phase chip renders, click scrubs to phase start.
- `src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx` — 5 mini-panels rendered, clicking sets spotlight.
- `tests/e2e/electron/replay.layers.spec.ts` — Playwright: toggle each group, confirm DOM presence/absence.

---

## Task 1: Extend `statsStore` with `replayLayers` + `replaySpotlightParty`

**Files:**
- Modify: `src/renderer/stats/statsStore.ts`
- Create: `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../../statsStore';

describe('statsStore — replay layers + spotlight', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('starts with every toggle off and heatmap off', () => {
        const l = useStatsStore.getState().replayLayers;
        expect(l.centroidSpread).toBe(false);
        expect(l.tagRangeRings).toBe(false);
        expect(l.allPartiesPanel).toBe(false);
        expect(l.squadHealthStrip).toBe(false);
        expect(l.partyHulls).toBe(false);
        expect(l.phases).toBe(false);
        expect(l.rallyRings).toBe(false);
        expect(l.targetFocusLines).toBe(false);
        expect(l.damagePulses).toBe(false);
        expect(l.heatmap).toBe('off');
    });

    it('starts with no spotlight party', () => {
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('setReplayLayer updates a single boolean toggle', () => {
        useStatsStore.getState().setReplayLayer('centroidSpread', true);
        expect(useStatsStore.getState().replayLayers.centroidSpread).toBe(true);
    });

    it('setReplayHeatmapMode switches heatmap radio', () => {
        useStatsStore.getState().setReplayHeatmapMode('deaths');
        expect(useStatsStore.getState().replayLayers.heatmap).toBe('deaths');
        useStatsStore.getState().setReplayHeatmapMode('off');
        expect(useStatsStore.getState().replayLayers.heatmap).toBe('off');
    });

    it('setReplaySpotlightParty clamps to [1, 5] or null', () => {
        useStatsStore.getState().setReplaySpotlightParty(3);
        expect(useStatsStore.getState().replaySpotlightParty).toBe(3);
        useStatsStore.getState().setReplaySpotlightParty(null);
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
        useStatsStore.getState().setReplaySpotlightParty(99);
        expect(useStatsStore.getState().replaySpotlightParty).toBe(5);
        useStatsStore.getState().setReplaySpotlightParty(0);
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('resetReplayLayers returns all toggles to default + clears spotlight', () => {
        useStatsStore.getState().setReplayLayer('centroidSpread', true);
        useStatsStore.getState().setReplayLayer('tagRangeRings', true);
        useStatsStore.getState().setReplayHeatmapMode('time');
        useStatsStore.getState().setReplaySpotlightParty(2);
        useStatsStore.getState().resetReplayLayers();
        const l = useStatsStore.getState().replayLayers;
        expect(l.centroidSpread).toBe(false);
        expect(l.tagRangeRings).toBe(false);
        expect(l.heatmap).toBe('off');
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`
Expected: FAIL — `replayLayers` / `replaySpotlightParty` / setters don't exist.

- [ ] **Step 3: Extend `statsStore.ts`**

Edit `src/renderer/stats/statsStore.ts`.

Add near the `StatsStoreState` type (keep alongside the Plan-2 replay fields):

```ts
    replayLayers: {
        centroidSpread: boolean;
        tagRangeRings: boolean;
        allPartiesPanel: boolean;
        squadHealthStrip: boolean;
        partyHulls: boolean;
        phases: boolean;
        rallyRings: boolean;
        targetFocusLines: boolean;
        damagePulses: boolean;
        heatmap: 'off' | 'deaths' | 'time' | 'damage-taken';
    };
    replaySpotlightParty: number | null;

    setReplayLayer: (key: keyof Omit<StatsStoreState['replayLayers'], 'heatmap'>, value: boolean) => void;
    setReplayHeatmapMode: (mode: StatsStoreState['replayLayers']['heatmap']) => void;
    setReplaySpotlightParty: (party: number | null) => void;
    resetReplayLayers: () => void;
```

Add to `initialState`:

```ts
    replayLayers: {
        centroidSpread: false,
        tagRangeRings: false,
        allPartiesPanel: false,
        squadHealthStrip: false,
        partyHulls: false,
        phases: false,
        rallyRings: false,
        targetFocusLines: false,
        damagePulses: false,
        heatmap: 'off',
    },
    replaySpotlightParty: null,
```

Add the setters inside `create<>()`:

```ts
    setReplayLayer: (key, value) => set((state) => ({
        replayLayers: { ...state.replayLayers, [key]: value },
    })),
    setReplayHeatmapMode: (mode) => set((state) => ({
        replayLayers: { ...state.replayLayers, heatmap: mode },
    })),
    setReplaySpotlightParty: (party) => set({
        replaySpotlightParty: party === null || !Number.isFinite(party)
            ? null
            : party <= 0
                ? null
                : Math.min(5, Math.floor(party)),
    }),
    resetReplayLayers: () => set((state) => ({
        replayLayers: {
            centroidSpread: false, tagRangeRings: false, allPartiesPanel: false,
            squadHealthStrip: false, partyHulls: false, phases: false,
            rallyRings: false, targetFocusLines: false, damagePulses: false,
            heatmap: 'off',
        },
        replaySpotlightParty: null,
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/map/__tests__/statsStoreLayers.test.ts
git commit -m "feat(stats): add replayLayers + spotlight state to statsStore"
```

---

## Task 2: Extend `ReplayFightPayload` with event arrays

**Files:**
- Modify: `src/renderer/stats/map/replayTypes.ts`
- Modify: `src/renderer/stats/computeStatsAggregation.ts`
- Create: `src/renderer/stats/map/__tests__/replayPayloadEvents.test.ts`

Three new per-fight arrays:
- `damageSpikeEvents` — computed from each ally's `damage1S` series (a spike is a value ≥ 2× the rolling median of the previous 10 samples, and ≥ 20k damage in that second to filter out noise).
- `rallyEvents` — derived from `downRanges[i][1]` (the end-of-down moment) where no matching `deadRanges` entry started within 250 ms of that down start (i.e. the member rallied rather than died).
- `targetFocusSamples` — sampled every 1 s, for each ally: the enemy target that received the most damage from that ally in the previous 2 s. Needs `player.targetDamage1S` from EI, shape `number[][][]` (target × second → cumulative damage).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/replayPayloadEvents.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildReplayFightPayload } from '../../computeStatsAggregation';

function baseFight(extra: any = {}) {
    return {
        id: 'fight-events', filePath: '/tmp/log.zevtc', uploadTime: 1_700_000_000,
        details: {
            fightName: 'Green Borderlands',
            durationMS: 10_000,
            combatReplayMetaData: { pollingRate: 1000, inchToPixel: 0.01, sizes: [523, 750], maps: [] },
            players: [
                {
                    name: 'Alice', account: 'Alice.0001', profession: 'Guardian', elite_spec: 62,
                    group: 1, hasCommanderTag: true, notInSquad: false, isFake: false,
                    combatReplayData: {
                        positions: [[100, 100], [105, 100], [110, 100], [115, 100], [120, 100], [125, 100], [130, 100], [135, 100], [140, 100], [145, 100]],
                        dead: [], down: [[3000, 5000]], // downed for 2s then revived (no matching dead)
                    },
                    damage1S: [[0, 5_000, 10_000, 15_000, 20_000, 25_000, 75_000, 80_000, 85_000, 90_000, 95_000]],
                    // rolling-median jump at t=6 from ~5k/s to 50k/s → spike at t=6.
                    targetDamage1S: [[
                        [0, 1_000, 2_000, 3_000, 4_000, 5_000, 55_000, 60_000, 65_000, 70_000, 75_000], // target 0 takes a big spike at t=6
                        [0, 4_000, 8_000, 12_000, 16_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000], // target 1 linear then flat
                    ]],
                },
            ],
            targets: [
                { name: 'foo pl-0', isFake: false, enemyPlayer: true, combatReplayData: { positions: [[200, 200]], dead: [], down: [] } },
                { name: 'bar pl-1', isFake: false, enemyPlayer: true, combatReplayData: { positions: [[210, 210]], dead: [], down: [] } },
            ],
            skillMap: {}, buffMap: {},
        },
        ...extra,
    };
}

describe('buildReplayFightPayload — event arrays', () => {
    it('emits a rally event at the end of a down that does not end in death', () => {
        const payload = buildReplayFightPayload(baseFight(), 0)!;
        expect(payload.rallyEvents).toHaveLength(1);
        expect(payload.rallyEvents[0].timeMs).toBe(5000);
        expect(payload.rallyEvents[0].memberKey).toBe('Alice.0001');
    });

    it('does not emit a rally event when the down ends in death', () => {
        const fight = baseFight();
        fight.details.players[0].combatReplayData.dead = [[5000, 10_000]];
        const payload = buildReplayFightPayload(fight, 0)!;
        expect(payload.rallyEvents).toHaveLength(0);
    });

    it('detects damage spikes on the 1s series', () => {
        const payload = buildReplayFightPayload(baseFight(), 0)!;
        expect(payload.damageSpikeEvents.length).toBeGreaterThan(0);
        const hit = payload.damageSpikeEvents.find(e => e.memberKey === 'Alice.0001');
        expect(hit).toBeTruthy();
        expect(hit!.timeMs).toBeGreaterThanOrEqual(5_000);
        expect(hit!.timeMs).toBeLessThanOrEqual(7_000);
    });

    it('computes target-focus samples pointing at the most-damaged enemy in the last 2s', () => {
        const payload = buildReplayFightPayload(baseFight(), 0)!;
        expect(payload.targetFocusSamples.length).toBeGreaterThan(0);
        const lateSamples = payload.targetFocusSamples.filter(s => s.timeMs >= 7000);
        expect(lateSamples.length).toBeGreaterThan(0);
        for (const s of lateSamples) {
            expect(s.memberKey).toBe('Alice.0001');
            expect(s.targetIndex).toBe(0); // target 0 dominates the trailing window
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/replayPayloadEvents.test.ts`
Expected: FAIL — fields not on payload.

- [ ] **Step 3: Extend `replayTypes.ts`**

Open `src/renderer/stats/map/replayTypes.ts` and add these types + extend `ReplayFightPayload`:

```ts
export interface DamageSpikeEvent {
    timeMs: number;
    memberKey: string;
    magnitude: number; // damage dealt in that 1s bucket
}

export interface RallyEvent {
    timeMs: number;
    memberKey: string;
}

export interface TargetFocusSample {
    timeMs: number;
    memberKey: string;
    targetIndex: number;
}

export interface ReplayFightPayload {
    // ...existing fields (keep them verbatim)
    damageSpikeEvents: DamageSpikeEvent[];
    rallyEvents: RallyEvent[];
    targetFocusSamples: TargetFocusSample[];
}
```

(Merge with the existing declaration — don't duplicate fields.)

- [ ] **Step 4: Extend `computeStatsAggregation.ts`**

Open `src/renderer/stats/computeStatsAggregation.ts`. Add these helpers above `buildReplayFightPayload`:

```ts
function memberKey(p: any): string {
    return String(p?.account || p?.name || '');
}

function computeRallyEvents(details: any): RallyEvent[] {
    const events: RallyEvent[] = [];
    for (const p of details?.players ?? []) {
        if (p?.isFake || p?.notInSquad) continue;
        const downs: [number, number][] = p?.combatReplayData?.down ?? [];
        const deaths: [number, number][] = p?.combatReplayData?.dead ?? [];
        for (const [downStart, downEnd] of downs) {
            if (downEnd <= 0) continue;
            const diedFromThisDown = deaths.some(([dStart]) => Math.abs(dStart - downStart) <= 250 || (dStart >= downStart && dStart <= downEnd));
            if (!diedFromThisDown) {
                events.push({ timeMs: downEnd, memberKey: memberKey(p) });
            }
        }
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}

function rollingMedian(arr: number[], windowEnd: number, windowSize: number): number {
    const start = Math.max(0, windowEnd - windowSize);
    const slice = arr.slice(start, windowEnd);
    if (!slice.length) return 0;
    const sorted = [...slice].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeDamageSpikeEvents(details: any): DamageSpikeEvent[] {
    const events: DamageSpikeEvent[] = [];
    for (const p of details?.players ?? []) {
        if (p?.isFake || p?.notInSquad) continue;
        const cumulative: number[] = p?.damage1S?.[0] ?? [];
        if (cumulative.length < 2) continue;
        const perSecond: number[] = [];
        for (let i = 1; i < cumulative.length; i++) {
            perSecond.push(Math.max(0, cumulative[i] - cumulative[i - 1]));
        }
        const key = memberKey(p);
        for (let i = 0; i < perSecond.length; i++) {
            const magnitude = perSecond[i];
            if (magnitude < 20_000) continue;
            const median = rollingMedian(perSecond, i, 10);
            if (median > 0 && magnitude >= median * 2) {
                events.push({ timeMs: (i + 1) * 1000, memberKey: key, magnitude });
            }
        }
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}

function computeTargetFocusSamples(details: any): TargetFocusSample[] {
    const samples: TargetFocusSample[] = [];
    const players = details?.players ?? [];
    const numSeconds = Math.max(
        0,
        ...players.map((p: any) => {
            const series: number[][] | undefined = p?.targetDamage1S?.[0];
            if (!series?.length) return 0;
            return Math.max(...series.map(s => s?.length ?? 0));
        }),
    );
    if (numSeconds === 0) return samples;

    const WINDOW_S = 2;
    for (const p of players) {
        if (p?.isFake || p?.notInSquad) continue;
        const series: number[][] | undefined = p?.targetDamage1S?.[0];
        if (!series?.length) continue;
        const key = memberKey(p);
        for (let t = WINDOW_S; t < numSeconds; t++) {
            let bestTarget = -1;
            let bestDamage = 0;
            for (let ti = 0; ti < series.length; ti++) {
                const arr = series[ti];
                if (!arr || arr.length <= t) continue;
                const start = Math.max(0, t - WINDOW_S);
                const delta = Math.max(0, arr[t] - (arr[start] ?? 0));
                if (delta > bestDamage) {
                    bestDamage = delta;
                    bestTarget = ti;
                }
            }
            if (bestTarget >= 0 && bestDamage > 0) {
                samples.push({ timeMs: t * 1000, memberKey: key, targetIndex: bestTarget });
            }
        }
    }
    samples.sort((a, b) => a.timeMs - b.timeMs || a.memberKey.localeCompare(b.memberKey));
    return samples;
}
```

Also import the new types at the top of the file (alongside existing replay-type imports):

```ts
import type { ReplayFightPayload, ReplayDpsSample, ReplayKillEvent,
    DamageSpikeEvent, RallyEvent, TargetFocusSample } from './map/replayTypes';
```

Inside `buildReplayFightPayload`, before the final `return { ... }`, compute the three arrays:

```ts
    const rallyEvents = computeRallyEvents(details);
    const damageSpikeEvents = computeDamageSpikeEvents(details);
    const targetFocusSamples = computeTargetFocusSamples(details);
```

Add to the returned object:

```ts
        rallyEvents,
        damageSpikeEvents,
        targetFocusSamples,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/replayPayloadEvents.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full unit sweep**

Run: `npm run test:unit`
Expected: PASS. Existing replay tests may need `damageSpikeEvents: []`, `rallyEvents: []`, `targetFocusSamples: []` added to any hand-built `ReplayFightPayload` fixtures — update them in-place.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/map/replayTypes.ts src/renderer/stats/computeStatsAggregation.ts src/renderer/stats/map/__tests__/replayPayloadEvents.test.ts
git commit -m "feat(stats): add damage-spike, rally, and target-focus events to ReplayFightPayload"
```

---

## Task 3: `squadDerivedTypes.ts` — shared types for squad-derived data

**Files:**
- Create: `src/renderer/stats/map/squadDerivedTypes.ts`

- [ ] **Step 1: Write the file**

Create `src/renderer/stats/map/squadDerivedTypes.ts`:

```ts
export interface SquadSample {
    timeMs: number;
    centroid: [number, number];
    spread: number;            // stddev of distances from centroid, in EI pixel units
    partyHulls: Record<number, [number, number][]>; // party → convex hull polygon
    speed: number;             // centroid speed, pixels/ms
}

export type PhaseKind = 'opening' | 'push' | 'retreat' | 'cleanup';

export interface Phase {
    kind: PhaseKind;
    startMs: number;
    endMs: number;
}

export interface SquadDerived {
    samples: SquadSample[]; // 1-second ticks
    phases: Phase[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/map/squadDerivedTypes.ts
git commit -m "feat(replay): add squad-derived type definitions"
```

---

## Task 4: `useSquadDerived` hook — centroid / spread / hulls / phases

**Files:**
- Create: `src/renderer/stats/map/hooks/useSquadDerived.ts`
- Create: `src/renderer/stats/map/hooks/__tests__/useSquadDerived.test.ts`

Computes once per `fightId`, memoized in a module-level `Map`. Samples every 1 s:
- Centroid = mean of live squad-allies' positions at that tick.
- Spread = standard deviation of distances from centroid.
- Party hulls = Graham-scan convex hull per party (≥ 3 members with positions).
- Speed = `|centroid(t) − centroid(t−1)| / 1000`.

Phase detection heuristic: scan samples in order, classify by:
- `opening` if `t < 10s` AND no deaths yet,
- `push` if centroid speed ≥ 0.05 px/ms AND centroid moves toward dense enemy mass (approximated by nearest-enemy direction),
- `retreat` if centroid speed ≥ 0.05 px/ms AND ally-death count grew in the last 5 s,
- `cleanup` otherwise.

Merge consecutive identical-kind samples into phase ranges.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/hooks/__tests__/useSquadDerived.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSquadDerived } from '../useSquadDerived';
import type { ReplayFightPayload } from '../../replayTypes';
import type { SquadMemberMovement } from '../../../../../shared/movementData';

const mkMember = (name: string, group: number, positions: [number, number][], extra: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    name, account: name, profession: 'Guardian', eliteSpec: '', group,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions, downRanges: [], deadRanges: [], ...extra,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: {
        pollingRate: 1000, durationMs: 10_000, inchToPixel: 1,
        members: [], boonIcons: {}, skillIcons: {},
    },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    ...over,
});

describe('useSquadDerived', () => {
    it('returns centroid and spread samples at 1s tick', () => {
        const members = [
            mkMember('A', 1, Array.from({ length: 11 }, () => [100, 100] as [number, number])),
            mkMember('B', 1, Array.from({ length: 11 }, () => [110, 100] as [number, number])),
            mkMember('C', 1, Array.from({ length: 11 }, () => [100, 110] as [number, number])),
        ];
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members } });
        const { result } = renderHook(() => useSquadDerived(fight));
        expect(result.current.samples.length).toBeGreaterThan(0);
        const first = result.current.samples[0];
        expect(first.centroid[0]).toBeGreaterThan(99);
        expect(first.centroid[0]).toBeLessThan(108);
        expect(first.spread).toBeGreaterThan(0);
    });

    it('builds per-party convex hulls with ≥ 3 members', () => {
        const members = [
            mkMember('A', 1, [[0, 0], [0, 0]]),
            mkMember('B', 1, [[100, 0], [100, 0]]),
            mkMember('C', 1, [[50, 50], [50, 50]]),
            mkMember('D', 2, [[200, 200], [200, 200]]),
            mkMember('E', 2, [[210, 210], [210, 210]]),
        ];
        const fight = mkFight({ durationMs: 1000, movementData: { ...mkFight({}).movementData, durationMs: 1000, members } });
        const { result } = renderHook(() => useSquadDerived(fight));
        const hulls = result.current.samples[0].partyHulls;
        expect(hulls[1]?.length ?? 0).toBeGreaterThanOrEqual(3);
        expect(hulls[2]).toBeUndefined(); // only 2 members in party 2
    });

    it('memoizes output for the same fightId', () => {
        const members = [mkMember('A', 1, [[0, 0]])];
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members } });
        const { result, rerender } = renderHook(() => useSquadDerived(fight));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('detects at least one phase over a fight with deaths', () => {
        const members = [
            mkMember('A', 1, Array.from({ length: 11 }, (_, i) => [100 + i * 2, 100] as [number, number]),
                { deadRanges: [[5000, 10_000]] }),
            mkMember('B', 1, Array.from({ length: 11 }, (_, i) => [100, 100 + i * 2] as [number, number])),
        ];
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members } });
        const { result } = renderHook(() => useSquadDerived(fight));
        expect(result.current.phases.length).toBeGreaterThan(0);
        for (const phase of result.current.phases) {
            expect(phase.endMs).toBeGreaterThanOrEqual(phase.startMs);
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useSquadDerived.test.ts`
Expected: FAIL — hook not found.

- [ ] **Step 3: Write the hook**

Create `src/renderer/stats/map/hooks/useSquadDerived.ts`:

```ts
import { useMemo } from 'react';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';
import type { Phase, PhaseKind, SquadDerived, SquadSample } from '../squadDerivedTypes';

const TICK_MS = 1000;
const cache = new Map<string, SquadDerived>();

function sampleAt(member: SquadMemberMovement, timeMs: number, pollingRate: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.min(member.positions.length - 1, Math.floor(timeMs / pollingRate));
    return member.positions[idx];
}

function isAliveAt(member: SquadMemberMovement, timeMs: number): boolean {
    for (const [start, end] of member.deadRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return false;
    }
    return true;
}

function convexHull(points: [number, number][]): [number, number][] {
    if (points.length < 3) return [];
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: [number, number][] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}

function classifyPhase(
    sample: SquadSample,
    prevSample: SquadSample | null,
    deathsSoFar: number,
    deathsRecent: number,
    fightStartOffsetMs: number,
): PhaseKind {
    if (sample.timeMs < 10_000 && deathsSoFar === 0) return 'opening';
    const moving = sample.speed >= 0.05;
    if (moving && deathsRecent > 0) return 'retreat';
    if (moving) return 'push';
    void prevSample; void fightStartOffsetMs;
    return 'cleanup';
}

function buildDerived(fight: ReplayFightPayload): SquadDerived {
    const md = fight.movementData;
    const allies = md.members.filter(m => !m.isEnemy && m.inSquad);

    const samples: SquadSample[] = [];
    for (let t = 0; t <= fight.durationMs; t += TICK_MS) {
        const live: { member: SquadMemberMovement; pos: [number, number] }[] = [];
        for (const member of allies) {
            if (!isAliveAt(member, t)) continue;
            const pos = sampleAt(member, t, md.pollingRate);
            if (pos) live.push({ member, pos });
        }
        if (!live.length) continue;

        const cx = live.reduce((acc, { pos }) => acc + pos[0], 0) / live.length;
        const cy = live.reduce((acc, { pos }) => acc + pos[1], 0) / live.length;

        let sumSq = 0;
        for (const { pos } of live) {
            const dx = pos[0] - cx;
            const dy = pos[1] - cy;
            sumSq += dx * dx + dy * dy;
        }
        const spread = Math.sqrt(sumSq / live.length);

        const byParty: Record<number, [number, number][]> = {};
        for (const { member, pos } of live) {
            if (!member.group) continue;
            (byParty[member.group] ??= []).push(pos);
        }
        const partyHulls: Record<number, [number, number][]> = {};
        for (const [groupStr, pts] of Object.entries(byParty)) {
            const hull = convexHull(pts);
            if (hull.length >= 3) partyHulls[Number(groupStr)] = hull;
        }

        const prev = samples[samples.length - 1];
        const speed = prev
            ? Math.hypot(cx - prev.centroid[0], cy - prev.centroid[1]) / TICK_MS
            : 0;

        samples.push({ timeMs: t, centroid: [cx, cy], spread, partyHulls, speed });
    }

    const phases: Phase[] = [];
    if (samples.length) {
        let cumDeaths = 0;
        const deathTimes = allies.flatMap(m => m.deadRanges.map(([start]) => start)).sort((a, b) => a - b);
        let current: Phase | null = null;

        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            cumDeaths = deathTimes.filter(d => d <= s.timeMs).length;
            const deathsRecent = deathTimes.filter(d => d > s.timeMs - 5000 && d <= s.timeMs).length;
            const kind = classifyPhase(s, samples[i - 1] ?? null, cumDeaths, deathsRecent, 0);
            if (current && current.kind === kind) {
                current.endMs = s.timeMs;
            } else {
                if (current) phases.push(current);
                current = { kind, startMs: s.timeMs, endMs: s.timeMs };
            }
        }
        if (current) {
            current.endMs = fight.durationMs;
            phases.push(current);
        }
    }

    return { samples, phases };
}

export function useSquadDerived(fight: ReplayFightPayload | null): SquadDerived {
    return useMemo(() => {
        if (!fight) return { samples: [], phases: [] };
        const cached = cache.get(fight.fightId);
        if (cached) return cached;
        const derived = buildDerived(fight);
        cache.set(fight.fightId, derived);
        return derived;
    }, [fight]);
}

export function __clearSquadDerivedCache() {
    cache.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useSquadDerived.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/hooks/useSquadDerived.ts src/renderer/stats/map/hooks/__tests__/useSquadDerived.test.ts
git commit -m "feat(replay): add useSquadDerived for centroid/spread/hulls/phases"
```

---

## Task 5: `useHeatmapData` hook — 128×128 histogram per mode

**Files:**
- Create: `src/renderer/stats/map/hooks/useHeatmapData.ts`
- Create: `src/renderer/stats/map/hooks/__tests__/useHeatmapData.test.ts`

Three modes:
- `deaths` — 1 per death at that member's position when `deadRanges[i][0]` occurs.
- `time` — 1 per position sample per ally (weight by pollingRate/1000 to keep magnitudes stable across fights).
- `damage-taken` — for each ally sample, add `max(0, prevHp% − currentHp%)` to the cell.

Buffers are `Float32Array(128 * 128)` normalized to [0, 1] after accumulation. Cached by `${fightId}|${mode}`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/hooks/__tests__/useHeatmapData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeatmapData, __clearHeatmapCache } from '../useHeatmapData';
import type { ReplayFightPayload } from '../../replayTypes';
import type { SquadMemberMovement } from '../../../../../shared/movementData';

const mkMember = (over: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: '', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [], downRanges: [], deadRanges: [],
    ...over,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'hf1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 10_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    ...over,
});

describe('useHeatmapData', () => {
    beforeEach(() => __clearHeatmapCache());

    it('returns null for off mode', () => {
        const fight = mkFight({});
        const { result } = renderHook(() => useHeatmapData(fight, 'off'));
        expect(result.current).toBeNull();
    });

    it('returns a Float32Array buffer sized 128×128 for deaths mode', () => {
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({
                    positions: [[200, 200], [200, 200]],
                    deadRanges: [[500, 1000]],
                })],
            },
        });
        const { result } = renderHook(() => useHeatmapData(fight, 'deaths'));
        expect(result.current).not.toBeNull();
        expect(result.current!.buffer.length).toBe(128 * 128);
        expect(result.current!.size).toEqual([128, 128]);
        expect(result.current!.max).toBeGreaterThan(0);
    });

    it('memoizes per (fightId, mode)', () => {
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({ positions: [[300, 300]] })],
            },
        });
        const { result, rerender } = renderHook(() => useHeatmapData(fight, 'time'));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('damage-taken mode accumulates from HP drops', () => {
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({
                    positions: [[100, 100], [100, 100]],
                    healthPercents: [[0, 100], [1000, 40]],
                })],
            },
        });
        const { result } = renderHook(() => useHeatmapData(fight, 'damage-taken'));
        expect(result.current!.max).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useHeatmapData.test.ts`
Expected: FAIL — hook not found.

- [ ] **Step 3: Write the hook**

Create `src/renderer/stats/map/hooks/useHeatmapData.ts`:

```ts
import { useMemo } from 'react';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const GRID = 128;

export interface HeatmapRaster {
    buffer: Float32Array;
    size: [number, number];
    max: number;
}

type Mode = 'off' | 'deaths' | 'time' | 'damage-taken';

const cache = new Map<string, HeatmapRaster>();

function hpAt(member: SquadMemberMovement, timeMs: number): number {
    const series = member.healthPercents;
    if (!series?.length) return 100;
    let hp = 100;
    for (const [t, v] of series) {
        if (t > timeMs) break;
        hp = v;
    }
    return hp;
}

function bucket(x: number, y: number, width: number, height: number): number | null {
    if (width <= 0 || height <= 0) return null;
    const bx = Math.floor((x / width) * GRID);
    const by = Math.floor((y / height) * GRID);
    if (bx < 0 || bx >= GRID || by < 0 || by >= GRID) return null;
    return by * GRID + bx;
}

function buildRaster(fight: ReplayFightPayload, mode: Exclude<Mode, 'off'>): HeatmapRaster {
    const buffer = new Float32Array(GRID * GRID);
    const width = fight.mapSize?.[0] ?? 600;
    const height = fight.mapSize?.[1] ?? 600;
    const { pollingRate } = fight.movementData;
    const allies = fight.movementData.members.filter(m => !m.isEnemy && m.inSquad);

    if (mode === 'deaths') {
        for (const m of allies) {
            for (const [deadAt] of m.deadRanges) {
                const idx = Math.min(m.positions.length - 1, Math.floor(deadAt / pollingRate));
                const pos = m.positions[idx];
                if (!pos) continue;
                const b = bucket(pos[0], pos[1], width, height);
                if (b !== null) buffer[b] += 1;
            }
        }
    } else if (mode === 'time') {
        const weight = pollingRate / 1000;
        for (const m of allies) {
            for (const pos of m.positions) {
                const b = bucket(pos[0], pos[1], width, height);
                if (b !== null) buffer[b] += weight;
            }
        }
    } else {
        // damage-taken: accumulate HP drops between consecutive position samples.
        for (const m of allies) {
            let prevHp = hpAt(m, 0);
            for (let i = 0; i < m.positions.length; i++) {
                const t = i * pollingRate;
                const hp = hpAt(m, t);
                const drop = Math.max(0, prevHp - hp);
                prevHp = hp;
                if (drop <= 0) continue;
                const pos = m.positions[i];
                const b = bucket(pos[0], pos[1], width, height);
                if (b !== null) buffer[b] += drop;
            }
        }
    }

    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] > max) max = buffer[i];
    }
    return { buffer, size: [GRID, GRID], max };
}

export function useHeatmapData(fight: ReplayFightPayload | null, mode: Mode): HeatmapRaster | null {
    return useMemo(() => {
        if (!fight || mode === 'off') return null;
        const key = `${fight.fightId}|${mode}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const raster = buildRaster(fight, mode);
        cache.set(key, raster);
        return raster;
    }, [fight, mode]);
}

export function __clearHeatmapCache() {
    cache.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useHeatmapData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/hooks/useHeatmapData.ts src/renderer/stats/map/hooks/__tests__/useHeatmapData.test.ts
git commit -m "feat(replay): add useHeatmapData histogram hook"
```

---

## Task 6: `HeatmapLayer.tsx` — canvas-into-`<foreignObject>`

**Files:**
- Create: `src/renderer/stats/map/HeatmapLayer.tsx`
- Create: `src/renderer/stats/map/__tests__/HeatmapLayer.test.tsx`

Rasterizes the 128×128 buffer onto an HTML canvas sized to `mapSize`. Low-opacity color ramp per mode:
- `deaths` — red.
- `time` — cyan.
- `damage-taken` — orange.

The canvas lives inside `<foreignObject>` so it participates in the map's `<svg>` transform.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/HeatmapLayer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeatmapLayer } from '../HeatmapLayer';
import type { HeatmapRaster } from '../hooks/useHeatmapData';

const raster: HeatmapRaster = {
    buffer: new Float32Array(128 * 128).fill(0),
    size: [128, 128],
    max: 1,
};
raster.buffer[0] = 1;

describe('HeatmapLayer', () => {
    it('renders nothing when raster is null', () => {
        const { container } = render(
            <svg viewBox="0 0 600 600"><HeatmapLayer raster={null} mapWidth={600} mapHeight={600} mode="off" /></svg>
        );
        expect(container.querySelector('foreignObject')).toBeNull();
    });

    it('renders a foreignObject canvas when raster is present', () => {
        const { container } = render(
            <svg viewBox="0 0 600 600"><HeatmapLayer raster={raster} mapWidth={600} mapHeight={600} mode="deaths" /></svg>
        );
        const fo = container.querySelector('foreignObject');
        expect(fo).not.toBeNull();
        expect(fo?.querySelector('canvas')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/HeatmapLayer.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/HeatmapLayer.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import type { HeatmapRaster } from './hooks/useHeatmapData';

interface HeatmapLayerProps {
    raster: HeatmapRaster | null;
    mapWidth: number;
    mapHeight: number;
    mode: 'off' | 'deaths' | 'time' | 'damage-taken';
}

function colorForMode(mode: HeatmapLayerProps['mode']): [number, number, number] {
    switch (mode) {
        case 'deaths':        return [239, 68, 68];
        case 'time':          return [34, 211, 238];
        case 'damage-taken':  return [249, 115, 22];
        default:              return [0, 0, 0];
    }
}

export const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ raster, mapWidth, mapHeight, mode }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !raster) return;
        const [gw, gh] = raster.size;
        canvas.width = gw;
        canvas.height = gh;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = ctx.createImageData(gw, gh);
        const [r, g, b] = colorForMode(mode);
        const max = raster.max || 1;
        for (let i = 0; i < raster.buffer.length; i++) {
            const v = raster.buffer[i] / max;
            const alpha = Math.min(255, Math.round(v * 210));
            const offset = i * 4;
            img.data[offset] = r;
            img.data[offset + 1] = g;
            img.data[offset + 2] = b;
            img.data[offset + 3] = alpha;
        }
        ctx.putImageData(img, 0, 0);
    }, [raster, mode]);

    if (!raster) return null;

    return (
        <foreignObject x={0} y={0} width={mapWidth} height={mapHeight}>
            <canvas
                ref={canvasRef}
                style={{
                    width: `${mapWidth}px`,
                    height: `${mapHeight}px`,
                    imageRendering: 'auto',
                    filter: 'blur(6px)',
                    mixBlendMode: 'screen',
                    pointerEvents: 'none',
                    opacity: 0.75,
                }}
            />
        </foreignObject>
    );
};

export default HeatmapLayer;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/HeatmapLayer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/HeatmapLayer.tsx src/renderer/stats/map/__tests__/HeatmapLayer.test.tsx
git commit -m "feat(replay): add HeatmapLayer canvas renderer"
```

---

## Task 7: `SquadOverlay.tsx` — centroid / spread / tag rings / party hulls

**Files:**
- Create: `src/renderer/stats/map/SquadOverlay.tsx`
- Create: `src/renderer/stats/map/__tests__/SquadOverlay.test.tsx`

Renders, all as SVG primitives inside the map's transformed `<g>`:
- Squad centroid + spread ring when `centroidSpread` is on. Centroid is a yellow dot; ring radius = `sample.spread`, stroked translucent yellow.
- Tag range rings when `tagRangeRings` is on. Two concentric circles at radii `600 * inchToPixel` and `1200 * inchToPixel`, centered on the commander's current position.
- Per-party convex hulls when `partyHulls` is on. One faint colored polygon per party from `sample.partyHulls`.

Takes the *interpolated* sample via nearest-tick (centroid etc. only change every 1s).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/SquadOverlay.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SquadOverlay } from '../SquadOverlay';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (over: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: '', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [[100, 100]], downRanges: [], deadRanges: [], ...over,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 's1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 3000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 3000, inchToPixel: 2, members, boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

describe('SquadOverlay', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('renders nothing when all toggles are off', () => {
        const fight = mkFight([mkMember({ isCommander: true })]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} /></svg>);
        expect(container.querySelector('[data-overlay="centroid"]')).toBeNull();
        expect(container.querySelector('[data-overlay="tag-rings"]')).toBeNull();
        expect(container.querySelector('[data-overlay="party-hulls"]')).toBeNull();
    });

    it('renders centroid + spread ring when centroidSpread is on', () => {
        useStatsStore.getState().setReplayLayer('centroidSpread', true);
        const fight = mkFight([
            mkMember({ positions: [[100, 100]] }),
            mkMember({ positions: [[120, 120]] }),
        ]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} /></svg>);
        expect(container.querySelector('[data-overlay="centroid"]')).not.toBeNull();
    });

    it('renders two tag range rings when tagRangeRings is on', () => {
        useStatsStore.getState().setReplayLayer('tagRangeRings', true);
        const fight = mkFight([mkMember({ isCommander: true, positions: [[200, 200]] })]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} /></svg>);
        const rings = container.querySelectorAll('[data-overlay="tag-rings"] circle');
        expect(rings.length).toBe(2);
    });

    it('renders hull polygons when partyHulls is on and party has ≥ 3 members', () => {
        useStatsStore.getState().setReplayLayer('partyHulls', true);
        const fight = mkFight([
            mkMember({ group: 1, positions: [[0, 0]] }),
            mkMember({ group: 1, positions: [[100, 0]] }),
            mkMember({ group: 1, positions: [[50, 50]] }),
        ]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} /></svg>);
        expect(container.querySelector('[data-overlay="party-hulls"] polygon')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/SquadOverlay.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/SquadOverlay.tsx`:

```tsx
import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { useSquadDerived } from './hooks/useSquadDerived';
import type { ReplayFightPayload } from './replayTypes';

interface SquadOverlayProps {
    fight: ReplayFightPayload;
    timeMs: number;
}

const PARTY_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa'];

function sampleAtTime<T extends { timeMs: number }>(samples: T[], timeMs: number): T | null {
    if (!samples.length) return null;
    let idx = 0;
    for (let i = 0; i < samples.length; i++) {
        if (samples[i].timeMs <= timeMs) idx = i;
        else break;
    }
    return samples[idx];
}

export const SquadOverlay: React.FC<SquadOverlayProps> = ({ fight, timeMs }) => {
    const layers = useStatsStore(state => state.replayLayers);
    const derived = useSquadDerived(fight);
    const sample = useMemo(() => sampleAtTime(derived.samples, timeMs), [derived.samples, timeMs]);

    const commander = useMemo(
        () => fight.movementData.members.find(m => m.isCommander && m.inSquad) ?? null,
        [fight.movementData.members],
    );

    const commanderPos = useMemo(() => {
        if (!commander?.positions.length) return null;
        const idx = Math.min(commander.positions.length - 1, Math.floor(timeMs / fight.movementData.pollingRate));
        return commander.positions[idx];
    }, [commander, timeMs, fight.movementData.pollingRate]);

    const ringRadii = useMemo(() => {
        const inch = fight.movementData.inchToPixel ?? 1;
        return { near: 600 * inch, far: 1200 * inch };
    }, [fight.movementData.inchToPixel]);

    return (
        <g className="replay-squad-overlay">
            {layers.partyHulls && sample && (
                <g data-overlay="party-hulls">
                    {Object.entries(sample.partyHulls).map(([partyStr, hull]) => {
                        const party = Number(partyStr);
                        const color = PARTY_COLORS[(party - 1) % PARTY_COLORS.length];
                        const points = hull.map(p => `${p[0]},${p[1]}`).join(' ');
                        return (
                            <polygon key={party}
                                points={points}
                                fill={color}
                                fillOpacity={0.08}
                                stroke={color}
                                strokeOpacity={0.4}
                                strokeWidth={1}
                            />
                        );
                    })}
                </g>
            )}

            {layers.centroidSpread && sample && (
                <g data-overlay="centroid">
                    <circle cx={sample.centroid[0]} cy={sample.centroid[1]} r={sample.spread}
                            fill="#fbbf24" fillOpacity={0.05}
                            stroke="#fbbf24" strokeOpacity={0.5} strokeWidth={1} />
                    <circle cx={sample.centroid[0]} cy={sample.centroid[1]} r={3} fill="#fbbf24" />
                </g>
            )}

            {layers.tagRangeRings && commanderPos && (
                <g data-overlay="tag-rings">
                    <circle cx={commanderPos[0]} cy={commanderPos[1]} r={ringRadii.near}
                            fill="none" stroke="#60a5fa" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="4 2" />
                    <circle cx={commanderPos[0]} cy={commanderPos[1]} r={ringRadii.far}
                            fill="none" stroke="#60a5fa" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="4 2" />
                </g>
            )}
        </g>
    );
};

export default SquadOverlay;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/SquadOverlay.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/SquadOverlay.tsx src/renderer/stats/map/__tests__/SquadOverlay.test.tsx
git commit -m "feat(replay): add SquadOverlay with centroid/spread, tag rings, party hulls"
```

---

## Task 8: `SquadHealthStrip.tsx` — thin HP bar band

**Files:**
- Create: `src/renderer/stats/map/SquadHealthStrip.tsx`
- Create: `src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx`

A flat `<div>` (not part of the map transform) that sits above the canvas, 16 px tall. One cell per squad ally, ordered by party then by name. Each cell's fill represents current HP%; stroked red when dead, orange when downed.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SquadHealthStrip } from '../SquadHealthStrip';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [[0, 0]], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 'h1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 3000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 3000, inchToPixel: 1, members, boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

describe('SquadHealthStrip', () => {
    it('renders one cell per squad ally', () => {
        const fight = mkFight([
            mkMember({ name: 'A', account: 'A.1' }),
            mkMember({ name: 'B', account: 'B.1' }),
            mkMember({ name: 'X', account: 'X.1', isEnemy: true }),
        ]);
        const { container } = render(<SquadHealthStrip fight={fight} timeMs={0} />);
        const cells = container.querySelectorAll('[data-hpcell]');
        expect(cells.length).toBe(2);
    });

    it('marks dead members with data-status=dead', () => {
        const fight = mkFight([mkMember({ name: 'A', account: 'A.1', deadRanges: [[500, 3000]] })]);
        const { container } = render(<SquadHealthStrip fight={fight} timeMs={1000} />);
        const cell = container.querySelector('[data-hpcell]');
        expect(cell?.getAttribute('data-status')).toBe('dead');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/SquadHealthStrip.tsx`:

```tsx
import React, { useMemo } from 'react';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';
import { professionColor } from '../../../shared/professionUtils';

interface SquadHealthStripProps {
    fight: ReplayFightPayload;
    timeMs: number;
}

function hpAt(m: SquadMemberMovement, t: number): number {
    const s = m.healthPercents;
    if (!s?.length) return 100;
    let hp = 100;
    for (const [ts, v] of s) {
        if (ts > t) break;
        hp = v;
    }
    return hp;
}

function statusAt(m: SquadMemberMovement, t: number): 'alive' | 'down' | 'dead' {
    for (const [start, end] of m.deadRanges) {
        if (t >= start && (end === 0 || t <= end)) return 'dead';
    }
    for (const [start, end] of m.downRanges) {
        if (t >= start && (end === 0 || t <= end)) return 'down';
    }
    return 'alive';
}

export const SquadHealthStrip: React.FC<SquadHealthStripProps> = ({ fight, timeMs }) => {
    const allies = useMemo(() => {
        return fight.movementData.members
            .filter(m => !m.isEnemy && m.inSquad)
            .sort((a, b) => (a.group - b.group) || a.name.localeCompare(b.name));
    }, [fight.movementData.members]);

    return (
        <div className="replay-health-strip"
             style={{ display: 'flex', gap: 2, padding: 2, height: 16, background: 'rgba(8,12,26,0.6)', borderRadius: 4 }}>
            {allies.map(m => {
                const hp = hpAt(m, timeMs);
                const status = statusAt(m, timeMs);
                const fill = status === 'dead' ? '#7f1d1d'
                    : status === 'down' ? '#9a3412'
                    : (professionColor(m.profession) ?? '#22c55e');
                const strokeColor = status === 'dead' ? '#ef4444'
                    : status === 'down' ? '#fdba74'
                    : 'transparent';
                return (
                    <div
                        key={m.account || m.name}
                        data-hpcell
                        data-status={status}
                        title={`${m.name} — ${hp}%`}
                        style={{
                            flex: 1, minWidth: 4, background: '#1f2937',
                            border: `1px solid ${strokeColor}`,
                            borderRadius: 2, overflow: 'hidden',
                        }}
                    >
                        <div style={{ width: `${Math.max(0, Math.min(100, hp))}%`, height: '100%', background: fill }} />
                    </div>
                );
            })}
        </div>
    );
};

export default SquadHealthStrip;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/SquadHealthStrip.tsx src/renderer/stats/map/__tests__/SquadHealthStrip.test.tsx
git commit -m "feat(replay): add SquadHealthStrip HP band"
```

---

## Task 9: Extend `EventOverlay.tsx` — rally rings, target-focus lines, damage pulses

**Files:**
- Modify: `src/renderer/stats/map/EventOverlay.tsx`
- Create: `src/renderer/stats/map/__tests__/EventOverlay.extended.test.tsx`

Add three new visual streams, each gated on the matching layer toggle. The existing down pin + death burst rendering stays unconditional (they're core event feedback, not a layer).

- **Damage pulses** (layer `damagePulses`): yellow expanding ring at the member's current position for each `damageSpikeEvents[i]` within the last 1500 ms.
- **Rally rings** (layer `rallyRings`): green expanding ring at the rally location for each `rallyEvents[i]` within the last 1500 ms.
- **Target-focus lines** (layer `targetFocusLines`): for each ally, a thin line from their current position to their current target sample's enemy position. Uses the latest `targetFocusSamples` entry ≤ `timeMs` per member.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/EventOverlay.extended.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EventOverlay } from '../EventOverlay';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: Array.from({ length: 20 }, () => [100, 100] as [number, number]),
    downRanges: [], deadRanges: [], ...o,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'evt', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 10_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    ...over,
});

describe('EventOverlay — extended layers', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('renders a damage pulse when damagePulses is on and event is recent', () => {
        useStatsStore.getState().setReplayLayer('damagePulses', true);
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1' })] },
            damageSpikeEvents: [{ timeMs: 5000, memberKey: 'A.1', magnitude: 50_000 }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={5200} /></svg>);
        expect(container.querySelector('[data-pulse="damage"]')).not.toBeNull();
    });

    it('renders a rally ring when rallyRings is on and event is recent', () => {
        useStatsStore.getState().setReplayLayer('rallyRings', true);
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1', positions: [[200, 200]] })] },
            rallyEvents: [{ timeMs: 3000, memberKey: 'A.1' }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3500} /></svg>);
        expect(container.querySelector('[data-pulse="rally"]')).not.toBeNull();
    });

    it('renders target-focus lines when targetFocusLines is on', () => {
        useStatsStore.getState().setReplayLayer('targetFocusLines', true);
        const enemy = mkMember({ name: 'foe', account: '', isEnemy: true, inSquad: false, positions: [[300, 300], [300, 300]] });
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({ account: 'A.1' }), enemy],
            },
            targetFocusSamples: [{ timeMs: 1000, memberKey: 'A.1', targetIndex: 0 }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={1200} /></svg>);
        expect(container.querySelector('[data-pulse="target-focus"]')).not.toBeNull();
    });

    it('does not render extended layers when toggles are off', () => {
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1' })] },
            damageSpikeEvents: [{ timeMs: 5000, memberKey: 'A.1', magnitude: 50_000 }],
            rallyEvents: [{ timeMs: 3000, memberKey: 'A.1' }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3500} /></svg>);
        expect(container.querySelector('[data-pulse="damage"]')).toBeNull();
        expect(container.querySelector('[data-pulse="rally"]')).toBeNull();
        expect(container.querySelector('[data-pulse="target-focus"]')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/EventOverlay.extended.test.tsx`
Expected: FAIL — new pulses not rendered.

- [ ] **Step 3: Extend `EventOverlay.tsx`**

Replace the contents of `src/renderer/stats/map/EventOverlay.tsx` with:

```tsx
import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface EventOverlayProps {
    fight: ReplayFightPayload;
    timeMs: number;
}

const PULSE_DURATION_MS = 1500;

interface Pulse {
    x: number;
    y: number;
    ageMs: number;
    kind: 'down' | 'death' | 'damage' | 'rally';
}

function positionAt(member: SquadMemberMovement, timeMs: number, pollingRate: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.min(member.positions.length - 1, Math.floor(timeMs / pollingRate));
    return member.positions[idx];
}

function collectBasePulses(fight: ReplayFightPayload, timeMs: number): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const m of fight.movementData.members) {
        if (m.isEnemy) continue;
        for (const [t] of m.downRanges) {
            const age = timeMs - t;
            if (age >= 0 && age < PULSE_DURATION_MS) {
                const pos = positionAt(m, t, pollingRate);
                if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'down' });
            }
        }
        for (const [t] of m.deadRanges) {
            const age = timeMs - t;
            if (age >= 0 && age < PULSE_DURATION_MS) {
                const pos = positionAt(m, t, pollingRate);
                if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'death' });
            }
        }
    }
    return pulses;
}

function memberByKey(fight: ReplayFightPayload): Map<string, SquadMemberMovement> {
    const map = new Map<string, SquadMemberMovement>();
    for (const m of fight.movementData.members) {
        map.set(m.account || m.name, m);
    }
    return map;
}

function collectDamagePulses(fight: ReplayFightPayload, timeMs: number, index: Map<string, SquadMemberMovement>): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const e of fight.damageSpikeEvents) {
        const age = timeMs - e.timeMs;
        if (age < 0 || age >= PULSE_DURATION_MS) continue;
        const m = index.get(e.memberKey);
        if (!m) continue;
        const pos = positionAt(m, timeMs, pollingRate);
        if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'damage' });
    }
    return pulses;
}

function collectRallyPulses(fight: ReplayFightPayload, timeMs: number, index: Map<string, SquadMemberMovement>): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const e of fight.rallyEvents) {
        const age = timeMs - e.timeMs;
        if (age < 0 || age >= PULSE_DURATION_MS) continue;
        const m = index.get(e.memberKey);
        if (!m) continue;
        const pos = positionAt(m, e.timeMs, pollingRate);
        if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'rally' });
    }
    return pulses;
}

interface FocusLine { x1: number; y1: number; x2: number; y2: number; key: string; }

function collectFocusLines(fight: ReplayFightPayload, timeMs: number, index: Map<string, SquadMemberMovement>): FocusLine[] {
    const enemies = fight.movementData.members.filter(m => m.isEnemy);
    if (!enemies.length) return [];
    const byMember = new Map<string, number>();
    for (const s of fight.targetFocusSamples) {
        if (s.timeMs > timeMs) break;
        if (timeMs - s.timeMs > 3000) continue;
        byMember.set(s.memberKey, s.targetIndex);
    }
    const lines: FocusLine[] = [];
    const { pollingRate } = fight.movementData;
    for (const [memberKey, targetIndex] of byMember) {
        const m = index.get(memberKey);
        const tgt = enemies[targetIndex];
        if (!m || !tgt) continue;
        const from = positionAt(m, timeMs, pollingRate);
        const to = positionAt(tgt, timeMs, pollingRate);
        if (!from || !to) continue;
        lines.push({ x1: from[0], y1: from[1], x2: to[0], y2: to[1], key: memberKey });
    }
    return lines;
}

export const EventOverlay: React.FC<EventOverlayProps> = ({ fight, timeMs }) => {
    const layers = useStatsStore(state => state.replayLayers);
    const index = useMemo(() => memberByKey(fight), [fight]);

    const basePulses = collectBasePulses(fight, timeMs);
    const damagePulses = layers.damagePulses ? collectDamagePulses(fight, timeMs, index) : [];
    const rallyPulses = layers.rallyRings ? collectRallyPulses(fight, timeMs, index) : [];
    const focusLines = layers.targetFocusLines ? collectFocusLines(fight, timeMs, index) : [];

    return (
        <g className="replay-events">
            {focusLines.map(line => (
                <line key={`f-${line.key}`} data-pulse="target-focus"
                    x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                    stroke="#fb923c" strokeOpacity={0.4} strokeWidth={0.8}
                    strokeDasharray="3 3" pointerEvents="none" />
            ))}
            {basePulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                if (p.kind === 'down') {
                    const r = 18 * (1 - progress);
                    return <circle key={`b-${i}`} data-pulse="down"
                        cx={p.x} cy={p.y} r={r}
                        fill="none" stroke="#60a5fa" strokeOpacity={1 - progress} strokeWidth={2} />;
                }
                const r = 10 + 24 * progress;
                return (
                    <g key={`b-${i}`} data-pulse="death">
                        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="#ef4444"
                                strokeOpacity={(1 - progress) * 0.8} strokeWidth={3} />
                        <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={14}
                              fill="#fecaca" opacity={1 - progress}>☠</text>
                    </g>
                );
            })}
            {damagePulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                const r = 8 + 22 * progress;
                return <circle key={`d-${i}`} data-pulse="damage"
                    cx={p.x} cy={p.y} r={r}
                    fill="none" stroke="#fbbf24" strokeOpacity={1 - progress} strokeWidth={2.5} />;
            })}
            {rallyPulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                const r = 6 + 18 * progress;
                return <circle key={`r-${i}`} data-pulse="rally"
                    cx={p.x} cy={p.y} r={r}
                    fill="none" stroke="#22c55e" strokeOpacity={1 - progress} strokeWidth={2} />;
            })}
        </g>
    );
};

export default EventOverlay;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/EventOverlay.extended.test.tsx`
Expected: PASS.

Also re-run the Plan-2 base overlay test to ensure it still passes:
Run: `npx vitest run src/renderer/stats/map/__tests__/EventOverlay.test.tsx` (if Plan 2 shipped one).
Expected: PASS, or skip if the file was never created.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/EventOverlay.tsx src/renderer/stats/map/__tests__/EventOverlay.extended.test.tsx
git commit -m "feat(replay): extend EventOverlay with damage pulses, rally rings, target-focus lines"
```

---

## Task 10: Extend `SyncedTimeline.tsx` with fight-phase bands

**Files:**
- Modify: `src/renderer/stats/map/SyncedTimeline.tsx`
- Create: `src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx`

When `replayLayers.phases` is on, draw one colored band per `phase` across the top 8 px of the timeline strip, plus a clickable chip labeled with the phase kind. Clicking the chip scrubs `timeMs` to `phase.startMs`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SyncedTimeline } from '../SyncedTimeline';
import { useStatsStore } from '../../statsStore';
import { __clearSquadDerivedCache } from '../hooks/useSquadDerived';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: Array.from({ length: 11 }, (_, i) => [100 + i * 5, 100] as [number, number]),
    downRanges: [], deadRanges: [], ...o,
});

const mkFight = (): ReplayFightPayload => ({
    fightId: 'sp1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 1, kills: 0, deaths: 0,
    movementData: {
        pollingRate: 1000, durationMs: 10_000, inchToPixel: 1,
        members: [mkMember({ deadRanges: [[6000, 10_000]] })], boonIcons: {}, skillIcons: {},
    },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 5000, squadDps: 1000 }, { timeMs: 10_000, squadDps: 0 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

describe('SyncedTimeline — phases', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
        __clearSquadDerivedCache();
    });

    it('does not render phase chips when phases toggle is off', () => {
        const { container } = render(<SyncedTimeline fight={mkFight()} />);
        expect(container.querySelector('[data-phase-chip]')).toBeNull();
    });

    it('renders at least one phase chip when phases toggle is on', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={mkFight()} />);
        expect(container.querySelector('[data-phase-chip]')).not.toBeNull();
    });

    it('clicking a phase chip scrubs to its startMs', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={mkFight()} />);
        const chips = container.querySelectorAll('[data-phase-chip]');
        expect(chips.length).toBeGreaterThan(0);
        const last = chips[chips.length - 1] as HTMLElement;
        const startMs = Number(last.getAttribute('data-start-ms'));
        fireEvent.click(last);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(startMs);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx`
Expected: FAIL — phases not rendered.

- [ ] **Step 3: Extend `SyncedTimeline.tsx`**

Open `src/renderer/stats/map/SyncedTimeline.tsx`. Add imports at the top:

```tsx
import { useSquadDerived } from './hooks/useSquadDerived';
```

Inside the `SyncedTimeline` component body (before the existing `return`), read the layers state and the derived data:

```tsx
    const layersState = useStatsStore(state => state.replayLayers);
    const derived = useSquadDerived(fight);
    const phaseColor: Record<string, string> = {
        opening: '#60a5fa',
        push: '#22c55e',
        retreat: '#ef4444',
        cleanup: '#a78bfa',
    };
```

Then inside the returned JSX, render the phase bands and chips. Insert this block directly below the existing `<svg className="replay-timeline" ...>` element (still inside the wrapping `<div className="replay-timeline-wrap">`):

```tsx
            {layersState.phases && derived.phases.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {derived.phases.map((p, i) => (
                        <button
                            key={`${p.startMs}-${i}`}
                            type="button"
                            data-phase-chip
                            data-start-ms={p.startMs}
                            onClick={() => setReplayPlayhead({ timeMs: p.startMs })}
                            style={{
                                padding: '2px 6px',
                                fontSize: 10,
                                borderRadius: 3,
                                background: `${phaseColor[p.kind]}22`,
                                color: phaseColor[p.kind],
                                border: `1px solid ${phaseColor[p.kind]}55`,
                                cursor: 'pointer',
                            }}
                        >
                            {p.kind} · {(p.startMs / 1000).toFixed(0)}s
                        </button>
                    ))}
                </div>
            )}
```

Also add a band strip inside the `<svg className="replay-timeline">` just before the path:

```tsx
                {layersState.phases && derived.phases.map((p, i) => {
                    const x1 = (p.startMs / fight.durationMs) * 1000;
                    const x2 = (p.endMs / fight.durationMs) * 1000;
                    return (
                        <rect key={`ph-${i}`}
                            x={x1} y={0} width={Math.max(0, x2 - x1)} height={8}
                            fill={phaseColor[p.kind]} opacity={0.35} />
                    );
                })}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx`
Expected: PASS.

Also re-run the Plan-2 timeline test to make sure scrub behavior still works:
Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/SyncedTimeline.tsx src/renderer/stats/map/__tests__/SyncedTimeline.phases.test.tsx
git commit -m "feat(replay): add fight-phase bands and chips to SyncedTimeline"
```

---

## Task 11: Extend `PartyPanel.tsx` with all-parties variant

**Files:**
- Modify: `src/renderer/stats/map/PartyPanel.tsx`
- Create: `src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx`

When `replayLayers.allPartiesPanel` is on, the sidebar swaps from single-party member list to a vertical stack of 5 mini-panels (P1–P5). Each mini-panel shows:
- Party label (P1..P5).
- A compact stack of the same HP cells as `SquadHealthStrip`, but vertical (one per member).
- Click to set `replaySelectedParty` (for the single-party view when toggled off again) AND set `replaySpotlightParty` (to enable spotlight dimming).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { PartyPanel } from '../PartyPanel';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [[0, 0]], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 'pp1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 3000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 3000, inchToPixel: 1, members, boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

describe('PartyPanel — all-parties variant', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('renders 5 mini-panels when allPartiesPanel is on', () => {
        useStatsStore.getState().setReplayLayer('allPartiesPanel', true);
        const fight = mkFight([
            mkMember({ account: 'A.1', group: 1 }),
            mkMember({ account: 'B.1', group: 2 }),
        ]);
        render(<PartyPanel fight={fight} />);
        for (const label of ['P1', 'P2', 'P3', 'P4', 'P5']) {
            expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy();
        }
    });

    it('clicking a mini-panel sets spotlight party and selected party', () => {
        useStatsStore.getState().setReplayLayer('allPartiesPanel', true);
        const fight = mkFight([
            mkMember({ account: 'A.1', group: 1 }),
            mkMember({ account: 'B.1', group: 2 }),
        ]);
        render(<PartyPanel fight={fight} />);
        fireEvent.click(screen.getByRole('button', { name: /P2/ }));
        expect(useStatsStore.getState().replaySpotlightParty).toBe(2);
        expect(useStatsStore.getState().replaySelectedParty).toBe(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx`
Expected: FAIL — all-parties variant not implemented.

- [ ] **Step 3: Extend `PartyPanel.tsx`**

Open `src/renderer/stats/map/PartyPanel.tsx`. Add these imports at the top (merge with existing imports):

```tsx
import { professionColor } from '../../../shared/professionUtils';
```

Inside the component body, add the all-parties read:

```tsx
    const allPartiesPanel = useStatsStore(state => state.replayLayers.allPartiesPanel);
    const setReplaySpotlightParty = useStatsStore(state => state.setReplaySpotlightParty);
```

Add this helper above the component (next to existing helpers):

```tsx
function partyStatusColor(member: SquadMemberMovement, timeMs: number): string {
    const status = statusAt(member, timeMs);
    if (status === 'dead') return '#7f1d1d';
    if (status === 'down') return '#9a3412';
    return professionColor(member.profession) ?? '#22c55e';
}
```

Replace the component's `return (...)` body with a conditional:

```tsx
    if (allPartiesPanel) {
        return (
            <aside className="replay-party-panel all-parties"
                   style={{ width: 260, padding: 8, background: 'rgba(8,12,26,0.6)', borderRadius: 8,
                            display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[1, 2, 3, 4, 5].map(party => {
                    const members = allies.filter(m => m.group === party);
                    return (
                        <button
                            key={party}
                            type="button"
                            onClick={() => {
                                setReplaySpotlightParty(party);
                                setReplaySelectedParty(party);
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: 6, borderRadius: 6,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <span style={{ fontSize: 11, fontWeight: 600, minWidth: 20 }}>P{party}</span>
                            <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                                {members.map(m => {
                                    const hp = healthAt(m, timeMs);
                                    return (
                                        <div key={m.account || m.name}
                                             title={`${m.name} — ${hp}%`}
                                             style={{ flex: 1, height: 18, background: '#18213d', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ width: `${hp}%`, height: '100%',
                                                          background: partyStatusColor(m, timeMs) }} />
                                        </div>
                                    );
                                })}
                                {members.length === 0 && <span style={{ fontSize: 10, opacity: 0.4 }}>empty</span>}
                            </div>
                            <span style={{ fontSize: 10, opacity: 0.6, minWidth: 16, textAlign: 'right' }}>{members.length}</span>
                        </button>
                    );
                })}
            </aside>
        );
    }

    // (existing single-party JSX stays below — unchanged)
```

Place this conditional block before the original single-party `return (...)`. The original block remains the fallback.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/PartyPanel.tsx src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx
git commit -m "feat(replay): add all-parties mini-panel variant to PartyPanel"
```

---

## Task 12: `LayersPopover.tsx` — gear-icon toggle panel

**Files:**
- Create: `src/renderer/stats/map/LayersPopover.tsx`
- Create: `src/renderer/stats/map/__tests__/LayersPopover.test.tsx`

Floating panel anchored to a gear button. Three groups per the spec:
- **Squad overlay:** Centroid + spread ring · Tag range rings · Squad health strip · Per-party hulls · All-parties panel.
- **Events:** Fight phases · Rally rings · Target-focus lines · Damage pulses.
- **Heatmap (radio):** Off / Deaths / Time / Damage taken.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/LayersPopover.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayersPopover } from '../LayersPopover';
import { useStatsStore } from '../../statsStore';

describe('LayersPopover', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('is closed by default and opens on button click', () => {
        render(<LayersPopover />);
        expect(screen.queryByLabelText(/centroid/i)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /layers/i }));
        expect(screen.getByLabelText(/centroid/i)).toBeTruthy();
    });

    it('toggling a checkbox updates replayLayers', () => {
        render(<LayersPopover />);
        fireEvent.click(screen.getByRole('button', { name: /layers/i }));
        fireEvent.click(screen.getByLabelText(/centroid/i));
        expect(useStatsStore.getState().replayLayers.centroidSpread).toBe(true);
    });

    it('heatmap radio switches mode', () => {
        render(<LayersPopover />);
        fireEvent.click(screen.getByRole('button', { name: /layers/i }));
        fireEvent.click(screen.getByLabelText(/deaths/i));
        expect(useStatsStore.getState().replayLayers.heatmap).toBe('deaths');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/LayersPopover.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/stats/map/LayersPopover.tsx`:

```tsx
import React, { useRef, useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useStatsStore } from '../statsStore';

const SQUAD_TOGGLES: { key: 'centroidSpread' | 'tagRangeRings' | 'squadHealthStrip' | 'partyHulls' | 'allPartiesPanel'; label: string }[] = [
    { key: 'centroidSpread', label: 'Centroid + spread ring' },
    { key: 'tagRangeRings', label: 'Tag range rings (600 / 1200)' },
    { key: 'squadHealthStrip', label: 'Squad health strip' },
    { key: 'partyHulls', label: 'Per-party hulls' },
    { key: 'allPartiesPanel', label: 'All-parties panel' },
];

const EVENT_TOGGLES: { key: 'phases' | 'rallyRings' | 'targetFocusLines' | 'damagePulses'; label: string }[] = [
    { key: 'phases', label: 'Fight phases on timeline' },
    { key: 'rallyRings', label: 'Rally rings' },
    { key: 'targetFocusLines', label: 'Target-focus lines' },
    { key: 'damagePulses', label: 'Damage pulses' },
];

const HEATMAP_OPTIONS: { value: 'off' | 'deaths' | 'time' | 'damage-taken'; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'deaths', label: 'Deaths' },
    { value: 'time', label: 'Time spent' },
    { value: 'damage-taken', label: 'Damage taken' },
];

export const LayersPopover: React.FC = () => {
    const layers = useStatsStore(state => state.replayLayers);
    const setReplayLayer = useStatsStore(state => state.setReplayLayer);
    const setReplayHeatmapMode = useStatsStore(state => state.setReplayHeatmapMode);
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    return (
        <div ref={panelRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setOpen(v => !v)}
                    title="Layers"
                    aria-label="Layers"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Settings size={14} /> Layers
            </button>
            {open && (
                <div role="dialog" aria-label="Layers"
                     style={{
                         position: 'absolute', right: 0, top: '100%', marginTop: 6,
                         background: 'rgba(12, 18, 36, 0.98)',
                         border: '1px solid rgba(255,255,255,0.1)',
                         borderRadius: 8, padding: 12, minWidth: 240, zIndex: 50,
                     }}>
                    <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Squad overlay</div>
                    {SQUAD_TOGGLES.map(t => (
                        <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                            <input type="checkbox"
                                   checked={layers[t.key]}
                                   onChange={e => setReplayLayer(t.key, e.currentTarget.checked)} />
                            <span>{t.label}</span>
                        </label>
                    ))}
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8, marginBottom: 4 }}>Events</div>
                    {EVENT_TOGGLES.map(t => (
                        <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                            <input type="checkbox"
                                   checked={layers[t.key]}
                                   onChange={e => setReplayLayer(t.key, e.currentTarget.checked)} />
                            <span>{t.label}</span>
                        </label>
                    ))}
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8, marginBottom: 4 }}>Heatmap</div>
                    {HEATMAP_OPTIONS.map(opt => (
                        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                            <input type="radio" name="heatmap"
                                   checked={layers.heatmap === opt.value}
                                   onChange={() => setReplayHeatmapMode(opt.value)} />
                            <span>{opt.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export default LayersPopover;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/LayersPopover.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/LayersPopover.tsx src/renderer/stats/map/__tests__/LayersPopover.test.tsx
git commit -m "feat(replay): add LayersPopover gear panel with three groups"
```

---

## Task 13: Integrate overlays + LayersPopover + spotlight into `ReplayView.tsx`

**Files:**
- Modify: `src/renderer/stats/map/ReplayView.tsx`

Changes:
1. Wrap each ally marker group in `<g opacity={spotOpacity(member)}>` where `spotOpacity` returns `0.2` if `replaySpotlightParty` is set and the member isn't in that party; otherwise `1`. Enemies render at full opacity regardless.
2. Mount `<HeatmapLayer />` with `useHeatmapData(selectedFight, layers.heatmap)` just above the landmark pins, under the ally trails.
3. Mount `<SquadOverlay fight={selectedFight} timeMs={playhead.timeMs} />` after ally rendering but before `<EventOverlay>`.
4. Render `<SquadHealthStrip fight={selectedFight} timeMs={playhead.timeMs} />` above the canvas when `layers.squadHealthStrip` is on.
5. Replace the placeholder gear space in the controls row with `<LayersPopover />`.
6. Render a Spotlight chip next to the Follow chip when `replaySpotlightParty` is set, with an X that clears it.

- [ ] **Step 1: Apply the changes**

Open `src/renderer/stats/map/ReplayView.tsx` and update it as follows.

Add imports (merge with existing):

```tsx
import { HeatmapLayer } from './HeatmapLayer';
import { SquadOverlay } from './SquadOverlay';
import { SquadHealthStrip } from './SquadHealthStrip';
import { LayersPopover } from './LayersPopover';
import { useHeatmapData } from './hooks/useHeatmapData';
```

Inside `ReplayView`, add these store reads (near the other store-state hooks):

```tsx
    const layers = useStatsStore(state => state.replayLayers);
    const spotlightParty = useStatsStore(state => state.replaySpotlightParty);
    const setReplaySpotlightParty = useStatsStore(state => state.setReplaySpotlightParty);
```

Add the heatmap read after `selectedFight` is resolved:

```tsx
    const heatmap = useHeatmapData(selectedFight, layers.heatmap);
```

Replace the chip row inside the controls div (between the selected-fight chip and the zoom buttons) to include the spotlight chip and LayersPopover:

```tsx
                            {followLabel && (
                                <button type="button" onClick={() => setReplayFollowTarget(null)}>
                                    {followLabel} <X size={12} />
                                </button>
                            )}
                            {spotlightParty !== null && (
                                <button type="button" onClick={() => setReplaySpotlightParty(null)}>
                                    Spotlight: Party {spotlightParty} <X size={12} />
                                </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <LayersPopover />
                            <button type="button" onClick={() => viewport.zoomIn()} title="Zoom in"><Plus size={14} /></button>
                            <button type="button" onClick={() => viewport.zoomOut()} title="Zoom out"><Minus size={14} /></button>
                            <button type="button" onClick={() => viewport.resetViewport()} title="Reset"><RotateCcw size={14} /></button>
                            <button type="button" onClick={() => setFullscreen(v => !v)} title="Fullscreen">
                                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
```

Add `SquadHealthStrip` above the canvas (immediately before the `<svg className="replay-canvas" ...>`):

```tsx
                        {layers.squadHealthStrip && (
                            <SquadHealthStrip fight={selectedFight} timeMs={playhead.timeMs} />
                        )}
```

Inside the transformed `<g transform={...}>` in the canvas, insert the heatmap right after the map-tiles/base-image block (so it sits under landmarks):

```tsx
                                <HeatmapLayer
                                    raster={heatmap}
                                    mapWidth={mapWidth}
                                    mapHeight={mapHeight}
                                    mode={layers.heatmap}
                                />
```

Wrap the existing ally marker rendering in a helper that applies spotlight opacity. Replace the inner `selectedFight.movementData.members.map(member => { ... })` block with:

```tsx
                                {selectedFight.movementData.members.map(member => {
                                    const pos = sampleAt(member, pollIndex);
                                    if (!pos) return null;
                                    const dim = spotlightParty !== null && !member.isEnemy && member.group !== spotlightParty;
                                    const trail = member.positions.slice(Math.max(0, pollIndex - 20), pollIndex + 1);
                                    const recent = member.positions.slice(Math.max(0, pollIndex - 5), pollIndex + 1);
                                    const trailStr = trail.map(p => `${p[0]},${p[1]}`).join(' ');
                                    const recentStr = recent.map(p => `${p[0]},${p[1]}`).join(' ');
                                    const color = member.isEnemy ? '#ef4444' : member.isCommander ? '#fbbf24' : '#60a5fa';
                                    const isFollow = followMember && (followMember.account || followMember.name) === (member.account || member.name);
                                    return (
                                        <g key={member.account || member.name} opacity={dim ? 0.2 : 1}>
                                            <polyline points={trailStr} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={1} strokeDasharray="2 2" />
                                            <polyline points={recentStr} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={1.5} />
                                            {isFollow && <circle cx={pos[0]} cy={pos[1]} r={16} fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeOpacity={0.8} />}
                                            {member.isEnemy
                                                ? <circle cx={pos[0]} cy={pos[1]} r={6} fill="#7f1d1d" stroke="#ef4444" strokeWidth={1.5} />
                                                : <image
                                                    href={getProfessionIconPath(member.profession)}
                                                    x={pos[0] - 10} y={pos[1] - 10} width={20} height={20}
                                                />
                                            }
                                            {member.isCommander && (
                                                <circle cx={pos[0]} cy={pos[1] - 14} r={3} fill="#fbbf24" />
                                            )}
                                        </g>
                                    );
                                })}
                                <SquadOverlay fight={selectedFight} timeMs={playhead.timeMs} />
                                <EventOverlay fight={selectedFight} timeMs={playhead.timeMs} />
```

(`EventOverlay` now reads layer toggles internally, so no extra props needed.)

- [ ] **Step 2: Typecheck + lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 3: Dev smoke test**

Run: `npm run dev`

Load a dataset with replay-capable fights. Navigate Map → Replay. Verify:
- Gear button opens the LayersPopover.
- Toggling "Centroid + spread ring" overlays a yellow dot + ring on the canvas.
- Toggling "Tag range rings" draws two dashed circles around the commander marker.
- Toggling "Per-party hulls" draws faint colored polygons.
- Toggling "Squad health strip" shows the HP band above the canvas.
- Setting heatmap to Deaths / Time / Damage-taken shows the colored blur.
- Enabling "Damage pulses" / "Rally rings" / "Target-focus lines" produces the expected in-canvas effects when scrubbing to relevant fight moments.
- Toggling "Fight phases" shows phase chips under the timeline; clicking one scrubs the playhead.
- Toggling "All-parties panel" swaps the left sidebar to 5 mini-panels; clicking one sets Spotlight and dims other-party markers.
- Clicking the X on the Spotlight chip restores full opacity.

Stop the dev server when satisfied.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx
git commit -m "feat(replay): integrate overlays, LayersPopover, and spotlight into ReplayView"
```

---

## Task 14: Playwright e2e — layer toggles + spotlight smoke

**Files:**
- Create: `tests/e2e/electron/replay.layers.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/electron/replay.layers.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { launchElectron } from './helpers';

test('layer toggles render and clear their overlays', async () => {
    const { app, window } = await launchElectron({ withFixtureLogs: 'replay-capable' });

    await window.getByRole('button', { name: /map/i }).click();
    await window.getByRole('option').first().click();
    await expect(window.locator('svg.replay-canvas')).toBeVisible();

    // Open layers popover
    await window.getByRole('button', { name: /layers/i }).click();

    // Centroid + spread
    await window.getByLabel(/centroid/i).check();
    await expect(window.locator('[data-overlay="centroid"]')).toBeVisible();

    // Tag range rings
    await window.getByLabel(/tag range/i).check();
    await expect(window.locator('[data-overlay="tag-rings"]')).toBeVisible();

    // Squad health strip
    await window.getByLabel(/squad health/i).check();
    await expect(window.locator('.replay-health-strip')).toBeVisible();

    // Heatmap — deaths
    await window.getByLabel(/deaths/i).check();
    await expect(window.locator('foreignObject canvas')).toBeVisible();

    // Fight phases
    await window.getByLabel(/fight phases/i).check();
    // Chips may not exist if the fight is too short, so allow 0+.

    // All-parties panel → spotlight
    await window.getByLabel(/all-parties/i).check();
    await window.locator('.replay-party-panel.all-parties button').first().click();
    await expect(window.getByRole('button', { name: /spotlight:/i })).toBeVisible();

    // Clear spotlight
    await window.getByRole('button', { name: /spotlight:/i }).click();
    await expect(window.getByRole('button', { name: /spotlight:/i })).toHaveCount(0);

    await app.close();
});
```

If `launchElectron`/`withFixtureLogs: 'replay-capable'` doesn't exist in the project helpers yet, reuse whatever Plan 2's `replay.spec.ts` used — the same fixture shape works here.

- [ ] **Step 2: Run the e2e**

Run: `npm run test:e2e:electron -- replay.layers.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/electron/replay.layers.spec.ts
git commit -m "test(replay): add e2e smoke for layer toggles and spotlight"
```

---

## Task 15: Full validation sweep

**Files:** none.

- [ ] **Step 1: Validate**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 2: Unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Web e2e**

Run: `npm run test:e2e:web`
Expected: PASS.

- [ ] **Step 4: Electron e2e**

Run: `npm run test:e2e:electron`
Expected: PASS.

- [ ] **Step 5: Audit sweep (unchanged)**

Run: `npm run audit:metrics && npm run audit:boons && npm run audit:conditions`
Expected: PASS. The replay feature is purely presentational; no metric drift should appear.

- [ ] **Step 6: Build smoke**

Run: `npm run build`
Expected: PASS.

If any snapshots regenerated, diff them by hand and commit if correct:

```bash
git add -A
git commit -m "chore(replay): update snapshots after layer overlays shipped"
```

---

## Self-Review

### Spec coverage

Walking §§7.1 layers 3/5/7/8, §7.1 item 9, §7.2, §7.4, §7.5 all-parties, §7.6 spotlight, §7.7 fight phases, §9 remaining store fields:

- §7.1 layer 3 (heatmap, three modes) → Tasks 5, 6, 12 (popover radio). ✅
- §7.1 layer 5 (per-party hulls) → Task 7 (`SquadOverlay`). ✅
- §7.1 layer 7 (centroid + spread) → Task 7. ✅
- §7.1 layer 8 (tag range rings) → Task 7. ✅
- §7.1 item 9 damage pulses → Tasks 2 + 9. ✅
- §7.1 item 9 rally rings → Tasks 2 + 9. ✅
- §7.1 item 9 target-focus lines → Tasks 2 + 9. ✅
- §7.1 item 9 existing down/death pulses → unchanged from Plan 2. ✅
- §7.2 squad health strip → Task 8. ✅
- §7.4 Layers popover (three groups) → Task 12, integrated in Task 13. ✅
- §7.5 all-parties panel variant → Task 11. ✅
- §7.6 spotlight (dim non-selected party to 0.2) → Task 1 (state), Task 11 (trigger), Task 13 (dim). ✅
- §7.7 fight-phase bands + clickable chips → Task 10, data from Task 4 (`useSquadDerived`). ✅
- §9 `replayLayers` + `replaySpotlightParty` + setters → Task 1. ✅
- §10 performance — `useSquadDerived` cached per `fightId`, `useHeatmapData` cached per `(fightId, mode)`. ✅

### Placeholder scan

No TODOs, TBDs, "add appropriate error handling", "fill in details", or steps without code. All code blocks are complete. Each task's test is spelled out.

### Type consistency

- `memberKey = m.account || m.name` (string) is consistent between Task 2's event producers, Task 9's consumer index, Task 11's click handler, and Task 13's spotlight dimming.
- `replayLayers` field names (`centroidSpread`, `tagRangeRings`, `allPartiesPanel`, `squadHealthStrip`, `partyHulls`, `phases`, `rallyRings`, `targetFocusLines`, `damagePulses`, `heatmap`) match between Task 1 (state), Task 12 (popover), Task 7/9/10/11/13 (consumers).
- `SquadDerived.samples[i].partyHulls` is `Record<number, [number, number][]>` in Task 3 and Task 4; `SquadOverlay` (Task 7) reads it with the same shape.
- `HeatmapRaster.buffer` is `Float32Array(128*128)` produced by Task 5 and consumed by Task 6. `size` is `[128, 128]`, matches.
- `DamageSpikeEvent` / `RallyEvent` / `TargetFocusSample` field names (`timeMs`, `memberKey`, `targetIndex`, `magnitude`) match across Task 2 producer and Task 9 consumer.
- `resetReplayLayers()` is declared in Task 1 but not called anywhere in this plan — that's intentional; it's there for future UI affordances (e.g. a "reset layers" button) and used in tests.

All type and name references check out.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-15-map-replay-squad-overlays.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
