# WvW Team Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic `Team A/B/C` / `Team {id}` labels with each team's real Red/Green/Blue color everywhere a WvW team is shown.

**Architecture:** A single shared helper (`src/shared/wvwTeams.ts`) resolves a `teamID` to a color, preferring Elite Insights' authoritative `wvWMapData` (from the arcdps `CBTS_WVWTEAMS` event) when present and falling back to a fixed id-table for older logs. The stats Matchup section, Discord embeds, and the per-log card all consume it.

**Tech Stack:** TypeScript, React, Vitest (jsdom), Electron. Spec: `docs/superpowers/specs/2026-06-04-wvw-team-colors-design.md`.

**Test runner note:** This repo limits vitest workers. Run unit tests with `npx vitest run <file> --maxWorkers=2`.

---

## File Structure

- **Create** `src/shared/wvwTeams.ts` — color types, fixed id-table, palette, order, `teamMapFromLog`, `getWvwTeamColor`.
- **Create** `src/shared/__tests__/wvwTeams.test.ts` — unit tests for the helper.
- **Modify** `src/shared/dpsReportTypes.ts` — add `wvWMapData?` to `DPSReportJSON`; add `teamID?` to `Player`.
- **Modify** `src/shared/commanderTypes.ts` — add `color` to `enemyByTeam` entries and `squadColor` to `matchup`.
- **Modify** `src/shared/commanderMetrics/matchup.ts` — resolve colors via the helper.
- **Modify** `src/renderer/commander/sections/MatchupSection.tsx` — render real colors + squad color.
- **Modify** `src/main/discord.ts` — color-based embed labels + color ordering.
- **Modify** `src/renderer/ExpandableLogCard.tsx` — color-based team labels + color ordering.

---

## Task 1: Shared `wvwTeams` helper

**Files:**
- Create: `src/shared/wvwTeams.ts`
- Test: `src/shared/__tests__/wvwTeams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/wvwTeams.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getWvwTeamColor,
  teamMapFromLog,
  WVW_TEAM_COLOR_META,
  WVW_TEAM_COLOR_ORDER,
  type WvwTeamColor,
} from '../wvwTeams';

describe('getWvwTeamColor — fixed fallback table (no map)', () => {
  it('resolves the real fixture ids', () => {
    expect(getWvwTeamColor(707)).toBe('red');
    expect(getWvwTeamColor(433)).toBe('blue');
    expect(getWvwTeamColor(2767)).toBe('green');
  });

  it('resolves one more id per color', () => {
    expect(getWvwTeamColor(705)).toBe('red');
    expect(getWvwTeamColor(1277)).toBe('blue');
    expect(getWvwTeamColor(2739)).toBe('green');
  });

  it('returns unknown for unrecognised / invalid ids', () => {
    expect(getWvwTeamColor(999999)).toBe('unknown');
    expect(getWvwTeamColor(0)).toBe('unknown');
    expect(getWvwTeamColor(-5)).toBe('unknown');
    expect(getWvwTeamColor(null)).toBe('unknown');
    expect(getWvwTeamColor(undefined)).toBe('unknown');
  });
});

describe('getWvwTeamColor — authoritative map', () => {
  const map = { red: 1234, green: 5678, blue: 9012 };

  it('uses the map when the id matches', () => {
    expect(getWvwTeamColor(1234, map)).toBe('red');
    expect(getWvwTeamColor(5678, map)).toBe('green');
    expect(getWvwTeamColor(9012, map)).toBe('blue');
  });

  it('a 0 map field never matches', () => {
    expect(getWvwTeamColor(0, { red: 0, green: 0, blue: 0 })).toBe('unknown');
  });

  it('the map beats the fixed table', () => {
    // 707 is "red" in the fixed table, but green in this log's map.
    expect(getWvwTeamColor(707, { red: 1, green: 707, blue: 2 })).toBe('green');
  });

  it('falls back to the table for ids absent from the map', () => {
    expect(getWvwTeamColor(433, map)).toBe('blue');
  });
});

describe('teamMapFromLog', () => {
  it('reads wvWMapData', () => {
    const log = { wvWMapData: { redTeamID: 11, greenTeamID: 22, blueTeamID: 33 } };
    expect(teamMapFromLog(log)).toEqual({ red: 11, green: 22, blue: 33 });
  });

  it('reads the wvwMapData casing variant', () => {
    const log = { wvwMapData: { redTeamID: 1, greenTeamID: 2, blueTeamID: 3 } };
    expect(teamMapFromLog(log)).toEqual({ red: 1, green: 2, blue: 3 });
  });

  it('returns null when absent', () => {
    expect(teamMapFromLog({})).toBeNull();
    expect(teamMapFromLog(null)).toBeNull();
    expect(teamMapFromLog(undefined)).toBeNull();
  });
});

describe('metadata tables', () => {
  it('has meta for every color', () => {
    const colors: WvwTeamColor[] = ['red', 'green', 'blue', 'unknown'];
    for (const c of colors) {
      expect(WVW_TEAM_COLOR_META[c].label).toBeTruthy();
      expect(WVW_TEAM_COLOR_META[c].hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('orders red, green, blue, unknown', () => {
    expect(WVW_TEAM_COLOR_ORDER).toEqual(['red', 'green', 'blue', 'unknown']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/__tests__/wvwTeams.test.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module '../wvwTeams'`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/wvwTeams.ts`:

```ts
// WvW team → color mapping.
//
// Preferred source: Elite Insights' authoritative `wvWMapData` (built from the
// arcdps CBTS_WVWTEAMS statechange event), which gives the exact red/green/blue
// team ids for the log. Older logs (pre-~May 2026) lack the event, so we fall
// back to the well-known fixed team-id table below.
//
// Fixed table reconciled from two community tools that predate the event:
//   - Drevarr/EVTC_parser/gw2_data.py
//   - Drevarr/GW2_EI_log_combiner/config.py

