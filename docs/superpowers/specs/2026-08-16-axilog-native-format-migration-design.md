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

**During the migration (settled in unit 2):** `parseLog` runs both bindings and attaches
a *carry-set* — a whitelist of the native blocks migrated units actually read — to the
EI details under one key, `details.native` (`src/main/nativeCarrySet.ts`). Migrated
readers read native; unmigrated ones keep reading EI. The whitelist grows one unit at a
time and the EI half is deleted at Step N.

This does not reopen what decision 3 rejected. That rejection was of a parallel
*implementation diff* — computing every metric twice at runtime and comparing — which is
what put two full detail payloads in flight and caused the renderer OOM in `6ebc97a1`.
The carry-set is a projection, not a second payload, and the comparison lives in the
oracle tests. Measured on the fixture:

| | |
|---|---|
| Full EI payload | 3.40 MB |
| Full native payload | 2.38 MB |
| **Unit 1+2 carry-set** (`axilog`+`encounter`+`entities`+`coverage`) | **0.022 MB** |
| EI parse / native parse | 349 ms / 225 ms |

`blocks` never enters the carry-set wholesale — when a unit migrates, it carries the one
block it reads. The standing cost is therefore the second parse, +64% per log rather than
2×, and it disappears at Step N.

> **Stale as of 2026-08-27.** Both ratios in this table have inverted after units 3-5b.
> EI is now the *more* expensive parse, and the carry-set is 78% of the full native
> report rather than 0.9% of it. Re-measured figures are under Step N.2 below; the
> conclusion that `CARRIED_PATHS` earns its keep no longer follows from them.

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

The end state is also simply smaller: the full native report measures 2.38 MB against
ei-json's 3.40 MB on the fixture, before any pruning at all.

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

- `OFFENSE_METRICS_STATS_ALL_FALLBACK` and its 11 tests
  (`packages/bridge-metrics/src/statsMetrics.ts`) — the per-target split went 8 → 23
  fields and `to_ei_json` fills them under EI's own key names, closing all the columns
  that were still blank.
- The `sawTargetSplit` enemy-downs fallback in `src/main/detailsProcessing.ts` and its
  3 tests.

Two deletions originally scoped here turned out not to be available at 0.3.4,
established by probing the published artifact:

- `deriveDistanceScalars` — 0.3.4 computes the scalars engine-side onto
  **native** `blocks.replay.by_entity[id].{dist_to_com, stack_dist}`, but
  `to_ei_json` does not map them: `statsAll[0].distToCom` is `undefined` for
  every player even with `everything: true`. The deletion moves to **unit 3**.
- The `.zevtc`-mtime timestamp inference — `encounter.started_at_unix` is real
  on native, but ei-json still emits no `timeStart`/`timeEnd`/`zone`/
  `encounterDuration`/`players[].name`. `applyEiCompatShims` survives Step 0
  in full and is retired in **unit 2**.

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
| `timeStart` / `timeEnd` (unit 2, recorded) | Native, and the EI side no longer answers. ei-json emits no log-start event, so the shim inferred the time from the `.zevtc` mtime — off by 204 days on the fixture. Now sourced from `encounter.started_at_unix`. |
| WvW team map (unit 2, recorded) | Native. `wvWMapData` has a fixed red/blue/green shape, so `to_ei_json` fills a colour that fielded nobody with `representative_team_id()` — a hardcoded 697/432/39 (`axilog-ei/src/lib.rs:27`). The fixture has no red player and still reports `redTeamID: 697`, an id no agent in the log belongs to. `encounter.teams` enumerates only observed teams, and every id it reports matches EI, so `teamMapFromLog` takes native outright rather than merging the placeholder in. |
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
| 1 | Roster & identity | `playerIdentity.ts` → new `nativeRoster.ts`, `computeDominantGuildId.ts`, `squadGuilds.ts` |
| 2 | Encounter & fight-level ✅ | `nativeEncounter.ts`, `timestampUtils.ts`, `labelUtils.ts`, `wvwTeams.ts`, `computeFightBreakdown.ts`, `buildReportMeta.ts`; re-sources `applyEiCompatShims` from native |
| 3 | Positioning & replay | `positioning.ts`, `computeDistanceToTag.ts`, `computeOnTagReview.ts`, `computeTagDistanceDeaths.ts`, `computeTimelineAndMapData.ts` |
| 4 | Damage | `computeAllDamageData.ts`, `computeSpikeDamageData.ts`, `computeIncomingStrikeDamageData.ts`, `computeFightDiffMode.ts` |
| 5 | Boons & conditions | `boonGeneration.ts`, `conditionsMetrics.ts`, `computeBoonTimeline.ts`, `computeBoonUptimeTimeline.ts`, `computeStabPerformance.ts`; retires `attachConditionMetrics` into `blocks.conditions` |
| 6 | Defense, support, healing | `combatMetrics.ts`, `computeHealEffectivenessData.ts`, `computeStripSpikesData.ts` |
| 7 | Rotation & skills | `computeSkillUsageData.ts`, `computeSpecialTables.ts`; picks up proc flags and icons |
| 8 | The aggregators | `computePlayerAggregation.ts` (1689), `incrementalAggregation.ts` (1805), `computeCommanderStats.ts` (804), `computeStatsAggregation.ts` |
| 9 | Rollup & web report | `rollup.ts`, `reportMetrics.ts`, `src/web/reportApp.tsx`; decision 2's projection lands here |
| 10 | Discord | `discord.ts` |

