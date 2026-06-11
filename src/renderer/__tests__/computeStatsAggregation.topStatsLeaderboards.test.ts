import { describe, expect, it } from 'vitest';
import { computeStatsSync as computeStatsAggregation } from '../stats/incrementalAggregation';
import { DEFAULT_ENABLED_TOP_STATS } from '../stats/topStatsCatalog';

type PlayerSpec = {
    account: string;
    breakbar?: number;
    damageTaken?: number;
    blocks?: number;
    evades?: number;
    misses?: number;
    deaths?: number;
    downsTaken?: number;
    killed?: number;
    downed?: number;
};

function makeLog(id: string, players: PlayerSpec[]) {
    return {
        status: 'success',
        filePath: id,
        details: {
            durationMS: 60_000,
            players: players.map((p) => ({
                account: p.account,
                name: p.account,
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [60_000],
                dpsAll: [{ damage: 1000, breakbarDamage: p.breakbar ?? 0 }],
                statsAll: [{}],
                support: [{}],
                statsTargets: [[{ killed: p.killed ?? 0, downed: p.downed ?? 0 }]],
                defenses: [{
                    downCount: p.downsTaken ?? 0,
                    deadCount: p.deaths ?? 0,
                    damageTaken: p.damageTaken ?? 0,
                    blockedCount: p.blocks ?? 0,
                    evadedCount: p.evades ?? 0,
                    missedCount: p.misses ?? 0,
                }],
            })),
            targets: [],
            skillMap: {},
            buffMap: {},
        },
    };
}

const settings = {
    showTopStats: true,
    showMvp: false,
    roundCountStats: false,
    splitPlayersByClass: false,
    topStatsMode: 'total' as const,
    topSkillDamageSource: 'target' as const,
    topSkillsMetric: 'damage' as const,
    minParticipationPercent: 0,
    boonBucketIntervalMs: 5000,
    stackingBoonBucketIntervalMs: 5000,
    interruptMode: 'ccOnly' as const,
    mvpBoonMetric: 'uptime' as const,
    enabledTopStats: DEFAULT_ENABLED_TOP_STATS,
};

const top = (lb: any[]) => lb?.[0]?.account;

describe('computeStatsAggregation — additional top-stats leaderboards', () => {
    const logs = [makeLog('log-1', [
        { account: 'alpha.1', breakbar: 500, damageTaken: 100, blocks: 9, evades: 7, misses: 3, deaths: 0, downsTaken: 0, killed: 5, downed: 8 },
        { account: 'bravo.2', breakbar: 200, damageTaken: 900, blocks: 2, evades: 1, misses: 1, deaths: 3, downsTaken: 4, killed: 1, downed: 2 },
    ])];

    const { stats } = computeStatsAggregation({ logs: logs as any[], statsViewSettings: settings });

    it('ranks higher-is-better leaderboards by the leader', () => {
        expect(top(stats.leaderboards.kills)).toBe('alpha.1');
        expect(top(stats.leaderboards.enemyDowns)).toBe('alpha.1');
        expect(top(stats.leaderboards.breakbar)).toBe('alpha.1');
        expect(top(stats.leaderboards.blocks)).toBe('alpha.1');
        expect(top(stats.leaderboards.evades)).toBe('alpha.1');
        expect(top(stats.leaderboards.misses)).toBe('alpha.1');
    });

    it('ranks lower-is-better leaderboards by the fewest', () => {
        // alpha has 0 deaths/downs and least damage taken → ranks first
        expect(top(stats.leaderboards.deaths)).toBe('alpha.1');
        expect(top(stats.leaderboards.downsTaken)).toBe('alpha.1');
        expect(top(stats.leaderboards.damageTaken)).toBe('alpha.1');
    });

    it('captures the leader values', () => {
        expect(stats.leaderboards.kills[0].value).toBe(5);
        expect(stats.leaderboards.breakbar[0].value).toBe(500);
        expect(stats.leaderboards.damageTaken[0].value).toBe(100);
    });
});
