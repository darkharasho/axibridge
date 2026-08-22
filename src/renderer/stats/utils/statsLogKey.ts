/**
 * The identity of a log for stats purposes.
 *
 * This exact expression is what the stats worker keys its `payloadStore` on, and
 * what `useLogsForStats` builds its snapshot key from. The fight slicer keys its
 * exclusion set on it too, so all three must agree — a divergence here excludes
 * the wrong fight silently.
 */
export const statsLogKey = (log: any, index = 0): string =>
    String(log?.filePath || log?.id || `idx-${index}`);
