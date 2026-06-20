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

describe('ingestLogFightBreakdown boon strips & generation', () => {
    const mkBoonLog = () => ({
        filePath: 'f1',
        details: {
            durationMS: 10000,
            players: [
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    support: [{ boonStrips: 12 }],
                    defenses: [{ boonStrips: 5 }],
                    squadBuffVolumes: [
                        { id: 740, buffVolumeData: [{ outgoing: 3 }, { outgoing: 2 }] },
                        { id: 717, buffVolumeData: [{ outgoing: 4 }] },
                    ],
                },
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    support: [{ boonStrips: 8 }],
                    defenses: [{ boonStrips: 1 }],
                    // no squadBuffVolumes → contributes 0 generation
                },
            ],
            targets: [],
        },
    });

    it('sums outgoing strips, incoming strips, and boons generated across the squad', () => {
        const fb = ingestLogFightBreakdown(mkBoonLog(), 0);
        expect(fb.totalOutgoingStrips).toBe(20); // 12 + 8
        expect(fb.totalIncomingStrips).toBe(6);  // 5 + 1
        expect(fb.totalBoonsGenerated).toBe(9);  // (3+2+4) + 0
    });

    it('defaults to 0 when support/defenses/squadBuffVolumes are absent', () => {
        const fb = ingestLogFightBreakdown({
            filePath: 'f2',
            details: { durationMS: 1000, players: [{ notInSquad: false, dpsAll: [{ damage: 0 }] }], targets: [] },
        }, 0);
        expect(fb.totalOutgoingStrips).toBe(0);
        expect(fb.totalIncomingStrips).toBe(0);
        expect(fb.totalBoonsGenerated).toBe(0);
    });
});
