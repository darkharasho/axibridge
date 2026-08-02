# Report Webhook Title Variables ({account}, {guild}, {guild_tag}) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `{account}` (primary commander's GW2 account), `{guild}` (dominant guild name), and `{guild_tag}` (raw tag) tokens to the report webhook title template.

**Architecture:** The renderer's report meta gains `primaryCommanderAccount` (from the existing commander vote); the main process passes the already-guild-resolved `reportMeta` (instead of raw `payload.meta`) to `postReportToWebhooks`; the shared `renderReportTitle` learns three new tokens. Spec: `docs/superpowers/specs/2026-08-01-report-webhook-title-account-guild-variables-design.md`.

**Tech Stack:** TypeScript, Electron (main + renderer), React, vitest (+ @testing-library/react for the card test).

## Global Constraints

- Missing data renders as `Unknown` — exactly like `{commander}` today (spec decision).
- `{guild_tag}` is the raw tag with no brackets (users compose `[{guild_tag}]` themselves).
- In `renderReportTitle`, `{commanders}` must stay replaced before `{commander}` (`{commander}` is a substring of `{commanders}`). `{guild}` / `{guild_tag}` do not collide (the literal `{guild}` never occurs inside `{guild_tag}`).
- New `ReportTitleContext` fields are **optional** (`?: string`) so each producer can be updated in its own task and the repo stays green after every commit.
- Code style: 4-space indent, match surrounding code. No new dependencies.
- `vitest.config.ts` already caps `maxWorkers: 2` / `maxForks: 2` — plain `npx vitest run <file>` complies with the machine's memory limits.
- Every commit message ends with the trailer line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Shared template tokens in `renderReportTitle`

**Files:**
- Modify: `src/shared/reportWebhooks.ts` (interface at lines 21–26, renderer at lines 43–56)
- Test: `src/shared/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ReportTitleContext` gains optional `primaryCommanderAccount?: string`, `guildName?: string`, `guildTag?: string`; `renderReportTitle(template, ctx)` replaces `{account}`, `{guild}`, `{guild_tag}`, each falling back to `'Unknown'` when the field is absent or empty. Tasks 3 and 4 rely on these exact field names.

- [ ] **Step 1: Write the failing tests**

In `src/shared/__tests__/reportWebhooks.test.ts`, add after the `ctx` definition (line 20):

```ts
const fullCtx = {
    ...ctx,
    primaryCommanderAccount: 'Axi.1234',
    guildName: 'Axius Imperium',
    guildTag: 'AXI',
};
```

Replace the existing `it('renders every placeholder', ...)` test (lines 23–26) with:

```ts
    it('renders every placeholder', () => {
        const out = renderReportTitle(
            '{date} | {day_of_week} | {commander} | {commanders} | {account} | {guild} | {guild_tag}',
            fullCtx
        );
        expect(out).toBe(
            `${expectedDate} | ${expectedDay} | Axi Vale | Axi Vale, Red Tag | Axi.1234 | Axius Imperium | AXI`
        );
    });
```

Add two new tests inside the `describe('renderReportTitle', ...)` block:

```ts
    it('composes a bracketed guild tag', () => {
        expect(renderReportTitle('[{guild_tag}] {guild} — {account}', fullCtx))
            .toBe('[AXI] Axius Imperium — Axi.1234');
    });

    it('falls back to Unknown when account and guild are missing or empty', () => {
        expect(renderReportTitle('{account} / {guild} / {guild_tag}', ctx))
            .toBe('Unknown / Unknown / Unknown');
        const emptyStrings = { ...ctx, primaryCommanderAccount: '', guildName: '', guildTag: '' };
        expect(renderReportTitle('{account} / {guild} / {guild_tag}', emptyStrings))
            .toBe('Unknown / Unknown / Unknown');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts`
Expected: FAIL — the new tokens are left literal (e.g. output contains `{account}` instead of `Axi.1234`).

