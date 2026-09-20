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

describe('ingestLogFightBreakdown enemy NPC exclusion', () => {
    // WvW fights near objectives pull guards/lords/sentries into targets[]. EI marks
    // them enemyPlayer: false. They must not inflate enemyCount, because teamBreakdown
    // and enemyClassCounts exclude them -- the columns have to sum to the headline.
    const mkNpcLog = () => ({
        filePath: 'f1',
        details: {
            durationMS: 10000,
            players: [{ notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], defenses: [{}], statsAll: [{}] }],
            targets: [
                { enemyPlayer: true, isFake: false, teamID: 707, name: 'Tempest pl-1', profession: 'Tempest' },
                { enemyPlayer: true, isFake: false, teamID: 707, name: 'Scourge pl-2', profession: 'Scourge' },
                { enemyPlayer: false, isFake: false, teamID: 707, name: 'Veteran Guard' },
                { enemyPlayer: false, isFake: false, teamID: 707, name: 'Keep Lord' },
                { enemyPlayer: true, isFake: true, teamID: 707, name: 'Dummy PvP Agent' },
            ],
        },
    });

    it('excludes NPC targets from enemyCount', () => {
        const fb = ingestLogFightBreakdown(mkNpcLog(), 0);
        expect(fb.enemyCount).toBe(2);
    });

    it('keeps enemyCount equal to the sum of teamBreakdown and enemyClassCounts', () => {
        const fb = ingestLogFightBreakdown(mkNpcLog(), 0);
        const teamSum = fb.teamBreakdown.reduce((sum: number, t: any) => sum + t.count, 0);
        const classSum = Object.values(fb.enemyClassCounts).reduce((sum: number, n: any) => sum + n, 0);
        expect(teamSum).toBe(fb.enemyCount);
        expect(classSum).toBe(fb.enemyCount);
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

/**
 * A log whose details were evicted from the cache before the aggregation
 * stream reached it still produces a breakdown row — it just has to build that
 * row out of the leftovers persisted on `ILogData`. Reported by a user whose
 * 51-fight report showed six rows as "-- • Red BL" with a duration in a
 * different format, sorted to the end and numbered F46-F51 despite being
 * chronologically interleaved.
 */
describe('ingestLogFightBreakdown without details', () => {
    // arcdps names the file when the fight ENDS, in local time.
    const endMs = new Date(2026, 8, 17, 21, 40, 12, 0).getTime();
    const detailsLess = {
        id: '20260917-214012.zevtc',
        filePath: '/logs/20260917-214012.zevtc',
        encounterDuration: '0m 22s 205ms',
    };

    it('recovers the fight start from the filename instead of reporting epoch 0', () => {
        const fb = ingestLogFightBreakdown(detailsLess, 45);
        expect(fb.timestamp).toBe(endMs - 22205);
    });

    it('renders the duration in the same format as every other row', () => {
        const fb = ingestLogFightBreakdown(detailsLess, 45);
        expect(fb.duration).toBe('0:22');
    });

    it('still reports nothing when the filename carries no timestamp', () => {
        const fb = ingestLogFightBreakdown({ id: 'x', filePath: '/logs/fight.zevtc' }, 0);
        expect(fb.timestamp).toBe(0);
    });
});

describe('ingestLogFightBreakdown report link', () => {
    // Since share links shipped, `shouldUploadToDpsReport` skips the dps.report
    // upload as soon as sharing has somewhere to write, so a freshly-parsed log
    // carries a `shareUrl` and NO `permalink`. A row that only looks at
    // `permalink` renders every fight as an unclickable "Pending".
    const mkLinkLog = (link: Record<string, unknown>) => ({
        filePath: 'f1',
        ...link,
        details: {
            durationMS: 10000,
            players: [{ notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], defenses: [{}], statsAll: [{}] }],
            targets: [],
        },
    });

    it('uses the share link when there is no dps.report permalink', () => {
        const fb = ingestLogFightBreakdown(mkLinkLog({ shareUrl: 'https://bridge.axi.link/r/abc123' }), 0);
        expect(fb.permalink).toBe('https://bridge.axi.link/r/abc123');
    });

    it('prefers the share link over a legacy permalink', () => {
        const fb = ingestLogFightBreakdown(mkLinkLog({
            shareUrl: 'https://bridge.axi.link/r/abc123',
            permalink: 'https://dps.report/legacy',
        }), 0);
        expect(fb.permalink).toBe('https://bridge.axi.link/r/abc123');
    });

    it('still falls back to the permalink for logs parsed before sharing', () => {
        const fb = ingestLogFightBreakdown(mkLinkLog({ permalink: 'https://dps.report/legacy' }), 0);
        expect(fb.permalink).toBe('https://dps.report/legacy');
    });
});
