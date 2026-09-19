import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { scanLogFiles } from '../logFileScan';
import { recallDialogPath, rememberDialogPath } from '../dialogDefaults';

export interface FileHandlerOptions {
    getWindow: () => BrowserWindow | null;
    /** The configured arcdps folder, used the first time a picker opens.
     *  Electron 44 starts dialogs in Downloads otherwise. */
    getLogDirectory?: () => string | null;
}

export function registerFileHandlers(opts: FileHandlerOptions) {
    const { getWindow, getLogDirectory } = opts;

    ipcMain.handle('select-directory', async () => {
        const win = getWindow();
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            defaultPath: recallDialogPath('log-directory', getLogDirectory?.()),
        });
        if (!result.canceled && result.filePaths.length > 0) {
            rememberDialogPath('log-directory', result.filePaths[0], 'directory');
            return result.filePaths[0];
        }
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
            defaultPath: payload?.defaultPath || recallDialogPath('log-files', getLogDirectory?.()),
            filters
        });
        if (!result.canceled && result.filePaths.length > 0) {
            rememberDialogPath('log-files', result.filePaths[0]);
            return result.filePaths;
        }
        return null;
    });

    ipcMain.handle('select-github-logo', async () => {
        const win = getWindow();
        if (!win) return null;
        const result = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            defaultPath: recallDialogPath('github-logo'),
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            rememberDialogPath('github-logo', result.filePaths[0]);
            return result.filePaths[0];
        }
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
