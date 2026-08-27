import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

type ElectronApiMock = {
    getSettings: ReturnType<typeof vi.fn>;
    getWhatsNew: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
    setLastSeenVersion: ReturnType<typeof vi.fn>;
};

const makeElectronApiMock = (overrides?: {
    settings?: Record<string, unknown>;
    whatsNew?: { version: string; lastSeenVersion: string | null; releaseNotes: string | null };
}): ElectronApiMock & Record<string, any> => {
    const settings = overrides?.settings ?? {};
    const whatsNew = overrides?.whatsNew ?? {
        version: '1.20.2',
        lastSeenVersion: '1.20.2',
        releaseNotes: 'Release notes'
    };

    return {
        getSettings: vi.fn().mockResolvedValue(settings),
        getWhatsNew: vi.fn().mockResolvedValue(whatsNew),
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

describe('App first-time walkthrough', () => {
    it('marks walkthrough as seen immediately when first-time modal is shown', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ walkthroughSeen: true });
        });
    });

    it('shows walkthrough for first-time users and marks it as seen on close', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Get Started' }));

        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ walkthroughSeen: true });
        });
        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });
    });

    it('does not show walkthrough for returning users and still shows what\'s new', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: true },
            whatsNew: {
                version: '1.20.2',
                lastSeenVersion: '1.20.1',
                releaseNotes: '## Changes\n- Item'
            }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });
        expect(await screen.findByText('What’s New')).toBeInTheDocument();
    });

    it('how-to guide routes to Settings and opens the How To modal', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'How-To Guide' }));

        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });
        // Should navigate to Settings and open the How To modal
        expect(await screen.findByText('Feature and workflow reference')).toBeInTheDocument();
        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ walkthroughSeen: true });
        });
    });

    it('walkthrough step 4 pitches local parsing with nothing to install', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        expect(screen.getByText('Maximize accuracy')).toBeInTheDocument();
        expect(screen.getByText(/parsed locally on your own machine/)).toBeInTheDocument();
        // There is one engine now, and it ships with the app — so the step can
        // finally say "nothing to install" instead of hedging across two.
        expect(screen.getByText(/nothing to install/)).toBeInTheDocument();
        expect(screen.getByText(/The Axilog parser ships with the app/)).toBeInTheDocument();
        // Must not push a new user at a manual install step either way.
        expect(screen.queryByText(/Install Elite Insights locally/)).not.toBeInTheDocument();
        expect(screen.getByText('Step 4')).toBeInTheDocument();
    });

    it('does not re-open How To modal after leaving and returning to Settings', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'How-To Guide' }));
        expect(await screen.findByText('Feature and workflow reference')).toBeInTheDocument();

        await user.click(screen.getByTitle('Dashboard'));
        // Wait for Dashboard to mount after AnimatePresence exit/enter transition
        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'Parser Settings' })).not.toBeInTheDocument();
        });
        await user.click(screen.getByTitle('Settings'));
        expect(await screen.findByRole('heading', { name: 'Parser Settings' })).toBeInTheDocument();
        // How To modal should not reappear on returning to Settings
        expect(screen.queryByText('Feature and workflow reference')).not.toBeInTheDocument();
    });
});
