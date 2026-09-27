# Rotation Timeline — Design

**Date:** 2026-09-27
**Status:** Approved design, not yet planned
**Scope:** Sub-project A of three. B (gear & consumables) and C (death recap) get their own specs.

## Intent

dps.report shows, per player, the sequence of skills they cast and when. AxiBridge
does not. The user asked for that, and asked for it first among three gaps.

The view must work for **squad members opening a published `bridge.axi.link`
report**, not only for the user in the desktop app. That is the constraint that
drives every decision below: a published report contains precomputed stats in
`report.json` and has no log details at render time, so rotation must be
precomputed during aggregation.

Success: open a fight, pick a player, see their casts in time order with
durations, gaps, and interrupts legible at a glance — in the desktop app and in a
share link alike.

## What already exists

- `rotation` is emitted by axilog (`rotation: true` is the parser default) and is
  present on 51 of 53 players in `test-fixtures/ei/20260130-193742.json`.
- It is **not** in `PLAYER_DENY` in `src/main/detailsProcessing.ts`, so it
  survives pruning. No parser or axilog release is needed.
- `computeSkillUsageData.ts` already reads `rotation` but keeps only
  `skills.length` as a cast count, discarding every timestamp.
- `computeControlTimeline.ts` is the precompute-during-aggregation pattern to
  copy, including building a human fight label locally because the web report has
  lost the inputs `buildFightLabelV2` derives from.

### Source shape

```json
{ "id": 13022,
  "skills": [
    { "castTime": -198, "duration": 701, "timeGained": 2,    "quickness": -0.005 },
    { "castTime": 503,  "duration": 677, "timeGained": 0,    "quickness": 0.006 },
    { "castTime": 4247, "duration": 307, "timeGained": -307, "quickness": -0.043 }
  ] }
```

Negative `castTime` means the cast began before the log started.
`timeGained === -duration` means interrupted or cancelled.

## Measured payload

One fight from the fixture — 3m18s, 53 players:

| | |
|---|---|
| total casts | 5,781 |
| median casts/player | 102 |
| max casts/player | 276 |
| verbatim JSON, minified | 405,422 bytes |
| verbatim, gzipped | 51,250 bytes |

Verbatim is ~70 bytes/cast, so a 20-fight session would add **~8 MB raw** to a
`report.json` that is already ~31 MB, against a GitHub blob ceiling of ~38 MB raw.
Verbatim therefore breaks uploads and is rejected.

The compact encoding below is ~12 bytes/cast: **~70 KB raw per fight, ~1.4 MB raw
/ ~200 KB gzipped for a 20-fight session.**

## Approaches considered

1. **Desktop-only, live `details` read.** Zero payload, full fidelity, ~1 day.
   Rejected: published reports would permanently show "not available", which is a
   papercut on the share-link feature rather than a feature.
2. **Verbatim precompute.** Simple, one shape everywhere. Rejected on the
   measured 8 MB.
3. **Compact columnar precompute.** ← chosen. Same aggregation hook as (2), a
   wire shape built for size, one decoder and one component serving desktop and
   web from the same structure.

A genuine desktop/web fidelity split was considered and rejected: it buys
`quickness` in one of two venues at the cost of two code paths.

## Data shape

New file `src/renderer/stats/computeRotationTimeline.ts`.

```ts
/** One fight's rotations, compacted for the published report. */
export interface RotationFightData {
    id: string;            // statsLogKey, the identity the other drilldowns use
    label: string;         // buildFightLabelV2 — built HERE, because the web
                           // report has lost the zone/average-position it needs
    durationMs: number;
    palette: RotationSkill[]; // a cast stores its index into this array
    players: RotationPlayerData[];
}

/**
 * One palette entry. `icon` is spelled exactly that, on an object, because
 * the published-report build indexes icon URLs by walking `stats` for keys
 * literally named `icon` (githubHandlers.ts) and `expandIconIndex` reverses
 * it the same way. A parallel `icons: string[]` array would silently miss
 * both passes and ship ~84 raw CDN chars per palette entry per fight.
 */
export interface RotationSkill {
    id: number;            // canonical skill id
    name: string;          // curated name, never "Skill <id>"
    icon?: string;         // becomes a number in a published report
}

export interface RotationPlayerData {
    key: string;           // `${account}|${profession}`, matching computeSkillUsageData
    displayName: string;
    profession: string;
    group: number;
    activeMs: number;      // activeTimes[0], for cast density
    skill: number[];       // palette indices
    dt: number[];          // cast times: dt[0] absolute, rest deltas
    dur: number[];         // cast durations, ms
    interrupted: number[]; // sparse ascending indices into the arrays above
}
```

