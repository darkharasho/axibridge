import { describe, it, expect } from 'vitest';
import { computeBoonUptimeTimeline } from '../stats/computeBoonUptimeTimeline';

const makeMockLog = (opts: {
    durationMs: number;
    boonId: number;
    stacking: boolean;
    boonName: string;
    statesPerSource: Record<string, Array<[number, number]>>;
}) => ({
    filePath: 'test-log.zevtc',
    details: {
        durationMS: opts.durationMs,
        timeStartStd: '2026-01-01T00:00:00Z',
        players: [
            {
                account: 'TestPlayer.1234',
                name: 'TestPlayer',
                profession: 'Guardian',
                group: 1,
                notInSquad: false,
            },
        ],
        native: {
            encounter: { duration_ms: opts.durationMs },
            entities: [
                {
                    id: 1,
                    account: 'TestPlayer.1234',
                    character: 'TestPlayer',
                    role: 'squad',
                    profession: 'Guardian',
                },
            ],
            catalogs: {
                buffs: {
                    [opts.boonId]: {
                        name: opts.boonName,
                        kind: 'boon',
                        stacking: opts.stacking ? 'intensity' : 'duration',
                        max_stacks: opts.stacking ? 25 : 1,
                    },
                },
            },
            blocks: {
                boons: {
                    by_entity: {
                        '1': {
                            [opts.boonId]: {
                                per_source: {
                                    by_source: opts.statesPerSource,
                                },
                            },
                        },
                    },
                },
            },
        },
    },
});

describe('computeBoonUptimeTimeline', () => {
    it('uses boonBucketIntervalMs for non-stacking boons', () => {
        const log = makeMockLog({
            durationMs: 10000,
            boonId: 717,
            stacking: false,
            boonName: 'Protection',
            statesPerSource: { '0': [[0, 1], [3000, 0], [7000, 1]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 2000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const protBoon = result.find((b: any) => b.name === 'Protection');
        expect(protBoon).toBeDefined();
        expect(protBoon!.intervalMs).toBe(2000);

        const fight = protBoon!.fights[0];
        // 10000ms / 2000ms = 5 buckets
        expect(fight.values['TestPlayer.1234'].buckets).toHaveLength(5);
    });

    it('uses stackingBoonBucketIntervalMs for stacking boons', () => {
        const log = makeMockLog({
            durationMs: 15000,
            boonId: 740,
            stacking: true,
            boonName: 'Might',
            statesPerSource: { '0': [[0, 10], [5000, 15], [10000, 20]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 5000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const mightBoon = result.find((b: any) => b.name === 'Might');
        expect(mightBoon).toBeDefined();
        expect(mightBoon!.intervalMs).toBe(5000);

        const fight = mightBoon!.fights[0];
        // 15000ms / 5000ms = 3 buckets
        expect(fight.values['TestPlayer.1234'].buckets).toHaveLength(3);
    });

    it('defaults to 5000/5000 when no settings provided', () => {
        const log = makeMockLog({
            durationMs: 10000,
            boonId: 717,
            stacking: false,
            boonName: 'Protection',
            statesPerSource: { '0': [[0, 1]] },
        });

        const result = computeBoonUptimeTimeline([log]);

        const protBoon = result.find((b: any) => b.name === 'Protection');
        expect(protBoon).toBeDefined();
        expect(protBoon!.intervalMs).toBe(5000);

        const fight = protBoon!.fights[0];
        expect(fight.values['TestPlayer.1234'].buckets).toHaveLength(2);
    });

    it('samples state transitions at the configured interval', () => {
        // Protection on at 0ms, off at 3000ms, on at 7000ms
        // At 2s intervals: sample at 0, 2000, 4000, 6000, 8000
        // At t=0: value=1, t=2000: value=1, t=4000: value=0 (off at 3000), t=6000: value=0, t=8000: value=1 (on at 7000)
        const log = makeMockLog({
            durationMs: 10000,
            boonId: 717,
            stacking: false,
            boonName: 'Protection',
            statesPerSource: { '0': [[0, 1], [3000, 0], [7000, 1]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 2000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const protBoon = result.find((b: any) => b.name === 'Protection');
        const buckets = protBoon!.fights[0].values['TestPlayer.1234'].buckets;
        expect(buckets).toEqual([1, 1, 0, 0, 1]);
    });

    it('renamed field: uses buckets not buckets5s', () => {
        const log = makeMockLog({
            durationMs: 5000,
            boonId: 717,
            stacking: false,
            boonName: 'Protection',
            statesPerSource: { '0': [[0, 1]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 5000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const fightValue = result[0].fights[0].values['TestPlayer.1234'];
        expect(fightValue).toHaveProperty('buckets');
        expect(fightValue).not.toHaveProperty('buckets5s');
    });
});
