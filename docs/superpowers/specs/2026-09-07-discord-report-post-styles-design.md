# Discord report post styles

Date: 2026-09-07
Status: design, awaiting review

## Problem

Publishing a web report posts a Discord message that throws away almost
everything it knows. `postReportToWebhooks` receives `opts.stats` — the full
`IncrementalAggregator` output, with 19 leaderboards, per-map fight counts,
kills/downs/deaths for both sides, average squad and enemy size, and a
per-fight timeline. It reads three fields.

The resulting embed is a title, a one-line description
(`12 fights • 8W – 4L • Squad KDR 2.31`, built by `buildReportSummaryLine`),
and a date footer. For a raid night's worth of data that is close to nothing,
and it gives no reason to look at the post itself rather than immediately
clicking through.

The goal: make the report post carry the session, at three levels of effort
the user picks per webhook.

## Direction

`ReportPostStyle = 'text' | 'hybrid' | 'graphic'`, declared in
`src/shared/reportWebhooks.ts` alongside `IReportWebhook` and stored on it.
Three styles, selectable per report webhook.

- **`text`** (default) — no image. Squad, enemy, and size KPIs plus the map
  split, then nine leaderboards at top-3, as embed fields. Numbers stay
  selectable and copyable; nothing can fail to render.
- **`hybrid`** — a generated banner (guild tag, session window, fight count,
  W–L, KDR, KPI strip, stacked map bar) in the embed's image slot, with the
  leaderboards below it as text fields.
- **`graphic`** — the card absorbs everything: both KPI rows, the map bar, a
  per-fight sparkline coloured by result, and the top-1 of six leaderboards
  with class icons. The embed drops to title and link.

`text` is the default so existing webhooks keep working exactly as they do
now, only richer.

Rejected: a global style setting. `IReportWebhook` already carries per-hook
`titleTemplate`, `isForum`, and `forumTagIds`; someone posting to their own
guild's forum and to a friend's server usually wants different things in each.

## The board set is fixed

Nine of the 19 leaderboards ship, in this order: damage, healing, barrier,
cleanses, strips, stability, CC + interrupts, down contribution, closest to
tag. Top-3 each.

No per-board toggles in v1. The per-fight embed's `IEmbedStatSettings` has
~24 of them, which is a lot of settings surface for a payload most people
never tune — and a fixed list is what lets `buildReportEmbed` guarantee the
field and character budgets instead of validating every combination a user
can produce. Toggles are additive later, once it is clear which boards people
actually ask for.

## Rendering approach

The card is drawn by a hidden `BrowserWindow` and captured with
`capturePage()`.

Two alternatives were considered and rejected:

- **Renderer-side `<canvas>` + `toDataURL()` over IPC.** Zero new
  dependencies and no extra window, but the whole card becomes imperative
  drawing code — manual text measurement, wrapping, bar geometry. Every
  design tweak turns into arithmetic, and variable-width account names are
  the worst part to hand-measure.
- **`sharp` + an SVG string.** `sharp` is currently a devDependency only
  (`^0.35.3`, used by `scripts/generate-hires-tiles.mjs`) and is not in
  `build.files`. Promoting it would put a native module with per-platform
  binaries into the shipped app — the optional-dependency packaging failure
  mode this repo has hit before. SVG text also has no wrapping, with
  per-platform font resolution differences on top.

The window approach adds no dependencies, keeps layout in CSS (which is cheap
to iterate on, and lets the design mocks become the template nearly verbatim),
and loads class icons over `file://`. `BrowserWindow` is already constructed
in main (`src/main/handlers/settingsHandlers.ts:344`), so a hidden window is
not a new pattern.

## Components

### `src/shared/reportCardModel.ts`

`buildReportCardModel(meta, stats) -> ReportCardModel`

A pure function over plain data — no Electron, no Discord. Produces a small
typed struct: session header, squad/enemy KPIs, map split, per-fight results,
and the nine leaderboards at top-N.

This is the only place that digs through the `stats` blob. Both the text
embed and the PNG template consume the model, so the two cannot drift apart.

`reportMeta.guild` is populated in main (`githubHandlers.ts:1767`, via
`resolveGuild`), so the guild name and tag the title template already uses are
available to the card with no new plumbing.

### `src/main/reportEmbed.ts`

`buildReportEmbed(model, style, url, meta) -> embed`

Fields for `text` and `hybrid`; title and link only for `graphic`. For
`hybrid` and `graphic` it sets `embed.image = { url: 'attachment://report-card.png' }`.

Owns enforcement of Discord's limits (25 fields, 6000 characters). It
truncates deterministically — drop trailing boards, then trim rows — rather
than trusting the design to fit. The nine-board layout measures at ~13 fields
and ~1,600 characters on representative data, but long account names on a
50-player squad move that number a lot.

### `src/main/reportCardTemplate.ts`

The card markup and CSS as a function of the model. One variant per graphic
style: `hybrid`'s compact banner and `graphic`'s tall card.

Authored at roughly 2× the width Discord displays an embed image at, so it
downsamples crisply.

### `src/main/reportCardRenderer.ts`

`renderReportCard(model, variant) -> Promise<Buffer | null>`

The only Electron-touching piece. Opens a `BrowserWindow` with `show: false`,
`paintWhenInitiallyHidden: true`, `useContentSize` at the card's exact
dimensions, and `nodeIntegration: false` / `contextIsolation: true`. Loads the
template, waits for `did-finish-load`, then makes one `executeJavaScript`
round-trip that awaits `document.fonts.ready` and a `requestAnimationFrame`
before resolving — that is what guarantees the capture sees laid-out,
font-correct pixels rather than a half-painted frame. Then `capturePage()` →
`toPNG()`.

