# Settings Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Settings from fifteen flat sections into five categories with a nested rail, bring Discord destinations and the log directory into Settings, and make an enabled destination genuinely fan out rather than being a radio in disguise.

**Architecture:** Two independent halves. The **main-process half** replaces the single `selectedWebhookId` destination with an `enabledWebhookIds: string[]` list, a plural resolver, and a per-destination send loop in `DiscordNotifier`. The **renderer half** adds a pure `settingsTaxonomy.ts` data module, a nested `SettingsNav`, category paging inside the existing `SettingsView.tsx` scroll container, and a `DestinationsCard` extracted from `WebhookModal.tsx` and mounted by both the modal and Settings. The halves meet only at two props (`enabledWebhookIds`, `onSetDestinationEnabled`).

**Tech Stack:** TypeScript, React 18, Electron, electron-store, vitest + jsdom, @testing-library/react, framer-motion, lucide-react, axios, form-data.

**Spec:** `docs/superpowers/specs/2026-09-18-settings-reorganization-design.md`

## Global Constraints

- **The word "embed" must not appear in user-visible Settings copy.** It names a Discord API object. Section titles become "Summary Sections" and "Top Stats Lists". Internal ids (`embed-summary`, `embed-top`) and store keys (`embedStatSettings`) are unchanged — they are persisted identifiers.
- **`IMPORT_SETTING_META` `key` values are never renamed.** They are persisted identifiers in exported settings files; renaming one breaks importing an older export. Only the `section` labels change.
- **The legacy `discordWebhookUrl` fallback keeps its exact current rule:** honoured only when `webhooks` is *genuinely empty*. An empty `enabledWebhookIds` over a non-empty `webhooks` resolves to **no destinations**, never to the fallback. This guards a bug the resolver has already shipped once — see its header comment.
- **`selectedWebhookId` keeps being written** as the first enabled id (or `null`). `settingsHandlers.ts` returns it to the renderer and the export/import list reads it. Same mirror discipline `applyDiscordDestination` already applies to `discordWebhookUrl`.
- **The map slice PNG and screenshots are built once per report, before `sendLog`.** They already are — `index.ts` calls `mapSliceFor(...)` and passes the result in. A second enabled destination must not add a second tile fetch or a second renderer round trip.
- **Sends are sequential, never parallel** — two destinations must not double the instantaneous rate against Discord.
- **One destination failing never suppresses another's send.**
- Run vitest with `--maxWorkers=2` (global CLAUDE.md). Example: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestinationResolver.test.ts`.
- `npm run validate` (typecheck + lint, `--max-warnings 0`) must pass before the final commit of every task.

## Architectural Rulings Made While Planning

These resolve conflicts between the spec's wording and what the code actually
does. They are binding; do not re-litigate them mid-task.

**Ruling A — "payload built once" means the *expensive* payload, not the embed JSON.**
`this.isBridge` is read at six points *inside* embed construction
(`discord.ts:782, 827, 858, 951, 991, 1288`): a bridge destination renders
custom class emoji, a webhook renders fallback text. The embed JSON therefore
*cannot* be shared between a bridge and a webhook destination — sharing it
would post the wrong emoji to one of them. The costly artifacts (map slice
PNG, screenshots, parsed `jsonDetails`) are already built once in `index.ts`
and passed *into* `sendLog`, so the spec's cost-control requirement is
satisfied as-is. `resend` is called once per destination with that shared
input, and `isBridge` becomes a per-call parameter instead of a field getter.

**Ruling B — category panes hide with `display: none`; every section stays mounted.**
Settings search scans *rendered DOM text*
(`SettingsView.tsx:880-891` reads `el.textContent`). Unmounting non-selected
categories would make search blind to four-fifths of Settings. `textContent`
works fine on a `display: none` subtree, so hiding rather than unmounting
keeps search, `querySelector('#id')`, and the existing `data-settings-section`
machinery working with minimal churn to a 3,656-line file. Two consequences
handled explicitly in Task 5: `getBoundingClientRect()` on a hidden element
returns zeros, so `scrollToSettingsSection` must select the category and
scroll on the *next animation frame*; and the scroll-position tracker must
skip hidden sections (`offsetParent === null`).

**Ruling C — `DestinationsCard` is controlled and commits immediately; the modal loses "Save Changes".**
`WebhookModal` today keeps a `localWebhooks` draft committed by a "Save
Changes" button — except Link and Unlink, which commit immediately (see the
`handleUnlink` comment: the draft model already caused a
closed-modal-still-sending bug). A card mounted inline in Settings has no
"Save Changes" moment. Rather than run two commit models in one component,
`DestinationsCard` is fully controlled: every edit calls `onSave` right away,
in both mounts. The modal keeps its shell, its X, and its Close button, and
drops the "Save Changes" button. This removes the half-committed state class
the existing comment documents.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/renderer/settings/settingsTaxonomy.ts` | Pure data: five categories, sixteen subsections, `categoryIdForSection`, `flattenedSectionIds`, `stepSectionId`. No React, no DOM. |
| `src/renderer/settings/SettingsNav.tsx` | The nested accordion rail and the search-result list. Presentational; owns no persistence. |
| `src/renderer/settings/DestinationsCard.tsx` | The destinations editor extracted from `WebhookModal.tsx`. Controlled; owns no persistence. |
| `src/renderer/settings/__tests__/settingsTaxonomy.test.ts` | Taxonomy invariants. |
| `src/renderer/settings/__tests__/DestinationsCard.test.tsx` | Card behaviour under both mounts. |

**Modified:**

| File | Change |
|---|---|
| `src/main/discordDestinationResolver.ts` | Plural resolution, `enabledWebhookIds` migration read, per-destination failure handling. |
| `src/main/discord.ts` | `setDestinations`, per-destination send loop, `SendResult[]`, `isBridge` as a parameter. |
| `src/main/index.ts` | Two `processLogFile` send sites, boot apply, `applySettings`. |
| `src/main/handlers/settingsHandlers.ts` | `enabledWebhookIds` in both settings payloads. |
| `src/renderer/SettingsView.tsx` | Category paging, taxonomy import, renamed titles, `IMPORT_SETTING_META` labels, new destination + log-directory cards. |
| `src/renderer/WebhookModal.tsx` | Reduced to a shell around `DestinationsCard`. |
| `src/renderer/app/AppLayout.tsx` | Header dropdown becomes multi-select; passes new props to `SettingsView`. |
| `src/renderer/App.tsx` | Owns `enabledWebhookIds`; passes destination + log-directory state down. |
| `src/renderer/app/hooks/useSettings.ts` | `enabledWebhookIds` state, hydrated from the settings payload. |

---

## Task 1: Plural destination resolution in the main process

**Files:**
- Modify: `src/main/discordDestinationResolver.ts`
- Modify: `src/main/discord.ts:41-43` (the `DiscordDestination` type only)
- Test: `src/main/__tests__/discordDestinationResolver.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `DiscordDestination` gains a required `id: string` field on both variants.
  - `readEnabledWebhookIds(store: DestinationStore): string[]`
  - `resolveDiscordDestinations(store: DestinationStore): DiscordDestination[]`
  - `shouldSendDiscord(store: DestinationStore): boolean` (unchanged signature, plural body)
  - `applyDiscordDestinations(store: DestinationStore, discord: DiscordNotifier | null): void`
  - `resolveDiscordDestination` and `applyDiscordDestination` are **deleted**.

- [ ] **Step 1: Write the failing tests**

Append to `src/main/__tests__/discordDestinationResolver.test.ts`. The existing
`FakeStore`, `bridgeEntry` and `webhookEntry` fixtures at the top of that file
are reused — do not redefine them.

```ts
describe('readEnabledWebhookIds (migration)', () => {
    it('derives the enabled list from selectedWebhookId when absent', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], selectedWebhookId: 'webhook-1' });
        expect(readEnabledWebhookIds(store)).toEqual(['webhook-1']);
    });

    it('derives an empty list when selectedWebhookId is null', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], selectedWebhookId: null });
        expect(readEnabledWebhookIds(store)).toEqual([]);
    });

    it('prefers a stored enabledWebhookIds over selectedWebhookId', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry, bridgeEntry],
            selectedWebhookId: 'webhook-1',
            enabledWebhookIds: ['bridge-1']
        });
        expect(readEnabledWebhookIds(store)).toEqual(['bridge-1']);
    });

    it('treats a stored empty array as "everything off", not as absent', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry],
            selectedWebhookId: 'webhook-1',
            enabledWebhookIds: []
        });
        expect(readEnabledWebhookIds(store)).toEqual([]);
    });
});

describe('resolveDiscordDestinations', () => {
    it('resolves an unmigrated install to exactly its selected destination', () => {
        const store = new FakeStore({ webhooks: [webhookEntry, bridgeEntry], selectedWebhookId: 'webhook-1' });
        expect(resolveDiscordDestinations(store)).toEqual([
            { id: 'webhook-1', kind: 'webhook', url: webhookEntry.url }
        ]);
    });

    it('resolves two enabled destinations, in webhooks[] order', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry, bridgeEntry],
            enabledWebhookIds: ['bridge-1', 'webhook-1']
        });
        expect(resolveDiscordDestinations(store)).toEqual([
            { id: 'webhook-1', kind: 'webhook', url: webhookEntry.url },
            { id: 'bridge-1', kind: 'bridge', relayUrl: bridgeEntry.relayUrl, token: bridgeEntry.token }
        ]);
    });

    it('resolves to NO destinations — never the legacy URL — when everything is turned off', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry],
            enabledWebhookIds: [],
            discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/x'
        });
        expect(resolveDiscordDestinations(store)).toEqual([]);
        expect(shouldSendDiscord(store)).toBe(false);
    });

    it('still honours the legacy discordWebhookUrl when webhooks is genuinely empty', () => {
        const store = new FakeStore({
            webhooks: [],
            discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/x'
        });
        expect(resolveDiscordDestinations(store)).toEqual([
            { id: 'legacy', kind: 'webhook', url: 'https://discord.com/api/webhooks/legacy/x' }
        ]);
    });

    it('skips a bridge entry whose token was revoked, keeping the other destination', () => {
        const revoked = { ...bridgeEntry, token: undefined };
        const store = new FakeStore({
            webhooks: [webhookEntry, revoked],
            enabledWebhookIds: ['webhook-1', 'bridge-1']
        });
        expect(resolveDiscordDestinations(store)).toEqual([
            { id: 'webhook-1', kind: 'webhook', url: webhookEntry.url }
        ]);
    });

    it('ignores an enabled id that no longer matches any webhook entry', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], enabledWebhookIds: ['webhook-1', 'ghost'] });
        expect(resolveDiscordDestinations(store)).toEqual([
            { id: 'webhook-1', kind: 'webhook', url: webhookEntry.url }
        ]);
    });
});

describe('applyDiscordDestinations', () => {
    it('mirrors the first enabled webhook URL and the first enabled id', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry, bridgeEntry],
            enabledWebhookIds: ['webhook-1', 'bridge-1']
        });
        const discord = { setDestinations: vi.fn() } as any;
        applyDiscordDestinations(store, discord);
        expect(store.get('discordWebhookUrl')).toBe(webhookEntry.url);
        expect(store.get('selectedWebhookId')).toBe('webhook-1');
        expect(discord.setDestinations).toHaveBeenCalledWith([
            { id: 'webhook-1', kind: 'webhook', url: webhookEntry.url },
            { id: 'bridge-1', kind: 'bridge', relayUrl: bridgeEntry.relayUrl, token: bridgeEntry.token }
        ]);
    });

    it('clears both mirrors when nothing is enabled', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], enabledWebhookIds: [] });
        const discord = { setDestinations: vi.fn() } as any;
        applyDiscordDestinations(store, discord);
        expect(store.get('discordWebhookUrl')).toBeNull();
        expect(store.get('selectedWebhookId')).toBeNull();
        expect(discord.setDestinations).toHaveBeenCalledWith([]);
    });

    it('clears the legacy URL mirror when only a bridge is enabled', () => {
        const store = new FakeStore({
            webhooks: [bridgeEntry],
            enabledWebhookIds: ['bridge-1'],
            discordWebhookUrl: 'https://discord.com/api/webhooks/stale/x'
        });
        applyDiscordDestinations(store, { setDestinations: vi.fn() } as any);
        expect(store.get('discordWebhookUrl')).toBeNull();
    });
});
```

Update the file's import block at the top to:

```ts
import {
    applyDiscordDestinations,
    handleDiscordSendResults,
    readEnabledWebhookIds,
    resolveDiscordDestinations,
    shouldSendDiscord,
    shouldBuildMapSlice,
    type DestinationStore,
    type StoredWebhookEntry
} from '../discordDestinationResolver';
```

Delete the existing `describe('resolveDiscordDestination', ...)` and
`describe('applyDiscordDestination', ...)` blocks — the cases above are their
plural successors and cover the same ground. Leave
`describe('shouldBuildMapSlice', ...)` untouched. Leave the existing
`handleDiscordSendResult` describe block in place for now; Task 3 replaces it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestinationResolver.test.ts`
Expected: FAIL — `readEnabledWebhookIds is not a function`, and TypeScript errors on the missing exports.

- [ ] **Step 3: Add `id` to `DiscordDestination`**

In `src/main/discord.ts`, replace the type at line 41:

```ts
export type DiscordDestination =
    | { id: string; kind: 'webhook'; url: string }
    | { id: string; kind: 'bridge'; relayUrl: string; token: string };
```

