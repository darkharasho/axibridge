# Publishing Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GitHub Pages site you publish to a first-class, visible thing: a saved site list, a "Publishing to" card with members under it, a publish button that names its target, and org-aware collaborator errors.

**Architecture:** Pure site-list helpers live in `src/shared/githubSites.ts`. A small main-process store wrapper (`src/main/githubSitesStore.ts`) owns the `githubSites` electron-store key, migrating from `githubFavoriteRepos` on first read and always keeping the default present. A new IPC module (`githubSitesHandlers.ts`) exposes list/add/remove/set-default/details/find. The renderer gets two new Settings components (`PublishingSiteCard`, `SiteListPanel`) that replace the Repository well and the standalone invites block; the publish button and History picker read `githubSites` from `get-settings`.

**Tech Stack:** Electron (ipcMain/preload), React 18 + TypeScript, electron-store, vitest + @testing-library/react + jsdom, GitHub REST API via `githubApiRequest`.

**Spec:** `docs/superpowers/specs/2026-10-04-publishing-sites-design.md`

## Global Constraints

- No new OAuth scope; members are repo collaborators only (no teams, no `read:org`/`admin:org`).
- No change to the publish pipeline (commit loop, appearance rules, viewer gate, override branch/path resolution).
- `githubFavoriteRepos` is never written or read by new code, except the one-time migration reads it. It is left in the store untouched.
- The default site stays in `githubRepoOwner` / `githubRepoName`; it is always present in `githubSites`.
- Site keys compare case-insensitively on `owner/repo` (`normalizeSiteKey`).
- `SITE_DESCRIPTION = 'AxiBridge Reports'` is the only "is an AxiBridge site" signal for Find my sites.
- vitest: always `--maxWorkers=2` (repo config already sets `maxWorkers: 2`; pass it anyway on CLI runs).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If 1Password GPG signing fails, retry once, then `--no-gpg-sign` and say so in the report.
- Never `git reset`, `git checkout -- .`, `git clean`, `git stash`, `git rebase`, or `git push`. Run long npm commands in the foreground.
- Floating surfaces need opaque glass overrides (memory: glass theme surface rules). This plan renders the site list **inline** (an `axi-well` under the card), not as a floating popover, to stay clear of that.

## Rulings made while planning (deviations from / additions to the spec)

1. **Set default also resolves branch and Pages.** `set-default-github-site` writes `githubBranch`, `githubPagesBaseUrl` and `githubPagesSourcePath` from a read-only Pages lookup (Pages `source.branch`, else repo `default_branch`, else keep the stored branch), the same values `accept-site-invite` writes. Otherwise switching from a `gh-pages` site to a `main` site would publish to the wrong branch. `create-github-repo` likewise sets `githubBranch` to the branch it created with.
2. **No main-side details cache.** The renderer calls `get-github-site-details` when Settings loads the default, when the site panel opens, and when the stats view mounts. Each call is two GETs per site; `getRepoPermissions` keeps its own 60 s cache for the publish path.
3. **`role: null` means "unknown".** Details report `role: null` on network errors, 5xx, and rate-limit 403s (fail open); `'none'` only on 404 or a non-rate-limit 403, or a 200 without `push`.
4. **Publishers see the member list.** `get-repo-publishers` lists collaborators for any user with push (GitHub allows it); invites stay admin-only. This is what makes "publishers see the list read-only" possible. One existing test changes accordingly.
5. **`memberCount`** is recorded in a session map whenever `get-repo-publishers` lists collaborators, and returned by details. It is the count of push collaborators.
6. **Copy:** the popover line reads "Your report appears at <url>, alongside reports from N other commanders." (avoids the dangling "commanders'").
7. **The renderer stops writing `githubPagesBaseUrl`.** The SettingsView effect that saved the *inferred* URL is removed; every path that changes the default (set-default, create, join, upload) writes the real Pages URL in main. The old effect would overwrite a custom-domain URL.
8. **Invites badge.** Because invites move inside the site panel, the "Switch site" button shows a pending-invite count so a banner dismissal is never a dead end.
9. **Use existing repo with no default** makes the picked repo the default instead of only adding it.
10. **`PendingSiteInvites.tsx` and its test are deleted**; their behaviour moves into `SiteListPanel` and its tests.

## Review Focus

1. **Migration on a store with stars but no default** (`githubRepoOwner` empty, favourites present) — every valid favourite becomes a `manual` site, no phantom default row, nothing thrown. Pinned in Task 1 (`migrateFavoritesToSites`) and Task 2 (`readSites`).
2. **Default case drift** — the store holds `Guild/Site` and the list holds `guild/site`; the list must not grow a duplicate, and the ✕ on that row must be refused as "current". Pinned in Task 1 and Task 2.
3. **SettingsView autosave clobbering** — after a site switch/join/create from the panel, the next debounced whole-state save must write the new owner/repo and must not contain `githubFavoriteRepos`. Pinned in Task 7.
4. **Details failure during publish** — `getGithubSiteDetails` rejects or returns `success:false`; the publish button must still name the default and offer every saved site. Pinned in Task 8.
5. **Org-blocked invite on a personal repo** — a 403 "not allowed" on a `User`-owned repo must keep GitHub's raw message, not the org copy. Pinned in Task 4.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/githubSites.ts` (create) | Types (`IGithubSite`, `ISiteDetails`, …) and pure list helpers |
| `src/shared/__tests__/githubSites.test.ts` (create) | Helper tests |
| `src/main/githubSitesStore.ts` (create) | `readSites` (migrate + keep default) / `writeSites` / `getDefaultSiteKey` |
| `src/main/githubApi.ts` (modify) | Session member-count map, cleared by `resetGithubApiCaches` |
| `src/main/handlers/githubSitesHandlers.ts` (create) | `get-github-sites`, `add-github-site`, `remove-github-site`, `set-default-github-site`, `get-github-site-details`, `find-github-sites` |
| `src/main/handlers/__tests__/githubSitesHandlers.test.ts` (create) | Handler tests on the `githubHttpsMock` harness |
| `src/main/handlers/githubPublishersHandlers.ts` (modify) | Export `SITE_DESCRIPTION`; join writes sites; publishers list for push users; org error copy; member count |
| `src/main/handlers/githubHandlers.ts` (modify) | `create-github-repo` adds the site, sets branch |
| `src/main/handlers/settingsHandlers.ts` (modify) | `get-settings` (both copies) returns `githubSites` |
| `src/main/index.ts` (modify) | Register sites handlers |
| `src/preload/index.ts`, `src/renderer/global.d.ts` (modify) | Bridge + types |
| `src/renderer/settings/validateRepoName.ts` (create) | Moved out of SettingsView (avoid an import cycle) |
| `src/renderer/settings/PublishingSiteCard.tsx` (create) | The "Publishing to" card |
| `src/renderer/settings/SiteListPanel.tsx` (create) | Your sites / invites / create / use existing / find |
| `src/renderer/settings/PublishersCard.tsx` (modify) | Restyled as Members; read-only list; org help link |
| `src/renderer/settings/PendingSiteInvites.tsx` + test (delete) | Replaced by the panel |
| `src/renderer/SettingsView.tsx` (modify) | Wire the card + panel, drop favourites/repo-picker state |
| `src/renderer/stats/hooks/useStatsUploads.ts` (modify) | Targets from `githubSites` + details |
| `src/renderer/stats/ui/StatsHeader.tsx`, `PublishWebhookPopover.tsx` (modify) | "Publish to owner/repo" + destination note |
| `src/renderer/FightReportHistoryView.tsx` (modify) | Picker from `githubSites` |

---

### Task 1: Shared site-list helpers

**Files:**
- Create: `src/shared/githubSites.ts`
- Test: `src/shared/__tests__/githubSites.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `type SiteAddedVia = 'default' | 'manual' | 'joined' | 'found'`
  - `interface IGithubSite { owner: string; repo: string; addedVia: SiteAddedVia; addedAt: string }`
  - `type SiteRole = 'admin' | 'publisher' | 'none'`
  - `interface ISiteDetails { role: SiteRole | null; ownerType: 'User' | 'Organization' | null; ownerAvatarUrl: string | null; pagesUrl: string; memberCount: number | null }`
  - `interface SiteRef { owner: string; repo: string }`
  - `normalizeSiteKey(owner: string, repo: string): string`
  - `siteFullName(site: SiteRef): string`
  - `inferredPagesUrl(site: SiteRef): string`
  - `parseSiteFullName(value: unknown): SiteRef | null`
  - `hasSite(sites: IGithubSite[], site: SiteRef): boolean`
  - `addSite(sites, site: SiteRef, addedVia, now?): IGithubSite[]`
  - `withDefault(sites, owner: string, repo: string, now?): IGithubSite[]`
  - `removeSite(sites, site: SiteRef, defaultKey: string | null): { sites: IGithubSite[]; error?: string }`
  - `setDefaultSite(sites, site: SiteRef, now?): IGithubSite[]`
  - `sanitizeSites(raw: unknown): IGithubSite[]`
  - `migrateFavoritesToSites(owner: string, repo: string, favorites: unknown, now?): IGithubSite[]`
  - `mergeFoundSites(sites, found: SiteRef[]): SiteRef[]`
  - `sortSitesDefaultFirst(sites, defaultKey: string | null): IGithubSite[]`
  - `describeDestination(pagesUrl: string, memberCount: number | null): string`

- [ ] **Step 1: Write the failing tests**

`src/shared/__tests__/githubSites.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    addSite, describeDestination, hasSite, inferredPagesUrl, mergeFoundSites, migrateFavoritesToSites,
    normalizeSiteKey, parseSiteFullName, removeSite, sanitizeSites, setDefaultSite, sortSitesDefaultFirst,
    withDefault, type IGithubSite
} from '../githubSites';

const NOW = '2026-10-04T00:00:00.000Z';
const site = (owner: string, repo: string, addedVia: IGithubSite['addedVia'] = 'manual'): IGithubSite => ({ owner, repo, addedVia, addedAt: NOW });

describe('normalizeSiteKey / parseSiteFullName', () => {
    it('lowercases and trims', () => {
        expect(normalizeSiteKey(' Guild ', 'Site ')).toBe('guild/site');
    });
    it('parses owner/repo and rejects junk', () => {
        expect(parseSiteFullName(' guild/site ')).toEqual({ owner: 'guild', repo: 'site' });
        expect(parseSiteFullName('guild/my.site_2-x')).toEqual({ owner: 'guild', repo: 'my.site_2-x' });
        expect(parseSiteFullName('guild')).toBeNull();
        expect(parseSiteFullName('a/b/c')).toBeNull();
        expect(parseSiteFullName('guild/ ')).toBeNull();
        expect(parseSiteFullName('gu ild/site')).toBeNull();
        expect(parseSiteFullName(42)).toBeNull();
        expect(parseSiteFullName(null)).toBeNull();
    });
    it('infers the Pages URL', () => {
        expect(inferredPagesUrl({ owner: 'guild', repo: 'site' })).toBe('https://guild.github.io/site');
    });
});

describe('addSite', () => {
    it('appends a new site', () => {
        expect(addSite([], { owner: 'guild', repo: 'site' }, 'joined', NOW)).toEqual([site('guild', 'site', 'joined')]);
    });
    it('dedupes case-insensitively and keeps the original entry', () => {
        const sites = [site('Guild', 'Site', 'default')];
        expect(addSite(sites, { owner: 'guild', repo: 'site' }, 'manual', NOW)).toBe(sites);
    });
    it('ignores invalid names', () => {
        const sites: IGithubSite[] = [];
        expect(addSite(sites, { owner: '', repo: 'x' }, 'manual', NOW)).toBe(sites);
        expect(addSite(sites, { owner: 'a b', repo: 'x' }, 'manual', NOW)).toBe(sites);
    });
});

describe('withDefault', () => {
    it('prepends a missing default', () => {
        expect(withDefault([site('x', 'y')], 'guild', 'site', NOW)).toEqual([site('guild', 'site', 'default'), site('x', 'y')]);
    });
    it('leaves the list alone when the default is present in another case', () => {
        const sites = [site('x', 'y'), site('Guild', 'Site')];
        expect(withDefault(sites, 'guild', 'site', NOW)).toBe(sites);
    });
    it('leaves the list alone with no default', () => {
        const sites = [site('x', 'y')];
        expect(withDefault(sites, '', '', NOW)).toBe(sites);
    });
});

describe('removeSite', () => {
    it('removes a non-default site', () => {
        expect(removeSite([site('a', 'b'), site('x', 'y')], { owner: 'X', repo: 'Y' }, 'a/b')).toEqual({ sites: [site('a', 'b')] });
    });
    it('refuses the default, case-insensitively', () => {
        const sites = [site('Guild', 'Site', 'default')];
        const res = removeSite(sites, { owner: 'Guild', repo: 'Site' }, 'guild/site');
        expect(res.sites).toBe(sites);
        expect(res.error).toBe('Switch to another site before removing your current one.');
    });
});

describe('setDefaultSite', () => {
    it('adds the new default when missing and keeps existing entries', () => {
        expect(setDefaultSite([site('a', 'b')], { owner: 'x', repo: 'y' }, NOW)).toEqual([site('a', 'b'), site('x', 'y')]);
    });
    it('is a no-op for a listed site', () => {
        const sites = [site('a', 'b')];
        expect(setDefaultSite(sites, { owner: 'A', repo: 'B' }, NOW)).toBe(sites);
    });
});

describe('sanitizeSites', () => {
    it('drops malformed entries and duplicates', () => {
        const raw = [site('a', 'b'), { owner: 'a', repo: 'B', addedVia: 'manual', addedAt: NOW }, { owner: 1 }, null, 'a/b',
            { owner: 'c', repo: 'd', addedVia: 'weird', addedAt: NOW }, { owner: 'e', repo: 'f' }];
        expect(sanitizeSites(raw)).toEqual([site('a', 'b'), { owner: 'c', repo: 'd', addedVia: 'manual', addedAt: NOW }, { owner: 'e', repo: 'f', addedVia: 'manual', addedAt: '' }]);
    });
    it('returns [] for non-arrays', () => {
        expect(sanitizeSites(undefined)).toEqual([]);
        expect(sanitizeSites({})).toEqual([]);
    });
});

describe('migrateFavoritesToSites', () => {
    it('puts the default first and favourites after, without duplicating the default', () => {
        expect(migrateFavoritesToSites('guild', 'site', ['Guild/Site', 'x/y', 'bad', 7, 'x/Y'], NOW))
            .toEqual([site('guild', 'site', 'default'), site('x', 'y')]);
    });
    it('handles no default and a missing favourites list', () => {
        expect(migrateFavoritesToSites('', '', ['x/y'], NOW)).toEqual([site('x', 'y')]);
        expect(migrateFavoritesToSites('', '', undefined, NOW)).toEqual([]);
        expect(migrateFavoritesToSites('guild', 'site', null, NOW)).toEqual([site('guild', 'site', 'default')]);
    });
});

describe('mergeFoundSites', () => {
    it('drops known sites and duplicates among the results', () => {
        expect(mergeFoundSites([site('a', 'b')], [{ owner: 'A', repo: 'B' }, { owner: 'x', repo: 'y' }, { owner: 'X', repo: 'Y' }]))
            .toEqual([{ owner: 'x', repo: 'y' }]);
    });
});

describe('sortSitesDefaultFirst', () => {
    it('moves the default to the front and keeps the rest in order', () => {
        const sites = [site('a', 'b'), site('c', 'd'), site('Guild', 'Site')];
        expect(sortSitesDefaultFirst(sites, 'guild/site').map((s) => s.repo)).toEqual(['Site', 'b', 'd']);
        expect(sortSitesDefaultFirst(sites, null)).toEqual(sites);
    });
});

