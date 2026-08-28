# CC and Boon-Strip Timelines

**Date:** 2026-08-28
**Status:** Approved design, not yet implemented

## Goal

Add two per-second time series — outgoing crowd control and boon strips
(both directions) — to axilog, and surface them in AxiBridge on three
existing surfaces: the replay timeline, two new stats sections, and the
Stab Performance heatmap.

Today AxiBridge shows CC and strips only as whole-fight scalars. You can
see that a player applied 47 CC, but not whether that was one coordinated
bomb or a trickle across ten minutes. The stab-performance grid already
proves the value of the within-fight time axis; this extends it to the two
metrics that most directly explain why stability coverage collapses.

## Feasibility findings

Established by reading the axilog sources before designing:

- **Squad CC over time already exists.** `blocks.series.squad.cc_applied`
  is computed unconditionally (no `timeseries` flag) and `blocks.series` is
  already in `CARRIED_PATHS`. Nothing in AxiBridge reads it —
  `packages/bridge-metrics/src/nativeSeries.ts` exports only
  `SERIES_INTERVAL_MS`, `NativeSeries`, and `decodeSeries`.
- **Per-entity CC over time is not emitted,** but is nearly free to add:
  the fold at `analysis/cc.rs:105` has both the bucket index and
  `src_agent` in hand at the `cc_applied[b] += 1` site, and the same loop
  already credits `players[i].cc_applied`.
- **Strips have full attribution but no timestamps.**
  `support::outgoing_boon_strips` (remover -> `[(boon_id, duration_ms)]`)
  and `defenses::incoming_boon_strips` (victim -> same) walk the removal
  events already; they discard `e.time`.
- **No client-side reconstruction is needed or wanted.** An earlier option
  — deriving CC from `blocks.conditions` per-source timelines — is rejected:
  it captures only buff-shaped CC and misses knockdown/launch/pull, so it
  would not reconcile with the `cc` scalar already displayed.

## Scope

In scope:

- **(a)** Replay `SyncedTimeline` squad CC and strip lanes.
- **(b)** Two new stats sections with player x 5s-bucket grids.
- **(c)** Stab Performance incoming-strips heatmap overlay.

Out of scope for this pass: per-fight drilldown charts (duplicates (b) at a
different zoom for real payload cost), Discord embeds (timelines do not
survive an embed), and retrofitting `StabPerformanceSection` onto the new
shared grid component.

## 1. Upstream: axilog 1.8.0

### Schema — `crates/axilog-schema/src/v1/blocks/activity.rs`

```rust
pub struct SquadSeries {
    pub damage: SeriesOut,
    pub cc_applied: SeriesOut,
    pub downs: SeriesOut,
    pub strips: SeriesOut,        // NEW
}

pub struct EntitySeries {
    // ...existing...
    pub cc_applied: Option<SeriesOut>,     // NEW — outgoing CC
    pub strips: Option<SeriesOut>,         // NEW — outgoing strips
    pub strips_taken: Option<SeriesOut>,   // NEW — boons stripped off this player
}
```

Per-entity lanes are `Option` and gated on `timeseries: true`, matching
`healing_1s` and `per_target`. The new squad lane is required and
unconditional, matching `cc_applied`.

Two construction sites take the new squad field: the builder at
`activity.rs:820` and the EI-compat path at `axilog-ei/src/lib.rs:3607`.

### Producers — `crates/axilog-core/src/analysis/`

**CC per entity.** Widen `Timeline` with a per-player bucket matrix
populated inside the existing loop in `cc.rs`. It reuses the `is_cc`
predicate verbatim, so per-player buckets sum to the existing per-player
scalar by construction. No new traversal.

**Strips, both directions.** Widen the tuple returned by
`outgoing_boon_strips` and `incoming_boon_strips` from
`(skillid, duration_ms)` to `(time_ms, skillid, duration_ms)`. The existing
folds ignore the added field, leaving `strips`, `strips_duration_ms`, and
`boon_strips_taken` arithmetically untouched — which matters, because those
arcdps-parity numbers are the most heavily pinned values in the crate. A
new bucketing fold consumes the widened tuples.

