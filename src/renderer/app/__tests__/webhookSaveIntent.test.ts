import { describe, expect, it } from 'vitest';
import { resolveWebhookSaveIntent } from '../webhookSaveIntent';
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
