/**
 * Task 15 review round 1.
 *
 * Finding 2 (Important): a log with no resolvable details (evicted from the
 * details cache, or never loaded) must be EXCLUDED from the sidecar, not
 * silently aggregated into an all-zero frame — the worst failure mode is
 * wrong numbers with no error, not a missing fight.
 *
 * Finding 3 (Important): a throw while building the sidecar must degrade to
 * publishing without a slicer, not abort the whole publish. "The report
 * publishes exactly as today" must hold in the failure case too, not just
 * the no-R2 case.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { useStatsUploads } from '../useStatsUploads';
import { useStatsStore } from '../../statsStore';
import { statsLogKey } from '../../utils/statsLogKey';

const fixtureDetails = JSON.parse(
    readFileSync(resolve(process.cwd(), 'test-fixtures/native/20260117-175120.json'), 'utf8'),
);

const GOOD_LOG = { id: 'log-0', filePath: 'test-0.zevtc', details: fixtureDetails };
// Simulates an evicted-from-cache log: no `.details`, and (with no
// DetailsCacheContext provider in this test) nothing else to fall back to.
const EVICTED_LOG = { id: 'log-1', filePath: 'test-1.zevtc', details: null };

const ROSTER = [GOOD_LOG, EVICTED_LOG].map((log, i) => ({
    id: statsLogKey(log, i),
    label: `Fight ${i + 1}`,
    timestamp: i + 1,
    duration: '1:00',
}));

describe('useStatsUploads: slice sidecar robustness', () => {
    let originalElectronAPI: any;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
        useStatsStore.setState({ fightRoster: ROSTER });
        originalElectronAPI = (window as any).electronAPI;
        (window as any).electronAPI = {
            ...originalElectronAPI,
            isR2Configured: async () => ({ configured: true, sliceConfigured: true }),
        };
        warnSpy = vi.spyOn(console, 'warn');
    });

    afterEach(() => {
        (window as any).electronAPI = originalElectronAPI;
        warnSpy.mockRestore();
    });

    it('excludes an evicted log from the sidecar instead of zero-filling it, and warns', async () => {
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs: [GOOD_LOG, EVICTED_LOG],
            stats: {},
            skillUsageData: {},
            activeStatsViewSettings: {},
            embedded: false,
            onWebUpload,
        }));

        await act(async () => {
            await result.current.handleWebUpload();
        });

        const payload = onWebUpload.mock.calls[0][0];
        expect(payload.sliceSidecar.frames.length).toBe(1);
        expect(payload.sliceSidecar.fights.length).toBe(1);
        expect(payload.sliceSidecar.fights[0].id).toBe(statsLogKey(GOOD_LOG, 0));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 log(s)'));
    });

    it('publishes without a slicer (not aborted) when the sidecar build throws', async () => {
        const onWebUpload = vi.fn();
        // A roster entry whose `id` is not a string breaks `Map.get` matching
        // inside `buildSliceSidecar` in a way that still returns undefined
        // rather than throwing — so to force an actual throw we hand the
        // hook a fightRoster that is not an array, which `buildSliceSidecar`
        // (and `mergeFightRoster`) never defends against, since the store
        // always sets it to an array.
        useStatsStore.setState({ fightRoster: null as any });

        const { result } = renderHook(() => useStatsUploads({
            logs: [GOOD_LOG],
            stats: {},
            skillUsageData: {},
            activeStatsViewSettings: {},
            embedded: false,
            onWebUpload,
        }));

        await act(async () => {
            await result.current.handleWebUpload();
        });

        // The publish must still go through...
        expect(onWebUpload).toHaveBeenCalledTimes(1);
        const payload = onWebUpload.mock.calls[0][0];
        // ...just without a slicer.
        expect(payload.sliceSidecar).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Slice sidecar build failed'),
            expect.anything(),
        );
    });
});
