import { describe, expect, it } from 'vitest';
import { buildRollupData, extractRollupSource } from '../rollup';

/** Minimal report payload factory with optional noEgoMode. */
const makeReport = (id: string, noEgoMode?: boolean) => ({
    meta: {
        id,
        dateStart: `2026-01-0${id}T00:00:00Z`,
        dateEnd: `2026-01-0${id}T03:00:00Z`,
        generatedAt: `2026-01-0${id}T03:05:00Z`
    },
    stats: {
        commanderStats: {
            rows: [
                {
                    account: `cmd.${id}`,
                    characterNames: [`Commander ${id}`],
                    profession: 'Guardian',
                    fights: 2,
                    kills: 5,
                    downs: 6,
                    commanderDeaths: 1,
                    alliesDead: 3,
                    wins: 1,
                    losses: 1
                }
            ]
        },
        attendanceData: [
            {
                account: `player.${id}`,
                characterNames: [`Player ${id}`],
                classTimes: [{ profession: 'Guardian', timeMs: 30 * 60 * 1000 }],
                combatTimeMs: 30 * 60 * 1000,
                squadTimeMs: 45 * 60 * 1000
            }
        ],
        ...(noEgoMode !== undefined ? { statsViewSettings: { noEgoMode } } : {})
    }
});

describe('buildRollupData – noEgoMode propagation', () => {
    it('returns noEgoMode=false when no reports declare the setting', () => {
        const rollup = buildRollupData([makeReport('1'), makeReport('2')]);
        expect(rollup.noEgoMode).toBe(false);
    });

    it('returns noEgoMode=false when reports declare noEgoMode=false', () => {
        const rollup = buildRollupData([
            makeReport('1', false),
            makeReport('2', false)
        ]);
        expect(rollup.noEgoMode).toBe(false);
    });

    it('returns noEgoMode=true when all reports have noEgoMode=true', () => {
        const rollup = buildRollupData([
            makeReport('1', true),
            makeReport('2', true)
        ]);
        expect(rollup.noEgoMode).toBe(true);
    });

    it('uses majority vote: true wins when more than half of declaring reports are true', () => {
        const rollup = buildRollupData([
            makeReport('1', true),
            makeReport('2', true),
            makeReport('3', false)
        ]);
        expect(rollup.noEgoMode).toBe(true);
    });

    it('uses majority vote: false wins when half or fewer are true', () => {
        const rollup = buildRollupData([
            makeReport('1', true),
            makeReport('2', false),
            makeReport('3', false)
        ]);
        expect(rollup.noEgoMode).toBe(false);
    });

    it('ignores reports without statsViewSettings for the majority calculation', () => {
        // Report '3' has no statsViewSettings - only reports 1 and 2 vote
        const rollup = buildRollupData([
            makeReport('1', true),
            makeReport('2', false),
            makeReport('3')  // no setting - neutral
        ]);
        // 1 true out of 2 declaring = 50%, not > 50% → false
        expect(rollup.noEgoMode).toBe(false);
    });

    it('ALWAYS computes full aggregates regardless of noEgoMode (no gating on computation)', () => {
        const noEgoRollup = buildRollupData([
            makeReport('1', true),
            makeReport('2', true)
        ]);
        const normalRollup = buildRollupData([
            makeReport('1', false),
            makeReport('2', false)
        ]);

        // Computation is identical regardless of flag; only the flag value differs
        expect(noEgoRollup.commanderRows).toHaveLength(normalRollup.commanderRows.length);
        expect(noEgoRollup.playerRows).toHaveLength(normalRollup.playerRows.length);
        expect(noEgoRollup.uniqueRaids).toBe(normalRollup.uniqueRaids);
        expect(noEgoRollup.sourceReports).toBe(normalRollup.sourceReports);
        // Commander and player data are fully computed in both cases
        expect(noEgoRollup.commanderRows[0]?.kills).toBe(normalRollup.commanderRows[0]?.kills);
        expect(noEgoRollup.playerRows[0]?.combatTimeMs).toBe(normalRollup.playerRows[0]?.combatTimeMs);
    });

    it('returns noEgoMode=false for an empty report list', () => {
        const rollup = buildRollupData([]);
        expect(rollup.noEgoMode).toBe(false);
    });
});

describe('extractRollupSource – preserves statsViewSettings.noEgoMode', () => {
    it('includes noEgoMode=true in the extracted projection', () => {
        const source = extractRollupSource(makeReport('1', true));
        expect(source.stats?.statsViewSettings?.noEgoMode).toBe(true);
    });

    it('includes noEgoMode=false in the extracted projection', () => {
        const source = extractRollupSource(makeReport('1', false));
        expect(source.stats?.statsViewSettings?.noEgoMode).toBe(false);
    });

    it('omits statsViewSettings when the original report has none', () => {
        const source = extractRollupSource(makeReport('1'));
        expect(source.stats?.statsViewSettings).toBeUndefined();
    });

    it('round-trips through extract: buildRollupData from extracted source preserves noEgoMode', () => {
        const report = makeReport('1', true);
        const extracted = extractRollupSource(report);
        const rollup = buildRollupData([extracted]);
        expect(rollup.noEgoMode).toBe(true);
    });
});
