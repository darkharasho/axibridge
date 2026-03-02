import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'node:path';
import { KINETIC_DARK_WEB_THEME_ID, KINETIC_SLATE_WEB_THEME_ID, DEFAULT_WEB_THEME_ID } from '../../shared/webThemes';
import { DEFAULT_DISRUPTION_METHOD, type DisruptionMethod } from '../../shared/metricsSettings';

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_EMBED_STATS = {
    showSquadSummary: true,
    showEnemySummary: true,
    showIncomingStats: true,
    showClassSummary: true,
    showDamage: true,
    showDownContribution: true,
    showHealing: true,
    showBarrier: true,
    showCleanses: true,
    showBoonStrips: true,
    showCC: true,
    showStability: true,
    showResurrects: false,
    showDistanceToTag: false,
    showKills: false,
    showDowns: false,
    showBreakbarDamage: false,
    showDamageTaken: false,
    showDeaths: false,
    showDodges: false,
    maxTopListRows: 10,
    classDisplay: 'off',
};

export const DEFAULT_MVP_WEIGHTS = {
    downContribution: 1,
    healing: 1,
    cleanses: 1,
    strips: 1,
    stability: 1,
    cc: 0.7,
    revives: 0.7,
    distanceToTag: 0.7,
    participation: 0.7,
    dodging: 0.4,
    dps: 0.2,
    damage: 0.2
};

export const DEFAULT_STATS_VIEW_SETTINGS = {
    showTopStats: true,
    showMvp: true,
    roundCountStats: false,
    topStatsMode: 'total',
    topSkillDamageSource: 'target',
    topSkillsMetric: 'damage'
};

export const DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS = {
    image: false,
    embed: false,
    tiled: false
};

// ─── Theme helpers ─────────────────────────────────────────────────────────────

export const normalizeKineticThemeVariant = (value: unknown): 'light' | 'midnight' | 'slate' => {
    if (value === 'midnight' || value === 'slate') return value;
    return 'light';
};

export const inferKineticThemeVariantFromThemeId = (themeId: unknown): 'light' | 'midnight' | 'slate' => {
    if (themeId === KINETIC_DARK_WEB_THEME_ID) return 'midnight';
    if (themeId === KINETIC_SLATE_WEB_THEME_ID) return 'slate';
    return 'light';
};

// ─── Private helpers ───────────────────────────────────────────────────────────

const bringDialogParentToFront = (parent: BrowserWindow | null) => {
    if (!parent) return;
    parent.show();
    parent.focus();
    try {
        app.focus({ steal: true });
    } catch {
        // noop
    }
    if (parent.isAlwaysOnTop()) {
        parent.setAlwaysOnTop(false);
    }
};

// ─── Handler registration ──────────────────────────────────────────────────────

export interface SettingsHandlerOptions {
    store: any;
    getWindow: () => BrowserWindow | null;
    clearDpsReportCache: (onProgress?: (data: any) => void) => any;
    fetchImageBuffer: (url: string) => Promise<{ buffer: Buffer; contentType: string }>;
    onApplySettings: (settings: any) => void;
}