describe('describeDestination', () => {
    it('names the URL and the other commanders', () => {
        expect(describeDestination('https://g.github.io/s', 4)).toBe('Your report appears at https://g.github.io/s, alongside reports from 3 other commanders.');
        expect(describeDestination('https://g.github.io/s', 2)).toBe('Your report appears at https://g.github.io/s, alongside reports from 1 other commander.');
    });
    it('omits the clause when nobody else publishes or the count is unknown', () => {
        expect(describeDestination('https://g.github.io/s', 1)).toBe('Your report appears at https://g.github.io/s.');
        expect(describeDestination('https://g.github.io/s', null)).toBe('Your report appears at https://g.github.io/s.');
    });
});

it('hasSite is case-insensitive', () => {
    expect(hasSite([site('Guild', 'Site')], { owner: 'guild', repo: 'SITE' })).toBe(true);
    expect(hasSite([], { owner: 'guild', repo: 'site' })).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/shared/__tests__/githubSites.test.ts`
Expected: FAIL — cannot resolve `../githubSites`.

- [ ] **Step 3: Implement**

`src/shared/githubSites.ts`:

```ts
/**
 * The list of GitHub Pages sites a user publishes to. The default site lives
 * in the githubRepoOwner/githubRepoName store keys; this list holds it plus
 * every other site, and every helper here is pure so main and renderer agree.
 */
export type SiteAddedVia = 'default' | 'manual' | 'joined' | 'found';
export interface IGithubSite { owner: string; repo: string; addedVia: SiteAddedVia; addedAt: string }
export type SiteRole = 'admin' | 'publisher' | 'none';
/** Live, unpersisted facts about a site. `role: null` = the lookup failed; treat as usable. */
export interface ISiteDetails {
    role: SiteRole | null;
    ownerType: 'User' | 'Organization' | null;
    ownerAvatarUrl: string | null;
    pagesUrl: string;
    memberCount: number | null;
}
export interface SiteRef { owner: string; repo: string }

const NAME_RE = /^[A-Za-z0-9._-]+$/;
const ADDED_VIA: SiteAddedVia[] = ['default', 'manual', 'joined', 'found'];

export const normalizeSiteKey = (owner: string, repo: string) => `${owner.trim()}/${repo.trim()}`.toLowerCase();
export const siteFullName = (site: SiteRef) => `${site.owner}/${site.repo}`;
export const inferredPagesUrl = (site: SiteRef) => `https://${site.owner}.github.io/${site.repo}`;

const validRef = (owner: string, repo: string) => NAME_RE.test(owner) && NAME_RE.test(repo);

export const parseSiteFullName = (value: unknown): SiteRef | null => {
    if (typeof value !== 'string') return null;
    const parts = value.trim().split('/');
    if (parts.length !== 2) return null;
    const owner = parts[0].trim();
    const repo = parts[1].trim();
    return validRef(owner, repo) ? { owner, repo } : null;
};

export const hasSite = (sites: IGithubSite[], site: SiteRef) => {
    const key = normalizeSiteKey(site.owner, site.repo);
    return sites.some((s) => normalizeSiteKey(s.owner, s.repo) === key);
};

export const addSite = (sites: IGithubSite[], site: SiteRef, addedVia: SiteAddedVia, now = new Date().toISOString()): IGithubSite[] => {
    const owner = site.owner.trim();
    const repo = site.repo.trim();
    if (!validRef(owner, repo) || hasSite(sites, { owner, repo })) return sites;
    return [...sites, { owner, repo, addedVia, addedAt: now }];
};

/** Prepends the default when it is missing; otherwise returns `sites` unchanged. */
export const withDefault = (sites: IGithubSite[], owner: string, repo: string, now = new Date().toISOString()): IGithubSite[] => {
    const o = owner.trim();
    const r = repo.trim();
    if (!validRef(o, r) || hasSite(sites, { owner: o, repo: r })) return sites;
    return [{ owner: o, repo: r, addedVia: 'default', addedAt: now }, ...sites];
};

export const removeSite = (sites: IGithubSite[], site: SiteRef, defaultKey: string | null): { sites: IGithubSite[]; error?: string } => {
    const key = normalizeSiteKey(site.owner, site.repo);
    if (defaultKey && key === defaultKey) {
        return { sites, error: 'Switch to another site before removing your current one.' };
    }
    return { sites: sites.filter((s) => normalizeSiteKey(s.owner, s.repo) !== key) };
};

export const setDefaultSite = (sites: IGithubSite[], site: SiteRef, now = new Date().toISOString()) =>
    addSite(sites, site, 'manual', now);

export const sanitizeSites = (raw: unknown): IGithubSite[] => {
    if (!Array.isArray(raw)) return [];
    let out: IGithubSite[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const { owner, repo, addedVia, addedAt } = entry as Record<string, unknown>;
        if (typeof owner !== 'string' || typeof repo !== 'string') continue;
        const via = ADDED_VIA.includes(addedVia as SiteAddedVia) ? addedVia as SiteAddedVia : 'manual';
        out = addSite(out, { owner, repo }, via, typeof addedAt === 'string' ? addedAt : '');
    }
    return out;
};

export const migrateFavoritesToSites = (owner: string, repo: string, favorites: unknown, now = new Date().toISOString()): IGithubSite[] => {
    let sites = withDefault([], owner, repo, now);
    for (const fav of Array.isArray(favorites) ? favorites : []) {
        const ref = parseSiteFullName(fav);
        if (ref) sites = addSite(sites, ref, 'manual', now);
    }
    return sites;
};

export const mergeFoundSites = (sites: IGithubSite[], found: SiteRef[]): SiteRef[] => {
    const seen = new Set(sites.map((s) => normalizeSiteKey(s.owner, s.repo)));
    const out: SiteRef[] = [];
    for (const f of found) {
        const key = normalizeSiteKey(f.owner, f.repo);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ owner: f.owner, repo: f.repo });
    }
    return out;
};

export const sortSitesDefaultFirst = (sites: IGithubSite[], defaultKey: string | null): IGithubSite[] => {
    if (!defaultKey) return sites;
    const isDefault = (s: IGithubSite) => normalizeSiteKey(s.owner, s.repo) === defaultKey;
    return [...sites.filter(isDefault), ...sites.filter((s) => !isDefault(s))];
};