- [ ] **Step 3: Implement the tokens**

In `src/shared/reportWebhooks.ts`, replace the `ReportTitleContext` interface (lines 21–26) with:

```ts
export interface ReportTitleContext {
    /** First fight's start time — names the raid night even past midnight. */
    sessionStart: Date;
    primaryCommander: string;
    commanders: string[];
    /** Primary commander's GW2 account name (e.g. "Axi.1234"). */
    primaryCommanderAccount?: string;
    /** Squad's dominant guild, resolved via the GW2 API; absent/empty when unresolved. */
    guildName?: string;
    /** Raw tag without brackets so templates can write [{guild_tag}]. */
    guildTag?: string;
}
```

In `renderReportTitle`, after the `const commanders = ...` line, add:

```ts
    const account = ctx.primaryCommanderAccount || 'Unknown';
    const guildName = ctx.guildName || 'Unknown';
    const guildTag = ctx.guildTag || 'Unknown';
```

and replace the return chain with:

```ts
    return effective
        .replaceAll('{date}', date)
        .replaceAll('{day_of_week}', dayOfWeek)
        .replaceAll('{commanders}', commanders)
        .replaceAll('{commander}', commander)
        .replaceAll('{account}', account)
        .replaceAll('{guild_tag}', guildTag)
        .replaceAll('{guild}', guildName)
        .trim();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/__tests__/reportWebhooks.test.ts`
Expected: PASS (all tests in the file, including the untouched `selectReportWebhooks` / `makeDefaultReportWebhook` suites).

- [ ] **Step 5: Commit**

```bash
git add src/shared/reportWebhooks.ts src/shared/__tests__/reportWebhooks.test.ts
git commit -m "feat(webhooks): add account and guild title template tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Commander identity util + report meta wiring

**Files:**
- Modify: `src/renderer/stats/utils/computePrimaryCommander.ts`
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts:5` (import) and `:133-143` (meta build)
- Test: `src/renderer/__tests__/computePrimaryCommander.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `computePrimaryCommanderIdentity(detailsList: any[]): { name: string; account: string }` (both `''` when nobody tagged; `account` is `''` when the winner had no account field). `computePrimaryCommander(detailsList: any[]): string` keeps its exact current behavior as a wrapper. Report meta gains `primaryCommanderAccount: string`, which Task 3 reads from `opts.meta`.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/__tests__/computePrimaryCommander.test.ts`, change the import (line 2) to:

```ts
import { computePrimaryCommander, computePrimaryCommanderIdentity } from '../stats/utils/computePrimaryCommander';
```

Append a new describe block at the end of the file:

```ts
describe('computePrimaryCommanderIdentity', () => {
    it('returns the winning commander name and account', () => {
        const logs = [
            { players: [{ name: 'Axi Vale', account: 'X.1', hasCommanderTag: true }] },
            { players: [{ name: 'Axi Vale', account: 'X.1', hasCommanderTag: true }] },
            { players: [{ name: 'Red', account: 'Y.2', hasCommanderTag: true }] },
        ];
        expect(computePrimaryCommanderIdentity(logs)).toEqual({ name: 'Axi Vale', account: 'X.1' });
    });

    it('returns empty strings when nobody tagged', () => {
        expect(computePrimaryCommanderIdentity([])).toEqual({ name: '', account: '' });
        expect(computePrimaryCommanderIdentity([{ players: [{ name: 'A' }] }])).toEqual({ name: '', account: '' });
    });

    it('returns an empty account when the winner has no account field', () => {
        expect(computePrimaryCommanderIdentity([log('Axi')])).toEqual({ name: 'Axi', account: '' });
    });

    it('matches computePrimaryCommander for the name', () => {
        const logs = [log('Zed'), log('Axi')];
        expect(computePrimaryCommanderIdentity(logs).name).toBe(computePrimaryCommander(logs));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/computePrimaryCommander.test.ts`
