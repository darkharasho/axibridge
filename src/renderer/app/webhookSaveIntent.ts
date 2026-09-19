import type { Webhook } from '../WebhookModal';

/**
 * What `AppLayout.tsx`'s `WebhookModal.onSave` handler should do with a save:
 * the local `webhooks` state to adopt, and — only when present — the
 * `selectedWebhookId` to also adopt and persist alongside it.
 *
 * `selectedWebhookId` is deliberately omitted (not `null`) for the common
 * case of an unrelated edit (rename, add, delete-of-a-non-selected-entry):
 * the caller must not persist a `selectedWebhookId` field at all then, or
 * every plain webhook edit would needlessly re-write the selection.
 */
export interface WebhookSaveIntent {
    webhooks: Webhook[];
    selectedWebhookId?: string | null;
}

/**
 * Fix round 1, item 3 / Ruling N: a freshly linked bridge entry must be
 * selected in the SAME settings save that stores it, or
 * `applyDiscordDestinations()` (main process) re-derives the active
 * destination against whatever was already selected and the newly linked
 * channel never activates — the worst failure mode in this feature, because
 * the UI looks correct (the row appears, badged "Bridge") while nothing is
 * ever sent.
 *
 * Fix round 2, item 1: this sequence used to live inline in `AppLayout.tsx`'s
 * `WebhookModal` `onSave` prop, where reverting it left the full test suite
 * green — the same untested-DI-seam shape item 2 closed for the send gate,
 * one layer up in the renderer. Hoisting it here makes `AppLayout.tsx`'s
 * wiring a thin, one-line call to a directly-tested pure function instead.
 *
 * @param currentSelectedWebhookId the selection before this save (from
 *   renderer state, e.g. `useSettings`'s `selectedWebhookId`)
 * @param newWebhooks the webhooks list `WebhookModal` is asking to save
 * @param selectId when present (the link flow's success path), the id that
 *   must also be selected in this same save
 */
export function resolveWebhookSaveIntent(
    currentSelectedWebhookId: string | null,
    newWebhooks: Webhook[],
    selectId?: string
): WebhookSaveIntent {
    if (selectId) {
        return { webhooks: newWebhooks, selectedWebhookId: selectId };
    }
    // If the selected webhook was deleted (or unlinked), clear the selection
    // rather than leaving a `selectedWebhookId` that resolves to nothing.
    if (currentSelectedWebhookId && !newWebhooks.some((w) => w.id === currentSelectedWebhookId)) {
        return { webhooks: newWebhooks, selectedWebhookId: null };
    }
    return { webhooks: newWebhooks };
}

/**
 * Task 9 fix round 1, Ruling M: the enabled-destination-list reconciliation
 * that runs alongside a webhook save. Hoisted out of `App.tsx`'s
 * `handleSaveWebhooks` for the same reason `resolveWebhookSaveIntent` was
 * hoisted out of `AppLayout.tsx` — an untested inline branch is easy to
 * accidentally delete without any test noticing.
 *
 * A freshly linked bridge must be enabled in the same save, or the main
 * process re-derives the destination list without it and the newly linked
 * channel never activates — the worst failure mode here, because the UI
 * looks correct (the row appears) while nothing is ever sent. When there is
 * no `selectId`, this instead prunes ids whose webhook no longer exists in
 * `nextWebhooks` (e.g. it was deleted), so the enabled list doesn't grow
 * unbounded with dangling ids `resolveDiscordDestinations` would otherwise
 * silently ignore forever.
 */
export function reconcileEnabledWebhookIds(
    enabledWebhookIds: string[],
    nextWebhooks: Webhook[],
    selectId?: string
): string[] {
    return selectId
        ? [...enabledWebhookIds.filter((id) => id !== selectId), selectId]
        : enabledWebhookIds.filter((id) => nextWebhooks.some((w) => w.id === id));
}

/**
 * Task 9 fix round 1, Ruling M: per-destination enable/disable toggle logic,
 * hoisted out of `App.tsx`'s `handleSetDestinationEnabled` for direct
 * testing (see `reconcileEnabledWebhookIds` above for why).
 */
export function toggleEnabledWebhookId(
    enabledWebhookIds: string[],
    id: string,
    enabled: boolean
): string[] {
    return enabled
        ? [...enabledWebhookIds.filter((existing) => existing !== id), id]
        : enabledWebhookIds.filter((existing) => existing !== id);
}

