# Shared Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let several AxiBridge users publish to one guild GitHub Pages site: the repo admin adds publishers by GitHub username, invitees join from a banner, and concurrent publishes never lose each other's reports.

**Architecture:** GitHub's collaborator/invitation API is the only source of truth (no backend). A new `githubApi.ts` holds the request primitive plus cached viewer/permission lookups; a new `githubPublishersHandlers.ts` owns the invite/collaborator IPC. Publishing is made concurrency-safe by a generic `commitWithRebase` loop that rebuilds every base-dependent file from the new HEAD on a 422, and two pure policies (`sharedSitePolicy.ts`) decide site appearance (admin-owned) and whether the viewer bundle may be written (never backwards).

**Tech Stack:** Electron main (TypeScript, `node:https`), React renderer, vitest + @testing-library/react (jsdom), electron-store.

**Spec:** `docs/superpowers/specs/2026-10-04-shared-publishing-design.md`

## Global Constraints

- Run vitest with at most 2 workers: `npx vitest run <file>` (the repo's `vitest.config.ts` already sets `maxWorkers: 2`; never override it upward).
- No new OAuth scope: device flow keeps requesting `repo`.
- Publishers always get `permission: 'push'`.
- Commit loop: max **3** attempts, jitter **250–1000 ms** between attempts.
- Busy error text, verbatim: `The site was updated by someone else while publishing. Try again.`
- No-push error text, verbatim: `You don't have push access to {owner}/{repo}. Ask the site admin to add you.`
- Logo refusal text, verbatim: `Only a repo admin can change the site logo.`
- Site-invite filter: repo description exactly `AxiBridge Reports`, or `reports/index.json` (root) / `docs/reports/index.json` exists on the default branch.
- Invite list cache: 10 minutes per token.
- Store keys added: `dismissedSiteInvites: string[]`. Existing keys reused: `githubFavoriteRepos`, `githubRepoOwner`, `githubRepoName`, `githubBranch`, `githubPagesBaseUrl`, `githubPagesSourcePath`.
- `index.json` gains `generator: { app: 'axibridge', version }`; entries gain optional `publishedBy: string`.
- Permission lookup failure ⇒ treat as non-admin (never write appearance/logo).
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If GPG signing fails with "agent returned an error", retry once, then use `--no-gpg-sign` and say so.
- Work only inside `/var/home/mstephens/Documents/GitHub/axibridge` on branch `feat/shared-publishing`. Never run `git reset`, `git checkout -- .`, `git clean`, or `git stash`. Run long `npm`/`npx` commands in the foreground.

## Review Focus

1. **A corrupt or unreadable `reports/index.json` on a shared site** — a publish must fail loudly rather than write an index containing only the new report (today's code swallows the read error and wipes everyone's entries). Pinned in Task 4 (`readSiteIndexRaw` throws on bad JSON).
2. **Delete on a site whose index carries `colorPalette`/`axiTheme`/`generator`** — today's delete keeps only `siteTheme` and silently drops the site's look; deleting must preserve every top-level field. Pinned in Task 2 (`removeFromSiteIndex`).
3. **Invite for a private repo the invitee can't read yet** — the contents probe 404s before acceptance; the description check must still admit AxiBridge-created repos. Pinned in Task 6 test "keeps a private repo by description alone".
4. **Settings open with stale state while a join lands** — `SettingsView` saves its whole state, so a join from the Settings invite list must update `githubFavoriteRepos` (and the default repo fields) in component state, or the next save reverts it. Pinned in Task 7 (`onJoined` updates state; test asserts favorites state change).
5. **Non-admin with a logo path already set** — Settings' auto logo-sync effect fires on load and would surface an error every time; it must skip when the user isn't admin of the selected repo. Pinned in Task 7 test "does not sync the logo for a non-admin".

---

## File Structure

| File | Responsibility |
|---|---|
| `src/main/githubApi.ts` (new) | `encodeGitPath`, `githubApiRequest`, `getViewerLogin` (cached), `getRepoPermissions` (cached), `resetGithubApiCaches` |
| `src/main/sharedSitePolicy.ts` (new) | Pure: `parseSiteIndex`, `buildIndexPayload`, `removeFromSiteIndex`, `resolveSiteAppearance`, `shouldWriteViewer` |
| `src/main/githubCommitLoop.ts` (new) | Pure: `commitWithRebase`, `isRefConflict`, `SiteBusyError`, `toPushAccessError`, `CommitBase`, `CommitEntry` |
| `src/main/handlers/githubHandlers.ts` | Imports the above; new private helpers `readGitBase`, `makeGitCommitter`, `readSiteIndexRaw`; publish/delete/template/logo moved onto the loop |
| `src/main/handlers/githubPublishersHandlers.ts` (new) | IPC: viewer login, publishers list/add/remove/cancel, site invites list/accept/dismiss |
| `src/main/index.ts` | Register publishers handlers |
| `src/preload/index.ts`, `src/renderer/global.d.ts` | API surface |
| `src/shared/reportTypes.ts` | `publishedBy?` on `ReportIndexEntry` |
| `src/shared/publishedBy.ts` (new) | Pure: `othersPublishedBy`, `buildDeleteConfirmText` |
| `src/renderer/settings/PublishersCard.tsx` (new) | Owner UI |
| `src/renderer/settings/PendingSiteInvites.tsx` (new) | Settings list of all pending site invites with Join |
| `src/renderer/app/SiteInviteBanner.tsx` (new) | Presentational join banner |
| `src/renderer/app/hooks/useSiteInvites.ts` (new) | Fetch/join/dismiss state for the banner |
| `src/renderer/SettingsView.tsx` | Mount card + invite list, logo gate |
| `src/renderer/App.tsx` | Mount banner |
| `src/renderer/FightReportHistoryView.tsx`, `src/web/reportApp.tsx` | "by {login}", delete confirmation |

---

### Task 1: `githubApi.ts` — request primitive, viewer login, repo permissions

**Files:**
- Create: `src/main/githubApi.ts`
- Create: `src/main/__tests__/githubHttpsMock.ts` (test helper, not a test file)
- Modify: `src/main/handlers/githubHandlers.ts:195-246` (remove `encodeGitPath`, `GITHUB_API_IDLE_TIMEOUT_MS`, `githubApiRequest`; import them)
- Test: `src/main/__tests__/githubApi.test.ts`

**Interfaces:**
- Produces:
  - `encodeGitPath(value: string): string`
  - `GITHUB_API_IDLE_TIMEOUT_MS: number`
  - `githubApiRequest(method: string, apiPath: string, token: string, body?: any): Promise<{ status: number; data: any }>`
  - `getViewerLogin(token: string): Promise<string | null>`
  - `interface RepoPermissions { admin: boolean; push: boolean; ownerType: 'User' | 'Organization' | null }`
  - `getRepoPermissions(owner: string, repo: string, token: string): Promise<RepoPermissions>`
  - `invalidateRepoPermissions(owner: string, repo: string): void`
  - `resetGithubApiCaches(): void`
  - Test helper: `installHttpsMock(responder: (call: RecordedCall) => MockResponse): RecordedCall[]`, types `RecordedCall`, `MockResponse`

- [ ] **Step 1: Write the test helper**

`src/main/__tests__/githubHttpsMock.ts`:

```ts
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { vi } from 'vitest';

export type MockResponse = { status: number; body?: unknown };
export interface RecordedCall { method: string; path: string; body: unknown }

/** Stub https.request; returns the live array of recorded calls. */
export function installHttpsMock(responder: (call: RecordedCall) => MockResponse): RecordedCall[] {
    const calls: RecordedCall[] = [];
    vi.spyOn(https, 'request').mockImplementation((options: any, cb: any) => {
        const req = new EventEmitter() as any;
        let payload = '';
        req.write = (chunk: string) => { payload += chunk; };
        req.setTimeout = () => req;
        req.destroy = () => undefined;
        req.end = () => {
            const call: RecordedCall = {
                method: options.method,
                path: options.path,
                body: payload ? JSON.parse(payload) : null
            };
            calls.push(call);
            queueMicrotask(() => {
                const { status, body } = responder(call);
                const res = new EventEmitter() as any;
                res.statusCode = status;
                res.setEncoding = () => {};
                cb(res);
                if (body !== undefined) res.emit('data', JSON.stringify(body));
                res.emit('end');
            });
        };
        return req;
    });
    return calls;
}
```

- [ ] **Step 2: Write the failing tests**

`src/main/__tests__/githubApi.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installHttpsMock, type RecordedCall } from './githubHttpsMock';
import {
    getRepoPermissions,
    getViewerLogin,
    invalidateRepoPermissions,
    resetGithubApiCaches
} from '../githubApi';

let calls: RecordedCall[];

describe('githubApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetGithubApiCaches();
    });

    it('caches the viewer login per token', async () => {
        calls = installHttpsMock(() => ({ status: 200, body: { login: 'kyra' } }));
        expect(await getViewerLogin('t1')).toBe('kyra');
        expect(await getViewerLogin('t1')).toBe('kyra');
        expect(calls.filter((c) => c.path === '/user')).toHaveLength(1);
    });

    it('does not cache a failed viewer lookup', async () => {
        let status = 500;
        calls = installHttpsMock(() => ({ status, body: { login: 'kyra' } }));
        expect(await getViewerLogin('t1')).toBeNull();
        status = 200;
        expect(await getViewerLogin('t1')).toBe('kyra');
    });

    it('reads admin/push/ownerType from GET /repos', async () => {
        calls = installHttpsMock(() => ({
            status: 200,
            body: { owner: { type: 'Organization' }, permissions: { admin: true, push: true } }
        }));
        expect(await getRepoPermissions('guild', 'reports', 't1')).toEqual({
            admin: true, push: true, ownerType: 'Organization'
        });
        expect(calls[0].path).toBe('/repos/guild/reports');
    });

    it('treats a failed lookup as no permissions and does not cache it', async () => {
        let status = 404;
        calls = installHttpsMock(() => ({ status, body: { owner: { type: 'User' }, permissions: { admin: true, push: true } } }));
        expect(await getRepoPermissions('a', 'b', 't1')).toEqual({ admin: false, push: false, ownerType: null });
        status = 200;
        expect((await getRepoPermissions('a', 'b', 't1')).admin).toBe(true);
    });

    it('caches permissions until invalidated', async () => {
        calls = installHttpsMock(() => ({ status: 200, body: { owner: { type: 'User' }, permissions: { push: true } } }));
        await getRepoPermissions('a', 'b', 't1');
        await getRepoPermissions('A', 'B', 't1');
        expect(calls).toHaveLength(1);
        invalidateRepoPermissions('a', 'b');
        await getRepoPermissions('a', 'b', 't1');
        expect(calls).toHaveLength(2);
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/githubApi.test.ts`
Expected: FAIL — cannot resolve `../githubApi`.

- [ ] **Step 4: Create `src/main/githubApi.ts`**

Move `encodeGitPath`, the `GITHUB_API_IDLE_TIMEOUT_MS` comment + constant, and `githubApiRequest` **verbatim** from `githubHandlers.ts:195-246`, exporting all three (`getGithubBlobRaw` in `githubHandlers.ts` still uses `GITHUB_API_IDLE_TIMEOUT_MS`). Then append:

```ts
// ─── Cached identity / permission lookups ─────────────────────────────────────

const viewerLoginCache = new Map<string, Promise<string | null>>();

/** The signed-in user's login. Cached per token; failures are not cached. */
export const getViewerLogin = (token: string): Promise<string | null> => {
    const cached = viewerLoginCache.get(token);
    if (cached) return cached;
    const pending = githubApiRequest('GET', '/user', token)
        .then((resp) => (resp.status < 300 && typeof resp.data?.login === 'string' ? resp.data.login as string : null))
        .catch(() => null);
    viewerLoginCache.set(token, pending);
    void pending.then((login) => { if (!login) viewerLoginCache.delete(token); });
    return pending;
};

export interface RepoPermissions {
    admin: boolean;
    push: boolean;
    ownerType: 'User' | 'Organization' | null;
}

const NO_PERMISSIONS: RepoPermissions = { admin: false, push: false, ownerType: null };
const PERMISSIONS_TTL_MS = 60_000;
const permissionsCache = new Map<string, { at: number; token: string; value: RepoPermissions }>();
const permissionsKey = (owner: string, repo: string) => `${owner}/${repo}`.toLowerCase();

/**
 * What the token may do on owner/repo. A failed lookup reads as "no
 * permissions" — callers treat that as non-admin, which can never flap a
 * shared site's appearance — and is not cached, so the next call retries.
 */
export const getRepoPermissions = async (owner: string, repo: string, token: string): Promise<RepoPermissions> => {
    const key = permissionsKey(owner, repo);
    const cached = permissionsCache.get(key);
    if (cached && cached.token === token && Date.now() - cached.at < PERMISSIONS_TTL_MS) return cached.value;
    try {
        const resp = await githubApiRequest('GET', `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`, token);
        if (resp.status >= 300) return NO_PERMISSIONS;
        const admin = resp.data?.permissions?.admin === true;
        const ownerTypeRaw = resp.data?.owner?.type;
        const value: RepoPermissions = {
            admin,
            push: admin || resp.data?.permissions?.push === true,
            ownerType: ownerTypeRaw === 'Organization' || ownerTypeRaw === 'User' ? ownerTypeRaw : null
        };
        permissionsCache.set(key, { at: Date.now(), token, value });
        return value;
    } catch {
        return NO_PERMISSIONS;
    }
};

export const invalidateRepoPermissions = (owner: string, repo: string) => {
    permissionsCache.delete(permissionsKey(owner, repo));
};

export const resetGithubApiCaches = () => {
    viewerLoginCache.clear();
    permissionsCache.clear();
};
```

- [ ] **Step 5: Point `githubHandlers.ts` at the new module**

Delete lines 195-246 (`encodeGitPath` through the end of `githubApiRequest`) and add to the imports (keep `import https from 'node:https'` — `getGithubBlobRaw` still uses it):

```ts
import { encodeGitPath, GITHUB_API_IDLE_TIMEOUT_MS, githubApiRequest } from '../githubApi';
```

- [ ] **Step 6: Run the new and existing GitHub tests**

Run: `npx vitest run src/main/__tests__/githubApi.test.ts src/main/handlers/__tests__ src/main/__tests__/githubShareTarget.test.ts`
Expected: PASS (existing tests mock `https.request`, which the moved function still uses).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/main/githubApi.ts src/main/__tests__/githubHttpsMock.ts src/main/__tests__/githubApi.test.ts src/main/handlers/githubHandlers.ts
git commit -m "refactor: move the GitHub request primitive into githubApi with cached viewer/permission lookups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `sharedSitePolicy.ts` — index parsing, appearance, viewer-version gate

**Files:**
- Create: `src/main/sharedSitePolicy.ts`
- Test: `src/main/__tests__/sharedSitePolicy.test.ts`

**Interfaces:**
- Consumes: `asAxiTheme`, `AxiTheme` from `src/shared/webThemes.ts`; `parseVersion`, `compareVersion` from `src/main/versionUtils.ts`.
- Produces:
  - `interface SiteGenerator { app: 'axibridge'; version: string }`
  - `interface ParsedSiteIndex { entries: any[]; colorPalette: string | null; axiTheme: AxiTheme | null; generator: SiteGenerator | null }`
  - `parseSiteIndex(raw: unknown): ParsedSiteIndex`
  - `interface SiteAppearance { colorPalette: string; axiTheme: AxiTheme }`
  - `resolveSiteAppearance(opts: { isAdmin: boolean; local: SiteAppearance; site: ParsedSiteIndex | null }): SiteAppearance`
  - `shouldWriteViewer(localVersion: string, recorded: SiteGenerator | null): boolean`
  - `buildIndexPayload(opts: { entry: { id: string } & Record<string, any>; site: ParsedSiteIndex; appearance: SiteAppearance; generator: SiteGenerator | null }): { payload: Record<string, any>; entries: any[] }`
  - `removeFromSiteIndex(raw: unknown, ids: string[]): unknown`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
    buildIndexPayload,
    parseSiteIndex,
    removeFromSiteIndex,
    resolveSiteAppearance,
    shouldWriteViewer
} from '../sharedSitePolicy';

