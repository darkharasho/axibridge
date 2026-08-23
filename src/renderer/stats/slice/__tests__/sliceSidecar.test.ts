import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeStatsSync } from '../../incrementalAggregation';
import { buildSliceSidecar } from '../buildSliceSidecar';
import { mergeSliceFrames, SliceSettingsMismatchError } from '../mergeSliceFrames';
import { statsLogKey } from '../../utils/statsLogKey';
import { SLICE_SIDECAR_VERSION } from '../sliceTypes';

/**
 * Read at runtime rather than `import`ed: a static import of these fixtures
 * gives `tsc --noEmit` a multi-megabyte structural literal to infer, and all
 * seven of them together (~31 MB) push `npm run typecheck` past its 8 GB
 * heap. See `aggregatorFrames.test.ts` for the same pattern.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const LOGS = [
    '20260117-175120', '20260117-180135', '20260117-180259', '20260117-180458',
    '20260117-180636', '20260117-180826', '20260117-181030',
].map(fixture).map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const ROSTER = LOGS.map((log, i) => ({
    id: statsLogKey(log, i),
    label: `Fight ${i + 1}`,
    timestamp: i + 1,
    duration: '1:00',
}));

const SETTINGS = { mvpWeights: undefined, statsViewSettings: undefined, disruptionMethod: undefined };

const sidecar = () => buildSliceSidecar({ logs: LOGS, roster: ROSTER, ...SETTINGS });

const comparable = (stats: any) => {
    const { replayFights, ...rest } = stats || {};
    return rest;
};

describe('slice sidecar', () => {
    it('emits one frame per roster fight, in roster order', () => {
        const out = sidecar();
        expect(out.version).toBe(SLICE_SIDECAR_VERSION);
        expect(out.fights).toHaveLength(7);
        expect(out.frames).toHaveLength(7);
        expect(out.fights.map((f) => f.id)).toEqual(ROSTER.map((f) => f.id));
    });

    it('records a settings hash', () => {
        expect(typeof sidecar().settingsHash).toBe('string');
        expect(sidecar().settingsHash.length).toBeGreaterThan(0);
    });

    it('serializes to JSON without losing Map state', () => {
        const revived = JSON.parse(JSON.stringify(sidecar()));
        const direct = computeStatsSync({ logs: LOGS }).stats;
        const merged = mergeSliceFrames({
            sidecar: revived,
            includedOrdinals: [0, 1, 2, 3, 4, 5, 6],
            ...SETTINGS,
        }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('reproduces every three-fight subset exactly', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const subsets = [[0, 1, 2], [0, 3, 6], [4, 5, 6], [1, 3, 5]];
        subsets.forEach((ordinals) => {
            const direct = computeStatsSync({ logs: ordinals.map((i) => LOGS[i]) }).stats;
            const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: ordinals, ...SETTINGS }).stats;
            expect(comparable(merged)).toEqual(comparable(direct));
        });
    });

    it('reproduces a single-fight slice', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const direct = computeStatsSync({ logs: [LOGS[3]] }).stats;
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [3], ...SETTINGS }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('ignores ordinals outside the frame range instead of throwing', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [0, 99], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [LOGS[0]] }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('ignores negative ordinals', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [-1, 2], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [LOGS[2]] }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('ignores non-integer ordinals', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [1.5, NaN, 2], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [LOGS[2]] }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('dedupes a duplicated ordinal instead of double-merging it', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [2, 2, 2], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [LOGS[2]] }).stats;
        // If dedup did not run, fight 2 would be merged three times, and squad
        // totals (e.g. wins/losses/kill counts) would be triple-counted against
        // a single-fight direct computation — this assertion bites on that.
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('produces a zero-fight result for an empty selection instead of throwing', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        expect(() => mergeSliceFrames({ sidecar: out, includedOrdinals: [], ...SETTINGS })).not.toThrow();
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: [], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [] }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('refuses to slice when settingsHash does not match the viewer settings', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        expect(() => mergeSliceFrames({
            sidecar: out,
            includedOrdinals: [0, 1, 2],
            mvpWeights: undefined,
            statsViewSettings: { splitPlayersByClass: true },
            disruptionMethod: undefined,
        })).toThrow(SliceSettingsMismatchError);
    });

    it('accepts a matching settingsHash under non-default settings', () => {
        const customSettings = { mvpWeights: undefined, statsViewSettings: { splitPlayersByClass: true }, disruptionMethod: undefined };
        const out = JSON.parse(JSON.stringify(buildSliceSidecar({ logs: LOGS, roster: ROSTER, ...customSettings })));
        expect(() => mergeSliceFrames({ sidecar: out, includedOrdinals: [0], ...customSettings })).not.toThrow();
    });
});
