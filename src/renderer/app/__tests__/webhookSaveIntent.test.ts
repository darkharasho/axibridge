import { describe, expect, it } from 'vitest';
import { resolveWebhookSaveIntent, reconcileEnabledWebhookIds, toggleEnabledWebhookId, summarizeEnabledDestinations } from '../webhookSaveIntent';
import type { Webhook } from '../../WebhookModal';

const bridgeWebhook: Webhook = {
    id: 'bridge-1',
    name: 'Vigil Keep › #wvw-reports',
    kind: 'bridge',
    relayUrl: 'https://bot.example.com',
    token: 'axb1.secret'
};

const webhookEntry: Webhook = {
    id: 'webhook-1',
    name: 'My Guild',
    kind: 'webhook',
    url: 'https://discord.com/api/webhooks/1/x'
};

describe('resolveWebhookSaveIntent', () => {
    // Fix round 2, item 1 / Ruling N: this is the exact activation glue that
    // was previously untestable inline in AppLayout.tsx — a link that stores
    // a bridge entry without also selecting it in the SAME save is the
    // worst failure mode in this feature (the row appears, badged "Bridge",
    // and nothing ever sends). The observable outcome checked here is
    // exactly what `AppLayout.tsx`'s onSave now persists: the selection
    // must be the new entry's own id, in the same intent as the webhooks
    // array.
    it('selects the newly linked entry in the same intent that saves it', () => {
        const intent = resolveWebhookSaveIntent(null, [bridgeWebhook], 'bridge-1');
        expect(intent).toEqual({ webhooks: [bridgeWebhook], selectedWebhookId: 'bridge-1' });
    });

    it('selects the newly linked entry even when something else was already selected', () => {
        const intent = resolveWebhookSaveIntent('webhook-1', [webhookEntry, bridgeWebhook], 'bridge-1');
        expect(intent).toEqual({ webhooks: [webhookEntry, bridgeWebhook], selectedWebhookId: 'bridge-1' });
    });

    it('clears the selection when the selected entry was removed and nothing new was selected', () => {
        const intent = resolveWebhookSaveIntent('webhook-1', [], undefined);
        expect(intent).toEqual({ webhooks: [], selectedWebhookId: null });
    });

    it('leaves selectedWebhookId out of the intent for an unrelated edit', () => {
        const renamed: Webhook = { ...webhookEntry, name: 'Renamed Guild' };
        const intent = resolveWebhookSaveIntent('webhook-1', [renamed], undefined);
        expect(intent).toEqual({ webhooks: [renamed] });
        expect(intent).not.toHaveProperty('selectedWebhookId');
    });

    it('leaves selectedWebhookId out when nothing was ever selected', () => {
        const intent = resolveWebhookSaveIntent(null, [webhookEntry], undefined);
        expect(intent).toEqual({ webhooks: [webhookEntry] });
        expect(intent).not.toHaveProperty('selectedWebhookId');
    });
});

// Task 9 fix round 1, Ruling M: the enabled-destination-list reconciliation
// that runs alongside a webhook save, hoisted out of App.tsx's
// handleSaveWebhooks so the worst failure mode here (a freshly linked
// bridge that saves but never activates) has a direct test rather than
// only the wiring-level coverage AppLayout.webhookActivation.test.tsx gives.
describe('reconcileEnabledWebhookIds', () => {
    it('enables the newly linked entry alongside whatever was already enabled', () => {
        const next = reconcileEnabledWebhookIds(['webhook-1'], [webhookEntry, bridgeWebhook], 'bridge-1');
        expect(next).toEqual(['webhook-1', 'bridge-1']);
    });

    it('does not duplicate the selected id if it was already enabled', () => {
        const next = reconcileEnabledWebhookIds(['bridge-1'], [webhookEntry, bridgeWebhook], 'bridge-1');
        expect(next).toEqual(['bridge-1']);
    });

    it('does not drop or reorder other enabled ids when selecting a new one', () => {
        const next = reconcileEnabledWebhookIds(['a', 'b', 'c'], [webhookEntry, bridgeWebhook], 'bridge-1');
        expect(next).toEqual(['a', 'b', 'c', 'bridge-1']);
    });

    it('prunes ids whose webhook no longer exists when no selectId is given', () => {
        const next = reconcileEnabledWebhookIds(['webhook-1', 'deleted-1'], [webhookEntry], undefined);
        expect(next).toEqual(['webhook-1']);
    });

    it('keeps surviving ids untouched when no selectId is given', () => {
        const next = reconcileEnabledWebhookIds(['webhook-1', 'bridge-1'], [webhookEntry, bridgeWebhook], undefined);
        expect(next).toEqual(['webhook-1', 'bridge-1']);
    });
});

describe('toggleEnabledWebhookId', () => {
    it('adds the id when toggling on', () => {
        const next = toggleEnabledWebhookId(['webhook-1'], 'bridge-1', true);
        expect(next).toEqual(['webhook-1', 'bridge-1']);
    });

    it('does not duplicate an id that is already enabled when toggling on', () => {
        const next = toggleEnabledWebhookId(['webhook-1', 'bridge-1'], 'bridge-1', true);
        expect(next).toEqual(['webhook-1', 'bridge-1']);
    });

    it('removes the id when toggling off', () => {
        const next = toggleEnabledWebhookId(['webhook-1', 'bridge-1'], 'bridge-1', false);
        expect(next).toEqual(['webhook-1']);
    });

    it('is a no-op when toggling off an id that is not enabled', () => {
        const next = toggleEnabledWebhookId(['webhook-1'], 'bridge-1', false);
        expect(next).toEqual(['webhook-1']);
    });
});

// Task 11 / Ruling T: the header dropdown's trigger label lives in App.tsx,
// which `makeCtx`-based AppLayout tests can't reach (the trigger is inside
// the `configurationPanel` JSX App.tsx builds and hands to AppLayout as an
// opaque, pre-stubbed node). Hoisting the label logic into a pure function
// here — mirroring `resolveWebhookSaveIntent` / `reconcileEnabledWebhookIds`
// above — makes it directly testable instead of untestable-by-construction.
describe('summarizeEnabledDestinations', () => {
    it('reads the destination name when exactly one is enabled', () => {
        const label = summarizeEnabledDestinations([webhookEntry], ['webhook-1']);
        expect(label).toBe('My Guild');
    });

    it('counts them when more than one is enabled', () => {
        const label = summarizeEnabledDestinations([webhookEntry, bridgeWebhook], ['webhook-1', 'bridge-1']);
        expect(label).toBe('2 destinations');
    });

    it('reads Disabled when none are enabled', () => {
        const label = summarizeEnabledDestinations([webhookEntry], []);
        expect(label).toBe('Disabled');
    });

    it('falls back to Disabled when the single enabled id has no matching webhook', () => {
        const label = summarizeEnabledDestinations([webhookEntry], ['deleted-1']);
        expect(label).toBe('Disabled');
    });
});