const local = { colorPalette: 'electric-blue', axiTheme: 'glass' as const };

describe('parseSiteIndex', () => {
    it('accepts the legacy plain-array format', () => {
        expect(parseSiteIndex([{ id: 'a' }])).toEqual({
            entries: [{ id: 'a' }], colorPalette: null, axiTheme: null, generator: null
        });
    });
    it('reads appearance and generator from the object format', () => {
        const parsed = parseSiteIndex({
            colorPalette: 'ember', axiTheme: 'flat', generator: { app: 'axibridge', version: '3.21.0' }, entries: []
        });
        expect(parsed.colorPalette).toBe('ember');
        expect(parsed.axiTheme).toBe('flat');
        expect(parsed.generator).toEqual({ app: 'axibridge', version: '3.21.0' });
    });
    it('treats null / garbage as an empty site', () => {
        expect(parseSiteIndex(null).entries).toEqual([]);
        expect(parseSiteIndex('nope').entries).toEqual([]);
    });
});

describe('resolveSiteAppearance', () => {
    const site = parseSiteIndex({ colorPalette: 'ember', axiTheme: 'flat', entries: [] });
    it('admin publishes local appearance', () => {
        expect(resolveSiteAppearance({ isAdmin: true, local, site })).toEqual(local);
    });
    it('non-admin carries the site appearance', () => {
        expect(resolveSiteAppearance({ isAdmin: false, local, site })).toEqual({ colorPalette: 'ember', axiTheme: 'flat' });
    });
    it('non-admin falls back to local when the site has none', () => {
        expect(resolveSiteAppearance({ isAdmin: false, local, site: parseSiteIndex([]) })).toEqual(local);
        expect(resolveSiteAppearance({ isAdmin: false, local, site: null })).toEqual(local);
    });
});

describe('shouldWriteViewer', () => {
    const rec = (version: string) => ({ app: 'axibridge' as const, version });
    it('writes when nothing is recorded', () => expect(shouldWriteViewer('3.20.0', null)).toBe(true));
    it('writes when equal', () => expect(shouldWriteViewer('3.20.0', rec('3.20.0'))).toBe(true));
    it('writes when newer', () => expect(shouldWriteViewer('3.21.0', rec('3.20.9'))).toBe(true));
    it('skips when older', () => expect(shouldWriteViewer('3.19.4', rec('3.20.0'))).toBe(false));
    it('writes when either version is unparseable', () => {
        expect(shouldWriteViewer('dev', rec('3.20.0'))).toBe(true);
        expect(shouldWriteViewer('3.20.0', rec('x'))).toBe(true);
    });
});

describe('buildIndexPayload', () => {
    it('puts the new entry first, replaces a same-id entry, keeps others', () => {
        const site = parseSiteIndex({ entries: [{ id: 'b', publishedBy: 'kyra' }, { id: 'a', title: 'old' }] });
        const { payload, entries } = buildIndexPayload({
            entry: { id: 'a', title: 'new' }, site, appearance: local, generator: { app: 'axibridge', version: '3.20.0' }
        });
        expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
        expect(entries[0].title).toBe('new');
        expect(payload).toMatchObject({
            colorPalette: 'electric-blue', axiTheme: 'glass', glass: true, glassSurfaces: true,
            generator: { app: 'axibridge', version: '3.20.0' }
        });
    });
    it('omits generator when null', () => {
        const { payload } = buildIndexPayload({ entry: { id: 'a' }, site: parseSiteIndex([]), appearance: local, generator: null });
        expect('generator' in payload).toBe(false);
    });
});

