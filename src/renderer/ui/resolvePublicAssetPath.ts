export const resolvePublicAssetPath = (relativePath: string): string => {
    const normalizedPath = relativePath.replace(/^\/+/, '');
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