export const describeDestination = (pagesUrl: string, memberCount: number | null): string => {
    const others = memberCount === null ? 0 : memberCount - 1;
    if (others <= 0) return `Your report appears at ${pagesUrl}.`;
    return `Your report appears at ${pagesUrl}, alongside reports from ${others} other commander${others === 1 ? '' : 's'}.`;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/shared/__tests__/githubSites.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/shared/githubSites.ts src/shared/__tests__/githubSites.test.ts
git commit -m "feat: pure helpers for the publishing site list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Site store, list/add/remove/set-default IPC, settings exposure

**Files:**
- Create: `src/main/githubSitesStore.ts`
- Create: `src/main/handlers/githubSitesHandlers.ts`
- Create: `src/main/handlers/__tests__/githubSitesHandlers.test.ts`
- Modify: `src/main/handlers/settingsHandlers.ts` (both `githubFavoriteRepos:` lines, ~216 and ~298)
- Modify: `src/main/index.ts` (import near line 94; register after `registerPublishersHandlers({ store });` ~line 2143)
- Modify: `src/preload/index.ts` (after `dismissSiteInvite`, ~line 174)
- Modify: `src/renderer/global.d.ts`

**Interfaces:**
- Consumes: Task 1 helpers and types.
- Produces:
  - `readSites(store): IGithubSite[]`, `writeSites(store, sites): void`, `getDefaultSiteKey(store): string | null` from `src/main/githubSitesStore.ts`
  - `registerSitesHandlers({ store }): void` from `src/main/handlers/githubSitesHandlers.ts`
  - IPC results: `get-github-sites` → `{ success: true, sites, defaultKey }`; `add-github-site` / `remove-github-site` → `{ success, sites, error? }`; `set-default-github-site` → `{ success, sites, defaultKey, pagesUrl?, error? }`
  - `get-settings` result gains `githubSites: IGithubSite[]`
  - preload: `getGithubSites()`, `addGithubSite({ owner, repo, addedVia })`, `removeGithubSite({ owner, repo })`, `setDefaultGithubSite({ owner, repo })`, plus (implemented in Task 3, bridged here) `getGithubSiteDetails(sites: SiteRef[])`, `findGithubSites()`

- [ ] **Step 1: Write the failing tests**

`src/main/handlers/__tests__/githubSitesHandlers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) } }));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
import { readSites } from '../../githubSitesStore';
import { registerSitesHandlers } from '../githubSitesHandlers';

const makeStore = (values: Record<string, unknown>) => {
    const data: Record<string, unknown> = { ...values };
    return { get: (k: string, d?: unknown) => (k in data ? data[k] : d), set: vi.fn((k: string, v: unknown) => { data[k] = v; }), data };
};
const invoke = (ch: string, payload?: unknown) => handlers.get(ch)!({}, payload);
const keys = (sites: any[]) => sites.map((s) => `${s.owner}/${s.repo}:${s.addedVia}`);

let store: ReturnType<typeof makeStore>;
const setup = (values: Record<string, unknown>, responder: (c: RecordedCall) => MockResponse = () => ({ status: 404 })) => {
    handlers.clear();
    store = makeStore({ githubToken: 'tok', ...values });
    registerSitesHandlers({ store });
    return installHttpsMock(responder);
};

beforeEach(() => { vi.restoreAllMocks(); resetGithubApiCaches(); });

describe('readSites', () => {
    it('migrates favourites once and leaves githubFavoriteRepos untouched', () => {
        const s = makeStore({ githubRepoOwner: 'guild', githubRepoName: 'site', githubFavoriteRepos: ['x/y', 'Guild/Site'] });
        expect(keys(readSites(s))).toEqual(['guild/site:default', 'x/y:manual']);
        expect(s.data.githubFavoriteRepos).toEqual(['x/y', 'Guild/Site']);
        s.data.githubFavoriteRepos = ['z/z'];
        expect(keys(readSites(s))).toEqual(['guild/site:default', 'x/y:manual']);
    });
    it('migrates favourites with no default', () => {
        const s = makeStore({ githubFavoriteRepos: ['x/y'] });
        expect(keys(readSites(s))).toEqual(['x/y:manual']);
    });
    it('adds a default written elsewhere and does not duplicate it across case', () => {
        const s = makeStore({ githubRepoOwner: 'Guild', githubRepoName: 'Site', githubSites: [{ owner: 'guild', repo: 'site', addedVia: 'manual', addedAt: '' }] });
        expect(readSites(s)).toHaveLength(1);
        s.data.githubRepoOwner = 'new';
        s.data.githubRepoName = 'one';
        expect(keys(readSites(s))).toEqual(['new/one:default', 'guild/site:manual']);
    });
    it('does not write when nothing changed', () => {
        const s = makeStore({ githubSites: [] });
        readSites(s);
        expect(s.set).not.toHaveBeenCalled();
    });
});

describe('get-github-sites / add / remove', () => {
    it('lists sites with the default key', async () => {
        setup({ githubRepoOwner: 'Guild', githubRepoName: 'Site' });
        const res = await invoke('get-github-sites');
        expect(res).toMatchObject({ success: true, defaultKey: 'guild/site' });
        expect(keys(res.sites)).toEqual(['Guild/Site:default']);
    });
    it('adds a manual site and persists it', async () => {
        setup({});
        const res = await invoke('add-github-site', { owner: 'x', repo: 'y', addedVia: 'manual' });
        expect(keys(res.sites)).toEqual(['x/y:manual']);
        expect(keys(store.data.githubSites as any[])).toEqual(['x/y:manual']);
    });
    it('rejects a bad name or addedVia', async () => {
        setup({});
        expect(await invoke('add-github-site', { owner: 'a b', repo: 'y', addedVia: 'manual' })).toMatchObject({ success: false, error: 'Not a valid owner/repo.' });
        expect((await invoke('add-github-site', { owner: 'x', repo: 'y', addedVia: 'default' })).success).toBe(false);
    });
    it('refuses to remove the current default', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' });
        expect(await invoke('remove-github-site', { owner: 'GUILD', repo: 'site' }))
            .toMatchObject({ success: false, error: 'Switch to another site before removing your current one.' });
    });
    it('removes another site', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site', githubSites: [
            { owner: 'guild', repo: 'site', addedVia: 'default', addedAt: '' }, { owner: 'x', repo: 'y', addedVia: 'manual', addedAt: '' }
        ] });
        const res = await invoke('remove-github-site', { owner: 'x', repo: 'y' });
        expect(keys(res.sites)).toEqual(['guild/site:default']);
    });
});

describe('set-default-github-site', () => {
    it('writes the default and its Pages branch, folder and URL', async () => {
        setup({ githubRepoOwner: 'old', githubRepoName: 'one', githubBranch: 'main' }, (c) => {
            if (c.path === '/repos/guild/site/pages') return { status: 200, body: { html_url: 'https://reports.example.com/', source: { branch: 'gh-pages', path: '/docs' } } };
            return { status: 404 };
        });
        const res = await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(res).toMatchObject({ success: true, defaultKey: 'guild/site', pagesUrl: 'https://reports.example.com/' });
        expect(keys(res.sites)).toEqual(['old/one:default', 'guild/site:manual']);
        expect(store.data).toMatchObject({
            githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'gh-pages',
            githubPagesBaseUrl: 'https://reports.example.com/', githubPagesSourcePath: 'docs'
        });
    });
    it('falls back to the default branch and inferred URL without Pages', async () => {
        setup({ githubBranch: 'gh-pages' }, (c) => (c.path === '/repos/guild/site' ? { status: 200, body: { default_branch: 'trunk' } } : { status: 404 }));
        await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(store.data).toMatchObject({ githubBranch: 'trunk', githubPagesBaseUrl: 'https://guild.github.io/site', githubPagesSourcePath: '' });
    });
    it('keeps the stored branch when both lookups fail', async () => {
        setup({ githubBranch: 'gh-pages' }, () => ({ status: 500 }));
        await invoke('set-default-github-site', { owner: 'guild', repo: 'site' });
        expect(store.data.githubBranch).toBe('gh-pages');
    });
    it('needs a token', async () => {
        handlers.clear();
        store = makeStore({});
        registerSitesHandlers({ store });
        expect(await invoke('set-default-github-site', { owner: 'guild', repo: 'site' })).toMatchObject({ success: false, error: 'GitHub not connected.' });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/githubSitesHandlers.test.ts`
Expected: FAIL — cannot resolve `../../githubSitesStore`.

- [ ] **Step 3: Implement the store wrapper**

`src/main/githubSitesStore.ts`:

```ts
import {
    migrateFavoritesToSites, normalizeSiteKey, sanitizeSites, withDefault, type IGithubSite
} from '../shared/githubSites';

const storedDefault = (store: any) => ({
    owner: String(store.get('githubRepoOwner') || '').trim(),
    repo: String(store.get('githubRepoName') || '').trim()
});

export const getDefaultSiteKey = (store: any): string | null => {
    const { owner, repo } = storedDefault(store);
    return owner && repo ? normalizeSiteKey(owner, repo) : null;
};

/**
 * The saved site list. The first read on an install without `githubSites`
 * builds it from the default plus `githubFavoriteRepos` (left in place for
 * downgrades, never read again). Every read keeps the default present, since
 * other code (create-repo, settings save) writes the default keys directly.
 */
export const readSites = (store: any): IGithubSite[] => {
    const raw = store.get('githubSites');
    const { owner, repo } = storedDefault(store);
    const sites = raw === undefined
        ? migrateFavoritesToSites(owner, repo, store.get('githubFavoriteRepos', []))
        : withDefault(sanitizeSites(raw), owner, repo);
    if (raw === undefined || JSON.stringify(sites) !== JSON.stringify(raw)) store.set('githubSites', sites);
    return sites;
};

export const writeSites = (store: any, sites: IGithubSite[]) => {
    store.set('githubSites', sites);
};
```

- [ ] **Step 4: Implement the handlers (list/add/remove/set-default)**

`src/main/handlers/githubSitesHandlers.ts`:

```ts
/**
 * The publishing site list: which GitHub Pages sites this user publishes to,
 * and which one is the default. Access itself lives on GitHub; this list is
 * only the user's bookmarks plus live lookups.
 */
import { ipcMain } from 'electron';
import { encodeGitPath, githubApiRequest } from '../githubApi';
import { getDefaultSiteKey, readSites, writeSites } from '../githubSitesStore';
import {
    addSite, inferredPagesUrl, normalizeSiteKey, parseSiteFullName, removeSite, setDefaultSite,
    type SiteAddedVia, type SiteRef
} from '../../shared/githubSites';

const normalizePagesPath = (value: unknown) => String(value || '').trim().replace(/^\/+|\/+$/g, '');
const repoPath = (owner: string, repo: string) => `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`;
const toRef = (payload: unknown): SiteRef | null => {
    const p = payload as { owner?: unknown; repo?: unknown } | undefined;
    return parseSiteFullName(`${String(p?.owner ?? '')}/${String(p?.repo ?? '')}`);
};
const INVALID = { success: false, error: 'Not a valid owner/repo.' } as const;
const USER_ADDED: SiteAddedVia[] = ['manual', 'found'];

export interface SitesHandlerOptions { store: any }

export function registerSitesHandlers({ store }: SitesHandlerOptions) {
    readSites(store); // migrate at startup, not on the first Settings visit

    const getToken = () => store.get('githubToken') as string | undefined;
    const getStoredBranch = () => ((store.get('githubBranch') as string | undefined)?.trim()) || 'main';

    ipcMain.handle('get-github-sites', async () => ({
        success: true, sites: readSites(store), defaultKey: getDefaultSiteKey(store)
    }));

    ipcMain.handle('add-github-site', async (_e, payload: { owner: string; repo: string; addedVia: SiteAddedVia }) => {
        const ref = toRef(payload);
        if (!ref || !USER_ADDED.includes(payload?.addedVia)) return { ...INVALID, sites: readSites(store) };
        const sites = addSite(readSites(store), ref, payload.addedVia);
        writeSites(store, sites);
        return { success: true, sites };
    });

    ipcMain.handle('remove-github-site', async (_e, payload: { owner: string; repo: string }) => {
        const ref = toRef(payload);
        if (!ref) return { ...INVALID, sites: readSites(store) };
        const res = removeSite(readSites(store), ref, getDefaultSiteKey(store));
        if (res.error) return { success: false, error: res.error, sites: res.sites };
        writeSites(store, res.sites);
        return { success: true, sites: res.sites };
    });

    /**
     * Read-only, like an override publish: Pages source branch and folder, else
     * the repo's default branch at the root, else the stored branch. Never
     * enables Pages — the first publish does that.
     */
    ipcMain.handle('set-default-github-site', async (_e, payload: { owner: string; repo: string }) => {
        const ref = toRef(payload);
        if (!ref) return { ...INVALID, sites: readSites(store) };
        const token = getToken();
        if (!token) return { success: false, error: 'GitHub not connected.', sites: readSites(store) };
        const path = repoPath(ref.owner, ref.repo);
        const pages: any = await githubApiRequest('GET', `${path}/pages`, token)
            .then((r) => (r.status === 200 ? r.data : null))
            .catch(() => null);
        let branch = typeof pages?.source?.branch === 'string' ? pages.source.branch.trim() : '';
        if (!branch) {
            branch = await githubApiRequest('GET', path, token)
                .then((r) => (r.status === 200 && typeof r.data?.default_branch === 'string' ? r.data.default_branch.trim() : ''))
                .catch(() => '');
        }
        const pagesUrl = typeof pages?.html_url === 'string' && pages.html_url ? pages.html_url as string : inferredPagesUrl(ref);
        // List first: readSites re-adds whatever default the store holds.
        const sites = setDefaultSite(readSites(store), ref);
        writeSites(store, sites);
        store.set('githubRepoOwner', ref.owner);
        store.set('githubRepoName', ref.repo);
        store.set('githubBranch', branch || getStoredBranch());
        store.set('githubPagesBaseUrl', pagesUrl);
        store.set('githubPagesSourcePath', normalizePagesPath(pages?.source?.path));
        return { success: true, sites, defaultKey: normalizeSiteKey(ref.owner, ref.repo), pagesUrl };
    });
}
```

- [ ] **Step 5: Expose `githubSites` from get-settings**

In `src/main/handlers/settingsHandlers.ts`, add the import at the top with the other imports:

```ts
import { readSites } from '../githubSitesStore';
```

and in **both** settings objects replace

```ts
            githubFavoriteRepos: store.get('githubFavoriteRepos', []),
```

with

```ts
            githubSites: readSites(store),
```

Then search the file and its tests for any other `githubFavoriteRepos` reference (`grep -rn githubFavoriteRepos src/main`); the only remaining ones allowed in `src/main` after this task are `index.ts` `applySettings` (accepts a value from an imported settings file; leave it) and `githubPublishersHandlers.ts` (changed in Task 4).

- [ ] **Step 6: Register and bridge**

`src/main/index.ts`: below `import { registerPublishersHandlers } from './handlers/githubPublishersHandlers';` add

```ts
import { registerSitesHandlers } from './handlers/githubSitesHandlers';
```

and directly below `registerPublishersHandlers({ store });` add

```ts
        registerSitesHandlers({ store });
```

`src/preload/index.ts`, after the `dismissSiteInvite` line:

```ts
    getGithubSites: () => ipcRenderer.invoke('get-github-sites'),
    addGithubSite: (payload: { owner: string; repo: string; addedVia: 'manual' | 'found' }) => ipcRenderer.invoke('add-github-site', payload),
    removeGithubSite: (payload: { owner: string; repo: string }) => ipcRenderer.invoke('remove-github-site', payload),
    setDefaultGithubSite: (payload: { owner: string; repo: string }) => ipcRenderer.invoke('set-default-github-site', payload),
    getGithubSiteDetails: (sites: Array<{ owner: string; repo: string }>) => ipcRenderer.invoke('get-github-site-details', sites),
    findGithubSites: () => ipcRenderer.invoke('find-github-sites'),
```

`src/renderer/global.d.ts`:
- Add near the top imports: `import type { IGithubSite, ISiteDetails, SiteRef } from '../shared/githubSites';` and re-export: `export type { IGithubSite, ISiteDetails, SiteRef };`
- In both settings interfaces (~lines 379 and 434) replace `githubFavoriteRepos?: string[] | null;` with:
  ```ts
          /** Frozen at migration; read only by the one-time migration in main. */
          githubFavoriteRepos?: string[] | null;
          githubSites?: IGithubSite[];
  ```
- In the `electronAPI` interface after `dismissSiteInvite`:
  ```ts
    getGithubSites: () => Promise<{ success: boolean; sites: IGithubSite[]; defaultKey: string | null }>;
    addGithubSite: (payload: { owner: string; repo: string; addedVia: 'manual' | 'found' }) => Promise<{ success: boolean; sites: IGithubSite[]; error?: string }>;
    removeGithubSite: (payload: { owner: string; repo: string }) => Promise<{ success: boolean; sites: IGithubSite[]; error?: string }>;
    setDefaultGithubSite: (payload: { owner: string; repo: string }) => Promise<{ success: boolean; sites: IGithubSite[]; defaultKey?: string; pagesUrl?: string; error?: string }>;
    getGithubSiteDetails: (sites: SiteRef[]) => Promise<{ success: boolean; details?: Record<string, ISiteDetails>; error?: string }>;
    findGithubSites: () => Promise<{ success: boolean; found?: SiteRef[]; error?: string }>;
  ```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/githubSitesHandlers.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS. (`SettingsView` still reads `settings.githubFavoriteRepos`, which is still on the type, so it compiles.)

- [ ] **Step 8: Commit**

```bash
git add src/main/githubSitesStore.ts src/main/handlers/githubSitesHandlers.ts src/main/handlers/__tests__/githubSitesHandlers.test.ts src/main/handlers/settingsHandlers.ts src/main/index.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat: saved publishing site list with migration from starred repos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Site details and Find my sites

**Files:**
- Modify: `src/main/githubApi.ts` (member-count session map)
- Modify: `src/main/handlers/githubPublishersHandlers.ts` (export `SITE_DESCRIPTION` only)
- Modify: `src/main/handlers/githubSitesHandlers.ts`
- Test: `src/main/handlers/__tests__/githubSitesHandlers.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 handler module and store.
- Produces:
  - `recordMemberCount(owner: string, repo: string, count: number): void`, `getMemberCount(owner: string, repo: string): number | null` from `githubApi.ts`; `resetGithubApiCaches()` also clears them.
  - `export const SITE_DESCRIPTION = 'AxiBridge Reports'` from `githubPublishersHandlers.ts`
  - `get-github-site-details` (payload `SiteRef[]`) → `{ success: true, details: Record<normalizeSiteKey, ISiteDetails> }`
  - `find-github-sites` → `{ success: true, found: SiteRef[] }` or `{ success: false, error }`

- [ ] **Step 1: Write the failing tests** (append to the Task 2 test file; add `recordMemberCount` to the `githubApi` import)

```ts
import { recordMemberCount } from '../../githubApi';

describe('get-github-site-details', () => {
    const repoBody = (permissions: Record<string, boolean>, type = 'Organization') => ({
        status: 200, body: { owner: { type, avatar_url: 'a.png' }, permissions }
    });
    it('maps admin / push / 404 / 403 / rate limit / network error', async () => {
        setup({}, (c) => {
            if (c.path === '/repos/o/admin') return repoBody({ admin: true, push: true });
            if (c.path === '/repos/o/pub') return repoBody({ push: true }, 'User');
            if (c.path === '/repos/o/read') return repoBody({ pull: true });
            if (c.path === '/repos/o/gone') return { status: 404 };
            if (c.path === '/repos/o/denied') return { status: 403, body: { message: 'Must have push access' } };
            if (c.path === '/repos/o/limited') return { status: 403, body: { message: 'API rate limit exceeded for user' } };
            if (c.path === '/repos/o/admin/pages') return { status: 200, body: { html_url: 'https://custom.example/' } };
            if (c.path === '/repos/o/boom') return { status: 502 };
            return { status: 404 };
        });
        recordMemberCount('O', 'Admin', 4);
        const names = ['admin', 'pub', 'read', 'gone', 'denied', 'limited', 'boom'];
        const res = await invoke('get-github-site-details', names.map((repo) => ({ owner: 'o', repo })));
        const d = res.details;
        expect(d['o/admin']).toEqual({ role: 'admin', ownerType: 'Organization', ownerAvatarUrl: 'a.png', pagesUrl: 'https://custom.example/', memberCount: 4 });
        expect(d['o/pub']).toMatchObject({ role: 'publisher', ownerType: 'User', pagesUrl: 'https://o.github.io/pub', memberCount: null });
        expect(d['o/read'].role).toBe('none');
        expect(d['o/gone'].role).toBe('none');
        expect(d['o/denied'].role).toBe('none');
        expect(d['o/limited'].role).toBeNull();
        expect(d['o/boom']).toEqual({ role: null, ownerType: null, ownerAvatarUrl: null, pagesUrl: 'https://o.github.io/boom', memberCount: null });
    });
    it('skips the Pages lookup for a site with no access', async () => {
        const calls = setup({}, () => ({ status: 404 }));
        await invoke('get-github-site-details', [{ owner: 'o', repo: 'gone' }]);
        expect(calls.map((c) => c.path)).toEqual(['/repos/o/gone']);
    });
    it('ignores malformed entries and works without a token', async () => {
        handlers.clear();
        store = makeStore({});
        registerSitesHandlers({ store });
        const res = await invoke('get-github-site-details', [{ owner: 'a b', repo: 'x' }, { owner: 'o', repo: 'r' }]);
        expect(Object.keys(res.details)).toEqual(['o/r']);
        expect(res.details['o/r'].role).toBeNull();
    });
});

describe('find-github-sites', () => {
    const page = (n: number, extra: any[] = []) => [
        ...Array.from({ length: n }, (_, i) => ({ name: `r${i}`, owner: { login: 'filler' }, description: 'x', permissions: { push: true } })),
        ...extra
    ];
    it('keeps pushable AxiBridge sites not already listed, across pages', async () => {
        setup({ githubSites: [{ owner: 'guild', repo: 'known', addedVia: 'manual', addedAt: '' }] }, (c) => {
            if (c.path === '/user/repos?per_page=100&page=1') return { status: 200, body: page(98, [
                { name: 'known', owner: { login: 'guild' }, description: 'AxiBridge Reports', permissions: { push: true } },
                { name: 'site', owner: { login: 'guild' }, description: ' AxiBridge Reports ', permissions: { push: true } }
            ]) };
            if (c.path === '/user/repos?per_page=100&page=2') return { status: 200, body: [
                { name: 'readonly', owner: { login: 'x' }, description: 'AxiBridge Reports', permissions: { push: false } },
                { name: 'other', owner: { login: 'me' }, description: 'AxiBridge Reports', permissions: { admin: true, push: true } }
            ] };
            return { status: 404 };
        });
        const res = await invoke('find-github-sites');
        expect(res).toEqual({ success: true, found: [{ owner: 'guild', repo: 'site' }, { owner: 'me', repo: 'other' }] });
        expect(keys(store.data.githubSites as any[])).toEqual(['guild/known:manual']); // never adds
    });
    it('reports a failure', async () => {
        setup({}, () => ({ status: 500 }));
        expect(await invoke('find-github-sites')).toMatchObject({ success: false });
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/githubSitesHandlers.test.ts`
Expected: FAIL — `recordMemberCount` is not exported / no handler for `get-github-site-details`.

- [ ] **Step 3: Member-count session map**

In `src/main/githubApi.ts`, above `resetGithubApiCaches`:

```ts
/** Push collaborators per repo, recorded whenever a members list loads this session. */
const memberCounts = new Map<string, number>();
export const recordMemberCount = (owner: string, repo: string, count: number) => {
    memberCounts.set(permissionsKey(owner, repo), count);
};
export const getMemberCount = (owner: string, repo: string): number | null =>
    memberCounts.get(permissionsKey(owner, repo)) ?? null;
```

and add `memberCounts.clear();` inside `resetGithubApiCaches`.

- [ ] **Step 4: Export SITE_DESCRIPTION**

In `githubPublishersHandlers.ts` change `const SITE_DESCRIPTION = 'AxiBridge Reports';` to `export const SITE_DESCRIPTION = 'AxiBridge Reports';`.

- [ ] **Step 5: Implement the two handlers**

In `githubSitesHandlers.ts`, extend the imports:

```ts
import { encodeGitPath, getMemberCount, githubApiRequest } from '../githubApi';
import { SITE_DESCRIPTION } from './githubPublishersHandlers';
import {
    addSite, inferredPagesUrl, mergeFoundSites, normalizeSiteKey, parseSiteFullName, removeSite, setDefaultSite,
    type ISiteDetails, type SiteAddedVia, type SiteRef
} from '../../shared/githubSites';
```

Add a module-level helper above `registerSitesHandlers`:

```ts
const FIND_PAGE_LIMIT = 5;

/** `role: null` = couldn't tell (network, 5xx, rate limit): callers fail open. */
const lookupSiteDetails = async (ref: SiteRef, token: string | undefined): Promise<ISiteDetails> => {
    const unknown: ISiteDetails = {
        role: null, ownerType: null, ownerAvatarUrl: null, pagesUrl: inferredPagesUrl(ref), memberCount: getMemberCount(ref.owner, ref.repo)
    };
    if (!token) return unknown;
    const path = repoPath(ref.owner, ref.repo);
    let resp: { status: number; data: any };
    try {
        resp = await githubApiRequest('GET', path, token);
    } catch {
        return unknown;
    }
    const rateLimited = resp.status === 403 && /rate limit/i.test(String(resp.data?.message || ''));
    if (resp.status === 404 || (resp.status === 403 && !rateLimited)) return { ...unknown, role: 'none' };
    if (resp.status !== 200) return unknown;
    const perms = resp.data?.permissions ?? {};
    const role = perms.admin === true ? 'admin' : perms.push === true ? 'publisher' : 'none';
    const ownerTypeRaw = resp.data?.owner?.type;
    const details: ISiteDetails = {
        ...unknown,
        role,
        ownerType: ownerTypeRaw === 'Organization' || ownerTypeRaw === 'User' ? ownerTypeRaw : null,
        ownerAvatarUrl: typeof resp.data?.owner?.avatar_url === 'string' ? resp.data.owner.avatar_url : null
    };
    if (role === 'none') return details;
    const pages = await githubApiRequest('GET', `${path}/pages`, token).catch(() => null);
    if (pages?.status === 200 && typeof pages.data?.html_url === 'string' && pages.data.html_url) details.pagesUrl = pages.data.html_url;
    return details;
};
```

Inside `registerSitesHandlers`, add:

```ts
    ipcMain.handle('get-github-site-details', async (_e, payload: unknown) => {
        const refs = (Array.isArray(payload) ? payload : []).map(toRef).filter((r): r is SiteRef => !!r);
        const token = getToken();
        const entries = await Promise.all(refs.map(async (ref) => [normalizeSiteKey(ref.owner, ref.repo), await lookupSiteDetails(ref, token)] as const));
        return { success: true, details: Object.fromEntries(entries) };
    });

    ipcMain.handle('find-github-sites', async () => {
        const token = getToken();
        if (!token) return { success: false, error: 'GitHub not connected.' };
        try {
            const candidates: SiteRef[] = [];
            for (let page = 1; page <= FIND_PAGE_LIMIT; page += 1) {
                const resp = await githubApiRequest('GET', `/user/repos?per_page=100&page=${page}`, token);
                if (resp.status >= 300) throw new Error(`GitHub API error (${resp.status}) loading repos`);
                const rows = Array.isArray(resp.data) ? resp.data : [];
                for (const r of rows) {
                    const owner = r?.owner?.login;
                    if (typeof owner !== 'string' || typeof r?.name !== 'string') continue;
                    if (r?.permissions?.push !== true) continue;
                    if (typeof r.description !== 'string' || r.description.trim() !== SITE_DESCRIPTION) continue;
                    candidates.push({ owner, repo: r.name });
                }
                if (rows.length < 100) break;
            }
            return { success: true, found: mergeFoundSites(readSites(store), candidates) };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to search your repos.' };
        }
    });
```

Note: `githubSitesHandlers.ts` now imports from `githubPublishersHandlers.ts`; that module imports only `electron`, `electron-log` and `../githubApi`, so there is no cycle.

- [ ] **Step 6: Run tests**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/githubSitesHandlers.test.ts src/main/handlers/__tests__/githubPublishersHandlers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/githubApi.ts src/main/handlers/githubSitesHandlers.ts src/main/handlers/githubPublishersHandlers.ts src/main/handlers/__tests__/githubSitesHandlers.test.ts
git commit -m "feat: live site details (role, owner, Pages URL) and Find my sites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Join, create and members write through the site list; org-aware invite errors

**Files:**
- Modify: `src/main/handlers/githubPublishersHandlers.ts`
- Modify: `src/main/handlers/githubHandlers.ts` (`create-github-repo`, ~line 1818)
- Modify: `src/renderer/global.d.ts` (`ISiteJoinTarget`, `addRepoPublisher` result)
- Modify tests: `src/main/handlers/__tests__/githubPublishersHandlers.test.ts`, `src/renderer/app/__tests__/SiteInviteBanner.test.tsx` (fixture `favorites` → `sites`), `src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx` (fixture only; its assertions are rewritten in Task 7)
- Create test: `src/main/handlers/__tests__/createGithubRepoSites.test.ts` only if `create-github-repo` has no existing handler test harness — check `grep -rln "create-github-repo" src/main` first and extend the existing one if present.

**Interfaces:**
- Consumes: `readSites`, `writeSites` (Task 2); `addSite` (Task 1); `recordMemberCount` (Task 3).
- Produces:
  - `ISiteJoinTarget` = `{ owner; repo; fullName; branch; pagesUrl; pagesSourcePath; madeDefault; sites: IGithubSite[] }` (the `favorites` field is gone)
  - `add-repo-publisher` failure result may carry `helpUrl?: string`
  - `export const describeCollaboratorError(status: number, data: any, owner: string, ownerType: 'User' | 'Organization' | null, username: string): { error: string; helpUrl?: string }`
  - `get-repo-publishers`: push-but-not-admin users get `collaborators` filled and `invites: []`

- [ ] **Step 1: Write / update the failing tests** in `githubPublishersHandlers.test.ts`

Replace the test `reports canAdmin=false without listing for a non-admin` with:

```ts
    it('lists collaborators read-only for a push user, without invites', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, (c) => {
            if (c.path === '/repos/guild/site') return { status: 200, body: { owner: { type: 'Organization' }, permissions: { push: true } } };
            if (c.path.startsWith('/repos/guild/site/collaborators')) return { status: 200, body: [{ login: 'kyra', avatar_url: 'k.png', permissions: { push: true } }] };
            return { status: 404 };
        });
        expect(await invoke('get-repo-publishers')).toEqual({
            success: true, canAdmin: false, ownerType: 'Organization', collaborators: [{ login: 'kyra', avatarUrl: 'k.png' }], invites: []
        });
        expect(calls.some((c) => c.path.includes('/invitations'))).toBe(false);
    });
    it('does not list for a user without push', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, () => ({ status: 200, body: { owner: { type: 'User' }, permissions: { pull: true } } }));
        expect(await invoke('get-repo-publishers')).toEqual({ success: true, canAdmin: false, ownerType: 'User', collaborators: [], invites: [] });
        expect(calls).toHaveLength(1);
    });
    it('records the member count for site details', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, (c) => {
            if (c.path === '/repos/guild/site') return ADMIN;
            if (c.path.startsWith('/repos/guild/site/collaborators')) return { status: 200, body: [
                { login: 'a', permissions: { push: true } }, { login: 'b', permissions: { push: true } }
            ] };
            return { status: 200, body: [] };
        });
        await invoke('get-repo-publishers');
        expect(getMemberCount('guild', 'site')).toBe(2);
    });
```

(add `getMemberCount` to the `../../githubApi` import).

Add a new describe block:

```ts
describe('add-repo-publisher org errors', () => {
    const respond = (ownerType: string, put: MockResponse) => (c: RecordedCall): MockResponse => {
        if (c.path === '/users/kyra') return { status: 200, body: { login: 'kyra' } };
        if (c.path === '/repos/guild/site') return { status: 200, body: { owner: { type: ownerType }, permissions: { admin: true, push: true } } };
        if (c.method === 'PUT') return put;
        return { status: 404 };
    };
    it('explains an org that blocks outside collaborators', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, respond('Organization', { status: 403, body: { message: 'Outside collaborators are not allowed for this organization' } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({
            success: false,
            error: "Couldn't invite kyra: the guild org only lets owners add outside collaborators. Ask an org owner to add them, or to allow repo admins to invite.",
            helpUrl: 'https://github.com/organizations/guild/settings/member_privileges'
        });
    });
    it('explains OAuth app restrictions', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, respond('Organization', { status: 403, body: { message: 'Although you appear to have the correct authorization credentials, the `guild` organization has enabled OAuth App access restrictions' } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({
            success: false,
            error: "guild hasn't approved AxiBridge. An org owner must approve it under the org's third-party access settings.",
            helpUrl: 'https://github.com/organizations/guild/settings/oauth_application_policy'
        });
    });
    it('keeps GitHub\'s message for a personal repo', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, respond('User', { status: 403, body: { message: 'Not allowed' } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: false, error: 'Not allowed' });
    });
});
```

In the `accept-site-invite` describe, update:
- the expected target: replace `favorites: ['guild/site']` with `sites: [expect.objectContaining({ owner: 'guild', repo: 'site', addedVia: 'joined' })]`
- the second test's `expect(store.data.githubFavoriteRepos).toEqual(['guild/site']);` with:
  ```ts
        expect(store.data.githubFavoriteRepos).toBeUndefined();
        expect((store.data.githubSites as any[]).map((s) => `${s.owner}/${s.repo}:${s.addedVia}`)).toEqual(['me/mine:default', 'guild/site:joined']);
  ```
  (check that test's setup values; if its default is not `me/mine`, use the default it sets — the first entry is the existing default with `addedVia:'default'`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/githubPublishersHandlers.test.ts`
Expected: FAIL on the new/changed tests.

- [ ] **Step 3: Implement in `githubPublishersHandlers.ts`**

Imports: add `recordMemberCount` to the `../githubApi` import; add

```ts
import { readSites, writeSites } from '../githubSitesStore';
import { addSite, type IGithubSite } from '../../shared/githubSites';
```

Change `SiteJoinTarget`'s last field from `favorites: string[]` to `sites: IGithubSite[]`.

Add, below `INVALID_INVITE`:

```ts
/** Org policy failures get an explanation and a link; anything else keeps GitHub's words. */
export const describeCollaboratorError = (
    status: number, data: any, owner: string, ownerType: 'User' | 'Organization' | null, username: string
): { error: string; helpUrl?: string } => {
    const message = String(data?.errors?.[0]?.message || data?.message || '');
    if (/OAuth App access restrictions/i.test(message)) {
        return {
            error: `${owner} hasn't approved AxiBridge. An org owner must approve it under the org's third-party access settings.`,
            helpUrl: `https://github.com/organizations/${owner}/settings/oauth_application_policy`
        };
    }
    if (ownerType === 'Organization' && (status === 403 || status === 422) && /outside collaborator|not allowed|forbid/i.test(message)) {
        return {
            error: `Couldn't invite ${username}: the ${owner} org only lets owners add outside collaborators. Ask an org owner to add them, or to allow repo admins to invite.`,
            helpUrl: `https://github.com/organizations/${owner}/settings/member_privileges`
        };
    }
    return { error: message || `GitHub API error (${status}) adding ${username}` };
};
```

In `get-repo-publishers`, replace the body from `const perms = …` to the final `return` with:

```ts
            const perms = await getRepoPermissions(owner, repo, token);
            if (!perms.push) {
                return { success: true, canAdmin: false, ownerType: perms.ownerType, collaborators: [], invites: [] };
            }
            // Push users may list collaborators; only admins may see invitations.
            const [collabResp, inviteResp] = await Promise.all([
                githubApiRequest('GET', `${repoPath(owner, repo)}/collaborators?affiliation=direct&per_page=100`, token),
                perms.admin
                    ? githubApiRequest('GET', `${repoPath(owner, repo)}/invitations?per_page=100`, token)
                    : Promise.resolve({ status: 200, data: [] })
            ]);
            if (collabResp.status >= 300) throw new Error(`GitHub API error (${collabResp.status}) loading collaborators`);
            if (inviteResp.status >= 300) throw new Error(`GitHub API error (${inviteResp.status}) loading invitations`);
            const collaborators: RepoCollaborator[] = (Array.isArray(collabResp.data) ? collabResp.data : [])
                .filter((c: any) => typeof c?.login === 'string' && c?.permissions?.push === true)
                .map((c: any) => ({ login: c.login, avatarUrl: c.avatar_url ?? null }));
            const invites: RepoInvite[] = (Array.isArray(inviteResp.data) ? inviteResp.data : [])
                .filter((i: any) => typeof i?.id === 'number' && typeof i?.invitee?.login === 'string')
                .map((i: any) => ({ id: i.id, login: i.invitee.login, avatarUrl: i.invitee.avatar_url ?? null, createdAt: i.created_at ?? '' }));
            recordMemberCount(owner, repo, collaborators.length);
            return { success: true, canAdmin: perms.admin, ownerType: perms.ownerType, collaborators, invites };