describe('removeFromSiteIndex', () => {
    it('preserves every top-level field on the object format', () => {
        const out = removeFromSiteIndex({
            colorPalette: 'ember', axiTheme: 'flat', siteTheme: { x: 1 }, generator: { app: 'axibridge', version: '3.20.0' },
            entries: [{ id: 'a' }, { id: 'b' }]
        }, ['a']);
        expect(out).toEqual({
            colorPalette: 'ember', axiTheme: 'flat', siteTheme: { x: 1 }, generator: { app: 'axibridge', version: '3.20.0' },
            entries: [{ id: 'b' }]
        });
    });
    it('filters the legacy array format', () => {
        expect(removeFromSiteIndex([{ id: 'a' }, { id: 'b' }], ['b'])).toEqual([{ id: 'a' }]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/__tests__/sharedSitePolicy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/sharedSitePolicy.ts`**

```ts
/**
 * Rules for a GitHub Pages report site that more than one AxiBridge user
 * publishes to. Pure — the publish handlers feed these the repo's current
 * reports/index.json and act on the answer.
 */
import { asAxiTheme, type AxiTheme } from '../shared/webThemes';
import { compareVersion, parseVersion } from './versionUtils';

export interface SiteGenerator { app: 'axibridge'; version: string }

export interface ParsedSiteIndex {
    entries: any[];
    colorPalette: string | null;
    axiTheme: AxiTheme | null;
    generator: SiteGenerator | null;
}

export interface SiteAppearance { colorPalette: string; axiTheme: AxiTheme }

export const parseSiteIndex = (raw: unknown): ParsedSiteIndex => {
    if (Array.isArray(raw)) return { entries: raw, colorPalette: null, axiTheme: null, generator: null };
    const obj = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
    return {
        entries: Array.isArray(obj.entries) ? obj.entries : [],
        colorPalette: typeof obj.colorPalette === 'string' && obj.colorPalette ? obj.colorPalette : null,
        axiTheme: typeof obj.axiTheme === 'string' && obj.axiTheme ? asAxiTheme(obj.axiTheme) : null,
        generator: obj.generator && typeof obj.generator.version === 'string'
            ? { app: 'axibridge', version: obj.generator.version }
            : null
    };
};

/**
 * The site's look belongs to whoever administers the repo. Everyone else
 * publishes in the site's existing colours, so the site does not change
 * appearance depending on who published last.
 */
export const resolveSiteAppearance = (opts: {
    isAdmin: boolean;
    local: SiteAppearance;
    site: ParsedSiteIndex | null;
}): SiteAppearance => {
    if (opts.isAdmin || !opts.site) return opts.local;
    return {
        colorPalette: opts.site.colorPalette ?? opts.local.colorPalette,
        axiTheme: opts.site.axiTheme ?? opts.local.axiTheme
    };
};

/**
 * Whether this app may write the viewer bundle. An older AxiBridge must not
 * downgrade the viewer (and its stale-asset sweep would delete the newer
 * hashed assets). Unparseable versions write, matching pre-gate behaviour.
 */
export const shouldWriteViewer = (localVersion: string, recorded: SiteGenerator | null): boolean => {
    if (!recorded) return true;
    const local = parseVersion(localVersion);
    const site = parseVersion(recorded.version);
    if (!local || !site) return true;
    return compareVersion(local, site) >= 0;
};

export const buildIndexPayload = (opts: {
    entry: { id: string } & Record<string, any>;
    site: ParsedSiteIndex;
    appearance: SiteAppearance;
    generator: SiteGenerator | null;
}): { payload: Record<string, any>; entries: any[] } => {
    const entries = [opts.entry, ...opts.site.entries.filter((e) => e?.id !== opts.entry.id)];
    const glass = opts.appearance.axiTheme === 'glass';
    const payload: Record<string, any> = {
        colorPalette: opts.appearance.colorPalette,
        axiTheme: opts.appearance.axiTheme,
        glass,
        glassSurfaces: glass,
        ...(opts.generator ? { generator: opts.generator } : {}),
        entries
    };
    return { payload, entries };
};

/** Drop entries by id, keeping every other top-level field of the index. */
export const removeFromSiteIndex = (raw: unknown, ids: string[]): unknown => {
    const drop = new Set(ids);
    if (Array.isArray(raw)) return raw.filter((e) => !drop.has(e?.id));
    const obj = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
    const entries = Array.isArray(obj.entries) ? obj.entries : [];
    return { ...obj, entries: entries.filter((e: any) => !drop.has(e?.id)) };
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/__tests__/sharedSitePolicy.test.ts`
Expected: PASS. (If `asAxiTheme('flat')` does not return `'flat'`, check `src/shared/webThemes.ts` for the valid theme ids and use one it accepts in the test.)

- [ ] **Step 5: Commit**

```bash
git add src/main/sharedSitePolicy.ts src/main/__tests__/sharedSitePolicy.test.ts
git commit -m "feat: shared-site policy for index parsing, admin-owned appearance and viewer version gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `githubCommitLoop.ts` — rebuild-and-retry on ref conflicts

**Files:**
- Create: `src/main/githubCommitLoop.ts`
- Test: `src/main/__tests__/githubCommitLoop.test.ts`

**Interfaces:**
- Produces:
  - `interface CommitBase { headSha: string; treeSha: string; treeEntries: any[]; treeMap: Map<string, string> }`
  - `type CommitEntry = { path: string; sha: string | null }`
  - `class SiteBusyError extends Error`
  - `SITE_BUSY_MESSAGE: string`
  - `isRefConflict(err: unknown): boolean`
  - `toPushAccessError(err: unknown, owner: string, repo: string): unknown`
  - `commitWithRebase<T>(opts: CommitLoopOptions<T>): Promise<{ commitSha: string | null; result: T; attempts: number }>` where
    ```ts
    interface CommitLoopOptions<T> {
        readBase: () => Promise<CommitBase>;
        build: (base: CommitBase, attempt: number) => Promise<{ entries: CommitEntry[]; result: T }>;
        commit: (base: CommitBase, entries: CommitEntry[]) => Promise<string>;
        maxAttempts?: number;            // default 3
        sleep?: (ms: number) => Promise<void>;
        random?: () => number;
        onRetry?: (attempt: number) => void;
    }
    ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import {
    SITE_BUSY_MESSAGE,
    SiteBusyError,
    commitWithRebase,
    isRefConflict,
    toPushAccessError,
    type CommitBase
} from '../githubCommitLoop';

const conflict = () => Object.assign(new Error('GitHub API error (422) updating ref'), { status: 422 });
const base = (head: string): CommitBase => ({ headSha: head, treeSha: `t-${head}`, treeEntries: [], treeMap: new Map() });
const noSleep = async () => {};

describe('isRefConflict', () => {
    it('matches status or message', () => {
        expect(isRefConflict({ status: 422 })).toBe(true);
        expect(isRefConflict(new Error('GitHub API error (422) updating ref'))).toBe(true);
        expect(isRefConflict({ status: 500 })).toBe(false);
    });
});

describe('commitWithRebase', () => {
    it('commits once when there is no conflict', async () => {
        const build = vi.fn(async () => ({ entries: [{ path: 'a', sha: '1' }], result: 'r' }));
        const out = await commitWithRebase({
            readBase: async () => base('h0'), build, commit: async () => 'c1', sleep: noSleep
        });
        expect(out).toEqual({ commitSha: 'c1', result: 'r', attempts: 1 });
        expect(build).toHaveBeenCalledTimes(1);
    });

    it('returns a null sha without committing when nothing changed', async () => {
        const commit = vi.fn();
        const out = await commitWithRebase({
            readBase: async () => base('h0'),
            build: async () => ({ entries: [], result: null }),
            commit, sleep: noSleep
        });
        expect(out.commitSha).toBeNull();
        expect(commit).not.toHaveBeenCalled();
    });

    it('rebuilds against the new base after a 422', async () => {
        const heads = ['h0', 'h1'];
        const seen: string[] = [];
        let n = 0;
        const out = await commitWithRebase({
            readBase: async () => base(heads[n]),
            build: async (b, attempt) => { seen.push(`${attempt}:${b.headSha}`); return { entries: [{ path: 'x', sha: b.headSha }], result: null }; },
            commit: async () => { if (n++ === 0) throw conflict(); return 'c2'; },
            sleep: noSleep
        });
        expect(seen).toEqual(['1:h0', '2:h1']);
        expect(out).toMatchObject({ commitSha: 'c2', attempts: 2 });
    });

    it('gives up with SiteBusyError after 3 conflicts', async () => {
        const onRetry = vi.fn();
        await expect(commitWithRebase({
            readBase: async () => base('h'),
            build: async () => ({ entries: [{ path: 'x', sha: '1' }], result: null }),
            commit: async () => { throw conflict(); },
            sleep: noSleep, onRetry
        })).rejects.toThrow(SITE_BUSY_MESSAGE);
        expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-conflict errors', async () => {
        const commit = vi.fn(async () => { throw Object.assign(new Error('boom'), { status: 500 }); });
        await expect(commitWithRebase({
            readBase: async () => base('h'),
            build: async () => ({ entries: [{ path: 'x', sha: '1' }], result: null }),
            commit, sleep: noSleep
        })).rejects.toThrow('boom');
        expect(commit).toHaveBeenCalledTimes(1);
    });

    it('sleeps 250–1000ms between attempts', async () => {
        const sleep = vi.fn(async () => {});
        let n = 0;
        await commitWithRebase({
            readBase: async () => base('h'),
            build: async () => ({ entries: [{ path: 'x', sha: '1' }], result: null }),
            commit: async () => { if (n++ < 2) throw conflict(); return 'c'; },
            sleep, random: () => 0.5
        });
        expect(sleep).toHaveBeenCalledTimes(2);
        for (const [ms] of sleep.mock.calls as unknown as Array<[number]>) {
            expect(ms).toBeGreaterThanOrEqual(250);
            expect(ms).toBeLessThanOrEqual(1000);
        }
    });

    it('two racing publishers both survive in the shared index', async () => {
        // In-memory remote: a head counter and the index entries at that head.
        const remote = { head: 0, entries: [] as string[] };
        const publisher = (id: string, holdFirstBuild?: Promise<unknown>) => commitWithRebase({
            readBase: async () => ({
                headSha: String(remote.head), treeSha: 't', treeEntries: [],
                treeMap: new Map([['reports/index.json', JSON.stringify(remote.entries)]])
            }),
            build: async (b, attempt) => {
                const existing: string[] = JSON.parse(b.treeMap.get('reports/index.json')!);
                if (attempt === 1 && holdFirstBuild) await holdFirstBuild;
                return { entries: [{ path: 'reports/index.json', sha: JSON.stringify([id, ...existing.filter((e) => e !== id)]) }], result: null };
            },
            commit: async (b, entries) => {
                if (b.headSha !== String(remote.head)) throw conflict();
                remote.head += 1;
                remote.entries = JSON.parse(entries[0].sha!);
                return String(remote.head);
            },
            sleep: noSleep
        });
        let releaseA!: () => void;
        const aStarted = new Promise<void>((r) => { releaseA = r; });
        // B reads head 0, then waits while A publishes; B's commit then conflicts.
        const bDone = publisher('B', aStarted.then(() => aDone));
        const aDone = (async () => { await Promise.resolve(); return publisher('A'); })();
        releaseA();
        await Promise.all([aDone, bDone]);
        expect(remote.entries.sort()).toEqual(['A', 'B']);
    });
});

describe('toPushAccessError', () => {
    it('rewrites a 403 into the no-push message', () => {
        const err = toPushAccessError(Object.assign(new Error('GitHub API error (403) creating blob'), { status: 403 }), 'guild', 'reports') as Error;
        expect(err.message).toBe("You don't have push access to guild/reports. Ask the site admin to add you.");
    });
    it('passes other errors through untouched', () => {
        const original = new Error('boom');
        expect(toPushAccessError(original, 'a', 'b')).toBe(original);
        expect(new SiteBusyError()).toBeInstanceOf(Error);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/__tests__/githubCommitLoop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/githubCommitLoop.ts`**

```ts
/**
 * Commit to a branch other people also push to.
 *
 * A fast-forward-only ref update 422s when someone else moved the branch
 * after we read it. Re-parenting the same tree onto the new HEAD is NOT
 * enough: files we derived from the old HEAD (reports/index.json, the
 * rollup, attendance, the stale-asset sweep) would overwrite the other
 * publisher's additions. So every attempt re-reads the base and rebuilds
 * everything that depends on it.
 */

export interface CommitBase {
    headSha: string;
    treeSha: string;
    treeEntries: any[];
    treeMap: Map<string, string>;
}

export type CommitEntry = { path: string; sha: string | null };

export const SITE_BUSY_MESSAGE = 'The site was updated by someone else while publishing. Try again.';

export class SiteBusyError extends Error {
    constructor() {
        super(SITE_BUSY_MESSAGE);
        this.name = 'SiteBusyError';
    }
}

export const isRefConflict = (err: unknown): boolean => {
    const e = err as any;
    return Number(e?.status) === 422 || String(e?.message || '').includes('(422)');
};

/** A 403 from the git-data API means the token cannot push to this repo. */
export const toPushAccessError = (err: unknown, owner: string, repo: string): unknown => {
    const e = err as any;
    if (Number(e?.status) === 403 || String(e?.message || '').includes('(403)')) {
        return new Error(`You don't have push access to ${owner}/${repo}. Ask the site admin to add you.`);
    }
    return err;
};

export interface CommitLoopOptions<T> {
    readBase: () => Promise<CommitBase>;
    build: (base: CommitBase, attempt: number) => Promise<{ entries: CommitEntry[]; result: T }>;
    commit: (base: CommitBase, entries: CommitEntry[]) => Promise<string>;
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    onRetry?: (attempt: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const commitWithRebase = async <T>(
    opts: CommitLoopOptions<T>
): Promise<{ commitSha: string | null; result: T; attempts: number }> => {
    const maxAttempts = opts.maxAttempts ?? 3;
    const sleep = opts.sleep ?? defaultSleep;
    const random = opts.random ?? Math.random;
    for (let attempt = 1; ; attempt += 1) {
        const base = await opts.readBase();
        const { entries, result } = await opts.build(base, attempt);
        if (entries.length === 0) return { commitSha: null, result, attempts: attempt };
        try {
            const commitSha = await opts.commit(base, entries);
            return { commitSha, result, attempts: attempt };
        } catch (err) {
            if (!isRefConflict(err)) throw err;
            if (attempt >= maxAttempts) throw new SiteBusyError();
            opts.onRetry?.(attempt);
            await sleep(250 + Math.floor(random() * 750));
        }
    }
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/__tests__/githubCommitLoop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/githubCommitLoop.ts src/main/__tests__/githubCommitLoop.test.ts
git commit -m "feat: commit loop that rebuilds base-dependent files on a ref conflict

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Move `upload-web-report` onto the loop, with appearance/version gates and `publishedBy`

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (imports; new helpers after `withPagesPath` ~line 560; `upload-web-report` handler ~2060–2700 after Task 1's line shift)
- Test: `src/main/handlers/__tests__/sharedSiteIo.test.ts`

**Interfaces:**
- Consumes: Task 1 `getRepoPermissions`, `getViewerLogin`; Task 2 `parseSiteIndex`, `resolveSiteAppearance`, `shouldWriteViewer`, `buildIndexPayload`, `ParsedSiteIndex`; Task 3 `commitWithRebase`, `toPushAccessError`, `CommitBase`, `CommitEntry`.
- Produces (exported from `githubHandlers.ts` for tests and Task 5):
  - `readGitBase(owner: string, repo: string, branch: string, token: string): Promise<CommitBase>`
  - `makeGitCommitter(owner: string, repo: string, branch: string, token: string, message: string): (base: CommitBase, entries: CommitEntry[]) => Promise<string>`
  - `readSiteIndexRaw(owner: string, repo: string, token: string, treeMap: Map<string, string>, pagesPath: string): Promise<unknown | null>` — `null` when absent; **throws** when present but not valid JSON.

- [ ] **Step 1: Write the failing tests for the I/O helpers**

`src/main/handlers/__tests__/sharedSiteIo.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp', getVersion: () => '3.20.0' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { makeGitCommitter, readGitBase, readSiteIndexRaw } from '../githubHandlers';

describe('shared-site git helpers', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('readGitBase resolves head, tree and a blob-only path map', async () => {
        installHttpsMock((c: RecordedCall): MockResponse => {
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'h1' } } };
            if (c.path.endsWith('/git/commits/h1')) return { status: 200, body: { tree: { sha: 't1' } } };
            if (c.path.includes('/git/trees/t1')) return { status: 200, body: { tree: [
                { path: 'reports', type: 'tree', sha: 'd' },
                { path: 'reports/index.json', type: 'blob', sha: 'b1' }
            ] } };
            return { status: 404 };
        });
        const base = await readGitBase('o', 'r', 'main', 'tok');
        expect(base.headSha).toBe('h1');
        expect(base.treeSha).toBe('t1');
        expect([...base.treeMap.entries()]).toEqual([['reports/index.json', 'b1']]);
    });

    it('readSiteIndexRaw returns null when the index is absent', async () => {
        installHttpsMock(() => ({ status: 404 }));
        expect(await readSiteIndexRaw('o', 'r', 'tok', new Map(), '')).toBeNull();
    });

    it('readSiteIndexRaw throws on a corrupt index instead of treating it as empty', async () => {
        installHttpsMock(() => ({ status: 200, body: { content: Buffer.from('{not json').toString('base64'), encoding: 'base64' } }));
        await expect(readSiteIndexRaw('o', 'r', 'tok', new Map([['reports/index.json', 'b1']]), ''))
            .rejects.toThrow(/reports\/index\.json/);
    });

    it('makeGitCommitter parents on the base head and fast-forwards the ref', async () => {
        const calls = installHttpsMock((c) => {
            if (c.path.endsWith('/git/trees')) return { status: 201, body: { sha: 'nt' } };
            if (c.path.endsWith('/git/commits')) return { status: 201, body: { sha: 'nc' } };
            return { status: 200, body: {} };
        });
        const sha = await makeGitCommitter('o', 'r', 'main', 'tok', 'msg')(
            { headSha: 'h1', treeSha: 't1', treeEntries: [], treeMap: new Map() },
            [{ path: 'a', sha: 'x' }]
        );
        expect(sha).toBe('nc');
        expect(calls.find((c) => c.path.endsWith('/git/commits'))!.body).toMatchObject({ parents: ['h1'], tree: 'nt' });
        expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ sha: 'nc', force: false });
    });
});
```

Note: `getGithubBlobRaw` (used by `readSiteIndexRaw`) streams raw bytes with `Accept: application/vnd.github.raw`. Before writing the helper, read `getGithubBlobRaw` (~line 225 after Task 1). If it bypasses `githubApiRequest`, the mock above still intercepts `https.request` but the response body is the raw string — adjust the corrupt-index mock to `body` that serialises to invalid JSON for whichever reader you use. Simplest: implement `readSiteIndexRaw` with `getGithubBlob` (JSON, base64 `content`), which is what the mock above returns.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/handlers/__tests__/sharedSiteIo.test.ts`
Expected: FAIL — `readGitBase` is not exported.

- [ ] **Step 3: Add the helpers to `githubHandlers.ts`**

Add imports:

```ts
import { getRepoPermissions, getViewerLogin } from '../githubApi';
import {
    buildIndexPayload,
    parseSiteIndex,
    resolveSiteAppearance,
    shouldWriteViewer,
    type ParsedSiteIndex
} from '../sharedSitePolicy';
import {
    commitWithRebase,
    toPushAccessError,
    type CommitBase,
    type CommitEntry
} from '../githubCommitLoop';
```

After `withPagesPath`, add:

```ts
// ─── Shared-site commit helpers ───────────────────────────────────────────────

export const readGitBase = async (owner: string, repo: string, branch: string, token: string): Promise<CommitBase> => {
    const headRef = await getGithubRef(owner, repo, branch, token);
    const headSha = headRef?.object?.sha;
    if (!headSha) throw new Error('Unable to resolve repository branch head.');
    const headCommit = await getGithubCommit(owner, repo, headSha, token);
    const treeSha = headCommit?.tree?.sha;
    if (!treeSha) throw new Error('Unable to resolve repository tree.');
    const treeData = await getGithubTree(owner, repo, treeSha, token);
    const treeEntries = Array.isArray(treeData?.tree) ? treeData.tree : [];
    const treeMap = new Map<string, string>();
    treeEntries.forEach((entry: any) => {
        if (entry?.path && entry?.sha && entry?.type === 'blob') treeMap.set(entry.path, entry.sha);
    });
    return { headSha, treeSha, treeEntries, treeMap };
};

export const makeGitCommitter = (owner: string, repo: string, branch: string, token: string, message: string) =>
    async (base: CommitBase, entries: CommitEntry[]): Promise<string> => {
        const newTree = await createGithubTree(owner, repo, token, base.treeSha, entries);
        const newCommit = await createGithubCommit(owner, repo, token, message, newTree.sha, base.headSha);
        await updateGithubRef(owner, repo, branch, token, newCommit.sha);
        return String(newCommit.sha);
    };

/**
 * reports/index.json at the given base, via the blob API (no 1 MB limit).
 * A present-but-unreadable index THROWS: on a shared site, treating it as
 * empty would publish an index holding only this report and erase
 * everyone else's.
 */
export const readSiteIndexRaw = async (
    owner: string,
    repo: string,
    token: string,
    treeMap: Map<string, string>,
    pagesPath: string
): Promise<unknown | null> => {
    const indexPath = withPagesPath(pagesPath, 'reports/index.json');
    const sha = treeMap.get(indexPath);
    if (!sha) return null;
    const blob = await getGithubBlob(owner, repo, sha, token);
    try {
        return JSON.parse(Buffer.from(String(blob?.content || ''), 'base64').toString('utf8'));
    } catch {
        throw new Error(`Couldn't read ${indexPath} on ${owner}/${repo}; refusing to overwrite it.`);
    }
};
```

(`getGithubBlob` is defined above `withPagesPath`, so ordering is fine.)

- [ ] **Step 4: Run helper tests**

Run: `npx vitest run src/main/handlers/__tests__/sharedSiteIo.test.ts`
Expected: PASS.

- [ ] **Step 5: Resolve permissions and appearance before the report payload is built**

In `upload-web-report`, replace:

```ts
            const paletteValue = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const axiThemeValue = asAxiTheme(store.get('axiTheme', DEFAULT_AXI_THEME));
```

with:

```ts
            // A shared site's look belongs to its admin: everyone else publishes
            // in the colours already on the site (see resolveSiteAppearance).
            const permissions = await getRepoPermissions(owner, repo, token);
            let preflightSite: ParsedSiteIndex | null = null;
            if (!permissions.admin) {
                try {
                    const preflightBase = await readGitBase(owner, repo, branch, token);
                    preflightSite = parseSiteIndex(await readSiteIndexRaw(owner, repo, token, preflightBase.treeMap, pagesPath));
                } catch (err) {
                    log.warn('[Main] Could not read the site index for appearance (non-blocking):', err);
                }
            }
            const appearance = resolveSiteAppearance({
                isAdmin: permissions.admin,
                local: {
                    colorPalette: (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue',
                    axiTheme: asAxiTheme(store.get('axiTheme', DEFAULT_AXI_THEME))
                },
                site: preflightSite
            });
            const paletteValue = appearance.colorPalette;
            const axiThemeValue = appearance.axiTheme;
            const publishedBy = await getViewerLogin(token);
```

- [ ] **Step 6: Stamp `publishedBy` on the index entry**

In the `indexEntry` object literal, after `url: reportUrl,` add:

```ts
                ...(publishedBy ? { publishedBy } : {}),
```

- [ ] **Step 7: Replace the base-dependent section with the commit loop**

Delete everything from `let existingEntries: any[] = [];` (just after the `indexEntry` literal) through the end of the `catch` that performs the 422 retry (the block ending `publishedCommitSha = await publishCommit(retryBaseTreeSha, retryHeadSha);\n            }`). Replace it with the code below. Each `/* … */` marker names an existing block to paste **unchanged** from the deleted region, in the order shown — do not rewrite those blocks, only move them:

```ts
            const viewerVersion = app.getVersion();
            const reportFiles = collectFiles(stagingRoot);
            // Blob shas are content hashes, so a blob uploaded on attempt 1 can be
            // referenced again on attempt 2 without re-sending it.
            const uploadedBlobShas = new Set<string>();
            let viewerSkippedFor: string | null = null;

            sendWebUploadStatus('Uploading', 'Preparing upload bundle...', 55);
            let publishedCommitSha = '';
            try {
                const loop = await commitWithRebase({
                    readBase: () => readGitBase(owner, repo, branch, token),
                    onRetry: () => sendWebUploadStatus('Finalizing', 'Site changed while publishing — merging and retrying...', 92),
                    commit: makeGitCommitter(owner, repo, branch, token, `Update web report ${reportMeta.id}`),
                    build: async (base, attempt) => {
                        const { treeEntries, treeMap } = base;
                        const site = parseSiteIndex(await readSiteIndexRaw(owner, repo, token, treeMap, pagesPath));
                        const writeViewer = shouldWriteViewer(viewerVersion, site.generator);
                        viewerSkippedFor = writeViewer ? null : (site.generator?.version ?? null);
                        const { payload: indexPayload, entries: mergedEntries } = buildIndexPayload({
                            entry: indexEntry,
                            site,
                            appearance,
                            generator: writeViewer ? { app: 'axibridge', version: viewerVersion } : site.generator
                        });

                        let hasIndex = false;
                        let hasAssets = false;
                        treeMap.forEach((_sha, entryPath) => {
                            if (entryPath === withPagesPath(pagesPath, 'index.html')) hasIndex = true;
                            if (entryPath.startsWith(withPagesPath(pagesPath, 'assets/'))) hasAssets = true;
                        });
                        const needsBaseTemplate = !hasIndex || !hasAssets;

                        /* pendingEntries + queueFile — paste unchanged */

                        const publishedAssetPaths = new Set<string>();
                        if (writeViewer) {
                            if (needsBaseTemplate) {
                                sendWebUploadStatus('Preparing', 'Restoring base web files...', 50);
                            }
                            /* ensureWebRootIndex … rootFiles loop … rootIndexBuffer queue — paste unchanged,
                               minus the `const publishedAssetPaths = new Set<string>();` line (declared above) */
                        }
                        queueFile(withPagesPath(pagesPath, NOJEKYLL_FILENAME), NOJEKYLL_CONTENT);

                        for (const file of reportFiles) {
                            const repoPath = withPagesPath(pagesPath, `reports/${reportMeta.id}/${file.relPath}`);
                            queueFile(repoPath, fs.readFileSync(file.absPath));
                        }

                        const indexBuffer = Buffer.from(JSON.stringify(indexPayload, null, 2));
                        queueFile(withPagesPath(pagesPath, 'reports/index.json'), indexBuffer);

                        /* rollup try/catch — paste unchanged (it reads treeMap and mergedEntries) */
                        /* attendance try/catch — paste unchanged */

                        // Compaction downloads up to COMPACT_BUDGET_BYTES; a retry is about
                        // getting the publish in, so it skips this opportunistic work.
                        if (attempt === 1) {
                            /* compaction try/catch — paste unchanged */
                        }

                        const deleteEntries: Array<{ path: string; sha: null }> = [];
                        if (writeViewer) {
                            /* staleAssets sweep (selectStaleAssetPaths … log.info) — paste unchanged */
                        }
                        /* legacy theme.json / ui-theme.json delete loop — paste unchanged */
                        if (permissions.admin) {
                            /* logoPath block — paste unchanged */
                        }

                        if (pendingEntries.length === 0 && deleteEntries.length === 0) {
                            return { entries: [], result: null };
                        }

                        sendWebUploadStatus('Uploading', 'Uploading changes...', 75);
                        const blobEntries: CommitEntry[] = [];
                        for (const entry of pendingEntries) {
                            if (uploadedBlobShas.has(entry.blobSha)) {
                                blobEntries.push({ path: entry.path, sha: entry.blobSha });
                                continue;
                            }
                            const blob = await uploadBlobWithRetry(
                                () => createGithubBlob(owner, repo, token, entry.contentBase64, entry.path),
                                entry.path,
                                Math.floor(entry.contentBase64.length * 3 / 4)
                            );
                            uploadedBlobShas.add(String(blob.sha));
                            blobEntries.push({ path: entry.path, sha: blob.sha });
                        }
                        sendWebUploadStatus('Finalizing', 'Publishing commit...', 90);
                        return { entries: [...blobEntries, ...deleteEntries], result: null };
                    }
                });
                if (!loop.commitSha) {
                    const replayDataUrl = (builtReport.payload.stats as any)?.replayDataUrl as string | undefined;
                    sendWebUploadStatus('Complete', 'No changes to upload.', 100);
                    return { success: true, url: reportUrl, replayDataUrl: replayDataUrl ?? null };
                }
                publishedCommitSha = loop.commitSha;
            } catch (err) {
                throw toPushAccessError(err, owner, repo);
            }
            if (viewerSkippedFor) {
                sendWebUploadStatus(
                    'Warning',
                    `Site viewer is newer than your AxiBridge (v${viewerSkippedFor}). Update to change the viewer.`,
                    93
                );
            }
            const replayDataUrl = (builtReport.payload.stats as any)?.replayDataUrl as string | undefined;
```

Then delete the now-duplicate later `const replayDataUrl = …` line and the old `if (pendingEntries.length === 0 && deleteEntries.length === 0) { … }` early-return block if any remnants survived. The Pages-deploy watch (`void (async () => { … waitForPagesDeploy({ commitSha: publishedCommitSha …`) and the Discord post below stay exactly as they are.

The old `getGithubFile(...)` read of `reports/index.json` in this handler is gone — the index now always comes from the base tree, so merge base and commit parent are the same commit.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run validate`
Expected: exit 0. Fix any "declared but never read" errors for variables the paste left behind (e.g. an unused `treeEntries` in the build closure means compaction did not get pasted — re-check the paste list).

- [ ] **Step 9: Run the GitHub-related suites and the stats regression**

Run: `npx vitest run src/main` then `npm run test:regression:stats`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/main/handlers/__tests__/sharedSiteIo.test.ts
git commit -m "fix: concurrent publishes to one site no longer drop each other's reports

Rebuild index/rollup/attendance/asset sweep from the new HEAD on a ref
conflict; read the index from the base tree; admin-owned appearance and
logo; never downgrade the viewer; stamp publishedBy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Delete, template and logo handlers onto the loop + gates

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (`delete-github-reports`, `ensure-github-template`, `apply-github-logo`)
- Test: `src/main/handlers/__tests__/sharedSiteHandlers.test.ts`

**Interfaces:**
- Consumes: Task 4 `readGitBase`, `makeGitCommitter`, `readSiteIndexRaw`; Task 2 `removeFromSiteIndex`, `parseSiteIndex`, `shouldWriteViewer`; Task 3 `commitWithRebase`, `toPushAccessError`; Task 1 `getRepoPermissions`.
- Produces: `ensure-github-template` may now return `{ success: true, updated: false, skipped: 'viewer-newer' }`; `apply-github-logo` returns `{ success: false, error: 'Only a repo admin can change the site logo.' }` for non-admins.

- [ ] **Step 1: Write the failing tests**

`src/main/handlers/__tests__/sharedSiteHandlers.test.ts` — captures IPC handlers registered by `registerGithubHandlers`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) },
    app: { isPackaged: true, getPath: () => '/tmp', getAppPath: () => '/tmp', getVersion: () => '3.20.0' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
import { registerGithubHandlers } from '../githubHandlers';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');
const store = (values: Record<string, unknown>) => ({ get: (k: string, d?: unknown) => (k in values ? values[k] : d), set: vi.fn() });

beforeEach(() => {
    handlers.clear();
    vi.restoreAllMocks();
    resetGithubApiCaches();
    registerGithubHandlers({
        store: store({ githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubBranch: 'main', githubPagesSourcePath: '' }),
        getWindow: () => null
    });
});

describe('delete-github-reports on a shared site', () => {
    it('keeps the site appearance and retries on a conflict with a rebuilt index', async () => {
        let head = 0;
        // Index at head 0 has a,b; at head 1 someone added c.
        const indexAt = (h: number) => ({ colorPalette: 'ember', axiTheme: 'flat', entries: h === 0 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }, { id: 'a' }, { id: 'b' }] });
        const blobs: Record<string, unknown> = {};
        let blobN = 0;
        let refPatches = 0;
        installHttpsMock((c: RecordedCall) => {
            if (c.path.endsWith('/pages')) return { status: 200, body: { source: { path: '/' } } };
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: `h${head}` } } };
            if (/\/git\/commits\/h\d$/.test(c.path)) return { status: 200, body: { tree: { sha: `t${head}` } } };
            if (c.path.includes('/git/trees/t')) return { status: 200, body: { tree: [
                { path: 'reports/index.json', type: 'blob', sha: `idx${head}` },
                { path: 'reports/a/report.json', type: 'blob', sha: 'ra' }
            ] } };
            if (c.path.includes('/git/blobs/idx')) return { status: 200, body: { content: b64(indexAt(Number(c.path.slice(-1)))) } };
            if (c.method === 'POST' && c.path.endsWith('/git/blobs')) {
                const sha = `nb${blobN++}`;
                blobs[sha] = JSON.parse(Buffer.from((c.body as any).content, 'base64').toString('utf8'));
                return { status: 201, body: { sha } };
            }
            if (c.path.endsWith('/git/trees')) return { status: 201, body: { sha: 'nt' } };
            if (c.path.endsWith('/git/commits')) return { status: 201, body: { sha: 'nc' } };
            if (c.method === 'PATCH') {
                refPatches += 1;
                if (refPatches === 1) { head = 1; return { status: 422, body: { message: 'not a fast forward' } }; }
                return { status: 200, body: {} };
            }
            return { status: 404 };
        });
        const result = await handlers.get('delete-github-reports')!({}, { ids: ['a'] });
        expect(result).toEqual({ success: true, removed: ['a'] });
        const lastIndex = blobs[`nb${blobN - 1}`] as any;
        expect(lastIndex.entries.map((e: any) => e.id)).toEqual(['c', 'b']);
        expect(lastIndex.colorPalette).toBe('ember');
    });
});

describe('apply-github-logo', () => {
    it('refuses for a non-admin', async () => {
        installHttpsMock((c) => (c.path === '/repos/guild/site'
            ? { status: 200, body: { owner: { type: 'Organization' }, permissions: { admin: false, push: true } } }
            : { status: 404 }));
        const fs = await import('fs');
        vi.spyOn(fs.default, 'existsSync').mockReturnValue(true);
        const result = await handlers.get('apply-github-logo')!({}, { logoPath: '/x/logo.png' });
        expect(result).toEqual({ success: false, error: 'Only a repo admin can change the site logo.' });
    });
});

describe('ensure-github-template', () => {
    it('skips when the site viewer is newer than this app', async () => {
        installHttpsMock((c) => {
            if (c.path.endsWith('/pages')) return { status: 200, body: { source: { path: '/' } } };
            if (c.path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'h0' } } };
            if (c.path.endsWith('/git/commits/h0')) return { status: 200, body: { tree: { sha: 't0' } } };
            if (c.path.includes('/git/trees/t0')) return { status: 200, body: { tree: [{ path: 'reports/index.json', type: 'blob', sha: 'i' }] } };
            if (c.path.endsWith('/git/blobs/i')) return { status: 200, body: { content: b64({ generator: { app: 'axibridge', version: '9.0.0' }, entries: [] }) } };
            return { status: 404 };
        });
        const result = await handlers.get('ensure-github-template')!({});
        expect(result).toEqual({ success: true, updated: false, skipped: 'viewer-newer' });
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/handlers/__tests__/sharedSiteHandlers.test.ts`
Expected: FAIL — delete loses `c` / drops `colorPalette`; logo uploads; template returns `updated` without `skipped`.

- [ ] **Step 3: Rewrite `delete-github-reports` body after `pagesPrefix`**

Replace everything from `const headRef = await getGithubRef(...)` through `await updateGithubRef(owner, repo, branch, token, newCommit.sha);` with:

```ts
            const commitMessage = `Delete ${ids.length} report${ids.length === 1 ? '' : 's'}`;
            const writeJsonBlob = async (repoPath: string, value: unknown) => {
                const blob = await createGithubBlob(owner, repo, token, Buffer.from(JSON.stringify(value), 'utf8').toString('base64'), repoPath);
                return { path: repoPath, sha: String(blob.sha) };
            };
            try {
                await commitWithRebase({
                    readBase: () => readGitBase(owner, repo, branch, token),
                    commit: makeGitCommitter(owner, repo, branch, token, commitMessage),
                    build: async ({ treeEntries, treeMap }) => {
                        const commitEntries: CommitEntry[] = [];
                        treeEntries.forEach((entry: any) => {
                            if (!entry?.path || entry?.type !== 'blob') return;
                            if (ids.some((id) => entry.path.startsWith(`${pagesPrefix}reports/${id}/`))) {
                                commitEntries.push({ path: entry.path, sha: null });
                            }
                        });

                        const indexRepoPath = withPagesPath(pagesPath, 'reports/index.json');
                        const rawIndex = await readSiteIndexRaw(owner, repo, token, treeMap, pagesPath);
                        if (rawIndex !== null) {
                            const indexValue = removeFromSiteIndex(rawIndex, ids);
                            const blob = await createGithubBlob(owner, repo, token, Buffer.from(JSON.stringify(indexValue, null, 2)).toString('base64'), indexRepoPath);
                            commitEntries.push({ path: indexRepoPath, sha: String(blob.sha) });
                        }

                        // Keep the precomputed rollup consistent: drop sources for deleted reports.
                        try {
                            const rollupRepoPath = withPagesPath(pagesPath, 'reports/rollup.json');
                            const rollupSha = treeMap.get(rollupRepoPath);
                            if (rollupSha) {
                                const blob = await getGithubBlob(owner, repo, rollupSha, token);
                                const parsed = blob?.content
                                    ? parseRollupSourcesFile(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')))
                                    : null;
                                if (parsed) commitEntries.push(await writeJsonBlob(rollupRepoPath, removeRollupSources(parsed, ids)));
                            }
                        } catch (err) {
                            log.warn('[Main] Failed to update rollup.json after delete (non-blocking):', err);
                        }

                        // Keep the attendance history consistent: drop raids for deleted reports.
                        try {
                            const attendanceRepoPath = withPagesPath(pagesPath, 'reports/attendance.json');
                            const attendanceSha = treeMap.get(attendanceRepoPath);
                            if (attendanceSha) {
                                const blob = await getGithubBlob(owner, repo, attendanceSha, token);
                                const parsed = blob?.content
                                    ? parseAttendanceFile(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8')))
                                    : null;
                                if (parsed) {
                                    const deletedSet = new Set(ids.map((id: any) => String(id || '').trim()));
                                    const keptRaids = parsed.raids.filter((r) => !deletedSet.has(String(r.id).trim()));
                                    commitEntries.push(await writeJsonBlob(attendanceRepoPath, { ...parsed, raids: keptRaids }));
                                }
                            }
                        } catch (err) {
                            log.warn('[Main] Failed to update attendance.json after delete (non-blocking):', err);
                        }
                        return { entries: commitEntries, result: null };
                    }
                });
            } catch (err) {
                throw toPushAccessError(err, owner, repo);
            }
```

Add `removeFromSiteIndex` to the `../sharedSitePolicy` import.

- [ ] **Step 4: Gate `ensure-github-template`**

Replace from `const headRef = await getGithubRef(...)` through the `treeEntries.forEach(...)` block (which fills `treeMap`, `hasIndex`, `hasAssets`) with:

```ts
            const base = await readGitBase(owner, repo, branch, token);
            const site = parseSiteIndex(await readSiteIndexRaw(owner, repo, token, base.treeMap, pagesPath));
            if (!shouldWriteViewer(app.getVersion(), site.generator)) {
                return { success: true, updated: false, skipped: 'viewer-newer' };
            }
            const treeMap = base.treeMap;
            let hasIndex = false;
            let hasAssets = false;
            treeMap.forEach((_sha, entryPath) => {
                if (entryPath === `${pagesPrefix}index.html`) hasIndex = true;
                if (entryPath.startsWith(`${pagesPrefix}assets/`)) hasAssets = true;
            });
```

Then replace the final three lines (`createGithubTree` / `createGithubCommit` / `updateGithubRef` using `baseTreeSha`/`headSha`) with:

```ts
            await commitWithRebase({
                readBase: async () => base,
                build: async () => ({ entries: blobEntries, result: null }),
                commit: makeGitCommitter(owner, repo, branch, token, 'Add web template'),
                maxAttempts: 1
            });
```

(`maxAttempts: 1` because this commit only adds template files and is safe to simply re-run; a conflict surfaces as the busy error.)

- [ ] **Step 5: Gate `apply-github-logo`**

Right after the `if (!logoPath || !fs.existsSync(logoPath))` guard, add:

```ts
            const permissions = await getRepoPermissions(owner, repo, token);
            if (!permissions.admin) {
                return { success: false, error: 'Only a repo admin can change the site logo.' };
            }
```

Replace its `headRef … treeMap` block with `const base = await readGitBase(owner, repo, branch, token); const treeMap = base.treeMap;`, and its final tree/commit/ref lines with:

```ts
            await commitWithRebase({
                readBase: async () => base,
                build: async () => ({ entries: blobEntries, result: null }),
                commit: makeGitCommitter(owner, repo, branch, token, 'Update logo'),
                maxAttempts: 1
            });
```

- [ ] **Step 6: Run tests + validate**

Run: `npx vitest run src/main` then `npm run validate`
Expected: PASS / exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/main/handlers/__tests__/sharedSiteHandlers.test.ts
git commit -m "fix: deletes rebuild the index from the latest site state and keep its appearance; logo is admin-only; template never downgrades the viewer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Publishers + site-invite IPC (`githubPublishersHandlers.ts`)

**Files:**
- Create: `src/main/handlers/githubPublishersHandlers.ts`
- Modify: `src/main/index.ts:93` (import) and `~2138` (register after `registerGithubHandlers`)
- Modify: `src/preload/index.ts` (after `getGithubPagesBuildStatus`)
- Modify: `src/renderer/global.d.ts` (near `getGithubRepos`, ~line 489)
- Test: `src/main/handlers/__tests__/githubPublishersHandlers.test.ts`

**Interfaces:**
- Consumes: Task 1 `githubApiRequest`, `encodeGitPath`, `getRepoPermissions`, `getViewerLogin`, `invalidateRepoPermissions`.
- Produces (IPC channel → preload method → result):
  - `get-github-viewer-login` → `getGithubViewerLogin()` → `{ success: boolean; login?: string; error?: string }`
  - `get-repo-publishers` → `getRepoPublishers(payload?: { owner?: string; repo?: string })` → `{ success: boolean; canAdmin?: boolean; ownerType?: 'User' | 'Organization' | null; collaborators?: RepoCollaborator[]; invites?: RepoInvite[]; error?: string }`
  - `add-repo-publisher` → `addRepoPublisher({ owner?, repo?, username })` → `{ success: boolean; status?: 'invited' | 'already-has-access'; error?: string }`
  - `remove-repo-publisher` → `removeRepoPublisher({ owner?, repo?, username })` → `{ success: boolean; error?: string }`
  - `cancel-repo-invite` → `cancelRepoInvite({ owner?, repo?, invitationId: number })` → `{ success: boolean; error?: string }`
  - `get-pending-site-invites` → `getPendingSiteInvites(payload?: { force?: boolean })` → `{ success: boolean; invites?: SiteInvite[]; error?: string }`
  - `accept-site-invite` → `acceptSiteInvite({ invitationId: number })` → `{ success: boolean; target?: SiteJoinTarget; error?: string }`
  - `dismiss-site-invite` → `dismissSiteInvite({ invitationId: number })` → `{ success: boolean }`
  - Types: `RepoCollaborator { login: string; avatarUrl: string | null }`, `RepoInvite { id: number; login: string; avatarUrl: string | null; createdAt: string }`, `SiteInvite { id: number; owner: string; repo: string; fullName: string; inviter: string; createdAt: string; dismissed: boolean }`, `SiteJoinTarget { owner: string; repo: string; fullName: string; branch: string; pagesUrl: string; pagesSourcePath: string; madeDefault: boolean; favorites: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn((ch: string, fn: any) => handlers.set(ch, fn)) } }));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { installHttpsMock, type MockResponse, type RecordedCall } from '../../__tests__/githubHttpsMock';
import { resetGithubApiCaches } from '../../githubApi';
import { registerPublishersHandlers } from '../githubPublishersHandlers';

const makeStore = (values: Record<string, unknown>) => {
    const data: Record<string, unknown> = { ...values };
    return { get: (k: string, d?: unknown) => (k in data ? data[k] : d), set: vi.fn((k: string, v: unknown) => { data[k] = v; }), data };
};
const invoke = (ch: string, payload?: unknown) => handlers.get(ch)!({}, payload);
const ADMIN = { status: 200, body: { owner: { type: 'Organization' }, permissions: { admin: true, push: true } } };

let store: ReturnType<typeof makeStore>;
const setup = (values: Record<string, unknown>, responder: (c: RecordedCall) => MockResponse) => {
    handlers.clear();
    store = makeStore({ githubToken: 'tok', ...values });
    registerPublishersHandlers({ store });
    return installHttpsMock(responder);
};

beforeEach(() => { vi.restoreAllMocks(); resetGithubApiCaches(); });

describe('get-repo-publishers', () => {
    it('reports canAdmin=false without listing for a non-admin', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, () => ({ status: 200, body: { owner: { type: 'Organization' }, permissions: { push: true } } }));
        expect(await invoke('get-repo-publishers')).toEqual({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [], invites: [] });
        expect(calls).toHaveLength(1);
    });
    it('lists push collaborators and pending invites for an admin', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, (c) => {
            if (c.path === '/repos/guild/site') return ADMIN;
            if (c.path.startsWith('/repos/guild/site/collaborators')) return { status: 200, body: [
                { login: 'kyra', avatar_url: 'k.png', permissions: { push: true } },
                { login: 'reader', avatar_url: null, permissions: { push: false } }
            ] };
            if (c.path.startsWith('/repos/guild/site/invitations')) return { status: 200, body: [
                { id: 7, invitee: { login: 'newbie', avatar_url: 'n.png' }, created_at: '2026-10-01T00:00:00Z' }
            ] };
            return { status: 404 };
        });
        const res = await invoke('get-repo-publishers');
        expect(res.collaborators).toEqual([{ login: 'kyra', avatarUrl: 'k.png' }]);
        expect(res.invites).toEqual([{ id: 7, login: 'newbie', avatarUrl: 'n.png', createdAt: '2026-10-01T00:00:00Z' }]);
    });
});

describe('add-repo-publisher', () => {
    const base = (put: MockResponse) => (c: RecordedCall): MockResponse => {
        if (c.path === '/users/kyra') return { status: 200, body: { login: 'kyra' } };
        if (c.path === '/users/ghost') return { status: 404 };
        if (c.method === 'PUT') return put;
        return { status: 404 };
    };
    it('invites with push permission (201)', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 201, body: { id: 1 } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: true, status: 'invited' });
        expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/repos/guild/site/collaborators/kyra', body: { permission: 'push' } });
    });
    it('reports already-has-access (204)', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 204 }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: true, status: 'already-has-access' });
    });
    it('rejects an unknown user without sending an invite', async () => {
        const calls = setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 201 }));
        expect(await invoke('add-repo-publisher', { username: 'ghost' })).toEqual({ success: false, error: 'No GitHub user named ghost.' });
        expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    });
    it('surfaces GitHub\'s message on 403', async () => {
        setup({ githubRepoOwner: 'guild', githubRepoName: 'site' }, base({ status: 403, body: { message: 'Organization policy forbids outside collaborators' } }));
        expect(await invoke('add-repo-publisher', { username: 'kyra' })).toEqual({ success: false, error: 'Organization policy forbids outside collaborators' });
    });
});

