import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import https from 'node:https';
import http from 'node:http';
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
    generalStrips: 1,
    offensiveDps: 0.2,
    offensiveDamage: 0.2,
    generalCc: 0.7,
    generalDistanceToTag: 0.7,
    generalParticipation: 0.7,
    generalDodging: 0.4,
    defensiveHealing: 1,
    defensiveDownedHealing: 0.7,
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
        generalStrips: toNum('generalStrips', 'offensiveStrips', toNum('generalStrips', 'strips', DEFAULT_MVP_WEIGHTS.generalStrips)),
        offensiveDps: toNum('offensiveDps', 'dps', DEFAULT_MVP_WEIGHTS.offensiveDps),
        offensiveDamage: toNum('offensiveDamage', 'damage', DEFAULT_MVP_WEIGHTS.offensiveDamage),
        generalCc: toNum('generalCc', 'offensiveCc', toNum('generalCc', 'cc', DEFAULT_MVP_WEIGHTS.generalCc)),
        generalDistanceToTag: toNum('generalDistanceToTag', 'defensiveDistanceToTag', toNum('generalDistanceToTag', 'distanceToTag', DEFAULT_MVP_WEIGHTS.generalDistanceToTag)),
        generalParticipation: toNum('generalParticipation', 'defensiveParticipation', toNum('generalParticipation', 'participation', DEFAULT_MVP_WEIGHTS.generalParticipation)),
        generalDodging: toNum('generalDodging', 'defensiveDodging', toNum('generalDodging', 'dodging', DEFAULT_MVP_WEIGHTS.generalDodging)),
        defensiveHealing: toNum('defensiveHealing', 'healing', DEFAULT_MVP_WEIGHTS.defensiveHealing),
        defensiveDownedHealing: toNum('defensiveDownedHealing', 'defensiveDownedHealing', DEFAULT_MVP_WEIGHTS.defensiveDownedHealing),
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
            mvpWeightProfiles: store.get('mvpWeightProfiles', undefined),
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
            disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
            commanderThresholds: store.get('commanderThresholds', undefined),
            colorPalette: store.get('colorPalette', 'electric-blue'),
            glassSurfaces: store.get('glassSurfaces', false),
            glassmorphic: store.get('glassmorphic', false),
            particlesEnabled: store.get('particlesEnabled', true),
            autoUpdateSupported: updateSupported,
            autoUpdateDisabledReason: updateDisabledReason,
            githubRepoOwner: store.get('githubRepoOwner', null),
            githubRepoName: store.get('githubRepoName', null),
            githubBranch: store.get('githubBranch', 'main'),
            githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
            githubToken: store.get('githubToken', null),
            githubLogoPath: store.get('githubLogoPath', null),
            githubFavoriteRepos: store.get('githubFavoriteRepos', []),
            walkthroughSeen: store.get('walkthroughSeen', false),
            allowLocalJson: store.get('allowLocalJson', false),
            r2AccountId: store.get('r2AccountId', null),
            r2AccessKeyId: store.get('r2AccessKeyId', null),
            r2SecretAccessKey: store.get('r2SecretAccessKey', null),
            r2BucketName: store.get('r2BucketName', null),
            r2PublicUrl: store.get('r2PublicUrl', null),
            r2PreciseReplay: store.get('r2PreciseReplay', false),
            r2ReplayUrls: store.get('r2ReplayUrls', {}) as Record<string, string>,
        };
    });

    ipcMain.handle('save-r2-replay-urls', (_event, entries: Record<string, string>) => {
        if (!entries || typeof entries !== 'object') return { success: false };
        const existing = (store.get('r2ReplayUrls', {}) as Record<string, string>) || {};
        store.set('r2ReplayUrls', { ...existing, ...entries });
        return { success: true };
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
            mvpWeightProfiles: store.get('mvpWeightProfiles', undefined),
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, ...(store.get('statsViewSettings') as any || {}) },
            disruptionMethod: store.get('disruptionMethod', DEFAULT_DISRUPTION_METHOD),
            commanderThresholds: store.get('commanderThresholds', undefined),
            colorPalette: store.get('colorPalette', 'electric-blue'),
            glassSurfaces: store.get('glassSurfaces', false),
            glassmorphic: store.get('glassmorphic', false),
            particlesEnabled: store.get('particlesEnabled', true),
            githubRepoOwner: store.get('githubRepoOwner', null),
            githubRepoName: store.get('githubRepoName', null),
            githubBranch: store.get('githubBranch', 'main'),
            githubPagesBaseUrl: store.get('githubPagesBaseUrl', null),
            githubToken: store.get('githubToken', null),
            githubLogoPath: store.get('githubLogoPath', null),
            githubFavoriteRepos: store.get('githubFavoriteRepos', []),
            walkthroughSeen: store.get('walkthroughSeen', false),
            allowLocalJson: store.get('allowLocalJson', false),
            r2AccountId: store.get('r2AccountId', null),
            r2AccessKeyId: store.get('r2AccessKeyId', null),
            r2SecretAccessKey: store.get('r2SecretAccessKey', null),
            r2BucketName: store.get('r2BucketName', null),
            r2PublicUrl: store.get('r2PublicUrl', null),
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

    ipcMain.handle('open-mobile-preview', async (_event, url: string) => {
        try {
            const mobileWindow = new BrowserWindow({
                width: 393,
                height: 852,
                resizable: true,
                title: 'Mobile Preview',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });
            mobileWindow.loadURL(url);
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

    ipcMain.handle('fetch-r2-json', async (_event, url: string) => {
        if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL.' };
        if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Unsupported URL scheme.' };
        return new Promise((resolve) => {
            const lib = url.startsWith('https') ? https : http;
            lib.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve({ success: true, json: JSON.parse(data) });
                        } catch {
                            resolve({ success: false, error: 'Response is not valid JSON.' });
                        }
                    } else {
                        resolve({ success: false, error: `HTTP ${res.statusCode}` });
                    }
                });
            }).on('error', (err: Error) => resolve({ success: false, error: err.message }));
        });
    });
}
