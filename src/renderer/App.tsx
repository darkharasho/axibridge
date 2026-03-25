import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStatsStore, hashAggregationSettings } from './stats/statsStore';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, ChevronDown, Trash2, FilePlus2 } from 'lucide-react';
import { ExpandableLogCard } from './ExpandableLogCard';
import { useStatsAggregationWorker } from './stats/hooks/useStatsAggregationWorker';
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
import { normalizeQueuedLogStatus, useLogQueue } from './app/hooks/useLogQueue';
import { useDetailsHydration } from './app/hooks/useDetailsHydration';
import { useUploadListeners } from './app/hooks/useUploadListeners';
import { extractDroppedLogFiles } from './app/utils/droppedFiles';
import { DetailsCache } from './cache/DetailsCache';
import { DetailsCacheProvider } from './cache/DetailsCacheContext';

/** Strip details from log entries — logsForStats is metadata-only. */
const stripDetailsFromEntries = (entries: ILogData[]): ILogData[] =>
    entries.some(e => e.details)
        ? entries.map(e => e.details ? { ...e, details: undefined } : e)
        : entries;

function App() {
    const [logs, setLogs] = useState<ILogData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const canceledLogsRef = useRef<Set<string>>(new Set());
    const [bulkUploadMode, setBulkUploadMode] = useState(false);
    const bulkUploadModeRef = useRef(bulkUploadMode);

    const { setLogsDeferred, queueLogUpdate, pendingLogUpdatesRef, pendingLogFlushTimerRef } = useLogQueue(setLogs, bulkUploadModeRef);

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
        colorPalette, setColorPalette,
        glassSurfaces, setGlassSurfaces,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        shouldOpenWhatsNew,
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

    const { webUploadState, setWebUploadState, handleWebUpload } = useWebUpload();
    const devDatasetsState = useDevDatasets({
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
        setColorPalette,
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
        applyDevDatasetSnapshot,
        loadDevDatasets
    } = devDatasetsState;
    const detailsCacheRef = useRef<DetailsCache | null>(null);
    if (!detailsCacheRef.current) {
        detailsCacheRef.current = new DetailsCache({
            lruCapacity: 100,
            resolveDetails: (logId: string) => {
                const log = logsRef.current.find((l: any) => l.id === logId || l.filePath === logId);
                return log?.details ?? null;
            },
            fetchDetails: async (logId: string) => {
                const log = logsRef.current.find((l: any) => l.id === logId || l.filePath === logId);
                if (!log) return null;
                // Fast path: details still in logs state (stripped from logsForStats only)
                if (log.details) return log.details;
                try {
                    const result = await window.electronAPI.getLogDetails({
                        filePath: log.filePath,
                        permalink: log.permalink,
                    });
                    return result?.success ? result.details ?? null : null;
                } catch {
                    return null;
                }
            },
        });
    }
    // Write-through effect removed — hydration now writes directly to the DetailsCache
    const filePickerState = useFilePicker({
        logDirectory,
        setLogs,
        setBulkUploadMode,
        bulkUploadExpectedRef,
        bulkUploadCompletedRef
    });

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
        precomputedStats: precomputedStats || undefined,
        detailsCache: detailsCacheRef.current
    });
    const { stats: computedStats, skillUsageData: computedSkillUsageData } = aggregationResult;

    // Sync aggregation results to zustand store
    useEffect(() => {
        const store = useStatsStore.getState();
        if (computedStats) {
            const inputsHash = hashAggregationSettings(mvpWeights, statsViewSettings, disruptionMethod)
                + ':logs' + logsForStats.length;
            store.setResult(
                { stats: computedStats, skillUsageData: computedSkillUsageData },
                inputsHash,
            );
        }
        store.setProgress(aggregationProgress);
        store.setDiagnostics(aggregationDiagnostics ?? null);
    }, [computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, mvpWeights, statsViewSettings, disruptionMethod, logsForStats.length]);

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
                    if (log.detailsAvailable && !detailsCacheRef.current?.peek(log.id) && !log.statsDetailsLoaded) {
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

    const { fetchLogDetails, scheduleDetailsHydration } = useDetailsHydration({
        viewRef,
        logsRef,
        setLogs,
        setLogsDeferred,
        setLogsForStats,
        detailsCache: detailsCacheRef.current,
    });

    const selectedWebhook = useMemo(
        () => webhooks.find((hook) => hook.id === selectedWebhookId) || null,
        [webhooks, selectedWebhookId]
    );
    const pendingStatsRemovalIdsRef = useRef<Set<string>>(new Set());
    const pendingStatsClearRef = useRef(false);
    const pendingStatsRemovalTimerRef = useRef<number | null>(null);

    const isBulkUploadActive = useMemo(
        () => bulkUploadMode || logs.some((log) => log.status === 'queued' || log.status === 'pending' || log.status === 'uploading' || log.status === 'retrying' || log.status === 'calculating'),
        [bulkUploadMode, logs]
    );
    const bulkUploadActiveRef = useRef(isBulkUploadActive);

    const calculatingCount = logs.filter((log) => log.status === 'calculating').length;

    useEffect(() => {
        if (!logs.some((log) => log.status === 'calculating')) {
            return;
        }
        setLogsDeferred((currentLogs) => {
            let changed = false;
            const next = currentLogs.map((entry) => {
                if (entry.status !== 'calculating') return entry;
                const normalized = normalizeQueuedLogStatus(entry);
                if (normalized.status === entry.status) return entry;
                changed = true;
                return normalized;
            });
            return changed ? next : currentLogs;
        });
    }, [logs, setLogsDeferred]);

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
            if (detailsCacheRef.current?.peek(log.id) || log.statsDetailsLoaded) return false;
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

    const logListVirtualization = useMemo(() => {
        const rowHeight = 132;
        const overscan = 6;
        const canVirtualize = logs.length > 30 && !expandedLogId;
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
    }, [logs, logsViewportHeight, logsScrollTop, expandedLogId]);

    const endBulkUpload = useCallback(() => {
        bulkUploadExpectedRef.current = null;
        bulkUploadCompletedRef.current = 0;
        setBulkUploadMode(false);
        const kickOffStatsCompute = (delayMs = 0) => {
            window.setTimeout(() => {
                bulkStatsAwaitingRef.current = true;
                setLogsForStats((prev) => {
                    const source = prev === logsRef.current ? [...logsRef.current] : logsRef.current;
                    return stripDetailsFromEntries(source);
                });
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

    const flushPendingStatsRemovals = useCallback(() => {
        pendingStatsRemovalTimerRef.current = null;
        if (pendingStatsClearRef.current) {
            pendingStatsClearRef.current = false;
            pendingStatsRemovalIdsRef.current.clear();
            setLogsForStats([]);
            requestFlush?.();
            return;
        }
        if (pendingStatsRemovalIdsRef.current.size === 0) return;
        const pendingIds = new Set(pendingStatsRemovalIdsRef.current);
        pendingStatsRemovalIdsRef.current.clear();
        setLogsForStats((currentLogs) => currentLogs.filter((entry) => !pendingIds.has(String(entry.filePath || entry.id || ''))));
        requestFlush?.();
    }, [requestFlush, setLogsForStats]);

    const scheduleAsyncStatsRecompute = useCallback(() => {
        if (pendingStatsRemovalTimerRef.current !== null) return;
        pendingStatsRemovalTimerRef.current = window.setTimeout(() => {
            flushPendingStatsRemovals();
        }, 140);
    }, [flushPendingStatsRemovals]);

    useEffect(() => {
        return () => {
            if (pendingStatsRemovalTimerRef.current !== null) {
                window.clearTimeout(pendingStatsRemovalTimerRef.current);
                pendingStatsRemovalTimerRef.current = null;
            }
        };
    }, []);

    const removeLogFromActivity = useCallback((log: ILogData) => {
        const identity = String(log.filePath || log.id || '');
        if (!identity) return;
        if (log.filePath) {
            canceledLogsRef.current.add(log.filePath);
        }
        pendingLogUpdatesRef.current.delete(identity);
        setLogs((currentLogs) => currentLogs.filter((entry) => String(entry.filePath || entry.id || '') !== identity));
        pendingStatsRemovalIdsRef.current.add(identity);
        scheduleAsyncStatsRecompute();
        if (expandedLogId === log.filePath) {
            setExpandedLogId(null);
        }
    }, [expandedLogId, pendingLogUpdatesRef, scheduleAsyncStatsRecompute]);

    const clearLogsFromActivity = useCallback(() => {
        setLogs([]);
        setExpandedLogId(null);
        canceledLogsRef.current.clear();
        pendingLogUpdatesRef.current.clear();
        pendingStatsClearRef.current = true;
        pendingStatsRemovalIdsRef.current.clear();
        scheduleAsyncStatsRecompute();
    }, [pendingLogUpdatesRef, scheduleAsyncStatsRecompute]);

    // Dashboard stats (upload counts, pie chart, squad/enemy averages, win/loss)
    const { totalUploads, statusCounts, winLoss, squadKdr } = useDashboardStats(logs);

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
            const source = logsRef.current.length > 0 ? logsRef.current : logs;
            return stripDetailsFromEntries(source);
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

    useUploadListeners({
        queueLogUpdate,
        endBulkUpload,
        bulkUploadModeRef,
        canceledLogsRef,
        lastUploadCompleteAtRef,
        bulkUploadExpectedRef,
        bulkUploadCompletedRef,
        pendingLogFlushTimerRef,
        pendingLogUpdatesRef,
    });

    // Pre-warm: populate memory LRU only (no IndexedDB structured clone)
    useEffect(() => {
        const cache = detailsCacheRef.current;
        if (!cache || !window.electronAPI?.onDetailsPrewarm) return;
        const cleanup = window.electronAPI.onDetailsPrewarm((payload: any) => {
            if (payload?.details && (payload.logId || payload.filePath)) {
                cache.putMemoryOnly(payload.logId || payload.filePath, payload.details);
            }
        });
        return cleanup;
    }, []);

    const appIconPath = `${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg`;
    const arcbridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
    const isDev = import.meta.env.DEV;
    const shellClassName = 'app-shell h-screen w-screen text-white overflow-hidden flex flex-col';

    const successCount = statusCounts.success || 0;
    const errorCount = statusCounts.error || 0;
    const uploadingCount = (statusCounts.queued || 0)
        + (statusCounts.pending || 0)
        + (statusCounts.uploading || 0)
        + (statusCounts.retrying || 0)
        + (statusCounts.discord || 0)
        + (statusCounts.calculating || 0);

    const configurationPanel = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-3"
        >
            {/* Watch Folder card */}
            <div className="rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Watch Folder</div>
                <div className="flex gap-1 w-full max-w-full">
                    <div className="flex-1 min-w-0 rounded-[4px] border px-1.5 h-8 flex items-center gap-2 transition-colors" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)' }}>
                        <div className="pl-1 shrink-0">
                            <FolderOpen className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
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
                        className="shrink-0 rounded-[4px] w-8 h-8 flex items-center justify-center border transition-colors"
                        style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--brand-primary)' }}
                        title="Browse..."
                    >
                        <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Status card */}
            <div className="rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Status</div>
                <div className="space-y-0">
                    <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Watcher</span>
                        <span className="text-[11px] font-medium" style={{ color: logDirectory ? '#22c55e' : 'var(--text-muted)' }}>
                            {logDirectory ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Upload queue</span>
                        <span className="text-[11px] font-medium" style={{ color: uploadingCount > 0 ? 'var(--brand-primary)' : 'var(--text-muted)' }}>
                            {uploadingCount > 0 ? `${uploadingCount} pending` : 'Idle'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Success / Errors</span>
                        <span className="text-[11px] font-medium">
                            <span style={{ color: '#22c55e' }}>{successCount}</span>
                            <span style={{ color: 'var(--text-muted)' }}> / </span>
                            <span style={{ color: errorCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>{errorCount}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Discord Webhook card */}
            <div className="rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Discord Webhook</div>
                <div className="flex gap-1 w-full">
                    <div ref={webhookDropdownRef} className="relative flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => setWebhookDropdownOpen((prev) => !prev)}
                            ref={webhookDropdownButtonRef}
                            className="w-full rounded-[4px] border px-2.5 h-8 flex items-center justify-between gap-2 text-[11px] transition-colors"
                            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
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
                        className="shrink-0 rounded-[4px] w-8 h-8 flex items-center justify-center gap-2 border transition-colors"
                        style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--brand-primary)' }}
                        title="Manage Webhooks"
                    >
                        <Settings className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Session card */}
            <div className="rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Session</div>
                <div className="space-y-0">
                    <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Logs uploaded</span>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{totalUploads}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Win / Loss</span>
                        <span className="text-[11px] font-medium">
                            <span style={{ color: '#86efac' }}>{winLoss.wins}</span>
                            <span style={{ color: 'var(--text-muted)' }}> / </span>
                            <span style={{ color: '#fca5a5' }}>{winLoss.losses}</span>
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Squad KDR</span>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{squadKdr}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );

    const activityPanel = (
        <motion.div
            initial={{ opacity: 0, scale: 0.992 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.24, ease: 'easeOut' }}
            className={`rounded-[4px] border p-3 flex flex-col h-full transition-all duration-300 relative matte-activity-panel`}
            style={{ background: isDragging ? 'rgba(59,130,246,0.08)' : 'var(--bg-card)', borderColor: isDragging ? 'var(--brand-primary)' : 'var(--border-default)', borderRadius: '4px', boxShadow: 'var(--shadow-card)' } as React.CSSProperties}
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
                const droppedLogs = extractDroppedLogFiles(e.dataTransfer);
                const validFiles = droppedLogs.map((entry) => entry.filePath);
                const optimisticLogs: ILogData[] = droppedLogs.map(({ filePath, fileName }) => ({
                    id: fileName,
                    filePath,
                    status: 'queued',
                    fightName: fileName,
                    uploadTime: Date.now() / 1000,
                    permalink: ''
                }));

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
            <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <FileText className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    Recent Activity
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => filePickerState.setFilePickerOpen(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors"
                        style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
                        title="Select logs to upload"
                    >
                        <FilePlus2 className="w-3 h-3" />
                        Add Logs
                    </button>
                    <button
                        onClick={clearLogsFromActivity}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors"
                        style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171' }}
                        title="Clear all logs"
                    >
                        <Trash2 className="w-3 h-3" />
                        Clear Logs
                    </button>
                </div>
            </div>
            {bulkCalculatingActive && calculatingCount > 0 && (
                <div className="mb-3 rounded-[4px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Bulk calculations are running. The app may feel less responsive until they finish.
                </div>
            )}
            {(uploadRetryQueue.failed > 0 || uploadRetryQueue.retrying > 0 || uploadRetryQueue.entries.length > 0) && (
                <div className="mb-3 rounded-[4px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
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
                <div className="mb-3 rounded-[4px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
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
                        {isBulkUploadActive ? (
                            logListVirtualization.visibleLogs.map((log) => (
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
                                    layoutEnabled={false}
                                    motionEnabled={false}
                                    onCancel={() => {
                                        removeLogFromActivity(log);
                                    }}
                                    onRemove={() => removeLogFromActivity(log)}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={true}
                                />
                            ))
                        ) : (
                            <AnimatePresence initial={false}>
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
                                            removeLogFromActivity(log);
                                        }}
                                        onRemove={() => removeLogFromActivity(log)}
                                        embedStatSettings={embedStatSettings}
                                        disruptionMethod={disruptionMethod}
                                        useClassIcons={true}
                                    />
                                ))}
                            </AnimatePresence>
                        )}
                        {logListVirtualization.enabled && logListVirtualization.bottomSpacer > 0 && (
                            <div aria-hidden="true" style={{ height: `${logListVirtualization.bottomSpacer}px` }} />
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );

    const devDatasetsCtx = {
        devDatasetsEnabled, devDatasetsOpen, loadDevDatasets, devDatasetRefreshing, setDevDatasetsOpen, devDatasetName, setDevDatasetName, devDatasetSaving, setDevDatasetSaving, devDatasetSavingIdRef, setDevDatasetSaveProgress, computedStats, computedSkillUsageData, appVersion, view, expandedLogId, notificationType, embedStatSettings, mvpWeights, statsViewSettings, disruptionMethod, colorPalette, selectedWebhookId, bulkUploadMode, logs, setDevDatasets, setDevDatasetLoadModes, devDatasetSaveProgress, devDatasets, devDatasetLoadModes, setDevDatasetLoadingId, setDevDatasetLoadProgress, setLogs, setLogsForStats, logsRef, setPrecomputedStats, canceledLogsRef, datasetLoadRef, devDatasetStreamingIdRef, applyDevDatasetSnapshot, setDevDatasetDeleteConfirmId, devDatasetDeleteConfirmId, devDatasetLoadingId
    };
    const filePickerCtx = {
        ...filePickerState, logDirectory
    };
    const appLayoutCtx = {
        shellClassName, isDev, arcbridgeLogoStyle, updateAvailable, updateDownloaded, updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason, view, settingsUpdateCheckRef, versionClickTimesRef, versionClickTimeoutRef, setDeveloperSettingsTrigger, appVersion, setView, showTerminal, setShowTerminal, devDatasetsEnabled, setDevDatasetsOpen, webUploadState, setWebUploadState, logsForStats, mvpWeights, disruptionMethod, statsViewSettings, precomputedStats, computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, statsDataProgress, setStatsViewSettings, colorPalette, setColorPalette, glassSurfaces, setGlassSurfaces, handleWebUpload, selectedWebhookId, setEmbedStatSettings, setMvpWeights, setDisruptionMethod, developerSettingsTrigger, helpUpdatesFocusTrigger, handleHelpUpdatesFocusConsumed, setWalkthroughOpen, setWhatsNewOpen, activityPanel, configurationPanel, devDatasetsCtx, filePickerCtx, webhookDropdownOpen, webhookDropdownStyle, webhookDropdownPortalRef, webhooks, handleUpdateSettings, setSelectedWebhookId, setWebhookDropdownOpen, webhookModalOpen, setWebhookModalOpen, setWebhooks, showUpdateErrorModal, setShowUpdateErrorModal, updateError, whatsNewOpen, handleWhatsNewClose, whatsNewVersion, whatsNewNotes, walkthroughOpen, handleWalkthroughClose, handleWalkthroughLearnMore, isBulkUploadActive
    };

    return (
        <DetailsCacheProvider cache={detailsCacheRef.current!}>
            <AppLayout ctx={appLayoutCtx} />
        </DetailsCacheProvider>
    );
}

export default App;
