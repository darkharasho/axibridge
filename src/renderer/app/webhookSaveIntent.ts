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
 * `applyDiscordDestination()` (main process) re-derives the active
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
