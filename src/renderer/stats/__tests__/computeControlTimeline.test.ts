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

    it('reports recorded=true for a genuinely all-zero fight', () => {
        const acc = createControlTimelineAccumulator();
        ingestLogControlTimeline(nativeLog({ cc_applied: [0, 0, 0, 0, 0] }), acc);
        const out = finalizeControlTimeline(acc);
        expect(out.recorded).toBe(true);
        expect(Object.values(out.fights[0].players)[0].cc.every(v => v === 0)).toBe(true);
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
});
