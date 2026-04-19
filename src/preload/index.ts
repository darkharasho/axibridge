import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    startWatching: (path: string) => ipcRenderer.send('start-watching', path),
    onLogDetected: (callback: (path: string) => void) => {
        ipcRenderer.on('log-detected', (_event, value) => callback(value))
        return () => {
            // Cleanup if needed, though ipcRenderer.on returns nothing
            ipcRenderer.removeAllListeners('log-detected')
        }
    },
    onUploadComplete: (callback: (data: any) => void) => {
        ipcRenderer.on('upload-complete', (_event, value) => callback(value))
        return () => {
            ipcRenderer.removeAllListeners('upload-complete')
        }
    },
    onUploadPermalink: (callback: (data: { id: string; filePath: string; permalink: string }) => void) => {
        ipcRenderer.on('upload-permalink', (_event, value) => callback(value))
        return () => {
            ipcRenderer.removeAllListeners('upload-permalink')
        }
    },
    onUploadStatus: (callback: (data: any) => void) => {
        ipcRenderer.on('upload-status', (_event, value) => callback(value))
        return () => {
            ipcRenderer.removeAllListeners('upload-status')
        }
    },
    resolveDroppedFilePath: (file: File) => webUtils.getPathForFile(file),
    setDiscordWebhook: (url: string) => ipcRenderer.send('set-discord-webhook', url),
    windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', action),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    clearDpsReportCache: () => ipcRenderer.invoke('clear-dps-report-cache'),
    onClearDpsReportCacheProgress: (callback: (data: any) => void) => {
        ipcRenderer.on('clear-dps-report-cache-progress', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('clear-dps-report-cache-progress')
    },
    manualUpload: (path: string) => ipcRenderer.send('manual-upload', path),
    manualUploadBatch: (paths: string[]) => ipcRenderer.send('manual-upload-batch', paths),
    getUploadRetryQueue: () => ipcRenderer.invoke('get-upload-retry-queue'),
    retryFailedUploads: () => ipcRenderer.invoke('retry-failed-uploads'),
    resumeUploadRetries: () => ipcRenderer.invoke('resume-upload-retries'),
    onUploadRetryQueueUpdated: (callback: (data: any) => void) => {
        ipcRenderer.on('upload-retry-queue-updated', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('upload-retry-queue-updated')
    },
    saveSettings: (settings: any) => ipcRenderer.send('save-settings', settings),
    getLogs: () => ipcRenderer.invoke('get-logs'),
    saveLogs: (logs: any[]) => ipcRenderer.send('save-logs', logs),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
    openMobilePreview: (url: string) => ipcRenderer.invoke('open-mobile-preview', url),
    fetchImageAsDataUrl: (url: string) => ipcRenderer.invoke('fetch-image-data-url', url),
    fetchR2Json: (url: string) => ipcRenderer.invoke('fetch-r2-json', url),
    saveR2ReplayUrls: (entries: Record<string, string>) => ipcRenderer.invoke('save-r2-replay-urls', entries),
    onConsoleLog: (callback: (log: any) => void) => {
        ipcRenderer.on('console-log', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('console-log')
    },
    onConsoleLogHistory: (callback: (logs: any[]) => void) => {
        ipcRenderer.on('console-log-history', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('console-log-history')
    },
    setConsoleLogForwarding: (enabled: boolean) => ipcRenderer.send('set-console-log-forwarding', enabled),
    getLogDetails: (payload: { filePath: string }) => ipcRenderer.invoke('get-log-details', payload),
    onDetailsPrewarm: (callback: (data: any) => void) => {
        ipcRenderer.on('details-prewarm', (_event, value) => callback(value))
        return () => {
            ipcRenderer.removeAllListeners('details-prewarm')
        }
    },

    // Auto Updater
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    restartApp: () => ipcRenderer.send('restart-app'),
    onUpdateMessage: (callback: (message: string) => void) => {
        ipcRenderer.on('update-message', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-message')
    },
    onUpdateAvailable: (callback: (info: any) => void) => {
        ipcRenderer.on('update-available', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-available')
    },
    onUpdateNotAvailable: (callback: (info: any) => void) => {
        ipcRenderer.on('update-not-available', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-not-available')
    },
    onUpdateError: (callback: (err: any) => void) => {
        ipcRenderer.on('update-error', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-error')
    },
    onDownloadProgress: (callback: (progress: any) => void) => {
        ipcRenderer.on('download-progress', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('download-progress')
    },
    onUpdateDownloaded: (callback: (info: any) => void) => {
        ipcRenderer.on('update-downloaded', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-downloaded')
    },
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getWhatsNew: () => ipcRenderer.invoke('get-whats-new'),
    setLastSeenVersion: (version: string) => ipcRenderer.invoke('set-last-seen-version', version),
    startGithubOAuth: () => ipcRenderer.invoke('start-github-oauth'),
    onGithubAuthComplete: (callback: (data: any) => void) => {
        ipcRenderer.on('github-auth-complete', (_event, value) => callback(value));
        return () => ipcRenderer.removeAllListeners('github-auth-complete');
    },
    getGithubRepos: () => ipcRenderer.invoke('get-github-repos'),
    getGithubOrgs: () => ipcRenderer.invoke('get-github-orgs'),
    getGithubReports: (payload?: { owner?: string; repo?: string; branch?: string }) => ipcRenderer.invoke('get-github-reports', payload),
    deleteGithubReports: (payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) => ipcRenderer.invoke('delete-github-reports', payload),
    getGithubReportDetail: (payload: { reportId: string; owner?: string; repo?: string; branch?: string }) => ipcRenderer.invoke('get-github-report-detail', payload),
    listLogFiles: (payload: { dir: string; allowJson?: boolean }) => ipcRenderer.invoke('list-log-files', payload),
    createGithubRepo: (params: { name: string; branch?: string; owner?: string }) => ipcRenderer.invoke('create-github-repo', params),
    ensureGithubTemplate: () => ipcRenderer.invoke('ensure-github-template'),
    selectGithubLogo: () => ipcRenderer.invoke('select-github-logo'),
    applyGithubLogo: (payload?: { logoPath?: string }) => ipcRenderer.invoke('apply-github-logo', payload),
    uploadWebReport: (payload: { meta: any; stats: any; repoFullName?: string; repoOwner?: string; repoName?: string }) => ipcRenderer.invoke('upload-web-report', payload),
    mockWebReport: (payload: { meta: any; stats: any }) => ipcRenderer.invoke('mock-web-report', payload),
    getGithubPagesBuildStatus: (payload?: { repoFullName?: string; repoOwner?: string; repoName?: string }) => ipcRenderer.invoke('get-github-pages-build-status', payload),
    onWebUploadStatus: (callback: (data: any) => void) => {
        ipcRenderer.on('web-upload-status', (_event, value) => callback(value));
        return () => ipcRenderer.removeAllListeners('web-upload-status');
    },
    exportSettings: () => ipcRenderer.invoke('export-settings'),
    importSettings: () => ipcRenderer.invoke('import-settings'),
    selectSettingsFile: () => ipcRenderer.invoke('select-settings-file'),

    // EI (Elite Insights) local parser
    getEiStatus: () => ipcRenderer.invoke('ei:get-status'),
    installEi: () => ipcRenderer.invoke('ei:install'),
    updateEi: () => ipcRenderer.invoke('ei:update'),
    reinstallEi: () => ipcRenderer.invoke('ei:reinstall'),
    uninstallEi: () => ipcRenderer.invoke('ei:uninstall'),
    checkEiUpdate: () => ipcRenderer.invoke('ei:check-update'),
    getEiSettings: () => ipcRenderer.invoke('ei:get-settings'),
    saveEiSettings: (settings: any) => ipcRenderer.send('ei:save-settings', settings),
    getEiAutoManage: () => ipcRenderer.invoke('ei:get-auto-manage'),
    setEiAutoManage: (enabled: boolean) => ipcRenderer.send('ei:set-auto-manage', enabled),
    onEiDownloadProgress: (callback: (data: any) => void) => {
        ipcRenderer.on('ei:download-progress', (_event, value) => callback(value));
        return () => { ipcRenderer.removeAllListeners('ei:download-progress'); };
    },
    onEiParseProgress: (callback: (data: any) => void) => {
        ipcRenderer.on('ei:parse-progress', (_event, value) => callback(value));
        return () => { ipcRenderer.removeAllListeners('ei:parse-progress'); };
    },
    onEiStatusChanged: (callback: (data: any) => void) => {
        ipcRenderer.on('ei:status-changed', (_event, value) => callback(value));
        return () => { ipcRenderer.removeAllListeners('ei:status-changed'); };
    },

    // Ollama AI chat
    getOllamaStatus: () => ipcRenderer.invoke('ollama:get-status'),
    setOllamaActiveModel: (model: string) => ipcRenderer.send('ollama:set-active-model', model),
    pullOllamaModel: (model: string) => ipcRenderer.invoke('ollama:pull-model', model),
    ollamaChat: (messages: any[]) => ipcRenderer.invoke('ollama:chat', messages),
    getOllamaSettings: () => ipcRenderer.invoke('ollama:get-settings'),
    saveOllamaSettings: (settings: any) => ipcRenderer.send('ollama:save-settings', settings),
    onOllamaPullProgress: (callback: (data: any) => void) => {
        ipcRenderer.on('ollama:pull-progress', (_event, value) => callback(value));
        return () => { ipcRenderer.removeAllListeners('ollama:pull-progress'); };
    },
    onOllamaChatToken: (callback: (data: any) => void) => {
        ipcRenderer.on('ollama:chat-token', (_event, value) => callback(value));
        return () => { ipcRenderer.removeAllListeners('ollama:chat-token'); };
    },
    onOllamaStatusChanged: (callback: (status: any) => void) => {
        ipcRenderer.on('ollama:status-changed', (_event, value) => callback(value));
        return () => { ipcRenderer.removeAllListeners('ollama:status-changed'); };
    },
    setPanelOpen: (open: boolean) => ipcRenderer.send('chat:set-panel-open', open),

    onMaximizedChange: (callback: (maximized: boolean) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
        ipcRenderer.on('window:maximized-change', listener);
        return () => ipcRenderer.removeListener('window:maximized-change', listener);
    },

    // Diagnostics — renderer error reporting and memory monitoring
    reportRendererError: (payload: { source: string; message: string; stack?: string }) =>
        ipcRenderer.send('renderer-error', payload),
    onRequestRendererDiagnostics: (callback: () => void) => {
        ipcRenderer.on('request-renderer-diagnostics', () => callback());
        return () => ipcRenderer.removeAllListeners('request-renderer-diagnostics');
    },
    sendRendererDiagnostics: (payload: { heapUsed: number; heapTotal: number; heapLimit: number; logCount: number }) =>
        ipcRenderer.send('renderer-diagnostics', payload),
})
