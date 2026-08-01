import { describe, it, expect } from 'vitest';
import { buildReplayFightPayload } from '../../incrementalAggregation';

const basicFight = {
    id: 'fight-1',
    filePath: '/tmp/log1.zevtc',
    uploadTime: 1_700_000_000,
    details: {
        fightName: 'Green Borderlands',
        durationMS: 150_000,
        combatReplayMetaData: {
            pollingRate: 300,
            inchToPixel: 0.01,
            sizes: [523, 750],
            maps: [{ url: 'https://example.test/map.png' }],
        },
        players: [
            { name: 'Alice', account: 'Alice.0001', profession: 'Guardian', elite_spec: 62,
              group: 1, hasCommanderTag: true, notInSquad: false, isFake: false,
              combatReplayData: { positions: [[180, 500], [185, 510]], dead: [], down: [] },
              damage1S: [[0, 0, 1000, 2000]] },
        ],
        targets: [],
        skillMap: {},
        buffMap: {},
    },
};

describe('buildReplayFightPayload', () => {
    it('returns null when the fight has no combat replay data', () => {
        const empty = { ...basicFight, details: { ...basicFight.details, players: [] } };
        expect(buildReplayFightPayload(empty, 0)).toBeNull();
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
