# WvW Team Colors — Design

**Date:** 2026-06-04
**Status:** Approved (pending implementation plan)

## Problem

AxiBridge shows WvW enemy teams as generic labels — `Team A/B/C` in the stats
Matchup section, `Team {teamId}` in Discord embeds and in the per-log card. These
labels are meaningless to players, who think in terms of the in-game **Red /
Green / Blue** team colors. Worse, the colors currently rendered in
`MatchupSection` are *positional* (assigned by the team's rank in a count-sorted
list via a fixed `TEAM_COLORS` array), so "team A is red" only means "the team
with the most bodies got slot 0's color" — it does not reflect the team's actual
in-game color.

We want to replace the `Team XXX` notion with the team's real Red / Green / Blue
color everywhere a team is displayed.

## Background: what data we actually have

The arcdps `CBTS_WVWTEAMS` statechange event (shared by deltaconnected) is the
authoritative source for mapping a team to a color. It carries the three shard
**DataIds** (server names) and the three **team-def-ids**, positionally red /
blue / green.

AxiBridge does not parse `.evtc` directly — it runs Elite Insights (EI) locally
(`src/main/eiParser.ts`) and consumes EI's JSON. Two findings determine the
design:

1. **EI already surfaces the authoritative mapping.** Current EI emits a
   top-level `JsonLog.WvWMapData` object (JSON key `wvWMapData`), built directly
   from the `CBTS_WVWTEAMS` event. Confirmed from EI source
   (`GW2EIBuilders/JsonModels/JsonLogBuilder.cs`): it is guarded only by
   `if (log.CombatData.GetWvWTeamsEvent() != null)` — **not** behind
   combat-replay parsing, so our `parseCombatReplay: false` config does not block
   it. Fields (`GW2EIJSON/JsonWvWMapData.cs`):
   `redTeamID`, `blueTeamID`, `greenTeamID`, `redShardID`, `blueShardID`,
   `greenShardID` (a team id is `0` when that team is absent from the log).

2. **Older logs lack the event.** The `CBTS_WVWTEAMS` event only started
   ~May 2026. Our existing WvW fixture (`test-fixtures/ei/20260130-193742.json`,
   Jan 2026) therefore has **no** `wvWMapData` — it only has raw `teamID`s on
   players/targets (squad `433`, enemies `707` and `2767`). For these logs we
   fall back to the well-known fixed team-id → color table (the same fixed-id
   approach community tools used before the event).

JSON property casing: EI lowercases only the first character of the C# field
name (e.g. `GW2Build` → `gW2Build`, present in our fixture). So `WvWMapData` →
`wvWMapData`, `RedTeamID` → `redTeamID`, etc. The reader tolerates both
`wvWMapData` and `wvwMapData` for safety.

## Scope

In scope:

- A shared helper that maps a `teamID` → Red / Green / Blue / Unknown, preferring
  EI's authoritative `wvWMapData` when present and falling back to a fixed
  id-table otherwise.
- Use that mapping everywhere a team is displayed: stats Matchup section, Discord
  embeds, and the per-log expandable card.
- Show the squad's own team color in the Matchup section.

Out of scope (deferred, even though now reachable via `redShardID` etc.):

- Server/world names (e.g. "Blackgate"). The shard-id → name list is large and
  display placement needs its own design; tracked as future work.

## Architecture

### New module: `src/shared/wvwTeams.ts`

Lives in `src/shared/` because consumers span both the Electron main process
(`discord.ts`) and the renderer (`MatchupSection.tsx`, `ExpandableLogCard.tsx`).

```ts
export type WvwTeamColor = 'red' | 'green' | 'blue' | 'unknown';

/** Authoritative per-log team→color map, from EI's wvWMapData. */
export interface WvwTeamMap {
  red: number;    // redTeamID,   0 if absent
  green: number;  // greenTeamID, 0 if absent
  blue: number;   // blueTeamID,  0 if absent
}

/** Shape of EI's top-level wvWMapData (subset we use). */
export interface EiWvWMapData {
  redTeamID?: number;
  greenTeamID?: number;
  blueTeamID?: number;
}

/**
 * Build a WvwTeamMap from a parsed EI log object. Reads `wvWMapData`
 * (or `wvwMapData`). Returns null when the log has no team event.
 */
export function teamMapFromLog(log: unknown): WvwTeamMap | null;

/**
 * Resolve a team id to its color. Prefers the authoritative map; falls
 * back to the fixed id-table; returns 'unknown' if neither matches.
 */
export function getWvwTeamColor(
  teamID: number | null | undefined,
  map?: WvwTeamMap | null,
): WvwTeamColor;

export const WVW_TEAM_COLOR_META: Record<WvwTeamColor, {
  label: string;  // 'Red' | 'Green' | 'Blue' | 'Unknown'
  hex: string;    // used by Discord embeds and inline UI styles
}>;

/** Stable display order for team lists: red, green, blue, unknown. */
export const WVW_TEAM_COLOR_ORDER: WvwTeamColor[];
```

Resolution order in `getWvwTeamColor`:

1. If `map` is provided and `teamID` equals a non-zero `map.red/green/blue`,
   return that color.
2. Else if `teamID` is in the fixed id-table, return that color.
3. Else `'unknown'`.

