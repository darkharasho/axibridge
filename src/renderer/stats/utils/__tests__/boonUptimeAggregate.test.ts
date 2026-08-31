import { describe, expect, it } from 'vitest';
import { computeBoonUptimePercentByPlayer } from '../boonUptimeAggregate';

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
