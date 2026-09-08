import fs from 'fs';
import path from 'path';
import { KNOWN_PROFESSIONS, type ReportCardAssets } from './reportCardTemplate';

/** Reads the card's static assets off disk and hands them to the (pure)
 *  template as `data:` URIs. This is the only place in the card pipeline that
 *  touches the filesystem.
 *
 *  Everything is memoised by absolute path at module level: a single publish
 *  can render both the `hybrid` and `graphic` variants, and the 344 KB font
 *  must not be read (or base64-encoded) twice. */
const fileCache = new Map<string, string | null>();

const readDataUri = (filePath: string, mime: string): string | null => {
    const cached = fileCache.get(filePath);
    if (cached !== undefined) return cached;
    let uri: string | null = null;
    try {
        uri = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
    } catch {
        // Missing or unreadable asset: the template degrades (font → system
        // sans, icon → text abbreviation, glyph → hidden). Never throws, so a
        // stripped install cannot abort a render.
        uri = null;
    }
    fileCache.set(filePath, uri);
    return uri;
};

/** `professions` is expected to come from `collectCardProfessions()`, i.e.
 *  already filtered by `KNOWN_PROFESSIONS`. It is re-checked here anyway: this
 *  function builds filesystem paths, so an unvetted string reaching `path.join`
 *  would be a traversal read. */
export function resolveReportCardAssets(publicDir: string, professions: string[] = []): ReportCardAssets {
    const iconDir = path.join(publicDir, 'img', 'class-icons');
    const iconDataUris: Record<string, string> = {};
    for (const profession of professions) {
        if (!KNOWN_PROFESSIONS.has(profession)) continue;
        const uri = readDataUri(path.join(iconDir, `${profession}.png`), 'image/png');
        if (uri) iconDataUris[profession] = uri;
    }
    return {
        fontDataUri: readDataUri(path.join(publicDir, 'fonts', 'InterVariable.woff2'), 'font/woff2'),
        iconDataUris,
        glyphDataUri: readDataUri(path.join(publicDir, 'img', 'AxiBridge-glyph.png'), 'image/png'),
    };
}

/** Test-only: drops the memoised bytes so a suite can exercise a changed or
 *  missing asset tree. */
export function __resetReportCardAssetCache(): void {
    fileCache.clear();
}
