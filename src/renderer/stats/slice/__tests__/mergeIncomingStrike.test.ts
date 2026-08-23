import { describe, it, expect } from 'vitest';
import {
    createIncomingStrikeDamageAccumulator,
    ingestLogIncomingStrikeDamage,
    finalizeIncomingStrikeDamage,
    extractIncomingStrikeFrame,
    mergeIncomingStrikeFrame,
} from '../../computeIncomingStrikeDamageData';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const directFinalize = (logs: any[]) => {
    const acc = createIncomingStrikeDamageAccumulator();
    logs.forEach((log) => ingestLogIncomingStrikeDamage(log, acc));
    return finalizeIncomingStrikeDamage(acc);
};

const framedFinalize = (logs: any[], viaJson = false) => {
    const frames = logs.map((log) => {
        const solo = createIncomingStrikeDamageAccumulator();
        ingestLogIncomingStrikeDamage(log, solo);
        const frame = extractIncomingStrikeFrame(solo);
        return viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(frame)))) : frame;
    });
    const merged = createIncomingStrikeDamageAccumulator();
    frames.forEach((frame) => mergeIncomingStrikeFrame(merged, frame));
    return finalizeIncomingStrikeDamage(merged);
};

describe('incoming strike damage merge equivalence', () => {
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

    it('accumulates incoming damage across the slice rather than returning empty state', () => {
        const all = framedFinalize(LOGS);
        const one = framedFinalize([LOGS[0]]);
        expect(all.players.length).toBeGreaterThan(0);
        expect(all.fights).toHaveLength(3);
        expect(one.fights).toHaveLength(1);
        const allTotal = all.players.reduce((sum, p) => sum + p.totalDamage, 0);
        const oneTotal = one.players.reduce((sum, p) => sum + p.totalDamage, 0);
        expect(allTotal).toBeGreaterThan(oneTotal);
    });

    it('refuses to export a frame from an accumulator holding more than one fight', () => {
        const acc = createIncomingStrikeDamageAccumulator();
        LOGS.forEach((log) => ingestLogIncomingStrikeDamage(log, acc));
        expect(() => extractIncomingStrikeFrame(acc)).toThrow(/exactly one fight/i);
    });
});
