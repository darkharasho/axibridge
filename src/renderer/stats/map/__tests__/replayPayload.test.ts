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
});
