import { describe, it, expect } from 'vitest';
import { selectSlicedLogs } from '../selectSlicedLogs';

const logs = [
    { filePath: 'a.zevtc' },
    { filePath: 'b.zevtc' },
    { filePath: 'c.zevtc' },
];

describe('selectSlicedLogs', () => {
    it('returns the same array identity when nothing is excluded', () => {
        expect(selectSlicedLogs(logs, new Set())).toBe(logs);
    });

    it('drops excluded logs', () => {
        const out = selectSlicedLogs(logs, new Set(['b.zevtc']));
        expect(out.map(l => l.filePath)).toEqual(['a.zevtc', 'c.zevtc']);
    });

    it('ignores exclusions naming logs that are not loaded', () => {
        const out = selectSlicedLogs(logs, new Set(['gone.zevtc']));
        expect(out).toBe(logs);
    });

    it('can exclude everything', () => {
        expect(selectSlicedLogs(logs, new Set(['a.zevtc', 'b.zevtc', 'c.zevtc']))).toEqual([]);
    });
});

describe('bulk-settle gate uses the sliced length', () => {
    // Regression guard. The gate compares what the worker ingested against the
    // array the worker was given. Comparing against the unsliced length wedges
    // `calculating` logs forever whenever a slice is active during ingest.
    const gateBlocks = (lastComputedLogCount: number, comparisonLength: number) =>
        lastComputedLogCount < comparisonLength;

    it('does not block when the worker has ingested the whole sliced set', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc']));
        expect(gateBlocks(sliced.length, sliced.length)).toBe(false);
    });

    it('would block forever if compared against the unsliced length', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc']));
        expect(gateBlocks(sliced.length, logs.length)).toBe(true);
    });
});
