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

describe('duplicate player entries (same account)', () => {
    const dupPlayer = (profession: string, activeMs: number, over: any = {}) => ({
        account: 'Dup.1234', name: 'Char A', profession, notInSquad: false,
        activeTimes: [activeMs],
        dpsAll: [{ damage: 1000 }],
        defenses: [{ downCount: 0, deadCount: 0, damageTaken: 100, dodgeCount: 0 }],
        statsAll: [{ distToCom: 100, saved: 0 }],
        statsTargets: [[{ downed: 0, killed: 0 }]],
        support: [{}],
        rotation: [],
        ...over
    });
    const dupLog = {
        details: {
            durationMS: 60000,
            success: true,
            players: [
                dupPlayer('Guardian', 45000, { defenses: [{ downCount: 1, deadCount: 1, damageTaken: 100, dodgeCount: 0 }] }),
                dupPlayer('Necromancer', 15000)
            ],
            targets: [],
            skillMap: {},
            buffMap: {}
        }
    };

    it('credits one logsJoined and one stackedLogCount per person per log', () => {
        const result = computePlayerAggregation({
            validLogs: [dupLog], method: 'count', skillDamageSource: 'target', splitPlayersByClass: false
        });
        const row = result.playerStats.get('Dup.1234');
        expect(row).toBeTruthy();
        expect(row!.logsJoined).toBe(1);
        expect(row!.stackedLogCount).toBe(1);
        // stat sums still cover every entry (disjoint time-slices)
        expect(row!.deaths).toBe(1);
        expect(row!.downs).toBe(1);
    });

    it('keeps per-build rows counting their own participation when split by class', () => {
        const result = computePlayerAggregation({
            validLogs: [dupLog], method: 'count', skillDamageSource: 'target', splitPlayersByClass: true
        });
        expect(result.playerStats.get('Dup.1234::Guardian')!.logsJoined).toBe(1);
        expect(result.playerStats.get('Dup.1234::Necromancer')!.logsJoined).toBe(1);
    });
});

describe('incoming skill damage: player-sourced split', () => {
    const takenPlayer = (rows: any[]) => ({
        account: 'Taker.1234', name: 'Taker', profession: 'Guardian', notInSquad: false,
        activeTimes: [60000],
        dpsAll: [{ damage: 0 }],
        defenses: [{ downCount: 0, deadCount: 0, damageTaken: 0, dodgeCount: 0 }],
        statsAll: [{ distToCom: 0, saved: 0 }],
        statsTargets: [[{ downed: 0, killed: 0 }]],
        support: [{}],
        rotation: [],
        totalDamageTaken: [rows]
    });
    const logWith = (rows: any[]) => ({
        details: {
            durationMS: 60000, success: true, targets: [], buffMap: {},
            skillMap: { s700: { name: 'Trebuchet', icon: 'treb.png' }, s701: { name: 'Meteor Shower', icon: 'meteor.png' } },
            players: [takenPlayer(rows)]
        }
    });
    const agg = (logs: any[]) => computePlayerAggregation({
        validLogs: logs, method: 'count', skillDamageSource: 'target', splitPlayersByClass: false
    }).incomingSkillDamageMap;

    it('sums playerTotal as a refinement of totalDamage, not a partition of it', () => {
        const map = agg([logWith([
            { id: 700, totalDamage: 1000, hits: 4, playerTotal: 250 },
            { id: 701, totalDamage: 500, hits: 2, playerTotal: 500 }
        ])]);
        // `damage` is untouched by the split -- a consumer summing it sees the
        // same number it saw before the field existed.
        expect(map[700].damage).toBe(1000);
        expect(map[700].playerDamage).toBe(250);
        expect(map[701].playerDamage).toBe(500);
        // Full coverage: every row that contributed `damage` also carried the
        // split, which is what makes the player figure trustworthy.
        expect(map[700].splitDamage).toBe(1000);
        expect(map[701].splitDamage).toBe(500);
    });

    it('leaves splitDamage short of damage when a log predates the field', () => {
        // Same skill across two logs, only one of which was parsed by an axilog
        // that emits `playerTotal`. Coverage must come out PARTIAL: reporting
        // 250 as "the player total" would understate it by whatever the older
        // log contributed, so the incomplete state has to stay visible.
        const map = agg([
            logWith([{ id: 700, totalDamage: 1000, hits: 4, playerTotal: 250 }]),
            logWith([{ id: 700, totalDamage: 400, hits: 1 }])
        ]);
        expect(map[700].damage).toBe(1400);
        expect(map[700].playerDamage).toBe(250);
        expect(map[700].splitDamage).toBe(1000);
        expect(map[700].splitDamage).toBeLessThan(map[700].damage);
    });

    it('distinguishes a measured zero from an unmeasured one', () => {
        // A skill entirely sourced from siege reports playerDamage 0 WITH full
        // coverage; the absent case above reports 0 with partial coverage. The
        // two must not look alike.
        const measured = agg([logWith([{ id: 700, totalDamage: 900, hits: 3, playerTotal: 0 }])]);
        expect(measured[700].playerDamage).toBe(0);
        expect(measured[700].splitDamage).toBe(900);

        const unmeasured = agg([logWith([{ id: 700, totalDamage: 900, hits: 3 }])]);
        expect(unmeasured[700].playerDamage).toBe(0);
        expect(unmeasured[700].splitDamage).toBe(0);
    });
});
