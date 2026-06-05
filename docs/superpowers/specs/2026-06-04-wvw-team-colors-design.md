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
authoritative source for mapping a team to a color. It carries six `uint32`s:

- `teams[0..2]` — the three shard **DataIds** (server names: Blackgate, Gandara,
  etc.)
- `teams[3..5]` — the three **team-def-ids**, positionally: index 1 = red,
  2 = blue, 3 = green.

However, AxiBridge does **not** parse `.evtc` directly. It runs Elite Insights
(EI) locally (`src/main/eiParser.ts`) and consumes EI's JSON output. Inspecting a
real WvW fixture (`test-fixtures/ei/20260130-193742.json`):

- EI exposes `teamID` on every `player` and `target`.
- EI does **not** expose the `CBTS_WVWTEAMS` event, shard DataIds, or any color
  field. Top-level metadata only has a `detailedWvW: true` boolean.
- The `teamID` values are the raw team-def-ids — e.g. squad `teamID: 433`, enemy
  targets `teamID: 707` (13) and `teamID: 2767` (10). These are **not** the
  shard DataIds and **not** the `1/2/3` color indices.

Two consequences:

1. **Server names are not reachable today.** The shard-name list is keyed by
   shard DataId, which only connects to `teamID` inside the `CBTS_WVWTEAMS` event
   that EI doesn't surface. Out of scope for this work.
2. **Color is reachable** via the well-known *fixed* team-def-id → color buckets
   (the same fixed-id approach arcdps/EI use today). `707` is a red id, `433` a
   blue id, `2767` a green id. deltaconnected notes the new event is the
   *preferred* replacement for this fixed-id approach because it is brittle on
   edge cases (new/restructured ids), but the fixed table is what works with the
   JSON we have now.

## Scope

In scope:

- Map `teamID` → Red / Green / Blue (or Unknown) via a shared helper.
- Use that mapping everywhere a team is currently displayed: stats Matchup
  section, Discord embeds, and the per-log expandable card.
- Show the squad's own team color in the Matchup section.

Out of scope (would require an EI change to surface `CBTS_WVWTEAMS`):

- Server/shard names.
- Authoritative per-log color mapping that survives id restructuring.

The shared helper is structured so an EI-provided authoritative map can be
preferred later with a localized change, without touching consumers.

## Architecture

### New module: `src/shared/wvwTeams.ts`

Lives in `src/shared/` because consumers span both the Electron main process
(`discord.ts`) and the renderer (`MatchupSection.tsx`, `ExpandableLogCard.tsx`).

```ts
export type WvwTeamColor = 'red' | 'green' | 'blue' | 'unknown';

// Canonical WvW team-def-id buckets, mirrored from Elite Insights' WvW
// team-id constants (the same fixed lists arcdps/EI use today).
const RED_TEAM_IDS:   ReadonlySet<number> = new Set([/* ... */]);
const GREEN_TEAM_IDS: ReadonlySet<number> = new Set([/* ... */]);
const BLUE_TEAM_IDS:  ReadonlySet<number> = new Set([/* ... */]);

export function getWvwTeamColor(teamID: number | null | undefined): WvwTeamColor;

export const WVW_TEAM_COLOR_META: Record<WvwTeamColor, {
  label: string;  // 'Red' | 'Green' | 'Blue' | 'Unknown'
  hex: string;    // used by Discord embeds and inline UI styles
}>;

// Stable display order for team lists.
export const WVW_TEAM_COLOR_ORDER: WvwTeamColor[];
  // ['red', 'green', 'blue', 'unknown']
```

- `getWvwTeamColor` returns `'unknown'` for ids not in any set, and for
  `null`/`undefined`/non-positive ids.
- The id lists are sourced from EI's published WvW team-id constants during
  implementation and locked in by tests (see Testing). If a real fixture id
  resolves to `'unknown'`, that is a failing test that forces the table to be
  completed — there is no silent miscategorization.

### Color palette

`WVW_TEAM_COLOR_META` is the single source of color values, replacing the
hard-coded `TEAM_COLORS` array in `MatchupSection.tsx`. Values are true
red / green / blue tuned for legibility on the dark UI and in Discord embeds,
plus a neutral gray for `unknown`.

### Consumers

All three switch to the shared helper. None of them keep their own color logic.

1. **`src/renderer/commander/sections/MatchupSection.tsx`**
   - `EnemyTeamSplit` bar segments and labels use `getWvwTeamColor(teamID)` for
     both color and label (`Red` / `Green` / `Blue` / `Unknown`) instead of the
     positional `TEAM_COLORS[i]` and `T{A/B/C}` scheme.
   - Add a small line showing the squad's own color ("Your team: Green"), derived
     from the squad players' `teamID`.

2. **`src/main/discord.ts`**
   - Embed field names `Team {teamId}:` and `Team {teamId} Classes:` become
     color-based (`Red team:`, `Red classes:`, etc.).
   - Team ordering uses `WVW_TEAM_COLOR_ORDER` instead of numeric id sort.

3. **`src/renderer/ExpandableLogCard.tsx`**
   - Per-log team summary rows are labeled and tinted by color instead of raw id.
   - Team ordering uses `WVW_TEAM_COLOR_ORDER`.

The `computeMatchup` metric (`src/shared/commanderMetrics/matchup.ts`) keeps
emitting `enemyByTeam: { teamID, count }[]` — it stays a pure metric. Color
resolution happens in the view layer via the shared helper. (No change to
`commanderTypes.ts`.)

## Data flow

EI JSON → existing per-consumer team aggregation (unchanged) produces groups
keyed by `teamID` → at display time each group is passed through
`getWvwTeamColor` / `WVW_TEAM_COLOR_META` for its label and color → groups
rendered/ordered by `WVW_TEAM_COLOR_ORDER`.

## Edge cases & error handling

- **Unknown team id:** rendered as the `Unknown` group with neutral gray. Known
  limitation: two *distinct* unrecognized teams collapse into one "Unknown"
  group. Acceptable until the EI `CBTS_WVWTEAMS` path lands; documented here.
- **Missing `teamID`** (older EI WvW logs that lump enemies into a single fake
  target): existing behavior is preserved — those rows are already filtered out
  or produce no team split, so the section/embed simply hides the breakdown as
  it does today.
- **Squad color in Matchup:** if squad players have no resolvable `teamID`, omit
  the "Your team" line rather than showing "Unknown".

## Testing

- **New `src/shared/__tests__/wvwTeams.test.ts`:**
  - `getWvwTeamColor` returns the correct color for representative ids in each
    bucket.
  - Fixture anchors: `707 → 'red'`, `433 → 'blue'`, `2767 → 'green'` (the ids
    present in `test-fixtures/ei/20260130-193742.json`).
  - `null` / `undefined` / `0` / negative / unknown id → `'unknown'`.
  - `WVW_TEAM_COLOR_META` has an entry for every `WvwTeamColor`.
- **Update existing tests** that assert the old `T A/B/C` labels or `Team {id}`
  text in `MatchupSection` and any Discord/`ExpandableLogCard` tests.

## Future work

When EI surfaces the `CBTS_WVWTEAMS` event in its JSON, add an authoritative
path inside `wvwTeams.ts` (prefer the EI-provided def-id → color map and shard →
server-name map when present, fall back to the fixed table otherwise). This
unlocks server names and removes the fixed-table brittleness. Consumers do not
change.
