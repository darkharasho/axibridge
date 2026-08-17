/**
 * The commander metrics' position layer, on native tracks.
 *
 * The EI predecessor (`playerPosAt`) had to re-derive which poll index a
 * player's `positions[0]` sat at, from a `combatReplayData.start` timestamp.
 * Unit 3 found five call sites getting that derivation wrong, and this file's
 * predecessor carried a regression test for a mid-fight joiner who resolved to
 * `null` at every second of the fight. Native samples carry their own
 * timestamps, so there is nothing left to derive — the joiner case is now
 * structurally impossible rather than defended by a test.
 *
 * Distances here are WORLD INCHES (game units), the unit every threshold in
 * `commanderThresholds.ts` is written in. See the plan for why that matters.
 */
import { describe, it, expect } from 'vitest';
import { buildSquadTracks, squadPosAt, buildSquadPositionSeries } from '../shared';
import { buildNativeLog } from '../../../test/nativeLogFixture';

const POLL = 300;

describe('buildSquadTracks', () => {
    it('joins native squad entities to their tracks, keyed by account', () => {
        const log = buildNativeLog([
            { id: 1, role: 'squad', account: 'A.1', character: 'A', world: [[1000, 1000]] },
            { id: 2, role: 'squad', account: 'B.2', character: 'B', world: [[2000, 2000]] },
        ]);
        const { tracks, pollMs } = buildSquadTracks(log);
        expect(pollMs).toBe(POLL);
        expect(tracks.map(t => t.key).sort()).toEqual(['A.1', 'B.2']);
    });

    it('excludes friendlies and enemies — cohesion is a squad statistic', () => {
        const log = buildNativeLog([
            { id: 1, role: 'squad', account: 'A.1', world: [[0, 0]] },
            { id: 2, role: 'friendly_player', account: 'P.2', world: [[0, 0]] },
            { id: 3, role: 'enemy_player', name: 'Anon1', world: [[0, 0]] },
        ]);
        expect(buildSquadTracks(log).tracks.map(t => t.key)).toEqual(['A.1']);
    });

    it('yields nothing for a log with no native replay block', () => {
        expect(buildSquadTracks({ players: [] }).tracks).toEqual([]);
    });
});

describe('squadPosAt', () => {
    // Samples land on the 300ms grid; whole seconds mostly do not. t=1s falls
    // between the samples at 900ms and 1200ms, so "where were they last seen"
    // is the only answerable question.
    const log = buildNativeLog([{
        id: 1, role: 'squad', account: 'A.1',
        world: [[100, 100], [200, 200], [300, 300], [400, 400]],
        startMs: 300,
    }]);
    const [track] = buildSquadTracks(log).tracks;

    it('answers on-grid exactly', () => {
        expect(squadPosAt(track, 0.3, POLL)).toEqual([100, 100]);
    });

    it('answers between grid points with the last known position', () => {
        // t=1000ms: samples at 300/600/900/1200 → 900 is the last at-or-before.
        expect(squadPosAt(track, 1, POLL)).toEqual([300, 300]);
    });

    it('returns null before the track starts', () => {
        expect(squadPosAt(track, 0, POLL)).toBeNull();
    });

    it('refuses to borrow a position across a gap', () => {
        // Last sample is at 1200ms. t=2s is 800ms stale — more than one poll,
        // so the member's whereabouts are genuinely unknown, not "still there".
        expect(squadPosAt(track, 2, POLL)).toBeNull();
    });
});

describe('buildSquadPositionSeries', () => {
    it('returns world-inch points per second, omitting untracked members', () => {
        const log = buildNativeLog([
            {
                id: 1, role: 'squad', account: 'A.1', startMs: 0,
                // 0ms .. 3000ms on the 300ms grid.
                world: Array.from({ length: 11 }, (_, i) => [1000 + i, 2000] as [number, number]),
            },
            // Joins at 3s: no position at second 0.
            { id: 2, role: 'squad', account: 'B.2', world: [[5000, 5000]], startMs: 3000 },
        ]);
        const { tracks, pollMs } = buildSquadTracks(log);
        const series = buildSquadPositionSeries(tracks, pollMs, 4);

        expect(series).toHaveLength(4);
        expect(series[0]).toEqual([[1000, 2000]]);              // A only; B has not joined
        expect(series[3]).toEqual([[1010, 2000], [5000, 5000]]); // both, once B is on
    });
});
