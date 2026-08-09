import fs from 'fs';
import path from 'node:path';
import os from 'node:os';

// Kept in sync with AxiOM's app registry (../axiom/electron/apps.ts) so both
// writers target the same file and produce identical content. Note APP_NAME is
// deliberately not electron's app.name — that reports the lowercase package
// name 'axibridge' even in a packaged build, which made our entry differ from
// AxiOM's and the two rewrote each other on every launch.
const APP_ID = 'axibridge';
export const APP_NAME = 'AxiBridge';

// Schemes registered at runtime via app.setAsDefaultProtocolClient. xdg-settings
// resolves a handler through this desktop entry, so omitting the line drops the
// registration every time the file is rewritten.
export const MIME_TYPES: readonly string[] = ['x-scheme-handler/axibridge'];

// Express an absolute path under os.homedir() when it resolves inside the home
// tree. On Fedora Atomic/Silverblue, $APPIMAGE is /var/home/... while
// os.homedir() is /home/... (a symlink to /var/home). AxiOM builds its paths
// from os.homedir(), so without this remap the two writers would disagree and
// rewrite each other's desktop entry on every launch.
export function normalizeHomePath(absPath: string, homeDir: string): string {
    let real: string;
    try { real = fs.realpathSync(absPath); } catch { real = absPath; }
    let realHome: string;
    try { realHome = fs.realpathSync(homeDir); } catch { realHome = homeDir; }
    if (real === realHome || real.startsWith(realHome + path.sep)) {
        return path.join(homeDir, path.relative(realHome, real));
    }
    return real;
}

// Byte-for-byte identical to AxiOM's writeLinuxDesktopEntry template
// (../axiom/electron/desktopEntry.ts). Do not reformat.
export function buildDesktopEntry(
    name: string,
    appImagePath: string,
    iconLine: string,
    mimeTypes: readonly string[]
): string {
    const mimeLine = mimeTypes.length ? `MimeType=${mimeTypes.map((m) => `${m};`).join('')}\n` : '';
    return `[Desktop Entry]
Type=Application
Name=${name}
${iconLine}
TryExec=${appImagePath}
Exec=env DESKTOPINTEGRATION=1 ${appImagePath} --no-sandbox %U
Terminal=false
Categories=Utility;
StartupWMClass=${name}
X-AppImage-Name=${name}
${mimeLine}`;
}

// Preserve an existing Icon= line if it's a bare name or points at a real file,
// otherwise fall back to a name-based icon hint. Mirrors AxiOM.
function resolveIconLine(appId: string, desktopPath: string): string {
    let iconLine = `Icon=${appId}`;
    try {
        if (fs.existsSync(desktopPath)) {
            const existing = fs.readFileSync(desktopPath, 'utf8');
            const m = existing.match(/^Icon=(.+)$/m);
            if (m) {
                const iconValue = m[1].trim();
                if (!iconValue.includes('/') || fs.existsSync(iconValue)) iconLine = `Icon=${iconValue}`;
            }
        }
    } catch { /* fall back to name-based icon */ }
    return iconLine;
}

// Idempotently (re)write ~/.local/share/applications/${appId}.desktop so its
// Exec/TryExec always reference an AppImage that exists.
export function writeDesktopEntry(opts: {
    appId: string;
    name: string;
    appImagePath: string;
    homeDir: string;
    mimeTypes: readonly string[];
}): 'written' | 'unchanged' | 'skipped' {
    if (process.platform !== 'linux') return 'skipped';
    const appsDir = path.join(opts.homeDir, '.local', 'share', 'applications');
    const desktopPath = path.join(appsDir, `${opts.appId}.desktop`);
    const iconLine = resolveIconLine(opts.appId, desktopPath);
    const contents = buildDesktopEntry(opts.name, opts.appImagePath, iconLine, opts.mimeTypes);
    try {
        fs.mkdirSync(appsDir, { recursive: true });
        if (fs.existsSync(desktopPath) && fs.readFileSync(desktopPath, 'utf8') === contents) {
            return 'unchanged';
        }
        fs.writeFileSync(desktopPath, contents, 'utf8');
        return 'written';
    } catch (err) {
        console.error(`[Integration] failed to write ${desktopPath}:`, (err as Error).message);
        return 'skipped';
    }
}

// $APPIMAGE and $APPDIR are ordinary environment variables, so every child
// process of an AppImage inherits them — including a dev run of this app
// started from a terminal inside another AppImage. Acting on an inherited
// $APPIMAGE rewrote axibridge.desktop to launch *that* app instead. We are only
// really the AppImage when our own executable lives inside the mounted $APPDIR;
// a nested packaged AppImage gets its own values from its AppRun, so it passes.
export function resolveOwnAppImage(
    env: Record<string, string | undefined>,
    execPath: string
): string | undefined {
    if (!env.APPIMAGE || !env.APPDIR) return undefined;
    const appDir = path.resolve(env.APPDIR);
    const exe = path.resolve(execPath);
    if (exe !== appDir && !exe.startsWith(appDir + path.sep)) return undefined;
    return env.APPIMAGE;
}

export class DesktopIntegrator {
    private appImage: string | undefined;

    constructor() {
        this.appImage = resolveOwnAppImage(process.env, process.execPath);
    }

    public async integrate() {
        if (!this.appImage) {
            console.log('[Integration] Not running as AppImage, skipping integration.');
            return;
        }

        // Self-heal the launcher on every start. The AppImage filename carries
        // the version, so an in-app auto-update (electron-updater) changes the
        // path and leaves ~/.local/share/applications/axibridge.desktop pointing
        // at the old, now-deleted file — which makes the menu icon stop working
        // until AxiOM is next opened. Keeping our own entry current removes that
        // dependency.
        const homeDir = os.homedir();
        const appImagePath = normalizeHomePath(this.appImage, homeDir);
        const result = writeDesktopEntry({
            appId: APP_ID,
            name: APP_NAME,
            appImagePath,
            homeDir,
            mimeTypes: MIME_TYPES
        });
        if (result === 'written') {
            console.log(`[Integration] Refreshed desktop entry → ${appImagePath}`);
        } else if (result === 'unchanged') {
            console.log('[Integration] Desktop entry already up to date.');
        }
    }
}
