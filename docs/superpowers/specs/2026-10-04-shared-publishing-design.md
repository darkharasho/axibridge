# Shared publishing to one GitHub Pages site — design

Date: 2026-10-04
Status: approved in brainstorming, pending spec review

## Goal

A guild runs one AxiBridge report site (a GitHub Pages repo), and several
commanders/officers each publish their own raids to it. Onboarding a new
publisher is one step on each side: the site owner adds them by GitHub
username inside AxiBridge; the publisher clicks **Join** on a banner in their
own AxiBridge. Two people publishing to the same site must never lose each
other's reports.

Inspired by AxiForge's Teams publish target, but deliberately lighter: AxiForge
needs a Worker + D1 because it syncs a build library between members. AxiBridge
has no library to sync — everything shared already lives in the repo — so
GitHub's own collaborator/invitation system is the single source of truth.

## Non-goals

- No AxiForge-style teams, Worker, D1, or invite codes.
- No per-publisher roles: publishers always get `push`.
- No syncing of local fight history between members.
- No new OAuth scope. The existing device-flow token has `repo`, which covers
  every endpoint below, so nobody has to re-authenticate.

## Current state (what this builds on)

- Auth: GitHub device flow, token in `electron-store` key `githubToken`
  (`src/main/handlers/githubHandlers.ts`, `start-github-oauth`).
- Target: `githubRepoOwner` / `githubRepoName` / `githubBranch` /
  `githubPagesBaseUrl` / `githubPagesSourcePath`, plus `githubFavoriteRepos`
  (`owner/name[]`) as extra publish targets, selected per publish via the
  `repoFullName` override (`useStatsUploads.ts`).
- Publish: `upload-web-report` stages report files, merges
  `reports/index.json`, maintains `reports/rollup.json` and
  `reports/attendance.json`, sweeps stale assets, then commits via the Git
  Data API (blobs → tree → commit → ref).

### Defects that block multi-publisher use (fixed by this design)

1. **Lost update on concurrent publish.** On a 422 from the ref update
   (`githubHandlers.ts` ~2711–2735) the retry re-bases the tree onto the new
   HEAD but reuses blobs computed against the *old* HEAD — including
   `index.json`, `rollup.json`, `attendance.json` and the stale-asset delete
   list. The second publisher's commit silently drops the first publisher's
   report from the index, rollup and attendance (its files remain, orphaned).
   The same pattern exists in `delete-github-reports`.
2. **Inconsistent base reads.** `index.json` is read via the Contents API on
   the branch *before* HEAD is resolved, so the merge base and the commit
   parent can be different commits.
3. **Appearance flapping.** Every publish writes `colorPalette` / `axiTheme` /
   `glass` / `glassSurfaces` and (if configured) `logo.png` / `logo.json` from
   the publisher's local settings, so the site's look follows whoever
   published last.
4. **Viewer downgrade.** Every publish writes the publisher's `dist-web`
   template and sweeps assets not in it. A publisher on an older AxiBridge
   downgrades the viewer and deletes the newer hashed assets.

## Design

### 1. Owner side — "Publishers" card

Location: Settings → Web Report → GitHub Pages, below the repo picker
(`src/renderer/settings/PublishersCard.tsx`, rendered from `SettingsView.tsx`
inside `sectionId="github-pages"`).

- Shown when a default repo is configured. On mount it calls
  `get-repo-publishers`, which returns `{ canAdmin, collaborators, invites }`.
- `canAdmin` comes from `GET /repos/{o}/{r}` → `permissions.admin`. When
  false, the card shows: "Only a repo admin can add publishers. Ask {owner}, or
  manage access on GitHub" with a link to
  `https://github.com/{o}/{r}/settings/access`. No list is fetched.
- Collaborators: `GET /repos/{o}/{r}/collaborators?affiliation=direct`
  filtered to `permissions.push`; each row shows avatar, login, and a
  **Remove** button (`DELETE /repos/{o}/{r}/collaborators/{login}`). The
  signed-in user's own row has no Remove.
- Pending invites: `GET /repos/{o}/{r}/invitations`; each row shows invitee,
  "invited {relative time}", and **Cancel**
  (`DELETE /repos/{o}/{r}/invitations/{id}`).
- **Add publisher**: a username input. Flow:
  1. `GET /users/{name}` — 404 → inline "No GitHub user named {name}".
  2. `PUT /repos/{o}/{r}/collaborators/{name}` with `{ permission: 'push' }`.
     - 201 → invitation created; row appears under Pending.
     - 204 → already has access (existing collaborator or org member); inline
       "{name} already has access".
     - 403/404 → surface GitHub's message (e.g. org policy forbids outside
       collaborators).
  3. Inline hint after a 201: "They'll see a Join prompt next time they open
     AxiBridge."
- Removals and cancellations ask for confirmation.

Org-owned repos: org *members* granted access through teams do not appear
under `affiliation=direct`; the card notes "Org members with access through
teams aren't listed here" when the owner is an org. Inviting an org member by
username still works (204 or 201 depending on org settings).

