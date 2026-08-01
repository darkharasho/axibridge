// Zone-colour ownership helpers: match picker options (Task 4) and the
// per-log sector ownership snapshot (Task 5).

import { WvwMap } from '../../../shared/wvwLandmarks';
import { OBJECTIVE_SECTORS, WVW_MAP_IDS, type WvwOwner } from '../../../shared/wvwSectors';
import { resolveMapFromZone } from '../../../shared/mapUtils';


const MATCH_CACHE_TTL_MS = 60 * 1000;
const GUILD_MAP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface MatchWindow {
    startMs: number;
    endMs: number;
}

let matchCache: { matchId: string; at: number; promise: Promise<unknown> } | null = null;
const guildMapCache = new Map<string, { at: number; promise: Promise<Record<string, string> | null> }>();
const overviewCache = new Map<string, { at: number; promise: Promise<string | null> }>();
export function __clearMatchCacheForTests(): void {
    matchCache = null;
    guildMapCache.clear();
    overviewCache.clear();
}

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

function getGuildTeamMap(region: string, fetchImpl: typeof fetch): Promise<Record<string, string> | null> {
    const now = Date.now();
    const cached = guildMapCache.get(region);
    if (cached && now - cached.at < GUILD_MAP_CACHE_TTL_MS) return cached.promise;
    const promise = fetchImpl(`https://api.guildwars2.com/v2/wvw/guilds/${region}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    guildMapCache.set(region, { at: now, promise });
    return promise;
}

function getOverviewMatchId(teamId: string, fetchImpl: typeof fetch): Promise<string | null> {
    const now = Date.now();
    const cached = overviewCache.get(teamId);
    if (cached && now - cached.at < MATCH_CACHE_TTL_MS) return cached.promise;
    const promise = fetchImpl(`https://api.guildwars2.com/v2/wvw/matches/overview?world=${teamId}`)
        .then(r => (r.ok ? r.json() : null))
        .then((overview: { id?: string } | null) => overview?.id ?? null)
        .catch(() => null);
    overviewCache.set(teamId, { at: now, promise });
    return promise;
}

/**
 * Zero-config match detection: squad guild ids → GW2's guild→team mapping
 * (`/v2/wvw/guilds/{region}`) → team with the most guild votes → that team's
 * current match. Self-corrects after weekly relinks since it re-resolves from
 * live data. Returns null when no region knows any of the guilds.
 */
export async function detectWvwMatchId(guildIds: string[], fetchImpl: typeof fetch = fetch): Promise<string | null> {
    const wanted = guildIds.map(id => id.toUpperCase());
    for (const region of ['na', 'eu']) {
        const map = await getGuildTeamMap(region, fetchImpl);
        if (!map) continue;
        const votes = new Map<string, number>();
        for (const guildId of wanted) {
            const teamId = map[guildId];
            if (teamId) votes.set(teamId, (votes.get(teamId) ?? 0) + 1);
        }
        if (!votes.size) continue;
        const topTeam = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const matchId = await getOverviewMatchId(topTeam, fetchImpl);
        if (matchId) return matchId;
    }
    return null;
}

/** Guild ids across successful logs, most common first — the auto-detect input. */
export function collectSquadGuilds(logs: ILogData[]): string[] {
    const counts = new Map<string, number>();
    for (const log of logs) {
        if (log.status !== 'success' || !Array.isArray(log.squadGuilds)) continue;
        for (const guildId of log.squadGuilds) {
            counts.set(guildId, (counts.get(guildId) ?? 0) + 1);
        }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([guildId]) => guildId);
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
