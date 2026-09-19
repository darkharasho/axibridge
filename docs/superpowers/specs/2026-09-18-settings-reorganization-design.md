# Settings Reorganization Design

**Date:** 2026-09-18
**Status:** Approved for planning

## Goal

Turn Settings from fifteen flat sections in one long scroll into five
categories with a nested navigation rail, and bring Discord destinations —
which are not in Settings at all today — in alongside the Discord content
settings that already are.

## Why

`SettingsView.tsx` is 3,656 lines rendering fifteen sections into a single
scrolling column. `SETTINGS_SECTIONS` (line 59) is a flat jump list with no
grouping, so finding a setting means either knowing its exact name or
scrolling past everything else. The project owner — who wrote it — reports
struggling to find settings in it.

Two structural problems compound the flatness:

1. **Names describe the implementation, not the destination.** "Embed
   Summary" and "Embed Top Stats" are Discord settings, but nothing in
   either name says Discord.
2. **Related settings are split across unrelated sections.** GitHub Pages,
   R2 and Parser Settings all decide what a published web report contains
   and how large it is, but they sit apart with dashboard and appearance
   settings between them.

And one thing is missing outright: Discord *destinations* live in
`WebhookModal.tsx`, opened from the app header. Settings can tell you what
a report contains but never where it goes.

## Information Architecture

Fifteen sections become five categories with eighteen subsections. Every
subsection is an existing section; nothing is deleted.

| Category | Subsections |
|---|---|
| **Discord** | Destinations *(new here)* · Summary Sections · Top Stats Lists · Report Links |
| **Web Report** | GitHub Pages · Cloudflare R2 · Report Data |
| **Stats** | Top Stats & MVP · MVP Weighting · Boon Uptime Resolution · Commander Thresholds |
| **Logs** | Log Directory *(new here)* · dps.report Token |
| **Application** | Appearance · Window & Close Behavior · Export / Import Settings · Help & Updates · Legal |

### Mapping from today's sections

| Today (`SETTINGS_SECTIONS` id) | Becomes |
|---|---|
| `embed-summary` | Discord › Summary Sections |
| `embed-top` | Discord › Top Stats Lists |
| — | Discord › Destinations *(from `WebhookModal.tsx`)* |
| — | Discord › Report Links *(from `ReportWebhooksCard.tsx`)* |
| `github-pages` | Web Report › GitHub Pages |
| `r2-storage` | Web Report › Cloudflare R2 |
| `parser-settings` | Web Report › Report Data |
| `dashboard-stats` | Stats › Top Stats & MVP |
| `mvp-weighting` | Stats › MVP Weighting |
| `boon-uptime-resolution` | Stats › Boon Uptime Resolution |
| `commander-thresholds` | Stats › Commander Thresholds |
| — | Logs › Log Directory *(from `FilePickerModal.tsx`)* |
| `dps-token` | Logs › dps.report Token |
| `appearance` | Application › Appearance |
| `close-behavior` | Application › Window & Close Behavior |
| `export-import` | Application › Export / Import Settings |
| `help-updates` | Application › Help & Updates |
| `legal` | Application › Legal |

### Renames

- "Embed Summary" → **Summary Sections** (under Discord)
- "Embed Top Stats" → **Top Stats Lists** (under Discord)
- "Parser Settings" → **Report Data** (under Web Report)
- "R2 Storage" → **Cloudflare R2**
- "Dashboard Stats" → **Top Stats & MVP**
- "Close Behavior" → **Window & Close Behavior**

The word "embed" disappears from the UI. It names a Discord API object, not
anything a user is deciding about.

### One lossy placement, accepted

*Compute Damage Modifiers* is the only Report Data setting that also affects
the in-app dashboard, not just the published report. Filing it under Web
Report is therefore slightly wrong. It keeps its place and carries a
sub-label saying it also affects the dashboard — splitting one row out of a
coherent group would cost more legibility than the imprecision does.

### Aligning with the existing taxonomy

`IMPORT_SETTING_META` (SettingsView.tsx:77) already groups every setting key
as *Logs & Uploads · Discord · App · Stats · GitHub* for the Export/Import
dialog. That is nearly this taxonomy under different names. Its `section`
values are renamed to match the five categories above, so the app has one
vocabulary rather than two. The keys themselves are untouched — they are
persisted identifiers, and renaming them would break imports of existing
exported settings files.

## Navigation

### Nested rail

The left rail lists five collapsible categories. Expanding one reveals its
subsections; clicking a subsection navigates to it. Only one category is
expanded at a time — with eighteen subsections, letting all five expand
reproduces the flat list this design exists to remove.

