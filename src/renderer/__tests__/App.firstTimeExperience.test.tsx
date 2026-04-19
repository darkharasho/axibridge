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
        onEiDownloadProgress: vi.fn(() => () => {}),
        getOllamaSettings: vi.fn().mockResolvedValue({ enabled: false, activeModel: '' })
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
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ walkthroughSeen: true, eiAnnouncementDismissed: true });
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

    it('learn more routes to Settings and scrolls to Parser Settings', async () => {
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

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Learn More' }));

        await waitFor(() => {
            expect(screen.queryByText('Welcome to AxiBridge')).not.toBeInTheDocument();
        });
        // Should navigate to Settings and scroll to Parser Settings section
        expect(await screen.findByRole('heading', { name: 'Parser Settings' })).toBeInTheDocument();
        expect(scrollToSpy).toHaveBeenCalledTimes(1);
        // Should also dismiss the EI announcement
        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ walkthroughSeen: true, eiAnnouncementDismissed: true });
        });
    });

    it('walkthrough includes step 4 for Elite Insights', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        expect(screen.getByText('Maximize accuracy')).toBeInTheDocument();
        expect(screen.getByText(/Install Elite Insights locally/)).toBeInTheDocument();
        expect(screen.getByText('Step 4')).toBeInTheDocument();
    });

    it('does not re-scroll to Parser Settings after leaving and returning to Settings', async () => {
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

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Learn More' }));
        expect(await screen.findByRole('heading', { name: 'Parser Settings' })).toBeInTheDocument();
        expect(scrollToSpy).toHaveBeenCalledTimes(1);

        await user.click(screen.getByTitle('Dashboard'));
        // Wait for Dashboard to mount after AnimatePresence exit/enter transition
        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'Parser Settings' })).not.toBeInTheDocument();
        });
        await user.click(screen.getByTitle('Settings'));
        expect(await screen.findByRole('heading', { name: 'Parser Settings' })).toBeInTheDocument();
        expect(scrollToSpy).toHaveBeenCalledTimes(1);
    });
});

describe('EI announcement banner', () => {
    it('shows banner for existing users who have not dismissed it', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: true }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText(/Local Elite Insights parsing/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Set up' })).toBeInTheDocument();
    });

    it('does not show banner when eiAnnouncementDismissed is true', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: true, eiAnnouncementDismissed: true }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        // Wait for settings to load
        await waitFor(() => {
            expect(electronApi.getSettings).toHaveBeenCalled();
        });
        expect(screen.queryByText(/Local Elite Insights parsing/)).not.toBeInTheDocument();
    });

    it('does not show banner for first-time users (they get the walkthrough instead)', async () => {
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: false }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText('Welcome to AxiBridge')).toBeInTheDocument();
        expect(screen.queryByText(/Local Elite Insights parsing/)).not.toBeInTheDocument();
    });

    it('dismiss button hides banner and persists eiAnnouncementDismissed', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: true }
        });
        window.electronAPI = electronApi as any;

        render(<App />);

        expect(await screen.findByText(/Local Elite Insights parsing/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '✕' }));

        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ eiAnnouncementDismissed: true });
        });
    });

    it('Set up button navigates to Settings and scrolls to Parser Settings', async () => {
        const user = userEvent.setup();
        const electronApi = makeElectronApiMock({
            settings: { walkthroughSeen: true }
        });
        window.electronAPI = electronApi as any;

        const scrollToSpy = vi.fn();
        Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
            configurable: true,
            writable: true,
            value: scrollToSpy
        });

        render(<App />);

        expect(await screen.findByText(/Local Elite Insights parsing/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Set up' }));

        // Should navigate to Settings with Parser Settings visible
        expect(await screen.findByRole('heading', { name: 'Parser Settings' })).toBeInTheDocument();
        expect(scrollToSpy).toHaveBeenCalledTimes(1);
        // Should persist dismissal
        await waitFor(() => {
            expect(electronApi.saveSettings).toHaveBeenCalledWith({ eiAnnouncementDismissed: true });
        });
    });
});
