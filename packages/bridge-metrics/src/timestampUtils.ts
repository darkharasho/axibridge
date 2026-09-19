import { TIMESTAMP_MS_THRESHOLD } from './constants';
import { getEncounterDurationMs, getEncounterStartMs } from './nativeEncounter';

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
 * Milliseconds from a duration string.
 *
 * Accepts both spellings this codebase produces: the EI one
 * `axilogParser.formatEncounterDuration` writes into `ILogData.encounterDuration`
 * ("1h 2m 3s 456ms", "0m 22s 205ms"), and the clock form `formatDurationMs`
 * renders ("0:43", "1:02:03"). Returns 0 for anything else.
 */
export const parseEncounterDurationMs = (value: any): number => {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
    if (typeof value !== 'string') return 0;
    const str = value.trim();
    if (!str) return 0;

    // Clock form: mm:ss or hh:mm:ss.
    const clock = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(str);
    if (clock) {
        const a = Number(clock[1]);
        const b = Number(clock[2]);
        const c = clock[3] === undefined ? null : Number(clock[3]);
        return c === null ? (a * 60 + b) * 1000 : (a * 3600 + b * 60 + c) * 1000;
    }

    // Unit form. `ms` is listed before `m` so "205ms" is not read as 205 minutes.
    const unit = /(\d+)\s*(ms|h|m|s)(?![a-z])/gi;
    let total = 0;
    let matched = false;
    let match: RegExpExecArray | null;
    while ((match = unit.exec(str)) !== null) {
        const amount = Number(match[1]);
        if (!Number.isFinite(amount)) continue;
        matched = true;
        switch (match[2].toLowerCase()) {
            case 'h': total += amount * 3_600_000; break;
            case 'm': total += amount * 60_000; break;
            case 's': total += amount * 1000; break;
            default: total += amount; break;
        }
    }
    return matched ? total : 0;
};

/**
 * Epoch ms encoded in an arcdps log filename — `20260917-214012.zevtc`.
 *
 * arcdps stamps the name at the moment the fight ENDS, in the recording
 * machine's local time, so this is an END time and the caller must subtract the
 * encounter duration to get a start. Verified across a full 45-fight session:
 * `filename time − fight start` tracked the encounter duration to within one
 * second on every log.
 *
 * The filename, unlike the file's mtime, survives copying, syncing and restore
 * — which is why this is safe where the mtime inference is not.
 *
 * Returns 0 when the name is not in arcdps's format.
 */
export const parseArcdpsFilenameMs = (value: any): number => {
    if (typeof value !== 'string') return 0;
    const base = value.trim().split(/[/\\]/).pop() || '';
    const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?!\d)/.exec(base);
    if (!match) return 0;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return 0;
    if (hour > 23 || minute > 59 || second > 59) return 0;
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    // Rejects names that parse but are not real dates (`20260231-...`), which
    // JS would otherwise roll forward into March.
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 0;
    const ms = date.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
};

/**
 * Resolves a fight's start timestamp (ms epoch) from the EI details object,
 * falling back through several fields, then to the arcdps filename, then to the
 * log's uploadTime.
 */
export const resolveFightTimestamp = (details: any, log: any): number => {
    // Native reports the real fight start. Everything below it reaches this
    // number only through the `.zevtc` mtime inference, which is unbounded-wrong
    // for any log that has been copied, restored or synced — see the unit 2
    // oracle, where it is off by ~204 days.
    const nativeStart = getEncounterStartMs(details);
    if (nativeStart !== null) return nativeStart;
    const fromDetails = parseTimestamp(
        details?.timeStartStd
        ?? details?.timeStart
        ?? details?.timeEndStd
        ?? details?.timeEnd
        ?? details?.timeStartText
        ?? details?.timeEndText
        ?? details?.uploadTime
    );
    if (fromDetails > 0) return fromDetails;

    // A log whose details never made it into the cache reaches aggregation with
    // nothing above this line set, and used to resolve to 0 — rendering as
    // "--", sorting to the end of the fight breakdown and taking a fight number
    // that belongs to a later fight. The filename still knows when the fight
    // ended, and `encounterDuration` is persisted on the log itself, so the two
    // together reconstruct the start to within a second.
    const endMs = parseArcdpsFilenameMs(log?.filePath) || parseArcdpsFilenameMs(log?.id);
    if (endMs > 0) {
        const durationMs = getEncounterDurationMs(details)
            ?? parseEncounterDurationMs(details?.durationMS ?? details?.encounterDuration ?? log?.encounterDuration);
        const startMs = endMs - Math.max(0, durationMs);
        if (startMs > 0) return startMs;
    }

    return parseTimestamp(log?.uploadTime);
};
