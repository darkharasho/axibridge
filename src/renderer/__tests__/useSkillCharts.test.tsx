import { render, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useEffect } from 'react';
import { useSkillCharts, type UseSkillChartsResult } from '../stats/hooks/useSkillCharts';

const SkillChartsProbe = ({
    onData
}: {
    onData: (data: UseSkillChartsResult) => void;
}) => {
    const data = useSkillCharts({
        skillUsageData: {
            players: [
                {
                    key: 'p1',
                    account: 'p1',
                    displayName: 'Player One',
                    profession: 'Guardian',
                    professionList: ['Guardian'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 3 }
                },
                {
                    key: 'p2',
                    account: 'p2',
                    displayName: 'Player Two',
                    profession: 'Warrior',
                    professionList: ['Warrior'],
                    logs: 1,
                    totalActiveSeconds: 60,
                    skillTotals: { s1: 0 }
                }
            ],
            logRecords: [
                {
                    id: 'log1',
                    label: 'Log 1',
                    timestamp: 1,
                    skillEntries: {
                        s1: { name: 'Skill 1', players: { p1: 3 } }
                    },
                    playerActiveSeconds: { p1: 60, p2: 60 }
                }
            ],
            skillOptions: [{ id: 's1', name: 'Skill 1', total: 3 }]
        },
        selectedSkillId: 's1',
        selectedPlayers: new Set(['p1', 'p2']),
        skillUsageView: 'total'
    });

    useEffect(() => {
        onData(data);
    }, [data, onData]);

    return null;
};

describe('useSkillCharts', () => {
    it('includes selected players with zero values in chart data', async () => {
        let result: UseSkillChartsResult | null = null;
        const assertResult: (value: UseSkillChartsResult | null) => asserts value is UseSkillChartsResult = (value) => {
            if (!value) {
                throw new Error('Expected skill chart data to be available.');
            }
        };

        render(<SkillChartsProbe onData={(data) => { result = data; }} />);

        await waitFor(() => {
            expect((result as UseSkillChartsResult | null)?.skillChartData.length).toBe(1);
        });

        assertResult(result);
        const point = result.skillChartData[0] as any;
        expect(point.p1).toBe(3);
        expect(point.p2).toBe(0);
    });
});
