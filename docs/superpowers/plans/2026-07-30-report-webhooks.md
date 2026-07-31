# Report Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful "Upload to Web" publish, auto-post the report link to a configurable list of Discord webhooks, with forum-channel support and per-webhook templated titles (`{date} - {day_of_week} - {commander}`).

**Architecture:** A shared module (`src/shared/reportWebhooks.ts`) holds the `IReportWebhook` type and template renderer (used by main for posting and by the renderer for live preview). Main gets a posting module (`src/main/reportWebhooks.ts`) invoked from the `upload-web-report` IPC handler after the publish commit succeeds. The renderer computes `primaryCommander` into the existing report meta, and SettingsView gets a self-contained "Report Webhooks" card (SettingsView already loads/saves settings itself via `getSettings`/`saveSettings` — no App/AppLayout plumbing).

**Tech Stack:** TypeScript, Electron (main + preload + React renderer), electron-store, vitest (+ @testing-library/react, jsdom for renderer tests).

**Spec:** `docs/superpowers/specs/2026-07-30-report-webhooks-design.md`

## Global Constraints

- Run vitest with limited parallelism: `npx vitest run <files> --maxWorkers=2` (machine-wide rule).
- Default title template, verbatim: `{date} - {day_of_week} - {commander}`
- Placeholders: `{date}` → `toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })`; `{day_of_week}` → `toLocaleDateString(undefined, { weekday: 'long' })`; `{commander}` → primary commander or `Unknown`; `{commanders}` → all joined with `, ` or `Unknown`.
- Dates render from the session start (`meta.dateStart` = first fight start), never the upload time.
- Discord forum `thread_name` hard cap: 100 chars (truncate the rendered title).
- Posting failures must never fail the upload (`success: true` unaffected) and never throw.
- The "No changes to upload." early-return path must NOT post.
- electron-store key: `reportWebhooks`. The existing `webhooks`/`selectedWebhookId` fight-webhook settings are untouched.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Shared type + template renderer

**Files:**
- Create: `src/shared/reportWebhooks.ts`
- Test: `src/shared/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (later tasks import these exact names from `../shared/reportWebhooks` / `../../shared/reportWebhooks`):
  - `interface IReportWebhook { id: string; name: string; url: string; enabled: boolean; isForum: boolean; titleTemplate: string }`
  - `const DEFAULT_REPORT_TITLE_TEMPLATE = '{date} - {day_of_week} - {commander}'`
  - `makeDefaultReportWebhook(id: string): IReportWebhook`
  - `interface ReportTitleContext { sessionStart: Date; primaryCommander: string; commanders: string[] }`
  - `renderReportTitle(template: string, ctx: ReportTitleContext): string`

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/reportWebhooks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REPORT_TITLE_TEMPLATE,
    makeDefaultReportWebhook,
    renderReportTitle,
} from '../reportWebhooks';

// 2026-07-30 is a Thursday. Locale-formatted parts are computed with the same
// Intl calls the renderer uses so the assertions hold on any machine locale.
const sessionStart = new Date(2026, 6, 30, 20, 15, 0);
const expectedDate = sessionStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const expectedDay = sessionStart.toLocaleDateString(undefined, { weekday: 'long' });

const ctx = {
    sessionStart,
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale', 'Red Tag'],
};

describe('renderReportTitle', () => {
    it('renders every placeholder', () => {
        const out = renderReportTitle('{date} | {day_of_week} | {commander} | {commanders}', ctx);
        expect(out).toBe(`${expectedDate} | ${expectedDay} | Axi Vale | Axi Vale, Red Tag`);
    });

    it('renders the default template', () => {
        const out = renderReportTitle(DEFAULT_REPORT_TITLE_TEMPLATE, ctx);
        expect(out).toBe(`${expectedDate} - ${expectedDay} - Axi Vale`);
    });

    it('leaves unknown tokens literal', () => {
        expect(renderReportTitle('{nope} {commander}', ctx)).toBe('{nope} Axi Vale');
    });

    it('falls back to the default template when blank', () => {
        expect(renderReportTitle('   ', ctx)).toBe(`${expectedDate} - ${expectedDay} - Axi Vale`);
        expect(renderReportTitle('', ctx)).toBe(`${expectedDate} - ${expectedDay} - Axi Vale`);
    });

    it('falls back to Unknown when no commanders were seen', () => {
        const empty = { sessionStart, primaryCommander: '', commanders: [] as string[] };
        expect(renderReportTitle('{commander} / {commanders}', empty)).toBe('Unknown / Unknown');
    });
});

describe('makeDefaultReportWebhook', () => {
    it('creates an enabled non-forum entry with the default template', () => {
        expect(makeDefaultReportWebhook('123')).toEqual({
            id: '123',
            name: '',
            url: '',
            enabled: true,
            isForum: false,
            titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE,
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reportWebhooks` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/shared/reportWebhooks.ts`:

```ts
export interface IReportWebhook {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    isForum: boolean;
    titleTemplate: string;
}

