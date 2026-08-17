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

export function resolveMapFromZone(zone: string): WvwMap | null {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal') || clean === 'ebg') return WvwMap.EternalBattlegrounds;
    if (clean.includes('green')) return WvwMap.GreenBorderlands;
    if (clean.includes('blue')) return WvwMap.BlueBorderlands;
    if (clean.includes('red')) return WvwMap.RedBorderlands;
    return null;
}

export function normalizeMapName(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal')) return 'Eternal Battlegrounds';
    if (clean.includes('green')) return 'Green Borderlands';
    if (clean.includes('blue')) return 'Blue Borderlands';
    if (clean.includes('red')) return 'Red Borderlands';
    return stripPrefix(zone);
}

export function normalizeMapNameShort(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal') || clean === 'ebg') return 'EBG';
    if (clean.includes('green')) return 'Green BL';
    if (clean.includes('blue')) return 'Blue BL';
    if (clean.includes('red')) return 'Red BL';
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
