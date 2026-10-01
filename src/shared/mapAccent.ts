import { WvwMap } from './wvwLandmarks';
import { resolveMapFromZone } from './mapUtils';

/**
 * The accent a share-linked report is tinted with, derived from the WvW map the
 * fights happened on.
 *
 * Only the three borderlands carry a colour of their own; Eternal Battlegrounds,
 * Obsidian Sanctum and Edge of the Mists are all white. That rule is why this
 * matches on the map *label* rather than on `WvwMap`: EotM has no enum member,
 * and adding one would have to be filled in for `WVW_TILE_DATA`,
 * `WVW_LANDMARKS`, `WVW_MAP_IDS`, `WVW_SECTOR_REF_SIZE` and `WVW_SECTORS` —
 * five exhaustive `Record<WvwMap, …>` tables with no EotM geometry to put in
 * them. Reading the name costs nothing and lands EotM on white for free, along
 * with every other zone that isn't a borderlands.
 *
 * The hexes are the ones the Map Distribution donut already uses
 * (`incrementalAggregation.ts`), so the accent agrees with the chart.
 */
export interface MapAccent {
    /** `--axi-accent` - the one variable the design language reads. */
    primary: string;
}

const MAP_ACCENT_HEX = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    neutral: '#ffffff',
} as const;

/** The accent is one hex: upstream derives every companion from `--axi-accent`. */
const buildAccent = (hex: string): MapAccent => ({ primary: hex });

/** Accent for a single map label, e.g. `'Red Borderlands'` or `'EBG'`. */
export function resolveMapAccentFromName(name: string): MapAccent {
    switch (resolveMapFromZone(String(name || ''))) {
        case WvwMap.RedBorderlands:
            return buildAccent(MAP_ACCENT_HEX.red);
        case WvwMap.GreenBorderlands:
            return buildAccent(MAP_ACCENT_HEX.green);
        case WvwMap.BlueBorderlands:
            return buildAccent(MAP_ACCENT_HEX.blue);
        // EBG, Obsidian Sanctum, and — via the null case — Edge of the Mists and
        // anything else that isn't a borderlands.
        default:
            return buildAccent(MAP_ACCENT_HEX.neutral);
    }
}

/**
 * Accent for a whole report, from `stats.mapData`.
 *
 * `mapData` is sorted by fight count descending where it's built, so `[0]` is
 * the map the session mostly happened on — a report that roamed across two
 * borderlands takes the colour of the one it fought on most. Returns `null` when
 * there is no map data at all, which leaves the publisher's own palette in place
 * rather than inventing a colour.
 */
export function resolveMapAccentFromStats(stats: any): MapAccent | null {
    const mapData = stats?.mapData;
    if (!Array.isArray(mapData) || mapData.length === 0) return null;
    const dominant = mapData.reduce(
        (best: any, entry: any) => (Number(entry?.value) > Number(best?.value ?? -Infinity) ? entry : best),
        mapData[0],
    );
    const name = dominant?.name;
    if (!name) return null;
    return resolveMapAccentFromName(name);
}

/**
 * The accent as inline custom properties, ready for `element.style.setProperty`.
 *
 * One entry. accents.css sets `--axi-accent` on <html>; a share link's map
 * colour sets the same variable on <body>, and because every upstream component
 * and every app rule reads `--axi-accent` directly, nothing else has to move.
 */
export const MAP_ACCENT_CSS_VARS: Array<[string, keyof MapAccent]> = [
    ['--axi-accent', 'primary'],
];
