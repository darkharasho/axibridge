import { describe, expect, it } from 'vitest';
import { computeStatsAggregation } from '../stats/computeStatsAggregation';

const makeLog = (overrides: any = {}) => ({
    filePath: overrides.filePath || 'test-log-1',
    uploadTime: '2026-01-01T00:00:00Z',
    details: {
        fightName: 'WvW Test',
        durationMS: 60000,
        encounterDuration: '1m 0s',
        success: true,
        skillMap: {
            s1001: { name: 'Well of Blood', icon: 'well.png' },
            s1002: { name: 'Locust Swarm', icon: 'locust.png' },
            ...(overrides.skillMap || {})
        },
        buffMap: overrides.buffMap || {},
        players: overrides.players || [],
        targets: overrides.targets || [{ id: 1, name: 'Enemy', isFake: false, dpsAll: [{ damage: 0, dps: 0 }], statsAll: [{}], defenses: [{}], totalHealth: 100000, healthPercentBurned: 50, enemyPlayer: true }],
    }
});

const makePlayer = (account: string, profession: string, overrides: any = {}) => ({
    name: account,
    display_name: account,
    character_name: account,
    account,
    profession,
    elite_spec: 0,
    group: 1,
    dpsAll: [{ damage: 1000, dps: 100 }],
    defenses: [{ damageTaken: 500 }],
    support: [{ resurrects: 0 }],
    rotation: [],
    extHealingStats: overrides.extHealingStats || {},
    extBarrierStats: overrides.extBarrierStats || {},
    ...(overrides.extra || {})
});

describe('Healing Breakdown Aggregation', () => {
    it('aggregates healing skills across multiple logs', () => {
        const player = (healEntries: any[]) => makePlayer('healer.1234', 'Necromancer', {
            extHealingStats: {
                outgoingHealingAllies: [[{ healing: 100 }]],
                totalHealingDist: [healEntries]
            }
        });

        const log1 = makeLog({
            filePath: 'log-1',
            players: [player([
                { id: 1001, totalHealing: 5000, hits: 10, min: 200, max: 800 },
                { id: 1002, totalHealing: 3000, hits: 20, min: 50, max: 400 }
            ])]
        });
        const log2 = makeLog({
            filePath: 'log-2',
            players: [player([
                { id: 1001, totalHealing: 7000, hits: 15, min: 100, max: 1200 },
            ])]
        });

        const { stats } = computeStatsAggregation({ logs: [log1, log2] });
        const breakdowns = stats.healingBreakdownPlayers;
        expect(breakdowns).toBeDefined();
        expect(breakdowns.length).toBeGreaterThanOrEqual(1);

        const healerBreakdown = breakdowns.find((b: any) => b.account === 'healer.1234');
        expect(healerBreakdown).toBeDefined();
        expect(healerBreakdown.healingSkills.length).toBe(2);

        const wellSkill = healerBreakdown.healingSkills.find((s: any) => s.name === 'Well of Blood');
        expect(wellSkill).toBeDefined();
        expect(wellSkill.total).toBe(12000);
        expect(wellSkill.hits).toBe(25);
        expect(wellSkill.max).toBe(1200);

        const locustSkill = healerBreakdown.healingSkills.find((s: any) => s.name === 'Locust Swarm');
        expect(locustSkill).toBeDefined();
        expect(locustSkill.total).toBe(3000);
        expect(locustSkill.hits).toBe(20);

        expect(healerBreakdown.healingSkills[0].total).toBeGreaterThanOrEqual(healerBreakdown.healingSkills[1].total);
        expect(healerBreakdown.totalHealing).toBe(15000);
    });

    it('aggregates barrier skills separately', () => {
        const log = makeLog({
            players: [makePlayer('barrier.5678', 'Scourge', {
                extHealingStats: {
                    outgoingHealingAllies: [[{ healing: 100 }]],
                    totalHealingDist: [[
                        { id: 1001, totalHealing: 2000, hits: 5, min: 100, max: 600 }
                    ]]
                },
                extBarrierStats: {
                    outgoingBarrierAllies: [[{ barrier: 500 }]],
                    totalBarrierDist: [[
                        { id: 2001, totalBarrier: 8000, hits: 30, min: 100, max: 500 }
                    ]]
                }
            })]
        });

        const { stats } = computeStatsAggregation({ logs: [log] });
        const bd = stats.healingBreakdownPlayers?.find((b: any) => b.account === 'barrier.5678');
        expect(bd).toBeDefined();
        expect(bd.healingSkills.length).toBe(1);
        expect(bd.healingSkills[0].total).toBe(2000);
        expect(bd.barrierSkills.length).toBe(1);
        expect(bd.barrierSkills[0].total).toBe(8000);
        expect(bd.totalBarrier).toBe(8000);
    });

    it('produces empty arrays when totalHealingDist/totalBarrierDist are missing', () => {
        const log = makeLog({
            players: [makePlayer('noheal.9999', 'Warrior', {
                extHealingStats: {
                    outgoingHealingAllies: [[{ healing: 0 }]]
                },
                extBarrierStats: {
                    outgoingBarrierAllies: [[{ barrier: 0 }]]
                }
            })]
        });

        const { stats } = computeStatsAggregation({ logs: [log] });
        const bd = stats.healingBreakdownPlayers?.find((b: any) => b.account === 'noheal.9999');
        expect(bd).toBeDefined();
        expect(bd.healingSkills).toEqual([]);
        expect(bd.barrierSkills).toEqual([]);
        expect(bd.totalHealing).toBe(0);
        expect(bd.totalBarrier).toBe(0);
    });

    it('resolves skill names from buffMap when skillMap has no match', () => {
        const log = makeLog({
            skillMap: {},
            buffMap: { b3001: { name: 'Regeneration', icon: 'regen.png', stacking: false } },
            players: [makePlayer('buffheal.1111', 'Guardian', {
                extHealingStats: {
                    outgoingHealingAllies: [[{ healing: 100 }]],
                    totalHealingDist: [[
                        { id: 3001, totalHealing: 4000, hits: 10, min: 200, max: 600 }
                    ]]
                }
            })]
        });

        const { stats } = computeStatsAggregation({ logs: [log] });
        const bd = stats.healingBreakdownPlayers?.find((b: any) => b.account === 'buffheal.1111');
        expect(bd).toBeDefined();
        expect(bd.healingSkills.length).toBe(1);
        expect(bd.healingSkills[0].name).toBe('Regeneration');
        expect(bd.healingSkills[0].icon).toBe('regen.png');
    });
});
