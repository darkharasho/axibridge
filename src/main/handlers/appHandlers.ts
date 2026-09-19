import { ipcMain, app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'node:path';
import https from 'node:https';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { parseVersion, compareVersion, extractReleaseNotesRangeFromFile } from '../versionUtils';
import { formatAutoUpdateErrorMessage } from '../../shared/autoUpdateErrors';
import { restoreMissingAppImage, discardAppImagePlaceholder } from '../appImageInstall';

// ─── Release notes fetcher (GitHub API) ──────────────────────────────────────

const fetchGithubReleaseNotesRange = async (
    currentVersion: string,
    lastSeenVersion: string | null
): Promise<string | null> => {
    const current = parseVersion(currentVersion);
    if (!current) return null;
    const lastSeen = parseVersion(lastSeenVersion);
    const url = 'https://api.github.com/repos/darkharasho/axibridge/releases?per_page=100';

    return new Promise((resolve) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'AxiBridge',
                    'Accept': 'application/vnd.github+json'
                }
            },
            (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const releases = JSON.parse(data);
                        if (!Array.isArray(releases)) {
                            resolve(null);
                            return;
                        }
                        const selected = releases
                            .map((release) => {
                                const tag = String(release?.tag_name || '');
                                const version = parseVersion(tag);
                                return {
                                    tag,
                                    version,
                                    body: release?.body || ''
                                };
                            })
                            .filter((release) => {
                                if (!release.version) return false;
                                if (compareVersion(release.version, current) > 0) return false;
                                if (lastSeen && compareVersion(release.version, lastSeen) <= 0) return false;
                                return true;
                            })
                            .sort((a, b) => compareVersion(b.version!, a.version!));

                        if (selected.length === 0) {
                            resolve(null);
                            return;
                        }

                        const combined = selected
                            .map((release) => {
                                const header = `# Release Notes ${release.tag.startsWith('v') ? release.tag : `v${release.tag}`}`;
                                const body = release.body?.trim() || '';
                                if (body.toLowerCase().startsWith('# release notes')) {
                                    return body;
                                }
                                return `${header}\n\n${body}`.trim();
                            })
                            .join('\n\n---\n\n');

                        resolve(combined || null);
                    } catch (err) {
                        resolve(null);
                    }
                });
            }
        );
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
};

// ─── Handler registration ─────────────────────────────────────────────────────

export interface AppHandlerOptions {
    store: any;
    getWindow: () => BrowserWindow | null;
}

export function registerAppHandlers(opts: AppHandlerOptions) {
    const { store, getWindow } = opts;

    ipcMain.on('check-for-updates', async () => {
        if (!app.isPackaged) {
            log.info('[AutoUpdater] Manual check skipped in development mode');
            getWindow()?.webContents.send('update-not-available', { version: app.getVersion() });
            return;
        }
        try {
            await autoUpdater.checkForUpdates();
        } catch (err: any) {
            log.error('[AutoUpdater] Manual check failed:', err?.message || err);
            getWindow()?.webContents.send('update-error', { message: formatAutoUpdateErrorMessage(err) });
        }
    });

    ipcMain.on('restart-app', () => {
        // electron-updater unlinks $APPIMAGE as the very first thing it does on
        // install. When that file has gone from disk under a long-running
        // session — our AppImages are versioned, so an update writes a new name
        // and deletes the old one — the install dies on a raw ENOENT before the
        // downloaded installer is even touched. Put the path back first.
        const appImagePath = process.env.APPIMAGE;
        const hasStagedInstaller = Boolean((autoUpdater as any).installerPath);
        const outcome = hasStagedInstaller ? restoreMissingAppImage(appImagePath) : 'present';

        if (outcome === 'failed') {
            log.error(`[AutoUpdater] $APPIMAGE is missing and could not be recreated: ${appImagePath}`);
            getWindow()?.webContents.send('update-error', {
                message: 'The AppImage this session is running from is no longer on disk, so the update cannot replace it. '
                    + 'Restart AxiBridge from your current AppImage and try again.',
            });
            return;
        }
        if (outcome === 'restored') {
            log.warn(`[AutoUpdater] $APPIMAGE was missing; recreated ${appImagePath} so the install can proceed.`);
        }

        autoUpdater.quitAndInstall();

        // quitAndInstall only quits when the install succeeded. If it bailed,
        // the placeholder would otherwise sit there as an empty AppImage.
        if (outcome === 'restored' && discardAppImagePlaceholder(appImagePath)) {
            log.warn('[AutoUpdater] Install did not run; removed the placeholder AppImage.');
        }
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    ipcMain.handle('get-whats-new', async () => {
        const version = app.getVersion();
        const lastSeenVersion = store.get('lastSeenVersion', null) as string | null;
        let releaseNotes: string | null = null;
        releaseNotes = await fetchGithubReleaseNotesRange(version, lastSeenVersion);
        if (!releaseNotes) {
            const basePath = app.isPackaged ? app.getAppPath() : process.cwd();
            const notesPath = path.join(basePath, 'RELEASE_NOTES.md');
            try {
                const rawNotes = fs.readFileSync(notesPath, 'utf8');
                releaseNotes = extractReleaseNotesRangeFromFile(rawNotes, version, lastSeenVersion);
                if (!releaseNotes) {
                    const nextHeaderIndex = rawNotes.indexOf('\n# Release Notes', 1);
                    releaseNotes = nextHeaderIndex > -1 ? rawNotes.slice(0, nextHeaderIndex).trim() : rawNotes.trim();
                }
            } catch (err) {
                console.warn('[Main] Failed to read release notes:', err);
            }
        }
        return { version, lastSeenVersion, releaseNotes };
    });

    ipcMain.handle('set-last-seen-version', (_event, version: string) => {
        store.set('lastSeenVersion', version);
    });

    ipcMain.on('window-control', (_event, action: 'minimize' | 'maximize' | 'close') => {
        const win = getWindow();
        if (!win) return;
        if (action === 'minimize') win.minimize();
        else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (action === 'close') win.close();
    });
}
