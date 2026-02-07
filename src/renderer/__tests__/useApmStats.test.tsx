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
});
