# On Tag Review section — design

**Date:** 2026-08-08
**Status:** Approved for implementation (autonomous session — user requested "add a similar view to how log combiner has this table" with a screenshot of GW2_EI_log_combiner's On Tag Review table)

## What

A new per-player table section in the stats dashboard (desktop + web report) that classifies every squad death by its distance from the commander tag, mirroring the "On Tag Review" table from [Drevarr/GW2_EI_log_combiner](https://github.com/Drevarr/GW2_EI_log_combiner).

Columns: Player, # Fights, Avg Dist, On-Tag ☠, Off-Tag ☠, After-Tag ☠, Run-Back ☠, Total ☠, Off-Tag Ranges.

## Classification rules (matching Drevarr semantics)

Reference: `parser_functions.py` in GW2_EI_log_combiner (`On_Tag = 600`, `Run_Back = 5000`).

A **death event** is a `combatReplayData.down` interval whose end time equals a `dead` interval start (the same down→death linkage already used by `computeTagDistanceDeaths.ts`). Rallied downs are excluded. For each death, compute the player↔tag distance at the down-start poll index (`hypot / inchToPixel`, indices clamped, player `start` offset applied — identical math to the existing module).

- **On-Tag**: distance ≤ 600
- **Off-Tag**: 600 < distance ≤ 5,000 — the rounded distance is recorded in *Off-Tag Ranges*
- **Run-Back**: distance > 5,000 (player was returning from spawn)
- **Total** = On-Tag + Off-Tag + Run-Back (every linked death is distance-classified)
- **After-Tag**: overlay count (subset of Total), incremented when the down started after the tag's first death in that fight. Tag death = earliest `dead` start > 0 on the commander's replay data.

Commander identification follows the existing convention: first squad player with `hasCommanderTag` (`squadPlayers.find`). The commander's own distance is 0 (their deaths are On-Tag), matching both Drevarr and `computeTagDistanceDeaths`.

**Avg Dist** (deliberate deviation from Drevarr): mean of per-poll replay distances from fight start up to the first of (player's first death, tag death, fight end), averaged per fight then across fights. Per-fight values > 5,000 are discarded (Drevarr's run-back guard). Fallback when the fight is replay-usable but the player has no positions: `statsAll[0].distToCom` when finite and ≥ 0 (guards the EI v3.24 "Infinity"/-1 sentinels). Drevarr's version overwrites the value per death processed and mixes `distToCom` in; ours is a cleaner single definition with the same intent — "how far from tag while it mattered."

## Aggregation

Rows are keyed by **account** (AxiBridge convention — `computeDistanceToTag`, player dedupe v2.13.10), not Drevarr's name|profession split. `professionList` is kept for the multi-profession icon treatment used by other sections. Fights where replay is unusable (no commander, no tag positions, no polling metadata) contribute nothing, same as `computeTagDistanceDeaths`'s `hasReplayData=false` path.

## Architecture

New module `src/renderer/stats/computeOnTagReview.ts` following the established ingest/finalize pattern:

- `ingestLogOnTagReview(log, fightIndex): OnTagReviewContribution[]` — per player per fight: `{ account, profession, isCommander, fightId, avgDist: number | null, deaths: Array<{ range: number; afterTag: boolean }> }`
- `finalizeOnTagReview(contributions): OnTagReviewResult` — `{ rows: OnTagReviewRow[], usableFightCount }`; row = `{ account, profession, professionList, fightCount, avgDist, onTag, offTag, afterTag, runBack, total, offTagRanges, isCommander }`
- `computeOnTagReview(sortedFightLogs)` — convenience wrapper (tests / direct use)

Wiring in `incrementalAggregation.ts` mirrors `distanceToTagContribs`: a `Stored` array with timestamps, push in `ingestLog`, sort by timestamp + flatMap + finalize in `finalize()`, expose as `stats.onTagReview`. Contribution objects are tiny (counts + a few numbers), so worker payloads and report.json grow negligibly. `pruneDetailsForWorker` already preserves `combatReplayData`, and the web report passes the whole precomputed stats object through, so both paths work without further changes.

## UI

`src/renderer/stats/sections/OnTagReviewSection.tsx`, modeled on `SquadDistanceToTagSection` (sortable columns, sticky header, expand button, profession icons, CSS-variable theming). Section id `on-tag-review`, Squad Stats group, directly after Tag Distance Deaths, `--section-defense` accent, Skull icon.

Signature treatment: zero counts render muted (~45% opacity) so nonzero cells read as a problem heatmap — Off-Tag amber (`--status-warning`), Run-Back red (`--status-error`), After-Tag violet, On-Tag/Total normal. Off-Tag Ranges render as small mono chips sorted descending (amber ≤5,000). A one-line legend under the title states the thresholds. Default sort: Total desc. Empty state matches the sibling section: "No replay data available — commander tag positions are required for this table."

Registration points (all six): `StatsView.tsx` (`ORDERED_SECTION_IDS`, legacy grid, `renderGroup('squad-stats')`), `useStatsNavigation.ts`, `web/reportApp.tsx`, `sectionColors.ts`.

## Testing

`src/renderer/stats/__tests__/computeOnTagReview.test.ts` with the synthetic `makeLog`/`makePlayer` helpers from `computeTagDistanceDeaths.test.ts`: empty input; unusable fight (no commander); boundary classification (600 exactly → On-Tag, 5,000 exactly → Off-Tag, above → Run-Back); after-tag overlay with Total invariant; rallied downs excluded; commander death = On-Tag at distance 0; multi-fight aggregation by account (counts sum, ranges concatenate, fightCount, avgDist); distToCom fallback incl. sentinel guards. Plus an `incrementalAggregation` assertion that `stats.onTagReview` is populated.

## Out of scope (YAGNI)

Discord embed for this table, per-fight drilldown (Tag Distance Deaths already covers it), min-fights filter, configurable thresholds. Thresholds are exported constants, so a settings knob can come later if requested.
