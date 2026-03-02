import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'node:path';

export interface FileHandlerOptions {
    getWindow: () => BrowserWindow | null;
}

export function registerFileHandlers(opts: FileHandlerOptions) {
    const { getWindow } = opts;

    ipcMain.handle('select-directory', async () => {
        const win = getWindow();
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
        return null;
    });

    ipcMain.handle('select-files', async (_event, payload?: { defaultPath?: string }) => {
        const win = getWindow();
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, {
            properties: ['openFile', 'multiSelections'],
            defaultPath: payload?.defaultPath,
            filters: [
                { name: 'Arc Logs', extensions: ['evtc', 'zevtc'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) return result.filePaths;
        return null;
    });

    ipcMain.handle('select-github-logo', async () => {
        const win = getWindow();
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
        return null;
    });

    ipcMain.handle('list-log-files', async (_event, payload?: { dir?: string }) => {
        try {
            const dir = payload?.dir;
            if (!dir) return { success: false, error: 'Missing directory.' };
            if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found.' };
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            const files = await Promise.all(entries
                .filter((entry) => entry.isFile() && (entry.name.endsWith('.evtc') || entry.name.endsWith('.zevtc')))
                .map(async (entry) => {
                    const fullPath = path.join(dir, entry.name);
                    const stat = await fs.promises.stat(fullPath);
                    return {
                        path: fullPath,
                        name: entry.name,
                        mtimeMs: stat.mtimeMs,
                        size: stat.size
                    };
                }));
            files.sort((a, b) => b.mtimeMs - a.mtimeMs);
            return { success: true, files };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to list log files.' };
        }
    });
}
