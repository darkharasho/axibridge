import { describe, expect, it } from 'vitest';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';

describe('computeStatsAggregation (commander stats)', () => {
    it('aggregates commander-led fights into commanderStats with per-fight trends', () => {
        const commanderAccount = 'tag.1234';
        const logs = [
            {
                status: 'success',
                filePath: 'commander-1',
                details: {
                    timeStartStd: '2026-02-10T01:00:00Z',
                    durationMS: 60_000,
                    buffMap: {
                        b1: { name: 'Might', classification: 'Boon', stacking: false }
                    },
                    skillMap: {},
                    players: [
                        {
                            account: commanderAccount,
                            name: 'Tag One',
                            profession: 'Firebrand',
                            hasCommanderTag: true,
                            notInSquad: false,
                            activeTimes: [60_000],
                            combatReplayData: {
                                positions: [[0, 0], [100, 0], [100, 0], [200, 0], [200, 0]]
                            },
                            defenses: [{ downCount: 1, deadCount: 1, damageTaken: 12_000 }],
                            dpsAll: [{ damage: 40_000 }],
                            statsTargets: [[{ downed: 3, killed: 2 }, { downed: 2, killed: 1 }]],
                            buffUptimes: [{ id: 1, buffData: [{ uptime: 50, presence: 50 }] }],
                            support: [{ boonStrips: 12, condiCleanse: 6 }]
                        },
                        {
                            account: 'ally.1',
                            name: 'Ally One',
                            profession: 'Guardian',
                            notInSquad: false,
                            defenses: [{ downCount: 2, deadCount: 2, damageTaken: 8_000 }],
                            dpsAll: [{ damage: 15_000 }],
                            statsTargets: [[{ downed: 2, killed: 1 }, { downed: 1, killed: 0 }]],
                            support: [{}]
                        }
                    ],
                    targets: [{
                        profession: 'Necromancer',
                        isFake: false,
                        combatReplayData: {
                            down: [[10_000, 0], [22_000, 0]],
                            dead: [[18_000, 0], [28_000, 0]]
                        }
                    }]
                }
            },
            {
                status: 'success',
                filePath: 'commander-2',
                details: {
                    timeStartStd: '2026-02-10T01:05:00Z',
                    durationMS: 120_000,
                    buffMap: {
                        b1: { name: 'Might', classification: 'Boon', stacking: false }
                    },
                    skillMap: {},
                    players: [
                        {
                            account: commanderAccount,
                            name: 'Tag One',
                            profession: 'Firebrand',
                            hasCommanderTag: true,
                            notInSquad: false,
                            activeTimes: [120_000],
                            combatReplayData: {
                                positions: [[0, 0], [0, 0], [50, 0], [100, 0], [100, 0]]
                            },
                            defenses: [{ downCount: 0, deadCount: 0, damageTaken: 6_000 }],
                            dpsAll: [{ damage: 30_000 }],
                            statsTargets: [[{ downed: 1, killed: 1 }, { downed: 1, killed: 0 }]],
                            buffUptimes: [{ id: 1, buffData: [{ uptime: 100, presence: 100 }] }],
                            support: [{ boonStrips: 3, condiCleanse: 4 }]
                        },
                        {
                            account: 'ally.2',
                            name: 'Ally Two',
                            profession: 'Mesmer',
                            notInSquad: false,
                            defenses: [{ downCount: 1, deadCount: 1, damageTaken: 7_000 }],
                            dpsAll: [{ damage: 12_000 }],
                            statsTargets: [[{ downed: 1, killed: 2 }, { downed: 0, killed: 1 }]],
                            support: [{}]
                        }
                    ],
                    targets: [{
                        profession: 'Guardian',
                        isFake: false,
                        combatReplayData: {
                            down: [[8_000, 0], [31_000, 0]],
                            dead: [[21_000, 0], [40_000, 0]]
                        }
                    }]
                }
            }
        ];

        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        const rows = stats.commanderStats?.rows || [];
        expect(rows).toHaveLength(1);

        const row = rows[0];
        expect(row.account).toBe(commanderAccount);
        expect(row.fights).toBe(2);
        expect(row.kills).toBe(8);
        expect(row.downs).toBe(11);
        expect(row.commanderDeaths).toBe(1);
        expect(Number(row.kdr || 0)).toBeCloseTo(8, 5);
        expect(row.avgTimeToFirstEnemyDownMs).toBe(9_000);
        expect(row.avgTimeToFirstEnemyDeathMs).toBe(19_500);
        expect(row.avgDownToKillConversionMs).toBe(10_500);
        expect(Number(row.pushesWithEarlyDownPct || 0)).toBe(100);
        expect(Number(row.stalledPushPct || 0)).toBe(0);
        expect(Number(row.downToKillConversionPct || 0)).toBeCloseTo(72.727, 2);
        expect(Number(row.avgKillsPerFight || 0)).toBeCloseTo(4, 5);
        expect(Number(row.avgDownsPerFight || 0)).toBeCloseTo(5.5, 5);
        expect(row.failedDownEstimate).toBe(3);
        expect(Number(row.avgCommanderDistanceTraveled || 0)).toBeCloseTo(150, 5);
        expect(Number(row.avgCommanderMovementPerMinute || 0)).toBeCloseTo(125, 5);
        expect(Number(row.avgTagStationaryPct || 0)).toBeCloseTo(50, 5);
        expect(Number(row.avgTagMovementBurstCount || 0)).toBeCloseTo(1.5, 5);
        expect(row.alliesDown).toBe(4);
        expect(row.alliesDead).toBe(4);
        expect(Number(row.boonUptimePct || 0)).toBeCloseTo(83.333, 2);
        expect(Number(row.damageTakenPerMinute || 0)).toBeGreaterThan(0);
        expect(Array.isArray(row.fightsData)).toBe(true);
        expect(row.fightsData).toHaveLength(2);
        expect(Number(row.fightsData[0]?.damageTakenPerMinute || 0)).toBeGreaterThan(0);
        expect(Number(row.fightsData[1]?.boonUptimePct || 0)).toBe(100);
        expect(row.fightsData[0]?.timeToFirstEnemyDownMs).toBe(10_000);
        expect(row.fightsData[1]?.timeToFirstEnemyDeathMs).toBe(21_000);
        expect(Number(row.fightsData[0]?.downToKillConversionPct || 0)).toBeCloseTo(50, 5);
        expect(row.fightsData[1]?.failedDownEstimate).toBe(0);
        expect(Number(row.fightsData[0]?.distanceTraveled || 0)).toBeCloseTo(200, 5);
        expect(Number(row.fightsData[1]?.movementPerMinute || 0)).toBeCloseTo(50, 5);
        expect(Number(row.fightsData[0]?.stationaryPct || 0)).toBeCloseTo(50, 5);
        expect(Number(row.fightsData[1]?.movementBurstCount || 0)).toBeCloseTo(1, 5);
    });
});