The pane shows one category at a time. Within a category the subsections are
stacked cards in a short scroll, so scroll position drives which subsection
the rail marks as current (`activeSettingsSectionIdRef` already does this
tracking and is reused).

### Deep links must keep working

Three props drive programmatic navigation into a section today:
`helpUpdatesFocusTrigger`, `parserSettingsFocusTrigger`, and
`developerSettingsTrigger`, plus the `scrollToSettingsSection` and
`stepSettingsSection` helpers. With paged categories, navigating to a
section requires selecting its category first. `scrollToSettingsSection(id)`
becomes the single entry point: it resolves the id to its category, selects
that category, then scrolls. All existing callers keep passing the same
section ids and keep working unchanged.

`stepSettingsSection` (next/previous section) traverses the flattened order
across category boundaries, so stepping past the last Discord subsection
lands on the first Web Report one.

### Search across categories

Today search sets `settingsSearchHidden` to hide non-matching sections in
one scroll. With categories, a match in a category you are not viewing must
still be reachable.

Search results render as a flat list that replaces the pane contents,
each row labelled with its category ("Discord › Map Slice"). Selecting a
result navigates to that category and scrolls to the section. The rail
stays visible and shows a match count per category, so an empty category is
visibly empty rather than silently missing.

Search matches section titles, setting labels, and setting descriptions —
the same text it matches today.

## Discord Destinations in Settings

### Shared component, two mount points

The destinations editor is extracted from `WebhookModal.tsx` into a
`DestinationsCard` component. The modal keeps existing — it is reachable
mid-workflow from the header — and renders the same component inside its
shell. Settings mounts it inline as the Discord › Destinations card.

This is an extraction, not a reimplementation. Bridge linking, the
revoked-token relink path, the "posts as Axi" notice, and delete/unlink all
move with the component and behave identically in both mounts. There is no
second copy to drift.

`DestinationsCard` takes `webhooks`, `enabledWebhookIds` and change
callbacks as props; it owns no persistence. App.tsx already owns
`webhooks`/`setWebhooks` and passes them to the modal, so it passes the same
state to `SettingsView` as new props.

### Per-destination enable — what this actually requires

**This is a behaviour change to the send path, not a UI relocation.**

Today AxiBridge sends each fight report to exactly one destination.
`resolveDiscordDestination` (`src/main/discordDestinationResolver.ts`) reads
`webhooks[]` plus a single `selectedWebhookId` and returns one destination
or null; `DiscordNotifier` holds one `destination` field. The header
dropdown is a radio: picking a destination deselects the previous one.

A per-row toggle over a radio would be a lie — switching one on would
silently switch another off. Honouring the toggle means genuine fan-out:
every enabled destination receives the report.

**Store.** `selectedWebhookId: string | null` becomes
`enabledWebhookIds: string[]`. On first read after upgrade, an absent
`enabledWebhookIds` is derived from `selectedWebhookId` (one element, or
empty when null), so an existing install keeps sending exactly where it
sent before. `selectedWebhookId` continues to be written as the first
enabled id — `settingsHandlers.ts` and the export/import list both still
read it — the same mirror discipline `applyDiscordDestination` already
applies to the legacy `discordWebhookUrl`.

**Resolver.** `resolveDiscordDestination` → `resolveDiscordDestinations`,
returning `DiscordDestination[]`. The legacy `discordWebhookUrl` fallback
keeps its current rule exactly: honoured only when `webhooks` is genuinely
empty. An empty `enabledWebhookIds` over a non-empty `webhooks` means the
user turned everything off and must resolve to no destinations — not to the
legacy fallback. `shouldSendDiscord` returns whether the list is non-empty.

**Notifier.** `DiscordDestination` gains an `id` so results can be
attributed back to a row. `DiscordNotifier.setDestination(dest)` becomes
`setDestinations(dests)`. `sendLog` loops over them and returns
`SendResult[]`. The private helpers at discord.ts:386 and :404 already start
with `const dest = this.destination!` — they take `dest` as a parameter
instead.

**Cost control.** The report payload — embeds, screenshots, and the map
slice PNG — is built **once** and reused for every destination. A second
enabled destination must not cost a second tile fetch or a second renderer
round trip. Sends are sequential, not parallel, so two destinations cannot
double the instantaneous rate against Discord.

**Failure handling.** `handleDiscordSendResult` currently keys off
`selectedWebhookId`. It takes the per-destination results instead and
handles each against its own row: a revoked bridge token clears `token` on
that entry only and leaves the other destinations sending. One destination
failing never suppresses the others.