Expected: FAIL — `computePrimaryCommanderIdentity` is not exported.

- [ ] **Step 3: Implement the identity function**

Replace the entire contents of `src/renderer/stats/utils/computePrimaryCommander.ts` with:

```ts
/** Most-frequent commander across a session's logs: votes keyed by account (name fallback),
 *  one per log per account; ties broken alphabetically by first-seen display name.
 *  Returns empty strings when nobody tagged. */
export const computePrimaryCommanderIdentity = (
    detailsList: any[]
): { name: string; account: string } => {
    const votes = new Map<string, number>(); // voteKey -> vote count
    const displayNames = new Map<string, string>(); // voteKey -> first-seen display name
    const accounts = new Map<string, string>(); // voteKey -> first-seen account name

    detailsList.forEach((details) => {
        const players = (details?.players || []) as any[];
        const seenThisLog = new Set<string>(); // track vote keys seen in this log

        players.forEach((player) => {
            if (player?.notInSquad) return;
            if (!player?.hasCommanderTag) return;

            // Vote key is account first, then name; skip if neither
            const voteKey = player?.account || player?.name;
            if (!voteKey) return;

            // Track first-seen display name for this vote key
            if (!displayNames.has(voteKey)) {
                const displayName = player?.name || player?.account || 'Unknown';
                displayNames.set(voteKey, displayName);
            }
            if (!accounts.has(voteKey) && typeof player?.account === 'string' && player.account) {
                accounts.set(voteKey, player.account);
            }

            // One vote per key per log
            if (seenThisLog.has(voteKey)) return;
            seenThisLog.add(voteKey);
            votes.set(voteKey, (votes.get(voteKey) || 0) + 1);
        });
    });

    let bestKey = '';
    let bestCount = 0;

    Array.from(votes.entries())
        .sort((a, b) => {
            const displayA = displayNames.get(a[0]) || 'Unknown';
            const displayB = displayNames.get(b[0]) || 'Unknown';
            return displayA.localeCompare(displayB);
        })
        .forEach(([key, count]) => {
            if (count > bestCount) {
                bestKey = key;
                bestCount = count;
            }
        });

    if (!bestKey) return { name: '', account: '' };
    return {
        name: displayNames.get(bestKey) || 'Unknown',
        account: accounts.get(bestKey) || '',
    };
};

/** Back-compat name-only view of computePrimaryCommanderIdentity. */
export const computePrimaryCommander = (detailsList: any[]): string =>
    computePrimaryCommanderIdentity(detailsList).name;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/computePrimaryCommander.test.ts`
Expected: PASS — all existing `computePrimaryCommander` tests (vote counting, tie-break, dedupe) plus the new identity suite.

- [ ] **Step 5: Wire the account into report meta**

In `src/renderer/stats/hooks/useStatsUploads.ts`:

Change line 5 from:

```ts
import { computePrimaryCommander } from '../utils/computePrimaryCommander';
```

to:

```ts
import { computePrimaryCommanderIdentity } from '../utils/computePrimaryCommander';
```

In the meta build, immediately before the `return {` (currently line 133), add:

```ts
        const commanderIdentity = computePrimaryCommanderIdentity(detailsList);
```

and replace the line `primaryCommander: computePrimaryCommander(detailsList),` (currently line 137) with:

```ts
            primaryCommander: commanderIdentity.name,
            primaryCommanderAccount: commanderIdentity.account,
```

- [ ] **Step 6: Typecheck and re-run tests**

Run: `npm run typecheck && npx vitest run src/renderer/__tests__/computePrimaryCommander.test.ts`
Expected: typecheck clean (confirms no other caller of the old import broke); tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/utils/computePrimaryCommander.ts src/renderer/stats/hooks/useStatsUploads.ts src/renderer/__tests__/computePrimaryCommander.test.ts
git commit -m "feat(webhooks): expose primary commander account in report meta

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Main process — build ctx from meta and pass the resolved guild

