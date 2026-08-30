import { describe, it, expect } from 'vitest';
import { buildReplayFightPayload } from '../../incrementalAggregation';
import { buildNativeLog, TEST_ARENA } from '../../../../test/nativeLogFixture';

const basicFight = {
    id: 'fight-1',
    filePath: '/tmp/log1.zevtc',
    uploadTime: 1_700_000_000,
    details: buildNativeLog([
        {
            id: 1, role: 'squad', account: 'Alice.0001', character: 'Alice',
            profession: 'Guardian', elite_spec: 'Firebrand', subgroup: 1, commander: true,
            // Near Bluebriar on Green BL (182, 515).
            pixels: [[180, 500], [185, 510]],
            ei: { damage1S: [[0, 0, 1000, 2000]] },
        },
    ], { durationMs: 150_000, details: { fightName: 'Green Borderlands' } }),
};

describe('buildReplayFightPayload', () => {
    it('returns null when the fight has no replay tracks', () => {
        const empty = { ...basicFight, details: buildNativeLog([]) };
        expect(buildReplayFightPayload(empty, 0)).toBeNull();
    });

    it('takes the map image and canvas from the native arena, not EI metadata', () => {
        const payload = buildReplayFightPayload(basicFight, 0)!;
        expect(payload.mapImageUrl).toBe(TEST_ARENA.image_url);
        expect(payload.mapSize).toEqual([750, 750]);
    });

    it('produces a payload with MovementData for a valid fight', () => {
        const payload = buildReplayFightPayload(basicFight, 0);
        expect(payload).not.toBeNull();
        expect(payload!.fightId).toBe('fight-1');
        expect(payload!.fightIndex).toBe(0);
        expect(payload!.durationMs).toBe(150_000);
        expect(payload!.movementData.members).toHaveLength(1);
        expect(payload!.squadSize).toBe(1);
        expect(payload!.label).toMatch(/Green BL/);
        expect(payload!.avgPosition).not.toBeNull();
    });

    it('computes nearest landmark from avg position', () => {
        // Alice sits near (182, 505) on Green BL — Bluebriar is at (182, 515).
        const payload = buildReplayFightPayload(basicFight, 0);
        expect(payload!.nearestLandmark).toBe('Bluebriar');
    });

    it('threads sectorOwners from the log onto the payload (null when absent)', () => {
        const withOwners = buildReplayFightPayload({ ...basicFight, sectorOwners: { 999: 'Red' } }, 0);
        expect(withOwners?.sectorOwners).toEqual({ 999: 'Red' });
        const without = buildReplayFightPayload(basicFight, 0);
        expect(without?.sectorOwners).toBeNull();
    });

    it('decodes ccSamples/stripSamples from native.blocks.series.squad, and reports null when the lane is absent', () => {
        const fightWithSeries = {
            ...basicFight,
            details: {
                ...basicFight.details,
                native: {
                    ...basicFight.details.native,
                    blocks: {
                        ...basicFight.details.native.blocks,
                        series: {
                            squad: {
                                cc_applied: { data: [0, 2, 1], enc: 'raw', interval_ms: 1000, len: 3 },
                                strips: { data: [[0, 2], [1, 1]], enc: 'rle', interval_ms: 1000, len: 3 },
                            },
                        },
                    },
                },
            },
        };

        const payload = buildReplayFightPayload(fightWithSeries, 0);
        expect(payload?.ccSamples).toEqual([0, 2, 1]);
        expect(payload?.stripSamples).toEqual([0, 0, 1]);

        // basicFight's native carry set has no `blocks.series` at all — a
        // pre-1.8.0 axilog parse. Absent must read as null, never as a flat
        // all-zero series (that would falsely claim "no CC/strips happened").
        const withoutSeries = buildReplayFightPayload(basicFight, 0);
        expect(withoutSeries?.ccSamples).toBeNull();
        expect(withoutSeries?.stripSamples).toBeNull();
    });

    describe('incoming lanes', () => {
        // axilog has no squad-level `cc_taken`/`strips_taken`, so these are
        // folded from `by_entity` across the squad roster.
        const twoSquad = (series: Record<string, unknown>) => {
            const log = buildNativeLog([
                {
                    id: 1, role: 'squad', account: 'Alice.0001', character: 'Alice',
                    profession: 'Guardian', elite_spec: 'Firebrand', subgroup: 1, commander: true,
                    pixels: [[180, 500], [185, 510]],
                    ei: { damage1S: [[0, 0, 1000, 2000]] },
                },
                {
                    id: 2, role: 'squad', account: 'Bob.0002', character: 'Bob',
                    profession: 'Necromancer', elite_spec: 'Scourge', subgroup: 1,
                    pixels: [[181, 501], [186, 511]],
                    ei: { damage1S: [[0, 0, 500, 900]] },
                },
                {
                    id: 9, role: 'enemy_player', account: '', character: 'Foe',
                    profession: 'Warrior', elite_spec: 'Spellbreaker',
                    pixels: [[300, 300], [301, 301]],
                },
            ], { durationMs: 150_000, details: { fightName: 'Green Borderlands' } });
            // Merge into the existing blocks: replacing them would drop
            // `blocks.replay`, and the payload would come back null.
            (log.native.blocks as any).series = { by_entity: series };
            return { ...basicFight, details: log };
        };

        it('sums the per-entity incoming lanes across the squad only', () => {
            const payload = buildReplayFightPayload(twoSquad({
                '1': { cc_taken: { data: [1, 2, 0], enc: 'raw', interval_ms: 1000, len: 3 } },
                '2': { cc_taken: { data: [0, 3, 4], enc: 'raw', interval_ms: 1000, len: 3 } },
                // The enemy row must not land in a SQUAD incoming total.
                '9': { cc_taken: { data: [99, 99, 99], enc: 'raw', interval_ms: 1000, len: 3 } },
            }), 0);
            expect(payload?.ccInSamples).toEqual([1, 5, 4]);
        });

        it('grows to the longest lane rather than truncating to the first', () => {
            // A player who joined late carries a shorter lane; truncating to
            // the first row seen would silently drop the fight's tail.
            const payload = buildReplayFightPayload(twoSquad({
                '1': { strips_taken: { data: [1, 1], enc: 'raw', interval_ms: 1000, len: 2 } },
                '2': { strips_taken: { data: [0, 2, 5, 5], enc: 'raw', interval_ms: 1000, len: 4 } },
            }), 0);
            expect(payload?.stripInSamples).toEqual([1, 3, 5, 5]);
        });

        /**
         * axilog >=1.10 attributes each incoming CC to an instant and a
         * generic arcdps control id. `twoSquad` alone is the pre-1.10 shape.
         */
        const withCcRows = (series: Record<string, unknown>, takenEvents: unknown) => {
            const fight = twoSquad(series);
            const native = (fight.details as any).native;
            native.blocks.cc = { taken_events: takenEvents };
            native.catalogs = {
                ...native.catalogs,
                skills: {
                    '23295': { name: 'Knockback', control_kind: 'knockback_or_pull' },
                    '23299': { name: 'Daze', control_kind: 'stun_or_daze' },
                    '5491': { name: 'Unclassifiable' },
                },
            };
            return fight;
        };

        it('builds attributed marks from the per-row events, at the instant they landed', () => {
            // The rows carry exact millisecond stamps; the old series fold
            // could only ever place a mark on a whole second.
            const payload = buildReplayFightPayload(withCcRows({}, {
                '1': [
                    { time_ms: 1450, src: 9, skill_id: 23299, duration_ms: 2000 },
                    { time_ms: 320, src: 9, skill_id: 23295, duration_ms: 0 },
                ],
                '2': [{ time_ms: 4010, skill_id: 5491, duration_ms: 300 }],
                // Same exclusion the squad sum makes: an enemy eating CC is
                // not the squad eating CC.
                '9': [{ time_ms: 500, src: 1, skill_id: 23295, duration_ms: 0 }],
            }), 0);
            expect(payload?.ccTakenEvents).toEqual([
                { timeMs: 320, memberKey: 'Alice.0001', count: 1, kinds: ['knockback_or_pull'] },
                { timeMs: 1450, memberKey: 'Alice.0001', count: 1, kinds: ['stun_or_daze'] },
                { timeMs: 4010, memberKey: 'Bob.0002', count: 1, kinds: [] },
            ]);
        });

        it('folds simultaneous hits on one member into a single weighted mark', () => {
            // Two CCs at the identical instant are one thing that happened to
            // that player, and the canvas draws one ring whose weight scales
            // with `count` — two stacked rings would just alias.
            const payload = buildReplayFightPayload(withCcRows({}, {
                '1': [
                    { time_ms: 2000, src: 9, skill_id: 23295, duration_ms: 0 },
                    { time_ms: 2000, src: 9, skill_id: 23299, duration_ms: 1000 },
                    { time_ms: 2000, src: 9, skill_id: 23299, duration_ms: 1000 },
                ],
            }), 0);
            expect(payload?.ccTakenEvents).toEqual([
                {
                    timeMs: 2000, memberKey: 'Alice.0001', count: 3,
                    // Deduped: three hits, two distinct kinds.
                    kinds: ['knockback_or_pull', 'stun_or_daze'],
                },
            ]);
        });

        it('emits an empty list, not null, when the pass ran and the squad ate nothing', () => {
            // An empty container says "recorded, nothing landed"; its absence
            // says "never recorded". Only one is an absent-data affordance.
            expect(buildReplayFightPayload(withCcRows({}, {}), 0)?.ccTakenEvents).toEqual([]);
        });

        it('falls back to the 1s series fold for fights parsed before axilog 1.10', () => {
            // Reports already published carry the `cc_taken` lane and no rows.
            // Dropping their marks to null would retro-actively blank the map
            // on every cached fight.
            const payload = buildReplayFightPayload(twoSquad({
                '1': { cc_taken: { data: [1, 2, 0], enc: 'raw', interval_ms: 1000, len: 3 } },
            }), 0);
            expect(payload?.ccTakenEvents).toEqual([
                { timeMs: 0, memberKey: 'Alice.0001', count: 1, kinds: [] },
                { timeMs: 1000, memberKey: 'Alice.0001', count: 2, kinds: [] },
            ]);
        });

        it('emits a sparse per-member cc-taken event list that agrees with the squad sum', () => {
            const payload = buildReplayFightPayload(twoSquad({
                '1': { cc_taken: { data: [1, 2, 0], enc: 'raw', interval_ms: 1000, len: 3 } },
                '2': { cc_taken: { data: [0, 3, 4], enc: 'raw', interval_ms: 1000, len: 3 } },
                // Same exclusion as the squad sum: an enemy eating CC is not
                // the squad eating CC.
                '9': { cc_taken: { data: [99, 99, 99], enc: 'raw', interval_ms: 1000, len: 3 } },
            }), 0);
            expect(payload?.ccTakenEvents).toEqual([
                { timeMs: 0, memberKey: 'Alice.0001', count: 1, kinds: [] },
                { timeMs: 1000, memberKey: 'Alice.0001', count: 2, kinds: [] },
                { timeMs: 1000, memberKey: 'Bob.0002', count: 3, kinds: [] },
                { timeMs: 2000, memberKey: 'Bob.0002', count: 4, kinds: [] },
            ]);
            // The sparse list and the dense squad lane are two views of one
            // fold; if they ever disagree the map and the timeline tell
            // different stories about the same second.
            const summed = [0, 0, 0];
            for (const e of payload!.ccTakenEvents!) summed[e.timeMs / 1000] += e.count;
            expect(summed).toEqual(payload?.ccInSamples);
        });

        it('emits an empty cc-taken event list, not null, when the squad genuinely ate no CC', () => {
            // `[]` says "recorded, and nothing landed"; `null` says "never
            // recorded". The map draws nothing either way, but only one of
            // them should read as an absent-data affordance.
            const payload = buildReplayFightPayload(twoSquad({
                '1': { cc_taken: { data: [0, 0], enc: 'raw', interval_ms: 1000, len: 2 } },
            }), 0);
            expect(payload?.ccTakenEvents).toEqual([]);
        });

        it('reports null cc-taken events when no squad row carries the lane', () => {
            const payload = buildReplayFightPayload(twoSquad({
                '1': { strips_taken: { data: [1, 0], enc: 'raw', interval_ms: 1000, len: 2 } },
            }), 0);
            expect(payload?.ccTakenEvents).toBeNull();
        });

        it('reports null when no squad row carries the lane, never an all-zero series', () => {
            // `by_entity` is gated on `timeseries: true` where the squad block
            // is not, so this is the common case, not the exotic one.
            const payload = buildReplayFightPayload(twoSquad({
                '1': { cc_taken: { data: [1, 0], enc: 'raw', interval_ms: 1000, len: 2 } },
            }), 0);
            expect(payload?.ccInSamples).toEqual([1, 0]);
            expect(payload?.stripInSamples).toBeNull();
        });
    });
});
