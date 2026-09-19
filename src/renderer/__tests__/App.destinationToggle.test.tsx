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

// -------------------------------------------------------------------------
// Fix pass item 2: the re-link warning used to be derived from
// `selectedWebhook`, i.e. from `enabledWebhookIds[0]`. With 2+ destinations
// enabled that made it ORDER-DEPENDENT and wrong in both directions. Both
// tests below fail on the pre-fix code, for opposite reasons:
//   healthy-first → no icon at all (the `length === 1` gate suppressed it)
//                   and no banner, while the revoked bridge dropped reports;
//   revoked-first → the banner claimed "Reports are not being sent", which is
//                   false while the healthy sibling is still receiving them.
// -------------------------------------------------------------------------
const HEALTHY_WEBHOOK = {
    id: 'w1',
    name: 'Raid Channel',
    kind: 'webhook',
    url: 'https://discord.com/api/webhooks/1/x'
};
// A revoked bridge: the entry survives, only `token` is cleared.
const REVOKED_BRIDGE = { id: 'b2', name: 'Old Keep', kind: 'bridge', relayUrl: 'https://bot.example.com' };

const renderWithDestinations = async (webhooks: unknown[], enabledWebhookIds: string[]) => {
    window.electronAPI = makeElectronApiMock({
        settings: {
            walkthroughSeen: true,
            webhooks,
            enabledWebhookIds,
            // App mirrors the selection to the FIRST enabled id.
            selectedWebhookId: enabledWebhookIds[0] ?? null
        }
    }) as any;
    const { container } = render(<App />);
    await waitFor(() => {
        expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('2 destinations')).toBeInTheDocument();
    return container;
};

describe('App header — re-link warning across multiple destinations', () => {
    it('warns about a revoked bridge enabled SECOND, without claiming reports are stopped', async () => {
        const container = await renderWithDestinations([HEALTHY_WEBHOOK, REVOKED_BRIDGE], ['w1', 'b2']);

        expect(container.querySelector('svg.text-amber-400')).not.toBeNull();
        expect(await screen.findByText(/Re-link required/i)).toHaveTextContent(
            'Re-link required — Old Keep was revoked and is not receiving reports.'
        );
        expect(screen.queryByText(/Reports are not being sent/i)).toBeNull();
    });

    it('warns about a revoked bridge enabled FIRST, still without claiming reports are stopped', async () => {
        const container = await renderWithDestinations([REVOKED_BRIDGE, HEALTHY_WEBHOOK], ['b2', 'w1']);

        expect(container.querySelector('svg.text-amber-400')).not.toBeNull();
        expect(await screen.findByText(/Re-link required/i)).toHaveTextContent(
            'Re-link required — Old Keep was revoked and is not receiving reports.'
        );
        expect(screen.queryByText(/Reports are not being sent/i)).toBeNull();
    });
});
