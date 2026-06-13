import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computePlayerAggregation } from '../computePlayerAggregation';
import { buildRollupData } from '../rollup';

const FIXTURES = path.resolve(__dirname, '../../../../test-fixtures/boon-trimmed');
const loadLog = (name: string) => ({
    details: JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'))
});

describe('computePlayerAggregation', () => {
    it('aggregates player stats across two trimmed fixture logs', () => {
        const validLogs = ['20260117-175120.json', '20260125-202439.json'].map(loadLog);
        const result = computePlayerAggregation({
            validLogs,
            method: 'count',
            skillDamageSource: 'target',
            splitPlayersByClass: false
        });
        expect(result.playerStats.size).toBeGreaterThan(0);
        const anyPlayer = [...result.playerStats.values()][0];
        expect(anyPlayer.account.length).toBeGreaterThan(0);
        expect(anyPlayer.logsJoined).toBeGreaterThanOrEqual(1);
        expect(result.wins + result.losses).toBe(2);
        expect(result.totalSquadSizeAccum).toBeGreaterThan(0);
    });
});

describe('buildRollupData', () => {
    it('rolls up attendance + commander rows from report payloads', () => {
        const source = {
            meta: { id: 'r1', dateStart: '2026-01-17T17:51:20Z', dateEnd: '2026-01-17T19:00:00Z', generatedAt: '2026-01-17T19:05:00Z' },
            stats: {
                commanderStats: { rows: [{ account: 'Cmdr.1234', characterNames: ['Cmdr'], profession: 'Firebrand', fights: 7, kills: 40, downs: 55, commanderDeaths: 1, alliesDead: 12, wins: 5, losses: 2 }] },
                attendanceData: [{ account: 'Player.5678', characterNames: ['Alt'], combatTimeMs: 1_200_000, squadTimeMs: 3_600_000, classTimes: [{ profession: 'Scourge', timeMs: 1_200_000 }] }]
            }
        };
        const rollup = buildRollupData([source]);
        expect(rollup.commanderRows[0].account).toBe('Cmdr.1234');
        expect(rollup.commanderRows[0].fightsLed).toBe(7);
        expect(rollup.playerRows[0].account).toBe('Player.5678');
        expect(rollup.playerRows[0].profession).toBe('Scourge');
        expect(rollup.uniqueRaids).toBe(1);
    });
});
