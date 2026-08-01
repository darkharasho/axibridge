import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSectorOwners } from '../useSectorOwners';
import { WVW_MATCH_SETTING_CHANGED_EVENT, __clearMatchCacheForTests } from '../../../stats/utils/sectorOwners';

const matchJson = {
    start_time: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
    maps: [{ id: 95, objectives: [{ id: '95-33', owner: 'Red' }] }],
};

// 5h-old log: within the match window but outside the old fixed 2h freshness
// guard — the exact "set the match after the raid ended" scenario.
const makeLogs = () => ([{
    id: 'l1',
    permalink: '',
    filePath: '/l1.zevtc',
    detailsStatus: 'loaded',
    status: 'success',
    fightName: 'Green Alpine Borderlands',
    uploadTime: Date.now() / 1000 - 5 * 3600,
}] as unknown as ILogData[]);

describe('useSectorOwners settings re-trigger', () => {
    beforeEach(() => {
        __clearMatchCacheForTests();
        (window as any).electronAPI = {
            getSettings: vi.fn(async () => ({ wvwMatchId: null })),
        };
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => matchJson })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('does nothing while the match setting is unset, then recolours existing logs when it changes', async () => {
        let logs = makeLogs();
        const setLogsDeferred = vi.fn((updater: (l: ILogData[]) => ILogData[]) => { logs = updater(logs); });

        renderHook(() => useSectorOwners(logs, setLogsDeferred));

        await waitFor(() => expect((window as any).electronAPI.getSettings).toHaveBeenCalled());
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(logs[0].sectorOwners).toBeUndefined();

        // User picks a match in Settings — the hook must react without a logs change.
        (window as any).electronAPI.getSettings.mockResolvedValue({ wvwMatchId: '1-1' });
        act(() => {
            window.dispatchEvent(new Event(WVW_MATCH_SETTING_CHANGED_EVENT));
        });

        await waitFor(() => expect(logs[0].sectorOwners).toEqual({ 999: 'Red' }));
        expect(globalThis.fetch).toHaveBeenCalledWith('https://api.guildwars2.com/v2/wvw/matches/1-1');
    });
});
