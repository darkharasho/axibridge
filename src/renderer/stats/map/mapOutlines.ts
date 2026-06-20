import { WvwMap } from '../../../shared/wvwLandmarks';

// Outline SVGs are imported as raw text and inlined as real vector <path>
// elements (see MapOutlineLayer). Inlining keeps them crisp at any zoom — drawing
// them through an <image> data URI rasterizes the vectors and blurs on scale. The
// glob is eager so bundling works for both the desktop (dist-react) and web
// report (dist-web) builds.
const outlineModules = import.meta.glob<string>('../../../shared/mapOutlines/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
});

const outlineSvgByName: Record<string, string> = {};
for (const [filePath, svg] of Object.entries(outlineModules)) {
    const name = filePath.split('/').pop()!.replace('.svg', '');
    outlineSvgByName[name] = svg;
}

export type OutlineLevel = 'standard' | 'high' | 'max';

const MAP_OUTLINE_BASE: Record<WvwMap, string> = {
    [WvwMap.EternalBattlegrounds]: 'eternalbattlegrounds-outline',
    [WvwMap.GreenBorderlands]: 'alpine-outline',
    [WvwMap.BlueBorderlands]: 'alpine-outline',
    [WvwMap.RedBorderlands]: 'desert-outline',
};

/** Base asset name (no extension) for a map's outline SVG at a detail level. */
export function mapOutlineFileName(map: WvwMap, level: OutlineLevel): string {
    return `${MAP_OUTLINE_BASE[map]}-${level}`;
}

/** Raw SVG markup for a map's outline at a detail level, or undefined if not bundled. */
export function getMapOutlineSvg(map: WvwMap, level: OutlineLevel): string | undefined {
    return outlineSvgByName[mapOutlineFileName(map, level)];
}

/**
 * Parse a raw outline SVG into the pieces needed to inline it as crisp vectors:
 * the intrinsic dimensions (from viewBox, falling back to width/height) and the
 * inner markup (everything between the <svg> tags). Returns null when the input
 * is missing, not an SVG, or has no positive dimensions.
 * Pure — no DOM access, safe in any context.
 */
export function parseOutlineSvg(svg: string | undefined): { inner: string; width: number; height: number } | null {
    if (!svg || typeof svg !== 'string') return null;
    const openMatch = svg.match(/<svg\b[^>]*>/i);
    if (!openMatch) return null;
    const openTag = openMatch[0];

    let width = 0;
    let height = 0;
    const viewBox = openTag.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    if (viewBox) {
        width = parseFloat(viewBox[1]);
        height = parseFloat(viewBox[2]);
    } else {
        const w = openTag.match(/\bwidth\s*=\s*["']([\d.]+)/i);
        const h = openTag.match(/\bheight\s*=\s*["']([\d.]+)/i);
        if (w) width = parseFloat(w[1]);
        if (h) height = parseFloat(h[1]);
    }
    if (!(width > 0) || !(height > 0)) return null;

    const start = (openMatch.index ?? 0) + openTag.length;
    const closeIdx = svg.lastIndexOf('</svg>');
    if (closeIdx < start) return null;
    const inner = svg.slice(start, closeIdx).trim();
    if (!inner) return null;

    return { inner, width, height };
}
