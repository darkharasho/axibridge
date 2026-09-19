import { describe, expect, it } from 'vitest';
import { parseArcdpsFilenameMs, parseEncounterDurationMs, resolveFightTimestamp } from '../timestampUtils';

const nativeDetails = (encounter: any, rest: any = {}) => ({
    ...rest,
    native: { axilog: { schema: '1.0' }, encounter },
});

describe('resolveFightTimestamp', () => {
    it('prefers the native encounter start over the shimmed EI timestamp', () => {
        const details = nativeDetails(
            { started_at_unix: 1768702180, duration_ms: 49285 },
            { timeStart: 1000, timeStartStd: '1970-01-01 00:16:40 +00' },
        );
        expect(resolveFightTimestamp(details, {})).toBe(1768702180 * 1000);
    });

    it('falls back to the EI timestamp when no native report is carried', () => {
        expect(resolveFightTimestamp({ timeStart: 1000 }, {})).toBe(1000 * 1000);
    });

    it('falls back through the whole EI chain to the log uploadTime', () => {
        expect(resolveFightTimestamp({}, { uploadTime: 1768702180 })).toBe(1768702180 * 1000);
    });

    it('falls back when the native report carries no encounter start', () => {
        // "native present, start absent" must not resolve to 0/epoch — the EI
        // chain is still the best available answer for such a log.
        const details = nativeDetails({ duration_ms: 49285 }, { timeStart: 1000 });
        expect(resolveFightTimestamp(details, {})).toBe(1000 * 1000);
    });

    it('returns 0 when nothing at all resolves', () => {
        expect(resolveFightTimestamp({}, {})).toBe(0);
    });
});

describe('parseEncounterDurationMs', () => {
    it('reads the EI spelling axilogParser persists onto the log', () => {
        expect(parseEncounterDurationMs('0m 22s 205ms')).toBe(22205);
        expect(parseEncounterDurationMs('10m 55s 0ms')).toBe(655000);
        expect(parseEncounterDurationMs('1h 2m 3s 456ms')).toBe(3723456);
    });

    it('does not read the "ms" suffix as minutes', () => {
        expect(parseEncounterDurationMs('205ms')).toBe(205);
    });

    it('reads the clock spelling formatDurationMs renders', () => {
        expect(parseEncounterDurationMs('0:43')).toBe(43000);
        expect(parseEncounterDurationMs('10:55')).toBe(655000);
        expect(parseEncounterDurationMs('1:02:03')).toBe(3723000);
    });

    it('returns 0 for values that carry no duration', () => {
        expect(parseEncounterDurationMs('')).toBe(0);
        expect(parseEncounterDurationMs('Unknown')).toBe(0);
        expect(parseEncounterDurationMs(undefined)).toBe(0);
        expect(parseEncounterDurationMs(-5)).toBe(0);
    });
});

describe('parseArcdpsFilenameMs', () => {
    const localMs = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
        new Date(y, mo - 1, d, h, mi, s, 0).getTime();

    it('reads the end time out of an arcdps filename', () => {
        expect(parseArcdpsFilenameMs('20260917-214012.zevtc')).toBe(localMs(2026, 9, 17, 21, 40, 12));
    });

    it('ignores directories that look like log names', () => {
        expect(parseArcdpsFilenameMs('/logs/20260101-000000/20260917-214012.zevtc'))
            .toBe(localMs(2026, 9, 17, 21, 40, 12));
    });

    it('rejects names that are not arcdps timestamps', () => {
        expect(parseArcdpsFilenameMs('fight-3.zevtc')).toBe(0);
        expect(parseArcdpsFilenameMs('202609171-214012.zevtc')).toBe(0);
        expect(parseArcdpsFilenameMs('20260917-244012.zevtc')).toBe(0);
        expect(parseArcdpsFilenameMs(undefined)).toBe(0);
    });

    it('rejects a well-formed name that is not a real date', () => {
        expect(parseArcdpsFilenameMs('20260231-120000.zevtc')).toBe(0);
    });
});

describe('resolveFightTimestamp filename fallback', () => {
    // The user-reported fault: details evicted from the cache before the stats
    // stream reached the log, so every details-side field is gone and only the
    // log's own `encounterDuration` and file path survive.
    const detailsLessLog = {
        filePath: '/logs/20260917-214012.zevtc',
        encounterDuration: '0m 17s 500ms',
    };

    it('reconstructs the fight start from filename minus duration', () => {
        const end = new Date(2026, 8, 17, 21, 40, 12, 0).getTime();
        expect(resolveFightTimestamp(undefined, detailsLessLog)).toBe(end - 17500);
    });

    it('falls back to the raw filename time when no duration survives', () => {
        const end = new Date(2026, 8, 17, 21, 40, 12, 0).getTime();
        expect(resolveFightTimestamp(undefined, { filePath: '/logs/20260917-214012.zevtc' })).toBe(end);
    });

    it('reads the id when the log carries no filePath', () => {
        const end = new Date(2026, 8, 17, 21, 40, 12, 0).getTime();
        expect(resolveFightTimestamp(undefined, { id: '20260917-214012.zevtc' })).toBe(end);
    });

    it('prefers the details chain over the filename', () => {
        expect(resolveFightTimestamp({ timeStart: 1000 }, detailsLessLog)).toBe(1000 * 1000);
    });

    it('prefers the filename over uploadTime, which only records the import', () => {
        const end = new Date(2026, 8, 17, 21, 40, 12, 0).getTime();
        expect(resolveFightTimestamp({}, { ...detailsLessLog, uploadTime: 1768702180 })).toBe(end - 17500);
    });
});
