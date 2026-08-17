/**
 * Which logs in the current selection carry axilog's native container, and why
 * the ones that don't are missing it.
 *
 * The native migration moved ~20 `compute*` readers onto `details.native`.
 * Those readers return empty rather than throwing when it is absent, which is
 * correct — but it means a log parsed without native renders zeroed damage,
 * positioning, boons and replay with nothing on screen to say so. This module
 * is the single place that answers "is this log's native data here?", so the
 * banner, the per-log badge and the heal action all agree.
 *
 * Absence has four causes, and they need different remedies, so the cause
 * travels with the log as `parseSource` rather than being guessed from the
 * shape of what arrived.
 */

import { getNativeReport } from '@axiapps/bridge-metrics';

/** Where a log's details came from. Set at ingestion; persisted with the log. */
export type ParseSource =
    /** In-process axilog parse — the only source that produces native data. */
    | 'axilog'
    /** The Elite Insights .NET CLI, still selectable at Settings → Parse Engine. */
    | 'elite-insights'
    /** dps.report's `getJson`. Also the fallback when a local parse throws. */
    | 'dps.report'
    /** A hand-imported EI JSON file. */
    | 'json-import';

export interface NativeCoverageLog {
    id: string;
    filePath: string;
    label: string;
    parseSource: ParseSource | null;
}

export interface NativeCoverage {
    /** Logs whose details were resolved this pass. Unresolved logs are not counted. */
    resolved: number;
    withNative: number;
    missingLogs: NativeCoverageLog[];
}

export const EMPTY_NATIVE_COVERAGE: NativeCoverage = { resolved: 0, withNative: 0, missingLogs: [] };

/**
 * True when `details` carries a real native carry-set.
 *
 * `axilog` is the load-bearing key, not `native` itself: `buildNativeCarrySet`
 * refuses to build a carry-set from a report without it, so its presence is
 * what distinguishes a real container from an empty object some other code
 * path parked there.
 */
export const detailsHaveNativeReport = (details: unknown): boolean => {
    const native = getNativeReport(details) as { axilog?: unknown } | null;
    return Boolean(native && native.axilog && typeof native.axilog === 'object');
};

const readParseSource = (log: any): ParseSource | null => {
    const raw = log?.parseSource;
    return raw === 'axilog' || raw === 'elite-insights' || raw === 'dps.report' || raw === 'json-import'
        ? raw
        : null;
};

/** The log's own words for itself, falling back through the ids it does have. */
export const nativeCoverageLabel = (log: any): string =>
    String(log?.fightLabel || log?.fightName || log?.filePath || log?.id || 'Unknown log');

export const toCoverageLog = (log: any): NativeCoverageLog => ({
    id: String(log?.id || log?.filePath || ''),
    filePath: String(log?.filePath || ''),
    label: nativeCoverageLabel(log),
    parseSource: readParseSource(log),
});

/**
 * Fold per-log observations into a coverage summary.
 *
 * Callers pass only logs whose details they actually resolved — a log still
 * hydrating is not missing native data, it is merely not here yet, and
 * counting it would flash a warning that retracts itself a second later.
 */
export const summarizeNativeCoverage = (
    entries: Array<{ log: any; hasNative: boolean }>,
): NativeCoverage => {
    const missingLogs: NativeCoverageLog[] = [];
    let withNative = 0;
    for (const { log, hasNative } of entries) {
        if (hasNative) withNative += 1;
        else missingLogs.push(toCoverageLog(log));
    }
    return { resolved: entries.length, withNative, missingLogs };
};

/**
 * A log can be healed by re-parsing only if the `.zevtc` it came from is still
 * where we found it. Everything else — cache, permalink, persisted details —
 * either cannot produce native data or has already failed to.
 */
export const isHealable = (log: Pick<NativeCoverageLog, 'filePath'>): boolean =>
    log.filePath.length > 0;

/**
 * The one-line explanation the banner leads with.
 *
 * Named causes only. When the selection mixes causes, the count is the honest
 * headline and the per-log list carries the detail.
 */
export const describeNativeGap = (coverage: NativeCoverage): string => {
    const n = coverage.missingLogs.length;
    if (n === 0) return '';
    const sources = new Set(coverage.missingLogs.map((log) => log.parseSource));
    const noun = n === 1 ? 'log was' : `${n} logs were`;
    if (sources.size === 1) {
        const [only] = Array.from(sources);
        if (only === 'elite-insights') {
            return `${n === 1 ? 'This' : 'These'} ${noun} parsed by the Elite Insights engine, which does not emit native data.`;
        }
        if (only === 'dps.report') {
            return `${n === 1 ? 'This' : 'These'} ${noun} loaded from dps.report, which does not carry native data.`;
        }
        if (only === 'json-import') {
            return `${n === 1 ? 'This' : 'These'} ${noun} imported from an Elite Insights JSON file, which carries no native data.`;
        }
    }
    return `${n === 1 ? 'One log was' : `${n} logs were`} parsed before the native cutover, or by an engine that does not emit native data.`;
};
