import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// electron's `app` reports name 'axibridge' (the package name) even when
// packaged, so integration.ts must not source the display name from it.
vi.mock('electron', () => ({ app: { name: 'axibridge' } }));

import { APP_NAME, MIME_TYPES, buildDesktopEntry, normalizeHomePath, resolveOwnAppImage, writeDesktopEntry } from '../integration';

// This MUST stay byte-for-byte identical to AxiOM's writeLinuxDesktopEntry
// output (../axiom/electron/desktopEntry.ts). If the two writers disagree they
// rewrite each other's entry on every launch.
const axiomTemplate = (name: string, appImagePath: string, iconLine: string, mimeTypes: readonly string[] = []) =>
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
${mimeTypes.length ? `MimeType=${mimeTypes.map((m) => `${m};`).join('')}\n` : ''}`;

let tmp: string;

beforeEach(() => {
    // `realpathSync` is load-bearing, not tidiness. `normalizeHomePath`
    // resolves symlinks, so these fixtures only behave predictably if the
    // sandbox root is already a real path. Without it the suite silently
    // depends on `os.tmpdir()` living OUTSIDE $HOME: point TMPDIR at
    // something under the home tree (a reasonable thing to do on a box where
    // /tmp is a small quota'd tmpfs) and, on a distro where /home is a
    // symlink to /var/home, the "outside the home tree" case below starts
    // failing — the path it builds is inside the home tree after all.
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-integration-')));
});
afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('buildDesktopEntry', () => {
    it('matches the AxiOM desktop-entry template byte-for-byte', () => {
        const p = '/home/u/AppImages/AxiBridge-2.13.5.AppImage';
        expect(buildDesktopEntry('AxiBridge', p, 'Icon=axibridge', [])).toBe(
            axiomTemplate('AxiBridge', p, 'Icon=axibridge')
        );
    });

    it('emits a MimeType line matching AxiOM when scheme handlers are declared', () => {
        const p = '/home/u/AppImages/AxiBridge-2.13.5.AppImage';
        expect(buildDesktopEntry('AxiBridge', p, 'Icon=axibridge', MIME_TYPES)).toBe(
            axiomTemplate('AxiBridge', p, 'Icon=axibridge', MIME_TYPES)
        );
    });
});

describe('registry parity with AxiOM', () => {
    // AxiOM's APP_META.axibridge.name is 'AxiBridge'. Sourcing the name from
    // electron's app.name yielded 'axibridge', so the two writers produced
    // different files and clobbered each other on every launch.
    it('uses the same display name as AxiOM, not the lowercase package name', () => {
        expect(APP_NAME).toBe('AxiBridge');
    });

    // app.setAsDefaultProtocolClient('axibridge') is pointless unless the
    // desktop entry declares the scheme, so every rewrite that omitted this
    // line silently dropped the axibridge:// registration.
    it('declares the axibridge:// scheme handler', () => {
        expect(MIME_TYPES).toEqual(['x-scheme-handler/axibridge']);
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

describe('resolveOwnAppImage', () => {
    it('accepts $APPIMAGE when our executable lives inside the mounted $APPDIR', () => {
        const env = {
            APPIMAGE: '/home/u/AppImages/AxiBridge-2.18.0.AppImage',
            APPDIR: '/tmp/.mount_AxiBrAbc123'
        };
        expect(resolveOwnAppImage(env, '/tmp/.mount_AxiBrAbc123/axibridge')).toBe(env.APPIMAGE);
    });

    it('ignores an $APPIMAGE inherited from a parent AppImage', () => {
        // A dev/unpackaged run launched from a terminal inside another AppImage
        // (e.g. SAI) inherits that app's $APPIMAGE/$APPDIR. Trusting it made us
        // rewrite axibridge.desktop to launch SAI.
        const env = {
            APPIMAGE: '/home/u/AppImages/sai.appimage',
            APPDIR: '/tmp/.mount_sai.apUXTvCc'
        };
        expect(resolveOwnAppImage(env, '/home/u/src/axibridge/node_modules/electron/dist/electron')).toBeUndefined();
    });

    it('ignores $APPIMAGE when $APPDIR is absent', () => {
        expect(resolveOwnAppImage({ APPIMAGE: '/home/u/AppImages/sai.appimage' }, '/usr/bin/electron')).toBeUndefined();
    });

    it('returns undefined when not running from an AppImage at all', () => {
        expect(resolveOwnAppImage({}, '/usr/bin/electron')).toBeUndefined();
    });

    it('does not treat a sibling mount with a shared prefix as ours', () => {
        const env = { APPIMAGE: '/home/u/AppImages/sai.appimage', APPDIR: '/tmp/.mount_sai' };
        expect(resolveOwnAppImage(env, '/tmp/.mount_sai2/axibridge')).toBeUndefined();
    });
});

describe('writeDesktopEntry', () => {
    const opts = (over: Partial<Parameters<typeof writeDesktopEntry>[0]> = {}) => ({
        appId: 'axibridge',
        name: 'AxiBridge',
        appImagePath: '/home/u/AppImages/AxiBridge-2.13.5.AppImage',
        homeDir: tmp,
        mimeTypes: MIME_TYPES,
        ...over
    });
    const desktopFile = () => path.join(tmp, '.local', 'share', 'applications', 'axibridge.desktop');

    it('writes the entry then reports unchanged on a second identical call', () => {
        expect(writeDesktopEntry(opts())).toBe('written');
        const content = fs.readFileSync(desktopFile(), 'utf8');
        expect(content).toContain('TryExec=/home/u/AppImages/AxiBridge-2.13.5.AppImage');
        expect(content).toBe(axiomTemplate('AxiBridge', '/home/u/AppImages/AxiBridge-2.13.5.AppImage', 'Icon=axibridge', MIME_TYPES));
        expect(writeDesktopEntry(opts())).toBe('unchanged');
    });

    // Regression: an earlier template had no MimeType line, so each rewrite
    // wiped the axibridge:// handler registration off the entry.
    it('restores a MimeType line that a previous rewrite dropped', () => {
        const appsDir = path.join(tmp, '.local', 'share', 'applications');
        fs.mkdirSync(appsDir, { recursive: true });
        fs.writeFileSync(path.join(appsDir, 'axibridge.desktop'), axiomTemplate('AxiBridge', '/home/u/AppImages/AxiBridge-2.13.5.AppImage', 'Icon=axibridge'));
        expect(writeDesktopEntry(opts())).toBe('written');
        expect(fs.readFileSync(desktopFile(), 'utf8')).toContain('MimeType=x-scheme-handler/axibridge;');
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
