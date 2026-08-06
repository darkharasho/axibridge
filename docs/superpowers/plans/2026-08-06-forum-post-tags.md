# Report Webhook Forum Post Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report webhooks flagged as forum channels apply a user-configured, fixed set of Discord forum tag IDs (`applied_tags`) to every report post.

**Architecture:** One new optional field on `IReportWebhook` (`forumTagIds` — the raw string as typed), a shared lenient snowflake parser, an `applied_tags` payload key gated on `thread_name` in `postReportToWebhooks` with a tag-drop self-heal retry, and a forum-only text input with live hints in `ReportWebhooksCard`. Spec: `docs/superpowers/specs/2026-08-06-forum-post-tags-design.md`.

**Tech Stack:** TypeScript, React, vitest (+jsdom / @testing-library for the card test). No new dependencies.

## Global Constraints

- Run vitest with limited parallelism, always: `npx vitest run <files> --maxWorkers=2` (machine runs heavy apps alongside dev; global CLAUDE.md rule).
- `applied_tags` is only ever sent alongside `thread_name`, and the key is omitted entirely when there are no IDs — never send `applied_tags: []`.
- `MAX_FORUM_POST_TAGS = 5` (Discord's per-post limit). The parser does NOT cap; consumers do: posting slices to 5, the UI shows a "first 5 are used" note when more parse.
- Parser accepts 15–21 digit runs (snowflakes are 17–20 today; margin for drift). Implementation is `match(/\d+/g)` + length filter, so an over-long digit run (e.g. 30 digits) yields nothing rather than splitting into bogus IDs.
- `forumTagIds` is typed OPTIONAL (`forumTagIds?: string`) — legacy persisted hooks lack the field; every consumer treats `undefined` as `''`. No migration. (`makeDefaultReportWebhook` still sets `''` for new hooks.)
- At most 3 POSTs per hook: initial, one forum-flag flip, one tag-drop. The `thread_name` 400 check takes precedence over the `applied_tags` 400 check.
- A tags-dropped success is still `ok: true`; degradation is conveyed only via the `onStatus` warning line `Posted to <label> without tags — check its forum tag IDs.` `ReportWebhookPostResult` is unchanged.
- Exact user-facing copy (tests match on it):
  - input placeholder: `Forum tag IDs, comma-separated (optional)`
  - no-parse warning: `No tag IDs recognized — IDs are 17–20 digit numbers.`
  - count line: `N tag(s) will be applied.`
  - overflow line: `N tag IDs found — Discord allows 5 per post; the first 5 are used.`
  - how-to line: `Get IDs in Discord: User Settings → Advanced → Developer Mode, then right-click a tag in the forum → Copy Tag ID.`

---

### Task 1: Shared field + `parseForumTagIds`

**Files:**
- Modify: `src/shared/reportWebhooks.ts` (interface at lines 1–8, `makeDefaultReportWebhook` at lines 12–19)
- Test: `src/shared/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Tasks 2 and 3 import these from `../shared/reportWebhooks` / `../../shared/reportWebhooks`):
  - `IReportWebhook.forumTagIds?: string`
  - `MAX_FORUM_POST_TAGS: number` (= 5)
  - `parseForumTagIds(raw?: string): string[]` — deduped, order-preserving, UNCAPPED

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/__tests__/reportWebhooks.test.ts` (add `MAX_FORUM_POST_TAGS, parseForumTagIds` to the existing import from `'../reportWebhooks'`):

```ts
describe('parseForumTagIds', () => {
    it('parses comma, space, and newline separated ids', () => {
        expect(parseForumTagIds('111111111111111111, 222222222222222222'))
            .toEqual(['111111111111111111', '222222222222222222']);
        expect(parseForumTagIds('111111111111111111 222222222222222222\n333333333333333333'))
            .toEqual(['111111111111111111', '222222222222222222', '333333333333333333']);
    });

    it('extracts ids embedded in prose', () => {
        expect(parseForumTagIds('WvW (111111111111111111) and PvE: 222222222222222222!'))
            .toEqual(['111111111111111111', '222222222222222222']);
    });

    it('ignores short and over-long digit runs and empty input', () => {
        expect(parseForumTagIds('tag 5, id 12345678901234')).toEqual([]); // 14 digits: too short
        expect(parseForumTagIds('123456789012345678901234567890')).toEqual([]); // 30 digits: not split into bogus ids
        expect(parseForumTagIds('')).toEqual([]);
        expect(parseForumTagIds('   ')).toEqual([]);
        expect(parseForumTagIds(undefined)).toEqual([]);
    });

    it('accepts 15- and 21-digit boundaries', () => {
        expect(parseForumTagIds('123456789012345')).toEqual(['123456789012345']); // 15
        expect(parseForumTagIds('123456789012345678901')).toEqual(['123456789012345678901']); // 21
    });

    it('dedupes preserving order and does not cap', () => {
        const six = ['111111111111111111', '222222222222222222', '333333333333333333',
            '444444444444444444', '555555555555555555', '666666666666666666'];
        expect(parseForumTagIds([six[0], six[1], six[0], ...six.slice(2)].join(',')))
            .toEqual(six);
        expect(MAX_FORUM_POST_TAGS).toBe(5);
    });
});
```

Also update the existing `makeDefaultReportWebhook` test's expected object (it uses exact `toEqual`) — add `forumTagIds: ''`:

```ts
describe('makeDefaultReportWebhook', () => {
    it('creates an enabled non-forum entry with the default template', () => {
        expect(makeDefaultReportWebhook('123')).toEqual({
            id: '123',
            name: '',
            url: '',
            enabled: true,
            isForum: false,
            titleTemplate: DEFAULT_REPORT_TITLE_TEMPLATE,
            forumTagIds: '',
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: FAIL — `parseForumTagIds` / `MAX_FORUM_POST_TAGS` are not exported (import error), and the `makeDefaultReportWebhook` equality fails once imports resolve.

- [ ] **Step 3: Implement**

In `src/shared/reportWebhooks.ts`, add `forumTagIds?: string;` to `IReportWebhook` after `titleTemplate: string;`, add `forumTagIds: '',` to the object returned by `makeDefaultReportWebhook`, and add below the interface:

```ts
/** Discord allows at most 5 tags on a forum post. The parser itself does not
 *  cap so the UI can warn about overflow; consumers slice to this. */
export const MAX_FORUM_POST_TAGS = 5;

/** Extracts snowflake-looking tag ids from free text: 15–21 digit runs
 *  (snowflakes are 17–20 today; margin for drift), deduped, order preserved.
 *  An over-long run yields nothing rather than splitting into bogus ids. */
export const parseForumTagIds = (raw?: string): string[] => {
    const matches = String(raw ?? '').match(/\d+/g) ?? [];
    return [...new Set(matches.filter((id) => id.length >= 15 && id.length <= 21))];
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS (all existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/shared/reportWebhooks.ts src/shared/__tests__/reportWebhooks.test.ts
git commit -m "feat: add forumTagIds field and snowflake parser to report webhooks"
```

---

### Task 2: `applied_tags` in posting + tag-drop self-heal

**Files:**
- Modify: `src/main/reportWebhooks.ts` (imports at line 1; the per-hook loop body, currently lines 55–115)
- Test: `src/main/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes (from Task 1, via `../shared/reportWebhooks`): `parseForumTagIds(raw?: string): string[]`, `MAX_FORUM_POST_TAGS`, `IReportWebhook.forumTagIds?: string`.
- Produces: no new exports. Behavior contract for callers: unchanged signature; success line `Posted report to <label>.` OR warning line `Posted to <label> without tags — check its forum tag IDs.` via `onStatus`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('postReportToWebhooks', ...)` block of `src/main/__tests__/reportWebhooks.test.ts` (helpers `hook`, `meta`, `stats`, `okResponse`, `errorResponse` already exist at the top of the file):

```ts
    const TAG_A = '111111111111111111';
    const TAG_B = '222222222222222222';

    it('sends applied_tags for a forum hook with tag ids', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: `${TAG_A}, ${TAG_B}` })],
            meta, stats, url: 'u', fetchImpl,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const body = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(body.thread_name).toBe('Axi Vale');
        expect(body.applied_tags).toEqual([TAG_A, TAG_B]);
    });

    it('never sends applied_tags for a non-forum hook even when the field is set', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ isForum: false, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl,
        });
        const body = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(body.thread_name).toBeUndefined();
        expect(body.applied_tags).toBeUndefined();
    });

    it('omits the applied_tags key for legacy hooks and garbage-only text', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const legacy = hook({ isForum: true });
        delete (legacy as any).forumTagIds;
        await postReportToWebhooks({
            webhooks: [legacy, { ...hook({ isForum: true, forumTagIds: 'raid night 123' }), id: 'h2' }],
            meta, stats, url: 'u', fetchImpl,
        });
        const first = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        const second = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect('applied_tags' in first).toBe(false);
        expect('applied_tags' in second).toBe(false);
    });

    it('dedupes and caps applied_tags at 5', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const six = ['111111111111111111', '222222222222222222', '333333333333333333',
            '444444444444444444', '555555555555555555', '666666666666666666'];
        const withDupe = [six[0], six[1], six[0], ...six.slice(2)].join(', ');
        await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: withDupe })],
            meta, stats, url: 'u', fetchImpl,
        });
        const body = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(body.applied_tags).toEqual(six.slice(0, 5));
    });

    it('retries without tags when Discord rejects applied_tags', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"applied_tags": ["Unknown tag"]}'))
            .mockResolvedValueOnce(okResponse);
        const onStatus = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl, onStatus,
        });
        expect(results[0]).toEqual({ id: 'h1', name: 'Guild', ok: true });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const retryBody = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBe('Axi Vale');
        expect(retryBody.applied_tags).toBeUndefined();
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('without tags'), true);
    });

    it('flip-to-forum self-heal carries tags, then drops them on a tag 400', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"message": "Webhooks posted to forum channels must have a thread_name or thread_id"}'))
            .mockResolvedValueOnce(errorResponse(400, '{"applied_tags": ["Unknown tag"]}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const onStatus = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: false, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl, persistForumFlag, onStatus,
        });
        expect(results[0].ok).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        const first = JSON.parse(((fetchImpl.mock.calls[0] as any[])[1] as RequestInit).body as string);
        expect(first.thread_name).toBeUndefined();
        expect(first.applied_tags).toBeUndefined();
        const flipped = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect(flipped.thread_name).toBe('Axi Vale');
        expect(flipped.applied_tags).toEqual([TAG_A]);
        const third = JSON.parse(((fetchImpl.mock.calls[2] as any[])[1] as RequestInit).body as string);
        expect(third.thread_name).toBe('Axi Vale');
        expect(third.applied_tags).toBeUndefined();
        expect(persistForumFlag).toHaveBeenCalledWith('h1', true);
        expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('without tags'), true);
    });

    it('flip-to-regular drops thread_name and tags together', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(errorResponse(400, '{"thread_name": ["Thread name is not allowed in this channel"]}'))
            .mockResolvedValueOnce(okResponse);
        const persistForumFlag = vi.fn();
        const results = await postReportToWebhooks({
            webhooks: [hook({ isForum: true, forumTagIds: TAG_A })],
            meta, stats, url: 'u', fetchImpl, persistForumFlag,
        });
        expect(results[0].ok).toBe(true);
        const retryBody = JSON.parse(((fetchImpl.mock.calls[1] as any[])[1] as RequestInit).body as string);
        expect(retryBody.thread_name).toBeUndefined();
        expect(retryBody.applied_tags).toBeUndefined();
        expect(persistForumFlag).toHaveBeenCalledWith('h1', false);
    });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: 4 of the new tests FAIL — `sends applied_tags`, `dedupes and caps`, and both tag-400 retry tests (`applied_tags` missing from bodies / `ok: false` because current code doesn't retry on tag errors). The 3 negative tests (`never sends for non-forum`, `omits for legacy/garbage`, `flip-to-regular`) already pass vacuously — they're regression guards. All pre-existing tests still PASS.

- [ ] **Step 3: Implement**

In `src/main/reportWebhooks.ts`:

1. Line 1 import becomes:

```ts
import { IReportWebhook, MAX_FORUM_POST_TAGS, parseForumTagIds, renderReportTitle } from '../shared/reportWebhooks';
```

2. Inside the `for (const hook of opts.webhooks)` loop, next to `let title = ''; let embed: any;`, add:

```ts
        const tagIds = parseForumTagIds(hook.forumTagIds).slice(0, MAX_FORUM_POST_TAGS);
```

3. Replace the `post` helper's signature and body construction (keep the fetch/timeout part unchanged):

```ts
        const post = async (withThreadName: boolean, withTags: boolean) => {
            const body: any = {
                username: 'AxiBridge',
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                embeds: [embed],
            };
            if (withThreadName) {
                body.thread_name = title.slice(0, 100);
                if (withTags && tagIds.length > 0) body.applied_tags = tagIds;
            }
```

4. Replace the attempt/self-heal/result block inside the `try` (currently `let attempt = await post(hook.isForum);` through the `else` that pushes the HTTP error) with:

```ts
            let usedForum = hook.isForum;
            let droppedTags = false;
            let attempt = await post(usedForum, true);
            // Forum self-heal: a 400 mentioning thread_name means the forum flag
            // is wrong in whichever direction we sent. Retry once flipped and
            // persist the corrected flag on success.
            if (!attempt.ok && attempt.status === 400 && /thread[_ ]?name/i.test(attempt.text)) {
                usedForum = !usedForum;
                attempt = await post(usedForum, true);
            }
            // Tag self-heal: a 400 mentioning applied_tags means a bad or deleted
            // tag id. Drop tags so the report link still lands; the ids stay in
            // settings for the user to fix.
            if (!attempt.ok && attempt.status === 400 && /applied_tags/i.test(attempt.text)) {
                droppedTags = true;
                attempt = await post(usedForum, false);
            }
            if (attempt.ok) {
                if (usedForum !== hook.isForum) opts.persistForumFlag?.(hook.id, usedForum);
                results.push({ id: hook.id, name: hook.name, ok: true });
                if (droppedTags) {
                    opts.onStatus?.(`Posted to ${label} without tags — check its forum tag IDs.`, true);
                } else {
                    opts.onStatus?.(`Posted report to ${label}.`);
                }
            } else {
                const error = `HTTP ${attempt.status}${attempt.text ? `: ${attempt.text.slice(0, 120)}` : ''}`;
                results.push({ id: hook.id, name: hook.name, ok: false, error });
                opts.onStatus?.(`Failed to post to ${label} — ${error}`, true);
            }
```

(The `catch` block below stays as is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts --maxWorkers=2`
Expected: PASS — all pre-existing tests (plain embed, thread_name truncation, both flip self-heals, failure isolation, title tokens) plus the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/main/reportWebhooks.ts src/main/__tests__/reportWebhooks.test.ts
git commit -m "feat: apply forum tags when posting report webhooks, with tag-drop self-heal"
```

---

### Task 3: Tag IDs input in ReportWebhooksCard

**Files:**
- Modify: `src/renderer/ReportWebhooksCard.tsx`
- Test: `src/renderer/__tests__/ReportWebhooksCard.test.tsx`

**Interfaces:**
- Consumes (from Task 1, via `../../shared/reportWebhooks`): `parseForumTagIds`, `MAX_FORUM_POST_TAGS`, `IReportWebhook.forumTagIds?: string`.
- Produces: no exports; the card writes `forumTagIds` through the existing `onChange` array, which SettingsView already persists verbatim.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('ReportWebhooksCard', ...)` block of `src/renderer/__tests__/ReportWebhooksCard.test.tsx` (the `entry` helper already exists):

```tsx
    it('hides the tag ids field for regular channels', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={() => {}} />);
        expect(screen.queryByPlaceholderText(/forum tag ids/i)).toBeNull();
    });

    it('shows the tag ids field for forum channels and commits on blur', () => {
        const onChange = vi.fn();
        render(<ReportWebhooksCard reportWebhooks={[entry({ isForum: true })]} onChange={onChange} />);
        const input = screen.getByPlaceholderText(/forum tag ids/i);
        fireEvent.change(input, { target: { value: '111111111111111111' } });
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'w1', forumTagIds: '111111111111111111' }),
        ]);
    });

    it('shows the parsed tag count', () => {
        render(<ReportWebhooksCard
            reportWebhooks={[entry({ isForum: true, forumTagIds: '111111111111111111 222222222222222222' })]}
            onChange={() => {}}
        />);
        expect(screen.getByText(/2 tags will be applied/i)).toBeTruthy();
    });

    it('warns when the text parses to no ids', () => {
        render(<ReportWebhooksCard
            reportWebhooks={[entry({ isForum: true, forumTagIds: 'raid-night' })]}
            onChange={() => {}}
        />);
        expect(screen.getByText(/no tag ids recognized/i)).toBeTruthy();
    });

    it('notes the 5-tag limit when more than 5 parse', () => {
        const six = ['111111111111111111', '222222222222222222', '333333333333333333',
            '444444444444444444', '555555555555555555', '666666666666666666'].join(', ');
        render(<ReportWebhooksCard
            reportWebhooks={[entry({ isForum: true, forumTagIds: six })]}
            onChange={() => {}}
        />);
        expect(screen.getByText(/first 5 are used/i)).toBeTruthy();
    });

    it('mentions how to copy tag ids', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ isForum: true })]} onChange={() => {}} />);
        expect(screen.getByText(/copy tag id/i)).toBeTruthy();
    });

    it('tolerates legacy hooks without the field', () => {
        const legacy = entry({ isForum: true });
        delete (legacy as any).forumTagIds;
        render(<ReportWebhooksCard reportWebhooks={[legacy]} onChange={() => {}} />);
        const input = screen.getByPlaceholderText(/forum tag ids/i) as HTMLInputElement;
        expect(input.value).toBe('');
    });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: 6 of the new tests FAIL (no such placeholder/text exists yet). `hides the tag ids field for regular channels` passes vacuously — it's a regression guard. Pre-existing card tests still PASS.

