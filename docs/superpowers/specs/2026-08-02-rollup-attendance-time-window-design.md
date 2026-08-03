# Rollup Attendance Time-Window Filter — Design

**Date:** 2026-08-02
**Status:** Approved approach (A + C from brainstorm); spec pending user review

## Problem

Guild leads want to "reset" attendance tracking after a roster purge without deleting
their fight reports. The all-time rollup page (`?view=rollup`) accumulates Runs /
Combat Time / Squad Span forever, so after a purge there is no way to see "who is
attending *now*" — e.g. on a monthly basis — short of deleting history.

## Insight

No destructive reset is needed. The rollup viewer already recomputes everything
client-side from per-report sources that each carry `meta.dateStart`
(`buildRollupData(parsed.sources)` in `src/web/reportApp.tsx`). Filtering the sources
by date before aggregating gives windowed attendance for free — retroactively, for
any past purge, with nothing stored and nothing deleted.

**Out of scope (explicitly):** no persistent epoch/reset marker, no publish-flow or
`rollup.json`/`attendance.json` contract changes, no AxiRoster changes (its retention
model already time-windows internally; its roster Attendance % stays all-time).

## Design

### UI (web rollup page only)

A "Time Window" strip between the KPI cards and the tables, in the existing glass
style:

- Preset pills: **All time** (default) · **Last 30 days** · **Last 90 days**
- A **month select** listing every month that has raids, newest first, labeled
  `Jul 2026 · 14 raids`. Months are derived from the (unfiltered) sources.
- When a window is active: the header raids pill and strip show the window plus an
  "of N all time" hint so history doesn't look deleted.

Everything below the strip derives from the windowed rollup, with **no changes to
`buildRollupData` or the tables**: KPI cards, commander table, players table, and
their "Showing X of Y" counts all recompute coherently because the filter is applied
to `sources` before aggregation.

If a window contains no raids, `buildRollupData([])` yields empty rows and the
existing empty-state messaging shows (worded to mention the window).

### State/data flow changes in `reportApp.tsx`

1. Replace `rollupData` state with `rollupSources: RollupReportPayload[] | null`.
   All three loader paths (precomputed sources; sources + legacy backfill; legacy
   fetch-everything) `setRollupSources(...)` instead of building immediately.
2. `rollupData = useMemo(() => rollupSources && buildRollupData(filterSourcesByWindow(rollupSources, timeWindow, now)), ...)`.
3. **Failed-report accounting fix:** the "N reports could not be loaded" calculation
   currently reads `rollupData.sourceReports`; it must compare against the
   *unfiltered* `rollupSources.length`, otherwise an active window would fake load
   failures.
4. `timeWindow` state, initialized from the `window` URL search param; changes write
   back via `history.replaceState` so views are shareable/bookmarkable
   (`?view=rollup&window=2026-07`). Matches the existing search-param routing.

### Pure helper module `src/web/rollupTimeWindow.ts`

Window encoded as a string (doubles as URL param and select value):
`'all' | '30d' | '90d' | 'YYYY-MM'`.

- `parseWindowParam(raw: string | null): string` — validate, default `'all'`.
- `sourceTimestamp(source): number | null` — `Date.parse` of `meta.dateStart`,
  falling back to `dateEnd`, then `generatedAt`.
- `filterSourcesByWindow(sources, window, nowMs)` — `'all'` is a passthrough;
  day windows compare against `nowMs`; month windows match the viewer's local
  year/month of the parsed timestamp.
- `listSourceMonths(sources): { value, label, raidCount }[]` — distinct months,
  newest first.

### Semantics & edge cases

- `meta.dateStart` is a UTC ISO string (`toISOString()` at upload). Month bucketing
  uses the **viewer's local time**; raids near midnight UTC may land in a different
  month for viewers in other timezones. Accepted — raid nights are local-evening
  events and this matches how guilds think about "July attendance".
- Day-window presets are relative to the viewer's current time.
- Sources with no parseable date (degenerate legacy case) appear only in All time;
  they cannot be placed in a window. The "of N all time" hint keeps totals honest.
- Legacy path (no `rollup.json`) works identically: full `report.json` payloads carry
  the same `meta.dateStart`.

### Testing

Vitest unit tests for the helper module in `src/web/__tests__/rollupTimeWindow.test.ts`
(mirrors `rollup.test.ts`): param parsing/validation, day-window boundaries, month
bucketing incl. fallback timestamps and dateless sources, month listing order/counts.
UI wiring is exercised manually (mockup already approved for layout).

## Alternatives considered

- **Persistent epoch marker** ("start fresh from date X" stored in published
  artifacts): rejected for now — touches the publish flow and cross-repo contract for
  the same user-visible result. Composes cleanly later as a default value for this
  same filter.
- **Destructive reset** (delete/archive attendance history): rejected — the whole
  point is keeping reports.
