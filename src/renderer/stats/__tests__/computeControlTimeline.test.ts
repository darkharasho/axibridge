import { describe, it, expect } from 'vitest';
import {
    createControlTimelineAccumulator,
    ingestLogControlTimeline,
    extractControlTimelineFrame,
    mergeControlTimelineFrame,
    finalizeControlTimeline,
} from '../computeControlTimeline';

/**
 * One squad player, 10s fight. Shapes mirror `computeStabPerformance`'s real
 * inputs exactly: `details.native` for the carried report, `details.durationMS`
 * (capital MS), and the account string as the player key.
 */
const nativeLog = (lanes: Record<string, number[]> | null) => ({
    id: 'log-1',
    filePath: 'fight-1.zevtc',
    details: {
        durationMS: 10_000,
        players: [{ account: 'Alice.1234', name: 'Alice', group: 1, profession: 'Guardian' }],
        native: {
            entities: [{ id: 7, account: 'Alice.1234', role: 'squad' }],
            blocks: {
                series: {
                    squad: {},
                    by_entity: {
                        '7': lanes
                            ? Object.fromEntries(Object.entries(lanes).map(([k, v]) => [
                                k, { enc: 'raw', interval_ms: 1000, len: v.length, data: v },
                            ]))
                            : {},
                    },
                },
            },
        },
    },
});

describe('computeControlTimeline', () => {
    it('downsamples 1s native buckets into 5s buckets', () => {
        const acc = createControlTimelineAccumulator();
        // 1 CC in each of the first five seconds, 2 in the sixth.
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 1, 1, 1, 1, 2, 0, 0, 0, 0] }), acc);
        const out = finalizeControlTimeline(acc);
        const player = Object.values(out.fights[0].players)[0];
        expect(player.cc[0]).toBe(5);
        expect(player.cc[1]).toBe(2);
    });

    it('reports recorded=false when no log carried per-entity lanes', () => {
        const acc = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog(null), acc);
        expect(finalizeControlTimeline(acc).recorded).toBe(false);
    });

    it('reports recorded=true for a genuinely all-zero fight even though the zero player is omitted', () => {
        // The lane was present (len 5), so `recorded` reflects that the lane
        // was captured at all -- independent of whether every value in it
        // happens to be zero. But an all-zero player contributes nothing to
        // the grid, so `playersOut` omits them to roughly halve payload size
        // (M1); consumers already tolerate a missing player key.
        const acc = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [0, 0, 0, 0, 0] }), acc);
        const out = finalizeControlTimeline(acc);
        expect(out.recorded).toBe(true);
        expect(out.fights[0].recorded).toBe(true);
        expect(Object.keys(out.fights[0].players)).toHaveLength(0);
    });

    it('omits an all-zero player from playersOut but keeps a genuinely active one', () => {
        const acc = createControlTimelineAccumulator();
        const log = nativeLog({ cc_applied: [1, 0, 0, 0, 0] });
        (log.details.players as any[]).push({ account: 'Bob.5678', name: 'Bob', group: 1, profession: 'Warrior' });
        (log.details.native.entities as any[]).push({ id: 8, account: 'Bob.5678', role: 'squad' });
        (log.details.native.blocks.series.by_entity as any)['8'] = {
            cc_applied: { enc: 'raw', interval_ms: 1000, len: 5, data: [0, 0, 0, 0, 0] },
        };
        ingestLogControlTimeline(log, acc);
        const out = finalizeControlTimeline(acc);
        expect(Object.keys(out.fights[0].players)).toEqual(['Alice.1234']);
    });

    it('round-trips through a JSON frame exactly, as the worker sends it', () => {
        const direct = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 0, 3, 0, 0] }), direct);

        const solo = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 0, 3, 0, 0] }), solo);
        const frame = JSON.parse(JSON.stringify(extractControlTimelineFrame(solo)));

        const merged = createControlTimelineAccumulator();
        mergeControlTimelineFrame(merged, frame);

        expect(finalizeControlTimeline(merged)).toEqual(finalizeControlTimeline(direct));
    });

    it('clamps overflow into the last bucket so the sum still equals the whole-fight total (metrics-spec invariant)', () => {
        // durationMS = 10_000 -> bucketCount = 2, but the native series runs
        // one sample longer than ceil(durationMs/5000)*5 seconds (e.g. an
        // inclusive-endpoint `len`). `computeStabPerformance`'s sibling
        // clamps this overflow into the last bucket instead of dropping it;
        // `computeControlTimeline` must match, or metrics-spec.md's promise
        // that "a player's buckets sum exactly to that player's whole-fight
        // CC total" silently breaks whenever a native series overruns.
        const acc = createControlTimelineAccumulator();
        const overrunSeries = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5]; // 11 samples, bucketCount expects 10
        ingestLogControlTimeline(nativeLog({ cc_applied: overrunSeries }), acc);
        const out = finalizeControlTimeline(acc);
        const player = Object.values(out.fights[0].players)[0];
        const wholeFightTotal = overrunSeries.reduce((a, b) => a + b, 0);
        const bucketSum = player.cc.reduce((a, b) => a + b, 0);
        expect(bucketSum).toBe(wholeFightTotal);
        // And specifically: the 11th sample (value 5) lands in the last
        // bucket alongside samples 5-9 (five 1s), not dropped.
        expect(player.cc[player.cc.length - 1]).toBe(5 * 1 + 5);
    });

    it('reports recorded per-fight, not just dataset-wide', () => {
        const acc = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [1, 0, 3, 0, 0] }), acc);
        ingestLogControlTimeline({ ...nativeLog(null), id: 'log-2', filePath: 'fight-2.zevtc' }, acc);
        const out = finalizeControlTimeline(acc);
        expect(out.recorded).toBe(true);
        expect(out.fights[0].recorded).toBe(true);
        expect(out.fights[1].recorded).toBe(false);
    });
});