### Tests

Sum-invariants carry the safety net:

- `sum(cc_applied series) == cc.by_entity[id].applied_total`
- `sum(strips series) == support.by_entity[id].strips`
- `sum(strips_taken series) == defenses.by_entity[id].boon_strips_taken`
- existing parity fixtures byte-identical on all scalar fields

`sum(per-entity) == squad` may legitimately not hold for CC: the squad lane
counts squad->enemy applications while per-entity credits through the
minion/pet fold. If they diverge, assert per-entity against the per-entity
scalar and let the squad lane stand alone rather than forcing a
reconciliation that would misstate one of them.

### Release

Tag from `main` (release-branch tags break the lockfile refresh). A
`docs/CHANGELOG.md` section must exist before tagging, or the Release job
dies *after* npm-publish.

## 2. AxiBridge ingestion

### Carry set — no change

`blocks.series` is already in `CARRIED_PATHS`
(`src/main/nativeCarrySet.ts:57`), so the new lanes ride along as soon as
axilog emits them. No whitelist edit means no exposure to the failure mode
where a `CARRIED_PATHS` entry ships silently broken.

### Gating consequence

Per-entity lanes are gated on `timeseries: true`, which
`mapParserSettingsToAxilogOptions` binds to the `rawTimelineArrays`
setting. Therefore:

| Surface | Reads | Available |
|---|---|---|
| (a) Replay lanes | squad series | always, every log |
| (b) New sections | per-entity lanes | needs `rawTimelineArrays` + re-parse |
| (c) Stab overlay | per-entity lanes | needs `rawTimelineArrays` + re-parse |

(b) and (c) need an explicit empty state: "per-player CC and strip
timelines need Raw timeline arrays enabled — re-parse to populate."

### Readers — `packages/bridge-metrics/src/nativeSeries.ts`

Add `readSquadSeries(native, lane)` and
`readEntitySeries(native, entityId, lane)`, each returning decoded
`number[]` or `null`. This keeps knowledge of the `blocks.series` shape in
one module instead of spreading optional chaining through the renderer.

### Accumulator — `src/renderer/stats/computeControlTimeline.ts`

Implements the contract `computeStabPerformance.ts` established, which the
worker path depends on:

```ts
createControlTimelineAccumulator()
ingestLogControlTimeline(log, acc)
extractControlTimelineFrame(acc)   // worker -> main
mergeControlTimelineFrame(acc, frame)
finalizeControlTimeline(acc)
```

Wired into `IncrementalAggregator` at the four sites stab perf uses
(`incrementalAggregation.ts:610`, `:755`, `:883`/`:987`, `:1025`) and
returned as `controlTimelineDrilldown` alongside `stabPerformanceDrilldown`
at `:1630`.

**Resolution: 5s buckets, downsampled from the native 1s.** Required for
(c), which must land on the same grid as `StabPerfFightData`. Storing 1s
would be 5x the payload for a resolution no surface uses. (a) bypasses the
accumulator and reads the 1s squad series directly.

**Absent vs empty.** The accumulator distinguishes "no data recorded" from
"recorded, value zero". Both render as an all-zero grid otherwise, and only
one of them is true.

### Payload

Per fight: ~50 players x ~60 buckets x 3 lanes, roughly doubling the
stab-perf drilldown slice — minor next to `replayFights` (~66% of
`report.json`). If measurement contradicts this, the mitigation is sparse
encoding, since the arrays are overwhelmingly zero. Not done upfront.

## 3. UI surfaces

### (a) Replay — `SyncedTimeline`

Alongside `computeSquadDpsSamples(details)` at
`incrementalAggregation.ts:190`, read the squad `cc_applied` and `strips`
lanes and attach `ccSamples` / `stripSamples` to `ReplayFight`
(`map/replayTypes.ts:47`).

