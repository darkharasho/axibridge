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
    /** `--axi-accent` and `--brand-primary` */
    primary: string;
    /** `--brand-secondary` */
    secondary: string;
    /** `--brand-gradient` */
    gradient: string;
    /** `--accent-bg` */
    accentBg: string;
    /** `--accent-bg-strong` */
    accentBgStrong: string;
    /** `--accent-border` */
    accentBorder: string;
    /** `--glow-primary` */
    glowPrimary: string;
    /** `--glow-secondary` */
    glowSecondary: string;
}

const MAP_ACCENT_HEX = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    neutral: '#ffffff',
} as const;

const toRgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
];

/**
 * Expand one hex into the full accent variable set, using the same alpha ladder
 * every accent palette in upstream's `accents.css` uses (.10 wash, .18 strong
 * wash, .35 border and glow) and the same single-hue gradient shape those
 * palettes ship.
 */
const buildAccent = (hex: string): MapAccent => {
    const [r, g, b] = toRgb(hex);
    const rgba = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
    return {
        primary: hex,
        secondary: rgba(0.85),
        gradient: `linear-gradient(135deg, ${hex}, ${rgba(0.7)})`,
        accentBg: rgba(0.1),
        accentBgStrong: rgba(0.18),
        accentBorder: rgba(0.35),
        glowPrimary: rgba(0.35),
        glowSecondary: rgba(0.25),
    };
};

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
 * `--axi-accent` leads the list and is not redundant with `--brand-primary`: the
 * accent direction runs from the design language outwards now
 * (`--brand-primary: var(--axi-accent)` at `:root`), so setting only the brand
 * variable would leave every axi remap and every upstream component on the
 * palette accent and the map colour would never arrive. The brand variables stay
 * because components that read them directly need a concrete value, not one that
 * resolves back through the token being overridden.
 */
export const MAP_ACCENT_CSS_VARS: Array<[string, keyof MapAccent]> = [
    ['--axi-accent', 'primary'],
    ['--brand-primary', 'primary'],
    ['--brand-secondary', 'secondary'],
    ['--brand-gradient', 'gradient'],
    ['--accent-bg', 'accentBg'],
    ['--accent-bg-strong', 'accentBgStrong'],
    ['--accent-border', 'accentBorder'],
    ['--glow-primary', 'glowPrimary'],
    ['--glow-secondary', 'glowSecondary'],
];
