# Timeline Team Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Squad vs Enemy Size" chart default to one line per WvW team — your team in its real colour with a glow, each enemy team in theirs — with a toggle that collapses the enemy lines back into today's single combined line.

**Architecture:** Enemy targets are bucketed by `teamID` → WvW colour during incremental aggregation, adding three fixed numeric keys to each `timelineData` point. The session's own team colour is tallied per log and resolved in `finalize()`, which then zeroes that colour's key so mis-mapped enemies can never draw on your line. The Unknown bucket is never stored — it is derived at render time as the remainder against the existing `enemies` total, which makes the sum invariant structural and makes legacy precomputed reports degrade gracefully. Which lines exist and how they are labelled is decided by a pure `resolveTimelineSeries` function, because recharts renders nothing under jsdom and none of that logic would otherwise be testable.

**Tech Stack:** TypeScript, React, recharts, vitest + @testing-library/react, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-11-timeline-team-split-design.md`

## Global Constraints

- Run vitest with `--maxWorkers=2`. Never run it unbounded — the repo's `CLAUDE.md` caps parallelism to protect system memory.
- `npm run validate` (typecheck + eslint, `--max-warnings 0`) must pass before the final commit.
- The existing `enemies`, `squadCount`, and `friendlyCount` values on each timeline point must not change. Combined mode has to be byte-identical to today's chart.
- Team colours come from `WVW_TEAM_COLOR_META` in `src/shared/wvwTeams.ts` — red `#f87171`, green `#4ade80`, blue `#60a5fa`, unknown `#9ca3af`. Do not introduce new colour literals for teams.
- The green friendly fallback is `#22c55e` and the combined-enemy red is `#ef4444` — both already in `TimelineSection.tsx`. Reuse those exact values.
- The `timelineFriendlyScope` (Squad / Squad + Allies) toggle is unchanged and independent.
- The new enemy-mode toggle is **not** persisted — plain `useState`, matching `timelineFriendlyScope`.
- Do not touch `src/renderer/stats/computeTimelineAndMapData.ts`. It is dead code; nothing imports it. The live path is `incrementalAggregation.ts`.
- Files in this repo use 4-space indentation and single quotes. Match the surrounding style.

---

### Task 1: Team-split helpers

A new pure module holding the three decisions that are pure data: which colour an enemy target belongs to, which colour the squad was in a given log, and which colour the session as a whole was.

**Files:**
- Create: `src/renderer/stats/timelineTeamSplit.ts`
- Test: `src/renderer/stats/__tests__/timelineTeamSplit.test.ts`

**Interfaces:**
- Consumes: `getWvwTeamColor`, `teamMapFromLog`, `WvwTeamColor` from `src/shared/wvwTeams.ts`.
- Produces, for Tasks 2 and 3:
  - `type EnemyTeamCounts = { enemyRed: number; enemyGreen: number; enemyBlue: number }`
  - `type EnemyTeamColor = 'red' | 'green' | 'blue'`
  - `const ENEMY_TEAM_COLORS: EnemyTeamColor[]` — `['red', 'green', 'blue']`
  - `const ENEMY_COUNT_KEY_BY_COLOR: Record<EnemyTeamColor, keyof EnemyTeamCounts>`
  - `type SquadTeamColorCounts = Record<WvwTeamColor, number>`
  - `createSquadTeamColorCounts(): SquadTeamColorCounts`
  - `bucketEnemyTargetsByTeam(details: any, enemyTargets: any[]): EnemyTeamCounts`
  - `resolveLogSquadTeamColor(details: any, squadPlayers: any[]): WvwTeamColor`
  - `resolveSessionSquadTeamColor(counts: SquadTeamColorCounts): WvwTeamColor`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/__tests__/timelineTeamSplit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    bucketEnemyTargetsByTeam,
    createSquadTeamColorCounts,
    resolveLogSquadTeamColor,
    resolveSessionSquadTeamColor
} from '../timelineTeamSplit';

// EI emits the authoritative team ids under wvWMapData. Using it (rather than the
// fixed id-table fallback) keeps these tests independent of the hardcoded id sets.
const mapData = { wvWMapData: { redTeamID: 100, greenTeamID: 200, blueTeamID: 300 } };

describe('bucketEnemyTargetsByTeam', () => {
    it('buckets targets by resolved team colour', () => {
        const counts = bucketEnemyTargetsByTeam(mapData, [
            { teamID: 100 },
            { teamID: 100 },
            { teamID: 200 }
        ]);
        expect(counts).toEqual({ enemyRed: 2, enemyGreen: 1, enemyBlue: 0 });
    });

    it('increments no key for targets whose team cannot be resolved', () => {
        const counts = bucketEnemyTargetsByTeam(mapData, [
            { teamID: 100 },
            { teamID: 0 },
            {},
            { teamID: 999999 }
        ]);
        // 999999 is in no fixed id-table set and not in wvWMapData, so it is unknown.
        expect(counts).toEqual({ enemyRed: 1, enemyGreen: 0, enemyBlue: 0 });
    });

    it('returns all zeroes for an empty target list', () => {
        expect(bucketEnemyTargetsByTeam(mapData, [])).toEqual({
            enemyRed: 0, enemyGreen: 0, enemyBlue: 0
        });
    });
});

