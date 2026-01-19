export interface IElectronAPI {
    selectDirectory: () => Promise<string | null>;
    startWatching: (path: string) => void;
    onLogDetected: (callback: (path: string) => void) => () => void;
    onUploadComplete: (callback: (data: any) => void) => () => void;
    onUploadStatus: (callback: (data: any) => void) => () => void;
    setDiscordWebhook: (url: string) => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    getSettings: () => Promise<{ logDirectory: string | null, discordWebhookUrl: string | null, discordNotificationType: 'image' | 'embed' }>;
    manualUpload: (path: string) => void;
    manualUploadBatch: (paths: string[]) => void;
    saveSettings: (settings: { logDirectory?: string | null, discordWebhookUrl?: string | null, discordNotificationType?: 'image' | 'embed' }) => void;
    onRequestScreenshot: (callback: (data: any) => void) => () => void;
    openExternal: (url: string) => Promise<{ success: boolean, error?: string }>;
    sendScreenshot: (id: string, buffer: Uint8Array) => void;
    getLogs: () => Promise<ILogData[]>;
    saveLogs: (logs: ILogData[]) => void;
    // Auto Updater
    checkForUpdates: () => void;
    restartApp: () => void;
    onUpdateMessage: (callback: (message: string) => void) => () => void;
    onUpdateAvailable: (callback: (info: any) => void) => () => void;
    onUpdateNotAvailable: (callback: (info: any) => void) => () => void;
    onUpdateError: (callback: (err: any) => void) => () => void;
    onDownloadProgress: (callback: (progress: any) => void) => () => void;
    onUpdateDownloaded: (callback: (info: any) => void) => () => void;
    sendStatsScreenshot: (buffer: Uint8Array) => void;
    getAppVersion: () => Promise<string>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }

    interface ILogData {
        id: string;
        permalink: string;
        filePath: string;
        status?: 'uploading' | 'discord' | 'success' | 'error';
        error?: string;
        uploadTime?: number;
        encounterDuration?: string;
        fightName?: string;
        details?: {
            fightName: string;
            encounterDuration: string;
            success: boolean;
            players: IPlayer[];
            uploadTime: number;
            [key: string]: any;
        };
    }

    interface IPlayer {
        display_name: string;
        character_name: string;
        profession: string;
        group: number;
    }
}
