export const resolvePublicAssetPath = (relativePath: string): string => {
    if (typeof window !== 'undefined') {
        const pathName = window.location.pathname || '';
        if (pathName.includes('/web/web/')) {
            const normalizedPath = relativePath.replace(/^\/+/, '');
            return `../${normalizedPath}`;
        }
    }
    const base = import.meta.env.BASE_URL || './';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedPath = relativePath.replace(/^\/+/, '');
    return `${normalizedBase}${normalizedPath}`;
};
