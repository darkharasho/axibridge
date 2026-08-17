/**
 * Cohesion geometry, in game units.
 *
 * The distances here are world inches, so the 900u and 1500u literals in
 * `cohesion.ts` mean what they say. Every assertion in this file was
 * unwritable before the native migration: fed replay pixels, `dist > 900` was
 * unsatisfiable on a 523x750 canvas, so `timeSpread900PlusSec` and
 * `stragglersAtBomb` were 0 for every fight regardless of input.
 */
import { describe, it, expect } from 'vitest';
import { computeCohesion } from '../cohesion';
import { buildSquadTracks } from '../shared';
import { computeCommanderFightData } from '../index';
import { buildNativeLog } from '../../../test/nativeLogFixture';
import type { DeathEvent } from '../../commanderTypes';

/** A member parked at one spot for the first 3s of the fight. */
const parked = (id: number, account: string, x: number, y: number, ei?: Record<string, unknown>) => ({
    id, role: 'squad' as const, account, character: account.split('.')[0], startMs: 0,
    world: Array.from({ length: 11 }, () => [x, y] as [number, number]),
    ei,
});

/** As {@link parked}, but this one is carrying the commander tag. */
const tagged = (
    id: number, account: string, x: number, y: number,
    segments?: Array<[number, number]>,
) => ({ ...parked(id, account, x, y), commander: true, commanderSegments: segments });

const cohesionOf = (log: Record<string, any>, deaths: DeathEvent[] = [], seriesLen = 4) => {
    const { tracks, pollMs, tagTrack } = buildSquadTracks(log);
    return computeCohesion({
        squadTracks: tracks, pollMs, seriesLen,
        bombWindows: [{ tSec: 0, durationSec: 3 } as any],
        deathsTimeline: deaths,
        tagTrack,
    });
};

describe('computeCohesion in game units', () => {
    it('measures spread from the squad centroid when nobody is tagged', () => {
        // Two stacked at the origin, one 1500u east → centroid at x=500.
        // Distances are 500, 500, 1000; mean 666.67.
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0), parked(2, 'B.2', 0, 0), parked(3, 'C.3', 1500, 0),
        ]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.avgDistFromTag).toBeCloseTo(666.67, 1);
    });

    it('counts the seconds anyone is beyond 900u of the tag', () => {
        // Centroid at x=1000; the outlier sits 2000u out, the other two 1000u.
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0), parked(2, 'B.2', 0, 0), parked(3, 'C.3', 3000, 0),
        ]);
        expect(cohesionOf(log).cohesion.timeSpread900PlusSec).toBe(4);
    });

    it('counts nobody as spread out when the squad is stacked', () => {
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0), parked(2, 'B.2', 100, 0), parked(3, 'C.3', 200, 0),
        ]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.timeSpread900PlusSec).toBe(0);
        expect(cohesion.stragglersAtBomb).toBe(0);
    });

    it('names the members beyond 1500u during a bomb window as stragglers', () => {
        // Centroid at x=2000: A and B are 2000u out, C is 4000u out. All three
        // clear 1500u, so all three are stragglers — the metric counts distinct
        // members, so this is 3 and not 12 (3 members x 4 seconds).
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0), parked(2, 'B.2', 0, 0), parked(3, 'C.3', 6000, 0),
        ]);
        expect(cohesionOf(log).cohesion.stragglersAtBomb).toBe(3);
    });

    it('fills distFromTag on a death with that member\'s distance at that instant', () => {
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0), parked(2, 'B.2', 0, 0), parked(3, 'C.3', 1500, 0),
        ]);
        const deaths: DeathEvent[] = [
            { tSec: 2, account: 'C.3', profession: 'Guardian', role: 'unknown', distFromTag: 0 },
        ];
        const { cohesion } = cohesionOf(log, deaths);
        // Centroid at x=500, C at x=1500.
        expect(deaths[0].distFromTag).toBeCloseTo(1000, 6);
        expect(cohesion.avgDistAtDeath).toBeCloseTo(1000, 6);
    });

    it('leaves distFromTag at 0 for a death it cannot place', () => {
        const log = buildNativeLog([parked(1, 'A.1', 0, 0)]);
        const deaths: DeathEvent[] = [
            { tSec: 2, account: 'Ghost.9', profession: '', role: 'unknown', distFromTag: 0 },
        ];
        cohesionOf(log, deaths);
        expect(deaths[0].distFromTag).toBe(0);
    });
});

