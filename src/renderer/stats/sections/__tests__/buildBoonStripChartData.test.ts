import { describe, it, expect } from 'vitest';
import { buildBoonStripChartData } from '../BoonStripComparisonSection';

const fights = [
    { id: 'a', mapName: 'EBG', label: 'F1', duration: '01:00', isWin: true, totalOutgoingStrips: 20, totalIncomingStrips: 6, totalBoonsGenerated: 9 },
    { id: 'b', mapName: 'Hills', label: 'F2', duration: '02:00', isWin: false, totalOutgoingStrips: 4, totalIncomingStrips: 10, totalBoonsGenerated: 30 },
];

describe('buildBoonStripChartData', () => {
    it('uses outgoing strips for the up series in strips mode', () => {
        const data = buildBoonStripChartData(fights, 'strips');
        expect(data.map((d) => d.outgoing)).toEqual([20, 4]);
    });

    it('uses boons generated for the up series in generation mode', () => {
        const data = buildBoonStripChartData(fights, 'generation');
        expect(data.map((d) => d.outgoing)).toEqual([9, 30]);
    });

    it('always reports incoming strips as a negative value', () => {
        const data = buildBoonStripChartData(fights, 'generation');
        expect(data.map((d) => d.incoming)).toEqual([-6, -10]);
    });

    it('preserves fight order and labels', () => {
        const data = buildBoonStripChartData(fights, 'strips');
        expect(data.map((d) => d.shortLabel)).toEqual(['F1', 'F2']);
        expect(data[0].fightId).toBe('a');
        expect(data[1].isWin).toBe(false);
    });

    it('handles an empty fightBreakdown', () => {
        expect(buildBoonStripChartData([], 'strips')).toEqual([]);
    });
});
