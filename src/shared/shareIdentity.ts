/**
 * Which link identifies a log.
 *
 * Share links supersede dps.report permalinks, but thousands of already-persisted
 * logs carry only a permalink and must keep working untouched — so this prefers
 * the new link and falls back rather than migrating anything.
 */
export const shareIdentity = (
    log: { shareUrl?: string | null; permalink?: string | null } | null | undefined
): string => {
    const share = typeof log?.shareUrl === 'string' ? log.shareUrl.trim() : '';
    if (share) return share;
    const permalink = typeof log?.permalink === 'string' ? log.permalink.trim() : '';
    return permalink;
};