```

In `add-repo-publisher`, replace the final failure `return { success: false, error: resp.data?.errors?.[0]?.message || … };` with:

```ts
            const perms = await getRepoPermissions(owner, repo, token);
            return { success: false, ...describeCollaboratorError(resp.status, resp.data, owner, perms.ownerType, username) };
```

In `accept-site-invite`, replace

```ts
            const existing = store.get('githubFavoriteRepos', []);
            const favorites = Array.from(new Set([...(Array.isArray(existing) ? existing : []), invite.fullName]));
            store.set('githubFavoriteRepos', favorites);
```

with

```ts
            const sites = addSite(readSites(store), { owner: invite.owner, repo: invite.repo }, 'joined');
            writeSites(store, sites);
```

and in the `target` literal replace `madeDefault, favorites` with `madeDefault, sites`.

Note the existing 403 test (`surfaces GitHub's message on 403`) has no `/repos/guild/site` route, so `ownerType` is `null` and the raw message survives — it must stay green unchanged.

- [ ] **Step 4: `create-github-repo` adds the site and sets the branch**

In `src/main/handlers/githubHandlers.ts` add imports:

```ts
import { readSites, writeSites } from '../githubSitesStore';
import { addSite } from '../../shared/githubSites';
```

In `create-github-repo`, immediately before `store.set('githubRepoOwner', owner);` insert:

```ts
            // Before the default keys change, so readSites keeps the old default listed.
            writeSites(store, addSite(readSites(store), { owner, repo: repoName }, 'manual'));
```

and after `store.set('githubPagesSourcePath', pagesPath);` insert:

```ts
            store.set('githubBranch', branch);
```

Add a test for this. First run `grep -rln "create-github-repo" src/main/handlers/__tests__ src/main/__tests__`. If a harness exists (e.g. `ensureGithubPages.test.ts` or `sharedSiteHandlers.test.ts`), add there a test that: store `{ githubToken:'tok', githubRepoOwner:'old', githubRepoName:'one', githubBranch:'gh-pages' }`; invoke `create-github-repo` `{ name: 'site' }` with responses that make `getGithubUser` return `{ login: 'me' }`, repo creation succeed, and Pages succeed; then assert `store.data.githubBranch === 'main'` and the `githubSites` keys are `['old/one:default', 'me/site:manual']`. If no harness can reach `create-github-repo` without large mocking (it lives inside `registerGithubHandlers`, which needs many options), skip the handler test and record in the report that the behaviour is covered by the `readSites` default-keeping test plus manual check — do not build a new 200-line harness.

- [ ] **Step 5: Renderer types and fixtures**

`global.d.ts`: in `ISiteJoinTarget` replace `favorites: string[]` with `sites: IGithubSite[]`. Change the `addRepoPublisher` result type to `Promise<{ success: boolean; status?: 'invited' | 'already-has-access'; error?: string; helpUrl?: string }>`.

`ISiteJoinTarget` is declared on line 8, above the `IGithubSite` import you added in Task 2 — type imports are hoisted, so this compiles.

Update fixtures `favorites: ['guild/site']` → `sites: []` in `src/renderer/app/__tests__/SiteInviteBanner.test.tsx` and `src/renderer/settings/__tests__/PendingSiteInvites.test.tsx`. In `SettingsView.tsx` line ~296, `setGithubFavoriteRepos(target.favorites);` no longer compiles: replace that single line with `void target.sites;` for now — Task 7 rewrites `handleSiteJoined` away entirely. In `SettingsView.sharedPublishing.test.tsx` change the fixture's `favorites` to `sites: []` and mark the test `keeps a joined site in favorites on the next save` as `it.skip` with comment `// rewritten in Task 7` (Task 7 replaces it).

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 src/main src/renderer/app src/renderer/settings src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx`
Expected: PASS (one skipped).
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/main src/renderer/global.d.ts src/renderer/SettingsView.tsx src/renderer/app/__tests__ src/renderer/settings/__tests__ src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx
git commit -m "feat: joins and new repos land in the site list; org-aware invite errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Publishing to" card and Members restyle

**Files:**
- Create: `src/renderer/settings/PublishingSiteCard.tsx`
- Create: `src/renderer/settings/__tests__/PublishingSiteCard.test.tsx`
- Modify: `src/renderer/settings/PublishersCard.tsx`
- Modify: `src/renderer/settings/__tests__/PublishersCard.test.tsx`

**Interfaces:**
- Consumes: `ISiteDetails`, `inferredPagesUrl` (Task 1); `addRepoPublisher` `helpUrl` (Task 4).
- Produces:
  - `export type SitePanelMode = 'list' | 'create' | 'existing' | 'find'`
  - `export const roleLabel(role: SiteRole | null | undefined): string | null`
  - `export const PublishingSiteCard(props: { owner: string | null; repo: string | null; details: ISiteDetails | null; inviteCount: number; onOpenPanel: (mode: SitePanelMode) => void; children?: ReactNode })`
  - `PublishersCard` keeps its props; root no longer renders its own well; `data-testid="publishers-card"` stays.

- [ ] **Step 1: Write the failing tests**

`src/renderer/settings/__tests__/PublishingSiteCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublishingSiteCard } from '../PublishingSiteCard';

