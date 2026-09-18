import type { DiscordDestination, DiscordNotifier, SendResult } from './discord';

/**
 * Structural subset of the renderer's `IWebhook` (src/renderer/global.d.ts)
 * needed here. Not imported directly: electron/tsconfig.json's program root
 * doesn't include src/renderer, and pulling in global.d.ts drags its whole
 * import graph (down into src/renderer/stats/*) into the main-process
 * typecheck, including files affected by unrelated bridge-metrics dist
 * staleness.
 */
export interface StoredWebhookEntry {
    id: string;
    kind?: 'webhook' | 'bridge';
    url?: string;
    relayUrl?: string;
    token?: string;
}

/** The subset of electron-store's API this module needs. */
export interface DestinationStore {
    get(key: string, defaultValue?: unknown): unknown;
    set(key: string, value: unknown): void;
}

/**
 * Resolve the active Discord destination from the store's `webhooks[]` +
 * `selectedWebhookId`, falling back to the legacy `discordWebhookUrl` when no
 * selected entry resolves (e.g. pre-webhooks[] users, or a selection that
 * points at a deleted entry). Shared by the send-gate check, the
 * `applySettings` re-derivation, and the app-boot restore so all three agree
 * on what "configured" means — see task-9-brief Rulings C, F, H.
 */
export function resolveDiscordDestination(store: DestinationStore): DiscordDestination | null {
    const webhooks = store.get('webhooks', []) as StoredWebhookEntry[];
    const selectedWebhookId = store.get('selectedWebhookId', null) as string | null;
    const selected = selectedWebhookId ? webhooks.find((w) => w.id === selectedWebhookId) : undefined;

    if (selected?.kind === 'bridge' && selected.relayUrl && selected.token) {
        return { kind: 'bridge', relayUrl: selected.relayUrl, token: selected.token };
    }
    if (selected?.url) {
        return { kind: 'webhook', url: selected.url };
    }
    if (!selected) {
        const legacyUrl = store.get('discordWebhookUrl', null);
        if (typeof legacyUrl === 'string' && legacyUrl.length > 0) {
            return { kind: 'webhook', url: legacyUrl };
        }
    }
    return null;
}

/**
 * Apply `resolveDiscordDestination()` to the live notifier, and keep the
 * legacy `discordWebhookUrl` mirror in sync: settingsHandlers.ts still
 * returns it to the renderer as "Legacy single webhook URL" (SettingsView.tsx),
 * so a bridge selection (or no resolvable selection) must clear it rather
 * than leaving a stale URL that this same resolver — or the pre-webhooks[]
 * boot path — could resurrect later.
 */
export function applyDiscordDestination(store: DestinationStore, discord: DiscordNotifier | null): void {
    const destination = resolveDiscordDestination(store);
    store.set('discordWebhookUrl', destination?.kind === 'webhook' ? destination.url : null);
    discord?.setDestination(destination);
}

/** The subset of BrowserWindow this module needs to notify the renderer. */
export interface DestinationWindow {
    webContents: { send(channel: string, payload: unknown): void };
}

/**
 * Act on a failed `sendLog` result: a revoked bridge token is dead forever,
 * so stop using it rather than retrying a credential that will never
 * authenticate again, and surface the failure to the renderer either way.
 */
export function handleDiscordSendResult(
    store: DestinationStore,
    discord: DiscordNotifier | null,
    win: DestinationWindow | null,
    sendResult: SendResult | undefined
): void {
    if (!sendResult || sendResult.ok) return;
    const selectedId = store.get('selectedWebhookId', null) as string | null;
    if (sendResult.reason === 'revoked' && selectedId) {
        const webhooks = (store.get('webhooks', []) as StoredWebhookEntry[]).map((w) =>
            w.id === selectedId ? { ...w, token: undefined } : w
        );
        store.set('webhooks', webhooks);
        applyDiscordDestination(store, discord);
    }
    win?.webContents.send('discord-destination-status', {
        webhookId: selectedId,
        reason: sendResult.reason,
        message: sendResult.message
    });
}
