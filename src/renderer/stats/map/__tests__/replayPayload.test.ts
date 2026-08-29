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
