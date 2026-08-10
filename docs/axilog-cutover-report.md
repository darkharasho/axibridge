# axilog parser cutover

axibridge parses logs in-process with
**[axilog](https://github.com/darkharasho/axilog)** (`@axiapps/axilog` 0.3.0, native Rust bindings)
instead of spawning the Elite Insights .NET CLI. Both backends are fully wired behind one
`parserBackend` setting, now surfaced in the UI at **Settings → Parser Settings → Parse Engine**.

**axilog is the default as of this change.** The first cutover left it opt-in because 30 of the
EI-JSON paths axibridge reads were not emitted, and four whole features rendered blank:
boon-generation attribution, incoming conditions, damage mitigation and the incoming-strike-damage
chart. axilog's MEIGAP and MEIGAP2 work closed all four. The re-audit in §1 — re-run against 0.3.0,
on the same anonymized fixture, through the same flag set — leaves **8 residual gaps out of 83
audited rows**, none of which produces a wrong number and all of which are null-guarded at the read
site. Of the other 75 rows, 64 carry data from axilog and 11 are absent by design with no consumer
consequence.

| | axilog (default) | Elite Insights CLI (fallback) |
|---|---|---|
| Delivery | npm dependency with prebuilt per-platform binaries | ~90 MB download at first run (`GW2EICLI.zip` + a .NET 8 runtime on Linux) into `userData/elite-insights` |
| Parse of the anonymized WvW fixture | **0.45 s**, in-process | seconds–minutes (10 min timeout) |
| External processes | none | `dotnet` child process per log |
| Update machinery | none (versioned with the app) | GitHub release polling, auto-install/update |
| Read-surface coverage | 8 residual gaps of 83 rows | no gaps |

Two things are present but **not EI-identical**, and they are the part of this document most worth
reading before trusting a number: per-skill `downContribution` and the mitigation aggregate's
`minMitigation` column. See §2.

---

## 1. Read-surface audit (re-run against axilog 0.3.0)

**Verdict: 8 of the 83 audited read-surface rows are residual gaps. Of the other 75, 64 carry data
from axilog and 11 are absent by design with no consumer consequence.** Every gap degrades to `0` / `null` / an
empty list rather than throwing — the read surface is uniformly null-guarded (`?.[0]?.field || 0`,
`Number(x ?? 0)`, `Array.isArray(...) ? ... : []`), and the metrics spec states this contract
explicitly (`src/shared/metrics-spec.md:1393-1403`, "missing fields always fall back to 0").

> **On the row count.** The original report quoted "118 paths"; that figure bundled some multi-field
> table rows and expanded others, and is not reproducible from the tables themselves. This re-audit
> counts **table rows**, one status per row, so the arithmetic below can be checked against §1.1-§1.4
> directly. It is a re-basing of the denominator, not a change in what was measured.

Method, unchanged from the original: `EiManager.parseLog` (`src/main/eiParser.ts:266-297`) reads
nothing itself — it returns the gunzipped JSON opaquely. The real consumers are, in order:
`attachConditionMetrics` → `pruneDetailsForStats` (`src/main/detailsProcessing.ts:157`) → IPC /
`dpsReportCache` → `pruneDetailsForWorker`
(`src/renderer/stats/hooks/useStatsAggregationWorker.ts:73`) → `@axiapps/bridge-metrics` +
`src/renderer/stats/*`. The declared input contract lives at `src/shared/metrics-spec.md:11-46`.
Each row below was probed against a real 0.3.0 parse of
`axilog/fixtures/wvw-small.anon.zevtc` (42 players, 80 targets) with
`{ replay, skillDamage, timeseries, rotation, modifiers }` all on — the exact option set
`mapEiSettingsToAxilogOptions` produces from the default settings — and cross-checked against the
real (PII, uncommitted) capture where anonymization could mask a value.

Legend: **E** = axilog emits it always · **F** = axilog emits it under a `ParseOptions` flag (all of
which this integration turns on) · **D** = derived in `axilogParser.ts` · **·** = absent by design,
no consumer consequence · **—** = residual gap. ✅ marks a row the first audit listed as missing.

### 1.1 Top level — 22 rows: 14 covered, 8 absent by design

| Path | axilog | Notes |
|---|---|---|
| `durationMS` | E | exact vs EI |
| `fightName` | E | `"Detailed WvW - <map>"` |
| `success` | E | |
| `recordedBy` | E | |
| `targets[]` | E | full unfiltered enemy roster — 80 entries, of which 32 `enemyPlayer` |
| `players[]` | E | |
| `skillMap` | E | scoped to referenced ids; `name`/`isSwap`/`canCrit` only |
| `buffMap` | E | 26 ids on the fixture (was 12 pre-MEIGAP) |
| `wvWMapData.{red,green,blue}TeamID` | E | |
| `combatReplayMetaData.{pollingRate,inchToPixel,sizes,maps[].url}` | F `replay` | omitted for maps GW2EI ships no image for |
| `damageModMap` | F `modifiers` | 59 ids on this fixture, text-identical to EI |
| `zone` / `mapName` / `map` / `location` | **D** | split out of `fightName` |
| `encounterDuration` | **D** | formatted from `durationMS` in EI's `"0m 49s 285ms"` spelling |
| `timeStart` / `timeStartStd` / `timeEnd` / `timeEndStd` | **D** | from the `.zevtc` mtime (fight end) minus `durationMS`; approximate, and only ever consulted after `uploadTime` |
| `uploadTime` | · | never came from EI — supplied by the dps.report upload result |
| `id` | · | `buildManifestEntry` falls back to `dev-log-N` |
| `uploadLinks` | · | dps.report concept; `computeFightBreakdown.ts:11` is `?.`-guarded |
| `personalDamageMods` | · | pure re-index of `damageModMap` + per-player arrays; axilog omits rather than fake EI's `Spec` spelling |
| `logStartOffset` | · | `Number(... \|\| 0)` |
| `detailedWvW` | · | falsy ⇒ consumers take their non-detailed branch. **Load-bearing** — see §2.2 |
| `evtc` | · | existence probe in `discord.ts:331` |
| `{red,green,blue}ShardID` | · | `wvwTeams.ts` validates numerically and skips |
| `phases`, `logErrors`, `mechanics` | n/a | pruned before any consumer; **never read** (not counted) |

### 1.2 `players[]` — 48 rows: 41 covered, 3 absent by design, 4 residual

| Path | axilog | Notes |
|---|---|---|
| `account`, `profession`, `elite_spec`, `group`, `teamID`, `notInSquad`, `hasCommanderTag`, `character_name` | E | |
| `name` | **D** | aliased from `character_name` |
| `activeTimes[0]` | E | 0.0000 % max error vs EI on the golden fixture |
| `dpsAll[0].damage`, `.dps` | E | |
| `dpsAll[0].breakbarDamage` | E ✅ | in EI units (MEIGAP2 converted them). **Field-presence only**: all 42 players read 0 on the fixture, as does `defenses[0].breakbarDamageTaken`, so the *conversion* is unverified here. Expected — breakbar is irrelevant in WvW |
| `dpsAll[0].downContribution` | · | inert: `combatMetrics.ts:99-130` reads `statsAll[0].downContribution` first, which *is* emitted |
| `statsAll[0].downContribution` | E | **arcdps methodology, not EI's — see §2.1** |
| `statsAll[0].appliedCrowdControl`, `.appliedCrowdControlDuration` | E | exact vs EI |
| `statsAll[0].downed`, `.killed` | E | whole-fight, incl. NPCs/guards/siege |
| `statsAll[0].distToCom`, `.stackDist` | **D** | see §3 |
| `statsAll[0].saved` | **—** | deferred upstream; `Number(... \|\| 0)`, and not in `dpsReportTypes` either |
| `statsAll[0]` hit-quality family (`criticalRate`/`criticalDmg`/`flankingRate`/`glanceRate`/`againstMovingRate`/`connected*`/`critableDirectDamageCount`/`againstDowned*`) | E | exact vs EI both eras |
| `defenses[0].damageTaken`, `.downCount`, `.deadCount` | E | |
| `defenses[0].blockedCount`/`evadedCount`/`dodgeCount`/`missedCount`/`interruptedCount`/`invulnedCount` | E | exact vs EI |
| `defenses[0].strike*/power*/condition*/lifeLeech*/damageBarrier*/breakbar*` | E | exact (one deliberate divergence: `lifeLeechDamageTakenCount`, where axilog is correct and EI has a known counting bug) |
| `defenses[0].receivedCrowdControl`, `.receivedCrowdControlDuration` | E ✅ | incoming CC |
| `defenses[0].boonStrips`, `.boonStripsTime` | E ✅ | incoming strips |
| `support[0].condiCleanse`, `.condiCleanseSelf`, `.boonStrips`, `.resurrects`, `.stunBreak`, `.removedStunDuration` | E | exact vs EI |
| `support[0].boonStripsTime` | E ✅ | strip duration now modelled |
| `statsTargets[i][0].totalDmg` | E | |
| `statsTargets[i][0].killed`, `.downed`, `.downContribution`, `.againstDownedCount`, `.interrupts`, `.connectedDamageCount`, `.connectedDmg` | E ✅ | the per-target split. Fixes the original audit's `isWin` problem outright — see §4.2 |
| `statsTargets[i][0]` — EI's other 30 fields (`directDmg`, `connectedDirectDamageCount`, `criticalRate`, `criticalDmg`, `flankingRate`, `glanceRate`, `missed`, `evaded`, `blocked`, `invulned`, `againstDownedDamage`, `appliedCrowdControl*`, …) | **—** | **the largest residual.** 8 of EI's 38 per-target fields are emitted. See §4.1 |
| `buffUptimes[].id`, `.buffData[0].uptime`, `.buffData[0].presence` | E | 0/444 cells over the 2 pp tolerance vs EI |
| `buffUptimes[].states`, `.statesPerSource` | E ✅ | 504/504 entries carry both |
| `selfBuffs`, `groupBuffs`, `squadBuffs` — `[].buffData[0].generation` | E ✅ | boon-generation attribution |
| `selfBuffs`, `groupBuffs`, `squadBuffs` — `[].buffData[0].wasted` | **—** | overstack/wasted generation not modelled. Generation itself is exact |
| `totalDamageDist[phase][]` (`id`/`totalDamage`/`min`/`max`/`hits`/`crit`/`flank`) | F `skillDamage` | every shared skill id exact vs the golden |
| `totalDamageDist[][].connectedHits`, `.downContribution`, `.indirectDamage`, `.glance`, `.missed`, `.evaded`, `.blocked`, `.invulned`, `.interrupted` | F ✅ | the outcome columns. `downContribution` here is arcdps-methodology — **§2.1** |
| `targetDamageDist[target][phase][]` | F `skillDamage` | 872 non-empty cells across 37/42 players |
| `targetDamageDist[][][]` outcome columns | · | carries the 7 core columns only. Benign: `computePlayerAggregation.ts:1166-1200` reconciles hits and down-contribution from `totalDamageDist` by delta, so the per-skill totals still come out right |
| `totalDamageTaken[phase][]` | F `skillDamage` | |
| `damage1S[0]`, `damageTaken1S[0]`, `targetDamage1S[t][phase]` | F `timeseries` | cumulative, matching EI's `*1S` semantics |
| `powerDamageTaken1S`, `targetPowerDamage1S` | F ✅ | the power/condi split; unblanks the incoming-strike-damage chart |
| `dpsTargets[t][phase]` | F `timeseries` | pruned away by `PLAYER_DENY` anyway |
| `rotation[].id`, `.skills[].castTime`, `.duration` | F `rotation` | per-player cast count exact vs the golden; documented ~29 % `InstantCastEvent` scope gap |
| `damageModifiers[]`, `incomingDamageModifiers[]` | F `modifiers` | text-identical ids plus a measured, pinned residual on the rest |
| `extHealingStats.outgoingHealing`, `extBarrierStats.outgoingBarrier` | E | |
| `extHealingStats.outgoingHealingAllies`, `.totalHealingDist`, `.healing1S` | E ✅ | per-ally and per-skill healing |
| `extBarrierStats.outgoingBarrierAllies`, `.totalBarrierDist` | E ✅ | |
| `minions[]` | E ✅ | with `totalDamageTakenDist`; 15/42 players have any, which is correct (only minion-bearing specs) |
| `guildID` | E ✅ | real uppercase GUIDs on the PII capture (9 distinct guilds / 42 players). On the committed **anonymized** fixture 38/42 are zeroed and 4/42 omit the key entirely — anonymizer artifacts, not a parser gap. Both shapes are already handled: `extractSquadGuilds` skips `ZERO_GUILD_ID` and requires `typeof === 'string'`, so a guildless or absent entry is dropped rather than counted |
| `instanceID` | E ✅ | |
| `display_name` | **—** | every reader falls back to `character_name`/`name` (`computeAllDamageData.ts:207`, `computePlayerAggregation.ts:540`, …) |
| `healthPercents` | E ✅ | pruned by `PLAYER_DENY` on the stats path; replay-mode consumers now get it |
| `isFake`, `friendlyNPC` | · | absent ⇒ falsy ⇒ the entry counts as real, which is correct: axilog enumerates no synthetic actors |
| `boonsAppliedCount` (from `boonsStates`) | E ✅ | `boonsStates` is emitted for 41/42 players, so `countBoonApplications` (`detailsProcessing.ts:128`) produces a real count |
| `combatReplayData.{start,end,down,dead,dc}` | E | `down`/`dead` byte-exact vs the golden |
| `combatReplayData.{positions,orientations,iconURL}` | F `replay` | GW2EI's own pixel grid, text-exact vs two real EI exports |

### 1.3 `targets[]` — 7 rows: 6 covered, 1 residual

| Path | axilog | Notes |
|---|---|---|
| `id`, `name`, `teamID`, `enemyPlayer`, `isFake`, `instanceID` | E | `isFake` always `false` — every target is a real tracked agent |
| `profession` | **—** | axilog resolves no profession for enemies; all five readers fall back to `name`/`id` (`computeFightDiffMode.ts:98`, `computeIncomingStrikeDamageData.ts:307`, …) |
| `totalDamageDist[0][]` | E ✅ | the enemy-skill averages behind damage mitigation. 42/80 targets, incl. 31/32 `enemyPlayer` (the one omission dealt no damage) |
| `damage1S`, `powerDamage1S` | E ✅ | incoming-strike-damage chart's primary source; 80/80 targets |
| `buffs[].id`, `.statesPerSource` | E ✅ | incoming-conditions attribution; 46/80 targets |
| `dpsAll[0].damage` | E ✅ | 80/80 |
| `combatReplayData.{positions,start,down,dead}` | F `replay` | |
| `totalHealth`, `healthPercentBurned`, `defenses`, `statsAll` | n/a | declared in the `Target` interface, **never read** (not counted) |

### 1.4 Map leaves — 6 rows: 3 covered, 3 residual

| Path | axilog | Notes |
|---|---|---|
| `skillMap[s<id>].name` | E | this log's own skill table, best-effort (falls back to `"Skill <id>"`) |
| `skillMap[s<id>].icon`, `.autoAttack`, `.isTraitProc`, `.isGearProc`, `.isUnconditionalProc` | **—** | needs EI's bundled/live GW2 skill DB. APM's auto-attack exclusion and proc filtering see every skill as a non-auto, non-proc cast |
| `buffMap[b<id>].name`, `.stacking` | E | |
| `buffMap[b<id>].icon` | **—** | |
| `buffMap[b<id>].classification` | **—** | **benign**: all three readers (`computePlayerAggregation.ts:190`, `boonGeneration.ts:49`, `computeCommanderStats.ts:8`) treat a missing classification as `Boon`, which is right for axilog's boon-only map |
| `damageModMap[d<id>].{name,icon,description,nonMultiplier,isCounter,skillBased,approximate,incoming}` | F `modifiers` | all eight fields, character-identical to a real export |

### 1.5 What closed since the first audit

Of the original gap list. **Section numbers below are the *original* report's**, which this rewrite
re-numbered; forward references are to the current §4.

- **Original §4.2, boon-generation attribution** — closed. `selfBuffs`/`groupBuffs`/`squadBuffs`
  carry `generation`; `buffUptimes[].statesPerSource` carries the per-source timelines. Only
  `wasted` remains (now §4.3).
- **Original §4.3, incoming conditions, damage mitigation, incoming-strike chart** — closed.
  `targets[].buffs[].statesPerSource`, `targets[].totalDamageDist` and
  `targets[].damage1S`/`powerDamage1S` all land, as does `players[].powerDamageTaken1S`.
- **Original §4.4, smaller degradations** — 6 of 8 closed: incoming CC, incoming strips, per-ally
  healing/barrier, minions, guild auto-detection, boon applications and breakbar damage. Skill
  icons/proc flags and enemy profession remain (now §4.3).
- **Original §4.1, per-target downs/kills** — closed, and better than the mitigation it replaced.
  See §4.2 below.

Newly identified by this re-audit, not present in the original: the **`statsTargets` field-subset
residual** (§4.1) and the two methodology caveats in §2. Neither is a regression — both were true at
the first cutover too; the first audit simply did not reach them, because the fields they concern
were entirely absent back then.

---

## 2. Numbers that are present but not EI-identical

These are the failure mode the gap table cannot show: not a blank, but a different number under the
same field name. Both are documented rather than corrected, because in both cases axilog's figure is
internally correct and the divergence is a definitional one.

### 2.1 Per-skill `downContribution` is the arcdps figure, under EI's name

`downContribution` is emitted at three levels — `statsAll[0]`, `statsTargets[i][0]` and, since
MEIGAP2, per skill in `totalDamageDist[][]`. **All three are
`axilog_core::analysis::contribution`'s arcdps methodology, not GW2EI's**
(`axilog/crates/axilog-ei/src/lib.rs:199-210`). The field name is EI's; the number is not.

axilog's own calibration puts **114 of 344 shared skills** matching EI's per-skill figure exactly —
so a consumer reading a per-skill down-contribution as "EI's number" will differ **roughly two times
in three**. The scalar `statsAll[0].downContribution` carried the same divergence from the very
first cutover; MEIGAP2 did not introduce it, it extended it to a per-skill slice that axibridge
displays directly.

This is a real consumer-facing surface, not an internal detail. It reaches the UI through:

- `computeAllDamageData.ts:144-174` and `computePlayerAggregation.ts:1102/1134` — the **All Damage**
  and **Player Breakdown** per-skill tables, both of which offer a "Down Contribution" mode that
  sorts and ranks skills by this number.
- `computeSpikeDamageData.ts:154-205` / `StatsView.tsx` — the **Spike Damage** chart's
  down-contribution basis.
- `incrementalAggregation.ts:1349` — **Top Skills** by down contribution.
- `combatMetrics.ts:100-130`'s `getPlayerDownContribution`, which prefers `statsAll[0]` and so has
  been on the arcdps number all along.

Nothing degrades and nothing throws — the values are finite, non-negative and internally consistent
(the per-skill slices sum to the scalar). Rankings between skills are broadly preserved; individual
figures are not comparable to an Elite Insights export of the same log. **A UI that labels this
"Down Contribution" without qualification is making an EI claim axilog does not honour**, and that
is worth a tooltip. Filed as follow-up 1.

### 2.2 `minMitigation` is roster-shape sensitive; `totalMitigation` is not

`precomputeGlobalEnemySkillStats` (`computePlayerAggregation.ts:491-509`) folds every
`targets[].totalDamageDist[0][]` entry into one global per-skill bucket, and
`resolveGlobalEnemyStats` (line 277) derives two numbers from it:

- `avg = totalDamage / connectedHits` — a ratio of two sums, therefore **invariant** to how the
  enemy roster is partitioned. This is the term behind `totalMitigation`, the headline
  damage-mitigation figure, and it is unaffected.
- `min = minTotal / minCount`, where `minCount` increments **once per (target, skill) entry**. This
  one is not invariant.

Under Elite Insights the enemy roster is folded into a single aggregate `"Enemy Players"` target
(verified on `test-fixtures/boon/20260128-190427.json`: 55 players, `targets.length === 1`), so
`minCount` is 1 per skill and `min` is the true global minimum. axilog emits one target per real
enemy agent (80 on the fixture), so `min` becomes the **mean of the per-enemy minima**, which is
biased high. Only the `minMitigation` column (`statsMetrics.ts:81`, "Min Damage Mitigation") reads
it; `totalMitigation` and every mitigation count column are exact.

---

## 3. Settings mapping

`src/main/axilogParser.ts`'s `mapEiSettingsToAxilogOptions` translates the existing user-facing
`EiParserSettings` onto axilog's `ParseOptions`.

| `EiParserSettings` | axilog `ParseOptions` | Rationale |
|---|---|---|
| *(none — hardcoded `true`)* | `replay` | Mirrors `generateEiConf`, which hardcodes `ParseCombatReplay=True` for the same reason. Produces `combatReplayData.positions` + `combatReplayMetaData`, and is the input to the derived `distToCom`/`stackDist`. The user's `parseCombatReplay` setting means *retain the positions post-parse* and is still applied downstream by `pruneDetailsForStats` — untouched. |
| `computeDamageModifiers` | `modifiers` | Gates `damageModifiers`/`incomingDamageModifiers` **and** the top-level `damageModMap`, which doubles as `get-log-details`' cache-freshness marker (`uploadHandlers.ts:152`). |
| `rawTimelineArrays` | `timeseries` | `damage1S`/`damageTaken1S`/`targetDamage1S`/`dpsTargets` — the direct analogue of EI's own `RawTimelineArrays` conf key. |
| *(none — hardcoded `true`)* | `skillDamage` | Real EI always emits `totalDamageDist`/`targetDamageDist`/`totalDamageTaken`; axilog makes them opt-in purely for payload size. Forced on to keep the read surface identical. |
| *(none — hardcoded `true`)* | `rotation` | Same reasoning; `rotation[]` feeds skill-usage, APM and the Vindicator dodge count. |

Ignored, with no axilog counterpart: `detailledWvW`, `parsePhases`, `skipFailedTries`, `anonymous`,
`customTooShort`, `saveOutHTML`, `lightTheme`, `singleThreaded`, `memoryLimit`.

### Backend selection

The store key `parserBackend: 'axilog' | 'elite-insights'` now defaults to **`'axilog'`**.
`normalizeParserBackend` keeps its hardening, pointed the other way: only an exact
`'elite-insights'` opts out, and everything else — unset, empty, mis-cased, whitespace-padded,
unknown — coerces to the default. That inversion was re-verified against the residual gaps
specifically: each of the 8 in §1 was traced to its read site and confirmed null-guarded
(`statsAll[0].saved` → `Number(... || 0)`; the `statsTargets` subset → `Number(t[0][field] ?? 0)`;
`wasted` → the generation readers skip absent buff data; `display_name`, `targets[].profession`,
`buffMap[].classification` → all have explicit fallbacks; `skillMap` icons/flags → falsy defaults).
So a corrupt or hand-edited store lands on a backend that renders a few blank columns, never one
that throws or invents a value.

`src/main/index.ts` resolves the backend through one `getActiveParser()` helper, and
`getParserBackend()` re-reads the store on **every** call — so a change takes effect on the next
parse with no restart. `AxilogManager` mirrors `EiManager`'s shape
(`isInstalled`/`getStatus`/`get|setSettings`/`setParseProgressCallback`/`parseLog`/
`killActiveProcess`), with an inert install/update surface.

Two safety behaviours, unchanged by the flip:

- If axilog's native binding fails to load (a platform npm has no prebuilt binary for),
  `getActiveParser()` silently falls back to `EiManager`. Both the selection and the binding's real
  availability are reported over `parser:get-backend`, and the settings UI disables the axilog
  option and says so rather than letting the choice look like it took.
- The EI auto-install/auto-update machinery (`shouldAutoManageEi()`) is skipped entirely while the
  axilog backend is live. **This now applies by default**, which is the point: a fresh install no
  longer downloads a .NET runtime or the EI CLI unless the user opts into Elite Insights.

### Renderer UI

`src/renderer/SettingsView.tsx` renders a **Parse Engine** card at the top of Parser Settings — a
two-option radio group (`role="radio"` + `aria-checked`) following the existing CC/Strip Methodology
pattern, listing each engine's real consequences rather than a feature list. It reads
`parser:get-backend` on mount, writes through `parser:set-backend`, and adopts the
`parser:backend-changed` broadcast so the card shows what was actually persisted (post-normalization)
rather than what was clicked. Before the IPC resolves — and in the web build, which exposes no
parser methods at all — it falls back to rendering the shipped default as selected, so the group is
never empty. The three channels are newly exposed in `src/preload/index.ts` and typed in
`src/renderer/global.d.ts` (`IParserBackendInfo`, `ParserBackendId`); the main-process handlers
already existed.

The card carries a note that the choice applies to the next parse, with no restart, and that
existing history keeps whatever it was parsed with — which is accurate, per `getParserBackend()`
above. "No restart" is unconditional only in the axilog direction, though: the native binding ships
with the app, whereas Elite Insights may never have been downloaded, because `shouldAutoManageEi()`
is skipped while axilog is live. So when the selection is Elite Insights and `eiStatus.installed` is
false, the note adds a line pointing at the Install button directly below it.

---

## 4. Residual gaps and graceful degradation

Every gap in §1 is null-guarded at the read site — the re-audit found no path that throws or
produces `NaN`. Worst first.

### 4.1 `statsTargets`' field subset — the largest remaining gap

axilog emits 8 of the 38 fields EI puts on each `statsTargets[i][0]` entry:
`totalDmg`, `connectedDmg`, `connectedDamageCount`, `downed`, `killed`, `downContribution`,
`againstDownedCount`, `interrupts`.

`computePlayerAggregation.ts:974-993` routes `OFFENSE_METRICS` by declared `source`, and 15 of them
declare `source: 'statsTargets'` without an axilog counterpart. Under axilog those columns of the
**Offense Detailed** table read `0`:

`directDmg`, `connectedDirectDamageCount`, `criticalRate`, `criticalDmg`, `flankingRate`,
`glanceRate`, `missed`, `evaded`, `blocked`, `invulned`, `againstDownedDamage`,
`appliedCrowdControl`, `appliedCrowdControlDuration`, `appliedCrowdControlDownContribution`,
`appliedCrowdControlDurationDownContribution`.

The frustrating part is that **8 of these 15 already exist**, whole-fight, on `statsAll[0]` — which
axilog emits in full, and which the same table reads for other metrics. They are blank only because
the metric definitions point at `statsTargets`. Verified field-by-field against a live 0.3.0
payload:

- **On `statsAll[0]`, recoverable without touching the parser (8):**
  `connectedDirectDamageCount`, `criticalRate`, `criticalDmg`, `flankingRate`, `glanceRate`,
  `againstDownedDamage`, `appliedCrowdControl`, `appliedCrowdControlDuration`.
- **Not on `statsAll[0]` either — genuinely needs axilog (7):** `directDmg` (axilog spells the
  nearest thing `connectedDirectDmg`, which is not the same quantity), `missed`, `evaded`,
  `blocked`, `invulned`, `appliedCrowdControlDownContribution`,
  `appliedCrowdControlDurationDownContribution`.

This is structural rather than a missing computation: EI folds the enemy roster into one aggregate
`"Enemy Players"` target, so for EI "per-target" and "whole-fight" coincide and sourcing from
`statsTargets` costs nothing; axilog emits one entry per real enemy, so the two genuinely differ.
Closing it means either axilog filling the per-target stat set, or `OFFENSE_METRICS` gaining a
`statsAll` fallback for the 8 above. Follow-up 2.

`downed`/`killed`/`downContribution`/`interrupts` are unaffected — those are among the 8 emitted.

### 4.2 Per-target downs/kills — closed, and the fallback is no longer reached

The original report's §4.1 described a mitigation in `buildDashboardSummaryFromDetails`: when
`statsTargets` was populated but carried no `downed`/`killed` on any entry (axilog's old shape), the
enemy counters fell back to `statsAll[0].downed`/`.killed`. That fallback was explicitly a
high-biased trade — `statsAll` counts every foe including NPCs, guards and siege (measured on a real
EI payload: per-target sum 63 vs `statsAll` 136, 18 of 55 players disagreeing) — accepted only
because the alternative was a hard `0` that made `isWin` false on every fight the squad took a down
in.

**axilog 0.3.0 emits the split, so `sawTargetSplit` is now true and the fallback is not reached.**
The dashboard takes the same branch as Elite Insights. On the fixture the split totals 25 enemy
downs+kills against `statsAll`'s 49 — the fallback would have roughly doubled the count, so this is
a straight accuracy win, not just a tidier code path.

The guard stays exactly as it was, and both halves still earn their place: it now covers only older
cached axilog payloads and the empty-roster EI case. `axilogParser.test.ts` pins the new behaviour
(the split is present, and its total is strictly below the `statsAll` total), and
`detailsProcessing.test.ts`'s 6 tests still pin both sides of the guard itself.

Still degrading to `0` for per-target consumers: `computeFightDiffMode.ts:78-90`'s per-target damage
split labels (which need `targets[].profession`, §4.3), and `dashboardMetrics.ts:80-92`'s
`againstDownedCount`/`interrupts` rollups where they read fields outside the emitted 8.

### 4.3 Smaller degradations

- **Boon overstack** (`selfBuffs`/`groupBuffs`/`squadBuffs` `[].buffData[0].wasted`) → 0. Generation
  itself is exact and complete; only the wasted/overstack split is missing, so "how much boon did
  they put out" is right and "how much of it was wasted" is blank.
- **`statsAll[0].saved`** → 0. Deferred upstream; not in `dpsReportTypes` either.
- **Enemy profession** (`targets[].profession`) → enemy grouping and the incoming-strike-damage
  legend fall back to name/id, which for `enemyPlayer` targets is the (anonymized or real) character
  name rather than a class.
- **Skill icons / auto-attack & proc classification** (`skillMap[].icon`/`.autoAttack`/
  `.isTraitProc`) → APM's auto-attack exclusion and proc filtering see every skill as a non-auto,
  non-proc cast. Needs EI's bundled GW2 skill DB.
- **`buffMap[].icon`** → boon icons fall back to text labels. `.classification` is absent too but
  benign (all readers default to `Boon`, correct for a boon-only map).
- **`players[].display_name`** → every reader falls back to `character_name`.

These are documented rather than faked, matching axilog's own stated policy: `ei-json` only emits
fields backed by a real computed metric.

### 4.4 One cache interaction worth knowing

`get-log-details`' `detailsTargetsHaveBuffs` freshness probe (`uploadHandlers.ts:151`) checks for
>1 target with `buffs`. axilog now emits `buffs` on 46/80 targets, so cached axilog payloads
**no longer** always look stale — the redundant dps.report re-fetch the original report described is
gone.

---

## 5. Derived scalars: `distToCom` / `stackDist`

Still derived — axilog does not emit them, and they remain the entire basis of the Closest-to-Tag
metric plus the coarse-mode positioning path. Unchanged by this cutover; recorded here in full
because the derivation is the one place axibridge computes an EI statistic itself.

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

`deriveDistanceScalars` transcribes exactly that, from `combatReplayData.{positions,start,down,dead,
dc}` plus `combatReplayMetaData`:

- **Grid alignment.** axilog emits `positions[i]` for the i-th multiple of `pollingRate` inside
  `[start, end]`, so sample `i` sits at absolute poll index `ceil(start / pollingRate) + i`. (Note
  axibridge's own replay path in `computeDistanceToTag.ts:69` uses `floor`, a pre-existing ≤1-poll
  skew this derivation does not inherit.)
- **Active filter.** A poll is skipped when its timestamp falls inside any of the actor's
  `down`/`dead`/`dc` intervals. The commander reference is deliberately *not* filtered, per
  `CalculateStackCommanderPositions`.
- **Units.** EI works in world inches; axilog's positions are map **pixels**. Dividing by
  `combatReplayMetaData.inchToPixel` recovers inches — the same conversion
  `computeDistanceToTag.ts:78` already performs.
- **Sentinel.** `-1` (`NO_DISTANCE`) when there is no commander, no positions, or no
  `combatReplayMetaData`. This is EI's own sentinel and is already rejected by every reader:
  `resolveCommanderDistance` (`packages/bridge-metrics/src/dashboardMetrics.ts:29-42`) requires
  `typeof === 'number' && isFinite && >= 0`, and `computeOnTagReview.ts:50` re-checks inline.

Measured on the committed fixture (42 squad players): median 240 inches from the tag, the blob
between 230 and 450, one genuine straggler at 21,860.

### Measured accuracy, and the deliberate approximations behind it

Reviewed against EI's own output: **3.7 % / 4.3 % mean error** on `distToCom` / `stackDist` — the
*sum* of the approximations below, not a floor on any one.

1. **The commander reference is one player's whole track, not EI's per-segment commander timeline.**
   `deriveDistanceScalars` picks the first player with `hasCommanderTag` and uses that actor's entire
   position track. EI builds a timeline from **every** player's `GetCommanderStates`
   (`StatisticsHelper.cs:258-300`). So a tag **hand-off or relog** attributes the whole fight to one
   track, and **polls before the tag was picked up** are counted against a reference EI would have
   nulled. axilog's ei-json exposes only a boolean `hasCommanderTag`. Follow-up 4.
2. **The squad centre is averaged over `players[]`** rather than GW2EI's `log.PlayerList`.
3. **Pixel-grid rounding**, from exported map-pixel positions divided by `inchToPixel`.
4. **Inclusive `dc` bracket endpoints** drop a poll landing exactly on the actor's `start`/`end`
   that EI keeps — 6 of 6,894 samples (0.087 %). See `toIntervals`.

### Other reconstructions

`applyEiCompatShims` fills `players[].name` (from `character_name`), `zone` (split out of
`fightName`), `encounterDuration` (from `durationMS`) and `timeStart`/`timeEnd` + `*Std` (from the
`.zevtc` mtime minus `durationMS`). All four are write-if-absent, so a future axilog release that
emits them natively wins.

---

## 6. Test evidence

`src/main/__tests__/axilogParser.test.ts` — **32 tests**:

- **Backend selection** (2) — the default is now `axilog`, and unset/empty/unknown values coerce to
  it; only an exact `'elite-insights'` opts out (`'Elite-Insights'`, `' elite-insights '` and
  `'eliteinsights'` do not).
- **Settings mapping** (4), **derived scalars** (10), **EI-shape shims** (5), **manager** (3) —
  unchanged from the first cutover.
- **Real-parse integration** (8, was 5) — parses the anonymized WvW fixture through
  `AxilogManager.parseLog` and asserts a `parseLog`-shaped payload satisfying
  `hasUsableFightDetails`; every flag-gated block present; finite, sane `distToCom`/`stackDist` for
  all 42 squad players; survival of `pruneDetailsForStats` in both retention modes; a dashboard
  summary with a non-null `isWin`. Three are new:
  - *the per-target split is taken, not the fallback* — pins §4.2, including that the split total is
    strictly below the `statsAll` total, so a regression to the high-biased path fails loudly;
  - *every MEIGAP/MEIGAP2 block is present* — one assertion per gap the original audit called
    blocking, so a silent upstream regression becomes a test failure rather than a blank panel;
  - *the documented residuals are still absent* — the inverse pin. If axilog starts emitting
    `wasted`, `saved`, `targets[].profession`, skill icons or buff classification, this fails and the
    report gets updated rather than quietly going stale.

`src/renderer/__tests__/SettingsView.test.tsx` — **7 new tests** for the Parse Engine card: it
reflects the persisted backend, defaults to axilog, persists a switch over `setParserBackend` and
updates the selection, does not re-send IPC when the already-selected engine is clicked, disables
axilog with an explanation when the native binding is unavailable (and refuses to send), renders the
default when the host exposes no parser API at all (the web build), and adopts a
`parser:backend-changed` broadcast.

`src/main/__tests__/detailsProcessing.test.ts` — the 6 existing tests pinning both sides of the
enemy-downs fallback are unchanged and still green. They now guard a path axilog no longer takes,
which is exactly what they were written for.

**The fixture itself is not committed.** `.gitignore:34` excludes every `*.zevtc` as a blanket PII
guard. The integration block resolves the log from `$AXILOG_FIXTURE`, then `test-fixtures/axilog/`,
then a sibling axilog checkout, and **skips itself cleanly when none exists**.
`test-fixtures/axilog/README.md` documents how to supply it. CI skipping that block remains
intentional pending a repo-owner decision — follow-up 3.

Gates:

- `npm run typecheck` — clean.
- `npm run test:unit` — all green.
- No release, build or packaging configuration was touched.

---

## 7. Follow-ups

1. **Qualify per-skill "Down Contribution" in the UI.** §2.1: the number is arcdps methodology under
   EI's field name, matching EI on ~114 of 344 shared skills. The All Damage, Player Breakdown, Spike
   Damage and Top Skills surfaces all display or rank by it unqualified. A tooltip naming the
   methodology costs nothing and stops the app making a claim it does not honour. This is the highest
   -value item on the list precisely because nothing looks broken.
2. **Close the `statsTargets` field-subset gap** (§4.1) — 15 Offense Detailed columns read 0. Two
   viable fixes: axilog fills the per-target stat set, or `OFFENSE_METRICS` gains a `statsAll`
   fallback for the metrics whose whole-fight equivalent already exists there. The second is entirely
   within axibridge and would fix **8 of the 15** without touching the parser (the list is in §4.1);
   the remaining 7 need axilog either way.
3. **Decide the fixture question.** Whether to add a narrow `.gitignore` negation for
   `test-fixtures/axilog/*.anon.zevtc` so the real-parse tests run in CI. Now that those tests pin
   the closed surface *and* the residuals, CI running them is worth more than it was. Still a
   repo-owner call: it is a deliberate exception to a blanket PII guard.
4. **Ask axilog to emit `distToCom`/`stackDist` directly** — or a commander-segment timeline. §5's
   3.7 % / 4.3 % mean error is dominated by the single-track commander approximation. Emitting the
   scalars from the engine deletes `deriveDistanceScalars` outright.
5. **Ask axilog for `wasted` boon generation** (§4.3) and a **log-start timestamp**. The latter would
   replace the `.zevtc`-mtime inference in `applyEiCompatShims`, which is wrong for a copied or
   restored file (small blast radius: only consulted after `uploadTime`).
6. **`minMitigation` roster-shape sensitivity** (§2.2). Either have axilog expose a true per-skill
   global minimum, or compute the column from a min-of-mins rather than a mean-of-mins in
   `resolveGlobalEnemyStats`. The second is a one-line change in axibridge and is probably the right
   answer; it needs a decision on what the column is meant to mean.
7. **Enemy profession and skill/buff icons** (§4.3) — both need a GW2 skill/spec database axilog does
   not carry. Lowest priority: cosmetic, with working fallbacks.