Decisions:

- **Casts are sorted by `castTime` ascending before encoding**, flattening EI's
  group-by-skill nesting. Delta encoding requires monotonicity and a timeline
  reads in time order. `dt[0]` stays absolute and may be negative.
- **`palette` is per-fight, not per-report.** Per-report dedupes better
  but couples every fight to a shared table the trimmer cannot drop
  independently. Per-fight costs ~2 KB each and keeps a fight self-contained.
- **`interrupted` is a sparse index list**, derived from
  `timeGained === -duration`. Typically a handful of entries per player.
- **`quickness` is dropped.** A float per cast is the single most expensive
  field and a timeline does not read it.
- **Players with `notInSquad` are skipped**, and a fight with no rotation data is
  **omitted from the array entirely** rather than included as an empty husk.
- Palette ids go through `canonicalSkillId(details, id)` so a cast id and its hit
  id share one entry, and names through `isPlaceholderSkillName` so axilog's
  synthesized `"Skill <id>"` string cannot leak a raw id into the UI.

## Aggregation and the wire path

Five functions matching the `computeControlTimeline` contract, wired into
`IncrementalAggregator` at the four sites that pattern already touches:

```ts
createRotationTimelineAccumulator()
ingestLogRotationTimeline(log, acc)      // near incrementalAggregation.ts:906
extractRotationTimelineFrame(acc)        // :1036 — worker → main frame
mergeRotationTimelineFrame(acc, frame)   // :1144 — dedupe by fight id
finalizeRotationTimeline(acc)            // :1184 → stats.rotationTimelineDrilldown
```

This is simpler than the control timeline: control sums 1s native series into
shared 5s buckets, so its merge does arithmetic. Rotation is strictly per-fight —
one log in, one `RotationFightData` out. `merge` is a concat with dedupe by fight
id.

The same module exports the reader side, so the encoding has exactly one
implementation and exactly one inverse:

```ts
/** Expands one player's delta arrays back into absolute casts, in time order. */
decodeRotation(fight: RotationFightData, player: RotationPlayerData): Array<{
    skillId: number; name: string; castTime: number; duration: number; interrupted: boolean;
}>
```

Desktop and web both render from `decodeRotation`. Nothing outside this module
touches `dt`/`skill`/`interrupted` directly.

`finalize` returns `{ fights, recorded }`. `recorded` is true if any ingested log
carried rotation data, which distinguishes three states rather than two:

| `recorded` | `fights` | Means |
|---|---|---|
| `false` | `[]` | no log had rotation — pre-axilog history, needs a re-parse |
| `true` | populated | normal |
| `true` | `[]` | dropped by the upload trimmer |

The third row is why the flag exists. The control timeline has the same hole
today and renders it as an indistinguishable blank; this spec does not add a
second section with that defect.

### Trim order

One entry in `src/main/handlers/githubHandlers.ts`, immediately after
`controlTimelineDrilldown`:

```ts
{ label: 'rotationTimelineDrilldown', apply: () => clearArray((stats as any).rotationTimelineDrilldown, 'fights') },
```

Deliberately not near the front. `replayFights` leads because it is ~66% of
`report.json`; rotation at ~200 KB gzipped is a small fraction, so an early
sacrifice would cost the feature to save almost nothing.

The trimmer runs on the published report only, so a share link from a very large
session can show the "dropped to fit the upload limit" state while the desktop
app shows the timeline. That is existing behaviour for every trimmed section.

## Section UI

`RotationSection.tsx` under `src/renderer/stats/sections/`, delegating drawing to
a `RotationTrack.tsx`, the same split `CcTimelineSection` uses with
`BucketGridTable`. Registered in `statsTaxonomy.ts` next to `skill-usage`:

```ts
{ id: 'rotation', label: 'Rotation', icon: ListOrdered,
  description: 'Per-cast timeline for one player.',
  keywords: ['rotation', 'casts', 'timeline', 'skill order'] }
```

Layout:

- **Fight selector in the header**, matching every other drilldown. Fights with
  no rotation data do not appear in it.
- **One player at a time, chosen from a grouped list.** 53 players × ~100 casts
  cannot be stacked legibly. The list doubles as an overview: profession colour,
  squad subgroup headings, cast count per player, filter box.
- **Time wraps rather than scrolls**, at a selectable 15/30/60s per row. At one
  screen width a 3m18s fight gives each cast ~4px; wrapping at 30s makes a 700ms
  cast a readable box and fits the whole fight on one screen.
- **Width encodes duration, position encodes cast time.** This is what makes gaps
  visible, which is the thing a rotation review is looking for. Casts straddling
  a row boundary are drawn clipped in both rows, never duplicated or dropped.
- **Two borders carry the two edge cases**: red for interrupted/cancelled, dashed
  blue for began-before-log-start. Both in the legend — an unexplained red box
  reads as an error.
- Skill icons come from `details.skillMap[\`s${id}\`].icon`, captured into the
  palette at ingest — the same source Skill Usage uses. In a published report
  they are indexed to integers by the existing `iconIndex` pass and expanded by
  `expandIconIndex`. No new icon plumbing.
- Header chips (casts, active time, casts/min, interrupted, distinct skills) are
  all derivable from the stored arrays.

## Error handling

| Case | Behaviour |
|---|---|
| log has no `rotation` | fight omitted; `recorded` false → "needs re-parse" state |
| entry has no `id`, or empty `skills` | skipped during ingest, as `computeSkillUsageData` does |
| id has no curated name | `SPECIAL_SKILL_NAMES`, then the `isPlaceholderSkillName` guard; the cast is still drawn, but **never** labelled with a raw id |
| negative first `castTime` | clamped to 0 for layout; original value shown in the tooltip |
| `duration: 0` | minimum 1.05% track width so it stays hoverable |
| `rotationTimelineDrilldown` undefined (older `report.json`, newer viewer bundle) | section hides itself entirely |

The last row is not hypothetical: published reports keep the bundle from their
last publish, and the reverse pairing occurs whenever the site bundle is
refreshed ahead of a report.

## Testing

In rough order of regression-catching value:

1. **Round-trip against the real fixture.** `test-fixtures/ei/20260130-193742.json`
   → encode → decode → equals the original casts sorted by `castTime`, modulo the
   deliberately dropped `quickness`. All 51 players, all 5,781 casts. This
   protects the delta encoding, where a subtle bug would hide.
2. **Size guard.** Assert encoded bytes-per-cast on that fixture stays under ~14
   (against the ~12 projected). A well-meant extra field is how this feature
   turns into an upload failure later; a raw number in a test is the cheapest
   tripwire.
3. **Frame merge.** Two worker frames with overlapping fight ids merge to one
   entry each, not duplicates.
4. **Placeholder names.** An id absent from `skillMap` never renders as a raw id
   — asserted on the string, not the element.
5. **Component tests** for the three `recorded`/`fights` states, plus interrupted
   and pre-log rendering.

Vitest runs at `--maxWorkers=2`. The fixture is read with `readFileSync`, not a
static `import` — a static import of a large fixture OOMs `tsc --noEmit` at 8 GB
and breaks `npm run validate`.

## Side effects in scope

- `src/main/dpsReportTypes.ts:66` declares `rotation?: Array<{ id: number; skills?: number[] }>`.
  `skills` is not `number[]`; it is the object array shown above. Corrected as
  part of this work.
- `casts/min` is a derived metric, so it gets a short entry in
  `src/shared/metrics-spec.md` followed by `npm run sync:metrics-spec`.

## Explicitly out of scope

- `quickness` per cast, anywhere.
- Multi-player or squad-wide stacked rotation comparison.
- Rotation for non-squad players (`notInSquad`).
- Sub-projects B (gear & consumables) and C (death recap). C additionally
  requires upstream axilog work: axilog emits only `{ deathTime }`, with no
  `toDown`/`toKill` arrays.