export type WvwTeamColor = 'red' | 'green' | 'blue' | 'unknown';

/** Authoritative per-log team→color map (0 means that team is absent). */
export interface WvwTeamMap {
  red: number;
  green: number;
  blue: number;
}

const RED_TEAM_IDS: ReadonlySet<number> = new Set([697, 705, 706, 707, 882, 885, 886, 2520, 2543]);
const GREEN_TEAM_IDS: ReadonlySet<number> = new Set([39, 2739, 2741, 2752, 2763, 2767]);
const BLUE_TEAM_IDS: ReadonlySet<number> = new Set([432, 433, 1277, 1282, 1989]);

export const WVW_TEAM_COLOR_META: Record<WvwTeamColor, { label: string; hex: string }> = {
  red: { label: 'Red', hex: '#f87171' },
  green: { label: 'Green', hex: '#4ade80' },
  blue: { label: 'Blue', hex: '#60a5fa' },
  unknown: { label: 'Unknown', hex: '#9ca3af' },
};

export const WVW_TEAM_COLOR_ORDER: WvwTeamColor[] = ['red', 'green', 'blue', 'unknown'];

/**
 * Build a WvwTeamMap from a parsed EI log object. Tolerates both `wvWMapData`
 * and `wvwMapData` casings. Returns null when the log has no team event.
 */
export function teamMapFromLog(log: unknown): WvwTeamMap | null {
  if (!log || typeof log !== 'object') return null;
  const obj = log as Record<string, unknown>;
  const data = (obj.wvWMapData ?? obj.wvwMapData) as
    | { redTeamID?: number; greenTeamID?: number; blueTeamID?: number }
    | undefined;
  if (!data || typeof data !== 'object') return null;
  return {
    red: Number(data.redTeamID) || 0,
    green: Number(data.greenTeamID) || 0,
    blue: Number(data.blueTeamID) || 0,
  };
}

/**
 * Resolve a team id to its color. Prefers the authoritative map, then the fixed
 * id-table, else 'unknown'.
 */
