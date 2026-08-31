import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createBoonTimelineAccumulator,
    ingestLogBoonTimeline,
    finalizeBoonTimeline,
    extractBoonTimelineFrame,
    mergeBoonTimelineFrame,
} from '../../computeBoonTimeline';
import { encodeState, decodeState } from '../stateCodec';
import { buildFrameLabelSeed, resolveFrameFightLabels } from '../frameLabels';

/**
 * Read at runtime rather than `import`ed: a static import of these fixtures
 * gives `tsc --noEmit` a multi-megabyte structural literal to infer, and
 * enough files doing it push `npm run typecheck` past its 8 GB heap.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const LOGS = ['20260117-175120', '20260117-180135', '20260117-180259'].map(fixture).map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const directFinalize = (logs: any[]) => {
    const acc = createBoonTimelineAccumulator();
    logs.forEach((log) => ingestLogBoonTimeline(log, acc));
    return finalizeBoonTimeline(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createBoonTimelineAccumulator();
        ingestLogBoonTimeline(log, solo);
        const frame = extractBoonTimelineFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createBoonTimelineAccumulator();
    frames.forEach((frame, i) => mergeBoonTimelineFrame(merged, frame, resolveFrameFightLabels(buildFrameLabelSeed(logs[i]), i)));
    return finalizeBoonTimeline(merged);
};

describe('boon timeline merge equivalence', () => {
    it('reproduces the all-fights result from per-fight frames', () => {
        expect(framedFinalize(LOGS)).toEqual(directFinalize(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framedFinalize(subset)).toEqual(directFinalize(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framedFinalize([LOGS[1]])).toEqual(directFinalize([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framedFinalize(LOGS, true)).toEqual(directFinalize(LOGS));
    });

    it('produces non-empty boon output that grows with the slice', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.length).toBeGreaterThan(0);
        expect(all[0].fights.length).toBeGreaterThan(one[0].fights.length);
    });

    it('refuses to export a frame from an accumulator that ingested more than one log', () => {
        const acc = createBoonTimelineAccumulator();
        LOGS.forEach((log) => ingestLogBoonTimeline(log, acc));
        expect(() => extractBoonTimelineFrame(acc)).toThrow(/exactly one log/i);
    });
});