`id` is the `webhooks[]` entry id, so a `SendResult` can be attributed back to
the row that produced it. The synthetic id `'legacy'` is used for the
pre-`webhooks[]` `discordWebhookUrl` fallback, which has no entry.

- [ ] **Step 4: Implement the plural resolver**

In `src/main/discordDestinationResolver.ts`, replace `resolveDiscordDestination`
and `applyDiscordDestination` wholesale with the following. Keep the existing
`StoredWebhookEntry`, `DestinationStore`, `shouldBuildMapSlice` and
`DestinationWindow` declarations exactly as they are.

```ts
/**
 * The ids of every destination the user has switched on.
 *
 * `enabledWebhookIds` did not exist before the per-destination toggle. An
 * install upgrading into it has the key entirely absent, and must keep
 * sending exactly where it sent before — so an absent key derives its value
 * from the old single `selectedWebhookId`. A *present* empty array is the
 * opposite case and must be honoured verbatim: it means the user switched
 * everything off. Distinguishing "absent" from "empty" is the whole job of
 * this function; `store.get('enabledWebhookIds', undefined)` is the only
 * read that can tell them apart.
 */
export function readEnabledWebhookIds(store: DestinationStore): string[] {
    const stored = store.get('enabledWebhookIds', undefined);
    if (Array.isArray(stored)) {
        return stored.filter((id): id is string => typeof id === 'string');
    }
    const selectedWebhookId = store.get('selectedWebhookId', null) as string | null;
    return selectedWebhookId ? [selectedWebhookId] : [];
}

/** Map one stored entry to a destination, or null when it is unusable. */
function toDestination(entry: StoredWebhookEntry): DiscordDestination | null {
    if (entry.kind === 'bridge') {
        // A bridge entry whose token was revoked keeps its row (so the user
        // can re-link it) but cannot send. It is skipped, not an error.
        return entry.relayUrl && entry.token
            ? { id: entry.id, kind: 'bridge', relayUrl: entry.relayUrl, token: entry.token }
            : null;
    }
    return entry.url ? { id: entry.id, kind: 'webhook', url: entry.url } : null;
}

/**
 * Resolve every enabled Discord destination from the store's `webhooks[]`
 * plus `enabledWebhookIds`. Shared by the send-gate check, the `applySettings`
 * re-derivation, and the app-boot restore so all three agree on what
 * "configured" means.
 *
 * Results come back in `webhooks[]` order, not in `enabledWebhookIds` order:
 * the list the user sees in Settings is `webhooks[]`, and the send order
 * should match it regardless of the order rows were toggled on.
 *
 * The legacy `discordWebhookUrl` is honoured ONLY when `webhooks` is
 * genuinely empty — a store that has never been migrated to the webhooks[]
 * model. Once `webhooks` is non-empty, an empty resolution means the user
 * has explicitly switched everything off, which must resolve to `[]`, not
 * fall back. The old "fall back whenever nothing resolves" reading fed
 * `applyDiscordDestinations`' own mirror write straight back into this
 * fallback the moment the user picked Disabled, silently re-arming a
 * destination the UI showed as off.
 */
export function resolveDiscordDestinations(store: DestinationStore): DiscordDestination[] {
    const webhooks = store.get('webhooks', []) as StoredWebhookEntry[];

    if (webhooks.length === 0) {
        const legacyUrl = store.get('discordWebhookUrl', null);
        if (typeof legacyUrl === 'string' && legacyUrl.length > 0) {
            return [{ id: 'legacy', kind: 'webhook', url: legacyUrl }];
        }
        return [];
    }

    const enabled = new Set(readEnabledWebhookIds(store));
    return webhooks
        .filter((entry) => enabled.has(entry.id))
        .map(toDestination)
        .filter((dest): dest is DiscordDestination => dest !== null);
}

/**
 * Whether a report should be sent to Discord at all — the exact same
 * resolution the destinations come from, so the gate and the destination
 * list are incapable of disagreeing.
 */
export function shouldSendDiscord(store: DestinationStore): boolean {
    return resolveDiscordDestinations(store).length > 0;
}

/**
 * Apply `resolveDiscordDestinations()` to the live notifier and keep both
 * single-value mirrors in sync.
 *
 * `discordWebhookUrl`: settingsHandlers.ts still returns it to the renderer
 * as "Legacy single webhook URL", so a bridge-only (or empty) resolution must
 * clear it rather than leaving a stale URL this same resolver could
 * resurrect later.
 *
 * `selectedWebhookId`: settingsHandlers.ts returns it and the export/import
 * list reads it. It mirrors the FIRST enabled id, so a store read by older
 * code still points at a destination that is genuinely on.
 */
export function applyDiscordDestinations(store: DestinationStore, discord: DiscordNotifier | null): void {
    const destinations = resolveDiscordDestinations(store);
    const firstWebhook = destinations.find((dest) => dest.kind === 'webhook');
    store.set('discordWebhookUrl', firstWebhook?.kind === 'webhook' ? firstWebhook.url : null);
    store.set('selectedWebhookId', destinations[0]?.id ?? null);
    discord?.setDestinations(destinations);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestinationResolver.test.ts`
Expected: the new describes PASS. `handleDiscordSendResult` tests and the
`index.ts` typecheck still fail — Tasks 2 and 3 close those. That is expected
at this step; do not "fix" them here.

- [ ] **Step 6: Commit**

```bash
git add src/main/discordDestinationResolver.ts src/main/discord.ts src/main/__tests__/discordDestinationResolver.test.ts
git commit -m "feat(discord): resolve every enabled destination, not just one

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Fan the send loop out across destinations

**Files:**
- Modify: `src/main/discord.ts:364-494` (`DiscordNotifier` head, `postPayload`, `postForm`, `postEmbedsWithImage`, `sendLog`, `resend`) and the six `this.isBridge` reads at lines 519, 782, 827, 858, 951, 991, 1288
- Test: `src/main/__tests__/discordDestination.test.ts`

**Interfaces:**
- Consumes: `DiscordDestination` with its `id` field (Task 1).
- Produces:
  - `DiscordNotifier.setDestinations(dests: DiscordDestination[]): void` — replaces `setDestination`.
  - `DiscordNotifier.sendLog(logData, jsonDetails?): Promise<SendResult[]>` — was `Promise<SendResult>`.
  - `SendResult` gains `destinationId: string` on both the `ok: true` and `ok: false` variants.
  - `setWebhookUrl(url)` is **deleted** — it is the last pre-`webhooks[]` setter and has no callers once `applyDiscordDestinations` is the only path in.

- [ ] **Step 1: Write the failing tests**

Create or extend `src/main/__tests__/discordDestination.test.ts`. Read the
existing file first and reuse its axios mock rather than adding a second one.
If it has none, add this at the top of the file:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { DiscordNotifier } from '../discord';

vi.mock('axios');
const mockedPost = vi.mocked(axios.post);

const webhookDest = { id: 'w1', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/1/x' };
const secondWebhookDest = { id: 'w2', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/2/y' };

const logData = { permalink: 'https://dps.report/abc', id: 'log-1', filePath: '/tmp/a.zevtc' };
```

Then append these cases:

```ts
describe('sendLog fan-out', () => {
    beforeEach(() => {
        mockedPost.mockReset();
        mockedPost.mockResolvedValue({ status: 204, data: {} } as any);
    });

    it('posts once per enabled destination and returns one result each', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);

        const results = await notifier.sendLog(logData);

        expect(results).toEqual([
            { ok: true, destinationId: 'w1' },
            { ok: true, destinationId: 'w2' }
        ]);
        expect(mockedPost).toHaveBeenCalledTimes(2);
        expect(mockedPost.mock.calls[0][0]).toBe(webhookDest.url);
        expect(mockedPost.mock.calls[1][0]).toBe(secondWebhookDest.url);
    });

    it('posts sequentially — the second call starts only after the first settles', async () => {
        const order: string[] = [];
        mockedPost.mockImplementation(async (url: any) => {
            order.push(`start:${url}`);
            await new Promise((resolve) => setTimeout(resolve, 0));
            order.push(`end:${url}`);
            return { status: 204, data: {} } as any;
        });
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);

        await notifier.sendLog(logData);

        expect(order).toEqual([
            `start:${webhookDest.url}`, `end:${webhookDest.url}`,
            `start:${secondWebhookDest.url}`, `end:${secondWebhookDest.url}`
        ]);
    });

    it('keeps sending to the second destination when the first fails unrecoverably', async () => {
        mockedPost.mockImplementation(async (url: any) => {
            if (url === webhookDest.url) {
                const error: any = new Error('revoked');
                error.response = { status: 401 };
                throw error;
            }
            return { status: 204, data: {} } as any;
        });
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);

        const results = await notifier.sendLog(logData);

        expect(results).toEqual([
            { ok: false, destinationId: 'w1', reason: 'revoked', message: 'This link was revoked — pair again.' },
            { ok: true, destinationId: 'w2' }
        ]);
    });

    it('returns an empty result list when nothing is enabled', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([]);

        expect(await notifier.sendLog(logData)).toEqual([]);
        expect(mockedPost).not.toHaveBeenCalled();
    });

    it('reuses the caller-supplied map slice PNG for every destination', async () => {
        const notifier = new DiscordNotifier();
        notifier.setDestinations([webhookDest, secondWebhookDest]);
        const mapSlicePng = new Uint8Array([1, 2, 3]);

        await notifier.sendLog({ ...logData, mapSlicePng }, { players: [], durationMS: 1000 });

        // The PNG is an input, not something sendLog builds: two posts, one buffer.
        expect(mockedPost).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestination.test.ts`
Expected: FAIL — `notifier.setDestinations is not a function`.

- [ ] **Step 3: Replace the single-destination state with a list**

In `src/main/discord.ts`, replace lines 365-383 (from `private destination`
through the `isBridge` getter) with:

```ts
    private destinations: DiscordDestination[] = [];
    private embedStatSettings: IEmbedStatSettings = DEFAULT_EMBED_STATS;
    private disruptionMethod: DisruptionMethod = DEFAULT_DISRUPTION_METHOD;

    constructor() {
    }

    public setDestinations(dests: DiscordDestination[]) {
        this.destinations = dests;
    }
```

Delete `setWebhookUrl` and the `isBridge` getter entirely.

- [ ] **Step 4: Thread the destination through the post helpers**

Replace the three post helpers so each takes the destination it is posting to.
`isBridge` becomes a plain local derived from that argument.

```ts
    /** Post an embed/content payload to one destination. */
    private async postPayload(dest: DiscordDestination, payload: Record<string, unknown>): Promise<void> {
        if (dest.kind === 'webhook') {
            await axios.post(dest.url, {
                username: "AxiBridge",
                avatar_url: DISCORD_WEBHOOK_AVATAR_URL,
                ...payload
            });
            return;
        }
        // A bot cannot override username/avatar_url — bridged reports post as the
        // bot itself, and the relay rejects unknown keys.
        await axios.post(`${dest.relayUrl}/bridge/report`, payload, {
            headers: { Authorization: `Bearer ${dest.token}` }
        });
    }

    /** Post a multipart (PNG attachment) payload to one destination. */
    private async postForm(dest: DiscordDestination, form: FormData): Promise<void> {
        if (dest.kind === 'webhook') {
            await axios.post(dest.url, form, { headers: form.getHeaders() });
            return;
        }
        await axios.post(`${dest.relayUrl}/bridge/report`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bearer ${dest.token}` }
        });
    }

    /**
     * Post embeds plus a PNG attachment referenced as `attachment://slice.png`.
     *
     * Only the `attachment://` scheme is used: the relay's whitelist accepts
     * nothing else, deliberately, so a paired client cannot make the bot
     * render an arbitrary remote image.
     */
    private async postEmbedsWithImage(dest: DiscordDestination, embeds: any[], png: Buffer): Promise<void> {
        const payload = buildSlicePayloadJson(embeds, dest.kind === 'bridge');

        const form = new FormData();
        form.append('payload_json', JSON.stringify(payload));
        form.append('file', png, { filename: 'slice.png', contentType: 'image/png' });
        await this.postForm(dest, form);
    }
