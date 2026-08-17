# axilog native format — the axibridge reader rewrite (Phase D)

Date: 2026-08-16

## Problem

axibridge consumes axilog exclusively through `parseFileEi` (`src/main/axilogParser.ts:559`)
— the Elite Insights-compatibility JSON. Every downstream consumer is EI-shaped:
`packages/bridge-metrics`, the 18 `src/renderer/stats/compute*.ts` modules,
`src/main/detailsProcessing.ts`, `discord.ts`, and the web report. 79 files reference
`statsAll`/`dpsAll`/`buffUptimes`/`statsTargets`/`totalDamageDist`; roughly 40 of those
are non-test, non-`dist` source, totalling ~11.6k lines of compute.

EI's shape imposes costs that are structural, not incidental:

- **Positional joins.** `statsTargets[i]` and `targetDamageDist[i]` are aligned to
  `targets[i]` by index. A roster-shape change misattributes every per-target read
  rather than blanking it. The cutover report caught exactly this in §1.6 only because
  the roster size happened to change visibly.
- **Presence is overloaded.** EI cannot distinguish "this pass never ran" from "this
  pass ran and found nothing". The `sawField`/`sawTarget` guards, the
  `detailsTargetsHaveBuffs` freshness probe, and the `-1` distance sentinel are all
  reverse-engineering that distinction from field presence.
- **Duplicate player identity.** EI emits one `players[]` entry per agent instance, so
  a relog produces two rows for one person. axibridge patches this downstream by
  deduping on account.
- **Reconstruction work.** `deriveDistanceScalars` (240 lines, 10 tests) recomputes
  `distToCom`/`stackDist` from replay positions at 3.7%/4.3% mean error, and
  `applyEiCompatShims` infers log start time from the `.zevtc` mtime — wrong for any
  copied or restored file.

axilog v0.3.4 ships **native container 1.0** (`docs/NATIVE-FORMAT.md` in the axilog
repo), which solves all four upstream: id-keyed joins, an explicit `coverage` map with
four states, account-keyed entity dedupe collecting agent addrs across relogs
(`crates/axilog-core/src/wvw/mod.rs:17`), and engine-side distance scalars plus a real
`encounter.started_at_unix` log-start anchor.

axilog's own handoff (`docs/HANDOFF.md`) names this work **Phase D**, the last phase of
the native-format program, and states its goal as: *"axibridge runs entirely off
axilog's native format, no ei-json shim."*

## Goal

Make axilog's native 1.0 container the single canonical internal model for parsed log
data in axibridge, remove the Elite Insights backend entirely, and do it without
silently changing a displayed number.

## Decisions

These were settled during brainstorming and are recorded here as decisions, not
options, because the plan below depends on all four.

| # | Decision | Rejected alternatives |
|---|---|---|
| 1 | **Native is canonical; EI-shaped inputs are retired**, not adapted. | Writing an `eiToNative()` adapter. It would have to synthesize `coverage` and `entities[].role` values carrying no real information, and EI's `statesPerSource` is keyed by character *name* where native keys by entity id — a collision that cannot be undone after the fact. Manufacturing the fidelity native promises is worse than not having it. |
| 2 | **Published `report.json` keeps its current shape during the migration** (project back down at publish time); redesigning it into a computed/aggregated artifact is a separate follow-on project. | Making the artifact native-shaped now. Published reports are immutable and live on users' GitHub Pages sites; the viewer would carry a permanent dual-read, which is the cost we are migrating to avoid. |
| 3 | **Incremental migration with an equality oracle.** One unit at a time, each pinned by a test that parses the committed fixture both ways and compares aggregates. | A wholesale `bridge-metrics` cutover (no intermediate state where old and new can be compared) and a parallel-implementation diff (two full detail payloads in flight at once — precisely what caused the renderer OOM fixed in `6ebc97a1`). |
| 4 | **Elite Insights is removed, and a missing native binding is a hard failure.** | Retaining `EiManager` as a fallback. After the cutover its output feeds nothing, so a fallback that "works" would produce a report no consumer can read. A fallback producing unreadable output is worse than none. |

## Scope

**In scope:** the parse seam in `src/main/`, `packages/bridge-metrics`, the
`src/renderer/stats/compute*` modules, `incrementalAggregation.ts`, `discord.ts`, the
web report's reader, removal of the Elite Insights backend, and a one-time history
migration.

