import { TIMESTAMP_MS_THRESHOLD } from './constants';

/**
 * Converts any timestamp-like value to a millisecond epoch number.
 * Returns 0 for unresolvable inputs.
 */
export const parseTimestamp = (value: any): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return 0;
        return value > TIMESTAMP_MS_THRESHOLD ? value : value * 1000;
    }
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
    }
    const str = String(value).trim();
    if (!str) return 0;
    const numeric = Number(str);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > TIMESTAMP_MS_THRESHOLD ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(str);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    // Handles timezone format like "-05" by normalizing to "-05:00".
    const normalized = str.replace(/([+-]\d{2})$/, '$1:00');
    const reparsed = Date.parse(normalized);
    return Number.isFinite(reparsed) && reparsed > 0 ? reparsed : 0;
};

/**
 * Resolves a fight's start timestamp (ms epoch) from the EI details object,
 * falling back through several fields and then to the log's uploadTime.
 */
export const resolveFightTimestamp = (details: any, log: any): number => {
    return parseTimestamp(
        details?.timeStartStd
        ?? details?.timeStart
        ?? details?.timeEndStd
        ?? details?.timeEnd
        ?? details?.timeStartText
        ?? details?.timeEndText
        ?? details?.uploadTime
        ?? log?.uploadTime
    );
};
