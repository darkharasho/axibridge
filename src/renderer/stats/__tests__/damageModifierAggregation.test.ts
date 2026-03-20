import { describe, expect, it } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

const makePlayer = (overrides: any = {}) => ({
    account: 'TestPlayer.1234',
    name: 'TestCharacter',
    profession: 'Guardian',
    notInSquad: false,
    activeTimes: [60000],
    dpsAll: [{ damage: 0, dps: 0 }],
    statsAll: [{ connectedDamageCount: 0 }],
    support: [{ resurrects: 0 }],
    defenses: [{ downCount: 0, deadCount: 0 }],
    damage1S: [[]],
    targetDamage1S: [[[]]],
    targetDamageDist: [[[]]],
    totalDamageDist: [[]],
    ...overrides,
});

const makeLog = (overrides: any = {}) => ({
    status: 'success',
    filePath: 'test-log',
    details: {
        durationMS: 60000,
        fightName: 'Test Fight',
        success: true,
        players: [],
        targets: [],
        skillMap: {},
        buffMap: {},
        ...overrides,
    },
});

const defaultArgs = {
    method: 'count' as const,
    skillDamageSource: 'target',
    splitPlayersByClass: false,
};

describe('computePlayerAggregation (damage modifier aggregation)', () => {
    it('aggregates outgoing damage modifiers across two fights', () => {
        const player1 = makePlayer({
            damageModifiers: [
                {
                    id: 44,
                    damageModifiers: [
                        { damageGain: 120, hitCount: 3, totalHitCount: 10, totalDamage: 5000 },
                    ],
                },
            ],
        });

        const player2 = makePlayer({
            damageModifiers: [
                {
                    id: 44,
                    damageModifiers: [
                        { damageGain: 80, hitCount: 2, totalHitCount: 8, totalDamage: 3000 },
                    ],
                },
            ],
        });

        const log1 = makeLog({ players: [player1] });
        const log2 = makeLog({ filePath: 'test-log-2', players: [player2] });

        const { playerStats } = computePlayerAggregation({
            validLogs: [log1, log2],
            ...defaultArgs,
        });

        const ps = playerStats.get('TestPlayer.1234');
        expect(ps).toBeTruthy();
        const mod = ps!.damageModTotals['d44'];
        expect(mod).toBeTruthy();
        expect(mod.damageGain).toBe(200);
        expect(mod.hitCount).toBe(5);
        expect(mod.totalHitCount).toBe(18);
        expect(mod.totalDamage).toBe(8000);
    });

    it('aggregates incoming damage modifiers with negative damageGain values', () => {
        const player1 = makePlayer({
            incomingDamageModifiers: [
                {
                    id: -58,
                    damageModifiers: [
                        { damageGain: -150, hitCount: 4, totalHitCount: 12, totalDamage: 7500 },
                    ],
                },
            ],
        });

        const player2 = makePlayer({
            incomingDamageModifiers: [
                {
                    id: -58,
                    damageModifiers: [
                        { damageGain: -90, hitCount: 3, totalHitCount: 9, totalDamage: 4200 },
                    ],
                },
            ],
        });

        const log1 = makeLog({ players: [player1] });
        const log2 = makeLog({ filePath: 'test-log-2', players: [player2] });

        const { playerStats } = computePlayerAggregation({
            validLogs: [log1, log2],
            ...defaultArgs,
        });

        const ps = playerStats.get('TestPlayer.1234');
        expect(ps).toBeTruthy();
        const mod = ps!.incomingDamageModTotals['d-58'];
        expect(mod).toBeTruthy();
        expect(mod.damageGain).toBe(-240);
        expect(mod.hitCount).toBe(7);
        expect(mod.totalHitCount).toBe(21);
        expect(mod.totalDamage).toBe(11700);
    });

    it('produces empty damageModTotals and incomingDamageModTotals when no modifier data is present', () => {
        const player = makePlayer();
        const log = makeLog({ players: [player] });

        const { playerStats } = computePlayerAggregation({
            validLogs: [log],
            ...defaultArgs,
        });

        const ps = playerStats.get('TestPlayer.1234');
        expect(ps).toBeTruthy();
        expect(Object.keys(ps!.damageModTotals)).toHaveLength(0);
        expect(Object.keys(ps!.incomingDamageModTotals)).toHaveLength(0);
    });
});