`null` / `undefined` / non-positive `teamID` → `'unknown'`.

### Fixed fallback id-table

Sourced from two independent community tools that predate the event
(`Drevarr/EVTC_parser/gw2_data.py`, `Drevarr/GW2_EI_log_combiner/config.py`),
reconciled by union:

- **Red:** 697, 705, 706, 707, 882, 885, 886, 2520, 2543
- **Green:** 39, 2739, 2741, 2752, 2763, 2767
- **Blue:** 432, 433, 1277, 1282, 1989

Locked by tests asserting the real fixture ids resolve correctly via the fallback
(`707 → red`, `433 → blue`, `2767 → green`).

### Color palette

`WVW_TEAM_COLOR_META` is the single source of color values, replacing the
hard-coded `TEAM_COLORS` array in `MatchupSection.tsx`: true red / green / blue
tuned for legibility on the dark UI and in Discord, plus neutral gray for
`unknown`.

### Data model

Add an optional `wvWMapData` to the root EI JSON interface
(`src/shared/dpsReportTypes.ts: DPSReportJSON`):

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

### Consumers

All three switch to the shared helper; none keep their own color logic.

1. **`src/shared/commanderMetrics/matchup.ts` + `commanderTypes.ts`**
   - `computeMatchup` has the log `json`, so it resolves colors there:
     `enemyByTeam` entries gain `color: WvwTeamColor`, and a new
     `squadColor: WvwTeamColor | null` is emitted (from squad players' `teamID`).
   - `commanderTypes.ts` `matchup` type updated to match.

2. **`src/renderer/commander/sections/MatchupSection.tsx`**
   - `EnemyTeamSplit` segments + labels use the entry `color` and
     `WVW_TEAM_COLOR_META` instead of positional `TEAM_COLORS[i]` / `T{A/B/C}`.
   - Render "Your team: <Color>" from `squadColor` (omit if null).

3. **`src/main/discord.ts`**
   - Build the team map from the log json; embed field names
     `Team {teamId}:` / `Team {teamId} Classes:` become `Red team:` /
     `Red classes:` etc. via `getWvwTeamColor` + `WVW_TEAM_COLOR_META`.
   - Order teams by `WVW_TEAM_COLOR_ORDER`.

4. **`src/renderer/ExpandableLogCard.tsx`**
   - Build the team map from the log json; team summary rows labeled + tinted by
     color instead of raw id; order by `WVW_TEAM_COLOR_ORDER`.

## Data flow

EI JSON (`wvWMapData` + per-entity `teamID`) → each consumer builds a
`WvwTeamMap` once via `teamMapFromLog(json)` → existing per-consumer team
aggregation (unchanged) keyed by `teamID` → at display time each team id is
resolved via `getWvwTeamColor(teamID, map)` for label + color → rendered/ordered
by `WVW_TEAM_COLOR_ORDER`.

## Edge cases & error handling

- **No `wvWMapData` (older logs):** fixed table is used. Anchors guarantee the
  common case resolves.
- **Unknown team id (no map, not in table):** `Unknown` group, neutral gray.
  Known limitation only on old logs: two distinct unrecognized teams collapse
  into one "Unknown" group. Recent logs avoid this entirely via `wvWMapData`.
- **Team id `0` in `wvWMapData`** (team absent): never matches a real entity id;
  treated as "no such team".
- **Missing `teamID`** (older EI WvW logs that lump enemies into a single fake
  target): preserved current behavior — those rows are filtered out / produce no
  split, so the breakdown hides as today.
- **Squad color in Matchup:** if squad players have no resolvable color, omit the
  "Your team" line rather than showing "Unknown".

## Testing

- **New `src/shared/__tests__/wvwTeams.test.ts`:**
  - Authoritative path: with `map = { red: 1234, green: 5678, blue: 9012 }`,
    `getWvwTeamColor(5678, map) === 'green'`, etc.; a `0` map field never
    matches.
  - Authoritative beats table: an id that is `red` in the table but `green` in
    the map resolves to `green`.
  - Fallback path (no map): fixture anchors `707 → 'red'`, `433 → 'blue'`,
    `2767 → 'green'`, plus one more per color from the table.
  - `teamMapFromLog` reads `wvWMapData` and `wvwMapData`; returns null when
    absent.
  - `null` / `undefined` / `0` / negative / unknown id → `'unknown'`.
  - `WVW_TEAM_COLOR_META` has an entry for every `WvwTeamColor`;
    `WVW_TEAM_COLOR_ORDER` lists all four once.
- **`matchup.test`:** add a case asserting `enemyByTeam[].color` and
  `squadColor` for a synthetic log with `wvWMapData`, and for the real fixture
  (fallback).
- **Update existing tests** asserting old `T A/B/C` labels or `Team {id}` text in
  `MatchupSection` / Discord / `ExpandableLogCard`.

## Future work

- **Server/world names:** `wvWMapData` already provides `redShardID` etc.; map
  via the shard-id → name list and display alongside the color
  (e.g. "Blackgate (Red)").
- **Surfacing through pruning/upload:** if a future need arises to resolve colors
  in the web report from trimmed `report.json`, persist the resolved
  `WvwTeamMap` (3 ints) rather than the raw `wvWMapData`.
