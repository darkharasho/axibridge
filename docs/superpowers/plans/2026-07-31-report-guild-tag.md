# Report Guild Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect the squad's dominant represented guild from session logs and stamp `{ id, name, tag }` onto each published report — displayed on the report header and as clickable, searchable chips in both report listings.

**Architecture:** Un-prune EI's per-player `guildID`; the renderer computes the dominant guild id in `buildReportMeta()` (same vote shape as `computePrimaryCommander`); the `upload-web-report` handler resolves id → name/tag via the public GW2 API behind a permanent electron-store cache (`src/main/guildDirectory.ts`) and injects `meta.guild` before the report payload is built, so both `report.json` and the `reports/index.json` entry carry it; the web report app and the in-app History view render chips and include guild name/tag in their text-search haystacks.

**Tech Stack:** TypeScript, Electron main + React renderer + web report viewer, electron-store, vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-report-guild-tag-design.md`

## Global Constraints

- Run vitest as: `npx vitest run <files> --maxWorkers=2` (machine-wide rule).
- GW2 API endpoint, verbatim: `https://api.guildwars2.com/v2/guild/{id}` (public, no auth), 8s timeout via AbortController.
- Cache key: electron-store `guildDirectory`, shape `{ [id]: { name: string; tag: string; resolvedAt: string } }`; cache successes only; cache hits never re-fetch.
- Guild resolution must never throw and never block the upload beyond its 8s cap; failure stamps `{ id, name: null, tag: null }` and caches nothing.
- Detection votes: representing guild only (`player.guildID` non-empty), squad members only (`notInSquad` excluded), one vote per account per log (vote key `player.account || player.name`, first entry per account per log wins), ties break alphabetically by guild id, `''` when no votes.
- Chips render only when `guild.tag` is present; entries without guild data never match guild searches.
- The dev-only `mock-web-report` path gets no guild injection.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Detection — un-prune guildID, compute dominant guild, wire into meta

**Files:**
- Modify: `src/main/detailsProcessing.ts:110` (remove `'guildID'` from `PLAYER_DENY`)
- Create: `src/renderer/stats/utils/computeDominantGuildId.ts`
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts` (add `guildId` to `buildReportMeta()`'s return)
- Test: `src/renderer/__tests__/computeDominantGuildId.test.ts`
- Test: `src/main/__tests__/detailsProcessing.test.ts` (add one survival assertion)

**Interfaces:**
- Consumes: nothing new.
- Produces: `computeDominantGuildId(detailsList: any[]): string` (empty string when no votes). `buildReportMeta()`'s meta gains `guildId: string` — Task 3 reads `payload.meta.guildId` in main. Pruned player details retain `guildID`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/__tests__/computeDominantGuildId.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeDominantGuildId } from '../stats/utils/computeDominantGuildId';

const log = (...players: Array<{ name?: string; account?: string; guildID?: string; notInSquad?: boolean }>) => ({ players });

describe('computeDominantGuildId', () => {
    it('picks the guild represented by the most accounts across logs', () => {
        expect(computeDominantGuildId([
            log({ name: 'A', guildID: 'g-eww' }, { name: 'B', guildID: 'g-eww' }, { name: 'C', guildID: 'g-pug' }),
            log({ name: 'A', guildID: 'g-eww' }, { name: 'C', guildID: 'g-pug' }),
        ])).toBe('g-eww');
    });

    it('breaks ties alphabetically by guild id', () => {
        expect(computeDominantGuildId([
            log({ name: 'A', guildID: 'g-zzz' }, { name: 'B', guildID: 'g-aaa' }),
        ])).toBe('g-aaa');
    });

    it('skips unrepped players and non-squad players', () => {
        expect(computeDominantGuildId([
            log({ name: 'A' }, { name: 'B', guildID: '' }, { name: 'Spy', guildID: 'g-enemy', notInSquad: true }),
        ])).toBe('');
        expect(computeDominantGuildId([])).toBe('');
    });

    it('counts an account once per log despite duplicate agent entries', () => {
        // EI emits one players[] entry per agent instance (relog/build swap).
        expect(computeDominantGuildId([
            log({ name: 'A', account: 'X.1', guildID: 'g-eww' }, { name: 'A2', account: 'X.1', guildID: 'g-eww' }, { name: 'B', guildID: 'g-pug' }),
            log({ name: 'B', guildID: 'g-pug' }),
        ])).toBe('g-pug');
    });

    it('uses the first entry per account per log when instances rep different guilds', () => {
        expect(computeDominantGuildId([
            log({ name: 'A', account: 'X.1', guildID: 'g-first' }, { name: 'A2', account: 'X.1', guildID: 'g-second' }),
        ])).toBe('g-first');
    });
});
```

