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
 * `selectedWebhookId`. Shared by the send-gate check, the `applySettings`
 * re-derivation, and the app-boot restore so all three agree on what
 * "configured" means — see task-9-brief Rulings C, F, H.
 *
 * Fix round 1, item 1 (Critical): the legacy `discordWebhookUrl` is honoured
 * ONLY when `webhooks` is genuinely empty — a store that has never been
 * migrated to the webhooks[] model. Once `webhooks` is non-empty, an
 * unresolvable or null `selectedWebhookId` means the user has explicitly
 * selected "Disabled" (or deleted the selected entry), which must resolve to
 * `null`, not fall back. The old "fall back whenever `selected` doesn't
 * resolve" reading fed `applyDiscordDestination`'s own mirror write for a
 * *previous* selection straight back into this fallback the moment the user
 * picked Disabled, silently re-arming a destination the UI showed as off.
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
    if (webhooks.length === 0) {
        const legacyUrl = store.get('discordWebhookUrl', null);
        if (typeof legacyUrl === 'string' && legacyUrl.length > 0) {
            return { kind: 'webhook', url: legacyUrl };
        }
    }
    return null;
}

/**
 * Whether a report should be sent to Discord at all — the exact same
 * resolution the destination comes from, so the gate and the destination are
 * incapable of disagreeing. Exported as its own seam (fix round 1, item 2)
 * so the send-gate logic at both `processLogFile` call sites in `index.ts`
 * is a single imported function rather than inline, untestable duplication.
 */
export function shouldSendDiscord(store: DestinationStore): boolean {
    return resolveDiscordDestination(store) !== null;
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
 *
 * Fix round 1, item 13: scoped to bridge destinations only. `classify()` in
 * discord.ts returns the same `revoked`/`forbidden`/`rate-limited` shapes
 * for a webhook destination too (Discord webhook calls can 401/403/429 just
 * like a relay call can), but the wording here ("This link was revoked —
 * pair again.") and the unlink-the-token behavior only make sense for a
 * bridge. A plain webhook failure keeps its pre-Task-9 behaviour: console
 * only, via discord.ts's own `console.error`, no banner and no store write.
 */
export function handleDiscordSendResult(
    store: DestinationStore,
    discord: DiscordNotifier | null,
    win: DestinationWindow | null,
    sendResult: SendResult | undefined
): void {
    if (!sendResult || sendResult.ok) return;
    const selectedId = store.get('selectedWebhookId', null) as string | null;
    const webhooks = store.get('webhooks', []) as StoredWebhookEntry[];
    const selected = selectedId ? webhooks.find((w) => w.id === selectedId) : undefined;
    if (selected?.kind !== 'bridge') return;

    if (sendResult.reason === 'revoked') {
        const nextWebhooks = webhooks.map((w) => (w.id === selectedId ? { ...w, token: undefined } : w));
        store.set('webhooks', nextWebhooks);
        applyDiscordDestination(store, discord);
    }
    win?.webContents.send('discord-destination-status', {
        webhookId: selectedId,
        reason: sendResult.reason,
        message: sendResult.message
    });
}
