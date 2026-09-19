import path from 'path';

/**
 * Electron 44 stopped letting the OS pick where a file dialog opens. A
 * dialog with no `defaultPath` now starts in the user's Downloads folder
 * every single time, and the platform no longer remembers where the last
 * one was left. Downloads is never where arcdps logs live, so without
 * this the folder picker would send people back to square one on every
 * visit.
 *
 * Keyed per dialog rather than globally: picking a settings file should
 * not move where the log-folder picker opens next.
 */
const lastDirectories = new Map<string, string>();

/** The directory this dialog should open in: wherever it was last used,
 *  falling back to the caller's seed (a configured path, usually) and
 *  finally to undefined, which leaves Electron's own default in place. */
export function recallDialogPath(key: string, seed?: string | null): string | undefined {
    const remembered = lastDirectories.get(key);
    if (remembered) return remembered;
    return seed || undefined;
}

/** Record where a dialog ended up. `kind` says whether the chosen path is
 *  itself the directory to reopen or a file sitting inside one. */
export function rememberDialogPath(
    key: string,
    chosenPath: string | null | undefined,
    kind: 'file' | 'directory' = 'file',
): void {
    if (!chosenPath) return;
    lastDirectories.set(key, kind === 'directory' ? chosenPath : path.dirname(chosenPath));
}

/** Test seam — the map outlives individual dialogs by design. */
export function resetDialogPaths(): void {
    lastDirectories.clear();
}
