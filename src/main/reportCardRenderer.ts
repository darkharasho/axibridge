import { BrowserWindow } from 'electron';
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
 *  frame, which some platform/compositor combinations return for hidden
 *  windows — we would rather post text than a grey rectangle. */
const MIN_CARD_BYTES = 4096;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Card render timed out')), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });

/** Renders the session card offscreen. Never throws: a null result means the
 *  caller posts the text embed instead, so a broken card cannot cost someone
 *  their report link. */
export async function renderReportCard(
    model: ReportCardModel,
    variant: ReportCardVariant
): Promise<Buffer | null> {
    const size = REPORT_CARD_SIZES[variant];
    let win: BrowserWindow | null = null;
    try {
        const publicDir = process.env.VITE_PUBLIC || '';
        if (!publicDir) return null;
        // Assets are inlined as `data:` URIs: this document is loaded from a
        // `data:` URL, whose opaque origin makes Chromium refuse every
        // `file://` subresource.
        const assets = resolveReportCardAssets(publicDir, collectCardProfessions(model, variant));
        const html = renderReportCardHtml(model, variant, assets);

        win = new BrowserWindow({
            width: size.width,
            height: size.height,
            useContentSize: true,
            show: false,
            paintWhenInitiallyHidden: true,
            frame: false,
            backgroundColor: '#1a1b1e',
            webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: false },
        });

        const buffer = await withTimeout(
            (async (): Promise<Buffer | null> => {
                const target = win!;
                await target.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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
        // destroy(), not close(): a headless window has no reliable close path.
        try { win?.destroy(); } catch { /* already gone */ }
    }
}
