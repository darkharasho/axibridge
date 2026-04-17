import { describe, it, expect } from 'vitest';
import { buildMovementData } from '../movementData';

const trackedBuffs = new Set<number>([740, 725]); // Might, Fury — arbitrary sample.

describe('buildMovementData', () => {
    it('returns null when no players have positions', () => {
        const details = { players: [{ name: 'Alice', combatReplayData: { positions: [] } }], targets: [] };
        expect(buildMovementData(details, { trackedBuffIds: trackedBuffs })).toBeNull();
    });

    it('extracts ally members with positions', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                {
                    name: 'Alice', account: 'Alice.0001', profession: 'Guardian', elite_spec: 62,
                    group: 1, hasCommanderTag: true, notInSquad: false, isFake: false,
                    combatReplayData: { positions: [[100, 100], [110, 110]], dead: [], down: [] },
                    healthPercents: [[0, 100], [1000, 90]],
                    buffUptimes: [{ id: 740, states: [[0, 1], [30_000, 0]] }],
                    rotation: [],
                },
            ],
            targets: [],
            skillMap: {},
            buffMap: { b740: { name: 'Might', icon: '/might.png' } },
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        expect(movement).not.toBeNull();
        expect(movement!.members).toHaveLength(1);
        const member = movement!.members[0];
        expect(member.name).toBe('Alice');
        expect(member.isCommander).toBe(true);
        expect(member.isLocal).toBe(false);
        expect(member.isEnemy).toBe(false);
        expect(member.inSquad).toBe(true);
        expect(member.positions).toEqual([[100, 100], [110, 110]]);
        expect(member.boonStates?.[740]).toEqual([[0, 1], [30_000, 0]]);
        expect(movement!.boonIcons[740]?.name).toBe('Might');
    });

    it('marks a member as local when localAccount matches', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'Bob', account: 'Bob.0002', profession: 'Engineer', elite_spec: 43,
                  group: 2, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[50, 50]], dead: [], down: [] } },
            ],
            targets: [],
            skillMap: {},
            buffMap: {},
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs, localAccount: 'Bob.0002' });
        expect(movement!.members[0].isLocal).toBe(true);
    });

    it('extracts enemy players from targets[]', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'Ally', account: 'Ally.0001', profession: 'Warrior', elite_spec: 18,
                  group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[0, 0]], dead: [], down: [] } },
            ],
            targets: [
                { name: 'Dragonhunter pl-1', isFake: false, enemyPlayer: true, profession: 'Guardian',
                  combatReplayData: { positions: [[500, 500], [510, 510]], dead: [], down: [] } },
            ],
            skillMap: {},
            buffMap: {},
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        const enemy = movement!.members.find(m => m.isEnemy);
        expect(enemy).toBeDefined();
        expect(enemy!.name).toBe('Dragonhunter pl-1');
        expect(enemy!.eliteSpec).toBe('Dragonhunter');
    });

    it('deduplicates targets that share a name with an ally', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'DoppelGanger', account: 'DG.0001', profession: 'Mesmer', elite_spec: 40,
                  group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[0, 0]], dead: [], down: [] } },
            ],
            targets: [
                { name: 'DoppelGanger', isFake: false, enemyPlayer: true, profession: 'Mesmer',
                  combatReplayData: { positions: [[100, 100]], dead: [], down: [] } },
            ],
            skillMap: {},
            buffMap: {},
        };
        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        expect(movement!.members.filter(m => m.name === 'DoppelGanger')).toHaveLength(1);
    });
});
