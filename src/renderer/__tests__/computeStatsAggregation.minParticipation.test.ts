import { describe, expect, it } from 'vitest';
import { computeStatsSync as computeStatsAggregation } from '../stats/incrementalAggregation';
import { DEFAULT_ENABLED_TOP_STATS } from '../stats/topStatsCatalog';

/**
 * Builds a minimal valid log entry for a given set of player accounts.
 * Each player has logsJoined tracking driven by participation across calls.
 */
function makeLog(id: string, playerAccounts: string[]) {
    return {
        status: 'success',
        filePath: id,
        details: {
            durationMS: 60_000,
            players: playerAccounts.map(account => ({
                account,
                name: account,
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [60_000],
                dpsAll: [{ damage: 1000 }],
                statsAll: [{}],
                support: [{}],
                defenses: [{ downCount: 0, deadCount: 0, damageTaken: 500 }]
            })),
            targets: [],
            skillMap: {},
            buffMap: {}
        }
    };
}

describe('computeStatsAggregation (min participation threshold)', () => {
    it('threshold=0 (default): all players appear in leaderboards regardless of participation', () => {
        // highParticipant appears in all 10 logs, lowParticipant only in 2
        const highParticipant = 'high.1234';
        const lowParticipant = 'low.5678';

        const logs = [
            // lowParticipant is in the first 2 logs only
            makeLog('log-1', [highParticipant, lowParticipant]),
            makeLog('log-2', [highParticipant, lowParticipant]),
            makeLog('log-3', [highParticipant]),
            makeLog('log-4', [highParticipant]),
            makeLog('log-5', [highParticipant]),
            makeLog('log-6', [highParticipant]),
            makeLog('log-7', [highParticipant]),
            makeLog('log-8', [highParticipant]),
            makeLog('log-9', [highParticipant]),
            makeLog('log-10', [highParticipant])
        ];

        const { stats } = computeStatsAggregation({
            logs: logs as any[],
            statsViewSettings: {
                showTopStats: true,
                showMvp: true,
                roundCountStats: false,
                splitPlayersByClass: false,
                topStatsMode: 'total',
                topSkillDamageSource: 'target',
                topSkillsMetric: 'damage',
                minParticipationPercent: 0,
                boonBucketIntervalMs: 5000,
                stackingBoonBucketIntervalMs: 5000,
                interruptMode: 'ccOnly' as const,
                mvpBoonMetric: 'uptime' as const,
                enabledTopStats: DEFAULT_ENABLED_TOP_STATS,
            }
        });

        // Both players should appear in the participation leaderboard
        const participationLB = stats.leaderboards?.participation || [];
        const highInLB = participationLB.some((entry: any) => entry.account === highParticipant);
        const lowInLB = participationLB.some((entry: any) => entry.account === lowParticipant);

        expect(highInLB).toBe(true);
        expect(lowInLB).toBe(true);
    });

    it('threshold=80 with 10 logs: player with logsJoined=2 (20%) is excluded from leaderboards; player with logsJoined=8 (80%) is included', () => {
        const highParticipant = 'high.1234'; // 8 logs = 80%
        const lowParticipant = 'low.5678';   // 2 logs = 20%

        const logs = [
            makeLog('log-1', [highParticipant, lowParticipant]),
            makeLog('log-2', [highParticipant, lowParticipant]),
            makeLog('log-3', [highParticipant]),
            makeLog('log-4', [highParticipant]),
            makeLog('log-5', [highParticipant]),
            makeLog('log-6', [highParticipant]),
            makeLog('log-7', [highParticipant]),
            makeLog('log-8', [highParticipant]),
            makeLog('log-9', []),
            makeLog('log-10', [])
        ];

        const { stats } = computeStatsAggregation({
            logs: logs as any[],
            statsViewSettings: {
                showTopStats: true,
                showMvp: true,
                roundCountStats: false,
                splitPlayersByClass: false,
                topStatsMode: 'total',
                topSkillDamageSource: 'target',
                topSkillsMetric: 'damage',
                minParticipationPercent: 80,
                boonBucketIntervalMs: 5000,
                stackingBoonBucketIntervalMs: 5000,
                interruptMode: 'ccOnly' as const,
                mvpBoonMetric: 'uptime' as const,
                enabledTopStats: DEFAULT_ENABLED_TOP_STATS,
            }
        });

        // minLogsRequired = Math.ceil(10 * (80/100)) = Math.ceil(8) = 8
        // highParticipant has logsJoined=8 → included
        // lowParticipant has logsJoined=2 → excluded
        const participationLB = stats.leaderboards?.participation || [];
        const highInLB = participationLB.some((entry: any) => entry.account === highParticipant);
        const lowInLB = participationLB.some((entry: any) => entry.account === lowParticipant);

        expect(highInLB).toBe(true);
        expect(lowInLB).toBe(false);

        // Verify the exclusion also applies to damage leaderboard
        const damageLB = stats.leaderboards?.damage || [];
        const highInDamageLB = damageLB.some((entry: any) => entry.account === highParticipant);
        const lowInDamageLB = damageLB.some((entry: any) => entry.account === lowParticipant);

        expect(highInDamageLB).toBe(true);
        expect(lowInDamageLB).toBe(false);
    });

    it('threshold=80: filtered players still appear in offensePlayers and defensePlayers table rows', () => {
        const highParticipant = 'high.1234'; // 8 logs = 80%
        const lowParticipant = 'low.5678';   // 2 logs = 20%

        const logs = [
            makeLog('log-1', [highParticipant, lowParticipant]),
            makeLog('log-2', [highParticipant, lowParticipant]),
            makeLog('log-3', [highParticipant]),
            makeLog('log-4', [highParticipant]),
            makeLog('log-5', [highParticipant]),
            makeLog('log-6', [highParticipant]),
            makeLog('log-7', [highParticipant]),
            makeLog('log-8', [highParticipant]),
            makeLog('log-9', []),
            makeLog('log-10', [])
        ];

        const { stats } = computeStatsAggregation({
            logs: logs as any[],
            statsViewSettings: {
                showTopStats: true,
                showMvp: true,
                roundCountStats: false,
                splitPlayersByClass: false,
                topStatsMode: 'total',
                topSkillDamageSource: 'target',
                topSkillsMetric: 'damage',
                minParticipationPercent: 80,
                boonBucketIntervalMs: 5000,
                stackingBoonBucketIntervalMs: 5000,
                interruptMode: 'ccOnly' as const,
                mvpBoonMetric: 'uptime' as const,
                enabledTopStats: DEFAULT_ENABLED_TOP_STATS,
            }
        });

        // offensePlayers and defensePlayers are derived from playerStats (unfiltered)
        const offensePlayers: any[] = stats.offensePlayers || [];
        const defensePlayers: any[] = stats.defensePlayers || [];

        const highInOffense = offensePlayers.some((p: any) => p.account === highParticipant);
        const lowInOffense = offensePlayers.some((p: any) => p.account === lowParticipant);
        const highInDefense = defensePlayers.some((p: any) => p.account === highParticipant);
        const lowInDefense = defensePlayers.some((p: any) => p.account === lowParticipant);

        // Both players must appear in the dense table rows regardless of threshold
        expect(highInOffense).toBe(true);
        expect(lowInOffense).toBe(true);
        expect(highInDefense).toBe(true);
        expect(lowInDefense).toBe(true);

        // But the low participant must NOT appear in leaderboards
        const participationLB = stats.leaderboards?.participation || [];
        const lowInLB = participationLB.some((entry: any) => entry.account === lowParticipant);
        expect(lowInLB).toBe(false);
    });
});