### 2. Publisher side — join banner

`src/renderer/app/SiteInviteBanner.tsx`, mounted in `AppLayout`.

- Main process `get-pending-site-invites` calls
  `GET /user/repository_invitations` and keeps only invites whose repo looks
  like an AxiBridge site: the repo description is `AxiBridge Reports`, **or**
  `reports/index.json` exists on its default branch (checked at the repo root
  and under `docs/`, the two Pages sources we support). Results are cached in
  memory for 10 minutes per token.
- Fetched on app start (only if `githubToken` is set) and whenever Settings
  opens.
- Banner per invite (most recent first, max one shown, "+N more" link opens
  Settings): "**{inviter}** invited you to publish to **{owner/repo}** —
  Join · Dismiss".
- **Join** → `accept-site-invite(id)`:
  1. `PATCH /user/repository_invitations/{id}` (204).
  2. Resolve branch (repo `default_branch`) and Pages source/URL via the
     existing `resolvePagesSource` logic.
  3. Append `owner/repo` to `githubFavoriteRepos` (deduped). If no default repo
     is configured, also set `githubRepoOwner` / `githubRepoName` /
     `githubBranch` / `githubPagesBaseUrl` / `githubPagesSourcePath`.
  4. Return the resulting target so the renderer can toast "You can now publish
     to {owner/repo}" and refresh settings state.
- **Dismiss** stores the invite id in `dismissedSiteInvites` (string[]) in the
  store; dismissed invites are filtered out. It does not decline on GitHub; the
  invite remains acceptable from Settings.
- Settings → GitHub Pages also lists all pending AxiBridge-site invites
  (including dismissed ones) with **Join**, so a dismissal is never a dead end.

### 3. Main-process module

New `src/main/handlers/githubPublishersHandlers.ts`, registered alongside
`registerGithubHandlers`. IPC handlers:

| Channel | Input | Output |
|---|---|---|
| `get-repo-publishers` | `{ owner?, repo? }` (defaults to store) | `{ success, canAdmin, ownerType, collaborators[], invites[] }` |
| `add-repo-publisher` | `{ owner?, repo?, username }` | `{ success, status: 'invited' \| 'already-has-access', error? }` |
| `remove-repo-publisher` | `{ owner?, repo?, username }` | `{ success, error? }` |
| `cancel-repo-invite` | `{ owner?, repo?, invitationId }` | `{ success, error? }` |
| `get-pending-site-invites` | `{ force? }` | `{ success, invites[] }` |
| `accept-site-invite` | `{ invitationId }` | `{ success, target?, error? }` |
| `dismiss-site-invite` | `{ invitationId }` | `{ success }` |

The low-level helpers (`githubApiRequest`, `getGithubUser`,
`resolvePagesSource`, `getGithubFile`) are exported from `githubHandlers.ts`
(or moved to a small `githubApi.ts` if the export list gets unwieldy) rather
than duplicated. Preload exposes matching `electronAPI` methods; types go in
`src/renderer/global.d.ts`.

A shared `getRepoPermissions(owner, repo, token)` helper
(`GET /repos/{o}/{r}` → `{ admin, push }`) is cached per publish/settings
session and reused by §5.

### 4. Concurrency-safe commits

Refactor `upload-web-report` so everything that depends on the base commit is
computed by one function:

```ts
buildSharedCommitEntries(base: { headSha, treeSha, treeMap }, ctx): Promise<{
  entries: Array<{ path: string; sha: string | null }>;
}>
```

It produces, from the given base: the merged `reports/index.json` (read from
the **base tree**, not the Contents API on the branch), `rollup.json`,
`attendance.json`, template/asset writes, and the stale-asset delete list. The
report's own files (`reports/<id>/…`) are uploaded once before the loop; their
blob shas are content-addressed and reused across attempts.

Commit loop:

1. Resolve HEAD → base.
2. `buildSharedCommitEntries(base)`; upload any new blobs (dedupe by sha).
3. tree → commit (parent = base head) → `updateGithubRef`.
4. On 422: wait 250–1000 ms (jittered), go to 1. Max **3** attempts; then fail
   with "The site was updated by someone else while publishing. Try again."

`delete-github-reports` gets the same treatment: its index/rollup/attendance
rewrites move into a rebuild-from-base function inside the same loop.

### 5. Site appearance belongs to the repo admin

Per publish, look up `getRepoPermissions` for the target repo.

- **Admin**: unchanged — local `colorPalette` / `axiTheme` (and derived
  `glass` / `glassSurfaces`) written to `index.json` and the report payload;
  logo uploaded if configured.
- **Push-only**: the effective appearance is read from the base
  `index.json` (`colorPalette`, `axiTheme`; falling back to local values only
  if the index has none). That effective appearance is used for both the index
  payload and `buildWebReportPayload`, so the publisher's report matches the
  site. `logo.png` / `logo.json` are never queued, and the `apply-github-logo`
  handler refuses with "Only a repo admin can change the site logo".
