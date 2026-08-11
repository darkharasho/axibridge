import { describe, it, expect } from 'vitest';
import { playerPosAt } from '../shared';
import type { Player } from '../../dpsReportTypes';

const POLLING_RATE = 300;
const FPS = 1000 / POLLING_RATE; // 3.333… polls per second

function mkPlayer(startMs: number, positions: [number, number][]): Player {
    return { combatReplayData: { start: startMs, positions } } as unknown as Player;
}

describe('playerPosAt', () => {
    it('reads from index 0 for a player tracked from the start of the fight', () => {
        const p = mkPlayer(0, [[10, 10], [20, 20], [30, 30], [40, 40]]);
        expect(playerPosAt(p, 0, FPS)).toEqual([10, 10]);
    });

    // Regression: `combatReplayData.start` is MILLISECONDS, and used to be
    // subtracted straight from a frame index. A mid-fight joiner therefore
    // produced a large negative index and resolved to null at EVERY second of
    // the fight — they simply had no position anywhere.
    it('resolves a mid-fight joiner instead of returning null forever', () => {
        // start = 38317ms -> first sample is poll ceil(38317/300) = 128,
        // i.e. t ≈ 38.4s. Under the old arithmetic the index was
        // round(t * fps) - 38317, negative for any plausible t.
        const positions: [number, number][] = Array.from(
            { length: 10 },
            (_, i) => [100 + i, 200 + i] as [number, number],
        );
        const p = mkPlayer(38317, positions);

        const at384 = playerPosAt(p, 38.4, FPS);
        expect(at384).not.toBeNull();
        expect(at384).toEqual([100, 200]);

        // One second later is ~3.33 polls further along.
        const at394 = playerPosAt(p, 39.4, FPS);
        expect(at394).not.toBeNull();
        expect(at394).not.toEqual(at384);
    });

    it('returns null before the player joined', () => {
        const p = mkPlayer(38317, [[100, 200], [101, 201]]);
        expect(playerPosAt(p, 10, FPS)).toBeNull();
    });

    it('returns null past the end of the track', () => {
        const p = mkPlayer(0, [[10, 10], [20, 20]]);
        expect(playerPosAt(p, 600, FPS)).toBeNull();
    });

    it('returns null when there is no position data at all', () => {
        expect(playerPosAt(mkPlayer(0, []), 5, FPS)).toBeNull();
    });
});