export const DEFAULT_REPORT_TITLE_TEMPLATE = '{date} - {day_of_week} - {commander}';

export const makeDefaultReportWebhook = (id: string): IReportWebhook => ({
    id,
    name: '',
    url: '',
    enabled: true,
    isForum: false,
    titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE,
});

export interface ReportTitleContext {
    /** First fight's start time — names the raid night even past midnight. */
    sessionStart: Date;
    primaryCommander: string;
    commanders: string[];
}

export const renderReportTitle = (template: string, ctx: ReportTitleContext): string => {
    const effective = template && template.trim() ? template : DEFAULT_REPORT_TITLE_TEMPLATE;
    const date = ctx.sessionStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const dayOfWeek = ctx.sessionStart.toLocaleDateString(undefined, { weekday: 'long' });
    const commander = ctx.primaryCommander || 'Unknown';
    const commanders = ctx.commanders.length ? ctx.commanders.join(', ') : 'Unknown';
    return effective
        .replaceAll('{date}', date)
        .replaceAll('{day_of_week}', dayOfWeek)
        .replaceAll('{commanders}', commanders)
        .replaceAll('{commander}', commander)
        .trim();
};
```

Note: `{commanders}` is replaced before `{commander}` deliberately; the literal
`{commander}` token does not occur inside `{commanders}` (the brace closes it),
but keeping this order makes the intent obvious.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/reportWebhooks.ts src/shared/__tests__/reportWebhooks.test.ts
git commit -m "feat(shared): report webhook type and title template renderer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Primary commander helper + meta wiring

**Files:**
- Create: `src/renderer/stats/utils/computePrimaryCommander.ts`
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts` (inside `buildReportMeta`, around lines 75–122)
- Test: `src/renderer/__tests__/computePrimaryCommander.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `computePrimaryCommander(detailsList: any[]): string` — most-frequent commander name (by number of logs in which they tagged), ties broken alphabetically, `''` if none. `buildReportMeta()`'s returned meta gains `primaryCommander: string` (Task 4 reads `payload.meta.primaryCommander` in main).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/computePrimaryCommander.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computePrimaryCommander } from '../stats/utils/computePrimaryCommander';

const log = (...commanders: string[]) => ({
    players: commanders.map((name) => ({ name, hasCommanderTag: true })),
});

describe('computePrimaryCommander', () => {
    it('picks the commander who tagged the most logs', () => {
        expect(computePrimaryCommander([log('Axi'), log('Axi'), log('Red')])).toBe('Axi');
    });

    it('breaks ties alphabetically', () => {
        expect(computePrimaryCommander([log('Zed'), log('Axi')])).toBe('Axi');
    });

    it('returns empty string when nobody tagged', () => {
        expect(computePrimaryCommander([{ players: [{ name: 'A' }] }, {}])).toBe('');
        expect(computePrimaryCommander([])).toBe('');
    });

    it('ignores players not in squad', () => {
        const details = { players: [{ name: 'Spy', hasCommanderTag: true, notInSquad: true }] };
        expect(computePrimaryCommander([details])).toBe('');
    });

    it('counts a commander once per log despite duplicate agent entries', () => {
        // EI emits one players[] entry per agent instance (relog/build swap).
        const dupes = { players: [{ name: 'Axi', hasCommanderTag: true }, { name: 'Axi', hasCommanderTag: true }] };
        expect(computePrimaryCommander([dupes, log('Red'), log('Red')])).toBe('Red');
    });

    it('falls back to account when name is missing', () => {
        expect(computePrimaryCommander([{ players: [{ account: 'Axi.1234', hasCommanderTag: true }] }])).toBe('Axi.1234');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/computePrimaryCommander.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../stats/utils/computePrimaryCommander`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/stats/utils/computePrimaryCommander.ts`:

```ts
/** Most-frequent commander across a session's logs: counted once per log in
 *  which they had the tag (EI emits duplicate players[] entries per agent
 *  instance), ties broken alphabetically. Returns '' when nobody tagged. */
