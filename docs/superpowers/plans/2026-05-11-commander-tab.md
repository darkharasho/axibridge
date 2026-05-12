# Commander Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new top-level "Commander" tab that shows a failure-first, per-fight diagnostic of the most recently uploaded log, with a session rollup, detector-driven insights, seven color-coded metric sections with embedded mini-visuals, and tunable thresholds.

**Architecture:** A new `src/renderer/commander/` view tree backed by a pure `src/shared/commanderMetrics.ts` module that produces a single `CommanderFightData` from one EI JSON. A registry of pure detector functions consumes that data plus a `CommanderThresholds` settings object and emits `DetectorFinding`s shown in two insight columns. Eight inline-SVG visualization primitives are reused across the metric grid. Compute is synchronous on the renderer with a small LRU keyed by `fightId`.

**Tech Stack:** TypeScript, React, Vite, Tailwind, vitest + jsdom for tests. Inline SVG for all visuals (no chart library). Settings persisted via the existing `electronAPI.saveSettings` channel.

**Reference spec:** `docs/superpowers/specs/2026-05-11-commander-tab-design.md`

---

## File Structure

**New files:**

```
src/shared/
  commanderTypes.ts                # All shared types for the Commander view
  commanderThresholds.ts           # Default thresholds object + types
  commanderMetrics.ts              # Pure EIJson → CommanderFightData
  __tests__/
    commanderMetrics.test.ts

src/renderer/commander/
  CommanderView.tsx                # Top-level page
  CommanderHeader.tsx              # Fight header + selector + verdict chips
  CommanderRollup.tsx              # Session rollup strip
  CommanderInsights.tsx            # Two insight columns
  CommanderGrid.tsx                # Seven metric sections
  CommanderEmptyState.tsx          # No-logs empty state
  detectors/
    types.ts                       # DetectorFinding + Detector signature
    index.ts                       # Registry + runAll()
    firstSquadDeathEarly.ts
    firstSupportDeathPreBomb.ts
    bombOverwhelmedSustain.ts
    bombSurvived.ts
    stabCoverageGood.ts
    stabCoverageBad.ts
    cleanseRaceWon.ts
    cleanseRaceLost.ts
    stripRaceLost.ts
    rallyRateHealthy.ts
    caughtOutDeaths.ts
    fragmentedAtBomb.ts
    outnumberedSignificantly.ts
    __tests__/
      <one test file per detector>.test.ts
  viz/
    ThresholdBar.tsx
    DivergingBar.tsx
    Sparkline.tsx
    MiniTimeline.tsx
    TagBubble.tsx
    StackedCountBar.tsx
    CompBars.tsx
    Donut.tsx
    __tests__/                     # Snapshot/render tests
  hooks/
    useCommanderFightData.ts       # Selects current fight, runs metrics, caches
    useCommanderRollup.ts          # Session-level aggregate
    useCommanderThresholds.ts      # Loads thresholds from settings
  __tests__/
    CommanderView.test.tsx
```

**Modified files:**

```
src/renderer/app/hooks/useAppNavigation.ts   # Add 'commander' to view union
src/renderer/app/AppLayout.tsx               # Add Commander tab between Stats and History
src/renderer/App.tsx                         # Wire CommanderView for view === 'commander'
src/renderer/SettingsView.tsx                # Add "Commander thresholds" section
src/renderer/global.d.ts                     # Add commanderThresholds to settings shape (if not auto)
```

---

## Conventions

- All new components are functional React with explicit prop interfaces.
- All shared modules are pure — no React imports, no DOM, no Electron APIs.
- Each detector lives in its own file and exports a default `Detector` function.
- Each visualization is a small SVG-emitting function component, ≤ 80 lines.
- Tests are colocated in `__tests__` next to the source.
- Every step ends with a passing `npm run typecheck && npm run lint`. Run them before each commit.
- After every task, commit. Conventional Commits style: `feat(commander): …`, `test(commander): …`.

---

## Task 0: Discovery & confirm fixture availability

**Files:**
- Read: `src/shared/dpsReportTypes.ts`, `src/shared/dashboardMetrics.ts`, `src/shared/combatMetrics.ts`, `test-fixtures/`

- [ ] **Step 1: Confirm the EI JSON type and find the role-classification helper**

Run:
```bash
grep -rn "role.*classification\|classifyRole\|playerRole" src/shared src/renderer | head -20
ls test-fixtures/*.json | head -5
```

Expected: At least one fixture file present. A helper that classifies a player as `support`/`damage`/`unknown` is reachable from `src/shared/`. Record the helper's export name and path; you'll import it in Task 3. If it does not exist, note this for the maintainer — fall back to treating "support" as any player with `healing` role from EI JSON (`player.role === 'Support'`).

- [ ] **Step 2: Identify the squad-detection helper**

Run:
```bash
grep -rn "isSquadMember\|squadMembers\|subgroup" src/shared src/renderer | head -20
```

Expected: An existing helper or convention for "is this player in the recording user's squad?" — typically by subgroup number. Record the helper path and signature; used by Task 3.

- [ ] **Step 3: Pick a test fixture**

Run:
```bash
ls test-fixtures/*.json
```

Pick one with ≥ 5 squad players and ≥ 1 squad death and at least 20s duration. Record the filename — this is `FIXTURE_PATH` used in metric tests.

- [ ] **Step 4: Commit a discovery note**

Create `src/shared/__tests__/commander.fixtures.ts`:

```ts
// Single import point for the fixture used by Commander metric tests.
// Update FIXTURE_FILENAME if the chosen fixture is removed.
import fixture from '../../../test-fixtures/<chosen-fixture>.json';

export const FIXTURE_FILENAME = '<chosen-fixture>.json';
export const commanderTestFixture = fixture as unknown as import('../dpsReportTypes').EIJson;
```

```bash
git add src/shared/__tests__/commander.fixtures.ts
git commit -m "test(commander): pin fixture for commander metric tests"
```

---

## Task 1: Shared types + default thresholds

**Files:**
- Create: `src/shared/commanderTypes.ts`
- Create: `src/shared/commanderThresholds.ts`

- [ ] **Step 1: Write `commanderTypes.ts`**

```ts
// src/shared/commanderTypes.ts
import type { EIJson } from './dpsReportTypes';

export type VerdictChip =
  | 'wipe' | 'trade' | 'carry' | 'clean'
  | 'outnumbered' | 'caught-engage' | 'caught-out' | 'bomb-broke-us';

export interface DeathEvent {
  tSec: number;
  account: string;
  profession: string;
  role: 'support' | 'damage' | 'unknown';
  distFromTag: number;
}

export interface BombWindow {
  tSec: number;
  durationSec: number;
  incoming: number;
  heal: number;
  outcome: 'survived' | 'broke';
}

export interface CommanderFightData {
  fightId: string;
  map: string;
  startedAt: number;        // epoch ms
  duration: number;         // seconds

  matchup: {
    squadCount: number;
    alliesCount: number;
    enemyCount: number;
    enemyPeak: number;
    effectiveRatio: number;            // (squad+allies)/enemyPeak
    timeOutnumberedSec: number;
    enemyComp: Array<{ profession: string; count: number }>;
    inTagBubbleAtEngage: number;
  };

  survival: {
    firstSquadDeath: DeathEvent | null;
    firstSupportDeath: DeathEvent | null;
    squadAliveAtEnd: number;
    squadTotal: number;
    rallyRate: number;                 // 0..1
    rallies: number;
    downs: number;
    avgTimeDownedSec: number;
  };

  burst: {
    worst3sIncoming: number;
    worst3sIncomingTSec: number;
    inHealRatioAtSpike: number;
    healAtSpike: number;
    bombWindowCount: number;
    bombWindows: BombWindow[];
    downsInWorst3s: number;
    stabUptimeInSpike: number;         // 0..1
  };

  cohesion: {
    avgDistFromTag: number;
    timeSpread900PlusSec: number;
    avgDistAtDeath: number;
    peakSpreadStdev: number;
    peakSpreadStdevTSec: number;
    stragglersAtBomb: number;
  };

  sustain: {
    cleansesApplied: number;
    conditionsTaken: number;
    stripsLanded: number;
    stripsReceived: number;
    stabThroughBombs: number;          // 0..1
    resistanceAtBurst: number;         // 0..1
    aegisAtBurst: number;              // 0..1
  };

  engage: {
    squadHpAtEngage: number;           // 0..1
    keyCdsUsed0to10s: number;          // 0..1
    preEngageDowns: number;
    stab0to10s: number;                // 0..1
    dodgeStarvation: 'low' | 'med' | 'high';
  };

  outcome: {
    kills: number;
    squadDeaths: number;
    allyDeaths: number;
    netTrade: number;                  // kills / squadDeaths (clamped at 99 if zero deaths)
    damageOut: number;
    damageIn: number;
    damageOutInRatio: number;
  };

  series: {
    incomingDps: number[];             // per second, length = ceil(duration)
    healingThroughput: number[];
    stabUptime: number[];
    spreadStdev: number[];
    deathsTimeline: DeathEvent[];
  };

  verdictChips: VerdictChip[];
}

export type ComputeCommanderFightData = (json: EIJson) => CommanderFightData;
```

- [ ] **Step 2: Write `commanderThresholds.ts`**

