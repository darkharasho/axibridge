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
        onRequestScreenshot: vi.fn(() => () => {}),
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
        openExternal: vi.fn().mockResolvedValue({ success: true })
    };
};

describe('App first-time walkthrough', () => {
    it('marks walkthrough as seen immediately when first-time modal is shown', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to ArcBridge')).toBeInTheDocument();
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

        expect(await screen.findByText('Welcome to ArcBridge')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Get Started' }));

        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ walkthroughSeen: true });
        });
        await waitFor(() => {
            expect(screen.queryByText('Welcome to ArcBridge')).not.toBeInTheDocument();
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
            expect(screen.queryByText('Welcome to ArcBridge')).not.toBeInTheDocument();
        });
        expect(await screen.findByText('What’s New')).toBeInTheDocument();
    });

    it('learn more routes to Help & Updates and can open the How To guide', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to ArcBridge')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Learn More' }));

        await waitFor(() => {
            expect(screen.queryByText('Welcome to ArcBridge')).not.toBeInTheDocument();
        });
        expect(await screen.findByRole('heading', { name: 'Help & Updates' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'How To' }));
        expect(await screen.findByText('Feature and workflow reference')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'ArcBridge How-To' }).length).toBeGreaterThan(0);
    });

    it('does not re-scroll to Help & Updates after leaving and returning to Settings', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        const scrollToSpy = vi.fn();
        Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
            configurable: true,
            writable: true,
            value: scrollToSpy
        });

        render(<App />);

        expect(await screen.findByText('Welcome to ArcBridge')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Learn More' }));
        expect(await screen.findByRole('heading', { name: 'Help & Updates' })).toBeInTheDocument();
        expect(scrollToSpy).toHaveBeenCalledTimes(1);

        await user.click(screen.getByTitle('Dashboard'));
        await user.click(screen.getByTitle('Settings'));
        expect(await screen.findByRole('heading', { name: 'Help & Updates' })).toBeInTheDocument();
        expect(scrollToSpy).toHaveBeenCalledTimes(1);
    });
});
