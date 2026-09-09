import { describe, it, expect } from 'vitest';
import { deriveRecoveries, hasReviveData } from '../reviveDerivation';

const player = (down: number[][], dead: number[][]) => ({
    combatReplayData: { down, dead },
});

describe('deriveRecoveries', () => {
    it('counts a down that ended without a death as a recovery', () => {
        const result = deriveRecoveries(player([[1000, 5000]], []), 'A|Guardian', 0);
        expect(result).toEqual([{ playerKey: 'A|Guardian', playerIndex: 0, downStart: 1000, standUpAt: 5000 }]);
    });

    it('does not count a down that ended in death', () => {
        expect(deriveRecoveries(player([[1000, 5000]], [[5000, 9000]]), 'A|Guardian', 0)).toEqual([]);
    });

    it('tolerates a small gap between the down ending and the death starting', () => {
        expect(deriveRecoveries(player([[1000, 5000]], [[5120, 9000]]), 'A|Guardian', 0)).toEqual([]);
    });

    it('counts a later, separate death as a death and not a recovery match', () => {
        const result = deriveRecoveries(player([[1000, 5000]], [[40000, 50000]]), 'A|Guardian', 0);
        expect(result).toHaveLength(1);
    });

    it('handles several downs in one fight independently', () => {
        const result = deriveRecoveries(
            player([[1000, 2000], [8000, 9000], [20000, 21000]], [[9000, 30000]]),
            'A|Guardian', 0
        );
        expect(result.map((r) => r.standUpAt)).toEqual([2000, 21000]);
    });

    it('returns nothing when replay data is absent', () => {
        expect(deriveRecoveries({}, 'A|Guardian', 0)).toEqual([]);
    });
});

describe('hasReviveData', () => {
    it('is false without replay data', () => {
        expect(hasReviveData({ rotation: [] })).toBe(false);
    });

    it('is false without rotation', () => {
        expect(hasReviveData({ combatReplayData: { down: [], dead: [] } })).toBe(false);
    });

    it('is true with both', () => {
        expect(hasReviveData({ combatReplayData: { down: [], dead: [] }, rotation: [] })).toBe(true);
    });
});
