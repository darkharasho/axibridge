import { WvwMap, findNearestLandmark } from './wvwLandmarks';
import {
    getArena, getPositionTracks, replayCanvas, worldToPixel,
} from '@axiapps/bridge-metrics/nativePositioning';
import { squadEntities, enemyPlayerEntities } from '@axiapps/bridge-metrics/nativeRoster';

const ZONE_PREFIXES = ['Detailed WvW - ', 'World vs World - ', 'WvW - '];

function stripPrefix(zone: string): string {
    for (const prefix of ZONE_PREFIXES) {
        if (zone.startsWith(prefix)) return zone.slice(prefix.length);
    }
    return zone;
}

/**
 * `CBTS_MAPID` -> map key, for the maps whose NAME is not enough.
 *
 * axilog names only the five WvW maps GW2EI has a combat-replay case for;
 * every other id -- Obsidian Sanctum among them -- falls back to the generic
 * `"World vs World"`, so no amount of string matching can identify it. The id
 * is carried on `native.encounter.map_id`.
 */
const MAP_ID_TO_KEY: Record<number, WvwMap> = {
    38: WvwMap.EternalBattlegrounds,
    95: WvwMap.GreenBorderlands,
    96: WvwMap.BlueBorderlands,
    899: WvwMap.ObsidianSanctum,
    1099: WvwMap.RedBorderlands,
};

/**
 * Whole-word match. A bare substring test let PvE encounter names through:
 * "Conjured Amalgamate" contains "red" and was labelled Red BL.
 */
const hasWord = (clean: string, word: string) => new RegExp(`\\b${word}\\b`).test(clean);

export function resolveMapFromZone(zone: string): WvwMap | null {
    const clean = stripPrefix(zone).toLowerCase();
    if (hasWord(clean, 'eternal') || clean === 'ebg') return WvwMap.EternalBattlegrounds;
    if (hasWord(clean, 'obsidian') || hasWord(clean, 'sanctum') || clean === 'os') return WvwMap.ObsidianSanctum;
    if (hasWord(clean, 'green')) return WvwMap.GreenBorderlands;
    if (hasWord(clean, 'blue')) return WvwMap.BlueBorderlands;
    if (hasWord(clean, 'red')) return WvwMap.RedBorderlands;
    return null;
}

/**
 * Resolve the map from a details object, preferring the native map id over
 * the zone string.
 *
 * The id path is what makes Obsidian Sanctum resolvable at all, and it also
 * works on logs parsed before {@link applyEiCompatShims} learned to rewrite
 * the generic name -- their stored `fightName` still says "World vs World".
 */
export function resolveMapFromDetails(details: any, zone: string): WvwMap | null {
    const mapId = Number(details?.native?.encounter?.map_id);
    if (Number.isFinite(mapId) && MAP_ID_TO_KEY[mapId]) return MAP_ID_TO_KEY[mapId];
    return resolveMapFromZone(zone);
}

export function normalizeMapName(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (hasWord(clean, 'eternal')) return 'Eternal Battlegrounds';
    if (hasWord(clean, 'obsidian') || hasWord(clean, 'sanctum')) return 'Obsidian Sanctum';
    if (hasWord(clean, 'green')) return 'Green Borderlands';
    if (hasWord(clean, 'blue')) return 'Blue Borderlands';
    if (hasWord(clean, 'red')) return 'Red Borderlands';
    return stripPrefix(zone);
}

export function normalizeMapNameShort(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (hasWord(clean, 'eternal') || clean === 'ebg') return 'EBG';
    if (hasWord(clean, 'obsidian') || hasWord(clean, 'sanctum')) return 'OS';
    if (hasWord(clean, 'green')) return 'Green BL';
    if (hasWord(clean, 'blue')) return 'Blue BL';
    if (hasWord(clean, 'red')) return 'Red BL';
    return stripPrefix(zone);
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function medianPosition(positions: Array<[number, number]>): [number, number] | null {
    if (!positions.length) return null;
    const xs = positions.map(p => p[0]).sort((a, b) => a - b);
    const ys = positions.map(p => p[1]).sort((a, b) => a - b);
    const mid = Math.floor(positions.length / 2);
    return [xs[mid], ys[mid]];
}

/** A squad member's replay path: `[t_ms, pixelX, pixelY]` per sample, EI canvas pixel space. */
export type PixelSample = [number, number, number];

/**
 * Every squad member's replay path, in EI canvas pixel space.
 *
 * Pixels rather than world inches because that is the space
 * `wvwLandmarks.ts` and `wvwTiles.ts`'s `pixelOffset` are calibrated in;
 * see REPLAY_CANVAS_MAX in nativePositioning for why.
 */
export function squadPixelTracks(details: any): PixelSample[][] {
    const arena = getArena(details);
    if (!arena) return [];
    const tracks = getPositionTracks(details);
    if (tracks.size === 0) return [];
    const canvas = replayCanvas(arena);
    const report = details?.native ?? {};

    const out: PixelSample[][] = [];
    for (const entity of squadEntities(report)) {
        const samples = tracks.get(entity.id)?.samples;
        if (!samples?.length) continue;
        out.push(samples.map(([t, x, y]) => {
            const [px, py] = worldToPixel(arena, x, y, canvas);
            return [t, px, py] as PixelSample;
        }));
    }
    return out;
}

/**
 * A representative position for the fight, in render-canvas pixels.
 *
 * Pixels rather than world inches because the only consumer is
 * `findNearestLandmark`, whose table is calibrated in that space. Preference
 * order is unchanged: the commander, then any squad member, then any enemy —
 * enemy tracks exist even in logs where no squad member was tracked, and they
 * are close enough to name the nearest objective.
 */
export function computeFightAvgPosition(details: any): [number, number] | null {
    const arena = getArena(details);
    if (!arena) return null;
    const tracks = getPositionTracks(details);
    if (tracks.size === 0) return null;
    const canvas = replayCanvas(arena);
    const report = details?.native ?? {};

    const pixelsFor = (entityId: number): Array<[number, number]> | null => {
        const samples = tracks.get(entityId)?.samples;
        if (!samples?.length) return null;
        return samples.map(([, x, y]) => worldToPixel(arena, x, y, canvas));
    };

    const squad = squadEntities(report);
    const commander = squad.find(
        (e: any) => Array.isArray(e?.commander?.segments) && e.commander.segments.length > 0,
    );
    for (const candidate of [
        ...(commander ? [commander] : []),
        ...squad,
        ...enemyPlayerEntities(report),
    ]) {
        const pixels = pixelsFor(candidate.id);
        if (pixels) return medianPosition(pixels);
    }
    return null;
}

export interface FightLabelInputs {
    zone: string;
    durationMs?: number;
    avgPosition?: [number, number] | null;
}

export function buildFightLabelV2(inputs: FightLabelInputs): string {
    const zoneRaw = inputs.zone ?? '';
    const clean = stripPrefix(String(zoneRaw)).trim();
    const map = resolveMapFromZone(zoneRaw);

    let baseName: string;
    if (map) {
        const shortMap = normalizeMapNameShort(zoneRaw);
        const landmark = inputs.avgPosition
            ? findNearestLandmark(map, inputs.avgPosition[0], inputs.avgPosition[1])
            : null;
        baseName = landmark ? `${shortMap}: ${landmark.name}` : shortMap;
    } else {
        baseName = clean || 'Unknown';
    }

    const durationMs = inputs.durationMs;
    if (durationMs && durationMs > 0) {
        return `${baseName} (${formatDuration(durationMs)})`;
    }
    return baseName;
}
