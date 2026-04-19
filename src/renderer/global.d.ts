import type { ColorPalette } from '../shared/webThemes';

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
    offensiveDownContribution: number;
    offensiveDps: number;
    offensiveDamage: number;
    generalStrips: number;
    generalCc: number;
    generalDistanceToTag: number;
    generalParticipation: number;
    generalDodging: number;
    defensiveHealing: number;
    defensiveDownedHealing: number;
    defensiveCleanses: number;
    defensiveStability: number;
    defensiveRevives: number;
    defensiveDistanceToTag: number;
    defensiveParticipation: number;
    defensiveDodging: number;
}

type LegacyMvpWeights = {
    downContribution?: number;
    healing?: number;
    cleanses?: number;
    strips?: number;
    stability?: number;
    cc?: number;
    offensiveCc?: number;
    revives?: number;
    distanceToTag?: number;
    participation?: number;
    dodging?: number;
    dps?: number;
    damage?: number;
    offensiveStrips?: number;
};

export interface IStatsViewSettings {
    showTopStats: boolean;
    showMvp: boolean;
    roundCountStats: boolean;
    splitPlayersByClass: boolean;
    topStatsMode: 'total' | 'perSecond' | 'perMinute';
    topSkillDamageSource: 'total' | 'target';
    topSkillsMetric: 'damage' | 'downContribution';
    minParticipationPercent: number;
    boonBucketIntervalMs: number;
    stackingBoonBucketIntervalMs: number;
    interruptMode: 'ccOnly' | 'separate' | 'combined';
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
    buildStatusRepo: string | null;
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
    offensiveDownContribution: 1,
    offensiveDps: 0.2,
    offensiveDamage: 0.2,
    generalStrips: 1,
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

export const normalizeMvpWeights = (weights: unknown): IMvpWeights => {
    const input = (weights && typeof weights === 'object') ? (weights as Partial<IMvpWeights> & LegacyMvpWeights) : {};
    const toNum = (value: unknown, fallback: number) => {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    };
    return {
        offensiveDownContribution: toNum(input.offensiveDownContribution ?? input.downContribution, DEFAULT_MVP_WEIGHTS.offensiveDownContribution),
        offensiveDps: toNum(input.offensiveDps ?? input.dps, DEFAULT_MVP_WEIGHTS.offensiveDps),
        offensiveDamage: toNum(input.offensiveDamage ?? input.damage, DEFAULT_MVP_WEIGHTS.offensiveDamage),
        generalStrips: toNum(input.generalStrips ?? input.offensiveStrips ?? input.strips, DEFAULT_MVP_WEIGHTS.generalStrips),
        generalCc: toNum(input.generalCc ?? input.offensiveCc ?? input.cc, DEFAULT_MVP_WEIGHTS.generalCc),
        generalDistanceToTag: toNum(input.generalDistanceToTag ?? input.defensiveDistanceToTag ?? input.distanceToTag, DEFAULT_MVP_WEIGHTS.generalDistanceToTag),
        generalParticipation: toNum(input.generalParticipation ?? input.defensiveParticipation ?? input.participation, DEFAULT_MVP_WEIGHTS.generalParticipation),
        generalDodging: toNum(input.generalDodging ?? input.defensiveDodging ?? input.dodging, DEFAULT_MVP_WEIGHTS.generalDodging),
        defensiveHealing: toNum(input.defensiveHealing ?? input.healing, DEFAULT_MVP_WEIGHTS.defensiveHealing),
        defensiveDownedHealing: toNum(input.defensiveDownedHealing, DEFAULT_MVP_WEIGHTS.defensiveDownedHealing),
        defensiveCleanses: toNum(input.defensiveCleanses ?? input.cleanses, DEFAULT_MVP_WEIGHTS.defensiveCleanses),
        defensiveStability: toNum(input.defensiveStability ?? input.stability, DEFAULT_MVP_WEIGHTS.defensiveStability),
        defensiveRevives: toNum(input.defensiveRevives ?? input.revives, DEFAULT_MVP_WEIGHTS.defensiveRevives),
        defensiveDistanceToTag: toNum(input.defensiveDistanceToTag ?? input.generalDistanceToTag ?? input.distanceToTag, DEFAULT_MVP_WEIGHTS.defensiveDistanceToTag),
        defensiveParticipation: toNum(input.defensiveParticipation ?? input.generalParticipation ?? input.participation, DEFAULT_MVP_WEIGHTS.defensiveParticipation),
        defensiveDodging: toNum(input.defensiveDodging ?? input.generalDodging ?? input.dodging, DEFAULT_MVP_WEIGHTS.defensiveDodging)
    };
};

export const DEFAULT_STATS_VIEW_SETTINGS: IStatsViewSettings = {
    showTopStats: true,
    showMvp: true,
    roundCountStats: false,
    splitPlayersByClass: false,
    topStatsMode: 'total',
    topSkillDamageSource: 'target',
    topSkillsMetric: 'damage',
    minParticipationPercent: 0,
    boonBucketIntervalMs: 5000,
    stackingBoonBucketIntervalMs: 5000,
    interruptMode: 'separate'
};

export const DEFAULT_WEB_UPLOAD_STATE: IWebUploadState = {
    uploading: false,
    message: null,
    stage: null,
    progress: null,
    detail: null,
    url: null,
    buildStatus: 'idle',
    buildStatusRepo: null
};

export const DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS: IDiscordEnemySplitSettings = {
    image: false,
    embed: false,
    tiled: false
};

export const DEFAULT_GLASS_SURFACES = false;
export const DEFAULT_PARTICLES_ENABLED = true;

export interface IElectronAPI {
    selectDirectory: () => Promise<string | null>;
    startWatching: (path: string) => void;
    onLogDetected: (callback: (path: string) => void) => () => void;
    onUploadComplete: (callback: (data: any) => void) => () => void;
    onUploadPermalink: (callback: (data: { id: string; filePath: string; permalink: string }) => void) => () => void;
    onUploadStatus: (callback: (data: any) => void) => () => void;
    resolveDroppedFilePath: (file: File) => string;
    setDiscordWebhook: (url: string) => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    getSettings: () => Promise<{
        logDirectory: string | null;
        discordWebhookUrl: string | null;
        discordNotificationType: 'embed';
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
        colorPalette?: ColorPalette;
        glassSurfaces?: boolean;
        particlesEnabled?: boolean;
        autoUpdateSupported?: boolean;
        autoUpdateDisabledReason?: string | null;
        githubRepoOwner?: string | null;
        githubRepoName?: string | null;
        githubBranch?: string | null;
        githubPagesBaseUrl?: string | null;
        githubToken?: string | null;
        githubLogoPath?: string | null;
        githubFavoriteRepos?: string[] | null;
        walkthroughSeen?: boolean;
        allowLocalJson?: boolean;
        eiAnnouncementDismissed?: boolean;
        r2AccountId?: string | null;
        r2AccessKeyId?: string | null;
        r2SecretAccessKey?: string | null;
        r2BucketName?: string | null;
        r2PublicUrl?: string | null;
        r2PreciseReplay?: boolean;
        r2ReplayUrls?: Record<string, string>;
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
        discordNotificationType?: 'embed';
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
        colorPalette?: ColorPalette;
        glassSurfaces?: boolean;
        particlesEnabled?: boolean;
        githubRepoOwner?: string | null;
        githubRepoName?: string | null;
        githubBranch?: string | null;
        githubPagesBaseUrl?: string | null;
        githubToken?: string | null;
        githubLogoPath?: string | null;
        githubFavoriteRepos?: string[] | null;
        walkthroughSeen?: boolean;
        allowLocalJson?: boolean;
        forceDpsReportOnly?: boolean;
        eiAnnouncementDismissed?: boolean;
        r2AccountId?: string | null;
        r2AccessKeyId?: string | null;
        r2SecretAccessKey?: string | null;
        r2BucketName?: string | null;
        r2PublicUrl?: string | null;
        r2PreciseReplay?: boolean;
    }) => void;
    openExternal: (url: string) => Promise<{ success: boolean, error?: string }>;
    openMobilePreview: (url: string) => Promise<{ success: boolean, error?: string }>;
    fetchImageAsDataUrl: (url: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
    fetchR2Json: (url: string) => Promise<{ success: boolean; json?: any; error?: string }>;
    saveR2ReplayUrls: (entries: Record<string, string>) => Promise<{ success: boolean }>;
    onConsoleLog: (callback: (log: { type: 'info' | 'error', message: string, timestamp: string }) => void) => () => void;
    onConsoleLogHistory: (callback: (logs: Array<{ type: 'info' | 'error', message: string, timestamp: string }>) => void) => () => void;
    setConsoleLogForwarding: (enabled: boolean) => void;
    getLogDetails: (payload: { filePath: string; permalink?: string }) => Promise<{ success: boolean; details?: any; error?: string; terminal?: boolean }>;
    onDetailsPrewarm?: (callback: (data: any) => void) => (() => void);
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
    getGithubReports: (payload?: { owner?: string; repo?: string; branch?: string }) => Promise<{ success: boolean; reports?: any[]; error?: string }>;
    deleteGithubReports: (payload: { ids: string[]; owner?: string; repo?: string; branch?: string }) => Promise<{ success: boolean; removed?: string[]; error?: string }>;
    getGithubReportDetail: (payload: { reportId: string; owner?: string; repo?: string; branch?: string }) => Promise<{ success: boolean; report?: any; error?: string }>;
    listLogFiles: (payload: { dir: string; allowJson?: boolean }) => Promise<{ success: boolean; files?: Array<{ path: string; name: string; mtimeMs: number; size: number }>; error?: string }>;
    createGithubRepo: (params: { name: string; branch?: string; owner?: string }) => Promise<{ success: boolean; repo?: { full_name: string; owner: string; name: string; pagesUrl?: string }; error?: string }>;
    ensureGithubTemplate: () => Promise<{ success: boolean; updated?: boolean; error?: string }>;
    selectGithubLogo: () => Promise<string | null>;
    applyGithubLogo: (payload?: { logoPath?: string }) => Promise<{ success: boolean; updated?: boolean; error?: string }>;
    uploadWebReport: (payload: { meta: any; stats: any; repoFullName?: string; repoOwner?: string; repoName?: string }) => Promise<{ success: boolean; url?: string; replayDataUrl?: string | null; error?: string; errorDetail?: string }>;
    mockWebReport: (payload: { meta: any; stats: any }) => Promise<{ success: boolean; url?: string; error?: string }>;
    getGithubPagesBuildStatus: (payload?: { repoFullName?: string; repoOwner?: string; repoName?: string }) => Promise<{ success: boolean; status?: string; updatedAt?: string; errorMessage?: string; error?: string }>;
    onWebUploadStatus: (callback: (data: { stage: string; message?: string; progress?: number }) => void) => () => void;
    exportSettings: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
    importSettings: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
    selectSettingsFile: () => Promise<{ success: boolean; canceled?: boolean; error?: string; settings?: any; filePath?: string }>;

    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;

    // Diagnostics
    reportRendererError: (payload: { source: string; message: string; stack?: string }) => void;
    onRequestRendererDiagnostics: (callback: () => void) => () => void;
    sendRendererDiagnostics: (payload: { heapUsed: number; heapTotal: number; heapLimit: number; logCount: number }) => void;

    // Elite Insights parser
    getEiStatus: () => Promise<IEiStatus>;
    installEi: () => Promise<void>;
    updateEi: () => Promise<void>;
    reinstallEi: () => Promise<void>;
    uninstallEi: () => Promise<IEiStatus>;
    checkEiUpdate: () => Promise<{ updateAvailable: string | null }>;
    getEiSettings: () => Promise<IEiParserSettings>;
    saveEiSettings: (settings: Partial<IEiParserSettings>) => void;
    getEiAutoManage: () => Promise<boolean>;
    setEiAutoManage: (enabled: boolean) => void;
    onEiDownloadProgress: (callback: (data: { percent: number; message: string }) => void) => () => void;
    onEiParseProgress: (callback: (data: { logId: string; message: string }) => void) => () => void;
    onEiStatusChanged: (callback: (status: IEiStatus) => void) => () => void;
    // Ollama AI chat
    getOllamaStatus: () => Promise<IOllamaStatus>;
    setOllamaActiveModel: (model: string) => void;
    pullOllamaModel: (model: string) => Promise<void>;
    ollamaChat: (messages: ChatMessage[]) => Promise<void>;
    getOllamaSettings: () => Promise<IOllamaSettings>;
    saveOllamaSettings: (settings: Partial<IOllamaSettings>) => void;
    onOllamaPullProgress: (callback: (data: { percent: number; status: string }) => void) => () => void;
    onOllamaChatToken: (callback: (data: { token: string; done: boolean }) => void) => () => void;
    onOllamaStatusChanged: (callback: (status: IOllamaStatus) => void) => () => void;
    startOllama: () => Promise<IOllamaStatus>;
    stopOllama: () => Promise<void>;
    deleteOllamaModel: (model: string) => Promise<void>;
    chatOnce: (messages: ChatMessage[], tools?: any[]) => Promise<OllamaChatResponse>;
    // AI provider settings
    getAiSettings: () => Promise<IAiSettings>;
    saveAiSettings: (settings: Partial<IAiSettings>) => void;
}

export interface IEiParserSettings {
    detailledWvW: boolean;
    computeDamageModifiers: boolean;
    parsePhases: boolean;
    skipFailedTries: boolean;
    anonymous: boolean;
    customTooShort: number;
    saveOutHTML: boolean;
    parseCombatReplay: boolean;
    lightTheme: boolean;
    rawTimelineArrays: boolean;
    singleThreaded: boolean;
    memoryLimit: number;
}

export interface IEiStatus {
    installed: boolean;
    version: string | null;
    updateAvailable: string | null;
    installing: boolean;
    error: string | null;
}

export interface IAiSettings {
    provider: 'ollama' | 'anthropic' | 'openai';
    anthropicApiKey: string;
    anthropicModel: string;
    openaiApiKey: string;
    openaiModel: string;
}

export interface IOllamaStatus {
    connected: boolean;
    models: string[];
    activeModel: string | null;
}

export interface IOllamaSettings {
    enabled: boolean;
    activeModel: string;
    autoManage: boolean;
}

export interface OllamaToolCall {
    function: { name: string; arguments: Record<string, any> };
}

export interface OllamaChatResponse {
    message: {
        role: string;
        content: string;
        tool_calls?: OllamaToolCall[];
    };
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: OllamaToolCall[];
}

type DetailsStatus = 'idle' | 'loading' | 'available' | 'loaded' | 'exhausted' | 'unavailable';

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }

    interface ILogData {
        id: string;
        permalink: string;
        filePath: string;
        status?: 'queued' | 'pending' | 'uploading' | 'retrying' | 'discord' | 'calculating' | 'parsing' | 'success' | 'error';
        error?: string;
        uploadTime?: number;
        encounterDuration?: string;
        fightName?: string;
        fightLabel?: string;
        detailsStatus: DetailsStatus;
        splitEnemiesByTeam?: boolean;
        dashboardSummary?: {
            hasPlayers: boolean;
            hasTargets: boolean;
            squadCount: number;
            enemyCount: number;
            isWin: boolean | null;
            squadDeaths: number;
            enemyDeaths: number;
        };
        details?: {
            fightName: string;
            encounterDuration: string;
            success: boolean;
            players: IPlayer[];
            uploadTime: number;
            [key: string]: any;
        };
        replayDataUrl?: string | null;
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
