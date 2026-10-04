type Attributed = { publishedBy?: string | null } | null | undefined;

/**
 * The publisher login of an index entry, or null. index.json is shared and
 * hand-editable, so a non-string value must never reach React.
 */
export const publishedByLogin = (entry: Attributed): string | null => {
    const by: unknown = entry?.publishedBy;
    return typeof by === 'string' && by.trim() ? by.trim() : null;
};

/**
 * Reports in `entries` published by someone other than the viewer. Entries
 * from before publishedBy existed are not counted. An unknown viewer counts
 * every attributed entry — over-warning beats a silent delete.
 */
export const othersPublishedBy = (entries: Attributed[], viewerLogin: string | null) => {
    const viewer = viewerLogin?.trim().toLowerCase() || null;
    const logins: string[] = [];
    let count = 0;
    for (const entry of entries) {
        const by = publishedByLogin(entry);
        if (!by) continue;
        if (viewer && by.toLowerCase() === viewer) continue;
        count += 1;
        if (!logins.includes(by)) logins.push(by);
    }
    return { count, logins };
};

/**
 * A push collaborator can delete any file, so this is a confirmation, not
 * enforcement.
 */
export const buildDeleteConfirmText = (base: string, entries: Attributed[], viewerLogin: string | null) => {
    const { count, logins } = othersPublishedBy(entries, viewerLogin);
    if (count === 0) return base;
    const who = logins.join(', ');
    const lead = entries.length === 1 ? 'This was' : `${count} of these ${count === 1 ? 'was' : 'were'}`;
    return `${base}\n\n${lead} published by ${who}. Delete anyway?`;
};
