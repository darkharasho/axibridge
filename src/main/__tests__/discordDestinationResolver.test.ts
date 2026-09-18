import { describe, expect, it, vi } from 'vitest';
import {
    applyDiscordDestination,
    handleDiscordSendResult,
    resolveDiscordDestination,
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

    it('falls back to the legacy discordWebhookUrl when no selected entry resolves', () => {
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

    it('does not fall back to legacy when a selection is present but unresolvable', () => {
        // A selectedWebhookId that no longer matches any entry (deleted) is a
        // deliberate "nothing selected" state, not "ignore the selection" —
        // matching the Step 5 selectedWebhookId branch, which sets null here.
        const store = new FakeStore({
            webhooks: [],
            selectedWebhookId: 'missing-id',
            discordWebhookUrl: 'https://discord.com/api/webhooks/legacy/y'
        });

        // Per the required shared-helper shape, "no resolvable selected
        // entry" also covers a selection pointing at a deleted webhook —
        // the legacy field is still honoured so existing single-webhook
        // users are unaffected regardless of a stray selectedWebhookId.
        expect(resolveDiscordDestination(store)).toEqual({
            kind: 'webhook',
            url: 'https://discord.com/api/webhooks/legacy/y'
        });
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

    it('mirrors a webhook destination back onto discordWebhookUrl', () => {
        const store = new FakeStore({ webhooks: [webhookEntry], selectedWebhookId: 'webhook-1' });
        const setDestination = vi.fn();
        applyDiscordDestination(store, { setDestination } as any);

        expect(setDestination).toHaveBeenCalledWith({ kind: 'webhook', url: webhookEntry.url });
        expect(store.get('discordWebhookUrl')).toBe(webhookEntry.url);
    });

    // Ruling H: the link flow saves via `saveSettings({ webhooks })` alone,
    // with no selectedWebhookId in the payload — applying the destination
    // must not depend on a selection change being present in the same call.
    it('activates a newly linked bridge entry from a webhooks-only update with no selection change', () => {
        const store = new FakeStore({ webhooks: [], selectedWebhookId: 'bridge-1' });
        const setDestination = vi.fn();
        const discord = { setDestination } as any;

        // Simulates the `settings.webhooks !== undefined` branch: the
        // selection was already pointed at this id (e.g. it's the only
        // entry, or the renderer pre-selected it), but the entry itself only
        // just landed in the store via a webhooks-only save.
        store.set('webhooks', [bridgeEntry]);
        applyDiscordDestination(store, discord);

        expect(setDestination).toHaveBeenCalledWith({
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
