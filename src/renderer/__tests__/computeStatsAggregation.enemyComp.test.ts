import { describe, expect, it } from 'vitest';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';

describe('computeStatsAggregation (enemy composition)', () => {
    it('builds enemyClassData from non-fake targets, not off-squad players', () => {
        const log = {
            status: 'success',
            filePath: 'enemy-comp-test',
            details: {
                players: [
                    { account: 'squad.one', profession: 'Guardian', notInSquad: false },
                    { account: 'ally.one', profession: 'Firebrand', notInSquad: true },
                    { account: 'ally.two', profession: 'Tempest', notInSquad: true }
                ],
                targets: [
                    { profession: 'Necromancer', isFake: false },
                    { profession: 'Necromancer', isFake: false },
                    { profession: 'Mesmer', isFake: false },
                    { profession: 'Ranger', isFake: false },
                    { profession: 'Warrior', isFake: false },
                    { profession: 'Engineer', isFake: true }
                ],
                skillMap: {},
                buffMap: {},
                durationMS: 1000
            }
        };

        const { stats } = computeStatsAggregation({ logs: [log as any] });
        const enemyCounts = Object.fromEntries((stats.enemyClassData || []).map((entry: any) => [entry.name, entry.value]));
        const totalEnemyCount = (stats.enemyClassData || []).reduce((sum: number, entry: any) => sum + Number(entry.value || 0), 0);

        expect(totalEnemyCount).toBe(5);
        expect(enemyCounts.Necromancer).toBe(2);
        expect(enemyCounts.Mesmer).toBe(1);
        expect(enemyCounts.Ranger).toBe(1);
        expect(enemyCounts.Warrior).toBe(1);
        expect(enemyCounts.Firebrand).toBeUndefined();
        expect(enemyCounts.Tempest).toBeUndefined();
    });
});
