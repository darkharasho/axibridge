import { describe, it, expect } from 'vitest';
import { hashSliceSettings } from '../sliceSettingsHash';

const halves = (digest: string) => {
    const [high, low] = digest.split('-');
    return { high: parseInt(high, 36), low: parseInt(low, 36) };
};

describe('hashSliceSettings', () => {
    it('is stable across key insertion order', () => {
        const a = hashSliceSettings(undefined, { splitPlayersByClass: true, showAll: false }, 'strips');
        const b = hashSliceSettings(undefined, { showAll: false, splitPlayersByClass: true }, 'strips');
        expect(a).toBe(b);
    });

    it('changes when any of the three settings changes', () => {
        const base = hashSliceSettings(undefined, undefined, undefined);
        expect(hashSliceSettings({ dps: 1 }, undefined, undefined)).not.toBe(base);
        expect(hashSliceSettings(undefined, { splitPlayersByClass: true }, undefined)).not.toBe(base);
        expect(hashSliceSettings(undefined, undefined, 'strips')).not.toBe(base);
    });

    /**
     * The two halves must come from structurally different mixers, not one
     * recurrence under two seeds.
     *
     * `h = h*31 + c` is affine in its seed: after n characters
     * `h_seed(s) = h_0(s) + seed * 31^n (mod 2^32)`. So for any two inputs of
     * EQUAL LENGTH the seed term cancels and `high(s) - low(s)` is the same
     * constant `seed * 31^n` for both — the second digest carries no
     * information the first does not, and every equal-length collision under
     * one half is a collision under the other. Two inputs of equal canonical
     * length with a differing half-difference prove the mixers are not related
     * that way.
     */
    it('derives its two halves from mixers that are not seed-shifts of each other', () => {
        const a = hashSliceSettings(undefined, undefined, 'aaa');
        const b = hashSliceSettings(undefined, undefined, 'bbb');
        // Precondition: the canonical strings really are the same length, or
        // the affine cancellation above would not apply and the assertion
        // below would pass vacuously.
        expect(JSON.stringify({ disruptionMethod: 'aaa', mvpWeights: undefined, statsViewSettings: undefined }).length)
            .toBe(JSON.stringify({ disruptionMethod: 'bbb', mvpWeights: undefined, statsViewSettings: undefined }).length);
        const ha = halves(a);
        const hb = halves(b);
        const diff = (h: { high: number; low: number }) => (h.high - h.low) >>> 0;
        expect(diff(ha)).not.toBe(diff(hb));
    });
});
