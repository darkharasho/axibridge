import { describe, expect, it } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

/**
 * Battle Standard Tracking counts connected hits of skill 14419 out of
 * `targetDamageDist`. Elite Insights puts `connectedHits` on every damage-dist
 * entry; axilog's `targetDamageDist` entries carry only `hits` (the
 * miss/block/evade/invuln flags live on `totalDamageDist` alone), so reading
 * `connectedHits` unconditionally rendered a hard 0 for every player.
 */

const makePlayer = (targetDamageDist: any) => ({
    account: 'TestPlayer.1234',
    name: 'TestCharacter',
    profession: 'Berserker',
    notInSquad: false,
    activeTimes: [60_000],
    dpsAll: [{ damage: 100_000, dps: 1_667 }],
    statsAll: [{ connectedDamageCount: 100 }],
    support: [{ resurrects: 0 }],
    defenses: [{ downCount: 0, deadCount: 0 }],
    statsTargets: [[{ connectedDamageCount: 100, downed: 0, killed: 0 }]],
    damage1S: [[]],
    targetDamage1S: [[[]]],
    targetDamageDist,
    totalDamageDist: [[]],
});

const aggregate = (targetDamageDist: any) => {
    const { playerStats } = computePlayerAggregation({
        validLogs: [{
            status: 'success',
            filePath: 'test-log',
            details: {
                durationMS: 60_000,
                fightName: 'Test Fight',
                success: true,
                players: [makePlayer(targetDamageDist)],
                targets: [],
                skillMap: { s14419: { name: 'Battle Standard', icon: '' } },
                buffMap: {},
            },
        }] as any,
        method: 'count' as const,
        skillDamageSource: 'target',
        splitPlayersByClass: false,
    });
    const ps = playerStats.get('TestPlayer.1234');
    expect(ps).toBeTruthy();
    return ps!;
};

describe('battleStandardHits', () => {
    it('counts connectedHits when Elite Insights reports them', () => {
        const ps = aggregate([[[{ id: 14419, hits: 5, connectedHits: 4 }, { id: 1234, hits: 9, connectedHits: 9 }]]]);
        expect(ps.offenseTotals.battleStandardHits).toBe(4);
    });

    it('falls back to hits on axilog entries, which omit connectedHits', () => {
        // axilog emits one entry per landed hit, each with `hits: 1`.
        const ps = aggregate([
            [[{ id: 14419, hits: 1, crit: 0 }, { id: 14419, hits: 1, crit: 1 }]],
            [[{ id: 14419, hits: 1, crit: 1 }, { id: 999, hits: 7 }]],
        ]);
        expect(ps.offenseTotals.battleStandardHits).toBe(3);
    });

    it('keeps an Elite Insights zero at zero rather than reading hits', () => {
        // 3 swings, all missed/blocked: connectedHits is a real 0.
        const ps = aggregate([[[{ id: 14419, hits: 3, connectedHits: 0 }]]]);
        expect(ps.offenseTotals.battleStandardHits ?? 0).toBe(0);
    });
});
