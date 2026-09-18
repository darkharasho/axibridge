import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '../useSettings';

// Fix round 1, item 5: main clears a revoked bridge token in the store but
// the `discord-destination-status` event carries no webhook list, so the
// renderer's in-memory `webhooks` copy kept the live token — reopening
// Manage Webhooks and clicking "Save Changes" would write the dead token
// straight back (re-arming it, and re-logging the secret per item 4).
describe('useSettings onDiscordDestinationStatus', () => {
    let statusCallback: ((payload: { webhookId: string | null; reason: string; message: string }) => void) | null = null;

    beforeEach(() => {
        statusCallback = null;
        (window as any).electronAPI = {
            ...(window as any).electronAPI,
            getSettings: vi.fn().mockResolvedValue({
                webhooks: [
                    {
                        id: 'bridge-1',
                        name: 'Vigil Keep › #wvw-reports',
                        kind: 'bridge',
                        relayUrl: 'https://bot.example.com',
                        token: 'axb1.secret'
                    }
                ],
                selectedWebhookId: 'bridge-1'
            }),
            getWhatsNew: vi.fn().mockResolvedValue({ version: '1.0.0', lastSeenVersion: '1.0.0', releaseNotes: null }),
            saveSettings: vi.fn(),
            selectDirectory: vi.fn(),
            startWatching: vi.fn(),
            onDiscordDestinationStatus: vi.fn((cb: (payload: any) => void) => {
                statusCallback = cb;
                return () => { statusCallback = null; };
            })
        };
    });

    it('nulls the token for the affected webhook when a revoked status arrives', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => expect(result.current.webhooks).toHaveLength(1));
        expect(result.current.webhooks[0].token).toBe('axb1.secret');
        expect(statusCallback).not.toBeNull();

        act(() => {
            statusCallback?.({ webhookId: 'bridge-1', reason: 'revoked', message: 'This link was revoked — pair again.' });
        });

        expect(result.current.webhooks[0].token).toBeUndefined();
        expect(result.current.discordDestinationStatus).toEqual({
            webhookId: 'bridge-1',
            reason: 'revoked',
            message: 'This link was revoked — pair again.'
        });
    });

    it('leaves other webhooks and non-revoked statuses untouched', async () => {
        const { result } = renderHook(() => useSettings());
        await waitFor(() => expect(result.current.webhooks).toHaveLength(1));

        act(() => {
            statusCallback?.({ webhookId: 'bridge-1', reason: 'forbidden', message: 'Axi cannot post in that channel.' });
        });

        expect(result.current.webhooks[0].token).toBe('axb1.secret');
    });
});
