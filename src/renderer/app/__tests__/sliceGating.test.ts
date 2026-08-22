import { describe, it, expect } from 'vitest';
import { selectSlicedLogs, computeIngestedIds, hasIngestedAllSlicedLogs } from '../selectSlicedLogs';

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

describe('computeIngestedIds', () => {
    // Regression guard for the streaming-progress ingest mapping in App.tsx.
    // `streamed` indexes into whatever array the worker was actually given —
    // under an active slice that is the *sliced* array. Passing the unsliced
    // array here would read the wrong entries: it would promote logs the
    // worker never ingested and strand genuinely ingested ones in `calculating`.

    it('collects ids for only the first `streamed` entries of the array it is given', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc'])); // [a, c]
        const ids = computeIngestedIds(sliced, 1);
        expect(ids).toEqual(new Set(['a.zevtc']));
    });

    it('never includes an id from outside the array it is given', () => {
        // If this were called with the unsliced `logs` instead of `sliced`,
        // streamed=2 would ingest b.zevtc — a fight the worker never saw.
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc'])); // [a, c]
        const ids = computeIngestedIds(sliced, 2);
        expect(ids.has('b.zevtc')).toBe(false);
        expect(ids).toEqual(new Set(['a.zevtc', 'c.zevtc']));
    });

    it('clamps to the array length when streamed overshoots', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc']));
        const ids = computeIngestedIds(sliced, 99);
        expect(ids).toEqual(new Set(['a.zevtc', 'c.zevtc']));
    });

    it('skips entries with no filePath or id', () => {
        const withGap = [{ filePath: 'a.zevtc' }, {}, { filePath: 'c.zevtc' }];
        const ids = computeIngestedIds(withGap, 3);
        expect(ids).toEqual(new Set(['a.zevtc', 'c.zevtc']));
    });
});

describe('hasIngestedAllSlicedLogs (bulk-settle gate)', () => {
    // Regression guard. The gate must compare what the worker ingested
    // against the array the worker was actually given (the sliced length),
    // not the unsliced length — otherwise it wedges `calculating` promotion
    // forever whenever a slice is active during ingest.

    it('is satisfied once the worker has ingested the whole sliced set', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc'])); // length 2
        expect(hasIngestedAllSlicedLogs(sliced.length, sliced.length)).toBe(true);
    });

    it('is not satisfied while the worker is still behind the sliced set', () => {
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc'])); // length 2
        expect(hasIngestedAllSlicedLogs(sliced.length - 1, sliced.length)).toBe(false);
    });

    it('would never be satisfied if compared against the unsliced length instead', () => {
        // This is the exact regression: the worker only ever ingests the
        // sliced set, so lastComputedLogCount can never reach the larger
        // unsliced length while a slice excludes any fight.
        const sliced = selectSlicedLogs(logs, new Set(['b.zevtc'])); // length 2
        expect(hasIngestedAllSlicedLogs(sliced.length, logs.length)).toBe(false);
    });
});

describe('App.tsx call sites pass the sliced array to the extracted helpers', () => {
    // Belt-and-suspenders: computeIngestedIds/hasIngestedAllSlicedLogs are
    // correct in isolation (tested above), but a future edit could still pass
    // the wrong array at the call site. Pin the call sites themselves.
    it('feeds slicedLogsForStats, not logsForStats, into both helpers', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const appTsxPath = path.resolve(__dirname, '../../App.tsx');
        const source = fs.readFileSync(appTsxPath, 'utf8');
        expect(source).toContain('computeIngestedIds(slicedLogsForStats, streamed)');
        expect(source).toContain('hasIngestedAllSlicedLogs(lastComputedLogCount, slicedLogsForStats.length)');
    });
});
