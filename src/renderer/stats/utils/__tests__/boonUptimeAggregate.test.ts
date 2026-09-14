import { describe, expect, it } from 'vitest';
import { computeBoonUptimePercentByPlayer, computeFightUptimePercent } from '../boonUptimeAggregate';

const FIGHTS = [
    { durationMs: 10_000, values: { 'Regular.1111': { buckets: [1, 0] } } },
    {
        durationMs: 10_000,
        values: {
            'Regular.1111': { buckets: [1, 0] },
            'Latecomer.2222': { buckets: [1, 1] },
        },
    },
];

describe('computeBoonUptimePercentByPlayer', () => {
    it('divides coverage by the player\'s own attendance, not the session\'s', () => {
        const map = computeBoonUptimePercentByPlayer({
            players: [
                { key: 'Regular.1111', weightedMs: 10_000, attendedMs: 20_000 },
                { key: 'Latecomer.2222', weightedMs: 10_000, attendedMs: 10_000 },
            ],
            fights: FIGHTS,
            stacking: false,
            intervalMs: 5000,
        });
        expect(map.get('Regular.1111')).toBe(50);
        // Absent for fight 1; the old denominator scored this 50% and hid the
        // better player behind the more frequent one.
        expect(map.get('Latecomer.2222')).toBe(100);
    });

    it('returns a mean stack count for intensity boons rather than a percentage', () => {
        const map = computeBoonUptimePercentByPlayer({
            players: [{ key: 'Regular.1111', weightedMs: 150_000, attendedMs: 10_000 }],
            fights: [],
            stacking: true,
            intervalMs: 5000,
        });
        expect(map.get('Regular.1111')).toBe(15);
    });

    it('falls back to the bucket grid for reports published before weightedMs', () => {
        const map = computeBoonUptimePercentByPlayer({
            players: [{ key: 'Regular.1111' }, { key: 'Latecomer.2222' }],
            fights: FIGHTS,
            stacking: false,
            intervalMs: 5000,
        });
        // Two fights, one of four buckets held -> 50%; and one fight fully held.
        expect(map.get('Regular.1111')).toBe(50);
        expect(map.get('Latecomer.2222')).toBe(100);
    });

    /**
     * Subgroup rows are synthesized in `StatsView` rather than read off the
     * report: their `attendedMs` is summed from fight durations, so it is
     * always positive, while their `weightedMs` is averaged from the member
     * entries in `fight.values` -- a field a report published before
     * `weightedMs` existed does not carry. Gating the legacy fallback on
     * attendance alone therefore skipped it for exactly these rows and every
     * subgroup rendered 0.0 while the player rows beside them were correct.
     */
    it('falls back for a synthesized row that has attendance but no coverage', () => {
        const map = computeBoonUptimePercentByPlayer({
            players: [{ key: '__subgroup__:1', weightedMs: 0, attendedMs: 20_000 }],
            fights: [
                { durationMs: 10_000, values: { '__subgroup__:1': { buckets: [1, 0] } } },
                { durationMs: 10_000, values: { '__subgroup__:1': { buckets: [1, 0] } } },
            ],
            stacking: false,
            intervalMs: 5000,
        });
        expect(map.get('__subgroup__:1')).toBe(50);
    });

    it('omits a player with no attendance at all rather than scoring them zero', () => {
        const map = computeBoonUptimePercentByPlayer({
            players: [{ key: 'Ghost.3333' }, { key: '__all__' }],
            fights: FIGHTS,
            stacking: false,
            intervalMs: 5000,
        });
        expect(map.has('Ghost.3333')).toBe(false);
        expect(map.has('__all__')).toBe(false);
    });
});

describe('computeFightUptimePercent', () => {
    it('uses exact time-weighted coverage, not the share of buckets that saw the boon at all', () => {
        // One 5s bucket held for 500ms of a 20s fight is 2.5% uptime; counting
        // any non-zero bucket as covered read it as 25%.
        expect(computeFightUptimePercent({ buckets: [0.1, 0, 0, 0], weightedMs: 500 }, 20_000)).toBeCloseTo(2.5);
    });

    it('does not let one covered subgroup member mark the whole subgroup covered', () => {
        // Subgroup buckets are member averages: 1 of 5 members holding the boon
        // the whole fight is 20%, not 100%.
        expect(computeFightUptimePercent({ buckets: [0.2, 0.2], weightedMs: 2_000 }, 10_000)).toBeCloseTo(20);
    });

    it('falls back to the bucket mean for reports published before weightedMs', () => {
        expect(computeFightUptimePercent({ buckets: [1, 0.5, 0, 0] }, 20_000)).toBeCloseTo(37.5);
    });

    it('is zero without a value', () => {
        expect(computeFightUptimePercent(undefined, 20_000)).toBe(0);
    });
});
