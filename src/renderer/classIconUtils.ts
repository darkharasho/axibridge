import { getProfessionBase, PROFESSION_COLORS } from '../shared/professionUtils';

// Import as raw SVG text and encode as base64 data URIs. This allows SVG <image>
// elements to load them in Electron's renderer context (URL-based SVG hrefs fail there).
// HTML <img src> also accepts data URIs, so existing usages remain compatible.
const iconModules = import.meta.glob<string>(
    '../../node_modules/gw2-class-icons/wiki/svg/*.svg',
    { eager: true, query: '?raw', import: 'default' }
);

const iconsByName: Record<string, string> = {};
for (const [filePath, svgContent] of Object.entries(iconModules)) {
    const name = filePath.split('/').pop()!.replace('.svg', '');
    // btoa with the unescape/encodeURIComponent dance handles non-ASCII characters in SVG safely
    iconsByName[name] = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`;
}

export function getProfessionIconPath(profession: string | undefined | null): string | null {
    if (!profession || profession === 'Unknown') return null;
    if (PROFESSION_COLORS[profession] && iconsByName[profession]) {
        return iconsByName[profession];
    }
    const base = getProfessionBase(profession);
    if (base && base !== 'Unknown' && iconsByName[base]) {
        return iconsByName[base];
    }
    return null;
}
