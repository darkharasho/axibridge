import { describe, it, expect } from 'vitest';
import { tickRateAt, tickWindow, tickTone } from '../tickRate';
import type { ReplayTickRate } from '../replayTypes';

const make = (perSecond: number[], over: Partial<ReplayTickRate> = {}): ReplayTickRate =>
    ({ avg: 25, min: Math.min(...perSecond.filter(v => v > 0)), perSecond, ...over });

/**
 * The zero-bucket rule is the whole reason this module exists. Measured on
 * six real WvW logs: index 0 is always 0, the final bucket often is, and
 * interior zeros are scattered through laggy fights — one 101-second fight
 * had nine. axilog's own `min` equals the minimum of the NON-zero samples on
 * every one of them, so the parser treats a zero as an unsampled second.
 * Displaying it raw would report a healthy server as a dead one.
 */
describe('tickRateAt', () => {
    it('reads the sample at the playhead second', () => {
        expect(tickRateAt(make([0, 25.1, 24.9, 16.5]), 2_000)).toBe(24.9);
    });

    it('carries the last real sample through an unsampled second', () => {
        // Second 2 produced no CBTS_TICK events. The server did not stop.
        expect(tickRateAt(make([0, 25.1, 0, 16.5]), 2_000)).toBe(25.1);
    });

    it('never reports zero from the always-empty opening bucket', () => {
        expect(tickRateAt(make([0, 25.1]), 0)).toBeNull();
    });

    it('carries through a trailing unsampled bucket at the end of the fight', () => {
        expect(tickRateAt(make([0, 25.1, 24.4, 0]), 3_000)).toBe(24.4);
    });

    it('clamps past the end of the series rather than reading undefined', () => {
        expect(tickRateAt(make([0, 25.1, 24.4]), 900_000)).toBe(24.4);
    });

    it('returns null when the block is absent or empty', () => {
        expect(tickRateAt(null, 5_000)).toBeNull();
        expect(tickRateAt(make([0]), 0)).toBeNull();
    });
});

describe('tickWindow', () => {
    it('returns the trailing seconds ending at the playhead', () => {
        expect(tickWindow(make([0, 25, 24, 23, 22, 21]), 5_000, 3)).toEqual([23, 22, 21]);
    });

    it('carries unsampled seconds forward instead of plotting them at zero', () => {
        expect(tickWindow(make([0, 25, 0, 0, 22]), 4_000, 4)).toEqual([25, 25, 25, 22]);
    });

    it('drops leading buckets with no prior sample to carry', () => {
        // Nothing has been measured at second 0, so there is nothing to plot
        // for it — the window starts where the data does.
        expect(tickWindow(make([0, 25, 24]), 2_000, 5)).toEqual([25, 24]);
    });

    it('is empty when there is no block', () => {
        expect(tickWindow(null, 5_000, 5)).toEqual([]);
    });
});

describe('tickTone', () => {
    it('stays quiet at nominal so colour only appears when it means something', () => {
        expect(tickTone(25)).toBe('normal');
        expect(tickTone(23.5)).toBe('normal');
    });

    it('warns once the server is measurably behind', () => {
        expect(tickTone(23.4)).toBe('warn');
        expect(tickTone(20)).toBe('warn');
    });

    it('escalates where the fight stops being comparable to a clean one', () => {
        expect(tickTone(19.9)).toBe('bad');
        expect(tickTone(16.5)).toBe('bad');
    });
});
