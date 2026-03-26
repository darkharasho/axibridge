/**
 * Serializable electronAPI mock factory for Playwright E2E tests.
 *
 * Usage with page.addInitScript():
 *   await page.addInitScript(createElectronAPIMock, { walkthroughSeen: true });
 *
 * The function is evaluated inside the browser context — it must be fully
 * self-contained with no imports or closures over external values.
 */

/** Test-facing override options */
export interface ElectronAPIMockOverrides {
    /** Pre-loaded logs returned by getLogs() */
    logs?: any[]
    /** App version string returned by getAppVersion() */
    appVersion?: string
    /** Whats-new content returned by getWhatsNew() */
    whatsNew?: any
    /** Color palette name */
    colorPalette?: string
    /** Glass surfaces toggle */
    glassSurfaces?: boolean
    /** Whether walkthrough has been seen (default true to skip it) */
    walkthroughSeen?: boolean
    /** Full or partial settings overrides merged into defaults */
    settings?: Record<string, any>
    /** Dev datasets list returned by listDevDatasets() */
    devDatasets?: any[]
    /** GitHub repos returned by getGithubRepos() */
    githubRepos?: any[]
    /** GitHub orgs returned by getGithubOrgs() */
    githubOrgs?: any[]
    /** GitHub reports returned by getGithubReports() */
    githubReports?: any[]
    /** Upload retry queue state */
    uploadRetryQueue?: any
}

/**
 * Creates and installs a mock `window.electronAPI` object.
 *
 * This function is SERIALIZABLE — it is passed directly to
 * `page.addInitScript(createElectronAPIMock, overrides)` and executed
 * in the browser context before any page scripts run.
 */
