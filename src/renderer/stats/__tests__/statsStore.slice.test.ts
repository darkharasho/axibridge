import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../statsStore';

describe('statsStore fight slice', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts with an empty exclusion set', () => {
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('toggles a key in and back out', () => {
        useStatsStore.getState().toggleFightExcluded('a.zevtc');
        expect(useStatsStore.getState().excludedFightKeys.has('a.zevtc')).toBe(true);
        useStatsStore.getState().toggleFightExcluded('a.zevtc');
        expect(useStatsStore.getState().excludedFightKeys.has('a.zevtc')).toBe(false);
    });

    it('produces a new Set identity on every mutation so selectors re-render', () => {
        const before = useStatsStore.getState().excludedFightKeys;
        useStatsStore.getState().toggleFightExcluded('a.zevtc');
        expect(useStatsStore.getState().excludedFightKeys).not.toBe(before);
    });

    it('sets many keys at once in both directions', () => {
        useStatsStore.getState().setFightsExcluded(['a', 'b', 'c'], true);
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(3);
        useStatsStore.getState().setFightsExcluded(['b'], false);
        expect([...useStatsStore.getState().excludedFightKeys].sort()).toEqual(['a', 'c']);
    });

    it('clears the slice', () => {
        useStatsStore.getState().setFightsExcluded(['a', 'b'], true);
        useStatsStore.getState().clearFightSlice();
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });
});