describe('resolveLogSquadTeamColor', () => {
    it('uses the first squad player with a positive teamID', () => {
        const color = resolveLogSquadTeamColor(mapData, [
            { teamID: 0 },
            { teamID: 300 },
            { teamID: 100 }
        ]);
        expect(color).toBe('blue');
    });

    it('is unknown when no squad player carries a usable teamID', () => {
        expect(resolveLogSquadTeamColor(mapData, [{}, { teamID: 0 }])).toBe('unknown');
        expect(resolveLogSquadTeamColor(mapData, [])).toBe('unknown');
    });
});

describe('resolveSessionSquadTeamColor', () => {
    it('picks the most common non-unknown colour', () => {
        const counts = createSquadTeamColorCounts();
        counts.red = 2;
        counts.blue = 5;
        counts.unknown = 99;
        expect(resolveSessionSquadTeamColor(counts)).toBe('blue');
    });

    it('breaks ties red then green then blue', () => {
        const counts = createSquadTeamColorCounts();
        counts.green = 3;
        counts.blue = 3;
        expect(resolveSessionSquadTeamColor(counts)).toBe('green');

        const counts2 = createSquadTeamColorCounts();
        counts2.red = 3;
        counts2.green = 3;
        expect(resolveSessionSquadTeamColor(counts2)).toBe('red');
    });

    it('is unknown when every log was unknown', () => {
        const counts = createSquadTeamColorCounts();
        counts.unknown = 4;
        expect(resolveSessionSquadTeamColor(counts)).toBe('unknown');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/timelineTeamSplit.test.ts --maxWorkers=2`

Expected: FAIL — `Failed to resolve import "../timelineTeamSplit"`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/stats/timelineTeamSplit.ts`:

```ts
/**
 * Per-team enemy bucketing for the "Squad vs Enemy Size" timeline chart.
 *
 * The Unknown bucket is deliberately not stored anywhere: it is derived at
 * render time as `enemies - (red + green + blue)`. That keeps the sum
 * invariant structural, and makes precomputed reports published before this
 * feature (which carry none of these keys) fall entirely into Unknown, which
 * is exactly right for a log set that cannot be split.
 */

import { getWvwTeamColor, teamMapFromLog, type WvwTeamColor } from '../../shared/wvwTeams';

export type EnemyTeamColor = 'red' | 'green' | 'blue';

/** Fixed keys, because a recharts `dataKey` must be a static string per <Line>. */
export type EnemyTeamCounts = {
    enemyRed: number;
    enemyGreen: number;
    enemyBlue: number;
};

export const ENEMY_TEAM_COLORS: EnemyTeamColor[] = ['red', 'green', 'blue'];

export const ENEMY_COUNT_KEY_BY_COLOR: Record<EnemyTeamColor, keyof EnemyTeamCounts> = {
    red: 'enemyRed',
    green: 'enemyGreen',
    blue: 'enemyBlue'
};

export type SquadTeamColorCounts = Record<WvwTeamColor, number>;

export const createSquadTeamColorCounts = (): SquadTeamColorCounts => ({
    red: 0,
    green: 0,
    blue: 0,
    unknown: 0
});

/**
 * Bucket already-filtered enemy targets by their WvW team colour. Targets whose
 * team cannot be resolved increment nothing — they surface as derived Unknown.
 */
export const bucketEnemyTargetsByTeam = (details: any, enemyTargets: any[]): EnemyTeamCounts => {
    const counts: EnemyTeamCounts = { enemyRed: 0, enemyGreen: 0, enemyBlue: 0 };
    const list = Array.isArray(enemyTargets) ? enemyTargets : [];
    if (list.length === 0) return counts;
    const teamMap = teamMapFromLog(details);
    list.forEach((target) => {
        const color = getWvwTeamColor(target?.teamID, teamMap);
        if (color === 'unknown') return;
        counts[ENEMY_COUNT_KEY_BY_COLOR[color]] += 1;
    });
    return counts;
};

/**
 * The squad's colour in a single log: the first squad player carrying a usable
 * teamID. Matches the derivation `computeMatchup` already uses.
 */
export const resolveLogSquadTeamColor = (details: any, squadPlayers: any[]): WvwTeamColor => {
    const list = Array.isArray(squadPlayers) ? squadPlayers : [];
    const teamId = list
        .map((player) => player?.teamID)
        .find((id) => typeof id === 'number' && id > 0);
    if (teamId === undefined) return 'unknown';
    return getWvwTeamColor(teamId, teamMapFromLog(details));
};

/**
 * The session's colour: the most common non-unknown per-log colour. There is
 * one friendly line, so this must be session-level. A set spanning a matchup
 * reset resolves to the majority colour rather than flickering.
 */
export const resolveSessionSquadTeamColor = (counts: SquadTeamColorCounts): WvwTeamColor => {
    let best: WvwTeamColor = 'unknown';
    let bestCount = 0;
    // Iteration order is the tie-break: red, then green, then blue.
    ENEMY_TEAM_COLORS.forEach((color) => {
        const count = counts[color] || 0;
        if (count > bestCount) {
            best = color;
            bestCount = count;
        }
    });
    return best;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/timelineTeamSplit.test.ts --maxWorkers=2`

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/timelineTeamSplit.ts src/renderer/stats/__tests__/timelineTeamSplit.test.ts
git commit -m "feat(stats): add WvW team bucketing helpers for the timeline chart"
```

---

### Task 2: Emit per-team counts from aggregation

Wire the helpers into the live aggregation path so every `timelineData` point carries the three colour keys, and the resolved session colour reaches the stats object.

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` — `TimelineEntry` (line ~256), aggregator fields (line ~523), `ingestLog` (line ~638), `finalize` (line ~844), stats return (line ~1440)
- Test: `src/renderer/__tests__/computeStatsAggregation.timelineTeams.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces, for Task 3 and Task 4:
  - Each `stats.timelineData[i]` gains `enemyRed`, `enemyGreen`, `enemyBlue` — always numbers, defaulting to `0`.
  - `stats.squadTeamColor: WvwTeamColor` — `'red' | 'green' | 'blue' | 'unknown'`. Absent (`undefined`) on the precomputed-stats path.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/computeStatsAggregation.timelineTeams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeStatsSync as computeStatsAggregation } from '../stats/incrementalAggregation';

const RED = 100;
const GREEN = 200;
const BLUE = 300;

// A log where the squad is Blue and the enemies are Red and Green.
const makeLog = (overrides: any = {}) => ({
    status: 'success',
    filePath: overrides.filePath || 'timeline-teams-test',
    details: {
        wvWMapData: { redTeamID: RED, greenTeamID: GREEN, blueTeamID: BLUE },
        players: [
            { account: 'squad.one', profession: 'Guardian', notInSquad: false, teamID: BLUE },
            { account: 'squad.two', profession: 'Scourge', notInSquad: false, teamID: BLUE }
        ],
        targets: [
            { profession: 'Necromancer', isFake: false, teamID: RED },
            { profession: 'Mesmer', isFake: false, teamID: RED },
            { profession: 'Ranger', isFake: false, teamID: GREEN }
        ],
        skillMap: {},
        buffMap: {},
        durationMS: 1000,
        ...(overrides.details || {})
    }
});

describe('computeStatsAggregation (timeline team split)', () => {
    it('splits enemies by team colour and reports the session squad colour', () => {
        const { stats } = computeStatsAggregation({ logs: [makeLog() as any] });
        const point = stats.timelineData[0];

        expect(stats.squadTeamColor).toBe('blue');
        expect(point.enemyRed).toBe(2);
        expect(point.enemyGreen).toBe(1);
        expect(point.enemyBlue).toBe(0);
        expect(point.enemies).toBe(3);
    });

    it('keeps colour counts within the enemy total on every point', () => {
        const { stats } = computeStatsAggregation({
            logs: [makeLog({ filePath: 'a' }) as any, makeLog({ filePath: 'b' }) as any]
        });
        stats.timelineData.forEach((point: any) => {
            const split = point.enemyRed + point.enemyGreen + point.enemyBlue;
            expect(split).toBeLessThanOrEqual(point.enemies);
        });
    });

    it('leaves unattributable enemies out of every colour key', () => {
        const log = makeLog();
        log.details.targets = [
            { profession: 'Necromancer', isFake: false, teamID: RED },
            { profession: 'Mesmer', isFake: false }
        ];
        const { stats } = computeStatsAggregation({ logs: [log as any] });
        const point = stats.timelineData[0];

        expect(point.enemies).toBe(2);
        expect(point.enemyRed).toBe(1);
        expect(point.enemyGreen).toBe(0);
        expect(point.enemyBlue).toBe(0);
    });

    it('zeroes the squad own colour so mis-mapped enemies never draw on the friendly line', () => {
        const log = makeLog();
        // A target wrongly carrying the squad's own team id.
        log.details.targets = [
            { profession: 'Necromancer', isFake: false, teamID: RED },
            { profession: 'Mesmer', isFake: false, teamID: BLUE }
        ];
        const { stats } = computeStatsAggregation({ logs: [log as any] });
        const point = stats.timelineData[0];

        expect(stats.squadTeamColor).toBe('blue');
        expect(point.enemyBlue).toBe(0);
        expect(point.enemyRed).toBe(1);
        // The mis-mapped enemy is still in the total, so it derives as Unknown.
        expect(point.enemies).toBe(2);
    });

    it('attributes nothing when a log has no roster at all', () => {
        const log: any = {
            status: 'success',
            filePath: 'no-roster',
            dashboardSummary: { squadCount: 20, enemyCount: 35 },
            details: { players: [], targets: [], skillMap: {}, buffMap: {}, durationMS: 1000 }
        };
        const { stats } = computeStatsAggregation({ logs: [log] });
        const point = stats.timelineData[0];

        expect(point.enemies).toBe(35);
        expect(point.enemyRed).toBe(0);
        expect(point.enemyGreen).toBe(0);
        expect(point.enemyBlue).toBe(0);
    });

    it('leaves existing counts untouched when no log carries team ids', () => {
        const log = makeLog();
        delete (log.details as any).wvWMapData;
        log.details.players = [
            { account: 'squad.one', profession: 'Guardian', notInSquad: false } as any,
            { account: 'ally.one', profession: 'Tempest', notInSquad: true } as any
        ];
        log.details.targets = [
            { profession: 'Necromancer', isFake: false } as any,
            { profession: 'Mesmer', isFake: false } as any
        ];
        const { stats } = computeStatsAggregation({ logs: [log as any] });
        const point = stats.timelineData[0];

        expect(stats.squadTeamColor).toBe('unknown');
        expect(point.squadCount).toBe(1);
        expect(point.friendlyCount).toBe(2);
        expect(point.enemies).toBe(2);
        expect(point.enemyRed).toBe(0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation.timelineTeams.test.ts --maxWorkers=2`

Expected: FAIL — `expected undefined to be 'blue'` and `expected undefined to be 2`.

- [ ] **Step 3: Add the import and widen `TimelineEntry`**

In `src/renderer/stats/incrementalAggregation.ts`, add to the imports at the top of the file:

```ts
import {
    bucketEnemyTargetsByTeam,
    createSquadTeamColorCounts,
    ENEMY_COUNT_KEY_BY_COLOR,
    resolveLogSquadTeamColor,
    resolveSessionSquadTeamColor,
    type EnemyTeamCounts,
    type SquadTeamColorCounts
} from './timelineTeamSplit';
```

Then extend the `TimelineEntry` interface (~line 256) — it currently ends with `originalIndex: number;`:

```ts
// Lightweight timeline entry computed per-log (all logs, not just valid)
interface TimelineEntry {
    timestamp: number;
    squadCount: number;
    friendlyCount: number;
    enemies: number;
    isWin: boolean | null;
    originalIndex: number;
    /** Per-team enemy split. Unknown is derived at render, never stored. */
    enemyTeamCounts: EnemyTeamCounts;
}
```

- [ ] **Step 4: Add the session colour tally field**

Next to `private timelineEntries: TimelineEntry[] = [];` (~line 523):

```ts
    private timelineEntries: TimelineEntry[] = [];
    private squadTeamColorCounts: SquadTeamColorCounts = createSquadTeamColorCounts();
```

- [ ] **Step 5: Bucket and tally in `ingestLog`**

In `ingestLog`, immediately after the existing `const friendlyCount = ...` line (~line 633) and before `const timestamp = resolveFightTimestamp(details, log);`:

```ts
        const enemyTeamCounts = bucketEnemyTargetsByTeam(details, enemyTargets);
        this.squadTeamColorCounts[resolveLogSquadTeamColor(details, squadPrimaries)] += 1;
```

Then add the field to the existing `this.timelineEntries.push({ ... })` call:

```ts
        this.timelineEntries.push({
            timestamp,
            squadCount,
            friendlyCount,
            enemies,
            isWin: resolveFightOutcomeForDisplay(details, log),
            originalIndex: idx,
            enemyTeamCounts,
        });
```

- [ ] **Step 6: Resolve and apply the collision guard in `finalize`**

Replace the existing `const timelineData = sortedTimeline.map(...)` block (~line 844):

```ts
        const squadTeamColor = resolveSessionSquadTeamColor(this.squadTeamColorCounts);
        // Collision guard: a target wrongly carrying our own team id must never
        // draw on the friendly line. Zeroing the key folds it into derived Unknown.
        const ownColorKey = squadTeamColor === 'unknown'
            ? null
            : ENEMY_COUNT_KEY_BY_COLOR[squadTeamColor];
        const timelineData = sortedTimeline.map((entry, index) => {
            const enemyTeamCounts = { ...entry.enemyTeamCounts };
            if (ownColorKey) enemyTeamCounts[ownColorKey] = 0;
            return {
                timestamp: entry.timestamp,
                squadCount: entry.squadCount,
                friendlyCount: entry.friendlyCount,
                enemies: entry.enemies,
                isWin: entry.isWin,
                index: index + 1,
                label: `Log ${index + 1}`,
                ...enemyTeamCounts,
            };
        });
```

- [ ] **Step 7: Return the session colour**

In the stats object returned by `finalize` (~line 1440), add `squadTeamColor` alongside `timelineData`:

```ts
            mapData, timelineData, squadTeamColor, boonTables, boonLeaderboards, boonTimeline, boonUptimeTimeline, stabPerformanceDrilldown, incomingDamagePerSecondByFightId,
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation.timelineTeams.test.ts --maxWorkers=2`

Expected: PASS, 6 tests.

- [ ] **Step 9: Run the surrounding aggregation suite for regressions**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation --maxWorkers=2`

Expected: PASS. If anything fails, it is a real regression in this task — the existing timeline fields must not have changed.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts src/renderer/__tests__/computeStatsAggregation.timelineTeams.test.ts
git commit -m "feat(stats): emit per-team enemy counts and squad team colour on the timeline"
```

---

### Task 3: Series resolver

The pure function that decides which lines the chart draws and how they are labelled. This exists as its own module because `ChartContainer` wraps recharts' `ResponsiveContainer`, which measures 0×0 under jsdom — no `<Line>` or `<Legend>` ever reaches the DOM, so none of this is testable through the component.

**Files:**
- Create: `src/renderer/stats/sections/timelineSeries.ts`
- Test: `src/renderer/stats/__tests__/timelineSeries.test.ts`

**Interfaces:**
- Consumes: `ENEMY_COUNT_KEY_BY_COLOR`, `ENEMY_TEAM_COLORS` from Task 1; the `timelineData` shape from Task 2.
- Produces, for Task 4:
  - `type TimelineEnemyMode = 'byTeam' | 'combined'`
  - `type TimelineSeries = { key: string; label: string; color: string; isFriendly: boolean }`
  - `const UNKNOWN_ENEMY_KEY = 'enemyUnknown'`
  - `withDerivedUnknown(timelineData: any[]): any[]`
  - `resolveTimelineSeries(options): TimelineSeries[]`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/__tests__/timelineSeries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveTimelineSeries, withDerivedUnknown } from '../sections/timelineSeries';

const point = (over: any = {}) => ({
    index: 1,
    squadCount: 20,
    friendlyCount: 25,
    enemies: 30,
    enemyRed: 18,
    enemyGreen: 12,
    enemyBlue: 0,
    ...over
});

const labels = (series: { label: string }[]) => series.map((s) => s.label);
const keys = (series: { key: string }[]) => series.map((s) => s.key);

describe('withDerivedUnknown', () => {
    it('derives the unknown remainder against the enemy total', () => {
        const [result] = withDerivedUnknown([point({ enemies: 35 })]);
        expect(result.enemyUnknown).toBe(5);
    });

    it('is zero when the split accounts for every enemy', () => {
        const [result] = withDerivedUnknown([point()]);
        expect(result.enemyUnknown).toBe(0);
    });

    it('clamps at zero rather than going negative', () => {
        const [result] = withDerivedUnknown([point({ enemies: 10 })]);
        expect(result.enemyUnknown).toBe(0);
    });

    it('treats a legacy point with no colour keys as entirely unknown', () => {
        const [result] = withDerivedUnknown([
            { index: 1, squadCount: 20, friendlyCount: 25, enemies: 30 }
        ]);
        expect(result.enemyUnknown).toBe(30);
    });
});

describe('resolveTimelineSeries', () => {
    const byTeam = (over: any = {}) => resolveTimelineSeries({
        timelineData: withDerivedUnknown([point()]),
        squadTeamColor: 'blue',
        enemyMode: 'byTeam',
        friendlyScope: 'squad',
        ...over
    });

    it('yields one series per enemy colour present, friendly last', () => {
        const series = byTeam();
        expect(keys(series)).toEqual(['enemyRed', 'enemyGreen', 'squadCount']);
        expect(labels(series)).toEqual(['Red', 'Green', 'Blue (You)']);
        expect(series[series.length - 1].isFriendly).toBe(true);
    });

    it('omits the unknown series when every enemy is attributed', () => {
        expect(keys(byTeam())).not.toContain('enemyUnknown');
    });

    it('includes the unknown series when any point falls short', () => {
        const series = byTeam({ timelineData: withDerivedUnknown([point({ enemies: 35 })]) });
        expect(keys(series)).toContain('enemyUnknown');
        expect(labels(series)).toContain('Unknown');
    });

    it('gives a legacy point friendly plus unknown only', () => {
        const series = byTeam({
            timelineData: withDerivedUnknown([
                { index: 1, squadCount: 20, friendlyCount: 25, enemies: 30 }
            ])
        });
        expect(keys(series)).toEqual(['enemyUnknown', 'squadCount']);
    });

    it('yields exactly friendly and a combined enemy line in combined mode', () => {
        const series = byTeam({ enemyMode: 'combined' });
        expect(keys(series)).toEqual(['enemies', 'squadCount']);
        expect(labels(series)).toEqual(['Enemies', 'Blue (You)']);
        expect(series[0].color).toBe('#ef4444');
    });

    it('follows the friendly scope in key and label', () => {
        const series = byTeam({ friendlyScope: 'squadAllies' });
        const friendly = series[series.length - 1];
        expect(friendly.key).toBe('friendlyCount');
        expect(friendly.label).toBe('Blue (You + Allies)');
    });

    it('falls back to green and a bare label when the squad colour is unknown', () => {
        const series = byTeam({ squadTeamColor: 'unknown' });
        const friendly = series[series.length - 1];
        expect(friendly.label).toBe('You');
        expect(friendly.color).toBe('#22c55e');
    });

    it('never draws an enemy series in the squad own colour', () => {
        const series = byTeam({
            squadTeamColor: 'red',
            timelineData: withDerivedUnknown([point({ enemyRed: 18, enemyGreen: 12, enemies: 30 })])
        });
        expect(keys(series)).not.toContain('enemyRed');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/timelineSeries.test.ts --maxWorkers=2`

Expected: FAIL — `Failed to resolve import "../sections/timelineSeries"`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/stats/sections/timelineSeries.ts`:

```ts
/**
 * Which lines the "Squad vs Enemy Size" chart draws, and how they are labelled.
 *
 * Kept out of the component because ChartContainer wraps recharts'
 * ResponsiveContainer, which measures 0x0 under jsdom — no <Line> or <Legend>
 * reaches the DOM there, so none of this would otherwise be testable.
 */

import { WVW_TEAM_COLOR_META, type WvwTeamColor } from '../../../shared/wvwTeams';
import { ENEMY_COUNT_KEY_BY_COLOR, ENEMY_TEAM_COLORS } from '../timelineTeamSplit';

export type TimelineEnemyMode = 'byTeam' | 'combined';
export type TimelineFriendlyScope = 'squad' | 'squadAllies';

export type TimelineSeries = {
    /** recharts dataKey */
    key: string;
    label: string;
    color: string;
    isFriendly: boolean;
};

/** Derived at render, never stored. See timelineTeamSplit.ts. */
export const UNKNOWN_ENEMY_KEY = 'enemyUnknown';

/** Pre-team-split green, kept for sets whose team colour cannot be resolved. */
export const FALLBACK_FRIENDLY_COLOR = '#22c55e';
/** The single-line enemy red, unchanged from before the team split. */
export const COMBINED_ENEMY_COLOR = '#ef4444';

const num = (value: any): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Attach the Unknown remainder to every point. Points from a report published
 * before the team split carry no colour keys, so their whole enemy count lands
 * here — which is the correct reading for a set that cannot be split.
 */
export const withDerivedUnknown = (timelineData: any[]): any[] => {
    const list = Array.isArray(timelineData) ? timelineData : [];
    return list.map((point) => {
        const split = num(point?.enemyRed) + num(point?.enemyGreen) + num(point?.enemyBlue);
        return { ...point, [UNKNOWN_ENEMY_KEY]: Math.max(0, num(point?.enemies) - split) };
    });
};

const hasAnyValue = (timelineData: any[], key: string): boolean =>
    timelineData.some((point) => num(point?.[key]) > 0);

const friendlySeries = (
    squadTeamColor: WvwTeamColor | null | undefined,
    friendlyScope: TimelineFriendlyScope
): TimelineSeries => {
    const withAllies = friendlyScope === 'squadAllies';
    const you = withAllies ? 'You + Allies' : 'You';
    const known = squadTeamColor && squadTeamColor !== 'unknown' ? squadTeamColor : null;
    return {
        key: withAllies ? 'friendlyCount' : 'squadCount',
        label: known ? `${WVW_TEAM_COLOR_META[known].label} (${you})` : you,
        color: known ? WVW_TEAM_COLOR_META[known].hex : FALLBACK_FRIENDLY_COLOR,
        isFriendly: true
    };
};

/**
 * Enemy series first, friendly last — recharts paints in child order, so the
 * friendly line (and its glow underlay) lands on top.
 */
export const resolveTimelineSeries = ({
    timelineData,
    squadTeamColor,
    enemyMode,
    friendlyScope
}: {
    timelineData: any[];
    squadTeamColor?: WvwTeamColor | null;
    enemyMode: TimelineEnemyMode;
    friendlyScope: TimelineFriendlyScope;
}): TimelineSeries[] => {
    const list = Array.isArray(timelineData) ? timelineData : [];
    const friendly = friendlySeries(squadTeamColor, friendlyScope);

    if (enemyMode === 'combined') {
        return [
            { key: 'enemies', label: 'Enemies', color: COMBINED_ENEMY_COLOR, isFriendly: false },
            friendly
        ];
    }

    const enemies: TimelineSeries[] = [];
    ENEMY_TEAM_COLORS.forEach((color) => {
        if (color === squadTeamColor) return;
        const key = ENEMY_COUNT_KEY_BY_COLOR[color];
        if (!hasAnyValue(list, key)) return;
        enemies.push({
            key,
            label: WVW_TEAM_COLOR_META[color].label,
            color: WVW_TEAM_COLOR_META[color].hex,
            isFriendly: false
        });
    });
    if (hasAnyValue(list, UNKNOWN_ENEMY_KEY)) {
        enemies.push({
            key: UNKNOWN_ENEMY_KEY,
            label: WVW_TEAM_COLOR_META.unknown.label,
            color: WVW_TEAM_COLOR_META.unknown.hex,
            isFriendly: false
        });
    }
    return [...enemies, friendly];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/timelineSeries.test.ts --maxWorkers=2`

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/timelineSeries.ts src/renderer/stats/__tests__/timelineSeries.test.ts
git commit -m "feat(stats): add timeline series resolver for team-split lines"
```

---

### Task 4: Render the split chart

Draw the resolved series, glow the friendly line, add the legend and the Enemies toggle, and wire the new state through `StatsView`.

**Files:**
- Modify: `src/renderer/stats/sections/TimelineSection.tsx` (whole file)
- Modify: `src/renderer/StatsView.tsx` — new state near line 911, both `<TimelineSection>` call sites (~line 4790 and ~line 4843)
- Test: `src/renderer/__tests__/TimelineSection.test.tsx`

**Interfaces:**
- Consumes: `resolveTimelineSeries`, `withDerivedUnknown`, `TimelineEnemyMode` from Task 3; `stats.timelineData` and `stats.squadTeamColor` from Task 2.
- Produces: `TimelineSection` props become `{ timelineData, squadTeamColor, timelineFriendlyScope, setTimelineFriendlyScope, timelineEnemyMode, setTimelineEnemyMode }`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/TimelineSection.test.tsx`. Only the header renders under jsdom — the chart body is 0×0, per Task 3's note.

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineSection } from '../stats/sections/TimelineSection';
import { StatsSharedContext } from '../stats/StatsViewContext';

const contextValue: any = {
    stats: {},
    expandedSection: null,
    expandedSectionClosing: false,
    openExpandedSection: () => {},
    closeExpandedSection: () => {},
    isSectionVisible: () => true,
    isFirstVisibleSection: () => false,
    sectionClass: (_id: string, base: string) => base,
    sidebarListClass: '',
    formatWithCommas: (value: number) => String(value),
    renderProfessionIcon: () => null,
    roundCountStats: false,
    mvpBoonMetric: 'uptime' as const,
    expandedPortalRef: { current: null },
};

const timelineData = [
    { index: 1, label: 'Log 1', squadCount: 20, friendlyCount: 25, enemies: 30, enemyRed: 18, enemyGreen: 12, enemyBlue: 0, isWin: true }
];

const renderSection = (props: any = {}) => {
    const setTimelineEnemyMode = vi.fn();
    render(
        <StatsSharedContext.Provider value={contextValue}>
            <TimelineSection
                timelineData={timelineData}
                squadTeamColor="blue"
                timelineFriendlyScope="squad"
                setTimelineFriendlyScope={() => {}}
                timelineEnemyMode="byTeam"
                setTimelineEnemyMode={setTimelineEnemyMode}
                {...props}
            />
        </StatsSharedContext.Provider>
    );
    return { setTimelineEnemyMode };
};

describe('TimelineSection', () => {
    it('renders both toggle groups', () => {
        renderSection();
        expect(screen.getByText('Friendly Count')).toBeInTheDocument();
        expect(screen.getByText('Enemies')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'By Team' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Combined' })).toBeInTheDocument();
    });

    it('invokes the setter when Combined is clicked', () => {
        const { setTimelineEnemyMode } = renderSection();
        fireEvent.click(screen.getByRole('button', { name: 'Combined' }));
        expect(setTimelineEnemyMode).toHaveBeenCalledWith('combined');
    });

    it('still renders the empty state with no data', () => {
        renderSection({ timelineData: [] });
        expect(screen.getByText('No timeline data available')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/TimelineSection.test.tsx --maxWorkers=2`

Expected: FAIL — no "By Team" button exists yet.

- [ ] **Step 3: Rewrite `TimelineSection.tsx`**

Replace the whole file:

```tsx
import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Users } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import type { WvwTeamColor } from '../../../shared/wvwTeams';
import {
    resolveTimelineSeries,
    withDerivedUnknown,
    type TimelineEnemyMode
} from './timelineSeries';

type TimelineSectionProps = {
    timelineData: any[];
    squadTeamColor?: WvwTeamColor | null;
    timelineFriendlyScope: 'squad' | 'squadAllies';
    setTimelineFriendlyScope: (value: 'squad' | 'squadAllies') => void;
    timelineEnemyMode: TimelineEnemyMode;
    setTimelineEnemyMode: (value: TimelineEnemyMode) => void;
};

const ACTIVE_PILL_CLASS = 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]';
const INACTIVE_PILL_CLASS = 'border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]';

export const TimelineSection = ({
    timelineData,
    squadTeamColor,
    timelineFriendlyScope,
    setTimelineFriendlyScope,
    timelineEnemyMode,
    setTimelineEnemyMode
}: TimelineSectionProps) => {
    useStatsSharedContext();

    const chartData = useMemo(() => withDerivedUnknown(timelineData), [timelineData]);
    const series = useMemo(() => resolveTimelineSeries({
        timelineData: chartData,
        squadTeamColor,
        enemyMode: timelineEnemyMode,
        friendlyScope: timelineFriendlyScope
    }), [chartData, squadTeamColor, timelineEnemyMode, timelineFriendlyScope]);

    return (
    <div>
        <div className="flex items-center gap-2 mb-3.5 flex-wrap">
            <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Squad vs Enemy Size</h3>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Friendly Count</span>
                <PillToggleGroup
                    value={timelineFriendlyScope}
                    onChange={(value) => setTimelineFriendlyScope(value as 'squad' | 'squadAllies')}
                    options={[
                        { value: 'squad', label: 'Squad' },
                        { value: 'squadAllies', label: 'Squad + Allies' }
                    ]}
                    activeClassName={ACTIVE_PILL_CLASS}
                    inactiveClassName={INACTIVE_PILL_CLASS}
                />
                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Enemies</span>
                <PillToggleGroup
                    value={timelineEnemyMode}
                    onChange={(value) => setTimelineEnemyMode(value as TimelineEnemyMode)}
                    options={[
                        { value: 'byTeam', label: 'By Team' },
                        { value: 'combined', label: 'Combined' }
                    ]}
                    activeClassName={ACTIVE_PILL_CLASS}
                    inactiveClassName={INACTIVE_PILL_CLASS}
                />
            </div>
        </div>
        {chartData.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No timeline data available</div>
        ) : (
            <div className="h-[260px] w-full">
                <ChartContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                        <XAxis
                            dataKey="index"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        />
                        <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            width={36}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                            labelFormatter={(_value, payload) => {
                                const point = payload?.[0]?.payload;
                                const predicted = point?.isWin === true
                                    ? 'Win'
                                    : point?.isWin === false
                                        ? 'Loss'
                                        : 'Unknown';
                                const logLabel = typeof point?.label === 'string' && point.label.trim().length > 0
                                    ? point.label
                                    : `Log ${_value}`;
                                return `${logLabel} • ${predicted}`;
                            }}
                        />
                        <Legend
                            wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
                            iconType="plainline"
                        />
                        {series.map((entry) => (
                            entry.isFriendly ? (
                                // Drawn twice: a wide translucent underlay reads as a glow,
                                // marking which team is ours. An SVG blur filter would mean
                                // relying on recharts' uncontracted prop pass-through and
                                // would cost per frame on hover.
                                [
                                    <Line
                                        key={`${entry.key}-glow`}
                                        type="monotone"
                                        dataKey={entry.key}
                                        stroke={entry.color}
                                        strokeWidth={7}
                                        strokeOpacity={0.25}
                                        dot={false}
                                        activeDot={false}
                                        legendType="none"
                                        tooltipType="none"
                                        isAnimationActive={false}
                                    />,
                                    <Line
                                        key={entry.key}
                                        type="monotone"
                                        dataKey={entry.key}
                                        name={entry.label}
                                        stroke={entry.color}
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: entry.color }}
                                        activeDot={{ r: 5 }}
                                    />
                                ]
                            ) : (
                                <Line
                                    key={entry.key}
                                    type="monotone"
                                    dataKey={entry.key}
                                    name={entry.label}
                                    stroke={entry.color}
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: entry.color }}
                                    activeDot={{ r: 5 }}
                                />
                            )
                        ))}
                    </LineChart>
                </ChartContainer>
            </div>
        )}
    </div>
    );
};
```

The `formatter` prop is gone from `<Tooltip>` on purpose: each `<Line>` now carries `name={entry.label}`, so recharts labels rows correctly without a hand-written mapping.

If recharts rejects the nested array returned for the friendly case, flatten it instead — build the element list into a local `const lines: ReactNode[] = []` before the JSX and render `{lines}`. Behaviour must stay identical: glow underlay first, main line second.

- [ ] **Step 4: Wire the state in `StatsView.tsx`**

Add next to the existing scope state (~line 911):

```ts
    const [timelineFriendlyScope, setTimelineFriendlyScope] = useState<'squad' | 'squadAllies'>('squad');
    const [timelineEnemyMode, setTimelineEnemyMode] = useState<TimelineEnemyMode>('byTeam');
```

Add the type import alongside the existing `TimelineSection` import (~line 56):

```ts
import type { TimelineEnemyMode } from './stats/sections/timelineSeries';
```

Then update **both** `<TimelineSection>` call sites (~line 4790 and ~line 4843) to pass the three new props:

```tsx
<TimelineSection
    timelineData={safeStats.timelineData}
    squadTeamColor={safeStats.squadTeamColor}
    timelineFriendlyScope={timelineFriendlyScope}
    setTimelineFriendlyScope={setTimelineFriendlyScope}
    timelineEnemyMode={timelineEnemyMode}
    setTimelineEnemyMode={setTimelineEnemyMode}
/>
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/TimelineSection.test.tsx --maxWorkers=2`

Expected: PASS, 3 tests.

- [ ] **Step 6: Run the full unit suite**

Run: `npm run test:unit -- --maxWorkers=2`

Expected: PASS. `StatsView` integration tests mount the section, so a missing prop shows up here.

- [ ] **Step 7: Validate**

Run: `npm run validate`

Expected: no typecheck errors, no eslint warnings.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/TimelineSection.tsx src/renderer/StatsView.tsx src/renderer/__tests__/TimelineSection.test.tsx
git commit -m "feat(stats): default the timeline chart to per-team enemy lines"
```

---

## Manual verification

Automated tests cannot see the chart — jsdom renders it at 0×0. Before calling this done, run `npm run dev`, load a WvW log set, and open Overview → Squad vs Enemy. Confirm: the chart defaults to By Team; your line carries a visible halo and is drawn in your team's colour; enemy lines use their team colours; the legend reads e.g. "Red", "Green", "Blue (You)"; switching Friendly Count to Squad + Allies changes the label to "Blue (You + Allies)"; and Combined collapses to today's two-line chart.
