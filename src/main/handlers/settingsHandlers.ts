import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'node:path';
import { LEGACY_THEME_TO_PALETTE } from '../../shared/webThemes';
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
    offensiveDownContribution: 1,
    offensiveStrips: 1,
    offensiveCc: 0.7,
    offensiveDps: 0.2,
    offensiveDamage: 0.2,
    generalDistanceToTag: 0.7,
    generalParticipation: 0.7,
    generalDodging: 0.4,
    defensiveHealing: 1,
    defensiveCleanses: 1,
    defensiveStability: 1,
    defensiveRevives: 0.7,
    defensiveDistanceToTag: 0.7,
    defensiveParticipation: 0.7,
    defensiveDodging: 0.4
};

export const normalizeMvpWeights = (weights: unknown) => {
    const input = (weights && typeof weights === 'object') ? (weights as Record<string, unknown>) : {};
    const toNum = (key: string, legacyKey: string, fallback: number) => {
        const next = input[key] ?? input[legacyKey] ?? fallback;
        const value = Number(next);
        return Number.isFinite(value) ? value : fallback;
    };
    return {
        offensiveDownContribution: toNum('offensiveDownContribution', 'downContribution', DEFAULT_MVP_WEIGHTS.offensiveDownContribution),
        offensiveStrips: toNum('offensiveStrips', 'strips', DEFAULT_MVP_WEIGHTS.offensiveStrips),
        offensiveCc: toNum('offensiveCc', 'cc', DEFAULT_MVP_WEIGHTS.offensiveCc),
        offensiveDps: toNum('offensiveDps', 'dps', DEFAULT_MVP_WEIGHTS.offensiveDps),
        offensiveDamage: toNum('offensiveDamage', 'damage', DEFAULT_MVP_WEIGHTS.offensiveDamage),
        generalDistanceToTag: toNum('generalDistanceToTag', 'defensiveDistanceToTag', toNum('generalDistanceToTag', 'distanceToTag', DEFAULT_MVP_WEIGHTS.generalDistanceToTag)),
        generalParticipation: toNum('generalParticipation', 'defensiveParticipation', toNum('generalParticipation', 'participation', DEFAULT_MVP_WEIGHTS.generalParticipation)),
        generalDodging: toNum('generalDodging', 'defensiveDodging', toNum('generalDodging', 'dodging', DEFAULT_MVP_WEIGHTS.generalDodging)),
        defensiveHealing: toNum('defensiveHealing', 'healing', DEFAULT_MVP_WEIGHTS.defensiveHealing),
        defensiveCleanses: toNum('defensiveCleanses', 'cleanses', DEFAULT_MVP_WEIGHTS.defensiveCleanses),
        defensiveStability: toNum('defensiveStability', 'stability', DEFAULT_MVP_WEIGHTS.defensiveStability),
        defensiveRevives: toNum('defensiveRevives', 'revives', DEFAULT_MVP_WEIGHTS.defensiveRevives),
        defensiveDistanceToTag: toNum('defensiveDistanceToTag', 'generalDistanceToTag', toNum('generalDistanceToTag', 'distanceToTag', DEFAULT_MVP_WEIGHTS.defensiveDistanceToTag)),
        defensiveParticipation: toNum('defensiveParticipation', 'generalParticipation', toNum('generalParticipation', 'participation', DEFAULT_MVP_WEIGHTS.defensiveParticipation)),
        defensiveDodging: toNum('defensiveDodging', 'generalDodging', toNum('generalDodging', 'dodging', DEFAULT_MVP_WEIGHTS.defensiveDodging))
    };
};

export const DEFAULT_STATS_VIEW_SETTINGS = {
    showTopStats: true,
    showMvp: true,
    roundCountStats: false,
    splitPlayersByClass: false,
    topStatsMode: 'total',
    topSkillDamageSource: 'target',
    topSkillsMetric: 'damage'
};

export const DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS = {
    image: false,
    embed: false,
    tiled: false
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
            discordNotificationType: 'embed' as const,
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
            mvpWeights: normalizeMvpWeights(store.get('mvpWeights')),
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
            disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
            colorPalette: store.get('colorPalette', 'electric-blue'),
            glassSurfaces: store.get('glassSurfaces', false),
            autoUpdateSupported: updateSupported,
            autoUpdateDisabledReason: updateDisabledReason,
            githubRepoOwner: store.get('githubRepoOwner', null),
            githubRepoName: store.get('githubRepoName', null),
            githubBranch: store.get('githubBranch', 'main'),
            githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
            githubToken: store.get('githubToken', null),
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
            title: 'Export AxiBridge Settings',
            defaultPath: 'axibridge-settings.json',
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };

        const settings = {
            logDirectory: store.get('logDirectory', null),
            discordWebhookUrl: store.get('discordWebhookUrl', null),
            discordNotificationType: 'embed' as const,
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
            mvpWeights: normalizeMvpWeights(store.get('mvpWeights')),
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
            disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
            colorPalette: store.get('colorPalette', 'electric-blue'),
            glassSurfaces: store.get('glassSurfaces', false),
            githubRepoOwner: store.get('githubRepoOwner', null),
            githubRepoName: store.get('githubRepoName', null),
            githubBranch: store.get('githubBranch', 'main'),
            githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
            githubToken: store.get('githubToken', null),
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
            title: 'Import AxiBridge Settings',
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
            const importedSettings = parsed as Record<string, any>;
            if (importedSettings.uiTheme && !importedSettings.colorPalette) {
                const mapping = LEGACY_THEME_TO_PALETTE[importedSettings.uiTheme] ?? { palette: 'electric-blue', glass: false };
                importedSettings.colorPalette = mapping.palette;
                importedSettings.glassSurfaces = mapping.glass;
                delete importedSettings.uiTheme;
                delete importedSettings.githubWebTheme;
                delete importedSettings.kineticFontStyle;
                delete importedSettings.kineticThemeVariant;
                delete importedSettings.dashboardLayout;
            }
            onApplySettings(importedSettings);
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
