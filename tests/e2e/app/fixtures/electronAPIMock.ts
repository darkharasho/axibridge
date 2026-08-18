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
    /** GitHub repos returned by getGithubRepos() */
    githubRepos?: any[]
    /** GitHub orgs returned by getGithubOrgs() */
    githubOrgs?: any[]
    /** GitHub reports returned by getGithubReports() */
    githubReports?: any[]
    /** Upload retry queue state */
    uploadRetryQueue?: any
    /**
     * Fixture IDs to serve via getLogDetails().
     *
     * When set, getLogDetails() fetches `/__test-fixtures__/<id>.json` from the
     * Playwright route interceptor instead of returning null.  The log entry's
     * permalink is expected to be `https://dps.report/<id>` so the mock can
     * derive the fixture id from it.
     */
    detailsFixtureIds?: string[]
    /** Artificial delay (ms) added before each getLogDetails() response. Default 0. */
    detailsDelayMs?: number
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
            const fixtureIds: string[] = o.detailsFixtureIds || []
            const delayMs: number = o.detailsDelayMs ?? 0
            if (!fixtureIds.length) return Promise.resolve({ success: false, error: 'No fixtures configured' })
            // The IPC contract is `{ filePath }` — see `get-log-details` in
            // `src/main/handlers/uploadHandlers.ts` and the `electronAPI`
            // declaration in `src/renderer/global.d.ts`. This used to read
            // `payload.permalink`, which the renderer has never sent, so every
            // request fell through to `null` and the app reported "7 of 7
            // fights could not be loaded" — the replay and hydration specs were
            // asserting against an app that had no fight data at all.
            // Permalink is still accepted so a spec may pass either.
            const payload: any = args[0] || {}
            const source: string = payload.filePath || payload.permalink || ''
            const fixtureId = source.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
            if (!fixtureId || !fixtureIds.includes(fixtureId)) {
                return Promise.resolve({ success: false, error: `No fixture for ${source || '(empty payload)'}` })
            }
            const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
            return delay(delayMs).then(() =>
                fetch(`/__test-fixtures__/${fixtureId}.json`)
                    .then((res) => (res.ok ? res.json() : null))
                    .then((details) =>
                        details ? { success: true, details } : { success: false, error: 'Not found' }
                    )
                    .catch(() => ({ success: false, error: 'Fetch failed' }))
            )
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
            // If test provided initial logs, emit them via onUploadComplete
            // after a microtask so React has time to mount
            if (o.logs && o.logs.length > 0) {
                setTimeout(() => {
                    for (const logEntry of o.logs!) {
                        callback(logEntry)
                    }
                }, 50)
            }
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

        // ── Parser backend & local Elite Insights ────────────────
        // The renderer calls these during Settings' mount effect. When one is
        // absent the effect throws, React unwinds the subtree, and every
        // interaction assertion below it fails for a reason that has nothing
        // to do with what it was testing.
        getParserBackend: (...args: any[]) => {
            log('getParserBackend', args)
            return Promise.resolve({
                backend: 'axilog',
                default: 'axilog',
                axilogAvailable: true,
                axilogVersion: '0.3.2',
                migratedFromEliteInsights: false,
            })
        },
        setParserBackend: (...args: any[]) => {
            log('setParserBackend', args)
        },
        ackParserMigrationNotice: (...args: any[]) => {
            log('ackParserMigrationNotice', args)
        },
        reparseLogAxilog: (...args: any[]) => {
            log('reparseLogAxilog', args)
            return Promise.resolve({ success: false, error: 'not available in tests' })
        },
        getEiStatus: (...args: any[]) => {
            log('getEiStatus', args)
            return Promise.resolve({ installed: false, version: null, updateAvailable: null, installing: false, error: null })
        },
        installEi: (...args: any[]) => {
            log('installEi', args)
            return Promise.resolve({ installed: false, version: null, updateAvailable: null, installing: false, error: null })
        },
        updateEi: (...args: any[]) => {
            log('updateEi', args)
            return Promise.resolve({ installed: false, version: null, updateAvailable: null, installing: false, error: null })
        },
        reinstallEi: (...args: any[]) => {
            log('reinstallEi', args)
            return Promise.resolve({ installed: false, version: null, updateAvailable: null, installing: false, error: null })
        },
        uninstallEi: (...args: any[]) => {
            log('uninstallEi', args)
            return Promise.resolve({ installed: false, version: null, updateAvailable: null, installing: false, error: null })
        },
        getEiDiskUsage: (...args: any[]) => {
            log('getEiDiskUsage', args)
            return Promise.resolve({ bytes: 0 })
        },
        checkEiUpdate: (...args: any[]) => {
            log('checkEiUpdate', args)
            return Promise.resolve({ updateAvailable: false })
        },
        getEiSettings: (...args: any[]) => {
            log('getEiSettings', args)
            return Promise.resolve({
                detailledWvW: true,
                computeDamageModifiers: true,
                parsePhases: true,
                skipFailedTries: false,
                anonymous: false,
                customTooShort: 2200,
                saveOutHTML: false,
                parseCombatReplay: false,
                lightTheme: false,
                rawTimelineArrays: true,
                singleThreaded: false,
                memoryLimit: 0,
            })
        },
        saveEiSettings: (...args: any[]) => {
            log('saveEiSettings', args)
        },
        getEiAutoManage: (...args: any[]) => {
            log('getEiAutoManage', args)
            return Promise.resolve(true)
        },
        setEiAutoManage: (...args: any[]) => {
            log('setEiAutoManage', args)
        },

        // ── R2 replay storage ────────────────────────────────────
        fetchR2Json: (...args: any[]) => {
            log('fetchR2Json', args)
            return Promise.resolve(null)
        },
        saveR2ReplayUrls: (...args: any[]) => {
            log('saveR2ReplayUrls', args)
            return Promise.resolve(null)
        },
        openMobilePreview: (...args: any[]) => {
            log('openMobilePreview', args)
            return Promise.resolve(null)
        },

        // ── Renderer diagnostics ─────────────────────────────────
        reportRendererError: (...args: any[]) => {
            log('reportRendererError', args)
        },
        sendRendererDiagnostics: (...args: any[]) => {
            log('sendRendererDiagnostics', args)
        },

        // ── Misc (synchronous) ───────────────────────────────────
        resolveDroppedFilePath: (...args: any[]) => {
            log('resolveDroppedFilePath', args)
            return '/fake/dropped/file.zevtc'
        },
    }

    // Every `on*` method is a fire-and-forget subscription, so a no-op that
    // returns a no-op unsubscribe is a faithful stand-in. Serving them from a
    // Proxy means the preload can grow a new listener without this mock going
    // stale: previously, one missing `on*` threw during App's mount effect,
    // the error boundary swallowed the tree, and every test in this suite
    // failed on `.app-titlebar` never appearing — 58 identical timeouts that
    // said nothing about the 58 things they were meant to check.
    //
    // Deliberately limited to `on*`. Any other missing method still returns
    // undefined and fails loudly, because silently resolving a data call would
    // trade one clear failure for a confusing downstream one.
    const apiWithListeners = new Proxy(api, {
        get(target: any, prop: string | symbol) {
            if (prop in target) return target[prop]
            if (typeof prop === 'string' && /^on[A-Z]/.test(prop)) {
                return (callback: any) => {
                    log(prop, [callback])
                    return noop
                }
            }
            return undefined
        },
    })

    // Install on window
    Object.defineProperty(window, 'electronAPI', {
        value: apiWithListeners,
        writable: true,
    })
}