describe('get-pending-site-invites', () => {
    const invitations = [
        { id: 1, created_at: '2026-10-02', inviter: { login: 'boss' }, repository: { name: 'site', owner: { login: 'guild' }, description: 'AxiBridge Reports', default_branch: 'main', private: true } },
        { id: 2, created_at: '2026-10-03', inviter: { login: 'boss' }, repository: { name: 'stats', owner: { login: 'guild' }, description: 'whatever', default_branch: 'main' } },
        { id: 3, created_at: '2026-10-01', inviter: { login: 'x' }, repository: { name: 'dotfiles', owner: { login: 'x' }, description: null, default_branch: 'main' } }
    ];
    const responder = (c: RecordedCall): MockResponse => {
        if (c.path.startsWith('/user/repository_invitations')) return { status: 200, body: invitations };
        if (c.path.startsWith('/repos/guild/stats/contents/reports/index.json')) return { status: 200, body: {} };
        return { status: 404 };
    };
    it('keeps a private repo by description alone, a repo with reports/index.json, and drops the rest', async () => {
        setup({}, responder);
        const res = await invoke('get-pending-site-invites');
        expect(res.invites.map((i: any) => i.fullName)).toEqual(['guild/stats', 'guild/site']);
    });
    it('flags dismissed invites and caches the list', async () => {
        const calls = setup({ dismissedSiteInvites: ['1'] }, responder);
        const res = await invoke('get-pending-site-invites');
        expect(res.invites.find((i: any) => i.id === 1).dismissed).toBe(true);
        const before = calls.length;
        await invoke('get-pending-site-invites');
        expect(calls.length).toBe(before);
        await invoke('get-pending-site-invites', { force: true });
        expect(calls.length).toBeGreaterThan(before);
    });
});

