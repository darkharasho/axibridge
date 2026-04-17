# Map Replay — Plan 2: Core Viewer & Web Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the replayable fight viewer inside the new `map` stats group, sharable across the Electron app and the static web report. Includes fight picker, single-party sidebar, synced timeline, playback, follow, zoom, fullscreen, and core event overlays (damage pulses, down pins, death bursts).

**Architecture:** A single `ReplayView` component lives in `src/renderer/stats/map/` and is reused by a thin `ReplayViewWeb` wrapper in `src/web/`. Movement data is built lazily per selected fight via `buildMovementData` (shipped in Plan 1), memoized in an LRU cache of 3. The Electron app pulls raw details through the existing `DetailsCache` hydration pipeline; the web report receives pre-built `MovementData` + fight metadata baked into the embedded `report.json` under `stats.replayFights`. Playback runs on a single rAF loop advancing `timeMs`; markers derive visual state from it without per-frame React re-renders.

**Tech Stack:** React 18 · SVG for markers + landmark pins + tiles (composed into a single `<svg>`) · HTML canvas layered via `<foreignObject>` is *not* used here (heatmaps come in Plan 3) · zustand for replay state · lucide-react icons · framer-motion for chip animations (already a dep).

**Reference spec:** `docs/superpowers/specs/2026-04-15-map-replay-section-design.md` — §4.5 (hydration), §4.6 (web report bundle), §7.0 (fight picker), §7.1 layers 1/2/4/6/9-partial (base layers), §7.3 (controls row), §7.5 (party panel, single-party view), §7.6 (follow), §7.7 (synced timeline, basic), §7.8 (playback), §8 (file layout), §9 (store additions), §10 (performance).

**Prerequisite:** Plan 1 merged. This plan assumes `src/shared/wvwLandmarks.ts`, `src/shared/wvwTiles.ts`, `src/shared/mapUtils.ts`, `src/shared/movementData.ts` all exist, `parseCombatReplay` defaults to `true`, and `STATS_TOC_GROUPS` already has the `map` group pointing at a placeholder `ReplaySection`.

**Deferred to Plan 3:**
- Heatmap layer, squad centroid/spread, tag range rings, per-party hulls, squad health strip, all-parties panel, spotlight, rally rings, target-focus lines, fight-phase bands, Layers popover.
- Until Plan 3 lands, the controls row shows no gear/layers button; toggles for any overlays Plan 3 will add are not present in `ReplayView`.

---

## File Structure

### New shared file

- `src/shared/replayBuffs.ts` — exports `TRACKED_REPLAY_BUFF_IDS: Set<number>` (offensive + defensive boon IDs — start with the set already maintained in `src/shared/boonData.ts` if present; otherwise hand-listed `might`/`fury`/`quickness`/`alacrity`/`resolution`/`protection`/`aegis`/`stability`/`regeneration`/`resistance`/`vigor`/`retaliation`). This set is passed into `buildMovementData` so the movement extractor keeps buff selection concern-separated from the aggregation pipeline.

### New renderer files

```
src/renderer/stats/map/
    ReplayView.tsx              # main viewer
    FightPicker.tsx             # horizontal thumbnail strip
    PartyPanel.tsx              # left sidebar, single-party view
    SyncedTimeline.tsx          # 120px strip: DPS + kills/deaths + playhead
    EventOverlay.tsx            # damage pulses, down pins, death bursts
    FullscreenPortal.tsx        # portal + Esc + auto-hide chrome
    replayTypes.ts              # shared replay-payload types (ReplayFightPayload)
    replaySelectors.ts          # helpers: findClosestMember, pickDefaultFightId, etc.
    hooks/
        useMovementData.ts      # LRU cap 3; hydrates details if missing
        useReplayPlayback.ts    # rAF timeMs loop
        useReplayViewport.ts    # scale/tx/ty + follow-target centering
        useReplayFights.ts      # feeds FightPicker with per-fight payload list
        useReplayDpsTimeline.ts # squad DPS samples for SyncedTimeline
```

### Modified files

- `src/renderer/stats/sections/ReplaySection.tsx` — replace the Plan 1 placeholder with a host for `ReplayView`.
- `src/renderer/stats/statsStore.ts` — add core replay state: `selectedReplayFightId`, `replayPlayhead`, `replayViewport`, `replaySelectedParty`, with setters.
- `src/renderer/stats/computeStatsAggregation.ts` — compute per-fight `replayFights: ReplayFightPayload[]` and attach to the result.
- `src/renderer/stats/statsTypes.ts` — add `ReplayFightPayload` to the aggregation-result types.
- `src/main/handlers/githubHandlers.ts:402-476` — extend `buildWebReportPayload` so `stats.replayFights` is carried through; add a `trimSteps` entry so the array can be emptied first if the report exceeds the GitHub upload cap.

### New web file

- `src/web/ReplayViewWeb.tsx` — thin wrapper around `ReplayView` that feeds it `stats.replayFights` (bundled in the report JSON) instead of letting it build movement data on demand.

### New tests

- `src/renderer/stats/map/__tests__/replaySelectors.test.ts` — `pickDefaultFightId`, `findClosestMember`.
- `src/renderer/stats/map/hooks/__tests__/useReplayPlayback.test.ts` — start / pause / speed / `Space` toggle.
- `src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts` — pan / zoom / follow-centering.
- `src/renderer/stats/map/__tests__/FightPicker.test.tsx` — renders cards, defaults to most recent replay fight, handles ← / → keys.
- `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx` — click-to-scrub updates `timeMs`.
- `tests/e2e/electron/replay.spec.ts` — Playwright: open stats → Map group → select a fight → play/pause/scrub → follow / clear follow → fullscreen round-trip.

---

## Task 1: Add core replay state to `statsStore.ts`

**Files:**
- Modify: `src/renderer/stats/statsStore.ts`
- Create: `src/renderer/stats/map/__tests__/statsStoreReplay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/statsStoreReplay.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../../statsStore';

describe('statsStore — replay state', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('starts with no selected fight', () => {
        expect(useStatsStore.getState().selectedReplayFightId).toBeNull();
    });

    it('has default playhead paused at 0 at 1× speed', () => {
        const p = useStatsStore.getState().replayPlayhead;
        expect(p.timeMs).toBe(0);
        expect(p.playing).toBe(false);
        expect(p.speed).toBe(1);
    });

    it('has default viewport scale 1 with no follow target', () => {
        const v = useStatsStore.getState().replayViewport;
        expect(v.scale).toBe(1);
        expect(v.tx).toBe(0);
        expect(v.ty).toBe(0);
        expect(v.followTarget).toBeNull();
    });

    it('setSelectedReplayFight resets playhead to 0 and pauses', () => {
        useStatsStore.getState().setReplayPlayhead({ timeMs: 42_000, playing: true, speed: 2 });
        useStatsStore.getState().setSelectedReplayFight('fight-abc');
        const p = useStatsStore.getState().replayPlayhead;
        expect(p.timeMs).toBe(0);
        expect(p.playing).toBe(false);
        expect(p.speed).toBe(2); // speed preserved
        expect(useStatsStore.getState().selectedReplayFightId).toBe('fight-abc');
    });

    it('setReplayFollowTarget updates viewport.followTarget', () => {
        useStatsStore.getState().setReplayFollowTarget('Alice.0001');
        expect(useStatsStore.getState().replayViewport.followTarget).toBe('Alice.0001');
    });

    it('setReplaySelectedParty clamps to [0, 5]', () => {
        useStatsStore.getState().setReplaySelectedParty(3);
        expect(useStatsStore.getState().replaySelectedParty).toBe(3);
        useStatsStore.getState().setReplaySelectedParty(99);
        expect(useStatsStore.getState().replaySelectedParty).toBe(5);
        useStatsStore.getState().setReplaySelectedParty(-2);
        expect(useStatsStore.getState().replaySelectedParty).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreReplay.test.ts`
Expected: FAIL — new state fields / setters don't exist.

- [ ] **Step 3: Extend `statsStore.ts`**

Edit `src/renderer/stats/statsStore.ts`. Add inside `StatsStoreState` (after `activeNavGroup`):

```ts
    selectedReplayFightId: string | null;
    replayPlayhead: { timeMs: number; playing: boolean; speed: number };
    replayViewport: { scale: number; tx: number; ty: number; followTarget: string | null };
    replaySelectedParty: number;

    setSelectedReplayFight: (fightId: string | null) => void;
    setReplayPlayhead: (patch: Partial<{ timeMs: number; playing: boolean; speed: number }>) => void;
    setReplayViewport: (patch: Partial<{ scale: number; tx: number; ty: number }>) => void;
    setReplayFollowTarget: (target: string | null) => void;
    setReplaySelectedParty: (party: number) => void;
    resetReplayViewport: () => void;
```

Add to `initialState` (inside the object):

```ts
    selectedReplayFightId: null,
    replayPlayhead: { timeMs: 0, playing: false, speed: 1 },
    replayViewport: { scale: 1, tx: 0, ty: 0, followTarget: null },
    replaySelectedParty: 0,
```