**Out of scope:** redesigning the published `report.json` artifact (decision 2); any
change to the stats UI, its taxonomy, or its navigation; the Discord embed *designs*
(only their data source moves); and R2/Pages publishing mechanics.

## Architecture

### The seam

Today:

```
parseFileEi → EI JSON → applyEiCompatShims + deriveDistanceScalars
  → attachConditionMetrics → pruneDetailsForStats (deny-list over EI keys)
  → IPC → pruneDetailsForWorker → bridge-metrics + renderer/stats
```

After Phase D:

```
parseFile → ReportV1 → pruneBlocks (drop blocks / drop replay.tracks)
  → IPC → worker → bridge-metrics + renderer/stats, reading native
```

`getActiveParser()` in `src/main/index.ts` stays where it is and keeps re-reading the
store per parse. That is what lets the cutover proceed incrementally without a restart
or a migration flag of its own.

### `ReportV1` is read directly

No axibridge wrapper type. A wrapper would reintroduce the third shape decision 1
rejects. Types come from axilog's `types.d.ts`, which is CI-guarded against the key-set
golden by `crates/axilog-schema/tests/v1_sdk_stubs.rs` — so stub drift becomes an axilog
test failure rather than an axibridge runtime bug.

`src/main/dpsReportTypes.ts` and `packages/bridge-metrics/src/dpsReportTypes.ts` shrink
to whatever the frozen legacy read path still needs (see "History migration").

### Pruning becomes block-shaped

Today pruning is `omit(details, DENY)` over EI's flat player objects
(`src/main/detailsProcessing.ts:161`). Native separates expensive data along the lines
we already prune: `blocks.replay.tracks` *is* the position payload that dominates
`report.json`, and it is one key. `coverage` then states why a block is absent rather
than leaving the consumer to infer it.

### Positional joins are deleted

`statsTargets[i]` ↔ `targets[i]` alignment goes away, along with the invariant test
pinning it. Native's `per_target` is keyed by the target's own entity id.

### Roster selection becomes a filter

Per `NATIVE-FORMAT.md`'s table:

| View | Filter over `entities[]` |
|---|---|
| Squad | `role == "squad"` |
| EI's curated `targets[]` | `role == "enemy_player"` |
| Combat-participant enemies | `role != "squad" && combat_participant` |

`friendly_player` — non-squad players on the squad's team — becomes newly available.
EI only ever exposed this as a `notInSquad` flag on a squad-shaped row.

## Plan

### Step 0 — 0.3.4 on ei-json, and the deletions it enables

**Ships independently, before any native work.** Phase B pushed its fixes through
`to_ei_json` as well as the native container, so bumping to 0.3.4 while still reading EI
obsoletes most of the cutover report's workarounds. Delete:

- `deriveDistanceScalars` (240 lines + 10 tests) — 0.3.4 computes `distToCom`/`stackDist`
  engine-side and maps them onto `statsAll`.
- The `.zevtc`-mtime timestamp inference in `applyEiCompatShims` — `encounter.started_at_unix`
  is a real log-start anchor, carried through to EI's `timeStart`.
- `OFFENSE_METRICS_STATS_ALL_FALLBACK` and its 11 tests
  (`packages/bridge-metrics/src/statsMetrics.ts`) — the per-target split went 7 → 23
  fields and `to_ei_json` fills 15 under EI's own key names, closing all 7 columns that
  were still blank.
- The `sawTargetSplit` enemy-downs fallback in `src/main/detailsProcessing.ts`.

Also in Step 0: flip `DEFAULT_PARSER_BACKEND` to `'axilog'` (with its
`SHIPPED_DEFAULT_BACKEND` mirror), which is decision 1's first move regardless.

This is the in-flight `chore/axilog-0.3.2` branch, retargeted from 0.3.2 to 0.3.4 and
extended into the deletions above.

**Precondition: axilog 0.3.4 must be published to npm.** The registry currently stops at
0.3.3; the 0.3.4 bump (`3511039`) exists only in the local checkout. Note that axilog's
`main` CI is red between a version bump and the lockfile-refresh commit *by design*
(`RELEASING.md` step 4) — a red `main` there is not a blocker.

