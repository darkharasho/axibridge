import { describe, it, expect } from 'vitest';
import { computeOnTagReview, ON_TAG_RANGE, RUN_BACK_RANGE } from '../computeOnTagReview';

// pollingRate=150, inchToPixel=0.02 → pixel distance × 50 = game units.
// 12px=600u (On-Tag boundary), 100px=5000u (Run-Back boundary), 200px=10000u.
const makeLog = (overrides: any = {}) => ({
    log: {
        filePath: overrides.filePath ?? 'fight-1',
        encounterName: overrides.encounterName ?? 'Skirmish',
        details: {
            fightName: overrides.fightName ?? 'Skirmish',
            durationMS: overrides.durationMS ?? 120000,
            combatReplayMetaData: {
                pollingRate: overrides.pollingRate ?? 150,
                inchToPixel: overrides.inchToPixel ?? 0.02,
            },
            players: overrides.players ?? [],
            targets: overrides.targets ?? [],
        },
        dashboardSummary: overrides.dashboardSummary ?? { isWin: true },
    }
});

const makePlayer = (opts: {
    account: string;
    profession?: string;
    hasCommanderTag?: boolean;
    notInSquad?: boolean;
    positions?: Array<[number, number]>;
    dead?: Array<[number, number]>;
    down?: Array<[number, number]>;
    start?: number;
    distToCom?: number | string;
}) => ({
    account: opts.account,
    profession: opts.profession ?? 'Guardian',
    hasCommanderTag: opts.hasCommanderTag ?? false,
    notInSquad: opts.notInSquad ?? false,
    combatReplayData: {
        positions: opts.positions ?? [],
        dead: opts.dead ?? [],
        down: opts.down ?? [],
        start: opts.start ?? 0,
    },
    statsAll: [{ distToCom: opts.distToCom ?? 100 }],
    defenses: [{ damageTaken: 50, downCount: 0, deadCount: 0 }],
});

const stationaryCommander = (positions = 3) => makePlayer({
    account: 'Cmdr.5678',
    hasCommanderTag: true,
    positions: Array.from({ length: positions }, () => [0, 0] as [number, number]),
});

const findRow = (result: any, account: string) =>
    result.rows.find((r: any) => r.account === account);