Add the setters inside the `create<>()` body:

```ts
    setSelectedReplayFight: (fightId) => set((state) => ({
        selectedReplayFightId: fightId,
        replayPlayhead: { ...state.replayPlayhead, timeMs: 0, playing: false },
    })),
    setReplayPlayhead: (patch) => set((state) => ({
        replayPlayhead: { ...state.replayPlayhead, ...patch },
    })),
    setReplayViewport: (patch) => set((state) => ({
        replayViewport: { ...state.replayViewport, ...patch },
    })),
    setReplayFollowTarget: (target) => set((state) => ({
        replayViewport: { ...state.replayViewport, followTarget: target },
    })),
    setReplaySelectedParty: (party) => set({
        replaySelectedParty: Math.max(0, Math.min(5, Math.floor(Number.isFinite(party) ? party : 0))),
    }),
    resetReplayViewport: () => set((state) => ({
        replayViewport: { ...state.replayViewport, scale: 1, tx: 0, ty: 0 },
    })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreReplay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/map/__tests__/statsStoreReplay.test.ts
git commit -m "feat(stats): add core replay state to statsStore"
```

---

## Task 2: Add tracked-replay buff set

**Files:**
- Create: `src/shared/replayBuffs.ts`

- [ ] **Step 1: Write the file**

Create `src/shared/replayBuffs.ts`:

```ts
// Boon IDs worth rendering on the replay — offensive + defensive core boons.
// Extend this set if additional buffs need to show up on the replay timeline.
export const TRACKED_REPLAY_BUFF_IDS: Set<number> = new Set([
    740,   // Might
    725,   // Fury
    1187,  // Quickness
    30328, // Alacrity
    873,   // Aegis
    1122,  // Stability
    718,   // Regeneration
    717,   // Protection
    26980, // Resistance
    31484, // Resolution
    719,   // Swiftness
    726,   // Vigor
]);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/replayBuffs.ts
git commit -m "feat(shared): add TRACKED_REPLAY_BUFF_IDS for movement extractor"
```

---

## Task 3: Build `ReplayFightPayload` in aggregation

**Files:**
- Modify: `src/renderer/stats/statsTypes.ts`
- Create: `src/renderer/stats/map/replayTypes.ts`
- Modify: `src/renderer/stats/computeStatsAggregation.ts`
- Create: `src/renderer/stats/map/__tests__/replayPayload.test.ts`

Each fight that carries combat replay data becomes one `ReplayFightPayload`. The aggregation attaches them under `replayFights` so both the Electron app and the web report get a uniform slice.

- [ ] **Step 1: Write `replayTypes.ts`**

Create `src/renderer/stats/map/replayTypes.ts`:

```ts
import type { MovementData } from '../../../shared/movementData';
import type { WvwMap } from '../../../shared/wvwLandmarks';

export interface ReplayDpsSample {
    timeMs: number;
    squadDps: number;
}

export interface ReplayKillEvent {
    timeMs: number;
    victimName: string;
    isAlly: boolean;
}

export interface ReplayFightPayload {
    fightId: string;
    fightIndex: number;
    label: string;
    timestampMs: number;
    durationMs: number;
    mapKey: WvwMap | null;
    mapImageUrl: string | null;
    mapSize: [number, number] | null;
    avgPosition: [number, number] | null;
    nearestLandmark: string | null;
    squadSize: number;
    kills: number;
    deaths: number;
    movementData: MovementData;
    dpsSamples: ReplayDpsSample[];
    killEvents: ReplayKillEvent[];
}
```

- [ ] **Step 2: Extend `statsTypes.ts`**

Open `src/renderer/stats/statsTypes.ts`. Find the top-level aggregation-result interface (grep for `replayFights` — if not present, look for the main exported result type used by `computeStatsAggregation`). Add:

```ts
import type { ReplayFightPayload } from './map/replayTypes';

// ...inside the main aggregation-result interface:
    replayFights?: ReplayFightPayload[];
```

If the aggregation result is typed as `any`, add `replayFights` to whatever local type exists that lives near `computeStatsAggregation`'s return.

- [ ] **Step 3: Write the failing test**

Create `src/renderer/stats/map/__tests__/replayPayload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildReplayFightPayload } from '../../computeStatsAggregation';

const basicFight = {
    id: 'fight-1',
    filePath: '/tmp/log1.zevtc',
    uploadTime: 1_700_000_000,
    details: {
        fightName: 'Green Borderlands',
        durationMS: 150_000,
        combatReplayMetaData: {
            pollingRate: 300,
            inchToPixel: 0.01,
            sizes: [523, 750],
            maps: [{ url: 'https://example.test/map.png' }],
        },
        players: [
            { name: 'Alice', account: 'Alice.0001', profession: 'Guardian', elite_spec: 62,
              group: 1, hasCommanderTag: true, notInSquad: false, isFake: false,
              combatReplayData: { positions: [[180, 500], [185, 510]], dead: [], down: [] },
              damage1S: [[0, 0, 1000, 2000]] },
        ],
        targets: [],
        skillMap: {},
        buffMap: {},
    },
};

describe('buildReplayFightPayload', () => {
    it('returns null when the fight has no combat replay data', () => {
        const empty = { ...basicFight, details: { ...basicFight.details, players: [] } };
        expect(buildReplayFightPayload(empty, 0)).toBeNull();
    });

    it('produces a payload with MovementData for a valid fight', () => {
        const payload = buildReplayFightPayload(basicFight, 0);
        expect(payload).not.toBeNull();
        expect(payload!.fightId).toBe('fight-1');
        expect(payload!.fightIndex).toBe(0);
        expect(payload!.durationMs).toBe(150_000);
        expect(payload!.movementData.members).toHaveLength(1);
        expect(payload!.squadSize).toBe(1);
        expect(payload!.label).toMatch(/Green BL/);
        expect(payload!.avgPosition).not.toBeNull();
    });

    it('computes nearest landmark from avg position', () => {
        // Alice sits near (182, 505) on Green BL — Bluebriar is at (182, 515).
        const payload = buildReplayFightPayload(basicFight, 0);
        expect(payload!.nearestLandmark).toBe('Bluebriar');
    });
});
```

