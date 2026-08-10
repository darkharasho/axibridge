# axilog parser cutover

axibridge can now parse logs in-process with
**[axilog](https://github.com/darkharasho/axilog)** (`@axiapps/axilog` 0.2.0, native Rust bindings)
instead of spawning the Elite Insights .NET CLI. Both backends are fully wired behind one
`parserBackend` setting.

**Elite Insights remains the default.** The read-surface audit below is the reason: of the 118
EI-JSON paths axibridge reads, **30 are not emitted by axilog's `ei-json` adapter**. They all
degrade safely — every read site is null-guarded, nothing throws — but "safely" means *blank*, and
boon-generation attribution, incoming conditions, damage mitigation and the incoming-strike-damage
chart all render empty. That is not an acceptable out-of-the-box experience, so the fast path is
opt-in until it is also the complete path. **The default flips to axilog once axilog closes the
ei-json adapter gap** (§4.2-§4.4); `DEFAULT_PARSER_BACKEND` in `src/main/axilogParser.ts` carries
the same rationale and cites this document.

The prize, for context on why the cutover is worth finishing:

| | Elite Insights CLI (default) | axilog (opt-in) |
|---|---|---|
| Delivery | ~90 MB download at first run (`GW2EICLI.zip` + a .NET 8 runtime on Linux) into `userData/elite-insights` | npm dependency with prebuilt per-platform binaries |
| Parse of the anonymized WvW fixture | seconds–minutes (10 min timeout) | **0.31 s**, in-process |
| External processes | `dotnet` child process per log | none |
| Update machinery | GitHub release polling, auto-install/update | none (versioned with the app) |
| Read-surface coverage | 118/118 | 88/118 (82 native + 6 derived) |

---

## 1. Read-surface audit

**Verdict: 118 distinct EI-JSON paths are read across the app; 82 are emitted by axilog, 6 are
reconstructed in `src/main/axilogParser.ts`, and 30 are gaps.** Every gap degrades to `0` /
`null` / an empty list rather than throwing — the read surface is uniformly null-guarded
(`?.[0]?.field || 0`, `Number(x ?? 0)`, `Array.isArray(...) ? ... : []`), and the metrics spec
states this contract explicitly (`src/shared/metrics-spec.md:1393-1403`, "missing fields always
fall back to 0").

Method: `EiManager.parseLog` (`src/main/eiParser.ts:266-297`) reads nothing itself — it returns the
gunzipped JSON opaquely. The real consumers are, in order:
`attachConditionMetrics` → `pruneDetailsForStats` (`src/main/detailsProcessing.ts:157`) → IPC /
`dpsReportCache` → `pruneDetailsForWorker`
(`src/renderer/stats/hooks/useStatsAggregationWorker.ts:73`) → `@axiapps/bridge-metrics` +
`src/renderer/stats/*`. The declared input contract lives at `src/shared/metrics-spec.md:11-46`
(`scripts/sync-metrics-spec.mjs` merely copies that file to `docs/`; there is no machine-readable
path map).

Legend: **E** = axilog emits it always · **F** = axilog emits it under a `ParseOptions` flag (all of
which this integration turns on) · **D** = derived in `axilogParser.ts` · **—** = gap.

### 1.1 Top level

| Path | axilog | Notes |
|---|---|---|
| `durationMS` | E | exact vs EI |
| `fightName` | E | `"Detailed WvW - <map>"` |
| `success` | E | |
| `recordedBy` | E | |
| `targets[]` | E | full unfiltered enemy roster |
| `players[]` | E | |
| `skillMap` | E | scoped to referenced ids; `name`/`isSwap`/`canCrit` only |
| `buffMap` | E | the 12 tracked boons only |
| `wvWMapData.{red,green,blue}TeamID` | E | |
| `combatReplayMetaData.{pollingRate,inchToPixel,sizes,maps[].url}` | F `replay` | omitted for maps GW2EI ships no image for |
| `damageModMap` | F `modifiers` | 69/75 ids on the reference capture, text-identical to EI |
| `zone` / `mapName` / `map` / `location` | **D** | split out of `fightName` |
| `encounterDuration` | **D** | formatted from `durationMS` in EI's `"0m 49s 285ms"` spelling |
| `timeStart` / `timeStartStd` / `timeEnd` / `timeEndStd` | **D** | from the `.zevtc` mtime (fight end) minus `durationMS`; approximate, and only ever consulted after `uploadTime` |
| `uploadTime` | — | never came from EI — supplied by the dps.report upload result |
| `id` | — | `buildManifestEntry` falls back to `dev-log-N` |
| `uploadLinks` | — | dps.report concept; `computeFightBreakdown.ts:11` is `?.`-guarded |
| `personalDamageMods` | — | pure re-index of `damageModMap` + per-player arrays; axilog omits rather than fake EI's `Spec` spelling |
| `logStartOffset` | — | `Number(... \|\| 0)` |
| `detailedWvW` | — | falsy ⇒ consumers take their non-detailed branch |
| `evtc` | — | existence probe in `discord.ts:331` |
| `{red,green,blue}ShardID` | — | `wvwTeams.ts` validates numerically and skips |
| `phases`, `logErrors`, `mechanics` | n/a | pruned before any consumer; **never read** |

### 1.2 `players[]`

| Path | axilog | Notes |
|---|---|---|
| `account`, `profession`, `elite_spec`, `group`, `teamID`, `notInSquad`, `hasCommanderTag`, `character_name` | E | |
| `name` | **D** | aliased from `character_name`; `playerIdentity.getPlayerAccountKey` and several displays fall back to it |
| `activeTimes[0]` | E | 0.0000 % max error vs EI on the golden fixture |
| `dpsAll[0].damage`, `.dps` | E | |
| `dpsAll[0].breakbarDamage`, `.downContribution` | — | breakbar is not modelled; down-contribution is read from `statsAll[0]` first (`combatMetrics.ts:99-130`) |
| `statsAll[0].downContribution` | E | arcdps methodology, not EI's |
| `statsAll[0].appliedCrowdControl`, `.appliedCrowdControlDuration` | E | exact vs EI |
| `statsAll[0].downed`, `.killed` | E | whole-fight |
| `statsAll[0].distToCom`, `.stackDist` | **D** | see §3 |
| `statsAll[0].saved` | — | `Number(... \|\| 0)`; not in `dpsReportTypes` either |
| `statsAll[0]` hit-quality family (`criticalRate`/`criticalDmg`/`flankingRate`/`glanceRate`/`againstMovingRate`/`connected*`/`critableDirectDamageCount`/`againstDowned*`) | E | exact vs EI both eras |
| `defenses[0].damageTaken`, `.downCount`, `.deadCount` | E | |
| `defenses[0].blockedCount`/`evadedCount`/`dodgeCount`/`missedCount`/`interruptedCount`/`invulnedCount` | E | exact vs EI |
| `defenses[0].strike*/power*/condition*/lifeLeech*/damageBarrier*/breakbar*` | E | exact (one deliberate divergence: `lifeLeechDamageTakenCount`, where axilog is correct and EI has a known counting bug) |
| `defenses[0].receivedCrowdControl`, `.receivedCrowdControlDuration` | — | **gap** — incoming CC |
| `defenses[0].boonStrips`, `.boonStripsTime` | — | **gap** — incoming strips |
| `support[0].condiCleanse`, `.condiCleanseSelf`, `.boonStrips`, `.resurrects`, `.stunBreak`, `.removedStunDuration` | E | exact vs EI |
| `support[0].boonStripsTime` | — | strip *duration* not modelled |
| `statsTargets[i][0].totalDmg` | E | |
| `statsTargets[i][0].killed`, `.downed`, `.downContribution`, `.damage`, `.connectedHits`, `.againstDownedCount` | — | **gap** — axilog computes no per-target split. See §4.1 for the mitigation. |
| `buffUptimes[].id`, `.buffData[0].uptime`, `.buffData[0].presence` | E | 0/444 cells over the 2 pp tolerance vs EI |
| `buffUptimes[].states`, `.statesPerSource` | — | **gap** — per-source boon state timelines |
| `selfBuffs`, `groupBuffs`, `squadBuffs` (`[].buffData[0].generation`/`.wasted`) | — | **gap** — boon-generation attribution. axilog emits only a self rollup at `buffUptimes[].buffData[0].generated` |
| `totalDamageDist[phase][]` (`id`/`totalDamage`/`min`/`max`/`hits`/`crit`/`flank`) | F `skillDamage` | every shared skill id exact vs the golden |
| `totalDamageDist[][].connectedHits`, `.downContribution`, `.indirectDamage`, `.glance` etc. | — | not tracked; omitted rather than faked |
| `targetDamageDist[target][phase][]` | F `skillDamage` | |
| `totalDamageTaken[phase][]` | F `skillDamage` | same field subset as above |
| `damage1S[0]`, `damageTaken1S[0]`, `targetDamage1S[t][phase]` | F `timeseries` | cumulative, matching EI's `*1S` semantics |
| `powerDamageTaken1S`, `targetPowerDamage1S` | — | **gap** — no power/condi split on the series |
| `dpsTargets[t][phase]` | F `timeseries` | pruned away by `PLAYER_DENY` anyway |
| `rotation[].id`, `.skills[].castTime`, `.duration` | F `rotation` | per-player cast count exact vs the golden; documented ~29 % `InstantCastEvent` scope gap |
| `damageModifiers[]`, `incomingDamageModifiers[]` | F `modifiers` | 38 of 69 ids text-identical to EI; the rest carry a measured, pinned residual |
| `extHealingStats.outgoingHealing`, `extBarrierStats.outgoingBarrier` | E | |
| `extHealingStats.outgoingHealingAllies`, `.totalHealingDist`, `.healing1S` | — | **gap** — per-ally / per-skill healing |
| `extBarrierStats.outgoingBarrierAllies`, `.totalBarrierDist` | — | **gap** |
| `minions[]` | — | **gap** — minion damage-taken rollups |
| `guildID` | — | **gap** — squad-guild auto-detection of the WvW matchup |
| `instanceID`, `display_name` | — | `computePlayerAggregation.ts` treats both as optional |
| `healthPercents` | — | pruned by `PLAYER_DENY` on the stats path; only unpruned replay-mode consumers see it |
| `isFake`, `friendlyNPC` | — | absent ⇒ falsy ⇒ the entry counts as real, which is correct: axilog enumerates no synthetic actors |
| `boonsAppliedCount` (from `boonsStates`) | — | `boonsStates` is not emitted, so the injected count is 0 |
| `combatReplayData.{start,end,down,dead,dc}` | E | `down`/`dead` byte-exact vs the golden |
| `combatReplayData.{positions,orientations,iconURL}` | F `replay` | GW2EI's own pixel grid, text-exact vs two real EI exports |

### 1.3 `targets[]`

| Path | axilog | Notes |
|---|---|---|
| `id`, `name`, `teamID`, `enemyPlayer`, `isFake` | E | `isFake` always `false` — every target is a real tracked agent |
| `profession` | — | axilog resolves no profession for enemies |
| `totalDamageDist[0][]` | — | **gap** — the enemy-skill averages behind damage mitigation |
| `damage1S`, `powerDamage1S` | — | **gap** — incoming-strike-damage chart's primary source |
| `buffs[].id`, `.statesPerSource` | — | **gap** — incoming-conditions attribution |
| `dpsAll[0].damage` | — | |
| `combatReplayData.{positions,start,down,dead}` | F `replay` | |
| `totalHealth`, `healthPercentBurned`, `defenses`, `statsAll` | n/a | declared in the `Target` interface, **never read** |

### 1.4 Map leaves

| Path | axilog | Notes |
|---|---|---|
| `skillMap[s<id>].name` | E | this log's own skill table, best-effort (falls back to `"Skill <id>"`) |
| `skillMap[s<id>].icon`, `.autoAttack`, `.isTraitProc`, `.isGearProc`, `.isUnconditionalProc` | — | need EI's bundled/live GW2 skill DB |
| `buffMap[b<id>].name`, `.stacking` | E | 12 boons |
| `buffMap[b<id>].icon` | — | |
| `buffMap[b<id>].classification` | — | **benign**: all three readers (`computePlayerAggregation.ts:190`, `boonGeneration.ts:49`, `computeCommanderStats.ts:8`) treat a missing classification as `Boon`, which is exactly right for axilog's boon-only map |
| `damageModMap[d<id>].{name,icon,description,nonMultiplier,isCounter,skillBased,approximate,incoming}` | F `modifiers` | all eight fields, character-identical to a real export |

---

## 2. Settings mapping

`src/main/axilogParser.ts`'s `mapEiSettingsToAxilogOptions` translates the existing user-facing
`EiParserSettings` onto axilog's `ParseOptions` (`@axiapps/axilog`'s `index.d.ts`; napi exposes them
as a plain camelCased object, unlike the Python SDK's keyword-only form).

| `EiParserSettings` | axilog `ParseOptions` | Rationale |
|---|---|---|
| *(none — hardcoded `true`)* | `replay` | Mirrors `generateEiConf`, which hardcodes `ParseCombatReplay=True` for the same reason. Produces `combatReplayData.positions` + `combatReplayMetaData`, and is the input to the derived `distToCom`/`stackDist`. The user's `parseCombatReplay` setting means *retain the positions post-parse* and is still applied downstream by `pruneDetailsForStats` — untouched. |
| `computeDamageModifiers` | `modifiers` | Gates `damageModifiers`/`incomingDamageModifiers` **and** the top-level `damageModMap`, which doubles as `get-log-details`' cache-freshness marker (`uploadHandlers.ts:152`). |
| `rawTimelineArrays` | `timeseries` | `damage1S`/`damageTaken1S`/`targetDamage1S`/`dpsTargets` — the direct analogue of EI's own `RawTimelineArrays` conf key. |
| *(none — hardcoded `true`)* | `skillDamage` | Real EI always emits `totalDamageDist`/`targetDamageDist`/`totalDamageTaken`; axilog makes them opt-in purely for payload size. Forced on to keep the read surface identical. |
| *(none — hardcoded `true`)* | `rotation` | Same reasoning; `rotation[]` feeds skill-usage, APM and the Vindicator dodge count. |

Ignored, with no axilog counterpart: `detailledWvW`, `parsePhases`, `skipFailedTries`, `anonymous`,
`customTooShort`, `saveOutHTML`, `lightTheme`, `singleThreaded`, `memoryLimit` (axilog is WvW-first,
single-fight, never writes HTML and is not phase-aware).

### Backend selection

A new store key `parserBackend: 'axilog' | 'elite-insights'` defaults to `'elite-insights'`; only an
exact `'axilog'` opts in, and `normalizeParserBackend` coerces everything else — unset, empty,
mis-cased, whitespace-padded, unknown — back to the default, so a corrupt or hand-edited store can
never silently land a user on the incomplete backend. `src/main/index.ts` resolves it
through one `getActiveParser()` helper so every call site — the parse queue, the cache-staleness
check, the local-parse-first branch, progress callbacks, `statsPruneOptions`, the quit hook — is
backend-agnostic. `AxilogManager` deliberately mirrors `EiManager`'s shape
(`isInstalled`/`getStatus`/`get|setSettings`/`setParseProgressCallback`/`parseLog`/
`killActiveProcess`), with an inert install/update surface.

Two safety behaviours:

- If the user selects axilog but the native binding fails to load (a platform npm has no prebuilt
  binary for), `getActiveParser()` silently falls back to `EiManager`. The selected backend and the
  binding's real availability are both reported over `parser:get-backend`.
- The EI auto-install/auto-update machinery (`shouldAutoManageEi()`) is skipped entirely while the
  axilog backend is live, so a user who has opted in never downloads the .NET runtime or the EI CLI.
  On the default backend it runs exactly as before.

IPC surface added in `src/main/handlers/eiHandlers.ts`: `parser:get-backend` (returns
`{ backend, default, axilogAvailable, axilogVersion }`), `parser:set-backend`, and a
`parser:backend-changed` broadcast. `ei:save-settings` now mirrors the settings object into both
managers.

---

## 3. Derived scalars: `distToCom` / `stackDist`

These were the audit's headline risk: axilog does not emit them, and they are the entire basis of
the Closest-to-Tag metric plus the coarse-mode positioning path.

### EI semantics (verified against GW2EI source, not inferred)

`GW2EIBuilders/JsonModels/JsonActorUtilities/JsonStatisticsBuilder.cs:153-154` maps
`StackDist = gameStats.DistanceToCenterOfSquad` and `DistToCom = gameStats.DistanceToCommander`,
both produced by `GW2EIEvtcParser/EIData/Statistics/GameplayStatistics.cs:140-141` through
`GetDistanceToTarget` (same file, lines 29-69):

- iterate the actor's **active** polled positions
  (`SingleActor.GetCombatReplayActivePolledPositions`,
  `GW2EIEvtcParser/EIData/Actors/SingleActor.cs:268-290`, which nulls every poll the actor spends
  **down, dead or disconnected**);
- pair each with the reference position at the **same poll timestamp**, skipping polls where the
  reference is null (lines 44-62);
- the distance is the **XY-plane** length — Z is discarded (`.XY().Length()`, line 57);
- return the arithmetic mean, or **`-1`** when nothing qualified (line 64). The whole block is
  additionally gated on `log.CanCombatReplay` (line 139), leaving the C# `double` default `0`.

References:
- **commander** — `StatisticsHelper.CalculateStackCommanderPositions`
  (`GW2EIEvtcParser/EIData/Statistics/StatisticsHelper.cs:260-300`): the commanding player's **raw**
  (not active-filtered) polled positions during their commander segments, `null` where nobody is
  commanding.
- **squad centre** — `StatisticsHelper.CalculateStackCenterPositions` (same file, 201-257): per
  poll, the mean of every player's **active** position, `null` where nobody is active.

### Reproduction

`deriveDistanceScalars` in `src/main/axilogParser.ts` transcribes exactly that, from data axilog
does emit — `combatReplayData.{positions,start,down,dead,dc}` plus `combatReplayMetaData`:

- **Grid alignment.** axilog emits `positions[i]` for the i-th multiple of `pollingRate` inside
  `[start, end]` (`axilog_core::analysis::ei_replay`, "the polling grid"), so sample `i` sits at
  absolute poll index `ceil(start / pollingRate) + i`. (Note axibridge's own replay path in
  `computeDistanceToTag.ts:69` uses `floor`, a pre-existing ≤1-poll skew this derivation does not
  inherit.)
- **Active filter.** A poll is skipped when its timestamp falls inside any of the actor's
  `down`/`dead`/`dc` intervals — the three components of EI's `GetStatus`. The commander reference
  is deliberately *not* filtered, per `CalculateStackCommanderPositions`.
- **Units.** EI works in world inches; axilog's ei-json positions are map **pixels**. Dividing by
  `combatReplayMetaData.inchToPixel` recovers inches — the same conversion axibridge's existing
  replay path already performs (`computeDistanceToTag.ts:78`).
- **Sentinel.** `-1` (`NO_DISTANCE`) when there is no commander, no positions, or no
  `combatReplayMetaData` to scale with. This is EI's own sentinel and is already rejected by every
  reader: `resolveCommanderDistance` (`packages/bridge-metrics/src/dashboardMetrics.ts:29-42`)
  requires `typeof === 'number' && isFinite && >= 0`, and `computeOnTagReview.ts:50` re-checks
  inline. Reporting `-1` rather than `0` is what keeps "unknown" from masquerading as "on the tag".

Measured on the committed fixture (42 squad players): median 240 inches from the tag, the blob
between 230 and 450, and one genuine straggler at 21,860 — a plausible WvW distribution.

### Measured accuracy, and the deliberate approximations behind it

Reviewed against EI's own output: **3.7 % / 4.3 % mean error** on `distToCom` / `stackDist`. That
figure is the *sum* of the approximations below, not a floor on any one of them.

1. **The commander reference is one player's whole track, not EI's per-segment commander
   timeline.** `deriveDistanceScalars` picks the first player with `hasCommanderTag` and uses that
   actor's entire position track. EI instead builds a timeline from **every** player's
   `GetCommanderStates` (`GW2EIEvtcParser/EIData/Statistics/StatisticsHelper.cs:258-300`): segments
   are sorted by start, the reference is `null` between them, and each segment reads its own
   commander's positions. Two consequences on real logs: a tag **hand-off or relog** attributes the
   whole fight to the wrong track (axilog's ei-json exposes only a boolean `hasCommanderTag`, not
   the segment timeline, so the hand-off is invisible here), and **polls before the tag was picked
   up** are counted against a reference EI would have nulled. Fixing this needs a commander-segment
   surface from axilog — follow-up 4.
2. **The squad centre is averaged over `players[]`** (axilog's friendly roster) rather than GW2EI's
   `log.PlayerList`.
3. **Pixel-grid rounding.** The whole derivation works from axilog's exported map-pixel positions
   divided by `inchToPixel`, not from raw world coordinates.
4. **Inclusive `dc` bracket endpoints** drop a poll landing exactly on the actor's `start`/`end`
   that EI keeps — 6 of 6,894 samples (0.087 %) on the committed fixture. See `toIntervals`.

### Other reconstructions

`applyEiCompatShims` fills `players[].name` (from `character_name`), `zone` (split out of
`fightName`), `encounterDuration` (EI's `"0m 49s 285ms"` spelling, from `durationMS`) and
`timeStart`/`timeEnd` + `*Std` (from the `.zevtc` mtime, which arcdps writes at fight end, minus
`durationMS`). All four are write-if-absent, so a future axilog release that emits them natively
wins.

---

## 4. Gaps and graceful degradation

Every gap in §1 is null-guarded at the read site — the audit found no path that throws or produces
`NaN`. The user-visible consequences, worst first:

### 4.1 Per-target downs/kills — *mitigated*

axilog's `statsTargets[i][0]` carries only `totalDmg`. `buildDashboardSummaryFromDetails`
(`src/main/detailsProcessing.ts`) summed `statsTargets[*][0].downed/killed` for the enemy counters,
so under axilog it would have reported **zero enemies downed**, making
`isWin = enemyDownsDeaths > squadDownsDeaths` false on every fight the squad took a down in — a
wrong answer, not a missing one.

Mitigated at the consumer: when `statsTargets` is **populated but carries no `downed`/`killed` key
on any entry**, the summary falls back to `statsAll[0].downed` / `statsAll[0].killed`.

**Correction — these are not the same number, and an earlier draft of this report wrongly claimed
they were.** `statsAll[0].downed/killed` is the whole-fight total across every foe the player downed
or killed, **including ones not enumerated in `targets[]`** (NPCs, guards, siege). Measured on
`test-fixtures/boon/20260128-190427.json`, a real Elite Insights payload: the per-target sum is
**63** while `statsAll` totals **136**, with **18 of 55 players disagreeing**. So the fallback
over-counts enemy *players* relative to the split. It is a deliberate trade, not an equivalence: the
alternative on the axilog shape is a hard `0`, which makes `isWin` false on every fight the squad
took a single down in. For a win/loss heuristic a high-biased count beats a guaranteed-wrong one.

Both halves of the guard do work, and neither is redundant:

- **`!sawTargetSplit`** is what separates the two real shapes. Verified on real payloads: axilog's
  array is fully populated (80 entries per player on the committed fixture) but carries no split on
  any entry, while the EI fixture carries the split on every entry. A guard keyed on emptiness alone
  would be dead code on both backends and hand axilog the `0` above.
- **`statsTargets.length > 0`** closes the one path an Elite Insights payload could still reach: a
  fight that enumerated no targets at all. Substituting the ~2x-inflated `statsAll` total there
  would invent enemy downs for a fight with no enemies, so the summary reports `0` instead — the
  less-wrong answer. This costs axilog nothing, since its roster is always populated.

Together these upgrade "EI never reaches the fallback" from an empirical observation about the
payloads on hand to a structural property: EI reaches it only if it ever emits a populated target
roster with no split on any entry, which no observed payload does. That is what keeps the 63-vs-136
divergence off the default path.

Not mitigated for the per-target consumers, which degrade to 0: `combatMetrics.ts:125`'s
third-choice down-contribution source (its first choice, `statsAll[0].downContribution`, *is*
emitted, so this is inert), `computeFightDiffMode.ts:78-90`'s per-target damage split, and
`dashboardMetrics.ts:80-92`'s `againstDownedCount`/`interrupts` rollups.

### 4.2 Boon-generation attribution — degrades to zero

`selfBuffs`/`groupBuffs`/`squadBuffs` are absent, so `boonGeneration.ts:267-268` and the Stability
generation metric (`combatMetrics.ts:60-97`) produce 0 for every player. Boon **uptime** is
unaffected and exact — only the "who generated it" split is missing. Likewise
`buffUptimes[].statesPerSource` is absent, so the boon-timeline and boon-uptime-timeline views have
no per-source series.

### 4.3 Incoming-conditions and damage-mitigation analytics — degrade to empty

`targets[].buffs[].statesPerSource` gone ⇒ `conditionsMetrics.ts:307-320` returns no incoming
conditions. `targets[].totalDamageDist` gone ⇒ the enemy-skill averages behind the mitigation
calculation (`computePlayerAggregation.ts:494-509`) are empty. `targets[].powerDamage1S`/`damage1S`
gone ⇒ the incoming-strike-damage chart falls through to `players[].powerDamageTaken1S`, which is
also absent, so that chart is empty under axilog.

Note this also trips `get-log-details`' `detailsTargetsHaveBuffs` freshness probe
(`uploadHandlers.ts:151`): with >1 target and no `buffs`, a cached axilog payload always looks stale
and will be re-fetched from the dps.report permalink when one is available. That is a redundant
fetch, not a failure — and the re-fetched EI payload is strictly richer.

### 4.4 Smaller degradations

- **Incoming CC / incoming strips** (`defenses[0].receivedCrowdControl*`, `.boonStrips*`) → 0.
- **Per-ally healing / barrier** (`extHealingStats.outgoingHealingAllies`,
  `extBarrierStats.outgoingBarrierAllies`, `totalHealingDist`, `totalBarrierDist`) → 0. The
  whole-fight `outgoingHealing`/`outgoingBarrier` totals *are* emitted.
- **Minion damage taken** (`minions[]`) → the mitigation "avoided" term loses its minion component.
- **Guild auto-detection** (`guildID`) → `extractSquadGuilds` returns `[]`, so WvW matchup
  auto-detection from squad guilds is unavailable; `computeDominantGuildId` returns null.
- **Boon applications** (`boonsAppliedCount`, derived from `boonsStates`) → 0.
- **Breakbar damage** (`dpsAll[0].breakbarDamage`) → 0. Irrelevant in WvW.
- **Skill icons / auto-attack & proc classification** (`skillMap[].icon`/`.autoAttack`/`.isTraitProc`)
  → APM's auto-attack exclusion and proc filtering see every skill as a non-auto, non-proc cast.
- **Enemy profession** (`targets[].profession`) → enemy grouping falls back to name/id.

These are documented rather than faked, matching axilog's own stated policy: `ei-json` only emits
fields backed by a real computed metric.

---

## 5. Test evidence

`src/main/__tests__/axilogParser.test.ts` — 29 tests, all passing:

- **Backend selection** (2) — the default is `elite-insights`, and unset/empty/unknown values coerce
  to it; only an exact `'axilog'` opts in (`'Axilog'` and `' axilog '` do not).
- **Settings mapping** (4) — the default `EiParserSettings` maps to all five flags on; `replay`
  stays `true` regardless of `parseCombatReplay`; `computeDamageModifiers`/`rawTimelineArrays` gate
  `modifiers`/`timeseries`; `skillDamage`/`rotation` stay forced on.
- **Derived scalars** (10) — hand-placed positions verify the pixel→inch conversion, the
  `ceil(start / pollingRate)` grid alignment, the down/dead/dc active filter, the *unfiltered*
  commander reference, the squad-centre mean, and the `-1` sentinel for each of its three causes
  (no commander, no positions, no replay metadata).
- **EI-shape shims** (5) — `name` alias, `zone`/`encounterDuration` derivation, mtime-based
  timestamps, write-if-absent semantics, and survival of a missing log file.
- **Manager** (3) — unavailable-binding rejection, option forwarding + progress reporting against an
  injected fake binding, settings round-trip.
- **Real-parse integration** (5) — parses the anonymized WvW fixture (every name an `Anon<N>`
  placeholder, **no PII**) through `AxilogManager.parseLog` and asserts: a `parseLog`-shaped payload
  that satisfies
  `hasUsableFightDetails`; every flag-gated block present (`damageModMap`, `combatReplayMetaData`,
  `positions`, `totalDamageDist`, `damage1S`, `rotation`); finite, sane, non-degenerate
  `distToCom`/`stackDist` for all 42 squad players with the commander at exactly 0 and a squad
  median under 2000 inches; survival of `pruneDetailsForStats` in **both** retention modes —
  including coarse mode, where the derived scalars are the only positioning data left; and a
  dashboard summary with a non-null `isWin`.

`src/main/__tests__/detailsProcessing.test.ts` — 6 new tests pinning **both** sides of the §4.1
enemy-downs fallback, so neither backend can regress silently. This matters more than it looks,
because `statsAll` is materially larger than the per-target sum (63 vs 136): every one of these is
really a test that Elite Insights *cannot* reach the fallback.

- *EI shape* — a per-target `downed`/`killed` split wins even when `statsAll[0]` disagrees; a single
  split-bearing entry among splitless ones is enough to pin the per-target sum; and an explicit
  per-target `0`/`0` is honoured as data rather than treated as absence.
- *axilog shape* — a **populated** `statsTargets` whose entries carry only `totalDmg` (the real
  shape, ~80 entries per player) falls through to `statsAll[0]`, giving `isWin: true` on a fight the
  pre-fallback code scored as a loss.
- *Empty roster* — an empty `statsTargets` reports `0` and does **not** substitute `statsAll`,
  pinning the `statsTargets.length > 0` half of the guard.
- *Neither* — stays at `0` when no source carries the counts.

**The fixture itself is not committed.** This repo's `.gitignore:34` excludes every `*.zevtc` as a
blanket PII guard; punching a hole in that guard for one file was judged the wrong trade, so the
integration block resolves the log from `$AXILOG_FIXTURE`, then `test-fixtures/axilog/`, then a
sibling axilog checkout, and **skips itself cleanly when none exists** (verified: 24 passed,
5 skipped). `test-fixtures/axilog/README.md` documents how to supply it. Verified locally against
the real log: 29/29 passing.

**CI skipping that block is intentional, pending a repo-owner decision** on whether to carve a
narrow `.gitignore` negation for `test-fixtures/axilog/*.anon.zevtc`. Weakening a blanket PII guard
is the owner's call, not something to slip in with a feature branch — see follow-up 3.

Gates:

- `npm run typecheck` — clean.
- `npm run test:unit` — **169 files, 1416 tests, all passing** (1381 pre-existing + 29 new in
  `axilogParser.test.ts` + 6 new in `detailsProcessing.test.ts`, with the fixture present). The
  Elite Insights path's own suites (`src/main/__tests__/eiParser.test.ts`,
  `detailsProcessing.test.ts`, including its `distToCom`/`stackDist` pruning assertions) are
  otherwise unchanged and green — as they must be, since EI is still the default.
- No release, build or packaging configuration was touched; no version bump.

---

## 6. Follow-ups

Ordered by what blocks flipping the default.

1. **Close the axilog ei-json adapter gap — the one blocker.** `selfBuffs`/`groupBuffs`/`squadBuffs`,
   `buffUptimes[].statesPerSource`, `targets[].buffs`/`totalDamageDist`/`damage1S`, `minions[]` and
   `guildID` are what keep boon-generation attribution, incoming conditions, damage mitigation and
   the incoming-strike chart blank (§4.2-§4.4). When they land, flip `DEFAULT_PARSER_BACKEND` to
   `'axilog'` and update its doc comment, this section, and the summary at the top.
2. **Renderer UI for the toggle.** `parser:get-backend` / `parser:set-backend` /
   `parser:backend-changed` are wired in the main process, but nothing in the settings UI calls
   them, so opting into axilog currently means editing the store by hand. Deliberately deferred:
   with EI as the default this is an advanced-user affordance, not a shipping requirement.
3. **Decide the fixture question.** Whether to add a narrow `.gitignore` negation for
   `test-fixtures/axilog/*.anon.zevtc` so the real-parse test runs in CI. The file is verifiably
   anonymized (`Anon<N>` placeholders throughout), but it is a deliberate exception to a blanket PII
   guard and therefore a repo-owner decision.
4. **Ask axilog to emit `distToCom`/`stackDist` directly** — or, failing that, a commander-segment
   timeline. They are derived here from pixel-grid positions divided by `inchToPixel`, against a
   single-track commander reference, at a measured 3.7 % / 4.3 % mean error vs EI (§3). The largest
   known contributor is the commander approximation: axilog's ei-json exposes only a boolean
   `hasCommanderTag`, so a tag hand-off or relog cannot be followed the way EI's per-segment
   `GetCommanderStates` timeline does. Emitting the scalars from the engine is the better fix and
   deletes `deriveDistanceScalars` outright; emitting commander segments would let the derivation
   reproduce `StatisticsHelper.cs:258-300` faithfully.
5. **Ask axilog to surface a log-start timestamp.** `timeStart`/`timeEnd` are currently inferred
   from the `.zevtc` mtime minus `durationMS`, which is wrong for a copied or restored file. Only
   consulted after `uploadTime`, so the blast radius is small — but it is an approximation standing
   in for data the log itself contains.
6. **Per-target downs/kills remain unavailable** (§4.1). The `statsAll[0]` fallback fixes the
   dashboard's `isWin`, but `computeFightDiffMode`'s per-target damage split and
   `dashboardMetrics`' `againstDownedCount`/`interrupts` rollups still read 0 under axilog.