### The equality oracle

For each migration unit, a test that:

1. parses `test-fixtures/axilog/wvw-small.anon.zevtc` via `parseFileEi(fixture, opts)`
   and via `parseFile(fixture, {everything: true})`, at the **same axilog version**;
2. runs old-compute-over-EI and new-compute-over-native;
3. asserts deep equality of the aggregate, or matches an entry in an explicit
   divergence allowlist.

Both bindings ship in the same npm package and a parse is ~0.45 s, so the oracle costs
roughly one extra parse per test file. `--all` / `everything: true` is defined as "every
analysis pass this version knows about", so oracle coverage cannot silently narrow as
axilog adds passes — the exact failure mode that produced the original audit's 30 blank
fields.

**The allowlist is a deliverable, not a nuisance.** Each entry is a reviewed statement of
which side is right. Expected entries:

| Divergence | Which is right, and why |
|---|---|
| `distToCom` / `stackDist` | Native. The delta is the old derivation's 3.7%/4.3% mean error. |
| Player counts where a relog occurred | Native. `dedupe_players` keys by account and collects agent addrs across relogs; EI emits one row per agent instance. |
| `minMitigation` | Native. Id-keyed per-target skill rows make a true global minimum trivial; today's column is a mean-of-mins, biased high. Closes cutover-report follow-up 6. |
| Skill/buff icons, proc flags | Native. Absent → present, so APM's auto-attack exclusion and proc filtering begin actually excluding and filtering. |

### The sentinel hazard

This is the sharpest risk in the migration and warrants its own gate.

