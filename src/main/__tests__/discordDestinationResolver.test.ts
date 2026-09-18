import { describe, expect, it, vi } from 'vitest';
import {
    applyDiscordDestination,
    handleDiscordSendResult,
    resolveDiscordDestination,
    shouldSendDiscord,
    type DestinationStore,
    type StoredWebhookEntry
} from '../discordDestinationResolver';

/** A minimal in-memory stand-in for electron-store, matching only the get/set surface used here. */
class FakeStore implements DestinationStore {
    private data = new Map<string, unknown>();

    constructor(initial: Record<string, unknown> = {}) {
        for (const [key, value] of Object.entries(initial)) {
            this.data.set(key, value);
        }
    }

    get(key: string, defaultValue?: unknown): unknown {
        return this.data.has(key) ? this.data.get(key) : defaultValue;
    }

    set(key: string, value: unknown): void {
        this.data.set(key, value);
    }
}

const bridgeEntry: StoredWebhookEntry = {
    id: 'bridge-1',
    kind: 'bridge',
    relayUrl: 'https://bot.example.com',
    token: 'axb1.secret'
};

const webhookEntry: StoredWebhookEntry = {
    id: 'webhook-1',
    kind: 'webhook',
    url: 'https://discord.com/api/webhooks/1/x'
};

describe('resolveDiscordDestination', () => {
    // Ruling C: a bridge destination has no discordWebhookUrl, so the old
    // gate (`selectedWebhookId && discordWebhookUrl`) was permanently false
    // for bridge users. The resolver must recognize a bridge entry on its own.
    it('resolves a bridge destination even with no legacy discordWebhookUrl set', () => {
        const store = new FakeStore({
            webhooks: [bridgeEntry],
            selectedWebhookId: 'bridge-1',
            discordWebhookUrl: null
        });

        expect(resolveDiscordDestination(store)).toEqual({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.secret'
        });
    });

    it('resolves a webhook destination from the selected entry', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry],
            selectedWebhookId: 'webhook-1'
        });

        expect(resolveDiscordDestination(store)).toEqual({
            kind: 'webhook',
            url: 'https://discord.com/api/webhooks/1/x'
        });
    });

    it('falls back to the legacy discordWebhookUrl only when webhooks is genuinely empty', () => {
        // An unmigrated, pre-webhooks[] store: honour the legacy field.
        const store = new FakeStore({
            webhooks: [],
            selectedWebhookId: null,
            discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/y'
        });

        expect(resolveDiscordDestination(store)).toEqual({
            kind: 'webhook',
            url: 'https://discord.com/api/webhooks/legacy/y'
        });
    });

    it('resolves to null when nothing is configured', () => {
        const store = new FakeStore({});
        expect(resolveDiscordDestination(store)).toBeNull();
    });

    // Fix round 1, item 1 (Critical): Ruling C's "fall back to legacy when
    // unresolvable" and the mirror policy ("keep discordWebhookUrl in sync
    // with the selection") were jointly unsatisfiable — the mirror write
    // from a real webhook selection fed straight back into this fallback the
    // moment the user picked "Disabled" (selectedWebhookId: null), silently
    // re-arming a destination the UI showed as off. New ruling: with a
    // non-empty webhooks list, an unresolvable or null selection means OFF.
    it('does not fall back to legacy once webhooks[] is non-empty, even if a selection is missing', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry],
            selectedWebhookId: 'missing-id',
            discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/y'
        });

        expect(resolveDiscordDestination(store)).toBeNull();
    });

    it('resolves to null for "Disabled" (selectedWebhookId: null) even with a mirrored legacy URL still in the store', () => {
        // The exact reviewer repro: the mirror that a prior selection wrote
        // into discordWebhookUrl must not resurrect a destination once the
        // user has explicitly selected nothing.
        const store = new FakeStore({
            webhooks: [webhookEntry],
            selectedWebhookId: null,
            discordWebhookUrl: webhookEntry.url
        });

        expect(resolveDiscordDestination(store)).toBeNull();
    });
});

