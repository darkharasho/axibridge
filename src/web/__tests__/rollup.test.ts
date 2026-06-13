import { describe, expect, it } from 'vitest';
import {
    buildRollupData,
    extractRollupSource,
    parseRollupSourcesFile,
    removeRollupSources,
    ROLLUP_SOURCES_VERSION,
    updateRollupSourcesForPublish
} from '../rollup';

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

        // Per-class report counts, sorted by runs desc then name. The duplicate
        // upload of the first raid counts Guardian once, not twice.
        expect(rollup.commanderRows[0].professionBreakdown).toEqual([
            { profession: 'Firebrand', runs: 1 },
            { profession: 'Guardian', runs: 1 }
        ]);
        expect(rollup.playerRows[0].professionBreakdown).toEqual([
            { profession: 'Firebrand', runs: 1 },
            { profession: 'Guardian', runs: 1 }
        ]);
        expect(rollup.playerRows[1].professionBreakdown).toEqual([
            { profession: 'Mesmer', runs: 1 }
        ]);
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

describe('extractRollupSource', () => {
    const fullPayload = {
        meta: {
            id: 'report-1',
            title: 'Friday Raid',
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
                        alliesDead: 6,
                        wins: 2,
                        losses: 1,
                        // Fields the rollup ignores — must be stripped by extraction.
                        incomingSkillBreakdown: [{ huge: 'data' }],
                        fightsData: [{ more: 'data' }],
                        damageTaken: 123456
                    }
                ]
            },
            attendanceData: [
                {
                    account: 'player.1234',
                    characterNames: ['Player One'],
                    classTimes: [{ profession: 'Guardian', timeMs: 1800000, extra: 'dropped' }],
                    combatTimeMs: 1800000,
                    squadTimeMs: 2700000
                }
            ],
            // Heavy sections that must not survive extraction.
            replayFights: [{ big: 'blob' }],
            boonTimeline: [{ big: 'blob' }]
        }
    };

    it('produces a rollup identical to the full payload', () => {
        const fromFull = buildRollupData([fullPayload]);
        const fromExtracted = buildRollupData([extractRollupSource(fullPayload)]);
        expect(fromExtracted).toEqual(fromFull);
    });

    it('strips heavy sections and unused row fields', () => {
        const source = extractRollupSource(fullPayload);
        expect((source.stats as any).replayFights).toBeUndefined();
        expect((source.stats as any).boonTimeline).toBeUndefined();
        const commanderRow = source.stats!.commanderStats!.rows![0] as any;
        expect(commanderRow.incomingSkillBreakdown).toBeUndefined();
        expect(commanderRow.fightsData).toBeUndefined();
        expect(commanderRow.kills).toBe(12);
        const attendanceRow = source.stats!.attendanceData![0] as any;
        expect(attendanceRow.classTimes[0].extra).toBeUndefined();
        expect(attendanceRow.classTimes[0].timeMs).toBe(1800000);
    });

    it('tolerates payloads with missing stats', () => {
        const source = extractRollupSource({ meta: { id: 'empty' } });
        expect(source.meta?.id).toBe('empty');
        expect(source.stats?.commanderStats?.rows).toEqual([]);
        expect(source.stats?.attendanceData).toEqual([]);
    });
});

describe('parseRollupSourcesFile', () => {
    it('accepts a well-formed file', () => {
        const file = {
            version: ROLLUP_SOURCES_VERSION,
            sources: [extractRollupSource({ meta: { id: 'a' } })],
            rollup: buildRollupData([])
        };
        expect(parseRollupSourcesFile(file)).toEqual(file);
    });

    it('rejects wrong versions, malformed shapes, and non-objects', () => {
        expect(parseRollupSourcesFile(null)).toBeNull();
        expect(parseRollupSourcesFile('nope')).toBeNull();
        expect(parseRollupSourcesFile({ version: 999, sources: [], rollup: buildRollupData([]) })).toBeNull();
        expect(parseRollupSourcesFile({ version: ROLLUP_SOURCES_VERSION, sources: 'bad', rollup: buildRollupData([]) })).toBeNull();
        expect(parseRollupSourcesFile({ version: ROLLUP_SOURCES_VERSION, sources: [] })).toBeNull();
    });
});

