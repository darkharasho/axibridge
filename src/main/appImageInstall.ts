import fs from 'node:fs';

/**
 * electron-updater's `AppImageUpdater.doInstall` opens with an unconditional
 * `unlinkSync($APPIMAGE)` — no existence check, before the staged installer is
 * touched at all. A session whose own AppImage file has gone from disk
 * underneath it therefore can never install an update: every attempt dies with
 * a raw `ENOENT: ... unlink '/…/AxiBridge-<old version>.AppImage'`.
 *
 * The file goes missing more easily than it sounds. Our AppImages carry the
 * version in their filename, so an update writes a *new* file and deletes the
 * old one; anyone who updates (or drops in a fresh download by hand) while an
 * older copy is still running is left with a dangling `$APPIMAGE` for the rest
 * of that session. The running process survives on its open file descriptor
 * and has no idea.
 *
 * Restoring the invariant is enough to unstick it. A zero-byte placeholder at
 * the recorded path satisfies the unlink, and the installer then moves to its
 * versioned destination exactly as it always would have.
 */

export type AppImagePlaceholderOutcome = 'not-appimage' | 'present' | 'restored' | 'failed';

export interface AppImageFs {
    existsSync: (p: string) => boolean;
    writeFileSync: (p: string, data: string) => void;
    statSync: (p: string) => { size: number };
    unlinkSync: (p: string) => void;
}

/**
 * Make `$APPIMAGE` exist again so the updater's unlink can succeed.
 *
 * `'not-appimage'` means there is nothing to guard (non-AppImage run);
 * `'failed'` means the path could not be recreated and the install should not
 * be attempted.
 */
export function restoreMissingAppImage(
    appImagePath: string | undefined | null,
    fsImpl: AppImageFs = fs
): AppImagePlaceholderOutcome {
    if (!appImagePath) return 'not-appimage';
    if (fsImpl.existsSync(appImagePath)) return 'present';
    try {
        fsImpl.writeFileSync(appImagePath, '');
        return 'restored';
    } catch {
        return 'failed';
    }
}

/**
 * Remove a placeholder that outlived a failed install.
 *
 * Only a zero-byte file is removed: on a successful in-place install the same
 * path holds the real new AppImage, and on a successful versioned install it
 * is gone already.
 */
export function discardAppImagePlaceholder(
    appImagePath: string | undefined | null,
    fsImpl: AppImageFs = fs
): boolean {
    if (!appImagePath) return false;
    try {
        if (!fsImpl.existsSync(appImagePath)) return false;
        if (fsImpl.statSync(appImagePath).size !== 0) return false;
        fsImpl.unlinkSync(appImagePath);
        return true;
    } catch {
        return false;
    }
}
