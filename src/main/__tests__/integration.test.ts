import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// integration.ts imports `app` from electron at module load.
vi.mock('electron', () => ({ app: { name: 'AxiBridge' } }));

import { buildDesktopEntry, normalizeHomePath, writeDesktopEntry } from '../integration';

// This MUST stay byte-for-byte identical to AxiOM's writeLinuxDesktopEntry
// output (../axiom/electron/desktopEntry.ts). If the two writers disagree they
// rewrite each other's entry on every launch.
const axiomTemplate = (name: string, appImagePath: string, iconLine: string) =>
    `[Desktop Entry]
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

let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-integration-'));
});
afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('buildDesktopEntry', () => {
    it('matches the AxiOM desktop-entry template byte-for-byte', () => {
        const p = '/home/u/AppImages/AxiBridge-2.13.5.AppImage';
        expect(buildDesktopEntry('AxiBridge', p, 'Icon=axibridge')).toBe(
            axiomTemplate('AxiBridge', p, 'Icon=axibridge')
        );
    });
});

describe('normalizeHomePath', () => {
    it('remaps a realpath under the home symlink target back to the home path', () => {
        // Simulate Fedora Atomic: home is a symlink (/home/u -> /var/home/u).
        const realHome = path.join(tmp, 'var-home');
        const homeLink = path.join(tmp, 'home');
        fs.mkdirSync(path.join(realHome, 'AppImages'), { recursive: true });
        fs.symlinkSync(realHome, homeLink);
        const appImage = path.join(realHome, 'AppImages', 'AxiBridge-2.13.5.AppImage');
        fs.writeFileSync(appImage, 'x');

        // $APPIMAGE arrives as the real (/var/home) path; homedir() is the symlink.
        expect(normalizeHomePath(appImage, homeLink)).toBe(
            path.join(homeLink, 'AppImages', 'AxiBridge-2.13.5.AppImage')
        );
    });

    it('leaves paths outside the home tree untouched (resolved)', () => {
        const outside = path.join(tmp, 'opt', 'AxiBridge.AppImage');
        fs.mkdirSync(path.dirname(outside), { recursive: true });
        fs.writeFileSync(outside, 'x');
        expect(normalizeHomePath(outside, path.join(tmp, 'home'))).toBe(outside);
    });
});

describe('writeDesktopEntry', () => {
    const opts = (over: Partial<Parameters<typeof writeDesktopEntry>[0]> = {}) => ({
        appId: 'axibridge',
        name: 'AxiBridge',
        appImagePath: '/home/u/AppImages/AxiBridge-2.13.5.AppImage',
        homeDir: tmp,
        ...over
    });
    const desktopFile = () => path.join(tmp, '.local', 'share', 'applications', 'axibridge.desktop');

    it('writes the entry then reports unchanged on a second identical call', () => {
        expect(writeDesktopEntry(opts())).toBe('written');
        const content = fs.readFileSync(desktopFile(), 'utf8');
        expect(content).toContain('TryExec=/home/u/AppImages/AxiBridge-2.13.5.AppImage');
        expect(content).toBe(axiomTemplate('AxiBridge', '/home/u/AppImages/AxiBridge-2.13.5.AppImage', 'Icon=axibridge'));
        expect(writeDesktopEntry(opts())).toBe('unchanged');
    });

    it('rewrites a stale entry pointing at a deleted version', () => {
        writeDesktopEntry(opts({ appImagePath: '/home/u/AppImages/AxiBridge-2.13.4.AppImage' }));
        expect(writeDesktopEntry(opts())).toBe('written');
        expect(fs.readFileSync(desktopFile(), 'utf8')).toContain('AxiBridge-2.13.5.AppImage');
        expect(fs.readFileSync(desktopFile(), 'utf8')).not.toContain('2.13.4');
    });

    it('preserves an existing valid absolute Icon= line', () => {
        const icon = path.join(tmp, 'icon.png');
        fs.writeFileSync(icon, 'png');
        // seed an entry carrying the icon
        const appsDir = path.join(tmp, '.local', 'share', 'applications');
        fs.mkdirSync(appsDir, { recursive: true });
        fs.writeFileSync(path.join(appsDir, 'axibridge.desktop'), `Icon=${icon}\n`);
        writeDesktopEntry(opts());
        expect(fs.readFileSync(desktopFile(), 'utf8')).toContain(`Icon=${icon}`);
    });
});
