import { describe, expect, it } from 'vitest';
import { resolveFightTimestamp } from '../timestampUtils';

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
