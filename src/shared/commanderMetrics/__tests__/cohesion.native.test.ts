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

const cohesionOf = (log: Record<string, any>, deaths: DeathEvent[] = [], seriesLen = 4) => {
    const { tracks, pollMs } = buildSquadTracks(log);
    return computeCohesion({
        squadTracks: tracks, pollMs, seriesLen,
        bombWindows: [{ tSec: 0, durationSec: 3 } as any],
        deathsTimeline: deaths,
    });
};

describe('computeCohesion in game units', () => {
    it('measures spread from the squad centroid in world inches', () => {
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
