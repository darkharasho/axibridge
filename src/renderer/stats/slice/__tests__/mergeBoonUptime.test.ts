import { describe, it, expect } from 'vitest';
import {
    createBoonUptimeTimelineAccumulator,
    ingestLogBoonUptimeTimeline,
    finalizeBoonUptimeTimeline,
    extractBoonUptimeFrame,
    mergeBoonUptimeFrame,
} from '../../computeBoonUptimeTimeline';
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

const SETTINGS = { boonBucketIntervalMs: 5000, stackingBoonBucketIntervalMs: 5000 };

const directFinalize = (logs: any[]) => {
    const acc = createBoonUptimeTimelineAccumulator(SETTINGS);
    logs.forEach((log) => ingestLogBoonUptimeTimeline(log, acc));
    return finalizeBoonUptimeTimeline(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createBoonUptimeTimelineAccumulator(SETTINGS);
        ingestLogBoonUptimeTimeline(log, solo);
        const frame = extractBoonUptimeFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createBoonUptimeTimelineAccumulator(SETTINGS);
    frames.forEach((frame, i) => mergeBoonUptimeFrame(merged, frame, resolveFrameFightLabels(buildFrameLabelSeed(logs[i]), i)));
    return finalizeBoonUptimeTimeline(merged);
};

describe('boon uptime timeline merge equivalence', () => {
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

    it('produces non-empty uptime output that grows with the slice', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.length).toBeGreaterThan(0);
        expect(all[0].fights.length).toBeGreaterThan(one[0].fights.length);
    });

    it('refuses to export a frame from an accumulator that ingested more than one log', () => {
        const acc = createBoonUptimeTimelineAccumulator(SETTINGS);
        LOGS.forEach((log) => ingestLogBoonUptimeTimeline(log, acc));
        expect(() => extractBoonUptimeFrame(acc)).toThrow(/exactly one log/i);
    });
});
