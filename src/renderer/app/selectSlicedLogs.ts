import { statsLogKey } from '../stats/utils/statsLogKey';

/**
 * Apply the ephemeral fight slice to the aggregation input.
 *
 * Returns the input array unchanged (same identity) when the slice removes
 * nothing. That matters: `logsForStats` identity is what restarts the stats
 * worker, so a no-op slice must not churn it.
 */
export const selectSlicedLogs = (logsForStats: any[], excluded: Set<string>): any[] => {
    if (excluded.size === 0) return logsForStats;
    const next = logsForStats.filter((log, index) => !excluded.has(statsLogKey(log, index)));
    return next.length === logsForStats.length ? logsForStats : next;
};

/**
 * The set of log identifiers the worker has ingested so far, given the array
 * it was actually handed (the *sliced* aggregation input) and its own
 * `streamed` ingest counter.
 *
 * This must walk the same array the worker consumes. `streamed` is an index
 * into whatever array the worker was given — indexing an unsliced array here
 * would promote logs the worker never saw and strand genuinely ingested ones
 * in `calculating` forever.
 */
export const computeIngestedIds = (slicedLogs: any[], streamed: number): Set<string> => {
    const ingestedIds = new Set<string>();
    for (let i = 0; i < Math.min(streamed, slicedLogs.length); i++) {
        const log = slicedLogs[i];
        const id = String(log?.filePath || log?.id || '');
        if (id) ingestedIds.add(id);
    }
    return ingestedIds;
};

/**
 * Has the worker ingested the entire aggregation input it was given?
 *
 * `lastComputedLogCount` is what the worker ingested. Comparing it against
 * the unsliced `logsForStats.length` instead of the sliced length wedges this
 * gate permanently true whenever a slice removes any fights, so `calculating`
 * logs never promote to `success`.
 */
export const hasIngestedAllSlicedLogs = (lastComputedLogCount: number, slicedLength: number): boolean =>
    lastComputedLogCount >= slicedLength;