Add to `src/main/__tests__/detailsProcessing.test.ts`, inside the existing describe block that exercises player pruning (follow the file's existing fixture style — build a minimal details object with one player that has `guildID` and any already-tested surviving field):

```ts
    it('keeps guildID on pruned players (feeds report guild detection)', () => {
        const details = pruneDetailsForStats({
            players: [{ name: 'A', guildID: 'g-1', dpsAll: [{}] }],
            targets: []
        } as any, {});
        expect(details.players[0].guildID).toBe('g-1');
    });
```

(Adjust the `pruneDetailsForStats` call shape to match how the existing tests in that file invoke it — same import, same options argument style. The assertion — `guildID` survives — is the requirement.)

- [ ] **Step 2: Run tests to verify failures**

Run: `npx vitest run src/renderer/__tests__/computeDominantGuildId.test.ts src/main/__tests__/detailsProcessing.test.ts --maxWorkers=2`
Expected: computeDominantGuildId tests FAIL (module not found); the new detailsProcessing assertion FAILS (`guildID` is currently pruned → undefined).

- [ ] **Step 3: Implement**

In `src/main/detailsProcessing.ts` line 110, remove `'guildID'` from the deny list — change:

```ts
    'consumables', 'weaponSets', 'weapons', 'guildID',
```

to:

```ts
    'consumables', 'weaponSets', 'weapons',
```

Create `src/renderer/stats/utils/computeDominantGuildId.ts`:

```ts
/** Dominant represented guild across a session's logs: each squad account's
 *  first entry per log casts one vote for the guild it represents
 *  (player.guildID); unrepped players are skipped. Ties break alphabetically
 *  by guild id. Returns '' when nobody repped a guild. */
export const computeDominantGuildId = (detailsList: any[]): string => {
    const counts = new Map<string, number>();
    detailsList.forEach((details) => {
        const players = (details?.players || []) as any[];
        const seenThisLog = new Set<string>();
        players.forEach((player) => {
            if (player?.notInSquad) return;
            const voteKey = player?.account || player?.name;
            if (!voteKey || seenThisLog.has(voteKey)) return;
            seenThisLog.add(voteKey);
            const guildId = typeof player?.guildID === 'string' ? player.guildID : '';
            if (!guildId) return;
            counts.set(guildId, (counts.get(guildId) || 0) + 1);
        });
    });
    let best = '';
    let bestCount = 0;
    Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([guildId, count]) => {
            if (count > bestCount) {
                best = guildId;
                bestCount = count;
            }
        });
    return best;
};
```

Note the dedupe intentionally consumes the account's slot even when its first
entry is unrepped (`seenThisLog.add` before the guild check) — "first entry per
account per log wins," matching the spec.

In `src/renderer/stats/hooks/useStatsUploads.ts`: add the import next to the existing `computePrimaryCommander` import:

```ts
import { computeDominantGuildId } from '../utils/computeDominantGuildId';
```

and in `buildReportMeta()`'s return object, directly below the `primaryCommander` line, add:

```ts
            guildId: computeDominantGuildId(detailsList),
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/renderer/__tests__/computeDominantGuildId.test.ts src/main/__tests__/detailsProcessing.test.ts --maxWorkers=2`
Expected: PASS. Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/detailsProcessing.ts src/main/__tests__/detailsProcessing.test.ts src/renderer/stats/utils/computeDominantGuildId.ts src/renderer/__tests__/computeDominantGuildId.test.ts src/renderer/stats/hooks/useStatsUploads.ts
git commit -m "feat(stats): detect dominant represented guild into report meta

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Guild resolution module (main)

**Files:**
- Create: `src/main/guildDirectory.ts`
- Test: `src/main/__tests__/guildDirectory.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Task 3 imports from `../guildDirectory` relative to `handlers/`):
  - `interface ResolvedGuild { id: string; name: string | null; tag: string | null }`
  - `resolveGuild(guildId: string, store: { get(key: string, def?: any): any; set(key: string, value: any): void }, fetchImpl?: typeof fetch): Promise<ResolvedGuild>`

- [ ] **Step 1: Write the failing test**

Create `src/main/__tests__/guildDirectory.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveGuild } from '../guildDirectory';

