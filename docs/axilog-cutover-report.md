# axilog parser cutover

axibridge can parse logs in-process with
**[axilog](https://github.com/darkharasho/axilog)** (`@axiapps/axilog` 0.3.2, native Rust bindings)
instead of spawning the Elite Insights .NET CLI. Both backends are fully wired behind one
`parserBackend` setting, surfaced in the UI at **Settings → Parser Settings → Parse Engine**.

**Status: owner-gated, default `elite-insights`.** axilog is *capability complete* — what it is
waiting on is a repo-owner go, not more engineering. The first cutover left it opt-in because 30 of
the EI-JSON paths axibridge reads were not emitted, and four whole features rendered blank:
boon-generation attribution, incoming conditions, damage mitigation and the incoming-strike-damage
chart. axilog's MEIGAP and MEIGAP2 work closed all four. The re-audit in §1 — re-run against 0.3.2,
on the same anonymized fixture, through the same flag set — leaves **5 residual gaps out of 83
audited rows**, none of which produces a wrong number and all of which are null-guarded at the read
site. Of the other 78 rows, 67 carry data from axilog and 11 are absent by design with no consumer
consequence.

> **Updated for 0.3.2** (was 0.3.0, 8 residuals). The bump closed three documented gaps —
> `statsAll[0].saved`, boon-overstack `wasted` and `targets[].profession` — and fixed a roster bug
> that was producing two **wrong numbers**, not blanks: squad-side pets, spirits, banners, conjures
> and food were being enumerated as enemy targets. See §1.6.

Flipping the default is a change to `DEFAULT_PARSER_BACKEND` in `src/main/axilogParser.ts`, plus
its pinning assertion in `axilogParser.test.ts`, plus **one mirror**:
`SHIPPED_DEFAULT_BACKEND` in `src/renderer/SettingsView.tsx`, which exists because the renderer
cannot import from the main process at runtime. That mirror is the one place an engine is hardcoded
twice, so it has a drift guard — `SettingsView.test.tsx`'s web-build case asserts the rendered
default against the imported `DEFAULT_PARSER_BACKEND` rather than a literal, and fails if a flip
misses the mirror. Everything else reads the default or is written default-neutral: the EI
auto-install stand-down, the radio-group ordering, and the walkthrough copy.

| | axilog (opt-in) | Elite Insights CLI (default) |
|---|---|---|
| Delivery | npm dependency with prebuilt per-platform binaries | ~90 MB download at first run (`GW2EICLI.zip` + a .NET 8 runtime on Linux) into `userData/elite-insights` |
| Parse of the anonymized WvW fixture | **0.45 s**, in-process | seconds–minutes (10 min timeout) |
| External processes | none | `dotnet` child process per log |
| Update machinery | none (versioned with the app) | GitHub release polling, auto-install/update |
| Read-surface coverage | 5 residual gaps of 83 rows | no gaps |

Two things are present but **not EI-identical**, and they are the part of this document most worth
reading before trusting a number: per-skill `downContribution` and the mitigation aggregate's
`minMitigation` column. See §2.

---

## 1. Read-surface audit (re-run against axilog 0.3.2)

**Verdict: 5 of the 83 audited read-surface rows are residual gaps. Of the other 78, 67 carry data
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
Each row below was probed against a real 0.3.2 parse of
`axilog/fixtures/wvw-small.anon.zevtc` (42 players, 32 targets — all of them real enemy players
since 0.3.2; see §1.6) with
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

### 1.2 `players[]` — 48 rows: 43 covered, 3 absent by design, 2 residual

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
| `statsAll[0].distToCom`, `.stackDist` | **A** ✅ | never emitted by `to_ei_json`, and no longer needed: unit 3 reads `blocks.replay.by_entity[].{dist_to_com,stack_dist}` in world inches. See §5. |
| `statsAll[0].saved` | E ✅ | closed in 0.3.2; 37/42 players non-zero on the fixture. Still not in `dpsReportTypes`, so the read stays `Number(... \|\| 0)` |
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
| `statsTargets[i][0]` — EI's other 30 fields (`directDmg`, `connectedDirectDamageCount`, `criticalRate`, `criticalDmg`, `flankingRate`, `glanceRate`, `missed`, `evaded`, `blocked`, `invulned`, `againstDownedDamage`, `appliedCrowdControl*`, …) | **—** | **the largest residual.** 8 of EI's 38 per-target fields are emitted; 8 of the 15 affected Offense Detailed columns now take a whole-fight `statsAll[0]` fallback, leaving 7 blank. See §4.1 |
| `buffUptimes[].id`, `.buffData[0].uptime`, `.buffData[0].presence` | E | 0/444 cells over the 2 pp tolerance vs EI |
| `buffUptimes[].states`, `.statesPerSource` | E ✅ | 504/504 entries carry both |
| `selfBuffs`, `groupBuffs`, `squadBuffs` — `[].buffData[0].generation` | E ✅ | boon-generation attribution |
| `selfBuffs`, `groupBuffs`, `squadBuffs` — `[].buffData[0].wasted` | E ✅ | closed in 0.3.2; 524 of 908 cells non-zero on the fixture. Overstack attribution is no longer blank |
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

### 1.3 `targets[]` — 7 rows: 7 covered, 0 residual

| Path | axilog | Notes |
|---|---|---|
| `id`, `name`, `teamID`, `enemyPlayer`, `isFake`, `instanceID` | E | `isFake` always `false` — every target is a real tracked agent |
| `profession` | E ✅ | closed in 0.3.2; 32/32 enemies resolve a class, elite spec folded into the field EI-style (`"Harbinger"`, `"Dragonhunter"`, `"Luminary"`). The five `name`/`id` fallbacks (`computeFightDiffMode.ts:98`, `computeIncomingStrikeDamageData.ts:307`, …) stay as guards but are no longer the live path |
| `totalDamageDist[0][]` | E ✅ | the enemy-skill averages behind damage mitigation. 31/32 targets (the one omission dealt no damage) |
| `damage1S`, `powerDamage1S` | E ✅ | incoming-strike-damage chart's primary source; 32/32 targets |
| `buffs[].id`, `.statesPerSource` | E ✅ | incoming-conditions attribution; 31/32 targets |
| `dpsAll[0].damage` | E ✅ | 32/32 |
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

### 1.6 What the 0.3.0 → 0.3.2 bump changed

Three of the eight residuals closed — `statsAll[0].saved`, boon-overstack `wasted`, and
`targets[].profession`. Only the last is in axilog's release notes; the first two shipped silently in
0.3.1, which has no notes at all. All three were re-probed on the same fixture and carry real values,
not just keys: `saved` is non-zero for 37/42 players, `wasted` for 524 of 908 buff cells, and
`profession` resolves for 32/32 enemies.

The fourth change is not a gap closing and matters more, because it was producing **wrong numbers
rather than blanks**. 0.3.0 enumerated squad-side entities as enemy targets: of its 80 `targets[]`
entries, **48 were friendly** — 15 ranger pets (`Juvenile Brown Bear`, `Juvenile Siege Turtle`, …),
7 spirits, 8 Ventari `Tablet` instances, `Blood Fiend`, `Continuum Rift`, `Black Hole`,
`Function Gyro`, `Binding Roots`, warrior and guild banners, and three plates of food. 0.3.2 emits
32, all of them real `enemyPlayer` agents, and the 32 enemy ids are identical across both versions —
so nothing was lost, only pollution removed. Two consumer-visible consequences:

- **Damage mitigation.** `precomputeGlobalEnemySkillStats` (`computePlayerAggregation.ts:491-509`)
  folds every `targets[].totalDamageDist[0][]` entry into one global per-skill bucket. Under 0.3.0,
  11 friendly minions carried a damage distribution, contributing 14 skill ids and 3,029 damage of
  *squad pet* output into the buckets behind "what enemy skills hit us". Now gone.
- **Enemy downs/kills.** The per-target split summed 25 on this fixture under 0.3.0; it sums **15**
  under 0.3.2. The entire difference is 10 downs credited against squad members' own pets —
  `Juvenile Brown Bear` ×4, `Juvenile Polar Bear` ×2, `Blood Fiend`, `Function Gyro`,
  `Juvenile Black Bear`, `Juvenile Siege Turtle` — each counted as an *enemy* down. Every one of the
  32 real enemy targets carries byte-identical downs/kills across the two versions, so 15 is the
  correct figure and 0.3.0's 25 was inflating enemy downs by 67 %. §4.2's numbers are updated
  accordingly.

`statsTargets[]` and `targetDamageDist[]` are positionally indexed against `targets[]`, and both
shrank in lockstep (80 → 32), so index alignment holds and no per-target read misattributes. That
invariant is now pinned by a test rather than left to inspection — see §6.

This also reduces, but does not remove, §2.2's `minMitigation` roster-shape sensitivity: the
per-skill `minCount` now spans 32 buckets instead of 80, against EI's 1. The column is still biased
high, and follow-up 6 still stands.

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
| *(none — hardcoded `true`)* | `replay` | Mirrors `generateEiConf`, which hardcodes `ParseCombatReplay=True` for the same reason. Since unit 3 it gates `blocks.replay.tracks` (the self-timestamped world-inch samples) and the in-core `dist_to_com`/`stack_dist` pass. Note the interval half of `blocks.replay` is computed on **every** parse, so `coverage.replay === "present"` does **not** imply positions exist — only this flag does. The user's `parseCombatReplay` setting means *retain the samples post-parse* and is applied downstream by `pruneDetailsForStats`, which since unit 3 drops **both** EI's `positions` and native's `tracks`. |
| `computeDamageModifiers` | `modifiers` | Gates `damageModifiers`/`incomingDamageModifiers` **and** the top-level `damageModMap`, which doubles as `get-log-details`' cache-freshness marker (`uploadHandlers.ts:152`). |
| `rawTimelineArrays` | `timeseries` | `damage1S`/`damageTaken1S`/`targetDamage1S`/`dpsTargets` — the direct analogue of EI's own `RawTimelineArrays` conf key. |
| *(none — hardcoded `true`)* | `skillDamage` | Real EI always emits `totalDamageDist`/`targetDamageDist`/`totalDamageTaken`; axilog makes them opt-in purely for payload size. Forced on to keep the read surface identical. |
| *(none — hardcoded `true`)* | `rotation` | Same reasoning; `rotation[]` feeds skill-usage, APM and the Vindicator dodge count. |

Ignored, with no axilog counterpart: `detailledWvW`, `parsePhases`, `skipFailedTries`, `anonymous`,
`customTooShort`, `saveOutHTML`, `lightTheme`, `singleThreaded`, `memoryLimit`.

### Backend selection

The store key `parserBackend: 'axilog' | 'elite-insights'` defaults to **`'elite-insights'`** —
the axilog flip is owner-gated, not blocked. `normalizeParserBackend` honours only the two exact
ids; everything else — unset, empty, mis-cased, whitespace-padded, unknown — coerces to
`DEFAULT_PARSER_BACKEND`, so a corrupt or hand-edited store can never land a user on an engine they
did not pick. The hardening is written symmetrically on purpose: it does the right thing whichever
way the default points, so flipping it stays a one-line change.

The flip was audited against the residual gaps specifically, and that audit stands: each of the 8 in
§1 was traced to its read site and confirmed null-guarded (`statsAll[0].saved` →
`Number(... || 0)`; the `statsTargets` subset → `Number(t[0][field] ?? 0)`, and 8 of its 15 blank
columns now take the `statsAll` fallback in §4.1 instead; `wasted` → the generation readers skip
absent buff data; `display_name`, `targets[].profession`, `buffMap[].classification` → all have
explicit fallbacks; `skillMap` icons/flags → falsy defaults). Under axilog the worst case is a few
blank columns, never a throw or an invented value.

`src/main/index.ts` resolves the backend through one `getActiveParser()` helper, and
`getParserBackend()` re-reads the store on **every** call — so a change takes effect on the next
parse with no restart. `AxilogManager` mirrors `EiManager`'s shape
(`isInstalled`/`getStatus`/`get|setSettings`/`setParseProgressCallback`/`parseLog`/
`killActiveProcess`), with an inert install/update surface.

Two safety behaviours:

- If axilog's native binding fails to load (a platform npm has no prebuilt binary for),
  `getActiveParser()` silently falls back to `EiManager`. Both the selection and the binding's real
  availability are reported over `parser:get-backend`, and the settings UI disables the axilog
  option and says so rather than letting the choice look like it took.
- The EI auto-install/auto-update machinery (`shouldAutoManageEi()`) is skipped entirely while the
  axilog backend is *selected and available*. Under the current EI default that means a fresh
  install downloads and auto-manages the EI CLI exactly as it always has; a user who opts into
  axilog stops paying for a ~90 MB download they no longer use. Flipping the default would extend
  the second case to fresh installs, which is much of the point of flipping it.

### Renderer UI

`src/renderer/SettingsView.tsx` renders a **Parse Engine** card at the top of Parser Settings — a
two-option radio group (`role="radio"` + `aria-checked`), Elite Insights first, following the
existing CC/Strip Methodology
pattern, listing each engine's real consequences rather than a feature list. It reads
`parser:get-backend` on mount, writes through `parser:set-backend`, and adopts the
`parser:backend-changed` broadcast so the card shows what was actually persisted (post-normalization)
rather than what was clicked. Before the IPC resolves — and in the web build, which exposes no
parser methods at all — it falls back to rendering the shipped default as selected
(`SHIPPED_DEFAULT_BACKEND`, a hand-kept renderer-side mirror of `DEFAULT_PARSER_BACKEND`, since the
renderer cannot import from the main process), so the group is never empty. The three channels are newly exposed in `src/preload/index.ts` and typed in
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

### 4.1 `statsTargets`' field subset — 15 blank columns, now 7

axilog emits 8 of the 38 fields EI puts on each `statsTargets[i][0]` entry:
`totalDmg`, `connectedDmg`, `connectedDamageCount`, `downed`, `killed`, `downContribution`,
`againstDownedCount`, `interrupts`.

`computePlayerAggregation.ts` routes `OFFENSE_METRICS` by declared `source`, and 15 of them declare
`source: 'statsTargets'` without an axilog counterpart. Those 15 columns of the **Offense Detailed**
table used to read `0` under axilog. **8 of them now fall back to the whole-fight `statsAll[0]`
figure; 7 remain blank.**

- **Filled from `statsAll[0]` (8):** `connectedDirectDamageCount`, `criticalRate`, `criticalDmg`,
  `flankingRate`, `glanceRate`, `againstDownedDamage`, `appliedCrowdControl`,
  `appliedCrowdControlDuration`. Each was verified present field-by-field on a live payload, first on
  0.3.0 and re-verified on 0.3.2.
  The three rates bring their denominators with them — `critableDirectDamageCount` for
  `criticalRate`, `connectedDirectDamageCount` for `flankingRate`/`glanceRate` — so numerator and
  denominator always come from the same scope and a ratio is never mixed.
- **Still blank — genuinely needs axilog (7):** `directDmg` (axilog spells the nearest thing
  `connectedDirectDmg`, which is not the same quantity), `missed`, `evaded`, `blocked`, `invulned`,
  `appliedCrowdControlDownContribution`, `appliedCrowdControlDurationDownContribution`. None exists
  on `statsAll[0]` either, and none is faked from a near-miss field.

`downed`/`killed`/`downContribution`/`interrupts` were never affected — those are among the 8 axilog
emits per target.

#### Why the substitution is sound, and where it stops being sound

A whole-fight number standing in where a per-target one was asked for is only correct if the
consumer wanted *every* target. It does here, and that is a property of the code, not an assumption:

- the sole consumer of the `source: 'statsTargets'` branch is `computePlayerAggregation.ts`'s
  `offenseTotals`/`offenseRateWeights` rollup, which sums `p.statsTargets` with **no target
  predicate at all**;
- nothing upstream filters `statsTargets` on the way into that rollup. The Offense Detailed table,
  the comparison view and `reportMetrics` all read the same all-targets result.

Per-target filtering *does* exist elsewhere — `discord.ts:232` and `ExpandableLogCard.tsx:533` both
index-filter `statsTargets` by `targetIndexTeamId` — but neither reads `OFFENSE_METRICS`, so neither
is downstream of this. So *for these columns* "summed over every target" and "whole fight" denote
the same scope, and the substitution changes only whether the cell is blank. **The boundary: if a
per-target or per-enemy filter is ever introduced over these columns, or over the `offenseTotals`
rollup, the fallback must not be applied inside it** — it would report whole-fight figures under a
filtered heading. That caveat is recorded on `OFFENSE_METRICS_STATS_ALL_FALLBACK` in
`packages/bridge-metrics/src/statsMetrics.ts`, next to the list itself.

#### Two guards, both load-bearing

`sawField` — the trigger is **field presence, never value**. A summed `0` can mean "no criticals
landed", which must stay `0`; only "no `statsTargets` entry carries this key at all" selects the
fallback. EI emits the full 38-field set with zeroes included, so a value-triggered version would
have quietly inflated real EI zeroes — its `statsAll` counts NPCs, guards and siege while its
aggregate `"Enemy Players"` target does not.

`sawTarget` — there must be a **populated per-target entry** to have been silent about. An empty or
absent `statsTargets` is not axilog's field-subset shape; it is a fight with no tracked target
roster, and substituting there would swap in those same NPC/guard/siege-inclusive whole-fight
numbers with nothing to justify them. This is the identical failure mode
`detailsProcessing.ts:238-262` already guards for enemy downs/kills, where the divergence was
measured on a real EI payload at 63 per-target vs 136 `statsAll`. The guard costs axilog nothing —
its roster is always populated.

Together the two make the fallback unreachable on an EI payload that carries a roster, and inert on
one that does not.

The underlying cause is structural rather than a missing computation: EI folds the enemy roster into
one aggregate `"Enemy Players"` target, so for EI "per-target" and "whole-fight" coincide and
sourcing from `statsTargets` costs nothing; axilog emits one entry per real enemy, so the two
genuinely differ. Fully closing it still needs axilog to fill the per-target stat set — follow-up 2,
now scoped to the remaining 7.

Tests: `src/renderer/stats/__tests__/offenseStatsAllFallback.test.ts` (11), covering both backends
and both guards — the axilog shape filling all 8 (once, not once per target) with matched rate
denominators and the 7 staying blank; the EI shape leaving genuine per-target zeroes alone; and an
empty, absent or wholly unpopulated `statsTargets` getting no substitution at all.

### 4.2 Per-target downs/kills — closed, and the fallback is no longer reached

The original report's §4.1 described a mitigation in `buildDashboardSummaryFromDetails`: when
`statsTargets` was populated but carried no `downed`/`killed` on any entry (axilog's old shape), the
enemy counters fell back to `statsAll[0].downed`/`.killed`. That fallback was explicitly a
high-biased trade — `statsAll` counts every foe including NPCs, guards and siege (measured on a real
EI payload: per-target sum 63 vs `statsAll` 136, 18 of 55 players disagreeing) — accepted only
because the alternative was a hard `0` that made `isWin` false on every fight the squad took a down
in.

**axilog 0.3.0 emits the split, so `sawTargetSplit` is now true and the fallback is not reached.**
The dashboard takes the same branch as Elite Insights. On the fixture the split totals **15** enemy
downs+kills against `statsAll`'s 49 — the fallback would have more than tripled the count, so this
is a straight accuracy win, not just a tidier code path.

(That 15 was 25 under 0.3.0. The 10-count difference was downs credited against squad members' own
pets, which 0.3.0 listed as enemy targets; see §1.6. The real enemy figures are unchanged.)

The guard stays exactly as it was, and both halves still earn their place: it now covers only older
cached axilog payloads and the empty-roster EI case. `axilogParser.test.ts` pins the new behaviour
(the split is present, and its total is strictly below the `statsAll` total), and
`detailsProcessing.test.ts`'s 6 tests still pin both sides of the guard itself.

Still degrading to `0` for per-target consumers: `dashboardMetrics.ts:80-92`'s
`againstDownedCount`/`interrupts` rollups where they read fields outside the emitted 8.
`computeFightDiffMode.ts:78-90`'s per-target damage split labels were also listed here; 0.3.2's
`targets[].profession` closes that one.

### 4.3 Smaller degradations

- ~~**Boon overstack**~~, ~~**`statsAll[0].saved`**~~, ~~**enemy profession**~~ — **all three closed
  by axilog 0.3.2** (§1.6). Overstack attribution, the `saved` counter and enemy class labels now
  carry real data.
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
>1 target with `buffs`. axilog now emits `buffs` on 31/32 targets, so cached axilog payloads
**no longer** always look stale — the redundant dps.report re-fetch the original report described is
gone.

---

## 5. Distance scalars: `distToCom` / `stackDist` — reconstruction DELETED (unit 3)

**Status: closed.** axilog measures both in-core and emits them on
`blocks.replay.by_entity[id].{dist_to_com,stack_dist}`, in world inches.
`deriveDistanceScalars` is gone (`src/main/axilogParser.ts`, ~245 lines), and readers take the
native values through `getDistanceScalars` (`@axiapps/bridge-metrics/nativePositioning`).

The follow-up that tracked this section's **"3.7 % / 4.3 % mean error"** is closed, and the
breakdown is worth recording, because most of it was not the approximation we thought:

| Source of error | Share | Fate |
|---|---|---|
| EI's `inchToPixel` rounded to 3 decimals — `0.009` against a true `750/86016 = 0.0087193` | **3.12 %, systematic, every distance in the app** | Gone. Native samples are already world inches; the division is deleted, not corrected. |
| First-`hasCommanderTag`-player's whole track standing in for EI's per-segment commander timeline | the remainder | Gone. axilog computes against real `commander.segments`. |

The rounding term was the dominant one and it was **not** confined to the derived scalars: every
`hypot(pixels) / inchToPixel` in the renderer carried it, so Distance-to-Tag, On-Tag Review,
Tag-Distance Deaths and Stab Performance all read 3.12 % short. That is fixed by construction now,
not by a correction factor.

### The poll-offset off-by-one, also deleted

axilog emits `positions[i]` for the i-th multiple of `pollingRate` falling **inside**
`[start, end]`, so sample `i` sits at absolute poll `ceil(start / pollingRate) + i`. Verified
directly against the committed fixture at 0.3.5: an actor with `start_ms = 3` has its first sample
at `t = 300`, where `floor` would say `0`.

Only `movementData.ts` and the parser's own `readTrack` used `ceil`. **Five call sites used
`floor`** — `positioning.ts` (5 loops), `computeDistanceToTag.ts:70`, `computeOnTagReview.ts:90`,
`computeTagDistanceDeaths.ts:77`, `computeStabPerformance.ts:106,177` — so those tracks were
compared against a tag position from a different 300 ms tick. **36 of 42 players (86 %) on the
committed fixture have a `start` that is not a multiple of the poll rate**, so this was the common
case, not an edge case.

Native samples are `[t_ms, x, y]`. There is no index to derive, so the bug class is eliminated
structurally rather than fixed in five places.

### EI semantics (retained for reference)

The behaviour axilog now reproduces in-core, verified against GW2EI source:
`JsonStatisticsBuilder.cs:153-154` maps `StackDist = gameStats.DistanceToCenterOfSquad` and
`DistToCom = gameStats.DistanceToCommander`, both from
`GameplayStatistics.cs:140-141` via `GetDistanceToTarget` (lines 29-69): iterate the actor's
**active** polled positions (nulling every poll spent down, dead or disconnected), pair each with
the reference at the **same poll timestamp**, take the **XY-plane** length (Z discarded), and
return the mean or **`-1`** when nothing qualified. `NO_DISTANCE = -1` is preserved verbatim by
axilog and still rejected by every reader.

### Carry-set and payload

The carry-set gained `blocks.replay` and `CARRIED_KEYS` became `CARRIED_PATHS` (dotted paths), so
`blocks` can hold `replay` and nothing else. Measured on `wvw-small.anon.zevtc`:

| | Size |
|---|---|
| Full native report | 2441.5 KB |
| Carry-set, units 1+2 | 22.8 KB |
| Carry-set, unit 3 | **313.3 KB** |
| — of which `tracks` | 284.4 KB |
| — of which intervals + arena + `poll_ms` | 6.3 KB |

The 284.4 KB of tracks **replaces** EI's `combatReplayData.positions`, which the details object
already carried, so the net is roughly flat. `pruneDetailsForStats` now drops both sample surfaces
in coarse mode (`parseCombatReplay` off) and keeps the 6.3 KB — without that, coarse mode would
have been *larger* after the migration than before it.

### Oracle allowlist — two reviewed divergences

`src/test/__tests__/unit3Positioning.oracle.test.ts`:

1. **`per-instant position`** — GW2EI's `ei_replay::handle_position` freezes an actor across a
   >600 ms gap whose last velocity reads ~zero, then snaps; axilog's downsampler interpolates
   through. A genuine sampling difference, not a projection error: native world coordinates pushed
   through `worldToPixel` land on EI's own pixel positions to a **sub-pixel median across >1000
   samples**. Native's trajectory is the more faithful reconstruction and is golden-tested in
   axilog.
2. **`distance scalars`** — there is no EI side to compare: `to_ei_json` never emitted
   `statsAll[0].distToCom`/`.stackDist`, measured absent for all 42 players. A guard test asserts
   that absence, so the entry fails rather than surviving on faith if a future axilog starts
   emitting them.

### Unit 3b — the replay map, migrated (2026-08-17)

The renderer's **visual** replay surface now reads native positions. The decision that made this
small: **keep the calibrated pixel space, change its source.**

Every landmark in `wvwLandmarks.ts` (523x750 alpine, 716x750 EBG) and every `pixelOffset` in
`wvwTiles.ts` is hand-calibrated against EI's canvas, whose max dimension is 750. Native emits the
arena un-squeezed. Measured on the fixture at 0.3.5:

| | value |
|---|---|
| native `blocks.replay.tracks.arena` image | 697 x 1000 |
| scaled so max dimension = 750 | 522.75 x 750 |
| EI `combatReplayMetaData.sizes` | **523 x 750** |

`replayCanvas(arena)` reproduces that, rounding included, and `worldToPixel(arena, x, y, canvas)`
then lands within a **median 0.01 px** of EI's own positions over >1000 compared samples. So every
calibrated constant stays exact while EI stops being read. Re-calibrating the overlay into world
inches would have been a large, risky, purely cosmetic change.

**`inchToPixel` is replaced by a per-axis pair, not a corrected scalar.** The projection is
genuinely anisotropic: the fixture's world rect is 61440 x 86016 (ratio 0.714) against an image of
697 x 1000 (ratio 0.697), so the axes differ by ~2.4%. EI collapsed that to `0.009`, against true
scales of 0.008512 (x) and 0.008719 (y). The commander range rings were therefore both oversized
and wrongly circular; they are now ellipses scaled per axis.

**The dense `positions[]` encoding survives, deliberately.** All 74 tracks on the fixture step by
exactly `poll_ms` and every track's first sample is an exact multiple of it, so `positions[] +
firstPoll` remains valid. Storing `[t, x, y]` triples instead would have inflated `replayFights` --
~66% of `report.json` -- by roughly half for no gain. `firstPoll` is now READ from the first
sample's timestamp rather than derived, so the `ceil`-vs-`floor` error unit 3 found at five call
sites cannot recur. The no-gap invariant is asserted against the real fixture in the unit 3b
oracle, so a future axilog that introduces gaps fails loudly.

**A latent dependency removed.** The EI path joined and deduped allies on `players[].name`, which
axilog's ei-json compat does not emit (it spells it `character_name`). Production was fine only
because `applyEiCompatShims` back-fills it -- but that shim is scheduled for deletion with its
readers in unit 8, at which point all 42 allies would have collided on `undefined` and the map
would have drawn one. Entity ids make the join total.

Also migrated off EI: `computeFightAvgPosition` (which feeds the landmark lookup), the payload's
`mapSize`/`mapImageUrl` (now from the arena), and `computeRallyEvents` (which re-read EI down/dead
intervals the movement members already carried natively).

**Oracle:** `src/test/__tests__/unit3bReplayMap.oracle.test.ts`, 8 tests, two allowlist entries
(`ally member count`, `inch scale`).

### Commander positions, migrated (2026-08-17)

`src/shared/commanderMetrics/*` was the last EI-position reader. `playerPosAt` and its
`combatReplayData.start` frame derivation are deleted; `buildSquadTracks` joins native squad
entities to their tracks and `squadPosAt` resolves at-or-before with a one-poll staleness bound.
`computeCommanderFightData` no longer reads `combatReplayMetaData` at all -- not its `pollingRate`,
not its pixel space.

**The unit bug this exposed was worse than "thresholds need re-tuning".** Native samples are world
inches, which is what every threshold in `commanderThresholds.ts` was already written in, so the
fix was to stop projecting rather than to convert. Measured on `wvw-small.anon.zevtc` (38 squad,
49s), at 0.008512 px/inch on a 523x750 canvas:

| metric | EI (pixels) | native (game units) |
|---|---|---|
| `avgDistFromTag` | 10.20, rendered as "10u" | 1101u |
| `peakSpreadStdev` | 58.82 vs `spreadBad` 600 | 5228u |
| `timeSpread900PlusSec` | 0 of 50s | 0 < n <= duration |
| `stragglersAtBomb` | 0 | discriminating |
| `matchup.inTagBubbleAtEngage` | whole squad, always | < squadCount |

`900u` is **7.66px** and `1500u` is **12.77px** on this arena, so those comparisons were
unsatisfiable and the metrics were constants, not measurements. `600u` for the tag bubble spans
~70,000 units in pixel space -- wider than the 61440x86016 map -- so `tagPct` was pinned at 100%.
Four detectors (`fragmentedAtBomb`, `caughtOutDeaths`, `firstSquadDeathEarly`'s far-flag,
`outcome`'s `caught-out` chip) could never fire.

Thresholds were left unchanged. The per-player-second distance distribution in game units -- median
599u, p75 778u, p90 992u -- lands squarely on the existing 600/900/1500 values, which is the
evidence they were always game units and only the input scale was wrong.

`computeCommanderStats.ts` moved too, and it was the one place already producing game units --
it measured in pixels and divided by `combatReplayMetaData.inchToPixel`. That divisor is EI's
3dp-rounded 0.009 against a true 0.008512, collapsed from an anisotropic projection onto one axis,
so `distanceTraveled` / `movementPerMinute` / `stationaryPct` / `movementBurstCount` carried ~6% of
scale error before any pixel rounding. Native samples need no divisor. The 1u / 25u
stationary/burst thresholds are unchanged, since they were already compared against the converted
value.

With that, **no file under `src/renderer` or `src/shared` reads `combatReplayData.positions` or
`combatReplayMetaData` any more.** The remaining `combatReplayMetaData` references in `src/main`
are cache-validation markers, not position reads.

**A second, independent defect surfaced while testing.** `computeSurvival` and
`buildDeathsTimeline` each construct their own `DeathEvent` objects, and `computeCohesion` fills
`distFromTag` on the timeline's only. `firstSquadDeathEarly` reads
`survival.firstSquadDeath.distFromTag`, so it compared a permanent 0 against 900 and its evidence
string always read `"0u from tag"`. The orchestrator now re-points survival's two death fields at
the timeline entries, so the two surfaces share one object. Fixing the units alone would not have
revived that detector.

**Not addressed, and now visible.** Absent squad members distort the aggregates: one alive member
sits ~18,000u away (a scout, or an afk in spawn), which is what drags the mean to 1101u against a
median of 572u and inflates `peakSpreadStdev` to 5228u against a `spreadBad` of 600. Excluding
dead and downed players was measured and moves nothing. Whether cohesion should use robust
statistics or exclude non-participants is a product decision about what these cards mean, not a
migration question -- but until it is answered, `fragmentedAtBomb` will fire at max severity on
most fights.

### Distance from the tag now means distance from the TAG (2026-08-17)

`distFromTag` measured distance from the squad **centroid**, because EI exposed no positional
commander evidence. Native `commander.segments` identifies the tag holder, and their own replay
track puts them somewhere, so `buildSquadTracks` now returns a `tagTrack` alongside the squad's
and every cohesion distance is measured from it -- `avgDistFromTag`, `spreadStdev`,
`timeSpread900PlusSec`, `distFromTag` on each death, `stragglersAtBomb`, and
`matchup.inTagBubbleAtEngage`. When several members hold a tag, the one who held it longest wins
(ties by account), matching `computeCommanderStats`' commander-row selection. Seconds where the
tag has no position fall back to the centroid, as does a fight with no tag at all; on the
reference fixture the tag resolves for 49 of 50 seconds.

The centroid is not a neutral stand-in. It is *displaced by the very outlier the metric exists to
catch*, which inflates the reading for everyone who actually stacked; the tag's own position is
unmoved by them. Per-player-second distance on `wvw-small.anon.zevtc`:

| | centroid | commander |
|---|---|---|
| mean | 1102u | 793u |
| median | 571u | **207u** |
| p90 | 857u | 545u |
| within the 600u bubble | 57.0% | **91.8%** |
| `matchup.inTagBubbleAtEngage` | 3 of 38 | **36 of 38** |

`inTagBubbleAtEngage` is the clearest case: in EI pixels it counted the whole squad every time,
and fixing only the units swung it to the opposite error -- 3 of 38 at engage, a rout, on a fight
where the squad was stacked. 36 of 38 is what the fight actually was.

**This does NOT fix the absent-member problem above.** `peakSpreadStdev` goes 5228u -> 5512u
against a `spreadBad` of 600, and `timeSpread900PlusSec` stays at 49 of 50 seconds, because both
are tail statistics and the ~18,000u member is still in the tail wherever the origin sits. Only
the central tendency moved. `fragmentedAtBomb` will still fire at max severity, and robust
statistics vs. a non-participant filter remains the open product decision.

### The absent member was a roster problem, not a statistics problem (2026-08-17)

Measuring the distribution settled the "robust statistics vs. filter" question above: it is not a
heavy tail, it is a member who was not in the fight. Distance-to-tag on `wvw-small.anon.zevtc` is
bimodal with nothing in between -- 37 of 38 members have medians from 0u to 392u, and the 38th has
a **19,912u median and a 34,743u maximum**, with full position coverage for all 49 seconds. A
robust estimator would have hidden them. `computeCohesion` now excludes them and reports the count
as `cohesion.detachedMembers`, rendered as its own card.

Two things this cost a probe to learn:

- **`combat_participant` does not identify them.** Native reports it `true` for all 38, so the
  ready-made non-participant flag is a dead end and geometry is the only available test.
- **The straggler radius cannot be reused as the cut.** 1500u was the obvious no-new-constant
  choice, but `stragglersAtBomb` exists to count members past 1500u -- excluding them upstream
  leaves that metric able to see only members who wandered back inside at some other second.
  `DETACHED_RADIUS` is 5000u, beyond the footprint of a fight rather than inside it. The fixture
  has no near-misses either way: the detached member's *closest approach all fight* is 11,896u,
  and the worst single moment of the next-worst member is 67u.

The test is the **minimum** over the fight, so coming within 5000u even once keeps a member
permanently, far seconds included -- a genuine straggler who runs back is still measured in full.
Scope is cohesion only; `matchup.inTagBubbleAtEngage` keeps all 38 deliberately, because it is
reported against the distinct-person `squadCount` and the absent member *should* show as missing
from "36 of 38".

| | all 38 | 37 kept |
|---|---|---|
| `avgDistFromTag` | 793u | **245u** |
| `timeSpread900PlusSec` | 49 of 50 | **6 of 50** |
| `peakSpreadStdev` (vs `spreadBad` 600) | 5512u @1s | **234u @49s** |

That last row is the point: `fragmentedAtBomb` was pinned at maximum severity on a fight whose
squad was in fact stacked, and it now does not fire.

**A geometric fact the oracle surfaced while this landed.** With the outlier gone, the
centroid-relative mean (172u) is *lower* than the tag-relative one (245u), reversing an assertion
that had held. This is not the centroid winning: it is by construction the minimum-mean-distance
point of the set it summarises, so no origin can beat it. It measures how tight the blob is around
itself; the tag measures whether the blob is on the commander, which is the question the card
asks. The old ordering was an artifact of the outlier dragging the centroid.

**axilog gained `encounter.log_start_ms` for this (0.3.6, not yet consumed here).** The change uses
segment PRESENCE, not segment timing, which is why it does not need that field: `commander.segments`
are raw arcdps session-time ms (`[[33847418, 33847418], [33847418, 33896600]]` against a
`duration_ms` of 49285) and the native container carried no `t0` to rebase them against, so from
JSON alone they were uninterpretable. axilog 0.3.6 emits that `t0`. Consuming it would buy
mid-fight tag handoff and dropped-tag handling; deferred because the only fixture has exactly one
tag holder for the whole fight, so neither behaviour is testable here yet.

`computePositioning` in `packages/bridge-metrics/src/positioning.ts` remains migrated-but-unused
inside axibridge -- it is live public API of a published package, which is why it was ported rather
than deleted. Still worth a decision of its own.

### Unit 4 — damage, migrated (2026-08-17)

`computeAllDamageData`, `computeSpikeDamageData`, `computeIncomingStrikeDamageData` and the damage
half of `computeFightDiffMode` now read `blocks.damage`, `blocks.series`, `blocks.contribution` and
`catalogs.skills`. The oracle
(`src/test/__tests__/damageNative.oracle.test.ts`) has an **empty allowlist**: squad total damage is
identical on both paths, and equals axilog's own `by_entity[].total` sum. This unit changed sources,
not numbers.

**What was deleted, and why it existed.** Both series extractors were mostly a coin-flip between
`[phase][target][time]` and `[target][phase][time]` — EI emitted either shape and the code guessed
from the nesting depth of element 0. Native has one shape, so ~80 lines of shape-guessing went with
it, along with the `skillMap`/`buffMap` double lookup (`s{id}` then `b{id}`, because EI filed some
damaging skills under buffs) which `catalogs.skills[id]` replaces outright.

**The trap this unit turns on: `per_target.by_skill` carries no `outcomes`, so it carries no
`indirect`.** Every damage module filters condition ticks out of strike damage, and the per-target
slices — the preferred source, because they exclude minions and untracked splash — cannot answer
the question. The flag is joined from the same entity's top-level `by_skill`. Verified on the
fixture: all **2105** per-target skill ids are present there, so the join never misses. It fails
*silently* if dropped — Bleeding and Burning would simply appear in the strike tables looking like
damage — which is why the oracle asserts the five common condition names never appear in a strike
row, and separately that the flag is really present on this fixture so the assertion cannot pass
vacuously.

Two related facts, both measured:

- **`outcomes` is squad-only.** 529 of 529 squad `by_skill` entries carry it; 0 of 323 enemy and 0
  of 22 npc entries do. Enemy rows therefore come back `indirect: false` and nothing is filtered,
  which is the correct default — with no flag there is nothing to exclude.
- **`indirect` is a per-(entity, skill) fact, not a per-skill one.** Skill 19426 (Torment) reports
  both values across entities in this one fixture. The `false` belongs to a squad entity whose
  `total` is 0, i.e. a meaningless flag on a zero-damage record — but a global skill→flag map would
  have adopted it. Joining per entity, which is the shape native already gives, is right regardless.

**The new shared primitive: `decodeSeries` (`packages/bridge-metrics/src/nativeSeries.ts`).** Every
native 1s series is `{ data, enc, interval_ms, len }` with `enc` of `"rle"` (a list of
`[value, runLength]` pairs) or `"raw"`. Nothing in axibridge decoded them before; units 5 and 6
consume the identical encoding, which is why it is its own module rather than a helper inside
`nativeDamage.ts`. **`len` is authoritative, not `data.length`**, and the series are CUMULATIVE — so
a run that stops short of `len` must be padded by **repeating the last value**. Padding with zero
would make the next `toPerSecond` delta negative and silently blank a player's tail, with every
shape check still passing. The decoder is pinned against the real container: decoded length equals
`len`, the series is monotonic, and its last sample equals `by_entity[id].total`.

**Down/death markers moved too, and got simpler.** `blocks.replay.by_entity[id].{down,dead}` are
`[startMs, endMs]` pairs in **fight-relative** time. EI reported them in session time against a
replay start that had to be inferred per player, so both spike modules carried a
`normalizeEventTimes` that tried unit conversions and a set of candidate offsets and scored each by
how many results landed in range. All of that is deleted; the native path is `Math.floor(t / 5000)`.

**One EI behaviour deliberately reproduced.** EI reconciled `targetDamageDist` against
`totalDamageDist`, adding back per-skill deltas *unless* the log was `detailedWvW`. That is not an
EI quirk: the remainder is real damage that landed on nothing curated, and on detailed WvW logs the
totals carry outliers EI never resolved. `getEntitySkillRows(..., { supplement })` reproduces it
from native's own numbers. The peak-hit rule is the sharper half — **when per-target slices exist
they are the only source of the peak**, even where `by_skill` reports a larger `max` for some skill,
because that larger figure is by definition damage against something untracked.

**Preserved, not endorsed:** `computeIncomingStrikeDamageData`'s per-enemy-class series is built
from squad players' *outgoing* power damage against that enemy, not from enemy outgoing damage.
Native maps it 1:1 (`series.by_entity[squadId].per_target[enemyId].power_damage`), keyed by entity
id rather than EI's target-array index, so the index join disappears. Whether the proxy is the right
metric is a product question, not a migration one.

**Left for later:** per-second down-contribution buckets. Native's
`contribution.by_entity[].downs_contribution_by_skill` gives real per-skill attribution — now used
for the per-skill column — but the 5s buckets still scale total damage by a flat
`downContribution / damage` ratio, as they did on EI. Also unconsumed: `blocks.hit_stats` and
`blocks.damage_mods` (unit 7).

`computeFightDiffMode` is **half-migrated on purpose**: damage totals and per-target focus read
native, while `defenses`, `extBarrierStats`, `stabGeneration` and `statsTargets` stay on EI rows for
units 5 and 6. Finishing them here would leave those units' work done in a way their own oracles
never checked.

### Other reconstructions

`applyEiCompatShims` fills `players[].name` (from `character_name`), `zone` (split out of
`fightName`), `encounterDuration` (from `durationMS`) and `timeStart`/`timeEnd` + `*Std` (from the
`.zevtc` mtime minus `durationMS`). All four are write-if-absent, so a future axilog release that
emits them natively wins.

---

## 6. Test evidence

`src/main/__tests__/axilogParser.test.ts` — **36 tests**:

- **Backend selection** (3) — the shipped default is `'elite-insights'` (the assertion is the gate:
  flipping `DEFAULT_PARSER_BACKEND` has to be a deliberate, visible edit in the test too); an exact
  `'axilog'` is honoured; and everything else coerces to the default. The coercion case walks
  mis-cased and whitespace-padded spellings of *both* ids plus non-strings, so it keeps its
  discriminating power whichever way the default points.
- **Settings mapping** (4), **derived scalars** (10), **EI-shape shims** (5), **manager** (3) —
  unchanged from the first cutover.
- **Real-parse integration** (10, was 8) — parses the anonymized WvW fixture through
  `AxilogManager.parseLog` and asserts a `parseLog`-shaped payload satisfying
  `hasUsableFightDetails`; every flag-gated block present; finite, sane `distToCom`/`stackDist` for
  all 42 squad players; survival of `pruneDetailsForStats` in both retention modes; a dashboard
  summary with a non-null `isWin`. Three are new:
  - *the per-target split is taken, not the fallback* — pins §4.2, including that the split total is
    strictly below the `statsAll` total, so a regression to the high-biased path fails loudly;
  - *every MEIGAP/MEIGAP2 block is present* — one assertion per gap the original audit called
    blocking, so a silent upstream regression becomes a test failure rather than a blank panel;
  - *the documented residuals are still absent* — the inverse pin. It did exactly its job on the
    0.3.2 bump: `wasted`, `saved` and `targets[].profession` started landing, the test went red, and
    this report was updated rather than quietly going stale. Those three moved to a positive
    assertion (*the three residuals axilog 0.3.2 closed*, which checks populated values rather than
    field presence); the pin now covers `display_name`, skill icons, buff classification and the
    seven `statsTargets` fields of §4.1 — the last of these because faking them from a near-miss
    field (`connectedDirectDmg` for `directDmg`) is the tempting wrong fix.

  Two more are new with 0.3.2:
  - *the enemy roster is free of squad-side minions* — every `targets[]` entry is an `enemyPlayer`,
    pinning §1.6's fix so a regression to enumerating pets as enemies fails here rather than
    silently re-inflating enemy downs and polluting mitigation;
  - *the per-target arrays stay index-aligned* — `statsTargets.length` and `targetDamageDist.length`
    both equal `targets.length` for every player. These are positional indexes, so a roster change
    that moved one and not the others would misattribute every per-target read rather than blank it.

`src/renderer/__tests__/SettingsView.test.tsx` — **7 tests** for the Parse Engine card: it reflects
the persisted backend (which is deliberately *not* the shipped default in the base mock, so the card
is pinned to showing the store rather than the build), persists a switch over `setParserBackend` and
updates the selection, does not re-send IPC when the already-selected engine is clicked, disables
axilog with an explanation when the native binding is unavailable (and refuses to send), renders the
shipped default when the host exposes no parser API at all (the web build), and adopts a
`parser:backend-changed` broadcast. That last case doubles as the drift guard for
`SHIPPED_DEFAULT_BACKEND`: it asserts against the imported `DEFAULT_PARSER_BACKEND` rather than a
literal, so flipping the default without updating the renderer mirror fails there.

`src/renderer/stats/__tests__/offenseStatsAllFallback.test.ts` — **11 tests** for §4.1's `statsAll`
fallback, across both backends and both guards. See §4.1.

`src/renderer/__tests__/App.firstTimeExperience.test.tsx` — the walkthrough's step 4 copy is pinned
default-neutral: it sells local parsing, says the parse engine is set up automatically (true under
either default — EI is auto-installed, axilog ships with the app) and names both engines without
claiming either is the current one. An owner flip needs no copy change.

`src/main/__tests__/detailsProcessing.test.ts` — the 6 existing tests pinning both sides of the
enemy-downs fallback are unchanged and still green. They now guard a path axilog no longer takes,
which is exactly what they were written for.

**The fixture is committed, and the real-parse block now runs in CI.** `test-fixtures/axilog/
wvw-small.anon.zevtc` sits behind a narrow, owner-authorized negation of the blanket `*.zevtc` PII
guard (`!test-fixtures/axilog/*.anon.zevtc` — scoped to that directory and requiring `.anon.` in the
name, so a raw capture dropped there is still ignored). It was verified PII-free before commit: 42
players, every `character_name` an `Anon<N>` placeholder, every `account` and `recordedBy`
`:Anon<N>.<digits>`, all 32 `enemyPlayer` targets likewise, every `guildID` zeroed, the remaining
targets GW2 NPC/pet names, and a raw `strings` scan of the inner `.evtc` turning up no
account-shaped token other than `Anon<N>.<digits>`.

Resolution is unchanged — `$AXILOG_FIXTURE`, then `test-fixtures/axilog/`, then a sibling axilog
checkout — but candidate 2 now always hits. A separate always-on test asserts the committed path
exists, so a deleted or re-ignored fixture fails loudly instead of turning the integration block
into a green no-op. The `describe.runIf` guard stays for the *native binding*, which really can be
absent on a platform npm ships no prebuilt binary for.

Gates:

- `npm run typecheck` — clean.
- `npm run test:unit` — all green.
- No release, build or packaging configuration was touched.

---

## 7. Follow-ups

1. **~~Qualify per-skill "Down Contribution" in the UI.~~ RESOLVED — owner decision (2026-08-10): no qualifier.** The arcdps-methodology number is this product's own, intentional definition of down contribution (axilog's founding differentiator), not an EI reproduction, and it stays unlabelled by design. Original rationale kept below for the record. §2.1: the number is arcdps methodology under
   EI's field name, matching EI on ~114 of 344 shared skills. The All Damage, Player Breakdown, Spike
   Damage and Top Skills surfaces all display or rank by it unqualified. A tooltip naming the
   methodology costs nothing and stops the app making a claim it does not honour. This is the highest
   -value item on the list precisely because nothing looks broken.
2. **~~Close the `statsTargets` field-subset gap.~~ PARTIALLY RESOLVED — 8 of 15 done (§4.1).**
   `OFFENSE_METRICS` now falls back to the whole-fight `statsAll[0]` figure, presence-gated and
   scoped to the all-targets rollup, for the 8 columns whose equivalent exists there. **7 remain**:
   `directDmg`, `missed`, `evaded`, `blocked`, `invulned`,
   `appliedCrowdControlDownContribution`, `appliedCrowdControlDurationDownContribution`. These need
   axilog to fill the per-target stat set — nothing in axibridge can supply them. Note the boundary
   recorded in §4.1: the fallback is only valid because no per-target filter exists over these
   columns or the `offenseTotals` rollup; introducing one means revisiting it.
3. **~~Decide the fixture question.~~ RESOLVED — owner-authorized (2026-08-10): committed.**
   `test-fixtures/axilog/wvw-small.anon.zevtc` is in-tree behind
   `!test-fixtures/axilog/*.anon.zevtc`, verified PII-free first, and the real-parse block now runs
   in CI instead of skipping. See §6.
4. **~~Ask axilog to emit `distToCom`/`stackDist` directly~~ RESOLVED (unit 3, axilog 0.3.5).** axilog emits both in-core in world inches, from real commander segments; `deriveDistanceScalars` is deleted. Original text: **Ask axilog to emit `distToCom`/`stackDist` directly** — or a commander-segment timeline. §5's
   3.7 % / 4.3 % mean error is dominated by the single-track commander approximation. Emitting the
   scalars from the engine deletes `deriveDistanceScalars` outright.
5. **~~Ask axilog for `wasted` boon generation.~~ RESOLVED in 0.3.2** (§1.6). Still open from this
   item: a **log-start timestamp**, which would replace the `.zevtc`-mtime inference in
   `applyEiCompatShims`, wrong for a copied or restored file (small blast radius: only consulted
   after `uploadTime`).
6. **`minMitigation` roster-shape sensitivity** (§2.2). Either have axilog expose a true per-skill
   global minimum, or compute the column from a min-of-mins rather than a mean-of-mins in
   `resolveGlobalEnemyStats`. The second is a one-line change in axibridge and is probably the right
   answer; it needs a decision on what the column is meant to mean.
7. **~~Enemy profession~~ and skill/buff icons** (§4.3) — enemy profession **resolved in 0.3.2**
   (§1.6). Skill and buff icons still need a GW2 skill database axilog does not carry. Lowest
   priority: cosmetic, with working fallbacks.
