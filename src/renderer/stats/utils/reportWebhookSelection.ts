/** Which webhooks the publish popover pre-checks when it opens. An enabled hook
 *  is checked when it was checked last time (`selection`) or it is new since then
 *  (its id isn't in `seen` — newly-added webhooks default on). With no persisted
 *  history at all, everything is checked. This keeps a hook the user deliberately
 *  unchecked last time off, while still opting new hooks in by default. */
export const computeInitialWebhookSelection = (
    enabledWebhooks: Array<{ id: string }>,
    selection: string[] | null | undefined,
    seen: string[] | null | undefined
): string[] => {
    const ids = enabledWebhooks.map((hook) => hook.id);
    if (!Array.isArray(selection) || !Array.isArray(seen)) return ids;
    const selectedSet = new Set(selection);
    const seenSet = new Set(seen);
    return ids.filter((id) => selectedSet.has(id) || !seenSet.has(id));
};