export const computePrimaryCommander = (detailsList: any[]): string => {
    const counts = new Map<string, number>();
    detailsList.forEach((details) => {
        const players = (details?.players || []) as any[];
        const seenThisLog = new Set<string>();
        players.forEach((player) => {
            if (player?.notInSquad) return;
            if (!player?.hasCommanderTag) return;
            const name = player?.name || player?.account || 'Unknown';
            if (seenThisLog.has(name)) return;
            seenThisLog.add(name);
            counts.set(name, (counts.get(name) || 0) + 1);
        });
    });
    let best = '';
    let bestCount = 0;
    Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([name, count]) => {
            if (count > bestCount) {
                best = name;
                bestCount = count;
            }
        });
    return best;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/computePrimaryCommander.test.ts --maxWorkers=2`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire into buildReportMeta**

In `src/renderer/stats/hooks/useStatsUploads.ts`:

Add the import at the top of the file:

```ts
import { computePrimaryCommander } from '../utils/computePrimaryCommander';
```

Inside `buildReportMeta()`, collect the details objects the existing loop already
resolves, and add `primaryCommander` to the returned meta. The loop currently
begins:

```ts
        logs.forEach((log) => {
            const details = (detailsCache && log?.id ? detailsCache.peek(log.id) : null) || log.details;
            if (!details) return;
```

Change the surrounding code to:

```ts
        const detailsList: any[] = [];
        logs.forEach((log) => {
            const details = (detailsCache && log?.id ? detailsCache.peek(log.id) : null) || log.details;
            if (!details) return;
            detailsList.push(details);
```

(the rest of the loop body is unchanged), and extend the return object — which
currently reads:

```ts
        return {
            id: reportId,
            title: commanders.length ? commanders.join(', ') : 'Unknown Commander',
            commanders,
            dateStart,
            dateEnd,
            dateLabel,
            generatedAt: new Date().toISOString()
        };
```

to:

```ts
        return {
            id: reportId,
            title: commanders.length ? commanders.join(', ') : 'Unknown Commander',
            commanders,
            primaryCommander: computePrimaryCommander(detailsList),
            dateStart,
            dateEnd,
            dateLabel,
            generatedAt: new Date().toISOString()
        };
```

- [ ] **Step 6: Verify types and existing tests**

Run: `npm run typecheck`
Expected: clean.
Run: `npx vitest run src/renderer/__tests__/computePrimaryCommander.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/utils/computePrimaryCommander.ts src/renderer/__tests__/computePrimaryCommander.test.ts src/renderer/stats/hooks/useStatsUploads.ts
git commit -m "feat(stats): compute primary commander into report meta

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Main-process posting module

**Files:**
- Create: `src/main/reportWebhooks.ts`
- Modify: `src/main/discord.ts:36` (export the avatar constant)
- Test: `src/main/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: `IReportWebhook`, `renderReportTitle` from `../shared/reportWebhooks` (Task 1); `DISCORD_WEBHOOK_AVATAR_URL` from `./discord`.
- Produces (Task 4 imports these from `../reportWebhooks` relative to `handlers/`):
  - `interface ReportWebhookPostResult { id: string; name: string; ok: boolean; error?: string }`
  - `buildReportSummaryLine(stats: any): string`
  - `postReportToWebhooks(opts: { webhooks: IReportWebhook[]; meta: any; stats: any; url: string; onStatus?: (line: string, isWarn?: boolean) => void; persistForumFlag?: (id: string, isForum: boolean) => void; fetchImpl?: typeof fetch }): Promise<ReportWebhookPostResult[]>`

- [ ] **Step 1: Export the avatar constant**

In `src/main/discord.ts` line 36, change:

```ts
const DISCORD_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/darkharasho/axibridge/main/public/img/AxiBridge-glyph.png';
```

to:

```ts
export const DISCORD_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/darkharasho/axibridge/main/public/img/AxiBridge-glyph.png';
```

- [ ] **Step 2: Write the failing test**

Create `src/main/__tests__/reportWebhooks.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildReportSummaryLine, postReportToWebhooks } from '../reportWebhooks';
import { makeDefaultReportWebhook } from '../../shared/reportWebhooks';

const hook = (over: Partial<ReturnType<typeof makeDefaultReportWebhook>> = {}) => ({
    ...makeDefaultReportWebhook('h1'),
    name: 'Guild',
    url: 'https://discord.com/api/webhooks/1/abc',
    titleTemplate: '{commander}',
    ...over,
});

const meta = {
    dateStart: new Date(2026, 6, 30, 20, 0, 0).toISOString(),
    dateLabel: '7/30/2026, 8:00 PM - 7/30/2026, 9:31 PM',
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale'],
};

const stats = { total: 19, wins: 16, losses: 3, squadKDR: '5.56' };

const okResponse = { ok: true, status: 204, text: async () => '' } as Response;
const errorResponse = (status: number, body: string) =>
    ({ ok: false, status, text: async () => body }) as Response;

describe('buildReportSummaryLine', () => {
    it('joins fights, record, and KDR', () => {
        expect(buildReportSummaryLine(stats)).toBe('19 fights • 16W – 3L • Squad KDR 5.56');
    });

    it('omits missing pieces gracefully', () => {
        expect(buildReportSummaryLine({ total: 1 })).toBe('1 fight');
        expect(buildReportSummaryLine({})).toBe('');
    });
});

describe('postReportToWebhooks', () => {
    it('posts a plain embed for a regular channel', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const results = await postReportToWebhooks({
            webhooks: [hook()], meta, stats, url: 'https://example.com/r/1', fetchImpl,
        });
        expect(results).toEqual([{ id: 'h1', name: 'Guild', ok: true }]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
        expect(body.thread_name).toBeUndefined();
        expect(body.username).toBe('AxiBridge');
        expect(body.embeds[0].title).toBe('Axi Vale');
        expect(body.embeds[0].url).toBe('https://example.com/r/1');
        expect(body.embeds[0].description).toBe('19 fights • 16W – 3L • Squad KDR 5.56');
        expect(body.embeds[0].footer.text).toBe(meta.dateLabel);
    });

    it('sends thread_name truncated to 100 chars for forum webhooks', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const longTemplate = 'X'.repeat(120);
        await postReportToWebhooks({
            webhooks: [hook({ isForum: true, titleTemplate: longTemplate })],
            meta, stats, url: 'u', fetchImpl,
        });
        const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
        expect(body.thread_name).toBe('X'.repeat(100));
    });

    it('self-heals a forum channel mislabeled as regular', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"message": "Webhooks posted to forum channels must have a thread_name or thread_id"}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: false })], meta, stats, url: 'u', fetchImpl, persistForumFlag,
        });
        expect(results[0].ok).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const retryBody = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBe('Axi Vale');
        expect(persistForumFlag).toHaveBeenCalledWith('h1', true);
    });

    it('self-heals a regular channel mislabeled as forum', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"thread_name": ["Thread name is not allowed in this channel"]}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: true })], meta, stats, url: 'u', fetchImpl, persistForumFlag,
        });
        expect(results[0].ok).toBe(true);
        const retryBody = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBeUndefined();
        expect(persistForumFlag).toHaveBeenCalledWith('h1', false);
    });

    it('isolates failures per webhook and never throws', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(500, 'boom'))
            .mockResolvedValueOnce(okResponse);
        const onStatus = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook(), { ...hook(), id: 'h2', name: 'Second' }],
            meta, stats, url: 'u', fetchImpl, onStatus,
        });
        expect(results[0]).toMatchObject({ id: 'h1', ok: false });
        expect(results[0].error).toContain('500');
        expect(results[1]).toEqual({ id: 'h2', name: 'Second', ok: true });
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Failed'), true);
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Second'));
    });

    it('survives a rejecting fetch', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const results = await postReportToWebhooks({
            webhooks: [hook()], meta, stats, url: 'u', fetchImpl,
        });
        expect(results[0]).toMatchObject({ id: 'h1', ok: false, error: 'offline' });
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `../reportWebhooks`.

- [ ] **Step 4: Write the implementation**

Create `src/main/reportWebhooks.ts`:

```ts
import { IReportWebhook, renderReportTitle } from '../shared/reportWebhooks';
import { DISCORD_WEBHOOK_AVATAR_URL } from './discord';

export interface ReportWebhookPostResult {
    id: string;
    name: string;
    ok: boolean;
    error?: string;
}

const EMBED_COLOR = 0xef4444;
const POST_TIMEOUT_MS = 10_000;

export const buildReportSummaryLine = (stats: any): string => {
    const parts: string[] = [];
    const total = Number(stats?.total);
    if (Number.isFinite(total) && total > 0) {
        parts.push(`${total} fight${total === 1 ? '' : 's'}`);
    }
    const wins = Number(stats?.wins);
    const losses = Number(stats?.losses);
    if (Number.isFinite(wins) && Number.isFinite(losses)) {
        parts.push(`${wins}W – ${losses}L`);
    }
    const kdr = stats?.squadKDR;
    if (kdr !== undefined && kdr !== null && String(kdr).length > 0) {
        parts.push(`Squad KDR ${kdr}`);
    }
    return parts.join(' • ');
};

export async function postReportToWebhooks(opts: {
    webhooks: IReportWebhook[];
    meta: any;
    stats: any;
    url: string;
    onStatus?: (line: string, isWarn?: boolean) => void;
    persistForumFlag?: (id: string, isForum: boolean) => void;
    fetchImpl?: typeof fetch;
}): Promise<ReportWebhookPostResult[]> {
    const doFetch = opts.fetchImpl || fetch;
    const results: ReportWebhookPostResult[] = [];

    const parsedStart = new Date(opts.meta?.dateStart || Date.now());
    const ctx = {
        sessionStart: Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart,
        primaryCommander: String(opts.meta?.primaryCommander || ''),
        commanders: Array.isArray(opts.meta?.commanders) ? opts.meta.commanders.map(String) : [],
    };
    const description = buildReportSummaryLine(opts.stats);

    for (const hook of opts.webhooks) {
        const title = renderReportTitle(hook.titleTemplate, ctx);
        const embed: any = {
            title,
            url: opts.url,
            color: EMBED_COLOR,
        };
        if (description) embed.description = description;
        if (opts.meta?.dateLabel) embed.footer = { text: String(opts.meta.dateLabel) };

        const post = async (withThreadName: boolean) => {
            const body: any = {
                username: 'AxiBridge',
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                embeds: [embed],
            };
            if (withThreadName) body.thread_name = title.slice(0, 100);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
            try {
                const resp = await doFetch(hook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                const text = resp.ok ? '' : await resp.text().catch(() => '');
                return { ok: resp.ok, status: resp.status, text };
            } finally {
                clearTimeout(timer);
            }
        };

        const label = hook.name || 'webhook';
        try {
            let attempt = await post(hook.isForum);
            // Forum self-heal: a 400 mentioning thread_name means the forum flag
            // is wrong in whichever direction we sent. Retry once flipped and
            // persist the corrected flag on success.
            if (!attempt.ok && attempt.status === 400 && /thread[_ ]?name/i.test(attempt.text)) {
                const flipped = !hook.isForum;
                attempt = await post(flipped);
                if (attempt.ok) opts.persistForumFlag?.(hook.id, flipped);
            }
            if (attempt.ok) {
                results.push({ id: hook.id, name: hook.name, ok: true });
                opts.onStatus?.(`Posted report to ${label}.`);
            } else {
                const error = `HTTP ${attempt.status}${attempt.text ? `: ${attempt.text.slice(0, 120)}` : ''}`;
                results.push({ id: hook.id, name: hook.name, ok: false, error });
                opts.onStatus?.(`Failed to post to ${label} — ${error}`, true);
            }
        } catch (err: any) {
            const error = String(err?.message || err);
            results.push({ id: hook.id, name: hook.name, ok: false, error });
            opts.onStatus?.(`Failed to post to ${label} — ${error}`, true);
        }
    }
    return results;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS (8 tests).

- [ ] **Step 6: Typecheck (electron tsconfig covers src/main)**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/main/reportWebhooks.ts src/main/__tests__/reportWebhooks.test.ts src/main/discord.ts
git commit -m "feat(main): Discord report webhook posting with forum self-heal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Post after successful web publish

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` (the `upload-web-report` handler's final success return, near line 2081)

**Interfaces:**
- Consumes: `postReportToWebhooks`, `ReportWebhookPostResult` from `../reportWebhooks` (Task 3); `IReportWebhook` from `../../shared/reportWebhooks` (Task 1); existing in-scope `store`, `sendWebUploadStatus`, `payload`, `reportUrl`, `replayDataUrl`.
- Produces: the handler's success return gains `webhookResults: ReportWebhookPostResult[]` (renderer may ignore it; no renderer change required).

- [ ] **Step 1: Add imports**

At the top of `src/main/handlers/githubHandlers.ts`, alongside the existing imports:

```ts
import { postReportToWebhooks, type ReportWebhookPostResult } from '../reportWebhooks';
import type { IReportWebhook } from '../../shared/reportWebhooks';
```

- [ ] **Step 2: Insert the posting block**

In the `upload-web-report` handler, the publish path currently ends:

```ts
            sendWebUploadStatus('Complete', 'Web report uploaded.', 100);
            return { success: true, url: reportUrl, replayDataUrl: replayDataUrl ?? null };
```

Replace those two lines with:

```ts
            sendWebUploadStatus('Complete', 'Web report uploaded.', 100);

            // Post the report link to configured report webhooks. Failures are
            // logged into the upload status feed but never fail the upload.
            let webhookResults: ReportWebhookPostResult[] = [];
            const reportWebhooks = (store.get('reportWebhooks', []) as IReportWebhook[])
                .filter((hook) => hook && hook.enabled && hook.url);
            if (reportWebhooks.length > 0) {
                sendWebUploadStatus('Posting', `Posting report link to ${reportWebhooks.length} Discord webhook${reportWebhooks.length === 1 ? '' : 's'}...`, 100);
                webhookResults = await postReportToWebhooks({
                    webhooks: reportWebhooks,
                    meta: payload.meta,
                    stats: payload.stats,
                    url: reportUrl,
                    onStatus: (line, isWarn) => sendWebUploadStatus(isWarn ? 'Warning' : 'Posting', line, 100),
                    persistForumFlag: (id, isForum) => {
                        const current = store.get('reportWebhooks', []) as IReportWebhook[];
                        store.set('reportWebhooks', current.map((hook) => (hook.id === id ? { ...hook, isForum } : hook)));
                    },
                });
            }
            return { success: true, url: reportUrl, replayDataUrl: replayDataUrl ?? null, webhookResults };
```

IMPORTANT: there is an earlier `return { success: true, url: reportUrl, replayDataUrl: replayDataUrl ?? null };` right after `sendWebUploadStatus('Complete', 'No changes to upload.', 100);` (near line 2038). **Leave that one untouched** — the no-changes path must not post.

(`'Warning'` as the stage string is deliberate: `useWebUpload` styles a log line as a warning when `stage.toLowerCase() === 'warning'`.)

- [ ] **Step 3: Typecheck and lint**

Run: `npm run validate`
Expected: clean. (No dedicated handler test — the posting logic is covered by Task 3's module tests; this block is wiring.)

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/githubHandlers.ts
git commit -m "feat(main): post report link to report webhooks after web publish

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Settings persistence plumbing

**Files:**
- Modify: `src/main/handlers/settingsHandlers.ts` (get-settings object ~line 150, export-settings object ~line 222)
- Modify: `src/main/index.ts` (`applySettings`, signature at line 1616 and body near the `webhooks` block at line 1643)
- Modify: `src/renderer/SettingsView.tsx` (`IMPORT_SETTING_META` array, lines 73–91)

**Interfaces:**
- Consumes: electron-store key `reportWebhooks` (array of `IReportWebhook`).
- Produces: `getSettings()` result includes `reportWebhooks: IReportWebhook[]`; `saveSettings({ reportWebhooks })` persists it; settings export/import carries it. Task 6's card relies on all three.

- [ ] **Step 1: Return the key from get-settings and export-settings**

In `src/main/handlers/settingsHandlers.ts`, both the `get-settings` return object (the one beginning `logDirectory: store.get('logDirectory', null),` near line 142) and the `export-settings` `settings` object (near line 222) contain the line:

```ts
            webhooks: store.get('webhooks', []),
```

In **both** objects, add directly below that line:

```ts
            reportWebhooks: store.get('reportWebhooks', []),
```

- [ ] **Step 2: Persist in applySettings**

In `src/main/index.ts`, the `applySettings` parameter type (line 1616) includes `webhooks?: any[]`. Add `reportWebhooks?: any[]` to the type, e.g. change `webhooks?: any[], selectedWebhookId?: string | null,` to `webhooks?: any[], reportWebhooks?: any[], selectedWebhookId?: string | null,`.

The body (near line 1643) contains:

```ts
            if (settings.webhooks !== undefined) {
                store.set('webhooks', settings.webhooks);
            }
```

Add directly below that block:

```ts
            if (settings.reportWebhooks !== undefined) {
                store.set('reportWebhooks', settings.reportWebhooks);
            }
```

- [ ] **Step 3: Add the import/export metadata row**

In `src/renderer/SettingsView.tsx`, `IMPORT_SETTING_META` (lines 73–91) has the row:

```ts
    { key: 'webhooks', label: 'Webhook List', description: 'Saved webhook entries.', section: 'Discord' },
```

Add directly below it:

```ts
    { key: 'reportWebhooks', label: 'Report Webhooks', description: 'Webhooks that receive the web report link after upload.', section: 'Discord' },
```

- [ ] **Step 4: Verify**

Run: `npm run validate`
Expected: clean.
Run: `npx vitest run src/main/__tests__/settingsMigration.test.ts --maxWorkers=2`
Expected: PASS (guards against accidental breakage of the settings module).

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/settingsHandlers.ts src/main/index.ts src/renderer/SettingsView.tsx
git commit -m "feat(settings): persist reportWebhooks through settings IPC and import/export

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Report Webhooks settings card

**Files:**
- Create: `src/renderer/ReportWebhooksCard.tsx`
- Modify: `src/renderer/SettingsView.tsx` (load/save state + render the card in the `github-pages` section, whose `sectionId="github-pages"` wrapper is at line ~1582)
- Test: `src/renderer/__tests__/ReportWebhooksCard.test.tsx`

**Interfaces:**
- Consumes: `IReportWebhook`, `makeDefaultReportWebhook`, `renderReportTitle`, `DEFAULT_REPORT_TITLE_TEMPLATE` from `../shared/reportWebhooks` (Task 1); `getSettings().reportWebhooks` + `saveSettings({ reportWebhooks })` (Task 5).
- Produces: `ReportWebhooksCard({ reportWebhooks, onChange }: { reportWebhooks: IReportWebhook[]; onChange: (next: IReportWebhook[]) => void })` — pure controlled component; SettingsView owns load/save.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/ReportWebhooksCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportWebhooksCard } from '../ReportWebhooksCard';
import { DEFAULT_REPORT_TITLE_TEMPLATE, makeDefaultReportWebhook } from '../../shared/reportWebhooks';

const entry = (over = {}) => ({
    ...makeDefaultReportWebhook('w1'),
    name: 'Guild Forum',
    url: 'https://discord.com/api/webhooks/1/abc',
    ...over,
});

describe('ReportWebhooksCard', () => {
    it('renders an empty state with an add button', () => {
        render(<ReportWebhooksCard reportWebhooks={[]} onChange={() => {}} />);
        expect(screen.getByText(/add webhook/i)).toBeTruthy();
    });

    it('adds a default entry', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[]} onChange={onChange} />);
        fireEvent.click(screen.getByText(/add webhook/i));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0];
        expect(next).toHaveLength(1);
        expect(next[0]).toMatchObject({ enabled: true, isForum: false, titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE });
    });

    it('toggles enabled and forum flags immediately', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={onChange} />);
        fireEvent.click(screen.getByLabelText(/enabled/i));
        expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'w1', enabled: false })]);
        fireEvent.click(screen.getByLabelText(/forum channel/i));
        expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'w1', isForum: true })]);
    });

    it('commits text edits on blur', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={onChange} />);
        const nameInput = screen.getByDisplayValue('Guild Forum');
        fireEvent.change(nameInput, { target: { value: 'EWW Reports' } });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(nameInput);
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'w1', name: 'EWW Reports' })]);
    });

    it('shows a live preview of the title template', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ titleTemplate: '{commander} night' })]} onChange={() => {}} />);
        expect(screen.getByText(/Axi Vale night/)).toBeTruthy();
    });

    it('warns on non-discord URLs', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ url: 'https://example.com/hook' })]} onChange={() => {}} />);
        expect(screen.getByText(/doesn't look like a discord webhook/i)).toBeTruthy();
    });

    it('deletes an entry', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={onChange} />);
        fireEvent.click(screen.getByTitle(/remove webhook/i));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../ReportWebhooksCard`.

- [ ] **Step 3: Implement the card**

Create `src/renderer/ReportWebhooksCard.tsx`. Match the SettingsView visual idiom (CSS-variable driven, `rounded-[4px]`, `text-xs` labels — mirror nearby cards in the `github-pages` section):

```tsx
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
    IReportWebhook,
    makeDefaultReportWebhook,
    renderReportTitle,
} from '../shared/reportWebhooks';

