# Fight Slicer Phase B — Web Report Slicing (design)

Phase A shipped an ephemeral fight slicer in the desktop app
(`docs/superpowers/specs/2026-08-22-fight-slicer-design.md`). Phase B puts a slicer
in the **published web report** and makes a slice a shareable link, so a guild can
send someone "our stats against this comp" without republishing.

## Problem

A published report ships one frozen aggregation. `src/web/reportApp.tsx:1774` renders
`<StatsView logs={[]} precomputedStats={report.stats} />` — there are no per-fight
inputs in the payload, so there is nothing to recompute from. Any web slicer needs
new payload, and new payload on GitHub Pages is the thing we are trying to avoid:
`report.json` already runs ~420–490 KB/fight and the repo is the storage budget.

## Measurement

Measured on the seven-fight `20260117` night in `test-fixtures/native/` (38 players),
comparing all-fights aggregation against per-fight aggregation, `replayFights`
stripped from both to match the publish path.

| | raw | vs baseline | gzip -9 | vs baseline |
|---|---|---|---|---|
| Baseline `report.json` stats | 3.35 MB | 1.00x | 0.56 MB | 1.00x |
| Per-fight, everything | 8.23 MB | 2.45x | 1.06 MB | 1.90x |
| **Per-fight, derived sections omitted** | **6.46 MB** | **1.93x** | **0.87 MB** | **1.56x** |

Two findings drive the design.

The per-fight payload compresses *better* than the baseline (7.8x vs 6.0x) because
per-fight tables repeat the same accounts, professions and key names across every
fight. The real cost is the gzip column: **1.56x, not 2.45x**.

Derived sections — `leaderboards`, `topStatsLeaderboardsPer{Second,Minute}`,
`boonLeaderboards`, `topSkills*`, the whole MVP family, `roleClassifications` — are
computed from the player tables, not from raw logs. Omitting them costs **zero
features**, because they recompute in the browser. The MVP family specifically is
~5.4% of the payload and sits inside that free bucket, so excluding MVPs from slice
mode would give up a user-facing feature for nothing. It is not in this design.

Caveats on the measurement: one dataset; per-fight cost scales with roster size (real
reports run 39–73 players); single-fight finalize output was used as a proxy for
per-fight state, which is an upper bound for the linear sections.

## Design

### 1. The sidecar

A new artifact, `slice.json.gz`, sits beside `replay.json`. It contains one **slice
frame** per fight: the minimal mergeable state needed to re-run `finalize()` for an
arbitrary subset of fights.

```
{
  "version": 1,
  "settingsHash": "<hash of the settings the frames were built under>",
  "fights": [ { "id": "...", "label": "EBG: Klovan", "timestamp": 0,
                "durationMs": 0, "isWin": true, "enemyClassCounts": {} } ],
  "frames": [ { /* frame for fights[0] */ }, ... ]
}
```

`fights[]` is the roster the tray renders — the same `FightRosterEntry` shape Phase A
already defined in `src/renderer/stats/statsStore.ts:25`. Fight order is the frozen
publish order, which is what makes ordinal-based addressing stable.

**Derived sections are excluded structurally, not by a strip list.** A frame carries
pre-finalize state, so leaderboards and MVPs cannot be in it by construction — there
is no denylist to drift out of date. This is why the 1.56x figure is the design
target rather than an optimisation to chase later.

### 2. Frame content, per module

`IncrementalAggregator` (`src/renderer/stats/incrementalAggregation.ts:505`) holds two
kinds of state, and the frame treats them differently.

**Per-log arrays** — `logMetas`, `timelineEntries`, `fightBreakdowns`,
`fightDiffModes`, `healEffectivenessResults`, `tagDistanceDeathsResults`,
`distanceToTagContribs`, `onTagReviewContribs`, `incomingDamageEntries`,
`squadCompEntries`. A frame carries this fight's entries; merging is concatenation.
No new merge logic.

**Accumulators** — `playerAcc`, `commanderStatsAcc`, `spikeAcc`, `allDamageAcc`,
`stripSpikesAcc`, `incomingStrikeAcc`, `skillUsageAcc`, `boonTimelineAcc`,
`boonUptimeAcc`, `stabPerfAcc`, plus `mergedDamageModMap`, `personalDamageModKeys`,
`mapCounts`, `enemyNameCounts`. Each owning `compute*.ts` module gains a
`serialize` / `deserialize` / `mergeInto` trio next to its existing
`create*` / `ingestLog*` / `finalize*`.

**One exception.** `boonTableLogs` (`incrementalAggregation.ts:563`) stores the entire
raw `details` object per log. Serialising it verbatim would put ~4 MB of raw log into
every frame. That frame instead carries the **finalized per-fight boon table**, and
merging re-weights by fight duration.

### 3. The correctness invariant

Every module gets the same test, and it is the whole safety argument:

```
finalize(merge(frame(A), frame(B))) === finalize(ingest(A); ingest(B))
```

Run against the `test-fixtures/native/` seven-fight series, per module and then
end-to-end over the full aggregation. A module that cannot satisfy this is a module
whose section does not appear in slice mode — that is the escape hatch, and it is
per-section rather than all-or-nothing.

**Known risk:** the boon-tables exception is the one place where the invariant is not
obviously satisfiable, because merging finalized tables is not the same operation as
ingesting raw details. The implementation plan opens with a task that proves or
disproves duration-weighted merge equivalence for `buildBoonTables` before any other
module is touched. If it fails, boon tables are excluded from slice mode and the tray
says so.