export function registerSettingsHandlers(opts: SettingsHandlerOptions) {
    const { store, getWindow, clearDpsReportCache, fetchImageBuffer, onApplySettings } = opts;

    ipcMain.handle('get-settings', () => {
        const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
        const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE);
        const updateSupported = app.isPackaged && !isPortable && fs.existsSync(updateConfigPath);
        let updateDisabledReason: string | null = null;
        if (!updateSupported) {
            if (!app.isPackaged) {
                updateDisabledReason = 'dev';
            } else if (isPortable) {
                updateDisabledReason = 'portable';
            } else {
                updateDisabledReason = 'missing-config';
            }
        }
        return {
            logDirectory: store.get('logDirectory', null),
            discordWebhookUrl: store.get('discordWebhookUrl', null),
            discordNotificationType: store.get('discordNotificationType', 'image'),
            discordEnemySplitSettings: { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) },
            discordSplitEnemiesByTeam: store.get('discordSplitEnemiesByTeam', (() => {
                const perType = { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) };
                return Boolean(perType.image || perType.embed || perType.tiled);
            })()),
            webhooks: store.get('webhooks', []),
            selectedWebhookId: store.get('selectedWebhookId', null),
            dpsReportToken: store.get('dpsReportToken', null),
            closeBehavior: store.get('closeBehavior', 'minimize'),
            embedStatSettings: store.get('embedStatSettings', DEFAULT_EMBED_STATS),
            mvpWeights: { ...DEFAULT_MVP_WEIGHTS, ...(store.get('mvpWeights') as any || {}) },
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
            disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
            uiTheme: store.get('uiTheme', 'classic'),
            kineticFontStyle: store.get('kineticFontStyle', 'default'),
            kineticThemeVariant: normalizeKineticThemeVariant(store.get('kineticThemeVariant', inferKineticThemeVariantFromThemeId(store.get('githubWebTheme', DEFAULT_WEB_THEME_ID)))),
            dashboardLayout: store.get('dashboardLayout', 'side'),
            autoUpdateSupported: updateSupported,
            autoUpdateDisabledReason: updateDisabledReason,
            githubRepoOwner: store.get('githubRepoOwner', null),
            githubRepoName: store.get('githubRepoName', null),
            githubBranch: store.get('githubBranch', 'main'),
            githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
            githubToken: store.get('githubToken', null),
            githubWebTheme: store.get('githubWebTheme', DEFAULT_WEB_THEME_ID),
            githubLogoPath: store.get('githubLogoPath', null),
            githubFavoriteRepos: store.get('githubFavoriteRepos', []),
            walkthroughSeen: store.get('walkthroughSeen', false)
        };
    });

    ipcMain.on('save-settings', (_event, settings: any) => {
        onApplySettings(settings);
    });

    ipcMain.handle('clear-dps-report-cache', async (event) => {
        return clearDpsReportCache((progress) => {
            event.sender.send('clear-dps-report-cache-progress', progress);
        });
    });

    ipcMain.handle('export-settings', async () => {
        const parent = BrowserWindow.getFocusedWindow() || getWindow() || null;
        bringDialogParentToFront(parent);
        if (!parent) return { success: false, error: 'Window unavailable.' };
        const result = await dialog.showSaveDialog(parent, {
            title: 'Export ArcBridge Settings',
            defaultPath: 'arcbridge-settings.json',
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };

        const settings = {
            logDirectory: store.get('logDirectory', null),
            discordWebhookUrl: store.get('discordWebhookUrl', null),
            discordNotificationType: store.get('discordNotificationType', 'image'),
            discordEnemySplitSettings: { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) },
            discordSplitEnemiesByTeam: store.get('discordSplitEnemiesByTeam', (() => {
                const perType = { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(store.get('discordEnemySplitSettings') as any || {}) };
                return Boolean(perType.image || perType.embed || perType.tiled);
            })()),
            webhooks: store.get('webhooks', []),
            selectedWebhookId: store.get('selectedWebhookId', null),
            dpsReportToken: store.get('dpsReportToken', null),
            closeBehavior: store.get('closeBehavior', 'minimize'),
            embedStatSettings: store.get('embedStatSettings', DEFAULT_EMBED_STATS),
            mvpWeights: { ...DEFAULT_MVP_WEIGHTS, ...(store.get('mvpWeights') as any || {}) },
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
            disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
            uiTheme: store.get('uiTheme', 'classic'),
            kineticFontStyle: store.get('kineticFontStyle', 'default'),
            kineticThemeVariant: normalizeKineticThemeVariant(store.get('kineticThemeVariant', inferKineticThemeVariantFromThemeId(store.get('githubWebTheme', DEFAULT_WEB_THEME_ID)))),
            dashboardLayout: store.get('dashboardLayout', 'side'),
            githubRepoOwner: store.get('githubRepoOwner', null),
            githubRepoName: store.get('githubRepoName', null),
            githubBranch: store.get('githubBranch', 'main'),
            githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
            githubToken: store.get('githubToken', null),
            githubWebTheme: store.get('githubWebTheme', DEFAULT_WEB_THEME_ID),
            githubLogoPath: store.get('githubLogoPath', null),
            githubFavoriteRepos: store.get('githubFavoriteRepos', []),
            walkthroughSeen: store.get('walkthroughSeen', false)
        };

        try {
            await fs.promises.writeFile(result.filePath, JSON.stringify(settings, null, 2), 'utf-8');
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to write settings file.' };
        }
    });

    ipcMain.handle('import-settings', async () => {
        const parent = BrowserWindow.getFocusedWindow() || getWindow() || null;
        bringDialogParentToFront(parent);
        if (!parent) return { success: false, error: 'Window unavailable.' };
        const result = await dialog.showOpenDialog(parent, {
            title: 'Import ArcBridge Settings',
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
        const filePath = result.filePaths[0];
        try {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return { success: false, error: 'Invalid settings file.' };
            }
            onApplySettings(parsed);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to import settings.' };
        }
    });

    ipcMain.handle('select-settings-file', async () => {
        const parent = BrowserWindow.getFocusedWindow() || getWindow() || null;
        bringDialogParentToFront(parent);
        if (!parent) return { success: false, error: 'Window unavailable.' };
        const result = await dialog.showOpenDialog(parent, {
            title: 'Select Settings File',
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
        const filePath = result.filePaths[0];
        try {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return { success: false, error: 'Invalid settings file.' };
            }
            return { success: true, settings: parsed, filePath };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to read settings file.' };
        }
    });

    ipcMain.handle('open-external', async (_event, url: string) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('fetch-image-data-url', async (_event, url: string) => {
        try {
            if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL.' };
            if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Unsupported URL scheme.' };
            const { buffer, contentType } = await fetchImageBuffer(url);
            const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
            return { success: true, dataUrl };
        } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to fetch image.' };
        }
    });
}