const PREVIEW_CTX = {
    sessionStart: new Date(),
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale'],
};

const looksLikeDiscordWebhook = (url: string) =>
    !url || /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\//.test(url);

export function ReportWebhooksCard({
    reportWebhooks,
    onChange,
}: {
    reportWebhooks: IReportWebhook[];
    onChange: (next: IReportWebhook[]) => void;
}) {
    // Local drafts so text fields commit on blur instead of per keystroke.
    const [drafts, setDrafts] = useState<Record<string, Partial<IReportWebhook>>>({});

    const draftValue = (hook: IReportWebhook, key: 'name' | 'url' | 'titleTemplate') =>
        (drafts[hook.id]?.[key] as string | undefined) ?? hook[key];

    const setDraft = (id: string, key: 'name' | 'url' | 'titleTemplate', value: string) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    };

    const commitDraft = (hook: IReportWebhook) => {
        const draft = drafts[hook.id];
        if (!draft) return;
        const next = reportWebhooks.map((entry) =>
            entry.id === hook.id ? { ...entry, ...draft } : entry
        );
        setDrafts((prev) => {
            const { [hook.id]: _dropped, ...rest } = prev;
            return rest;
        });
        onChange(next);
    };

    const patch = (id: string, changes: Partial<IReportWebhook>) => {
        onChange(reportWebhooks.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
    };

    return (
        <div className="rounded-[4px] border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
            <div className="flex items-center justify-between mb-1">
                <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Report Webhooks</div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Every enabled webhook gets the report link after each Upload to Web.
                        Forum channels create a new post titled from the template.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange([...reportWebhooks, makeDefaultReportWebhook(Date.now().toString())])}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-semibold border transition-colors"
                    style={{ background: 'var(--accent-bg)', color: 'var(--text-primary)', borderColor: 'var(--accent-border)' }}
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add Webhook
                </button>
            </div>
            <div className="space-y-3 mt-3">
                {reportWebhooks.map((hook) => {
                    const url = draftValue(hook, 'url');
                    const template = draftValue(hook, 'titleTemplate');
                    return (
                        <div key={hook.id} className="rounded-[4px] border p-3 space-y-2" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Name"
                                    value={draftValue(hook, 'name')}
                                    onChange={(e) => setDraft(hook.id, 'name', e.target.value)}
                                    onBlur={() => commitDraft(hook)}
                                    className="flex-1 min-w-0 rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none"
                                    style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                                />
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        aria-label="Enabled"
                                        checked={hook.enabled}
                                        onChange={(e) => patch(hook.id, { enabled: e.target.checked })}
                                    />
                                    Enabled
                                </label>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        aria-label="Forum channel"
                                        checked={hook.isForum}
                                        onChange={(e) => patch(hook.id, { isForum: e.target.checked })}
                                    />
                                    Forum channel
                                </label>
                                <button
                                    type="button"
                                    title="Remove webhook"
                                    onClick={() => onChange(reportWebhooks.filter((entry) => entry.id !== hook.id))}
                                    className="p-1.5 rounded-[4px] transition-colors"
                                    style={{ color: 'var(--status-error, #f87171)' }}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="https://discord.com/api/webhooks/..."
                                value={url}
                                onChange={(e) => setDraft(hook.id, 'url', e.target.value)}
                                onBlur={() => commitDraft(hook)}
                                className="w-full rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none"
                                style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            />
                            {!looksLikeDiscordWebhook(url) && (
                                <p className="text-[11px]" style={{ color: 'var(--status-warning, #fbbf24)' }}>
                                    This doesn't look like a Discord webhook URL.
                                </p>
                            )}
                            <input
                                type="text"
                                placeholder="{date} - {day_of_week} - {commander}"
                                value={template}
                                onChange={(e) => setDraft(hook.id, 'titleTemplate', e.target.value)}
                                onBlur={() => commitDraft(hook)}
                                className="w-full rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none font-mono"
                                style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                            />
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                Preview: {renderReportTitle(template, PREVIEW_CTX)}
                                <span className="ml-2 opacity-70">
                                    Placeholders: {'{date}'} {'{day_of_week}'} {'{commander}'} {'{commanders}'}
                                </span>
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire into SettingsView**

In `src/renderer/SettingsView.tsx`:

1. Add imports at the top:

```ts
import { ReportWebhooksCard } from './ReportWebhooksCard';
import type { IReportWebhook } from '../shared/reportWebhooks';
```

2. Add state next to the other settings state hooks (near `const [dpsReportToken, setDpsReportToken] = ...`):

```ts
    const [reportWebhooks, setReportWebhooks] = useState<IReportWebhook[]>([]);
```

3. In the settings-load effect (the one that awaits `window.electronAPI.getSettings()` near line 571), where other keys are copied into state, add:

```ts
            if (Array.isArray(settings.reportWebhooks)) {
                setReportWebhooks(settings.reportWebhooks);
            }
```

4. Render the card inside the `github-pages` section (the wrapper with `sectionId="github-pages"` near line 1582). Place it after the section's existing content, as a sibling card:

```tsx
                        <ReportWebhooksCard
                            reportWebhooks={reportWebhooks}
                            onChange={(next) => {
                                setReportWebhooks(next);
                                window.electronAPI?.saveSettings?.({ reportWebhooks: next });
                            }}
                        />
```

- [ ] **Step 6: Verify types, lint, and the renderer suite**

Run: `npm run validate`
Expected: clean.
Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/ReportWebhooksCard.tsx src/renderer/__tests__/ReportWebhooksCard.test.tsx src/renderer/SettingsView.tsx
git commit -m "feat(settings): report webhooks card with template preview

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full-suite verification

**Files:** none new.

**Interfaces:** none — regression gate.

- [ ] **Step 1: Full validation and unit suite**

```bash
npm run validate
npx vitest run --maxWorkers=2
```

Expected: typecheck clean, lint clean, all test files pass (previous count was 145 files / 1154 tests; expect +4 files from Tasks 1, 2, 3, 6).

- [ ] **Step 2: Commit any straggling fixes**

Only if Step 1 surfaced fixes; otherwise nothing to commit.
```
