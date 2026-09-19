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
 * Whether to build the map slice for a report at all.
 *
 * Lives here rather than inline in `mapSliceFor` so a unit test can drive it
 * against a fake store without booting index.ts's Electron side effects.
 * Only an explicit `false` means off — `undefined` (never configured) and
 * `true` both mean on, matching the `includeMapSlice !== false` convention in
 * discord.ts. `false` must skip the whole tile fetch + renderer round trip,
 * not merely suppress the attachment: discord.ts's guard is defence in depth
 * for a mid-flight settings change, and does not prevent the work.
 */
export function shouldBuildMapSlice(store: DestinationStore): boolean {
    const settings = store.get('embedStatSettings') as { includeMapSlice?: boolean } | undefined;
    return settings?.includeMapSlice !== false;
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

/** The subset of BrowserWindow this module needs to notify the renderer. */
export interface DestinationWindow {
    webContents: { send(channel: string, payload: unknown): void };
}

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
