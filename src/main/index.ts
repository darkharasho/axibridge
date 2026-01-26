import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { LogWatcher } from './watcher'
import { Uploader } from './uploader'
import { DiscordNotifier } from './discord';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { DesktopIntegrator } from './integration';

// Handle EPIPE errors gracefully - these occur when stdout/stderr pipes close
// (e.g., when running as AppImage without a terminal)
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return; // Silently ignore EPIPE errors
    throw err;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') return; // Silently ignore EPIPE errors
    throw err;
});

// Configure autoUpdater logger
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Hook console logging to send to renderer
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function formatLogArgs(args: any[]) {
    return args.map(arg => {
        if (arg instanceof Error) {
            return arg.stack || arg.message;
        }
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

console.log = (...args) => {
    originalConsoleLog(...args);
    if (win && !win.isDestroyed()) {
        win.webContents.send('console-log', { type: 'info', message: formatLogArgs(args), timestamp: new Date().toISOString() });
    }
};

console.error = (...args) => {
    originalConsoleError(...args);
    if (win && !win.isDestroyed()) {
        win.webContents.send('console-log', { type: 'error', message: formatLogArgs(args), timestamp: new Date().toISOString() });
    }
};

const Store = require('electron-store');
const store = new Store();

process.env.DIST = path.join(__dirname, '../../')
process.env.VITE_PUBLIC = app.isPackaged ? path.join(process.env.DIST, 'dist-react') : path.join(process.env.DIST, 'public')

let win: BrowserWindow | null
let tray: Tray | null = null
let isQuitting = false
let watcher: LogWatcher | null = null
let uploader: Uploader | null = null
let discord: DiscordNotifier | null = null
const pendingDiscordLogs = new Map<string, { result: any, jsonDetails: any }>();

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] || 'http://localhost:5173';

function createTray() {
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'img/logo.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                win?.show();
                win?.focus();
            }
        },
        {
            label: 'Manual Upload...',
            click: () => {
                if (win) {
                    win.show();
                    win.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('GW2 Arc Log Uploader');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (win?.isVisible()) {
            win.hide();
        } else {
            win?.show();
            win?.focus();
        }
    });
}

function createWindow() {
    const bounds = store.get('windowBounds') as { width: number, height: number } | undefined;

    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'img/logo.png');
    console.log(`[Main] Loading icon from: ${iconPath}`);
    const appIcon = nativeImage.createFromPath(iconPath);

    win = new BrowserWindow({
        icon: appIcon,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
        },
        width: bounds ? bounds.width : 1200,
        height: bounds ? bounds.height : 800,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#000000',
        show: true
    })

    win.on('resize', () => {
        if (!win) return;
        const [width, height] = win.getSize();
        store.set('windowBounds', { width, height });
    });

    // Handle close event based on user preference
    win.on('close', (event) => {
        if (!isQuitting) {
            const closeBehavior = store.get('closeBehavior', 'minimize');
            if (closeBehavior === 'minimize') {
                event.preventDefault();
                win?.hide();
            } else {
                // closeBehavior === 'quit', fully quit the application
                isQuitting = true;
                app.quit();
            }
        }
    });

    watcher = new LogWatcher();
    uploader = new Uploader();
    discord = new DiscordNotifier();

    // Initialize Discord config
    const webhookUrl = store.get('discordWebhookUrl');
    if (webhookUrl && typeof webhookUrl === 'string') {
        discord.setWebhookUrl(webhookUrl);
    }

    // Initialize embed stat settings
    const embedStatSettings = store.get('embedStatSettings');
    if (embedStatSettings) {
        discord.setEmbedStatSettings(embedStatSettings as any);
    }

    // Initialize dps.report token
    const dpsReportToken = store.get('dpsReportToken');
    if (dpsReportToken && typeof dpsReportToken === 'string') {
        uploader.setUserToken(dpsReportToken);
    }

    watcher.on('log-detected', async (filePath: string) => {
        const fileId = path.basename(filePath);
        win?.webContents.send('upload-status', { id: fileId, filePath, status: 'uploading' });

        try {
            const result = await uploader?.upload(filePath);

            if (result && !result.error) {
                console.log(`[Main] Upload successful: ${result.permalink}. Fetching details...`);
                let jsonDetails = await uploader?.fetchDetailedJson(result.permalink);

                if (!jsonDetails || jsonDetails.error) {
                    console.log('[Main] Retrying JSON fetch in 2 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    jsonDetails = await uploader?.fetchDetailedJson(result.permalink);
                }

                win?.webContents.send('upload-status', {
                    id: fileId,
                    filePath,
                    status: 'discord',
                    permalink: result.permalink,
                    uploadTime: result.uploadTime,
                    encounterDuration: result.encounterDuration,
                    fightName: result.fightName
                });

                const notificationType = store.get('discordNotificationType', 'image');
                console.log(`[Main] Preparing Discord delivery. Configured type: ${notificationType}`);

                try {
                    if (notificationType === 'image') {
                        pendingDiscordLogs.set(result.id, { result: { ...result, filePath }, jsonDetails });
                        win?.webContents.send('request-screenshot', { ...result, filePath, details: jsonDetails });
                    } else {
                        await discord?.sendLog({ ...result, filePath, mode: 'embed' }, jsonDetails);
                    }
                } catch (discordError: any) {
                    console.error('[Main] Discord notification failed:', discordError?.message || discordError);
                    // Still mark as success since upload worked, but log the Discord failure
                }

                win?.webContents.send('upload-complete', {
                    ...result,
                    filePath,
                    status: 'success',
                    details: jsonDetails
                });
            } else {
                win?.webContents.send('upload-complete', { ...result, filePath, status: 'error' });
            }
        } catch (error: any) {
            console.error('[Main] Log processing failed:', error?.message || error);
            win?.webContents.send('upload-complete', {
                id: fileId,
                filePath,
                status: 'error',
                error: error?.message || 'Unknown error during processing'
            });
        }
    });

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (!app.isPackaged) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'dist-react/index.html'))
    }
}

