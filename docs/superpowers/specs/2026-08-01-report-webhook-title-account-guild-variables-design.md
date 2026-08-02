# Report Webhook Title Variables: {account}, {guild}, {guild_tag} — Design

**Date:** 2026-08-01
**Status:** Approved

## Purpose

The report webhook title template (the "auto Discord poster" that posts the
report link after each Upload to Web) currently supports `{date}`,
`{day_of_week}`, `{commander}`, and `{commanders}`. Add three variables:

| Token | Value | Example |
|-------|-------|---------|
| `{account}` | Primary commander's GW2 account name | `Axi.1234` |
| `{guild}` | Squad's dominant guild name (already resolved for the report) | `Axius Imperium` |
| `{guild_tag}` | Guild tag, raw — no brackets, so `[{guild_tag}]` composes | `AXI` |

All three fall back to `Unknown` when the data is missing (nobody tagged,
guild undetected, or GW2 API resolution failed), matching `{commander}`.

No token-collision hazard: the literal `{guild}` does not occur inside
`{guild_tag}`, so `replaceAll` order between them is free (unlike the existing
`{commanders}`-before-`{commander}` ordering, which must be preserved).

## Data flow

```
{account}:
  EI player.account (commander-tagged players)
    → renderer: computePrimaryCommanderIdentity(detailsList) → meta.primaryCommanderAccount
    → main: postReportToWebhooks ctx.primaryCommanderAccount
    → renderReportTitle replaces {account}

{guild} / {guild_tag}:
  meta.guild = { id, name, tag }   (ALREADY resolved by upload-web-report onto
    reportMeta via resolveGuild + persistent cache — see 2026-07-31 guild-tag spec)
    → main: pass reportMeta (not payload.meta) to postReportToWebhooks
    → ctx.guildName / ctx.guildTag
    → renderReportTitle replaces {guild} / {guild_tag}
```

## Changes by file

1. **`src/renderer/stats/utils/computePrimaryCommander.ts`** — the vote loop
   already keys by account. Add `computePrimaryCommanderIdentity(detailsList):
   { name: string; account: string }` that also records the winner's
   first-seen account (`''` when nobody tagged or the winner had no account
   field). Keep `computePrimaryCommander` as a thin wrapper returning `.name`
   so existing callers are untouched.

2. **`src/renderer/stats/hooks/useStatsUploads.ts`** — in the meta build
   (next to `primaryCommander` / `guildId`), add
   `primaryCommanderAccount: identity.account`.

3. **`src/main/handlers/githubHandlers.ts`** — in the `upload-web-report`
   handler, change `postReportToWebhooks({ meta: payload.meta, ... })` to
   `meta: reportMeta`. `reportMeta` is in scope there and already carries the
   resolved `guild`; this is the only call site of `postReportToWebhooks`.

4. **`src/main/reportWebhooks.ts`** — extend the ctx build:
   `primaryCommanderAccount: String(opts.meta?.primaryCommanderAccount || '')`,
   `guildName: String(opts.meta?.guild?.name || '')`,
   `guildTag: String(opts.meta?.guild?.tag || '')`.
   (`resolveGuild` failure yields `name/tag: null` → `''` here → `Unknown` at
   render.)

5. **`src/shared/reportWebhooks.ts`** — add the three fields to
   `ReportTitleContext`; in `renderReportTitle`, default each empty value to
   `'Unknown'` and add three `replaceAll` calls.

6. **`src/renderer/ReportWebhooksCard.tsx`** — extend `PREVIEW_CTX` with
   `primaryCommanderAccount: 'Axi.1234'`, `guildName: 'Axius Imperium'`,
   `guildTag: 'AXI'`; append the three tokens to the placeholder hint line.

## Error handling

- Guild resolution never throws (returns nulls) — nulls render as `Unknown`.
- Untagged session → empty account → `Unknown`.
- Existing templates contain none of the new tokens → output unchanged;
  no migration needed. `IReportWebhook` shape is unchanged.

## Testing

- `src/shared/__tests__/reportWebhooks.test.ts` — new tokens render; fallback
  to `Unknown`; `{guild}` and `{guild_tag}` coexist in one template; existing
  placeholder tests still pass.
- Commander tests — `computePrimaryCommanderIdentity` returns the winner's
  account; wrapper parity with `computePrimaryCommander`; no-commander case
  returns empty strings.
- `src/main/__tests__/reportWebhooks.test.ts` — posted embed title reflects
  account/guild from meta; missing meta fields render `Unknown`.