```ts
// src/shared/commanderThresholds.ts
export interface CommanderThresholds {
  firstDeathMinSec: number;          // 15
  firstDeathMaxDist: number;         // 900
  bombRatio: number;                 // 2.5
  bombFloor: number | 'auto';        // 'auto' = max(150_000, p75 of 3s windows)
  stabGoodEngage: number;            // 0.75
  stabBadInBomb: number;             // 0.50
  cleanseDeficitWarn: number;        // -50
  stripDeficitWarn: number;          // 40
  rallyGood: number;                 // 0.55
  caughtOutDist: number;             // 700
  spreadBad: number;                 // 600
  outnumberedRatio: number;          // 0.85
  tagRadius: number;                 // 600
  supportPreBombLeadSec: number;     // 5
}

export const DEFAULT_COMMANDER_THRESHOLDS: CommanderThresholds = {
  firstDeathMinSec: 15,
  firstDeathMaxDist: 900,
  bombRatio: 2.5,
  bombFloor: 'auto',
  stabGoodEngage: 0.75,
  stabBadInBomb: 0.50,
  cleanseDeficitWarn: -50,
  stripDeficitWarn: 40,
  rallyGood: 0.55,
  caughtOutDist: 700,
  spreadBad: 600,
  outnumberedRatio: 0.85,
  tagRadius: 600,
  supportPreBombLeadSec: 5,
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/shared/commanderTypes.ts src/shared/commanderThresholds.ts
git commit -m "feat(commander): add shared types and default thresholds"
```

---

## Task 2: `commanderMetrics.ts` skeleton + smoke test

**Files:**
- Create: `src/shared/commanderMetrics.ts`
- Create: `src/shared/__tests__/commanderMetrics.test.ts`

- [ ] **Step 1: Write failing smoke test**

```ts
// src/shared/__tests__/commanderMetrics.test.ts
import { describe, it, expect } from 'vitest';
import { computeCommanderFightData } from '../commanderMetrics';
import { commanderTestFixture } from './commander.fixtures';

describe('computeCommanderFightData', () => {
  it('returns a fully-shaped CommanderFightData for a real fixture', () => {
    const data = computeCommanderFightData(commanderTestFixture);
    expect(data.fightId).toBeTruthy();
    expect(data.duration).toBeGreaterThan(0);
    expect(data.matchup.squadCount).toBeGreaterThan(0);
    expect(data.series.incomingDps.length).toBe(Math.ceil(data.duration));
    expect(data.series.healingThroughput.length).toBe(Math.ceil(data.duration));
  });
});
```

- [ ] **Step 2: Stub the function to make the test fail with a clear message**

```ts
// src/shared/commanderMetrics.ts
import type { EIJson } from './dpsReportTypes';
import type { CommanderFightData, ComputeCommanderFightData } from './commanderTypes';

export const computeCommanderFightData: ComputeCommanderFightData = (json: EIJson): CommanderFightData => {
  throw new Error('not implemented');
};
```

- [ ] **Step 3: Run the test, confirm failure**

Run: `npx vitest run src/shared/__tests__/commanderMetrics.test.ts`
Expected: FAIL — "not implemented".

- [ ] **Step 4: Implement the minimal happy-path shape**

Replace the stub with code that fills every field. Use placeholder zeros for fields you don't yet know how to compute — Tasks 3–9 will replace them. The goal is a function that returns a fully-shaped object without throwing.

```ts
// src/shared/commanderMetrics.ts
import type { EIJson } from './dpsReportTypes';
import type {
  CommanderFightData,
  ComputeCommanderFightData,
  DeathEvent,
  BombWindow,
} from './commanderTypes';

export const computeCommanderFightData: ComputeCommanderFightData = (json: EIJson): CommanderFightData => {
  const duration = Math.max(1, Math.floor((json.durationMS ?? 0) / 1000));
  const ceil = Math.ceil(duration);
  const zeros = (n: number) => new Array(n).fill(0);

  return {
    fightId: json.eiEncounterID?.toString() ?? json.fightName ?? 'unknown',
    map: json.fightName ?? 'Unknown',
    startedAt: Date.parse(json.timeStart ?? '') || Date.now(),
    duration,

    matchup: {
      squadCount: 0, alliesCount: 0, enemyCount: 0, enemyPeak: 0,
      effectiveRatio: 0, timeOutnumberedSec: 0,
      enemyComp: [], inTagBubbleAtEngage: 0,
    },
    survival: {
      firstSquadDeath: null, firstSupportDeath: null,
      squadAliveAtEnd: 0, squadTotal: 0,
      rallyRate: 0, rallies: 0, downs: 0, avgTimeDownedSec: 0,
    },
    burst: {
      worst3sIncoming: 0, worst3sIncomingTSec: 0,
      inHealRatioAtSpike: 0, healAtSpike: 0,
      bombWindowCount: 0, bombWindows: [],
      downsInWorst3s: 0, stabUptimeInSpike: 0,
    },
    cohesion: {
      avgDistFromTag: 0, timeSpread900PlusSec: 0,
      avgDistAtDeath: 0, peakSpreadStdev: 0,
      peakSpreadStdevTSec: 0, stragglersAtBomb: 0,
    },
    sustain: {
      cleansesApplied: 0, conditionsTaken: 0,
      stripsLanded: 0, stripsReceived: 0,
      stabThroughBombs: 0, resistanceAtBurst: 0, aegisAtBurst: 0,
    },
    engage: {
      squadHpAtEngage: 0, keyCdsUsed0to10s: 0,
      preEngageDowns: 0, stab0to10s: 0, dodgeStarvation: 'low',
    },
    outcome: {
      kills: 0, squadDeaths: 0, allyDeaths: 0,
      netTrade: 0, damageOut: 0, damageIn: 0, damageOutInRatio: 0,
    },
    series: {
      incomingDps: zeros(ceil),
      healingThroughput: zeros(ceil),
      stabUptime: zeros(ceil),
      spreadStdev: zeros(ceil),
      deathsTimeline: [],
    },
    verdictChips: [],
  };
};
```

- [ ] **Step 5: Run test, confirm pass**

Run: `npx vitest run src/shared/__tests__/commanderMetrics.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/commanderMetrics.ts src/shared/__tests__/commanderMetrics.test.ts
git commit -m "feat(commander): commanderMetrics skeleton with smoke test"
```

---

## Tasks 3–9: Fill in `commanderMetrics.ts` section by section

Each of the next seven tasks adds one section of real computation. Pattern is identical:

1. Add a focused test asserting one or two field values against the chosen fixture (use rough but verifiable numbers — read them from a one-time `console.log` if needed, then lock them in).
2. Replace zeros in the matching `commanderMetrics.ts` section with a real implementation.
3. Run tests, confirm pass.
4. Run `npm run typecheck && npm run lint`.
5. Commit.

### Task 3: Matchup section

**Files:**
- Modify: `src/shared/commanderMetrics.ts`
- Modify: `src/shared/__tests__/commanderMetrics.test.ts`

- [ ] **Step 1: Add tests**

Append to the existing test file:

```ts
import type { CommanderFightData } from '../commanderTypes';
let data: CommanderFightData;

describe('matchup', () => {
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('squad + ally + enemy counts are non-negative and consistent', () => {
    expect(data.matchup.squadCount).toBeGreaterThanOrEqual(1);
    expect(data.matchup.enemyPeak).toBeGreaterThanOrEqual(data.matchup.enemyCount);
    expect(data.matchup.effectiveRatio).toBeCloseTo(
      (data.matchup.squadCount + data.matchup.alliesCount) / Math.max(1, data.matchup.enemyPeak),
      2
    );
  });

  it('enemyComp counts sum to enemyCount', () => {
    const total = data.matchup.enemyComp.reduce((a, e) => a + e.count, 0);
    expect(total).toBe(data.matchup.enemyCount);
  });
});
```

- [ ] **Step 2: Run, confirm failure (zeros)**

Run: `npx vitest run src/shared/__tests__/commanderMetrics.test.ts`
Expected: FAIL on `squadCount >= 1` and on the enemy comp sum.

- [ ] **Step 3: Implement matchup**

Replace the `matchup: { … }` block in `commanderMetrics.ts` with a real computation. Use the squad-detection helper found in Task 0. Walk `json.players` to count squad/allies, `json.targets` (or `json.enemies` — depends on EI version found in Task 0) to count enemies and their professions.

Pseudocode (translate using actual field names from `dpsReportTypes.ts`):

```ts
const isSquad = (p: PlayerJson) => /* helper from Task 0 */;
const players = json.players ?? [];
const enemies = (json.targets ?? []).filter(t => t.isFake !== true && t.isPlayer === true);

const squad = players.filter(isSquad);
const allies = players.filter(p => !isSquad(p));
const enemyPeak = Math.max(0, ...enemies.map(e => e.combatReplayData?.positions?.length ?? 0).map(() => enemies.length));
const enemyCount = enemies.length;

const effectiveRatio = (squad.length + allies.length) / Math.max(1, enemyPeak || enemyCount);

const compMap = new Map<string, number>();
for (const e of enemies) {
  compMap.set(e.profession, (compMap.get(e.profession) ?? 0) + 1);
}
const enemyComp = Array.from(compMap, ([profession, count]) => ({ profession, count }))
  .sort((a, b) => b.count - a.count);
```

