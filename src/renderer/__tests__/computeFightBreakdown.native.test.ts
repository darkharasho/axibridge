import { describe, expect, it } from 'vitest';
import { ingestLogFightBreakdown } from '../stats/computeFightBreakdown';
import { formatDurationMs } from '../stats/utils/dashboardUtils';

const logWith = (details: any) => ({ filePath: 'a.zevtc', details: { players: [], targets: [], ...details } });

const native = (encounter: any) => ({ native: { axilog: { schema: '1.0' }, encounter } });

describe('computeFightBreakdown duration from native', () => {
    it('takes the fight duration from the native encounter', () => {
        const log = logWith({ durationMS: 999, ...native({ duration_ms: 49285 }) });
        expect(ingestLogFightBreakdown(log, 0).duration).toBe(formatDurationMs(49285));
    });

    it('falls back to EI durationMS when native is absent', () => {
        expect(ingestLogFightBreakdown(logWith({ durationMS: 12000 }), 0).duration)
            .toBe(formatDurationMs(12000));
    });

    it('does not render a zero-length fight as the placeholder', () => {
        // duration 0 is a real parse result, distinct from "no duration".
        const log = logWith(native({ duration_ms: 0 }));
        expect(ingestLogFightBreakdown(log, 0).duration).toBe(formatDurationMs(0));
    });

    it('still shows the placeholder when neither source has a duration', () => {
        expect(ingestLogFightBreakdown(logWith({}), 0).duration).toBe('--:--');
    });

    it('takes the map name from the native encounter', () => {
        const log = logWith({ fightName: 'Detailed WvW - Eternal Battlegrounds', ...native({ map: 'Green Alpine Borderlands' }) });
        expect(ingestLogFightBreakdown(log, 0).mapName).toBe('Green Borderlands');
    });

    it('takes the timestamp from the native encounter', () => {
        const log = logWith({ timeStart: 1000, ...native({ started_at_unix: 1768702180 }) });
        expect(ingestLogFightBreakdown(log, 0).timestamp).toBe(1768702180 * 1000);
    });
});
