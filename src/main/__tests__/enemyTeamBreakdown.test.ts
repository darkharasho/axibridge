import { describe, expect, it, vi } from 'vitest';

vi.mock('axios');
import { computeEnemyTeamBreakdown } from '../discord';

const squad = [{ account: 'A.1', notInSquad: false, teamID: 707, statsTargets: [] }];
const target = (instanceID: number, teamID: number) => ({
    name: `Enemy ${instanceID}`, instanceID, teamID, profession: 'Guardian', isFake: false,
    dpsAll: [{ damage: 1000 }],
});

describe('computeEnemyTeamBreakdown', () => {
    it('splits enemies by team when every enemy has one', () => {
        const teams = computeEnemyTeamBreakdown(squad, [target(1, 2778), target(2, 2778), target(3, 433)], 60, null);
        expect(teams.map((t) => t.count).sort()).toEqual([1, 2]);
    });

    // arcdps 20261018 stamps team 0 on non-squad players: 12 of 13 enemies had
    // none, and the split posted "Green team: 1" with the other 12 dropped.
    it('returns no split when any enemy has no team', () => {
        const targets = [target(1, 2778), ...Array.from({ length: 12 }, (_, i) => target(10 + i, 0))];
        expect(computeEnemyTeamBreakdown(squad, targets, 60, null)).toEqual([]);
    });
});
