import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IncrementalAggregator, computeStatsSync } from '../../incrementalAggregation';

/**
 * Read at runtime rather than `import`ed: a static import hands
 * `tsc --noEmit` a multi-megabyte structural literal to infer, and these two
 * fixtures alone are 6.3 MB. Enough of them together push `npm run typecheck`
 * past its 8 GB heap (ledgered in Task 10). Every sibling slice test —
 * `sliceSidecar.test.ts`, `sliceSidecarSize.test.ts`, `aggregatorFrames.test.ts`
 * — uses this pattern for the same reason.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const LOGS = ['20260117-175120', '20260117-180135']
    .map(fixture)
    .map((details, i) => ({ id: `log-${i}`, filePath: `t-${i}.zevtc`, details }));

// Warm-up: first pass over shared fixtures mutates players, so we need to initialize
// the fixture state before running any comparisons.
computeStatsSync({ logs: LOGS });

const frames = () => LOGS.map((log) => {
    const solo = new IncrementalAggregator();
    solo.ingestLog(log);
    return JSON.parse(JSON.stringify(solo.exportFrame()));
});

const comparable = (stats: any) => {
    const { replayFights, ...rest } = stats || {};
    // Strip undefined values since JSON serialization (frame round-trip) drops them,
    // but the direct path may have them set explicitly. Both paths are valid and
    // indistinguishable in the published artifact.
    const stripUndefined = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(stripUndefined);
        const result: any = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v !== undefined) {
                result[k] = stripUndefined(v);
            }
        }
        return result;
    };
    // Strip skillRows and skillMap like the worker does for transfer
    const stripHeavyData = (stats: any): any => {
        if (!stats || typeof stats !== 'object') return stats;
        const result = stripUndefined(stats);
        // Remove skillRows from spike/incoming fights like computeAndPost does
        const stripRowsFromFights = (dataset: any) => {
            const fights = Array.isArray(dataset?.fights) ? dataset.fights : [];
            fights.forEach((fight: any) => {
                if (!fight || typeof fight !== 'object') return;
                const values = fight.values;
                if (!values || typeof values !== 'object') return;
                Object.values(values).forEach((entry: any) => {
                    if (!entry || typeof entry !== 'object') return;
                    if (Array.isArray(entry.skillRows)) {
                        delete entry.skillRows;
                    }
                });
            });
        };
        stripRowsFromFights(result.spikeDamage);
        stripRowsFromFights(result.incomingStrikeDamage);
        // Remove skillMap from player skill breakdowns
        const playerSkillBreakdowns = Array.isArray(result.playerSkillBreakdowns) ? result.playerSkillBreakdowns : [];
        playerSkillBreakdowns.forEach((entry: any) => {
            if (!entry || typeof entry !== 'object') return;
            if (entry.skillMap && typeof entry.skillMap === 'object') {
                delete entry.skillMap;
            }
        });
        return result;
    };
    return stripHeavyData(rest);
};

describe('statsWorker mergeFrames', () => {
    let posted: any[];

    beforeEach(async () => {
        posted = [];
        vi.stubGlobal('self', {
            postMessage: (msg: any) => posted.push(msg),
            onmessage: null as any,
        });
        vi.stubGlobal('performance', { now: () => 0 });
        vi.resetModules();
        await import('../../../workers/statsWorker');
    });

    const send = (data: any) => (globalThis as any).self.onmessage({ data } as MessageEvent);

    it('posts a result whose stats match a direct aggregation over the same logs', () => {
        send({ type: 'mergeFrames', token: 0, frames: frames(), settings: {} });
        const result = posted.find((m) => m.type === 'result');
        expect(result).toBeTruthy();
        expect(comparable(result.result.stats)).toEqual(comparable(computeStatsSync({ logs: LOGS }).stats));
    });

    it('posts a result for a single-frame slice', () => {
        send({ type: 'mergeFrames', token: 0, frames: [frames()[1]], settings: {} });
        const result = posted.find((m) => m.type === 'result');
        expect(comparable(result.result.stats)).toEqual(comparable(computeStatsSync({ logs: [LOGS[1]] }).stats));
    });

    /**
     * C2: an empty selection is a real zero-fight slice, not an error and not
     * "no slice". The viewer renders whatever comes back here, so it has to be
     * the genuine empty aggregation — the same thing a report with no logs
     * shows — rather than a null the caller would replace with the full report.
     */
    it('posts the real zero-fight aggregation for an empty selection', () => {
        send({ type: 'mergeFrames', token: 0, frames: [], settings: {} });
        const result = posted.find((m) => m.type === 'result');
        expect(result).toBeTruthy();
        expect(result.result.stats).toBeTruthy();
        expect(comparable(result.result.stats)).toEqual(comparable(computeStatsSync({ logs: [] }).stats));
    });

    /**
     * C1: `mergeFrame` has several reachable throw sites and this worker is the
     * only thing between them and the published viewer. Posting nothing on a
     * throw leaves the viewer's `computing` flag stuck true and its slice stats
     * null forever — which renders as the FULL report under a "Sliced view — N
     * of M fights" banner, with no error anywhere. An explicit `error` reply,
     * carrying the token so the viewer can match it to its request, is what
     * lets the viewer say the slice is unavailable instead.
     */
    it('posts an error carrying the current token when a frame fails to merge', () => {
        send({ type: 'reset', token: 4, totalLogs: 0 });
        posted.length = 0;
        const exploding = new Proxy({}, { get() { throw new Error('frame is not mergeable'); } });
        expect(() => send({ type: 'mergeFrames', token: 4, frames: [exploding], settings: {} })).not.toThrow();
        const error = posted.find((m) => m.type === 'error');
        expect(error).toBeTruthy();
        expect(error.token).toBe(4);
        expect(error.message).toMatch(/not mergeable/);
        expect(posted.find((m) => m.type === 'result')).toBeUndefined();
    });

    it('ignores a mergeFrames message carrying a stale token', () => {
        send({ type: 'reset', token: 7, totalLogs: 0 });
        posted.length = 0;
        send({ type: 'mergeFrames', token: 3, frames: frames(), settings: {} });
        expect(posted.find((m) => m.type === 'result')).toBeUndefined();
    });
});
