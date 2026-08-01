// Zone-colour ownership helpers: match picker options (Task 4) and the
// per-log sector ownership snapshot (Task 5).

import { WvwMap } from '../../../shared/wvwLandmarks';
import { OBJECTIVE_SECTORS, WVW_MAP_IDS, type WvwOwner } from '../../../shared/wvwSectors';
import { resolveMapFromZone } from '../../../shared/mapUtils';

const REGION_NAMES: Record<string, string> = { '1': 'NA', '2': 'EU' };

/**
 * Window event dispatched when the wvwMatchId setting changes, so
 * useSectorOwners can re-evaluate existing logs without waiting for the next
 * logs-array change (setting the match after tonight's logs were processed
 * would otherwise stay neutral until another log arrived or an app restart).
 */
export const WVW_MATCH_SETTING_CHANGED_EVENT = 'axibridge:wvw-match-setting-changed';

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

const MATCH_CACHE_TTL_MS = 60 * 1000;

export interface MatchWindow {
    startMs: number;
    endMs: number;
}

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

/**
 * The configured match's live window. A log is snapshot-eligible when it was
 * uploaded during this window — a fixed freshness cutoff (the original 2h
 * guard) wrongly left a whole evening's raid neutral once the raid was a few
 * hours past, while the real correctness boundary is "same match week".
 */
export async function fetchMatchWindow(
    matchId: string,
    fetchImpl: typeof fetch = fetch,
): Promise<MatchWindow | null> {
    const match = await getMatch(matchId, fetchImpl) as { start_time?: string; end_time?: string } | null;
    const startMs = match?.start_time ? Date.parse(match.start_time) : NaN;
    const endMs = match?.end_time ? Date.parse(match.end_time) : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return { startMs, endMs };
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

/** Finished WvW logs uploaded within the match window that still need an ownership snapshot. */
export function pickSnapshotCandidates(logs: ILogData[], window: MatchWindow): ILogData[] {
    return logs.filter(log => {
        if (log.status !== 'success' || log.sectorOwners || !log.fightName) return false;
        if (!resolveMapFromZone(log.fightName)) return false;
        const uploadedAtMs = (log.uploadTime ?? 0) * 1000;
        return uploadedAtMs >= window.startMs && uploadedAtMs <= window.endMs;
    });
}
