# Detailed Resurrects — Design

**Date:** 2026-09-09
**Status:** Approved, pending implementation plan
**Origin:** Discord thread "Detailed Resurrects" (1547229785338413248)

## Problem

AxiBridge reports a single "Revives" / "Resurrects" number per player, sourced from
`support[0].resurrects`. A probe across real WvW logs established what that number
actually is:

| Player | `support[0].resurrects` | Skill 1066 cast segments |
|---|---|---|
| Vindicator | 5 | 5 |
| Troubadour | 7 | 7 |
| Troubadour | 19 | 20 |
| Troubadour | 2 | 2 |
| Specter | 2 | 2 |
| Tempest | 2 | 2 |
| Firebrand | 8 | 9 |

The metric is the count of **skill 1066 ("Resurrect") cast segments** — hand-resurrect
channel starts. Therefore it:

1. counts **attempts, not completed revives** — a player who channels six times on one
   ally who then dies scores six;
2. contains **no utility resurrects at all** — Battle Standard, Spirit of Nature and
   Illusion of Life contribute nothing;
3. appears for every profession, which is why the Discord reporter concluded it was
   "lumping everything together". It is the opposite: it is hand-resurrects only.

The reporter's specific evidence — a druid showing 8 for resurrect utility versus 3 for
revives — is explained by this inversion. The low number is the attempt count.

Secondary finding: `resurrectTime` is `0` for every player in axilog output, a field EI
populates. Not blocking (resurrect time is derivable from channel durations) but recorded
as a known upstream gap.

## Goals

- Report **completed revives**, distinguished from attempts.
- Attribute revives to **hand-resurrect vs. utility**, and per utility type.
- Show which player and which utility the squad actually relies on.
- Track post–Illusion of Life survival.
- Correct the labels and the metrics spec so the existing number stops misleading people.

## Non-goals

- A resurrect timeline chart. Deferred; the value in v1 is correct counts.
- A native axilog resurrect-analysis block. Deferred deliberately — see "Future work".

## Data availability

Verified present in `parseFileEi` output when AxiBridge's existing parse options
(`replay: true`, `rotation: true`) are used:

- `players[].combatReplayData.down` — `[[startMs, endMs], ...]`
- `players[].combatReplayData.dead` — `[[startMs, endMs], ...]`
- `players[].rotation` — `[{ id, skills: [{ castTime, duration, ... }] }]`

Note the rotation shape: all casts of one skill are grouped into a single entry with a
`skills[]` array. Counting rotation *entries* undercounts casts; the `skills[]` array must
be flat-mapped.

Both fields survive `pruneDetailsForWorker` and are already consumed by
`computeSkillUsageData.ts` and `shared/commanderMetrics/survival.ts`, so no new data
plumbing is required.

### Resurrect skill catalog

Confirmed present in real logs:

| ID | Name | Kind |
|---|---|---|
| 1066 | Resurrect | hand |
| 1175 | Bandage | self |
| 10244 | Illusion of Life | utility |
| 12569 | Spirit of Nature | utility |
| 14419 | Battle Standard | utility |

**Excluded:** `12502` "Signet of Renewal" matches a resurrect-name regex but is a condition
cleanse signet, not a resurrect. It must never enter the catalog.

Utility effect windows and radii are **not hardcoded from external references**. Where the
utility applies a buff to the revived player (Illusion of Life), the buff window on that
player is the authority. Area utilities use constants pinned empirically against real logs
during implementation, held in one place in the catalog.

## Model

### Recovery: the atomic unit

A **recovery** is a down interval that ended without the player dying. For each player,
a `down` interval `[ds, de]` is a recovery when no `dead` interval starts at `de` within a
small tolerance. This is ground truth from the log and does not depend on any heuristic.
Squad-wide, recoveries answer the question the thread is asking: how many people got
picked up.

### Attribution ladder

Each recovery is attributed by resolving, in order:

1. **Hand resurrect** — a player whose 1066 cast segment `[castTime, castTime + duration]`
   covers the moment of stand-up (`de`). Strongest available signal: the channel must be
   running at that instant. When multiple channels overlap the same recovery, the one
   covering the final instant takes **primary** credit and the others are recorded as
   **assists**. A recovery is counted once in squad totals regardless of contributor count.
2. **Resurrect utility** — no covering hand channel, but a catalogued utility was active
   over `de`, within its effect window and (for area utilities) radius of the downed
   player's last known position. Credits the caster and records the utility type.
3. **Self** — Bandage (1175) cast by the downed player.
4. **Unattributed** — nothing matched.

