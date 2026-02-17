import { describe, expect, it } from 'vitest';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';

describe('computeStatsAggregation (fight coverage)', () => {
    it('keeps non-detailed uploads visible in timeline and fight breakdown', () => {
        const logs = [
            {
                status: 'success',
                filePath: 'log-1',
                uploadTime: 1700000000000,
                details: {
                    uploadTime: 1700000000000,
                    durationMS: 60000,
                    success: true,
                    players: [
                        {
                            account: 'acct.1111',
                            name: 'Player One',
                            profession: 'Guardian',
                            notInSquad: false,
                            dpsAll: [{ damage: 1200 }],
                            defenses: [{ downCount: 0, deadCount: 0, damageTaken: 800 }],
                            statsTargets: [[{ downed: 1, killed: 1, damage: 1200, connectedHits: 5 }]],
                            statsAll: [{ saved: 0 }],
                            rotation: []
                        }
                    ],
                    targets: [{ profession: 'Necromancer', isFake: false }],
                    skillMap: {},
                    buffMap: {}
                }
            },
            {
                status: 'success',
                filePath: 'log-2',
                uploadTime: 1700000060000,
                permalink: 'https://dps.report/log-2',
                encounterDuration: '01:30',
                dashboardSummary: {
                    hasPlayers: false,
                    hasTargets: false,
                    squadCount: 22,
                    enemyCount: 31,
                    isWin: null,
                    squadDeaths: 4,
                    enemyDeaths: 6
                }
            },
            {
                status: 'success',
                filePath: 'log-3',
                uploadTime: 1700000120000,
                details: {
                    durationMS: 45000,
                    success: false,
                    mapName: 'Green Alpine Borderlands',
                    players: [],
                    targets: [{ profession: 'Mesmer', isFake: false }],
                    skillMap: {},
                    buffMap: {}
                }
            }
        ];

        const { stats } = computeStatsAggregation({ logs: logs as any[] });

        expect(stats.total).toBe(1);
        expect(stats.fightBreakdown).toHaveLength(3);
        expect(stats.timelineData).toHaveLength(3);

        const placeholderFight = (stats.fightBreakdown || []).find((fight: any) => fight.id === 'log-2');
        expect(placeholderFight).toBeTruthy();
        expect(placeholderFight.duration).toBe('01:30');
        expect(placeholderFight.squadCount).toBe(22);
        expect(placeholderFight.enemyCount).toBe(31);
        expect(placeholderFight.enemyDeaths).toBe(6);
        expect(placeholderFight.isWin).toBeNull();

        const placeholderTimeline = (stats.timelineData || []).find((fight: any) => fight.index === 2);
        expect(placeholderTimeline).toBeTruthy();
        expect(placeholderTimeline.squadCount).toBe(22);
        expect(placeholderTimeline.enemies).toBe(31);
        expect(placeholderTimeline.isWin).toBeNull();
    });
});
