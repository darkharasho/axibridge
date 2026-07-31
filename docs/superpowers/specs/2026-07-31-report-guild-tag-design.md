# Report Guild Tag — Design

**Date:** 2026-07-31
**Status:** Approved

## Purpose

Stamp each published web report with the squad's guild — id, name, and tag —
auto-detected from the session's logs, so the guild acts as a searchable tag:
shown on the report page header, shown as a chip on report listings, and matched
by the existing text search in both the in-app History view and the web report
listing.

## Data flow

```
EI player.guildID (un-pruned)
  → renderer: computeDominantGuildId(detailsList) in buildReportMeta → meta.guildId
  → main (upload-web-report): resolve id → { name, tag } via GW2 API + persistent cache
  → meta.guild = { id, name, tag } injected into the report payload BEFORE report.json builds
  → report.json meta (report page header chip)
  → reports/index.json entry.guild (listing chips + search)
```

## Un-prune `guildID`

Remove `'guildID'` from the player-field deny list in
`src/main/detailsProcessing.ts` (currently listed under "Misc unused"). Cost:
one 36-char GUID per player entry in cached/pruned details (~2 KB per 50-player
log); it does not flow into `report.json`. Details cached before this change
lack the field — those sessions simply produce no guild (graceful null, no
migration, no re-parse forcing).

## Detection (renderer)

New `src/renderer/stats/utils/computeDominantGuildId.ts`:

`computeDominantGuildId(detailsList: any[]): string`

- A player's vote is the guild they are **representing** (`player.guildID`,
  non-empty string); unrepped players are skipped.
- Same guards and vote shape as `computePrimaryCommander`: squad members only
  (`notInSquad` excluded), one vote per account per log (vote key
  `player.account || player.name`, first entry per account per log wins).
- Highest total across the session wins; ties break alphabetically by guild id
  (deterministic); `''` when no votes.

`buildReportMeta()` (`src/renderer/stats/hooks/useStatsUploads.ts`) reuses its
existing `detailsList` collection and adds `guildId: computeDominantGuildId(detailsList)`
to the returned meta.

## Resolution (main)

New `src/main/guildDirectory.ts`:

`resolveGuild(guildId: string, store, fetchImpl?): Promise<{ id: string; name: string | null; tag: string | null }>`

- Cache first: electron-store key `guildDirectory`, shape
  `{ [id]: { name: string; tag: string; resolvedAt: string } }`. Guild names and
  tags are effectively immutable — cache hits never expire or re-fetch.
- Miss: `GET https://api.guildwars2.com/v2/guild/{id}` (public, no auth), 8s
  timeout via AbortController. Success (`name` and `tag` strings present) →
  write cache, return values. Any failure (network, non-200, malformed) →
  return `{ id, name: null, tag: null }` and cache nothing, so the next upload
  retries. Never throws.

Integration in the `upload-web-report` handler (`githubHandlers.ts`): early in
the handler — before the report payload is built and staged — when
`payload.meta.guildId` is a non-empty string, call `resolveGuild` and set
`payload.meta.guild = { id, name, tag }`. When `guildId` is empty/absent,
`meta.guild` stays undefined. Resolution failure still stamps
`{ id, name: null, tag: null }` (id-only; UI renders nothing without a tag).
A `sendWebUploadStatus('Preparing', ...)` line notes resolution only on a cache
miss. Guild resolution must never fail or block the upload beyond its 8s cap.

`indexEntry` (same handler) gains `guild: payload.meta.guild ?? null`.

## Display & search

- **Report page header** (`src/web/reportApp.tsx`): when `meta.guild?.tag`
  exists, render a `[TAG] Name` chip next to the report title (name falls back
  to the tag alone if null — only possible transiently).
- **Web report listing** (`reportApp.tsx`, entries from `reports/index.json`):
  render a `[TAG]` chip on entries that have one; clicking the chip sets the
  listing's search query to the tag. Guild name and tag join the listing's
  text-search haystack.
- **In-app History view** (`src/renderer/FightReportHistoryView.tsx`): same
  treatment — `[TAG]` chip per entry, chip click sets `searchQuery` to the tag,
  and `guild.name`/`guild.tag` join the existing search haystack in
  `filteredEntries`.
- Entries without guild data render no chip and never match guild searches.

## Error handling

- Detection is pure; empty/absent guild data yields `''` → no resolution, no
  stamp.
- Resolution failures are isolated (never throw, never block upload) and
  uncached so they self-heal on later uploads.
- Old index entries lack `guild` — all consumers treat it as optional.

## Testing

- **`computeDominantGuildId`:** dominant wins; tie → alphabetical by id;
  unrepped players skipped; `notInSquad` skipped; one vote per account per log
  (duplicate agent entries); empty input → `''`.
- **`resolveGuild`** (mocked fetch): cache hit → no fetch; miss → fetch, cache
  written, values returned; API failure/non-200/malformed → id-only result,
  nothing cached; timeout path returns id-only.
- **Search:** History-view haystack matches guild name and tag (unit-level on
  the filter function if extractable, else covered by the chip-click test
  setting the query).
- Existing suites stay green; `report.json`/index consumers tolerate absent
  `guild`.

## Out of scope (explicit)

- Multi-guild lists or per-guild breakdowns (dominant guild only).
- Dedicated guild filter dropdowns (text search + chip click only).
- Backfilling previously published reports or re-parsing old logs.
- Guild emblems/images; `{guild}` placeholder in report-webhook titles.
- The dev-only `mock-web-report` path (no guild injection there).
