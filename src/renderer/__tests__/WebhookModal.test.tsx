import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookModal, type Webhook } from '../WebhookModal';

const bridgeWebhook: Webhook = {
    id: 'bridge-1',
    name: 'Vigil Keep › #wvw-reports',
    kind: 'bridge',
    relayUrl: 'https://bot.example.com',
    token: 'axb1.secret',
    guildName: 'Vigil Keep',
    channelName: 'wvw-reports'
};

describe('WebhookModal — AxiTools bridge link flow', () => {
    beforeEach(() => {
        (window as any).electronAPI = { ...(window as any).electronAPI };
    });

    // Fix round 1, item 3: linking a channel stored it but never activated
    // it — `applyDiscordDestination()` re-derives against whatever was
    // already selected, so a fresh user's first link silently did nothing.
    it('selects the newly linked entry in the same save that stores it', async () => {
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true,
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports',
            relayUrl: 'https://bot.example.com'
        });
        const onSave = vi.fn();

        render(<WebhookModal isOpen webhooks={[]} onClose={() => {}} onSave={onSave} />);

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.secretsecretsecretsecretsecretsecret' } });
        fireEvent.click(screen.getByText('Link Channel'));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

        const [savedWebhooks, selectedId] = onSave.mock.calls[0];
        expect(savedWebhooks).toHaveLength(1);
        expect(savedWebhooks[0].kind).toBe('bridge');
        // The activation contract: the id passed as the selection argument
        // must be the id of the entry that was actually just saved, not the
        // previously-selected (or no) id.
        expect(selectedId).toBe(savedWebhooks[0].id);
    });

    // Fix round 1, item 10: `handleLinkSubmit` had a `finally` with no
    // `catch` — a rejected `bridge:link` invoke was an unhandled rejection
    // and the error surface stayed empty, a swallowed failure in the one
    // task about not swallowing failures.
    it('renders an inline error and does not save when linkBridgeChannel rejects', async () => {
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const onSave = vi.fn();

        render(<WebhookModal isOpen webhooks={[]} onClose={() => {}} onSave={onSave} />);

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.secretsecretsecretsecretsecretsecret' } });
        fireEvent.click(screen.getByText('Link Channel'));

        await waitFor(() => expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument());
        expect(onSave).not.toHaveBeenCalled();
    });

    // Fix round 1, item 8: Unlink only mutated local state, so closing the
    // modal with the X (or navigating away) after clicking Unlink left the
    // bridge entry stored and still sending — asymmetric with Link, which
    // commits instantly.
    it('commits an Unlink immediately, the same way Link does', () => {
        const onSave = vi.fn();
        render(<WebhookModal isOpen webhooks={[bridgeWebhook]} onClose={() => {}} onSave={onSave} />);

        fireEvent.click(screen.getByTitle('Unlink'));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0][0]).toEqual([]);
    });

    // Fix round 1, items 6/7: the "posted by the Axi bot" note lived only
    // inside the isLinking form, so it vanished once linking succeeded — a
    // linked user never saw it again.
    it('keeps the "posted by the Axi bot" note visible on an already-linked bridge row', () => {
        render(<WebhookModal isOpen webhooks={[bridgeWebhook]} onClose={() => {}} onSave={() => {}} />);
        expect(screen.getByText(/posted by the Axi bot/)).toBeInTheDocument();
    });

    // I5: a revoked bridge row clears `token` but is otherwise left in place
    // (`handleDiscordSendResult` in discordDestinationResolver.ts). This must
    // be visible on the Manage Webhooks row from persisted state alone — no
    // in-memory `discordDestinationStatus` is passed to this component at
    // all in this test, so a render that shows "Re-link required" proves the
    // state is derived purely from the stored entry.
    it('renders a bridge row with no token as "Re-link required", derived purely from persisted state', () => {
        const revokedWebhook: Webhook = { ...bridgeWebhook, token: undefined };
        render(<WebhookModal isOpen webhooks={[revokedWebhook]} onClose={() => {}} onSave={() => {}} />);

        expect(screen.getByText('Re-link required')).toBeInTheDocument();
        expect(screen.queryByText('Bridge')).not.toBeInTheDocument();
    });

    // I5, second half: re-linking the same guild+channel (the expected
    // recovery path after a revoke) must replace the token on the existing
    // row rather than append a second entry for the same destination.
    it('replaces the token on an existing row when guild+channel match, instead of adding a second entry', async () => {
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true,
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports',
            relayUrl: 'https://bot.example.com'
        });
        const revokedWebhook: Webhook = { ...bridgeWebhook, token: undefined };
        const onSave = vi.fn();

        render(<WebhookModal isOpen webhooks={[revokedWebhook]} onClose={() => {}} onSave={onSave} />);

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.newsecretnewsecretnewsecretnewsecret' } });
        fireEvent.click(screen.getByText('Link Channel'));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

        const [savedWebhooks, selectedId] = onSave.mock.calls[0];
        expect(savedWebhooks).toHaveLength(1);
        expect(savedWebhooks[0].id).toBe(revokedWebhook.id);
        expect(savedWebhooks[0].token).toBe('axb1.aGVsbG8.newsecretnewsecretnewsecretnewsecret');
        expect(selectedId).toBe(revokedWebhook.id);
    });
});