describe('updateRollupSourcesForPublish', () => {
    const report = (id: string, generatedAt = '2026-02-01T03:05:00Z') => ({
        meta: { id, dateStart: `${id}-start`, dateEnd: `${id}-end`, generatedAt },
        stats: {
            commanderStats: { rows: [{ account: `${id}.cmd`, fights: 1, kills: 1, alliesDead: 1, characterNames: [], profession: 'Guardian' }] },
            attendanceData: [{ account: `${id}.player`, combatTimeMs: 1000, squadTimeMs: 2000, characterNames: [], classTimes: [] }],
            replayFights: [{ big: 'blob' }]
        }
    });

    it('merges the current report into existing sources and recomputes the rollup', () => {
        const existing = [extractRollupSource(report('old'))];
        const file = updateRollupSourcesForPublish({
            existingSources: existing,
            currentReport: report('new'),
            validIds: ['old', 'new']
        });
        expect(file.version).toBe(ROLLUP_SOURCES_VERSION);
        expect(file.sources.map((s) => s.meta?.id).sort()).toEqual(['new', 'old']);
        expect(file.rollup.sourceReports).toBe(2);
        // The stored source must be the minimal projection, not the full payload.
        expect((file.sources.find((s) => s.meta?.id === 'new')?.stats as any).replayFights).toBeUndefined();
    });

    it('replaces a re-published report rather than duplicating it', () => {
        const existing = [extractRollupSource(report('a', '2026-02-01T03:00:00Z'))];
        const file = updateRollupSourcesForPublish({
            existingSources: existing,
            currentReport: report('a', '2026-02-01T04:00:00Z'),
            validIds: ['a']
        });
        expect(file.sources).toHaveLength(1);
        expect(file.sources[0].meta?.generatedAt).toBe('2026-02-01T04:00:00Z');
    });

    it('backfills missing reports via the loader and skips unreadable ones', () => {
        const loaded: string[] = [];
        const file = updateRollupSourcesForPublish({
            existingSources: [],
            currentReport: report('new'),
            validIds: ['new', 'legacy', 'broken'],
            loadLocalReport: (id) => {
                loaded.push(id);
                return id === 'legacy' ? report('legacy') : null;
            }
        });
        expect(loaded.sort()).toEqual(['broken', 'legacy']);
        expect(file.sources.map((s) => s.meta?.id).sort()).toEqual(['legacy', 'new']);
    });

    it('drops sources for reports no longer in the index', () => {
        const existing = [extractRollupSource(report('kept')), extractRollupSource(report('deleted'))];
        const file = updateRollupSourcesForPublish({
            existingSources: existing,
            currentReport: report('new'),
            validIds: ['kept', 'new']
        });
        expect(file.sources.map((s) => s.meta?.id).sort()).toEqual(['kept', 'new']);
    });
});

describe('removeRollupSources', () => {
    it('removes deleted ids and recomputes the rollup', () => {
        const source = (id: string) => extractRollupSource({
            meta: { id, dateStart: `${id}-s`, dateEnd: `${id}-e`, generatedAt: '2026-02-01T03:05:00Z' },
            stats: {
                commanderStats: { rows: [{ account: `${id}.cmd`, fights: 1, characterNames: [], profession: 'Guardian' }] },
                attendanceData: [{ account: `${id}.p`, combatTimeMs: 1, squadTimeMs: 1, characterNames: [], classTimes: [] }]
            }
        });
        const file = {
            version: ROLLUP_SOURCES_VERSION,
            sources: [source('a'), source('b')],
            rollup: buildRollupData([])
        };
        const updated = removeRollupSources(file, ['a']);
        expect(updated.sources.map((s) => s.meta?.id)).toEqual(['b']);
        expect(updated.rollup.sourceReports).toBe(1);
    });
});
