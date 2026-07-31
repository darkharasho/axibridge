# Report Webhooks — Design

**Date:** 2026-07-30
**Status:** Approved

## Purpose

After a successful "Upload to Web" publish, automatically post the report link to a
configurable list of Discord webhooks. Supports Discord forum channels (the post
creates a forum thread) and a per-webhook templated title such as
`{date} - {day_of_week} - {commander}`.

This list is independent of the existing fight-report webhooks (`webhooks` +
`selectedWebhookId`), which continue to receive per-fight embeds and are untouched.

## Data model

```ts
interface IReportWebhook {
    id: string;            // unique id (Date.now().toString(), matches IWebhook convention)
    name: string;          // display label, e.g. "EWW Reports Forum"
    url: string;           // Discord webhook URL
    enabled: boolean;      // default true — disabled entries are kept but skipped
    isForum: boolean;      // default false — when true, post creates a forum thread
    titleTemplate: string; // default '{date} - {day_of_week} - {commander}'
}
```

Persisted in electron-store under `reportWebhooks` (array). There is no selection
concept: **every enabled entry is posted to** after each successful upload.
`IReportWebhook` and its defaults live in `src/renderer/global.d.ts` alongside
`IWebhook`.

## Template rendering (shared)

New `src/shared/reportWebhookTemplate.ts`, used by main (posting) and the renderer
(live preview in Settings):

- `DEFAULT_REPORT_TITLE_TEMPLATE = '{date} - {day_of_week} - {commander}'`
- `renderReportTitle(template, ctx)` with
  `ctx = { sessionStart: Date; primaryCommander: string; commanders: string[] }`

Placeholders:

| Token | Renders as | Example |
|---|---|---|
| `{date}` | `sessionStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })` | Jul 30, 2026 |
| `{day_of_week}` | `sessionStart.toLocaleDateString(undefined, { weekday: 'long' })` | Wednesday |
| `{commander}` | most-frequent commander, `'Unknown'` if none | Axi Vale |
| `{commanders}` | all commanders comma-joined, `'Unknown'` if none | Axi Vale, Red Tag |

Rules: unknown tokens are left literal; a blank/whitespace template falls back to
the default template; result is trimmed. **`sessionStart` is the first fight's
start time (`meta.dateStart`), not the upload time** — a past-midnight upload still
names the raid night. Rendering happens in main using main's locale/timezone
(same machine as the renderer, so consistent).

## Meta changes (renderer)

`buildReportMeta()` in `src/renderer/stats/hooks/useStatsUploads.ts` gains
`primaryCommander: string`. Extract a pure helper
`computePrimaryCommander(detailsList): string` (testable): votes are keyed by account
(name fallback), one vote per key per log, and display names are the first-seen
character name for each vote key. Filters: squad members only, `hasCommanderTag` required
(same guards as the existing loop). Highest vote count wins, ties break alphabetically
by display name; `''` when no commander was seen. The existing `commanders` array
and `dateStart` already flow to main in the upload payload — no other meta changes.

## Posting (main)

New `src/main/reportWebhooks.ts`:

```ts
postReportToWebhooks(opts: {
    webhooks: IReportWebhook[];      // already filtered to enabled
    meta: any;                       // upload payload meta
    stats: any;                      // upload payload stats
    url: string;                     // final report URL
    onStatus?: (line: string, isWarn?: boolean) => void;
    persistForumFlag?: (id: string, isForum: boolean) => void;
}): Promise<Array<{ id: string; name: string; ok: boolean; error?: string }>>
```

- Posts **sequentially**, each wrapped in try/catch — one failure never affects the
  others or the upload. Never throws. 10s timeout per request (AbortController).
- Body (regular channel):
  `{ username: 'AxiBridge', avatar_url: <existing constant from discord.ts>, embeds: [embed] }`
  where the embed has: `title` = rendered template, `url` = report URL,
  `description` = summary line, `footer.text` = `meta.dateLabel` (session time
  span), `color` = brand red (same constant family discord.ts uses).
- Summary line from stats, omitting missing pieces gracefully:
  `“19 fights • 16W – 3L • Squad KDR 5.56”` (fields: `total`, `victories`,
  `defeats`, `squadKdr`).
- Forum entries additionally send `thread_name` = rendered title **truncated to
  100 chars** (Discord's hard cap).
- **Forum self-heal:** on a 400 whose body indicates a missing `thread_name`
  (Discord error 220001 / message match), retry once with `thread_name` and
  persist `isForum: true` for that entry. Symmetrically, a 400 indicating
  `thread_name` is not allowed retries once without it and persists
  `isForum: false`. At most one retry per webhook per upload.

Integration point: `upload-web-report` handler (`githubHandlers.ts`), after the
publish commit succeeds and the `Complete` status is sent, and only on the path
where a commit was actually published — the early `"No changes to upload."` return
does **not** post (nothing new to announce). Flow: read `reportWebhooks` from the
store → filter enabled → if any, emit `sendWebUploadStatus('Posting', ...)` lines
per result → include `webhookResults` in the handler's return value. Failures are
logged as warnings in the upload log; `success: true` is unaffected.

## Settings UI (renderer)

New "Report Webhooks" card in `SettingsView.tsx`, placed with the web-report
settings. Per row: name input, URL input, enabled toggle, "Forum channel" toggle,
title template input with **live preview** underneath (rendered via the shared
util with sample context: today, current primary commander or "Axi Vale"), and a
delete button. An "Add webhook" button appends a default entry. Soft warning (not
a block) when the URL doesn't start with `https://discord`. Persistence follows
the existing settings flow used by the fight webhooks (`handleUpdateSettings` →
settings IPC → electron-store), plus preload/`global.d.ts` plumbing for the new
key.

## Error handling

- Per-webhook isolation (above); errors surface as warn-styled lines in the
  existing upload log panel (`useWebUpload` log entries already style warnings).
- No retry policy beyond the single forum self-heal attempt.
- Malformed URLs simply fail their POST and get logged.

## Testing

- **Shared template util:** every placeholder, unknown-token passthrough, blank
  template fallback, multi-commander joining, no-commander fallback.
- **`computePrimaryCommander`:** most-frequent wins, tie → alphabetical,
  no-commander → `''`, `notInSquad` excluded.
- **`postReportToWebhooks`** (mocked fetch): regular vs forum request bodies,
  `thread_name` 100-char truncation, self-heal both directions (retries once,
  persists flag), failure isolation (first webhook 500 → second still posts),
  result array shape.
- Handler integration covered by existing `githubHandlers` test patterns if
  present; otherwise the module-level tests above are the coverage.

## Out of scope (explicit)

- Editing/deduping previous Discord posts on re-upload (each upload posts anew).
- Non-Discord destinations, per-webhook embed customization, extra placeholders
  beyond the four listed, posting from the "No changes" path.