```

- [ ] **Step 5: Make `resend` destination-scoped**

Change `resend`'s signature (line 496) to take the destination first:

```ts
    private async resend(dest: DiscordDestination, logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, imageBuffers?: Uint8Array[], suppressContent?: boolean, mode?: 'image' | 'embed', splitEnemiesByTeam?: boolean, mapSlicePng?: Uint8Array }, jsonDetails?: any): Promise<void> {
        const isBridge = dest.kind === 'bridge';
```

Then inside `resend`'s body, mechanically replace every `this.isBridge` with
the local `isBridge`, and pass `dest` to each post call:

| Line (pre-edit) | Was | Becomes |
|---|---|---|
| 519 | `if (!this.isBridge) {` | `if (!isBridge) {` |
| 544 | `await this.postForm(form);` | `await this.postForm(dest, form);` |
| 782 | `if (this.isBridge) {` | `if (isBridge) {` |
| 827 | `if (this.isBridge) {` | `if (isBridge) {` |
| 858 | `(this.isBridge` | `(isBridge` |
| 951 | `if (this.isBridge) return ...` | `if (isBridge) return ...` |
| 991 | `this.isBridge && classDisplay === 'emoji'` | `isBridge && classDisplay === 'emoji'` |
| 1288 | `const isBridge = this.isBridge;` | **delete this line** — the outer `isBridge` local already shadows it; leaving both is a redeclaration error |
| 1369 | `await this.postEmbedsWithImage(embeds, slicePng);` | `await this.postEmbedsWithImage(dest, embeds, slicePng);` |
| 1384 | `await this.postPayload({ embeds });` | `await this.postPayload(dest, { embeds });` |
| 1387 | `await this.postPayload({ embeds });` | `await this.postPayload(dest, { embeds });` |
| 1392 | `await this.postPayload({` | `await this.postPayload(dest, {` |

Verify none remain: `grep -n "this.isBridge\|this.postPayload({\|this.postForm(form)\|this.postEmbedsWithImage(embeds" src/main/discord.ts` must print nothing.

The per-destination embed rebuild is deliberate (Ruling A): a bridge renders
custom class emoji and a webhook renders fallback text, so one shared embed
object would post the wrong emoji to one of them. The expensive artifacts
(`mapSlicePng`, `imageBuffers`, `jsonDetails`) are inputs, built once by the
caller.

- [ ] **Step 6: Add `destinationId` to `SendResult` and loop in `sendLog`**

Replace the `SendResult` type (line 47):

```ts
export type SendResult =
    | { ok: true; destinationId: string }
    | { ok: false; destinationId: string; reason: SendFailureReason; message: string };
```

`classify` currently returns the failure shape without an id. Leave its body
alone and give it the id at the call site. Replace `sendLog` (lines 462-494)
with:

```ts
    public async sendLog(logData: { permalink: string, id: string, filePath: string, imageBuffer?: Uint8Array, imageBuffers?: Uint8Array[], suppressContent?: boolean, mode?: 'image' | 'embed', splitEnemiesByTeam?: boolean, mapSlicePng?: Uint8Array }, jsonDetails?: any): Promise<SendResult[]> {
        if (this.destinations.length === 0) {
            console.log("No Discord destination configured, skipping notification.");
            return [];
        }

        const results: SendResult[] = [];
        // Sequential, never Promise.all: two enabled destinations must not
        // double the instantaneous request rate against Discord, and a
        // rate-limit backoff on one must not run concurrently with another's
        // post.
        for (const dest of this.destinations) {
            results.push(await this.sendToDestination(dest, logData, jsonDetails));
        }
        return results;
    }

    /** One destination's send, with the retry policy the single-destination
     *  path used to own. A failure here is returned, never thrown, so one
     *  dead destination cannot suppress the rest of the loop. */
    private async sendToDestination(dest: DiscordDestination, logData: Parameters<DiscordNotifier['sendLog']>[0], jsonDetails?: any): Promise<SendResult> {
        try {
            await this.resend(dest, logData, jsonDetails);
            return { ok: true, destinationId: dest.id };
        } catch (error) {
            const result = { ...this.classify(error), destinationId: dest.id };
            if (result.reason === 'rate-limited' || result.reason === 'network') {
                const rawRetryAfter = String((error as any)?.response?.headers?.['retry-after'] ?? '').trim();
                const parsedRetryAfter = rawRetryAfter === '' ? NaN : Number(rawRetryAfter);
                const waited = Number.isFinite(parsedRetryAfter) && parsedRetryAfter >= 0 ? parsedRetryAfter : 2;
                await new Promise(resolve => setTimeout(resolve, waited * 1000));
                try {
                    await this.resend(dest, logData, jsonDetails);
                    return { ok: true, destinationId: dest.id };
                } catch (retryError) {
                    return { ...this.classify(retryError), destinationId: dest.id };
                }
            }
            // Never log the raw error: it carries `config.headers.Authorization`
            // with the bridge token verbatim (`util.inspect`, which
            // `console.error` uses, serializes it in full), and 401/403 —
            // the exact non-retry branch that reaches here — is the first
            // thing a revoked/forbidden bridge link hits.
            console.error("Failed to send Discord notification:", (error as any)?.message || error);
            return result;
        }
    }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestination.test.ts src/main/__tests__/discordMapSlice.test.ts src/main/__tests__/reportEmbed.test.ts`
Expected: PASS. If `discordMapSlice.test.ts` or `reportEmbed.test.ts` call
`setDestination` or assert a bare `SendResult`, update those call sites to
`setDestinations([...])` and index into the returned array — the behaviour
under test is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/main/discord.ts src/main/__tests__/
git commit -m "feat(discord): send each report to every enabled destination

Sequential, one result per destination, one shared map slice. The embed
itself is rebuilt per destination because bridge and webhook destinations
render class emoji differently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Per-destination failure handling and the main-process call sites

**Files:**
- Modify: `src/main/discordDestinationResolver.ts:120-142` (`handleDiscordSendResult`)
- Modify: `src/main/index.ts:16-22, 276-279, 822, 972, 1287, 1674-1723`
- Modify: `src/main/handlers/settingsHandlers.ts:160, 241`
- Test: `src/main/__tests__/discordDestinationResolver.test.ts`

**Interfaces:**
- Consumes: `resolveDiscordDestinations`, `applyDiscordDestinations`, `readEnabledWebhookIds` (Task 1); `SendResult[]` with `destinationId` (Task 2).
- Produces: `handleDiscordSendResults(store, discord, win, sendResults: SendResult[] | undefined): void` — replaces `handleDiscordSendResult`. The settings payload gains `enabledWebhookIds: string[]`; `applySettings` accepts `enabledWebhookIds?: string[]`.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('handleDiscordSendResult', ...)` block in
`src/main/__tests__/discordDestinationResolver.test.ts` with:

```ts
describe('handleDiscordSendResults', () => {
    const secondBridge: StoredWebhookEntry = {
        id: 'bridge-2', kind: 'bridge', relayUrl: 'https://bot.example.com', token: 'axb1.other'
    };

    it('clears the revoked bridge token on that row only', () => {
        const store = new FakeStore({
            webhooks: [bridgeEntry, secondBridge],
            enabledWebhookIds: ['bridge-1', 'bridge-2']
        });
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResults(store, { setDestinations: vi.fn() } as any, win, [
            { ok: false, destinationId: 'bridge-1', reason: 'revoked', message: 'This link was revoked — pair again.' },
            { ok: true, destinationId: 'bridge-2' }
        ]);

        const stored = store.get('webhooks') as StoredWebhookEntry[];
        expect(stored.find((w) => w.id === 'bridge-1')?.token).toBeUndefined();
        expect(stored.find((w) => w.id === 'bridge-2')?.token).toBe('axb1.other');
        // The surviving bridge is still resolvable and still sending.
        expect(resolveDiscordDestinations(store)).toEqual([
            { id: 'bridge-2', kind: 'bridge', relayUrl: secondBridge.relayUrl, token: secondBridge.token }
        ]);
    });

    it('notifies the renderer once per failing destination', () => {
        const store = new FakeStore({ webhooks: [bridgeEntry], enabledWebhookIds: ['bridge-1'] });
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResults(store, null, win, [
            { ok: false, destinationId: 'bridge-1', reason: 'forbidden', message: 'Axi cannot post in that channel.' }
        ]);

        expect(win.webContents.send).toHaveBeenCalledWith('discord-destination-status', {
            webhookId: 'bridge-1',
            reason: 'forbidden',
            message: 'Axi cannot post in that channel.'
        });
    });

    it('ignores a plain webhook failure — console only, no store write, no banner', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], enabledWebhookIds: ['webhook-1'] });
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResults(store, null, win, [
            { ok: false, destinationId: 'webhook-1', reason: 'revoked', message: 'x' }
        ]);

        expect(win.webContents.send).not.toHaveBeenCalled();
        expect((store.get('webhooks') as StoredWebhookEntry[])[0].url).toBe(webhookEntry.url);
    });

    it('does nothing for an all-successful send', () => {
        const store = new FakeStore({ webhooks: [bridgeEntry], enabledWebhookIds: ['bridge-1'] });
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResults(store, null, win, [{ ok: true, destinationId: 'bridge-1' }]);

        expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('tolerates an undefined result list', () => {
        const store = new FakeStore({ webhooks: [bridgeEntry] });
        expect(() => handleDiscordSendResults(store, null, null, undefined)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestinationResolver.test.ts`
Expected: FAIL — `handleDiscordSendResults is not a function`.

- [ ] **Step 3: Implement plural failure handling**

Replace `handleDiscordSendResult` in `src/main/discordDestinationResolver.ts`:

```ts
/**
 * Act on a send's per-destination results: a revoked bridge token is dead
 * forever, so stop using it rather than retrying a credential that will
 * never authenticate again, and surface the failure to the renderer either
 * way.
 *
 * Each result is handled against its OWN row. With fan-out, one destination
 * failing says nothing about the others — a revoked bridge clears `token` on
 * that entry alone and every other enabled destination keeps sending.
 *
 * Scoped to bridge destinations only. `classify()` in discord.ts returns the
 * same `revoked`/`forbidden`/`rate-limited` shapes for a webhook destination
 * too (Discord webhook calls can 401/403/429 just like a relay call can), but
 * the wording ("This link was revoked — pair again.") and the unlink-the-token
 * behaviour only make sense for a bridge. A plain webhook failure stays
 * console-only, via discord.ts's own `console.error`.
 */
export function handleDiscordSendResults(
    store: DestinationStore,
    discord: DiscordNotifier | null,
    win: DestinationWindow | null,
    sendResults: SendResult[] | undefined
): void {
    if (!sendResults?.length) return;

    let webhooksChanged = false;
    for (const result of sendResults) {
        if (result.ok) continue;
        const webhooks = store.get('webhooks', []) as StoredWebhookEntry[];
        const entry = webhooks.find((w) => w.id === result.destinationId);
        if (entry?.kind !== 'bridge') continue;

        if (result.reason === 'revoked') {
            store.set('webhooks', webhooks.map((w) => (
                w.id === result.destinationId ? { ...w, token: undefined } : w
            )));
            webhooksChanged = true;
        }
        win?.webContents.send('discord-destination-status', {
            webhookId: result.destinationId,
            reason: result.reason,
            message: result.message
        });
    }

    // Re-derive once, after every row has been updated — re-deriving inside
    // the loop would make the notifier's list churn mid-iteration.
    if (webhooksChanged) applyDiscordDestinations(store, discord);
}
```

Note the `webhooks` read is inside the loop: `applyDiscordDestinations` is
deferred to the end, but each iteration must see the previous iteration's
`store.set`, so two revoked bridges in one send both get cleared.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/discordDestinationResolver.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Rewire `index.ts`**

Update the import block at `src/main/index.ts:16-22`:

```ts
    shouldSendDiscord as shouldSendDiscordFn,
    shouldBuildMapSlice as shouldBuildMapSliceFn,
    applyDiscordDestinations as applyDiscordDestinationsFn,
    handleDiscordSendResults as handleDiscordSendResultsFn
```

(Keep whatever other names the existing block imports; only these change.)

Update the wrappers at lines 276-279:

```ts
const resolveShouldSendDiscord = () => shouldSendDiscordFn(store);
const applyDiscordDestinations = () => applyDiscordDestinationsFn(store, discord);
const handleDiscordSendResults = (sendResults: Awaited<ReturnType<DiscordNotifier['sendLog']>> | undefined) =>
    handleDiscordSendResultsFn(store, discord, win, sendResults);
```

At line 822 and line 972, both currently read:

```ts
                        const sendResult = await discord?.sendLog({ ...syntheticResult, filePath, mode: 'embed', splitEnemiesByTeam, mapSlicePng }, prunedDetails);
                        handleDiscordSendResult(sendResult);
```

Rename the local and the call at both sites (line 972 uses `result` rather
than `syntheticResult` — keep its own spread):

```ts
                        const sendResults = await discord?.sendLog({ ...syntheticResult, filePath, mode: 'embed', splitEnemiesByTeam, mapSlicePng }, prunedDetails);
                        handleDiscordSendResults(sendResults);
```

At line 1287, `applyDiscordDestination();` becomes `applyDiscordDestinations();`.

In `applySettings` (line 1674), add `enabledWebhookIds?: string[]` to the
parameter type alongside `selectedWebhookId?: string | null`, and add this
block immediately after the existing `settings.selectedWebhookId` block at
lines 1720-1722:

```ts
            if (settings.enabledWebhookIds !== undefined) {
                store.set('enabledWebhookIds', settings.enabledWebhookIds);
                applyDiscordDestinations();
            }
```

Leave the `selectedWebhookId` block in place. It still arrives from older
renderer code paths and from imported settings files, and
`applyDiscordDestinations()` re-derives correctly from either input:
`readEnabledWebhookIds` falls back to `selectedWebhookId` only when
`enabledWebhookIds` is absent.

Then update the three `applyDiscordDestination()` call sites inside
`applySettings` (around lines 1709 and 1722) to `applyDiscordDestinations()`.
Verify none remain: `grep -n "applyDiscordDestination\b\|handleDiscordSendResult\b\|setDestination\b" src/main/index.ts` must print nothing.

- [ ] **Step 6: Expose `enabledWebhookIds` to the renderer**

In `src/main/handlers/settingsHandlers.ts`, add a line immediately after each
of the two `selectedWebhookId:` entries (lines 160 and 241):

```ts
            enabledWebhookIds: readEnabledWebhookIds(store),
```

and add the import at the top of the file:

```ts
import { readEnabledWebhookIds } from '../discordDestinationResolver';
```

Using the resolver's reader rather than a raw `store.get` is what makes an
un-upgraded install report its derived list (one element from
`selectedWebhookId`) rather than an empty one — which the renderer would
render as "everything off".

- [ ] **Step 7: Typecheck and run the main-process suite**

Run: `npm run typecheck && npx vitest run --maxWorkers=2 src/main/__tests__/`
Expected: PASS. If `typecheck` reports nothing but you doubt it, the electron
pass uses an incremental `tsbuildinfo` that can mask errors — force a clean
pass with `rm -f electron/tsconfig.tsbuildinfo && npm run typecheck`.

- [ ] **Step 8: Commit**

```bash
git add src/main/
git commit -m "feat(discord): handle each destination's send result against its own row

A revoked bridge token clears that entry only; every other enabled
destination keeps sending.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The settings taxonomy module

**Files:**
- Create: `src/renderer/settings/settingsTaxonomy.ts`
- Create: `src/renderer/settings/__tests__/settingsTaxonomy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `SettingsSectionMeta { id: string; label: string }`
  - `SettingsCategory { id: string; label: string; icon: SettingsIcon; sections: readonly SettingsSectionMeta[] }`
  - `SETTINGS_CATEGORIES: readonly SettingsCategory[]`
  - `FLATTENED_SECTIONS: readonly SettingsSectionMeta[]`
  - `categoryIdForSection(sectionId: string): string | null`
  - `stepSectionId(currentSectionId: string, direction: -1 | 1): string | null`
  - `labelForSection(sectionId: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/settings/__tests__/settingsTaxonomy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
    SETTINGS_CATEGORIES,
    FLATTENED_SECTIONS,
    categoryIdForSection,
    labelForSection,
    stepSectionId
} from '../settingsTaxonomy';

/**
 * Pinned list: every section id SettingsView renders, in the order the
 * flattened taxonomy must produce. Adding a section to SettingsView without
 * filing it under a category fails here rather than silently becoming
 * unreachable from the rail.
 */
const EXPECTED_FLATTENED = [
    'destinations', 'embed-summary', 'embed-top', 'report-links',
    'github-pages', 'r2-storage', 'parser-settings',
    'dashboard-stats', 'mvp-weighting', 'boon-uptime-resolution', 'commander-thresholds',
    'log-directory', 'dps-token',
    'appearance', 'close-behavior', 'export-import', 'help-updates', 'legal'
];

describe('SETTINGS_CATEGORIES', () => {
    it('has the five categories in rail order', () => {
        expect(SETTINGS_CATEGORIES.map((c) => c.id)).toEqual([
            'discord', 'web-report', 'stats', 'logs', 'application'
        ]);
    });

    it('files every section under exactly one category', () => {
        const seen = new Map<string, string>();
        for (const category of SETTINGS_CATEGORIES) {
            for (const section of category.sections) {
                expect(seen.has(section.id)).toBe(false);
                seen.set(section.id, category.id);
            }
        }
        expect(seen.size).toBe(EXPECTED_FLATTENED.length);
    });

    it('flattens in rail order', () => {
        expect(FLATTENED_SECTIONS.map((s) => s.id)).toEqual(EXPECTED_FLATTENED);
    });

    it('never labels a Discord section "embed"', () => {
        const discord = SETTINGS_CATEGORIES.find((c) => c.id === 'discord')!;
        for (const section of discord.sections) {
            expect(section.label.toLowerCase()).not.toContain('embed');
        }
    });
});

describe('categoryIdForSection', () => {
    it('resolves a section to its category', () => {
        expect(categoryIdForSection('parser-settings')).toBe('web-report');
        expect(categoryIdForSection('embed-top')).toBe('discord');
        expect(categoryIdForSection('legal')).toBe('application');
    });

    it('returns null for an unknown id', () => {
        expect(categoryIdForSection('nope')).toBeNull();
    });
});

describe('labelForSection', () => {
    it('returns the renamed label, not the id', () => {
        expect(labelForSection('embed-summary')).toBe('Summary Sections');
        expect(labelForSection('parser-settings')).toBe('Report Data');
        expect(labelForSection('r2-storage')).toBe('Cloudflare R2');
    });
});

describe('stepSectionId', () => {
    it('crosses a category boundary going forward', () => {
        expect(stepSectionId('report-links', 1)).toBe('github-pages');
    });

    it('crosses a category boundary going backward', () => {
        expect(stepSectionId('github-pages', -1)).toBe('report-links');
    });

    it('stops at the first section', () => {
        expect(stepSectionId('destinations', -1)).toBeNull();
    });

    it('stops at the last section', () => {
        expect(stepSectionId('legal', 1)).toBeNull();
    });

    it('returns null from an unknown id', () => {
        expect(stepSectionId('nope', 1)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/settingsTaxonomy.test.ts`
Expected: FAIL — cannot resolve `../settingsTaxonomy`.

- [ ] **Step 3: Implement the taxonomy**

Create `src/renderer/settings/settingsTaxonomy.ts`:

```ts
import type { ComponentType } from 'react';
import { MessageSquare, Globe, BarChart3, FolderOpen, Settings as SettingsIcon2 } from 'lucide-react';

export type SettingsIcon = ComponentType<{ className?: string }>;

export interface SettingsSectionMeta {
    id: string;
    label: string;
}

export interface SettingsCategory {
    id: string;
    label: string;
    icon: SettingsIcon;
    sections: readonly SettingsSectionMeta[];
}

/**
 * The five Settings categories and their subsections, in rail order.
 *
 * Section `id`s are the DOM ids SettingsView already renders
 * (`data-settings-section` anchors) and the ids every deep link passes to
 * `scrollToSettingsSection`. They are NOT renamed here even where the label
 * is: `embed-summary` stays `embed-summary` so existing callers keep working,
 * while its label becomes "Summary Sections" because "embed" names a Discord
 * API object, not anything a user is deciding about.
 */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
    {
        id: 'discord', label: 'Discord', icon: MessageSquare,
        sections: [
            { id: 'destinations', label: 'Destinations' },
            { id: 'embed-summary', label: 'Summary Sections' },
            { id: 'embed-top', label: 'Top Stats Lists' },
            { id: 'report-links', label: 'Report Links' },
        ],
    },
    {
        id: 'web-report', label: 'Web Report', icon: Globe,
        sections: [
            { id: 'github-pages', label: 'GitHub Pages' },
            { id: 'r2-storage', label: 'Cloudflare R2' },
            { id: 'parser-settings', label: 'Report Data' },
        ],
    },
    {
        id: 'stats', label: 'Stats', icon: BarChart3,
        sections: [
            { id: 'dashboard-stats', label: 'Top Stats & MVP' },
            { id: 'mvp-weighting', label: 'MVP Weighting' },
            { id: 'boon-uptime-resolution', label: 'Boon Uptime Resolution' },
            { id: 'commander-thresholds', label: 'Commander Thresholds' },
        ],
    },
    {
        id: 'logs', label: 'Logs', icon: FolderOpen,
        sections: [
            { id: 'log-directory', label: 'Log Directory' },
            { id: 'dps-token', label: 'dps.report Token' },
        ],
    },
    {
        id: 'application', label: 'Application', icon: SettingsIcon2,
        sections: [
            { id: 'appearance', label: 'Appearance' },
            { id: 'close-behavior', label: 'Window & Close Behavior' },
            { id: 'export-import', label: 'Export / Import Settings' },
            { id: 'help-updates', label: 'Help & Updates' },
            { id: 'legal', label: 'Legal' },
        ],
    },
];

/** Every section in rail order — what `stepSectionId` walks. */
export const FLATTENED_SECTIONS: readonly SettingsSectionMeta[] =
    SETTINGS_CATEGORIES.flatMap((category) => category.sections);

const CATEGORY_BY_SECTION = new Map<string, string>(
    SETTINGS_CATEGORIES.flatMap((category) => category.sections.map((s) => [s.id, category.id] as const))
);

/** Which category pane a section lives in, or null when the id is unknown. */
export function categoryIdForSection(sectionId: string): string | null {
    return CATEGORY_BY_SECTION.get(sectionId) ?? null;
}

/** A section's display label, or null when the id is unknown. */
export function labelForSection(sectionId: string): string | null {
    return FLATTENED_SECTIONS.find((s) => s.id === sectionId)?.label ?? null;
}

/**
 * The next/previous section in flattened order, crossing category
 * boundaries, or null at either end. Null (rather than clamping to the same
 * id) lets the caller disable its arrow instead of re-scrolling in place.
 */
export function stepSectionId(currentSectionId: string, direction: -1 | 1): string | null {
    const index = FLATTENED_SECTIONS.findIndex((s) => s.id === currentSectionId);
    if (index === -1) return null;
    return FLATTENED_SECTIONS[index + direction]?.id ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/settingsTaxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/settings/
git commit -m "feat(settings): add the five-category settings taxonomy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Category paging and the nested rail

**Files:**
- Create: `src/renderer/settings/SettingsNav.tsx`
- Modify: `src/renderer/SettingsView.tsx` — delete `SETTINGS_SECTIONS` (line 59), add category state, wrap sections in category panes, rewrite `scrollToSettingsSection` / `stepSettingsSection` / the scroll tracker, replace the desktop rail (line 1477) and the mobile stepper (lines 3018-3070)
- Test: `src/renderer/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `SETTINGS_CATEGORIES`, `FLATTENED_SECTIONS`, `categoryIdForSection`, `labelForSection`, `stepSectionId` (Task 4).
- Produces: `SettingsNav` with props
  `{ categories, selectedCategoryId, activeSectionId, matchCountsByCategory, onSelectCategory, onSelectSection }`.
  `SettingsView` gains internal state `selectedCategoryId` and the helper
  `navigateToSection(id: string): void`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/SettingsView.test.tsx` (read the file first
and reuse its existing render helper and `window.electronAPI` mock — do not
add a second mock):

```ts
describe('category navigation', () => {
    it('shows only the selected category pane', async () => {
        renderSettingsView();
        // Discord is the default landing category.
        expect(document.querySelector('[data-settings-pane="discord"]')).not.toHaveStyle({ display: 'none' });
        expect(document.querySelector('[data-settings-pane="web-report"]')).toHaveStyle({ display: 'none' });
    });

    it('keeps every section mounted so search can still read hidden panes', () => {
        renderSettingsView();
        // A Web Report section exists in the DOM while Discord is selected.
        expect(document.querySelector('#parser-settings')).not.toBeNull();
    });

    it('switches panes when a subsection in another category is clicked', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        await user.click(screen.getByRole('button', { name: /Web Report/i }));
        await user.click(screen.getByRole('button', { name: /Report Data/i }));
        expect(document.querySelector('[data-settings-pane="web-report"]')).not.toHaveStyle({ display: 'none' });
        expect(document.querySelector('[data-settings-pane="discord"]')).toHaveStyle({ display: 'none' });
    });

    it('expands only one category at a time', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        await user.click(screen.getByRole('button', { name: /Web Report/i }));
        // Discord's subsections collapse when Web Report expands.
        expect(screen.queryByRole('button', { name: /Summary Sections/i })).toBeNull();
        expect(screen.getByRole('button', { name: /Report Data/i })).toBeInTheDocument();
    });

    it('selects the owning category when a deep link targets another pane', async () => {
        const { rerender } = renderSettingsView({ parserSettingsFocusTrigger: 0 });
        rerender(<SettingsView {...defaultProps} parserSettingsFocusTrigger={1} />);
        await waitFor(() => {
            expect(document.querySelector('[data-settings-pane="web-report"]')).not.toHaveStyle({ display: 'none' });
        });
    });

    it('lands on Help & Updates from a cold open on Discord', async () => {
        const { rerender } = renderSettingsView({ helpUpdatesFocusTrigger: 0 });
        rerender(<SettingsView {...defaultProps} helpUpdatesFocusTrigger={1} />);
        await waitFor(() => {
            expect(document.querySelector('[data-settings-pane="application"]')).not.toHaveStyle({ display: 'none' });
        });
    });
});
```

If the existing test file has no `renderSettingsView` helper or `defaultProps`
object, add them at the top of the file, built from `SettingsViewProps`'s
required fields with `vi.fn()` for every callback:

```tsx
const defaultProps = {
    onBack: vi.fn(),
    // every other required SettingsViewProps field, with vi.fn() for callbacks
    // and the DEFAULT_* values from src/renderer/global.d.ts for data props
} as any;

const renderSettingsView = (overrides: Record<string, unknown> = {}) =>
    render(<SettingsView {...defaultProps} {...overrides} />);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx`
Expected: FAIL — no element matches `[data-settings-pane="discord"]`.

- [ ] **Step 3: Build the nested rail**

Create `src/renderer/settings/SettingsNav.tsx`:

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SettingsCategory } from './settingsTaxonomy';

interface SettingsNavProps {
    categories: readonly SettingsCategory[];
    selectedCategoryId: string;
    /** The section the scroll position currently sits on, for the marker. */
    activeSectionId: string;
    /** Per-category count of sections matching the current search, or null when not searching. */
    matchCountsByCategory: Record<string, number> | null;
    onSelectCategory: (categoryId: string) => void;
    onSelectSection: (sectionId: string) => void;
}

/**
 * The nested Settings rail: five collapsible categories, one expanded at a
 * time. Expanding one collapses the others deliberately — with sixteen
 * subsections, letting all five expand reproduces the flat jump list this
 * design exists to remove.
 */
export function SettingsNav({
    categories,
    selectedCategoryId,
    activeSectionId,
    matchCountsByCategory,
    onSelectCategory,
    onSelectSection
}: SettingsNavProps) {
    return (
        <nav className="flex flex-col gap-0.5" aria-label="Settings categories">
            {categories.map((category) => {
                const isExpanded = category.id === selectedCategoryId;
                const Icon = category.icon;
                const matchCount = matchCountsByCategory?.[category.id];
                return (
                    <div key={category.id}>
                        <button
                            type="button"
                            onClick={() => onSelectCategory(category.id)}
                            aria-expanded={isExpanded}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[4px] text-sm transition-colors"
                            style={isExpanded
                                ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                : { color: 'var(--text-secondary)' }}
                        >
                            {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                : <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{category.label}</span>
                            {matchCountsByCategory && (
                                <span
                                    className="ml-auto shrink-0 px-1.5 py-0.5 rounded-[3px] text-[9px] font-semibold"
                                    style={matchCount
                                        ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                        : { color: 'var(--text-muted)' }}
                                >
                                    {matchCount ?? 0}
                                </span>
                            )}
                        </button>
                        {isExpanded && (
                            <div className="ml-6 flex flex-col gap-0.5 py-0.5">
                                {category.sections.map((section) => (
                                    <button
                                        key={section.id}
                                        type="button"
                                        data-settings-nav-id={section.id}
                                        onClick={() => onSelectSection(section.id)}
                                        className={`text-left px-2 py-1 rounded-[4px] text-xs transition-colors ${
                                            section.id === activeSectionId ? 'text-white' : 'text-gray-400'
                                        }`}
                                    >
                                        {section.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
```

`data-settings-nav-id` is kept on the subsection buttons because the existing
scroll tracker updates the active marker by direct class toggling on that
attribute (SettingsView.tsx:717-722) rather than by re-rendering.

- [ ] **Step 4: Add category state and the navigation entry point to SettingsView**

In `src/renderer/SettingsView.tsx`, delete the `SETTINGS_SECTIONS` constant
(lines 59-75) and add imports:

```tsx
import { SettingsNav } from './settings/SettingsNav';
import {
    SETTINGS_CATEGORIES,
    FLATTENED_SECTIONS,
    categoryIdForSection,
    labelForSection,
    stepSectionId
} from './settings/settingsTaxonomy';
```

Next to the existing `activeSettingsSectionIdRef` (line 319) add:

```tsx
    const [selectedCategoryId, setSelectedCategoryId] = useState('discord');
```

Replace `scrollToSettingsSection` and `stepSettingsSection` (lines 901-920)
with:

```tsx
    /**
     * The single entry point for navigating to a section, by id.
     *
     * Every deep link — `helpUpdatesFocusTrigger`, `parserSettingsFocusTrigger`,
     * `developerSettingsTrigger`, the rail, the mobile stepper — goes through
     * here and keeps passing the same section ids it always passed. With paged
     * categories, reaching a section now requires selecting its category
     * first, which is this function's job rather than each caller's.
     *
     * The rAF is load-bearing: a section in a not-yet-selected pane is
     * `display: none` until React commits the state change, and
     * `getBoundingClientRect()` on a hidden element returns zeros — scrolling
     * in the same tick lands at the top of the container every time.
     */
    const navigateToSection = (id: string) => {
        const categoryId = categoryIdForSection(id);
        if (categoryId && categoryId !== selectedCategoryId) {
            setSelectedCategoryId(categoryId);
            requestAnimationFrame(() => scrollToSettingsSection(id));
            return;
        }
        scrollToSettingsSection(id);
    };

    const scrollToSettingsSection = (id: string) => {
        const container = settingsScrollRef.current;
        if (!container) return;
        const section = container.querySelector<HTMLElement>(`#${id}`);
        if (!section) return;
        const containerRect = container.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        const top = Math.max(0, sectionRect.top - containerRect.top + container.scrollTop - 8);
        container.scrollTo({ top, behavior: 'smooth' });
    };

    const stepSettingsSection = (direction: -1 | 1) => {
        const next = stepSectionId(activeSettingsSectionIdRef.current, direction);
        if (next) navigateToSection(next);
    };
```

`scrollToSettingsSection` keeps its name and body so nothing that scrolls
within the current pane changes behaviour; `navigateToSection` is the wrapper
that adds category selection.

- [ ] **Step 5: Make the scroll tracker skip hidden panes**

In the `updateActiveSection` closure (lines 700-725), the section query must
ignore sections in collapsed panes — a `display: none` element reports a
zero rect, which otherwise wins the "closest to the top" comparison. Change
the first line of the closure and the mobile-label lookup:

```tsx
            const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-settings-section="true"]'))
                .filter((el) => el.offsetParent !== null);
```

```tsx
            if (mobileNavLabelRef.current) {
                mobileNavLabelRef.current.textContent = labelForSection(bestId) ?? 'Settings';
            }
```

Add `selectedCategoryId` to this effect's dependency array so the tracker
re-runs when the visible pane changes.

- [ ] **Step 6: Wrap the sections in category panes**

Each run of `<SettingsSection>` elements belonging to one category is wrapped
in a pane div. Sections stay mounted and hide with `display: none`
(Ruling B) — search scans `textContent`, which works on hidden subtrees, and
unmounting would make search blind to four-fifths of Settings.

The wrapper, repeated once per category with that category's id:

```tsx
                    <div
                        data-settings-pane="discord"
                        style={{ display: selectedCategoryId === 'discord' ? undefined : 'none' }}
                    >
                        {/* Discord sections: destinations, embed-summary, embed-top, report-links */}
                    </div>
```

Move the existing `<SettingsSection>` blocks inside the matching pane,
reordering them to the taxonomy's order. Sections move verbatim — do not
edit their bodies in this task:

| Pane | Sections to move inside, in this order |
|---|---|
| `discord` | `embed-summary` (line 2031), `embed-top` (2086) — `destinations` and `report-links` arrive in Task 9 |
| `web-report` | `github-pages` (1614), `r2-storage` (1926), `parser-settings` (2782) |
| `stats` | `dashboard-stats` (2289), `mvp-weighting` (2598), `boon-uptime-resolution` (2647), `commander-thresholds` (2704) |
| `logs` | `dps-token` (1559) — `log-directory` arrives in Task 10 |
| `application` | `appearance` (1507), `close-behavior` (2876), `export-import` (2911), `legal` (2940) |

`help-updates` (line 2259) is rendered conditionally today — keep its
surrounding condition exactly as it is and move the whole conditional inside
the `application` pane, after `export-import`.

Until Tasks 9 and 10 land, the taxonomy lists `destinations`,
`report-links` and `log-directory` as sections that do not yet exist in the
DOM. That is fine: `scrollToSettingsSection` already returns early on a
missing `#id`, and the rail button is simply inert. The
`settingsTaxonomy.test.ts` pinned list asserts the *taxonomy*, not the DOM,
so it stays green.

- [ ] **Step 7: Replace the desktop rail and the mobile stepper**

Replace the desktop nav block at line 1477 (the `SETTINGS_SECTIONS.map` and
its no-results message at 1493) with:

```tsx
                                <SettingsNav
                                    categories={SETTINGS_CATEGORIES}
                                    selectedCategoryId={selectedCategoryId}
                                    activeSectionId={activeSettingsSectionIdRef.current}
                                    matchCountsByCategory={null}
                                    onSelectCategory={(categoryId) => {
                                        setSelectedCategoryId(categoryId);
                                        const first = SETTINGS_CATEGORIES.find((c) => c.id === categoryId)?.sections[0];
                                        if (first) requestAnimationFrame(() => scrollToSettingsSection(first.id));
                                    }}
                                    onSelectSection={navigateToSection}
                                />
```

`matchCountsByCategory={null}` is a placeholder only until Task 6 wires
search to it — Task 6 replaces this one prop.

In the mobile stepper (lines 3010-3070), replace `SETTINGS_SECTIONS[0].label`
with `labelForSection(activeSettingsSectionIdRef.current) ?? 'Settings'`,
replace the `SETTINGS_SECTIONS.map` list with `FLATTENED_SECTIONS.map`, change
its `onClick` to call `navigateToSection(item.id)`, and replace the index
badge `SETTINGS_SECTIONS.findIndex(...) + 1` with
`FLATTENED_SECTIONS.findIndex((section) => section.id === item.id) + 1`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx`
Expected: PASS.

- [ ] **Step 9: Validate and commit**

```bash
npm run validate
git add src/renderer/SettingsView.tsx src/renderer/settings/ src/renderer/__tests__/SettingsView.test.tsx
git commit -m "feat(settings): page settings into five categories with a nested rail

Panes hide rather than unmount so DOM-text search still reaches every
section; scrollToSettingsSection now selects the owning category first, so
every existing deep link keeps working with no caller changes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Search across categories

**Files:**
- Modify: `src/renderer/SettingsView.tsx:312` (search state), `875-891` (the search effect), `1477` (the `matchCountsByCategory` prop), and the pane container (search-results rendering)
- Test: `src/renderer/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `SETTINGS_CATEGORIES`, `FLATTENED_SECTIONS`, `categoryIdForSection`, `labelForSection` (Task 4); `navigateToSection`, `selectedCategoryId`, `data-settings-pane` (Task 5).
- Produces: `SettingsView` internal state `settingsSearchMatches: string[] | null` — the matching section ids in flattened order, or `null` when not searching. `settingsSearchHidden` is **deleted**.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/SettingsView.test.tsx`:

```ts
describe('cross-category search', () => {
    it('finds a Web Report setting while Discord is selected, labelled with its category', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        await user.type(screen.getByPlaceholderText(/search settings/i), 'damage modifiers');
        const result = await screen.findByRole('button', { name: /Web Report › Report Data/i });
        expect(result).toBeInTheDocument();
    });

    it('navigates to the result’s category when it is selected', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        await user.type(screen.getByPlaceholderText(/search settings/i), 'damage modifiers');
        await user.click(await screen.findByRole('button', { name: /Web Report › Report Data/i }));
        await waitFor(() => {
            expect(document.querySelector('[data-settings-pane="web-report"]')).not.toHaveStyle({ display: 'none' });
        });
    });

    it('shows a per-category match count on the rail', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        await user.type(screen.getByPlaceholderText(/search settings/i), 'damage modifiers');
        const webReportButton = await screen.findByRole('button', { name: /Web Report/i });
        expect(webReportButton).toHaveTextContent('1');
        // An unmatched category is visibly zero, not silently absent.
        expect(screen.getByRole('button', { name: /Stats/i })).toHaveTextContent('0');
    });

    it('restores the category pane when the query is cleared', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        const input = screen.getByPlaceholderText(/search settings/i);
        await user.type(input, 'damage modifiers');
        await user.clear(input);
        await waitFor(() => {
            expect(document.querySelector('[data-settings-pane="discord"]')).not.toHaveStyle({ display: 'none' });
        });
    });

    it('reports no results for a query nothing matches', async () => {
        const user = userEvent.setup();
        renderSettingsView();
        await user.type(screen.getByPlaceholderText(/search settings/i), 'zzzznotasetting');
        expect(await screen.findByText(/No settings match/i)).toBeInTheDocument();
    });
});
```

If the search input's placeholder in `SettingsView.tsx` differs from "Search
settings", use the actual string in the queries rather than changing the
component.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx -t "cross-category search"`
Expected: FAIL — no button named "Web Report › Report Data".

- [ ] **Step 3: Replace hide-in-place with a match list**

In `src/renderer/SettingsView.tsx`, replace the `settingsSearchHidden` state
declaration at line 312 with:

```tsx
    /** Matching section ids in flattened order, or null when not searching. */
    const [settingsSearchMatches, setSettingsSearchMatches] = useState<string[] | null>(null);
```

Replace the search effect (lines 875-891) with:

```tsx
    // Settings search: scan each section's rendered text and collect matches.
    //
    // This reads `textContent` from the live DOM rather than from a built
    // index, exactly as it did before categories — which is why category
    // panes hide with `display: none` instead of unmounting. `textContent`
    // is unaffected by `display`, so a section in a collapsed pane is still
    // searchable; unmounting would make search blind to four-fifths of
    // Settings.
    useEffect(() => {
        const query = settingsSearch.trim().toLowerCase();
        if (!query) {
            setSettingsSearchMatches(null);
            return;
        }
        const container = settingsScrollRef.current;
        if (!container) return;
        const matches: string[] = [];
        for (const section of FLATTENED_SECTIONS) {
            const el = container.querySelector<HTMLElement>(`#${section.id}`);
            const text = el?.textContent?.toLowerCase() ?? '';
            if (text.includes(query) || section.label.toLowerCase().includes(query)) {
                matches.push(section.id);
            }
        }
        setSettingsSearchMatches(matches);
    }, [settingsSearch]);

    /** Per-category match counts for the rail badges, or null when not searching. */
    const matchCountsByCategory = useMemo(() => {
        if (!settingsSearchMatches) return null;
        const counts: Record<string, number> = {};
        for (const category of SETTINGS_CATEGORIES) counts[category.id] = 0;
        for (const id of settingsSearchMatches) {
            const categoryId = categoryIdForSection(id);
            if (categoryId) counts[categoryId] += 1;
        }
        return counts;
    }, [settingsSearchMatches]);
```

The section label is matched in addition to the rendered text so a renamed
section is findable by its new name even before its body mentions it — typing
"Report Data" must find `parser-settings`.

- [ ] **Step 4: Remove every `settingsSearchHidden` reference**

Each `<SettingsSection>` currently takes `hidden={settingsSearchHidden.has('...')}`.
Delete that prop from all fifteen call sites — pane visibility is now the only
thing that hides a section, and the search-results list replaces the panes
entirely. Delete the `legal` div's inline
`display: settingsSearchHidden.has('legal') ? 'none' : undefined` the same way.

Verify none remain: `grep -n "settingsSearchHidden" src/renderer/SettingsView.tsx` must print nothing.

Leave the `hidden` prop on the `SettingsSection` component's own signature —
other callers may pass it and removing a prop is out of this task's scope.

- [ ] **Step 5: Render the results list in place of the panes**

Wrap the five category panes so that a search replaces them. Put this
immediately before the first `data-settings-pane` div, and wrap all five panes
in a container that hides while searching:

```tsx
                    {settingsSearchMatches && (
                        <div className="flex flex-col gap-1">
                            {settingsSearchMatches.length === 0 && (
                                <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                    No settings match “{settingsSearch}”.
                                </div>
                            )}
                            {settingsSearchMatches.map((id) => {
                                const categoryId = categoryIdForSection(id);
                                const categoryLabel = SETTINGS_CATEGORIES.find((c) => c.id === categoryId)?.label ?? '';
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => {
                                            setSettingsSearch('');
                                            navigateToSection(id);
                                        }}
                                        className="w-full text-left px-3 py-2 rounded-[4px] text-sm transition-colors"
                                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                                    >
                                        <span style={{ color: 'var(--text-muted)' }}>{categoryLabel} › </span>
                                        {labelForSection(id)}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <div style={{ display: settingsSearchMatches ? 'none' : undefined }}>
                        {/* the five data-settings-pane divs from Task 5 */}
                    </div>
```

Clearing `settingsSearch` in the click handler is what makes selecting a
result return to the pane view; `navigateToSection` then selects the owning
category. Because the panes hide with `display: none` rather than unmounting,
the rAF inside `navigateToSection` still finds a laid-out element.

- [ ] **Step 6: Wire the rail badges**

In the `<SettingsNav>` call added in Task 5, replace
`matchCountsByCategory={null}` with `matchCountsByCategory={matchCountsByCategory}`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 8: Validate and commit**

```bash
npm run validate
git add src/renderer/SettingsView.tsx src/renderer/__tests__/SettingsView.test.tsx
git commit -m "feat(settings): search across every category, not just the open one

Results replace the pane as a flat list labelled 'Category › Section', and
the rail shows a per-category match count so an empty category is visibly
empty rather than silently missing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Section renames and the export/import vocabulary

**Files:**
- Modify: `src/renderer/SettingsView.tsx` — the six `<SettingsSection title=...>` strings and `IMPORT_SETTING_META` (line 77 onward)
- Test: `src/renderer/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: the taxonomy labels (Task 4).
- Produces: no new exports. `IMPORT_SETTING_META` entries keep every `key` and change only `section`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/SettingsView.test.tsx`:

```ts
describe('section naming', () => {
    it('never shows the word "embed" in a section heading', () => {
        renderSettingsView();
        const headings = Array.from(document.querySelectorAll('[data-settings-section="true"] h2, [data-settings-section="true"] h3'));
        for (const heading of headings) {
            expect(heading.textContent?.toLowerCase() ?? '').not.toContain('embed');
        }
    });

    it('titles the renamed sections by their destination, not their implementation', () => {
        renderSettingsView();
        expect(screen.getByText('Summary Sections')).toBeInTheDocument();
        expect(screen.getByText('Top Stats Lists')).toBeInTheDocument();
        expect(screen.getByText('Report Data')).toBeInTheDocument();
        expect(screen.getByText('Cloudflare R2')).toBeInTheDocument();
        expect(screen.getByText('Top Stats & MVP')).toBeInTheDocument();
        expect(screen.getByText('Window & Close Behavior')).toBeInTheDocument();
    });
});
```

If `SettingsSection` renders its title in an element other than `h2`/`h3`,
widen the first test's selector to match what it actually renders — read the
`SettingsSection` component before running.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx -t "section naming"`
Expected: FAIL — headings still read "Discord Embed - Summary Sections".

- [ ] **Step 3: Rename the six section titles**

| Line | Was | Becomes |
|---|---|---|
| 2031 | `title="Discord Embed - Summary Sections"` | `title="Summary Sections"` |
| 2086 | `title="Discord Embed - Top Stats Lists"` | `title="Top Stats Lists"` |
| 2782 | `title="Parser Settings"` | `title="Report Data"` |
| 1926 | `title="R2 Storage"` (read the actual prop — this section's title is built a few lines above its `sectionId`) | `title="Cloudflare R2"` |
| 2289 | `title="Dashboard - Top Stats & MVP"` | `title="Top Stats & MVP"` |
| 2876 | `title="Window Close Behavior"` | `title="Window & Close Behavior"` |

The category name now carries the context the old prefixes carried: "Summary
Sections" sits under a Discord heading, so "Discord Embed - " is redundant as
well as wrong.

- [ ] **Step 4: Add the sub-label to Compute Damage Modifiers**

`Compute Damage Modifiers` is the one Report Data setting that also affects
the in-app dashboard, not just the published report, so filing it under Web
Report is slightly wrong. It keeps its place — splitting one row out of a
coherent group costs more legibility than the imprecision does — and says so.
Find its label inside the `parser-settings` section and append, immediately
below the existing description text:

```tsx
                                <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    Also affects the in-app dashboard, not just published reports.
                                </span>
```

- [ ] **Step 5: Realign `IMPORT_SETTING_META` section labels**

In `IMPORT_SETTING_META` (line 77 onward), rewrite only the `section` values,
using exactly these five strings — the same vocabulary as the rail, so the app
has one set of names rather than two:

| Old `section` | New `section` |
|---|---|
| `'Logs & Uploads'` | `'Logs'` |
| `'Discord'` | `'Discord'` (unchanged) |
| `'App'` | `'Application'` |
| `'Stats'` | `'Stats'` (unchanged) |
| `'GitHub'` | `'Web Report'` |

Every `key` stays exactly as it is. These are persisted identifiers written
into exported settings files; renaming one breaks importing an older export.

Run `grep -n "section: '" src/renderer/SettingsView.tsx` and confirm only
`'Logs'`, `'Discord'`, `'Application'`, `'Stats'` and `'Web Report'` appear.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Validate and commit**

```bash
npm run validate
git add src/renderer/SettingsView.tsx src/renderer/__tests__/SettingsView.test.tsx
git commit -m "feat(settings): name sections by destination, not implementation

'Embed' names a Discord API object, not anything a user decides about.
IMPORT_SETTING_META keys are untouched — they are persisted identifiers.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Extract `DestinationsCard` from `WebhookModal`

**Files:**
- Create: `src/renderer/settings/DestinationsCard.tsx`
- Create: `src/renderer/settings/__tests__/DestinationsCard.test.tsx`
- Modify: `src/renderer/WebhookModal.tsx` — reduced to a shell
- Test: `src/renderer/__tests__/WebhookModal.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export interface DestinationsCardProps {
      webhooks: Webhook[];
      enabledWebhookIds: string[];
      /** Commits a webhooks-list change. `selectId`, when present, asks the
       *  caller to also enable that entry in the same save. */
      onSave: (webhooks: Webhook[], selectId?: string) => void;
      /** Switches one destination on or off. */
      onSetEnabled: (id: string, enabled: boolean) => void;
  }
  export function DestinationsCard(props: DestinationsCardProps): JSX.Element;
  ```
  `Webhook` keeps being exported from `src/renderer/WebhookModal.tsx` — `webhookSaveIntent.ts` imports it from there and that import must not move.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/settings/__tests__/DestinationsCard.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DestinationsCard } from '../DestinationsCard';
import type { Webhook } from '../../WebhookModal';

const webhookEntry: Webhook = { id: 'w1', name: 'Raid Channel', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' };
const bridgeEntry: Webhook = {
    id: 'b1', name: 'Axi › #reports', kind: 'bridge',
    relayUrl: 'https://bot.example.com', token: 'axb1.secret',
    guildName: 'Axi', channelName: 'reports', guildId: 'g1', channelId: 'c1'
};

const renderCard = (overrides: Partial<React.ComponentProps<typeof DestinationsCard>> = {}) => {
    const props = {
        webhooks: [webhookEntry, bridgeEntry],
        enabledWebhookIds: ['w1'],
        onSave: vi.fn(),
        onSetEnabled: vi.fn(),
        ...overrides
    };
    render(<DestinationsCard {...props} />);
    return props;
};

beforeEach(() => {
    (window as any).electronAPI = { linkBridgeChannel: vi.fn() };
});

describe('DestinationsCard', () => {
    it('lists every destination with its kind', () => {
        renderCard();
        expect(screen.getByText('Raid Channel')).toBeInTheDocument();
        expect(screen.getByText('Axi › #reports')).toBeInTheDocument();
        expect(screen.getByText(/bridge/i)).toBeInTheDocument();
    });

    it('reflects the enabled state per row', () => {
        renderCard();
        expect(screen.getByRole('switch', { name: /Raid Channel/i })).toBeChecked();
        expect(screen.getByRole('switch', { name: /Axi › #reports/i })).not.toBeChecked();
    });

    it('enabling a second destination does not disable the first', async () => {
        const user = userEvent.setup();
        const props = renderCard();
        await user.click(screen.getByRole('switch', { name: /Axi › #reports/i }));
        expect(props.onSetEnabled).toHaveBeenCalledTimes(1);
        expect(props.onSetEnabled).toHaveBeenCalledWith('b1', true);
    });

    it('disabling a destination reports enabled: false', async () => {
        const user = userEvent.setup();
        const props = renderCard();
        await user.click(screen.getByRole('switch', { name: /Raid Channel/i }));
        expect(props.onSetEnabled).toHaveBeenCalledWith('w1', false);
    });

    it('commits a delete immediately rather than staging it', async () => {
        const user = userEvent.setup();
        const props = renderCard();
        await user.click(screen.getByRole('button', { name: /delete Raid Channel/i }));
        expect(props.onSave).toHaveBeenCalledWith([bridgeEntry]);
    });

    it('commits an added webhook immediately', async () => {
        const user = userEvent.setup();
        const props = renderCard({ webhooks: [] });
        await user.click(screen.getByRole('button', { name: /add webhook/i }));
        await user.type(screen.getByPlaceholderText(/name/i), 'New Channel');
        await user.type(screen.getByPlaceholderText(/https/i), 'https://discord.com/api/webhooks/9/z');
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        expect(props.onSave).toHaveBeenCalledWith([
            expect.objectContaining({ name: 'New Channel', kind: 'webhook', url: 'https://discord.com/api/webhooks/9/z' })
        ]);
    });

    it('warns that a revoked bridge needs re-linking', () => {
        renderCard({ webhooks: [{ ...bridgeEntry, token: undefined }], enabledWebhookIds: [] });
        expect(screen.getByText(/re-link/i)).toBeInTheDocument();
    });

    it('replaces the token on the existing row when the same channel is re-linked', async () => {
        const user = userEvent.setup();
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true, relayUrl: 'https://bot.example.com', guildName: 'Axi', channelName: 'reports', guildId: 'g1', channelId: 'c1'
        });
        const props = renderCard({ webhooks: [{ ...bridgeEntry, token: undefined }], enabledWebhookIds: [] });
        await user.click(screen.getByRole('button', { name: /link axitools channel/i }));
        await user.type(screen.getByPlaceholderText(/axb1/i), 'axb1.fresh');
        await user.click(screen.getByRole('button', { name: /^link$/i }));
        await vi.waitFor(() => expect(props.onSave).toHaveBeenCalled());
        const [nextWebhooks, selectId] = props.onSave.mock.calls[0];
        expect(nextWebhooks).toHaveLength(1);
        expect(nextWebhooks[0].token).toBe('axb1.fresh');
        expect(selectId).toBe('b1');
    });

    it('notes that bridged reports post as Axi', () => {
        renderCard();
        expect(screen.getByText(/posted by the Axi bot/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/DestinationsCard.test.tsx`
Expected: FAIL — cannot resolve `../DestinationsCard`.

- [ ] **Step 3: Create the card by moving the modal's body into it**

Create `src/renderer/settings/DestinationsCard.tsx`. Move — do not rewrite —
`WebhookModal.tsx`'s `handleAdd`, `handleEdit`, `handleSaveEdit`,
`handleDelete`, `handleUnlink`, `handleLinkSubmit`, all eleven pieces of local
state, and the list/add/link JSX from inside the modal shell. Preserve every
existing comment: the `guildId`/`channelId` re-link matching rationale, the
legacy-name fallback, and the swallowed-rejection note are all load-bearing.

Three changes to what moves (Ruling C):

1. **`localWebhooks` is gone.** The card is controlled: it renders `webhooks`
   from props and every mutation calls `onSave` immediately. Replace every
   `setLocalWebhooks(next)` with `onSave(next)`, every read of `localWebhooks`
   with `webhooks`, and delete the `useEffect` that copied props into local
   state.
2. **`handleSaveAll` and the "Save Changes" button are deleted.** There is no
   staged state left to commit.
3. **Each row gains an enable switch** calling
   `onSetEnabled(hook.id, !isEnabled)`.

```tsx
import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, Link, Zap, AlertTriangle } from 'lucide-react';
import type { Webhook } from '../WebhookModal';

export interface DestinationsCardProps {
    webhooks: Webhook[];
    enabledWebhookIds: string[];
    /**
     * Commits a webhooks-list change. `selectId`, when present, asks the
     * caller to also enable that entry in the same save — used by the link
     * flow so a freshly linked channel activates immediately rather than
     * waiting on a separate toggle.
     */
    onSave: (webhooks: Webhook[], selectId?: string) => void;
    /** Switches one destination on or off. */
    onSetEnabled: (id: string, enabled: boolean) => void;
}

/**
 * The Discord destinations editor, mounted by both `WebhookModal` (reachable
 * mid-workflow from the header) and Settings › Discord › Destinations.
 *
 * Deliberately controlled and commit-on-every-edit. The modal used to stage
 * edits in a local draft committed by a "Save Changes" button — except Link
 * and Unlink, which committed immediately, a split that once left a deleted
 * bridge entry stored and still sending when the modal was closed with the X.
 * A card mounted inline in Settings has no "Save Changes" moment at all, so
 * running two commit models in one component was never an option. One model,
 * both mounts, nothing half-committed.
 */
export function DestinationsCard({ webhooks, enabledWebhookIds, onSave, onSetEnabled }: DestinationsCardProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [isLinking, setIsLinking] = useState(false);
    const [bridgeKey, setBridgeKey] = useState('');
    const [bridgeLinking, setBridgeLinking] = useState(false);
    const [bridgeLinkError, setBridgeLinkError] = useState<string | null>(null);

    // ... the moved handlers, with setLocalWebhooks(next) → onSave(next)
    // ... the moved list / add / link JSX, each row gaining:
    //
    //   <button
    //       type="button"
    //       role="switch"
    //       aria-checked={enabledWebhookIds.includes(hook.id)}
    //       aria-label={hook.name}
    //       onClick={() => onSetEnabled(hook.id, !enabledWebhookIds.includes(hook.id))}
    //   >
    //
    // ... and the existing "Bridged reports are posted by the Axi bot, so they
    // appear as **Axi** rather than AxiBridge." notice, moved verbatim.
}
```

Write the handlers and JSX out in full from the originals — the block comment
above marks where they go, it is not a placeholder to ship.

- [ ] **Step 4: Reduce the modal to a shell**

Rewrite `src/renderer/WebhookModal.tsx` to keep the `Webhook` interface export
(unchanged — `webhookSaveIntent.ts` imports it from here), the
`WebhookModalProps` interface plus two new props, the overlay/header/close
chrome, and nothing else:

```tsx
interface WebhookModalProps {
    isOpen: boolean;
    onClose: () => void;
    webhooks: Webhook[];
    enabledWebhookIds: string[];
    onSave: (webhooks: Webhook[], selectId?: string) => void;
    onSetEnabled: (id: string, enabled: boolean) => void;
}

export function WebhookModal({ isOpen, onClose, webhooks, enabledWebhookIds, onSave, onSetEnabled }: WebhookModalProps) {
    if (!isOpen) return null;
    return (
        <AnimatePresence>
            {/* the existing overlay + panel chrome, unchanged, with: */}
            <DestinationsCard
                webhooks={webhooks}
                enabledWebhookIds={enabledWebhookIds}
                onSave={onSave}
                onSetEnabled={onSetEnabled}
            />
            {/* the existing Close button; the "Save Changes" button is gone */}
        </AnimatePresence>
    );
}
```

- [ ] **Step 5: Update the modal's own tests**

`src/renderer/__tests__/WebhookModal.test.tsx` asserts the old draft/commit
behaviour. Update each case that clicks "Save Changes" to assert `onSave` was
called by the edit itself, and add the two new required props to its render
helper. Cases asserting Link and Unlink commit immediately need no change —
that was already their behaviour and is now the only behaviour.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/settings/__tests__/DestinationsCard.test.tsx src/renderer/__tests__/WebhookModal.test.tsx`
Expected: PASS.

- [ ] **Step 7: Validate and commit**

`npm run validate` will fail until `AppLayout.tsx` passes the two new modal
props. Add them there now as a one-line wire — `enabledWebhookIds={[]}` and
`onSetEnabled={() => {}}` are **not** acceptable; wire the real ones from
Task 9's props if they exist, otherwise derive them inline from
`selectedWebhookId`:

```tsx
                enabledWebhookIds={selectedWebhookId ? [selectedWebhookId] : []}
                onSetEnabled={(id, enabled) => {
                    const next = enabled ? [id] : [];
                    setSelectedWebhookId(next[0] ?? null);
                    handleUpdateSettings({ enabledWebhookIds: next, selectedWebhookId: next[0] ?? null });
                }}
```

This is a deliberate single-selection stopgap for one task only: Task 11
replaces it with the real multi-select. It is honest in the meantime — the
toggle does what the store currently supports.

```bash
npm run validate
git add src/renderer/settings/ src/renderer/WebhookModal.tsx src/renderer/app/AppLayout.tsx src/renderer/__tests__/WebhookModal.test.tsx
git commit -m "refactor(discord): extract DestinationsCard from WebhookModal

One controlled component, commit-on-edit, mounted by the modal now and by
Settings next. Removes the draft/commit split that once left a deleted
bridge entry stored and still sending.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Mount Destinations and Report Links under Discord

**Files:**
- Modify: `src/renderer/app/hooks/useSettings.ts:32, 79-80, 189, 201` — `enabledWebhookIds` state
- Modify: `src/renderer/App.tsx:74-75, 462-463, 1150-1161` — pass destination state down
- Modify: `src/renderer/app/AppLayout.tsx:457-460` — forward the new props to `SettingsView`
- Modify: `src/renderer/SettingsView.tsx` — new props, the `destinations` section, the `report-links` section
- Test: `src/renderer/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `DestinationsCard` and its props (Task 8); `enabledWebhookIds` in the settings payload (Task 3); the `discord` pane (Task 5).
- Produces: `SettingsViewProps` gains
  `webhooks: Webhook[]`, `enabledWebhookIds: string[]`,
  `onSaveWebhooks: (webhooks: Webhook[], selectId?: string) => void`,
  `onSetDestinationEnabled: (id: string, enabled: boolean) => void`.
  `useSettings` returns `enabledWebhookIds` and `setEnabledWebhookIds`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/SettingsView.test.tsx`:

```ts
describe('Discord › Destinations', () => {
    const webhooks = [
        { id: 'w1', name: 'Raid Channel', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/1/x' },
        { id: 'b1', name: 'Axi › #reports', kind: 'bridge' as const, relayUrl: 'https://bot.example.com', token: 'axb1.s' }
    ];

    it('renders the destinations card inside the Discord pane', () => {
        renderSettingsView({ webhooks, enabledWebhookIds: ['w1'] });
        const pane = document.querySelector('[data-settings-pane="discord"]')!;
        expect(pane.querySelector('#destinations')).not.toBeNull();
        expect(screen.getByText('Raid Channel')).toBeInTheDocument();
    });

    it('reports a toggle up to the owner without touching the other rows', async () => {
        const user = userEvent.setup();
        const onSetDestinationEnabled = vi.fn();
        renderSettingsView({ webhooks, enabledWebhookIds: ['w1'], onSetDestinationEnabled });
        await user.click(screen.getByRole('switch', { name: /Axi › #reports/i }));
        expect(onSetDestinationEnabled).toHaveBeenCalledWith('b1', true);
        expect(onSetDestinationEnabled).toHaveBeenCalledTimes(1);
    });

    it('renders Report Links inside the Discord pane too', () => {
        renderSettingsView({ webhooks, enabledWebhookIds: [] });
        const pane = document.querySelector('[data-settings-pane="discord"]')!;
        expect(pane.querySelector('#report-links')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx -t "Discord › Destinations"`
Expected: FAIL — `#destinations` is null.

- [ ] **Step 3: Add `enabledWebhookIds` to `useSettings`**

In `src/renderer/app/hooks/useSettings.ts`, beside `selectedWebhookId`
(line 32):

```ts
    const [enabledWebhookIds, setEnabledWebhookIds] = useState<string[]>([]);
```

In the settings-load effect beside the `settings.selectedWebhookId` branch
(lines 79-80):

```ts
            if (Array.isArray(settings.enabledWebhookIds)) {
                setEnabledWebhookIds(settings.enabledWebhookIds);
            }
```

`Array.isArray` rather than a truthiness check: an empty array is a real
value meaning "everything off" and must be adopted, and the main process
already derives an un-upgraded install's list from `selectedWebhookId` before
sending it (Task 3), so an empty array here is never the migration case.

Add `enabledWebhookIds, setEnabledWebhookIds` to both the returned object
(line 189) and the dependency list at line 201.

- [ ] **Step 4: Own the toggle handler in `App.tsx`**

In `src/renderer/App.tsx`, destructure `enabledWebhookIds, setEnabledWebhookIds`
from `useSettings` beside `selectedWebhookId` (line 75), and add the handler
near the selected-webhook memo (line 462):

```tsx
    const handleSetDestinationEnabled = useCallback((id: string, enabled: boolean) => {
        const next = enabled
            ? [...enabledWebhookIds.filter((existing) => existing !== id), id]
            : enabledWebhookIds.filter((existing) => existing !== id);
        setEnabledWebhookIds(next);
        // `selectedWebhookId` travels with the save: settingsHandlers still
        // returns it and the export/import list still reads it, so it mirrors
        // the first enabled id rather than going stale.
        handleUpdateSettings({ enabledWebhookIds: next, selectedWebhookId: next[0] ?? null });
        setSelectedWebhookId(next[0] ?? null);
    }, [enabledWebhookIds, handleUpdateSettings, setEnabledWebhookIds, setSelectedWebhookId]);

    const handleSaveWebhooks = useCallback((nextWebhooks: Webhook[], selectId?: string) => {
        const intent = resolveWebhookSaveIntent(selectedWebhookId, nextWebhooks, selectId);
        setWebhooks(intent.webhooks);
        // A freshly linked bridge must be enabled in the same save, or the
        // main process re-derives the destination list without it and the
        // newly linked channel never activates.
        const nextEnabled = selectId
            ? [...enabledWebhookIds.filter((id) => id !== selectId), selectId]
            : enabledWebhookIds.filter((id) => nextWebhooks.some((w) => w.id === id));
        setEnabledWebhookIds(nextEnabled);
        if (intent.selectedWebhookId !== undefined) setSelectedWebhookId(intent.selectedWebhookId);
        handleUpdateSettings({ ...intent, enabledWebhookIds: nextEnabled });
    }, [selectedWebhookId, enabledWebhookIds, handleUpdateSettings, setWebhooks, setEnabledWebhookIds, setSelectedWebhookId]);
```

Import `resolveWebhookSaveIntent` from `./app/webhookSaveIntent` and
`type Webhook` from `./WebhookModal`. The non-`selectId` branch filters the
enabled list against the new webhooks so deleting an enabled destination drops
its id rather than leaving a dangling one — `resolveDiscordDestinations`
already ignores unmatched ids, but leaving them would make the list grow
without bound.

Add `enabledWebhookIds`, `handleSetDestinationEnabled` and `handleSaveWebhooks`
to the `AppLayout` props object (line 1150) and its `useMemo` dependency list
(line 1159).

- [ ] **Step 5: Forward the props through `AppLayout`**

In `src/renderer/app/AppLayout.tsx`, destructure the three new values from
props, pass them to `SettingsView` (beside `parserSettingsFocusTrigger`, line
460):

```tsx
                                webhooks={webhooks}
                                enabledWebhookIds={enabledWebhookIds}
                                onSaveWebhooks={handleSaveWebhooks}
                                onSetDestinationEnabled={handleSetDestinationEnabled}
```

and replace the `WebhookModal`'s inline `onSave` (lines 549-557) and the Task 8
stopgap `onSetEnabled` with the shared handlers:

```tsx
            <WebhookModal
                isOpen={webhookModalOpen}
                onClose={() => setWebhookModalOpen(false)}
                webhooks={webhooks}
                enabledWebhookIds={enabledWebhookIds}
                onSave={handleSaveWebhooks}
                onSetEnabled={handleSetDestinationEnabled}
            />
```

`resolveWebhookSaveIntent` now lives inside `handleSaveWebhooks` in `App.tsx`,
so delete its import from `AppLayout.tsx`. Its own unit tests
(`webhookSaveIntent.test.ts`) still cover it; update
`AppLayout.webhookActivation.test.tsx` — which exists specifically to catch
the call site being deleted — to assert against `handleSaveWebhooks` instead.

- [ ] **Step 6: Render the two Discord sections**

Add the four new props to `SettingsViewProps` and to the destructured
parameter list at line 221:

```tsx
    webhooks: Webhook[];
    enabledWebhookIds: string[];
    onSaveWebhooks: (webhooks: Webhook[], selectId?: string) => void;
    onSetDestinationEnabled: (id: string, enabled: boolean) => void;
```

Inside the `discord` pane, before the `embed-summary` section:

```tsx
                        <SettingsSection title="Destinations" icon={MessageSquare} delay={0.02} sectionId="destinations">
                            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                                Every destination switched on here receives each fight report.
                            </p>
                            <DestinationsCard
                                webhooks={webhooks}
                                enabledWebhookIds={enabledWebhookIds}
                                onSave={onSaveWebhooks}
                                onSetEnabled={onSetDestinationEnabled}
                            />
                        </SettingsSection>
```

and, after `embed-top`, move the existing `ReportWebhooksCard` render — wherever
it currently lives in the tree — inside a new section:

```tsx
                        <SettingsSection title="Report Links" icon={Link} delay={0.16} sectionId="report-links">
                            {/* the existing ReportWebhooksCard element, moved verbatim with its existing props */}
                        </SettingsSection>
```

`ReportWebhooksCard` is moved, not changed. `reportWebhooks` is already a
multi-select list with its own per-publish selection (`reportWebhookSelection`,
fanned out by `postReportToWebhooks` in `githubHandlers.ts`) and has nothing to
do with the fight-report destination list above it.

Import `DestinationsCard` from `./settings/DestinationsCard`, `type Webhook`
from `./WebhookModal`, and `MessageSquare` / `Link` from `lucide-react` if not
already imported.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/ src/renderer/app/__tests__/ src/renderer/settings/__tests__/`
Expected: PASS.

- [ ] **Step 8: Validate and commit**

```bash
npm run validate
git add src/renderer/
git commit -m "feat(settings): bring Discord destinations into Settings

Settings could say what a report contains but never where it goes. The
same DestinationsCard the header modal mounts now renders inline under
Discord, with a per-destination enable switch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Log Directory in Settings

**Files:**
- Modify: `src/renderer/SettingsView.tsx` — the `logs` pane gains a `log-directory` section
- Modify: `src/renderer/app/AppLayout.tsx:457-460` — forward two more props
- Modify: `src/renderer/App.tsx:1150-1161` — pass `logDirectory` and the picker opener
- Test: `src/renderer/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: the `logs` pane (Task 5).
- Produces: `SettingsViewProps` gains `logDirectory: string | null` and `onChangeLogDirectory: () => void`.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/__tests__/SettingsView.test.tsx`:

```ts
describe('Logs › Log Directory', () => {
    it('shows the current folder', () => {
        renderSettingsView({ logDirectory: '/home/u/Documents/Guild Wars 2/addons/arcdps/arcdps.cbtlogs' });
        expect(screen.getByText(/arcdps\.cbtlogs/)).toBeInTheDocument();
    });

    it('says when no folder is set rather than rendering an empty row', () => {
        renderSettingsView({ logDirectory: null });
        expect(screen.getByText(/No log folder selected/i)).toBeInTheDocument();
    });

    it('launches the existing picker rather than reimplementing one', async () => {
        const user = userEvent.setup();
        const onChangeLogDirectory = vi.fn();
        renderSettingsView({ logDirectory: '/tmp/logs', onChangeLogDirectory });
        await user.click(screen.getByRole('button', { name: /change folder/i }));
        expect(onChangeLogDirectory).toHaveBeenCalledTimes(1);
    });

    it('renders inside the Logs pane', () => {
        renderSettingsView({ logDirectory: '/tmp/logs' });
        expect(document.querySelector('[data-settings-pane="logs"] #log-directory')).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx -t "Log Directory"`
Expected: FAIL — no `#log-directory`.

- [ ] **Step 3: Render the card**

Add to `SettingsViewProps` and the destructured parameter list:

```tsx
    logDirectory: string | null;
    onChangeLogDirectory: () => void;
```

Inside the `logs` pane, before the `dps-token` section:

```tsx
                        <SettingsSection title="Log Directory" icon={FolderOpen} delay={0.04} sectionId="log-directory">
                            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                                The arcdps folder AxiBridge watches for new logs.
                            </p>
                            <div className="flex items-center gap-2">
                                <code
                                    className="flex-1 truncate rounded-[4px] px-2 py-1.5 text-xs"
                                    style={{ background: 'var(--bg-input)', color: logDirectory ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                                >
                                    {logDirectory || 'No log folder selected.'}
                                </code>
                                <button
                                    type="button"
                                    onClick={onChangeLogDirectory}
                                    className="shrink-0 rounded-[4px] px-3 py-1.5 text-xs font-medium"
                                    style={{ background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
                                >
                                    Change Folder
                                </button>
                            </div>
                        </SettingsSection>
```

This is a read-and-launch card, not a second picker: `onChangeLogDirectory`
opens the existing `FilePickerModal`, and picking a folder goes through the
same handler the header flow already uses.

- [ ] **Step 4: Wire the opener**

`src/renderer/App.tsx` builds `filePickerState` from `useFilePicker` (line
314) and `filePickerCtx` (line 1146). Read `useFilePicker`'s returned object
and use its existing open action — do not add a new one. Pass through the
`AppLayout` props object:

```tsx
        logDirectory,
        onChangeLogDirectory: filePickerState.openPicker,
```

substituting the real opener name from `useFilePicker`. Add both to the
`useMemo` dependency list at line 1159, then forward them from `AppLayout.tsx`
to `SettingsView`:

```tsx
                                logDirectory={logDirectory}
                                onChangeLogDirectory={onChangeLogDirectory}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/__tests__/SettingsView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Validate and commit**

```bash
npm run validate
git add src/renderer/
git commit -m "feat(settings): show and change the log folder from Settings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Multi-select header dropdown

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx:476-536` (the dropdown) and wherever its trigger label is rendered
- Test: `src/renderer/app/__tests__/AppLayout.webhookActivation.test.tsx`

**Interfaces:**
- Consumes: `enabledWebhookIds` and `handleSetDestinationEnabled` (Task 9).
- Produces: no new exports. `selectedWebhookId` is no longer read by the dropdown.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/app/__tests__/AppLayout.webhookActivation.test.tsx`
(reuse the file's existing render helper):

```ts
describe('destination dropdown multi-select', () => {
    const webhooks = [
        { id: 'w1', name: 'Raid Channel', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/1/x' },
        { id: 'w2', name: 'Guild Channel', kind: 'webhook' as const, url: 'https://discord.com/api/webhooks/2/y' }
    ];

    it('turning one destination on leaves the other on', async () => {
        const user = userEvent.setup();
        const handleSetDestinationEnabled = vi.fn();
        renderAppLayout({ webhooks, enabledWebhookIds: ['w1'], handleSetDestinationEnabled, webhookDropdownOpen: true });
        await user.click(screen.getByRole('option', { name: /Guild Channel/i }));
        expect(handleSetDestinationEnabled).toHaveBeenCalledWith('w2', true);
        expect(handleSetDestinationEnabled).toHaveBeenCalledTimes(1);
    });

    it('marks every enabled row as selected', () => {
        renderAppLayout({ webhooks, enabledWebhookIds: ['w1', 'w2'], webhookDropdownOpen: true });
        expect(screen.getByRole('option', { name: /Raid Channel/i })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('option', { name: /Guild Channel/i })).toHaveAttribute('aria-selected', 'true');
    });

    it('stays open after a toggle so several can be switched in one visit', async () => {
        const user = userEvent.setup();
        const setWebhookDropdownOpen = vi.fn();
        renderAppLayout({ webhooks, enabledWebhookIds: [], setWebhookDropdownOpen, webhookDropdownOpen: true });
        await user.click(screen.getByRole('option', { name: /Raid Channel/i }));
        expect(setWebhookDropdownOpen).not.toHaveBeenCalledWith(false);
    });

    it('Disabled clears every enabled destination and closes', async () => {
        const user = userEvent.setup();
        const handleSetDestinationEnabled = vi.fn();
        const setWebhookDropdownOpen = vi.fn();
        renderAppLayout({ webhooks, enabledWebhookIds: ['w1', 'w2'], handleSetDestinationEnabled, setWebhookDropdownOpen, webhookDropdownOpen: true });
        await user.click(screen.getByRole('option', { name: /^Disabled$/ }));
        expect(handleSetDestinationEnabled).toHaveBeenCalledWith('w1', false);
        expect(handleSetDestinationEnabled).toHaveBeenCalledWith('w2', false);
        expect(setWebhookDropdownOpen).toHaveBeenCalledWith(false);
    });
});

describe('destination dropdown summary label', () => {
    it('reads the destination name when exactly one is enabled', () => {
        renderAppLayout({ webhooks: [{ id: 'w1', name: 'Raid Channel', kind: 'webhook' as const, url: 'u' }], enabledWebhookIds: ['w1'] });
        expect(screen.getByText('Raid Channel')).toBeInTheDocument();
    });

    it('counts them when more than one is enabled', () => {
        renderAppLayout({
            webhooks: [
                { id: 'w1', name: 'A', kind: 'webhook' as const, url: 'u' },
                { id: 'w2', name: 'B', kind: 'webhook' as const, url: 'v' }
            ],
            enabledWebhookIds: ['w1', 'w2']
        });
        expect(screen.getByText('2 destinations')).toBeInTheDocument();
    });

    it('reads Disabled when none are enabled', () => {
        renderAppLayout({ webhooks: [{ id: 'w1', name: 'A', kind: 'webhook' as const, url: 'u' }], enabledWebhookIds: [] });
        expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/app/__tests__/AppLayout.webhookActivation.test.tsx`
Expected: FAIL — clicking a row calls `setSelectedWebhookId`, not `handleSetDestinationEnabled`.

- [ ] **Step 3: Make the rows toggles**

In `src/renderer/app/AppLayout.tsx`, replace the "Disabled" button's handler
(lines 485-490):

```tsx
                            onClick={() => {
                                // Clearing is one explicit action, so it closes;
                                // per-row toggles stay open.
                                for (const id of enabledWebhookIds) handleSetDestinationEnabled(id, false);
                                setWebhookDropdownOpen(false);
                            }}
```

and its selected style/aria to key off the list:

```tsx
                            style={enabledWebhookIds.length === 0
                                ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                : { color: 'var(--text-secondary)' }}
                            role="option"
                            aria-selected={enabledWebhookIds.length === 0}
```

In the `webhooks.map` (line 500), replace the handler and the two
`selectedWebhookId === hook.id` reads:

```tsx
                            const isEnabled = enabledWebhookIds.includes(hook.id);
```

```tsx
                                    onClick={() => handleSetDestinationEnabled(hook.id, !isEnabled)}
                                    className="w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2"
                                    style={isEnabled
                                        ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                        : { color: 'var(--text-secondary)' }}
                                    role="option"
                                    aria-selected={isEnabled}
```

The dropdown no longer closes on a row click — with fan-out, switching on
three destinations should take one visit, not three. Keep the bolt/`Bridge`
badge and the `Re-link` warning rows exactly as they are: they mirror the
card's affordances and nothing about them changes.

Delete `selectedWebhookId` and `setSelectedWebhookId` from `AppLayout`'s
destructured props if nothing else there reads them
(`grep -n "selectedWebhookId" src/renderer/app/AppLayout.tsx`).

- [ ] **Step 4: Rewrite the trigger's summary label**

Find the dropdown trigger (the button `webhookDropdownOpen` toggles — search
for `setWebhookDropdownOpen(` outside the portal) and replace whatever it
renders as its current-destination text with:

```tsx
                        {enabledWebhookIds.length === 0
                            ? 'Disabled'
                            : enabledWebhookIds.length === 1
                                ? (webhooks.find((hook: any) => hook.id === enabledWebhookIds[0])?.name ?? 'Disabled')
                                : `${enabledWebhookIds.length} destinations`}
```

An enabled id with no matching entry falls back to "Disabled" rather than
rendering blank — it resolves to no destination in the main process, so
"Disabled" is the accurate word for it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/renderer/app/__tests__/`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and validate**

Run: `npm run validate && npx vitest run --maxWorkers=2`
Expected: all 318 files pass. The suite takes ~2 minutes.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/app/
git commit -m "feat(discord): make the header destination picker a multi-select

Reads the destination name when one is enabled, 'N destinations' when
more, 'Disabled' when none. Stays open across toggles.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| Information Architecture (5 categories / 16 subsections) | 4 |
| Mapping from today's sections | 4, 5 |
| Renames; "embed" disappears | 4, 7 |
| One lossy placement (Compute Damage Modifiers sub-label) | 7 |
| Aligning `IMPORT_SETTING_META` | 7 |
| Nested rail, one category expanded | 4, 5 |
| Deep links keep working | 5 |
| `stepSettingsSection` crosses boundaries | 4, 5 |
| Search across categories, per-category counts | 6 |
| `DestinationsCard`, one component two mounts | 8 |
| Store migration `selectedWebhookId` → `enabledWebhookIds` | 1 |
| Plural resolver; empty-means-none | 1 |
| `DiscordDestination.id`, `setDestinations`, `SendResult[]` | 1, 2 |
| Payload built once; sequential sends | 2 (Ruling A) |
| Per-destination failure handling | 3 |
| `settingsHandlers` payload | 3 |
| Header dropdown multi-select | 11 |
| Log Directory card | 10 |

No gaps.

**2. Placeholder scan**

One block comment in Task 8 Step 3 marks where the moved handlers and JSX go
rather than reproducing ~300 lines of code that already exists in
`WebhookModal.tsx` verbatim. The step says explicitly that they are moved, not
written, names each handler, and names the three changes to make while moving.
That is a move instruction, not a "TODO". Everything else is concrete.

**3. Type consistency**

- `resolveDiscordDestinations` / `applyDiscordDestinations` / `readEnabledWebhookIds` / `handleDiscordSendResults` — plural everywhere they appear (Tasks 1, 3).
- `setDestinations` (not `setDestination`) in Tasks 1, 2, 3 and in every test double.
- `SendResult` carries `destinationId` from Task 2 onward; Task 3's tests and handler both use it.
- `DestinationsCard` props `{ webhooks, enabledWebhookIds, onSave, onSetEnabled }` are identical in Tasks 8, 9 and in `WebhookModal`'s forward.
- `SettingsView`'s prop is `onSetDestinationEnabled`; the card's is `onSetEnabled`; Task 9 Step 6 wires one to the other explicitly. Different names on purpose — the card's prop is card-scoped, the view's is view-scoped.
- `navigateToSection` (category-aware) vs `scrollToSettingsSection` (in-pane) are used consistently from Task 5 onward.