Returns `null` on every failure rather than throwing:

1. **Blank capture.** Hidden-window captures can come back empty depending on
   platform and compositor. After `toPNG()`, `image.isEmpty()` and the
   buffer's byte length are checked against a floor; a suspiciously tiny PNG
   is a failure, not a shippable card.
2. **Hang.** The whole sequence races a hard timeout; on expiry the window is
   destroyed and the result is `null`.
3. **Anything thrown.** Wrapped, logged, `null`.

The window is destroyed with `win.destroy()` in a `finally` on every path,
including timeout. `close()` can be intercepted and is not reliable for a
headless window.

### `src/main/reportWebhooks.ts` (existing)

Keeps its single responsibility — post, self-heal, report results. It gains an
optional image buffer parameter. It never learns how to draw one.

## Fonts and assets

Inter ships as a local `woff2`, `@font-face`d from `file://` in the template.
The app currently pulls Inter and Cinzel from Google Fonts at runtime
(`src/renderer/index.css:1`); reusing that inside the capture would mean the
card either races the network or silently renders in a fallback face when
someone is offline. Unlike the app UI, this artifact gets posted publicly and
cannot be re-rendered. One subset file makes the output identical on every
machine.

Class icons and the AxiBridge glyph resolve from the built renderer output
(`dist-react/img/...`) over `file://`, with a dev-mode branch to `public/`. An
icon that fails to resolve degrades to a text abbreviation rather than a
broken-image box.

## Posting

`post(withThreadName, withTags)` keeps its shape and both self-heal retries. It
gains a branch on whether an image buffer is present.

The JSON path is unchanged, byte for byte.

The multipart path builds a `FormData` with a `payload_json` part holding
exactly the object the JSON path would have sent — `thread_name` and
`applied_tags` live *inside* `payload_json`, not as sibling parts — plus a
`files[0]` part carrying the PNG as a `Blob`. Node's global `FormData` and
`Blob` are available under Electron 35, so no new dependency; `form-data`
stays with the axios code in `discord.ts`.

Four details that are easy to get wrong:

1. **A fresh `FormData` per attempt.** The self-heal retries call `post()`
   again. Reusing one `FormData` across attempts risks sending an
   already-consumed body, and the retry would fail in a way that looks like a
   Discord error. It is constructed inside `post()` from the buffer, every
   time.
2. **No manual `Content-Type`.** The current code hardcodes
   `application/json`; the multipart branch passes no headers at all so
   `fetch` writes the boundary itself. Setting it by hand yields a 400 that
   looks exactly like a malformed-payload error.
3. **The embed must reference the attachment.** Without
   `attachment://report-card.png`, Discord posts the file as a loose
   attachment below the embed instead of inside it.
4. **The 10s timeout is JSON-sized.** Image posts get 30s, since a card PNG is
   a few hundred KB over a home upload.

The self-heal regex checks read `resp.text()` and are untouched — they behave
identically on both paths.

An oversized buffer is handled by a size guard, not a fourth retry: if the PNG
exceeds a conservative ceiling under Discord's attachment limit, the post
drops to the text embed before sending. Deterministic, and it cannot leave a
user's report link stuck behind an upload that will never succeed.

## Failure behaviour

The load-bearing rule: if `renderReportCard` returns `null`, `buildReportEmbed`
is re-invoked as `'text'` and the post proceeds normally. A broken card never
costs someone their report link.

## Orchestration

Rendering happens in `githubHandlers`, once per *distinct style in use* across
the selected hooks — at most two captures per publish, cached in a `Map` — not
once per webhook.

## Settings

`ReportWebhooksCard` gets one control per hook, next to the title template: a
three-way picker (Text / Banner + stats / Full graphic) with a one-line
description each. `makeDefaultReportWebhook` gains `style: 'text'`.

Persisted hooks predate the field, so the reader coerces anything missing or
unrecognized to `'text'`. That coercion belongs in the same normalizer the
existing fields use, not scattered `?? 'text'` at read sites.

## Testing

Matching the component boundaries.

- **`buildReportCardModel`** — pure, so it carries the bulk of the tests: real
  fixture stats in, model out. Explicitly including the degenerate inputs,
  because this is where a publish can crash: a single-fight session, zero
  deaths (KDR divide), a leaderboard that is empty or shorter than top-N,
  missing guild, and an unknown map.
- **`buildReportEmbed`** — asserts the field and character budgets hold,
  including a deliberately hostile model (50 players, max-length account
  names) to prove truncation actually triggers rather than the design merely
  fitting on nice data. Asserts `graphic` emits `embed.image` pointing at
  `attachment://`.
- **`postReportToWebhooks`** — extends the existing `fetchImpl` tests
  (`src/main/__tests__/reportWebhooks.test.ts`) to the multipart path: both
  self-heal retries still fire and succeed with an image attached; each
  attempt builds a fresh body; no `Content-Type` on multipart requests;
  `thread_name` and `applied_tags` appear inside `payload_json`; a `null`
  image falls back to a text embed and posts.
- **Template** — the HTML-producing function is snapshot-tested for structure
  and escaping.
- **Migration** — `settingsMigration.test.ts` covers the missing/unknown
  `style` coercion.

`renderReportCard` itself needs a live Electron window and is not unit-tested.
The Playwright Electron suite can cover "publish produces a non-empty PNG".

## Iteration

The existing dev-only `mock-web-report` IPC handler gains a path that renders
the card and writes the PNG to a temp file, so the template can be tuned
without publishing a report or hitting Discord.

## Out of scope

Named so they do not creep in — all additive later:

- Per-board toggles.
- Custom card themes.
- Per-webhook top-N.
