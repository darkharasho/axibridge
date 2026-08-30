import { describe, it, expect } from 'vitest';
import {
    TRACKED_REPLAY_BUFF_IDS,
    TRACKED_REPLAY_CONDI_IDS,
    TRACKED_REPLAY_STATE_IDS,
    isReplayCondition,
} from '../replayBuffs';

describe('replay tracked buff sets', () => {
    it('tracks exactly the eight approved conditions', () => {
        expect([...TRACKED_REPLAY_CONDI_IDS].sort((a, b) => a - b))
            .toEqual([720, 721, 722, 727, 738, 742, 791, 26766]);
    });

    it('excludes damage conditions by design', () => {
        // Bleeding 736, Burning 737, Poison 723, Torment 19426, Confusion 861.
        for (const id of [736, 737, 723, 19426, 861]) {
            expect(TRACKED_REPLAY_CONDI_IDS.has(id)).toBe(false);
        }
    });

    it('keeps boons and conditions disjoint', () => {
        for (const id of TRACKED_REPLAY_CONDI_IDS) {
            expect(TRACKED_REPLAY_BUFF_IDS.has(id)).toBe(false);
        }
    });

    it('the union is every boon plus every condition', () => {
        expect(TRACKED_REPLAY_STATE_IDS.size)
            .toBe(TRACKED_REPLAY_BUFF_IDS.size + TRACKED_REPLAY_CONDI_IDS.size);
        for (const id of TRACKED_REPLAY_BUFF_IDS) expect(TRACKED_REPLAY_STATE_IDS.has(id)).toBe(true);
        for (const id of TRACKED_REPLAY_CONDI_IDS) expect(TRACKED_REPLAY_STATE_IDS.has(id)).toBe(true);
    });

    it('isReplayCondition separates the two clusters', () => {
        expect(isReplayCondition(738)).toBe(true);   // Vulnerability
        expect(isReplayCondition(740)).toBe(false);  // Might
        expect(isReplayCondition(99999)).toBe(false);
    });
});