**Files:**
- Modify: `src/main/reportWebhooks.ts:44-49` (ctx build)
- Modify: `src/main/handlers/githubHandlers.ts:2109` (one line: `meta: payload.meta,` → `meta: reportMeta,`)
- Test: `src/main/__tests__/reportWebhooks.test.ts`

**Interfaces:**
- Consumes: `ReportTitleContext` optional fields from Task 1; `meta.primaryCommanderAccount` from Task 2; `meta.guild = { id, name, tag }` (already stamped on `reportMeta` by the `upload-web-report` handler at `githubHandlers.ts:1719` via `resolveGuild` — name/tag are `null` when resolution failed).
- Produces: webhook titles rendered with account + guild. No signature changes.

- [ ] **Step 1: Write the failing tests**

In `src/main/__tests__/reportWebhooks.test.ts`, add inside the `describe('postReportToWebhooks', ...)` block:

```ts
    it('renders account and guild tokens from meta', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const richMeta = {
            ...meta,
            primaryCommanderAccount: 'Axi.1234',
            guild: { id: 'G1', name: 'Axius Imperium', tag: 'AXI' },
        };
        await postReportToWebhooks({
            webhooks: [hook({ titleTemplate: '[{guild_tag}] {guild} — {account}' })],
            meta: richMeta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.embeds[0].title).toBe('[AXI] Axius Imperium — Axi.1234');
    });

    it('renders Unknown guild tokens when resolution failed (null name/tag)', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        const failedMeta = { ...meta, guild: { id: 'G1', name: null, tag: null } };
        await postReportToWebhooks({
            webhooks: [hook({ titleTemplate: '{guild}/{guild_tag}' })],
            meta: failedMeta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.embeds[0].title).toBe('Unknown/Unknown');
    });

    it('renders Unknown for account and guild when meta lacks them entirely', async () => {
        const fetchImpl = vi.fn(async () => okResponse);
        await postReportToWebhooks({
            webhooks: [hook({ titleTemplate: '{account} {guild} {guild_tag}' })],
            meta, stats, url: 'u', fetchImpl,
        });
        const callArgs = fetchImpl.mock.calls[0] as any[];
        const body = JSON.parse((callArgs[1] as RequestInit).body as string);
        expect(body.embeds[0].title).toBe('Unknown Unknown Unknown');
    });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts`
Expected: the first two new tests FAIL (guild/account values from meta are not threaded into the ctx, so the title shows `Unknown` instead of `Axius Imperium`). Note: the third test ("meta lacks them entirely") already passes after Task 1 — it is a regression guard, not the TDD driver.

- [ ] **Step 3: Thread the fields through the ctx**

In `src/main/reportWebhooks.ts`, replace the ctx build (lines 44–49) with:

```ts
    const parsedStart = new Date(opts.meta?.dateStart || Date.now());
    const ctx = {
        sessionStart: Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart,
        primaryCommander: String(opts.meta?.primaryCommander || ''),
        primaryCommanderAccount: String(opts.meta?.primaryCommanderAccount || ''),
        commanders: Array.isArray(opts.meta?.commanders) ? opts.meta.commanders.map(String) : [],
        guildName: String(opts.meta?.guild?.name || ''),
        guildTag: String(opts.meta?.guild?.tag || ''),
    };
```

