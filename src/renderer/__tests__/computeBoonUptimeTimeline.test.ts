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

    it('weights each bucket by how long the boon was up inside it', () => {
        // Protection on at 0ms, off at 3000ms, on at 7000ms, 2s buckets:
        // [0,2000) full, [2000,4000) half, [4000,6000) none,
        // [6000,8000) half, [8000,10000) full.
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
        const value = protBoon!.fights[0].values['TestPlayer.1234'];
        expect(value.buckets).toEqual([1, 0.5, 0, 0.5, 1]);
        expect(value.weightedMs).toBe(6000);
    });

    /**
     * The old sampler read the state at the *start* of each bucket. Buff
     * states begin `[[0, 0], [t, 1]]` -- axilog emits the zero at fight start
     * -- so bucket 0 was always empty and uptime was hard-capped at
     * (n-1)/n. On a 50s WvW fight at 5s buckets that is a 10-point ceiling.
     */
    it('does not lose the opening bucket when the boon lands just after fight start', () => {
        const log = makeMockLog({
            durationMs: 50000,
            boonId: 717,
            stacking: false,
            boonName: 'Protection',
            statesPerSource: { '0': [[0, 0], [3, 1]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 5000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const value = result[0].fights[0].values['TestPlayer.1234'];
        expect(value.weightedMs).toBe(49997);
        // 10 buckets, only the first is short by 3ms.
        expect(value.buckets[0]).toBeCloseTo(0.999, 3);
        expect(value.buckets.slice(1)).toEqual(Array(9).fill(1));
    });

    it('reports partial coverage rather than a whole bucket', () => {
        // Up for the first 3s of a 10s fight at 5s buckets. Sampling at the
        // bucket start scored this a full bucket, i.e. 50% instead of 30%.
        const log = makeMockLog({
            durationMs: 10000,
            boonId: 717,
            stacking: false,
            boonName: 'Protection',
            statesPerSource: { '0': [[0, 1], [3000, 0]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 5000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const value = result[0].fights[0].values['TestPlayer.1234'];
        expect(value.buckets).toEqual([0.6, 0]);
        expect(value.weightedMs).toBe(3000);
    });

    it('time-weights stacking boons inside the bucket too', () => {
        // 10 stacks for 2.5s then 20 stacks for 2.5s -> a 15-stack mean.
        const log = makeMockLog({
            durationMs: 5000,
            boonId: 740,
            stacking: true,
            boonName: 'Might',
            statesPerSource: { '0': [[0, 10], [2500, 20]] },
        });

        const result = computeBoonUptimeTimeline([log], {
            boonBucketIntervalMs: 5000,
            stackingBoonBucketIntervalMs: 5000,
        });

        const value = result[0].fights[0].values['TestPlayer.1234'];
        expect(value.buckets).toEqual([15]);
        expect(value.weightedMs).toBe(75000);
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

/**
 * The overall uptime column divides a player's coverage by a denominator. It
 * used to divide by the whole session's sample count, so anyone who missed
 * fights was scored as if they had zero uptime while absent -- which reordered
 * the leaderboard, not just the numbers. Attendance has to come out of the
 * timeline, because a player who was present but never received the boon has
 * no per-fight value to count.
 */
const makeMultiPlayerLog = (opts: {
    id: string;
    timestamp: string;
    durationMs: number;
    players: Array<{ account: string; states?: Array<[number, number]> }>;
}) => ({
    filePath: opts.id,
    details: {
        durationMS: opts.durationMs,
        timeStartStd: opts.timestamp,
        native: {
            encounter: { duration_ms: opts.durationMs },
            entities: opts.players.map((player, index) => ({
                id: index + 1,
                account: player.account,
                character: player.account.split('.')[0],
                role: 'squad',
                profession: 'Guardian',
            })),
            catalogs: {
                buffs: { 717: { name: 'Protection', kind: 'boon', stacking: 'duration', max_stacks: 1 } },
            },
            blocks: {
                boons: {
                    by_entity: Object.fromEntries(opts.players.map((player, index) => [
                        String(index + 1),
                        { 717: { per_source: { by_source: player.states ? { '1': player.states } : {} } } },
                    ])),
                },
            },
        },
    },
});

describe('computeBoonUptimeTimeline attendance', () => {
    // Ever-present.4444 plays both fights at 50% uptime. Latecomer.5555 plays
    // only the second, at 100%. Latecomer is the better Protection holder.
    const logs = [
        makeMultiPlayerLog({
            id: 'fight-1', timestamp: '2026-01-01T00:00:00Z', durationMs: 10000,
            players: [{ account: 'Ever-present.4444', states: [[0, 1], [5000, 0]] }],
        }),
        makeMultiPlayerLog({
            id: 'fight-2', timestamp: '2026-01-01T00:10:00Z', durationMs: 10000,
            players: [
                { account: 'Ever-present.4444', states: [[0, 1], [5000, 0]] },
                { account: 'Latecomer.5555', states: [[0, 1]] },
            ],
        }),
    ];

    const boon = computeBoonUptimeTimeline(logs, {
        boonBucketIntervalMs: 5000,
        stackingBoonBucketIntervalMs: 5000,
    })[0];
    const playerBy = (account: string) => boon.players.find((p: any) => p.account === account);

    it('counts only the fights a player was actually present for', () => {
        expect(playerBy('Ever-present.4444').attendedMs).toBe(20000);
        expect(playerBy('Latecomer.5555').attendedMs).toBe(10000);
    });

    it('accumulates coverage across fights', () => {
        expect(playerBy('Ever-present.4444').weightedMs).toBe(10000);
        expect(playerBy('Latecomer.5555').weightedMs).toBe(10000);
    });

    it('ranks the latecomer above the regular once attendance is respected', () => {
        const uptime = (account: string) => {
            const player = playerBy(account);
            return (player.weightedMs / player.attendedMs) * 100;
        };
        expect(uptime('Ever-present.4444')).toBe(50);
        expect(uptime('Latecomer.5555')).toBe(100);
    });
});
