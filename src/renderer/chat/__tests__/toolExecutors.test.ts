import { describe, it, expect } from 'vitest';
import { executeToolCall } from '../tools/toolExecutors';
import { computeStatsSync } from '../../stats/incrementalAggregation';

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
    durationMS: 200_000,
    players: [
        makePlayer('Alpha', 'alpha.1234', 1),
        makePlayer('Beta', 'beta.5678', 2, { dpsAll: [{ damage: 300_000, dps: 1500, breakbarDamage: 0 }] }),
    ],
};
const detailsB = {
    durationMS: 100_000,
    players: [makePlayer('Alpha', 'alpha.1234', 1, { defenses: [{ deadCount: 0, downCount: 0, damageTaken: 5_000 }] })],
};
const getDetails = (id: string) => id === 'l1' ? detailsA : id === 'l2' ? detailsB : undefined;

const hydratedLogs = logs.map(log => ({
    ...log,
    details: log.id === 'l1' ? detailsA : log.id === 'l2' ? detailsB : undefined,
}));
const { stats: computedStats } = computeStatsSync({ logs: hydratedLogs });

describe('rank_players', () => {
    it('ranks by damage descending — beta tops alpha', () => {
        const result = executeToolCall('rank_players', { metric: 'damage' }, logs, getDetails, computedStats);
        expect(typeof result).toBe('string');
        const lines = result.split('\n');
        expect(lines[1]).toContain('beta.5678');
        expect(lines[2]).toContain('alpha.1234');
    });

    it('ranks by dps descending — beta tops alpha', () => {
        const result = executeToolCall('rank_players', { metric: 'dps' }, logs, getDetails, computedStats);
        const lines = result.split('\n');
        expect(lines[1]).toContain('beta.5678');
    });

    it('returns error for unknown metric', () => {
        const result = executeToolCall('rank_players', { metric: 'nonsense' }, logs, getDetails, computedStats);
        expect(result).toContain('Unknown metric');
        expect(result).toContain('dps');
    });

    it('filters to a specific fight by fight_index', () => {
        const result = executeToolCall('rank_players', { metric: 'damage', fight_index: 0 }, logs, getDetails, computedStats);
        expect(result).toContain('Fight 1');
        expect(result).toContain('beta.5678');
        expect(result).toContain('alpha.1234');
    });
});

describe('player_deep_dive', () => {
    it('finds player by partial account name', () => {
        const result = executeToolCall('player_deep_dive', { character_name: 'alpha' }, logs, getDetails, computedStats);
        expect(result).toContain('alpha.1234');
        expect(result).toContain('DMG');
    });

    it('returns available players when not found', () => {
        const result = executeToolCall('player_deep_dive', { character_name: 'nobody' }, logs, getDetails, computedStats);
        expect(result).toContain('not found');
        expect(result).toContain('alpha.1234');
    });
});

describe('boon_analysis', () => {
    it('returns boon uptime summary with stability and quickness', () => {
        const result = executeToolCall('boon_analysis', {}, logs, getDetails, computedStats);
        expect(result).toContain('Stability');
        expect(result).toContain('Quickness');
        expect(result).toContain('%');
    });

    it('filters to a specific boon', () => {
        const result = executeToolCall('boon_analysis', { boon_name: 'quickness' }, logs, getDetails, computedStats);
        expect(result).toContain('Quickness');
        expect(result).not.toContain('Stability');
    });
});

describe('group_breakdown', () => {
    it('groups players by group number with stats', () => {
        const result = executeToolCall('group_breakdown', {}, logs, getDetails, computedStats);
        expect(result).toContain('Group 1');
        expect(result).toContain('Group 2');
        expect(result).toContain('DMG');
    });
});

describe('compare_fights', () => {
    it('compares squad damage across fights', () => {
        const result = executeToolCall('compare_fights', { metric: 'damage' }, logs, getDetails, computedStats);
        expect(result).toContain('Fight A');
        expect(result).toContain('Fight B');
    });

    it('compares a specific player across fights by account', () => {
        const result = executeToolCall('compare_fights', { metric: 'deaths', player_name: 'alpha' }, logs, getDetails, computedStats);
        // Fight A: alpha has 1 death; Fight B: alpha has 0 deaths
        expect(result).toContain('Fight A');
        expect(result).toContain('Fight B');
    });
});

describe('performance_analysis', () => {
    it('returns a non-empty coaching report string containing key sections', () => {
        const result = executeToolCall('performance_analysis', {}, logs, getDetails, computedStats);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        const hasExpectedSection = result.includes('OFFENSIVE') || result.includes('BOON') || result.includes('RECOMMENDATIONS');
        expect(hasExpectedSection).toBe(true);
    });

    it('includes K/D information in the offensive section', () => {
        const result = executeToolCall('performance_analysis', {}, logs, getDetails, computedStats);
        expect(result).toContain('OFFENSIVE');
        expect(result).toContain('K/D');
    });

    it('works for a specific fight index', () => {
        const result = executeToolCall('performance_analysis', { fight_index: 0 }, logs, getDetails, computedStats);
        expect(typeof result).toBe('string');
        expect(result).toContain('Fight 1');
    });
});

describe('executeToolCall', () => {
    it('returns error for unknown tool', () => {
        const result = executeToolCall('unknown_tool', {}, logs, getDetails, computedStats);
        expect(result).toContain('Unknown tool');
    });
});