const details = (over = {}) => ({ role: 'admin' as const, ownerType: 'Organization' as const, ownerAvatarUrl: 'a.png', pagesUrl: 'https://reports.example/', memberCount: 3, ...over });

describe('PublishingSiteCard', () => {
    it('shows an org site with the admin role and real Pages URL', () => {
        render(<PublishingSiteCard owner="guild" repo="site" details={details()} inviteCount={0} onOpenPanel={vi.fn()} />);
        expect(screen.getByText('guild/site')).toBeInTheDocument();
        expect(screen.getByText('org · guild')).toBeInTheDocument();
        expect(screen.getByText('you: admin')).toBeInTheDocument();
        expect(screen.getByText('https://reports.example/')).toBeInTheDocument();
    });
    it('shows a personal site with the publisher role', () => {
        render(<PublishingSiteCard owner="me" repo="site" details={details({ role: 'publisher', ownerType: 'User' })} inviteCount={0} onOpenPanel={vi.fn()} />);
        expect(screen.getByText('personal')).toBeInTheDocument();
        expect(screen.getByText('you: publisher')).toBeInTheDocument();
    });
    it('falls back to the inferred URL and no badges while details are unknown', () => {
        render(<PublishingSiteCard owner="guild" repo="site" details={null} inviteCount={0} onOpenPanel={vi.fn()} />);
        expect(screen.getByText('https://guild.github.io/site')).toBeInTheDocument();
        expect(screen.queryByText(/you:/)).toBeNull();
    });
    it('opens the site list from Switch site and shows the invite count', () => {
        const onOpenPanel = vi.fn();
        render(<PublishingSiteCard owner="guild" repo="site" details={details()} inviteCount={2} onOpenPanel={onOpenPanel} />);
        fireEvent.click(screen.getByRole('button', { name: /Switch site/ }));
        expect(onOpenPanel).toHaveBeenCalledWith('list');
        expect(screen.getByRole('button', { name: /Switch site/ })).toHaveTextContent('2');
    });
    it('offers create / use existing / find when there is no site', () => {
        const onOpenPanel = vi.fn();
        render(<PublishingSiteCard owner={null} repo={null} details={null} inviteCount={0} onOpenPanel={onOpenPanel} />);
        fireEvent.click(screen.getByRole('button', { name: 'Create new site' }));
        fireEvent.click(screen.getByRole('button', { name: 'Use existing repo…' }));
        fireEvent.click(screen.getByRole('button', { name: 'Find my sites' }));
        expect(onOpenPanel.mock.calls.map((c) => c[0])).toEqual(['create', 'existing', 'find']);
    });
    it('renders children (Members) under the site', () => {
        render(<PublishingSiteCard owner="guild" repo="site" details={null} inviteCount={0} onOpenPanel={vi.fn()}><div>members here</div></PublishingSiteCard>);
        expect(screen.getByText('members here')).toBeInTheDocument();
    });
});
```

Append to `src/renderer/settings/__tests__/PublishersCard.test.tsx` (reuse that file's existing API-mock helper; read the file first and match its setup style — the snippets below assume a helper that installs `window.electronAPI` with overrides; adapt the call to the file's actual helper name):

```tsx
    it('titles the card Members with a count and links to GitHub access settings', async () => {
        // getRepoPublishers → { success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'a', avatarUrl: null }, { login: 'b', avatarUrl: null }], invites: [] }
        // render <PublishersCard repoOwner="guild" repoName="site" />
        expect(await screen.findByText('Members · 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Manage access on GitHub ↗' }));
        expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://github.com/guild/site/settings/access');
        expect(screen.getByText(/Anyone with write access to/)).toHaveTextContent('Anyone with write access to guild/site can publish here.');
    });
    it('shows publishers the list read-only', async () => {
        // getRepoPublishers → { success: true, canAdmin: false, ownerType: 'Organization', collaborators: [{ login: 'kyra', avatarUrl: null }], invites: [] }
        expect(await screen.findByText('kyra')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove kyra' })).toBeNull();
        expect(screen.queryByLabelText('GitHub username')).toBeNull();
        expect(screen.getByText('Only a repo admin can add or remove members.')).toBeInTheDocument();
    });
    it('links to the org setting when GitHub blocks the invite', async () => {
        // admin; addRepoPublisher → { success: false, error: "Couldn't invite kyra: …", helpUrl: 'https://github.com/organizations/guild/settings/member_privileges' }
        // type 'kyra' into 'GitHub username', click Add
        fireEvent.click(await screen.findByRole('button', { name: 'Org settings ↗' }));
        expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://github.com/organizations/guild/settings/member_privileges');
    });
```

Also update any existing PublishersCard test that asserts the old heading text `Publishers` or the old non-admin copy (`Only a repo admin can add publishers`) to the new strings.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/PublishingSiteCard.test.tsx src/renderer/settings/__tests__/PublishersCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `PublishingSiteCard.tsx`**

```tsx
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { inferredPagesUrl, type ISiteDetails, type SiteRole } from '../../shared/githubSites';

export type SitePanelMode = 'list' | 'create' | 'existing' | 'find';

export const roleLabel = (role: SiteRole | null | undefined): string | null =>
    role === 'admin' ? 'you: admin' : role === 'publisher' ? 'you: publisher' : role === 'none' ? 'no access' : null;

type Props = {
    owner: string | null;
    repo: string | null;
    details: ISiteDetails | null;
    inviteCount: number;
    onOpenPanel: (mode: SitePanelMode) => void;
    children?: ReactNode;
};

const WELL = { '--axi-well-pad': '16px' } as CSSProperties;

/** Where reports publish, who you are there, and (as children) who publishes with you. */
export const PublishingSiteCard = ({ owner, repo, details, inviteCount, onOpenPanel, children }: Props) => {
    const [copied, setCopied] = useState(false);

    if (!owner || !repo) {
        return (
            <div className="axi-well axi-well--sm mb-4" style={WELL} data-testid="publishing-site-card">
                <div className="text-xs uppercase tracking-widest axi-ink-faint mb-2">Publishing to</div>
                <p className="text-sm axi-ink-dim mb-3">No site yet. Reports publish to a GitHub Pages site you own or were invited to.</p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => onOpenPanel('create')} className="axi-btn axi-btn--sm axi-ink-meta axi-edge-meta">Create new site</button>
                    <button onClick={() => onOpenPanel('existing')} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">Use existing repo…</button>
                    <button onClick={() => onOpenPanel('find')} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">Find my sites</button>
                </div>
                {inviteCount > 0 && (
                    <button onClick={() => onOpenPanel('list')} className="mt-3 text-xs axi-ink-accent underline">
                        {inviteCount === 1 ? '1 site invite' : `${inviteCount} site invites`}
                    </button>
                )}
            </div>
        );
    }

    const fullName = `${owner}/${repo}`;
    const pagesUrl = details?.pagesUrl || inferredPagesUrl({ owner, repo });
    const ownerBadge = details?.ownerType === 'Organization' ? `org · ${owner}` : details?.ownerType === 'User' ? 'personal' : null;
    const role = roleLabel(details?.role);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(pagesUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="axi-well axi-well--sm mb-4" style={WELL} data-testid="publishing-site-card">
            <div className="text-xs uppercase tracking-widest axi-ink-faint mb-3">Publishing to</div>
            <div className="flex items-center gap-3">
                {details?.ownerAvatarUrl
                    ? <img src={details.ownerAvatarUrl} alt="" className="w-9 h-9 rounded-md shrink-0" style={{ objectFit: 'cover' }} />
                    : <div className="w-9 h-9 rounded-md shrink-0 axi-edge-rule" aria-hidden="true" />}
                <div className="flex-1 min-w-0">
                    <div className="text-sm axi-ink-plain truncate">{fullName}</div>
                    {(ownerBadge || role) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {ownerBadge && <span className="axi-chip axi-chip--meta">{ownerBadge}</span>}
                            {role && <span className={`axi-chip ${details?.role === 'none' ? '' : 'axi-chip--ok'}`}>{role}</span>}
                        </div>
                    )}
                </div>
                <button onClick={() => onOpenPanel('list')} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={inviteCount > 0 ? `Switch site (${inviteCount} invites)` : 'Switch site'}>
                    Switch site{inviteCount > 0 ? ` · ${inviteCount}` : ''}
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="github-pages-url-card flex items-center gap-3 mt-3">
                <span className="github-pages-url-value flex-1 min-w-0 truncate text-xs axi-ink-dim">{pagesUrl}</span>
                <button onClick={() => void copy()} className="axi-btn axi-btn--sm github-pages-url-copy axi-ink-plain axi-edge-rule">
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            {children && <div className="mt-4">{children}</div>}
        </div>
    );
};
```

- [ ] **Step 4: Restyle `PublishersCard.tsx`**

Changes (keep all existing load/busy/request-id logic):

1. `message` state type becomes `{ kind: 'ok' | 'error'; text: string; helpUrl?: string } | null`. In `handleAdd`'s failure branch set `{ kind: 'error', text: res?.error || 'Failed to add publisher.', helpUrl: res?.helpUrl }`.
2. Add `const manageUrl = \`https://github.com/${repoOwner}/${repoName}/settings/access\`;` and `const openExternal = (url: string) => void window.electronAPI?.openExternal?.(url);`.
3. Replace the returned JSX with:

