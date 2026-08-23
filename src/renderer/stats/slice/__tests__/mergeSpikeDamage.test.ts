import { describe, it, expect } from 'vitest';
import {
    createSpikeDamageAccumulator,
    ingestLogSpikeDamage,
    finalizeSpikeDamage,
    extractSpikeDamageFrame,
    mergeSpikeDamageFrame,
} from '../../computeSpikeDamageData';
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

/** finalize(ingest A; ingest B; ...) — the reference result. */
const directFinalize = (logs: any[]) => {
    const acc = createSpikeDamageAccumulator();
    logs.forEach((log) => ingestLogSpikeDamage(log, acc, OPTS));
    return finalizeSpikeDamage(acc);
};

/** finalize(merge(frame(A), frame(B), ...)) — the slice-mode result. */
const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createSpikeDamageAccumulator();
        ingestLogSpikeDamage(log, solo, OPTS);
        const frame = extractSpikeDamageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createSpikeDamageAccumulator();
    frames.forEach((frame, i) => mergeSpikeDamageFrame(merged, frame, resolveFrameFightLabels(buildFrameLabelSeed(logs[i]), i)));
    return finalizeSpikeDamage(merged);
};

describe('spike damage merge equivalence', () => {
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

    it('produces peak values that actually differ between subsets', () => {
        // Guards a vacuous pass: if the fold were dropped entirely both sides
        // would be equal-and-empty and every assertion above would still hold.
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.players[0].peakHit).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createSpikeDamageAccumulator();
        LOGS.forEach((log) => ingestLogSpikeDamage(log, acc, OPTS));
        expect(() => extractSpikeDamageFrame(acc)).toThrow(/exactly one fight/i);
    });
});
