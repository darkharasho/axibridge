import { describe, it, expect } from 'vitest';
import {
    createBoonTimelineAccumulator,
    ingestLogBoonTimeline,
    finalizeBoonTimeline,
    extractBoonTimelineFrame,
    mergeBoonTimelineFrame,
} from '../../computeBoonTimeline';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';
import { buildFrameLabelSeed, resolveFrameFightLabels } from '../frameLabels';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
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
