# Publishing Sites — Design

**Date:** 2026-10-04
**Builds on:** `docs/superpowers/specs/2026-10-04-shared-publishing-design.md` (merged)
**Status:** Approved in conversation; awaiting written-spec review

## Problem

Shared publishing works, but it is unclear where a report goes. Settings has
one "default repo" plus starred repos that only surface as alternate targets
in the publish popover; joining a site silently stars it. Nothing says "you
publish to *this* site, and these people publish with you", and org-owned
sites look no different from personal ones.

## Goal

Make the publishing site a first-class, visible thing:

- Settings shows **the site you publish to** (owner, role, URL) with its
  members directly beneath it.
- A **site list** holds every site you publish to; switching it changes your
  default.
- The publish button always **names the target**; picking another site there
  is a one-off.
- Org-owned repos work the same as personal ones. Members are **repo
  collaborators only** — no GitHub teams, no org membership, no new OAuth
  scope (`repo` already covers collaborators).

## Non-goals

- GitHub teams / org membership management (`read:org`, `admin:org`).
- A `siteName` field in `reports/index.json` (sites display as `owner/repo`).
- Local renaming of sites.
- Automatic background discovery of sites.
- Any change to the publish pipeline itself: commit loop, appearance rules,
  viewer gate, override branch/path resolution all stay as merged.

## Data model

New electron-store key **`githubSites`**:

```ts
interface IGithubSite {
  owner: string;
  repo: string;
  addedVia: 'default' | 'manual' | 'joined' | 'found';
  addedAt: string; // ISO
}
```

- The **default** stays in `githubRepoOwner` / `githubRepoName` (publish,
  delete, History and the store-describes-default-repo rule are unchanged).
  The default is always present in `githubSites`; setting a default adds it if
  missing.
- Keys compare case-insensitively on `owner/repo`; no duplicates.
- **Migration (once, at startup):** if `githubSites` is absent, build it from
  the current default (`addedVia:'default'`) plus each valid
  `githubFavoriteRepos` entry (`addedVia:'manual'`). Malformed entries are
  skipped. `githubFavoriteRepos` is left in place (downgrade-safe) but no
  longer written or read by new code.
- **Live per-site details** (not persisted, cached for the session, refreshed
  when the site list opens):
  - `role`: `'admin' | 'publisher' | 'none'` from the repo's `permissions`
    (`admin` → admin; `push` → publisher; 403/404 or no push → none).
  - `ownerType`: `'Organization' | 'User'` from `owner.type`.
  - `ownerAvatarUrl` from `owner.avatar_url` (stand-in logo).
  - `pagesUrl` from `GET /repos/{o}/{r}/pages` `html_url`, falling back to the
    inferred `https://{owner}.github.io/{repo}`.
  - `memberCount` when a members list has been loaded this session (optional).

## Main-process surface (IPC)

| Channel | Input | Output |
|---|---|---|
| `get-github-sites` | — | `{ success, sites: IGithubSite[], defaultKey }` |
| `get-github-site-details` | `{ owner, repo }[]` | `{ success, details: Record<key, ISiteDetails> }` |
| `add-github-site` | `{ owner, repo, addedVia }` | `{ success, sites, error? }` |
| `remove-github-site` | `{ owner, repo }` | `{ success, sites, error? }` — refuses the current default |
| `set-default-github-site` | `{ owner, repo }` | `{ success, sites, error? }` — writes `githubRepoOwner/Name`, adds to list |
| `find-github-sites` | — | `{ success, found: {owner, repo}[] }` |

- Site-list mutations go through pure functions in a new
  `src/shared/githubSites.ts` (`normalizeSiteKey`, `addSite`, `removeSite`,
  `setDefaultSite`, `migrateFavoritesToSites`, `mergeFoundSites`) so they are
  unit-testable without IPC.
- **`find-github-sites`** pages `/user/repos` (same 5-page cap as
  `listGithubRepos`) and keeps repos where `permissions.push` is true and
  `description.trim() === 'AxiBridge Reports'` (the existing invite filter's
  `SITE_DESCRIPTION`), minus sites already in the list. It never adds; the UI
  offers each with **Add**.
- **`accept-site-invite`** (merged): on success add the site with
  `addedVia:'joined'` instead of appending to `githubFavoriteRepos`. If there
  is no default, the joined site becomes the default (current behaviour).
  `ISiteJoinTarget` returns `sites` instead of `favorites`.
