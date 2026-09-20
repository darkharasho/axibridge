/**
 * Module-level override for where `public/` assets live.
 *
 * Sibling of `planAssetBaseResolution` in `src/web/assetBasePath.ts`: same
 * problem — the share viewer is served at `/r/<code>`, a route rather than a
 * directory, so nothing about `window.location` describes where the assets
 * are — but a different mechanism. `reportApp.tsx` can be handed an
 * `assetBase` prop; the consumers here are deep renderer `ui/` components
 * (CommanderTagIcon, the Gw2* icons) that receive no props from the viewer,
 * so the base is set once at module scope by `src/web/viewerMain.tsx` before
 * the app renders.
 *
 * `null` (the default) means "not overridden" and leaves the existing
 * pathname-sniffing behaviour exactly as it was.
 */
let publicAssetBase: string | null = null;

export const setPublicAssetBase = (base: string | null): void => {
    publicAssetBase = base;
};

export const resolvePublicAssetPath = (relativePath: string): string => {
    const normalizedPath = relativePath.replace(/^\/+/, '');
    if (publicAssetBase) {
        // An explicit base is authoritative: the pathname-sniffing branches
        // below only ever guess, and under `/r/<code>` they guess wrong.
        const normalizedBase = publicAssetBase.endsWith('/') ? publicAssetBase : `${publicAssetBase}/`;
        return `${normalizedBase}${normalizedPath}`;
    }
    if (typeof window !== 'undefined') {
        const pathName = window.location.pathname || '';
        if (pathName.includes('/reports/')) {
            // Published report pages are nested under /reports/<id>/ and need to walk
            // back to the app root to access shared svg/img assets.
            return `../../${normalizedPath}`;
        }
        if (pathName.includes('/web/web/')) {
            return `../${normalizedPath}`;
        }
    }
    const base = import.meta.env.BASE_URL || './';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}${normalizedPath}`;
};