```tsx
    return (
        <div data-testid="publishers-card">
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-widest axi-ink-faint">
                    {collaborators.length > 0 ? `Members · ${collaborators.length}` : 'Members'}
                </div>
                <button type="button" onClick={() => openExternal(manageUrl)} className="text-xs axi-ink-accent underline">
                    Manage access on GitHub ↗
                </button>
            </div>
            <p className="text-xs axi-ink-dim mb-3">
                Anyone with write access to <span className="axi-ink-plain">{repoOwner}/{repoName}</span> can publish here.
                {canAdmin && ' Adding someone sends them a GitHub invite; they join from AxiBridge.'}
            </p>
            {loading && <div className="text-xs axi-ink-meta">Loading…</div>}
            {!loading && canAdmin && (
                <div className="flex items-center gap-2 mb-3">
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                        placeholder="GitHub username"
                        aria-label="GitHub username"
                        className="axi-input flex-1 text-sm"
                    />
                    <button onClick={() => void handleAdd()} disabled={busy || !username.trim()} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">
                        Add
                    </button>
                </div>
            )}
            {!loading && (
                <ul className="space-y-1">
                    {collaborators.map((c) => (
                        <li key={c.login} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                                {c.avatarUrl && <img src={c.avatarUrl} alt="" className="w-5 h-5 rounded-full" />}
                                <span className="axi-ink-plain">{c.login}</span>
                            </span>
                            {canAdmin && viewer?.toLowerCase() !== c.login.toLowerCase() && (
                                <button onClick={() => void handleRemove(c.login)} disabled={busy} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Remove ${c.login}`}>
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                    {invites.map((i) => (
                        <li key={i.id} className="flex items-center justify-between text-sm">
                            <span><span className="axi-ink-plain">{i.login}</span> <span className="text-xs axi-ink-faint">invited</span></span>
                            <button onClick={() => void handleCancel(i)} disabled={busy} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Cancel invite for ${i.login}`}>
                                Cancel
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {!loading && !canAdmin && (
                <p className="mt-3 text-xs axi-ink-faint">Only a repo admin can add or remove members.</p>
            )}
            {!loading && ownerType === 'Organization' && (
                <p className="mt-3 text-xs axi-ink-faint">Org members with access through teams aren't listed here.</p>
            )}
            {message && (
                <div className={`mt-3 text-xs ${message.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>
                    {message.text}
                    {message.helpUrl && (
                        <>
                            {' '}
                            <button type="button" onClick={() => openExternal(message.helpUrl!)} className="axi-ink-accent underline">
                                {message.helpUrl.includes('/settings/member_privileges') ? 'Org settings ↗' : 'Open settings ↗'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
```

Remove the now-unused `CSSProperties` import if nothing else uses it.

- [ ] **Step 5: Run tests**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/PublishingSiteCard.test.tsx src/renderer/settings/__tests__/PublishersCard.test.tsx src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx`
Expected: PASS (SettingsView still renders the old PublishersCard placement; it now has no well around it — that's fine until Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/settings/PublishingSiteCard.tsx src/renderer/settings/PublishersCard.tsx src/renderer/settings/__tests__/PublishingSiteCard.test.tsx src/renderer/settings/__tests__/PublishersCard.test.tsx
git commit -m "feat: Publishing to card; members list with GitHub access link and org help

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Site list panel

**Files:**
- Create: `src/renderer/settings/validateRepoName.ts` (moved from SettingsView)
- Modify: `src/renderer/SettingsView.tsx` (replace the `validateRepoName` function body with a re-export only)
- Create: `src/renderer/settings/SiteListPanel.tsx`
- Create: `src/renderer/settings/__tests__/SiteListPanel.test.tsx`
- Delete: `src/renderer/settings/PendingSiteInvites.tsx`, `src/renderer/settings/__tests__/PendingSiteInvites.test.tsx` — **only in Task 7**, when SettingsView stops importing it. Leave both in place in this task.

**Interfaces:**
- Consumes: Task 1 helpers; Task 2/3 preload methods; `roleLabel`, `SitePanelMode` (Task 5); `ISiteInvite`, `ISiteJoinTarget` (global.d).
- Produces:
  - `export function validateRepoName(value: string): string | null` from `settings/validateRepoName.ts` (SettingsView re-exports it: `export { validateRepoName } from './settings/validateRepoName';`)
  - `export const SiteListPanel(props: { mode: SitePanelMode; sites: IGithubSite[]; defaultKey: string | null; details: Record<string, ISiteDetails>; onModeChange: (mode: SitePanelMode) => void; onClose: () => void; onSitesChanged: (sites: IGithubSite[]) => void; onDefaultChanged: (owner: string, repo: string) => void; onInvitesChanged?: (count: number) => void })`

Behaviour contract:
- **Your sites** (always shown): rows from `sortSitesDefaultFirst(sites, defaultKey)`. Each row: avatar (from details), `owner/repo`, role badge (`roleLabel`), `org`/`personal` from `ownerType`, and `✓ current` on the default. Clicking a non-default row with role ≠ `'none'` calls `setDefaultGithubSite` → on success `onSitesChanged(res.sites)` + `onDefaultChanged(owner, repo)`; on failure shows `res.error`. Role `'none'` rows are greyed (`opacity-50`), show `no access`, and are not clickable for switching. Non-default rows have an ✕ (`aria-label="Remove owner/repo"`) calling `removeGithubSite` → `onSitesChanged(res.sites)`; the default row has no ✕.
- **Invites**: loads `getPendingSiteInvites({ force: true })` on mount; hidden when empty. Join calls `acceptSiteInvite`; success removes the row, calls `onSitesChanged(target.sites)`, and if `target.madeDefault` calls `onDefaultChanged(target.owner, target.repo)`; shows "You can now publish to owner/repo."; `code:'invalid'` removes the row and shows the error; other failures keep the row. Calls `onInvitesChanged(count)` whenever the list changes.
- **Footer** buttons: `+ Create new site` → mode `create`; `Use existing repo…` → mode `existing`; `Find my sites` → mode `find` and runs the search.
  - `create`: optional owner `<select>` (from `getGithubOrgs`, "Personal account" = ''), name input validated by `validateRepoName`, "Create" button → `createGithubRepo({ name, branch: 'main', owner })`; on success `getGithubSites()` → `onSitesChanged(res.sites)`, `onDefaultChanged(created.owner, created.name)`, mode → `list`.
  - `existing`: loads `getGithubRepos()`; search input filters by `full_name`; clicking a repo: if `defaultKey` is null → set default (as above); else `addGithubSite({ owner, repo: name, addedVia: 'manual' })` → `onSitesChanged`. Then mode → `list`. Repos already in `sites` render a "added" tag and are disabled.
  - `find`: runs `findGithubSites()` on entering the mode; shows "Searching…", then each result with an **Add** button (`addGithubSite({ …, addedVia: 'found' })` → `onSitesChanged`, row removed from results), "No other AxiBridge sites found." when empty, or the error inline on failure (sites unchanged).
- A **Close** button (`aria-label="Close site list"`) calls `onClose`.

- [ ] **Step 1: Move `validateRepoName`**

Create `src/renderer/settings/validateRepoName.ts` with the exact function body currently at `SettingsView.tsx:64-70` (export it), and replace those lines in SettingsView with:

```ts
export { validateRepoName } from './settings/validateRepoName';
```

Also add `import { validateRepoName } from './settings/validateRepoName';` to SettingsView's imports since the file still calls it (until Task 7 removes the create form). Run `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx` — PASS.

- [ ] **Step 2: Write the failing tests**

`src/renderer/settings/__tests__/SiteListPanel.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteListPanel } from '../SiteListPanel';
import type { IGithubSite } from '../../../shared/githubSites';

const s = (owner: string, repo: string): IGithubSite => ({ owner, repo, addedVia: 'manual', addedAt: '' });
const SITES = [s('x', 'other'), s('guild', 'site'), s('old', 'gone')];
const DETAILS = {
    'guild/site': { role: 'admin' as const, ownerType: 'Organization' as const, ownerAvatarUrl: null, pagesUrl: 'u', memberCount: null },
    'x/other': { role: 'publisher' as const, ownerType: 'User' as const, ownerAvatarUrl: null, pagesUrl: 'u', memberCount: null },
    'old/gone': { role: 'none' as const, ownerType: null, ownerAvatarUrl: null, pagesUrl: 'u', memberCount: null }
};

let api: any;
const renderPanel = (over: Partial<Parameters<typeof SiteListPanel>[0]> = {}) => {
    const props = {
        mode: 'list' as const, sites: SITES, defaultKey: 'guild/site', details: DETAILS,
        onModeChange: vi.fn(), onClose: vi.fn(), onSitesChanged: vi.fn(), onDefaultChanged: vi.fn(), onInvitesChanged: vi.fn(), ...over
    };
    render(<SiteListPanel {...props} />);
    return props;
};

beforeEach(() => {
    api = {
        getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [] })),
        setDefaultGithubSite: vi.fn(async (p: any) => ({ success: true, sites: SITES, defaultKey: `${p.owner}/${p.repo}` })),
        removeGithubSite: vi.fn(async () => ({ success: true, sites: [s('guild', 'site')] })),
        addGithubSite: vi.fn(async (p: any) => ({ success: true, sites: [...SITES, s(p.owner, p.repo)] })),
        findGithubSites: vi.fn(async () => ({ success: true, found: [{ owner: 'me', repo: 'found' }] })),
        getGithubRepos: vi.fn(async () => ({ success: true, repos: [{ full_name: 'me/repo', name: 'repo', owner: 'me' }, { full_name: 'x/other', name: 'other', owner: 'x' }] })),
        getGithubOrgs: vi.fn(async () => ({ success: true, orgs: [] })),
        createGithubRepo: vi.fn(async () => ({ success: true, repo: { full_name: 'me/new', owner: 'me', name: 'new', pagesUrl: 'u' } })),
        getGithubSites: vi.fn(async () => ({ success: true, sites: [...SITES, s('me', 'new')], defaultKey: 'me/new' })),
        acceptSiteInvite: vi.fn()
    };
    window.electronAPI = api;
});

describe('SiteListPanel — your sites', () => {
    it('lists the default first with ✓ current and no remove button', () => {
        renderPanel();
        const rows = screen.getAllByTestId('site-row');
        expect(rows[0]).toHaveTextContent('guild/site');
        expect(rows[0]).toHaveTextContent('✓ current');
        expect(screen.queryByRole('button', { name: 'Remove guild/site' })).toBeNull();
    });
    it('switches the default on click', async () => {
        const props = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Use x/other' }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('x', 'other'));
        expect(api.setDefaultGithubSite).toHaveBeenCalledWith({ owner: 'x', repo: 'other' });
        expect(props.onSitesChanged).toHaveBeenCalledWith(SITES);
    });
    it('greys a no-access site and does not switch to it, but can remove it', async () => {
        const props = renderPanel();
        expect(screen.getByText('no access')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Use old/gone' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Remove old/gone' }));
        await waitFor(() => expect(props.onSitesChanged).toHaveBeenCalledWith([s('guild', 'site')]));
    });
    it('shows a switch failure inline', async () => {
        api.setDefaultGithubSite.mockResolvedValueOnce({ success: false, error: 'GitHub not connected.', sites: SITES });
        const props = renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Use x/other' }));
        expect(await screen.findByText('GitHub not connected.')).toBeInTheDocument();
        expect(props.onDefaultChanged).not.toHaveBeenCalled();
    });
});

describe('SiteListPanel — invites', () => {
    const invite = { id: 1, owner: 'guild', repo: 'new', fullName: 'guild/new', inviter: 'boss', createdAt: '', dismissed: true };
    it('joins an invite and reports the new list', async () => {
        api.getPendingSiteInvites.mockResolvedValue({ success: true, invites: [invite] });
        const target = { owner: 'guild', repo: 'new', fullName: 'guild/new', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: false, sites: [...SITES, s('guild', 'new')] };
        api.acceptSiteInvite.mockResolvedValue({ success: true, target });
        const props = renderPanel();
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/new' }));
        await waitFor(() => expect(props.onSitesChanged).toHaveBeenCalledWith(target.sites));
        expect(props.onDefaultChanged).not.toHaveBeenCalled();
        expect(screen.getByText('You can now publish to guild/new.')).toBeInTheDocument();
        expect(props.onInvitesChanged).toHaveBeenLastCalledWith(0);
    });
    it('drops an invalid invite and keeps others on generic failure', async () => {
        api.getPendingSiteInvites.mockResolvedValue({ success: true, invites: [invite, { ...invite, id: 2, fullName: 'guild/two', repo: 'two' }] });
        api.acceptSiteInvite
            .mockResolvedValueOnce({ success: false, code: 'invalid', error: 'That invite is no longer valid.' })
            .mockResolvedValueOnce({ success: false, error: 'boom' });
        renderPanel();
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/new' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Join guild/new' })).toBeNull());
        await userEvent.click(screen.getByRole('button', { name: 'Join guild/two' }));
        expect(await screen.findByText('boom')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Join guild/two' })).toBeInTheDocument();
    });
});

describe('SiteListPanel — footer modes', () => {
    it('find adds a found site', async () => {
        const props = renderPanel({ mode: 'find' });
        fireEvent.click(await screen.findByRole('button', { name: 'Add me/found' }));
        await waitFor(() => expect(api.addGithubSite).toHaveBeenCalledWith({ owner: 'me', repo: 'found', addedVia: 'found' }));
        expect(props.onSitesChanged).toHaveBeenCalled();
    });
    it('find shows the empty state and errors', async () => {
        api.findGithubSites.mockResolvedValueOnce({ success: true, found: [] });
        renderPanel({ mode: 'find' });
        expect(await screen.findByText('No other AxiBridge sites found.')).toBeInTheDocument();
    });
    it('find shows an error inline', async () => {
        api.findGithubSites.mockResolvedValueOnce({ success: false, error: 'GitHub API error (500) loading repos' });
        const props = renderPanel({ mode: 'find' });
        expect(await screen.findByText('GitHub API error (500) loading repos')).toBeInTheDocument();
        expect(props.onSitesChanged).not.toHaveBeenCalled();
    });
    it('use existing adds a repo, and marks listed ones', async () => {
        const props = renderPanel({ mode: 'existing' });
        expect(await screen.findByRole('button', { name: /x\/other/ })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /me\/repo/ }));
        await waitFor(() => expect(api.addGithubSite).toHaveBeenCalledWith({ owner: 'me', repo: 'repo', addedVia: 'manual' }));
        expect(props.onModeChange).toHaveBeenCalledWith('list');
    });
    it('use existing with no default makes the pick the default', async () => {
        const props = renderPanel({ mode: 'existing', sites: [], defaultKey: null, details: {} });
        fireEvent.click(await screen.findByRole('button', { name: /me\/repo/ }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('me', 'repo'));
        expect(api.addGithubSite).not.toHaveBeenCalled();
    });
    it('create makes the new repo the default', async () => {
        const props = renderPanel({ mode: 'create' });
        await userEvent.type(screen.getByPlaceholderText('New repository name'), 'new');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(props.onDefaultChanged).toHaveBeenCalledWith('me', 'new'));
        expect(api.createGithubRepo).toHaveBeenCalledWith({ name: 'new', branch: 'main', owner: undefined });
        expect(props.onSitesChanged).toHaveBeenCalledWith([...SITES, s('me', 'new')]);
    });
    it('create validates the name', async () => {
        renderPanel({ mode: 'create' });
        await userEvent.type(screen.getByPlaceholderText('New repository name'), 'bad name');
        expect(screen.getByText(/letters, numbers/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/SiteListPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `SiteListPanel.tsx`**

```tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { ISiteInvite } from '../global.d';
import {
    normalizeSiteKey, sortSitesDefaultFirst, hasSite, type IGithubSite, type ISiteDetails, type SiteRef
} from '../../shared/githubSites';
import { roleLabel, type SitePanelMode } from './PublishingSiteCard';
import { validateRepoName } from './validateRepoName';

type Props = {
    mode: SitePanelMode;
    sites: IGithubSite[];
    defaultKey: string | null;
    details: Record<string, ISiteDetails>;
    onModeChange: (mode: SitePanelMode) => void;
    onClose: () => void;
    onSitesChanged: (sites: IGithubSite[]) => void;
    onDefaultChanged: (owner: string, repo: string) => void;
    onInvitesChanged?: (count: number) => void;
};
type Note = { kind: 'ok' | 'error'; text: string } | null;
type RepoRow = { full_name: string; name: string; owner: string };

const WELL = { '--axi-well-pad': '16px' } as CSSProperties;
const BTN = 'axi-btn axi-btn--sm axi-ink-dim axi-edge-rule';

/** Every site you publish to, invites to new ones, and the ways to add one. Inline, never floating. */
export const SiteListPanel = ({ mode, sites, defaultKey, details, onModeChange, onClose, onSitesChanged, onDefaultChanged, onInvitesChanged }: Props) => {
    const api = window.electronAPI;
    const [note, setNote] = useState<Note>(null);
    const [busy, setBusy] = useState(false);
    const [invites, setInvites] = useState<ISiteInvite[]>([]);

    const [found, setFound] = useState<SiteRef[] | null>(null);
    const [findError, setFindError] = useState<string | null>(null);
    const [repos, setRepos] = useState<RepoRow[] | null>(null);
    const [search, setSearch] = useState('');
    const [orgs, setOrgs] = useState<Array<{ login: string }>>([]);
    const [createOwner, setCreateOwner] = useState('');
    const [createName, setCreateName] = useState('');
    const createError = createName ? validateRepoName(createName) : null;

    const ordered = useMemo(() => sortSitesDefaultFirst(sites, defaultKey), [sites, defaultKey]);

    useEffect(() => {
        void api?.getPendingSiteInvites?.({ force: true }).then((res) => {
            if (res?.success) setInvites(res.invites ?? []);
        }).catch(() => { /* invites are optional here */ });
    }, []);
    useEffect(() => { onInvitesChanged?.(invites.length); }, [invites, onInvitesChanged]);

    useEffect(() => {
        if (mode === 'find') {
            setFound(null);
            setFindError(null);
            void api.findGithubSites().then((res) => {
                if (res?.success) setFound(res.found ?? []);
                else setFindError(res?.error || 'Failed to search your repos.');
            }).catch((err: unknown) => setFindError(err instanceof Error ? err.message : 'Failed to search your repos.'));
        }
        if (mode === 'existing' && repos === null) {
            void api.getGithubRepos().then((res) => setRepos(res?.success ? res.repos ?? [] : []));
        }
        if (mode === 'create') {
            void api.getGithubOrgs?.().then((res) => setOrgs(res?.success ? res.orgs ?? [] : []));
        }
    }, [mode]);

    const run = async (fn: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        try {
            await fn();
        } catch (err) {
            setNote({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
        } finally {
            setBusy(false);
        }
    };

    const makeDefault = (ref: SiteRef) => run(async () => {
        const res = await api.setDefaultGithubSite(ref);
        if (!res?.success) { setNote({ kind: 'error', text: res?.error || 'Failed to switch site.' }); return; }
        onSitesChanged(res.sites);
        onDefaultChanged(ref.owner, ref.repo);
    });

    const remove = (ref: SiteRef) => run(async () => {
        const res = await api.removeGithubSite(ref);
        if (!res?.success) { setNote({ kind: 'error', text: res?.error || 'Failed to remove site.' }); return; }
        onSitesChanged(res.sites);
    });

    const add = (ref: SiteRef, addedVia: 'manual' | 'found') => run(async () => {
        const res = await api.addGithubSite({ ...ref, addedVia });
        if (!res?.success) { setNote({ kind: 'error', text: res?.error || 'Failed to add site.' }); return; }
        onSitesChanged(res.sites);
        if (addedVia === 'found') setFound((prev) => (prev ?? []).filter((f) => normalizeSiteKey(f.owner, f.repo) !== normalizeSiteKey(ref.owner, ref.repo)));
    });

    const pickExisting = async (repo: RepoRow) => {
        const ref = { owner: repo.owner, repo: repo.name };
        if (!defaultKey) await makeDefault(ref);
        else await add(ref, 'manual');
        onModeChange('list');
    };

    const create = () => run(async () => {
        const res = await api.createGithubRepo({ name: createName, branch: 'main', owner: createOwner || undefined });
        if (!res?.success || !res.repo) { setNote({ kind: 'error', text: res?.error || 'Failed to create repository.' }); return; }
        const list = await api.getGithubSites();
        if (list?.success) onSitesChanged(list.sites);
        onDefaultChanged(res.repo.owner, res.repo.name);
        setCreateName('');
        onModeChange('list');
        setNote({ kind: 'ok', text: `Created ${res.repo.full_name}.` });
    });

    const join = (invite: ISiteInvite) => run(async () => {
        const res = await api.acceptSiteInvite({ invitationId: invite.id });
        if (res?.success && res.target) {
            setInvites((prev) => prev.filter((i) => i.id !== invite.id));
            onSitesChanged(res.target.sites);
            if (res.target.madeDefault) onDefaultChanged(res.target.owner, res.target.repo);
            setNote({ kind: 'ok', text: `You can now publish to ${res.target.fullName}.` });
            return;
        }
        // An expired/revoked invite can never succeed; other failures keep the row for a retry.
        if (res?.code === 'invalid') setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        setNote({ kind: 'error', text: res?.error || 'Failed to join site.' });
    });

    return (
        <div className="axi-well axi-well--sm mb-4" style={WELL} data-testid="site-list-panel">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-widest axi-ink-faint">Your sites</div>
                <button onClick={onClose} aria-label="Close site list" className="axi-action axi-action--glyph p-1 axi-ink-faint">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <ul className="space-y-1">
                {ordered.length === 0 && <li className="text-xs axi-ink-faint">No sites yet.</li>}
                {ordered.map((site) => {
                    const key = normalizeSiteKey(site.owner, site.repo);
                    const full = `${site.owner}/${site.repo}`;
                    const d = details[key];
                    const isDefault = key === defaultKey;
                    const noAccess = d?.role === 'none';
                    const role = roleLabel(d?.role);
                    const ownerKind = d?.ownerType === 'Organization' ? 'org' : d?.ownerType === 'User' ? 'personal' : null;
                    const label = (
                        <span className="flex items-center gap-2 min-w-0">
                            {d?.ownerAvatarUrl
                                ? <img src={d.ownerAvatarUrl} alt="" className="w-5 h-5 rounded shrink-0" />
                                : <span className="w-5 h-5 rounded shrink-0 axi-edge-rule" aria-hidden="true" />}
                            <span className="truncate axi-ink-plain">{full}</span>
                            {ownerKind && <span className="text-[10px] axi-ink-faint">{ownerKind}</span>}
                            {role && <span className={`text-[10px] ${noAccess ? 'axi-ink-danger' : 'axi-ink-meta'}`}>{role}</span>}
                            {isDefault && <span className="text-[10px] axi-ink-ok">✓ current</span>}
                        </span>
                    );
                    return (
                        <li key={key} data-testid="site-row" className={`flex items-center justify-between gap-2 text-sm ${noAccess ? 'opacity-50' : ''}`}>
                            {isDefault || noAccess
                                ? <div className="flex-1 min-w-0 px-2 py-1">{label}</div>
                                : (
                                    <button type="button" disabled={busy} onClick={() => void makeDefault(site)} aria-label={`Use ${full}`} className="axi-pill axi-pill--xs flex-1 min-w-0 text-left">
                                        {label}
                                    </button>
                                )}
                            {!isDefault && (
                                <button type="button" disabled={busy} onClick={() => void remove(site)} aria-label={`Remove ${full}`} className="axi-action axi-action--glyph p-1 axi-ink-faint">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            {invites.length > 0 && (
                <>
                    <div className="text-xs uppercase tracking-widest axi-ink-faint mt-4 mb-2">Invites</div>
                    <ul className="space-y-1">
                        {invites.map((i) => (
                            <li key={i.id} className="flex items-center justify-between text-sm">
                                <span><span className="axi-ink-plain">{i.fullName}</span> <span className="text-xs axi-ink-faint">from {i.inviter}</span></span>
                                <button onClick={() => void join(i)} disabled={busy} aria-label={`Join ${i.fullName}`} className={BTN}>Join</button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {mode === 'create' && (
                <div className="mt-4">
                    <div className="flex items-center gap-2">
                        {orgs.length > 0 && (
                            <select value={createOwner} onChange={(e) => setCreateOwner(e.target.value)} className="axi-select w-44" aria-label="Repository owner">
                                <option value="">Personal account</option>
                                {orgs.map((o) => <option key={o.login} value={o.login}>{o.login}</option>)}
                            </select>
                        )}
                        <input
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value.trim())}
                            placeholder="New repository name"
                            className={`axi-input flex-1 ${createError ? 'axi-edge-danger' : ''}`}
                        />
                        <button onClick={() => void create()} disabled={busy || !createName || !!createError} className="axi-btn axi-btn--sm axi-ink-meta axi-edge-meta">
                            {busy ? 'Creating…' : 'Create'}
                        </button>
                    </div>
                    {createError && <div className="text-xs axi-ink-danger mt-2">{createError}</div>}
                </div>
            )}

            {mode === 'existing' && (
                <div className="mt-4">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search repositories..." className="axi-input w-full mb-2" />
                    {repos === null && <div className="text-xs axi-ink-meta">Loading…</div>}
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {(repos ?? [])
                            .filter((r) => r.full_name.toLowerCase().includes(search.trim().toLowerCase()))
                            .map((r) => {
                                const listed = hasSite(sites, { owner: r.owner, repo: r.name });
                                return (
                                    <button key={r.full_name} type="button" disabled={busy || listed} onClick={() => void pickExisting(r)} className="axi-pill axi-pill--xs w-full text-left flex items-center justify-between">
                                        <span className="truncate">{r.full_name}</span>
                                        {listed && <span className="text-[10px] axi-ink-faint">added</span>}
                                    </button>
                                );
                            })}
                    </div>
                </div>
            )}

            {mode === 'find' && (
                <div className="mt-4">
                    {found === null && !findError && <div className="text-xs axi-ink-meta">Searching…</div>}
                    {findError && <div className="text-xs axi-ink-danger">{findError}</div>}
                    {found?.length === 0 && <div className="text-xs axi-ink-faint">No other AxiBridge sites found.</div>}
                    <ul className="space-y-1">
                        {(found ?? []).map((f) => (
                            <li key={`${f.owner}/${f.repo}`} className="flex items-center justify-between text-sm">
                                <span className="axi-ink-plain">{f.owner}/{f.repo}</span>
                                <button onClick={() => void add(f, 'found')} disabled={busy} aria-label={`Add ${f.owner}/${f.repo}`} className={BTN}>Add</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => onModeChange('create')} aria-pressed={mode === 'create'} className={BTN}>+ Create new site</button>
                <button onClick={() => onModeChange('existing')} aria-pressed={mode === 'existing'} className={BTN}>Use existing repo…</button>
                <button onClick={() => onModeChange('find')} aria-pressed={mode === 'find'} className={BTN}>Find my sites</button>
            </div>
            {note && <div className={`mt-3 text-xs ${note.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>{note.text}</div>}
        </div>
    );
};
```

Note: the "Find my sites" footer button re-runs the search only when the mode *changes* into `find`. That is fine: a second click while already in `find` is a no-op, matching "manual" discovery.

In `pickExisting`, `makeDefault`/`add` go through `run`, which no-ops when `busy`; the `disabled={busy}` on the buttons prevents re-entry.

- [ ] **Step 5: Run tests**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/SiteListPanel.test.tsx`
Expected: PASS. If `act` warnings appear from the mount-time invites load, they are acceptable; failures are not.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/settings/SiteListPanel.tsx src/renderer/settings/validateRepoName.ts src/renderer/settings/__tests__/SiteListPanel.test.tsx src/renderer/SettingsView.tsx
git commit -m "feat: site list panel with invites, create, use existing and Find my sites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the card and panel into Settings

**Files:**
- Modify: `src/renderer/SettingsView.tsx`
- Delete: `src/renderer/settings/PendingSiteInvites.tsx`, `src/renderer/settings/__tests__/PendingSiteInvites.test.tsx`
- Modify: `src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx`

**Interfaces:**
- Consumes: `PublishingSiteCard`, `SitePanelMode` (Task 5); `SiteListPanel` (Task 6); `getGithubSiteDetails` (Task 3); `settings.githubSites` (Task 2).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

In `SettingsView.sharedPublishing.test.tsx`, add to the default `api` in `renderSettings`:

```ts
        getGithubSiteDetails: vi.fn(async () => ({ success: true, details: {} })),
        getGithubSites: vi.fn(async () => ({ success: true, sites: [], defaultKey: null })),
```

Delete the skipped `keeps a joined site in favorites on the next save` test and add:

```tsx
    it('shows the default site in the Publishing to card with its role', async () => {
        renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubSites: [{ owner: 'guild', repo: 'site', addedVia: 'default', addedAt: '' }] },
            {
                getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'Organization', collaborators: [], invites: [] })),
                getGithubSiteDetails: vi.fn(async () => ({ success: true, details: { 'guild/site': { role: 'admin', ownerType: 'Organization', ownerAvatarUrl: null, pagesUrl: 'https://reports.example/', memberCount: null } } }))
            }
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        const card = await screen.findByTestId('publishing-site-card');
        expect(card).toHaveTextContent('guild/site');
        expect(await screen.findByText('you: admin')).toBeInTheDocument();
        expect(screen.getByText('https://reports.example/')).toBeInTheDocument();
        expect(screen.getByTestId('publishers-card')).toBeInTheDocument();
    });

    it('switching site saves the new default and never writes favourites', async () => {
        const sites = [{ owner: 'guild', repo: 'site', addedVia: 'default', addedAt: '' }, { owner: 'x', repo: 'other', addedVia: 'manual', addedAt: '' }];
        const api = renderSettings(
            { githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubSites: sites, githubFavoriteRepos: ['x/other'] },
            {
                getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'User', collaborators: [], invites: [] })),
                setDefaultGithubSite: vi.fn(async () => ({ success: true, sites, defaultKey: 'x/other', pagesUrl: 'https://x.github.io/other' }))
            }
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Switch site' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Use x/other' }));
        await waitFor(() => {
            const saved = api.saveSettings.mock.calls.at(-1)?.[0];
            expect(saved).toMatchObject({ githubRepoOwner: 'x', githubRepoName: 'other' });
        }, { timeout: 2000 });
        for (const [payload] of api.saveSettings.mock.calls) {
            expect(payload).not.toHaveProperty('githubFavoriteRepos');
            expect(payload).not.toHaveProperty('githubPagesBaseUrl');
        }
    });

    it('a join that becomes the default survives the next save', async () => {
        const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: true, sites: [{ owner: 'guild', repo: 'site', addedVia: 'joined', addedAt: '' }] };
        const api = renderSettings({ githubToken: 'tok' }, {
            getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [{ id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: false }] })),
            acceptSiteInvite: vi.fn(async () => ({ success: true, target })),
            getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: false, ownerType: 'User', collaborators: [], invites: [] }))
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Web Report' }));
        fireEvent.click(await screen.findByRole('button', { name: /site invite/ }));
        await userEvent.click(await screen.findByRole('button', { name: 'Join guild/site' }));
        await waitFor(() => {
            expect(api.saveSettings.mock.calls.at(-1)?.[0]).toMatchObject({ githubRepoOwner: 'guild', githubRepoName: 'site' });
        }, { timeout: 2000 });
    });
```

Note on the third test: with no default, the empty-state card shows the `1 site invite` link only once the card knows the count, so SettingsView must load `getPendingSiteInvites` itself on mount (see Step 3) — the panel's own load then refreshes it.

Also add `getGithubSiteDetails` / `getGithubSites` mocks to `src/renderer/__tests__/SettingsView.test.tsx`'s API stub if that file renders the Web Report pane, and to `tests/e2e/app/fixtures/electronAPIMock.ts` (`getGithubSites: async () => ({ success: true, sites: [], defaultKey: null })`, `getGithubSiteDetails: async () => ({ success: true, details: {} })`, `findGithubSites: async () => ({ success: true, found: [] })`, `addGithubSite`/`removeGithubSite`/`setDefaultGithubSite` returning `{ success: true, sites: [] }`), following that file's existing `log(...)` style.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx`
Expected: FAIL (no `publishing-site-card`).

- [ ] **Step 3: Rewire SettingsView**

Imports: remove `PendingSiteInvites`, `ISiteJoinTarget`, and `Star` (if now unused). Add:

```ts
import { PublishingSiteCard, type SitePanelMode } from './settings/PublishingSiteCard';
import { SiteListPanel } from './settings/SiteListPanel';
import { normalizeSiteKey, type IGithubSite, type ISiteDetails } from '../shared/githubSites';
```

State — **remove**: `githubFavoriteRepos`, `githubRepos`, `githubOrgs`, `githubCreateOwner`, `githubRepoSearch`, `githubRepoMode`, `loadingRepos`, `githubRepoError`, `creatingRepo`, `githubRepoStatus`, `githubRepoStatusKind`, `pagesUrlCopied`, `lastSavedPagesUrlRef`, `favoriteRepoSet`, `selectedGithubRepoKey`, `inferredPagesUrl` (verify each has no remaining reader with grep before deleting), and the functions `refreshGithubRepos`, `toggleFavoriteRepo`, `handleCreateGithubRepo`, `handleCopyPagesUrl`, `handleSiteJoined`, plus the `useEffect` that calls `refreshGithubRepos` on connect and the `useEffect` that saves `githubPagesBaseUrl: inferredPagesUrl` (ruling 7). The import-settings meta list entry for `githubFavoriteRepos` (line ~100) stays.

**Add** state and effects (next to the other GitHub state):

```ts
    const [githubSites, setGithubSites] = useState<IGithubSite[]>([]);
    const [siteDetails, setSiteDetails] = useState<Record<string, ISiteDetails>>({});
    const [sitePanelMode, setSitePanelMode] = useState<SitePanelMode | null>(null);
    const [siteInviteCount, setSiteInviteCount] = useState(0);
    const defaultSiteKey = githubRepoOwner && githubRepoName ? normalizeSiteKey(githubRepoOwner, githubRepoName) : null;

    // Details for the default always; for every site while the panel is open.
    useEffect(() => {
        if (githubAuthStatus !== 'connected' || !window.electronAPI?.getGithubSiteDetails) return;
        const refs = sitePanelMode
            ? githubSites.map(({ owner, repo }) => ({ owner, repo }))
            : (githubRepoOwner && githubRepoName ? [{ owner: githubRepoOwner, repo: githubRepoName }] : []);
        if (refs.length === 0) return;
        let cancelled = false;
        void window.electronAPI.getGithubSiteDetails(refs)
            .then((res) => { if (!cancelled && res?.success && res.details) setSiteDetails((prev) => ({ ...prev, ...res.details })); })
            .catch(() => { /* fail open: no badges */ });
        return () => { cancelled = true; };
    }, [githubAuthStatus, githubRepoOwner, githubRepoName, sitePanelMode !== null, githubSites]);

    useEffect(() => {
        if (githubAuthStatus !== 'connected') return;
        void window.electronAPI?.getPendingSiteInvites?.().then((res) => {
            if (res?.success) setSiteInviteCount((res.invites ?? []).length);
        }).catch(() => {});
    }, [githubAuthStatus]);

    const handleDefaultChanged = useCallback((owner: string, repo: string) => {
        // SettingsView saves its whole state; the default must land here or the next save reverts it.
        setGithubRepoOwner(owner);
        setGithubRepoName(repo);
    }, []);
```

`githubAuthStatus` is `'connected'` when a token is loaded — confirm by reading how it is set from `settings.githubToken` in the load effect (~line 600); if it is set elsewhere, key the effects on whatever the existing logo/template effects use.

`sitePanelMode !== null` as a dependency is deliberate (re-fetch on open, not on mode changes inside the panel); if the lint rule `react-hooks/exhaustive-deps` complains, hoist it: `const sitePanelOpen = sitePanelMode !== null;` and depend on `sitePanelOpen`.

In the settings load (~line 609) replace `setGithubFavoriteRepos(…)` with:

```ts
        setGithubSites(Array.isArray(settings.githubSites) ? settings.githubSites : []);
```

In `saveSettings` (~line 1043) delete the `githubFavoriteRepos,` line; in the autosave dependency array (~line 1093) delete `githubFavoriteRepos,`.

The Disconnect button's `onClick`: delete `setGithubRepos([]);` (state is gone); keep the rest.

**Replace JSX** from `<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">` (the Repository well, ~line 1955) through the `PublishersCard` block (~line 2138) with:

```tsx
                        {githubAuthStatus === 'connected' && (
                            <PublishingSiteCard
                                owner={githubRepoOwner || null}
                                repo={githubRepoName || null}
                                details={defaultSiteKey ? siteDetails[defaultSiteKey] ?? null : null}
                                inviteCount={siteInviteCount}
                                onOpenPanel={setSitePanelMode}
                            >
                                {githubRepoOwner && githubRepoName && (
                                    <PublishersCard repoOwner={githubRepoOwner} repoName={githubRepoName} onAdminKnown={handleAdminKnown} />
                                )}
                            </PublishingSiteCard>
                        )}
                        {githubAuthStatus === 'connected' && sitePanelMode && (
                            <SiteListPanel
                                mode={sitePanelMode}
                                sites={githubSites}
                                defaultKey={defaultSiteKey}
                                details={siteDetails}
                                onModeChange={setSitePanelMode}
                                onClose={() => setSitePanelMode(null)}
                                onSitesChanged={setGithubSites}
                                onDefaultChanged={handleDefaultChanged}
                                onInvitesChanged={setSiteInviteCount}
                            />
                        )}
                        {githubTemplateStatus && (
                            <div className={`text-xs mb-4 ${githubTemplateStatusKind === 'success' ? 'axi-ink-ok' : githubTemplateStatusKind === 'error' ? 'axi-ink-danger' : 'axi-ink-meta'}`}>
                                {githubTemplateStatus}
                            </div>
                        )}
```

Keep the Logo well that follows unchanged.

Then delete `src/renderer/settings/PendingSiteInvites.tsx` and its test (`git rm`).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx src/renderer/__tests__/SettingsView.test.tsx src/renderer/settings`
Expected: PASS.
Run: `npm run validate`
Expected: PASS with zero lint warnings (fix any unused imports/vars the removal left behind).

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer/SettingsView.tsx src/renderer/settings src/renderer/__tests__ tests/e2e/app/fixtures/electronAPIMock.ts
git commit -m "feat: Settings shows the site you publish to, with members and a site switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Publish button names its target

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts` (~lines 65, 86-107)
- Modify: `src/renderer/stats/ui/StatsHeader.tsx`
- Modify: `src/renderer/stats/ui/PublishWebhookPopover.tsx`
- Create: `src/renderer/stats/hooks/__tests__/buildUploadTargets.test.ts` (or `src/renderer/stats/__tests__/…` — match where the repo keeps hook tests: run `ls src/renderer/stats/hooks/__tests__ src/renderer/stats/__tests__` and use the existing one)
- Modify: `src/renderer/__tests__/StatsHeader.test.tsx`

**Interfaces:**
- Consumes: `IGithubSite`, `ISiteDetails`, `normalizeSiteKey`, `sortSitesDefaultFirst`, `inferredPagesUrl`, `describeDestination` (Task 1); `getGithubSiteDetails` (Task 3); `settings.githubSites` (Task 2).
- Produces:
  - `export type UploadTarget = { fullName: string; label: string; isDefault: boolean; pagesUrl: string; memberCount: number | null }` (exported from `useStatsUploads.ts`)
  - `export const buildUploadTargets(sites: IGithubSite[], defaultKey: string | null, details: Record<string, ISiteDetails> | null): UploadTarget[]`
  - `StatsHeader`'s `uploadTargets` prop is `UploadTarget[]`
  - `PublishWebhookPopover` gains optional prop `destinationNote?: string`

- [ ] **Step 1: Write the failing tests**

`buildUploadTargets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildUploadTargets } from '../useStatsUploads';

const s = (owner: string, repo: string) => ({ owner, repo, addedVia: 'manual' as const, addedAt: '' });
const d = (role: 'admin' | 'publisher' | 'none' | null, extra = {}) => ({ role, ownerType: null, ownerAvatarUrl: null, pagesUrl: 'https://p/', memberCount: null, ...extra });

describe('buildUploadTargets', () => {
    it('puts the default first and labels it', () => {
        const t = buildUploadTargets([s('x', 'y'), s('Guild', 'Site')], 'guild/site', null);
        expect(t.map((x) => [x.fullName, x.isDefault, x.label])).toEqual([['Guild/Site', true, 'Guild/Site (Default)'], ['x/y', false, 'x/y']]);
        expect(t[1].pagesUrl).toBe('https://x.github.io/y');
    });
    it('drops sites with no access once details are known, but never the default', () => {
        const t = buildUploadTargets([s('g', 's'), s('x', 'y'), s('o', 'gone')], 'g/s', { 'g/s': d('none'), 'x/y': d('publisher', { memberCount: 3 }), 'o/gone': d('none') });
        expect(t.map((x) => x.fullName)).toEqual(['g/s', 'x/y']);
        expect(t[1]).toMatchObject({ pagesUrl: 'https://p/', memberCount: 3 });
    });
    it('keeps everything when details are missing or unknown (fail open)', () => {
        expect(buildUploadTargets([s('g', 's'), s('x', 'y')], 'g/s', null)).toHaveLength(2);
        expect(buildUploadTargets([s('g', 's'), s('x', 'y')], 'g/s', { 'x/y': d(null) })).toHaveLength(2);
    });
});
```

Ruling inside this task: the default is never filtered out, even with role `none` — removing it would make the main button silently publish elsewhere; the publish itself reports the access error.

Append to `StatsHeader.test.tsx` (reuse that file's render props):

```tsx
    it('names the default site on the publish button', () => {
        render(
            <StatsHeader embedded={false} totalLogs={4} devMockAvailable={false} devMockUploadState={{ uploading: false }} onDevMockUpload={() => {}}
                uploadingWeb={false} onWebUpload={() => {}}
                uploadTargets={[{ fullName: 'guild/site', label: 'guild/site (Default)', isDefault: true, pagesUrl: 'https://g/', memberCount: 4 }]} />
        );
        expect(screen.getByRole('button', { name: /Publish to guild\/site/ })).toBeInTheDocument();
    });
    it('shows where an alternate publish goes and uses it once', () => {
        const onWebUploadToTarget = vi.fn();
        render(
            <StatsHeader embedded={false} totalLogs={4} devMockAvailable={false} devMockUploadState={{ uploading: false }} onDevMockUpload={() => {}}
                uploadingWeb={false} onWebUpload={() => {}} onWebUploadToTarget={onWebUploadToTarget}
                uploadTargets={[
                    { fullName: 'guild/site', label: 'guild/site (Default)', isDefault: true, pagesUrl: 'https://g/', memberCount: 4 },
                    { fullName: 'x/y', label: 'x/y', isDefault: false, pagesUrl: 'https://x/', memberCount: null }
                ]} />
        );
        fireEvent.click(screen.getByTitle('Choose upload repository'));
        expect(screen.getByText('Your report appears at https://g/, alongside reports from 3 other commanders.')).toBeInTheDocument();
        expect(screen.getByText('https://x/')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /x\/y/ }));
        expect(onWebUploadToTarget).toHaveBeenCalledWith('x/y');
        expect(screen.getByRole('button', { name: /Publish to guild\/site/ })).toBeInTheDocument();
    });
```

(import `fireEvent`/`vi` if the file doesn't already.) The existing `Upload to Web` tests (no targets) must stay green unchanged.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/StatsHeader.test.tsx <path of buildUploadTargets.test.ts>`
Expected: FAIL.

- [ ] **Step 3: Implement in `useStatsUploads.ts`**

Add imports:

```ts
import { inferredPagesUrl, normalizeSiteKey, sortSitesDefaultFirst, type IGithubSite, type ISiteDetails } from '../../../shared/githubSites';
```

Add (module level, exported):

```ts
export type UploadTarget = { fullName: string; label: string; isDefault: boolean; pagesUrl: string; memberCount: number | null };

/** Saved sites as publish targets, default first. Sites known to have lost access are dropped; unknown = kept. */
export const buildUploadTargets = (
    sites: IGithubSite[], defaultKey: string | null, details: Record<string, ISiteDetails> | null
): UploadTarget[] => sortSitesDefaultFirst(sites, defaultKey)
    .map((site) => {
        const key = normalizeSiteKey(site.owner, site.repo);
        const fullName = `${site.owner}/${site.repo}`;
        const isDefault = key === defaultKey;
        const d = details?.[key];
        return {
            target: {
                fullName,
                label: isDefault ? `${fullName} (Default)` : fullName,
                isDefault,
                pagesUrl: d?.pagesUrl || inferredPagesUrl(site),
                memberCount: d?.memberCount ?? null
            },
            drop: !isDefault && d?.role === 'none'
        };
    })
    .filter((x) => !x.drop)
    .map((x) => x.target);
```

Change the state type at line ~65 to `useState<UploadTarget[]>([])`. Replace the block from `const defaultFullName = …` through `setWebUploadTargets(nextTargets);` with:

```ts
                const sites: IGithubSite[] = Array.isArray(settings?.githubSites) ? settings.githubSites : [];
                const defaultKey = settings?.githubRepoOwner && settings?.githubRepoName
                    ? normalizeSiteKey(settings.githubRepoOwner, settings.githubRepoName)
                    : null;
                setWebUploadTargets(buildUploadTargets(sites, defaultKey, null));
                if (sites.length > 0 && window.electronAPI?.getGithubSiteDetails) {
                    try {
                        const res = await window.electronAPI.getGithubSiteDetails(sites.map(({ owner, repo }) => ({ owner, repo })));
                        if (!cancelled && res?.success && res.details) setWebUploadTargets(buildUploadTargets(sites, defaultKey, res.details));
                    } catch {
                        // Fail open: the list from settings stays.
                    }
                }
```

(The surrounding `try { … } catch { if (!cancelled) setWebUploadTargets([]); }` remains; the inner try keeps a details failure from wiping the targets — Review Focus 4.)

- [ ] **Step 4: Implement in `StatsHeader.tsx` and `PublishWebhookPopover.tsx`**

`StatsHeader.tsx`:
- Import `describeDestination` from `'../../../shared/githubSites'` and `type UploadTarget` from `'../hooks/useStatsUploads'`; change the prop type to `uploadTargets?: UploadTarget[];`.
- Below `const alternateUploadTargets = …` add:
  ```ts
    const defaultUploadTarget = uploadTargets.find((target) => target.isDefault) ?? null;
    const noteFor = (fullName: string | null) => {
        const target = fullName ? uploadTargets.find((t) => t.fullName === fullName) : defaultUploadTarget;
        return target ? describeDestination(target.pagesUrl, target.memberCount) : undefined;
    };
  ```
- Button label: replace `{uploadingWeb ? 'Uploading...' : 'Upload to Web'}` with
  ```tsx
                                <span className="truncate max-w-[16rem]">
                                    {uploadingWeb ? 'Uploading...' : defaultUploadTarget ? `Publish to ${defaultUploadTarget.fullName}` : 'Upload to Web'}
                                </span>
  ```
- In the dropdown panel, before `{alternateUploadTargets.map(…)}` add
  ```tsx
                                {defaultUploadTarget && (
                                    <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--axi-text-dim)', borderBottom: 'var(--axi-border-control) solid var(--axi-rule)' }}>
                                        {noteFor(null)}
                                    </div>
                                )}
                                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>Publish this one to</div>
  ```
  and change each alternate button's content from `{target.label}` to
  ```tsx
                                        <span className="block">{target.label}</span>
                                        <span className="block text-[10px]" style={{ color: 'var(--axi-text-dim)' }}>{target.pagesUrl}</span>
  ```
- Pass `destinationNote={noteFor(publishTarget)}` to `<PublishWebhookPopover … />`.

`PublishWebhookPopover.tsx`: add `destinationNote?: string` to its props, and render, as the first child of the popover body, `{destinationNote && <p className="text-[11px] mb-2" style={{ color: 'var(--axi-text-dim)' }}>{destinationNote}</p>}`. Read the component first and place it consistently with its existing header markup.

The dropdown already uses `app-dropdown axi-panel axi-panel--float` (the glass-safe surface); do not change its classes.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/StatsHeader.test.tsx src/renderer/stats`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS (StatsView passes `webUploadTargets` straight through; its type now flows from the hook).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats src/renderer/__tests__/StatsHeader.test.tsx
git commit -m "feat: publish button names its site and says where the report appears

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: History picker reads the site list

**Files:**
- Modify: `src/renderer/FightReportHistoryView.tsx` (`buildRepoOptions`, ~lines 50-90)
- Test: find the existing History test (`grep -rln "FightReportHistoryView\|buildRepoOptions" src/renderer --include=*.test.tsx`); add there, or create `src/renderer/__tests__/FightReportHistoryView.repoOptions.test.ts`

**Interfaces:**
- Consumes: `settings.githubSites` (Task 2); `inferredPagesUrl`, `normalizeSiteKey`, `sortSitesDefaultFirst` (Task 1).
- Produces: `export const buildRepoOptions(settings: any): HistoryRepoOption[]` (export it for the test; behaviour for callers unchanged).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildRepoOptions } from '../FightReportHistoryView';

const s = (owner: string, repo: string) => ({ owner, repo, addedVia: 'manual', addedAt: '' });

describe('History repo options', () => {
    it('lists the default first with its stored URL, then every saved site', () => {
        const opts = buildRepoOptions({
            githubRepoOwner: 'guild', githubRepoName: 'site', githubPagesBaseUrl: 'https://reports.example/',
            githubSites: [s('x', 'y'), s('Guild', 'Site')], githubFavoriteRepos: ['ignored/repo']
        });
        expect(opts).toEqual([
            { key: 'guild/site', label: 'guild/site (Default)', indexUrl: 'https://reports.example' },
            { key: 'x/y', label: 'x/y', indexUrl: 'https://x.github.io/y' }
        ]);
    });
    it('works with no default', () => {
        expect(buildRepoOptions({ githubSites: [s('x', 'y')] }).map((o) => o.key)).toEqual(['x/y']);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL (`buildRepoOptions` not exported / favourites listed).

- [ ] **Step 3: Implement**

Export `buildRepoOptions` and replace its body after `const defaultFullName = …` with:

```ts
    const options: HistoryRepoOption[] = [];
    const defaultKey = defaultFullName ? normalizeSiteKey(defaultOwner, defaultRepo) : null;
    if (defaultFullName && defaultBaseUrl) {
        options.push({ key: defaultFullName, label: `${defaultFullName} (Default)`, indexUrl: defaultBaseUrl });
    }
    const sites: IGithubSite[] = Array.isArray(settings?.githubSites) ? settings.githubSites : [];
    sortSitesDefaultFirst(sites, defaultKey).forEach((site) => {
        if (normalizeSiteKey(site.owner, site.repo) === defaultKey) return;
        const fullName = `${site.owner}/${site.repo}`;
        options.push({ key: fullName, label: fullName, indexUrl: inferredPagesUrl(site) });
    });
    return options;
```

Remove the now-unused `seen`/`pushOption`/favourites code and `parseRepoFullName` if nothing else uses it (grep first). Add imports from `'../shared/githubSites'`. Check how the view maps a selected `key` back to owner/repo for `getGithubReports` (search for `parseRepoFullName(` or `.key` usage) and keep that working — keys stay `owner/repo`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --maxWorkers=2 <the history test file> src/renderer/__tests__`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/FightReportHistoryView.tsx <the history test file>
git commit -m "feat: History lists every saved publishing site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification

**Files:** none new.

- [ ] **Step 1: No stragglers**

Run: `grep -rn "githubFavoriteRepos" src --include=*.ts --include=*.tsx | grep -v __tests__`
Expected: only `src/main/githubSitesStore.ts` (migration read), `src/main/index.ts` (`applySettings` import path), `src/renderer/global.d.ts` (the frozen type), and the `IMPORT_SETTING_META` entry in `SettingsView.tsx`.

Run: `grep -rn "PendingSiteInvites" src`
Expected: no matches.

- [ ] **Step 2: Validate and test**

Run: `npm run validate`
Expected: PASS, zero lint warnings.
Run: `npx vitest run --maxWorkers=2`
Expected: PASS. Compare the failure list against `main` if anything fails: run the same command on a clean checkout of `main` in a separate worktree only if needed to prove a failure is pre-existing, and say so in the report.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual checklist (for the human, not automated)**

Record in the final report, unticked, for the user to run:
1. Fresh dev profile with two starred repos → open Settings → both appear under Switch site; `githubFavoriteRepos` unchanged in `config.json`.
2. Switch to a `gh-pages`-branch site → publish → report lands on `gh-pages`.
3. Org repo whose org blocks outside collaborators → add a member → explanatory error + Org settings link.
4. Second account: accept an invite from the panel → site appears as current (if no default) → publish button reads "Publish to org/repo".
5. Find my sites on an account with an AxiBridge site not yet listed → it appears with Add.

- [ ] **Step 5: Commit any fixes**

Only if Steps 1-3 required changes:

```bash
git add -A src tests
git commit -m "fix: publishing sites verification fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
