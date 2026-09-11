import { describe, it, expect } from 'vitest';
import {
    createReviveDetailAccumulator, ingestLogReviveDetail, finalizeReviveDetail,
    extractReviveDetailFrame, mergeReviveDetailFrame,
} from '../computeReviveDetail';
import { computeStatsSync } from '../incrementalAggregation';

const player = (over: any) => ({
    account: over.account, profession: over.profession || 'Guardian',
    combatReplayData: { down: over.down || [], dead: over.dead || [] },
    rotation: over.rotation || [],
});

const handReviveLog = () => ({
    details: {
        skillMap: {},
        players: [
            player({ account: 'Reviver', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000]] }),
        ],
    },
});

describe('computeReviveDetail', () => {
    it('aggregates one log into per-player rows', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), acc);
        const result = finalizeReviveDetail(acc)!;

        expect(result.squad).toMatchObject({ downs: 1, recovered: 1, died: 0, hand: 1 });
        const reviver = result.players.find((p) => p.account === 'Reviver')!;
        expect(reviver).toMatchObject({ attempts: 1, handRevives: 1, successRate: 1, totalRevives: 1 });
    });

    it('sums two logs', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), acc);
        ingestLogReviveDetail(handReviveLog(), acc);
        const result = finalizeReviveDetail(acc)!;
        expect(result.squad.recovered).toBe(2);
        expect(result.players.find((p) => p.account === 'Reviver')!.handRevives).toBe(2);
    });

    it('merging two single-log frames equals ingesting both logs', () => {
        const direct = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), direct);
        ingestLogReviveDetail(handReviveLog(), direct);

        const a = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), a);
        const b = createReviveDetailAccumulator();
        ingestLogReviveDetail(handReviveLog(), b);
        mergeReviveDetailFrame(a, extractReviveDetailFrame(b));

        expect(finalizeReviveDetail(a)).toEqual(finalizeReviveDetail(direct));
    });

    it('counts a log without rotation as uncovered', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            { account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } },
        ] } }, acc);
        const result = finalizeReviveDetail(acc)!;
        expect(result.coverage).toEqual({ logsWithData: 0, logsWithoutData: 1 });
        expect(result.squad.downs).toBe(0);
    });

    it('reports Illusion of Life re-down median time', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000], [8000, 12000]], dead: [[12000, 20000]] }),
        ] } }, acc);
        const result = finalizeReviveDetail(acc)!;
        expect(result.iol).toMatchObject({ revives: 1, reDowned: 1, survived: 0 });
        expect(result.iol!.medianTimeToReDownMs).toBe(3000);
    });

    it('reports Illusion of Life survival when the revived player never goes down again', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            player({ account: 'Downed', down: [[1000, 5000]] }),
        ] } }, acc);
        const result = finalizeReviveDetail(acc)!;
        expect(result.iol).toMatchObject({ revives: 1, reDowned: 0, survived: 1, medianTimeToReDownMs: null });
    });

    it('merges utility byCaster counts across logs and selects the correct top caster', () => {
        // Log A: CasterA revives one downed player once via Battle Standard (14419).
        const logA = {
            details: { skillMap: {}, players: [
                player({ account: 'CasterA', rotation: [{ id: 14419, skills: [{ castTime: 0, duration: 0 }] }] }),
                player({ account: 'DownedZ', down: [[1000, 5000]] }),
            ] },
        };
        // Log B: CasterB's single Battle Standard cast covers two different players'
        // stand-ups, crediting CasterB with two revives from one cast.
        const logB = {
            details: { skillMap: {}, players: [
                player({ account: 'CasterB', rotation: [{ id: 14419, skills: [{ castTime: 0, duration: 0 }] }] }),
                player({ account: 'DownedX', down: [[1000, 5000]] }),
                player({ account: 'DownedY', down: [[2000, 6000]] }),
            ] },
        };

        const accA = createReviveDetailAccumulator();
        ingestLogReviveDetail(logA, accA);
        const frameA = extractReviveDetailFrame(accA);

        const accB = createReviveDetailAccumulator();
        ingestLogReviveDetail(logB, accB);
        const frameB = extractReviveDetailFrame(accB);

        // Neither accA nor accB has ever seen the other's players — merging frameB
        // into a target that already holds frameA exercises the "new player row"
        // branch of mergeReviveDetailFrame, not just "sum into existing row".
        const target = createReviveDetailAccumulator();
        mergeReviveDetailFrame(target, frameA);
        mergeReviveDetailFrame(target, frameB);

        const result = finalizeReviveDetail(target)!;

        const battleStandard = result.utilities.find((u) => u.skillId === 14419)!;
        expect(battleStandard.casts).toBe(2);
        expect(battleStandard.revives).toBe(3);
        expect(battleStandard.revivesPerCast).toBe(1.5);
        expect(battleStandard.topCasterKey).toBe('CasterB|Guardian');

        const casterA = result.players.find((p) => p.account === 'CasterA')!;
        const casterB = result.players.find((p) => p.account === 'CasterB')!;
        expect(casterA.utilityRevives).toBe(1);
        expect(casterB.utilityRevives).toBe(2);

        // The expansion's rows: both casters present, per-caster casts summing
        // to the row's own cast count, ordered by revives.
        expect(battleStandard.casters).toEqual([
            { key: 'CasterB|Guardian', account: 'CasterB', profession: 'Guardian', casts: 1, revives: 2, revivesPerCast: 2 },
            { key: 'CasterA|Guardian', account: 'CasterA', profession: 'Guardian', casts: 1, revives: 1, revivesPerCast: 1 },
        ]);
        expect(battleStandard.casters!.reduce((sum, c) => sum + c.casts, 0)).toBe(battleStandard.casts);
    });

    it('carries the skill icon through ingest, frame merge and finalize', () => {
        const withIcon = {
            details: {
                skillMap: { s14419: { name: 'Battle Standard', icon: 'https://example.test/banner.png' } },
                players: [
                    player({ account: 'CasterA', rotation: [{ id: 14419, skills: [{ castTime: 0, duration: 0 }] }] }),
                    player({ account: 'DownedZ', down: [[1000, 5000]] }),
                ],
            },
        };
        // A second log with no skill map at all must not blank the icon back out.
        const withoutIcon = {
            details: {
                skillMap: {},
                players: [
                    player({ account: 'CasterB', rotation: [{ id: 14419, skills: [{ castTime: 0, duration: 0 }] }] }),
                    player({ account: 'DownedY', down: [[1000, 5000]] }),
                ],
            },
        };

        const accA = createReviveDetailAccumulator();
        ingestLogReviveDetail(withoutIcon, accA);
        const frameA = extractReviveDetailFrame(accA);

        const target = createReviveDetailAccumulator();
        ingestLogReviveDetail(withIcon, target);
        mergeReviveDetailFrame(target, frameA);

        const banner = finalizeReviveDetail(target)!.utilities.find((u) => u.skillId === 14419)!;
        expect(banner.icon).toBe('https://example.test/banner.png');
    });

    it('buckets Illusion of Life re-down times and sums them to the re-down count', () => {
        const acc = createReviveDetailAccumulator();
        // Three re-downs at 3s, 12s and 90s after standing up, plus one survivor.
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            // The re-downs end in death so they are not themselves recoveries.
            player({ account: 'Quick', down: [[1000, 5000], [8000, 9000]], dead: [[9000, 99000]] }),
            player({ account: 'Slower', down: [[1000, 5000], [17000, 18000]], dead: [[18000, 99000]] }),
            player({ account: 'Much later', down: [[1000, 5000], [95000, 96000]], dead: [[96000, 99000]] }),
            player({ account: 'Survivor', down: [[1000, 5000]] }),
        ] } }, acc);

        const iol = finalizeReviveDetail(acc)!.iol!;
        expect(iol).toMatchObject({ revives: 4, reDowned: 3, survived: 1 });
        // Buckets are 0-5s, 5-10s, 10-20s, 20-60s, 60s+.
        expect(iol.timeToReDownBuckets).toEqual([1, 0, 1, 0, 1]);
        expect(iol.timeToReDownBuckets!.reduce((a, b) => a + b, 0)).toBe(iol.reDowned);
    });

    it('counts a death that skipped the downed state after an IoL stand-up as died under IoL, not re-downed', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            // arcdps records a ~0ms down right before the death.
            player({ account: 'Instant', down: [[1000, 5000], [7000, 7005]], dead: [[7005, 99000]] }),
        ] } }, acc);

        const iol = finalizeReviveDetail(acc)!.iol!;
        expect(iol).toMatchObject({ revives: 1, survived: 0, reDowned: 0, diedUnderIol: 1, medianTimeToReDownMs: null });
        // Not a re-down, so not a 2s entry skewing the histogram.
        expect(iol.timeToReDownBuckets).toEqual([0, 0, 0, 0, 0]);
    });

    it('keeps a short down that the player stood up from as a re-down', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            // The blip starts after the 5s IoL cast window, so it is not itself an IoL revive.
            player({ account: 'Blip', down: [[1000, 5000], [10000, 10005]] }),
        ] } }, acc);
        expect(finalizeReviveDetail(acc)!.iol).toMatchObject({ revives: 1, reDowned: 1, diedUnderIol: 0 });
    });

    it('splits IoL revives into three outcomes that sum to the revive count, through frame merge', () => {
        const log = () => ({ details: { skillMap: {}, players: [
            player({ account: 'Mes', profession: 'Chronomancer',
                rotation: [{ id: 10244, skills: [{ castTime: 4000, duration: 0 }] }] }),
            player({ account: 'Instant', down: [[1000, 5000], [7000, 7005]], dead: [[7005, 99000]] }),
            player({ account: 'Slow', down: [[1000, 5000], [18000, 22000]], dead: [[22000, 99000]] }),
            player({ account: 'Survivor', down: [[1000, 5000]] }),
        ] } });

        const direct = createReviveDetailAccumulator();
        ingestLogReviveDetail(log(), direct);
        ingestLogReviveDetail(log(), direct);

        const target = createReviveDetailAccumulator();
        const single = createReviveDetailAccumulator();
        ingestLogReviveDetail(log(), target);
        ingestLogReviveDetail(log(), single);
        mergeReviveDetailFrame(target, extractReviveDetailFrame(single));

        const iol = finalizeReviveDetail(target)!.iol!;
        expect(iol).toMatchObject({ revives: 6, survived: 2, reDowned: 2, diedUnderIol: 2, medianTimeToReDownMs: 13000 });
        expect(iol.survived + iol.reDowned + iol.diedUnderIol!).toBe(iol.revives);
        expect(finalizeReviveDetail(target)).toEqual(finalizeReviveDetail(direct));
    });

    it('extracts a frame after ingesting a single uncovered log without throwing', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, players: [
            { account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } },
        ] } }, acc);

        expect(() => extractReviveDetailFrame(acc)).not.toThrow();
        const frame = extractReviveDetailFrame(acc);
        expect(frame.acc.logsWithData).toBe(0);
        expect(frame.acc.logsWithoutData).toBe(1);

        const target = createReviveDetailAccumulator();
        mergeReviveDetailFrame(target, frame);
        const result = finalizeReviveDetail(target)!;
        expect(result.coverage).toEqual({ logsWithData: 0, logsWithoutData: 1 });
        expect(result.squad.downs).toBe(0);
    });

    it('returns null for an accumulator that saw no logs at all', () => {
        // An empty accumulator has NO measurement. Returning a zero-filled
        // summary would render "Downs 0 · Recovered 0 · Died 0 / Coverage: 0
        // logs", which reads as "nobody was revived" — indistinguishable from a
        // real zero. This is the state a viewer lands in when it merges frames
        // from a sidecar that predates the reviveDetail section.
        expect(finalizeReviveDetail(createReviveDetailAccumulator())).toBeNull();
    });

    it('accumulates per-player active time under the same key as the counts', () => {
        const acc = createReviveDetailAccumulator();
        // activeTimes[0] wins where present; otherwise the fight duration.
        const log = {
            details: {
                skillMap: {}, durationMS: 20000,
                players: [
                    { ...player({ account: 'Reviver', rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }] }), activeTimes: [12000] },
                    player({ account: 'Downed', down: [[1000, 5000]] }),
                ],
            },
        };
        ingestLogReviveDetail(log, acc);
        ingestLogReviveDetail(log, acc);
        const result = finalizeReviveDetail(acc)!;

        const reviver = result.players.find((p) => p.account === 'Reviver')!;
        const downed = result.players.find((p) => p.account === 'Downed')!;
        // Summed over both logs, keyed identically to the counts — 2 attempts
        // over 24s of active time is 5.00/min, not the 120.00/min a 1s
        // denominator floor would have printed.
        expect(reviver.activeMs).toBe(24000);
        expect(reviver.attempts).toBe(2);
        expect(downed.activeMs).toBe(40000);
    });

    it('excludes uncovered logs from the active-time denominator, as it does from the counts', () => {
        const acc = createReviveDetailAccumulator();
        ingestLogReviveDetail({ details: { skillMap: {}, durationMS: 30000, players: [
            { account: 'A', profession: 'Guardian', combatReplayData: { down: [[1, 2]], dead: [] } },
        ] } }, acc);
        expect(finalizeReviveDetail(acc)!.players).toEqual([]);
    });
});

