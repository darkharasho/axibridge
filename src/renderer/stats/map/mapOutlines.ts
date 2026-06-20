import { WvwMap } from '../../../shared/wvwLandmarks';

// Outline SVGs are imported as raw text and encoded as base64 data URIs. URL-based
// SVG <image> hrefs fail in Electron's renderer, so data URIs are required (same
// approach as classIconUtils.ts / commander_tag.svg). The glob is eager so bundling
// works for both the desktop (dist-react) and web report (dist-web) builds.
const outlineModules = import.meta.glob<string>('../../../shared/mapOutlines/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
});

const outlinesByName: Record<string, string> = {};
for (const [filePath, svg] of Object.entries(outlineModules)) {
    const name = filePath.split('/').pop()!.replace('.svg', '');
    outlinesByName[name] = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

const MAP_OUTLINE_FILE: Record<WvwMap, string> = {
    [WvwMap.EternalBattlegrounds]: 'eternalbattlegrounds-outline',
    [WvwMap.GreenBorderlands]: 'alpine-outline',
    [WvwMap.BlueBorderlands]: 'alpine-outline',
    [WvwMap.RedBorderlands]: 'desert-outline',
};

/** Base asset name (no extension) for a map's outline SVG. */
export function mapOutlineFileName(map: WvwMap): string {
    return MAP_OUTLINE_FILE[map];
}

/** Base64 SVG data URI for a map's outline, or undefined if the asset isn't bundled yet. */
export function getMapOutline(map: WvwMap): string | undefined {
    return outlinesByName[mapOutlineFileName(map)];
}