/**
 * "Distance from tag" now means distance from the TAG.
 *
 * EI exposed no positional commander evidence, so the centroid was the only
 * available stand-in — and it degrades precisely when the metric matters, since
 * one distant member drags the centroid toward themselves and inflates the
 * reading for everyone who actually stacked. Native `commander.segments`
 * identifies the tag, and its own replay track puts it somewhere.
 */
describe('computeCohesion measured from the commander', () => {
    it('measures from the tag, not the centroid the outlier displaces', () => {
        // The tag and one member are stacked at the origin; a third is 3000u
        // east. From the CENTROID (x=1000) the two stacked members read 1000u
        // each and the outlier 2000u — mean 1333. From the TAG the stacked pair
        // read 0 and the outlier its true 3000u — mean 1000.
        const log = buildNativeLog([
            tagged(1, 'Tag.1', 0, 0), parked(2, 'B.2', 0, 0), parked(3, 'C.3', 3000, 0),
        ]);
        expect(cohesionOf(log).cohesion.avgDistFromTag).toBeCloseTo(1000, 6);
    });

    it('stops counting a stacked squad as spread out because one member left', () => {
        // Same shape, inside the 900u threshold: from the tag, A and B are at 0
        // and only C is beyond — but the centroid put ALL THREE past 900u.
        const log = buildNativeLog([
            tagged(1, 'Tag.1', 0, 0), parked(2, 'B.2', 100, 0), parked(3, 'C.3', 3000, 0),
        ]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.stragglersAtBomb).toBe(1);
    });

    it('measures a death from the tag', () => {
        const log = buildNativeLog([
            tagged(1, 'Tag.1', 0, 0), parked(2, 'B.2', 0, 0), parked(3, 'C.3', 1500, 0),
        ]);
        const deaths: DeathEvent[] = [
            { tSec: 2, account: 'C.3', profession: 'Guardian', role: 'unknown', distFromTag: 0 },
        ];
        cohesionOf(log, deaths);
        // The tag is at the origin, C at x=1500 — their true separation. The
        // centroid (x=500) would have said 1000.
        expect(deaths[0].distFromTag).toBeCloseTo(1500, 6);
    });

    it('picks the member who held the tag longest when two are tagged', () => {
        // A brief tag at the origin, a long one 4000u east. Measuring from the
        // wrong one moves every distance by 4000u, so the choice is visible in
        // the mean rather than only in an internal field.
        const log = buildNativeLog([
            tagged(1, 'Brief.1', 0, 0, [[0, 500]]),
            tagged(2, 'Long.2', 4000, 0, [[0, 9000]]),
            parked(3, 'C.3', 4000, 0),
        ]);
        // From Long.2: 4000, 0, 0 → mean 1333.33.
        expect(cohesionOf(log).cohesion.avgDistFromTag).toBeCloseTo(4000 / 3, 4);
    });

    it('falls back to the centroid for seconds the tag has no position', () => {
        // The tag's track stops after 3 samples (~0.6s); the others run to 3s.
        // Seconds past the tag's track fall back to the centroid rather than
        // to a stale tag position carried forward forever.
        const log = buildNativeLog([
            {
                id: 1, role: 'squad' as const, account: 'Tag.1', character: 'Tag', startMs: 0,
                world: [[0, 0], [0, 0], [0, 0]] as Array<[number, number]>,
                commander: true,
            },
            parked(2, 'B.2', 2000, 0), parked(3, 'C.3', 2000, 0),
        ]);
        // t=0: from the tag → 0 (tag itself is untracked past its samples but
        // present here), 2000, 2000. t=1..3: the tag is gone, so the centroid
        // of B and C (x=2000) gives 0 and 0. Only the first second can register
        // anyone beyond 900u.
        expect(cohesionOf(log).cohesion.timeSpread900PlusSec).toBe(1);
    });
});

/**
 * Members who were never in the fight are excluded from the aggregates.
 *
 * A squad member who spends the whole fight tens of thousands of units away was
 * not fighting — they were in another part of the map. Cohesion's aggregates are
 * a mean and a standard deviation over player-seconds, so one such member
 * dominates both, and no choice of ORIGIN fixes it: they are in the tail wherever
 * the origin sits. This is a roster problem, not a statistics problem, which is
 * why the answer is to exclude and COUNT them rather than to reach for a robust
 * estimator that would hide them.
 */
