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
    channelName: 'wvw-reports',
    guildId: 'guild-111',
    channelId: 'chan-222'
};

const renderModal = (overrides: Partial<React.ComponentProps<typeof WebhookModal>> = {}) => {
    const props = {
        isOpen: true,
        onClose: () => {},
        webhooks: [] as Webhook[],
        enabledWebhookIds: [] as string[],
        onSave: vi.fn(),
        onSetEnabled: vi.fn(),
        ...overrides
    };
    render(<WebhookModal {...props} />);
    return props;
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

        renderModal({ webhooks: [], onSave });

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.secretsecretsecretsecretsecretsecret' } });
        fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

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

        renderModal({ webhooks: [], onSave });

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.secretsecretsecretsecretsecretsecret' } });
        fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

        await waitFor(() => expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument());
        expect(onSave).not.toHaveBeenCalled();
    });

    // Fix round 1, item 8: Unlink only mutated local state, so closing the
    // modal with the X (or navigating away) after clicking Unlink left the
    // bridge entry stored and still sending — asymmetric with Link, which
    // commits instantly.
    it('commits an Unlink immediately, the same way Link does', () => {
        const onSave = vi.fn();
        renderModal({ webhooks: [bridgeWebhook], onSave });

        fireEvent.click(screen.getByTitle('Unlink'));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0][0]).toEqual([]);
    });

    // Fix round 1, items 6/7: the "posted by the Axi bot" note lived only
    // inside the isLinking form, so it vanished once linking succeeded — a
    // linked user never saw it again.
    it('keeps the "posted by the Axi bot" note visible on an already-linked bridge row', () => {
        renderModal({ webhooks: [bridgeWebhook] });
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
        renderModal({ webhooks: [revokedWebhook] });

        expect(screen.getByText('Re-link required')).toBeInTheDocument();
        expect(screen.queryByText('Bridge')).not.toBeInTheDocument();
    });

    // I5, second half: re-linking the same guild+channel (the expected
    // recovery path after a revoke) must replace the token on the existing
    // row rather than append a second entry for the same destination.
    //
    // N3: the match must survive a rename between link attempts, which a
    // name-based comparison cannot -- so this now asserts the match happens
    // via `guildId`/`channelId` even though the display names returned by
    // this link attempt differ from what's stored on the row.
    it('replaces the token on an existing row when the channel was renamed since the original link (IDs still match)', async () => {
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true,
            guildName: 'Vigil Keep Renamed',
            channelName: 'wvw-reports-v2',
            relayUrl: 'https://bot.example.com',
            guildId: 'guild-111',
            channelId: 'chan-222'
        });
        const revokedWebhook: Webhook = { ...bridgeWebhook, token: undefined };
        const onSave = vi.fn();

        renderModal({ webhooks: [revokedWebhook], onSave });

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.newsecretnewsecretnewsecretnewsecret' } });
        fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

        const [savedWebhooks, selectedId] = onSave.mock.calls[0];
        expect(savedWebhooks).toHaveLength(1);
        expect(savedWebhooks[0].id).toBe(revokedWebhook.id);
        expect(savedWebhooks[0].token).toBe('axb1.aGVsbG8.newsecretnewsecretnewsecretnewsecret');
        expect(selectedId).toBe(revokedWebhook.id);
    });

    // N3: two guilds can share a display name (Discord allows duplicates).
    // A name-based match would target the wrong guild's row and overwrite a
    // working pairing's token with another guild's. Matching on `guildId`/
    // `channelId` must keep the two rows independent even when their names
    // (guild AND channel) are identical.
    it('does not touch a different guild\'s row when two guilds share a display name', async () => {
        const rowA: Webhook = { ...bridgeWebhook, id: 'row-a', guildId: 'guild-A', channelId: 'chan-A', token: 'axb1.rowA-secret' };
        const rowB: Webhook = { ...bridgeWebhook, id: 'row-b', guildId: 'guild-B', channelId: 'chan-B', token: undefined };
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true,
            guildName: 'Vigil Keep', // same display name as rowA
            channelName: 'wvw-reports', // same display name as rowA
            relayUrl: 'https://bot.example.com',
            guildId: 'guild-B',
            channelId: 'chan-B'
        });
        const onSave = vi.fn();

        renderModal({ webhooks: [rowA, rowB], onSave });

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.newsecretnewsecretnewsecretnewsecret' } });
        fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

        const [savedWebhooks] = onSave.mock.calls[0];
        expect(savedWebhooks).toHaveLength(2);
        const savedA = savedWebhooks.find((w: Webhook) => w.id === 'row-a');
        const savedB = savedWebhooks.find((w: Webhook) => w.id === 'row-b');
        // rowA's working token must survive untouched.
        expect(savedA.token).toBe('axb1.rowA-secret');
        // rowB is the one that got re-linked.
        expect(savedB.token).toBe('axb1.aGVsbG8.newsecretnewsecretnewsecretnewsecret');
    });

    // N3 backward compatibility: entries persisted before this round have no
    // stored `guildId`/`channelId` at all -- a user upgrading mid-feature has
    // exactly this shape. The match must fall back to names for those (and
    // only those) rows, without throwing, and the freshly-returned IDs get
    // adopted so subsequent re-links use the stronger key.
    it('still matches a legacy entry with no stored IDs by name, without throwing', async () => {
        const legacyWebhook: Webhook = {
            id: 'legacy-1',
            name: 'Vigil Keep › #wvw-reports',
            kind: 'bridge',
            relayUrl: 'https://bot.example.com',
            token: undefined,
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports'
            // no guildId / channelId -- pre-N3 persisted shape
        };
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true,
            guildName: 'Vigil Keep',
            channelName: 'wvw-reports',
            relayUrl: 'https://bot.example.com',
            guildId: 'guild-999',
            channelId: 'chan-999'
        });
        const onSave = vi.fn();

        expect(() => {
            renderModal({ webhooks: [legacyWebhook], onSave });
        }).not.toThrow();

        fireEvent.click(screen.getByText('Link AxiTools channel'));
        fireEvent.change(screen.getByPlaceholderText('axb1.…'), { target: { value: 'axb1.aGVsbG8.legacysecretlegacysecretlegacysecret' } });
        fireEvent.click(screen.getByRole('button', { name: /^link$/i }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

        const [savedWebhooks, selectedId] = onSave.mock.calls[0];
        expect(savedWebhooks).toHaveLength(1);
        expect(savedWebhooks[0].id).toBe('legacy-1');
        expect(savedWebhooks[0].token).toBe('axb1.aGVsbG8.legacysecretlegacysecretlegacysecret');
        expect(savedWebhooks[0].guildId).toBe('guild-999');
        expect(savedWebhooks[0].channelId).toBe('chan-999');
        expect(selectedId).toBe('legacy-1');
    });
});
