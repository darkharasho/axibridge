import log from 'electron-log';
import { postReportToWebhooks } from './reportWebhooks';
import type { IReportWebhook } from '../shared/reportWebhooks';
import { buildReportCardModel } from '../shared/reportCardModel';
import { planReportCardVariants } from './reportCardRenderPlan';
import { renderReportCard } from './reportCardRenderer';
import type { ReportCardVariant } from './reportCardTemplate';

export interface StartReportPostOptions {
    webhooks: IReportWebhook[];
    meta: any;
    stats: any;
    url: string;
    /** Same channel the upload itself reports on, so the post shows as a trailing step. */
    onStatus: (stage: string, message: string, progress: number) => void;
    persistForumFlag: (id: string, isForum: boolean) => void;
}

/**
 * Renders the report card(s) and posts the report link to Discord.
 *
 * This is deliberately NOT awaited by the upload handler. The report is already
 * live on Pages by the time we get here, and the renderer's upload modal resolves
 * on the handler's return value — so awaiting a card render (up to 15s per
 * variant) plus rate-limited webhook posts used to pin the modal at "100%
 * Complete" for the whole duration. Progress is reported over `onStatus` instead.
 *
 * Never rejects: every failure is reported as a warning and the post settles.
 */
export function startReportPost(opts: StartReportPostOptions): Promise<void> {
    const { webhooks, meta, stats, url, onStatus, persistForumFlag } = opts;
    if (webhooks.length === 0) {
        onStatus('Complete', 'Web report uploaded.', 100);
        return Promise.resolve();
    }
    // Emitted synchronously so the renderer sees the trailing step open before
    // the upload handler's promise resolves.
    onStatus('Posting', `Posting report link to ${webhooks.length} Discord webhook${webhooks.length === 1 ? '' : 's'}...`, 100);

    return (async () => {
        // A failure rendering the card must not deny the hooks their post —
        // postReportToWebhooks falls back to text when an image is missing.
        const images: Partial<Record<ReportCardVariant, Buffer | null>> = {};
        const variants = planReportCardVariants(webhooks);
        if (variants.length > 0) {
            onStatus('Posting', 'Rendering report card...', 100);
        }
        for (const variant of variants) {
            // Per variant, not per loop: a throw while rendering one style must
            // not deny the other style's hooks their card.
            try {
                images[variant] = await renderReportCard(buildReportCardModel(meta, stats), variant);
            } catch (err) {
                log.warn(`[Main] Failed to render report card (${variant}) (non-blocking):`, err);
            }
            if (!images[variant]) {
                onStatus('Warning', `Report card (${variant}) could not be rendered — posting text instead.`, 100);
            }
        }
        await postReportToWebhooks({
            webhooks,
            meta,
            stats,
            url,
            onStatus: (line: string, isWarn?: boolean) => onStatus(isWarn ? 'Warning' : 'Posting', line, 100),
            persistForumFlag,
            images,
        });
    })()
        .then(() => {
            onStatus('Complete', 'Report posted to Discord.', 100);
        })
        .catch((err) => {
            log.warn('[Main] Failed to post report to webhooks (non-blocking):', err);
            onStatus('Warning', 'Could not post the report link to Discord.', 100);
            onStatus('Complete', 'Web report uploaded.', 100);
        });
}
