/**
 * Task 15 review round 2, finding 1: `buildReportStats` attached
 * `mvpWeights`/`disruptionMethod` to the published `stats` UNCONDITIONALLY,
 * so every no-R2 publish wrote two extra keys into `report.json` — a
 * regression against the spec-level guarantee "with no R2 the report
 * publishes byte-for-byte as it does today." The reviewer's probe on the
 * regressed commit:
 *
 *   31fcf656  keys=[foo,skillUsageData,statsViewSettings,mvpWeights,disruptionMethod,fightDiffMode] bytes=3440
 *   f6726445  keys=[foo,skillUsageData,statsViewSettings,fightDiffMode]                             bytes=3369
 *
 * Ruling R15-5: attach the settings pair to `uploadStats` ONLY when R2 is
 * confirmed configured (the only case a sidecar — and therefore a viewer
 * that needs to reproduce the hash — exists at all). This is a permanent
 * regression test for that: it must FAIL if the fields ever leak back onto
 * the no-R2 path, and its positive control proves it isn't just vacuously
 * passing (R2-configured publishes DO carry them, and DO cost more bytes).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatsUploads } from '../useStatsUploads';
import { useStatsStore } from '../../statsStore';

const LOG = { id: 'log-0', filePath: 'test-0.zevtc', permalink: 'https://dps.report/x' };
const ROSTER = [{ id: 'test-0.zevtc', label: 'Fight 1', timestamp: 1, duration: '1:00' }];

const BASE_STATS = { foo: 'bar', fightDiffMode: [{ a: 1 }] };
const MVP_WEIGHTS = { damage: 0.4, cleanses: 0.3, strips: 0.3 };
const DISRUPTION_METHOD = 'strips-and-interrupts';

describe('useStatsUploads: byte-identical-without-R2 (settings-triple bloat)', () => {
    let originalElectronAPI: any;

    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
        useStatsStore.setState({ fightRoster: ROSTER });
        originalElectronAPI = (window as any).electronAPI;
    });

    afterEach(() => {
        (window as any).electronAPI = originalElectronAPI;
    });

    const publish = async (configured: boolean | undefined) => {
        (window as any).electronAPI = {
            ...originalElectronAPI,
            ...(configured === undefined ? {} : { isR2Configured: async () => ({ configured }) }),
        };
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs: [LOG],
            stats: BASE_STATS,
            skillUsageData: {},
            activeStatsViewSettings: {},
            mvpWeights: MVP_WEIGHTS,
            disruptionMethod: DISRUPTION_METHOD,
            embedded: false,
            onWebUpload,
        }));
        await act(async () => {
            await result.current.handleWebUpload();
        });
        expect(onWebUpload).toHaveBeenCalledTimes(1);
        return onWebUpload.mock.calls[0][0];
    };

    it('no R2 configured: published stats carries no settings-triple bloat', async () => {
        const payload = await publish(false);
        const keys = Object.keys(payload.stats).sort();
        const bytes = JSON.stringify(payload.stats).length;
        console.info(`[byte-probe] no-R2   keys=[${keys.join(',')}] bytes=${bytes}`);

        expect(keys).not.toContain('mvpWeights');
        expect(keys).not.toContain('disruptionMethod');
        // Exactly what the report would have carried before this feature
        // ever existed (skillUsageData/statsViewSettings were already always
        // added by `buildReportStats`; those two are the ones under test).
        expect(keys).toEqual(['fightDiffMode', 'foo', 'skillUsageData', 'statsViewSettings']);
    });

    it('positive control — R2 configured: published stats DOES carry the settings triple, and costs more bytes', async () => {
        const noR2Payload = await publish(false);
        const r2Payload = await publish(true);

        const noR2Keys = Object.keys(noR2Payload.stats).sort();
        const r2Keys = Object.keys(r2Payload.stats).sort();
        const noR2Bytes = JSON.stringify(noR2Payload.stats).length;
        const r2Bytes = JSON.stringify(r2Payload.stats).length;
        console.info(`[byte-probe] no-R2   keys=[${noR2Keys.join(',')}] bytes=${noR2Bytes}`);
        console.info(`[byte-probe] R2      keys=[${r2Keys.join(',')}] bytes=${r2Bytes}`);

        expect(r2Keys).toContain('mvpWeights');
        expect(r2Keys).toContain('disruptionMethod');
        expect(r2Payload.stats.mvpWeights).toEqual(MVP_WEIGHTS);
        expect(r2Payload.stats.disruptionMethod).toBe(DISRUPTION_METHOD);
        // Proves the probe can actually see a difference, not passing vacuously.
        expect(r2Bytes).toBeGreaterThan(noR2Bytes);
    });
});
