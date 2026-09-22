import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests pin the *window lifecycle and configuration*, not the pixels —
 * the capture itself needs a real Chromium and belongs in the e2e suite.
 *
 * Why it is worth a test at all: both bugs this file guards were invisible from
 * the outside, because a failed render degrades to a text embed with nothing but
 * a log line to show for it.
 *   1. The card used to render into a hidden platform window (`show: false`,
 *      `offscreen: false`). That produces no surface under Wayland, so
 *      `capturePage()` never resolved and every card died on the 15s timeout.
 *   2. The window was then `destroy()`ed per render, which on Electron 44
 *      poisons the process: every later `loadFile` fails with `ERR_FAILED (-2)`,
 *      so the second card style never rendered.
 */

const capturePage = vi.fn();
const executeJavaScript = vi.fn();
const loadFile = vi.fn();
const loadURL = vi.fn();
const setContentSize = vi.fn();
const destroy = vi.fn();
const BrowserWindow = vi.fn();

vi.mock('electron', () => ({
    BrowserWindow: class {
        webContents = { capturePage, executeJavaScript, loadFile, isDestroyed: () => false };
        setContentSize = setContentSize;
        destroy = destroy;
        loadFile = loadFile;
        loadURL = loadURL;
        isDestroyed = () => false;
        constructor(opts: unknown) {
            BrowserWindow(opts);
        }
    },
}));
vi.mock('fs', () => ({
    default: { writeFileSync: vi.fn(), unlinkSync: vi.fn() },
}));
vi.mock('../reportCardAssets', () => ({
    resolveReportCardAssets: vi.fn(() => ({ fontDataUri: null, glyphDataUri: null, iconDataUris: {} })),
}));
vi.mock('../reportCardTemplate', () => ({
    REPORT_CARD_SIZES: { graphic: { width: 1200, height: 900 }, hybrid: { width: 1200, height: 500 } },
    collectCardProfessions: vi.fn(() => []),
    renderReportCardHtml: vi.fn(() => '<html></html>'),
}));

const model = {} as never;

/** The renderer keeps its window in module state, so each test needs its own
 *  copy of the module or the reuse assertions would see the previous test's. */
async function freshRenderer() {
    vi.resetModules();
    return (await import('../reportCardRenderer')).renderReportCard;
}

describe('renderReportCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.VITE_PUBLIC = '/tmp/public';
        loadFile.mockResolvedValue(undefined);
        loadURL.mockResolvedValue(undefined);
        executeJavaScript.mockResolvedValue(894);
        capturePage.mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(8192) });
    });

    it('renders offscreen rather than into an unmapped platform window', async () => {
        const renderReportCard = await freshRenderer();
        await renderReportCard(model, 'graphic');

        expect(BrowserWindow).toHaveBeenCalledTimes(1);
        const opts = BrowserWindow.mock.calls[0]![0] as {
            show: boolean;
            paintWhenInitiallyHidden?: boolean;
            webPreferences: { offscreen: boolean };
        };
        expect(opts.webPreferences.offscreen).toBe(true);
        // The two halves of the old bug. `offscreen: true` is what makes the
        // capture work; leaving `paintWhenInitiallyHidden` behind would suggest
        // the hidden-window approach is still load-bearing, and it is not.
        expect(opts.show).toBe(false);
        expect(opts.paintWhenInitiallyHidden).toBeUndefined();
    });

    it('reuses one window across renders instead of destroying it', async () => {
        const renderReportCard = await freshRenderer();
        await renderReportCard(model, 'graphic');
        await renderReportCard(model, 'hybrid');

        // Destroying between renders is what made the second card fail with
        // ERR_FAILED (-2), so both halves of this matter.
        expect(BrowserWindow).toHaveBeenCalledTimes(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(loadURL).toHaveBeenCalledWith('about:blank');
    });

    it('renders the second card too', async () => {
        const renderReportCard = await freshRenderer();
        await expect(renderReportCard(model, 'graphic')).resolves.toEqual(Buffer.alloc(8192));
        await expect(renderReportCard(model, 'hybrid')).resolves.toEqual(Buffer.alloc(8192));
    });

    it('resets the window to the variant size before loading', async () => {
        const renderReportCard = await freshRenderer();
        await renderReportCard(model, 'graphic');
        setContentSize.mockClear();
        await renderReportCard(model, 'hybrid');

        // The shared window still carries the previous card's measured height.
        expect(setContentSize).toHaveBeenNthCalledWith(1, 1200, 500);
    });

    it('returns the captured png once it clears the minimum size', async () => {
        const renderReportCard = await freshRenderer();
        await expect(renderReportCard(model, 'graphic')).resolves.toEqual(Buffer.alloc(8192));
    });

    it('rejects a half-painted frame instead of posting a grey rectangle', async () => {
        const renderReportCard = await freshRenderer();
        capturePage.mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(128) });
        await expect(renderReportCard(model, 'graphic')).resolves.toBeNull();
    });

    it('returns null rather than throwing when the capture never resolves', async () => {
        const renderReportCard = await freshRenderer();
        vi.useFakeTimers();
        capturePage.mockReturnValue(new Promise(() => {}));
        const pending = renderReportCard(model, 'graphic');
        await vi.advanceTimersByTimeAsync(20_000);
        await expect(pending).resolves.toBeNull();
        vi.useRealTimers();
    });

    it('does not let a timed-out render stall the next card', async () => {
        const renderReportCard = await freshRenderer();
        vi.useFakeTimers();
        capturePage.mockReturnValue(new Promise(() => {}));
        const stalled = renderReportCard(model, 'graphic');
        const queued = renderReportCard(model, 'hybrid');
        // Let the stalled render reach its capture before the mock is swapped,
        // or it would pick up the resolving one and never stall at all.
        await vi.advanceTimersByTimeAsync(0);
        capturePage.mockResolvedValue({ isEmpty: () => false, toPNG: () => Buffer.alloc(8192) });
        await vi.advanceTimersByTimeAsync(20_000);
        await expect(stalled).resolves.toBeNull();
        await expect(queued).resolves.toEqual(Buffer.alloc(8192));
        vi.useRealTimers();
    });
});