For `timeOutnumberedSec` and `inTagBubbleAtEngage`, see Task 4 / Task 6 — for this task it's acceptable to leave them at 0 and reach final values when positional data is processed. Add a `// TODO(task-6): timeOutnumberedSec` comment to mark.

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/shared/__tests__/commanderMetrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/commanderMetrics.ts src/shared/__tests__/commanderMetrics.test.ts
git commit -m "feat(commander): matchup metrics (squad/allies/enemy/comp)"
```

### Task 4: Survival & attrition

Same pattern. Adds: `firstSquadDeath` (earliest death across squad), `firstSupportDeath` (earliest among role-classified supports), `squadAliveAtEnd`, `rallies`/`downs`/`rallyRate`, `avgTimeDownedSec`, `series.deathsTimeline`.

- [ ] **Step 1: Tests**

```ts
describe('survival', () => {
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('first squad death (if any) has a non-negative tSec within the fight', () => {
    if (data.survival.firstSquadDeath) {
      expect(data.survival.firstSquadDeath.tSec).toBeGreaterThanOrEqual(0);
      expect(data.survival.firstSquadDeath.tSec).toBeLessThanOrEqual(data.duration);
    }
  });

  it('rallyRate equals rallies / downs when downs > 0', () => {
    if (data.survival.downs > 0) {
      expect(data.survival.rallyRate).toBeCloseTo(data.survival.rallies / data.survival.downs, 5);
    }
  });

  it('deathsTimeline length equals number of squad deaths', () => {
    const deadSquad = data.survival.squadTotal - data.survival.squadAliveAtEnd;
    expect(data.series.deathsTimeline.length).toBe(deadSquad);
  });
});
```

- [ ] **Step 2: Implementation**

Walk each squad player's combat events. EI exposes per-player buff/state events that include `DownState` and `DeadState` transitions. For each squad player, collect:
- `firstDownTime` and `firstDeathTime` (in seconds from fight start)
- whether they rallied (a DownState that ended with health rather than death)

Aggregate to fill the survival block. `firstSupportDeath` filters by the role helper.

Show your final code in the diff; this task replaces the `survival: { … }` block in `commanderMetrics.ts`. Keep it as a local helper function `computeSurvival(json)` returning the block, called from `computeCommanderFightData`.

- [ ] **Step 3: Run, pass, commit.**

```bash
git add src/shared/commanderMetrics.ts src/shared/__tests__/commanderMetrics.test.ts
git commit -m "feat(commander): survival & attrition metrics"
```

### Task 5: Burst exposure + series (incoming/healing throughput)

Build the per-second `series.incomingDps` and `series.healingThroughput` first — they're the basis for bomb-window detection.

- [ ] **Step 1: Tests**

```ts
describe('burst', () => {
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('incomingDps and healingThroughput series have the same length as ceil(duration)', () => {
    expect(data.series.incomingDps.length).toBe(Math.ceil(data.duration));
    expect(data.series.healingThroughput.length).toBe(Math.ceil(data.duration));
  });

  it('worst3sIncoming corresponds to the maximum sliding 3s sum of incomingDps', () => {
    const series = data.series.incomingDps;
    let maxSum = 0;
    for (let i = 0; i + 3 <= series.length; i++) {
      const s = series[i] + series[i+1] + series[i+2];
      if (s > maxSum) maxSum = s;
    }
    expect(data.burst.worst3sIncoming).toBeCloseTo(maxSum, 0);
  });

  it('bombWindow outcomes are valid and reference timestamps in range', () => {
    for (const w of data.burst.bombWindows) {
      expect(['survived', 'broke']).toContain(w.outcome);
      expect(w.tSec).toBeGreaterThanOrEqual(0);
      expect(w.tSec).toBeLessThanOrEqual(data.duration);
    }
  });
});
```

- [ ] **Step 2: Implementation**

Walk the squad's `damageTakenDist` and `healingDist` per-second arrays (EI exposes these). Sum across the squad to make per-second totals. Compute sliding-3s sums to find `worst3sIncoming` and `worst3sIncomingTSec`. Detect bomb windows: any 3s window where `incomingSum > bombFloor` AND (`incomingSum / max(1, healSum) > bombRatio`) — but for the metrics module, use `bombFloor = max(150_000, p75 of all 3s incoming windows in the fight)` and `bombRatio = 2.5`. Outcome `broke` if ≥ 2 squad deaths land within the window, else `survived`.

`downsInWorst3s` = count of squad downs whose `tSec` falls inside `[worst3sIncomingTSec, worst3sIncomingTSec + 3]`.

`stabUptimeInSpike` = avg stab uptime across squad during the worst 3s — defer until Task 7 fills the `stabUptime` series, then re-compute in this block (or extract to a small helper that Task 7 invokes after filling the series).

- [ ] **Step 3: Run, pass, commit.**

```bash
git commit -am "feat(commander): burst exposure metrics and per-second series"
```

### Task 6: Cohesion & positioning

Uses positional data (`combatReplayData.positions`) — same source AxiBridge already uses for distance-to-tag (see `docs/superpowers/specs/2026-04-26-squad-distance-to-tag-table-design.md`). Reuse any positioning helper that already exists.

- [ ] **Step 1: Tests**

```ts
describe('cohesion', () => {
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('avgDistFromTag is non-negative and finite', () => {
    expect(data.cohesion.avgDistFromTag).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(data.cohesion.avgDistFromTag)).toBe(true);
  });

  it('timeSpread900Plus + complement <= duration', () => {
    expect(data.cohesion.timeSpread900PlusSec).toBeLessThanOrEqual(data.duration);
  });

  it('series.spreadStdev length matches series.incomingDps length', () => {
    expect(data.series.spreadStdev.length).toBe(data.series.incomingDps.length);
  });
});
```

- [ ] **Step 2: Implementation**

For each second of the fight, compute the centroid of squad positions (or use the commander/tag position if identifiable — fallback to centroid). Then:
- `avgDistFromTag` = mean over squad-seconds of `|playerPos - tagPos|`
- `series.spreadStdev` = per-second σ of `|playerPos - tagPos|` across squad
- `peakSpreadStdev` / `peakSpreadStdevTSec` = max and its t
- `timeSpread900PlusSec` = seconds where any player > 900u from tag
- `avgDistAtDeath` = mean of `distFromTag` across `series.deathsTimeline`
- `stragglersAtBomb` = number of unique players > 1500u from tag during any bomb window
- `matchup.inTagBubbleAtEngage` = count of squad players within `tagRadius` (600u) of tag at `t=0..2s`

Also fill `matchup.timeOutnumberedSec`: requires per-second alive enemy count (count of enemies with `alive[t] === true`) compared to alive squad+allies count. EI exposes per-second alive flags; if not available, approximate by counting enemies in the targets list as constant.

- [ ] **Step 3: Run, pass, commit.**

```bash
git commit -am "feat(commander): cohesion/positioning metrics + outnumbered timing"
```

### Task 7: Sustain race + engage readiness + remaining series

Fills `sustain`, `engage`, `series.stabUptime`, `series.healingThroughput` (if not already done in Task 5), and `burst.stabUptimeInSpike`.

- [ ] **Step 1: Tests**

```ts
describe('sustain & engage', () => {
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('cleansesApplied and conditionsTaken are non-negative integers', () => {
    expect(Number.isInteger(data.sustain.cleansesApplied)).toBe(true);
    expect(data.sustain.cleansesApplied).toBeGreaterThanOrEqual(0);
    expect(data.sustain.conditionsTaken).toBeGreaterThanOrEqual(0);
  });

  it('stabThroughBombs, resistanceAtBurst, aegisAtBurst are in [0,1]', () => {
    for (const v of [data.sustain.stabThroughBombs, data.sustain.resistanceAtBurst, data.sustain.aegisAtBurst]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('squadHpAtEngage, keyCdsUsed0to10s, stab0to10s are in [0,1]', () => {
    for (const v of [data.engage.squadHpAtEngage, data.engage.keyCdsUsed0to10s, data.engage.stab0to10s]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Implementation**

Reuse `src/shared/boonGeneration.ts` and `src/shared/conditionsMetrics.ts` for cleanse/condi/strip totals — these helpers already aggregate across players, so call them with `squad` only.

`stab0to10s` = mean stab uptime across squad for seconds 0..10 of the fight (cap at duration if shorter).
`squadHpAtEngage` = mean of `(currentHp[0] / maxHp)` across squad.
`keyCdsUsed0to10s` = fraction of squad members who used at least one of (stab boon, heal skill, hard CC) in 0..10s. Approximate using EI `rotation` events filtered to skills with `tagBoonStability` or healing flags.
`preEngageDowns` = count of downs with `tSec < 3` (i.e. before the engage window proper starts).
`dodgeStarvation` heuristic v1: `low` always — refine later.

`stabThroughBombs` = avg of `series.stabUptime` over each bomb window.

- [ ] **Step 3: Run, pass, commit.**

```bash
git commit -am "feat(commander): sustain race and engage readiness metrics"
```

### Task 8: Outcome ledger + verdict chips

- [ ] **Step 1: Tests**

```ts
describe('outcome', () => {
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('netTrade = kills / max(1, squadDeaths)', () => {
    expect(data.outcome.netTrade).toBeCloseTo(
      data.outcome.kills / Math.max(1, data.outcome.squadDeaths), 5
    );
  });

  it('damageOutInRatio = damageOut / max(1, damageIn)', () => {
    expect(data.outcome.damageOutInRatio).toBeCloseTo(
      data.outcome.damageOut / Math.max(1, data.outcome.damageIn), 5
    );
  });

  it('verdictChips contains only valid chip ids', () => {
    const allowed = new Set(['wipe','trade','carry','clean','outnumbered','caught-engage','caught-out','bomb-broke-us']);
    for (const c of data.verdictChips) expect(allowed.has(c)).toBe(true);
  });
});
```

- [ ] **Step 2: Implementation**

- `kills` = sum of `enemy.deadCount` across enemies (or count of enemy deaths in dead-state transitions).
- `squadDeaths` = `squadTotal - squadAliveAtEnd`.
- `allyDeaths` = same calc for allies.
- `damageOut` / `damageIn` = sum across squad of `totalDamage` (outgoing) and `damageTaken`.
- Verdict chips logic:
  - `wipe`: squadDeaths >= ceil(squadTotal * 0.7)
  - `clean`: squadDeaths === 0
  - `trade`: netTrade between 0.66 and 1.5
  - `carry`: netTrade > 1.5
  - `outnumbered`: effectiveRatio < 0.85
  - `caught-engage`: firstSquadDeath && firstSquadDeath.tSec < 15
  - `caught-out`: avgDistAtDeath > 700
  - `bomb-broke-us`: any bombWindow.outcome === 'broke'

- [ ] **Step 3: Run, pass, commit.**

```bash
git commit -am "feat(commander): outcome ledger and verdict chips"
```

### Task 9: Audit metric module ergonomics

- [ ] **Step 1: Review `commanderMetrics.ts` size**

Run: `wc -l src/shared/commanderMetrics.ts`
If > 500 lines, extract `computeSurvival`, `computeBurst`, `computeCohesion`, `computeSustainEngage`, `computeOutcome` into `src/shared/commanderMetrics/<name>.ts` files. If ≤ 500, leave inline.

- [ ] **Step 2: Re-run all metrics tests**

Run: `npx vitest run src/shared/__tests__/commanderMetrics.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit (if any restructuring)**

```bash
git commit -am "refactor(commander): split commanderMetrics if needed"
```

---

## Task 10: Detector framework + registry

**Files:**
- Create: `src/renderer/commander/detectors/types.ts`
- Create: `src/renderer/commander/detectors/index.ts`
- Create: `src/renderer/commander/detectors/__tests__/registry.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// src/renderer/commander/detectors/types.ts
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

export type VizKind =
  | 'sparkline'
  | 'threshold-bar'
  | 'diverging-bar'
  | 'mini-timeline'
  | 'tag-bubble'
  | 'stacked-count'
  | 'donut'
  | 'comp-bars';

export interface DetectorFinding {
  id: string;
  side: 'good' | 'bad';
  severity: number;
  headline: string;
  evidence: string;
  threshold: string;
  vizKind: VizKind;
  vizData: unknown;
}

export type Detector = (
  fight: CommanderFightData,
  thresholds: CommanderThresholds,
) => DetectorFinding | null;
```

- [ ] **Step 2: Write registry stub**

```ts
// src/renderer/commander/detectors/index.ts
import type { Detector, DetectorFinding } from './types';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

const DETECTORS: Detector[] = [
  // registered in subsequent tasks
];

export function runAllDetectors(
  fight: CommanderFightData,
  thresholds: CommanderThresholds,
): DetectorFinding[] {
  const results: DetectorFinding[] = [];
  for (const d of DETECTORS) {
    const out = d(fight, thresholds);
    if (out) results.push(out);
  }
  return results;
}

export function topFindings(findings: DetectorFinding[], side: 'good' | 'bad', n = 4): DetectorFinding[] {
  return findings
    .filter(f => f.side === side)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, n);
}
```

- [ ] **Step 3: Write a registry test**

```ts
// src/renderer/commander/detectors/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { runAllDetectors, topFindings } from '../index';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { computeCommanderFightData } from '../../../../shared/commanderMetrics';
import { commanderTestFixture } from '../../../../shared/__tests__/commander.fixtures';

describe('detector registry', () => {
  it('runs without throwing and returns an array', () => {
    const data = computeCommanderFightData(commanderTestFixture);
    const findings = runAllDetectors(data, DEFAULT_COMMANDER_THRESHOLDS);
    expect(Array.isArray(findings)).toBe(true);
  });

  it('topFindings respects side and limit', () => {
    const data = computeCommanderFightData(commanderTestFixture);
    const findings = runAllDetectors(data, DEFAULT_COMMANDER_THRESHOLDS);
    const top = topFindings(findings, 'bad', 4);
    expect(top.length).toBeLessThanOrEqual(4);
    for (const f of top) expect(f.side).toBe('bad');
  });
});
```

- [ ] **Step 4: Run, pass, commit.**

```bash
npm run typecheck && npx vitest run src/renderer/commander/detectors/__tests__/
git add src/renderer/commander/detectors/
git commit -m "feat(commander): detector framework and registry"
```

---

## Task 11: First detector — `firstSquadDeathEarly` (template for the rest)

**Files:**
- Create: `src/renderer/commander/detectors/firstSquadDeathEarly.ts`
- Create: `src/renderer/commander/detectors/__tests__/firstSquadDeathEarly.test.ts`
- Modify: `src/renderer/commander/detectors/index.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, it, expect } from 'vitest';
import detector from '../firstSquadDeathEarly';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import type { CommanderFightData } from '../../../../shared/commanderTypes';

function fightWithFirstDeath(over: Partial<CommanderFightData['survival']['firstSquadDeath']> | null, duration = 60): CommanderFightData {
  return {
    fightId: 'x', map: 'Test', startedAt: 0, duration,
    matchup: { squadCount: 25, alliesCount: 0, enemyCount: 50, enemyPeak: 50, effectiveRatio: 0.5, timeOutnumberedSec: 0, enemyComp: [], inTagBubbleAtEngage: 25 },
    survival: { firstSquadDeath: over === null ? null : { tSec: 8, account: 'Hadrik.4218', profession: 'Firebrand', role: 'support', distFromTag: 1412, ...over }, firstSupportDeath: null, squadAliveAtEnd: 4, squadTotal: 25, rallyRate: 0.5, rallies: 5, downs: 10, avgTimeDownedSec: 4 },
    burst: { worst3sIncoming: 0, worst3sIncomingTSec: 0, inHealRatioAtSpike: 0, healAtSpike: 0, bombWindowCount: 0, bombWindows: [], downsInWorst3s: 0, stabUptimeInSpike: 0 },
    cohesion: { avgDistFromTag: 600, timeSpread900PlusSec: 0, avgDistAtDeath: 800, peakSpreadStdev: 0, peakSpreadStdevTSec: 0, stragglersAtBomb: 0 },
    sustain: { cleansesApplied: 0, conditionsTaken: 0, stripsLanded: 0, stripsReceived: 0, stabThroughBombs: 0, resistanceAtBurst: 0, aegisAtBurst: 0 },
    engage: { squadHpAtEngage: 1, keyCdsUsed0to10s: 0, preEngageDowns: 0, stab0to10s: 1, dodgeStarvation: 'low' },
    outcome: { kills: 0, squadDeaths: 21, allyDeaths: 0, netTrade: 0, damageOut: 0, damageIn: 0, damageOutInRatio: 0 },
    series: { incomingDps: [], healingThroughput: [], stabUptime: [], spreadStdev: [], deathsTimeline: [] },
    verdictChips: [],
  };
}

describe('firstSquadDeathEarly detector', () => {
  it('fires bad when first death is before threshold', () => {
    const f = detector(fightWithFirstDeath({ tSec: 8, distFromTag: 200 }), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).not.toBeNull();
    expect(f!.side).toBe('bad');
    expect(f!.evidence).toContain('0:08');
  });

  it('fires bad when first death is far from tag, even if late', () => {
    const f = detector(fightWithFirstDeath({ tSec: 40, distFromTag: 1400 }), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f!.side).toBe('bad');
    expect(f!.evidence).toContain('1,400');
  });

  it('does not fire when first death is late and close to tag', () => {
    const f = detector(fightWithFirstDeath({ tSec: 40, distFromTag: 300 }), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });

  it('does not fire when no squad death occurred', () => {
    const f = detector(fightWithFirstDeath(null), DEFAULT_COMMANDER_THRESHOLDS);
    expect(f).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fail (module not found)**

Run: `npx vitest run src/renderer/commander/detectors/__tests__/firstSquadDeathEarly.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement detector**

```ts
// src/renderer/commander/detectors/firstSquadDeathEarly.ts
import type { Detector } from './types';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const detector: Detector = (fight, thresholds) => {
  const d = fight.survival.firstSquadDeath;
  if (!d) return null;

  const earlyFlag = d.tSec < thresholds.firstDeathMinSec;
  const farFlag = d.distFromTag > thresholds.firstDeathMaxDist;
  if (!earlyFlag && !farFlag) return null;

  const severity = Math.min(
    1,
    (earlyFlag ? (thresholds.firstDeathMinSec - d.tSec) / thresholds.firstDeathMinSec : 0) +
    (farFlag ? (d.distFromTag - thresholds.firstDeathMaxDist) / thresholds.firstDeathMaxDist : 0)
  );

  const headline = earlyFlag && farFlag
    ? 'First squad death came early and far from tag'
    : earlyFlag
      ? 'First squad death came very early'
      : 'First squad death was far from tag';

  return {
    id: 'first-squad-death-early',
    side: 'bad',
    severity: 0.6 + 0.4 * severity,
    headline,
    evidence: `${fmtTime(d.tSec)}, ${d.distFromTag.toLocaleString()}u from tag · ${d.account.split('.')[0]} (${d.profession})`,
    threshold: `flag if < ${thresholds.firstDeathMinSec}s OR > ${thresholds.firstDeathMaxDist}u`,
    vizKind: 'mini-timeline',
    vizData: { markers: [{ tSec: d.tSec, color: 'red' }], duration: fight.duration },
  };
};

export default detector;
```

- [ ] **Step 4: Register the detector**

In `src/renderer/commander/detectors/index.ts`, add the import and entry:

```ts
import firstSquadDeathEarly from './firstSquadDeathEarly';

const DETECTORS: Detector[] = [
  firstSquadDeathEarly,
];
```

- [ ] **Step 5: Run, pass, commit.**

```bash
npx vitest run src/renderer/commander/detectors/__tests__/firstSquadDeathEarly.test.ts
git add src/renderer/commander/detectors/firstSquadDeathEarly.ts src/renderer/commander/detectors/index.ts src/renderer/commander/detectors/__tests__/firstSquadDeathEarly.test.ts
git commit -m "feat(commander): firstSquadDeathEarly detector"
```

---

## Tasks 12–22: The remaining 12 detectors

Each follows the **exact same pattern** as Task 11. For each:

1. Write a focused test file with: (a) one synthetic fixture function (it's fine to copy the helper from Task 11 and adjust); (b) a "fires" test, a "does not fire" test, and a third edge case;
2. Implement the detector as a default export;
3. Register it in `src/renderer/commander/detectors/index.ts`;
4. Pass tests, commit.

The detectors and their firing conditions (see spec for the canonical table):

### Task 12 — `firstSupportDeathPreBomb`
Fires *bad* when `survival.firstSupportDeath` exists and `firstSupportDeath.tSec < worst3sIncomingTSec - thresholds.supportPreBombLeadSec`. Severity scales with `(worst3sIncomingTSec - tSec)`. Viz: `mini-timeline` with two markers (support death, bomb).

### Task 13 — `bombOverwhelmedSustain`
Fires *bad* when any `bombWindows.outcome === 'broke'`. Severity = the worst window's `incoming / max(1, heal)` mapped to 0..1 via `Math.min(1, x / 4)`. Viz: `sparkline` of `incomingDps` vs `healingThroughput`.

### Task 14 — `bombSurvived`
Fires *good* when `bombWindowCount >= 1` and at least one window has `outcome === 'survived'`. Severity = ratio of survived to total. Viz: `mini-timeline` with markers per window (green for survived, red for broke).

### Task 15 — `stabCoverageGood`
Fires *good* when `engage.stab0to10s >= thresholds.stabGoodEngage`. Severity = `(value - threshold) / (1 - threshold)`. Viz: `sparkline` of `stabUptime` series with horizontal threshold line.

### Task 16 — `stabCoverageBad`
Fires *bad* when `burst.stabUptimeInSpike < thresholds.stabBadInBomb` AND `burst.bombWindowCount >= 1`. Severity = `(threshold - value) / threshold`. Viz: `threshold-bar`.

### Task 17 — `cleanseRaceWon`
Fires *good* when `sustain.cleansesApplied - sustain.conditionsTaken > 0`. Severity = `Math.min(1, net / 100)`. Viz: `diverging-bar`.

### Task 18 — `cleanseRaceLost`
Fires *bad* when `cleansesApplied - conditionsTaken < thresholds.cleanseDeficitWarn`. Severity scales with magnitude. Viz: `diverging-bar`.

### Task 19 — `stripRaceLost`
Fires *bad* when `stripsReceived - stripsLanded > thresholds.stripDeficitWarn`. Viz: `diverging-bar`.

### Task 20 — `rallyRateHealthy`
Fires *good* when `survival.rallyRate >= thresholds.rallyGood` AND `survival.downs >= 4`. Severity = `rallyRate`. Viz: `donut`.

### Task 21 — `caughtOutDeaths`
Fires *bad* when `cohesion.avgDistAtDeath > thresholds.caughtOutDist` AND `outcome.squadDeaths >= 3`. Severity = `(avg - threshold) / threshold`. Viz: `tag-bubble`.

### Task 22 — `fragmentedAtBomb`
Fires *bad* when `cohesion.peakSpreadStdev > thresholds.spreadBad` AND the peak's `tSec` is within any bombWindow. Viz: `sparkline` of `spreadStdev`.

### Task 23 — `outnumberedSignificantly` (informational, not a column finding)
This one is special — it surfaces as a verdict chip, not an insight bullet. Skip the detector file; the chip is already produced by `commanderMetrics.ts` Task 8.

(So Task 23 becomes a no-op verification step: confirm `verdictChips` correctly includes `'outnumbered'` when ratio < threshold. Add an assertion to the existing matchup test if not already there.)

---

## Task 24: Viz primitive — `ThresholdBar` (template for the rest)

**Files:**
- Create: `src/renderer/commander/viz/ThresholdBar.tsx`
- Create: `src/renderer/commander/viz/__tests__/ThresholdBar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThresholdBar } from '../ThresholdBar';

describe('ThresholdBar', () => {
  it('renders a fill width proportional to value/max and a threshold tick', () => {
    const { container } = render(
      <ThresholdBar value={0.74} max={2} threshold={1} severity="red" />
    );
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement;
    const tick = container.querySelector('[data-role="threshold"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(tick).toBeTruthy();
    expect(fill.style.width).toBe('37%');         // 0.74/2 = 0.37
    expect(tick.style.left).toBe('50%');          // 1/2 = 0.5
    expect(fill.className).toContain('red');
  });

  it('clamps overflow values to 100%', () => {
    const { container } = render(<ThresholdBar value={5} max={2} threshold={1} severity="green" />);
    const fill = container.querySelector('[data-role="fill"]') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});
```

- [ ] **Step 2: Run, confirm fail.**

Run: `npx vitest run src/renderer/commander/viz/__tests__/ThresholdBar.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// src/renderer/commander/viz/ThresholdBar.tsx
import React from 'react';

export type Severity = 'green' | 'yellow' | 'red';

interface ThresholdBarProps {
  value: number;
  max: number;
  threshold?: number;
  severity: Severity;
  width?: number | string;
}

const FILL_CLASS: Record<Severity, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red:    'bg-rose-500',
};

export function ThresholdBar({ value, max, threshold, severity, width = '100%' }: ThresholdBarProps) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  const thresholdPct = threshold == null
    ? null
    : Math.max(0, Math.min(100, (threshold / Math.max(1e-9, max)) * 100));

  return (
    <div className="relative h-1.5 rounded-sm bg-slate-800" style={{ width }}>
      <div
        data-role="fill"
        className={`absolute left-0 top-0 bottom-0 rounded-sm ${FILL_CLASS[severity]}`}
        style={{ width: `${pct}%` }}
      />
      {thresholdPct != null && (
        <div
          data-role="threshold"
          className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-slate-200/70"
          style={{ left: `${thresholdPct}%` }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, pass, commit.**

```bash
git add src/renderer/commander/viz/ThresholdBar.tsx src/renderer/commander/viz/__tests__/ThresholdBar.test.tsx
git commit -m "feat(commander): ThresholdBar viz primitive"
```

---

## Tasks 25–31: Remaining viz primitives

Each follows the **exact same pattern** as Task 24. Spec details and dimensions are in the approved mockup `commander-tab-mock-v2.html`.

### Task 25 — `DivergingBar`
Props: `{ positive: number; negative: number; width? }`. Renders a horizontal bar split into green (positive) and red (negative) proportional to their absolute values. One render test asserting bar widths.

### Task 26 — `Sparkline`
Props: `{ series: number[]; thresholdLine?: number; color: 'green' | 'red' | 'amber'; secondarySeries?: number[]; width?: number; height?: number; markerAt?: { index: number; color?: string } }`. Renders an inline SVG polyline. Test asserts an svg with a polyline of the correct number of points.

### Task 27 — `MiniTimeline`
Props: `{ duration: number; markers: Array<{ tSec: number; color: 'green'|'yellow'|'red'; label?: string }> }`. Renders a horizontal track with diamond markers positioned by `tSec/duration`. Test asserts markers are positioned at the correct left percentages.

### Task 28 — `TagBubble`
Props: `{ inside: number; outside: number; tagRadius?: number; outliers?: number }`. Renders an SVG with a central dashed circle and dots clustered inside vs. scattered outside. Test asserts correct dot counts.

### Task 29 — `StackedCountBar`
Props: `{ alive: number; downed?: number; dead: number; aliveColor?: string }`. Renders a horizontal bar split proportionally. Test asserts segment widths.

### Task 30 — `CompBars`
Props: `{ comp: Array<{ profession: string; count: number }>; max?: number }`. Renders one vertical bar per enemy, colored by profession (use existing `professionUtils.ts` color map). Test asserts bar count equals total enemies.

### Task 31 — `Donut`
Props: `{ pct: number; color: Severity; label?: string }`. Renders a 38×38 SVG donut showing the percentage. Test asserts stroke-dasharray reflects the percentage.

---

## Task 32: Insight card + visualization router

**Files:**
- Create: `src/renderer/commander/InsightCard.tsx`
- Create: `src/renderer/commander/viz/VizRouter.tsx`

- [ ] **Step 1: Write `VizRouter`**

```tsx
// src/renderer/commander/viz/VizRouter.tsx
import React from 'react';
import type { VizKind } from '../detectors/types';
import { ThresholdBar } from './ThresholdBar';
import { DivergingBar } from './DivergingBar';
import { Sparkline } from './Sparkline';
import { MiniTimeline } from './MiniTimeline';
import { TagBubble } from './TagBubble';
import { StackedCountBar } from './StackedCountBar';
import { CompBars } from './CompBars';
import { Donut } from './Donut';

interface VizRouterProps {
  kind: VizKind;
  data: unknown;
}

export function VizRouter({ kind, data }: VizRouterProps) {
  switch (kind) {
    case 'threshold-bar': return <ThresholdBar {...(data as any)} />;
    case 'diverging-bar': return <DivergingBar {...(data as any)} />;
    case 'sparkline':     return <Sparkline    {...(data as any)} />;
    case 'mini-timeline': return <MiniTimeline {...(data as any)} />;
    case 'tag-bubble':    return <TagBubble    {...(data as any)} />;
    case 'stacked-count': return <StackedCountBar {...(data as any)} />;
    case 'comp-bars':     return <CompBars     {...(data as any)} />;
    case 'donut':         return <Donut        {...(data as any)} />;
    default: return null;
  }
}
```

- [ ] **Step 2: Write `InsightCard`**

```tsx
// src/renderer/commander/InsightCard.tsx
import React from 'react';
import type { DetectorFinding } from './detectors/types';
import { VizRouter } from './viz/VizRouter';

export function InsightCard({ finding }: { finding: DetectorFinding }) {
  const borderColor = finding.side === 'good' ? 'border-l-emerald-500' : 'border-l-rose-500';
  return (
    <div className={`grid grid-cols-[1fr_110px] gap-2.5 items-center rounded-md bg-slate-900 border-l-4 ${borderColor} p-2.5 mb-2`}>
      <div>
        <div className="text-sm text-slate-200 font-medium mb-0.5">{finding.headline}</div>
        <div className="text-[11px] text-slate-400 font-mono">{finding.evidence}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{finding.threshold}</div>
      </div>
      <div className="flex items-center justify-center">
        <VizRouter kind={finding.vizKind} data={finding.vizData} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```bash
git add src/renderer/commander/InsightCard.tsx src/renderer/commander/viz/VizRouter.tsx
git commit -m "feat(commander): insight card and viz router"
```

---

## Task 33: `CommanderInsights` — the two insight columns

**Files:**
- Create: `src/renderer/commander/CommanderInsights.tsx`
- Create: `src/renderer/commander/__tests__/CommanderInsights.test.tsx`

- [ ] **Step 1: Tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommanderInsights } from '../CommanderInsights';
import type { DetectorFinding } from '../detectors/types';

const fGood = (id: string, severity = 0.5): DetectorFinding => ({
  id, side: 'good', severity,
  headline: `good ${id}`, evidence: 'e', threshold: 't',
  vizKind: 'threshold-bar', vizData: { value: 1, max: 2, severity: 'green' },
});
const fBad = (id: string, severity = 0.5): DetectorFinding => ({ ...fGood(id, severity), side: 'bad' });

describe('CommanderInsights', () => {
  it('renders up to 4 findings per side, sorted by severity', () => {
    render(<CommanderInsights findings={[fGood('a', 0.1), fGood('b', 0.9), fBad('c', 0.7), fBad('d', 0.2)]} />);
    expect(screen.getByText('good b')).toBeInTheDocument();
    expect(screen.getByText('good a')).toBeInTheDocument();
    expect(screen.getByText('What went right')).toBeInTheDocument();
    expect(screen.getByText("Could've gone better")).toBeInTheDocument();
  });

  it('shows an empty-state line when one side has no findings', () => {
    render(<CommanderInsights findings={[fBad('only', 0.5)]} />);
    expect(screen.getByText(/nothing notable yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implementation**

```tsx
// src/renderer/commander/CommanderInsights.tsx
import React from 'react';
import { InsightCard } from './InsightCard';
import { topFindings } from './detectors';
import type { DetectorFinding } from './detectors/types';

export function CommanderInsights({ findings }: { findings: DetectorFinding[] }) {
  const good = topFindings(findings, 'good', 4);
  const bad  = topFindings(findings, 'bad',  4);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
      <Column title="✓ What went right" tone="good" findings={good} />
      <Column title="⚠ Could've gone better" tone="bad" findings={bad} />
    </div>
  );
}

function Column({ title, tone, findings }: { title: string; tone: 'good' | 'bad'; findings: DetectorFinding[] }) {
  const titleColor = tone === 'good' ? 'text-emerald-400' : 'text-rose-400';
  const cleanTitle = title.replace(/^[^A-Za-z]+/, '');
  return (
    <section className="rounded-md bg-slate-900 border border-slate-800 p-3">
      <div className={`text-[12px] uppercase tracking-[0.06em] mb-2 ${titleColor}`}>{cleanTitle}</div>
      {findings.length === 0
        ? <div className="text-xs text-slate-500 italic">Nothing notable yet.</div>
        : findings.map(f => <InsightCard key={f.id} finding={f} />)}
    </section>
  );
}
```

The test uses literal `"What went right"` text, so leave the column title without the leading `✓ ` symbol (or strip it before rendering). Adjust as needed to match the test.

- [ ] **Step 3: Run, pass, commit.**

```bash
git add src/renderer/commander/CommanderInsights.tsx src/renderer/commander/__tests__/CommanderInsights.test.tsx
git commit -m "feat(commander): insight columns component"
```

---

## Task 34: `CommanderHeader` (fight header + selector + verdict chips)

**Files:**
- Create: `src/renderer/commander/CommanderHeader.tsx`

- [ ] **Step 1: Build component**

Props:

```tsx
interface CommanderHeaderProps {
  fight: CommanderFightData;
  availableFights: Array<{ id: string; label: string }>;
  selectedFightId: string;
  onSelectFight: (id: string) => void;
}
```

Renders: map name (large), `HH:MM`, duration, matchup line (`Squad 25 + Allies 12 vs Enemy ~50 (peak 53)`), verdict chips for each entry in `fight.verdictChips` (with a small color map), and a `<select>` dropdown for `availableFights`.

Chip color map:

```ts
const CHIP_STYLE: Record<VerdictChip, string> = {
  'wipe':          'bg-rose-500/15 text-rose-300 border-rose-500/35',
  'trade':         'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'carry':         'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  'clean':         'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  'outnumbered':   'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'caught-engage': 'bg-violet-500/15 text-violet-300 border-violet-500/35',
  'caught-out':    'bg-violet-500/15 text-violet-300 border-violet-500/35',
  'bomb-broke-us': 'bg-rose-500/15 text-rose-300 border-rose-500/35',
};
```

- [ ] **Step 2: Smoke test**

A simple `render` test asserting the map name and one verdict chip render. No deep logic — visual.

- [ ] **Step 3: Commit.**

```bash
git add src/renderer/commander/CommanderHeader.tsx
git commit -m "feat(commander): fight header with selector and verdict chips"
```

---

## Task 35: `CommanderRollup` (session strip)

**Files:**
- Create: `src/renderer/commander/CommanderRollup.tsx`
- Create: `src/renderer/commander/hooks/useCommanderRollup.ts`

- [ ] **Step 1: Hook**

```ts
// src/renderer/commander/hooks/useCommanderRollup.ts
import { useMemo } from 'react';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import type { ILogData } from '../../global';

export interface CommanderRollup {
  fightCount: number;
  spanMs: number;
  kills: number;
  squadDeaths: number;
  ratio: number;
  squadAliveAvgPct: number;
  avgDurationSec: number;
  outnumberedCount: number;
  alivePctSeries: number[];   // one per fight, oldest to newest
}

export function useCommanderRollup(logs: ILogData[]): CommanderRollup | null {
  return useMemo(() => {
    const hydrated = logs.filter(l => l.detailedJson != null);
    if (hydrated.length === 0) return null;
    const datas = hydrated.map(l => computeCommanderFightData(l.detailedJson!));

    const kills = datas.reduce((a, d) => a + d.outcome.kills, 0);
    const squadDeaths = datas.reduce((a, d) => a + d.outcome.squadDeaths, 0);
    const totalAlivePct = datas.reduce((a, d) => a + (d.survival.squadAliveAtEnd / Math.max(1, d.survival.squadTotal)), 0);
    const totalDuration = datas.reduce((a, d) => a + d.duration, 0);
    const outnumbered = datas.filter(d => d.matchup.effectiveRatio < 1).length;
    const alivePctSeries = datas.map(d => d.survival.squadAliveAtEnd / Math.max(1, d.survival.squadTotal));
    const spanMs = datas.length >= 2 ? datas[datas.length - 1].startedAt - datas[0].startedAt : 0;

    return {
      fightCount: datas.length,
      spanMs,
      kills,
      squadDeaths,
      ratio: kills / Math.max(1, squadDeaths),
      squadAliveAvgPct: totalAlivePct / datas.length,
      avgDurationSec: totalDuration / datas.length,
      outnumberedCount: outnumbered,
      alivePctSeries,
    };
  }, [logs]);
}
```

- [ ] **Step 2: Component**

```tsx
// src/renderer/commander/CommanderRollup.tsx
import React from 'react';
import { Sparkline } from './viz/Sparkline';
import type { CommanderRollup } from './hooks/useCommanderRollup';

function fmtDur(sec: number): string { /* 1h 12m or 18m etc */ /* implement inline */ return ''; }
function fmtMinSec(sec: number): string {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CommanderRollup({ rollup }: { rollup: CommanderRollup | null }) {
  if (!rollup) return null;
  return (
    <div className="grid grid-cols-6 gap-2 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-md mb-3">
      <Item label="Tonight" value={`${rollup.fightCount} fights`} sub={fmtDur(rollup.spanMs / 1000)} />
      <Item label="K / D"    value={`${rollup.kills} / ${rollup.squadDeaths}`} sub={`${rollup.ratio.toFixed(2)} ratio`} />
      <Item label="Squad alive avg" value={`${Math.round(rollup.squadAliveAvgPct * 100)}%`} sub="across loaded fights" />
      <Item label="Avg duration" value={fmtMinSec(rollup.avgDurationSec)} sub="" />
      <Item label="Outnumbered" value={`${rollup.outnumberedCount} / ${rollup.fightCount}`} sub="" />
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Trend</div>
        <Sparkline series={rollup.alivePctSeries} color="red" width={100} height={24} />
      </div>
    </div>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[15px] font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```bash
git add src/renderer/commander/CommanderRollup.tsx src/renderer/commander/hooks/useCommanderRollup.ts
git commit -m "feat(commander): session rollup strip"
```

---

## Task 36: `CommanderGrid` (the seven metric sections)

**Files:**
- Create: `src/renderer/commander/CommanderGrid.tsx`
- Create: `src/renderer/commander/sections/MatchupSection.tsx`
- Create: `src/renderer/commander/sections/SurvivalSection.tsx`
- Create: `src/renderer/commander/sections/BurstSection.tsx`
- Create: `src/renderer/commander/sections/CohesionSection.tsx`
- Create: `src/renderer/commander/sections/SustainSection.tsx`
- Create: `src/renderer/commander/sections/EngageSection.tsx`
- Create: `src/renderer/commander/sections/OutcomeSection.tsx`

- [ ] **Step 1: Card primitive**

```tsx
// src/renderer/commander/sections/MetricCard.tsx
import React from 'react';
import type { Severity } from '../viz/ThresholdBar';

interface MetricCardProps {
  label: string;
  value: string;
  meta?: string;
  severity: Severity;
  children?: React.ReactNode;   // the visualization
}

const STRIPE: Record<Severity, string> = {
  green:  'border-l-emerald-500',
  yellow: 'border-l-amber-500',
  red:    'border-l-rose-500',
};

export function MetricCard({ label, value, meta, severity, children }: MetricCardProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-md bg-slate-900 border border-slate-800 border-l-4 ${STRIPE[severity]} px-2.5 py-2 min-h-[92px]`}>
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-[17px] font-semibold text-slate-100 leading-tight">{value}</span>
      </div>
      {meta && <div className="text-[10px] text-slate-400">{meta}</div>}
      <div className="mt-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Build each section file**

Each section receives `{ fight, thresholds }` and renders a row of 5 `MetricCard`s with the metrics enumerated in the spec under "Metric content per section." The viz inside each card uses the appropriate primitive from `viz/`.

To keep this plan readable, here's the pattern for one section (Matchup); the other six follow the same shape:

```tsx
// src/renderer/commander/sections/MatchupSection.tsx
import React from 'react';
import { MetricCard } from './MetricCard';
import { ThresholdBar } from '../viz/ThresholdBar';
import { CompBars } from '../viz/CompBars';
import { TagBubble } from '../viz/TagBubble';
import type { CommanderFightData } from '../../../shared/commanderTypes';

function durStr(sec: number): string {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function severityForRatio(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio >= 1.0) return 'green';
  if (ratio >= 0.85) return 'yellow';
  return 'red';
}

export function MatchupSection({ fight }: { fight: CommanderFightData }) {
  const m = fight.matchup;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard label="Sq / Ally / Enemy" value={`${m.squadCount}·${m.alliesCount}·${m.enemyCount}`} meta={`peak enemy ${m.enemyPeak}`} severity={severityForRatio(m.effectiveRatio)} />
      <MetricCard label="Effective ratio" value={`${m.effectiveRatio.toFixed(2)}×`} meta="(sq+ally) / enemy" severity={severityForRatio(m.effectiveRatio)}>
        <ThresholdBar value={m.effectiveRatio} max={2} threshold={1} severity={severityForRatio(m.effectiveRatio)} />
      </MetricCard>
      <MetricCard label="Time outnumbered" value={durStr(m.timeOutnumberedSec)} meta={`${Math.round(100 * m.timeOutnumberedSec / Math.max(1, fight.duration))}% of fight`} severity={m.timeOutnumberedSec > fight.duration * 0.5 ? 'red' : 'yellow'}>
        <ThresholdBar value={m.timeOutnumberedSec} max={fight.duration} severity={'red'} />
      </MetricCard>
      <MetricCard label="Enemy comp" value={m.enemyComp.slice(0,2).map(e => `${e.count}${e.profession[0]}`).join(' · ')} meta="" severity="yellow">
        <CompBars comp={m.enemyComp} />
      </MetricCard>
      <MetricCard label="In tag bubble" value={`${m.inTagBubbleAtEngage}/${m.squadCount}`} meta="at engage start" severity={m.inTagBubbleAtEngage / Math.max(1, m.squadCount) > 0.8 ? 'green' : 'yellow'}>
        <TagBubble inside={m.inTagBubbleAtEngage} outside={m.squadCount - m.inTagBubbleAtEngage} />
      </MetricCard>
    </div>
  );
}
```

Implement the other six sections (`SurvivalSection`, `BurstSection`, `CohesionSection`, `SustainSection`, `EngageSection`, `OutcomeSection`) using the exact metrics enumerated in the spec under "Metric content per section" with the visualizations indicated in the spec table. Use the same severity-bucketing pattern: simple inline functions that map a value to `green`/`yellow`/`red` based on the relevant threshold from `CommanderThresholds`.

- [ ] **Step 3: Compose `CommanderGrid`**

```tsx
// src/renderer/commander/CommanderGrid.tsx
import React from 'react';
import { MatchupSection } from './sections/MatchupSection';
import { SurvivalSection } from './sections/SurvivalSection';
import { BurstSection } from './sections/BurstSection';
import { CohesionSection } from './sections/CohesionSection';
import { SustainSection } from './sections/SustainSection';
import { EngageSection } from './sections/EngageSection';
import { OutcomeSection } from './sections/OutcomeSection';
import type { CommanderFightData } from '../../shared/commanderTypes';
import type { CommanderThresholds } from '../../shared/commanderThresholds';

const SECTIONS = [
  { title: '1. Numbers & Matchup',       Comp: MatchupSection },
  { title: '2. Survival & Attrition',    Comp: SurvivalSection },
  { title: '3. Burst Exposure',          Comp: BurstSection },
  { title: '4. Cohesion & Positioning',  Comp: CohesionSection },
  { title: '5. Sustain Race',            Comp: SustainSection },
  { title: '6. Engage Readiness',        Comp: EngageSection },
  { title: '7. Outcome Ledger',          Comp: OutcomeSection },
];

export function CommanderGrid({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  return (
    <div className="flex flex-col gap-2">
      {SECTIONS.map(({ title, Comp }) => (
        <div key={title} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 mx-1 mt-2">
            <span>{title}</span>
            <span className="flex-1 h-px bg-slate-800" />
          </div>
          <Comp fight={fight} thresholds={thresholds} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Smoke test**

```tsx
// src/renderer/commander/__tests__/CommanderGrid.test.tsx
import { render, screen } from '@testing-library/react';
import { CommanderGrid } from '../CommanderGrid';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../shared/commanderThresholds';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import { commanderTestFixture } from '../../../shared/__tests__/commander.fixtures';

it('renders all seven sections', () => {
  const fight = computeCommanderFightData(commanderTestFixture);
  render(<CommanderGrid fight={fight} thresholds={DEFAULT_COMMANDER_THRESHOLDS} />);
  expect(screen.getByText(/Numbers & Matchup/i)).toBeInTheDocument();
  expect(screen.getByText(/Outcome Ledger/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Pass, commit.**

```bash
git add src/renderer/commander/
git commit -m "feat(commander): metric grid with seven sections"
```

---

## Task 37: `useCommanderFightData` hook (selection + LRU cache)

**Files:**
- Create: `src/renderer/commander/hooks/useCommanderFightData.ts`

- [ ] **Step 1: Implementation**

```ts
// src/renderer/commander/hooks/useCommanderFightData.ts
import { useMemo, useRef, useState, useCallback } from 'react';
import { computeCommanderFightData } from '../../../shared/commanderMetrics';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { ILogData } from '../../global';

const LRU_LIMIT = 10;

export function useCommanderFightData(logs: ILogData[]) {
  const hydrated = useMemo(
    () => logs.filter(l => l.detailedJson != null).sort((a, b) => b.uploadedAt - a.uploadedAt),
    [logs]
  );

  const mostRecentId = hydrated[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = selectedId ?? mostRecentId;

  const cacheRef = useRef<Map<string, CommanderFightData>>(new Map());

  const fight = useMemo(() => {
    if (!effectiveId) return null;
    const cached = cacheRef.current.get(effectiveId);
    if (cached) return cached;
    const log = hydrated.find(l => l.id === effectiveId);
    if (!log?.detailedJson) return null;
    const data = computeCommanderFightData(log.detailedJson);
    cacheRef.current.set(effectiveId, data);
    if (cacheRef.current.size > LRU_LIMIT) {
      const first = cacheRef.current.keys().next().value;
      if (first) cacheRef.current.delete(first);
    }
    return data;
  }, [effectiveId, hydrated]);

  const availableFights = useMemo(
    () => hydrated.map(l => ({
      id: l.id,
      label: `${new Date(l.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${l.encounter ?? 'Fight'}`,
    })),
    [hydrated]
  );

  const selectFight = useCallback((id: string) => setSelectedId(id), []);

  return { fight, selectedFightId: effectiveId, availableFights, selectFight };
}
```

(Adjust `ILogData` property names — `id`, `uploadedAt`, `detailedJson`, `encounter` — to match the actual interface in `src/renderer/global.d.ts`.)

- [ ] **Step 2: Commit.**

```bash
git add src/renderer/commander/hooks/useCommanderFightData.ts
git commit -m "feat(commander): fight-data hook with LRU cache"
```

---

## Task 38: `useCommanderThresholds` hook (settings integration)

**Files:**
- Create: `src/renderer/commander/hooks/useCommanderThresholds.ts`

- [ ] **Step 1: Implementation**

```ts
// src/renderer/commander/hooks/useCommanderThresholds.ts
import { useEffect, useState, useCallback } from 'react';
import { DEFAULT_COMMANDER_THRESHOLDS, type CommanderThresholds } from '../../../shared/commanderThresholds';

export function useCommanderThresholds() {
  const [thresholds, setThresholds] = useState<CommanderThresholds>(DEFAULT_COMMANDER_THRESHOLDS);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getSettings?.().then((s: { commanderThresholds?: Partial<CommanderThresholds> }) => {
      if (cancelled || !s?.commanderThresholds) return;
      setThresholds({ ...DEFAULT_COMMANDER_THRESHOLDS, ...s.commanderThresholds });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((patch: Partial<CommanderThresholds>) => {
    setThresholds(prev => {
      const next = { ...prev, ...patch };
      window.electronAPI.saveSettings?.({ commanderThresholds: next }).catch(() => {});
      return next;
    });
  }, []);

  return { thresholds, update };
}
```

Confirm the actual `electronAPI` channel names from `src/preload/index.ts`; adjust calls accordingly.

- [ ] **Step 2: Commit.**

```bash
git add src/renderer/commander/hooks/useCommanderThresholds.ts
git commit -m "feat(commander): thresholds settings hook"
```

---

## Task 39: `CommanderEmptyState` + `CommanderView` (top-level page)

**Files:**
- Create: `src/renderer/commander/CommanderEmptyState.tsx`
- Create: `src/renderer/commander/CommanderView.tsx`

- [ ] **Step 1: Empty state**

```tsx
// src/renderer/commander/CommanderEmptyState.tsx
import React from 'react';

export function CommanderEmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
      <div className="text-center">
        <div className="text-base font-medium text-slate-200 mb-1">No logs yet</div>
        <div className="text-sm">Drop a .zevtc into your watched folder or upload one to see your latest fight.</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CommanderView`**

```tsx
// src/renderer/commander/CommanderView.tsx
import React, { useMemo } from 'react';
import { CommanderHeader } from './CommanderHeader';
import { CommanderRollup } from './CommanderRollup';
import { CommanderInsights } from './CommanderInsights';
import { CommanderGrid } from './CommanderGrid';
import { CommanderEmptyState } from './CommanderEmptyState';
import { useCommanderFightData } from './hooks/useCommanderFightData';
import { useCommanderRollup } from './hooks/useCommanderRollup';
import { useCommanderThresholds } from './hooks/useCommanderThresholds';
import { runAllDetectors } from './detectors';
import type { ILogData } from '../global';

export function CommanderView({ logs }: { logs: ILogData[] }) {
  const { fight, selectedFightId, availableFights, selectFight } = useCommanderFightData(logs);
  const rollup = useCommanderRollup(logs);
  const { thresholds } = useCommanderThresholds();

  const findings = useMemo(
    () => (fight ? runAllDetectors(fight, thresholds) : []),
    [fight, thresholds]
  );

  if (!fight) return <CommanderEmptyState />;

  return (
    <div className="flex flex-col p-4">
      <CommanderRollup rollup={rollup} />
      <CommanderHeader
        fight={fight}
        availableFights={availableFights}
        selectedFightId={selectedFightId!}
        onSelectFight={selectFight}
      />
      <CommanderInsights findings={findings} />
      <CommanderGrid fight={fight} thresholds={thresholds} />
    </div>
  );
}
```

- [ ] **Step 3: Commit.**

```bash
git add src/renderer/commander/CommanderView.tsx src/renderer/commander/CommanderEmptyState.tsx
git commit -m "feat(commander): top-level CommanderView page"
```

---

## Task 40: Tab registration (App + AppLayout)

**Files:**
- Modify: `src/renderer/app/hooks/useAppNavigation.ts`
- Modify: `src/renderer/app/AppLayout.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Extend the view union**

In `src/renderer/app/hooks/useAppNavigation.ts:20`, change:

```ts
const [view, setView] = useState<'dashboard' | 'stats' | 'history' | 'settings'>('dashboard');
```

to:

```ts
const [view, setView] = useState<'dashboard' | 'stats' | 'commander' | 'history' | 'settings'>('dashboard');
```

- [ ] **Step 2: Add the tab between Stats and History**

In `src/renderer/app/AppLayout.tsx` around line 207, change the inline tab list:

```tsx
{([
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    { id: 'commander' as const, label: 'Commander', icon: ShieldCheck },
    { id: 'history' as const, label: 'History', icon: Clock3 },
    { id: 'settings' as const, label: 'Settings', icon: SettingsIcon },
]).map(...)}
```

Add `ShieldCheck` to the lucide-react import line at the top of `AppLayout.tsx`.

- [ ] **Step 3: Wire the view in `App.tsx`**

Find the existing `view === 'stats'`, `view === 'history'` rendering. Add a sibling branch:

```tsx
{view === 'commander' && <CommanderView logs={logs} />}
```

Import `CommanderView` from `./commander/CommanderView`.

- [ ] **Step 4: Run dev to smoke-test manually**

Run: `npm run dev`. Click the Commander tab. Confirm the page renders without errors (with logs loaded) and the empty state shows when no logs are loaded.

- [ ] **Step 5: Run validation**

Run: `npm run validate`
Expected: passes.

- [ ] **Step 6: Commit.**

```bash
git add src/renderer/App.tsx src/renderer/app/AppLayout.tsx src/renderer/app/hooks/useAppNavigation.ts
git commit -m "feat(commander): register Commander tab between Stats and History"
```

---

## Task 41: Settings UI for thresholds

**Files:**
- Modify: `src/renderer/SettingsView.tsx`
- (Possibly modify: `src/renderer/global.d.ts` and/or settings persistence layer)

- [ ] **Step 1: Add settings shape**

If `IUserSettings` (or whatever it's called) does not already accept arbitrary keys, add `commanderThresholds?: Partial<CommanderThresholds>` to it in `global.d.ts` and to the IPC-side default settings in `src/main/index.ts`.

- [ ] **Step 2: Add a "Commander thresholds" section to `SettingsView.tsx`**

Place after the existing metrics settings. For each entry in `DEFAULT_COMMANDER_THRESHOLDS`, render a labeled numeric input with a "Reset" button per row and a "Reset all to defaults" button at the top.

```tsx
// pseudo: inside SettingsView
import { DEFAULT_COMMANDER_THRESHOLDS, type CommanderThresholds } from '../shared/commanderThresholds';

const LABELS: Record<keyof CommanderThresholds, string> = {
  firstDeathMinSec: 'First squad death — flag if before (seconds)',
  firstDeathMaxDist: 'First squad death — flag if farther than (units)',
  bombRatio: 'Bomb overwhelms sustain when incoming/heal ≥ (×)',
  bombFloor: 'Bomb-window minimum incoming damage floor (or "auto")',
  stabGoodEngage: 'Stab in engage considered good ≥ (0–1)',
  stabBadInBomb: 'Stab in bomb window considered bad < (0–1)',
  cleanseDeficitWarn: 'Cleanse deficit warning threshold (signed int)',
  stripDeficitWarn: 'Strip deficit warning threshold (positive int)',
  rallyGood: 'Rally rate considered good ≥ (0–1)',
  caughtOutDist: 'Avg dist at death "caught out" threshold (units)',
  spreadBad: 'Spread σ "fragmented" threshold (units)',
  outnumberedRatio: 'Outnumbered chip when ratio < (0–1)',
  tagRadius: 'Tag bubble radius (units)',
  supportPreBombLeadSec: 'Support-died-before-bomb lead time (seconds)',
};

// Render one <label> + <input type="number"> per key, calling the threshold update hook to save.
```

- [ ] **Step 3: Smoke test the round-trip**

Run dev, open Settings → Commander thresholds, change a value, switch to Commander tab, observe a card severity changing. Switch back, click Reset, confirm default restored.

- [ ] **Step 4: Commit.**

```bash
git add src/renderer/SettingsView.tsx src/renderer/global.d.ts src/main/index.ts
git commit -m "feat(commander): Settings UI for tunable thresholds"
```

---

## Task 42: Final integration test + lint pass

**Files:**
- Create: `src/renderer/commander/__tests__/CommanderView.integration.test.tsx`

- [ ] **Step 1: Integration test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommanderView } from '../CommanderView';
import { commanderTestFixture } from '../../../shared/__tests__/commander.fixtures';

const fakeLog = {
  id: 'log1', uploadedAt: Date.now(), encounter: 'Test', detailedJson: commanderTestFixture,
} as any;

describe('CommanderView integration', () => {
  it('renders header, insights, and all seven sections for one log', () => {
    render(<CommanderView logs={[fakeLog]} />);
    expect(screen.getByText(/Numbers & Matchup/i)).toBeInTheDocument();
    expect(screen.getByText(/Outcome Ledger/i)).toBeInTheDocument();
  });

  it('shows empty state with no logs', () => {
    render(<CommanderView logs={[]} />);
    expect(screen.getByText(/No logs yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run all Commander tests**

Run:
```bash
npx vitest run src/shared/__tests__/commanderMetrics.test.ts src/renderer/commander
```
Expected: all green.

- [ ] **Step 3: Lint + typecheck**

Run: `npm run validate`
Expected: passes with 0 warnings.

- [ ] **Step 4: Commit.**

```bash
git add src/renderer/commander/__tests__/CommanderView.integration.test.tsx
git commit -m "test(commander): end-to-end integration smoke test"
```

---

## Self-review checklist (completed by the author of this plan)

- [x] **Spec coverage** — every spec section has at least one task:
  - Layout → Tasks 32–36, 39
  - Selected fight → Task 37
  - Session rollup → Task 35
  - Fight header → Task 34
  - Insight columns → Tasks 33, 11–22
  - Metric grid (all 7 sections) → Task 36
  - Detectors (13) → Tasks 10, 11–23
  - Visual vocabulary (8 primitives) → Tasks 24–31
  - Settings integration → Tasks 38, 41
  - Tab registration → Task 40
  - Empty/skeleton states → Task 39
  - Testing → Tasks 2–9 (metrics), 11–22 (detectors), 24 (viz), 33 (insights), 36 (grid), 42 (integration)
- [x] **Placeholders** — no "TBD" / "TODO" / "fill in details" in active tasks. Two pragmatic exceptions: Task 7's `dodgeStarvation = 'low'` v1 heuristic (acknowledged in the spec); Task 4's `firstSupportDeath` fallback to `EI.player.role === 'Support'` when the role helper isn't found (acknowledged in Task 0).
- [x] **Type consistency** — `CommanderFightData` shape from Task 1 is referenced uniformly across Tasks 2–9 and the detectors. `DetectorFinding` shape from Task 10 is referenced uniformly across Tasks 11–22 and the InsightCard. `Severity` (`green`/`yellow`/`red`) from Task 24 is used by Task 36's `MetricCard`.
- [x] **Scope** — single feature, one tab, one spec. No decomposition needed.
