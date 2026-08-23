import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeStatsSync } from '../../incrementalAggregation';
import { buildSliceSidecar } from '../buildSliceSidecar';
import { mergeSliceFrames, SliceSettingsMismatchError } from '../mergeSliceFrames';
import { hashSliceSettings } from '../sliceSettingsHash';
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

/**
 * `computeStabPerformance`'s sibling `combatMetrics` writes `stabGeneration`
 * back onto `details.players` as a side effect of player aggregation, and
 * `ingestLogFightDiffMode` reads it — but ingest calls the diff-mode reader
 * BEFORE player aggregation, so the very first pass over a given `details`
 * object reports 0 squad stability and every later pass reports the real
 * number. `LOGS` is a module-level array shared by every aggregation in this
 * file, so whichever comparison ran first would win — and running any single
 * test in isolation (`-t`, `.only`, sharding) would make it the "first" pass
 * and fail. Matches `aggregatorFrames.test.ts`: warm the fixtures once up
 * front so both sides of every comparison read the same input regardless of
 * run order.
 */
computeStatsSync({ logs: LOGS });

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

    /**
     * Every other equivalence assertion in this file runs under the
     * all-`undefined` settings triple, which is also the triple that produces
     * the aggregator's internal defaults — so a merge path that silently
     * ignored `settings` entirely would pass all of them. This one merges
     * under a NON-default triple (`splitPlayersByClass: true`, which changes
     * the player row identity, plus `disruptionMethod: 'duration'`, which
     * changes how disruption is scored) and demands the same exact equality
     * against a direct `computeStatsSync` run under those same settings.
     */
    it('reproduces a subset exactly under a non-default settings triple', () => {
        const custom = {
            mvpWeights: undefined,
            statsViewSettings: { splitPlayersByClass: true } as any,
            disruptionMethod: 'duration' as any,
        };
        const out = JSON.parse(JSON.stringify(
            buildSliceSidecar({ logs: LOGS, roster: ROSTER, ...custom }),
        ));
        expect(out.settingsHash).toBe(
            hashSliceSettings(custom.mvpWeights, custom.statsViewSettings, custom.disruptionMethod),
        );
        const ordinals = [1, 3, 5];
        const direct = computeStatsSync({ logs: ordinals.map((i) => LOGS[i]), ...custom }).stats;
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: ordinals, ...custom }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
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

    // The three tests above document intended behaviour, but none of them
    // actually PROVES the range/integer filter in `mergeSliceFrames.ts` does
    // anything: `frames[-1]`, `frames[1.5]`, `frames[NaN]` and `frames[99]`
    // are all `undefined` in JS, so the `if (frame)` fallback that already
    // exists absorbs every one of those cases with or without the filter.
    // (Review round 1, finding 1 — confirmed by deleting the filter and
    // re-running the file: all three still passed.)
    //
    // The filter's actual, distinguishing job is rejecting a *non-number*
    // ordinal such as the string `'2'`. JS array indexing coerces a numeric
    // string key, so `sidecar.frames['2']` resolves to the exact same
    // element as `sidecar.frames[2]` — `if (frame)` alone would happily
    // merge it. `Number.isInteger('2')` is `false` (it rejects non-`number`
    // types outright, no coercion), so the filter drops it. This is the one
    // case where deleting the filter changes the result, which is what makes
    // it an actual pin rather than a decoration.
    it('rejects a non-numeric ordinal instead of resolving it via array string-key coercion', () => {
        const out = JSON.parse(JSON.stringify(sidecar()));
        const merged = mergeSliceFrames({ sidecar: out, includedOrdinals: ['2', '2'] as any, ...SETTINGS }).stats;
        // With the filter: both copies of '2' are dropped (not integers) ->
        // zero fights merged. Without the filter: dedup collapses the two
        // '2's to one, `frames['2']` resolves to frame 2, and it merges ->
        // the single-fight-2 result. These two outcomes are different, so
        // this assertion distinguishes "filter present" from "filter absent".
        const direct = computeStatsSync({ logs: [] }).stats;
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

    it('builds an empty sidecar from an empty log list instead of throwing', () => {
        const out = buildSliceSidecar({ logs: [], roster: [], ...SETTINGS });
        expect(out.fights).toEqual([]);
        expect(out.frames).toEqual([]);
        const revived = JSON.parse(JSON.stringify(out));
        expect(() => mergeSliceFrames({ sidecar: revived, includedOrdinals: [0], ...SETTINGS })).not.toThrow();
        const merged = mergeSliceFrames({ sidecar: revived, includedOrdinals: [0], ...SETTINGS }).stats;
        const direct = computeStatsSync({ logs: [] }).stats;
        expect(comparable(merged)).toEqual(comparable(direct));
    });

    it('does not throw building or merging an unparseable log', () => {
        const brokenLogs = [{ id: 'broken-0', filePath: 'broken-0.zevtc', details: null }];
        const brokenRoster = brokenLogs.map((log, i) => ({
            id: statsLogKey(log, i),
            label: 'Fight 1',
            timestamp: i + 1,
            duration: '--:--',
        }));
        let out: ReturnType<typeof buildSliceSidecar> | undefined;
        expect(() => { out = buildSliceSidecar({ logs: brokenLogs, roster: brokenRoster, ...SETTINGS }); }).not.toThrow();
        expect(out!.fights).toHaveLength(1);
        expect(out!.frames).toHaveLength(1);
        const revived = JSON.parse(JSON.stringify(out));
        expect(() => mergeSliceFrames({ sidecar: revived, includedOrdinals: [0], ...SETTINGS })).not.toThrow();
    });
});
