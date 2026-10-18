import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApmStats } from '../stats/hooks/useApmStats';
import type { SkillUsageSummary } from '../stats/statsTypes';

describe('useApmStats', () => {
    it('does not crash when a player is missing skillTotals', () => {
        const data = {
            logRecords: [],
            skillOptions: [],
            players: [
                {
                    key: 'acct1|Guardian',
                    account: 'acct1',
                    displayName: 'acct1',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    logs: 1
                } as unknown as SkillUsageSummary['players'][number]
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        expect(result.current.apmSpecBuckets).toHaveLength(1);
        expect(result.current.apmSpecBuckets[0].playerRows[0].apm).toBe(0);
    });

    it('normalizes non-numeric skill counts instead of producing invalid totals', () => {
        const data = {
            logRecords: [],
            skillOptions: [{ id: 's1', name: 'Skill 1', total: 0 }],
            players: [
                {
                    key: 'acct2|Mesmer',
                    account: 'acct2',
                    displayName: 'acct2',
                    profession: 'Mesmer',
                    professionList: ['Mesmer'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: {
                        s1: '3',
                        s2: 'bad'
                    } as unknown as Record<string, number>
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        expect(result.current.apmSpecBuckets[0].playerRows[0].totalCasts).toBe(3);
        expect(result.current.apmSpecBuckets[0].playerRows[0].apm).toBe(3);
    });

    it('builds per-skill player rows used by the APM skill table', () => {
        const data = {
            logRecords: [],
            skillOptions: [{ id: 's1', name: 'Burst Skill', total: 0 }],
            players: [
                {
                    key: 'acct3|Guardian',
                    account: 'acct3',
                    displayName: 'acct3',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 12 }
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        const skill = result.current.apmSpecBuckets[0].skills[0] as any;
        expect(skill.name).toBe('Burst Skill');
        expect(skill.playerRows.length).toBe(1);
        expect(skill.playerRows[0].count).toBe(12);
        expect(skill.totalApm).toBe(12);
    });

    it('computes apmNoProcs excluding auto + trait proc + gear proc + unconditional proc casts', () => {
        const data = {
            logRecords: [],
            skillOptions: [
                { id: 's1', name: 'Sword Strike', total: 0, autoAttack: true },
                { id: 's2', name: 'Fireball', total: 0, autoAttack: false },
                { id: 's3', name: 'Windborne Notes', total: 0, autoAttack: false, isTraitProc: true },
                { id: 's4', name: 'Sigil of Fire', total: 0, autoAttack: false, isGearProc: true },
                { id: 's5', name: 'Selfless Daring', total: 0, autoAttack: false, isUnconditionalProc: true },
            ],
            players: [
                {
                    key: 'acct|Guardian',
                    account: 'acct',
                    displayName: 'acct',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 10, s2: 20, s3: 5, s4: 3, s5: 2 }
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        const row = result.current.apmSpecBuckets[0].playerRows[0];
        // Total: 10+20+5+3+2 = 40
        expect(row.apm).toBe(40);
        // No auto: 40-10 = 30
        expect(row.apmNoAuto).toBe(30);
        // No procs: 40-10(auto)-5(trait)-3(gear)-2(uncond) = 20 (only Fireball)
        expect(row.apmNoProcs).toBe(20);
    });

    it('does not double-count a skill that is both auto and proc', () => {
        const data = {
            logRecords: [],
            skillOptions: [
                { id: 's1', name: 'Weird Skill', total: 0, autoAttack: true, isTraitProc: true },
                { id: 's2', name: 'Normal Skill', total: 0, autoAttack: false },
            ],
            players: [
                {
                    key: 'acct|Mesmer',
                    account: 'acct',
                    displayName: 'acct',
                    profession: 'Mesmer',
                    professionList: ['Mesmer'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 10, s2: 20 }
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        const row = result.current.apmSpecBuckets[0].playerRows[0];
        expect(row.apm).toBe(30);
        expect(row.apmNoAuto).toBe(20);
        // s1 excluded (auto+proc), only s2 remains = 20
        expect(row.apmNoProcs).toBe(20);
    });
    it('leaves swaps, kits and non-press entries out of APM and its skill list', () => {
        const data = {
            logRecords: [],
            skillOptions: [
                { id: 's1', name: 'Burst Skill', total: 0 },
                { id: 's-2', name: 'Weapon Swap', total: 0 },
                { id: 's5927', name: 'Flamethrower', total: 0 },
                { id: 's-32', name: 'Relic of Fireworks (Buff Loss)', total: 0 },
            ],
            players: [
                {
                    key: 'acct9|Scrapper',
                    account: 'acct9',
                    displayName: 'acct9',
                    profession: 'Scrapper',
                    professionList: ['Scrapper'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 10, 's-2': 6, s5927: 4, 's-32': 2 }
                }
            ]
        } as SkillUsageSummary;

        const { result } = renderHook(() => useApmStats(data));
        const bucket = result.current.apmSpecBuckets[0];
        expect(bucket.playerRows[0].totalCasts).toBe(10);
        expect(bucket.playerRows[0].apm).toBe(10);
        expect(bucket.skills.map((s) => s.id)).toEqual(['s1']);
    });
});
