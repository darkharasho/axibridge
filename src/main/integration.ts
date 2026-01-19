import { app } from 'electron';

export class DesktopIntegrator {
    private appName: string;
    private appImage: string | undefined;

    constructor() {
        this.appName = app.name || 'gw2-arc-log-uploader';
        this.appImage = process.env.APPIMAGE;
    }

    public async integrate() {
        // Desktop integration is now handled automatically by AppImage launchers
        // (AppImageLauncher, appimaged, or built-in file manager integration).
        // 
        // We no longer prompt users or try to copy the AppImage manually.
        // This avoids path resolution issues (e.g., /var/home vs /home symlinks)
        // and duplicate functionality with system-level AppImage integrators.

        if (!this.appImage) {
            console.log('[Integration] Not running as AppImage, skipping integration.');
            return;
        }

        console.log('[Integration] AppImage detected. Desktop integration handled by system.');
    }
}
