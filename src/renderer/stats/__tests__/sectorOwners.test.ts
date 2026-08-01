import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWvwMatchOptions, fetchMatchSectorOwners, pickSnapshotCandidates, SNAPSHOT_MAX_AGE_MS, __clearMatchCacheForTests } from '../utils/sectorOwners';
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

describe('pickSnapshotCandidates', () => {
    const now = 1_800_000_000_000;
    const base = { id: 'a', permalink: '', filePath: '/x.zevtc', detailsStatus: 'loaded' } as const;

    it('picks recent successful WvW logs without owners', () => {
        const logs = [
            { ...base, id: 'fresh', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - 600 },
            { ...base, id: 'stale', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - SNAPSHOT_MAX_AGE_MS / 1000 - 60 },
            { ...base, id: 'has', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - 600, sectorOwners: { 1: 'Red' } },
            { ...base, id: 'notwvw', status: 'success', fightName: 'Edge of the Mists', uploadTime: now / 1000 - 600 },
            { ...base, id: 'pending', status: 'uploading', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - 600 },
        ] as unknown as ILogData[];
        expect(pickSnapshotCandidates(logs, now).map(l => l.id)).toEqual(['fresh']);
    });
});