- **Settings save** must stop writing `githubFavoriteRepos` and must not
  clobber `githubSites` (SettingsView saves its whole state; it holds the
  list it was given and receives updates from the IPC results).

## UI

### Settings → Web Reports: "Publishing to" card

Replaces the Repository well (Choose Existing / Create New + star list).

- Shows the default site: owner avatar, `owner/repo`, badge `org · <owner>` or
  `personal`, role badge (`you: admin` / `you: publisher`), Pages URL + Copy.
- **Switch site ▾** opens the site list panel.
- **Members** (the merged `PublishersCard`, restyled to sit under the card):
  header "Members · N" + "Manage access on GitHub ↗" (openExternal). Caption:
  "Anyone with write access to **owner/repo** can publish here. Adding someone
  sends them a GitHub invite; they join from AxiBridge." Admins add / remove /
  cancel; publishers see the list read-only.
- Logo section unchanged (admin-only gate already in place).
- With no default site: the card shows an empty state with **Create new
  site**, **Use existing repo…**, **Find my sites**.

### Site list panel

- **Your sites:** one row per site — avatar, `owner/repo`, role badge,
  `org`/`personal`, "✓ current" on the default. Clicking a row sets it as
  default. A ✕ removes a non-default site from the list (local only; never
  touches GitHub access). Sites with role `none` render greyed with
  "no access".
- **Invites:** pending invites (from the merged invite list) with **Join**;
  replaces the standalone `PendingSiteInvites` block in Settings.
- **Footer:** **+ Create new site** (existing create flow; the new repo is
  added and becomes default), **Use existing repo…** (searchable picker over
  `get-github-repos`, no stars; picking adds with `addedVia:'manual'`),
  **Find my sites** (runs `find-github-sites`, shows results inline with
  **Add**; "No other AxiBridge sites found" when empty).

### Publish button (stats view publish popover)

- `useStatsUploads` builds `uploadTargets` from `githubSites` (default first),
  excluding role `none` once details are known.
- The button reads **Publish to `owner/repo`**. Choosing another site in the
  dropdown applies to that publish only; the default is unchanged.
- Under the dropdown: "Your report appears at `<pagesUrl>`" plus
  ", alongside N other commanders'" when `memberCount` is known (N = members
  minus you).

### History

The repo picker in `FightReportHistoryView` reads `githubSites` instead of
default + favorites.

### Dashboard invite banner

Unchanged, except a join adds to `githubSites` (via `accept-site-invite`).

## Errors

| Situation | Detection | Message |
|---|---|---|
| Org blocks outside collaborators | add-collaborator 403/422 whose message mentions outside collaborators / "not allowed" for an `Organization` owner | "Couldn't invite **{user}**: the **{org}** org only lets owners add outside collaborators. Ask an org owner to add them, or to allow repo admins to invite." + "Org settings ↗" (`https://github.com/organizations/{org}/settings/member_privileges`) |
| Org OAuth app restrictions | 403 whose message mentions "OAuth App access restrictions" | "**{org}** hasn't approved AxiBridge. An org owner must approve it under the org's third-party access settings." + link |
| Lost access to a site | details: 403/404 or no `push` | Row greyed, "no access"; excluded from publish targets; still removable |
| Details lookup fails (network/rate limit) | request error | Row shows no role badge; site stays selectable (fail open — publish errors remain authoritative) |
| Find my sites fails | request error | Inline error in the panel; list unchanged |

## Testing

- `src/shared/__tests__/githubSites.test.ts`: migration (favorites → sites,
  once, default not duplicated, malformed/empty input), add/remove/setDefault,
  case-insensitive dedupe, removing the default refused, mergeFoundSites skips
  known sites.
- Main handler tests (existing `githubHttpsMock` harness): site details role
  mapping (admin / push / 403 / 404), ownerType, Pages URL fallback;
  `find-github-sites` description + push filter and paging; set-default writes
  the store keys; accept-site-invite adds `joined` and stops writing
  favorites; org-blocked and OAuth-restricted error messages.
- Component tests: Publishing-to card (admin vs publisher, org vs personal,
  empty state); site list (switch default, remove, no-access row, Join,
  Find my sites add); publish popover target label and one-off override;
  History picker reads `githubSites`.
- Existing shared-publishing tests stay green.

## Rollout notes

- Downgrading after migration: the old app still reads `githubFavoriteRepos`,
  which is left intact but frozen at migration time.
- No new OAuth scope; no backend.
