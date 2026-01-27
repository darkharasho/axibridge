export interface IWebhook {
    id: string;
    name: string;
    url: string;
}

// Discord embed stat toggle settings
export interface IEmbedStatSettings {
    // Summary sections
    showSquadSummary: boolean;
    showEnemySummary: boolean;
    showIncomingStats: boolean;

    // Top 10 lists (default enabled)
    showDamage: boolean;
    showDownContribution: boolean;
    showHealing: boolean;
    showBarrier: boolean;
    showCleanses: boolean;
    showBoonStrips: boolean;
    showCC: boolean;
    showStability: boolean;

    // Top 10 lists (default disabled)
    showResurrects: boolean;
    showDistanceToTag: boolean;
    showKills: boolean;
    showDowns: boolean;
    showBreakbarDamage: boolean;
    showDamageTaken: boolean;
    showDeaths: boolean;
    showDodges: boolean;
    maxTopListRows: number;
    classDisplay: 'off' | 'short' | 'emoji';
}

export interface IMvpWeights {
    downContribution: number;
    healing: number;
    cleanses: number;
    strips: number;
    stability: number;
    cc: number;
    revives: number;
    distanceToTag: number;
    participation: number;
    dodging: number;
    dps: number;
    damage: number;
}

// Default embed stat settings
export const DEFAULT_EMBED_STATS: IEmbedStatSettings = {
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
    // Default disabled - optional stats
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

export const DEFAULT_MVP_WEIGHTS: IMvpWeights = {
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

export interface IElectronAPI {
    selectDirectory: () => Promise<string | null>;
    startWatching: (path: string) => void;
    onLogDetected: (callback: (path: string) => void) => () => void;
    onUploadComplete: (callback: (data: any) => void) => () => void;
    onUploadStatus: (callback: (data: any) => void) => () => void;
    setDiscordWebhook: (url: string) => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    getSettings: () => Promise<{
        logDirectory: string | null;
        discordWebhookUrl: string | null;
        discordNotificationType: 'image' | 'image-beta' | 'embed';
        webhooks: IWebhook[];
        selectedWebhookId: string | null;
        dpsReportToken: string | null;
        closeBehavior: 'minimize' | 'quit';
        embedStatSettings: IEmbedStatSettings;
        mvpWeights: IMvpWeights;
        githubRepoOwner?: string | null;
        githubRepoName?: string | null;
        githubBranch?: string | null;
        githubPagesBaseUrl?: string | null;
        githubToken?: string | null;
        githubWebTheme?: string | null;
    }>;
    manualUpload: (path: string) => void;
    manualUploadBatch: (paths: string[]) => void;
    saveSettings: (settings: {
        logDirectory?: string | null;
        discordWebhookUrl?: string | null;
        discordNotificationType?: 'image' | 'image-beta' | 'embed';
        webhooks?: IWebhook[];
        selectedWebhookId?: string | null;
        dpsReportToken?: string | null;
        closeBehavior?: 'minimize' | 'quit';
        embedStatSettings?: IEmbedStatSettings;
        mvpWeights?: IMvpWeights;
        githubRepoOwner?: string | null;
        githubRepoName?: string | null;
        githubBranch?: string | null;
        githubPagesBaseUrl?: string | null;
        githubToken?: string | null;
        githubWebTheme?: string | null;
    }) => void;
    onRequestScreenshot: (callback: (data: any) => void) => () => void;
    openExternal: (url: string) => Promise<{ success: boolean, error?: string }>;
    sendScreenshot: (id: string, buffer: Uint8Array) => void;
    sendScreenshots: (id: string, buffers: Uint8Array[]) => void;
    sendScreenshotsGroups: (id: string, groups: Uint8Array[][]) => void;
    onConsoleLog: (callback: (log: { type: 'info' | 'error', message: string, timestamp: string }) => void) => () => void;
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
    getWhatsNew: () => Promise<{
        version: string;
        lastSeenVersion: string | null;
        releaseNotes: string | null;
    }>;
    setLastSeenVersion: (version: string) => Promise<void>;
    startGithubOAuth: () => Promise<{ success: boolean; error?: string; userCode?: string; verificationUri?: string }>;
    onGithubAuthComplete: (callback: (data: { success: boolean; token?: string; error?: string }) => void) => () => void;
    getGithubRepos: () => Promise<{ success: boolean; repos?: Array<{ full_name: string; name: string; owner: string }> ; error?: string }>;
    getGithubReports: () => Promise<{ success: boolean; reports?: any[]; error?: string }>;
    deleteGithubReports: (payload: { ids: string[] }) => Promise<{ success: boolean; removed?: string[]; error?: string }>;
    listLogFiles: (payload: { dir: string }) => Promise<{ success: boolean; files?: Array<{ path: string; name: string; mtimeMs: number; size: number }>; error?: string }>;
    createGithubRepo: (params: { name: string; branch?: string }) => Promise<{ success: boolean; repo?: { full_name: string; owner: string; name: string; pagesUrl?: string }; error?: string }>;
    uploadWebReport: (payload: { meta: any; stats: any }) => Promise<{ success: boolean; url?: string; error?: string }>;
    getGithubPagesBuildStatus: () => Promise<{ success: boolean; status?: string; updatedAt?: string; errorMessage?: string; error?: string }>;
    onWebUploadStatus: (callback: (data: { stage: string; message?: string; progress?: number }) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }

    interface ILogData {
        id: string;
        permalink: string;
        filePath: string;
        status?: 'queued' | 'pending' | 'uploading' | 'discord' | 'success' | 'error';
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
