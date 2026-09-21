import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

// Adding a folder's worth of logs used to mount a card per file: the log list
// only virtualizes once its height has been measured, and the measurement runs
// in an effect - which is to say after the render that needed it. On the first
// add after launch the height was still 0, virtualization bailed, and every
// row rendered. That pass is what made Add Logs freeze the app.
const N = 400;

const files = Array.from({ length: N }, (_, i) => ({
    path: `/logs/2026${String(i).padStart(5, '0')}.zevtc`,
    name: `2026${String(i).padStart(5, '0')}.zevtc`,
    relativePath: `2026${String(i).padStart(5, '0')}.zevtc`,
    mtimeMs: Date.now() - i * 1000,
    size: 100000
}));

const makeApi = () => ({
    getSettings: vi.fn().mockResolvedValue({ walkthroughSeen: true, logDirectory: '/logs' }),
    getWhatsNew: vi.fn().mockResolvedValue({ version: '1', lastSeenVersion: '1', releaseNotes: null }),
    saveSettings: vi.fn(),
    setLastSeenVersion: vi.fn().mockResolvedValue(undefined),
    startWatching: vi.fn(),
    listLogFiles: vi.fn().mockResolvedValue({ success: true, files }),
    manualUploadBatch: vi.fn(),
    getLogs: vi.fn().mockResolvedValue([]),
    saveLogs: vi.fn(),
    uploadWebReport: vi.fn().mockResolvedValue({ success: false }),
    openExternal: vi.fn().mockResolvedValue({ success: true }),
    getEiStatus: vi.fn().mockResolvedValue({ installed: false, version: null, updateAvailable: null, installing: false, error: null }),
    getEiAutoManage: vi.fn().mockResolvedValue(false),
    windowControl: vi.fn(),
    checkForUpdates: vi.fn(),
    restartApp: vi.fn(),
    ...Object.fromEntries(['onUploadStatus', 'onUploadComplete', 'onUploadPermalink', 'onWebUploadStatus',
        'onUpdateMessage', 'onUpdateAvailable', 'onUpdateNotAvailable', 'onUpdateError', 'onDownloadProgress',
        'onUpdateDownloaded', 'onConsoleLog', 'onEiStatusChanged', 'onEiDownloadProgress', 'onLogDetected']
        .map((k) => [k, vi.fn(() => () => {})]))
});

const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('Add Logs', () => {
    it(`mounts a bounded number of cards when ${N} files are added to an unmeasured list`, async () => {
        const api = makeApi();
        window.electronAPI = api as any;
        render(<App />);

        fireEvent.click(await screen.findByText('Add Logs'));
        await settle(300);
        fireEvent.click(screen.getByText('Today'));
        await settle(100);

        const confirm = screen.getByText(/Add to Recent Activity/).closest('button') as HTMLButtonElement;
        expect(confirm.textContent).toContain(String(N));
        fireEvent.click(confirm);

        // The press only goes busy; the insert follows on the next painted frame.
        expect(api.manualUploadBatch).not.toHaveBeenCalled();
        await settle(200);
        expect(api.manualUploadBatch).toHaveBeenCalledTimes(1);
        expect(api.manualUploadBatch.mock.calls[0][0]).toHaveLength(N);

        // jsdom reports every clientHeight as 0, which is exactly the state the
        // real list is in before its first measurement.
        const cards = document.querySelectorAll('.matte-log-card');
        expect(cards.length).toBeGreaterThan(0);
        expect(cards.length).toBeLessThan(40);
    }, 30000);
});
