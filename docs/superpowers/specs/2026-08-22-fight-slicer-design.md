# In-Report Fight Slicer — Phase A (desktop)

**Status:** approved design, not yet implemented
**Origin:** Discord — "IDEA: In-Report Log Slicer / Fight Grouping" (thread 1537446286570295387)

## Problem

Guilds fight several different enemy guilds in one night. To see performance against
one specific comp, they currently upload the whole night, work out by hand which
fights were which opponent, then create a *second* upload containing only those
fights. Every comp they want to look at costs another upload.

## Scope

Phase A delivers an **ephemeral, desktop-only** fight slicer: check/uncheck fights in
the Electron stats view and every aggregation recomputes over the selection.

Explicitly out of scope for Phase A:

- **Persistence.** The slice is never written to disk and never survives an app
  restart. There are no saved or named slice groups.
- **Publishing.** Publish always publishes every fight, never the slice.
- **The web report.** A slicer in the published report is Phase B and needs its own
  spec — see "Phase B" below.

## Design

### Slice state

A `Set<string>` of *excluded* log keys (`log.filePath || log.id`), held in the
existing `statsStore`.

Excluded rather than included, so the empty set means "no slice". That makes
unsliced the free default and means newly-ingested logs join the view
automatically instead of being silently omitted.

Keyed on `filePath` rather than fight ordinal because logs are added and removed
while the app is open; ordinals shift underneath a selection and would leave the
slice quietly pointing at different fights.

The state lives in the store rather than in `StatsView` local state so every
section, and the search palette, read one source and cannot disagree.

Stale keys are harmless by construction — an excluded key naming a log that is no
longer loaded simply matches nothing. The set is cleared when the log set is
cleared, so a new session never starts partially sliced.

### Recompute

`App.tsx` owns the aggregation input, not `StatsView` — `useLogsForStats` produces
`logsForStats`, `App.tsx:337` feeds it to `useStatsAggregationWorker`, and
`StatsView` only receives the computed result. So the filter goes in `App.tsx`:

```ts
const slicedLogsForStats = useMemo(
    () => logsForStats.filter(l => !excludedFightKeys.has(statsLogKey(l))),
    [logsForStats, excludedFightKeys]
);
```

Filtering *after* `useLogsForStats` deliberately bypasses that hook's 400ms/2500ms
publish debounce, so slice toggles respond immediately and independently of ingest
churn. Nothing downstream changes: every section already reads the aggregation
result rather than raw logs.

This is cheaper than it looks. The worker holds a module-level `payloadStore` of
full log payloads keyed by identity, which deliberately survives `reset`
(`src/renderer/workers/statsWorker.ts:24`), and the send side already prefers
`{type:'log', ref: payloadKey}` to a full payload when the key is resident
(`src/renderer/stats/hooks/useStatsAggregationWorker.ts:536`).

A slice change is therefore `reset` → `settings` → N small `ref` messages →
`flush`, with no multi-MB structured clone. The cost is `ingestLog` plus
`finalize` — roughly 23ms per log, so a four-fight slice settles in about 100ms
and a full 40-log reset in about a second.

`LogPayloadCache` is bounded by heap pressure rather than count
(`RETENTION_TIERS`: 80 → 24 → lower). Under memory pressure, refs miss and those
logs are re-cloned. This degrades to today's cost rather than breaking.

Toggles are debounced ~250ms and cancelled through the existing token/flush
machinery.

### Consistency

No section reads the raw `logs` prop, and `replayFights` is produced by
`finalize()`, so filtering a single upstream array slices the stat cards, Fights,
Replay and Data Map together. There is no per-section opt-in list to maintain.

### Publish

The publish flow reads `webUploadLogEntries` (`src/renderer/StatsView.tsx:4294`), a
different prop from the `logs` being filtered, so filtering the aggregation input
cannot reach it. Publish keeps publishing every fight with no guard required.