/**
 * Task 11 / Ruling T: the header dropdown's trigger label. Hoisted into a
 * pure function for the same reason `resolveWebhookSaveIntent` and
 * `reconcileEnabledWebhookIds` were — the trigger itself lives in `App.tsx`
 * (inside the `configurationPanel` JSX block AppLayout receives as an opaque,
 * pre-built node), so it can't be exercised through an `AppLayout` test.
 *
 * Reads the destination's own name when exactly one is enabled, a count when
 * more than one is, and "Disabled" when none are. An enabled id with no
 * matching webhook entry (e.g. it was deleted elsewhere) also falls back to
 * "Disabled" rather than rendering blank — it resolves to no destination in
 * the main process, so "Disabled" is the accurate word for it.
 */
export function summarizeEnabledDestinations(
    webhooks: Webhook[],
    enabledWebhookIds: string[]
): string {
    if (enabledWebhookIds.length === 0) return 'Disabled';
    if (enabledWebhookIds.length === 1) {
        const match = webhooks.find((hook) => hook.id === enabledWebhookIds[0]);
        return match?.name ?? 'Disabled';
    }
    return `${enabledWebhookIds.length} destinations`;
}

/**
 * Fix pass item 2: which enabled destinations are revoked bridge links.
 *
 * The re-link warning used to be derived from `selectedWebhook` — i.e. from
 * `selectedWebhookId`, which this branch mirrors to `enabledWebhookIds[0]`.
 * Once the send path fanned out to N destinations that made the warning
 * depend on ORDER, and it was wrong in both directions:
 * `['healthy', 'revoked']` showed nothing at all while `revoked` silently
 * dropped every report, and `['revoked', 'healthy']` claimed "Reports are not
 * being sent" while `healthy` was still receiving them. It also self-flipped
 * across a restart, because the main process mirror filters unresolvable
 * entries and the renderer's does not.
 *
 * Deriving the warning from the whole enabled list instead removes the
 * order-dependence: a revoked bridge is a revoked bridge wherever it sits.
 *
 * A revoked bridge is a `kind === 'bridge'` entry whose `token` was cleared;
 * the entry (and its enabled flag) survives, so this persisted shape is the
 * only signal that outlives the renderer-only `discordDestinationStatus`.
 * Enabled ids with no matching webhook entry are NOT returned: they resolve
 * to no destination at all, which `summarizeEnabledDestinations` already
 * reports as "Disabled". Order follows `enabledWebhookIds`.
 */
export function enabledDestinationsNeedingRelink(
    webhooks: Webhook[],
    enabledWebhookIds: string[]
): Webhook[] {
    return enabledWebhookIds
        .map((id) => webhooks.find((hook) => hook.id === id))
        .filter((hook): hook is Webhook => !!hook && hook.kind === 'bridge' && !hook.token);
}

/**
 * Fix pass item 2: the copy for the re-link banner, derived from
 * `enabledDestinationsNeedingRelink`'s result. Hoisted here rather than
 * inlined in `App.tsx`'s JSX for the usual reason (see
 * `summarizeEnabledDestinations`) — and because the binding requirement is a
 * negative one that only a direct test can pin: the banner must never claim
 * reports are stopped while a healthy sibling is still receiving them.
 *
 * Only the single-destination case may speak for the whole app; that wording
 * is kept verbatim from before the fan-out. With a healthy sibling in play
 * the banner names the broken destination instead — by name when there is
 * one, by count when there are several.
 *
 * @param needingRelink the revoked bridge entries, in enabled order
 * @param enabledCount how many destinations are enabled in total
 * @returns the banner text, or `null` when there is nothing to warn about
 */
export function describeRelinkWarning(
    needingRelink: Webhook[],
    enabledCount: number
): string | null {
    if (needingRelink.length === 0) return null;
    if (enabledCount === 1) {
        return 'Re-link required — this bridge link was revoked. Reports are not being sent.';
    }
    if (needingRelink.length === 1) {
        return `Re-link required — ${needingRelink[0].name} was revoked and is not receiving reports.`;
    }
    return `Re-link required — ${needingRelink.length} destinations were revoked and are not receiving reports.`;
}
