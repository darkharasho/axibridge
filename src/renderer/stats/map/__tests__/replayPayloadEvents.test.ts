import { describe, it, expect } from 'vitest';
import { buildReplayFightPayload } from '../../incrementalAggregation';
import { buildNativeLog } from '../../../../test/nativeLogFixture';

function baseFight(extra: any = {}) {
    return {
        id: 'fight-events', filePath: '/tmp/log.zevtc', uploadTime: 1_700_000_000,
        details: buildNativeLog([
            {
                id: 1, role: 'squad', account: 'Alice.0001', character: 'Alice',
                profession: 'Guardian', elite_spec: 'Firebrand', subgroup: 1, commander: true,
                pixels: [[100, 100], [105, 100], [110, 100], [115, 100], [120, 100],
                         [125, 100], [130, 100], [135, 100], [140, 100], [145, 100]],
                down: [[3000, 5000]],
                ei: {
                    damage1S: [[0, 5_000, 10_000, 15_000, 20_000, 25_000, 75_000, 80_000, 85_000, 90_000, 95_000]],
                    targetDamage1S: [[
                        [0, 1_000, 2_000, 3_000, 4_000, 5_000, 55_000, 60_000, 65_000, 70_000, 75_000],
                        [0, 4_000, 8_000, 12_000, 16_000, 20_000, 20_000, 20_000, 20_000, 20_000, 20_000],
                    ]],
                },
            },
            { id: 2, role: 'enemy_player', name: 'foo', profession: 'Guardian', pixels: [[200, 200]] },
            { id: 3, role: 'enemy_player', name: 'bar', profession: 'Necromancer', pixels: [[210, 210]] },
        ], {
            durationMs: 10_000,
            pollMs: 1000,
            details: { fightName: 'Green Borderlands' },
        }),
        ...extra,
    };
}

/** The squad member's native track — where down/dead intervals now live. */
const aliceTrack = (fight: any) => fight.details.native.blocks.replay.tracks.by_entity[1];

describe('buildReplayFightPayload — event arrays', () => {
    it('emits a rally event at the end of a down that does not end in death', () => {
        const payload = buildReplayFightPayload(baseFight(), 0)!;
        expect(payload.rallyEvents).toHaveLength(1);
        expect(payload.rallyEvents[0].timeMs).toBe(5000);
        expect(payload.rallyEvents[0].memberKey).toBe('Alice.0001');
    });

    it('does not emit a rally event when the down ends in death', () => {
        const fight = baseFight();
        aliceTrack(fight).dead_intervals = [[5000, 10_000]];
        const payload = buildReplayFightPayload(fight, 0)!;
        expect(payload.rallyEvents).toHaveLength(0);
    });

    it('detects damage spikes on the 1s series', () => {
        const payload = buildReplayFightPayload(baseFight(), 0)!;
        expect(payload.damageSpikeEvents.length).toBeGreaterThan(0);
        const hit = payload.damageSpikeEvents.find(e => e.memberKey === 'Alice.0001');
        expect(hit).toBeTruthy();
        expect(hit!.timeMs).toBeGreaterThanOrEqual(5_000);
        expect(hit!.timeMs).toBeLessThanOrEqual(7_000);
    });

    it('computes target-focus samples pointing at the most-damaged enemy in the last 2s', () => {
        const payload = buildReplayFightPayload(baseFight(), 0)!;
        expect(payload.targetFocusSamples.length).toBeGreaterThan(0);
        const lateSamples = payload.targetFocusSamples.filter(s => s.timeMs >= 7000);
        expect(lateSamples.length).toBeGreaterThan(0);
        for (const s of lateSamples) {
            expect(s.memberKey).toBe('Alice.0001');
            expect(s.targetIndex).toBe(0);
        }
    });
});
