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
    showClassSummary: boolean;

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

export interface IStatsViewSettings {
    showTopStats: boolean;
    showMvp: boolean;
    roundCountStats: boolean;
    topStatsMode: 'total' | 'perSecond';
    topSkillDamageSource: 'total' | 'target';
    topSkillsMetric: 'damage' | 'downContribution';
}

export interface IDiscordEnemySplitSettings {
    image: boolean;
    embed: boolean;
    tiled: boolean;
}

export type WebUploadBuildStatus = 'idle' | 'checking' | 'building' | 'built' | 'errored' | 'unknown';

export interface IWebUploadState {
    uploading: boolean;
    message: string | null;
    stage: string | null;
    progress: number | null;
    detail: string | null;
    url: string | null;
    buildStatus: WebUploadBuildStatus;
}

export interface IDevDatasetMeta {
    id: string;
    name: string;
    createdAt: string;
}

export interface IDevDatasetSnapshot {
    schemaVersion: number;
    capturedAt: string;
    appVersion: string;
    state: {
        view?: 'dashboard' | 'stats' | 'history' | 'settings';
        expandedLogId?: string | null;
        notificationType?: 'image' | 'image-beta' | 'embed';
        embedStatSettings?: Partial<IEmbedStatSettings>;
        mvpWeights?: Partial<IMvpWeights>;
        statsViewSettings?: Partial<IStatsViewSettings>;
        disruptionMethod?: DisruptionMethod;
        uiTheme?: UiTheme;
        selectedWebhookId?: string | null;
        bulkUploadMode?: boolean;
        datasetLogOrder?: string[];
        datasetLogIds?: string[];
    };
}

export interface IDevDatasetIntegrityResult {
    ok: boolean;
    issues: string[];
    hasIntegrityFile: boolean;
    snapshotSchemaVersion: number | null;
}

export interface IUploadRetryQueueEntry {
    filePath: string;
    error: string;
    statusCode?: number;
    category: 'network' | 'auth' | 'rate-limit' | 'file' | 'unknown';
    failedAt: string;
    attempts: number;
    state: 'failed' | 'retrying';
}

export interface IUploadRetryQueueState {
    failed: number;
    retrying: number;
    resolved: number;
    paused: boolean;
    pauseReason: string | null;
    pausedAt: string | null;
    entries: IUploadRetryQueueEntry[];
}

export type UiTheme = 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic';
export type KineticFontStyle = 'default' | 'original';
export type DashboardLayout = 'top' | 'side';

export type DisruptionMethod = 'count' | 'duration' | 'tiered';

export const DEFAULT_DISRUPTION_METHOD: DisruptionMethod = 'count';