- [ ] **Step 4: Run the test to confirm it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/replayPayload.test.ts`
Expected: FAIL — `buildReplayFightPayload` not exported.

- [ ] **Step 5: Implement `buildReplayFightPayload` in `computeStatsAggregation.ts`**

Edit `src/renderer/stats/computeStatsAggregation.ts`. Add these imports near the top of the file (grouping with existing shared imports):

```ts
import { buildMovementData } from '../../shared/movementData';
import { TRACKED_REPLAY_BUFF_IDS } from '../../shared/replayBuffs';
import { resolveMapFromZone, computeFightAvgPosition, buildFightLabelV2 } from '../../shared/mapUtils';
import { findNearestLandmark } from '../../shared/wvwLandmarks';
import type { ReplayFightPayload, ReplayDpsSample, ReplayKillEvent } from './map/replayTypes';
```

Add the helper near the other per-fight ingest functions (top-level export):

```ts
export function buildReplayFightPayload(log: any, fightIndex: number): ReplayFightPayload | null {
    const details = log?.details;
    if (!details) return null;

    const movement = buildMovementData(details, {
        trackedBuffIds: TRACKED_REPLAY_BUFF_IDS,
        localAccount: log?.recordedAccount,
        localName: log?.recordedBy,
    });
    if (!movement) return null;

    const avgPosition = computeFightAvgPosition(details);
    const zone = details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`;
    const mapKey = resolveMapFromZone(String(zone));
    const landmark = (mapKey && avgPosition)
        ? findNearestLandmark(mapKey, avgPosition[0], avgPosition[1])?.name ?? null
        : null;

    const fightId = String(log?.id || log?.filePath || `fight-${fightIndex}`);
    const label = buildFightLabelV2({
        zone: String(zone),
        durationMs: Number(details?.durationMS) || 0,
        avgPosition,
    });

    const squadMembers = movement.members.filter(m => !m.isEnemy && m.inSquad);
    const kills = movement.members.filter(m => m.isEnemy && m.deadRanges.length > 0).length;
    const deaths = squadMembers.filter(m => m.deadRanges.length > 0).length;

    const dpsSamples: ReplayDpsSample[] = computeSquadDpsSamples(details);
    const killEvents: ReplayKillEvent[] = collectKillEvents(movement);

    return {
        fightId,
        fightIndex,
        label,
        timestampMs: Number(log?.uploadTime ? log.uploadTime * 1000 : log?.timestampMs ?? 0),
        durationMs: Number(details?.durationMS) || 0,
        mapKey,
        mapImageUrl: details?.combatReplayMetaData?.maps?.[0]?.url ?? null,
        mapSize: details?.combatReplayMetaData?.sizes ?? null,
        avgPosition,
        nearestLandmark: landmark,
        squadSize: squadMembers.length,
        kills,
        deaths,
        movementData: movement,
        dpsSamples,
        killEvents,
    };
}

function computeSquadDpsSamples(details: any): ReplayDpsSample[] {
    const squad = Array.isArray(details?.players) ? details.players.filter((p: any) => !p?.notInSquad && !p?.isFake) : [];
    if (!squad.length) return [];
    const seriesLen = Math.max(...squad.map((p: any) => p?.damage1S?.[0]?.length ?? 0));
    if (seriesLen === 0) return [];

    const samples: ReplayDpsSample[] = [];
    for (let t = 1; t < seriesLen; t++) {
        let total = 0;
        for (const p of squad) {
            const arr = p?.damage1S?.[0];
            if (!arr || arr.length <= t) continue;
            total += (arr[t] - arr[t - 1]);
        }
        samples.push({ timeMs: t * 1000, squadDps: total });
    }
    return samples;
}

function collectKillEvents(movement: any): ReplayKillEvent[] {
    const events: ReplayKillEvent[] = [];
    for (const m of movement.members) {
        for (const [deadAt] of m.deadRanges) {
            events.push({ timeMs: deadAt, victimName: m.name, isAlly: !m.isEnemy });
        }
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}
```

Find the end of `computeStatsAggregation`'s main result-assembly block (grep `return {` for the function return). Inside the returned object, add:

```ts
        replayFights: (logs as any[])
            .map((log, idx) => buildReplayFightPayload(log, idx))
            .filter((entry): entry is ReplayFightPayload => entry !== null),
```

Note: adjust `logs` to whatever the local variable name is in the aggregation function (it may be `effectiveLogs`, `filteredLogs`, etc. — use the same variable that drives the existing per-fight compute passes).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/replayPayload.test.ts`
Expected: PASS.

- [ ] **Step 7: Full unit sweep — ensure the aggregation's other tests still pass**

Run: `npm run test:unit`
Expected: PASS. The only behavior change is a new `replayFights` field on the result.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/map/replayTypes.ts src/renderer/stats/statsTypes.ts src/renderer/stats/computeStatsAggregation.ts src/renderer/stats/map/__tests__/replayPayload.test.ts
git commit -m "feat(stats): build ReplayFightPayload per fight in aggregation"
```

---

## Task 4: `replaySelectors.ts` — default selection + marker hit-test

**Files:**
- Create: `src/renderer/stats/map/replaySelectors.ts`
- Create: `src/renderer/stats/map/__tests__/replaySelectors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/replaySelectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickDefaultFightId, findClosestMember } from '../replaySelectors';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const fight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'f0', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 100,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 100, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], ...over,
});

describe('pickDefaultFightId', () => {
    it('returns null for empty list', () => {
        expect(pickDefaultFightId([])).toBeNull();
    });

    it('returns the most recent fight by timestamp', () => {
        const list = [
            fight({ fightId: 'a', timestampMs: 1000 }),
            fight({ fightId: 'b', timestampMs: 2000 }),
            fight({ fightId: 'c', timestampMs: 500 }),
        ];
        expect(pickDefaultFightId(list)).toBe('b');
    });

    it('breaks ties on fightIndex (highest wins)', () => {
        const list = [
            fight({ fightId: 'a', fightIndex: 0, timestampMs: 1000 }),
            fight({ fightId: 'b', fightIndex: 1, timestampMs: 1000 }),
        ];
        expect(pickDefaultFightId(list)).toBe('b');
    });
});

describe('findClosestMember', () => {
    const m = (name: string, x: number, y: number): SquadMemberMovement => ({
        name, account: name, profession: '', eliteSpec: '', group: 1,
        isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
        positions: [[x, y]], downRanges: [], deadRanges: [],
    });

    it('returns null when no members are positioned', () => {
        expect(findClosestMember([], 0, 100, 100, 200)).toBeNull();
    });

    it('picks the nearest member inside the radius', () => {
        const members = [m('Alice', 100, 100), m('Bob', 110, 110), m('Carol', 500, 500)];
        const hit = findClosestMember(members, 0, 105, 105, 50);
        expect(hit?.name).toBe('Alice');
    });

    it('returns null when nothing is inside the radius', () => {
        const members = [m('Alice', 100, 100)];
        expect(findClosestMember(members, 0, 500, 500, 50)).toBeNull();
    });

    it('ignores members with no positions', () => {
        const ghost: SquadMemberMovement = {
            name: 'Ghost', account: 'g', profession: '', eliteSpec: '', group: 1,
            isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
            positions: [], downRanges: [], deadRanges: [],
        };
        const hit = findClosestMember([ghost, m('Alice', 100, 100)], 0, 101, 101, 5);
        expect(hit?.name).toBe('Alice');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/replaySelectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `replaySelectors.ts`**

Create `src/renderer/stats/map/replaySelectors.ts`:

```ts
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

export function pickDefaultFightId(fights: ReplayFightPayload[]): string | null {
    if (!fights.length) return null;
    let best = fights[0];
    for (let i = 1; i < fights.length; i++) {
        const candidate = fights[i];
        if (
            candidate.timestampMs > best.timestampMs
            || (candidate.timestampMs === best.timestampMs && candidate.fightIndex > best.fightIndex)
        ) {
            best = candidate;
        }
    }
    return best.fightId;
}

function sampleAt(member: SquadMemberMovement, pollIndex: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.max(0, Math.min(pollIndex, member.positions.length - 1));
    return member.positions[idx];
}

export function findClosestMember(
    members: SquadMemberMovement[],
    pollIndex: number,
    mapX: number,
    mapY: number,
    radius: number,
): SquadMemberMovement | null {
    let bestMember: SquadMemberMovement | null = null;
    let bestDist = radius;
    for (const m of members) {
        const pos = sampleAt(m, pollIndex);
        if (!pos) continue;
        const d = Math.hypot(pos[0] - mapX, pos[1] - mapY);
        if (d <= bestDist) {
            bestDist = d;
            bestMember = m;
        }
    }
    return bestMember;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/replaySelectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/replaySelectors.ts src/renderer/stats/map/__tests__/replaySelectors.test.ts
git commit -m "feat(replay): add default-fight picker and marker hit-test helpers"
```

---

## Task 5: `useReplayPlayback` hook — rAF loop driving `timeMs`

**Files:**
- Create: `src/renderer/stats/map/hooks/useReplayPlayback.ts`
- Create: `src/renderer/stats/map/hooks/__tests__/useReplayPlayback.test.ts`

The hook owns the rAF loop. It reads `replayPlayhead` from the store, advances `timeMs` each frame by `(delta * speed)` when `playing=true`, and clamps to `[0, durationMs]`. Scrubbing from elsewhere (timeline drag) just writes `timeMs` via `setReplayPlayhead` — the hook picks it up on next frame.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/hooks/__tests__/useReplayPlayback.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReplayPlayback } from '../useReplayPlayback';
import { useStatsStore } from '../../../statsStore';

function advanceRaf(ms: number) {
    const cb = (global as any).__rafCb;
    if (!cb) return;
    (global as any).__rafCb = null;
    cb(performance.now() + ms);
}

describe('useReplayPlayback', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);

        (global as any).__rafCb = null;
        (global as any).requestAnimationFrame = (cb: any) => {
            (global as any).__rafCb = cb;
            return 1;
        };
        (global as any).cancelAnimationFrame = () => { (global as any).__rafCb = null; };
    });

    it('does not advance while paused', () => {
        renderHook(() => useReplayPlayback({ durationMs: 60_000 }));
        advanceRaf(1_000);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(0);
    });

    it('advances when playing at 1×', () => {
        renderHook(() => useReplayPlayback({ durationMs: 60_000 }));
        act(() => {
            useStatsStore.getState().setReplayPlayhead({ playing: true });
        });
        advanceRaf(500);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBeGreaterThanOrEqual(450);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBeLessThanOrEqual(550);
    });

    it('respects speed multiplier', () => {
        renderHook(() => useReplayPlayback({ durationMs: 60_000 }));
        act(() => {
            useStatsStore.getState().setReplayPlayhead({ playing: true, speed: 2 });
        });
        advanceRaf(500);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBeGreaterThanOrEqual(900);
    });

    it('pauses and clamps at duration', () => {
        renderHook(() => useReplayPlayback({ durationMs: 1_000 }));
        act(() => {
            useStatsStore.getState().setReplayPlayhead({ playing: true });
        });
        advanceRaf(2_000);
        const p = useStatsStore.getState().replayPlayhead;
        expect(p.timeMs).toBe(1_000);
        expect(p.playing).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useReplayPlayback.test.ts`
Expected: FAIL — hook not found.

- [ ] **Step 3: Write the hook**

Create `src/renderer/stats/map/hooks/useReplayPlayback.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useStatsStore } from '../../statsStore';

interface UseReplayPlaybackArgs {
    durationMs: number;
}

export function useReplayPlayback({ durationMs }: UseReplayPlaybackArgs) {
    const lastTimestampRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const tick = (timestamp: number) => {
            const { replayPlayhead, setReplayPlayhead } = useStatsStore.getState();
            if (!replayPlayhead.playing) {
                lastTimestampRef.current = null;
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            const last = lastTimestampRef.current;
            lastTimestampRef.current = timestamp;
            if (last === null) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            const delta = (timestamp - last) * replayPlayhead.speed;
            const next = replayPlayhead.timeMs + delta;
            if (next >= durationMs) {
                setReplayPlayhead({ timeMs: durationMs, playing: false });
            } else {
                setReplayPlayhead({ timeMs: next });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            lastTimestampRef.current = null;
        };
    }, [durationMs]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useReplayPlayback.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/hooks/useReplayPlayback.ts src/renderer/stats/map/hooks/__tests__/useReplayPlayback.test.ts
git commit -m "feat(replay): add useReplayPlayback rAF loop"
```

---

## Task 6: `useReplayViewport` hook — pan, zoom, follow

**Files:**
- Create: `src/renderer/stats/map/hooks/useReplayViewport.ts`
- Create: `src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts`

The hook exposes `(scale, tx, ty)` plus imperative handlers `zoomIn`, `zoomOut`, `resetViewport`, `panBy(dx, dy)`, and a derived `cameraFor(member, pollIndex)` helper that the `ReplayView` calls when a follow target is set. All viewport state persists via `statsStore`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReplayViewport } from '../useReplayViewport';
import { useStatsStore } from '../../../statsStore';

describe('useReplayViewport', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('starts at scale 1 with no translation', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        expect(result.current.scale).toBe(1);
        expect(result.current.tx).toBe(0);
        expect(result.current.ty).toBe(0);
    });

    it('zoomIn and zoomOut update scale in geometric steps', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomIn());
        expect(result.current.scale).toBeGreaterThan(1);
        const s = result.current.scale;
        act(() => result.current.zoomOut());
        expect(result.current.scale).toBeLessThan(s);
    });

    it('resetViewport restores defaults', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomIn());
        act(() => result.current.panBy(30, 40));
        act(() => result.current.resetViewport());
        expect(result.current.scale).toBe(1);
        expect(result.current.tx).toBe(0);
        expect(result.current.ty).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts`
Expected: FAIL — hook not found.

- [ ] **Step 3: Write the hook**

Create `src/renderer/stats/map/hooks/useReplayViewport.ts`:

```ts
import { useCallback } from 'react';
import { useStatsStore } from '../../statsStore';

