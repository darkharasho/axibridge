import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { scanLogFiles } from '../logFileScan';

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

    ipcMain.handle('select-files', async (_event, payload?: { defaultPath?: string; allowJson?: boolean }) => {
        const win = getWindow();
        if (!win) return null;
        const filters = payload?.allowJson
            ? [{ name: 'Arc Logs & EI JSON', extensions: ['evtc', 'zevtc', 'json'] }]
            : [{ name: 'Arc Logs', extensions: ['evtc', 'zevtc'] }];
        const result = await dialog.showOpenDialog(win, {
            properties: ['openFile', 'multiSelections'],
            defaultPath: payload?.defaultPath,
            filters
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

    ipcMain.handle('list-log-files', async (_event, payload?: { dir?: string; allowJson?: boolean }) => {
        try {
            const dir = payload?.dir;
            if (!dir) return { success: false, error: 'Missing directory.' };
            if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found.' };
            const files = await scanLogFiles(dir, { allowJson: payload?.allowJson });
            return { success: true, files };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to list log files.' };
        }
    });
}
