import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWvwMatchOptions, fetchMatchSectorOwners, fetchMatchWindow, pickSnapshotCandidates, __clearMatchCacheForTests } from '../utils/sectorOwners';
import { WvwMap } from '../../../shared/wvwLandmarks';

describe('buildWvwMatchOptions', () => {
    it('sorts NA before EU, tiers ascending, with readable labels', () => {
        expect(buildWvwMatchOptions(['2-1', '1-3', '2-5', '1-1'])).toEqual([
            { value: '1-1', label: 'NA — Tier 1' },
            { value: '1-3', label: 'NA — Tier 3' },
            { value: '2-1', label: 'EU — Tier 1' },
            { value: '2-5', label: 'EU — Tier 5' },
        ]);
    });
    it('ignores malformed ids', () => {
        expect(buildWvwMatchOptions(['bogus', '3-1', '1-2'])).toEqual([{ value: '1-2', label: 'NA — Tier 2' }]);
    });
});

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
});