The **unattributed bucket is displayed in the UI**, not hidden. It is the honesty measure
for the heuristic and the direct input to scoping future native work.

### Position handling

Proximity checks use the downed player's last known position sample. Positions poll at
300ms and a missing sample means the entity was **stationary**, not that it moved —
positions are never interpolated across a gap.

## Metrics

### Squad summary

`Downs · Recovered (rate) · Died`, split into `Hand · Utility · Self · Unattributed`.

### Per player

| Column | Definition |
|---|---|
| Resurrect Attempts | count of 1066 cast segments (today's metric, honestly labeled) |
| Resurrect Time | summed 1066 channel duration |
| Hand Revives | attempts resulting in a stand-up (primary credit) |
| Success Rate | Hand Revives ÷ Resurrect Attempts |
| Utility Casts | catalogued utility casts |
| Utility Revives | recoveries credited to those casts |
| Revives per Cast | Utility Revives ÷ Utility Casts |
| Assists | recoveries contributed to without primary credit |
| Total Revives | Hand Revives + Utility Revives (primary credits) |

### Per utility

One row per utility type: squad casts, revives, revives per cast, top caster.

Self-revives (Bandage) are counted in the squad split only. They are not credited to
the reviving player's Total Revives, since crediting a player for reviving themselves
would distort the leaderboard.

### Post–Illusion of Life survival

Rendered only when IoL-credited revives exist. For each such recovery, look forward on that
player's down/dead intervals within the IoL window: did they go down again, and how long
did they last. Reported as counts plus median time to re-down. A panel rather than a
per-player column, because the denominator is typically small.

All counts respect the existing per-minute rate toggle.

## Implementation

### New module

`src/renderer/stats/computeReviveDetail.ts`, following the established accumulator
contract used by sibling modules (`computeSkillUsageData`, `computeStabPerformance`, etc.):

```
createReviveDetailAccumulator()
ingestLogReviveDetail(acc, log, details, ...)
finalizeReviveDetail(acc)
extractReviveDetailFrame(acc) / mergeReviveDetailFrame(acc, frame)
```

The `extract`/`merge` frame pair is required for the stats Web Worker path (>8 logs).
Derivation is pure functions over `{ down, dead, rotation }`, independent of React.

`RESURRECT_SKILLS` is a single exported catalog table (id → name, kind, window source,
radius).

### UI

New section `revive-detail`, label **"Revives"**, in the **Defense** category — downs and
deaths already live there and this section is fundamentally "what happened to our downs".
Registered in `statsTaxonomy.ts` with search keywords, rendered by
`src/renderer/stats/sections/ReviveDetailSection.tsx`.

`support-detailed` keeps its resurrect column, relabeled, plus a cross-link to the new
section.

### Relabeling

Metric **IDs are frozen** — they are persisted in user settings, saved reports and
`report.json`, so renaming an id silently drops columns from existing configurations.
Labels change; ids do not.

| ID | Old label | New label |
|---|---|---|
| `revives` (`topStatsCatalog.ts`) | Revives | Resurrect Attempts |
| `resurrects` (`utils/comparisonMetrics.ts`) | Resurrects | Resurrect Attempts |
| `revivesCompleted` *(new)* | — | Revives |

Shorthand ("rez") is not used in labels, column headers, or code identifiers. Use
"Resurrect" and "Revive".

### Downstream repointing

- **MVP weight `defensiveRevives`** repoints to completed revives. The settings key is
  retained so tuned weights are preserved. This intentionally changes MVP scores on
  re-aggregated data: scoring players for channels they never completed was the defect.
- **Discord embed `showResurrects`** reports completed revives; key retained, column header
  becomes "Revives".

### Null semantics (critical)

Completed revives require both `replay` and `rotation` data. Logs cached before this ships,
or parsed by older axilog versions, have neither. For those logs `revivesCompleted` is
**null, not zero**, and every consumer treats null as "no data":

- the section shows a per-log coverage notice, following the existing `axilogCoverage`
  pattern;
- MVP falls back to Resurrect Attempts for that log, so historical scores do not crater;
- Discord omits the field rather than reporting a false `0`.

A zero here would read as "this player revived nobody", which is false, and would propagate
into MVP scores and published web reports.

### Metrics spec

`src/shared/metrics-spec.md` § Resurrects is rewritten to document the recovery model, the
attribution ladder, the unattributed bucket, and null semantics, replacing the current
`resurrects = support[0].resurrects` one-liner that encodes the misconception. Run
`npm run sync:metrics-spec` afterwards. The `resurrectTime` upstream gap is recorded there.

## Testing

Repo fixtures contain no resurrect utilities and mostly zero resurrects, so real fixtures
cannot exercise this. Derivation is pure functions over small inputs, making synthetic
fixtures both easier and more precise:

- down interval ending in death → not a recovery
- down interval ending clean → recovery
- one 1066 channel covering stand-up → primary credit
- two overlapping channels → primary + assist, recovery counted once
- channel ending before stand-up → attempt, not a revive *(the core defect)*
- recovery with no matching cast → unattributed, not dropped
- log without `rotation` → `revivesCompleted` is null, never 0
- rotation entry with multiple `skills[]` → counted per cast, not per entry

Regression: existing assertions on `revives` must continue to pass (ids unchanged), plus new
assertions that MVP falls back on a null log and that Discord omits rather than zeroes.

Run vitest with `--maxWorkers=2`.

### Empirical validation gate

Before merge, run the derivation across several hundred real logs from the arcdps folder and
report the **unattributed rate**. A low rate confirms the heuristic; a high rate is displayed
on screen and becomes the specification for native work. This is a reporting gate, not a
pass/fail gate — either outcome produces information.

## Rollout order

1. Derivation module + synthetic tests
2. Aggregator wiring, including worker frame extract/merge
3. Section UI
4. Relabeling, MVP and Discord repointing
5. Metrics spec rewrite + sync

The derivation lands and is proven before anything user-facing changes, so a poor empirical
result stops at a known-good point rather than half-shipping.

## Empirical validation

Measured 2026-09-09 against real WvW logs: 324 logs sampled (stride-10 across 3237 files in the
arcdps log folder, spread from January through the most recent session — not just one night), 0
parse failures, 0 logs without revive data.

Ground truth: 6506 downs, 3149 recovered, 3357 died.

Four-bucket attribution split (of 3149 recoveries):

| Bucket | Count | % |
|---|---|---|
| hand | 1115 | 35.41% |
| utility | 1877 | 59.61% |
| self | 7 | 0.22% |
| **unattributed** | **150** | **4.76%** |

**4.76% is under the 15% "heuristic is sound" threshold.**

Per-log distribution (not just the aggregate): median 0% unattributed, p75 7.7%, unweighted mean
across logs 14.2%. 69% of logs (173/250 with ≥1 recovery) attribute every recovery. 22 logs sit
at 100% unattributed, but these account for only 41 of the 150 total unattributed recoveries
(27.3%) and are almost all low-recovery-count fights (1–4 recoveries, where one miss reads as
50–100%) — small-sample noise, not a systemic hole in the ladder.

Risk 1 (truncated-down false positives — a `down` interval closed by fight-end rather than a
real stand-up, misread as a recovery): 65 of 3149 recoveries (2.06%) have `standUpAt` within 1s
of the fight's `durationMS`.

Risk 2 (`hasData` via `.some()` vs `.every()` on `hasReviveData` — whether a partial-roster log
could silently undercount while reporting `hasData: true`): disagreed in **0 of 324 logs**. Under
real `parseFileEi({replay:true, rotation:true})`, replay/rotation data is log-wide — a log either
has both fields for its whole roster or not at all, in this sample.

Utilities observed (casts → revives credited):

| Skill id | Name | Casts | Revives |
|---|---|---|---|
| 12569 | Spirit of Nature | 1105 | 1421 |
| 14419 | Battle Standard | 324 | 437 |
| 10244 | Illusion of Life | 14 | 13 |
| 9163 | Signet of Mercy | 2 | 2 |
| 55024 / 55046 | Glyph of the Stars | 12 | 4 |
| 34309 | "Search and Rescue!" | 1 | 0 |
| 14569 | Battle Standard (dup id) | 1 | 0 |

Conversion >100% for Spirit of Nature and Battle Standard is expected, not a bug: their windows
are long-lived ground effects (45s / 60s), so one cast can legitimately credit several different
players' stand-ups while active — this is the windows doing their job, not double-counting a
single recovery.

**Verdict: ships as-is.** 4.76% aggregate unattributed is comfortably under threshold, both
structural risks raised in review are small (2.06% and 0 logs respectively), and the unattributed
tail is explained by small-sample noise rather than a systemic gap. Two follow-ups worth doing
later, not blocking:

1. A native fight-end/truncation sentinel from axilog (a flag distinguishing "down interval
   closed by a real stand-up" from "closed because the log ended") to remove the ~2% truncation
   guesswork.
2. Larger real-log samples before trusting the provisional `windowMs` values for the rare
   utilities — `"Search and Rescue!"`, `Glyph of the Stars`, and the duplicate Battle Standard id
   `14569` — each had single-digit sample sizes here.

## Future work

- **Native axilog resurrect block.** Exact attribution from raw EVTC resurrect application
  events, exact attempted-vs-completed, and a fix for `resurrectTime`. Scoped by the
  unattributed rate this pass measures. Requires an axilog release, version bump, the
  additive-field edit sites, and graceful degradation for logs parsed by older versions —
  for which the TypeScript derivation here remains the fallback path.
- Resurrect timeline chart.

## Catalog expansion, 2026-09-17 (arcdps-parity pass)

The arcdps author shared the instant-res detection from arcdps itself. It credits the res
**effect**, not the cast: on each squad `CHANGEUP` it consumes at most one pending attribution,
in fixed priority — Battle Standard → Spirit of Nature → Signet of Undeath → Illusion of Life →
Signet of Mercy — where each pending attribution was armed by that skill's effect-GUID create
and is cleared at the next message boundary. Elementalist Glyph of Renewal has no usable
effect, so it is detected the other way: `ANIMATIONSTOP` (non-cancel) on ids 5760–5763, then a
200ms readback for a squad `CHANGEUP` within 1300 units, with each rally flagged so it cannot be
credited twice.

Two genuine holes in our catalog fell out of that:

1. **Signet of Undeath was absent entirely** — not by id, not in the name list.
2. **Glyph of Renewal could never match.** The name list carried `'glyph of renewal'`, but the
   glyph casts as its four attunement variants, *named* "Renewal of Air/Earth/Fire/Water"
   (5760–5763). Base id 5573 never appears as a cast.

Both are now catalogued by id, along with the duplicate ids the game also emits (Battle Standard
14569, Spirit of Nature 69300, Illusion of Life 25541, Signet of Mercy 24414, Signet of Undeath
24544, Glyph of Renewal 24407/24409/24410/24411) and the previously name-only utilities
(Signet of Mercy, "Search and Rescue!", Glyph of the Stars). Instant utilities — both signets
and all four glyph variants — use a new `INSTANT_UTILITY_WINDOW_MS` of 2s rather than the 5s
default: our clock is the cast START, so the window covers the cast animation and nothing more.

### Re-validation

`scripts/revive-validate.mjs` (added with this change) re-runs the gate. It extracts a compact
per-log core once — roster, `down`/`dead` intervals, and the rotation entries for every skill
that could plausibly revive — then re-derives from the cores, so a catalog change can be
measured without re-parsing. Cores land in /tmp and are never committed: they carry real
account names.

Sample: 339 logs, stride-13 across 4398 files in the arcdps folder, 0 parse failures, 0 logs
without revive data. 6615 downs, 3225 recovered, 3390 died.

| Bucket | Before | After |
|---|---|---|
| hand | 1172 (36.34%) | 1172 (36.34%) |
| utility | 1910 (59.22%) | 1912 (59.29%) |
| self | 5 (0.16%) | 5 (0.16%) |
| **unattributed** | **138 (4.28%)** | **136 (4.22%)** |

**The bucket split barely moves, and that is the honest result.** The newly catalogued skills
are rare in this squad's comps: 10 Renewal of Water casts, 3 Renewal of Earth, 1 Renewal of Air,
3 Signet of Undeath, 0 Signet of Mercy across 339 logs. What the change actually does is move
*credit to the right player*: of the 6 revives the new entries claimed, 4 were previously
credited to a Spirit of Nature or Battle Standard that merely happened to still be inside its
45–60s window (Spirit of Nature 1452 → 1450 revives, Battle Standard 427 → 425). Per-log p75
unattributed improved 7.14% → 5.56%.

The window values hold up against the cast → next-squad-stand-up delays measured over the same
sample: Renewal variants cluster at 0/832/942/1197/1378/1966ms, inside the 2s window.

### Open follow-up: Function Gyro

The delay probe surfaced **Function Gyro** (56920/72114) at 54 casts — more than every newly
catalogued skill combined — and it is still uncatalogued. It is deliberately left out: the gyro
flies to the target and then channels, so its delay profile is long and diffuse (median 6.6s,
p90 25s) and a cast-start window models it badly. Attributing it properly needs the gyro's own
agent, not the caster's cast time. Same shape of problem as `"Search and Rescue!"`.
