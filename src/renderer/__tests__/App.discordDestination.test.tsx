import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

// I5: a revoked bridge token is cleared in the store (`token: undefined`) but
// the entry and its selection are left in place. `discordDestinationStatus`
// (the one-shot failure banner) is renderer-only state, so after a restart it
// is gone while the Discord Webhook card must still surface the dead
// destination -- derived purely from the persisted `webhooks[]` +
// `selectedWebhookId` the mocked `getSettings()` below returns, with no
// runtime send-status ever set.
const makeElectronApiMock = (overrides?: { settings?: Record<string, unknown> }) => {
    const settings = overrides?.settings ?? {};
    return {
        getSettings: vi.fn().mockResolvedValue(settings),
        getWhatsNew: vi.fn().mockResolvedValue({ version: '1.20.2', lastSeenVersion: '1.20.2', releaseNotes: null }),
        saveSettings: vi.fn(),
        setLastSeenVersion: vi.fn().mockResolvedValue(undefined),
        startWatching: vi.fn(),
        onUploadStatus: vi.fn(() => () => {}),
        onUploadComplete: vi.fn(() => () => {}),
        onUploadPermalink: vi.fn(() => () => {}),
        onWebUploadStatus: vi.fn(() => () => {}),
        onUpdateMessage: vi.fn(() => () => {}),
        onUpdateAvailable: vi.fn(() => () => {}),
        onUpdateNotAvailable: vi.fn(() => () => {}),
        onUpdateError: vi.fn(() => () => {}),
        onDownloadProgress: vi.fn(() => () => {}),
        onUpdateDownloaded: vi.fn(() => () => {}),
        onConsoleLog: vi.fn(() => () => {}),
        onDiscordDestinationStatus: vi.fn(() => () => {}),
        windowControl: vi.fn(),
        checkForUpdates: vi.fn(),
        restartApp: vi.fn(),
        manualUploadBatch: vi.fn(),
        uploadWebReport: vi.fn().mockResolvedValue({ success: false }),
        openExternal: vi.fn().mockResolvedValue({ success: true }),
        getEiStatus: vi.fn().mockResolvedValue({ installed: false, version: null, updateAvailable: null, installing: false, error: null }),
        getEiAutoManage: vi.fn().mockResolvedValue(false),
        onEiStatusChanged: vi.fn(() => () => {}),
        onEiDownloadProgress: vi.fn(() => () => {})
    };
};

describe('App Discord destination card — revoked bridge visibility', () => {
    it('shows "Re-link required" on the destination card for a persisted, tokenless bridge selection, with no in-memory status', async () => {
        const electronApi = makeElectronApiMock({
            settings: {
                walkthroughSeen: true,
                webhooks: [
                    {
                        id: 'bridge-1',
                        name: 'Vigil Keep › #wvw-reports',
                        kind: 'bridge',
                        relayUrl: 'https://bot.example.com',
                        token: undefined,
                        guildName: 'Vigil Keep',
                        channelName: 'wvw-reports'
                    }
                ],
                selectedWebhookId: 'bridge-1',
                // Fix pass item 2: the re-link warning now derives from EVERY
                // enabled destination rather than from `selectedWebhookId`, so
                // the fixture must carry the enabled list. That is not a
                // loosening: `getSettings` backfills `enabledWebhookIds` from a
                // legacy `selectedWebhookId` when the key is absent
                // (`readEnabledWebhookIds`, discordDestinationResolver.ts), so a
                // real store never returns the selection without it. See the
                // same note on the sibling test below.
                enabledWebhookIds: ['bridge-1']
            }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });

        expect(await screen.findByText(/Re-link required/)).toBeInTheDocument();
        // Note: `onDiscordDestinationStatus` is never invoked in this test --
        // the callback registered above is never called -- proving the
        // banner is derived purely from persisted state, not from a live
        // send-failure event.
        expect(electronApi.onDiscordDestinationStatus).toHaveBeenCalled();
    });

    it('does not show "Re-link required" for a healthy bridge selection', async () => {
        const electronApi = makeElectronApiMock({
            settings: {
                walkthroughSeen: true,
                webhooks: [
                    {
                        id: 'bridge-1',
                        name: 'Vigil Keep › #wvw-reports',
                        kind: 'bridge',
                        relayUrl: 'https://bot.example.com',
                        token: 'axb1.x.y',
                        guildName: 'Vigil Keep',
                        channelName: 'wvw-reports'
                    }
                ],
                selectedWebhookId: 'bridge-1',
                // Task 9's store migration always backfills `enabledWebhookIds`
                // alongside a persisted `selectedWebhookId`; the header
                // trigger's label (Task 11) reads the enabled list, not the
                // legacy single selection, so this fixture must include it.
                enabledWebhookIds: ['bridge-1']
            }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });
        await screen.findByText('Vigil Keep › #wvw-reports');
        expect(screen.queryByText(/Re-link required/)).not.toBeInTheDocument();
    });
});