function setupAutoUpdater() {
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        win?.webContents.send('update-message', 'Checking for update...');
    });
    autoUpdater.on('update-available', (info: any) => {
        log.info('Update available.');
        win?.webContents.send('update-available', info);
    });
    autoUpdater.on('update-not-available', (info: any) => {
        log.info('Update not available.');
        win?.webContents.send('update-not-available', info);
    });
    autoUpdater.on('error', (err: any) => {
        log.error('Error in auto-updater. ' + err);
        win?.webContents.send('update-error', err);
    });
    autoUpdater.on('download-progress', (progressObj: any) => {
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
        // log.info(log_message);
        win?.webContents.send('download-progress', progressObj);
    });
    autoUpdater.on('update-downloaded', (info: any) => {
        log.info('Update downloaded');
        win?.webContents.send('update-downloaded', info);
    });
}


app.on('window-all-closed', () => {
    // Keep alive for tray
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        win?.show();
    }
})

app.on('before-quit', () => {
    isQuitting = true;
});

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is already running, quit this one
    app.quit();
} else {
    // This is the first/primary instance
    app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        createWindow();
        createTray();

        // Desktop Integration for Linux AppImage
        if (process.platform === 'linux') {
            const integrator = new DesktopIntegrator();
            integrator.integrate().catch(err => console.error('Integration error:', err));
        }

        // Check for updates
        setupAutoUpdater();

        // Disable auto-download to give more control
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        if (process.platform === 'linux' && !process.env.APPIMAGE) {
            log.info('[AutoUpdater] Detected Linux non-AppImage run. Disabling auto-download to ensure detection works without download errors.');
            autoUpdater.autoDownload = false;
        }

        // Check for updates after a short delay to ensure window is ready
        // Only check for updates in packaged apps (not development)
        setTimeout(async () => {
            // Skip auto-update in development mode
            if (!app.isPackaged) {
                log.info('[AutoUpdater] Skipping update check in development mode');
                win?.webContents.send('update-not-available', { version: app.getVersion() });
                return;
            }

            // Log the package type for debugging
            if (process.platform === 'linux') {
                if (process.env.APPIMAGE) {
                    log.info('[AutoUpdater] Running as AppImage:', process.env.APPIMAGE);
                } else {
                    log.info('[AutoUpdater] Running as installed package (deb/rpm)');
                }
            }

            try {
                log.info('[AutoUpdater] Starting update check...');
                const result = await Promise.race([
                    autoUpdater.checkForUpdates(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Update check timed out after 30s')), 30000)
                    )
                ]);
                log.info('[AutoUpdater] Update check completed:', result);
            } catch (err: any) {
                log.error('[AutoUpdater] Update check failed:', err?.message || err);
                win?.webContents.send('update-error', { message: err?.message || 'Update check failed' });
            }
        }, 3000);

        ipcMain.on('check-for-updates', async () => {
            // Skip auto-update in development mode
            if (!app.isPackaged) {
                log.info('[AutoUpdater] Manual check skipped in development mode');
                win?.webContents.send('update-not-available', { version: app.getVersion() });
                return;
            }

            try {
                await autoUpdater.checkForUpdates();
            } catch (err: any) {
                log.error('[AutoUpdater] Manual check failed:', err?.message || err);
                win?.webContents.send('update-error', { message: err?.message || 'Update check failed' });
            }
        });

        ipcMain.on('restart-app', () => {
            autoUpdater.quitAndInstall();
        });

        ipcMain.handle('get-app-version', () => {
            return app.getVersion();
        });

        // Default embed stat settings
        const DEFAULT_EMBED_STATS = {
            showSquadSummary: true,
            showEnemySummary: true,
            showIncomingStats: true,
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
        };

        ipcMain.handle('get-settings', () => {
            return {
                logDirectory: store.get('logDirectory', null),
                discordWebhookUrl: store.get('discordWebhookUrl', null),
                discordNotificationType: store.get('discordNotificationType', 'image'),
                webhooks: store.get('webhooks', []),
                selectedWebhookId: store.get('selectedWebhookId', null),
                dpsReportToken: store.get('dpsReportToken', null),
                closeBehavior: store.get('closeBehavior', 'minimize'),
                embedStatSettings: store.get('embedStatSettings', DEFAULT_EMBED_STATS)
            };
        });

        // Clear logs from store to improve boot time (persistence removed)
        if (store.has('logs')) {
            console.log('[Main] Clearing persistent logs to improve startup time.');
            store.delete('logs');
        }

        // Removed get-logs and save-logs handlers

        ipcMain.on('save-settings', (_event, settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'image' | 'embed', webhooks?: any[], selectedWebhookId?: string | null, dpsReportToken?: string | null, closeBehavior?: 'minimize' | 'quit', embedStatSettings?: any }) => {
            if (settings.logDirectory !== undefined) {
                store.set('logDirectory', settings.logDirectory);
                if (settings.logDirectory) watcher?.start(settings.logDirectory);
            }
            if (settings.discordWebhookUrl !== undefined) {
                store.set('discordWebhookUrl', settings.discordWebhookUrl);
                discord?.setWebhookUrl(settings.discordWebhookUrl);
            }
            if (settings.discordNotificationType !== undefined) {
                store.set('discordNotificationType', settings.discordNotificationType);
            }
            if (settings.webhooks !== undefined) {
                store.set('webhooks', settings.webhooks);
            }
            if (settings.selectedWebhookId !== undefined) {
                store.set('selectedWebhookId', settings.selectedWebhookId);
                // Update the active webhook URL based on selected ID
                const webhooks = store.get('webhooks', []) as any[];
                const selected = webhooks.find((w: any) => w.id === settings.selectedWebhookId);
                if (selected) {
                    store.set('discordWebhookUrl', selected.url);
                    discord?.setWebhookUrl(selected.url);
                }
            }
            if (settings.dpsReportToken !== undefined) {
                store.set('dpsReportToken', settings.dpsReportToken);
                uploader?.setUserToken(settings.dpsReportToken);
            }
            if (settings.closeBehavior !== undefined) {
                store.set('closeBehavior', settings.closeBehavior);
            }
            if (settings.embedStatSettings !== undefined) {
                store.set('embedStatSettings', settings.embedStatSettings);
                discord?.setEmbedStatSettings(settings.embedStatSettings);
            }
        });

        ipcMain.handle('select-directory', async () => {
            if (!win) return null;
            const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
            if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0];
            return null;
        });

        ipcMain.on('start-watching', (_event, dirPath: string) => {
            watcher?.start(dirPath);
            store.set('logDirectory', dirPath);
        });

        ipcMain.on('set-discord-webhook', (_event, url: string) => {
            discord?.setWebhookUrl(url);
            store.set('discordWebhookUrl', url);
        });

        ipcMain.on('manual-upload', (_event, filePath: string) => {
            watcher?.emit('log-detected', filePath);
        });

        ipcMain.on('manual-upload-batch', (_event, filePaths: string[]) => {
            console.log(`[Main] Received batch of ${filePaths.length} logs.`);
            // Process sequentially to avoid overwhelming the system
            (async () => {
                for (const filePath of filePaths) {
                    watcher?.emit('log-detected', filePath);
                    // Small delay to allow UI updates to breathe
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            })();
        });

        ipcMain.on('window-control', (_event, action: 'minimize' | 'maximize' | 'close') => {
            if (!win) return;
            if (action === 'minimize') win.minimize();
            else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
            else if (action === 'close') win.close(); // Triggers the 'close' event handler
        });

        ipcMain.handle('open-external', async (_event, url: string) => {
            try {
                await shell.openExternal(url);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.on('send-screenshot', async (_event, logId: string, buffer: Uint8Array) => {
            const data = pendingDiscordLogs.get(logId);
            if (data && discord) {
                await discord.sendLog({ ...data.result, imageBuffer: buffer, mode: 'image' }, data.jsonDetails);
                pendingDiscordLogs.delete(logId);
            }
        });

        ipcMain.on('send-stats-screenshot', async (_event, buffer: Uint8Array) => {
            if (discord) {
                // We create a dummy log entry for the generalized stats
                const dummyLog: any = {
                    id: 'stats-dashboard',
                    fightName: 'Weekly Statistics',
                    encounterDuration: 'Summary',
                    uploadTime: Math.floor(Date.now() / 1000),
                    permalink: 'https://dps.report',
                    imageBuffer: buffer,
                    mode: 'image'
                };
                // We pass a dummy jsonDetails for the title
                try {
                    await discord.sendLog(dummyLog, { fightName: 'Aggregated Statistics' });
                    console.log('[Main] Stats screenshot sent to Discord.');
                } catch (e) {
                    console.error('[Main] Failed to send stats screenshot:', e);
                }
            }
        });
    })
}