export function createElectronAPIMock(overrides?: ElectronAPIMockOverrides): void {
    const o = overrides || {}

    // ── Call log for test assertions ──────────────────────────────
    const _callLog: Array<{ method: string; args: any[] }> = []

    function log(method: string, args: any[]): void {
        _callLog.push({ method, args: Array.from(args) })
    }

    // ── Helpers ───────────────────────────────────────────────────
    const noop = () => {}
    const noopAsync = () => Promise.resolve()
    const noopListener = () => noop

    // ── Default settings ─────────────────────────────────────────
    const defaultSettings: Record<string, any> = {
        logDirectory: '/fake/logs',
        discordWebhookUrl: '',
        webhooks: [],
        dpsReportToken: '',
        colorPalette: o.colorPalette ?? 'electric-blue',
        glassSurfaces: o.glassSurfaces ?? false,
        closeBehavior: 'quit',
        walkthroughSeen: o.walkthroughSeen ?? true,
        lastSeenVersion: o.appVersion ?? '2.0.3',
        embedStatSettings: {
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
        },
        mvpWeights: {
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
            defensiveDodging: 0.4,
        },
        statsViewSettings: {
            showTopStats: true,
            showMvp: true,
            roundCountStats: false,
            splitPlayersByClass: false,
            topStatsMode: 'total',
            topSkillDamageSource: 'target',
            topSkillsMetric: 'damage',
        },
        disruptionMethod: 'count',
        enemySplitSettings: {
            image: false,
            embed: false,
            tiled: false,
        },
    }

    // Apply any caller-supplied settings overrides
    if (o.settings) {
        Object.assign(defaultSettings, o.settings)
    }

    // ── Build the API object ─────────────────────────────────────
    const api: Record<string, any> = {
        // Expose internals for test assertions
        _callLog,

        // ── File Operations ──────────────────────────────────────
        selectDirectory: (...args: any[]) => {
            log('selectDirectory', args)
            return Promise.resolve(null)
        },
        listLogFiles: (...args: any[]) => {
            log('listLogFiles', args)
            return Promise.resolve([])
        },
        selectGithubLogo: (...args: any[]) => {
            log('selectGithubLogo', args)
            return Promise.resolve(null)
        },
        selectSettingsFile: (...args: any[]) => {
            log('selectSettingsFile', args)
            return Promise.resolve(null)
        },

        // ── Settings ─────────────────────────────────────────────
        getSettings: (...args: any[]) => {
            log('getSettings', args)
            // Return a shallow copy so mutations in the app don't alter our source
            return Promise.resolve({ ...defaultSettings })
        },
        saveSettings: (...args: any[]) => {
            log('saveSettings', args)
            if (args[0]) {
                Object.assign(defaultSettings, args[0])
            }
        },
        exportSettings: (...args: any[]) => {
            log('exportSettings', args)
            return Promise.resolve(null)
        },
        importSettings: (...args: any[]) => {
            log('importSettings', args)
            return Promise.resolve(null)
        },

        // ── Logs ─────────────────────────────────────────────────
        getLogs: (...args: any[]) => {
            log('getLogs', args)
            return Promise.resolve(o.logs || [])
        },
        saveLogs: (...args: any[]) => {
            log('saveLogs', args)
        },
        getLogDetails: (...args: any[]) => {
            log('getLogDetails', args)
            return Promise.resolve(null)
        },
        onDetailsPrewarm: (callback: any) => {
            log('onDetailsPrewarm', [callback])
            return noop
        },

        // ── Upload ───────────────────────────────────────────────
        startWatching: (...args: any[]) => {
            log('startWatching', args)
        },
        manualUpload: (...args: any[]) => {
            log('manualUpload', args)
        },
        manualUploadBatch: (...args: any[]) => {
            log('manualUploadBatch', args)
        },
        onLogDetected: (callback: any) => {
            log('onLogDetected', [callback])
            return noop
        },
        onUploadStatus: (callback: any) => {
            log('onUploadStatus', [callback])
            return noop
        },
        onUploadComplete: (callback: any) => {
            log('onUploadComplete', [callback])
            return noop
        },

        // ── Retry Queue ──────────────────────────────────────────
        getUploadRetryQueue: (...args: any[]) => {
            log('getUploadRetryQueue', args)
            return Promise.resolve(
                o.uploadRetryQueue ?? { failed: 0, retrying: 0, entries: [] }
            )
        },
        retryFailedUploads: (...args: any[]) => {
            log('retryFailedUploads', args)
            return Promise.resolve()
        },
        resumeUploadRetries: (...args: any[]) => {
            log('resumeUploadRetries', args)
            return Promise.resolve()
        },
        onUploadRetryQueueUpdated: (callback: any) => {
            log('onUploadRetryQueueUpdated', [callback])
            return noop
        },

        // ── Discord ──────────────────────────────────────────────
        setDiscordWebhook: (...args: any[]) => {
            log('setDiscordWebhook', args)
        },

        // ── Window ───────────────────────────────────────────────
        windowControl: (...args: any[]) => {
            log('windowControl', args)
        },

        // ── Cache ────────────────────────────────────────────────
        clearDpsReportCache: (...args: any[]) => {
            log('clearDpsReportCache', args)
            return Promise.resolve()
        },
        onClearDpsReportCacheProgress: (callback: any) => {
            log('onClearDpsReportCacheProgress', [callback])
            return noop
        },

        // ── External ─────────────────────────────────────────────
        openExternal: (...args: any[]) => {
            log('openExternal', args)
            return Promise.resolve()
        },
        fetchImageAsDataUrl: (...args: any[]) => {
            log('fetchImageAsDataUrl', args)
            return Promise.resolve(
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            )
        },

        // ── Console ──────────────────────────────────────────────
        onConsoleLog: (callback: any) => {
            log('onConsoleLog', [callback])
            return noop
        },
        onConsoleLogHistory: (callback: any) => {
            log('onConsoleLogHistory', [callback])
            return noop
        },
        setConsoleLogForwarding: (...args: any[]) => {
            log('setConsoleLogForwarding', args)
        },

        // ── Updates ──────────────────────────────────────────────
        checkForUpdates: (...args: any[]) => {
            log('checkForUpdates', args)
        },
        restartApp: (...args: any[]) => {
            log('restartApp', args)
        },
        getAppVersion: (...args: any[]) => {
            log('getAppVersion', args)
            return Promise.resolve(o.appVersion ?? '2.0.3')
        },
        getWhatsNew: (...args: any[]) => {
            log('getWhatsNew', args)
            return Promise.resolve(o.whatsNew ?? {
                version: o.appVersion ?? '2.0.3',
                lastSeenVersion: o.appVersion ?? '2.0.3',
                releaseNotes: null,
            })
        },
        setLastSeenVersion: (...args: any[]) => {
            log('setLastSeenVersion', args)
            return Promise.resolve()
        },
        onUpdateMessage: (callback: any) => {
            log('onUpdateMessage', [callback])
            return noop
        },
        onUpdateAvailable: (callback: any) => {
            log('onUpdateAvailable', [callback])
            return noop
        },
        onUpdateNotAvailable: (callback: any) => {
            log('onUpdateNotAvailable', [callback])
            return noop
        },
        onUpdateError: (callback: any) => {
            log('onUpdateError', [callback])
            return noop
        },
        onDownloadProgress: (callback: any) => {
            log('onDownloadProgress', [callback])
            return noop
        },
        onUpdateDownloaded: (callback: any) => {
            log('onUpdateDownloaded', [callback])
            return noop
        },

        // ── GitHub ───────────────────────────────────────────────
        startGithubOAuth: (...args: any[]) => {
            log('startGithubOAuth', args)
            return Promise.resolve()
        },
        onGithubAuthComplete: (callback: any) => {
            log('onGithubAuthComplete', [callback])
            return noop
        },
        getGithubRepos: (...args: any[]) => {
            log('getGithubRepos', args)
            return Promise.resolve(o.githubRepos ?? [])
        },
        getGithubOrgs: (...args: any[]) => {
            log('getGithubOrgs', args)
            return Promise.resolve(o.githubOrgs ?? [])
        },
        getGithubReports: (...args: any[]) => {
            log('getGithubReports', args)
            return Promise.resolve(o.githubReports ?? [])
        },
        deleteGithubReports: (...args: any[]) => {
            log('deleteGithubReports', args)
            return Promise.resolve()
        },
        getGithubReportDetail: (...args: any[]) => {
            log('getGithubReportDetail', args)
            return Promise.resolve(null)
        },
        createGithubRepo: (...args: any[]) => {
            log('createGithubRepo', args)
            return Promise.resolve(null)
        },
        ensureGithubTemplate: (...args: any[]) => {
            log('ensureGithubTemplate', args)
            return Promise.resolve()
        },
        applyGithubLogo: (...args: any[]) => {
            log('applyGithubLogo', args)
            return Promise.resolve()
        },
        uploadWebReport: (...args: any[]) => {
            log('uploadWebReport', args)
            return Promise.resolve(null)
        },
        mockWebReport: (...args: any[]) => {
            log('mockWebReport', args)
            return Promise.resolve(null)
        },
        getGithubPagesBuildStatus: (...args: any[]) => {
            log('getGithubPagesBuildStatus', args)
            return Promise.resolve(null)
        },
        onWebUploadStatus: (callback: any) => {
            log('onWebUploadStatus', [callback])
            return noop
        },

        // ── Dev Datasets ─────────────────────────────────────────
        listDevDatasets: (...args: any[]) => {
            log('listDevDatasets', args)
            return Promise.resolve(o.devDatasets ?? [])
        },
        saveDevDataset: (...args: any[]) => {
            log('saveDevDataset', args)
            return Promise.resolve({ id: 'mock-dataset-id' })
        },
        beginDevDatasetSave: (...args: any[]) => {
            log('beginDevDatasetSave', args)
            return Promise.resolve({ id: 'mock-dataset-id' })
        },
        appendDevDatasetLogs: (...args: any[]) => {
            log('appendDevDatasetLogs', args)
            return Promise.resolve()
        },
        finishDevDatasetSave: (...args: any[]) => {
            log('finishDevDatasetSave', args)
            return Promise.resolve()
        },
        loadDevDataset: (...args: any[]) => {
            log('loadDevDataset', args)
            return Promise.resolve(null)
        },
        loadDevDatasetChunked: (...args: any[]) => {
            log('loadDevDatasetChunked', args)
            return Promise.resolve(null)
        },
        onDevDatasetLogsChunk: (callback: any) => {
            log('onDevDatasetLogsChunk', [callback])
            return noop
        },
        onDevDatasetSaveProgress: (callback: any) => {
            log('onDevDatasetSaveProgress', [callback])
            return noop
        },
        deleteDevDataset: (...args: any[]) => {
            log('deleteDevDataset', args)
            return Promise.resolve()
        },

        // ── Misc (synchronous) ───────────────────────────────────
        resolveDroppedFilePath: (...args: any[]) => {
            log('resolveDroppedFilePath', args)
            return '/fake/dropped/file.zevtc'
        },
    }

    // Install on window
    Object.defineProperty(window, 'electronAPI', {
        value: api,
        writable: true,
    })
}
