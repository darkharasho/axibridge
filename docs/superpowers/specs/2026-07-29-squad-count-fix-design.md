# Squad Count Fix — Distinct-Player Counting

**Date:** 2026-07-29
**Source:** Discord thread "Squad number inconsistencies." (reported by Mignon)
**Example:** report `20260727-200833-g1o0`, Log 21 (`i6Wm-20260727-223338_wvw`)

## Problem

Fight summaries report squad/pug player counts that exceed the real squad size. The
reported fight showed **Count: 51 (+4)** in the Discord embed while the in-game squad
was ~40/50 (43 at fight time). 51 exceeds GW2's hard 50-player squad cap, so the
number is impossible on its face. Squad counts also creep upward across a session
(21 → 31 → … → 51 over 22 logs) as fights get longer and messier.

## Root cause (verified against real data)

arcdps creates a **new agent entry for the same person** when they relog, swap
build/character, change subgroup, or despawn/respawn out of tracking range. Elite
Insights emits each agent as a separate `players[]` entry. For the example fight,
both dps.report's parse and AxiBridge's local parse produced 55 player entries — but
only 47 distinct accounts:

| Account | Entries | Cause |
|---|---|---|
| `Dash.8715` ("Celeana S") | 5 | relog + build swaps (Specter/Daredevil/Antiquary) |
| `Tangella.4031` | 3 | subgroup move (7 → 8) |
| `Ayumi Anime.1426` | 3 | build swaps (Druid/Untamed) |

51 "in-squad" entries = **43 distinct people** + 8 duplicates. AxiBridge counts
entries (`players.filter(p => !p.notInSquad).length`) at every count site, so
duplicates inflate every displayed count and the attendance leaderboard
(`logsJoined++` runs per entry, crediting one person up to 5 "logs joined" from a
single fight).

Duplicate entries are **not** a stats problem: each entry holds that player's real,
disjoint time-slice of the fight, so summing damage/deaths/support across entries is
correct, and per-player leaderboards already merge duplicates because they key by
account (`getPlayerIdentity` in `computePlayerAggregation.ts`).

## Counting semantics (the fix)

- A **squad member** is a distinct account with at least one non-fake, non-NPC
  (`isFake`/`friendlyNPC` falsy) player entry whose `notInSquad` is falsy during the
  log.
- A **pug** is a distinct account with only `notInSquad` entries.
- An account with entries in both buckets counts once, as squad.
- **Friendly count** (timeline's `friendlyCount`) = distinct squad members +
  distinct pugs.
- **Identity key:** `account` when present and not `"Unknown"`; else character
  `name`; else the entry stands alone as its own person (never assume two unknown
  entries are the same player).
- **Primary entry:** where one profession per person is needed (composition bars),
  use the person's entry with the largest `activeTimes[0]`; ties break to first
  occurrence. Primaries are existing entries, unmodified.
- Counts stay **union-over-the-log**: someone who left mid-fight still fought in it.
- **Anonymized logs** degrade gracefully: name-fallback still merges relog
  duplicates (same character); build-swap duplicates across characters don't merge —
  no worse than current behavior.

## New shared module

`packages/bridge-metrics/src/playerIdentity.ts`:

```ts
getPlayerAccountKey(p): string | null   // identity key; null → entry stands alone
partitionSquadPlayers(players): {
  squadPrimaries: Player[],             // one primary entry per distinct squad member
  pugPrimaries: Player[],               // one primary entry per distinct pug
}                                       // counts = .length of each
```

Wired the established way: new export path in the `bridge-metrics` `package.json`
exports map (+ `typesVersions`), plus a thin `src/shared/playerIdentity.ts`
re-export so Electron main (`discord.ts`), renderer, and web all consume the same
definition. Typing follows existing conventions in the package. Unit tests live in
`packages/bridge-metrics/src/__tests__/`.

## Count-site changes

| Site | Change |
|---|---|
| `src/main/discord.ts` (~L408–497) | Embed `Count:` uses partition lengths; `squadClassCounts` and pug `fromPlayers` count professions over primaries; `enemyCount` fallback (L428) uses pug count |
| `src/main/detailsProcessing.ts` (~L216, L260) | `buildDashboardSummaryFromDetails.squadCount` and `buildManifestEntry` squad/non-squad counts (manifest's raw `playerCount` stays entry-based); death/down sums in the same loops stay per-entry |
| `src/renderer/ExpandableLogCard.tsx` (~L47–55, L357) | Card squad/pug counts and class counts |
| `src/renderer/stats/incrementalAggregation.ts` (~L615) | Per-fight `squadCount`/`friendlyCount` feeding timeline entries, `avgSquadSize`, commander stats input |
| `src/renderer/stats/computeTimelineAndMapData.ts` (~L124) | Same swap |
| `src/renderer/stats/computeFightBreakdown.ts` (~L75, L117) | Per-fight `squadCount` and per-fight class counts |
| `packages/bridge-metrics/src/computePlayerAggregation.ts` (~L672) | Per-log seen-set keyed by the aggregation identity key: `logsJoined` increments once per identity per log; `stackedLogCount` increments once per identity per log when any of that identity's entries is stacked (dist ≤ 600). All other accumulators keep running per entry |

Downstream fixed transitively (no direct change): `attendance.json` (projects
from `logsJoined`), timeline display, web report `report.json`. Two claims in
the original design proved wrong during implementation and needed direct
fixes: `avgSquadSize` is accumulated independently in
`computePlayerAggregation.ts` (`totalSquadSizeAccum`, deduped in Task 6), and
`computeCommanderStats.ts` computes its own per-fight squad count in
`ingestLogCommanderStats` (deduped in follow-up Task 6b).

The `logsJoined`/`stackedLogCount` dedup uses the same identity key as the
aggregation rows (`getPlayerIdentity(...).key`), so split-by-class mode keeps
per-build rows counting their own participation, and default mode counts one person
once.

## What deliberately does not change

- Damage/DPS/downs/deaths/support **sums** — duplicate entries are real disjoint
  time-slices; summing is correct.
- Per-player leaderboard keying, including split-by-class rows for build-swappers.
- Enemy counts — enemy targets are anonymous (no account field); duplicate enemy
  agents cannot be merged. Out of scope.
- Already-published web reports and `dashboardSummary` values persisted on old logs
  (used as fallback when details are pruned) — stale numbers persist until
  re-uploaded/reprocessed. New logs are correct.

## Testing

- **New unit tests** for `playerIdentity`: duplicates in squad; duplicates in pugs;
  squad+pug overlap resolves to squad; missing-account fallback to name; entries
  with neither account nor name stand alone; `isFake`/`friendlyNPC` exclusion;
  primary-by-active-time selection with tie-break.
- **Synthetic end-to-end fixture** mirroring Log 21's shape (43 distinct squad
  accounts across 51 entries + 4 pugs) asserting `squadCount === 43` /
  `pugCount === 4` through `buildDashboardSummaryFromDetails` and the aggregation
  per-fight squad count, and `logsJoined === 1` for a 5-entry player.
- **Update existing tests** that assert entry-count semantics (attendance, fight
  coverage, timeline, `detailsProcessing`).
- Gate: `npm run validate` and `npm run test:unit` (maxWorkers=2 per machine
  policy).

**Expected outcome for the reported fight:** embed shows **43 (+4)** instead of
51 (+4); timeline and average squad sizes match the in-game squad UI; attendance
stops crediting build-swappers with extra fights.