describe('computeOnTagReview', () => {
    it('exports the Drevarr thresholds', () => {
        expect(ON_TAG_RANGE).toBe(600);
        expect(RUN_BACK_RANGE).toBe(5000);
    });

    it('returns empty result for empty input', () => {
        expect(computeOnTagReview([])).toEqual({ rows: [], usableFightCount: 0 });
    });

    it('produces no rows when no fight has a commander with positions', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    makePlayer({ account: 'Player.1234', positions: [[0, 0], [10, 10]], down: [[150, 150]], dead: [[150, 300]] }),
                ],
            }),
        ]);
        expect(result.rows).toEqual([]);
        expect(result.usableFightCount).toBe(0);
    });

    it('classifies a death at exactly 600 units as On-Tag', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[12, 0], [12, 0], [12, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.onTag).toBe(1);
        expect(row.offTag).toBe(0);
        expect(row.runBack).toBe(0);
        expect(row.total).toBe(1);
        expect(row.offTagRanges).toEqual([]);
        expect(result.usableFightCount).toBe(1);
    });

    it('classifies a death at exactly 5000 units as Off-Tag and records the range', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[100, 0], [100, 0], [100, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.onTag).toBe(0);
        expect(row.offTag).toBe(1);
        expect(row.runBack).toBe(0);
        expect(row.total).toBe(1);
        expect(row.offTagRanges).toEqual([5000]);
    });

    it('classifies a death beyond 5000 units as Run-Back without recording a range', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[200, 0], [200, 0], [200, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.onTag).toBe(0);
        expect(row.offTag).toBe(0);
        expect(row.runBack).toBe(1);
        expect(row.total).toBe(1);
        expect(row.offTagRanges).toEqual([]);
    });

    it('counts After-Tag as an overlay when the down starts after the tag first died', () => {
        const commander = makePlayer({
            account: 'Cmdr.5678',
            hasCommanderTag: true,
            positions: [[0, 0], [0, 0], [0, 0], [0, 0]],
            down: [[100, 100]],
            dead: [[100, 5000]],
        });
        const result = computeOnTagReview([
            makeLog({
                players: [
                    commander,
                    makePlayer({
                        account: 'Late.1234',
                        positions: [[6, 0], [6, 0], [6, 0], [6, 0]],
                        down: [[300, 300]],
                        dead: [[300, 600]],
                    }),
                    makePlayer({
                        account: 'Early.1234',
                        positions: [[6, 0], [6, 0], [6, 0], [6, 0]],
                        down: [[50, 50]],
                        dead: [[50, 600]],
                    }),
                ],
            }),
        ]);
        const late = findRow(result, 'Late.1234');
        expect(late.afterTag).toBe(1);
        expect(late.onTag).toBe(1); // still distance-classified
        expect(late.total).toBe(1); // Total = onTag + offTag + runBack
        const early = findRow(result, 'Early.1234');
        expect(early.afterTag).toBe(0);
        expect(early.onTag).toBe(1);
    });

    it('does not count After-Tag when the commander never died', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(4),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[6, 0], [6, 0], [6, 0], [6, 0]],
                        down: [[300, 300]],
                        dead: [[300, 600]],
                    }),
                ],
            }),
        ]);
        expect(findRow(result, 'Player.1234').afterTag).toBe(0);
    });

    it('excludes rallied downs but keeps the player as a zero-death row', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[24, 0], [24, 0], [24, 0]],
                        down: [[150, 0]], // rallied: no linked death
                        dead: [],
                    }),
                ],
            }),
        ]);
        const row = findRow(result, 'Player.1234');
        expect(row.total).toBe(0);
        expect(row.onTag).toBe(0);
        expect(row.avgDist).toBe(1200);
        expect(row.fightCount).toBe(1);
    });

    it('ignores downs that start before the fight', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[24, 0], [24, 0], [24, 0]],
                        down: [[-50, 100]],
                        dead: [[100, 300]],
                    }),
                ],
            }),
        ]);
        expect(findRow(result, 'Player.1234').total).toBe(0);
    });

    it('counts the commander\'s own death as On-Tag at distance 0', () => {
        const commander = makePlayer({
            account: 'Cmdr.5678',
            hasCommanderTag: true,
            positions: [[300, 0], [300, 0], [300, 0]],
            down: [[150, 150]],
            dead: [[150, 300]],
        });
        const result = computeOnTagReview([
            makeLog({ players: [commander] }),
        ]);
        const row = findRow(result, 'Cmdr.5678');
        expect(row.isCommander).toBe(true);
        expect(row.onTag).toBe(1);
        expect(row.total).toBe(1);
        expect(row.avgDist).toBe(0);
    });

    it('truncates Avg Dist samples at the player\'s first death', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[24, 0], [100, 0], [100, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        // death poll = 1 → samples = poll 0 only → 24px = 1200u (not (1200+5000+5000)/3)
        expect(findRow(result, 'Player.1234').avgDist).toBe(1200);
    });

    it('truncates Avg Dist samples at the tag\'s death even if the player survived', () => {
        const commander = makePlayer({
            account: 'Cmdr.5678',
            hasCommanderTag: true,
            positions: [[0, 0], [0, 0], [0, 0]],
            down: [[150, 150]],
            dead: [[150, 5000]],
        });
        const result = computeOnTagReview([
            makeLog({
                players: [
                    commander,
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[24, 0], [200, 0], [200, 0]],
                        dead: [],
                        down: [],
                    }),
                ],
            }),
        ]);
        // tag death poll = 1 → samples = poll 0 only → 1200u
        expect(findRow(result, 'Player.1234').avgDist).toBe(1200);
    });

    it('applies the player start offset to both death position and Avg Dist', () => {
        const commander = makePlayer({
            account: 'Cmdr.5678',
            hasCommanderTag: true,
            positions: [[0, 0], [0, 0], [0, 0], [0, 0]],
        });
        const result = computeOnTagReview([
            makeLog({
                players: [
                    commander,
                    makePlayer({
                        account: 'Late.9999',
                        start: 150, // offset = 1 poll
                        positions: [[40, 0], [40, 0]],
                        down: [[300, 300]],
                        dead: [[300, 600]],
                    }),
                ],
            }),
        ]);
        const row = findRow(result, 'Late.9999');
        expect(row.offTag).toBe(1);
        expect(row.offTagRanges).toEqual([2000]);
        expect(row.avgDist).toBe(2000);
    });

    it('falls back to distToCom for Avg Dist when the player has no positions', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({ account: 'NoReplay.1111', positions: [], distToCom: 800.4 }),
                ],
            }),
        ]);
        expect(findRow(result, 'NoReplay.1111').avgDist).toBe(800);
    });

    it('ignores distToCom sentinels ("Infinity" and negative values)', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({ account: 'Inf.1111', positions: [], distToCom: 'Infinity' }),
                    makePlayer({ account: 'Neg.2222', positions: [], distToCom: -1 }),
                ],
            }),
        ]);
        expect(findRow(result, 'Inf.1111')).toBeUndefined();
        expect(findRow(result, 'Neg.2222')).toBeUndefined();
    });

    it('excludes non-squad players', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({ account: 'Enemy.3333', notInSquad: true, positions: [[12, 0]], down: [[150, 150]], dead: [[150, 300]] }),
                ],
            }),
        ]);
        expect(findRow(result, 'Enemy.3333')).toBeUndefined();
    });

    it('aggregates counts, ranges, fights, and Avg Dist across fights by account', () => {
        const fight = (range: number, filePath: string) => makeLog({
            filePath,
            players: [
                stationaryCommander(),
                makePlayer({
                    account: 'Player.1234',
                    profession: filePath === 'f1' ? 'Guardian' : 'Firebrand',
                    positions: [[range / 50, 0], [range / 50, 0], [range / 50, 0]],
                    down: [[150, 150]],
                    dead: [[150, 300]],
                }),
            ],
        });
        const result = computeOnTagReview([fight(2000, 'f1'), fight(1000, 'f2')]);
        const row = findRow(result, 'Player.1234');
        expect(row.fightCount).toBe(2);
        expect(row.offTag).toBe(2);
        expect(row.total).toBe(2);
        expect(row.offTagRanges).toEqual([2000, 1000]); // sorted desc
        expect(row.avgDist).toBe(1500); // mean of per-fight means (2000, 1000)
        expect(row.profession).toBe('Firebrand');
        expect(row.professionList).toEqual(['Guardian', 'Firebrand']);
        expect(result.usableFightCount).toBe(2);
    });

    it('sorts rows by total deaths descending by default', () => {
        const result = computeOnTagReview([
            makeLog({
                players: [
                    stationaryCommander(),
                    makePlayer({ account: 'Zero.1111', positions: [[12, 0], [12, 0], [12, 0]] }),
                    makePlayer({
                        account: 'Two.2222',
                        positions: [[12, 0], [12, 0], [12, 0], [12, 0], [12, 0]],
                        down: [[150, 150], [450, 450]],
                        dead: [[150, 300], [450, 600]],
                    }),
                    makePlayer({
                        account: 'One.3333',
                        positions: [[12, 0], [12, 0], [12, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        expect(result.rows.map((r: any) => r.account)).toEqual(['Two.2222', 'One.3333', 'Cmdr.5678', 'Zero.1111']);
    });
});
