import { describe, it, expect } from 'vitest';
import { executeToolCall } from '../tools/toolExecutors';

// Minimal fake log + details
function makeLog(id: string, fightName: string): ILogData {
    return { id, filePath: `/path/${id}`, fightName, detailsStatus: 'loaded', permalink: '' } as any;
}

function makePlayer(char: string, account: string, group: number, overrides: any = {}) {
    return {
        character_name: char,
        display_name: char,
        account,
        profession: 'Daredevil',
        group,
        dpsAll: [{ damage: 100_000, dps: 500, breakbarDamage: 50 }],
        defenses: [{ deadCount: 1, downCount: 2, damageTaken: 20_000, dodgeCount: 3, blockedCount: 0, evadedCount: 1, missedCount: 0 }],
        support: [{ resurrects: 2, condiCleanse: 5, condiCleanseSelf: 1, boonStrips: 3 }],
        statsAll: [{ distToCom: 100 }],
        buffUptimes: [
            { id: 726, buffData: [{ uptime: 0.9 }] },   // Stability
            { id: 1187, buffData: [{ uptime: 0.8 }] },  // Quickness
        ],
        ...overrides,
    };
}

const logs: ILogData[] = [makeLog('l1', 'Fight A'), makeLog('l2', 'Fight B')];
const detailsA = {
    players: [
        makePlayer('Alpha', 'alpha.1234', 1),
        makePlayer('Beta', 'beta.5678', 2, { dpsAll: [{ damage: 200_000, dps: 1000, breakbarDamage: 0 }] }),
    ],
};
const detailsB = {
    players: [makePlayer('Alpha', 'alpha.1234', 1, { defenses: [{ deadCount: 0, downCount: 0, damageTaken: 5_000 }] })],
};
const getDetails = (id: string) => id === 'l1' ? detailsA : id === 'l2' ? detailsB : undefined;

describe('rank_players', () => {
    it('ranks by dps descending', () => {
        const result = executeToolCall('rank_players', { metric: 'dps' }, logs, getDetails);
        expect(result.ranked[0].name).toBe('Beta');
        expect(result.ranked[1].name).toBe('Alpha');
    });

    it('returns error for unknown metric', () => {
        const result = executeToolCall('rank_players', { metric: 'nonsense' }, logs, getDetails);
        expect(result.error).toBe('Unknown metric');
        expect(result.valid_metrics).toContain('dps');
    });

    it('filters to a specific fight by fight_index', () => {
        const result = executeToolCall('rank_players', { metric: 'dps', fight_index: 0 }, logs, getDetails);
        expect(result.ranked.length).toBe(2);
    });
});

describe('player_deep_dive', () => {
    it('finds player by partial name', () => {
        const result = executeToolCall('player_deep_dive', { character_name: 'alph' }, logs, getDetails);
        expect(result.results).toBeDefined();
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0].player.character_name).toBe('Alpha');
    });

    it('returns available players when not found', () => {
        const result = executeToolCall('player_deep_dive', { character_name: 'nobody' }, logs, getDetails);
        expect(result.error).toBe('Player not found');
        expect(result.available_players).toContain('Alpha');
    });
});

describe('boon_analysis', () => {
    it('returns boon uptime per player', () => {
        const result = executeToolCall('boon_analysis', {}, logs, getDetails);
        expect(result.fights[0].players.length).toBeGreaterThan(0);
        expect(result.fights[0].players[0].boons).toHaveProperty('stability');
    });

    it('filters to a specific boon', () => {
        const result = executeToolCall('boon_analysis', { boon_name: 'quickness' }, logs, getDetails);
        const boonKeys = Object.keys(result.fights[0].players[0].boons);
        expect(boonKeys).toEqual(['quickness']);
    });
});

describe('group_breakdown', () => {
    it('groups players by group number', () => {
        const result = executeToolCall('group_breakdown', {}, logs, getDetails);
        const fightA = result.fights[0];
        expect(fightA.groups.find((g: any) => g.group === 1)).toBeDefined();
        expect(fightA.groups.find((g: any) => g.group === 2)).toBeDefined();
    });
});

describe('compare_fights', () => {
    it('compares squad dps across fights', () => {
        const result = executeToolCall('compare_fights', { metric: 'dps' }, logs, getDetails);
        expect(result.fights.length).toBe(2);
        expect(result.fights[0].fight).toBe('Fight A');
    });

    it('compares a specific player across fights', () => {
        const result = executeToolCall('compare_fights', { metric: 'deaths', player_name: 'Alpha' }, logs, getDetails);
        expect(result.fights[0].value).toBe(1); // Fight A: 1 death
        expect(result.fights[1].value).toBe(0); // Fight B: 0 deaths
    });
});

describe('executeToolCall', () => {
    it('returns error for unknown tool', () => {
        const result = executeToolCall('unknown_tool', {}, logs, getDetails);
        expect(result.error).toBe('Unknown tool');
    });
});
