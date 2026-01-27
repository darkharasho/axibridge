import { contextBridge, ipcRenderer } from 'electron'

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
    onUploadStatus: (callback: (data: any) => void) => {
        ipcRenderer.on('upload-status', (_event, value) => callback(value))
        return () => {
            ipcRenderer.removeAllListeners('upload-status')
        }
    },
    setDiscordWebhook: (url: string) => ipcRenderer.send('set-discord-webhook', url),
    windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', action),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    manualUpload: (path: string) => ipcRenderer.send('manual-upload', path),
    manualUploadBatch: (paths: string[]) => ipcRenderer.send('manual-upload-batch', paths),
    saveSettings: (settings: any) => ipcRenderer.send('save-settings', settings),
    getLogs: () => ipcRenderer.invoke('get-logs'),
    saveLogs: (logs: any[]) => ipcRenderer.send('save-logs', logs),
    onRequestScreenshot: (callback: (data: any) => void) => {
        ipcRenderer.on('request-screenshot', (_event, value) => callback(value))
        return () => {
            ipcRenderer.removeAllListeners('request-screenshot')
        }
    },
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
    sendScreenshot: (id: string, buffer: Uint8Array) => ipcRenderer.send('send-screenshot', id, buffer),
    sendScreenshots: (id: string, buffers: Uint8Array[]) => ipcRenderer.send('send-screenshots', id, buffers),
    sendScreenshotsGroups: (id: string, groups: Uint8Array[][]) => ipcRenderer.send('send-screenshots-groups', id, groups),
    onConsoleLog: (callback: (log: any) => void) => {
        ipcRenderer.on('console-log', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('console-log')
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
    sendStatsScreenshot: (buffer: Uint8Array) => ipcRenderer.send('send-stats-screenshot', buffer),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getWhatsNew: () => ipcRenderer.invoke('get-whats-new'),
    setLastSeenVersion: (version: string) => ipcRenderer.invoke('set-last-seen-version', version),
    startGithubOAuth: () => ipcRenderer.invoke('start-github-oauth'),
    onGithubAuthComplete: (callback: (data: any) => void) => {
        ipcRenderer.on('github-auth-complete', (_event, value) => callback(value));
        return () => ipcRenderer.removeAllListeners('github-auth-complete');
    },
    getGithubRepos: () => ipcRenderer.invoke('get-github-repos'),
    getGithubReports: () => ipcRenderer.invoke('get-github-reports'),
    deleteGithubReports: (payload: { ids: string[] }) => ipcRenderer.invoke('delete-github-reports', payload),
    listLogFiles: (payload: { dir: string }) => ipcRenderer.invoke('list-log-files', payload),
    createGithubRepo: (params: { name: string; branch?: string }) => ipcRenderer.invoke('create-github-repo', params),
    uploadWebReport: (payload: { meta: any; stats: any }) => ipcRenderer.invoke('upload-web-report', payload),
    getGithubPagesBuildStatus: () => ipcRenderer.invoke('get-github-pages-build-status'),
    onWebUploadStatus: (callback: (data: any) => void) => {
        ipcRenderer.on('web-upload-status', (_event, value) => callback(value));
        return () => ipcRenderer.removeAllListeners('web-upload-status');
    }
})
