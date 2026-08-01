import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSectorOwners } from '../useSectorOwners';
import { __clearMatchCacheForTests } from '../../../stats/utils/sectorOwners';

const matchJson = {
    start_time: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    end_time: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
    maps: [{ id: 95, objectives: [{ id: '95-33', owner: 'Red' }] }],
};

const routerFetch = () => vi.fn(async (url: string) => {
    const body =
        url.includes('/wvw/guilds/na') ? { 'AAA-1': '11003' } :
        url.includes('overview?world=11003') ? { id: '1-1' } :
        url.includes('/wvw/matches/1-1') ? matchJson :
        null;
    return { ok: body !== null, json: async () => body };
});

// 5h-old log: within the match window but outside the old fixed 2h freshness
// guard — the exact "review the raid after it ended" scenario.
const makeLogs = (extra: Record<string, unknown> = {}) => ([{
    id: 'l1',
    permalink: '',
    filePath: '/l1.zevtc',
    detailsStatus: 'loaded',
    status: 'success',
    fightName: 'Green Alpine Borderlands',
    uploadTime: Date.now() / 1000 - 5 * 3600,
    ...extra,
}] as unknown as ILogData[]);

describe('useSectorOwners auto detection', () => {
    beforeEach(() => {
        __clearMatchCacheForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('detects the match from stored squad guilds and colours the log', async () => {
        let logs = makeLogs({ squadGuilds: ['AAA-1'] });
        const setLogsDeferred = vi.fn((updater: (l: ILogData[]) => ILogData[]) => { logs = updater(logs); });
        vi.stubGlobal('fetch', routerFetch());

        renderHook(() => useSectorOwners(logs, setLogsDeferred));

        await waitFor(() => expect(logs[0].sectorOwners).toEqual({ 999: 'Red' }));
    });

    it('backfills squad guilds from cached details for logs parsed before extraction existed', async () => {
        let logs = makeLogs();
        const setLogsDeferred = vi.fn((updater: (l: ILogData[]) => ILogData[]) => { logs = updater(logs); });
        vi.stubGlobal('fetch', routerFetch());
        const peekDetails = vi.fn(() => ({
            players: [
                { account: 'a.1', guildID: 'aaa-1' },
                { account: 'b.1', guildID: 'AAA-1' },
            ],
        }));

        renderHook(() => useSectorOwners(logs, setLogsDeferred, peekDetails));

        await waitFor(() => expect(logs[0].sectorOwners).toEqual({ 999: 'Red' }));
        expect(logs[0].squadGuilds).toEqual(['AAA-1']);
    });

    it('does nothing when no guild information is available anywhere', async () => {
        let logs = makeLogs();
        const setLogsDeferred = vi.fn((updater: (l: ILogData[]) => ILogData[]) => { logs = updater(logs); });
        const fetchSpy = routerFetch();
        vi.stubGlobal('fetch', fetchSpy);

        renderHook(() => useSectorOwners(logs, setLogsDeferred, () => undefined));

        await new Promise(r => setTimeout(r, 50));
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(logs[0].sectorOwners).toBeUndefined();
    });
});
