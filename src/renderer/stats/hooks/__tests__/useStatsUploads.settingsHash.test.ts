/**
 * Task 15 review round 1, finding 1 (Critical): the publisher hashed its
 * *live* `mvpWeights`/`disruptionMethod` while the viewer (per the task-18
 * spec) would hash whatever the published report carries — which, before
 * this fix, was nothing for either field. `SliceSettingsMismatchError` fired
 * on every real report and the slicer never ran.
 *
 * Ruling R15-2: carry the settings triple (`mvpWeights`, `statsViewSettings`,
 * `disruptionMethod`) in the published payload, and have `buildSliceSidecar`
 * hash from exactly those payload-carried values (not from the raw hook
 * props). This pins that invariant end to end: render the real hook, capture
 * the real `onWebUpload` payload, and hash a simulated viewer read of
 * `payload.stats` — it must agree with `payload.sliceSidecar.settingsHash`.
 * A second case proves the hash actually discriminates: sidecar built under
 * different settings than the payload records must NOT agree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { useStatsUploads } from '../useStatsUploads';
import { useStatsStore } from '../../statsStore';
import { statsLogKey } from '../../utils/statsLogKey';
import { hashSliceSettings } from '../../slice/sliceSettingsHash';
import { buildSliceSidecar } from '../../slice/buildSliceSidecar';

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

const MVP_WEIGHTS = { damage: 0.4, cleanses: 0.3, strips: 0.3 };
const DISRUPTION_METHOD = 'strips-and-interrupts';

describe('useStatsUploads: publish-time slice settings hash', () => {
    let originalElectronAPI: any;

    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
        useStatsStore.setState({ fightRoster: ROSTER });
        originalElectronAPI = (window as any).electronAPI;
        (window as any).electronAPI = {
            ...originalElectronAPI,
            isR2Configured: async () => ({ configured: true }),
        };
    });

    afterEach(() => {
        (window as any).electronAPI = originalElectronAPI;
    });

    it('agrees with a simulated viewer hash of the published payload', async () => {
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs: [LOG],
            stats: {},
            skillUsageData: {},
            activeStatsViewSettings: { someSetting: true },
            mvpWeights: MVP_WEIGHTS,
            disruptionMethod: DISRUPTION_METHOD,
            embedded: false,
            onWebUpload,
        }));

        await act(async () => {
            await result.current.handleWebUpload();
        });

        expect(onWebUpload).toHaveBeenCalledTimes(1);
        const payload = onWebUpload.mock.calls[0][0];
        expect(payload.sliceSidecar).toBeTruthy();

        // Simulate the viewer: it has no settings of its own in slice mode, so
        // it hashes exactly what the report payload carries.
        const viewerHash = hashSliceSettings(
            payload.stats.mvpWeights,
            payload.stats.statsViewSettings,
            payload.stats.disruptionMethod,
        );
        expect(payload.stats.mvpWeights).toEqual(MVP_WEIGHTS);
        expect(payload.stats.disruptionMethod).toBe(DISRUPTION_METHOD);
        expect(viewerHash).toBe(payload.sliceSidecar.settingsHash);
    });

    it('does NOT agree when the sidecar was built under different settings than the payload records', () => {
        const publishedHash = hashSliceSettings(MVP_WEIGHTS, { someSetting: true }, DISRUPTION_METHOD);

        const staleSidecar = buildSliceSidecar({
            logs: [LOG],
            roster: ROSTER,
            mvpWeights: MVP_WEIGHTS,
            statsViewSettings: { someSetting: false }, // drifted from what was published
            disruptionMethod: DISRUPTION_METHOD,
        });

        expect(staleSidecar.settingsHash).not.toBe(publishedHash);
    });
});

