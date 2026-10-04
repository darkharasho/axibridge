/**
 * Rules for a GitHub Pages report site that more than one AxiBridge user
 * publishes to. Pure — the publish handlers feed these the repo's current
 * reports/index.json and act on the answer.
 */
import { compareVersion, parseVersion } from './versionUtils';

export interface SiteGenerator { app: 'axibridge'; version: string }

export interface ParsedSiteIndex {
    entries: any[];
    colorPalette: string | null;
    /**
     * Verbatim, NOT coerced to a theme this version knows: the index is
     * written back, and an older app must not reset a newer admin's theme.
     * Coerce (asAxiTheme) only where a renderable theme is needed.
     */
    axiTheme: string | null;
    generator: SiteGenerator | null;
}

export interface SiteAppearance { colorPalette: string; axiTheme: string }

export const parseSiteIndex = (raw: unknown): ParsedSiteIndex => {
    if (Array.isArray(raw)) return { entries: raw, colorPalette: null, axiTheme: null, generator: null };
    const obj = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
    return {
        entries: Array.isArray(obj.entries) ? obj.entries : [],
        colorPalette: typeof obj.colorPalette === 'string' && obj.colorPalette ? obj.colorPalette : null,
        axiTheme: typeof obj.axiTheme === 'string' && obj.axiTheme ? obj.axiTheme : null,
        generator: obj.generator && typeof obj.generator.version === 'string'
            ? { app: 'axibridge', version: obj.generator.version }
            : null
    };
};

/**
 * The site's look belongs to whoever administers the repo. Everyone else
 * publishes in the site's existing colours, so the site does not change
 * appearance depending on who published last.
 */
export const resolveSiteAppearance = (opts: {
    isAdmin: boolean;
    local: SiteAppearance;
    site: ParsedSiteIndex | null;
}): SiteAppearance => {
    if (opts.isAdmin || !opts.site) return opts.local;
    return {
        colorPalette: opts.site.colorPalette ?? opts.local.colorPalette,
        axiTheme: opts.site.axiTheme ?? opts.local.axiTheme
    };
};

/**
 * Whether this app may write the viewer bundle. An older AxiBridge must not
 * downgrade the viewer (and its stale-asset sweep would delete the newer
 * hashed assets). Unparseable versions write, matching pre-gate behaviour.
 */
export const shouldWriteViewer = (localVersion: string, recorded: SiteGenerator | null): boolean => {
    if (!recorded) return true;
    const local = parseVersion(localVersion);
    const site = parseVersion(recorded.version);
    if (!local || !site) return true;
    return compareVersion(local, site) >= 0;
};

export const buildIndexPayload = (opts: {
    entry: { id: string } & Record<string, any>;
    site: ParsedSiteIndex;
    appearance: SiteAppearance;
    generator: SiteGenerator | null;
}): { payload: Record<string, any>; entries: any[] } => {
    const entries = [opts.entry, ...opts.site.entries.filter((e) => e?.id !== opts.entry.id)];
    const glass = opts.appearance.axiTheme === 'glass';
    const payload: Record<string, any> = {
        colorPalette: opts.appearance.colorPalette,
        axiTheme: opts.appearance.axiTheme,
        glass,
        glassSurfaces: glass,
        ...(opts.generator ? { generator: opts.generator } : {}),
        entries
    };
    return { payload, entries };
};

/** Drop entries by id, keeping every other top-level field of the index. */
export const removeFromSiteIndex = (raw: unknown, ids: string[]): unknown => {
    const drop = new Set(ids);
    if (Array.isArray(raw)) return raw.filter((e) => !drop.has(e?.id));
    const obj = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
    const entries = Array.isArray(obj.entries) ? obj.entries : [];
    return { ...obj, entries: entries.filter((e: any) => !drop.has(e?.id)) };
};