(`null` name/tag → `''` here → `Unknown` at render.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/reportWebhooks.test.ts`
Expected: PASS — all new and pre-existing tests (plain embed, forum self-heal both directions, failure isolation, rejecting fetch).

- [ ] **Step 5: Pass reportMeta to the poster**

In `src/main/handlers/githubHandlers.ts`, inside the `upload-web-report` handler's webhook block (line ~2107), change:

```ts
                webhookResults = await postReportToWebhooks({
                    webhooks: reportWebhooks,
                    meta: payload.meta,
```

to:

```ts
                webhookResults = await postReportToWebhooks({
                    webhooks: reportWebhooks,
                    meta: reportMeta,
```

`reportMeta` is `{ ...payload.meta, appVersion }` with `.guild` stamped at line 1719, so every field the poster reads (`dateStart`, `dateLabel`, `primaryCommander`, `primaryCommanderAccount`, `commanders`) is still present. This is the only call site of `postReportToWebhooks` (verify with `rg -n "postReportToWebhooks" src/`).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/main/reportWebhooks.ts src/main/handlers/githubHandlers.ts src/main/__tests__/reportWebhooks.test.ts
git commit -m "feat(webhooks): thread account and resolved guild into report webhook titles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Settings card — preview values and placeholder hint

**Files:**
- Modify: `src/renderer/ReportWebhooksCard.tsx:9-13` (PREVIEW_CTX) and `:139-144` (hint line)
- Test: `src/renderer/__tests__/ReportWebhooksCard.test.tsx`

**Interfaces:**
- Consumes: `renderReportTitle` + optional ctx fields from Task 1.
- Produces: user-visible preview/documentation only; nothing downstream.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/__tests__/ReportWebhooksCard.test.tsx`, add inside the `describe` block:

```tsx
    it('previews account and guild tokens with sample values', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry({ titleTemplate: '[{guild_tag}] {guild} — {account}' })]} onChange={() => {}} />);
        expect(screen.getByText(/\[AXI\] Axius Imperium — Axi\.1234/)).toBeTruthy();
    });

    it('lists the new placeholders in the hint', () => {
        render(<ReportWebhooksCard reportWebhooks={[entry()]} onChange={() => {}} />);
        const hint = screen.getByText(/placeholders:/i);
        expect(hint.textContent).toContain('{account}');
        expect(hint.textContent).toContain('{guild}');
        expect(hint.textContent).toContain('{guild_tag}');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx`
Expected: both new tests FAIL (preview renders literal tokens; hint lacks the new placeholders).

- [ ] **Step 3: Update the card**

In `src/renderer/ReportWebhooksCard.tsx`, replace `PREVIEW_CTX` (lines 9–13) with:

```tsx
const PREVIEW_CTX = {
    sessionStart: new Date(),
    primaryCommander: 'Axi Vale',
    commanders: ['Axi Vale'],
    primaryCommanderAccount: 'Axi.1234',
    guildName: 'Axius Imperium',
    guildTag: 'AXI',
};
```

Replace the placeholder hint span (lines 141–143) with:

```tsx
                                <span className="ml-2 opacity-70">
                                    Placeholders: {'{date}'} {'{day_of_week}'} {'{commander}'} {'{commanders}'} {'{account}'} {'{guild}'} {'{guild_tag}'}
                                </span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/ReportWebhooksCard.test.tsx`
Expected: PASS — new tests plus all pre-existing card tests (add/toggle/blur-commit/preview/warn/delete).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ReportWebhooksCard.tsx src/renderer/__tests__/ReportWebhooksCard.test.tsx
git commit -m "feat(webhooks): preview and document account/guild title tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Full validation sweep

**Files:**
- No new changes expected; fixes only if something surfaces.

**Interfaces:**
- Consumes: everything above.
- Produces: green `validate` + all four touched test files passing in one run.

- [ ] **Step 1: Run all touched test files together**

Run:

```bash
npx vitest run src/shared/__tests__/reportWebhooks.test.ts src/main/__tests__/reportWebhooks.test.ts src/renderer/__tests__/computePrimaryCommander.test.ts src/renderer/__tests__/ReportWebhooksCard.test.tsx
```

Expected: PASS (4 files).

- [ ] **Step 2: Typecheck + lint**

Run: `npm run validate`
Expected: clean (ESLint runs with `--max-warnings 0`).

- [ ] **Step 3: Commit any stragglers**

Only if Steps 1–2 forced fixes:

```bash
git add -A src/
git commit -m "fix(webhooks): address validation fallout from title token work

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