describe('accept-site-invite', () => {
    const invitations = [{ id: 1, created_at: '2026-10-02', inviter: { login: 'boss' }, repository: { name: 'site', owner: { login: 'guild' }, description: 'AxiBridge Reports', default_branch: 'gh-pages' } }];
    const responder = (patch: MockResponse) => (c: RecordedCall): MockResponse => {
        if (c.path.startsWith('/user/repository_invitations') && c.method === 'GET') return { status: 200, body: invitations };
        if (c.method === 'PATCH') return patch;
        if (c.path === '/repos/guild/site/pages') return { status: 200, body: { html_url: 'https://guild.github.io/site/', source: { path: '/docs' } } };
        return { status: 404 };
    };
    it('sets the default target when none is configured', async () => {
        setup({ githubFavoriteRepos: [] }, responder({ status: 204 }));
        const res = await invoke('accept-site-invite', { invitationId: 1 });
        expect(res.target).toEqual({
            owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'gh-pages',
            pagesUrl: 'https://guild.github.io/site/', pagesSourcePath: 'docs', madeDefault: true, favorites: ['guild/site']
        });
        expect(store.data.githubRepoOwner).toBe('guild');
        expect(store.data.githubBranch).toBe('gh-pages');
        expect(store.data.githubPagesSourcePath).toBe('docs');
    });
    it('only adds a favorite when a default exists, deduped', async () => {
        setup({ githubRepoOwner: 'me', githubRepoName: 'mine', githubFavoriteRepos: ['guild/site'] }, responder({ status: 204 }));
        const res = await invoke('accept-site-invite', { invitationId: 1 });
        expect(res.target.madeDefault).toBe(false);
        expect(store.data.githubFavoriteRepos).toEqual(['guild/site']);
        expect(store.data.githubRepoOwner).toBe('me');
    });
    it('reports an expired invite', async () => {
        setup({}, responder({ status: 404 }));
        expect(await invoke('accept-site-invite', { invitationId: 1 })).toEqual({ success: false, error: 'That invite is no longer valid.' });
    });
});