Render as two thin stacked sub-lanes *below* the DPS area, not overlaid on
it: DPS runs in the hundreds of thousands and CC counts in single digits,
so a shared y-axis flattens one to the baseline. Each sub-lane normalizes
independently and toggles on/off; both inherit the existing playhead, phase
bands, and scrub handling.

Cost: ~300 numbers per fight per lane.

### (b) Two new sections

CC and strips have different homes in the existing taxonomy:

- `cc-timeline` -> **Offense**, after `offense-detailed` (which already
  owns CC).
- `strip-timeline` -> **Boons & Strips**, immediately after `strip-spikes`.
  Outgoing/incoming is a toggle within the section — same grid, different
  lane.

`strip-spikes` is not duplicated by this: it holds per-fight totals per
player (`strips`, `stripTime`, `stripDownContrib`, with peak-*fight*
tracking) and has no time axis inside a fight. Its name means "which fight
was biggest", not "which moment".

Both new sections render the same visual object — player rows x 5s bucket
columns, intensity-shaded cells — so they share a new `BucketGridTable`
component. Filter and selection state live in the section components, not
`StatsView.tsx`, which is past 3,400 lines.

`StabPerformanceSection` is deliberately *not* retrofitted onto
`BucketGridTable` here. Its cells layer stack counts, death marks, and
distance semantics; generalizing that would place the riskiest change in
this work next to the least valuable one. Revisit once `BucketGridTable`
has proven its shape on two simpler consumers.

### (c) Stab Performance overlay

`showIncomingHeatmap: boolean` becomes:

```ts
heatmapOverlay: 'none' | 'incoming-damage' | 'strips-taken'
```

Two booleans would permit both overlays at once, and both tint the same
cell background — there is no coherent render for that. A mode makes the
exclusivity structural rather than a runtime rule. The strips-taken lane is
per-player incoming on the 5s grid the section already uses, so it drops
into the existing cell renderer with a different palette.

## 4. Sequencing, testing, failure modes

### Order

1. axilog schema + producers + sum-invariant tests; release from `main`
   with a `docs/CHANGELOG.md` section.
2. Bump the exact pin in AxiBridge; regenerate fixtures.
3. AxiBridge readers, accumulator, and the three surfaces.

Steps 1 and 3 are separable: the UI can be built against a hand-written
fixture while the release is in flight.

### Fixture regeneration

Every axilog bump re-digests the native-json baseline because
`axilog.version` is embedded — `facade_identity` going red is expected, not
a regression. The real check is diffing `parseFileEi` output on the fixture
before and after. Adding fields to `EntitySeries`/`SquadSeries` should not
touch the EI-compat surface at all; if it does, something is wrong.

### Tests

- **axilog sum-invariants** — the whole safety net for attribution and
  bucket-boundary errors.
- **Frame round-trip** — the new accumulator joins
  `slice/__tests__/aggregatorFrames.test.ts`. Extract -> merge must equal
  direct ingest, or the worker path diverges from the inline path above 8
  logs.
- **Taxonomy** — `statsTaxonomy.test.ts` guards id uniqueness; the two new
  ids need checking against anchors as well as nav entries.
- **Degradation** — a log with no per-entity lanes yields an empty result,
  not a throw and not a grid of zeros.

Run with `--maxWorkers=2`. Load fixtures via `readFileSync`, never a static
`import` — a 30 MB fixture import OOMs `tsc --noEmit` at 8 GB and takes
`validate` down with it.

### Docs

`src/shared/metrics-spec.md` is the source of truth and needs entries for
the three new series — in particular that outgoing strips credit the
remover and are counted at boon-removal events, which is not evident from
the UI. Then `npm run sync:metrics-spec`.

### The failure mode to watch

Silent zeros. Three separate causes produce an all-zero grid —
`rawTimelineArrays` off, a log parsed before the bump, and a genuinely
strip-free fight — and only the third is real. Distinguishing them at the
data layer rather than guessing in the component is why the accumulator
returns absent-vs-empty instead of a zero-filled array.