### 4. Hosting — R2 only

`slice.json.gz` is uploaded to Cloudflare R2 alongside `replay.json`, using the same
per-user credentials already in Settings (`R2_FIELDS`,
`src/main/handlers/githubHandlers.ts:459`) and the same CORS auto-provisioning
(`:539`). The pointer lands in the payload as `stats.sliceDataUrl`, mirroring
`stats.replayDataUrl` (`:1857`).

`planReplayHosting` (`:669`) generalises to `planSidecarHosting({ kind, bytes, r2Url,
reportId, baseUrl })`, keeping its existing `{ mode: 'r2' | 'pages' | 'dropped' }`
contract. The replay call site passes `kind: 'replay'` and behaves exactly as today.

**Sidecars do not fall back to Pages.** For replay, a Pages fallback is right — a
replay is one artifact and dropping it loses a feature outright. For slice frames it
is wrong: the fallback would silently spend 1.56x of the repo's storage budget, which
is the cost this design exists to avoid. With no R2 configured the report publishes
byte-for-byte as it does today and the published report has no slicer. The publish
dialog says so once, with a pointer to the R2 settings.

This is the main tradeoff in the design: web slicing becomes an R2-user feature.
It follows directly from the constraint that hosting is either fully Axi-funded or
entirely user-configured — R2 is already the user-configured path, and it is already
shipping.

### 5. Cost, in absolute terms

At ~124 KB/fight gzipped, a 25-fight night is a ~3.1 MB sidecar. R2's free tier
(~10 GB) holds on the order of three thousand of them. The GitHub repo is untouched.

The sidecar is gzipped at build time and fetched with `DecompressionStream('gzip')`.
`r2PutObject` (`githubHandlers.ts:605`) sets `Content-Type` explicitly and sets no
`Content-Encoding`, so the browser hands us the compressed bytes verbatim rather than
transparently inflating them — the same shape as the `.json.gz` behaviour verified on
Pages during the earlier spike.

### 6. Viewer behaviour

**The sidecar is never fetched on load.** A cold visit to a published report costs
exactly what it costs today. The fetch happens on the first of: the user opening the
slice tray, or the page loading with a `slice=` parameter. This keeps the feature free
for the overwhelming majority of views.

Recompute runs in the existing stats worker. The web bundle already imports
`src/renderer/stats/` and already ships the worker chunk
(`useStatsAggregationWorker.ts:256`), so no browser port of the aggregation is needed —
the worker gains a `mergeFrames` message alongside its existing ingest path.

UI reuses Phase A verbatim: `FightSlicePill`, `FightSliceBanner` and `FightSliceTray`
(`src/renderer/stats/components/FightSliceTray.tsx`) all read `useStatsStore`, which
the web bundle already has. Web adds one control — **Copy slice link** — in the banner.

Slice-mode stats use the **publisher's** settings, read from
`report.stats.statsViewSettings`. Frames are built under one settings hash and
`settingsHash` is recorded in the sidecar; a mismatch (a viewer built against a
different aggregation) disables slicing rather than rendering wrong numbers.

### 7. Addressing

A slice is a bitmask over fight ordinals, base64url-encoded, as a **query
parameter** alongside the existing `report` and `view` params
(`src/web/reportApp.tsx:38-45`):

```
https://user.github.io/repo/?report=<id>&slice=Bx4
```

Fourteen fights fit in three characters, sixty in eleven. Not the fragment: the hash
is already the section-anchor channel (`reportApp.tsx:747`, `resolveSectionTarget`),
and a slice must survive a jump to a section. Pages ignores query strings, so this
needs no routing changes and the link works on any host. The URL is the entire
persistence model: no saved slices, no named groups, no server state.

Ordinals are stable because a published report is frozen. If the sidecar's
`fights.length` disagrees with the bitmask width, the slice is rejected and the full
report renders with a notice — a stale link degrades to the truth rather than to
silently-wrong numbers.

### 8. Deep-link load order

Landing on a `slice=` URL paints the full report first, then applies the slice when
the sidecar resolves, with the banner reading "Applying slice…" in between. Blocking
first paint on a multi-megabyte fetch would be a worse trade than a brief flash of
unsliced numbers, and the banner makes the transition legible rather than surprising.

## Out of scope

- **Republishing a slice.** A slice is a view, not a report. It does not touch
  `reports/index.json` or `rollup.json`.
- **Saved or named slice groups.** The URL is the persistence.
- **Delta stats** ("this slice vs all fights"). Same exclusion as Phase A.
- **Re-tuning settings in the browser.** Slice mode uses the publisher's settings.
- **Editing the roster** — adding or removing fights requires republishing.

## Testing

- Per-module merge-equivalence tests against `test-fixtures/native/`, as above.
- End-to-end equivalence: a full aggregation over all seven fights reconstructed from
  seven frames must match `computeStatsSync` over the same seven logs.
- A size-regression test asserting the sidecar stays under a per-fight byte budget, so
  a future section that accidentally carries raw details fails loudly rather than
  quietly tripling the sidecar.
- `planSidecarHosting` unit tests extending `r2ReplayHosting.test.ts`, including the
  no-R2-means-no-sidecar path.
- Bitmask round-trip tests: encode, decode, width mismatch, malformed input.
- Playwright: load a published fixture report with a `slice=` parameter, assert the
  banner and the sliced numbers; assert a cold load issues no sidecar request.