describe('dismiss-site-invite', () => {
    it('records the id once', async () => {
        setup({ dismissedSiteInvites: ['5'] }, () => ({ status: 404 }));
        await invoke('dismiss-site-invite', { invitationId: 5 });
        await invoke('dismiss-site-invite', { invitationId: 6 });
        expect(store.data.dismissedSiteInvites).toEqual(['5', '6']);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/handlers/__tests__/githubPublishersHandlers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/handlers/githubPublishersHandlers.ts`**

```ts
/**
 * Shared publishing: a site admin adds publishers by GitHub username, and
 * invitees join from AxiBridge. GitHub's collaborator/invitation API is the
 * only source of truth — removing a collaborator on GitHub revokes access
 * here too, and there is nothing of ours to keep in sync.
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import {
    encodeGitPath,
    getRepoPermissions,
    getViewerLogin,
    githubApiRequest,
    invalidateRepoPermissions
} from '../githubApi';

export interface RepoCollaborator { login: string; avatarUrl: string | null }
export interface RepoInvite { id: number; login: string; avatarUrl: string | null; createdAt: string }
export interface SiteInvite {
    id: number; owner: string; repo: string; fullName: string; inviter: string; createdAt: string; dismissed: boolean;
}
export interface SiteJoinTarget {
    owner: string; repo: string; fullName: string; branch: string;
    pagesUrl: string; pagesSourcePath: string; madeDefault: boolean; favorites: string[];
}

const SITE_DESCRIPTION = 'AxiBridge Reports';
const INVITE_CACHE_TTL_MS = 10 * 60_000;
const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const normalizePagesPath = (value: unknown) => String(value || '').trim().replace(/^\/+|\/+$/g, '');

/**
 * Before acceptance an invitee cannot read a PRIVATE repo, so the contents
 * probe 404s there; the description (set by create-github-repo) still admits
 * AxiBridge-created sites.
 */
const looksLikeAxibridgeSite = async (owner: string, repo: string, description: unknown, branch: string, token: string) => {
    if (typeof description === 'string' && description.trim() === SITE_DESCRIPTION) return true;
    for (const p of ['reports/index.json', 'docs/reports/index.json']) {
        const resp = await githubApiRequest(
            'GET',
            `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/contents/${p}?ref=${encodeURIComponent(branch)}`,
            token
        );
        if (resp.status === 200) return true;
    }
    return false;
};

export interface PublishersHandlerOptions { store: any }

export function registerPublishersHandlers({ store }: PublishersHandlerOptions) {
    let inviteCache: { token: string; at: number; invites: Array<SiteInvite & { branch: string }> } | null = null;

    const getToken = () => store.get('githubToken') as string | undefined;
    const resolveRepo = (payload?: { owner?: string; repo?: string }) => ({
        owner: (payload?.owner?.trim() || (store.get('githubRepoOwner') as string | undefined) || '').trim(),
        repo: (payload?.repo?.trim() || (store.get('githubRepoName') as string | undefined) || '').trim()
    });
    const dismissedIds = () => {
        const raw = store.get('dismissedSiteInvites', []);
        return Array.isArray(raw) ? raw.map(String) : [];
    };
    const repoPath = (owner: string, repo: string) => `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}`;

    const loadInvites = async (token: string, force: boolean) => {
        if (!force && inviteCache && inviteCache.token === token && Date.now() - inviteCache.at < INVITE_CACHE_TTL_MS) {
            return inviteCache.invites;
        }
        const resp = await githubApiRequest('GET', '/user/repository_invitations?per_page=100', token);
        if (resp.status >= 300) throw new Error(`GitHub API error (${resp.status}) loading invitations`);
        const out: Array<SiteInvite & { branch: string }> = [];
        for (const inv of Array.isArray(resp.data) ? resp.data : []) {
            const owner = inv?.repository?.owner?.login;
            const repo = inv?.repository?.name;
            if (typeof owner !== 'string' || typeof repo !== 'string' || typeof inv?.id !== 'number') continue;
            const branch = typeof inv.repository.default_branch === 'string' ? inv.repository.default_branch : 'main';
            try {
                if (!(await looksLikeAxibridgeSite(owner, repo, inv.repository.description, branch, token))) continue;
            } catch (err) {
                log.warn(`[Main] Could not inspect invited repo ${owner}/${repo}:`, err);
                continue;
            }
            out.push({
                id: inv.id, owner, repo, fullName: `${owner}/${repo}`, branch,
                inviter: typeof inv?.inviter?.login === 'string' ? inv.inviter.login : owner,
                createdAt: typeof inv.created_at === 'string' ? inv.created_at : '',
                dismissed: false
            });
        }
        out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        inviteCache = { token, at: Date.now(), invites: out };
        return out;
    };

    ipcMain.handle('get-github-viewer-login', async () => {
        const token = getToken();
        if (!token) return { success: false, error: 'GitHub not connected.' };
        const login = await getViewerLogin(token);
        return login ? { success: true, login } : { success: false, error: 'Unable to determine GitHub username.' };
    });

    ipcMain.handle('get-repo-publishers', async (_e, payload?: { owner?: string; repo?: string }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            if (!owner || !repo) return { success: false, error: 'Repository not configured.' };
            const perms = await getRepoPermissions(owner, repo, token);
            if (!perms.admin) {
                return { success: true, canAdmin: false, ownerType: perms.ownerType, collaborators: [], invites: [] };
            }
            const [collabResp, inviteResp] = await Promise.all([
                githubApiRequest('GET', `${repoPath(owner, repo)}/collaborators?affiliation=direct&per_page=100`, token),
                githubApiRequest('GET', `${repoPath(owner, repo)}/invitations?per_page=100`, token)
            ]);
            if (collabResp.status >= 300) throw new Error(`GitHub API error (${collabResp.status}) loading collaborators`);
            if (inviteResp.status >= 300) throw new Error(`GitHub API error (${inviteResp.status}) loading invitations`);
            const collaborators: RepoCollaborator[] = (Array.isArray(collabResp.data) ? collabResp.data : [])
                .filter((c: any) => typeof c?.login === 'string' && c?.permissions?.push === true)
                .map((c: any) => ({ login: c.login, avatarUrl: c.avatar_url ?? null }));
            const invites: RepoInvite[] = (Array.isArray(inviteResp.data) ? inviteResp.data : [])
                .filter((i: any) => typeof i?.id === 'number' && typeof i?.invitee?.login === 'string')
                .map((i: any) => ({ id: i.id, login: i.invitee.login, avatarUrl: i.invitee.avatar_url ?? null, createdAt: i.created_at ?? '' }));
            return { success: true, canAdmin: true, ownerType: perms.ownerType, collaborators, invites };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load publishers.' };
        }
    });

    ipcMain.handle('add-repo-publisher', async (_e, payload: { owner?: string; repo?: string; username: string }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            if (!owner || !repo) return { success: false, error: 'Repository not configured.' };
            const username = String(payload?.username || '').trim().replace(/^@/, '');
            if (!GITHUB_LOGIN_RE.test(username)) return { success: false, error: 'Enter a GitHub username.' };
            const user = await githubApiRequest('GET', `/users/${encodeGitPath(username)}`, token);
            if (user.status === 404) return { success: false, error: `No GitHub user named ${username}.` };
            if (user.status >= 300) throw new Error(`GitHub API error (${user.status}) looking up ${username}`);
            const resp = await githubApiRequest('PUT', `${repoPath(owner, repo)}/collaborators/${encodeGitPath(username)}`, token, { permission: 'push' });
            if (resp.status === 201) return { success: true, status: 'invited' };
            if (resp.status === 204) return { success: true, status: 'already-has-access' };
            return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) adding ${username}` };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to add publisher.' };
        }
    });

    ipcMain.handle('remove-repo-publisher', async (_e, payload: { owner?: string; repo?: string; username: string }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            const resp = await githubApiRequest('DELETE', `${repoPath(owner, repo)}/collaborators/${encodeGitPath(String(payload?.username || ''))}`, token);
            if (resp.status >= 300) return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) removing publisher` };
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to remove publisher.' };
        }
    });

    ipcMain.handle('cancel-repo-invite', async (_e, payload: { owner?: string; repo?: string; invitationId: number }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const { owner, repo } = resolveRepo(payload);
            const resp = await githubApiRequest('DELETE', `${repoPath(owner, repo)}/invitations/${Number(payload?.invitationId)}`, token);
            if (resp.status >= 300) return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) cancelling invite` };
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to cancel invite.' };
        }
    });

    ipcMain.handle('get-pending-site-invites', async (_e, payload?: { force?: boolean }) => {
        try {
            const token = getToken();
            if (!token) return { success: true, invites: [] };
            const dismissed = new Set(dismissedIds());
            const invites = (await loadInvites(token, !!payload?.force))
                .map(({ branch: _branch, ...invite }) => ({ ...invite, dismissed: dismissed.has(String(invite.id)) }));
            return { success: true, invites };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to load invites.' };
        }
    });

    ipcMain.handle('accept-site-invite', async (_e, payload: { invitationId: number }) => {
        try {
            const token = getToken();
            if (!token) return { success: false, error: 'GitHub not connected.' };
            const id = Number(payload?.invitationId);
            const invite = (await loadInvites(token, false)).find((i) => i.id === id)
                ?? (await loadInvites(token, true)).find((i) => i.id === id);
            if (!invite) return { success: false, error: 'That invite is no longer valid.' };
            const resp = await githubApiRequest('PATCH', `/user/repository_invitations/${id}`, token);
            inviteCache = null;
            if (resp.status === 404) return { success: false, error: 'That invite is no longer valid.' };
            if (resp.status >= 300) return { success: false, error: resp.data?.message || `GitHub API error (${resp.status}) accepting invite` };
            invalidateRepoPermissions(invite.owner, invite.repo);

            // GET only: a push collaborator cannot enable Pages, and the first
            // publish runs ensureGithubPages anyway.
            const pages = await githubApiRequest('GET', `${repoPath(invite.owner, invite.repo)}/pages`, token);
            const pagesUrl = pages.status === 200 && typeof pages.data?.html_url === 'string'
                ? pages.data.html_url
                : `https://${invite.owner}.github.io/${invite.repo}`;
            const pagesSourcePath = pages.status === 200 ? normalizePagesPath(pages.data?.source?.path) : '';

            const existing = store.get('githubFavoriteRepos', []);
            const favorites = Array.from(new Set([...(Array.isArray(existing) ? existing : []), invite.fullName]));
            store.set('githubFavoriteRepos', favorites);
            const madeDefault = !store.get('githubRepoOwner') || !store.get('githubRepoName');
            if (madeDefault) {
                store.set('githubRepoOwner', invite.owner);
                store.set('githubRepoName', invite.repo);
                store.set('githubBranch', invite.branch);
                store.set('githubPagesBaseUrl', pagesUrl);
                store.set('githubPagesSourcePath', pagesSourcePath);
            }
            const target: SiteJoinTarget = {
                owner: invite.owner, repo: invite.repo, fullName: invite.fullName, branch: invite.branch,
                pagesUrl, pagesSourcePath, madeDefault, favorites
            };
            return { success: true, target };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to join site.' };
        }
    });

    ipcMain.handle('dismiss-site-invite', async (_e, payload: { invitationId: number }) => {
        const ids = dismissedIds();
        const id = String(payload?.invitationId);
        if (!ids.includes(id)) store.set('dismissedSiteInvites', [...ids, id]);
        return { success: true };
    });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/handlers/__tests__/githubPublishersHandlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Register in main**

`src/main/index.ts` — add import next to line 93:

```ts
import { registerPublishersHandlers } from './handlers/githubPublishersHandlers';
```

and right after the `registerGithubHandlers({ … });` call (~line 2138):

```ts
        registerPublishersHandlers({ store });
```

- [ ] **Step 6: Preload**

In `src/preload/index.ts`, after the `getGithubPagesBuildStatus` line add:

```ts
    getGithubViewerLogin: () => ipcRenderer.invoke('get-github-viewer-login'),
    getRepoPublishers: (payload?: { owner?: string; repo?: string }) => ipcRenderer.invoke('get-repo-publishers', payload),
    addRepoPublisher: (payload: { owner?: string; repo?: string; username: string }) => ipcRenderer.invoke('add-repo-publisher', payload),
    removeRepoPublisher: (payload: { owner?: string; repo?: string; username: string }) => ipcRenderer.invoke('remove-repo-publisher', payload),
    cancelRepoInvite: (payload: { owner?: string; repo?: string; invitationId: number }) => ipcRenderer.invoke('cancel-repo-invite', payload),
    getPendingSiteInvites: (payload?: { force?: boolean }) => ipcRenderer.invoke('get-pending-site-invites', payload),
    acceptSiteInvite: (payload: { invitationId: number }) => ipcRenderer.invoke('accept-site-invite', payload),
    dismissSiteInvite: (payload: { invitationId: number }) => ipcRenderer.invoke('dismiss-site-invite', payload),
```

- [ ] **Step 7: Renderer types**

