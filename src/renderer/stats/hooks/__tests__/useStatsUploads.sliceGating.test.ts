/**
 * Task 15 review round 1, ruling R15-3: the slice sidecar build (not just its
 * gzip) must be gated on an R2-configured check queried over IPC. Building
 * it unconditionally means a fresh per-fight aggregation pass plus a
 * multi-MB structured clone over `upload-web-report` on every single
 * publish, even when the sidecar is provably going to be dropped in main
 * (`planSidecarHosting` never falls back to Pages for `kind: 'slice'`).
 *
 * This pins: no R2 configured (or the check unavailable) → no `sliceSidecar`
 * key in the `onWebUpload` payload at all. R2 configured → it's present.
 *
 * The gate reads `sliceConfigured`, not `configured`: replay and slice hosting
 * are separately switchable, so R2 can be connected and hosting replays while
 * the user has switched the slicer off — and that must skip the build too.
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

const LOG = { id: 'log-0', filePath: 'test-0.zevtc', details: fixtureDetails };
const ROSTER = [{
    id: statsLogKey(LOG, 0),
    label: 'Fight 1',
    timestamp: 1,
    duration: '1:00',
}];

describe('useStatsUploads: R2-gated slice sidecar build', () => {
    let originalElectronAPI: any;

    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
        useStatsStore.setState({ fightRoster: ROSTER });
        originalElectronAPI = (window as any).electronAPI;
    });

    afterEach(() => {
        (window as any).electronAPI = originalElectronAPI;
    });

    const publish = async () => {
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs: [LOG],
            stats: {},
            skillUsageData: {},
            activeStatsViewSettings: {},
            embedded: false,
            onWebUpload,
        }));
        await act(async () => {
            await result.current.handleWebUpload();
        });
        expect(onWebUpload).toHaveBeenCalledTimes(1);
        return onWebUpload.mock.calls[0][0];
    };

    it('omits sliceSidecar when R2 is not configured', async () => {
        (window as any).electronAPI = {
            ...originalElectronAPI,
            isR2Configured: async () => ({ configured: false, sliceConfigured: false }),
        };
        const payload = await publish();
        expect(payload.sliceSidecar).toBeUndefined();
    });

    it('omits sliceSidecar when the R2-configured check is unavailable (older preload)', async () => {
        (window as any).electronAPI = { ...originalElectronAPI };
        delete (window as any).electronAPI.isR2Configured;
        const payload = await publish();
        expect(payload.sliceSidecar).toBeUndefined();
    });

    it('includes sliceSidecar when R2 is configured', async () => {
        (window as any).electronAPI = {
            ...originalElectronAPI,
            isR2Configured: async () => ({ configured: true, sliceConfigured: true }),
        };
        const payload = await publish();
        expect(payload.sliceSidecar).toBeTruthy();
        expect(payload.sliceSidecar.frames.length).toBe(1);
    });

    it('omits sliceSidecar when R2 hosts replays but the slicer is switched off', async () => {
        // The expensive half of the split: with slice hosting off, main would
        // drop the sidecar anyway, so building it is pure wasted work — a
        // per-fight aggregation pass and a multi-MB clone over IPC.
        (window as any).electronAPI = {
            ...originalElectronAPI,
            isR2Configured: async () => ({
                configured: true,
                credentialsPresent: true,
                replayConfigured: true,
                sliceConfigured: false,
            }),
        };
        const payload = await publish();
        expect(payload.sliceSidecar).toBeUndefined();
        // The two settings keys ride along ONLY to reproduce the sidecar's
        // settingsHash; with no sidecar they are bloat in report.json.
        expect(payload.stats.mvpWeights).toBeUndefined();
        expect(payload.stats.disruptionMethod).toBeUndefined();
    });
});
