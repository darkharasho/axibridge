import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

// Task 11 / Ruling U: `handleSetDestinationEnabled` (App.tsx) is a
// `useCallback` that used to read `enabledWebhookIds` from its own closure.
// The header dropdown's "Disabled" row calls it once per currently-enabled
// id, synchronously, in a single onClick — `for (const id of
// enabledWebhookIds) handleSetDestinationEnabled(id, false)`. Every one of
// those synchronous calls captured the SAME stale `enabledWebhookIds` array
// (React doesn't re-render between them), so each call recomputed
// `toggleEnabledWebhookId` from the original list and overwrote the previous
// call's result — only the LAST id was ever actually removed. With
// `['w1', 'w2']` enabled, the persisted list ended at `['w1']`: the trigger
// label reads "Disabled" while a destination silently keeps receiving
// reports. This test drives the real dropdown (not a mocked handler) so it
// only passes once `handleSetDestinationEnabled` reads/writes a ref that
// composes across synchronous calls in the same tick.
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

describe('App header dropdown — Disabled clears every destination', () => {
    it('removes every enabled id, not just the last one, in a single click', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: {
                walkthroughSeen: true,
                webhooks: [
                    { id: 'w1', name: 'Raid Channel', kind: 'webhook', url: 'https://discord.com/api/webhooks/1/x' },
                    { id: 'w2', name: 'Guild Channel', kind: 'webhook', url: 'https://discord.com/api/webhooks/2/y' }
                ],
                enabledWebhookIds: ['w1', 'w2'],
                selectedWebhookId: 'w1'
            }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });

        expect(await screen.findByText('2 destinations')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /2 destinations/i }));
        await user.click(await screen.findByRole('option', { name: /^Disabled$/ }));

        const lastCall = electronApi.saveSettings.mock.calls.at(-1)?.[0];
        expect(lastCall).toMatchObject({ enabledWebhookIds: [] });
        expect(await screen.findByText('Disabled')).toBeInTheDocument();
    });
});