export function getWvwTeamColor(
  teamID: number | null | undefined,
  map?: WvwTeamMap | null,
): WvwTeamColor {
  if (typeof teamID !== 'number' || !Number.isFinite(teamID) || teamID <= 0) {
    return 'unknown';
  }
  if (map) {
    if (map.red > 0 && teamID === map.red) return 'red';
    if (map.green > 0 && teamID === map.green) return 'green';
    if (map.blue > 0 && teamID === map.blue) return 'blue';
  }
  if (RED_TEAM_IDS.has(teamID)) return 'red';
  if (GREEN_TEAM_IDS.has(teamID)) return 'green';
  if (BLUE_TEAM_IDS.has(teamID)) return 'blue';
  return 'unknown';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/__tests__/wvwTeams.test.ts --maxWorkers=2`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwTeams.ts src/shared/__tests__/wvwTeams.test.ts
git commit -m "feat(wvw): add shared team-color helper with EI authoritative + fixed fallback"
```

---

## Task 2: Extend EI JSON types

**Files:**
- Modify: `src/shared/dpsReportTypes.ts`

- [ ] **Step 1: Add `wvWMapData` to `DPSReportJSON`**

In `src/shared/dpsReportTypes.ts`, inside `interface DPSReportJSON` (after the
`combatReplayMetaData?: {...}` block, before the closing brace at line 45), add:

```ts
    wvWMapData?: {
        redTeamID?: number;
        greenTeamID?: number;
        blueTeamID?: number;
        redShardID?: number;
        greenShardID?: number;
        blueShardID?: number;
    };
```

- [ ] **Step 2: Add `teamID` to `Player`**

In the same file, inside `interface Player` (add near the other scalar fields,
e.g. right after `profession: string;`):

```ts
    teamID?: number;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/shared/dpsReportTypes.ts
git commit -m "feat(wvw): type EI wvWMapData and player teamID"
```

---

## Task 3: Resolve colors in the matchup metric

**Files:**
- Modify: `src/shared/commanderTypes.ts`
- Modify: `src/shared/commanderMetrics/matchup.ts`
- Test: `src/shared/commanderMetrics/__tests__/matchup.test.ts`

- [ ] **Step 1: Update the type**

In `src/shared/commanderTypes.ts`, change the `matchup` block's `enemyByTeam`
line and add `squadColor`. Add the import at the top of the file:

```ts
import type { WvwTeamColor } from './wvwTeams';
```

Then within `matchup: { ... }` replace:

```ts
    enemyByTeam: Array<{ teamID: number; count: number }>;
```

with:

```ts
    enemyByTeam: Array<{ teamID: number; count: number; color: WvwTeamColor }>;
    squadColor: WvwTeamColor | null;
```

- [ ] **Step 2: Write the failing test**

Create (or extend) `src/shared/commanderMetrics/__tests__/matchup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeMatchup } from '../matchup';
import type { DPSReportJSON, Player } from '../../dpsReportTypes';

function mkEnemy(teamID: number): any {
  return { name: 'Tempest pl-1', isFake: false, enemyPlayer: true, teamID, dpsAll: [{ damage: 0 }] };
}
function mkSquad(teamID: number): any {
  return { notInSquad: false, teamID, combatReplayData: { dead: [] }, statsAll: [{}] };
}

const base: Partial<DPSReportJSON> = { players: [], targets: [], durationMS: 10000 };

describe('computeMatchup team colors', () => {
  it('uses the authoritative wvWMapData when present', () => {
    const squad = [mkSquad(50)] as unknown as Player[];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(60), mkEnemy(70)],
      wvWMapData: { redTeamID: 60, greenTeamID: 70, blueTeamID: 50 },
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad, 200, 10);
    const colors = Object.fromEntries(m.enemyByTeam.map((t) => [t.teamID, t.color]));
    expect(colors[60]).toBe('red');
    expect(colors[70]).toBe('green');
    expect(m.squadColor).toBe('blue');
  });

  it('falls back to the fixed table without wvWMapData', () => {
    const squad = [mkSquad(433)] as unknown as Player[];
    const json = {
      ...base,
      players: squad,
      targets: [mkEnemy(707), mkEnemy(2767)],
    } as unknown as DPSReportJSON;
    const m = computeMatchup(json, squad, 200, 10);
    const colors = Object.fromEntries(m.enemyByTeam.map((t) => [t.teamID, t.color]));
    expect(colors[707]).toBe('red');
    expect(colors[2767]).toBe('green');
    expect(m.squadColor).toBe('blue');
  });
});
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `npx vitest run src/shared/commanderMetrics/__tests__/matchup.test.ts --maxWorkers=2`
Expected: FAIL — `color`/`squadColor` undefined (and possibly a TS error on the new fields).

- [ ] **Step 3: Implement in `matchup.ts`**

At the top of `src/shared/commanderMetrics/matchup.ts` add to the imports:

```ts
import { getWvwTeamColor, teamMapFromLog } from '../wvwTeams';
```

Replace the existing `enemyByTeam` construction (the block building `teamMap`
and mapping to `{ teamID, count }`, currently lines ~45-55) with:

```ts
  // Enemy split by teamID, resolved to real Red/Green/Blue colors. Prefer EI's
  // authoritative wvWMapData; fall back to the fixed id-table for older logs.
  const wvwMap = teamMapFromLog(json);
  const teamMap = new Map<number, number>();
  for (const t of enemyTargets) {
    if (typeof t.teamID === 'number') {
      teamMap.set(t.teamID, (teamMap.get(t.teamID) ?? 0) + 1);
    }
  }
  const enemyByTeam = Array.from(teamMap.entries())
    .map(([teamID, count]) => ({ teamID, count, color: getWvwTeamColor(teamID, wvwMap) }))
    .sort((a, b) => b.count - a.count);

  // Squad's own team color (from the first squad player that has a teamID).
  const squadTeamId = squadPlayers.map((p) => p.teamID).find((id) => typeof id === 'number' && id > 0);
  const squadColorResolved = squadTeamId !== undefined ? getWvwTeamColor(squadTeamId, wvwMap) : 'unknown';
  const squadColor = squadColorResolved === 'unknown' ? null : squadColorResolved;
```

Then add `squadColor` to the returned object (next to `enemyByTeam`):

```ts
    enemyByTeam,
    squadColor,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/commanderMetrics/__tests__/matchup.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/shared/commanderTypes.ts src/shared/commanderMetrics/matchup.ts src/shared/commanderMetrics/__tests__/matchup.test.ts
git commit -m "feat(wvw): resolve team colors in matchup metric (enemyByTeam.color, squadColor)"
```

---

## Task 4: Render real colors in `MatchupSection`

**Files:**
- Modify: `src/renderer/commander/sections/MatchupSection.tsx`

- [ ] **Step 1: Import the palette**

At the top of `src/renderer/commander/sections/MatchupSection.tsx` add:

```ts
import { WVW_TEAM_COLOR_META, type WvwTeamColor } from '../../../shared/wvwTeams';
```

- [ ] **Step 2: Replace the `EnemyTeamSplit` component**

Delete the `const TEAM_COLORS = [...]` line and the whole `EnemyTeamSplit`
function (currently lines ~84-115) and replace with:

```ts
function EnemyTeamSplit({ teams }: { teams: Array<{ teamID: number; count: number; color: WvwTeamColor }> }) {
  const total = Math.max(1, teams.reduce((a, t) => a + t.count, 0));
  return (
    <div className="flex flex-col gap-0.5" data-role="enemy-team-split">
      <div className="flex h-1.5 w-full overflow-hidden rounded-sm" style={{ background: 'var(--bg-card-inner)' }}>
        {teams.map((t) => (
          <div
            key={t.teamID}
            style={{
              width: `${(t.count / total) * 100}%`,
              backgroundColor: WVW_TEAM_COLOR_META[t.color].hex,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px]">
        {teams.map((t) => (
          <span
            key={t.teamID}
            className="font-mono"
            style={{ color: WVW_TEAM_COLOR_META[t.color].hex }}
            title={`team ${t.teamID}`}
          >
            {WVW_TEAM_COLOR_META[t.color].label} {t.count}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Show the squad's own color**

In the first `MetricCard` (the "Sq / Ally / Enemy" card), replace the existing
child line:

```tsx
        {m.enemyByTeam.length >= 1 && <EnemyTeamSplit teams={m.enemyByTeam} />}
```

with:

```tsx
        {m.squadColor && (
          <div className="text-[10px] font-mono mb-0.5" style={{ color: WVW_TEAM_COLOR_META[m.squadColor].hex }}>
            Your team: {WVW_TEAM_COLOR_META[m.squadColor].label}
          </div>
        )}
        {m.enemyByTeam.length >= 1 && <EnemyTeamSplit teams={m.enemyByTeam} />}
```

- [ ] **Step 4: Update / add a component test**

Find any existing MatchupSection test:

Run: `ls src/renderer/commander/**/__tests__/ 2>/dev/null; grep -rl "MatchupSection\|enemy-team-split" src --include=*.test.tsx`

If a test asserts the old `T A`/`TEAM_COLORS` behavior, update those assertions
to expect the color labels (`Red`, `Green`, `Blue`) and the `Your team:` line.
If none exists, no new test is required here (logic is covered by Task 3; this
task is presentational).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npm run validate`
Expected: PASS.

```bash
git add src/renderer/commander/sections/MatchupSection.tsx
git commit -m "feat(wvw): render real team colors and squad color in Matchup section"
```

---

## Task 5: Color labels in Discord embeds

**Files:**
- Modify: `src/main/discord.ts`

- [ ] **Step 1: Import the helper**

At the top of `src/main/discord.ts` add:

```ts
import { getWvwTeamColor, teamMapFromLog, WVW_TEAM_COLOR_META, WVW_TEAM_COLOR_ORDER, type WvwTeamColor } from '../shared/wvwTeams';
```

- [ ] **Step 2: Attach color + order in `computeEnemyTeamBreakdown`**

`computeEnemyTeamBreakdown(players, targets, durationSec)` (line ~143) returns
`teamIds.map((teamId) => ({ teamId, count, dmg, dps, downs, kills, classCounts }))`
sorted numerically. Change its signature to accept the team map and attach a
color, then order by color:

Change the signature line:

```ts
const computeEnemyTeamBreakdown = (players: any[], targets: any[], durationSec: number, teamMap: WvwTeamMap | null) => {
```

Add the import of the type alongside the helper import:

```ts
import type { WvwTeamMap } from '../shared/wvwTeams';
```

Replace the final `return teamIds.map(...)` block (lines ~234-245) with:

```ts
    return teamIds
        .map((teamId) => {
            const dmg = enemyTeamDmgMap.get(teamId) || 0;
            const classCounts = enemyTeamClassMap.get(teamId) || {};
            return {
                teamId,
                color: getWvwTeamColor(teamId, teamMap),
                count: enemyTeamCountMap.get(teamId) || 0,
                dmg,
                dps: Math.round(dmg / durationSec),
                downs: enemyTeamDownsMap.get(teamId) || 0,
                kills: enemyTeamKillsMap.get(teamId) || 0,
                classCounts,
            };
        })
        .sort((a, b) => WVW_TEAM_COLOR_ORDER.indexOf(a.color) - WVW_TEAM_COLOR_ORDER.indexOf(b.color));
```

- [ ] **Step 3: Pass the team map at the call site**

At the call site (line ~417), replace:

```ts
                    const enemyTeams = computeEnemyTeamBreakdown(players as any[], targets, durationSec || 1);
```

with:

```ts
                    const enemyTeams = computeEnemyTeamBreakdown(players as any[], targets, durationSec || 1, teamMapFromLog(jsonDetails));
```

- [ ] **Step 4: Use color labels in the embed field names**

Replace the team summary field name (line ~519):

```ts
                                    name: `Team ${team.teamId}:`,
```

with:

```ts
                                    name: `${WVW_TEAM_COLOR_META[team.color].label} team:`,
```

Replace the team classes field name (line ~617):

```ts
                                    name: `Team ${team.teamId} Classes:`,
```

with:

```ts
                                    name: `${WVW_TEAM_COLOR_META[team.color].label} classes:`,
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run validate`
Expected: PASS. (If `WvwTeamColor` is imported but unused, drop it from the import.)

- [ ] **Step 6: Commit**

```bash
git add src/main/discord.ts
git commit -m "feat(wvw): label Discord enemy-team embeds by real color"
```

---

## Task 6: Color labels in the per-log card

**Files:**
- Modify: `src/renderer/ExpandableLogCard.tsx`

- [ ] **Step 1: Import the helper**

At the top of `src/renderer/ExpandableLogCard.tsx` add:

```ts
import { getWvwTeamColor, teamMapFromLog, WVW_TEAM_COLOR_META, WVW_TEAM_COLOR_ORDER, type WvwTeamColor } from '../shared/wvwTeams';
```

- [ ] **Step 2: Build the team map and attach color to summaries**

The component reads the EI json from `details` (line ~41-42). Inside the
`if (shouldComputeDetails) { ... }` block, just before
`enemyTeamSummaryStats = Array.from(...)` (line ~542), add:

```ts
        const wvwTeamMap = teamMapFromLog(details);
```

Change the `TeamSummaryStats` type (line ~336-343) to include the color — add:

```ts
        color: WvwTeamColor;
```

In the `enemyTeamSummaryStats = Array.from(new Set<number>([...]))` chain
(lines ~542-559), replace the trailing `.sort((a, b) => a - b)` + `.map(...)`
so each entry gets a color and the list is color-ordered. The `.map` callback
currently returns `{ teamId, count, dmg, dps, downs, kills }`; add
`color: getWvwTeamColor(teamId, wvwTeamMap),` to that returned object, and
replace the `.sort((a, b) => a - b)` (which sorts the raw ids) with a post-map
color sort:

```ts
            .map((teamId) => {
                const dmg = enemyTeamDmgMap.get(teamId) || 0;
                return {
                    teamId,
                    color: getWvwTeamColor(teamId, wvwTeamMap),
                    count: enemyTeamCountMap.get(teamId) || 0,
                    dmg,
                    dps: Math.round(dmg / durationSec),
                    downs: enemyTeamDownsMap.get(teamId) || 0,
                    kills: enemyTeamKillsMap.get(teamId) || 0,
                };
            })
            .sort((a, b) => WVW_TEAM_COLOR_ORDER.indexOf(a.color) - WVW_TEAM_COLOR_ORDER.indexOf(b.color));
```

(Remove the old `.sort((a, b) => a - b)` that preceded the `.map`.)

- [ ] **Step 3: Carry the color into the class summaries**

`enemyTeamClassSummaries` is mapped from `enemyTeamSummaryStats` (line ~561).
Add the color to the `TeamClassSummary` type (line ~344-347):

```ts
        color: WvwTeamColor;
```

and include it in the returned object (line ~567):

```ts
            return { teamId: entry.teamId, color: entry.color, classes };
```

- [ ] **Step 4: Use color labels in the JSX**

Replace the team summary header (line ~1030):

```tsx
                                            <h5 className="font-semibold text-red-400 mb-2 uppercase tracking-wider text-[10px]">{`Team ${team.teamId}`}</h5>
```

with:

```tsx
                                            <h5 className="font-semibold mb-2 uppercase tracking-wider text-[10px]" style={{ color: WVW_TEAM_COLOR_META[team.color].hex }}>{`${WVW_TEAM_COLOR_META[team.color].label} team`}</h5>
```

Replace the team classes header (line ~1055):

```tsx
                                            {renderClassSummary(`Team ${team.teamId} Classes`, team.classes, 'text-red-400', true)}
```

with:

```tsx
                                            {renderClassSummary(`${WVW_TEAM_COLOR_META[team.color].label} Classes`, team.classes, 'text-red-400', true)}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run validate`
Expected: PASS. (Drop any unused imported name if lint flags it.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/ExpandableLogCard.tsx
git commit -m "feat(wvw): label per-log enemy teams by real color"
```

---

## Task 7: Full validation

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit -- --maxWorkers=2`
Expected: PASS. Fix any test that still asserts old `Team {id}` / `T A` labels by
updating its expectations to the new color labels.

- [ ] **Step 2: Validate types + lint**

Run: `npm run validate`
Expected: PASS (lint max-warnings 0).

- [ ] **Step 3: Run stats regression**

Run: `npm run test:regression:stats`
Expected: PASS.

- [ ] **Step 4: Final commit (only if Step 1 required test edits)**

```bash
git add -A
git commit -m "test(wvw): update team-label assertions for color labels"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** helper (Task 1), authoritative-first + fallback (Task 1/3), types (Task 2), Matchup incl. squad color (Task 3/4), Discord (Task 5), per-log card (Task 6), tests (Tasks 1/3/7). Server names are intentionally out of scope per the spec.
- **Type consistency:** `WvwTeamColor`, `WvwTeamMap`, `getWvwTeamColor`, `teamMapFromLog`, `WVW_TEAM_COLOR_META`, `WVW_TEAM_COLOR_ORDER` are used with the exact names defined in Task 1 throughout.
- **Fallback only matters for old logs;** recent logs resolve via `wvWMapData`. We have no fixture containing `wvWMapData`, so the authoritative path is covered by synthetic tests (Task 1/3) until a fresh WvW log is parsed.