**Header dropdown.** The existing destination dropdown becomes a multi-select
showing enabled destinations, keeping the bolt treatment on bridge rows. Its
summary label reads the destination name when one is enabled, "N
destinations" when more, and "Disabled" when none.

## Log Directory in Settings

The Logs › Log Directory card shows the current arcdps log folder path and a
button that opens the existing `FilePickerModal`. Picking a folder goes
through the same handler the current flow uses. This is a read-and-launch
card, not a reimplementation of the picker.

## File Structure

**New:**
- `src/renderer/settings/settingsTaxonomy.ts` — the five categories, their
  subsections, the section-id → category resolver, and the flattened order
  `stepSettingsSection` walks. Pure data plus resolvers, no React, so it is
  directly unit-testable. Mirrors the existing `stats/statsTaxonomy.ts`.
- `src/renderer/settings/SettingsNav.tsx` — the nested rail.
- `src/renderer/settings/DestinationsCard.tsx` — extracted from
  `WebhookModal.tsx`; mounted by both the modal and Settings.

**Modified:**
- `src/renderer/SettingsView.tsx` — sections regrouped into category panes;
  `SETTINGS_SECTIONS` replaced by the taxonomy import; `IMPORT_SETTING_META`
  section labels aligned; new destination props.
- `src/renderer/WebhookModal.tsx` — reduced to a modal shell around
  `DestinationsCard`.
- `src/renderer/App.tsx` — passes destination state to `SettingsView`.
- `src/renderer/app/AppLayout.tsx` — header dropdown becomes multi-select.
- `src/main/discordDestinationResolver.ts` — plural resolution, migration,
  per-destination failure handling.
- `src/main/discord.ts` — `setDestinations`, per-destination send loop,
  `SendResult[]`.
- `src/main/index.ts` — the two `processLogFile` send-gate call sites.
- `src/main/handlers/settingsHandlers.ts` — `enabledWebhookIds` in the
  settings payload.

`SettingsView.tsx` is already too large to hold comfortably in context. This
work moves toward splitting it, but a full decomposition into one file per
category is a larger refactor than the reorganization needs and is out of
scope. The taxonomy, nav, and destinations card come out; the section bodies
stay where they are.

## Testing

**Taxonomy (`settingsTaxonomy.test.ts`):** every id in the taxonomy resolves
to exactly one category; every section rendered by `SettingsView` appears in
the taxonomy and vice versa (a pinned list, so adding a section without
filing it fails); `stepSettingsSection` crosses category boundaries in the
flattened order and stops at both ends.

**Navigation (`SettingsView` integration):** `scrollToSettingsSection` on a
section in a non-selected category selects that category; each of the three
focus-trigger props lands on its section from a cold open with a different
category selected.

**Search:** a query matching only a Web Report setting, issued while Discord
is selected, returns that result labelled with its category, and selecting
it navigates there.

**Destinations:** `DestinationsCard` renders identically under both mounts
(same rows, same actions); enabling a second destination does not disable
the first.

**Resolver (`discordDestinationResolver.test.ts`), the load-bearing cases:**
- an install with `selectedWebhookId` set and no `enabledWebhookIds` resolves
  to exactly that one destination (the migration)
- two enabled destinations resolve to both, in list order
- empty `enabledWebhookIds` with non-empty `webhooks` resolves to none, and
  specifically does **not** fall back to `discordWebhookUrl`
- empty `webhooks` still honours the legacy `discordWebhookUrl`
- a revoked bridge token clears that entry only, leaving the other
  destination enabled and resolvable

**Send path (`discord.test.ts`):** `sendLog` with two destinations posts
twice and returns two results; one destination failing does not prevent the
other's send; the attachment payload is constructed once across both sends.

## Out of Scope

- Splitting `SettingsView.tsx` into one file per category.
- Any change to what individual settings do, beyond the destination fan-out.
- Report Links (`reportWebhooks`) semantics — that list is already
  multi-select with its own per-publish selection and is moved, not changed.
- New settings.

## Risks

**The fan-out is the risk, not the layout.** The reorganization is
mechanical and visually verifiable. Changing how many places a report is
posted to touches the store, the resolver, the notifier and two call sites,
and the failure mode — silently posting to a destination the user thought
was off, or silently posting nowhere — is one users would not notice
immediately. The migration test and the "empty means none, never fall back"
test are the two that matter most; the latter guards a bug this resolver
has already had once, documented in its own header comment.

**If the fan-out is judged too large for this release**, the reorganization
stands on its own: ship the taxonomy, the nested rail, the search, and the
destinations card with the existing exclusive selection rendered as a radio,
and take the toggle separately. Nothing else in this spec depends on the
fan-out.