/**
 * A minimal log shaped for `IncrementalAggregator.ingestLog`, not just the
 * bare-bones `{ details: { players } }` shape the accumulator-level tests
 * above use. `computeStatsSync` runs the whole aggregation pipeline (fight
 * breakdown, player aggregation, etc.), which needs `filePath`,
 * `details.durationMS` and EI-shaped player rows in addition to the
 * revive-specific `combatReplayData`/`rotation` fields.
 */
const handReviveAggregatorLog = () => ({
    filePath: 'revive-1.zevtc',
    details: {
        durationMS: 10000,
        fightName: 'Skirmish',
        skillMap: {},
        players: [
            {
                account: 'Reviver.1111', name: 'Reviver', profession: 'Guardian', notInSquad: false,
                dpsAll: [{ damage: 0 }], defenses: [{}], statsAll: [{}],
                combatReplayData: { down: [], dead: [] },
                rotation: [{ id: 1066, skills: [{ castTime: 3000, duration: 3000 }] }],
            },
            {
                account: 'Downed.2222', name: 'Downed', profession: 'Necromancer', notInSquad: false,
                dpsAll: [{ damage: 0 }], defenses: [{}], statsAll: [{}],
                combatReplayData: { down: [[1000, 5000]], dead: [] },
                rotation: [],
            },
        ],
        targets: [],
    },
});

