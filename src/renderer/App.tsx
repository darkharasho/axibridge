import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, Image as ImageIcon, Layout, ChevronDown, Grid3X3, Trash2, FilePlus2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ExpandableLogCard } from './ExpandableLogCard';
import { useStatsAggregationWorker } from './stats/hooks/useStatsAggregationWorker';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AppLayout } from './app/AppLayout';
import { useDevDatasets } from './app/hooks/useDevDatasets';
import { useFilePicker } from './app/hooks/useFilePicker';
import { useWebUpload } from './app/hooks/useWebUpload';
import { useAppUpdater } from './app/hooks/useAppUpdater';
import { useDashboardStats } from './app/hooks/useDashboardStats';
import { useStatsDataProgress } from './app/hooks/useStatsDataProgress';
import { useSettings } from './app/hooks/useSettings';
import { useUploadRetryQueue } from './app/hooks/useUploadRetryQueue';
import { useAppNavigation } from './app/hooks/useAppNavigation';
import { shouldAttemptStatsSyncRecovery } from './stats/utils/statsSyncRecovery';

const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
        throw new Error('Invalid data URL');
    }
    const base64 = dataUrl.slice(commaIndex + 1);
    if (typeof globalThis.atob !== 'function') {
        throw new Error('Base64 decoder is not available');
    }
    const binaryString = globalThis.atob(base64);
    const buffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
        buffer[i] = binaryString.charCodeAt(i);
    }
    return buffer;
};