// Fix round 1, item 2: this is the exact seam `index.ts`'s two send-gate
// call sites are wired to. There is no repo-wide test that imports
// `main/index.ts` (it runs Electron-app side effects at module scope), so a
// miswire at either call site can't be caught by exercising `index.ts`
// directly — the mitigation is to make the gate a single exported,
// independently-tested predicate that both call sites import and call
// as-is, rather than each re-deriving `Boolean(resolveDiscordDestination())`
// inline (which is itself un-reviewable boilerplate duplication).
describe('shouldSendDiscord', () => {
    it('is true for a resolvable bridge selection', () => {
        const store = new FakeStore({ webhooks: [bridgeEntry], selectedWebhookId: 'bridge-1' });
        expect(shouldSendDiscord(store)).toBe(true);
    });

    it('is true for a resolvable webhook selection', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], selectedWebhookId: 'webhook-1' });
        expect(shouldSendDiscord(store)).toBe(true);
    });

    it('is true for a genuinely unmigrated legacy-only store', () => {
        const store = new FakeStore({ webhooks: [], discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/y' });
        expect(shouldSendDiscord(store)).toBe(true);
    });

    // The Disabled case from item 1: a non-empty webhooks[] with no
    // resolvable selection must gate sends off even if a stale legacy URL
    // is still sitting in the store.
    it('is false for "Disabled" despite a stale legacy discordWebhookUrl', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry],
            selectedWebhookId: null,
            discordWebhookUrl: webhookEntry.url
        });
        expect(shouldSendDiscord(store)).toBe(false);
    });

    it('is false when nothing is configured', () => {
        expect(shouldSendDiscord(new FakeStore({}))).toBe(false);
    });
});

describe('applyDiscordDestination', () => {
    // Ruling F: app boot used to call discord.setWebhookUrl(legacy) directly
    // and never looked at webhooks[]/selectedWebhookId, so a bridge-only user
    // booted with no destination at all.
    it('activates a bridge destination and clears the legacy mirror', () => {
        const store = new FakeStore({
            webhooks: [bridgeEntry],
            selectedWebhookId: 'bridge-1',
            discordWebhookUrl: 'https://discord.com/api/webhooks/stale/z'
        });
        const setDestination = vi.fn();
        const discord = { setDestination } as any;

        applyDiscordDestination(store, discord);

        expect(setDestination).toHaveBeenCalledWith({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.secret'
        });
        // A URL the user has since replaced with a bridge must not survive
        // where the send-gate or a later boot could resurrect it.
        expect(store.get('discordWebhookUrl')).toBeNull();
    });

    // Fix round 1, item 1: the reviewer's second manifestation — deleting or
    // deselecting the active webhook must not leave the old mirror live to
    // be resurrected by this same function on the next call (e.g. at boot).
    it('clears the destination and the mirror when Disabled is selected despite a stale legacy URL', () => {
        const store = new FakeStore({
            webhooks: [webhookEntry],
            selectedWebhookId: null,
            discordWebhookUrl: webhookEntry.url
        });
        const setDestination = vi.fn();

        applyDiscordDestination(store, { setDestination } as any);

        expect(setDestination).toHaveBeenCalledWith(null);
        expect(store.get('discordWebhookUrl')).toBeNull();
    });

    it('mirrors a webhook destination back onto discordWebhookUrl', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], selectedWebhookId: 'webhook-1' });
        const setDestination = vi.fn();
        applyDiscordDestination(store, { setDestination } as any);

        expect(setDestination).toHaveBeenCalledWith({ kind: 'webhook', url: webhookEntry.url });
        expect(store.get('discordWebhookUrl')).toBe(webhookEntry.url);
    });

    // Ruling H, rebuilt on the real flow (fix round 1, item 3): the id of a
    // newly linked entry is freshly generated by the renderer
    // (`crypto.randomUUID()`), so `selectedWebhookId` can never already
    // point at it before the link — the "renderer pre-selected it" premise
    // the old version of this test relied on is impossible. The real flow
    // is `applySettings` re-deriving twice for one `saveSettings({ webhooks,
    // selectedWebhookId })` call: once when the `webhooks` field is applied
    // (selection not yet updated), and again when the `selectedWebhookId`
    // field is applied. This test would fail if the WebhookModal link flow's
    // auto-selection (item 3) were removed — the first call demonstrates
    // exactly that failure mode.
    it('activates a newly linked bridge entry only once its own id is also selected', () => {
        const store = new FakeStore({ webhooks: [], selectedWebhookId: null });
        const setDestination = vi.fn();
        const discord = { setDestination } as any;

        // Step 1: the `webhooks` field lands first (as it does in
        // `applySettings`'s field-by-field processing), before the
        // `selectedWebhookId` field of the same save is applied. Per Ruling
        // C (item 1), a non-empty webhooks[] with no resolvable selection is
        // OFF — this is the "auto-selection removed" failure mode.
        store.set('webhooks', [bridgeEntry]);
        applyDiscordDestination(store, discord);
        expect(setDestination).toHaveBeenLastCalledWith(null);

        // Step 2: the `selectedWebhookId` field of the same save lands,
        // naming the just-linked entry's own (freshly generated) id — this
        // is what item 3's auto-selection actually does.
        store.set('selectedWebhookId', 'bridge-1');
        applyDiscordDestination(store, discord);

        expect(setDestination).toHaveBeenLastCalledWith({
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: 'axb1.secret'
        });
    });
});

