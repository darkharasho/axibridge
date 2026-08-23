import { describe, it, expect } from 'vitest';
import {
    createStripSpikesAccumulator,
    ingestLogStripSpikes,
    finalizeStripSpikes,
    extractStripSpikesFrame,
    mergeStripSpikesFrame,
} from '../../computeStripSpikesData';
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

const OPTS = { splitPlayersByClass: false };

const directFinalize = (logs: any[]) => {
    const acc = createStripSpikesAccumulator();
    logs.forEach((log) => ingestLogStripSpikes(log, acc, OPTS));
    return finalizeStripSpikes(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createStripSpikesAccumulator();
        ingestLogStripSpikes(log, solo, OPTS);
        const frame = extractStripSpikesFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createStripSpikesAccumulator();
    frames.forEach((frame, i) => mergeStripSpikesFrame(merged, frame, resolveFrameFightLabels(buildFrameLabelSeed(logs[i]), i)));
    return finalizeStripSpikes(merged);
};

describe('strip spikes merge equivalence', () => {
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

    it('sums strip totals across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
        const allTotal = all.players.reduce((sum, p) => sum + p.totalStrips, 0);
        const oneTotal = one.players.reduce((sum, p) => sum + p.totalStrips, 0);
        expect(allTotal).toBeGreaterThan(oneTotal);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createStripSpikesAccumulator();
        LOGS.forEach((log) => ingestLogStripSpikes(log, acc, OPTS));
        expect(() => extractStripSpikesFrame(acc)).toThrow(/exactly one fight/i);
    });
});