- Settings → GitHub Pages: when the selected repo isn't admin-owned by the
  user, the logo picker is disabled with "Set by {owner}". (Palette/theme are
  app-wide settings and stay editable; the copy under them notes they don't
  change shared sites you don't administer.)

Permission lookup failure (network, 404) → treat as push-only. That's the safe
default: it can't flap the site's appearance.

### 6. Viewer bundle never moves backwards

`index.json` gains `generator: { app: 'axibridge', version: <app.getVersion()> }`,
written on every publish where the template is written.

In `buildSharedCommitEntries`, compare the local app version with the base
`index.json`'s `generator.version` (semver):

- local ≥ recorded, or none recorded → write template/assets/root index and
  run the stale-asset sweep as today; write `generator` with the local version.
- local < recorded → skip template, root `index.html`, asset writes and the
  sweep; keep the existing `generator`. The report, index entry, rollup and
  attendance are still written. Surface a non-blocking status note: "Site
  viewer is newer than your AxiBridge (vX). Update to change the viewer."

`ensure-github-template` applies the same gate.

### 7. "Published by"

- New index entries get `publishedBy: <login>` (from `GET /user`, cached per
  token for the session). Old entries lack it and render nothing.
- Shown in `FightReportHistoryView` rows (when the entry's repo is not solely
  the user's) and in the web viewer's report index list (`src/web/`), as a
  muted "by {login}".

### 8. Deleting other publishers' reports

Before `deleteGithubReports` is invoked, the renderer checks the selected
entries' `publishedBy`. If any are set and differ from the signed-in login,
confirm: "{n} of these were published by {logins}. Delete anyway?" This is a
confirmation, not enforcement: a push collaborator can delete any file anyway.

## Error handling summary

| Situation | Behaviour |
|---|---|
| Add publisher: user not found | Inline error, nothing sent |
| Add publisher: 204 | "Already has access" |
| Add publisher: 403 (org policy, not admin) | GitHub message shown inline |
| Join: invite expired/revoked (404) | Banner row removed, toast "That invite is no longer valid" |
| Join: Pages not enabled on repo | Accept still succeeds; target saved with derived `https://{o}.github.io/{r}` URL; publish will run `ensureGithubPages` as today |
| Publish: 3 consecutive 422s | Fail with retry-able message; report blobs already uploaded are harmless |
| Publish: permission lookup fails | Treated as push-only (no appearance/logo writes) |
| Publish: no push access (403 on ref update) | "You don't have push access to {o/r}. Ask the site admin to add you." |

## Testing

Unit (vitest, `--maxWorkers=2`), mocking the GitHub request layer like
`src/main/handlers/__tests__/ensureFightsRepo.test.ts`:

- `buildSharedCommitEntries`: two simulated publishers racing on one base →
  after the second rebuilds on the first's commit, both entries survive in
  index, rollup and attendance.
- Commit loop: 422 → success on attempt 2; 422 ×3 → "site was updated" error;
  non-422 error is not retried.
- Appearance: admin writes local values + logo; push-only carries existing
  index appearance into index and report payload and queues no logo;
  permission lookup failure behaves as push-only.
- Version gate: older / equal / newer / missing `generator`.
- Invite filter: AxiBridge-description repo kept, `reports/index.json` repo
  kept (root and `docs/`), unrelated repo dropped; dismissed ids filtered.
- `accept-site-invite`: favorites deduped; default target set only when empty.
- `add-repo-publisher`: 201 → invited, 204 → already-has-access, unknown user.
- Delete confirmation: entries by others trigger the prompt, own/legacy don't.

Manual end-to-end with two GitHub accounts on a scratch repo: invite from A,
Join banner on B, publish from both (including near-simultaneously), verify
`index.json` has both entries with correct `publishedBy`, site appearance
stays A's, older-build publish doesn't change the viewer assets.

## Files touched (expected)

- `src/main/handlers/githubHandlers.ts` — export helpers; commit-loop refactor
  of `upload-web-report`, `delete-github-reports`, `ensure-github-template`,
  `apply-github-logo`; appearance + version gates; `publishedBy`.
- `src/main/handlers/githubPublishersHandlers.ts` — new.
- `src/main/index.ts` — register new handlers; `dismissedSiteInvites` store key.
- `src/preload/index.ts`, `src/renderer/global.d.ts` — new API surface.
- `src/renderer/settings/PublishersCard.tsx` — new.
- `src/renderer/app/SiteInviteBanner.tsx` — new; mounted in `AppLayout.tsx`.
- `src/renderer/SettingsView.tsx` — mount card, pending-invite list, logo gate.
- `src/renderer/FightReportHistoryView.tsx` — "by {login}", delete confirm.
- `src/web/…` report index list — "by {login}".
- Tests under `src/main/handlers/__tests__/` and renderer `__tests__/`.
