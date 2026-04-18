import { WvwMap, findNearestLandmark } from './wvwLandmarks';

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

export function computeFightAvgPosition(details: any): [number, number] | null {
    const players = Array.isArray(details?.players) ? details.players : [];
    const commander = players.find((p: any) => p?.hasCommanderTag && p?.combatReplayData?.positions?.length);
    if (commander) return medianPosition(commander.combatReplayData.positions);
    const anyWithPos = players.find((p: any) => p?.combatReplayData?.positions?.length);
    if (anyWithPos) return medianPosition(anyWithPos.combatReplayData.positions);
    // Fall back to enemy targets — dps.report includes positions on targets even when
    // squad player positions are absent. Enemy positions are close enough to determine
    // the nearest WvW objective for the fight label.
    const targets = Array.isArray(details?.targets) ? details.targets : [];
    const targetWithPos = targets.find((t: any) => t?.combatReplayData?.positions?.length);
    return targetWithPos ? medianPosition(targetWithPos.combatReplayData.positions) : null;
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
