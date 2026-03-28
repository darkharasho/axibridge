import { describe, expect, it } from 'vitest';
import { computeStripSpikesData } from '../stats/computeStripSpikesData';

const makeLog = (filePath: string, players: any[], fightName = 'Eternal Coliseum') => ({
    status: 'success',
    filePath,
    details: {
        durationMS: 60000,
        fightName,
        players,
        targets: [],
        skillMap: {},
        buffMap: {},
    },
});

const makePlayer = (account: string, profession: string, strips: number, stripTime = 0, stripDownContrib = 0) => ({
    account,
    profession,
    notInSquad: false,
    support: [{ boonStrips: strips, boonStripsTime: stripTime, boonStripDownContribution: stripDownContrib }],
    dpsAll: [{ damage: 0 }],
    statsAll: [{ connectedDamageCount: 0 }],
    damage1S: [[0]],
    targetDamage1S: [[[0]]],
    targetDamageDist: [[[]]],
    totalDamageDist: [[]],
});

describe('computeStripSpikesData', () => {
    it('extracts per-fight strip values for each player', () => {
        const logs = [
            makeLog('fight-1', [
                makePlayer('Alice.1234', 'Spellbreaker', 10, 500, 3),
                makePlayer('Bob.5678', 'Scourge', 5, 200, 1),
            ]),
            makeLog('fight-2', [
                makePlayer('Alice.1234', 'Spellbreaker', 15, 800, 5),
                makePlayer('Bob.5678', 'Scourge', 20, 1000, 8),
            ]),
        ];

        const result = computeStripSpikesData(logs);

        expect(result.fights).toHaveLength(2);
        expect(result.fights[0].values['Alice.1234'].strips).toBe(10);
        expect(result.fights[1].values['Bob.5678'].strips).toBe(20);
        expect(result.fights[1].maxStrips).toBe(20);
    });

    it('aggregates player totals and peaks across fights', () => {
        const logs = [
            makeLog('fight-1', [makePlayer('Alice.1234', 'Spellbreaker', 10, 500, 3)]),
            makeLog('fight-2', [makePlayer('Alice.1234', 'Spellbreaker', 15, 800, 5)]),
        ];

        const result = computeStripSpikesData(logs);
        const alice = result.players.find((p) => p.key === 'Alice.1234');

        expect(alice).toBeTruthy();
        expect(alice!.totalStrips).toBe(25);
        expect(alice!.peakStrips).toBe(15);
        expect(alice!.totalStripTime).toBe(1300);
        expect(alice!.peakStripTime).toBe(800);
        expect(alice!.logs).toBe(2);
    });

    it('splits players by class when splitPlayersByClass is true', () => {
        const logs = [
            makeLog('fight-1', [
                makePlayer('Alice.1234', 'Spellbreaker', 10),
                makePlayer('Alice.1234', 'Scourge', 5),
            ]),
        ];

        const result = computeStripSpikesData(logs, true);
        const keys = result.players.map((p) => p.key);

        expect(keys).toContain('Alice.1234::Spellbreaker');
        expect(keys).toContain('Alice.1234::Scourge');
        expect(result.players).toHaveLength(2);
    });

    it('skips notInSquad players', () => {
        const logs = [
            makeLog('fight-1', [
                { ...makePlayer('Alice.1234', 'Spellbreaker', 10), notInSquad: true },
                makePlayer('Bob.5678', 'Scourge', 5),
            ]),
        ];

        const result = computeStripSpikesData(logs);

        expect(result.players).toHaveLength(1);
        expect(result.players[0].key).toBe('Bob.5678');
    });

    it('returns empty arrays for empty logs', () => {
        const result = computeStripSpikesData([]);
        expect(result.fights).toHaveLength(0);
        expect(result.players).toHaveLength(0);
    });

    it('sorts players by total strips descending', () => {
        const logs = [
            makeLog('fight-1', [
                makePlayer('Low.1234', 'Spellbreaker', 2),
                makePlayer('High.5678', 'Scourge', 20),
                makePlayer('Mid.9012', 'Herald', 10),
            ]),
        ];

        const result = computeStripSpikesData(logs);
        const names = result.players.map((p) => p.account);

        expect(names).toEqual(['High.5678', 'Mid.9012', 'Low.1234']);
    });
});
