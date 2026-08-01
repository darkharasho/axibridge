// Zone-colour ownership helpers: match picker options (Task 4) and the
// per-log sector ownership snapshot (Task 5).

import { WvwMap } from '../../../shared/wvwLandmarks';
import { OBJECTIVE_SECTORS, WVW_MAP_IDS, type WvwOwner } from '../../../shared/wvwSectors';
import { resolveMapFromZone } from '../../../shared/mapUtils';

const REGION_NAMES: Record<string, string> = { '1': 'NA', '2': 'EU' };

export function buildWvwMatchOptions(ids: string[]): { value: string; label: string }[] {
    return ids
        .map(id => {
            const m = /^([12])-(\d+)$/.exec(id);
            return m ? { value: id, region: Number(m[1]), tier: Number(m[2]) } : null;
        })
        .filter((v): v is { value: string; region: number; tier: number } => v !== null)
        .sort((a, b) => a.region - b.region || a.tier - b.tier)
        .map(v => ({ value: v.value, label: `${REGION_NAMES[String(v.region)]} — Tier ${v.tier}` }));
}

export const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MATCH_CACHE_TTL_MS = 60 * 1000;

let matchCache: { matchId: string; at: number; promise: Promise<unknown> } | null = null;
export function __clearMatchCacheForTests(): void { matchCache = null; }

async function getMatch(matchId: string, fetchImpl: typeof fetch): Promise<unknown> {
    const now = Date.now();
    if (matchCache && matchCache.matchId === matchId && now - matchCache.at < MATCH_CACHE_TTL_MS) {
        return matchCache.promise;
    }
    const promise = fetchImpl(`https://api.guildwars2.com/v2/wvw/matches/${matchId}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    matchCache = { matchId, at: now, promise };
    return promise;
}

export async function fetchMatchSectorOwners(
    matchId: string,
    mapKey: WvwMap,
    fetchImpl: typeof fetch = fetch,
): Promise<Record<number, WvwOwner> | null> {
    const match = await getMatch(matchId, fetchImpl) as { maps?: { id: number; objectives?: { id: string; owner: WvwOwner }[] }[] } | null;
    const map = match?.maps?.find(m => m.id === WVW_MAP_IDS[mapKey]);
    if (!map?.objectives?.length) return null;
    const owners: Record<number, WvwOwner> = {};
    for (const obj of map.objectives) {
        const sectorId = OBJECTIVE_SECTORS[obj.id];
        if (sectorId !== undefined && obj.owner) owners[sectorId] = obj.owner;
    }
    return Object.keys(owners).length ? owners : null;
}

/** Fresh, finished WvW logs that still need an ownership snapshot. */
export function pickSnapshotCandidates(logs: ILogData[], nowMs: number): ILogData[] {
    return logs.filter(log => {
        if (log.status !== 'success' || log.sectorOwners || !log.fightName) return false;
        if (!resolveMapFromZone(log.fightName)) return false;
        const uploadedAtMs = (log.uploadTime ?? 0) * 1000;
        return uploadedAtMs > 0 && nowMs - uploadedAtMs < SNAPSHOT_MAX_AGE_MS;
    });
}
