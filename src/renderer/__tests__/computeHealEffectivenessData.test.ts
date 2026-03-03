import { describe, expect, it } from 'vitest';
import { computeHealEffectivenessData } from '../stats/computeHealEffectivenessData';

describe('computeHealEffectivenessData', () => {
    it('builds per-fight totals and selected fight skill tables', () => {
        const fights = computeHealEffectivenessData([
            {
                filePath: 'fight-1',
                uploadTime: '2026-02-01T10:00:00Z',
                details: {
                    fightName: 'Detailed WvW - Eternal Battlegrounds',
                    skillMap: {
                        s1001: { name: 'Big Heal', icon: 'heal.png' },
                        s2001: { name: 'Enemy Spike', icon: 'spike.png' }
                    },
                    players: [
                        {
                            account: 'alpha.1234',
                            defenses: [{ damageTaken: 300 }],
                            extHealingStats: {
                                outgoingHealingAllies: [[{ healing: 200, hps: 20 }]],
                                totalHealingDist: [[
                                    { id: 1001, totalHealing: 200, hits: 2 }
                                ]]
                            },
                            extBarrierStats: {
                                outgoingBarrierAllies: [[{ barrier: 50 }]]
                            },
                            totalDamageTaken: [[
                                { id: 2001, totalDamage: 300, hits: 3 }
                            ]]
                        },
                        {
                            account: 'beta.1234',
                            defenses: [{ damageTaken: 100 }],
                            extHealingStats: {
                                outgoingHealingAllies: [[{ healing: 100, hps: 10 }]],
                                totalHealingDist: [[
                                    { id: 1001, totalHealing: 100, hits: 1 }
                                ]]
                            },
                            extBarrierStats: {
                                outgoingBarrierAllies: [[{ barrier: 25 }]]
                            },
                            totalDamageTaken: [[
                                { id: 2001, totalDamage: 100, hits: 1 }
                            ]]
                        },
                        {
                            account: 'offsquad.1234',
                            notInSquad: true,
                            defenses: [{ damageTaken: 9999 }],
                            extHealingStats: {
                                outgoingHealingAllies: [[{ healing: 9999, hps: 999 }]],
                                totalHealingDist: [[
                                    { id: 1001, totalHealing: 9999, hits: 99 }
                                ]]
                            }
                        }
                    ]
                }
            }
        ]);

        expect(fights).toHaveLength(1);
        expect(fights[0]?.incomingDamage).toBe(400);
        expect(fights[0]?.healing).toBe(300);
        expect(fights[0]?.barrier).toBe(75);
        expect(fights[0]?.healingSkills).toHaveLength(1);
        expect(fights[0]?.healingSkills[0]).toMatchObject({
            skillName: 'Big Heal',
            amount: 300,
            hits: 3
        });
        expect(fights[0]?.incomingDamageSkills).toHaveLength(1);
        expect(fights[0]?.incomingDamageSkills[0]).toMatchObject({
            skillName: 'Enemy Spike',
            amount: 400,
            hits: 4
        });
    });
});