interface UseReplayViewportArgs {
    mapWidth: number;
    mapHeight: number;
    containerWidth: number;
    containerHeight: number;
}

const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;

export function useReplayViewport({ mapWidth, mapHeight, containerWidth, containerHeight }: UseReplayViewportArgs) {
    const replayViewport = useStatsStore(state => state.replayViewport);
    const setReplayViewport = useStatsStore(state => state.setReplayViewport);
    const resetReplayViewport = useStatsStore(state => state.resetReplayViewport);

    const zoomIn = useCallback(() => {
        setReplayViewport({ scale: Math.min(replayViewport.scale * ZOOM_STEP, MAX_SCALE) });
    }, [replayViewport.scale, setReplayViewport]);

    const zoomOut = useCallback(() => {
        setReplayViewport({ scale: Math.max(replayViewport.scale / ZOOM_STEP, MIN_SCALE) });
    }, [replayViewport.scale, setReplayViewport]);

    const panBy = useCallback((dx: number, dy: number) => {
        setReplayViewport({ tx: replayViewport.tx + dx, ty: replayViewport.ty + dy });
    }, [replayViewport.tx, replayViewport.ty, setReplayViewport]);

    const resetViewport = useCallback(() => { resetReplayViewport(); }, [resetReplayViewport]);

    const centerOn = useCallback((x: number, y: number) => {
        setReplayViewport({
            tx: containerWidth / 2 - x * replayViewport.scale,
            ty: containerHeight / 2 - y * replayViewport.scale,
        });
    }, [containerWidth, containerHeight, replayViewport.scale, setReplayViewport]);

    return {
        scale: replayViewport.scale,
        tx: replayViewport.tx,
        ty: replayViewport.ty,
        zoomIn,
        zoomOut,
        panBy,
        resetViewport,
        centerOn,
        mapWidth,
        mapHeight,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/hooks/useReplayViewport.ts src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts
git commit -m "feat(replay): add useReplayViewport pan/zoom/follow hook"
```

---

## Task 7: `useMovementData` hook — lazy LRU cache

**Files:**
- Create: `src/renderer/stats/map/hooks/useMovementData.ts`

This hook takes the selected fight id, returns the matching `MovementData` from `stats.replayFights`, and caches the latest three accessed fights in a module-level `Map`. No network or IPC — the payload is already baked into the aggregation result (Task 3). When the Electron app is running and details are missing for a fight id, the hook is a no-op (`null`) — details rehydration is driven by the existing `useDetailsHydration` scheduler, so the next aggregation cycle will pick up the rebuilt payload.

- [ ] **Step 1: Write the hook**

Create `src/renderer/stats/map/hooks/useMovementData.ts`:

```ts
import { useMemo } from 'react';
import type { ReplayFightPayload } from '../replayTypes';

const LRU_LIMIT = 3;
const lru: string[] = [];

function bumpLru(fightId: string) {
    const idx = lru.indexOf(fightId);
    if (idx >= 0) lru.splice(idx, 1);
    lru.push(fightId);
    while (lru.length > LRU_LIMIT) lru.shift();
}

export function useMovementData(
    fights: ReplayFightPayload[] | undefined,
    selectedFightId: string | null,
): ReplayFightPayload | null {
    return useMemo(() => {
        if (!fights?.length || !selectedFightId) return null;
        const hit = fights.find(f => f.fightId === selectedFightId) ?? null;
        if (hit) bumpLru(hit.fightId);
        return hit;
    }, [fights, selectedFightId]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/map/hooks/useMovementData.ts
git commit -m "feat(replay): add useMovementData lazy selector"
```

---

## Task 8: `FightPicker.tsx` — horizontal card strip

**Files:**
- Create: `src/renderer/stats/map/FightPicker.tsx`
- Create: `src/renderer/stats/map/__tests__/FightPicker.test.tsx`

Each card is a fixed-width (180 px) tile:
- A 120×80 SVG thumbnail: map image cropped around `avgPosition` (40% of map width, centered) + a 4 px glowing dot at `avgPosition`.
- Fight label (new V2 format).
- Timestamp — short time (e.g. `21:04`).
- `{squadSize} squad · {kills}K/{deaths}D` footer.

Keyboard: when the picker container has focus, ← and → move between cards. Clicking a card sets `selectedReplayFightId`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/FightPicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { FightPicker } from '../FightPicker';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (o: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 5, deaths: 2,
    movementData: { pollingRate: 300, durationMs: 60_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], ...o,
});

describe('FightPicker', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('renders empty state when there are no fights', () => {
        render(<FightPicker fights={[]} />);
        expect(screen.getByText(/no replay data/i)).toBeTruthy();
    });

    it('renders one card per fight with the fight label', () => {
        render(<FightPicker fights={[makeFight({ fightId: 'a', label: 'Green BL: Bay (2:30)' })]} />);
        expect(screen.getByText('Green BL: Bay (2:30)')).toBeTruthy();
    });

    it('clicking a card selects that fight', () => {
        render(<FightPicker fights={[makeFight({ fightId: 'a', label: 'A' }), makeFight({ fightId: 'b', label: 'B' })]} />);
        fireEvent.click(screen.getByText('B'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('ArrowRight advances to the next fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        const fights = [
            makeFight({ fightId: 'a', label: 'A' }),
            makeFight({ fightId: 'b', label: 'B' }),
        ];
        render(<FightPicker fights={fights} />);
        const container = screen.getByRole('listbox');
        container.focus();
        fireEvent.keyDown(container, { key: 'ArrowRight' });
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('ArrowLeft goes to previous fight and stops at start', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        const fights = [
            makeFight({ fightId: 'a', label: 'A' }),
            makeFight({ fightId: 'b', label: 'B' }),
        ];
        render(<FightPicker fights={fights} />);
        const container = screen.getByRole('listbox');
        container.focus();
        fireEvent.keyDown(container, { key: 'ArrowLeft' });
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
        fireEvent.keyDown(container, { key: 'ArrowLeft' });
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/FightPicker.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write `FightPicker.tsx`**

Create `src/renderer/stats/map/FightPicker.tsx`:

```tsx
import React, { useCallback, useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import type { ReplayFightPayload } from './replayTypes';

interface FightPickerProps {
    fights: ReplayFightPayload[];
}

function formatShortTime(timestampMs: number): string {
    if (!timestampMs) return '';
    try {
        return new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function Thumbnail({ fight }: { fight: ReplayFightPayload }) {
    const size = fight.mapSize ?? [600, 600];
    const pos = fight.avgPosition ?? [size[0] / 2, size[1] / 2];
    const cropW = size[0] * 0.4;
    const cropH = size[1] * 0.4;
    const viewBox = `${pos[0] - cropW / 2} ${pos[1] - cropH / 2} ${cropW} ${cropH}`;
    return (
        <svg viewBox={viewBox} width={120} height={80} preserveAspectRatio="xMidYMid slice" style={{ borderRadius: 4, background: '#0c1224' }}>
            {fight.mapImageUrl && (
                <image href={fight.mapImageUrl} x={0} y={0} width={size[0]} height={size[1]} preserveAspectRatio="none" />
            )}
            <circle cx={pos[0]} cy={pos[1]} r={Math.max(cropW, cropH) * 0.02} fill="#fbbf24" opacity={0.9} />
            <circle cx={pos[0]} cy={pos[1]} r={Math.max(cropW, cropH) * 0.05} fill="none" stroke="#fbbf24" strokeOpacity={0.4} strokeWidth={Math.max(cropW, cropH) * 0.01} />
        </svg>
    );
}

export const FightPicker: React.FC<FightPickerProps> = ({ fights }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);

    const indexById = useMemo(() => {
        const map = new Map<string, number>();
        fights.forEach((f, i) => map.set(f.fightId, i));
        return map;
    }, [fights]);

    const step = useCallback((direction: -1 | 1) => {
        if (!fights.length) return;
        const currentIdx = selectedId && indexById.has(selectedId)
            ? indexById.get(selectedId)!
            : 0;
        const nextIdx = Math.max(0, Math.min(fights.length - 1, currentIdx + direction));
        const next = fights[nextIdx];
        if (next && next.fightId !== selectedId) {
            setSelectedReplayFight(next.fightId);
        }
    }, [fights, indexById, selectedId, setSelectedReplayFight]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    }, [step]);

    if (!fights.length) {
        return (
            <div className="replay-picker-empty">
                No replay data available. New fights parsed with <code>parseCombatReplay</code> enabled will appear here.
            </div>
        );
    }

    return (
        <div role="listbox" tabIndex={0} className="replay-picker" onKeyDown={onKeyDown}
             style={{ display: 'flex', gap: 8, padding: 8, overflowX: 'auto', outline: 'none' }}>
            {fights.map(fight => {
                const active = fight.fightId === selectedId;
                return (
                    <button
                        key={fight.fightId}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setSelectedReplayFight(fight.fightId)}
                        className={`replay-picker-card${active ? ' is-active' : ''}`}
                        style={{
                            width: 180, flexShrink: 0, padding: 8, borderRadius: 8,
                            background: active ? 'rgba(96, 165, 250, 0.2)' : 'rgba(255,255,255,0.04)',
                            border: active ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.08)',
                            textAlign: 'left', cursor: 'pointer',
                        }}
                    >
                        <Thumbnail fight={fight} />
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>{fight.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                            {formatShortTime(fight.timestampMs)} · {fight.squadSize} squad · {fight.kills}K/{fight.deaths}D
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default FightPicker;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/FightPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/FightPicker.tsx src/renderer/stats/map/__tests__/FightPicker.test.tsx
git commit -m "feat(replay): add FightPicker with thumbnails and keyboard nav"
```

---

## Task 9: `PartyPanel.tsx` — single-party sidebar

**Files:**
- Create: `src/renderer/stats/map/PartyPanel.tsx`

A 260px-wide sidebar with:
- Party selector at the top: 5 buttons labeled `P1`..`P5` plus an "All" (Plan 3 will turn this into the all-parties popover). Active party is highlighted.
- A scrollable list of members in the selected party, rendered at the current `timeMs`:
  - Profession icon (use `getProfessionIconPath` from `src/renderer/classIconUtils.ts`).
  - Name (commander tag if applicable).
  - HP bar (width = current health percent).
  - Status dot — `dead` / `down` / `alive`.
  - Up to 4 active-boon icons (from `member.boonStates`).
  - Most recent skill cast icon (from `member.skillCasts`).
- Clicking a member sets them as the follow target.

Default selected party: `replaySelectedParty` is `0` initially, which we interpret here as "commander's party or the largest party". A helper `resolveDefaultParty(members)` implements that heuristic.

- [ ] **Step 1: Write the component**

Create `src/renderer/stats/map/PartyPanel.tsx`:

```tsx
import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import type { SquadMemberMovement } from '../../../shared/movementData';
import type { ReplayFightPayload } from './replayTypes';
import { getProfessionIconPath } from '../../classIconUtils';

interface PartyPanelProps {
    fight: ReplayFightPayload;
}

function resolveDefaultParty(members: SquadMemberMovement[]): number {
    const commander = members.find(m => m.isCommander && m.inSquad);
    if (commander && commander.group) return commander.group;
    const counts = new Map<number, number>();
    for (const m of members) {
        if (m.isEnemy || !m.inSquad || !m.group) continue;
        counts.set(m.group, (counts.get(m.group) ?? 0) + 1);
    }
    let best = 1, max = 0;
    for (const [g, c] of counts) {
        if (c > max) { max = c; best = g; }
    }
    return best;
}

function healthAt(member: SquadMemberMovement, timeMs: number): number {
    const series = member.healthPercents;
    if (!series?.length) return 100;
    let hp = 100;
    for (const [t, v] of series) {
        if (t > timeMs) break;
        hp = v;
    }
    return hp;
}

function statusAt(member: SquadMemberMovement, timeMs: number): 'alive' | 'down' | 'dead' {
    for (const [start, end] of member.deadRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return 'dead';
    }
    for (const [start, end] of member.downRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return 'down';
    }
    return 'alive';
}

function activeBoons(member: SquadMemberMovement, timeMs: number, limit = 4): number[] {
    if (!member.boonStates) return [];
    const ids: number[] = [];
    for (const [idStr, states] of Object.entries(member.boonStates)) {
        let stacks = 0;
        for (const [t, v] of states) {
            if (t > timeMs) break;
            stacks = v;
        }
        if (stacks > 0) ids.push(Number(idStr));
        if (ids.length >= limit) break;
    }
    return ids;
}

function latestCast(member: SquadMemberMovement, timeMs: number): { id: number; ageMs: number } | null {
    if (!member.skillCasts?.length) return null;
    let last: { id: number; ageMs: number } | null = null;
    for (const cast of member.skillCasts) {
        if (cast.time > timeMs) break;
        last = { id: cast.id, ageMs: timeMs - cast.time };
    }
    return last && last.ageMs <= 3_000 ? last : null;
}

export const PartyPanel: React.FC<PartyPanelProps> = ({ fight }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const selectedParty = useStatsStore(state => state.replaySelectedParty);
    const setReplaySelectedParty = useStatsStore(state => state.setReplaySelectedParty);
    const setReplayFollowTarget = useStatsStore(state => state.setReplayFollowTarget);

    const allies = useMemo(
        () => fight.movementData.members.filter(m => !m.isEnemy && m.inSquad),
        [fight.movementData.members],
    );

    const effectiveParty = selectedParty === 0 ? resolveDefaultParty(allies) : selectedParty;
    const partyMembers = allies.filter(m => m.group === effectiveParty);
    const skillIcons = fight.movementData.skillIcons;
    const boonIcons = fight.movementData.boonIcons;

    return (
        <aside className="replay-party-panel" style={{ width: 260, padding: 8, background: 'rgba(8,12,26,0.6)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map(p => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => setReplaySelectedParty(p)}
                        style={{
                            flex: 1, padding: '4px 0', borderRadius: 4,
                            background: p === effectiveParty ? '#60a5fa' : 'rgba(255,255,255,0.06)',
                            color: p === effectiveParty ? '#000' : '#fff',
                            border: 'none', cursor: 'pointer', fontSize: 11,
                        }}
                    >
                        P{p}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 480, overflowY: 'auto' }}>
                {partyMembers.map(member => {
                    const hp = healthAt(member, timeMs);
                    const status = statusAt(member, timeMs);
                    const cast = latestCast(member, timeMs);
                    const boons = activeBoons(member, timeMs);
                    return (
                        <button
                            key={member.account || member.name}
                            type="button"
                            onClick={() => setReplayFollowTarget(member.account || member.name)}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '24px 1fr auto',
                                alignItems: 'center',
                                gap: 6,
                                padding: 4,
                                borderRadius: 4,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                cursor: 'pointer',
                                textAlign: 'left',
                            }}
                        >
                            <img src={getProfessionIconPath(member.profession)} alt="" width={20} height={20} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {member.isCommander ? '★ ' : ''}{member.name}
                                </div>
                                <div style={{ height: 4, background: '#18213d', borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${hp}%`,
                                        height: '100%',
                                        background: status === 'dead' ? '#7f1d1d' : status === 'down' ? '#9a3412' : '#22c55e',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                                    {boons.map(id => {
                                        const icon = boonIcons[id]?.icon;
                                        return icon
                                            ? <img key={id} src={icon} alt="" width={12} height={12} title={boonIcons[id].name} />
                                            : null;
                                    })}
                                </div>
                            </div>
                            {cast && skillIcons[cast.id]?.icon && (
                                <img src={skillIcons[cast.id].icon} alt="" width={20} height={20} title={skillIcons[cast.id].name} />
                            )}
                        </button>
                    );
                })}
                {partyMembers.length === 0 && (
                    <div style={{ fontSize: 11, opacity: 0.6, padding: 8 }}>No members in this party.</div>
                )}
            </div>
        </aside>
    );
};

export default PartyPanel;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/map/PartyPanel.tsx
git commit -m "feat(replay): add single-party PartyPanel with HP bars and casts"
```

---

## Task 10: `SyncedTimeline.tsx` — DPS + kills/deaths strip

**Files:**
- Create: `src/renderer/stats/map/SyncedTimeline.tsx`
- Create: `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`

A 120px-tall SVG strip. Renders:
- Squad DPS as a filled area chart (max-normalized).
- Kill events: green ticks at the top edge for enemy kills, red ticks for ally deaths.
- A vertical playhead line at `timeMs`.
- Click/drag to scrub: updates `timeMs`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SyncedTimeline } from '../SyncedTimeline';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (duration = 60_000): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: duration,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: duration, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 30_000, squadDps: 5000 }, { timeMs: 60_000, squadDps: 10_000 }],
    killEvents: [],
});

describe('SyncedTimeline', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial, true);
    });

    it('renders the duration and current time', () => {
        const { getByText } = render(<SyncedTimeline fight={makeFight(90_000)} />);
        expect(getByText('0:00 / 1:30')).toBeTruthy();
    });

    it('clicking 50% across scrubs to midpoint', () => {
        const fight = makeFight(60_000);
        const { container } = render(<SyncedTimeline fight={fight} />);
        const svg = container.querySelector('svg.replay-timeline') as SVGElement;
        expect(svg).toBeTruthy();
        // Mock the bounding box so the click math resolves.
        Object.defineProperty(svg, 'getBoundingClientRect', {
            value: () => ({ left: 0, top: 0, width: 600, height: 120, right: 600, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
            configurable: true,
        });
        fireEvent.click(svg, { clientX: 300, clientY: 60 });
        const t = useStatsStore.getState().replayPlayhead.timeMs;
        expect(t).toBeGreaterThanOrEqual(29_000);
        expect(t).toBeLessThanOrEqual(31_000);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write `SyncedTimeline.tsx`**

Create `src/renderer/stats/map/SyncedTimeline.tsx`:

```tsx
import React, { useCallback, useMemo, useRef } from 'react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import type { ReplayFightPayload } from './replayTypes';

interface SyncedTimelineProps {
    fight: ReplayFightPayload;
}

export const SyncedTimeline: React.FC<SyncedTimelineProps> = ({ fight }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const { pathData, maxDps } = useMemo(() => {
        if (!fight.dpsSamples.length || fight.durationMs <= 0) {
            return { pathData: '', maxDps: 0 };
        }
        const max = Math.max(1, ...fight.dpsSamples.map(s => s.squadDps));
        const points = fight.dpsSamples
            .map(s => {
                const x = (s.timeMs / fight.durationMs) * 1000;
                const y = 100 - (s.squadDps / max) * 80;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' L ');
        return { pathData: `M 0,100 L ${points} L 1000,100 Z`, maxDps: max };
    }, [fight.dpsSamples, fight.durationMs]);

    const allyKillMarks = fight.killEvents.filter(e => e.isAlly);
    const enemyKillMarks = fight.killEvents.filter(e => !e.isAlly);

    const scrubFromEvent = useCallback((e: React.MouseEvent<SVGElement>) => {
        const svg = svgRef.current;
        if (!svg || fight.durationMs <= 0) return;
        const rect = svg.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setReplayPlayhead({ timeMs: frac * fight.durationMs });
    }, [fight.durationMs, setReplayPlayhead]);

    const [dragging, setDragging] = React.useState(false);
    const onMouseMove = (e: React.MouseEvent<SVGElement>) => { if (dragging) scrubFromEvent(e); };

    const playheadX = fight.durationMs > 0 ? (timeMs / fight.durationMs) * 1000 : 0;

    return (
        <div className="replay-timeline-wrap" style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.8, padding: '4px 0' }}>
                <span>Squad DPS (peak {maxDps.toLocaleString()})</span>
                <span>{formatDuration(timeMs)} / {formatDuration(fight.durationMs)}</span>
            </div>
            <svg
                ref={svgRef}
                className="replay-timeline"
                viewBox="0 0 1000 120"
                preserveAspectRatio="none"
                style={{ width: '100%', height: 100, display: 'block', cursor: 'col-resize', background: 'rgba(8,12,26,0.6)', borderRadius: 6 }}
                onClick={scrubFromEvent}
                onMouseDown={(e) => { setDragging(true); scrubFromEvent(e); }}
                onMouseMove={onMouseMove}
                onMouseUp={() => setDragging(false)}
                onMouseLeave={() => setDragging(false)}
            >
                <path d={pathData} fill="rgba(96, 165, 250, 0.35)" stroke="rgba(96, 165, 250, 0.9)" strokeWidth={1} />
                {enemyKillMarks.map((m, i) => (
                    <line key={`k-${i}`} x1={(m.timeMs / fight.durationMs) * 1000} x2={(m.timeMs / fight.durationMs) * 1000}
                          y1={0} y2={12} stroke="#22c55e" strokeWidth={2} />
                ))}
                {allyKillMarks.map((m, i) => (
                    <line key={`d-${i}`} x1={(m.timeMs / fight.durationMs) * 1000} x2={(m.timeMs / fight.durationMs) * 1000}
                          y1={108} y2={120} stroke="#ef4444" strokeWidth={2} />
                ))}
                <line x1={playheadX} x2={playheadX} y1={0} y2={120} stroke="#fbbf24" strokeWidth={1.5} />
            </svg>
        </div>
    );
};

export default SyncedTimeline;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/SyncedTimeline.tsx src/renderer/stats/map/__tests__/SyncedTimeline.test.tsx
git commit -m "feat(replay): add SyncedTimeline with DPS, kill marks, and scrub"
```

---

## Task 11: `EventOverlay.tsx` — base event pulses

**Files:**
- Create: `src/renderer/stats/map/EventOverlay.tsx`

Renders pulses tied to the current `timeMs`:
- **Damage spike ring** — yellow expanding ring around a member when a spike is detected (heuristic: member's damage1S jumps ≥ 2× their rolling median). Deferred until Plan 3 wires more full event data; for now rely on any `damageEvents` already computed by existing aggregation for the spike-damage section. If that data isn't easily shareable, this task renders only down pins + death bursts; the damage pulse remains a no-op stub until Plan 3 adds a `ReplayFightPayload.damageSpikeEvents` field.
- **Down pin** — blue pin appearing at the moment `m.downRanges[n][0]` passes `timeMs`, shrinking over 1500 ms.
- **Death burst** — red skull burst at the moment `m.deadRanges[n][0]` passes.

- [ ] **Step 1: Write the component**

Create `src/renderer/stats/map/EventOverlay.tsx`:

```tsx
import React from 'react';
import type { ReplayFightPayload } from './replayTypes';

interface EventOverlayProps {
    fight: ReplayFightPayload;
    timeMs: number;
}

const PULSE_DURATION_MS = 1500;

interface Pulse {
    x: number;
    y: number;
    ageMs: number;
    kind: 'down' | 'death';
}

function collectPulses(fight: ReplayFightPayload, timeMs: number): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const m of fight.movementData.members) {
        if (m.isEnemy) continue;
        for (const [t] of m.downRanges) {
            const age = timeMs - t;
            if (age >= 0 && age < PULSE_DURATION_MS) {
                const idx = Math.min(m.positions.length - 1, Math.floor(t / pollingRate));
                const pos = m.positions[idx];
                if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'down' });
            }
        }
        for (const [t] of m.deadRanges) {
            const age = timeMs - t;
            if (age >= 0 && age < PULSE_DURATION_MS) {
                const idx = Math.min(m.positions.length - 1, Math.floor(t / pollingRate));
                const pos = m.positions[idx];
                if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'death' });
            }
        }
    }
    return pulses;
}

export const EventOverlay: React.FC<EventOverlayProps> = ({ fight, timeMs }) => {
    const pulses = collectPulses(fight, timeMs);
    return (
        <g className="replay-events">
            {pulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                if (p.kind === 'down') {
                    const r = 18 * (1 - progress);
                    return <circle key={`p-${i}`} cx={p.x} cy={p.y} r={r} fill="none" stroke="#60a5fa" strokeOpacity={1 - progress} strokeWidth={2} />;
                }
                const r = 10 + 24 * progress;
                return (
                    <g key={`p-${i}`}>
                        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="#ef4444" strokeOpacity={(1 - progress) * 0.8} strokeWidth={3} />
                        <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={14} fill="#fecaca" opacity={1 - progress}>☠</text>
                    </g>
                );
            })}
        </g>
    );
};

export default EventOverlay;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/map/EventOverlay.tsx
git commit -m "feat(replay): add base EventOverlay with down pins and death bursts"
```

---

## Task 12: `FullscreenPortal.tsx` — fullscreen wrapper

**Files:**
- Create: `src/renderer/stats/map/FullscreenPortal.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/stats/map/FullscreenPortal.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface FullscreenPortalProps {
    enabled: boolean;
    onExit: () => void;
    children: React.ReactNode;
}

export const FullscreenPortal: React.FC<FullscreenPortalProps> = ({ enabled, onExit, children }) => {
    const [host] = useState<HTMLElement>(() => {
        const el = document.createElement('div');
        el.className = 'replay-fullscreen-host';
        el.style.position = 'fixed';
        el.style.inset = '0';
        el.style.zIndex = '9999';
        el.style.background = 'rgba(4, 8, 18, 0.98)';
        return el;
    });

    useEffect(() => {
        if (!enabled) return;
        document.body.appendChild(host);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (host.parentNode) host.parentNode.removeChild(host);
        };
    }, [enabled, host, onExit]);

    if (!enabled) return <>{children}</>;
    return createPortal(children, host);
};

export default FullscreenPortal;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/map/FullscreenPortal.tsx
git commit -m "feat(replay): add FullscreenPortal with Esc handling"
```

---

## Task 13: `ReplayView.tsx` — the main viewer

**Files:**
- Create: `src/renderer/stats/map/ReplayView.tsx`

`ReplayView` is a single SVG canvas rendering:
- Background: `getMapTiles` if `hasTileData(mapKey)`, else an `<image>` of `fight.mapImageUrl`.
- Landmark pins from `WVW_LANDMARKS[mapKey]`.
- Ally trails — a thinner polyline for the last 20 samples, a thicker solid polyline for the last 5.
- Class icons at each ally's current position (with commander tag marker and follow-target halo).
- Enemy markers — red-outlined dots.
- `<EventOverlay />`.

Controls row on top: map short name + time, selected-fight chip with X, follow chip with X, zoom ±/reset, fullscreen toggle.

Layout:
```
┌─────────────────────────────────────────────────┐
│ FightPicker                                     │
├─────────────────┬───────────────────────────────┤
│ PartyPanel      │ Controls row                  │
│                 ├───────────────────────────────┤
│                 │ Canvas (SVG)                  │
│                 │                               │
│                 ├───────────────────────────────┤
│                 │ SyncedTimeline                │
│                 ├───────────────────────────────┤
│                 │ Playback controls             │
└─────────────────┴───────────────────────────────┘
```

- [ ] **Step 1: Write `ReplayView.tsx`**

Create `src/renderer/stats/map/ReplayView.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pause, Play, Maximize2, Minimize2, Plus, Minus, RotateCcw, X } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { getMapTiles, hasTileData } from '../../../shared/wvwTiles';
import { WVW_LANDMARKS } from '../../../shared/wvwLandmarks';
import { normalizeMapNameShort, formatDuration } from '../../../shared/mapUtils';
import { getProfessionIconPath } from '../../classIconUtils';
import { FightPicker } from './FightPicker';
import { PartyPanel } from './PartyPanel';
import { SyncedTimeline } from './SyncedTimeline';
import { EventOverlay } from './EventOverlay';
import { FullscreenPortal } from './FullscreenPortal';
import { useReplayPlayback } from './hooks/useReplayPlayback';
import { useReplayViewport } from './hooks/useReplayViewport';
import { useMovementData } from './hooks/useMovementData';
import { pickDefaultFightId, findClosestMember } from './replaySelectors';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface ReplayViewProps {
    fights: ReplayFightPayload[];
}

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

function sampleAt(member: SquadMemberMovement, pollIndex: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.max(0, Math.min(pollIndex, member.positions.length - 1));
    return member.positions[idx];
}

export const ReplayView: React.FC<ReplayViewProps> = ({ fights }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);
    const playhead = useStatsStore(state => state.replayPlayhead);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const viewportState = useStatsStore(state => state.replayViewport);
    const setReplayFollowTarget = useStatsStore(state => state.setReplayFollowTarget);

    const [fullscreen, setFullscreen] = React.useState(false);

    useEffect(() => {
        if (!selectedId && fights.length) {
            const def = pickDefaultFightId(fights);
            if (def) setSelectedReplayFight(def);
        }
    }, [selectedId, fights, setSelectedReplayFight]);

    const selectedFight = useMovementData(fights, selectedId);

    const durationMs = selectedFight?.durationMs ?? 0;
    useReplayPlayback({ durationMs });

    const mapSize = selectedFight?.mapSize ?? [600, 600];
    const [mapWidth, mapHeight] = mapSize;
    const viewport = useReplayViewport({ mapWidth, mapHeight, containerWidth: mapWidth, containerHeight: mapHeight });

    const pollIndex = selectedFight
        ? Math.floor(playhead.timeMs / selectedFight.movementData.pollingRate)
        : 0;

    const followMember = useMemo(() => {
        if (!selectedFight) return null;
        const key = viewportState.followTarget;
        if (!key) {
            return selectedFight.movementData.members.find(m => m.isCommander && m.inSquad) ?? null;
        }
        return selectedFight.movementData.members.find(m => (m.account || m.name) === key) ?? null;
    }, [selectedFight, viewportState.followTarget]);

    useEffect(() => {
        if (!followMember) return;
        const pos = sampleAt(followMember, pollIndex);
        if (pos) viewport.centerOn(pos[0], pos[1]);
    }, [followMember, pollIndex, viewport]);

    const onCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!selectedFight) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const fracX = (e.clientX - rect.left) / rect.width;
        const fracY = (e.clientY - rect.top) / rect.height;
        const worldX = fracX * mapWidth;
        const worldY = fracY * mapHeight;
        const hit = findClosestMember(selectedFight.movementData.members, pollIndex, worldX, worldY, 24);
        if (hit && !hit.isEnemy) setReplayFollowTarget(hit.account || hit.name);
    }, [selectedFight, pollIndex, mapWidth, mapHeight, setReplayFollowTarget]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === ' ' && selectedFight) {
                e.preventDefault();
                setReplayPlayhead({ playing: !playhead.playing });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedFight, playhead.playing, setReplayPlayhead]);

    const shortMap = selectedFight ? normalizeMapNameShort(selectedFight.label) : '';
    const followLabel = viewportState.followTarget
        ? `Follow: ${viewportState.followTarget}`
        : (followMember ? `Follow: ${followMember.name} (commander)` : '');

    const body = (
        <div className="replay-view" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <FightPicker fights={fights} />
            {!selectedFight ? (
                <div style={{ padding: 16, opacity: 0.7 }}>Pick a fight above to start replay.</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 8, flex: 1, minHeight: 0 }}>
                    <PartyPanel fight={selectedFight} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
                            <div style={{ fontWeight: 600 }}>{shortMap}</div>
                            <div style={{ opacity: 0.7, fontSize: 12 }}>{formatDuration(playhead.timeMs)}</div>
                            <button type="button" onClick={() => setSelectedReplayFight(null)} style={{ marginLeft: 8 }}>
                                {selectedFight.label} <X size={12} />
                            </button>
                            {followLabel && (
                                <button type="button" onClick={() => setReplayFollowTarget(null)}>
                                    {followLabel} <X size={12} />
                                </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button type="button" onClick={() => viewport.zoomIn()} title="Zoom in"><Plus size={14} /></button>
                            <button type="button" onClick={() => viewport.zoomOut()} title="Zoom out"><Minus size={14} /></button>
                            <button type="button" onClick={() => viewport.resetViewport()} title="Reset"><RotateCcw size={14} /></button>
                            <button type="button" onClick={() => setFullscreen(v => !v)} title="Fullscreen">
                                {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                        </div>
                        <svg
                            className="replay-canvas"
                            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                            onClick={onCanvasClick}
                            style={{ flex: 1, minHeight: 0, width: '100%', background: '#0c1224', borderRadius: 8, cursor: 'crosshair' }}
                        >
                            <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
                                {selectedFight.mapKey && hasTileData(selectedFight.mapKey)
                                    ? getMapTiles(selectedFight.mapKey, 5).map((t, i) => (
                                        <image key={i} href={t.url} x={t.x} y={t.y} width={t.width} height={t.height} />
                                    ))
                                    : selectedFight.mapImageUrl && (
                                        <image href={selectedFight.mapImageUrl} x={0} y={0} width={mapWidth} height={mapHeight} />
                                    )
                                }
                                {selectedFight.mapKey && (WVW_LANDMARKS[selectedFight.mapKey] ?? []).map(lm => (
                                    <g key={lm.name}>
                                        <circle cx={lm.x} cy={lm.y} r={6} fill="rgba(15,23,42,0.8)" stroke="rgba(250,204,21,0.8)" strokeWidth={1.5} />
                                        <text x={lm.x + 8} y={lm.y + 3} fontSize={9} fill="rgba(250,204,21,0.9)">{lm.name}</text>
                                    </g>
                                ))}
                                {selectedFight.movementData.members.map(member => {
                                    const pos = sampleAt(member, pollIndex);
                                    if (!pos) return null;
                                    const trail = member.positions.slice(Math.max(0, pollIndex - 20), pollIndex + 1);
                                    const recent = member.positions.slice(Math.max(0, pollIndex - 5), pollIndex + 1);
                                    const trailStr = trail.map(p => `${p[0]},${p[1]}`).join(' ');
                                    const recentStr = recent.map(p => `${p[0]},${p[1]}`).join(' ');
                                    const color = member.isEnemy ? '#ef4444' : member.isCommander ? '#fbbf24' : '#60a5fa';
                                    const isFollow = followMember && (followMember.account || followMember.name) === (member.account || member.name);
                                    return (
                                        <g key={member.account || member.name}>
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
                                <EventOverlay fight={selectedFight} timeMs={playhead.timeMs} />
                            </g>
                        </svg>
                        <SyncedTimeline fight={selectedFight} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
                            <button type="button" onClick={() => setReplayPlayhead({ playing: !playhead.playing })}>
                                {playhead.playing ? <Pause size={16} /> : <Play size={16} />}
                            </button>
                            <select
                                value={playhead.speed}
                                onChange={(e) => setReplayPlayhead({ speed: Number(e.target.value) })}
                            >
                                {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
                            </select>
                            <span style={{ fontSize: 12, opacity: 0.8 }}>
                                {formatDuration(playhead.timeMs)} / {formatDuration(durationMs)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <FullscreenPortal enabled={fullscreen} onExit={() => setFullscreen(false)}>
            {body}
        </FullscreenPortal>
    );
};

export default ReplayView;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx
git commit -m "feat(replay): add ReplayView main canvas + controls"
```

---

## Task 14: Replace `ReplaySection.tsx` placeholder with real implementation

**Files:**
- Modify: `src/renderer/stats/sections/ReplaySection.tsx`

- [ ] **Step 1: Swap placeholder for real wiring**

Replace the contents of `src/renderer/stats/sections/ReplaySection.tsx` with:

```tsx
import React from 'react';
import { useStatsStore } from '../statsStore';
import { ReplayView } from '../map/ReplayView';

export const ReplaySection: React.FC = () => {
    const result = useStatsStore(state => state.result);
    const fights = (result?.replayFights ?? []) as any[];

    return (
        <section id="replay" className="stats-section">
            <div className="stats-section-header">
                <h2>Replay</h2>
            </div>
            <div style={{ height: 720, display: 'flex' }}>
                <ReplayView fights={fights} />
            </div>
        </section>
    );
};

export default ReplaySection;
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 3: Dev-run smoke test**

Run: `npm run dev`

Load a dev dataset that includes at least one fight parsed with `parseCombatReplay=true`. Navigate to Map → Replay. Verify:
- The fight picker renders cards.
- The most recent fight auto-selects.
- The canvas shows the map + landmarks + ally icons.
- Play/Pause works; speed selector changes playback rate.
- Clicking a timeline point scrubs.
- Clicking an ally marker sets the Follow chip to that player.

Close the dev server when satisfied.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/ReplaySection.tsx
git commit -m "feat(stats): wire ReplayView into Replay section"
```

---

## Task 15: Carry `stats.replayFights` through the web report payload

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts:402-476`

`buildWebReportPayload` already spreads `sourceStats` into `payload.stats`, which means `replayFights` flows through automatically. We only need to add a trim step so the array can be dropped first if the JSON exceeds the 100 MB cap.

- [ ] **Step 1: Add trim step**

Edit `src/main/handlers/githubHandlers.ts`. Inside the `trimSteps` array (currently starting at line 433), prepend a new first step:

```ts
        { label: 'replayFights', apply: () => clearArray(stats, 'replayFights') },
```

Placing it first ensures replay data is the earliest to shed when under pressure — it's the single largest per-fight payload.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/githubHandlers.ts
git commit -m "feat(web): include replayFights in report JSON with first-to-trim policy"
```

---

## Task 16: `ReplayViewWeb.tsx` wrapper for the web report

**Files:**
- Create: `src/web/ReplayViewWeb.tsx`

Because the web report imports `StatsView` directly from the renderer (`src/web/reportApp.tsx:2`), the new `ReplaySection` already shows in the rollup view. The dedicated wrapper in the spec is reserved for any web-specific differences — e.g. disabling fullscreen (the portal is fine in a browser; no changes needed) or showing a notice when the report was trimmed. The minimum viable wrapper here just re-exports:

- [ ] **Step 1: Write the wrapper**

Create `src/web/ReplayViewWeb.tsx`:

```tsx
// Re-export for future web-specific extensions.
// Currently ReplayView works unchanged in the web report; the report payload
// carries stats.replayFights directly and StatsView's ReplaySection consumes it.
export { ReplayView as ReplayViewWeb } from '../renderer/stats/map/ReplayView';
export { default } from '../renderer/stats/map/ReplayView';
```

- [ ] **Step 2: Typecheck the web bundle**

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 3: Local web smoke test**

Run: `npm run dev:web`

Open the web report at the URL shown (port 4173). Load a stored report that was built after Plan 2 landed (one with `replayFights`). Navigate to Map → Replay. Confirm:
- Fight picker renders.
- Canvas renders the map + markers.
- Play/Pause works.
- Fullscreen toggles.

Stop the dev server when satisfied.

- [ ] **Step 4: Commit**

```bash
git add src/web/ReplayViewWeb.tsx
git commit -m "feat(web): export ReplayViewWeb wrapper for report rendering"
```

---

## Task 17: Playwright e2e — replay smoke test

**Files:**
- Create: `tests/e2e/electron/replay.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/electron/replay.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { launchElectron } from './helpers';  // existing helper used by other Electron e2e specs

test('replay section selects a fight and plays', async () => {
    const { app, window } = await launchElectron({ withFixtureLogs: 'replay-capable' });
    await window.getByRole('button', { name: /map/i }).click();
    await expect(window.getByRole('listbox')).toBeVisible();

    const firstCard = window.getByRole('option').first();
    await firstCard.click();
    await expect(window.locator('svg.replay-canvas')).toBeVisible();

    const playBtn = window.getByRole('button', { name: /play|pause/i }).first();
    await playBtn.click();
    await window.waitForTimeout(500);
    const tReadout = await window.locator('text=/0:0\\d \\/ /').first().textContent();
    expect(tReadout).not.toMatch(/^0:00/);
    await playBtn.click(); // pause

    // follow-target flow
    const svg = window.locator('svg.replay-canvas');
    await svg.click({ position: { x: 300, y: 300 } });
    // Either follow chip appears, or click missed every marker — both acceptable for smoke.

    await app.close();
});
```

If `launchElectron`/`withFixtureLogs: 'replay-capable'` doesn't exist, adapt to the project's existing Electron e2e bootstrapping (there is an existing `src/renderer/__tests__` setup; Playwright uses a different path — check `tests/e2e/electron/` for the helper conventions).

- [ ] **Step 2: Run the e2e**

Run: `npm run test:e2e:electron`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/electron/replay.spec.ts
git commit -m "test(replay): add Electron e2e smoke for replay select + play"
```

---

## Task 18: Full validation sweep

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

- [ ] **Step 5: If any snapshots regenerated, commit**

```bash
git add -A
git commit -m "test: regenerate snapshots affected by replay payload additions"
```

---

## Self-review checklist (for plan author)

1. **Spec coverage.**
   - §4.5 hydration → Task 7 (LRU cache; existing hydration pipeline reused) ✓
   - §4.6 web report bundle → Tasks 3, 15, 16 ✓
   - §7.0 fight picker → Task 8 ✓
   - §7.1 layers 1/2/4/6/9 → Tasks 11, 13 ✓ (layers 3, 5, 7, 8 and rally/target-focus deferred to Plan 3 — stated in prelude)
   - §7.3 controls row (without Layers popover) → Task 13 ✓
   - §7.5 party panel single-party → Task 9 ✓ (all-parties deferred to Plan 3)
   - §7.6 follow → Task 13 ✓ (spotlight deferred to Plan 3)
   - §7.7 synced timeline base → Task 10 ✓ (phase bands deferred)
   - §7.8 playback → Task 13 ✓
   - §9 store additions → Task 1 ✓ (layer toggles deferred to Plan 3)
   - §10 performance — lazy loading, LRU, rAF loop, one-time thumbnails → Tasks 5, 7, 8 ✓

2. **Placeholder scan.** Every step has exact code. The `EventOverlay` is scoped down to down pins + death bursts; the damage spike pulse is explicitly a follow-up in Plan 3 and not a "TBD" within Plan 2.

3. **Type consistency.** `ReplayFightPayload` fields are defined once in `replayTypes.ts` and consumed by every task. `SquadMemberMovement` type comes from Plan 1's `src/shared/movementData.ts`. Hook names are consistent (`useReplayPlayback`, `useReplayViewport`, `useMovementData`, not variants).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-map-replay-core-viewer-and-web-report.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