// Default embed stat settings
export const DEFAULT_EMBED_STATS: IEmbedStatSettings = {
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

export const DEFAULT_STATS_VIEW_SETTINGS: IStatsViewSettings = {
    showTopStats: true,
    showMvp: true,
    roundCountStats: false,
    topStatsMode: 'total',
    topSkillDamageSource: 'target',
    topSkillsMetric: 'damage'
};

export const DEFAULT_WEB_UPLOAD_STATE: IWebUploadState = {
    uploading: false,
    message: null,
    stage: null,
    progress: null,
    detail: null,
    url: null,
    buildStatus: 'idle'
};

export const DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS: IDiscordEnemySplitSettings = {
    image: false,
    embed: false,
    tiled: false
};

export const DEFAULT_UI_THEME: UiTheme = 'classic';
export const DEFAULT_KINETIC_FONT_STYLE: KineticFontStyle = 'default';
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = 'side';

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
        discordEnemySplitSettings: IDiscordEnemySplitSettings;
        discordSplitEnemiesByTeam?: boolean;
        webhooks: IWebhook[];
        selectedWebhookId: string | null;
        dpsReportToken: string | null;
        closeBehavior: 'minimize' | 'quit';
        embedStatSettings: IEmbedStatSettings;
        mvpWeights: IMvpWeights;
        statsViewSettings: IStatsViewSettings;
        disruptionMethod: DisruptionMethod;
        uiTheme?: UiTheme;
        kineticFontStyle?: KineticFontStyle;
        dashboardLayout?: DashboardLayout;
        autoUpdateSupported?: boolean;
        autoUpdateDisabledReason?: string | null;
        githubRepoOwner?: string | null;
        githubRepoName?: string | null;
        githubBranch?: string | null;
        githubPagesBaseUrl?: string | null;
        githubToken?: string | null;
        githubWebTheme?: string | null;
        githubLogoPath?: string | null;
        githubFavoriteRepos?: string[] | null;
        walkthroughSeen?: boolean;
    }>;
    clearDpsReportCache: () => Promise<{ success: boolean; clearedEntries?: number; error?: string }>;
    onClearDpsReportCacheProgress: (callback: (data: { stage?: string; message?: string; progress?: number; current?: number; total?: number }) => void) => () => void;
    manualUpload: (path: string) => void;
    manualUploadBatch: (paths: string[]) => void;
    getUploadRetryQueue: () => Promise<{ success: boolean; queue?: IUploadRetryQueueState; error?: string }>;
    retryFailedUploads: () => Promise<{ success: boolean; retried?: number; queue?: IUploadRetryQueueState; error?: string }>;
    resumeUploadRetries: () => Promise<{ success: boolean; queue?: IUploadRetryQueueState; error?: string }>;
    onUploadRetryQueueUpdated: (callback: (data: IUploadRetryQueueState) => void) => () => void;
    saveSettings: (settings: {
        logDirectory?: string | null;
        discordWebhookUrl?: string | null;
        discordNotificationType?: 'image' | 'image-beta' | 'embed';
        discordEnemySplitSettings?: IDiscordEnemySplitSettings;
        discordSplitEnemiesByTeam?: boolean;
        webhooks?: IWebhook[];
        selectedWebhookId?: string | null;
        dpsReportToken?: string | null;
        closeBehavior?: 'minimize' | 'quit';
        embedStatSettings?: IEmbedStatSettings;
        mvpWeights?: IMvpWeights;
        statsViewSettings?: IStatsViewSettings;
        disruptionMethod?: DisruptionMethod;
        uiTheme?: UiTheme;
        kineticFontStyle?: KineticFontStyle;
        dashboardLayout?: DashboardLayout;
        githubRepoOwner?: string | null;
        githubRepoName?: string | null;
        githubBranch?: string | null;
        githubPagesBaseUrl?: string | null;
        githubToken?: string | null;
        githubWebTheme?: string | null;
        githubLogoPath?: string | null;
        githubFavoriteRepos?: string[] | null;
        walkthroughSeen?: boolean;
    }) => void;
    onRequestScreenshot: (callback: (data: any) => void) => () => void;
    openExternal: (url: string) => Promise<{ success: boolean, error?: string }>;
    fetchImageAsDataUrl: (url: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
    sendScreenshot: (id: string, buffer: Uint8Array) => void;
    sendScreenshots: (id: string, buffers: Uint8Array[]) => void;
    sendScreenshotsGroups: (id: string, groups: Uint8Array[][]) => void;
    onConsoleLog: (callback: (log: { type: 'info' | 'error', message: string, timestamp: string }) => void) => () => void;
    logToMain: (payload: { level?: 'info' | 'warn' | 'error'; message: string; meta?: any }) => void;
    getLogDetails: (payload: { filePath: string }) => Promise<{ success: boolean; details?: any; error?: string }>;
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
    getGithubRepos: () => Promise<{ success: boolean; repos?: Array<{ full_name: string; name: string; owner: string }>; error?: string }>;
    getGithubOrgs: () => Promise<{ success: boolean; orgs?: Array<{ login: string }>; error?: string }>;
    getGithubReports: () => Promise<{ success: boolean; reports?: any[]; error?: string }>;
    setWebReportThemeCookie: (payload: { baseUrl: string; themeId?: string | null }) => Promise<{ success: boolean; error?: string }>;
    deleteGithubReports: (payload: { ids: string[] }) => Promise<{ success: boolean; removed?: string[]; error?: string }>;
    listLogFiles: (payload: { dir: string }) => Promise<{ success: boolean; files?: Array<{ path: string; name: string; mtimeMs: number; size: number }>; error?: string }>;
    createGithubRepo: (params: { name: string; branch?: string; owner?: string }) => Promise<{ success: boolean; repo?: { full_name: string; owner: string; name: string; pagesUrl?: string }; error?: string }>;
    ensureGithubTemplate: () => Promise<{ success: boolean; updated?: boolean; error?: string }>;
    selectGithubLogo: () => Promise<string | null>;
    applyGithubLogo: (payload?: { logoPath?: string }) => Promise<{ success: boolean; updated?: boolean; error?: string }>;
    applyGithubTheme: (payload?: { themeId?: string }) => Promise<{ success: boolean; error?: string }>;
    uploadWebReport: (payload: { meta: any; stats: any }) => Promise<{ success: boolean; url?: string; error?: string; errorDetail?: string }>;
    mockWebReport: (payload: { meta: any; stats: any }) => Promise<{ success: boolean; url?: string; error?: string }>;
    getGithubPagesBuildStatus: () => Promise<{ success: boolean; status?: string; updatedAt?: string; errorMessage?: string; error?: string }>;
    onWebUploadStatus: (callback: (data: { stage: string; message?: string; progress?: number }) => void) => () => void;
    onGithubThemeStatus: (callback: (data: { stage?: string; message?: string; progress?: number }) => void) => () => void;
    exportSettings: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
    importSettings: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
    selectSettingsFile: () => Promise<{ success: boolean; canceled?: boolean; error?: string; settings?: any; filePath?: string }>;
    listDevDatasets: () => Promise<{ success: boolean; datasets?: IDevDatasetMeta[]; error?: string }>;
    saveDevDataset: (payload: { id?: string; name: string; logs: any[]; report?: any; snapshot?: IDevDatasetSnapshot }) => Promise<{ success: boolean; dataset?: IDevDatasetMeta; error?: string }>;
    beginDevDatasetSave: (payload: { id?: string; name: string; report?: any; snapshot?: IDevDatasetSnapshot }) => Promise<{ success: boolean; dataset?: IDevDatasetMeta; error?: string }>;
    appendDevDatasetLogs: (payload: { id: string; logs: any[]; startIndex: number; total?: number }) => Promise<{ success: boolean; error?: string }>;
    finishDevDatasetSave: (payload: { id: string; total: number }) => Promise<{ success: boolean; error?: string }>;
    loadDevDataset: (payload: { id: string; allowLogsOnlyOnIntegrityFailure?: boolean }) => Promise<{ success: boolean; dataset?: any; error?: string; canLoadLogsOnly?: boolean; integrity?: IDevDatasetIntegrityResult; logsOnlyFallback?: boolean }>;
    loadDevDatasetChunked: (payload: { id: string; chunkSize?: number; allowLogsOnlyOnIntegrityFailure?: boolean }) => Promise<{ success: boolean; dataset?: any; totalLogs?: number; error?: string; canLoadLogsOnly?: boolean; integrity?: IDevDatasetIntegrityResult; logsOnlyFallback?: boolean }>;
    onDevDatasetLogsChunk: (callback: (data: any) => void) => () => void;
    onDevDatasetSaveProgress: (callback: (data: any) => void) => () => void;
    deleteDevDataset: (payload: { id: string }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }

    interface ILogData {
        id: string;
        permalink: string;
        filePath: string;
        status?: 'queued' | 'pending' | 'uploading' | 'retrying' | 'discord' | 'calculating' | 'success' | 'error';
        error?: string;
        uploadTime?: number;
        encounterDuration?: string;
        fightName?: string;
        detailsLoading?: boolean;
        detailsAvailable?: boolean;
        splitEnemiesByTeam?: boolean;
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

declare module '*.md?raw' {
    const content: string;
    export default content;
}
