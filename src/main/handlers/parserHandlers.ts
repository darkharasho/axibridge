import { ipcMain, BrowserWindow } from 'electron';
import { AxilogManager } from '../axilogParser';
import {
    ELITE_INSIGHTS_REMOVAL_NOTICE_KEY,
    type EliteInsightsRemovalNotice,
} from '../eliteInsightsRemoval';
import {
    DEFAULT_PARSER_SETTINGS,
    PARSER_SETTINGS_STORE_KEY,
    type ParserSettings,
} from '../parserSettings';

export interface ParserHandlerOptions {
    store: any;
    getWindow: () => BrowserWindow | null;
    getAxilogManager: () => AxilogManager | null;
}

/**
 * What is left of the parser IPC surface after the Elite Insights backend was
 * removed: what parser we have, what settings it takes, and one notice about
 * the removal itself. There is no install, update, uninstall, disk-usage or
 * engine-selection channel any more — the parser is an npm dependency.
 */
export function registerParserHandlers(opts: ParserHandlerOptions) {
    const { store, getWindow, getAxilogManager } = opts;

    ipcMain.handle('parser:get-status', () => {
        const axilog = getAxilogManager();
        const notice = store.get(ELITE_INSIGHTS_REMOVAL_NOTICE_KEY) as
            | EliteInsightsRemovalNotice
            | undefined;
        return {
            available: Boolean(axilog?.isInstalled()),
            version: axilog?.getStatus().version ?? null,
            // Rides along on the status read because the removal runs before any
            // window exists, so an event would have nobody to reach.
            eliteInsightsRemoval: notice ?? null,
        };
    });

    ipcMain.on('parser:ack-removal-notice', () => {
        store.delete(ELITE_INSIGHTS_REMOVAL_NOTICE_KEY);
    });

    ipcMain.handle('parser:get-settings', () => {
        return getAxilogManager()?.getSettings() ?? { ...DEFAULT_PARSER_SETTINGS };
    });

    ipcMain.on('parser:save-settings', (_event, settings: Partial<ParserSettings>) => {
        const axilog = getAxilogManager();
        const current = { ...DEFAULT_PARSER_SETTINGS, ...(axilog?.getSettings() ?? {}) };
        const merged: ParserSettings = { ...current, ...settings };
        axilog?.setSettings(merged);
        store.set(PARSER_SETTINGS_STORE_KEY, merged);
        getWindow()?.webContents.send('parser:settings-changed', merged);
    });
}
