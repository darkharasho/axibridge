/**
 * Commander positions oracle — EI pixels vs native game units.
 *
 * This unit is not a like-for-like port, and the oracle's job here is to say so
 * precisely. The EI path fed replay PIXELS into comparisons whose thresholds
 * were written in GAME UNITS, which made four cohesion/matchup metrics
 * unconditionally constant. So the assertions below are of two kinds:
 *
 *   - equalities, where the migration genuinely must not move a number
 *   - allowlisted divergences, each naming which side is right
 *
 * The constants are pinned against the real fixture rather than a hand-built
 * one, so a future axilog that changes the arena or the sample grid fails here
 * instead of silently re-scaling every commander card.
 */
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { computeCommanderFightData } from '../../shared/commanderMetrics';
import { buildSquadTracks } from '../../shared/commanderMetrics/shared';

const ALLOWLIST: DivergenceAllowlist = {
    'avgDistFromTag': {
        reason:
            'Native is right, and the divergence is the point of this unit. EI '
            + 'replay positions are canvas pixels; at 0.008512 px/inch the squad '
            + 'measured 10.2px from its centroid, which CohesionSection rendered '
            + 'verbatim as "10u". The same distance in the game units the card '
            + 'claims is ~1101u. It is now ~793u, because the origin also moved '
            + 'from the centroid to the COMMANDER: native `commander.segments` '
            + 'identifies the tag, so "distance from tag" can finally mean it. '
            + 'The centroid is displaced by the very outlier the metric exists '
            + 'to catch; the tag is not. Median 571u -> 207u, and the share of '
            + 'player-seconds inside the 600u bubble 57% -> 92%.',
    },
    'timeSpread900PlusSec': {
        reason:
            'Native is right. The threshold is 900 GAME UNITS = 7.66px on this '
            + 'arena, so in pixel space the comparison `dist > 900` was '
            + 'unsatisfiable on a 523x750 canvas and this metric read 0 for every '
            + 'fight ever recorded. Same for stragglersAtBomb at 1500u.',
    },
    'inTagBubbleAtEngage': {
        reason:
            'Native is right. TAG_RADIUS 600 against pixels spans ~70,000 game '
            + 'units -- wider than the 61440x86016 map -- so every tracked member '
            + 'always counted and MatchupSection\'s tagPct was pinned at 100%. '
            + 'Measured in game units from the CENTROID it swung to the opposite '
            + 'error, 3 of 38, because one absent member pulls the centroid off '
            + 'the blob and out from under everyone standing on the tag. From '
            + 'the tag itself it is 36 of 38, which is what a stacked squad at '
            + 'engage actually looks like.',
    },
};

describe('commander positions oracle — EI pixels vs native game units', () => {
    const { ei, native } = oracleFixture();
    const details = { ...ei, native } as any;

    it('collects a native track for every squad member', () => {
        const { tracks, pollMs } = buildSquadTracks(details);
        const squadEntities = native.entities.filter(e => e.role === 'squad');
        expect(tracks.length).toBe(squadEntities.length);
        expect(pollMs).toBe(ei.combatReplayMetaData.pollingRate);
        // Keyed by account, which is what DeathEvent.account joins on.
        expect(new Set(tracks.map(t => t.key)).size).toBe(tracks.length);
    });

    const data = computeCommanderFightData(details);

    it('measures squad spread in game units, not pixels', () => {
        // EI's own number, computed the way cohesion.ts used to.
        const EI_AVG_DIST_PIXELS = 10.2;
        expectEqualOrAllowlisted(
            'avgDistFromTag', EI_AVG_DIST_PIXELS, data.cohesion.avgDistFromTag, ALLOWLIST,
        );
        // Hundreds-to-thousands of game units is the plausible band for a WvW
        // squad blob; single digits means the pixel space came back.
        expect(data.cohesion.avgDistFromTag).toBeGreaterThan(100);
        expect(data.cohesion.avgDistFromTag).toBeLessThan(100_000);
    });

    it('makes the 900u spread threshold reachable at all', () => {
        expectEqualOrAllowlisted('timeSpread900PlusSec', 0, data.cohesion.timeSpread900PlusSec, ALLOWLIST);
        expect(data.cohesion.timeSpread900PlusSec).toBeGreaterThan(0);
        expect(data.cohesion.timeSpread900PlusSec).toBeLessThanOrEqual(Math.ceil(data.duration));
    });

    it('sources the tag from native commander.segments, not the centroid', () => {
        // The fixture has exactly one tag holder. Pinned against the real
        // container because the whole change rests on this field existing and
        // being findable -- an axilog that stopped emitting `commander` would
        // otherwise degrade silently back to centroid-relative distances, with
        // every cohesion number still plausible.
        const tagged = native.entities.filter(
            (e: any) => Array.isArray(e?.commander?.segments) && e.commander.segments.length > 0,
        );
        expect(tagged).toHaveLength(1);
        expect(buildSquadTracks(details).tagTrack).not.toBeNull();

        // Strip the tag and the same fixture falls back to the centroid, which
        // is both the no-commander path and the size of what the tag buys.
        const untagged = {
            ...details,
            native: {
                ...native,
                entities: native.entities.map((e: any) => ({ ...e, commander: undefined })),
            },
        } as any;
        expect(buildSquadTracks(untagged).tagTrack).toBeNull();
        const centroidRelative = computeCommanderFightData(untagged);
        expect(centroidRelative.cohesion.avgDistFromTag)
            .toBeGreaterThan(data.cohesion.avgDistFromTag);
        expect(centroidRelative.matchup.inTagBubbleAtEngage)
            .toBeLessThan(data.matchup.inTagBubbleAtEngage);
    });

    it('lets the tag bubble discriminate instead of counting everyone', () => {
        expectEqualOrAllowlisted(
            'inTagBubbleAtEngage', data.matchup.squadCount, data.matchup.inTagBubbleAtEngage, ALLOWLIST,
        );
        // The load-bearing half: it must now be able to exclude someone.
        expect(data.matchup.inTagBubbleAtEngage).toBeLessThan(data.matchup.squadCount);
        expect(data.matchup.inTagBubbleAtEngage).toBeGreaterThan(0);
    });

    it('shares one DeathEvent between survival and the deaths timeline', () => {
        // Nobody dies in this fixture, so the geometry is pinned on a built
        // fixture in cohesion.native.test.ts instead. What is worth asserting
        // on real data is the identity: `firstSquadDeathEarly` reads
        // `survival.firstSquadDeath.distFromTag`, and until this unit that was
        // a different object from the one computeCohesion fills.
        expect(data.series.deathsTimeline).toHaveLength(0);
        expect(data.survival.firstSquadDeath).toBeNull();
    });

    it('reads no EI replay positions anywhere in the commander path', () => {
        // Strip the EI position payload entirely: every number this unit owns
        // must be unchanged, which is the only proof that nothing fell back.
        const stripped = {
            ...ei,
            players: ei.players.map((p: any) => ({
                ...p,
                combatReplayData: { ...p.combatReplayData, positions: undefined },
            })),
            native,
        } as any;
        const blind = computeCommanderFightData(stripped);
        expect(blind.cohesion).toEqual(data.cohesion);
        expect(blind.matchup.inTagBubbleAtEngage).toBe(data.matchup.inTagBubbleAtEngage);
    });
});
