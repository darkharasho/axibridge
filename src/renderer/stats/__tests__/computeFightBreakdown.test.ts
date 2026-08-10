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

describe('ingestLogFightBreakdown boon strips & applications', () => {
    const mkBoonLog = () => ({
        filePath: 'f1',
        details: {
            durationMS: 10000,
            players: [
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    support: [{ boonStrips: 12 }],
                    defenses: [{ boonStrips: 5 }],
                    // Precomputed by pruneDetailsForStats from the boonsStates timeline.
                    boonsAppliedCount: 90,
                },
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    support: [{ boonStrips: 8 }],
                    defenses: [{ boonStrips: 1 }],
                    boonsAppliedCount: 60,
                },
            ],
            targets: [],
        },
    });

    it('sums outgoing strips, incoming strips, and boon applications across the squad', () => {
        const fb = ingestLogFightBreakdown(mkBoonLog(), 0);
        expect(fb.totalOutgoingStrips).toBe(20);  // 12 + 8
        expect(fb.totalIncomingStrips).toBe(6);   // 5 + 1
        expect(fb.totalBoonsApplied).toBe(150);   // 90 + 60
    });

    it('defaults to 0 when support/defenses/boonsAppliedCount are absent', () => {
        const fb = ingestLogFightBreakdown({
            filePath: 'f2',
            details: { durationMS: 1000, players: [{ notInSquad: false, dpsAll: [{ damage: 0 }] }], targets: [] },
        }, 0);
        expect(fb.totalOutgoingStrips).toBe(0);
        expect(fb.totalIncomingStrips).toBe(0);
        expect(fb.totalBoonsApplied).toBe(0);
    });
});

describe('ingestLogFightBreakdown barrier generated vs absorbed', () => {
    // One healer barriering two squad members (400 + 300) plus a non-squad ally (500).
    // outgoingBarrier is the all-allies total; outgoingBarrierAllies is squad-only.
    const mkBarrierLog = () => ({
        filePath: 'f1',
        details: {
            durationMS: 10000,
            players: [
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    defenses: [{ damageBarrier: 250 }],
                    extBarrierStats: {
                        outgoingBarrier: [[{ barrier: 1200 }]],
                        outgoingBarrierAllies: [[{ barrier: 400 }], [{ barrier: 300 }]],
                    },
                },
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    defenses: [{ damageBarrier: 150 }],
                    extBarrierStats: {},
                },
            ],
            targets: [],
        },
    });

    it('separates squad-scoped barrier generated from the all-allies total', () => {
        const fb = ingestLogFightBreakdown(mkBarrierLog(), 0);
        expect(fb.squadBarrierGenerated).toBe(700);      // 400 + 300, squad members only
        expect(fb.outgoingBarrierAbsorbed).toBe(1200);   // includes the non-squad ally
        expect(fb.incomingBarrierAbsorbed).toBe(400);    // 250 + 150 damageBarrier
    });

    it('yields unused barrier from the squad-scoped operands, not the all-allies total', () => {
        const fb = ingestLogFightBreakdown(mkBarrierLog(), 0);
        // 700 generated onto squad - 400 actually absorbed = 300 expired unused.
        // Using outgoingBarrierAbsorbed instead would overstate this as 800.
        expect(fb.squadBarrierGenerated - fb.incomingBarrierAbsorbed).toBe(300);
    });

    it('reports 0 squad barrier generated when the healing addon was absent', () => {
        const fb = ingestLogFightBreakdown({
            filePath: 'f3',
            details: { durationMS: 1000, players: [{ notInSquad: false, dpsAll: [{ damage: 0 }], defenses: [{}] }], targets: [] },
        }, 0);
        expect(fb.squadBarrierGenerated).toBe(0);
        expect(fb.incomingBarrierAbsorbed).toBe(0);
    });
});
