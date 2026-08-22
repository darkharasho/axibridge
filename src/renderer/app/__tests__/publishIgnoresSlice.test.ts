import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../../stats/statsStore';
import { selectSlicedLogs } from '../selectSlicedLogs';

/**
 * Publish must always publish every fight, never the active slice.
 *
 * After Task 3 the aggregation result IS the sliced result, and the published
 * report body is built from that result. There is therefore no way to publish
 * unsliced stats while a slice is active without a second aggregation, which
 * Phase A excludes. Publish is blocked instead.
 */
describe('publish is unreachable while a slice is active', () => {
    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
    });

    it('reports publish as blocked exactly when the slice is non-empty', () => {
        expect(useStatsStore.getState().excludedFightKeys.size > 0).toBe(false);
        useStatsStore.getState().toggleFightExcluded('b');
        expect(useStatsStore.getState().excludedFightKeys.size > 0).toBe(true);
        useStatsStore.getState().clearFightSlice();
        expect(useStatsStore.getState().excludedFightKeys.size > 0).toBe(false);
    });

    it('slicing the aggregation input leaves the untouched log list intact', () => {
        const logs = [{ filePath: 'a' }, { filePath: 'b' }, { filePath: 'c' }];
        const sliced = selectSlicedLogs(logs, new Set(['b']));
        expect(sliced).toHaveLength(2);
        expect(logs).toHaveLength(3);
    });

    it('the publish hook refuses to upload while sliced', async () => {
        const { canPublishWithSlice } = await import('../../stats/hooks/useStatsUploads');
        expect(canPublishWithSlice(new Set())).toBe(true);
        expect(canPublishWithSlice(new Set(['b']))).toBe(false);
    });
});
