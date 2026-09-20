/**
 * `runWebUpload` (behind `handleWebUpload`) builds `logIds` for the publish
 * payload from the logs passed in. That used to read `l.permalink` directly;
 * it must now go through `shareIdentity` so a log's own share link
 * (`shareUrl`) takes priority over its dps.report `permalink`, while a log
 * that only has a `permalink` (the thousands of already-persisted logs) still
 * contributes its permalink.
 *
 * Both logs below are constructed so the two implementations diverge:
 * `l.permalink` directly would emit the dps.report links for both, whereas
 * `shareIdentity` must emit the share link for the first log and fall back to
 * the permalink for the second.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatsUploads } from '../useStatsUploads';
import { useStatsStore } from '../../statsStore';

describe('useStatsUploads: logIds prefer shareUrl over permalink', () => {
    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
    });

    it('emits shareUrl when present and falls back to permalink otherwise', async () => {
        const logs = [
            {
                id: 'log-with-share',
                filePath: 'with-share.zevtc',
                shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2',
                permalink: 'https://dps.report/should-not-be-used',
            },
            {
                id: 'log-legacy',
                filePath: 'legacy.zevtc',
                permalink: 'https://dps.report/legacy-abc',
            },
        ];
        const onWebUpload = vi.fn();
        const { result } = renderHook(() => useStatsUploads({
            logs,
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
        const payload = onWebUpload.mock.calls[0][0];
        expect(payload.logIds).toEqual([
            'https://bridge.axi.link/r/k3Xm9qR2',
            'https://dps.report/legacy-abc',
        ]);
    });
});
