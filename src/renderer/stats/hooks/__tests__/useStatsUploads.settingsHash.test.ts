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
 *
 * Round 2 re-review closed two blind spots in the original version of this
 * test:
 *   1. It read `payload.stats` directly (an in-memory JS object with live
 *      references), never through JSON — but the real transport is
 *      `JSON.stringify` in main and `JSON.parse` in the browser. A value
 *      that hashed fine in memory (e.g. a `Map`/`Set`, `undefined` vs
 *      absent-key, `NaN`) could silently change shape on the wire and never
 *      be caught. Now round-tripped through `JSON.parse(JSON.stringify(...))`
 *      before hashing.
 *   2. Nothing pinned which keys of `payload.stats` the "viewer" reads —
 *      a silent rename of `mvpWeights`/`statsViewSettings`/`disruptionMethod`
 *      would just read `undefined` off the wrong key and the hash would
 *      still "agree" (both sides independently wrong), passing for the
 *      wrong reason. `VIEWER_SETTINGS_KEYS` below is a literal, asserted
 *      list — see `hasOwnProperty` checks — so a rename fails loudly.
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

/** The exact `report.stats` keys a viewer must read to reproduce the
 *  publisher's settingsHash (task-18-brief.md, amended round 2). Pinned as a
 *  literal tuple, in `hashSliceSettings`'s argument order, so a rename on
 *  either the publish or the (future, task-18) read side fails this test. */
const VIEWER_SETTINGS_KEYS = ['mvpWeights', 'statsViewSettings', 'disruptionMethod'] as const;

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

    it('agrees with a simulated viewer hash of the JSON-round-tripped published payload', async () => {
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

        // The real transport: main JSON.stringifies the payload, the browser
        // JSON.parses it. Hash from that round-tripped copy, not the
        // in-memory object, so this test can only pass if the settings
        // actually survive the wire.
        const wireStats = JSON.parse(JSON.stringify(payload.stats));

        // Pin the exact keys a viewer must read — a rename of any of these
        // in `buildReportStats`/`runWebUpload` without a matching update on
        // the read side must fail HERE, loudly, rather than as a silent
        // `undefined`-vs-`undefined` false agreement below.
        for (const key of VIEWER_SETTINGS_KEYS) {
            expect(Object.prototype.hasOwnProperty.call(wireStats, key)).toBe(true);
        }

        // Simulate the viewer: it has no settings of its own in slice mode, so
        // it hashes exactly what the report payload carries.
        const viewerHash = hashSliceSettings(
            wireStats[VIEWER_SETTINGS_KEYS[0]],
            wireStats[VIEWER_SETTINGS_KEYS[1]],
            wireStats[VIEWER_SETTINGS_KEYS[2]],
        );
        expect(wireStats.mvpWeights).toEqual(MVP_WEIGHTS);
        expect(wireStats.disruptionMethod).toBe(DISRUPTION_METHOD);
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

