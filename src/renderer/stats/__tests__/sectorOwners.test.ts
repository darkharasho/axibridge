import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectSquadGuilds, detectWvwMatchId, fetchMatchSectorOwners, fetchMatchWindow, pickSnapshotCandidates, __clearMatchCacheForTests } from '../utils/sectorOwners';
import { WvwMap } from '../../../shared/wvwLandmarks';

const matchJson = {
    start_time: '2027-01-15T02:00:00Z',
    end_time: '2027-01-22T01:58:00Z',
    maps: [
        { id: 95, objectives: [{ id: '95-33', owner: 'Red' }, { id: '95-53', owner: 'Green' }, { id: '95-9999', owner: 'Blue' }] },
        { id: 38, objectives: [{ id: '38-9', owner: 'Blue' }] },
    ],
};
const okFetch = () => vi.fn(async () => ({ ok: true, json: async () => matchJson })) as unknown as typeof fetch;

describe('fetchMatchSectorOwners', () => {
    beforeEach(() => __clearMatchCacheForTests());

    it('maps objective owners to sector ids for the requested map', async () => {
        const owners = await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, okFetch());
        expect(owners?.[999]).toBe('Red');          // 95-33 -> sector 999
        expect(Object.values(owners ?? {})).not.toContain('Blue'); // unknown objective 95-9999 skipped
    });

    it('returns null when the map is missing from the match or the fetch fails', async () => {
        const failFetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        expect(await fetchMatchSectorOwners('1-1', WvwMap.RedBorderlands, okFetch())).toBeNull();
        __clearMatchCacheForTests();
        expect(await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, failFetch)).toBeNull();
    });

    it('caches the match response for subsequent calls', async () => {
        const f = okFetch();
        await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, f);
        await fetchMatchSectorOwners('1-1', WvwMap.EternalBattlegrounds, f);
        expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    });
});

describe('fetchMatchWindow', () => {
    beforeEach(() => __clearMatchCacheForTests());

    it('parses the match start/end times', async () => {
        const window = await fetchMatchWindow('1-1', okFetch());
        expect(window).toEqual({
            startMs: Date.parse('2027-01-15T02:00:00Z'),
            endMs: Date.parse('2027-01-22T01:58:00Z'),
        });
    });

    it('shares the cached match fetch with the owners lookup', async () => {
        const f = okFetch();
        await fetchMatchWindow('1-1', f);
        await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, f);
        expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    });

    it('returns null on fetch failure or missing times', async () => {
        const failFetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        expect(await fetchMatchWindow('1-1', failFetch)).toBeNull();
        __clearMatchCacheForTests();
        const noTimes = vi.fn(async () => ({ ok: true, json: async () => ({ maps: [] }) })) as unknown as typeof fetch;
        expect(await fetchMatchWindow('1-1', noTimes)).toBeNull();
    });
});

describe('detectWvwMatchId', () => {
    beforeEach(() => __clearMatchCacheForTests());

    const guildsNa = { 'AAA-1': '11003', 'BBB-2': '11005' };
    const guildsEu = { 'CCC-3': '12002' };
    const routerFetch = () => vi.fn(async (url: string) => {
        const body =
            url.includes('/wvw/guilds/na') ? guildsNa :
            url.includes('/wvw/guilds/eu') ? guildsEu :
            url.includes('overview?world=11003') ? { id: '1-4' } :
            url.includes('overview?world=12002') ? { id: '2-2' } :
            null;
        return { ok: body !== null, json: async () => body };
    }) as unknown as typeof fetch;

    it('resolves the NA match by majority guild vote, case-insensitively', async () => {
        expect(await detectWvwMatchId(['aaa-1', 'AAA-1', 'BBB-2'], routerFetch())).toBe('1-4');
    });

    it('falls back to EU when no NA guild matches', async () => {
        expect(await detectWvwMatchId(['CCC-3'], routerFetch())).toBe('2-2');
    });

    it('returns null when no region knows any of the guilds', async () => {
        expect(await detectWvwMatchId(['ZZZ-9'], routerFetch())).toBeNull();
    });

    it('caches the guild-team map across detections', async () => {
        const f = routerFetch();
        await detectWvwMatchId(['AAA-1'], f);
        await detectWvwMatchId(['AAA-1'], f);
        const calls = (f as unknown as { mock: { calls: [string][] } }).mock.calls.map(c => String(c[0]));
        expect(calls.filter(u => u.includes('/wvw/guilds/na')).length).toBe(1);
    });
});

describe('collectSquadGuilds', () => {
    it('aggregates guild votes across successful logs, most common first', () => {
        const logs = [
            { status: 'success', squadGuilds: ['G1', 'G2'] },
            { status: 'success', squadGuilds: ['G2'] },
            { status: 'uploading', squadGuilds: ['G3'] },
            { status: 'success' },
        ] as unknown as ILogData[];
        expect(collectSquadGuilds(logs)).toEqual(['G2', 'G1']);
    });
});

describe('pickSnapshotCandidates', () => {
    const startMs = Date.parse('2027-01-15T02:00:00Z');
    const endMs = Date.parse('2027-01-22T01:58:00Z');
    const window = { startMs, endMs };
    const midMatch = (startMs + 3 * 24 * 3600 * 1000) / 1000;
    const base = { id: 'a', permalink: '', filePath: '/x.zevtc', detailsStatus: 'loaded' } as const;

    it('picks successful WvW logs without owners uploaded within the match window', () => {
        const logs = [
            // 5h-old log from earlier tonight — must still colour (regression:
            // the old fixed 2h guard excluded a whole evening's raid).
            { ...base, id: 'tonight', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: midMatch - 5 * 3600 },
            { ...base, id: 'lastweek', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: startMs / 1000 - 3600 },
            { ...base, id: 'nextweek', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: endMs / 1000 + 3600 },
            { ...base, id: 'has', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: midMatch, sectorOwners: { 1: 'Red' } },
            { ...base, id: 'notwvw', status: 'success', fightName: 'Edge of the Mists', uploadTime: midMatch },
            { ...base, id: 'pending', status: 'uploading', fightName: 'Green Alpine Borderlands', uploadTime: midMatch },
        ] as unknown as ILogData[];
        expect(pickSnapshotCandidates(logs, window).map(l => l.id)).toEqual(['tonight']);
    });

    it('falls back to the arcdps filename timestamp when uploadTime is missing (rehydrated logs)', () => {
        // Filename timestamps are local time; build the window around the same
        // local-time parse so the test is timezone-agnostic.
        const fileMs = new Date(2026, 6, 31, 20, 10, 12).getTime();
        const fileWindow = { startMs: fileMs - 24 * 3600 * 1000, endMs: fileMs + 24 * 3600 * 1000 };
        const logs = [
            { ...base, id: 'rehydrated', filePath: '/logs/20260731-201012.zevtc', status: 'success', fightName: 'Green Alpine Borderlands' },
            { ...base, id: 'outside', filePath: '/logs/20260601-201012.zevtc', status: 'success', fightName: 'Green Alpine Borderlands' },
            { ...base, id: 'unknowable', filePath: '/logs/whatever.zevtc', status: 'success', fightName: 'Green Alpine Borderlands' },
        ] as unknown as ILogData[];
        expect(pickSnapshotCandidates(logs, fileWindow).map(l => l.id)).toEqual(['rehydrated']);
    });
});