function App() {
    const [logs, setLogs] = useState<ILogData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const canceledLogsRef = useRef<Set<string>>(new Set());
    const [bulkUploadMode, setBulkUploadMode] = useState(false);
    const [screenshotData, setScreenshotData] = useState<ILogData | null>(null);

    // Updater State
    const {
        updateStatus,
        updateProgress,
        updateAvailable,
        updateDownloaded,
        showUpdateErrorModal, setShowUpdateErrorModal,
        updateError,
        autoUpdateSupported, setAutoUpdateSupported,
        autoUpdateDisabledReason, setAutoUpdateDisabledReason,
    } = useAppUpdater();

    // Settings
    const {
        logDirectory, setLogDirectory,
        notificationType, setNotificationType,
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        uiTheme, setUiTheme,
        setKineticFontStyle,
        setKineticThemeVariant,
        dashboardLayout, setDashboardLayout,
        setGithubWebTheme,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        shouldOpenWhatsNew,
        embedStatSettingsRef,
        enabledTopListCountRef,
    } = useSettings({
        onAutoUpdateSettings: (supported, reason) => {
            setAutoUpdateSupported(supported);
            setAutoUpdateDisabledReason(reason);
        }
    });

    const appVersion = whatsNewVersion;

    // Upload Retry Queue
    const {
        uploadRetryQueue,
        retryQueueBusy,
        handleRetryFailedUploads,
        handleResumeUploadRetries,
    } = useUploadRetryQueue();

    // Terminal State
    const [showTerminal, setShowTerminal] = useState(false);
    const [developerSettingsTrigger, setDeveloperSettingsTrigger] = useState(0);
    const settingsUpdateCheckRef = useRef(false);
    const versionClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const versionClickTimesRef = useRef<number[]>([]);
    const bulkUploadExpectedRef = useRef<number | null>(null);
    const bulkUploadCompletedRef = useRef(0);
    const pendingLogUpdatesRef = useRef<Map<string, ILogData>>(new Map());
    const pendingLogFlushTimerRef = useRef<number | null>(null);
    const screenshotCaptureChainRef = useRef<Promise<void>>(Promise.resolve());

    // Navigation
    const {
        view, setView,
        viewRef,
        whatsNewOpen, setWhatsNewOpen,
        walkthroughOpen, setWalkthroughOpen,
        helpUpdatesFocusTrigger,
        webhookModalOpen, setWebhookModalOpen,
        webhookDropdownOpen, setWebhookDropdownOpen,
        webhookDropdownStyle,
        webhookDropdownRef,
        webhookDropdownButtonRef,
        webhookDropdownPortalRef,
        logsListRef,
        logsViewportHeight,
        logsScrollTop,
        handleLogsListScroll,
        handleWhatsNewClose,
        handleWalkthroughClose,
        handleWalkthroughLearnMore,
        handleHelpUpdatesFocusConsumed,
    } = useAppNavigation({
        walkthroughSeen,
        shouldOpenWhatsNew,
        whatsNewVersion,
        logsCount: logs.length,
    });
    const setLogsDeferred = useCallback((updater: (currentLogs: ILogData[]) => ILogData[]) => {
        startTransition(() => {
            setLogs(updater);
        });
    }, []);
    const normalizeIncomingStatus = useCallback((candidate: ILogData): ILogData => {
        if ((candidate.details || candidate.detailsAvailable) && candidate.detailsFetchExhausted) {
            candidate = { ...candidate, detailsFetchExhausted: false };
        }
        if ((candidate.details || candidate.detailsAvailable) && candidate.detailsKnownUnavailable) {
            candidate = { ...candidate, detailsKnownUnavailable: false };
        }
        if (candidate.status === 'success' && candidate.detailsAvailable && !candidate.details) {
            return { ...candidate, status: 'calculating' as const };
        }
        return candidate;
    }, []);
    const hasLogChanges = useCallback((existing: ILogData, merged: ILogData) => {
        const keys = new Set<string>([
            ...Object.keys(existing),
            ...Object.keys(merged)
        ]);
        for (const key of keys) {
            const typedKey = key as keyof ILogData;
            if (existing[typedKey] !== merged[typedKey]) {
                return true;
            }
        }
        return false;
    }, []);
    const flushQueuedLogUpdates = useCallback(() => {
        pendingLogFlushTimerRef.current = null;
        if (pendingLogUpdatesRef.current.size === 0) return;
        const updatesByIdentity = new Map(pendingLogUpdatesRef.current);
        pendingLogUpdatesRef.current.clear();
        setLogsDeferred((currentLogs) => {
            if (updatesByIdentity.size === 0) return currentLogs;
            let changed = false;
            const consumed = new Set<string>();
            const nextLogs = currentLogs.map((existing) => {
                const identity = String(existing.filePath || existing.id || '');
                if (!identity) return existing;
                const incoming = updatesByIdentity.get(identity);
                if (!incoming) return existing;
                consumed.add(identity);
                const merged = normalizeIncomingStatus({ ...existing, ...incoming });
                if (!hasLogChanges(existing, merged)) return existing;
                changed = true;
                return merged;
            });
            const newLogs: ILogData[] = [];
            updatesByIdentity.forEach((incoming, identity) => {
                if (consumed.has(identity)) return;
                newLogs.push(normalizeIncomingStatus(incoming));
                changed = true;
            });
            if (!changed) return currentLogs;
            if (newLogs.length === 0) return nextLogs;
            return [...newLogs.reverse(), ...nextLogs];
        });
    }, [hasLogChanges, normalizeIncomingStatus, setLogsDeferred]);
    const queueLogUpdate = useCallback((incoming: ILogData) => {
        const identity = incoming.filePath || incoming.id;
        if (!identity) return;
        pendingLogUpdatesRef.current.set(String(identity), incoming);
        if (pendingLogFlushTimerRef.current !== null) return;
        const pendingCount = pendingLogUpdatesRef.current.size;
        const delayMs = bulkUploadModeRef.current
            ? (pendingCount > 24 ? 240 : pendingCount > 10 ? 180 : 120)
            : 16;
        pendingLogFlushTimerRef.current = window.setTimeout(() => {
            flushQueuedLogUpdates();
        }, delayMs);
    }, [flushQueuedLogUpdates]);

    const { webUploadState, setWebUploadState, handleWebUpload } = useWebUpload();
    const devDatasetsState = useDevDatasets({
        view,
        bulkUploadMode,
        setView,
        logs,
        setLogs,
        setExpandedLogId,
        setNotificationType,
        setEmbedStatSettings,
        setMvpWeights,
        setStatsViewSettings,
        setDisruptionMethod,
        setUiTheme,
        setSelectedWebhookId,
        setBulkUploadMode
    });
    const {
        devDatasetsEnabled,
        devDatasetName,
        setDevDatasetName,
        devDatasets,
        setDevDatasets,
        devDatasetsOpen,
        setDevDatasetsOpen,
        precomputedStats,
        setPrecomputedStats,
        datasetLoadRef,
        devDatasetSaving,
        setDevDatasetSaving,
        devDatasetLoadingId,
        setDevDatasetLoadingId,
        devDatasetRefreshing,
        devDatasetLoadModes,
        setDevDatasetLoadModes,
        devDatasetDeleteConfirmId,
        setDevDatasetDeleteConfirmId,
        devDatasetStreamingIdRef,
        devDatasetSaveProgress,
        setDevDatasetSaveProgress,
        devDatasetSavingIdRef,
        bulkCalculatingActive,
        setBulkCalculatingActive,
        devDatasetLoadProgress,
        setDevDatasetLoadProgress,
        logsForStats,
        setLogsForStats,
        logsRef,
        statsViewMounted,
        applyDevDatasetSnapshot,
        loadDevDatasets
    } = devDatasetsState;
    const filePickerState = useFilePicker({
        logDirectory,
        setLogs,
        setBulkUploadMode,
        bulkUploadExpectedRef,
        bulkUploadCompletedRef
    });
    const {
        filePickerOpen,
        setFilePickerOpen,
        filePickerError,
        setFilePickerError,
        filePickerSelected,
        setFilePickerSelected,
        loadLogFiles,
        selectSinceOpen,
        setSelectSinceOpen,
        selectDayOpen,
        setSelectDayOpen,
        selectBetweenOpen,
        setSelectBetweenOpen,
        selectDayDate,
        setSelectDayDate,
        setSelectSinceView,
        setSelectSinceDate,
        setSelectSinceHour,
        setSelectSinceMinute,
        setSelectSinceMeridiem,
        setSelectSinceMonthOpen,
        selectBetweenStart,
        setSelectBetweenStart,
        selectBetweenEnd,
        setSelectBetweenEnd,
        selectSinceDate,
        selectSinceHour,
        selectSinceMinute,
        selectSinceMeridiem,
        selectSinceView,
        selectSinceMonthOpen,
        filePickerFilter,
        setFilePickerFilter,
        filePickerLoading,
        filePickerAvailable,
        filePickerAll,
        filePickerListRef,
        setFilePickerAtBottom,
        lastPickedIndexRef,
        filePickerHasMore,
        filePickerAtBottom,
        setFilePickerMonthWindow,
        ensureMonthWindowForSince,
        handleAddSelectedFiles
    } = filePickerState;

    // Persistence removed

    const {
        result: aggregationResult,
        computeTick,
        lastComputedLogCount,
        lastComputedToken,
        activeToken,
        lastComputedAt,
        lastComputedFlushId,
        aggregationProgress,
        aggregationDiagnostics,
        requestFlush
    } = useStatsAggregationWorker({
        logs: logsForStats,
        mvpWeights,
        statsViewSettings,
        disruptionMethod,
        precomputedStats: precomputedStats || undefined
    });
    const { stats: computedStats, skillUsageData: computedSkillUsageData } = aggregationResult;
    const lastUploadCompleteAtRef = useRef(0);
    const bulkStatsAwaitingRef = useRef(false);
    const bulkFlushIdRef = useRef<number | null>(null);
    const statsSyncRecoveryAtRef = useRef(0);

    useEffect(() => {
        if (!bulkStatsAwaitingRef.current) {
            return;
        }
        // Allow later flushes to satisfy completion. Strict equality can deadlock
        // when incremental refreshes issue additional flush requests.
        if (bulkFlushIdRef.current !== null && lastComputedFlushId !== null && lastComputedFlushId < bulkFlushIdRef.current) {
            return;
        }
        if (lastComputedToken !== activeToken) {
            return;
        }
        if (lastComputedLogCount < logsForStats.length) {
            return;
        }
        if (lastComputedAt < lastUploadCompleteAtRef.current) {
            return;
        }
        setLogsDeferred((currentLogs) => {
            let changed = false;
            const next = currentLogs.map<ILogData>((log) => {
                if (log.status === 'calculating') {
                    if (log.detailsAvailable && !log.details && !log.statsDetailsLoaded) {
                        return log;
                    }
                    changed = true;
                    return { ...log, status: 'success' as const };
                }
                return log;
            });
            return changed ? next : currentLogs;
        });
        bulkStatsAwaitingRef.current = false;
        bulkFlushIdRef.current = null;
    }, [computeTick, lastComputedLogCount, lastComputedToken, activeToken, lastComputedAt, lastComputedFlushId, logsForStats.length, setLogsDeferred]);
    const applyHydratedStatsBatch = useCallback((batch: Array<{ filePath: string; details: any }>) => {
        if (batch.length === 0) return;
        setLogsForStats((currentStatsLogs) => {
            const updatesByPath = new Map(batch.map((entry) => [entry.filePath, entry.details]));
            let changed = false;
            const next = currentStatsLogs.map((entry) => {
                const filePath = entry.filePath || '';
                const details = updatesByPath.get(filePath);
                if (!details) return entry;
                updatesByPath.delete(filePath);
                if (entry.details === details && entry.statsDetailsLoaded === true && entry.status === 'success') {
                    return entry;
                }
                changed = true;
                return {
                    ...entry,
                    details,
                    statsDetailsLoaded: true,
                    detailsFetchExhausted: false,
                    status: 'success' as const
                };
            });
            if (updatesByPath.size === 0) {
                return changed ? next : currentStatsLogs;
            }
            const additions: ILogData[] = [];
            updatesByPath.forEach((details, filePath) => {
                const base = logsRef.current.find((log) => log.filePath === filePath);
                additions.push({
                    ...(base || { id: filePath, filePath, permalink: '' }),
                    details,
                    statsDetailsLoaded: true,
                    detailsFetchExhausted: false,
                    status: 'success'
                } as ILogData);
                changed = true;
            });
            if (!changed) return currentStatsLogs;
            return additions.length > 0 ? [...additions, ...next] : next;
        });
    }, [setLogsForStats, logsRef]);

    const enabledTopListCount = [
        embedStatSettings.showDamage,
        embedStatSettings.showDownContribution,
        embedStatSettings.showHealing,
        embedStatSettings.showBarrier,
        embedStatSettings.showCleanses,
        embedStatSettings.showBoonStrips,
        embedStatSettings.showCC,
        embedStatSettings.showStability,
        embedStatSettings.showResurrects,
        embedStatSettings.showDistanceToTag,
        embedStatSettings.showKills,
        embedStatSettings.showDowns,
        embedStatSettings.showBreakbarDamage,
        embedStatSettings.showDamageTaken,
        embedStatSettings.showDeaths,
        embedStatSettings.showDodges
    ].filter(Boolean).length;
    const showClassIcons = notificationType === 'image' || notificationType === 'image-beta';
    useEffect(() => {
        embedStatSettingsRef.current = embedStatSettings;
        enabledTopListCountRef.current = enabledTopListCount;
    }, [embedStatSettings, enabledTopListCount]);

    const selectedWebhook = useMemo(
        () => webhooks.find((hook) => hook.id === selectedWebhookId) || null,
        [webhooks, selectedWebhookId]
    );

    const isBulkUploadActive = useMemo(
        () => bulkUploadMode || logs.some((log) => log.status === 'queued' || log.status === 'pending' || log.status === 'uploading' || log.status === 'retrying' || log.status === 'calculating'),
        [bulkUploadMode, logs]
    );
    const bulkUploadActiveRef = useRef(isBulkUploadActive);
    const bulkUploadModeRef = useRef(bulkUploadMode);

    const calculatingCount = logs.filter((log) => log.status === 'calculating').length;

    useEffect(() => {
        if (bulkUploadMode && calculatingCount > 1) {
            setBulkCalculatingActive(true);
        }
    }, [bulkUploadMode, calculatingCount]);

    useEffect(() => {
        if (!bulkCalculatingActive) return;
        if (calculatingCount === 0) {
            setBulkCalculatingActive(false);
        }
    }, [bulkCalculatingActive, calculatingCount]);

    useEffect(() => {
        bulkUploadActiveRef.current = isBulkUploadActive;
        if (!isBulkUploadActive && view === 'stats') {
            scheduleDetailsHydration();
        }
    }, [isBulkUploadActive, view]);

    useEffect(() => {
        bulkUploadModeRef.current = bulkUploadMode;
    }, [bulkUploadMode]);

    useEffect(() => {
        if (bulkUploadMode) return;
        const hasPendingDetailsHydration = logs.some((log) => {
            if (log.details || log.statsDetailsLoaded) return false;
            if (log.detailsFetchExhausted || log.detailsKnownUnavailable) return false;
            if (log.detailsAvailable) return true;
            const status = log.status || 'queued';
            return (status === 'success' || status === 'calculating' || status === 'discord') && Boolean(log.permalink);
        });
        if (!hasPendingDetailsHydration) return;
        scheduleDetailsHydration();
    }, [bulkUploadMode, logs]);

    useEffect(() => {
        if (view === 'stats') {
            scheduleDetailsHydration(true);
        }
    }, [view]);

    useEffect(() => {
        return () => {
            if (pendingLogFlushTimerRef.current !== null) {
                window.clearTimeout(pendingLogFlushTimerRef.current);
                pendingLogFlushTimerRef.current = null;
            }
            if (hydrateDetailsQueueRef.current !== null) {
                const cancelIdle = (window as any).cancelIdleCallback;
                if (typeof cancelIdle === 'function') {
                    cancelIdle(hydrateDetailsQueueRef.current);
                } else {
                    window.clearTimeout(hydrateDetailsQueueRef.current);
                }
                hydrateDetailsQueueRef.current = null;
            }
            if (hydrateDetailsRetryTimerRef.current !== null) {
                window.clearTimeout(hydrateDetailsRetryTimerRef.current);
                hydrateDetailsRetryTimerRef.current = null;
            }
        };
    }, []);

    const logListVirtualization = useMemo(() => {
        const rowHeight = 132;
        const overscan = 6;
        const canVirtualize = logs.length > 30 && !expandedLogId && !screenshotData;
        if (!canVirtualize || logsViewportHeight <= 0) {
            return {
                enabled: false,
                startIndex: 0,
                topSpacer: 0,
                bottomSpacer: 0,
                visibleLogs: logs
            };
        }
        const viewportRows = Math.max(1, Math.ceil(logsViewportHeight / rowHeight));
        const startIndex = Math.max(0, Math.floor(Math.max(0, logsScrollTop) / rowHeight) - overscan);
        const endIndex = Math.min(logs.length, startIndex + viewportRows + overscan * 2);
        return {
            enabled: true,
            startIndex,
            topSpacer: startIndex * rowHeight,
            bottomSpacer: Math.max(0, (logs.length - endIndex) * rowHeight),
            visibleLogs: logs.slice(startIndex, endIndex)
        };
    }, [logs, logsViewportHeight, logsScrollTop, expandedLogId, screenshotData]);

    const fetchLogDetails = useCallback(async (log: ILogData) => {
        if (log.details || !log.filePath || !window.electronAPI?.getLogDetails) return;
        setLogs((currentLogs) => {
            const idx = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
            if (idx < 0) return currentLogs;
            const updated = [...currentLogs];
            updated[idx] = { ...updated[idx], detailsLoading: true };
            return updated;
        });
        let timeoutId: number | null = null;
        const result = await Promise.race([
            window.electronAPI.getLogDetails({
                filePath: log.filePath,
                permalink: log.permalink
            }),
            new Promise<{ success: boolean; details?: any; error?: string; terminal?: boolean }>((resolve) => {
                timeoutId = window.setTimeout(() => resolve({ success: false, error: 'Details request timed out.' }), 12000);
            })
        ]).finally(() => {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        });
        if (!result?.success || !result.details) {
            setLogs((currentLogs) => {
                const idx = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
                if (idx < 0) return currentLogs;
                const updated = [...currentLogs];
                const existing = updated[idx];
                const terminal = Boolean((result as any)?.terminal);
                updated[idx] = terminal
                    ? {
                        ...existing,
                        detailsLoading: false,
                        detailsAvailable: false,
                        detailsFetchExhausted: true,
                        detailsKnownUnavailable: true,
                        status: existing.status === 'error' ? 'error' : 'success'
                    }
                    : { ...existing, detailsLoading: false };
                return updated;
            });
            return;
        }
        setLogs((currentLogs) => {
            const existingIndex = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
            if (existingIndex < 0) return currentLogs;
            const updated = [...currentLogs];
            const existing = updated[existingIndex];
            updated[existingIndex] = {
                ...existing,
                details: result.details,
                detailsLoading: false,
                detailsFetchExhausted: false,
                status: 'success'
            };
            return updated;
        });
    }, []);

    const pendingDetailsRef = useRef<Set<string>>(new Set());
    const hydrateDetailsQueueRef = useRef<number | null>(null);
    const hydrateDetailsRetryTimerRef = useRef<number | null>(null);
    const detailsHydrationAttemptsRef = useRef<Map<string, number>>(new Map());
    const MAX_DETAILS_HYDRATION_ATTEMPTS = 8;

    const scheduleDetailsHydration = useCallback((force = false) => {
        if (hydrateDetailsQueueRef.current !== null && !force) return;
        const schedule = typeof (window as any).requestIdleCallback === 'function'
            ? (window as any).requestIdleCallback
            : (cb: () => void) => window.setTimeout(cb, 150);
        hydrateDetailsQueueRef.current = schedule(async () => {
            hydrateDetailsQueueRef.current = null;
            if (!window.electronAPI?.getLogDetails) return;
            const statsViewActive = viewRef.current === 'stats';
            const rawCandidates = logsRef.current
                .filter((log) => {
                    if (!log.filePath || log.details || log.statsDetailsLoaded) return false;
                    if (log.detailsAvailable) return true;
                    return (log.status === 'success' || log.status === 'calculating' || log.status === 'discord') && Boolean(log.permalink);
                })
                .sort((a, b) => {
                    const aTime = a.uploadTime || 0;
                    const bTime = b.uploadTime || 0;
                    if (aTime !== bTime) return aTime - bTime;
                    return (a.filePath || '').localeCompare(b.filePath || '');
                });
            const activePaths = new Set(rawCandidates.map((log) => String(log.filePath || '')));
            detailsHydrationAttemptsRef.current.forEach((_attempts, filePath) => {
                if (!activePaths.has(filePath)) {
                    detailsHydrationAttemptsRef.current.delete(filePath);
                }
            });
            const allCandidates = rawCandidates.filter((log) => {
                const attempts = detailsHydrationAttemptsRef.current.get(String(log.filePath || '')) || 0;
                return attempts < MAX_DETAILS_HYDRATION_ATTEMPTS;
            });
            if (allCandidates.length === 0) return;
            const maxPerPass = statsViewActive ? allCandidates.length : Math.min(allCandidates.length, 2);
            const candidates = allCandidates.slice(0, maxPerPass);
            const hasMore = allCandidates.length > candidates.length;
            const hydratedBatch: Array<{ filePath: string; details: any }> = [];
            const failedPaths = new Set<string>();
            const terminalFailures = new Set<string>();
            const flushHydratedBatch = () => {
                if (hydratedBatch.length === 0) return;
                const batch = hydratedBatch.splice(0, hydratedBatch.length);
                applyHydratedStatsBatch(batch);
                if (statsViewActive) {
                    setLogsDeferred((currentLogs) => {
                        if (batch.length === 0) return currentLogs;
                        const updatedPaths = new Set(batch.map((entry) => entry.filePath));
                        let changed = false;
                        const next = currentLogs.map((entry) => {
                            const filePath = entry.filePath || '';
                            if (!updatedPaths.has(filePath)) return entry;
                            if (entry.statsDetailsLoaded && entry.status === 'success') return entry;
                            changed = true;
                            return {
                                ...entry,
                                statsDetailsLoaded: true,
                                detailsFetchExhausted: false,
                                status: 'success' as const
                            };
                        });
                        return changed ? next : currentLogs;
                    });
                    return;
                }
                setLogsDeferred((currentLogs) => {
                    if (batch.length === 0) return currentLogs;
                    const updatesByPath = new Map(batch.map((entry) => [entry.filePath, entry.details]));
                    let changed = false;
                    const next = currentLogs.map((entry) => {
                        const details = updatesByPath.get(entry.filePath || '');
                        if (!details) return entry;
                        changed = true;
                        return {
                            ...entry,
                            details,
                            statsDetailsLoaded: true,
                            detailsFetchExhausted: false,
                            status: 'success' as const
                        };
                    });
                    return changed ? next : currentLogs;
                });
            };
            const maxConcurrent = 1;
            const flushThreshold = statsViewActive ? 8 : 2;
            let nextIndex = 0;
            const runWorker = async () => {
                while (nextIndex < candidates.length) {
                    const currentIndex = nextIndex;
                    nextIndex += 1;
                    const log = candidates[currentIndex];
                    const filePath = log.filePath!;
                    if (pendingDetailsRef.current.has(filePath)) continue;
                    pendingDetailsRef.current.add(filePath);
                    try {
                        let timeoutId: number | null = null;
                        const result = await Promise.race([
                            window.electronAPI.getLogDetails({
                                filePath,
                                permalink: log.permalink
                            }),
                            new Promise<{ success: boolean; details?: any; error?: string; terminal?: boolean }>((resolve) => {
                                timeoutId = window.setTimeout(() => resolve({ success: false, error: 'Details request timed out.' }), 12000);
                            })
                        ]).finally(() => {
                            if (timeoutId !== null) {
                                window.clearTimeout(timeoutId);
                            }
                        });
                        if (result?.success && result.details) {
                            detailsHydrationAttemptsRef.current.delete(filePath);
                            hydratedBatch.push({ filePath, details: result.details });
                            if (hydratedBatch.length >= flushThreshold) {
                                flushHydratedBatch();
                            }
                        } else {
                            if ((result as any)?.terminal) {
                                terminalFailures.add(filePath);
                            }
                            failedPaths.add(filePath);
                        }
                        if (!statsViewActive) {
                            await new Promise((resolve) => window.setTimeout(resolve, 40));
                        }
                    } catch {
                        failedPaths.add(filePath);
                    } finally {
                        pendingDetailsRef.current.delete(filePath);
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(maxConcurrent, candidates.length) }, () => runWorker()));
            flushHydratedBatch();
            const retryableFailures: string[] = [];
            const exhaustedFailures: string[] = [];
            failedPaths.forEach((filePath) => {
                if (terminalFailures.has(filePath)) {
                    detailsHydrationAttemptsRef.current.set(filePath, MAX_DETAILS_HYDRATION_ATTEMPTS);
                    exhaustedFailures.push(filePath);
                    return;
                }
                const previousAttempts = detailsHydrationAttemptsRef.current.get(filePath) || 0;
                const nextAttempts = previousAttempts + 1;
                detailsHydrationAttemptsRef.current.set(filePath, nextAttempts);
                if (nextAttempts < MAX_DETAILS_HYDRATION_ATTEMPTS) {
                    retryableFailures.push(filePath);
                } else {
                    exhaustedFailures.push(filePath);
                }
            });
            if (exhaustedFailures.length > 0) {
                const exhaustedSet = new Set(exhaustedFailures);
                setLogsDeferred((currentLogs) => {
                    let changed = false;
                    const next = currentLogs.map((entry) => {
                        const filePath = entry.filePath || '';
                        if (!exhaustedSet.has(filePath)) return entry;
                        if (entry.detailsFetchExhausted && !entry.detailsAvailable && entry.status !== 'calculating') {
                            return entry;
                        }
                        changed = true;
                        const nextStatus: ILogData['status'] = entry.status === 'error' ? 'error' : 'success';
                        return {
                            ...entry,
                            detailsAvailable: false,
                            detailsFetchExhausted: true,
                            detailsKnownUnavailable: terminalFailures.has(filePath) || entry.detailsKnownUnavailable,
                            status: nextStatus
                        };
                    });
                    return changed ? next : currentLogs;
                });
            }
            if (hasMore || retryableFailures.length > 0) {
                const delayMs = retryableFailures.length > 0
                    ? (statsViewActive ? 260 : 420)
                    : (statsViewActive ? 0 : 180);
                if (hydrateDetailsRetryTimerRef.current !== null) {
                    window.clearTimeout(hydrateDetailsRetryTimerRef.current);
                }
                hydrateDetailsRetryTimerRef.current = window.setTimeout(() => {
                    hydrateDetailsRetryTimerRef.current = null;
                    scheduleDetailsHydration(true);
                }, delayMs);
            }
        });
    }, [applyHydratedStatsBatch, setLogsDeferred]);

    const endBulkUpload = useCallback(() => {
        bulkUploadExpectedRef.current = null;
        bulkUploadCompletedRef.current = 0;
        setBulkUploadMode(false);
        const kickOffStatsCompute = (delayMs = 0) => {
            window.setTimeout(() => {
                bulkStatsAwaitingRef.current = true;
                setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));
                const flushId = requestFlush?.();
                if (flushId) {
                    bulkFlushIdRef.current = flushId;
                }
            }, delayMs);
        };
        kickOffStatsCompute(0);
        // Run a second kickoff after queued state flushes so late upload updates are included.
        kickOffStatsCompute(420);
        if (viewRef.current === 'stats') {
            window.setTimeout(() => scheduleDetailsHydration(true), 0);
            window.setTimeout(() => scheduleDetailsHydration(true), 500);
        } else {
            window.setTimeout(() => scheduleDetailsHydration(true), 180);
            window.setTimeout(() => scheduleDetailsHydration(true), 620);
        }
    }, [scheduleDetailsHydration, requestFlush, setLogsForStats]);

    // Dashboard stats (upload counts, pie chart, squad/enemy averages, win/loss)
    const { totalUploads, statusCounts, uploadPieData, avgSquadSize, avgEnemies, winLoss, squadKdr } = useDashboardStats(logs);

    const statsDataProgress = useStatsDataProgress(logs, view, isBulkUploadActive);

    useEffect(() => {
        if (logs.length === 0) return;
        const now = Date.now();
        const canAttempt = now - statsSyncRecoveryAtRef.current > 1500;
        if (!canAttempt) return;
        const shouldRecover = shouldAttemptStatsSyncRecovery({
            view,
            bulkUploadMode,
            liveLogs: logs,
            statsLogs: logsForStats,
            progress: {
                total: statsDataProgress.total,
                pending: statsDataProgress.pending,
                unavailable: statsDataProgress.unavailable
            }
        });
        if (!shouldRecover) return;
        statsSyncRecoveryAtRef.current = now;
        setLogsForStats((prev) => {
            if (prev.length === logsRef.current.length && prev.length > 0) return prev;
            return logsRef.current.length > 0 ? logsRef.current : logs;
        });
        scheduleDetailsHydration(true);
    }, [
        view,
        bulkUploadMode,
        logs.length,
        logs,
        logsForStats,
        logsRef,
        statsDataProgress.pending,
        statsDataProgress.total,
        statsDataProgress.unavailable,
        setLogsForStats,
        scheduleDetailsHydration
    ]);

    useEffect(() => {
        // Listen for status updates during upload process
        const cleanupStatus = window.electronAPI.onUploadStatus((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            queueLogUpdate(data);
        });

        const cleanupUpload = window.electronAPI.onUploadComplete((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            lastUploadCompleteAtRef.current = Date.now();
            console.log('[App] Upload Complete Data:', {
                path: data.filePath,
                status: data.status,
                hasDetails: !!data.details,
                playerCount: data.details?.players?.length
            });
            if (bulkUploadModeRef.current) {
                queueLogUpdate(data);
                bulkUploadCompletedRef.current += 1;
                if (bulkUploadExpectedRef.current !== null && bulkUploadCompletedRef.current >= bulkUploadExpectedRef.current) {
                    endBulkUpload();
                }
                return;
            }
            queueLogUpdate(data);
        });

        let screenshotSubscriptionDisposed = false;
        const waitMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
        const waitFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const escapeSelector = (value: string) => {
            if (typeof window !== 'undefined' && (window as any).CSS?.escape) {
                return (window as any).CSS.escape(value);
            }
            return value.replace(/"/g, '\\"');
        };
        const waitForNodes = async (selector: string, expectedCount: number, timeoutMs: number) => {
            const start = performance.now();
            while (!screenshotSubscriptionDisposed && performance.now() - start < timeoutMs) {
                const nodes = Array.from(document.querySelectorAll(selector));
                if (nodes.length >= expectedCount) {
                    return nodes;
                }
                await waitMs(90);
            }
            return screenshotSubscriptionDisposed ? [] : Array.from(document.querySelectorAll(selector));
        };
        const waitForNode = async (nodeId: string, timeoutMs: number) => {
            const start = performance.now();
            while (!screenshotSubscriptionDisposed && performance.now() - start < timeoutMs) {
                const node = document.getElementById(nodeId);
                if (node) return node as HTMLElement;
                await waitMs(90);
            }
            if (screenshotSubscriptionDisposed) return null;
            return document.getElementById(nodeId) as HTMLElement | null;
        };
        const safeToPng = async (node: HTMLElement, options: any) => {
            return Promise.race([
                toPng(node, { ...options, cacheBust: false, skipAutoScale: true }),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Screenshot generation timed out')), 5000))
            ]);
        };
        const captureScreenshotForLog = async (incoming: ILogData) => {
            const logKey = incoming.id || incoming.filePath;
            if (!logKey || screenshotSubscriptionDisposed) {
                if (!logKey) {
                    console.error('Screenshot request missing log identifier.');
                }
                return;
            }
            console.log('Screenshot requested for:', logKey);
            const payload = {
                ...incoming,
                id: logKey,
                splitEnemiesByTeam: Boolean((incoming as any)?.splitEnemiesByTeam)
            };
            setScreenshotData(payload);
            await waitFrame();
            await waitMs(bulkUploadModeRef.current ? 240 : 120);
            if (screenshotSubscriptionDisposed) return;
            const mode = (incoming as any)?.mode || 'image';
            try {
                if (mode === 'image-beta') {
                    const selector = `[data-screenshot-id="${escapeSelector(logKey)}"]`;
                    const details: any = (incoming as any)?.details || {};
                    const players = Array.isArray(details.players) ? details.players : [];
                    const targets = Array.isArray(details.targets) ? details.targets : [];
                    const normalizeTeamId = (raw: any): number | null => {
                        const value = raw?.teamID ?? raw?.teamId ?? raw?.team;
                        const num = Number(value);
                        return Number.isFinite(num) && num > 0 ? num : null;
                    };
                    const allyTeamIds = new Set<number>();
                    players.forEach((player: any) => {
                        if (player?.notInSquad) return;
                        const teamId = normalizeTeamId(player);
                        if (teamId !== null) allyTeamIds.add(teamId);
                    });
                    const enemyTeamIds = new Set<number>();
                    targets.forEach((target: any) => {
                        if (target?.isFake) return;
                        if (target?.enemyPlayer === false) return;
                        const teamId = normalizeTeamId(target);
                        if (teamId === null || allyTeamIds.has(teamId)) return;
                        enemyTeamIds.add(teamId);
                    });
                    players.forEach((player: any) => {
                        if (!player?.notInSquad) return;
                        const teamId = normalizeTeamId(player);
                        if (teamId === null || allyTeamIds.has(teamId)) return;
                        enemyTeamIds.add(teamId);
                    });
                    const resolvedEnemyTeamIds = Array.from(enemyTeamIds).sort((a, b) => a - b);
                    const activeEmbedStatSettings = embedStatSettingsRef.current;
                    const enemySummaryTileCount = activeEmbedStatSettings.showEnemySummary
                        ? ((incoming as any)?.splitEnemiesByTeam ? resolvedEnemyTeamIds.length : 1)
                        : 0;
                    const summaryTileCount = (activeEmbedStatSettings.showSquadSummary ? 1 : 0) + enemySummaryTileCount;
                    const expectedCount = summaryTileCount
                        + (activeEmbedStatSettings.showClassSummary ? (
                            (activeEmbedStatSettings.showSquadSummary ? 1 : 0)
                            + (activeEmbedStatSettings.showEnemySummary
                                ? (((incoming as any)?.splitEnemiesByTeam ? resolvedEnemyTeamIds.length : 1))
                                : 0)
                        ) : 0)
                        + (activeEmbedStatSettings.showIncomingStats ? 4 : 0)
                        + enabledTopListCountRef.current;
                    const nodes = await waitForNodes(selector, Math.max(1, expectedCount), 5000);
                    if (nodes.length === 0) {
                        const fallbackNode = await waitForNode(`log-screenshot-${logKey}`, 1500);
                        if (!fallbackNode) {
                            console.error('Screenshot nodes not found.');
                            return;
                        }
                        const fallbackDataUrl = await safeToPng(fallbackNode, {
                            backgroundColor: '#10141b',
                            quality: 0.95,
                            pixelRatio: 3
                        });
                        const fallbackBuffer = dataUrlToUint8Array(fallbackDataUrl);
                        window.electronAPI.sendScreenshot(logKey, fallbackBuffer);
                        return;
                    }
                    const buffers: { group: string; buffer: Uint8Array }[] = [];
                    for (const node of nodes) {
                        if (screenshotSubscriptionDisposed) return;
                        const transparent = (node as HTMLElement).dataset.screenshotTransparent === 'true';
                        try {
                            const dataUrl = await safeToPng(node as HTMLElement, {
                                backgroundColor: transparent ? 'rgba(0,0,0,0)' : '#10141b',
                                quality: 0.95,
                                pixelRatio: 3,
                                width: (node as HTMLElement).offsetWidth,
                                height: (node as HTMLElement).offsetHeight
                            });
                            const buffer = dataUrlToUint8Array(dataUrl);
                            const group = (node as HTMLElement).dataset.screenshotGroup || 'default';
                            buffers.push({ group, buffer });
                        } catch (innerErr) {
                            console.error('Failed to screenshot a specific tile:', innerErr);
                        }
                    }
                    if (buffers.length === 0) {
                        throw new Error('No tiles were successfully captured');
                    }
                    const groups: Uint8Array[][] = [];
                    const incomingBuffers: Uint8Array[] = [];
                    let currentPair: Uint8Array[] = [];
                    let i = 0;
                    while (i < buffers.length) {
                        const entry = buffers[i];
                        if (entry.group === 'incoming') {
                            while (i < buffers.length && buffers[i].group === 'incoming') {
                                incomingBuffers.push(buffers[i].buffer);
                                i += 1;
                            }
                            if (currentPair.length > 0) {
                                groups.push(currentPair);
                                currentPair = [];
                            }
                            if (incomingBuffers.length > 0) {
                                groups.push([...incomingBuffers]);
                                incomingBuffers.length = 0;
                            }
                            continue;
                        }
                        currentPair.push(entry.buffer);
                        if (currentPair.length === 2) {
                            groups.push(currentPair);
                            currentPair = [];
                        }
                        i += 1;
                    }
                    if (currentPair.length > 0) {
                        groups.push(currentPair);
                    }
                    window.electronAPI.sendScreenshotsGroups(logKey, groups);
                    return;
                }
                const node = await waitForNode(`log-screenshot-${logKey}`, 2000);
                if (!node) {
                    console.error('Screenshot node not found');
                    return;
                }
                const dataUrl = await safeToPng(node, {
                    backgroundColor: '#10141b',
                    quality: 0.95,
                    pixelRatio: 3
                });
                const buffer = dataUrlToUint8Array(dataUrl);
                window.electronAPI.sendScreenshot(logKey, buffer);
            } catch (err) {
                console.error('Screenshot failed:', err);
            } finally {
                if (!screenshotSubscriptionDisposed) {
                    setScreenshotData(null);
                }
            }
        };
        const cleanupScreenshot = window.electronAPI.onRequestScreenshot((data: ILogData) => {
            screenshotCaptureChainRef.current = screenshotCaptureChainRef.current
                .catch(() => undefined)
                .then(async () => {
                    if (screenshotSubscriptionDisposed) return;
                    await captureScreenshotForLog(data);
                    if (bulkUploadModeRef.current) {
                        await waitMs(80);
                    }
                });
        });

        return () => {
            screenshotSubscriptionDisposed = true;
            if (pendingLogFlushTimerRef.current !== null) {
                window.clearTimeout(pendingLogFlushTimerRef.current);
                pendingLogFlushTimerRef.current = null;
            }
            pendingLogUpdatesRef.current.clear();
            setScreenshotData(null);
            cleanupStatus();
            cleanupUpload();
            cleanupScreenshot();
        };
    }, []);

    const isModernTheme = uiTheme === 'modern' || uiTheme === 'kinetic';
    const isTopDashboardLayout = dashboardLayout === 'top';
    const isCrtTheme = uiTheme === 'crt';
    const appIconPath = `${import.meta.env.BASE_URL || './'}svg/ArcBridge.svg`;
    const arcbridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
    const isDev = import.meta.env.DEV;
    const shellClassName = isModernTheme
        ? 'app-shell h-screen w-screen text-white overflow-hidden flex flex-col'
        : isCrtTheme
            ? 'app-shell h-screen w-screen text-white overflow-hidden flex flex-col'
            : 'app-shell h-screen w-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-gray-900 to-black text-white font-sans overflow-hidden flex flex-col';

    const notificationTypeButtons = isTopDashboardLayout ? (
        <div className="grid grid-cols-3 gap-1.5">
            <button
                onClick={() => {
                    setNotificationType('image');
                    handleUpdateSettings({ discordNotificationType: 'image' });
                }}
                className={`flex items-center justify-center gap-2 h-8 text-[11px] rounded-xl border transition-all ${notificationType === 'image' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
            >
                <ImageIcon className="w-4 h-4" />
                <span className="font-medium">Image</span>
            </button>
            <button
                onClick={() => {
                    setNotificationType('embed');
                    handleUpdateSettings({ discordNotificationType: 'embed' });
                }}
                className={`flex items-center justify-center gap-2 h-8 text-[11px] rounded-xl border transition-all ${notificationType === 'embed' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
            >
                <Layout className="w-4 h-4" />
                <span className="font-medium">Embed</span>
            </button>
            <button
                onClick={() => {
                    setNotificationType('image-beta');
                    handleUpdateSettings({ discordNotificationType: 'image-beta' });
                }}
                className={`flex items-center justify-center gap-2 h-8 text-[11px] rounded-xl border transition-all ${notificationType === 'image-beta' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
            >
                <Grid3X3 className="w-4 h-4" />
                <span className="font-medium">Tiled</span>
            </button>
        </div>
    ) : (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2">
                <button
                    onClick={() => {
                        setNotificationType('image');
                        handleUpdateSettings({ discordNotificationType: 'image' });
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-all ${notificationType === 'image' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
                >
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">Image</span>
                </button>
                <button
                    onClick={() => {
                        setNotificationType('embed');
                        handleUpdateSettings({ discordNotificationType: 'embed' });
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-all ${notificationType === 'embed' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
                >
                    <Layout className="w-4 h-4" />
                    <span className="text-sm font-medium">Embed</span>
                </button>
            </div>
            <button
                onClick={() => {
                    setNotificationType('image-beta');
                    handleUpdateSettings({ discordNotificationType: 'image-beta' });
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-all ${notificationType === 'image-beta' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
            >
                <Grid3X3 className="w-4 h-4" />
                <span className="text-sm font-medium">Tiled</span>
            </button>
        </div>
    );

    const notificationTypePanel = (
        <div className={isTopDashboardLayout ? 'space-y-1 min-w-0' : ''}>
            <label className={`text-xs uppercase tracking-wider text-gray-500 font-semibold ${isTopDashboardLayout ? 'mb-1 block' : 'mb-2 block'}`}>Notification Type</label>
            {notificationTypeButtons}
        </div>
    );

    const configurationPanel = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl hover:border-white/20 transition-colors matte-config-panel"
        >
            {isTopDashboardLayout ? (
                <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] gap-4 items-start p-2">
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-1 gap-3 min-w-0">
                        <div className="space-y-1 min-w-0">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold h-4 flex items-center">Log Directory</label>
                            <div className="flex gap-1 w-full max-w-full">
                                <div className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-xl px-1.5 h-8 flex items-center gap-2 hover:border-blue-500/50 transition-colors">
                                    <div className="pl-1 shrink-0">
                                        <FolderOpen className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <input
                                        type="text"
                                        value={logDirectory || ''}
                                        placeholder="C:\...\arcdps.cbtlogs"
                                        className="flex-1 bg-transparent border-none text-[11px] text-gray-300 placeholder-gray-600 focus:ring-0 px-2 min-w-0 w-full h-full"
                                        onChange={(e) => setLogDirectory(e.target.value)}
                                        onBlur={(e) => {
                                            if (e.target.value) {
                                                window.electronAPI.startWatching(e.target.value);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && logDirectory) {
                                                window.electronAPI.startWatching(logDirectory);
                                            }
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={handleSelectDirectory}
                                    className="shrink-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl w-8 h-8 flex items-center justify-center transition-colors"
                                    title="Browse..."
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1 min-w-0">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold h-4 flex items-center">Discord Webhook</label>
                            <div className="flex gap-1 w-full">
                                <div ref={webhookDropdownRef} className="relative flex-1 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setWebhookDropdownOpen((prev) => !prev)}
                                        ref={webhookDropdownButtonRef}
                                        className="w-full bg-black/40 border border-white/5 rounded-xl px-2.5 h-8 flex items-center justify-between gap-2 text-[11px] text-gray-300 hover:border-purple-500/50 hover:bg-black/50 transition-colors"
                                        aria-haspopup="listbox"
                                        aria-expanded={webhookDropdownOpen}
                                    >
                                        <span className="truncate">
                                            {selectedWebhook?.name || 'Disabled'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${webhookDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => setWebhookModalOpen(true)}
                                    className="shrink-0 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl w-8 h-8 flex items-center justify-center gap-2 transition-colors"
                                    title="Manage Webhooks"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1 min-w-0">
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold h-4 flex items-center">Notification Type</label>
                        {notificationTypeButtons}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Log Directory</label>
                        <div className="flex gap-2 w-full max-w-full">
                            <div className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-xl px-2 h-11 flex items-center gap-3 hover:border-blue-500/50 transition-colors">
                                <div className="pl-2 shrink-0">
                                    <FolderOpen className="w-5 h-5 text-blue-400" />
                                </div>
                                <input
                                    type="text"
                                    value={logDirectory || ''}
                                    placeholder="C:\...\arcdps.cbtlogs"
                                    className="flex-1 bg-transparent border-none text-sm text-gray-300 placeholder-gray-600 focus:ring-0 px-2 min-w-0 w-full h-full"
                                    onChange={(e) => setLogDirectory(e.target.value)}
                                    onBlur={(e) => {
                                        if (e.target.value) {
                                            window.electronAPI.startWatching(e.target.value);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && logDirectory) {
                                            window.electronAPI.startWatching(logDirectory);
                                        }
                                    }}
                                />
                            </div>
                            <button
                                onClick={handleSelectDirectory}
                                className="shrink-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl w-11 h-11 flex items-center justify-center transition-colors"
                                title="Browse..."
                            >
                                <FolderOpen className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Discord Webhook</label>
                        <div className="flex gap-2 w-full">
                            <div ref={webhookDropdownRef} className="relative flex-1 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setWebhookDropdownOpen((prev) => !prev)}
                                    ref={webhookDropdownButtonRef}
                                    className={`w-full rounded-xl px-3 h-11 flex items-center justify-between gap-2 text-sm transition-all ${uiTheme === 'matte'
                                        ? `bg-[#222629] text-slate-400 ${webhookDropdownOpen
                                            ? 'shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                            : 'shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-slate-200'}`
                                        : 'bg-black/40 border border-white/5 text-gray-300 hover:border-purple-500/50 hover:bg-black/50'
                                        }`}
                                    aria-haspopup="listbox"
                                    aria-expanded={webhookDropdownOpen}
                                >
                                    <span className="truncate">
                                        {selectedWebhook?.name || 'Disabled'}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${webhookDropdownOpen ? 'rotate-180' : ''} ${uiTheme === 'matte' ? 'text-slate-500' : 'text-gray-500'}`} />
                                </button>
                            </div>
                            <button
                                onClick={() => setWebhookModalOpen(true)}
                                className={`shrink-0 rounded-xl w-11 h-11 flex items-center justify-center gap-2 transition-all ${uiTheme === 'matte'
                                    ? 'bg-[#222629] text-slate-400 shadow-[-2px_-2px_4px_#2b3034,2px_2px_4px_#191c1e] hover:text-slate-200 active:shadow-[inset_-2px_-2px_4px_#2b3034,inset_2px_2px_4px_#191c1e]'
                                    : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    }`}
                                title="Manage Webhooks"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {notificationTypePanel}
                </div>
            )}
        </motion.div>
    );

    const successCount = statusCounts.success || 0;
    const errorCount = statusCounts.error || 0;
    const uploadingCount = (statusCounts.queued || 0)
        + (statusCounts.pending || 0)
        + (statusCounts.uploading || 0)
        + (statusCounts.retrying || 0)
        + (statusCounts.discord || 0)
        + (statusCounts.calculating || 0);
    const winRate = totalUploads > 0 ? Math.round((winLoss.wins / totalUploads) * 100) : 0;

    const statsTilesPanel = isTopDashboardLayout ? (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3 matte-tiles-shell"
        >
            <div className="grid grid-cols-4 gap-4">
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 matte-stat-card">
                    <div className="min-w-0">
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Upload Status</div>
                        <div className="mt-2 text-2xl font-bold text-white leading-none">{totalUploads}</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                            {successCount} success • {errorCount} error{uploadingCount > 0 ? ` • ${uploadingCount} active` : ''}
                        </div>
                    </div>
                    <div className="w-16 h-16 shrink-0">
                        <div className="w-full h-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={uploadPieData}
                                        dataKey="count"
                                        nameKey="label"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius="55%"
                                        outerRadius="86%"
                                        stroke="rgba(15, 23, 42, 0.9)"
                                        strokeWidth={1}
                                        paddingAngle={1}
                                        isAnimationActive={false}
                                    >
                                        {uploadPieData.map((entry) => (
                                            <Cell key={entry.key} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: any, _name: any, payload: any) => {
                                            const label = payload?.payload?.label || 'Status';
                                            return [`${value ?? 0}`, label];
                                        }}
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '0.5rem', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                        labelStyle={{ display: 'none' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 matte-stat-card uploader-kpi-card">
                    <div>
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">W / L</div>
                        <div className="inline-flex items-baseline text-2xl font-bold leading-none">
                            <span style={{ color: '#86efac' }}>{winLoss.wins}</span>
                            <span className="text-gray-500 mx-2">/</span>
                            <span style={{ color: '#fca5a5' }}>{winLoss.losses}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">Totals</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500">Win rate</div>
                        <div className="text-xl font-semibold text-emerald-200">{winRate}%</div>
                        <div className="text-[11px] text-gray-500">{totalUploads} logs</div>
                    </div>
                </div>
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 matte-stat-card uploader-kpi-card">
                    <div>
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Avg Players</div>
                        <div className="inline-flex items-baseline text-2xl font-bold leading-none">
                            <span style={{ color: '#86efac' }}>{avgSquadSize}</span>
                            <span className="text-gray-500 mx-2">/</span>
                            <span style={{ color: '#fca5a5' }}>{avgEnemies}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">Squad / Enemy</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500">Diff</div>
                        <div className="text-xl font-semibold text-sky-200">{avgSquadSize - avgEnemies}</div>
                        <div className="text-[11px] text-gray-500">Ratio {(avgEnemies ? (avgSquadSize / avgEnemies) : 0).toFixed(2)}</div>
                    </div>
                </div>
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 matte-stat-card uploader-kpi-card">
                    <div>
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Squad KDR</div>
                        <div className="text-2xl font-bold text-emerald-300 leading-none">{squadKdr}</div>
                        <div className="text-[11px] text-gray-500">Kills / Deaths</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500">Success</div>
                        <div className="text-xl font-semibold text-emerald-200">{successCount}</div>
                        <div className="text-[11px] text-gray-500">Errors {errorCount}</div>
                    </div>
                </div>
            </div>
        </motion.div>
    ) : (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-4 matte-tiles-shell"
        >
            <div className="relative h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 matte-stat-card">
                <div className="absolute left-3 top-2 text-gray-400 text-[11px] font-medium uppercase tracking-wider">Upload Status</div>
                <div className="absolute inset-x-2 bottom-2 top-6 flex items-center justify-center">
                    <div className="w-full h-full max-h-[68px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={uploadPieData}
                                    dataKey="count"
                                    nameKey="label"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius="55%"
                                    outerRadius="86%"
                                    stroke="rgba(15, 23, 42, 0.9)"
                                    strokeWidth={1}
                                    paddingAngle={1}
                                    isAnimationActive={false}
                                >
                                    {uploadPieData.map((entry) => (
                                        <Cell key={entry.key} fill={entry.color} />
                                    ))}
                                </Pie>
                                <text
                                    x="50%"
                                    y="50%"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    className="fill-white text-[14px] font-bold"
                                >
                                    {totalUploads}
                                </text>
                                <Tooltip
                                    formatter={(value: any, _name: any, payload: any) => {
                                        const label = payload?.payload?.label || 'Status';
                                        return [`${value ?? 0}`, label];
                                    }}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.12)', borderRadius: '0.5rem', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    labelStyle={{ display: 'none' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            <div className="relative h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 matte-stat-card uploader-kpi-card">
                <div className="absolute left-3 top-2 text-gray-400 text-[11px] font-medium uppercase tracking-wider">W / L</div>
                <div className="absolute inset-x-3 bottom-2 top-6 flex items-center justify-center">
                    <div className="inline-flex translate-y-2 items-baseline text-[2rem] font-bold leading-none">
                        <span style={{ color: '#86efac' }}>{winLoss.wins}</span>
                        <span className="text-gray-500 mx-2">/</span>
                        <span style={{ color: '#fca5a5' }}>{winLoss.losses}</span>
                    </div>
                </div>
            </div>
            <div className="relative h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 matte-stat-card uploader-kpi-card">
                <div className="absolute left-3 top-2 text-gray-400 text-[11px] font-medium uppercase tracking-wider">Avg Players</div>
                <div className="absolute inset-x-3 bottom-2 top-6 flex items-center justify-center">
                    <div className="inline-flex translate-y-2 items-baseline text-[2rem] font-bold leading-none">
                        <span style={{ color: '#86efac' }}>{avgSquadSize}</span>
                        <span className="text-gray-500 mx-2">/</span>
                        <span style={{ color: '#fca5a5' }}>{avgEnemies}</span>
                    </div>
                </div>
            </div>
            <div className="relative h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 matte-stat-card uploader-kpi-card">
                <div className="absolute left-3 top-2 text-gray-400 text-[11px] font-medium uppercase tracking-wider">Squad KDR</div>
                <div className="absolute inset-x-3 bottom-2 top-6 flex items-center justify-center">
                    <div className="translate-y-2 text-[2.1rem] font-bold text-emerald-300 leading-none">{squadKdr}</div>
                </div>
            </div>
        </motion.div>
    );

    const activityPanel = (
        <motion.div
            initial={{ opacity: 0, scale: 0.992 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.24, ease: 'easeOut' }}
            className={`bg-white/5 backdrop-blur-xl border ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'} rounded-2xl p-6 flex flex-col h-full shadow-2xl transition-all duration-300 relative matte-activity-panel`}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                setIsDragging(true);
            }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files);
                const validFiles: string[] = [];
                const optimisticLogs: ILogData[] = [];

                files.forEach(file => {
                    const filePath = (file as any).path;
                    if (filePath && (file.name.endsWith('.evtc') || file.name.endsWith('.zevtc'))) {
                        validFiles.push(filePath);
                        optimisticLogs.push({
                            id: file.name,
                            filePath: filePath,
                            status: 'pending',
                            fightName: file.name,
                            uploadTime: Date.now() / 1000,
                            permalink: ''
                        });
                    }
                });

                if (validFiles.length > 0) {
                    setLogs(currentLogs => {
                        const newLogs = [...currentLogs];
                        optimisticLogs.forEach(optLog => {
                            if (!newLogs.some(l => l.filePath === optLog.filePath)) {
                                newLogs.unshift(optLog);
                            }
                        });
                        return newLogs;
                    });

                    if (validFiles.length > 1) {
                        setBulkUploadMode(true);
                        bulkUploadExpectedRef.current = validFiles.length;
                        bulkUploadCompletedRef.current = 0;
                    }
                    window.electronAPI.manualUploadBatch(validFiles);
                }
            }}
        >
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Recent Activity
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFilePickerOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                        title="Select logs to upload"
                    >
                        <FilePlus2 className="w-3.5 h-3.5" />
                        Add Logs
                    </button>
                    <button
                        onClick={() => {
                            setLogs([]);
                            setExpandedLogId(null);
                            setScreenshotData(null);
                            canceledLogsRef.current.clear();
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                        title="Clear all logs"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear Logs
                    </button>
                </div>
            </div>
            {bulkCalculatingActive && calculatingCount > 0 && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
                    Bulk calculations are running. The app may feel less responsive until they finish.
                </div>
            )}
            {(uploadRetryQueue.failed > 0 || uploadRetryQueue.retrying > 0 || uploadRetryQueue.entries.length > 0) && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
                    <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">Upload Retry Queue</div>
                        <div className="flex items-center gap-2">
                            {uploadRetryQueue.paused && (
                                <button
                                    type="button"
                                    onClick={handleResumeUploadRetries}
                                    disabled={retryQueueBusy}
                                    className="rounded-md border border-rose-300/30 bg-rose-400/20 px-2.5 py-1 text-[11px] font-semibold text-rose-50 hover:bg-rose-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {retryQueueBusy ? 'Resuming...' : 'Resume'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleRetryFailedUploads}
                                disabled={retryQueueBusy || uploadRetryQueue.failed === 0 || uploadRetryQueue.paused}
                                className="rounded-md border border-rose-300/30 bg-rose-400/20 px-2.5 py-1 text-[11px] font-semibold text-rose-50 hover:bg-rose-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {retryQueueBusy ? 'Retrying...' : 'Retry failed'}
                            </button>
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-rose-100/80">
                        Failed: {uploadRetryQueue.failed} | Retrying: {uploadRetryQueue.retrying} | Resolved: {uploadRetryQueue.resolved}
                    </div>
                    {uploadRetryQueue.paused && (
                        <div className="mt-1 text-[10px] text-rose-50">
                            Paused: {uploadRetryQueue.pauseReason || 'Retry queue is paused.'}
                        </div>
                    )}
                    {uploadRetryQueue.entries.length > 0 && (
                        <div className="mt-2 max-h-24 overflow-y-auto space-y-1 pr-1">
                            {uploadRetryQueue.entries.slice(0, 5).map((entry) => {
                                const fileName = entry.filePath.split(/[\\/]/).pop() || entry.filePath;
                                return (
                                    <div key={entry.filePath} className="truncate text-[10px] text-rose-100/75">
                                        [{entry.category}] {fileName}: {entry.error}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {devDatasetLoadProgress && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                    <div className="flex flex-col items-center text-center gap-1">
                        <FilePlus2 className="w-5 h-5 text-amber-300" />
                        <div className="text-[11px] text-amber-100">
                            Loading dev dataset: <span className="font-semibold">{devDatasetLoadProgress.name}</span>
                        </div>
                        <div className="text-[10px] text-amber-200/80">
                            {devDatasetLoadProgress.total !== null
                                ? `${Math.min(devDatasetLoadProgress.loaded, devDatasetLoadProgress.total)} / ${devDatasetLoadProgress.total}`
                                : `${devDatasetLoadProgress.loaded} loaded`}
                        </div>
                    </div>
                </div>
            )}

            <div
                className="flex-1 overflow-y-auto pr-2 matte-log-list"
                ref={logsListRef}
                onScroll={handleLogsListScroll}
            >
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-20">
                        <UploadCloud className="w-12 h-12 mb-3" />
                        <p>Drop logs to upload</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logListVirtualization.enabled && logListVirtualization.topSpacer > 0 && (
                            <div aria-hidden="true" style={{ height: `${logListVirtualization.topSpacer}px` }} />
                        )}
                        {logListVirtualization.visibleLogs.map((log) => (
                            <ExpandableLogCard
                                key={log.filePath || log.id}
                                log={log}
                                isExpanded={expandedLogId === log.filePath}
                                onToggle={() => {
                                    const nextExpanded = expandedLogId === log.filePath ? null : log.filePath;
                                    setExpandedLogId(nextExpanded);
                                    if (nextExpanded) {
                                        fetchLogDetails(log);
                                    }
                                }}
                                layoutEnabled={!isBulkUploadActive}
                                motionEnabled={!isBulkUploadActive}
                                onCancel={() => {
                                    if (!log.filePath) return;
                                    canceledLogsRef.current.add(log.filePath);
                                    setLogs((currentLogs) => currentLogs.filter((entry) => entry.filePath !== log.filePath));
                                    if (expandedLogId === log.filePath) {
                                        setExpandedLogId(null);
                                    }
                                }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={true}
                            />
                        ))}
                        {logListVirtualization.enabled && logListVirtualization.bottomSpacer > 0 && (
                            <div aria-hidden="true" style={{ height: `${logListVirtualization.bottomSpacer}px` }} />
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );

    const devDatasetsCtx = {
        devDatasetsEnabled, devDatasetsOpen, loadDevDatasets, devDatasetRefreshing, setDevDatasetsOpen, devDatasetName, setDevDatasetName, devDatasetSaving, setDevDatasetSaving, devDatasetSavingIdRef, setDevDatasetSaveProgress, computedStats, computedSkillUsageData, appVersion, view, expandedLogId, notificationType, embedStatSettings, mvpWeights, statsViewSettings, disruptionMethod, uiTheme, selectedWebhookId, bulkUploadMode, logs, setDevDatasets, setDevDatasetLoadModes, devDatasetSaveProgress, devDatasets, devDatasetLoadModes, setDevDatasetLoadingId, setDevDatasetLoadProgress, setLogs, setLogsForStats, logsRef, setPrecomputedStats, setScreenshotData, canceledLogsRef, datasetLoadRef, devDatasetStreamingIdRef, applyDevDatasetSnapshot, setDevDatasetDeleteConfirmId, devDatasetDeleteConfirmId, devDatasetLoadingId
    };
    const filePickerCtx = {
        filePickerOpen, setFilePickerOpen, setFilePickerError, setFilePickerSelected, filePickerError, filePickerSelected, loadLogFiles, logDirectory, selectSinceOpen, setSelectSinceOpen, selectDayOpen, setSelectDayOpen, selectBetweenOpen, setSelectBetweenOpen, selectDayDate, setSelectDayDate, setSelectSinceView, setSelectSinceDate, setSelectSinceHour, setSelectSinceMinute, setSelectSinceMeridiem, setSelectSinceMonthOpen, selectBetweenStart, setSelectBetweenStart, selectBetweenEnd, setSelectBetweenEnd, selectSinceDate, selectSinceHour, selectSinceMinute, selectSinceMeridiem, selectSinceView, selectSinceMonthOpen, filePickerFilter, setFilePickerFilter, filePickerLoading, filePickerAvailable, filePickerAll, filePickerListRef, setFilePickerAtBottom, lastPickedIndexRef, filePickerHasMore, filePickerAtBottom, setFilePickerMonthWindow, ensureMonthWindowForSince, handleAddSelectedFiles, uiTheme
    };
    const appLayoutCtx = {
        shellClassName, isDev, arcbridgeLogoStyle, updateAvailable, updateDownloaded, updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason, view, settingsUpdateCheckRef, versionClickTimesRef, versionClickTimeoutRef, setDeveloperSettingsTrigger, appVersion, setView, showTerminal, setShowTerminal, devDatasetsEnabled, setDevDatasetsOpen, webUploadState, isModernTheme, setWebUploadState, statsViewMounted, logsForStats, mvpWeights, disruptionMethod, statsViewSettings, precomputedStats, computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, statsDataProgress, setStatsViewSettings, uiTheme, dashboardLayout, handleWebUpload, selectedWebhookId, setEmbedStatSettings, setMvpWeights, setDisruptionMethod, setUiTheme, setKineticFontStyle, setKineticThemeVariant, setDashboardLayout, setGithubWebTheme, developerSettingsTrigger, helpUpdatesFocusTrigger, handleHelpUpdatesFocusConsumed, setWalkthroughOpen, setWhatsNewOpen, statsTilesPanel, activityPanel, configurationPanel, screenshotData, embedStatSettings, showClassIcons, enabledTopListCount, devDatasetsCtx, filePickerCtx, webhookDropdownOpen, webhookDropdownStyle, webhookDropdownPortalRef, webhooks, handleUpdateSettings, setSelectedWebhookId, setWebhookDropdownOpen, webhookModalOpen, setWebhookModalOpen, setWebhooks, showUpdateErrorModal, setShowUpdateErrorModal, updateError, whatsNewOpen, handleWhatsNewClose, whatsNewVersion, whatsNewNotes, walkthroughOpen, handleWalkthroughClose, handleWalkthroughLearnMore
    };

    return <AppLayout ctx={appLayoutCtx} />;
}

export default App;
