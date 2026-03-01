import { describe, expect, it } from 'vitest';
import { buildRollupData } from '../rollup';

describe('buildRollupData', () => {
    it('aggregates across unique raids and collapses duplicate uploads of the same raid', () => {
        const rollup = buildRollupData([
            {
                meta: {
                    id: 'older-copy',
                    dateStart: '2026-02-01T00:00:00Z',
                    dateEnd: '2026-02-01T03:00:00Z',
                    generatedAt: '2026-02-01T03:05:00Z',
                    commanders: ['tag.1234']
                },
                stats: {
                    commanderStats: {
                        rows: [
                            {
                                account: 'tag.1234',
                                characterNames: ['Commander One'],
                                profession: 'Guardian',
                                fights: 3,
                                kills: 12,
                                downs: 18,
                                commanderDeaths: 2,
                                wins: 2,
                                losses: 1
                            }
                        ]
                    },
                    attendanceData: [
                        {
                            account: 'player.1234',
                            characterNames: ['Player One'],
                            classTimes: [{ profession: 'Guardian', timeMs: 30 * 60 * 1000 }],
                            combatTimeMs: 30 * 60 * 1000,
                            squadTimeMs: 45 * 60 * 1000
                        }
                    ]
                }
            },
            {
                meta: {
                    id: 'newer-copy',
                    dateStart: '2026-02-01T00:00:00Z',
                    dateEnd: '2026-02-01T03:00:00Z',
                    generatedAt: '2026-02-01T03:10:00Z',
                    commanders: ['tag.1234']
                },
                stats: {
                    commanderStats: {
                        rows: [
                            {
                                account: 'tag.1234',
                                characterNames: ['Commander One'],
                                profession: 'Guardian',
                                fights: 4,
                                kills: 16,
                                downs: 20,
                                commanderDeaths: 1,
                                wins: 3,
                                losses: 1
                            }
                        ]
                    },
                    attendanceData: [
                        {
                            account: 'player.1234',
                            characterNames: ['Player One'],
                            classTimes: [{ profession: 'Guardian', timeMs: 40 * 60 * 1000 }],
                            combatTimeMs: 40 * 60 * 1000,
                            squadTimeMs: 55 * 60 * 1000
                        }
                    ]
                }
            },
            {
                meta: {
                    id: 'second-raid',
                    dateEnd: '2026-02-02T03:00:00Z',
                    dateStart: '2026-02-02T00:00:00Z',
                    generatedAt: '2026-02-02T03:05:00Z',
                    commanders: ['tag.1234', 'tag.5678']
                },
                stats: {
                    commanderStats: {
                        rows: [
                            {
                                account: 'tag.1234',
                                characterNames: ['Commander One'],
                                profession: 'Firebrand',
                                fights: 2,
                                kills: 8,
                                downs: 10,
                                commanderDeaths: 0,
                                wins: 2,
                                losses: 0
                            }
                        ]
                    },
                    attendanceData: [
                        {
                            account: 'player.1234',
                            characterNames: ['Player One'],
                            classTimes: [{ profession: 'Firebrand', timeMs: 60 * 60 * 1000 }],
                            combatTimeMs: 60 * 60 * 1000,
                            squadTimeMs: 90 * 60 * 1000
                        },
                        {
                            account: 'player.9999',
                            characterNames: ['Player Two'],
                            classTimes: [{ profession: 'Mesmer', timeMs: 20 * 60 * 1000 }],
                            combatTimeMs: 20 * 60 * 1000,
                            squadTimeMs: 25 * 60 * 1000
                        }
                    ]
                }
            },
            {
                meta: {
                    id: 'third-raid',
                    dateEnd: '2026-02-03T03:00:00Z',
                    dateStart: '2026-02-03T00:00:00Z',
                    generatedAt: '2026-02-03T03:05:00Z',
                    commanders: ['tag.5678']
                },
                stats: {}
            }
        ]);

        expect(rollup.sourceReports).toBe(4);
        expect(rollup.uniqueRaids).toBe(2);
        expect(rollup.duplicateReportsCollapsed).toBe(1);
        expect(rollup.raidsSkippedMissingRequiredData).toBe(1);
        expect(rollup.reportsWithCommanderDetails).toBe(2);
        expect(rollup.reportsMissingCommanderDetails).toBe(1);
        expect(rollup.reportsWithAttendanceDetails).toBe(2);
        expect(rollup.reportsMissingAttendanceDetails).toBe(1);

        expect(rollup.commanderRows).toHaveLength(1);
        expect(rollup.commanderRows[0]).toMatchObject({
            account: 'tag.1234',
            runs: 2,
            fightsLed: 6,
            kills: 24,
            commanderDeaths: 1
        });
        expect(rollup.commanderRows[0].kdr).toBe(24);

        expect(rollup.playerRows).toHaveLength(2);
        expect(rollup.playerRows[0]).toMatchObject({
            account: 'player.1234',
            runs: 2,
            profession: 'Firebrand',
            combatTimeMs: 100 * 60 * 1000,
            squadTimeMs: 145 * 60 * 1000
        });
        expect(rollup.playerRows[0].lastSeenTs).toBe(new Date('2026-02-02T03:00:00Z').getTime());
    });

    it('counts attendance once when the same raid is uploaded multiple times', () => {
        const rollup = buildRollupData([
            {
                meta: {
                    id: 'dup-a',
                    title: 'Commander A',
                    dateStart: '2026-03-01T00:00:00Z',
                    dateEnd: '2026-03-01T01:00:00Z',
                    generatedAt: '2026-03-01T01:01:00Z',
                    commanders: ['cmdr.1234']
                },
                stats: {
                    commanderStats: {
                        rows: [
                            {
                                account: 'cmdr.1234',
                                characterNames: ['Commander Name'],
                                profession: 'Guardian',
                                fights: 10,
                                kills: 20,
                                downs: 25,
                                commanderDeaths: 2,
                                wins: 5,
                                losses: 5
                            }
                        ]
                    },
                    attendanceData: [
                        {
                            account: 'player.1111',
                            characterNames: ['Player One'],
                            classTimes: [{ profession: 'Guardian', timeMs: 30 * 60 * 1000 }],
                            combatTimeMs: 30 * 60 * 1000,
                            squadTimeMs: 60 * 60 * 1000
                        }
                    ]
                }
            },
            {
                meta: {
                    id: 'dup-b',
                    title: 'Commander A',
                    dateStart: '2026-03-01T00:00:00Z',
                    dateEnd: '2026-03-01T01:00:00Z',
                    generatedAt: '2026-03-01T01:02:00Z',
                    commanders: ['cmdr.1234']
                },
                stats: {
                    commanderStats: {
                        rows: [
                            {
                                account: 'cmdr.1234',
                                characterNames: ['Commander Name'],
                                profession: 'Guardian',
                                fights: 11,
                                kills: 21,
                                downs: 26,
                                commanderDeaths: 1,
                                wins: 6,
                                losses: 5
                            }
                        ]
                    },
                    attendanceData: [
                        {
                            account: 'player.1111',
                            characterNames: ['Player One'],
                            classTimes: [{ profession: 'Guardian', timeMs: 31 * 60 * 1000 }],
                            combatTimeMs: 31 * 60 * 1000,
                            squadTimeMs: 61 * 60 * 1000
                        }
                    ]
                }
            }
        ]);

        expect(rollup.uniqueRaids).toBe(1);
        expect(rollup.duplicateReportsCollapsed).toBe(1);
        expect(rollup.commanderRows).toHaveLength(1);
        expect(rollup.playerRows).toHaveLength(1);
        expect(rollup.commanderRows[0]).toMatchObject({ runs: 1, fightsLed: 11, commanderDeaths: 1 });
        expect(rollup.playerRows[0]).toMatchObject({ runs: 1, combatTimeMs: 31 * 60 * 1000, squadTimeMs: 61 * 60 * 1000 });
    });

    it('excludes legacy reports that do not include modern attendance data', () => {
        const rollup = buildRollupData([
            {
                meta: {
                    id: 'legacy-1',
                    title: 'Legacy Commander',
                    dateStart: '2026-01-01T00:00:00Z',
                    dateEnd: '2026-01-01T01:00:00Z',
                    generatedAt: '2026-01-01T01:05:00Z',
                    commanders: ['tag.1000']
                }
            }
        ]);

        expect(rollup.reportsWithAttendanceDetails).toBe(0);
        expect(rollup.reportsMissingAttendanceDetails).toBe(1);
        expect(rollup.uniqueRaids).toBe(0);
        expect(rollup.raidsSkippedMissingRequiredData).toBe(1);
        expect(rollup.playerRows).toHaveLength(0);
        expect(rollup.commanderRows).toHaveLength(0);
    });
});
