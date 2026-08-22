import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../statsStore';

const fight = (id: string, timestamp: number) => ({
    id, timestamp, label: `Fight ${id}`, duration: '1:00', isWin: true,
    enemyClassCounts: { Necromancer: 3 },
});

describe('fight roster', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts empty', () => {
        expect(useStatsStore.getState().fightRoster).toEqual([]);
    });

    it('keeps fights that later drop out of the aggregation', () => {
        const store = useStatsStore.getState();
        store.mergeFightRoster([fight('a', 1), fight('b', 2)], ['a', 'b']);
        // 'b' is now excluded, so aggregation only reports 'a' — but both are loaded.
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a', 'b']);
        expect(useStatsStore.getState().fightRoster.map(f => f.id)).toEqual(['a', 'b']);
    });

    it('prunes fights whose logs are no longer loaded', () => {
        const store = useStatsStore.getState();
        store.mergeFightRoster([fight('a', 1), fight('b', 2)], ['a', 'b']);
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        expect(useStatsStore.getState().fightRoster.map(f => f.id)).toEqual(['a']);
    });

    it('sorts by timestamp', () => {
        useStatsStore.getState().mergeFightRoster(
            [fight('late', 500), fight('early', 100)], ['late', 'early']);
        expect(useStatsStore.getState().fightRoster.map(f => f.id)).toEqual(['early', 'late']);
    });

    it('refreshes an existing entry rather than duplicating it', () => {
        const store = useStatsStore.getState();
        store.mergeFightRoster([fight('a', 1)], ['a']);
        useStatsStore.getState().mergeFightRoster(
            [{ ...fight('a', 1), label: 'Renamed' }], ['a']);
        const roster = useStatsStore.getState().fightRoster;
        expect(roster).toHaveLength(1);
        expect(roster[0].label).toBe('Renamed');
    });

    it('does not change array identity when the merge is a no-op', () => {
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        const before = useStatsStore.getState().fightRoster;
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        expect(useStatsStore.getState().fightRoster).toBe(before);
    });

    it('preserves array identity when enemyClassCounts is a fresh object with the same values', () => {
        // StatsView rebuilds enemyClassCounts from scratch on every effect run, so a
        // truly-unchanged fight still arrives as a brand-new object each merge.
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        const before = useStatsStore.getState().fightRoster;
        useStatsStore.getState().mergeFightRoster(
            [{ ...fight('a', 1), enemyClassCounts: { Necromancer: 3 } }], ['a']);
        expect(useStatsStore.getState().fightRoster).toBe(before);
    });

    it('treats a changed enemyClassCounts as a real change, not a no-op', () => {
        useStatsStore.getState().mergeFightRoster([fight('a', 1)], ['a']);
        const before = useStatsStore.getState().fightRoster;
        useStatsStore.getState().mergeFightRoster(
            [{ ...fight('a', 1), enemyClassCounts: { Necromancer: 3, Guardian: 1 } }], ['a']);
        const roster = useStatsStore.getState().fightRoster;
        expect(roster).not.toBe(before);
        expect(roster[0].enemyClassCounts).toEqual({ Necromancer: 3, Guardian: 1 });
    });
});