- [ ] **Step 3: Implement**

In `src/renderer/ReportWebhooksCard.tsx`:

1. Extend the shared import:

```tsx
import {
    IReportWebhook,
    MAX_FORUM_POST_TAGS,
    makeDefaultReportWebhook,
    parseForumTagIds,
    renderReportTitle,
} from '../shared/reportWebhooks';
```

2. Widen the draft key union in BOTH `draftValue` and `setDraft` to `'name' | 'url' | 'titleTemplate' | 'forumTagIds'`, and make `draftValue` tolerate the optional field:

```tsx
    const draftValue = (hook: IReportWebhook, key: 'name' | 'url' | 'titleTemplate' | 'forumTagIds') =>
        (drafts[hook.id]?.[key] as string | undefined) ?? hook[key] ?? '';

    const setDraft = (id: string, key: 'name' | 'url' | 'titleTemplate' | 'forumTagIds', value: string) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    };
```

3. In the `.map((hook) => { ... })` callback, next to `const url = ...; const template = ...;`, add:

```tsx
                    const rawTags = draftValue(hook, 'forumTagIds');
                    const parsedTags = parseForumTagIds(rawTags);
```

4. After the title-template preview `<p>` (the one starting `Preview: ...`, lines 142–147), still inside the hook card `<div>`, add:

```tsx
                            {hook.isForum && (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Forum tag IDs, comma-separated (optional)"
                                        value={rawTags}
                                        onChange={(e) => setDraft(hook.id, 'forumTagIds', e.target.value)}
                                        onBlur={() => commitDraft(hook)}
                                        className="w-full rounded-[4px] border px-2 py-1.5 text-xs bg-transparent focus:outline-none font-mono"
                                        style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                                    />
                                    {rawTags.trim().length > 0 && parsedTags.length === 0 && (
                                        <p className="text-[11px]" style={{ color: 'var(--status-warning, #fbbf24)' }}>
                                            No tag IDs recognized — IDs are 17–20 digit numbers.
                                        </p>
                                    )}
                                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                        {parsedTags.length > MAX_FORUM_POST_TAGS
                                            ? `${parsedTags.length} tag IDs found — Discord allows 5 per post; the first 5 are used. `
                                            : parsedTags.length > 0
                                                ? `${parsedTags.length} tag${parsedTags.length === 1 ? '' : 's'} will be applied. `
                                                : ''}
                                        Get IDs in Discord: User Settings → Advanced → Developer Mode, then right-click a tag in the forum → Copy Tag ID.
                                    </p>
                                </>
                            )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: PASS (all pre-existing + 7 new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ReportWebhooksCard.tsx src/renderer/__tests__/ReportWebhooksCard.test.tsx
git commit -m "feat: forum tag IDs input in report webhooks card"
```

---

### Task 4: Full validation sweep

**Files:**
- No new files; fixes only if something fails.

**Interfaces:**
- Consumes: everything above.
- Produces: green `npm run validate` and green webhook-related suites.

- [ ] **Step 1: Run the three affected suites together**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts src/main/__tests__/reportWebhooks.test.ts src/renderer/__tests__/ReportWebhooksCard.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run validate`
Expected: clean. Likely failure mode if not: a missed `'forumTagIds'` in one of the two draft-key unions, or an unused import — fix and re-run.

- [ ] **Step 3: Commit (only if fixes were needed)**

```bash
git add -u src/
git commit -m "fix: validation fixes for forum tag IDs feature"
```