In `src/renderer/global.d.ts`, add these types at top level (beside other exported interfaces in the file's `declare global` block — follow how `IWebhook` etc. are declared there):

```ts
interface IRepoCollaborator { login: string; avatarUrl: string | null }
interface IRepoInvite { id: number; login: string; avatarUrl: string | null; createdAt: string }
interface ISiteInvite { id: number; owner: string; repo: string; fullName: string; inviter: string; createdAt: string; dismissed: boolean }
interface ISiteJoinTarget { owner: string; repo: string; fullName: string; branch: string; pagesUrl: string; pagesSourcePath: string; madeDefault: boolean; favorites: string[] }
```

and in the `electronAPI` interface next to `getGithubRepos`:

```ts
    getGithubViewerLogin: () => Promise<{ success: boolean; login?: string; error?: string }>;
    getRepoPublishers: (payload?: { owner?: string; repo?: string }) => Promise<{ success: boolean; canAdmin?: boolean; ownerType?: 'User' | 'Organization' | null; collaborators?: IRepoCollaborator[]; invites?: IRepoInvite[]; error?: string }>;
    addRepoPublisher: (payload: { owner?: string; repo?: string; username: string }) => Promise<{ success: boolean; status?: 'invited' | 'already-has-access'; error?: string }>;
    removeRepoPublisher: (payload: { owner?: string; repo?: string; username: string }) => Promise<{ success: boolean; error?: string }>;
    cancelRepoInvite: (payload: { owner?: string; repo?: string; invitationId: number }) => Promise<{ success: boolean; error?: string }>;
    getPendingSiteInvites: (payload?: { force?: boolean }) => Promise<{ success: boolean; invites?: ISiteInvite[]; error?: string }>;
    acceptSiteInvite: (payload: { invitationId: number }) => Promise<{ success: boolean; target?: ISiteJoinTarget; error?: string }>;
    dismissSiteInvite: (payload: { invitationId: number }) => Promise<{ success: boolean }>;
```

Also update the `ensureGithubTemplate` return type to include `skipped?: 'viewer-newer'`.

- [ ] **Step 8: Validate**

Run: `npm run validate`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/main/handlers/githubPublishersHandlers.ts src/main/handlers/__tests__/githubPublishersHandlers.test.ts src/main/index.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat: IPC for adding site publishers and joining invited sites

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settings — Publishers card, pending invites, logo gate

**Files:**
- Create: `src/renderer/settings/PublishersCard.tsx`
- Create: `src/renderer/settings/PendingSiteInvites.tsx`
- Modify: `src/renderer/SettingsView.tsx` (logo well ~2107; logo effect ~1306-1321; GitHub Pages section end ~2145)
- Test: `src/renderer/settings/__tests__/PublishersCard.test.tsx`, `src/renderer/settings/__tests__/PendingSiteInvites.test.tsx`

**Interfaces:**
- Consumes: Task 6 preload methods and `IRepoCollaborator`/`IRepoInvite`/`ISiteInvite`/`ISiteJoinTarget`.
- Produces:
  - `PublishersCard(props: { repoOwner: string; repoName: string; onAdminKnown?: (canAdmin: boolean) => void })`
  - `PendingSiteInvites(props: { onJoined: (target: ISiteJoinTarget) => void })`

- [ ] **Step 1: Write the failing tests**

`src/renderer/settings/__tests__/PublishersCard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishersCard } from '../PublishersCard';

const api: any = {};
beforeEach(() => {
    Object.assign(api, {
        getRepoPublishers: vi.fn(async () => ({ success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'kyra', avatarUrl: null }], invites: [{ id: 7, login: 'newbie', avatarUrl: null, createdAt: '2026-10-01T00:00:00Z' }] })),
        addRepoPublisher: vi.fn(async () => ({ success: true, status: 'invited' })),
        removeRepoPublisher: vi.fn(async () => ({ success: true })),
        cancelRepoInvite: vi.fn(async () => ({ success: true })),
        getGithubViewerLogin: vi.fn(async () => ({ success: true, login: 'boss' }))
    });
    (window as any).electronAPI = api;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PublishersCard', () => {
    it('lists publishers and pending invites for an admin', async () => {
        const onAdminKnown = vi.fn();
        render(<PublishersCard repoOwner="guild" repoName="site" onAdminKnown={onAdminKnown} />);
        expect(await screen.findByText('kyra')).toBeInTheDocument();
        expect(screen.getByText('newbie')).toBeInTheDocument();
        expect(onAdminKnown).toHaveBeenCalledWith(true);
    });

    it('explains and links to GitHub for a non-admin', async () => {
        api.getRepoPublishers.mockResolvedValueOnce({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [], invites: [] });
        const onAdminKnown = vi.fn();
        render(<PublishersCard repoOwner="guild" repoName="site" onAdminKnown={onAdminKnown} />);
        expect(await screen.findByText(/Only a repo admin can add publishers/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /manage access on GitHub/i })).toHaveAttribute('href', 'https://github.com/guild/site/settings/access');
        expect(onAdminKnown).toHaveBeenCalledWith(false);
    });

    it('invites a username and reloads', async () => {
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByPlaceholderText(/GitHub username/i), 'raider');
        await userEvent.click(screen.getByRole('button', { name: /^Add$/ }));
        expect(api.addRepoPublisher).toHaveBeenCalledWith({ owner: 'guild', repo: 'site', username: 'raider' });
        expect(await screen.findByText(/They'll see a Join prompt/i)).toBeInTheDocument();
        await waitFor(() => expect(api.getRepoPublishers).toHaveBeenCalledTimes(2));
    });

    it('says when the user already has access', async () => {
        api.addRepoPublisher.mockResolvedValueOnce({ success: true, status: 'already-has-access' });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        await userEvent.type(screen.getByPlaceholderText(/GitHub username/i), 'kyra');
        await userEvent.click(screen.getByRole('button', { name: /^Add$/ }));
        expect(await screen.findByText(/kyra already has access/i)).toBeInTheDocument();
    });

    it('does not offer Remove on the signed-in user', async () => {
        api.getRepoPublishers.mockResolvedValueOnce({ success: true, canAdmin: true, ownerType: 'User', collaborators: [{ login: 'boss', avatarUrl: null }, { login: 'kyra', avatarUrl: null }], invites: [] });
        render(<PublishersCard repoOwner="guild" repoName="site" />);
        await screen.findByText('kyra');
        expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(1);
    });
});
```

`src/renderer/settings/__tests__/PendingSiteInvites.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingSiteInvites } from '../PendingSiteInvites';

const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: false, favorites: ['guild/site'] };
beforeEach(() => {
    (window as any).electronAPI = {
        getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [{ id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: true }] })),
        acceptSiteInvite: vi.fn(async () => ({ success: true, target }))
    };
});

describe('PendingSiteInvites', () => {
    it('shows dismissed invites too and hands the joined target up', async () => {
        const onJoined = vi.fn();
        render(<PendingSiteInvites onJoined={onJoined} />);
        expect(await screen.findByText('guild/site')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /Join/ }));
        expect(onJoined).toHaveBeenCalledWith(target);
        expect(await screen.findByText(/You can now publish to guild\/site/i)).toBeInTheDocument();
    });

    it('renders nothing when there are no invites', async () => {
        (window as any).electronAPI.getPendingSiteInvites = vi.fn(async () => ({ success: true, invites: [] }));
        const { container } = render(<PendingSiteInvites onJoined={vi.fn()} />);
        await new Promise((r) => setTimeout(r, 0));
        expect(container).toBeEmptyDOMElement();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/settings/__tests__/PublishersCard.test.tsx src/renderer/settings/__tests__/PendingSiteInvites.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `PublishersCard.tsx`**

```tsx
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

type Props = { repoOwner: string; repoName: string; onAdminKnown?: (canAdmin: boolean) => void };

/**
 * Lets the site admin add other AxiBridge users as publishers. Access is a
 * plain GitHub collaborator invite with push permission; the invitee sees a
 * Join prompt in their own AxiBridge.
 */
export const PublishersCard = ({ repoOwner, repoName, onAdminKnown }: Props) => {
    const [loading, setLoading] = useState(true);
    const [canAdmin, setCanAdmin] = useState(false);
    const [ownerType, setOwnerType] = useState<'User' | 'Organization' | null>(null);
    const [collaborators, setCollaborators] = useState<IRepoCollaborator[]>([]);
    const [invites, setInvites] = useState<IRepoInvite[]>([]);
    const [viewer, setViewer] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.getRepoPublishers) return;
        setLoading(true);
        const res = await api.getRepoPublishers({ owner: repoOwner, repo: repoName });
        setLoading(false);
        if (!res?.success) {
            setMessage({ kind: 'error', text: res?.error || 'Failed to load publishers.' });
            return;
        }
        setCanAdmin(!!res.canAdmin);
        setOwnerType(res.ownerType ?? null);
        setCollaborators(res.collaborators ?? []);
        setInvites(res.invites ?? []);
        onAdminKnown?.(!!res.canAdmin);
    }, [repoOwner, repoName, onAdminKnown]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        void window.electronAPI?.getGithubViewerLogin?.().then((r) => setViewer(r?.success ? r.login ?? null : null));
    }, []);

    const handleAdd = async () => {
        const name = username.trim();
        if (!name) return;
        setBusy(true);
        setMessage(null);
        const res = await window.electronAPI.addRepoPublisher({ owner: repoOwner, repo: repoName, username: name });
        setBusy(false);
        if (!res?.success) {
            setMessage({ kind: 'error', text: res?.error || 'Failed to add publisher.' });
            return;
        }
        setUsername('');
        setMessage({
            kind: 'ok',
            text: res.status === 'already-has-access'
                ? `${name} already has access.`
                : `Invited ${name}. They'll see a Join prompt next time they open AxiBridge.`
        });
        await load();
    };

    const handleRemove = async (login: string) => {
        if (!window.confirm(`Remove ${login}'s access to ${repoOwner}/${repoName}?`)) return;
        const res = await window.electronAPI.removeRepoPublisher({ owner: repoOwner, repo: repoName, username: login });
        if (!res?.success) setMessage({ kind: 'error', text: res?.error || 'Failed to remove publisher.' });
        await load();
    };

    const handleCancel = async (invite: IRepoInvite) => {
        if (!window.confirm(`Cancel the invite for ${invite.login}?`)) return;
        const res = await window.electronAPI.cancelRepoInvite({ owner: repoOwner, repo: repoName, invitationId: invite.id });
        if (!res?.success) setMessage({ kind: 'error', text: res?.error || 'Failed to cancel invite.' });
        await load();
    };

    return (
        <div className="axi-well axi-well--sm mb-4" style={{ '--axi-well-pad': '16px' } as CSSProperties} data-testid="publishers-card">
            <div className="text-xs uppercase tracking-widest axi-ink-faint mb-3">Publishers</div>
            {loading && <div className="text-xs axi-ink-meta">Loading…</div>}
            {!loading && !canAdmin && (
                <p className="text-xs axi-ink-dim">
                    Only a repo admin can add publishers. Ask {repoOwner}, or{' '}
                    <a href={`https://github.com/${repoOwner}/${repoName}/settings/access`} target="_blank" rel="noreferrer" className="axi-ink-accent underline">
                        manage access on GitHub
                    </a>.
                </p>
            )}
            {!loading && canAdmin && (
                <>
                    <p className="text-xs axi-ink-dim mb-3">
                        Publishers can post their own raids to this site. They need a GitHub account and AxiBridge.
                    </p>
                    <div className="flex items-center gap-2 mb-3">
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                            placeholder="GitHub username"
                            className="axi-input flex-1 text-sm"
                        />
                        <button onClick={() => void handleAdd()} disabled={busy || !username.trim()} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">
                            Add
                        </button>
                    </div>
                    <ul className="space-y-1">
                        {collaborators.map((c) => (
                            <li key={c.login} className="flex items-center justify-between text-sm">
                                <span className="axi-ink-plain">{c.login}</span>
                                {viewer?.toLowerCase() !== c.login.toLowerCase() && (
                                    <button onClick={() => void handleRemove(c.login)} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Remove ${c.login}`}>
                                        Remove
                                    </button>
                                )}
                            </li>
                        ))}
                        {invites.map((i) => (
                            <li key={i.id} className="flex items-center justify-between text-sm">
                                <span><span className="axi-ink-plain">{i.login}</span> <span className="text-xs axi-ink-faint">invited</span></span>
                                <button onClick={() => void handleCancel(i)} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule" aria-label={`Cancel invite for ${i.login}`}>
                                    Cancel
                                </button>
                            </li>
                        ))}
                    </ul>
                    {ownerType === 'Organization' && (
                        <p className="mt-3 text-xs axi-ink-faint">Org members with access through teams aren't listed here.</p>
                    )}
                </>
            )}
            {message && (
                <div className={`mt-3 text-xs ${message.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>{message.text}</div>
            )}
        </div>
    );
};
```

Before finalizing class names, `grep -n "axi-input\|axi-ink-accent" src/renderer/*.css src/renderer/**/*.css` — if `axi-input` / `axi-ink-accent` don't exist, use the input/link classes the GitHub repo search box in `SettingsView.tsx` uses (search for `githubRepoSearch` and copy its `className`).

- [ ] **Step 4: Implement `PendingSiteInvites.tsx`**

```tsx
import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Every pending invite to an AxiBridge site — including ones dismissed from
 * the dashboard banner — so a dismissal is never a dead end.
 */
export const PendingSiteInvites = ({ onJoined }: { onJoined: (target: ISiteJoinTarget) => void }) => {
    const [invites, setInvites] = useState<ISiteInvite[]>([]);
    const [joiningId, setJoiningId] = useState<number | null>(null);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    useEffect(() => {
        void window.electronAPI?.getPendingSiteInvites?.({ force: true }).then((res) => {
            if (res?.success) setInvites(res.invites ?? []);
        });
    }, []);

    if (invites.length === 0 && !message) return null;

    const join = async (invite: ISiteInvite) => {
        setJoiningId(invite.id);
        const res = await window.electronAPI.acceptSiteInvite({ invitationId: invite.id });
        setJoiningId(null);
        setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        if (res?.success && res.target) {
            onJoined(res.target);
            setMessage({ kind: 'ok', text: `You can now publish to ${res.target.fullName}.` });
        } else {
            setMessage({ kind: 'error', text: res?.error || 'Failed to join site.' });
        }
    };

    return (
        <div className="axi-well axi-well--sm mb-4" style={{ '--axi-well-pad': '16px' } as CSSProperties} data-testid="pending-site-invites">
            <div className="text-xs uppercase tracking-widest axi-ink-faint mb-3">Site invites</div>
            <ul className="space-y-1">
                {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm">
                        <span><span className="axi-ink-plain">{i.fullName}</span> <span className="text-xs axi-ink-faint">from {i.inviter}</span></span>
                        <button onClick={() => void join(i)} disabled={joiningId === i.id} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">
                            Join
                        </button>
                    </li>
                ))}
            </ul>
            {message && <div className={`mt-3 text-xs ${message.kind === 'ok' ? 'axi-ink-ok' : 'axi-ink-danger'}`}>{message.text}</div>}
        </div>
    );
};
```

- [ ] **Step 5: Run component tests**

Run: `npx vitest run src/renderer/settings/__tests__/PublishersCard.test.tsx src/renderer/settings/__tests__/PendingSiteInvites.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire into `SettingsView.tsx`**

(a) Imports at top:

```tsx
import { PublishersCard } from './settings/PublishersCard';
import { PendingSiteInvites } from './settings/PendingSiteInvites';
```

(b) State next to `githubLogoPath`:

```tsx
    // null = unknown (not loaded / no repo). Only `false` gates the logo.
    const [siteCanAdmin, setSiteCanAdmin] = useState<boolean | null>(null);
    const handleAdminKnown = useCallback((canAdmin: boolean) => setSiteCanAdmin(canAdmin), []);
    const handleSiteJoined = useCallback((target: ISiteJoinTarget) => {
        // SettingsView saves its whole state, so a join must land here too or
        // the next save would revert it.
        setGithubFavoriteRepos(target.favorites);
        if (target.madeDefault) {
            setGithubRepoOwner(target.owner);
            setGithubRepoName(target.repo);
        }
    }, []);
```

(Add `useCallback` to the React import if missing.)

(c) Logo auto-sync effect (~1306): add as the first line inside the effect body `if (siteCanAdmin === false) return;`, and add `siteCanAdmin` to its dependency array.

(d) In the Logo well (~2107), directly under the "Logo" heading add:

```tsx
                            {siteCanAdmin === false && (
                                <p className="text-xs axi-ink-faint mb-3">
                                    Set by {githubRepoOwner}. The site's logo, colours and theme come from its admin; your reports publish in the site's look.
                                </p>
                            )}
```

and add `disabled={siteCanAdmin === false}` to both the Choose/Replace and Remove buttons.

(e) Just before the Logo well, add:

```tsx
                        <PendingSiteInvites onJoined={handleSiteJoined} />
                        {githubRepoOwner && githubRepoName && githubAuthStatus === 'connected' && (
                            <PublishersCard repoOwner={githubRepoOwner} repoName={githubRepoName} onAdminKnown={handleAdminKnown} />
                        )}
```

(If `githubAuthStatus` is not `'connected'` once a token is loaded, use whatever condition the repo picker in this section uses to decide GitHub is connected — search for where `getGithubRepos` is called.)

- [ ] **Step 7: Add a SettingsView regression test for review-focus items 4 and 5**

Find the existing SettingsView test harness: `ls src/renderer/__tests__ | grep -i settings`. In a new test file `src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx`, reuse that harness's `electronAPI` mock + render helper (copy its setup block verbatim) and add:

```tsx
it('does not sync the logo for a non-admin', async () => {
    api.getSettings = vi.fn(async () => ({ ...baseSettings, githubToken: 'tok', githubRepoOwner: 'guild', githubRepoName: 'site', githubLogoPath: '/x/logo.png' }));
    api.getRepoPublishers = vi.fn(async () => ({ success: true, canAdmin: false, ownerType: 'Organization', collaborators: [], invites: [] }));
    api.getPendingSiteInvites = vi.fn(async () => ({ success: true, invites: [] }));
    api.getGithubViewerLogin = vi.fn(async () => ({ success: true, login: 'me' }));
    api.applyGithubLogo = vi.fn(async () => ({ success: true }));
    renderSettings();
    expect(await screen.findByText(/Set by guild/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(api.applyGithubLogo).not.toHaveBeenCalled();
});

it('keeps a joined site in favorites on the next save', async () => {
    api.getPendingSiteInvites = vi.fn(async () => ({ success: true, invites: [{ id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: false }] }));
    api.acceptSiteInvite = vi.fn(async () => ({ success: true, target: { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: false, favorites: ['guild/site'] } }));
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Join' }));
    await waitFor(() => {
        const saved = api.saveSettings.mock.calls.at(-1)?.[0];
        expect(saved?.githubFavoriteRepos).toContain('guild/site');
    });
});
```

`baseSettings`, `renderSettings`, and `api` are names for whatever the existing harness calls them — rename to match. If SettingsView only saves on an explicit action, trigger that action (click the Save control the harness uses) before the `waitFor`.

- [ ] **Step 8: Run renderer tests + validate**

Run: `npx vitest run src/renderer/settings src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx` then `npm run validate`
Expected: PASS / exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/settings/PublishersCard.tsx src/renderer/settings/PendingSiteInvites.tsx src/renderer/settings/__tests__ src/renderer/SettingsView.tsx src/renderer/__tests__/SettingsView.sharedPublishing.test.tsx
git commit -m "feat: publishers card and site invites in GitHub Pages settings; logo is admin-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Dashboard join banner

**Files:**
- Create: `src/renderer/app/SiteInviteBanner.tsx`
- Create: `src/renderer/app/hooks/useSiteInvites.ts`
- Modify: `src/renderer/App.tsx:1101` (render above `CrashRecoveryBanner`)
- Test: `src/renderer/app/__tests__/SiteInviteBanner.test.tsx`

**Interfaces:**
- Consumes: Task 6 `getPendingSiteInvites`, `acceptSiteInvite`, `dismissSiteInvite`, `ISiteInvite`, `ISiteJoinTarget`.
- Produces:
  - `SiteInviteBanner(props: { invites: ISiteInvite[]; joined: ISiteJoinTarget | null; error: string | null; onJoin: (id: number) => void; onDismiss: (id: number) => void; onClose: () => void })`
  - `useSiteInvites(): { invites: ISiteInvite[]; joined: ISiteJoinTarget | null; error: string | null; join: (id: number) => Promise<void>; dismiss: (id: number) => Promise<void>; clear: () => void }`

- [ ] **Step 1: Write the failing tests**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SiteInviteBanner } from '../SiteInviteBanner';
import { useSiteInvites } from '../hooks/useSiteInvites';

const invite = { id: 1, owner: 'guild', repo: 'site', fullName: 'guild/site', inviter: 'boss', createdAt: '', dismissed: false };
const target = { owner: 'guild', repo: 'site', fullName: 'guild/site', branch: 'main', pagesUrl: 'u', pagesSourcePath: '', madeDefault: true, favorites: ['guild/site'] };
const noop = () => {};

describe('SiteInviteBanner', () => {
    it('renders nothing with no invites and nothing joined', () => {
        const { container } = render(<SiteInviteBanner invites={[]} joined={null} error={null} onJoin={noop} onDismiss={noop} onClose={noop} />);
        expect(container).toBeEmptyDOMElement();
    });
    it('names the inviter and repo, and wires Join/Dismiss', async () => {
        const onJoin = vi.fn();
        const onDismiss = vi.fn();
        render(<SiteInviteBanner invites={[invite]} joined={null} error={null} onJoin={onJoin} onDismiss={onDismiss} onClose={noop} />);
        expect(screen.getByText(/boss invited you to publish to/i)).toBeInTheDocument();
        expect(screen.getByText('guild/site')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Join' }));
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(onJoin).toHaveBeenCalledWith(1);
        expect(onDismiss).toHaveBeenCalledWith(1);
    });
    it('confirms a join', () => {
        render(<SiteInviteBanner invites={[]} joined={target} error={null} onJoin={noop} onDismiss={noop} onClose={noop} />);
        expect(screen.getByText(/You can now publish to guild\/site/i)).toBeInTheDocument();
    });
});

describe('useSiteInvites', () => {
    beforeEach(() => {
        (window as any).electronAPI = {
            getPendingSiteInvites: vi.fn(async () => ({ success: true, invites: [invite, { ...invite, id: 2, dismissed: true }] })),
            acceptSiteInvite: vi.fn(async () => ({ success: true, target })),
            dismissSiteInvite: vi.fn(async () => ({ success: true }))
        };
    });
    it('hides dismissed invites', async () => {
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites.map((i) => i.id)).toEqual([1]));
    });
    it('join removes the invite and exposes the target', async () => {
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.join(1));
        expect(result.current.invites).toHaveLength(0);
        expect(result.current.joined).toEqual(target);
    });
    it('a failed join surfaces the error and drops a dead invite', async () => {
        (window as any).electronAPI.acceptSiteInvite = vi.fn(async () => ({ success: false, error: 'That invite is no longer valid.' }));
        const { result } = renderHook(() => useSiteInvites());
        await waitFor(() => expect(result.current.invites).toHaveLength(1));
        await act(() => result.current.join(1));
        expect(result.current.error).toBe('That invite is no longer valid.');
        expect(result.current.invites).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/app/__tests__/SiteInviteBanner.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the hook**

`src/renderer/app/hooks/useSiteInvites.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

/** Pending invites to AxiBridge sites, minus ones dismissed from the banner. */
export const useSiteInvites = () => {
    const [invites, setInvites] = useState<ISiteInvite[]>([]);
    const [joined, setJoined] = useState<ISiteJoinTarget | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void window.electronAPI?.getPendingSiteInvites?.().then((res) => {
            if (!cancelled && res?.success) setInvites((res.invites ?? []).filter((i) => !i.dismissed));
        });
        return () => { cancelled = true; };
    }, []);

    const join = useCallback(async (id: number) => {
        setError(null);
        const res = await window.electronAPI.acceptSiteInvite({ invitationId: id });
        setInvites((prev) => prev.filter((i) => i.id !== id));
        if (res?.success && res.target) setJoined(res.target);
        else setError(res?.error || 'Failed to join site.');
    }, []);

    const dismiss = useCallback(async (id: number) => {
        setInvites((prev) => prev.filter((i) => i.id !== id));
        await window.electronAPI.dismissSiteInvite({ invitationId: id });
    }, []);

    const clear = useCallback(() => { setJoined(null); setError(null); }, []);

    return { invites, joined, error, join, dismiss, clear };
};
```

- [ ] **Step 4: Implement the banner**

`src/renderer/app/SiteInviteBanner.tsx` (styled like `CrashRecoveryBanner`):

```tsx
import { UserPlus } from 'lucide-react';

type Props = {
    invites: ISiteInvite[];
    joined: ISiteJoinTarget | null;
    error: string | null;
    onJoin: (id: number) => void;
    onDismiss: (id: number) => void;
    onClose: () => void;
};

/**
 * "{inviter} invited you to publish to {owner/repo}" — the invitee's half of
 * shared publishing. Join accepts the GitHub invite and adds the site as a
 * publish target; Dismiss only hides it here (Settings still lists it).
 */
export const SiteInviteBanner = ({ invites, joined, error, onJoin, onDismiss, onClose }: Props) => {
    if (invites.length === 0 && !joined && !error) return null;
    return (
        <div className="mb-3 axi-well axi-well--sm flex items-start gap-3" data-testid="site-invite-banner">
            <UserPlus className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--axi-accent)' }} />
            <div className="flex-1 space-y-2">
                {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-3">
                        <p className="text-[11px]" style={{ color: 'var(--axi-text)' }}>
                            {invite.inviter} invited you to publish to <span className="font-semibold">{invite.fullName}</span>
                        </p>
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => onJoin(invite.id)} className="axi-btn axi-btn--sm axi-ink-plain axi-edge-rule">Join</button>
                            <button onClick={() => onDismiss(invite.id)} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">Dismiss</button>
                        </div>
                    </div>
                ))}
                {joined && (
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] axi-ink-ok">
                            You can now publish to {joined.fullName}.{joined.madeDefault ? ' It is your default site.' : ' Pick it from the publish menu.'}
                        </p>
                        <button onClick={onClose} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">OK</button>
                    </div>
                )}
                {error && (
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] axi-ink-danger">{error}</p>
                        <button onClick={onClose} className="axi-btn axi-btn--sm axi-ink-dim axi-edge-rule">OK</button>
                    </div>
                )}
            </div>
        </div>
    );
};
```

- [ ] **Step 5: Mount in `App.tsx`**

Imports:

```tsx
import { SiteInviteBanner } from './app/SiteInviteBanner';
import { useSiteInvites } from './app/hooks/useSiteInvites';
```

Inside the component near other hooks: `const siteInvites = useSiteInvites();`

Directly above `<CrashRecoveryBanner`:

```tsx
            <SiteInviteBanner
                invites={siteInvites.invites}
                joined={siteInvites.joined}
                error={siteInvites.error}
                onJoin={(id) => void siteInvites.join(id)}
                onDismiss={(id) => void siteInvites.dismiss(id)}
                onClose={siteInvites.clear}
            />
```

- [ ] **Step 6: Run tests + validate**

Run: `npx vitest run src/renderer/app` then `npm run validate`
Expected: PASS / exit 0. If an existing App-level test mocks `window.electronAPI` without `getPendingSiteInvites`, the hook's optional chaining keeps it quiet; if a test asserts on an exact list of IPC calls, add the new call to its expectation.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/app/SiteInviteBanner.tsx src/renderer/app/hooks/useSiteInvites.ts src/renderer/app/__tests__/SiteInviteBanner.test.tsx src/renderer/App.tsx
git commit -m "feat: dashboard banner to join a site you were invited to publish to

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: "Published by" display and delete confirmation

**Files:**
- Modify: `src/shared/reportTypes.ts:25-40` (`publishedBy?: string | null`)
- Create: `src/shared/publishedBy.ts`
- Modify: `src/renderer/FightReportHistoryView.tsx` (row ~725; `handleDeleteSelected` ~349; `handleDeleteOne` ~380)
- Modify: `src/renderer/SettingsView.tsx` (`handleDeleteSelectedReports` ~1168)
- Modify: `src/web/reportApp.tsx` (~2558)
- Test: `src/shared/__tests__/publishedBy.test.ts`

**Interfaces:**
- Consumes: Task 6 `getGithubViewerLogin`.
- Produces:
  - `othersPublishedBy(entries: Array<{ publishedBy?: string | null } | null | undefined>, viewerLogin: string | null): { count: number; logins: string[] }`
  - `buildDeleteConfirmText(base: string, entries: Array<{ publishedBy?: string | null } | null | undefined>, viewerLogin: string | null): string`

- [ ] **Step 1: Write the failing tests**

`src/shared/__tests__/publishedBy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDeleteConfirmText, othersPublishedBy } from '../publishedBy';

describe('othersPublishedBy', () => {
    it('ignores own (case-insensitive) and legacy entries', () => {
        expect(othersPublishedBy([{ publishedBy: 'Me' }, {}, { publishedBy: null }], 'me')).toEqual({ count: 0, logins: [] });
    });
    it('counts others and lists each login once', () => {
        expect(othersPublishedBy([{ publishedBy: 'kyra' }, { publishedBy: 'kyra' }, { publishedBy: 'zed' }, { publishedBy: 'me' }], 'me'))
            .toEqual({ count: 3, logins: ['kyra', 'zed'] });
    });
    it('treats every attributed entry as someone else when the viewer is unknown', () => {
        expect(othersPublishedBy([{ publishedBy: 'me' }], null)).toEqual({ count: 1, logins: ['me'] });
    });
});

describe('buildDeleteConfirmText', () => {
    it('returns the base text when nothing belongs to others', () => {
        expect(buildDeleteConfirmText('Delete 1 report?', [{ publishedBy: 'me' }], 'me')).toBe('Delete 1 report?');
    });
    it('appends who else published', () => {
        expect(buildDeleteConfirmText('Delete 3 reports?', [{ publishedBy: 'kyra' }, { publishedBy: 'kyra' }, {}], 'me'))
            .toBe('Delete 3 reports?\n\n2 of these were published by kyra. Delete anyway?');
        expect(buildDeleteConfirmText('Delete "X"?', [{ publishedBy: 'kyra' }], 'me'))
            .toBe('Delete "X"?\n\nThis was published by kyra. Delete anyway?');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/shared/__tests__/publishedBy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/shared/publishedBy.ts`**

```ts
type Attributed = { publishedBy?: string | null } | null | undefined;

/**
 * Reports in `entries` published by someone other than the viewer. Entries
 * from before publishedBy existed are not counted. An unknown viewer counts
 * every attributed entry — over-warning beats a silent delete.
 */
export const othersPublishedBy = (entries: Attributed[], viewerLogin: string | null) => {
    const viewer = viewerLogin?.trim().toLowerCase() || null;
    const logins: string[] = [];
    let count = 0;
    for (const entry of entries) {
        const by = typeof entry?.publishedBy === 'string' ? entry.publishedBy.trim() : '';
        if (!by) continue;
        if (viewer && by.toLowerCase() === viewer) continue;
        count += 1;
        if (!logins.includes(by)) logins.push(by);
    }
    return { count, logins };
};

/**
 * A push collaborator can delete any file, so this is a confirmation, not
 * enforcement.
 */
export const buildDeleteConfirmText = (base: string, entries: Attributed[], viewerLogin: string | null) => {
    const { count, logins } = othersPublishedBy(entries, viewerLogin);
    if (count === 0) return base;
    const who = logins.join(', ');
    const lead = entries.length === 1 ? 'This was' : `${count} of these ${count === 1 ? 'was' : 'were'}`;
    return `${base}\n\n${lead} published by ${who}. Delete anyway?`;
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/shared/__tests__/publishedBy.test.ts`
Expected: PASS.

- [ ] **Step 5: Type + display**

`src/shared/reportTypes.ts` — in `ReportIndexEntry` after `url: string;` add `publishedBy?: string | null;`.

`src/renderer/FightReportHistoryView.tsx` — after the commanders block (~line 725-729) add:

```tsx
                                    {entry.publishedBy && (
                                        <div className="text-[10px] mt-1" style={{ color: 'var(--axi-text-faint)' }}>
                                            by {entry.publishedBy}
                                        </div>
                                    )}
```

`src/web/reportApp.tsx` — inside the commanders `<span className="truncate">` row (~2558), after the commanders text:

```tsx
                                                    {(entry as any).publishedBy && (
                                                        <span className="axi-ink-faint"> · by {(entry as any).publishedBy}</span>
                                                    )}
```

- [ ] **Step 6: Delete confirmations**

`FightReportHistoryView.tsx`: add import `import { buildDeleteConfirmText } from '../shared/publishedBy';`, a state + effect near the other state:

```tsx
    const [viewerLogin, setViewerLogin] = useState<string | null>(null);
    useEffect(() => {
        void window.electronAPI?.getGithubViewerLogin?.().then((r) => setViewerLogin(r?.success ? r.login ?? null : null));
    }, []);
```

In `handleDeleteSelected`, replace the `window.confirm(...)` argument with:

```tsx
            buildDeleteConfirmText(
                `Delete ${ids.length} report${ids.length === 1 ? '' : 's'} from GitHub? This cannot be undone.`,
                indexEntries.filter((e) => selectedForDelete.has(e.id)),
                viewerLogin
            )
```

In `handleDeleteOne`:

```tsx
            buildDeleteConfirmText(`Delete "${entry.title}" from GitHub? This cannot be undone.`, [entry], viewerLogin)
```

`SettingsView.tsx` `handleDeleteSelectedReports`: import `buildDeleteConfirmText` from `'../shared/publishedBy'`, fetch the login inline before confirming, and replace the confirm call:

```tsx
        const viewer = await window.electronAPI.getGithubViewerLogin?.().then((r) => (r?.success ? r.login ?? null : null)).catch(() => null);
        const confirmed = window.confirm(buildDeleteConfirmText(
            `Delete ${ids.length} report${ids.length === 1 ? '' : 's'} from GitHub Pages? This cannot be undone.`,
            githubReports.filter((report) => ids.includes(report?.id)),
            viewer ?? null
        ));
```

- [ ] **Step 7: Run the touched suites + validate**

Run: `npx vitest run src/shared src/renderer/__tests__ src/web/__tests__` then `npm run validate`
Expected: PASS / exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/shared/publishedBy.ts src/shared/__tests__/publishedBy.test.ts src/shared/reportTypes.ts src/renderer/FightReportHistoryView.tsx src/renderer/SettingsView.tsx src/web/reportApp.tsx
git commit -m "feat: show who published each report and confirm before deleting someone else's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification

- [ ] **Step 1: Whole suite + validate + web build**

Run, in order, foreground:
- `npm run validate`
- `npm run test:unit`
- `npm run test:regression:stats`
- `npm run build:web`

Expected: all exit 0. Paste any failure verbatim into the task report; do not mark complete with failures.

- [ ] **Step 2: Manual end-to-end checklist (record results in the PR description)**

With two GitHub accounts (A = admin, B = publisher) and a scratch repo created from AxiBridge by A:
1. A: Settings → GitHub Pages → Publishers → add B → row under pending.
2. B (`npm run dev`, connected as B): dashboard banner "A invited you to publish to A/scratch" → Join → "You can now publish to A/scratch".
3. A publishes report R1; B publishes R2; then both publish at once (R3, R4). `reports/index.json` on GitHub lists R1–R4, each with the right `publishedBy`.
4. A's palette is on the site after B's publishes; B's Settings shows "Set by A" and a disabled logo picker.
5. B on an older build (edit `package.json` version down locally, don't commit) publishes: `assets/` unchanged, status warns the site viewer is newer.
6. B deletes A's report from History: the confirmation names A.
7. A removes B in Publishers → B's next publish fails with "You don't have push access to A/scratch. Ask the site admin to add you."