This is load-bearing and accidental, so it gets a test.

### Bulk-settle gate — required fix

`App.tsx:378` gates the promotion of `calculating` logs to `success` on
`lastComputedLogCount < logsForStats.length`. `lastComputedLogCount` is what the
worker actually ingested, which under a slice is the *sliced* count. With a slice
active during ingest that comparison is permanently true, the effect returns early
every time, and logs never leave `calculating` — the same stuck-ingestion failure
class as the earlier Upload-to-Web regressions.

The gate must compare against the sliced array's length, i.e. the same array handed
to the worker. Everywhere `logsForStats.length` is used to reason about *what the
worker has seen* (`App.tsx:378` and its dependency array at `App.tsx:406`) must move
to `slicedLogsForStats.length`. Uses that reason about the whole session stay on
`logsForStats`.

This is the highest-risk part of the change and gets a dedicated test.

### Aggregation cache — opportunistic, not required

`AggregationLRUCache` keys entries on `` `${logCount}:${settingsHash}` ``
(`src/renderer/stats/aggregationCache.ts:55`), which would collide between two
distinct slices of equal size. However, nothing in `src/` imports
`AggregationLRUCache` outside its own test file, and the `inputsHash` written to
`statsStore` (`App.tsx:350`) is never read in production. The collision is therefore
unreachable today.

`hashAggregationSettings` is also duplicated verbatim in `aggregationCache.ts:22`
and `statsStore.ts:5`.

Fold a slice signature into both copies anyway — it is a few lines, and it stops the
dead code becoming a live bug the moment someone wires the cache up. It is *not* a
correctness fix for this feature and must not be described as one.

## UI

A `Slice` pill in the stats header, next to Publish, opening a drop-down tray of
fight cards over the content.

Each card shows the existing per-fight data: label (map plus nearest landmark),
timestamp, duration, win/loss, and `enemyClassCounts` as class swatches. The enemy
comp is the point — distinguishing one GvG from another is the manual step this
feature replaces, and the tray is the only layout wide enough to show it.

Tray toolbar: All / None / Invert, a text filter, and quick filters (wins only,
minimum duration). Flat grid, no grouping in v1.

While a slice is active, a banner sits above the content reading
`Sliced view — 4 of 14 fights · 12m 55s of 1h 47m` with a Clear action, so a
screenshot of a slice cannot be mistaken for the whole night.

Rejected: a persistent left rail (taxes every category with ~230px and is too
narrow for enemy comp) and a bottom dock alone (good status indicator, but
undiscoverable as an entry point).

Deferred: per-stat "vs all fights" deltas. They would make a slice far more
readable, but require holding two aggregations live rather than one. Revisit after
v1.

## Testing

- Bulk settle: with a slice active and logs in `calculating`, the promotion effect
  still runs and promotes — the regression guard for the `App.tsx:378` gate.
- `hashAggregationSettings` produces different keys for two distinct slices of equal
  size — the collision case, explicitly.
- Publish ignores the active slice.
- A slice over a fixture set equals a fresh aggregation over only those fixtures.
- Toggling produces no full-payload re-clone when payload keys are resident.

## Phase B — deferred

A slicer in the published web report, where a slice produces a shareable link.

Two things are known. `src/web/reportApp.tsx:1774` passes `logs={[]}` and
`precomputedStats={report.stats}`, so the published report ships one frozen
aggregation and no per-fight inputs — there is nothing to recompute from, and a web
slicer requires new payload in `report.json`. Given replay already dominates a 31MB
file, deciding what that payload is (per-fight aggregation partials, most likely,
not raw details) is the first question and needs a spike.

Addressing is the second question. A published report is frozen, so fight ordinals
are stable there and a slice can be a base64url bitmask in the URL — 14 fights in
three characters, 60 in eleven. No server state and no saved entities; the URL is
the persistence. This is deliberately not plumbed in Phase A.