describe('reviveDetail on the aggregator', () => {
    it('carries its own active-time denominator, so it never depends on defensePlayers key conventions', () => {
        // Two ways the two tables' `${account}|${profession}` keys disagree:
        //  - defensePlayers normalizes the legacy ':Account.1234' spelling away,
        //    the revive rows key on the raw account;
        //  - a player who swaps elite spec across logs is ONE aggregated defense
        //    row (last raw profession wins) but SEVERAL revive rows.
        // Borrowing the denominator from defensePlayers therefore missed, and the
        // miss silently floored the divisor at 1 second. The revive rows now carry
        // their own active time, accumulated under their own key.
        const logA: any = handReviveAggregatorLog();
        logA.details.players[0].account = ':Reviver.1111';
        logA.details.players[0].profession = 'Firebrand';
        logA.details.players[0].activeTimes = [180000];
        const logB: any = handReviveAggregatorLog();
        logB.filePath = 'revive-2.zevtc';
        logB.details.players[0].account = ':Reviver.1111';
        logB.details.players[0].profession = 'Willbender';
        logB.details.players[0].activeTimes = [60000];

        const stats: any = computeStatsSync({ logs: [logA, logB] }).stats;

        const defenseRows = stats.defensePlayers.filter((p: any) => String(p.account).includes('Reviver.1111'));
        expect(defenseRows).toHaveLength(1);
        expect(defenseRows[0].account).toBe('Reviver.1111');   // ':' folded away

        const reviveRows = stats.reviveDetail.players.filter((p: any) => String(p.account).includes('Reviver.1111'));
        expect(reviveRows.map((r: any) => r.key).sort()).toEqual([
            ':Reviver.1111|Firebrand', ':Reviver.1111|Willbender',
        ]);
        // Each revive row's own denominator — 1 attempt over 180s and 1 over 60s.
        const byKey = new Map<string, any>(reviveRows.map((r: any) => [r.key, r]));
        expect(byKey.get(':Reviver.1111|Firebrand')!.activeMs).toBe(180000);
        expect(byKey.get(':Reviver.1111|Willbender')!.activeMs).toBe(60000);
    });

    it('exposes reviveDetail on aggregated stats', () => {
        const stats: any = computeStatsSync({ logs: [handReviveAggregatorLog()] }).stats;
        expect(stats.reviveDetail.squad.recovered).toBe(1);
    });

    it('sums reviveDetail across many logs ingested one at a time — the same per-log path the >8-log worker uses', () => {
        const logs = Array.from({ length: 10 }, () => handReviveAggregatorLog());
        const stats: any = computeStatsSync({ logs }).stats;
        expect(stats.reviveDetail.squad.recovered).toBe(10);
        expect(stats.reviveDetail.squad.hand).toBe(10);
        const reviver = stats.reviveDetail.players.find((p: any) => p.account === 'Reviver.1111');
        expect(reviver.handRevives).toBe(10);
    });
});