EI collapses three distinct facts into one falsy value. Native separates them: for the
distance scalars, **absent** means the position pass never ran, **`-1`** means it ran and
nothing qualified, and **`>= 0`** is a real measurement — where `0` is both reachable and
correct (the commander's own `dist_to_com` is exactly `0`). `coverage` draws the same
distinction at block level between `not_computed` and `empty`.

EI-shaped code learned to treat falsy, `-1` and absent as interchangeable because EI gave
it no alternative. A mechanical port that preserves those null-guards will compile, pass
a naive equality check, and silently discard information.

**Gate:** every migration unit must include at least one test asserting behaviour against
a `not_computed` block or an absent sentinel — not only against populated data.

### Migration units

Ordered by data dependency. Each is one unit of work with its own oracle test.

| # | Unit | Principal files |
|---|---|---|
| 1 | Roster & identity | `playerIdentity.ts`, `attendance.ts`, `professionUtils.ts`, squad-guild extraction |
| 2 | Encounter & fight-level | `computeFightBreakdown.ts`, `reportMetrics.ts`; retires the rest of `applyEiCompatShims` |
| 3 | Positioning & replay | `positioning.ts`, `computeDistanceToTag.ts`, `computeOnTagReview.ts`, `computeTagDistanceDeaths.ts`, `computeTimelineAndMapData.ts` |
| 4 | Damage | `computeAllDamageData.ts`, `computeSpikeDamageData.ts`, `computeIncomingStrikeDamageData.ts`, `computeFightDiffMode.ts` |
| 5 | Boons & conditions | `boonGeneration.ts`, `conditionsMetrics.ts`, `computeBoonTimeline.ts`, `computeBoonUptimeTimeline.ts`, `computeStabPerformance.ts`; retires `attachConditionMetrics` into `blocks.conditions` |
| 6 | Defense, support, healing | `combatMetrics.ts`, `computeHealEffectivenessData.ts`, `computeStripSpikesData.ts` |
| 7 | Rotation & skills | `computeSkillUsageData.ts`, `computeSpecialTables.ts`; picks up proc flags and icons |
| 8 | The aggregators | `computePlayerAggregation.ts` (1689), `incrementalAggregation.ts` (1805), `computeCommanderStats.ts` (804), `computeStatsAggregation.ts` |
| 9 | Rollup & web report | `rollup.ts`, `src/web/reportApp.tsx`; decision 2's projection lands here |
| 10 | Discord | `discord.ts` |

Unit 8 is ~40% of the compute surface on its own but goes late deliberately: all four
modules consume the units above, so most of their conversion is already done by the time
they are reached. It is still the one unit likely to need splitting when it is planned —
treat it as a bucket, not a single task.

### Step N — removing Elite Insights

After unit 10, delete `src/main/eiParser.ts`, the EI auto-install/auto-update machinery,
`registerEiHandlers`, the Parse Engine settings card, `SHIPPED_DEFAULT_BACKEND` and its
drift guard, and the `parserBackend` store key itself.

Removed with them: the ~90 MB `GW2EICLI.zip` + .NET 8 runtime first-run download, and
every `dotnet` child process.

Per decision 4, `getActiveParser()`'s silent fallback goes too. A native binding that
fails to load becomes a **first-run hard failure** that names the platform and links a
report, rather than a silent degradation.

### History migration

Existing `dpsReportCache` entries and saved logs are EI-shaped and cannot be recomputed
under native-only compute. `ILogData` persists `filePath` and a precomputed
`dashboardSummary`, which makes the following possible:

- **`.zevtc` still present at `filePath`** → re-parse in the background and upgrade to
  native silently. This sweep runs **automatically on upgrade**.
- **Source file gone** → keep the row. `dashboardSummary` is stored rather than derived,
  so the log card, history list, win/loss and death counts keep working. Detailed stats
  views are unavailable for that log and it is marked legacy.
- **No dual-compute path.** That is what keeps "canonical" true.

A one-time notice before the sweep should state the user-visible cost plainly: a user with
a long history and a cleaned-out log folder loses detailed views on old fights.

### Accepted regression

`fetchDetailsFromPermalinkWithRetry` (`src/main/index.ts:402`) returns EI JSON and can no
longer hydrate anything. Its replacement is re-parsing from `filePath`, which covers the
normal case. A log whose `.zevtc` the user has deleted is today recoverable from its
dps.report permalink and after this is not. The regression is confined to history-repair
and bulk-import flows and is accepted.

## Coupling: this freezes native 1.0

`docs/NATIVE-FORMAT.md` states that 1.0's malleability licence "exists because 1.0 has no
external consumer reading it yet (the ei-json adapter is its only reader, and it is
in-tree), and it ends the moment one does."

Unit 1 is that moment. From then on, axilog owes axibridge the 1.x compatibility rules —
additive-only within a major; renames, retypes, meaning changes and `entities[]` sort-order
changes all require a major bump.

This should be a deliberate handshake, not a side effect. Recommended: axilog declares 1.0
frozen in `NATIVE-FORMAT.md` at the point unit 1 merges, and axibridge pins an exact axilog
version rather than a caret range until that declaration lands.

## Testing

- **Per unit:** one oracle test (both-ways parse, aggregate equality or allowlisted
  divergence) plus at least one sentinel/`not_computed` test.
- **Retained:** `src/main/__tests__/axilogParser.test.ts`'s real-parse integration block,
  retargeted from EI-shape assertions to native ones. Its inverse pin — asserting
  documented residuals are still absent — has already proved its worth by going red on the
  0.3.2 bump instead of letting the report go stale; keep that pattern.
- **Retired with their subjects:** the 10 `deriveDistanceScalars` tests, the 11
  `offenseStatsAllFallback` tests, the 6 `detailsProcessing` enemy-downs fallback tests,
  the `targets[]` index-alignment invariant test, and the `SettingsView` Parse Engine tests.
- **Gates:** `npm run validate` (typecheck + lint) and `npm run test:unit` green at every
  unit boundary; `npm run test:e2e:web` before unit 9 merges.
- Per the repo-wide runner limit, vitest runs with `--maxWorkers=2`.

## Open items

1. **Publish axilog 0.3.4 to npm.** Blocks Step 0. Owner-held.
2. **When to declare native 1.0 frozen** — recommended at unit 1's merge; needs an axilog-side
   commit to `NATIVE-FORMAT.md`.
3. **`packages/bridge-metrics` is consumed via `dist/`, not `src/`.** Every unit touching it
   needs a rebuild, or the change is invisible and produces phantom `TS2305` failures.
4. **Whether `friendly_player` (pug) data gets surfaced.** Newly available; deliberately not
   scoped here. A separate feature decision.
5. **The follow-on `report.json` redesign** (decision 2's C3). Motivated independently by
   `report.json` at ~31 MB with `replayFights` ~2/3 of it, and a rollup fetch around 706 MB.
