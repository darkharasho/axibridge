import { buildReportMeta } from '../../renderer/stats/utils/buildReportMeta';
import { computeStatsSync } from '../../renderer/stats/incrementalAggregation';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../../renderer/global.d';
import type { ReportPayload, ReportMeta } from '../../shared/reportTypes';

/**
 * Thrown when the bytes at a share pointer's `loc` cannot be turned into a
 * `ReportPayload` — either the JSON is not report-shaped at all, or it looked
 * like a single log's native `details` but the aggregator choked on it.
 */
export class ShareReportShapeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ShareReportShapeError';
    }
}

const NOT_A_REPORT_MESSAGE = 'This share link points at data that is not an AxiBridge report.';

const isNonNullObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Tier 1 uploads the raw native `details` block for a single log (see
 * `shareService.ts`), not a pre-built `report.json` `ReportPayload`. The
 * viewer has to adapt: build the payload here, client-side, so a later
 * axilog/stats improvement re-renders old share links better instead of
 * freezing them at share time.
 *
 * Also passes through an already-built `{ meta, stats }` payload unchanged —
 * this keeps a `loc` that points at a full published `report.json` working.
 */
export const buildShareReport = (raw: unknown): ReportPayload => {
    if (!isNonNullObject(raw)) {
        throw new ShareReportShapeError(NOT_A_REPORT_MESSAGE);
    }

    if (isNonNullObject(raw.meta) && isNonNullObject(raw.stats)) {
        return raw as unknown as ReportPayload;
    }

    const details = raw as any;
    if (!Array.isArray(details.players)) {
        throw new ShareReportShapeError(NOT_A_REPORT_MESSAGE);
    }

    try {
        const meta = buildReportMeta([details]);
        const computed = computeStatsSync({
            logs: [{ id: meta.id, filePath: meta.id, details }],
            statsViewSettings: DEFAULT_STATS_VIEW_SETTINGS,
        });
        const stats: any = {
            ...computed.stats,
            skillUsageData: computed.skillUsageData,
            statsViewSettings: DEFAULT_STATS_VIEW_SETTINGS,
        };
        delete stats.replayFightsElided;
        return { meta: meta as unknown as ReportMeta, stats };
    } catch (err) {
        throw new ShareReportShapeError(
            `Could not compute stats for this report: ${err instanceof Error ? err.message : String(err)}`
        );
    }
};
