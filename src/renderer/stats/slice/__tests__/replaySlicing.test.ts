import { describe, it, expect } from 'vitest';
import { isReplayUnsliceable } from '../replaySlicing';

describe('isReplayUnsliceable', () => {
    it('is false with no slice active, whatever the replay looks like', () => {
        expect(isReplayUnsliceable({ replayFights: [], excludedFightCount: 0 })).toBe(false);
        expect(isReplayUnsliceable({ replayFights: undefined, excludedFightCount: 0 })).toBe(false);
        expect(isReplayUnsliceable({ replayFights: [{ id: 1 }], excludedFightCount: 0 })).toBe(false);
    });

    /**
     * M4: the published viewer's slice stats never carry `replayFights` (frames
     * exclude replay payloads), so the replay falls through to a whole-session
     * cache fetched from R2. Playing all seven fights next to a three-fight
     * table, with nothing saying so, is the failure this guards.
     */
    it('is true when a slice is active and the aggregation carries no replay of its own', () => {
        expect(isReplayUnsliceable({ replayFights: [], excludedFightCount: 1 })).toBe(true);
        expect(isReplayUnsliceable({ replayFights: undefined, excludedFightCount: 1 })).toBe(true);
        expect(isReplayUnsliceable({ replayFights: null, excludedFightCount: 3 })).toBe(true);
    });

    /**
     * The narrowness matters as much as the guard: on the desktop, Phase A
     * slices the logs before aggregation, so `replayFights` is already the
     * subset. Hiding the replay there would be a regression, not a fix.
     */
    it('is false when the aggregation carries its own already-sliced replay', () => {
        expect(isReplayUnsliceable({ replayFights: [{ id: 1 }], excludedFightCount: 2 })).toBe(false);
    });
});
