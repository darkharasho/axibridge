import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DestinationsCard, type DestinationsCardProps } from '../DestinationsCard';
import type { Webhook } from '../../WebhookModal';

const webhookEntry: Webhook = { id: 'w1', name: 'Raid Channel', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' };
const bridgeEntry: Webhook = {
    id: 'b1', name: 'Axi › #reports', kind: 'bridge',
    relayUrl: 'https://bot.example.com', token: 'axb1.secret',
    guildName: 'Axi', channelName: 'reports', guildId: 'g1', channelId: 'c1'
};

type RenderCardOverrides = Partial<Omit<DestinationsCardProps, 'onSave' | 'onSetEnabled'>> & {
    onSave?: DestinationsCardProps['onSave'] & { mock: any };
    onSetEnabled?: DestinationsCardProps['onSetEnabled'] & { mock: any };
};

const renderCard = (overrides: RenderCardOverrides = {}) => {
    const props = {
        webhooks: [webhookEntry, bridgeEntry],
        enabledWebhookIds: ['w1'],
        onSave: vi.fn() as DestinationsCardProps['onSave'] & { mock: any },
        onSetEnabled: vi.fn() as DestinationsCardProps['onSetEnabled'] & { mock: any },
        ...overrides
    };
    render(<DestinationsCard {...props} />);
    return props;
};

beforeEach(() => {
    (window as any).electronAPI = { linkBridgeChannel: vi.fn() };
});

describe('DestinationsCard', () => {
    it('lists every destination with its kind', () => {
        renderCard();
        expect(screen.getByText('Raid Channel')).toBeInTheDocument();
        const bridgeName = screen.getByText('Axi › #reports');
        expect(bridgeName).toBeInTheDocument();
        // Scoped to the bridge entry's own row rather than a document-wide
        // getByText(/bridge/i): the row also carries a "run /bridge revoke"
        // instruction and a "Bridged reports are posted by..." disclaimer,
        // each of which independently contains the substring "bridge" and
        // would make an unscoped query ambiguous. Walking up to the row
        // container (".group", the row's own class) and asserting the kind
        // badge specifically -- rather than widening to getAllByText -- keeps
        // this proving what it's meant to: that badge sits on THIS row.
        const bridgeRow = bridgeName.closest('.group') as HTMLElement;
        expect(bridgeRow).not.toBeNull();
        expect(within(bridgeRow).getByText('Bridge')).toBeInTheDocument();
    });

    it('reflects the enabled state per row', () => {
        renderCard();
        expect(screen.getByRole('switch', { name: /Raid Channel/i })).toBeChecked();
        expect(screen.getByRole('switch', { name: /Axi › #reports/i })).not.toBeChecked();
    });

    it('enabling a second destination does not disable the first', async () => {
        const user = userEvent.setup();
        const props = renderCard();
        await user.click(screen.getByRole('switch', { name: /Axi › #reports/i }));
        expect(props.onSetEnabled).toHaveBeenCalledTimes(1);
        expect(props.onSetEnabled).toHaveBeenCalledWith('b1', true);
    });

    it('disabling a destination reports enabled: false', async () => {
        const user = userEvent.setup();
        const props = renderCard();
        await user.click(screen.getByRole('switch', { name: /Raid Channel/i }));
        expect(props.onSetEnabled).toHaveBeenCalledWith('w1', false);
    });

    it('commits a delete immediately rather than staging it', async () => {
        const user = userEvent.setup();
        const props = renderCard();
        await user.click(screen.getByRole('button', { name: /delete Raid Channel/i }));
        expect(props.onSave).toHaveBeenCalledWith([bridgeEntry]);
    });

    it('commits an added webhook immediately', async () => {
        const user = userEvent.setup();
        const props = renderCard({ webhooks: [] });
        await user.click(screen.getByRole('button', { name: /add webhook/i }));
        await user.type(screen.getByPlaceholderText(/name/i), 'New Channel');
        await user.type(screen.getByPlaceholderText(/https/i), 'https://discord.com/api/webhooks/9/z');
        await user.click(screen.getByRole('button', { name: /^add$/i }));
        expect(props.onSave).toHaveBeenCalledWith([
            expect.objectContaining({ name: 'New Channel', kind: 'webhook', url: 'https://discord.com/api/webhooks/9/z' })
        ]);
    });

    it('warns that a revoked bridge needs re-linking', () => {
        renderCard({ webhooks: [{ ...bridgeEntry, token: undefined }], enabledWebhookIds: [] });
        expect(screen.getByText(/re-link/i)).toBeInTheDocument();
    });

    it('replaces the token on the existing row when the same channel is re-linked', async () => {
        const user = userEvent.setup();
        (window as any).electronAPI.linkBridgeChannel = vi.fn().mockResolvedValue({
            ok: true, relayUrl: 'https://bot.example.com', guildName: 'Axi', channelName: 'reports', guildId: 'g1', channelId: 'c1'
        });
        const props = renderCard({ webhooks: [{ ...bridgeEntry, token: undefined }], enabledWebhookIds: [] });
        await user.click(screen.getByRole('button', { name: /link axitools channel/i }));
        await user.type(screen.getByPlaceholderText(/axb1/i), 'axb1.fresh');
        await user.click(screen.getByRole('button', { name: /^link$/i }));
        await vi.waitFor(() => expect(props.onSave).toHaveBeenCalled());
        const [nextWebhooks, selectId] = props.onSave.mock.calls[0];
        expect(nextWebhooks).toHaveLength(1);
        expect(nextWebhooks[0].token).toBe('axb1.fresh');
        expect(selectId).toBe('b1');
    });

    it('notes that bridged reports post as Axi', () => {
        renderCard();
        expect(screen.getByText(/posted by the Axi bot/i)).toBeInTheDocument();
    });
});