const makeStore = (initial: Record<string, any> = {}) => {
    const data: Record<string, any> = { ...initial };
    return {
        get: (key: string, def?: any) => (key in data ? data[key] : def),
        set: (key: string, value: any) => {
            data[key] = value;
        },
        data,
    };
};

const okResponse = (body: any) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('resolveGuild', () => {
    it('returns cached values without fetching', async () => {
        const store = makeStore({ guildDirectory: { 'g-1': { name: 'Elite Warriors', tag: 'EWW', resolvedAt: '2026-01-01T00:00:00.000Z' } } });
        const fetchImpl = vi.fn();
        const result = await resolveGuild('g-1', store, fetchImpl as unknown as typeof fetch);
        expect(result).toEqual({ id: 'g-1', name: 'Elite Warriors', tag: 'EWW' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fetches on miss, caches the success, and hits the exact endpoint', async () => {
        const store = makeStore();
        const fetchImpl = vi.fn(async () => okResponse({ id: 'g-2', name: 'Red Guild', tag: 'RED' }));
        const result = await resolveGuild('g-2', store, fetchImpl as unknown as typeof fetch);
        expect(result).toEqual({ id: 'g-2', name: 'Red Guild', tag: 'RED' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://api.guildwars2.com/v2/guild/g-2');
        expect(store.data.guildDirectory['g-2']).toMatchObject({ name: 'Red Guild', tag: 'RED' });
        expect(typeof store.data.guildDirectory['g-2'].resolvedAt).toBe('string');
    });

    it('returns id-only and caches nothing on non-200', async () => {
        const store = makeStore();
        const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ text: 'no such guild' }) }) as Response);
        const result = await resolveGuild('g-missing', store, fetchImpl as unknown as typeof fetch);
        expect(result).toEqual({ id: 'g-missing', name: null, tag: null });
        expect(store.data.guildDirectory).toBeUndefined();
    });

    it('returns id-only and caches nothing on malformed body or rejecting fetch', async () => {
        const store = makeStore();
        const malformed = vi.fn(async () => okResponse({ id: 'g-3' })); // no name/tag strings
        expect(await resolveGuild('g-3', store, malformed as unknown as typeof fetch)).toEqual({ id: 'g-3', name: null, tag: null });
        const rejecting = vi.fn(async () => { throw new Error('offline'); });
        expect(await resolveGuild('g-4', store, rejecting as unknown as typeof fetch)).toEqual({ id: 'g-4', name: null, tag: null });
        expect(store.data.guildDirectory).toBeUndefined();
    });

    it('preserves existing cache entries when adding a new one', async () => {
        const store = makeStore({ guildDirectory: { 'g-1': { name: 'Old', tag: 'OLD', resolvedAt: 'x' } } });
        const fetchImpl = vi.fn(async () => okResponse({ id: 'g-5', name: 'New', tag: 'NEW' }));
        await resolveGuild('g-5', store, fetchImpl as unknown as typeof fetch);
        expect(Object.keys(store.data.guildDirectory).sort()).toEqual(['g-1', 'g-5']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/guildDirectory.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../guildDirectory`.

- [ ] **Step 3: Implement**

Create `src/main/guildDirectory.ts`:

```ts
export interface ResolvedGuild {
    id: string;
    name: string | null;
    tag: string | null;
}

const GW2_GUILD_ENDPOINT = 'https://api.guildwars2.com/v2/guild/';
const RESOLVE_TIMEOUT_MS = 8_000;

type StoreLike = { get(key: string, def?: any): any; set(key: string, value: any): void };

/** Resolve a guild id to { name, tag } via the public GW2 API, backed by a
 *  permanent electron-store cache (guild names/tags don't change). Failures
 *  return id-only and cache nothing so the next upload retries. Never throws. */
export async function resolveGuild(
    guildId: string,
    store: StoreLike,
    fetchImpl?: typeof fetch
): Promise<ResolvedGuild> {
    const doFetch = fetchImpl || fetch;
    const cached = (store.get('guildDirectory', {}) as Record<string, any>)[guildId];
    if (cached && typeof cached.name === 'string' && typeof cached.tag === 'string') {
        return { id: guildId, name: cached.name, tag: cached.tag };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
    try {
        const resp = await doFetch(`${GW2_GUILD_ENDPOINT}${guildId}`, { signal: controller.signal });
        if (!resp.ok) return { id: guildId, name: null, tag: null };
        const body: any = await resp.json();
        if (typeof body?.name !== 'string' || typeof body?.tag !== 'string') {
            return { id: guildId, name: null, tag: null };
        }
        const directory = { ...(store.get('guildDirectory', {}) as Record<string, any>) };
        directory[guildId] = { name: body.name, tag: body.tag, resolvedAt: new Date().toISOString() };
        store.set('guildDirectory', directory);
        return { id: guildId, name: body.name, tag: body.tag };
    } catch {
        return { id: guildId, name: null, tag: null };
    } finally {
        clearTimeout(timer);
    }
}
```

- [ ] **Step 4: Run test to verify green**

Run: `npx vitest run src/main/__tests__/guildDirectory.test.ts --maxWorkers=2`
Expected: PASS (5 tests). Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/guildDirectory.ts src/main/__tests__/guildDirectory.test.ts
git commit -m "feat(main): GW2 guild resolution with permanent cache

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Inject guild into report meta and index entry

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (reportMeta construction ~line 1704; indexEntry construction ~line 1817)
- Modify: `src/shared/reportTypes.ts` (`ReportIndexEntry` + `ReportMeta` gain optional guild)

**Interfaces:**
- Consumes: `resolveGuild`, `ResolvedGuild` from `../guildDirectory` (Task 2); `payload.meta.guildId` (Task 1).
- Produces: `report.json` meta and `reports/index.json` entries carry `guild?: { id: string; name: string | null; tag: string | null } | null`. Exported `ReportGuild` interface in `src/shared/reportTypes.ts` — Tasks 4 and 5 consume it.

- [ ] **Step 1: Extend the shared types**

In `src/shared/reportTypes.ts`, add above `ReportIndexEntry`:

```ts
export interface ReportGuild {
    id: string;
    name: string | null;
    tag: string | null;
}
```

Add to `ReportIndexEntry` (after the `url: string;` line):

```ts
    guild?: ReportGuild | null;
```

Find the `ReportMeta` interface in the same file and add the same optional field:

```ts
    guild?: ReportGuild | null;
```

- [ ] **Step 2: Resolve and inject in the handler**

In `src/main/handlers/githubHandlers.ts`, add the import alongside the existing `../reportWebhooks` import:

```ts
import { resolveGuild } from '../guildDirectory';
```

The `upload-web-report` handler builds `reportMeta` at ~line 1704:

```ts
            const reportMeta = {
                ...payload.meta,
                appVersion: app.getVersion()
            };
```

Directly below that block, add:

```ts
            // Stamp the session's dominant guild (detected renderer-side) with
            // name/tag resolved via the GW2 API + permanent cache. Resolution
            // failure stamps id-only; it must never fail or block the upload.
            const detectedGuildId = typeof (reportMeta as any).guildId === 'string' ? (reportMeta as any).guildId.trim() : '';
            if (detectedGuildId) {
                const cachedDirectory = store.get('guildDirectory', {}) as Record<string, any>;
                if (!cachedDirectory[detectedGuildId]) {
                    sendWebUploadStatus('Preparing', 'Resolving guild name via GW2 API...', 12);
                }
                (reportMeta as any).guild = await resolveGuild(detectedGuildId, store as any);
            }
```

The `indexEntry` object literal (~line 1817) currently begins:

```ts
            const indexEntry = {
                id: reportMeta.id,
                title: reportMeta.title,
                commanders: reportMeta.commanders || [],
```

Add directly below the `commanders` line:

```ts
                guild: (reportMeta as any).guild ?? null,
```

Do NOT touch the `mock-web-report` handler (also builds a reportMeta near line 2133) — the dev mock path gets no guild injection per the spec.

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: clean. (Wiring task — resolution behavior is covered by Task 2's module tests; `reportMeta` flows into `buildWebReportPayload(reportMeta, ...)` at ~line 1746, which is what lands in `report.json`.)

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/shared/reportTypes.ts
git commit -m "feat(main): stamp resolved guild onto report meta and index entries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Web report viewer — header chip, listing chip, search

**Files:**
- Modify: `src/web/reportApp.tsx` (header ~line 1864, listing haystack ~lines 1226–1230, listing card ~lines 2439–2460)

**Interfaces:**
- Consumes: `report.meta.guild` and `entry.guild` (`ReportGuild` from Task 3; `entry` is typed loosely in this file — use optional chaining).
- Produces: nothing downstream.

- [ ] **Step 1: Header chip**

At ~line 1864 the report header renders:

```tsx
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-1">{report.meta.title}</h1>
```

Replace with:

```tsx
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2 flex-wrap">
                                        <span>{report.meta.title}</span>
                                        {(report.meta as any).guild?.tag && (
                                            <span
                                                className="inline-flex items-center rounded-[4px] border px-2 py-0.5 text-sm font-semibold tracking-wide"
                                                style={{ borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
                                                title={(report.meta as any).guild.name || undefined}
                                            >
                                                [{(report.meta as any).guild.tag}]{(report.meta as any).guild.name ? ` ${(report.meta as any).guild.name}` : ''}
                                            </span>
                                        )}
                                    </h1>
```

- [ ] **Step 2: Listing search haystack**

At ~lines 1226–1230, `filteredIndex` filters with:

```ts
        return sortedIndex.filter((entry) => {
            const commanders = entry.commanders?.join(' ') || '';
            const haystack = `${entry.title} ${commanders} ${entry.dateLabel}`.toLowerCase();
            return haystack.includes(term);
        });
```

Change the haystack construction to:

```ts
        return sortedIndex.filter((entry) => {
            const commanders = entry.commanders?.join(' ') || '';
            const guild = `${(entry as any).guild?.name || ''} ${(entry as any).guild?.tag || ''}`;
            const haystack = `${entry.title} ${commanders} ${entry.dateLabel} ${guild}`.toLowerCase();
            return haystack.includes(term);
        });
```

- [ ] **Step 3: Listing chip (click-to-search)**

In the `filteredIndex.map((entry) => (...))` card (~line 2439), the title block renders:

```tsx
                                            <div className="text-base sm:text-lg font-semibold mt-1 truncate">
                                                {formatReportTitle(entry.dateStart)}
                                            </div>
```

Replace with:

```tsx
                                            <div className="text-base sm:text-lg font-semibold mt-1 truncate flex items-center gap-2">
                                                <span className="truncate">{formatReportTitle(entry.dateStart)}</span>
                                                {(entry as any).guild?.tag && (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            setSearchTerm((entry as any).guild.tag);
                                                        }}
                                                        className="shrink-0 inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide hover:border-[color:var(--accent-border)] transition-colors"
                                                        style={{ borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
                                                        title={`Search reports by ${(entry as any).guild.name || (entry as any).guild.tag}`}
                                                    >
                                                        [{(entry as any).guild.tag}]
                                                    </button>
                                                )}
                                            </div>
```

(The card is an `<a>`; `preventDefault` + `stopPropagation` keep the chip click from navigating.)

- [ ] **Step 4: Verify**

Run: `npm run validate`
Expected: clean.
Run: `npx vitest run --maxWorkers=2 src/web`
Expected: existing web tests pass (no reportApp unit tests exist; UI is exercised by the Playwright e2e web suite separately).

- [ ] **Step 5: Commit**

```bash
git add src/web/reportApp.tsx
git commit -m "feat(web): guild tag chip on report header and listing with search

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: In-app History view — chip and search

**Files:**
- Modify: `src/renderer/FightReportHistoryView.tsx` (haystack ~lines 231–236, entry card title ~line 694)
- Test: `src/renderer/__tests__/matchesReportSearch.test.ts`

**Interfaces:**
- Consumes: `entry.guild` via `ReportIndexEntry` and `ReportGuild` (Task 3 added the typed fields, so no casts needed here).
- Produces: exported `matchesReportSearch(entry: ReportIndexEntry, q: string): boolean` (q already lowercased/trimmed by the caller).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/matchesReportSearch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchesReportSearch } from '../FightReportHistoryView';
import type { ReportIndexEntry } from '../../shared/reportTypes';

const entry = (over: Partial<ReportIndexEntry> = {}): ReportIndexEntry => ({
    id: 'r1',
    title: 'Axi Vale',
    commanders: ['Axi Vale'],
    dateStart: '2026-07-31T02:00:00.000Z',
    dateEnd: '2026-07-31T04:00:00.000Z',
    dateLabel: '7/30/2026, 8:00 PM - 7/30/2026, 10:00 PM',
    url: './?report=r1',
    ...over,
});

describe('matchesReportSearch', () => {
    it('matches guild tag and guild name case-insensitively', () => {
        const withGuild = entry({ guild: { id: 'g-1', name: 'Elite Warriors', tag: 'EWW' } });
        expect(matchesReportSearch(withGuild, 'eww')).toBe(true);
        expect(matchesReportSearch(withGuild, 'elite warriors')).toBe(true);
    });

    it('does not match guild terms on entries without guild data', () => {
        expect(matchesReportSearch(entry(), 'eww')).toBe(false);
        expect(matchesReportSearch(entry({ guild: null }), 'eww')).toBe(false);
    });

    it('still matches title, commanders, and date label', () => {
        expect(matchesReportSearch(entry(), 'axi vale')).toBe(true);
        expect(matchesReportSearch(entry(), '8:00 pm')).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/matchesReportSearch.test.ts --maxWorkers=2`
Expected: FAIL — `matchesReportSearch` is not exported.

- [ ] **Step 3: Extract the predicate and extend the haystack**

In `src/renderer/FightReportHistoryView.tsx`, add near the top of the file (module scope, above the component):

```ts
export const matchesReportSearch = (entry: ReportIndexEntry, q: string): boolean => {
    const title = (entry.title || '').toLowerCase();
    const dateLabel = (entry.dateLabel || '').toLowerCase();
    const commanders = (entry.commanders || []).join(' ').toLowerCase();
    const guild = `${entry.guild?.name || ''} ${entry.guild?.tag || ''}`.toLowerCase();
    return title.includes(q) || dateLabel.includes(q) || commanders.includes(q) || guild.includes(q);
};
```

At ~lines 231–236 the filter currently reads:

```ts
        return entries.filter((entry) => {
            const title = (entry.title || '').toLowerCase();
            const dateLabel = (entry.dateLabel || '').toLowerCase();
            const commanders = (entry.commanders || []).join(' ').toLowerCase();
            return title.includes(q) || dateLabel.includes(q) || commanders.includes(q);
        });
```

Replace with:

```ts
        return entries.filter((entry) => matchesReportSearch(entry, q));
```

- [ ] **Step 3b: Run test to verify green**

Run: `npx vitest run src/renderer/__tests__/matchesReportSearch.test.ts --maxWorkers=2`
Expected: PASS (3 tests).

- [ ] **Step 2: Entry chip (click-to-search)**

At ~line 694 the card title renders:

```tsx
                                    <div className="text-sm font-semibold pr-6" style={{ color: 'var(--text-primary)' }}>{entry.title}</div>
```

Replace with:

```tsx
                                    <div className="text-sm font-semibold pr-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                        <span className="truncate">{entry.title}</span>
                                        {entry.guild?.tag && (
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSearchQuery(entry.guild?.tag || '');
                                                }}
                                                className="shrink-0 inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors"
                                                style={{ borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
                                                title={`Search reports by ${entry.guild?.name || entry.guild?.tag}`}
                                            >
                                                [{entry.guild.tag}]
                                            </button>
                                        )}
                                    </div>
```

(The entry card has an onClick opening the report — `stopPropagation` keeps the chip from triggering it. Verify the card's click handler wraps this element; if the title div sits outside the clickable area, the `stopPropagation` is harmless.)

- [ ] **Step 3: Verify**

Run: `npm run validate`
Expected: clean.
Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__`
Expected: renderer suites pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/FightReportHistoryView.tsx src/renderer/__tests__/matchesReportSearch.test.ts
git commit -m "feat(renderer): guild tag chip and search in report history

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full-suite verification

**Files:** none new.

**Interfaces:** none — regression gate.

- [ ] **Step 1: Full validation and unit suite**

```bash
npm run validate
npx vitest run --maxWorkers=2
```

Expected: typecheck clean, lint clean, all tests pass (previous count 149 files / 1184 tests; expect +2 files from Tasks 1–2 plus the new assertions).

- [ ] **Step 2: Commit any straggling fixes**

Only if Step 1 surfaced fixes; otherwise nothing to commit.
