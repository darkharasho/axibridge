import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createIncomingStrikeDamageAccumulator,
    ingestLogIncomingStrikeDamage,
    finalizeIncomingStrikeDamage,
    extractIncomingStrikeFrame,
    mergeIncomingStrikeFrame,
} from '../../computeIncomingStrikeDamageData';
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
    frames.forEach((frame, i) => mergeIncomingStrikeFrame(merged, frame, resolveFrameFightLabels(buildFrameLabelSeed(logs[i]), i)));
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