`reportMetrics.ts` was originally listed under unit 2 but reads the *published*
`report.json` (`extractRunSummary`, `RunSummary`), not EI details — under decision 2 that
artifact keeps its shape during the migration, so it belongs to unit 9.

`applyEiCompatShims` is **re-sourced, not retired**, in unit 2. Seven live sites still
read its EI-spelled outputs with no native path — `main/index.ts` persists
`encounterDuration` into `ILogData`, `discord.ts` formats embeds from `timeStartStd`,
`dashboardUtils` and `ExpandableLogCard` read both — and those readers belong to units 8
and 10. The function now projects native encounter facts onto the legacy names and dies
with them. What unit 2 did delete is its `.zevtc`-mtime timestamp inference: the mtime is
the fight end only for a log still sitting where arcdps wrote it, and on the committed
fixture — checked out by git — it was wrong by **204 days**. Any user log that had been
copied, restored from backup or re-synced carried an equally wrong report date. With no
native start available the timestamps are now left undefined and callers fall back to
`uploadTime`.

`attendance.ts` reads a rollup payload, never EI JSON; its producer is
`incrementalAggregation.ts`, so attendance moves with unit 8.
`professionUtils.ts` takes profession *strings* and is shape-agnostic — only
its callers migrate.

**The profession mapping trap:** EI's `players[].profession` is native's
`entities[].elite_spec`, not native's `entities[].profession`. EI reports
`"Amalgam"`; native reports `profession: "Engineer", elite_spec: "Amalgam"`.
Every axibridge lookup table is keyed on the elite-spec spelling.

Unit 8 is ~40% of the compute surface on its own but goes late deliberately: all four
modules consume the units above, so most of their conversion is already done by the time
they are reached. It is still the one unit likely to need splitting when it is planned —
treat it as a bucket, not a single task.

### Step N — removing Elite Insights

**Split in two, and the first half shipped early (2026-08-27).** This step originally
bundled two removals that turned out to be independent: the Elite Insights *binary* and
the EI *JSON shape*. Only the second depends on units 6-10.

**Step N.1 — the binary. DONE.** `src/main/eiParser.ts`, `handlers/eiHandlers.ts` and its
eleven `ei:*` install/update/uninstall/disk-usage channels, the matching `electronAPI`
surface, the Parse Engine picker, `EiAnnouncementBanner`, `ParserBackend` /
`normalizeParserBackend` / `DEFAULT_PARSER_BACKEND` / `SHIPPED_DEFAULT_BACKEND`, the
`parserBackend` and `autoManageEi` store keys, and `parserBackendMigration.ts` are all
deleted. Gone with them: the ~90 MB `GW2EICLI.zip` + .NET 8 runtime first-run download,
and every `dotnet` child process.

Per decision 4, `getActiveParser()`'s silent fallback went too — it now returns the
`AxilogManager` or nothing, and a binding that fails to load is logged as a fatal at
startup and surfaced in the Parser Settings card, rather than silently degrading.

Two things the split made visible that the bundled version would have hidden:

- `EiParserSettings` had **twelve** fields and axilog reads **three**
  (`parseCombatReplay`, `computeDamageModifiers`, `rawTimelineArrays`). The other nine
  were Elite Insights `settings.conf` lines with no axilog counterpart, and had been
  inert since the axilog default flipped — including an **Anonymize Players** toggle on
  the dashboard Quick Settings card, which had been doing nothing. They are gone from the
  UI; the type is now `ParserSettings` in `src/main/parserSettings.ts`. The store key
  stays `eiParserSettings`, deliberately: renaming it costs a migration and no user sees
  it.
- `parserBackendMigration.ts` gave up its one chance on purpose so a user who re-picked
  Elite Insights kept it. With no second engine that restraint is meaningless, so
  `eliteInsightsRemoval.ts` replaces it: unconditional, and it deletes the install
  directory rather than orphaning ~90 MB with no UI left to remove it. It reports what it
  reclaimed through `parser:get-status`, and the card says so once.

The cost of the split: no escape hatch. An axilog parse regression used to be one setting
away from a working app and is now a hard outage until a fix ships.

**Step N.2 — the EI JSON shape.** Still gated on units 6-10. `parseFileEi` is an *axilog*
function and was untouched by N.1, so every log is still parsed twice. Measured on
`testdata/20260117-180135.zevtc` (38 entities), with the flags
`mapParserSettingsToAxilogOptions` actually sends:

| | parse | payload |
|---|---|---|
| `parseFileEi` (EI half) | 285 ms | 2.633 MB |
| `parseFile` (native half) | 170 ms | 1.697 MB full |
| current `CARRIED_PATHS` subset | — | 1.324 MB |
| **shipped per log today** | **455 ms** | **3.96 MB** |

Two figures from the measurement table above have **inverted** since it was written. EI is
now the *expensive* half of the parse, not the cheap incumbent — deleting it saves ~63% of
parse wall time and ~66% of the per-log payload, against the "+64%, and it disappears at
Step N" framing recorded there. And the carry-set is now **78% of the entire native
report** (1.324 of 1.697 MB), not the 154x projection that justified building a whitelist:
carrying the whole report costs +0.373 MB and would delete `CARRIED_PATHS`, which has
silently shipped broken three times.

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
- **Retired with their subjects:** the 11 `offenseStatsAllFallback` tests and the 3
  `detailsProcessing` enemy-downs fallback tests (Step 0); later, the 10
  `deriveDistanceScalars` tests (unit 3) and the `targets[]` index-alignment invariant
  test. The `SettingsView` Parse Engine tests are *updated*, not retired — they already
  read `DEFAULT_PARSER_BACKEND`, so only the `SHIPPED_DEFAULT_BACKEND` mirror moved.
- **Gates:** `npm run validate` (typecheck + lint) and `npm run test:unit` green at every
  unit boundary; `npm run test:e2e:web` before unit 9 merges.
- Per the repo-wide runner limit, vitest runs with `--maxWorkers=2`.
- The root vitest config includes only `src/**`, so `packages/bridge-metrics`' own suite
  runs separately via `npm test -w @axiapps/bridge-metrics`. Both must be run at a unit
  boundary; neither covers the other. Fixture paths in package tests must be
  `__dirname`-relative, since that suite's cwd is the package dir.

**What the committed fixture cannot exercise.** It contains no relog (42 EI
`players[]` entries, 42 distinct accounts), so the account-dedupe divergence
the allowlist anticipates is not observable on it and is covered synthetically
instead. It is also anonymized, which zeroes every `guild_id`, so the
squad-guild vote cannot be exercised end-to-end on real data. Both gaps are
covered by unit tests over hand-built reports; neither is a reason to commit a
non-anonymized log.

## Open items

1. ~~**Publish axilog 0.3.4 to npm.**~~ CLOSED — 0.3.4 is on the registry and
   pinned exactly in `package.json`.
2. **When to declare native 1.0 frozen** — recommended at unit 1's merge; needs an axilog-side
   commit to `NATIVE-FORMAT.md`.
3. **`packages/bridge-metrics` is consumed via `dist/`, not `src/`.** Every unit touching it
   needs a rebuild, or the change is invisible and produces phantom `TS2305` failures.
4. **Whether `friendly_player` (pug) data gets surfaced.** Newly available; deliberately not
   scoped here. A separate feature decision.
5. **The follow-on `report.json` redesign** (decision 2's C3). Motivated independently by
   `report.json` at ~31 MB with `replayFights` ~2/3 of it, and a rollup fetch around 706 MB.