describe('computeCohesion excludes detached members', () => {
    it('drops a member who was never anywhere near the fight', () => {
        // Two stacked on the tag, one parked 20000u away. Counting them, the
        // mean is ~6667u and peak sigma ~9428u — both about the one absentee.
        const log = buildNativeLog([
            tagged(1, 'Tag.1', 0, 0), parked(2, 'B.2', 100, 0), parked(3, 'Away.3', 20000, 0),
        ]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.detachedMembers).toBe(1);
        // Only the tag (0u) and B (100u) remain.
        expect(cohesion.avgDistFromTag).toBeCloseTo(50, 6);
        expect(cohesion.peakSpreadStdev).toBeCloseTo(50, 6);
        expect(cohesion.timeSpread900PlusSec).toBe(0);
        expect(cohesion.stragglersAtBomb).toBe(0);
    });

    it('keeps a genuine straggler who was out of position but present', () => {
        // 3000u out is a bad place to be and the metrics should say so. The
        // filter asks whether someone was in the fight at all, not whether they
        // were where they should have been.
        const log = buildNativeLog([
            tagged(1, 'Tag.1', 0, 0), parked(2, 'B.2', 100, 0), parked(3, 'C.3', 3000, 0),
        ]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.detachedMembers).toBe(0);
        expect(cohesion.timeSpread900PlusSec).toBe(4);
        expect(cohesion.stragglersAtBomb).toBe(1);
    });

    it('keeps someone who ran back, far seconds included', () => {
        // Away for the first half at 20000u, stacked on the tag for the second.
        // The test is the MINIMUM over the fight, so returning once keeps every
        // one of their far seconds in the aggregates.
        const log = buildNativeLog([
            tagged(1, 'Tag.1', 0, 0),
            {
                id: 2, role: 'squad' as const, account: 'Back.2', character: 'Back', startMs: 0,
                world: [
                    ...Array.from({ length: 6 }, () => [20000, 0] as [number, number]),
                    ...Array.from({ length: 5 }, () => [0, 0] as [number, number]),
                ],
            },
        ]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.detachedMembers).toBe(0);
        expect(cohesion.stragglersAtBomb).toBe(1);
    });

    it('keeps everyone rather than emptying the squad', () => {
        // A lone member far from a centroid that IS them cannot happen, but a
        // whole squad detached from a stale tag position could. Reporting a
        // squad of nobody would be worse than reporting the raw numbers.
        const log = buildNativeLog([parked(1, 'A.1', 0, 0)]);
        const { cohesion } = cohesionOf(log);
        expect(cohesion.detachedMembers).toBe(0);
        expect(cohesion.avgDistFromTag).toBe(0);
    });
});

describe('computeCommanderFightData end to end', () => {
    it('joins EI-sourced deaths to native tracks by account', () => {
        // The deaths timeline is still built from EI `combatReplayData.dead`
        // (a later migration unit owns survival), so this pins the account join
        // between the two surfaces.
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0),
            parked(2, 'B.2', 0, 0),
            parked(3, 'C.3', 1500, 0, { combatReplayData: { dead: [[2000, 3000]], down: [] } }),
        ], { durationMs: 4000, details: { fightName: 'Test', uploadTime: 1, targets: [] } });

        const data = computeCommanderFightData(log as any);
        expect(data.survival.firstSquadDeath?.account).toBe('C.3');
        expect(data.survival.firstSquadDeath?.distFromTag).toBeCloseTo(1000, 6);
    });

    it('gives survival and the deaths timeline the same DeathEvent object', () => {
        // `computeSurvival` and `buildDeathsTimeline` build separate objects
        // from the same source, and only the timeline's get distFromTag filled.
        // firstSquadDeathEarly reads survival's, so its far-from-tag flag was
        // comparing a permanent 0 against the 900u threshold. Identity, not
        // equality, is the assertion — equal-but-separate is what regressed.
        const log = buildNativeLog([
            parked(1, 'A.1', 0, 0),
            parked(2, 'B.2', 3000, 0, { combatReplayData: { dead: [[2000, 3000]], down: [] } }),
        ], { durationMs: 4000, details: { fightName: 'Test', uploadTime: 1, targets: [] } });

        const data = computeCommanderFightData(log as any);
        expect(data.survival.firstSquadDeath).toBe(data.series.deathsTimeline[0]);
        expect(data.survival.firstSquadDeath!.distFromTag).toBeGreaterThan(0);
    });
});