describe('handleDiscordSendResult', () => {
    it('ignores a successful result', () => {
        const store = new FakeStore({});
        const discord = { setDestination: vi.fn() } as any;
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResult(store, discord, win, { ok: true });

        expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('clears a revoked token, re-derives the destination to null, and notifies the renderer', () => {
        const store = new FakeStore({
            webhooks: [bridgeEntry],
            selectedWebhookId: 'bridge-1'
        });
        const setDestination = vi.fn();
        const discord = { setDestination } as any;
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResult(store, discord, win, {
            ok: false,
            reason: 'revoked',
            message: 'This link was revoked — pair again.'
        });

        const storedWebhooks = store.get('webhooks') as StoredWebhookEntry[];
        expect(storedWebhooks[0].token).toBeUndefined();
        expect(setDestination).toHaveBeenLastCalledWith(null);
        expect(win.webContents.send).toHaveBeenCalledWith('discord-destination-status', {
            webhookId: 'bridge-1',
            reason: 'revoked',
            message: 'This link was revoked — pair again.'
        });
    });

    // Fix round 1, item 13: `classify()` in discord.ts returns the same
    // revoked/forbidden/rate-limited shapes for a webhook destination as for
    // a bridge one, but the bridge-flavoured wording and unlink-on-revoke
    // behaviour must not fire for a plain webhook — that keeps its
    // pre-Task-9 console-only behaviour.
    it('does nothing for a webhook destination, even on a "revoked" (401) result', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], selectedWebhookId: 'webhook-1' });
        const discord = { setDestination: vi.fn() } as any;
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResult(store, discord, win, {
            ok: false,
            reason: 'revoked',
            message: 'This link was revoked — pair again.'
        });

        expect(discord.setDestination).not.toHaveBeenCalled();
        expect(win.webContents.send).not.toHaveBeenCalled();
        expect(store.get('webhooks')).toEqual([webhookEntry]);
    });

    it('does nothing when nothing is selected', () => {
        const store = new FakeStore({ webhooks: [bridgeEntry], selectedWebhookId: null });
        const discord = { setDestination: vi.fn() } as any;
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResult(store, discord, win, { ok: false, reason: 'network', message: 'boom' });

        expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('surfaces a non-revoked failure without touching the stored webhooks', () => {
        const store = new FakeStore({ webhooks: [bridgeEntry], selectedWebhookId: 'bridge-1' });
        const discord = { setDestination: vi.fn() } as any;
        const win = { webContents: { send: vi.fn() } };

        handleDiscordSendResult(store, discord, win, {
            ok: false,
            reason: 'forbidden',
            message: 'Axi cannot post in that channel.'
        });

        expect(discord.setDestination).not.toHaveBeenCalled();
        expect((store.get('webhooks') as StoredWebhookEntry[])[0].token).toBe('axb1.secret');
        expect(win.webContents.send).toHaveBeenCalledWith('discord-destination-status', {
            webhookId: 'bridge-1',
            reason: 'forbidden',
            message: 'Axi cannot post in that channel.'
        });
    });
});
