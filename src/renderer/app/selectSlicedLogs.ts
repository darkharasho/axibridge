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
