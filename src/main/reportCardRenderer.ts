import { BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    REPORT_CARD_SIZES,
    collectCardProfessions,
    renderReportCardHtml,
    type ReportCardVariant,
} from './reportCardTemplate';
import { resolveReportCardAssets } from './reportCardAssets';
import type { ReportCardModel } from '../shared/reportCardModel';

const RENDER_TIMEOUT_MS = 15_000;
/** A valid card is tens of KB. Anything smaller is a blank or half-painted
 *  frame, which a capture that lands before the first full paint can still
 *  return — we would rather post text than a grey rectangle. */
const MIN_CARD_BYTES = 4096;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Card render timed out')), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });

/**
 * One offscreen window, reused for every card, never destroyed.
 *
 * This used to be a window per render with `win.destroy()` in a `finally`. On
 * Electron 44 that first destroy poisons the process: every subsequent
 * `loadFile` fails with `ERR_FAILED (-2)`, and destroying then waiting could
 * wedge the main loop outright. So a session with both card styles enabled
 * rendered the first variant and silently fell back to text for the second.
 *
 * Reuse sidesteps it and is much faster besides — a warm render is tens of ms
 * against ~500ms cold. The cost is one idle offscreen renderer process for the
 * rest of the session; `about:blank` after each capture gives the card's
 * bitmap back without touching the destroy path.
 */
let sharedWindow: BrowserWindow | null = null;
/** Renders share one window, so they must not interleave. */
let renderChain: Promise<unknown> = Promise.resolve();

function acquireWindow(width: number, height: number): BrowserWindow {
    if (sharedWindow && !sharedWindow.isDestroyed() && !sharedWindow.webContents.isDestroyed()) {
        return sharedWindow;
    }
    // Offscreen rendering, NOT a hidden platform window. `show: false` with
    // `paintWhenInitiallyHidden` asks the compositor to paint a window it
    // never mapped: under Wayland an unmapped window has no surface, so no
    // frame is ever produced and `capturePage()` never resolves — every card
    // died on the 15s timeout and silently degraded to text. OSR draws into a
    // bitmap with no surface at all, which is what this code always wanted,
    // and it takes the host GPU stack out of the loop.
    sharedWindow = new BrowserWindow({
        width,
        height,
        useContentSize: true,
        show: false,
        frame: false,
        backgroundColor: '#1a1b1e',
        webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: true },
    });
    return sharedWindow;
}

/** Drop the card we just captured. Best effort: a window we cannot blank is
 *  still reusable, and if it is truly wedged the next render times out and
 *  degrades to text exactly as a failed render always has. */
function releaseWindow(win: BrowserWindow): void {
    try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            void win.loadURL('about:blank').catch(() => { /* best effort */ });
        }
    } catch { /* best effort */ }
}

/** Renders the session card offscreen. Never throws: a null result means the
 *  caller posts the text embed instead, so a broken card cannot cost someone
 *  their report link. */
export async function renderReportCard(
    model: ReportCardModel,
    variant: ReportCardVariant
): Promise<Buffer | null> {
    const run = renderChain.then(() => renderCardOnSharedWindow(model, variant));
    // The chain must survive a rejection, but renderCardOnSharedWindow never
    // rejects — this only keeps a future throw from stalling every later card.
    renderChain = run.catch(() => null);
    return run;
}

async function renderCardOnSharedWindow(
    model: ReportCardModel,
    variant: ReportCardVariant
): Promise<Buffer | null> {
    const size = REPORT_CARD_SIZES[variant];
    let win: BrowserWindow | null = null;
    let htmlFile: string | null = null;
    try {
        const publicDir = process.env.VITE_PUBLIC || '';
        if (!publicDir) return null;
        // Assets stay inlined as `data:` URIs. The document now loads from a
        // temp file, but a relative or absolute `file://` subresource would
        // still break the moment the card is rendered from a packaged app,
        // where the asset layout differs.
        const assets = resolveReportCardAssets(publicDir, collectCardProfessions(model, variant));
        const html = renderReportCardHtml(model, variant, assets);

        // Written to a temp file rather than navigated to as a `data:` URL:
        // the graphic card inlines the font, the glyph and up to six class
        // icons, which measured 1.65 MiB against Chromium's 2 MiB URL cap.
        // A heavy roster would cross it and the card would simply not render.
        htmlFile = path.join(
            os.tmpdir(),
            `axibridge-card-${variant}-${process.pid}-${Date.now()}.html`
        );
        fs.writeFileSync(htmlFile, html, 'utf8');

        win = acquireWindow(size.width, size.height);

        const buffer = await withTimeout(
            (async (): Promise<Buffer | null> => {
                const target = win!;
                // The window is shared, so the previous card's height is still
                // set on it — put it back before loading.
                target.setContentSize(size.width, size.height);
                await target.loadFile(htmlFile!);
                // One round-trip that waits for fonts and a painted frame, then
                // reports the real content height. Capturing before this
                // resolves yields unstyled or half-laid-out pixels.
                const height = await target.webContents.executeJavaScript(`
                    (async () => {
                        await document.fonts.ready;
                        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                        return Math.ceil(document.getElementById('card').getBoundingClientRect().height);
                    })()
                `);
                const contentHeight = Number(height);
                if (Number.isFinite(contentHeight) && contentHeight > 0) {
                    target.setContentSize(size.width, contentHeight);
                    await target.webContents.executeJavaScript(
                        'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'
                    );
                }
                const image = await target.webContents.capturePage();
                if (image.isEmpty()) return null;
                const png = image.toPNG();
                return png.byteLength >= MIN_CARD_BYTES ? png : null;
            })(),
            RENDER_TIMEOUT_MS
        );

        return buffer;
    } catch (err) {
        console.error('[Main] Report card render failed:', err);
        return null;
    } finally {
        if (win) releaseWindow(win);
        if (htmlFile) {
            try { fs.unlinkSync(htmlFile); } catch { /* best effort */ }
        }
    }
}
