import { describe, expect, it, vi } from 'vitest';
import {
    applyDiscordDestinations,
    handleDiscordSendResult,
    readEnabledWebhookIds,
    resolveDiscordDestinations,
    shouldSendDiscord,
    shouldBuildMapSlice,
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

describe('shouldBuildMapSlice', () => {
    it('is off only when includeMapSlice is explicitly false', () => {
        const store = new FakeStore({ embedStatSettings: { includeMapSlice: false } });
        expect(shouldBuildMapSlice(store)).toBe(false);
    });

    it('is on when includeMapSlice is true', () => {
        const store = new FakeStore({ embedStatSettings: { includeMapSlice: true } });
        expect(shouldBuildMapSlice(store)).toBe(true);
    });

    it('is on when the setting has never been written', () => {
        // Both shapes of "never configured": no embedStatSettings at all, and
        // an embedStatSettings that predates the key.
        expect(shouldBuildMapSlice(new FakeStore({}))).toBe(true);
        expect(shouldBuildMapSlice(new FakeStore({ embedStatSettings: {} }))).toBe(true);
    });
});

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
