import { app } from 'electron';
import fs from 'fs';
import path from 'node:path';
import os from 'node:os';

// Kept in sync with AxiOM's app registry (../axiom/electron/apps.ts) so both
// writers target the same file and produce identical content.
const APP_ID = 'axibridge';
const APP_NAME = 'AxiBridge';

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
export function buildDesktopEntry(name: string, appImagePath: string, iconLine: string): string {
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
`;
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
}): 'written' | 'unchanged' | 'skipped' {
    if (process.platform !== 'linux') return 'skipped';
    const appsDir = path.join(opts.homeDir, '.local', 'share', 'applications');
    const desktopPath = path.join(appsDir, `${opts.appId}.desktop`);
    const iconLine = resolveIconLine(opts.appId, desktopPath);
    const contents = buildDesktopEntry(opts.name, opts.appImagePath, iconLine);
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

export class DesktopIntegrator {
    private appImage: string | undefined;

    constructor() {
        this.appImage = process.env.APPIMAGE;
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
            name: app.name || APP_NAME,
            appImagePath,
            homeDir
        });
        if (result === 'written') {
            console.log(`[Integration] Refreshed desktop entry → ${appImagePath}`);
        } else if (result === 'unchanged') {
            console.log('[Integration] Desktop entry already up to date.');
        }
    }
}
