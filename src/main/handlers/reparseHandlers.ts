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
    getPruneOptions: () => { keepReplayPositions: boolean };
    /** Writes the healed details back into the store `get-log-details` reads. */
    setBulkLogDetails: (filePath: string, details: any) => void;
    /**
     * Writes the healed details back to the ON-DISK cache as well.
     *
     * Without this the heal only reaches the memory LRU, which is budgeted and
     * evicts under exactly the bulk-ingest pressure that produced the gap in
     * the first place — so a user who clicks Re-parse gets the banner back a
     * few logs later and has no way to make it stick. Optional so existing
     * callers and tests that do not care about persistence stay valid.
     */
    persistLogDetails?: (filePath: string, details: any) => Promise<void>;
}

/**
 * Re-parse `filePath` and return pruned, enriched details, or a typed failure.
 *
 * Shared by the `log:reparse-axilog` IPC handler and by `get-log-details`'
 * last-resort heal, so the two cannot drift: a log healed by the button and a
 * log healed automatically have to be byte-identical, or the coverage banner
 * would clear for one and not the other.
 */
export async function reparseLogDetails(
    opts: ReparseHandlerOptions,
    filePath: string
): Promise<ReparseResult> {
    const { getAxilogManager, getPruneOptions, setBulkLogDetails, persistLogDetails } = opts;
    if (!filePath) {
        return { success: false, reason: 'source-missing', error: 'Missing filePath.' };
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
        if (persistLogDetails) {
            // Best-effort: a heal that cannot be written to disk is still a
            // heal for this session, and failing it would be strictly worse.
            try {
                await persistLogDetails(filePath, pruned);
            } catch (err: any) {
                console.warn('[Main] Could not persist re-parsed details:', err?.message || err);
            }
        }
        return { success: true, details: pruned };
    } catch (err: any) {
        console.warn('[Main] log:reparse-axilog failed:', err?.message || err);
        return { success: false, reason: 'parse-failed', error: err?.message || 'Re-parse failed.' };
    }
}

export function registerReparseHandlers(opts: ReparseHandlerOptions) {
    ipcMain.handle('log:reparse-axilog', async (_event, payload: { filePath?: string }): Promise<ReparseResult> =>
        reparseLogDetails(opts, typeof payload?.filePath === 'string' ? payload.filePath.trim() : ''));
}
