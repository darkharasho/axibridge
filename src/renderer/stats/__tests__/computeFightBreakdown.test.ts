import { describe, it, expect } from 'vitest';
import { ingestLogFightBreakdown } from '../computeFightBreakdown';

const mkLog = (wvWMapData?: any) => ({
    filePath: 'f1',
    details: {
        durationMS: 10000,
        players: [{ notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], defenses: [{}], statsAll: [{}] }],
        targets: [
            { enemyPlayer: true, isFake: false, teamID: 707, name: 'Tempest pl-1' },
            { enemyPlayer: true, isFake: false, teamID: 2767, name: 'Tempest pl-2' },
        ],
        ...(wvWMapData ? { wvWMapData } : {}),
    },
});

describe('ingestLogFightBreakdown team colors', () => {
    it('fixed-table fallback colors', () => {
        const fb = ingestLogFightBreakdown(mkLog(), 0);
        const byId = Object.fromEntries(fb.teamBreakdown.map((t: any) => [t.teamId, t.color]));
        expect(byId['707']).toBe('red');
        expect(byId['2767']).toBe('green');
    });
    it('authoritative wvWMapData colors', () => {
        const fb = ingestLogFightBreakdown(mkLog({ redTeamID: 2767, greenTeamID: 707, blueTeamID: 50 }), 0);
        const byId = Object.fromEntries(fb.teamBreakdown.map((t: any) => [t.teamId, t.color]));
        expect(byId['2767']).toBe('red');
        expect(byId['707']).toBe('green');
    });
});
