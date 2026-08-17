/**
 * Re-parse a log so its details regain Axilog data.
 *
 * `buildNativeCarrySet` runs in exactly one place — {@link AxilogManager.parseLog} —
 * so a log whose details came from dps.report, from an Elite Insights parse or
 * from a build that predates the cutover has no `.native`, and every migrated
 * reader renders it empty. The only thing that can fix that is parsing the
 * original `.zevtc` again with axilog; no refresh of the cached or remote copy
 * can, because neither source carries native data at all.
 *
 * That is why this is a separate handler rather than an extension of
 * `get-log-details`' existing staleness check (`uploadHandlers.ts`): that check
 * heals by re-fetching from the permalink, which for this particular gap would
 * loop forever against a source that can never satisfy it.
 */

import { ipcMain } from 'electron';
import * as fs from 'fs';
import type { AxilogManager } from '../axilogParser';
import { pruneDetailsForStats, hasUsableFightDetails, attachConditionMetrics } from '../detailsProcessing';

export type ReparseFailure =
    /** The user is on the Elite Insights engine; re-parsing would switch engines behind their back. */
    | 'wrong-backend'
    /** No axilog binding on this platform. */
    | 'axilog-unavailable'
    /** The original `.zevtc` is gone, so there is nothing left to parse. */
    | 'source-missing'
    /** axilog parsed it, but the result has no usable fight in it. */
    | 'unusable-details'
    | 'parse-failed';

export interface ReparseResult {
    success: boolean;
    details?: any;
    reason?: ReparseFailure;
    error?: string;
}

export interface ReparseHandlerOptions {
    getAxilogManager: () => AxilogManager | null;
    /** The selected parser backend, read fresh on every call. */
    getBackend: () => string;
    getPruneOptions: () => { keepReplayPositions: boolean };
    /** Writes the healed details back into the store `get-log-details` reads. */
    setBulkLogDetails: (filePath: string, details: any) => void;
}

export function registerReparseHandlers(opts: ReparseHandlerOptions) {
    const { getAxilogManager, getBackend, getPruneOptions, setBulkLogDetails } = opts;

    ipcMain.handle('log:reparse-axilog', async (_event, payload: { filePath?: string }): Promise<ReparseResult> => {
        const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
        if (!filePath) {
            return { success: false, reason: 'source-missing', error: 'Missing filePath.' };
        }

        // Deliberately refuses rather than silently switching engines. A user on
        // Elite Insights picked it; healing their logs with axilog would change
        // the numbers under them. The renderer tells them to switch instead.
        if (getBackend() !== 'axilog') {
            return {
                success: false,
                reason: 'wrong-backend',
                error: 'Re-parsing requires the axilog parse engine.',
            };
        }

        const manager = getAxilogManager();
        if (!manager?.isInstalled()) {
            return {
                success: false,
                reason: 'axilog-unavailable',
                error: 'The axilog parser is not available on this platform.',
            };
        }

        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                reason: 'source-missing',
                error: 'The original log file is no longer on disk.',
            };
        }

        try {
            let details: any = await manager.parseLog(filePath, filePath);
            if (!details || details.error) {
                return { success: false, reason: 'parse-failed', error: String(details?.error || 'Parse returned nothing.') };
            }
            // Same enrichment and pruning the ingestion paths apply, so the
            // healed details are indistinguishable from a fresh parse.
            details = attachConditionMetrics(details);
            if (!hasUsableFightDetails(details)) {
                return { success: false, reason: 'unusable-details', error: 'The re-parsed log has no usable fight data.' };
            }
            const pruned = pruneDetailsForStats(details, getPruneOptions());
            details = null;
            setBulkLogDetails(filePath, pruned);
            return { success: true, details: pruned };
        } catch (err: any) {
            console.warn('[Main] log:reparse-axilog failed:', err?.message || err);
            return { success: false, reason: 'parse-failed', error: err?.message || 'Re-parse failed.' };
        }
    });
}
