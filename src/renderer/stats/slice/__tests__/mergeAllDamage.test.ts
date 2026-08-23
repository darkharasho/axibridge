import { describe, it, expect } from 'vitest';
import {
    createAllDamageAccumulator,
    ingestLogAllDamage,
    finalizeAllDamage,
    extractAllDamageFrame,
    mergeAllDamageFrame,
} from '../../computeAllDamageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const OPTS = { splitPlayersByClass: false };

const directFinalize = (logs: any[]) => {
    const acc = createAllDamageAccumulator();
    logs.forEach((log) => ingestLogAllDamage(log, acc, OPTS));
    return finalizeAllDamage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createAllDamageAccumulator();
        ingestLogAllDamage(log, solo, OPTS);
        const frame = extractAllDamageFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createAllDamageAccumulator();
    frames.forEach((frame) => mergeAllDamageFrame(merged, frame));
    return finalizeAllDamage(merged);
};

describe('all damage merge equivalence', () => {
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

    it('sums damage across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.players[0].totalDamage).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createAllDamageAccumulator();
        LOGS.forEach((log) => ingestLogAllDamage(log, acc, OPTS));
        expect(() => extractAllDamageFrame(acc)).toThrow(/exactly one fight/i);
    });
});
