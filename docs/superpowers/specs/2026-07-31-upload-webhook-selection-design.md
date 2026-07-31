# Upload-to-Web webhook selection — design

**Goal:** When publishing a web report, let the user choose which report webhooks
the report link is posted to — one, several, or none (report-only). Replaces the
current all-enabled-automatically behavior with a per-publish prompt.

## Current behavior

- `StatsHeader` renders "Upload to Web" (a split button; the chevron opens a menu
  of alternate repo targets). Clicking either entry point uploads **immediately**.
- After the report publishes, `upload-web-report` (`githubHandlers.ts` ~2101)
  reads `store.get('reportWebhooks')`, keeps every `enabled && url` hook, and posts
  to all of them. The user has no per-publish choice.

## Design

### Interaction — prompt each time

Clicking "Upload to Web" (or an alternate target in the repo menu) no longer
uploads directly; it **opens a popover** anchored under the button. The upload
runs only when the user confirms from the popover.

Skip the popover entirely when there are **zero** enabled report webhooks — upload
immediately, exactly as today (no new friction for users without webhooks).

### The popover — "Publish report"

- Header: title "Publish report", subtitle "Post the report link to…", and a
  right-aligned toggle: **"Clear all"** when every row is checked, otherwise
  **"Select all"**.
- One row per **enabled** webhook (`enabled && url`): a checkbox and the webhook's
  `name`; forum webhooks (`isForum`) get a small "forum" tag. `IReportWebhook` has
  no channel field, so there is no channel subtitle (the mock's `#channel` lines
  were illustrative). A blank `name` falls back to `Webhook N` (1-based index).
- Muted note: "Leave all unchecked to publish the report without posting to Discord."
- Footer: **Cancel** and a primary button whose label is live:
  - ≥1 checked → "Publish · post to N"
  - 0 checked → "Publish" (report-only)
- Pre-checked from the remembered selection each time it opens (see Persistence).
- Lives in a dedicated `PublishWebhookPopover` component (StatsHeader is already
  large); dismisses on outside-click / Escape, like the existing repo menu.

### Data flow

The chosen webhook ids ride the existing upload path as a new field
`reportWebhookIds: string[]`:

`PublishWebhookPopover` → `useStatsUploads.handleWebUpload` / `handleWebUploadToTarget`
→ `onWebUpload(payload)` → `useWebUpload.handleWebUpload` → `electronAPI.uploadWebReport(ipcPayload)`
→ main `upload-web-report` handler.

The handler replaces its filter with a pure helper
`selectReportWebhooks(webhooks, selectedIds?)` (new, in `src/shared/reportWebhooks.ts`):

- `selectedIds` an array → keep hooks that are `enabled && url && selectedIds.includes(id)`.
- `selectedIds === []` → returns `[]` → the whole "Posting…" block is skipped
  (report-only; no status line, no `postReportToWebhooks` call).
- `selectedIds` **absent/undefined** → current behavior: all `enabled && url`.
  Preserves back-compat for any caller that doesn't send the field and the
  dev-only `mock-web-report` path (which stays untouched).

### Persistence — remember last selection, new webhooks default checked

Two arrays in settings, written on Publish:

- `reportWebhookSelection: string[]` — the ids that were checked.
- `reportWebhookSeen: string[]` — the enabled webhook ids shown that time.

Pre-check rule when the popover opens (pure helper
`computeInitialWebhookSelection(enabledWebhooks, selection, seen)` in
`src/renderer/stats/utils/reportWebhookSelection.ts`): an enabled webhook is checked
when its id is in `selection` **or** its id is not in `seen` (i.e. added since last
publish → default checked). First run (no stored arrays) → all checked. This makes
a hook you unchecked last time stay unchecked, while a genuinely new hook defaults on.

### Error handling

- Webhook posting already never fails the upload (failures log into the status
  feed). Unchanged.
- Selecting none is a valid, deliberate outcome — the report still publishes.
- If the popover's webhook list is somehow stale (a hook deleted between open and
  publish), `selectReportWebhooks` filters by the live `store` list, so stale ids
  simply match nothing.

## Components / files

- `src/shared/reportWebhooks.ts` — add `selectReportWebhooks(webhooks, selectedIds?)`.
- `src/main/handlers/githubHandlers.ts` — read `payload.reportWebhookIds`, use the
  helper, skip the post block when the result is empty.
- `src/renderer/stats/utils/reportWebhookSelection.ts` — new
  `computeInitialWebhookSelection` helper.
- `src/renderer/stats/ui/PublishWebhookPopover.tsx` — new popover component.
- `src/renderer/stats/ui/StatsHeader.tsx` — route both upload entry points through
  the popover; render it.
- `src/renderer/stats/hooks/useStatsUploads.ts` — load enabled report webhooks +
  remembered selection from settings; thread `reportWebhookIds` into the payload;
  persist selection/seen on publish.
- `src/renderer/app/hooks/useWebUpload.ts` + IPC payload type — carry
  `reportWebhookIds` through to the handler.
- Types: extend the upload payload interfaces (not `ReportMeta` — this is a publish
  parameter, not report data).

## Testing

- `selectReportWebhooks`: subset selection posts to the subset; `[]` → none;
  `undefined` → all enabled; disabled and url-less hooks excluded regardless.
- `computeInitialWebhookSelection`: in-selection checked; unchecked-last-time stays
  unchecked; unseen (new) defaults checked; first-run (empty) → all checked.
- Existing `reportWebhooks` and `githubHandlers` suites stay green.

## Out of scope

- No change to the per-fight Discord webhooks (a separate list).
- No change to `mock-web-report`.
- Repo-target selection stays on the existing split-button; the popover is
  webhooks-only.
