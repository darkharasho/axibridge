import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParticleEffect, PRESETS, ParticleHover } from './particles';
import { useStatsStore, hashAggregationSettings } from './stats/statsStore';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, ChevronDown, Trash2, FilePlus2 } from 'lucide-react';
import { ExpandableLogCard } from './ExpandableLogCard';
import { useStatsAggregationWorker } from './stats/hooks/useStatsAggregationWorker';
import { AppLayout } from './app/AppLayout';
import { useLogsForStats } from './app/hooks/useLogsForStats';
import { useFilePicker } from './app/hooks/useFilePicker';
import { useWebUpload } from './app/hooks/useWebUpload';
import { useAppUpdater } from './app/hooks/useAppUpdater';
import { useDashboardStats } from './app/hooks/useDashboardStats';
import { useStatsDataProgress } from './app/hooks/useStatsDataProgress';
import { useSettings } from './app/hooks/useSettings';
import { useUploadRetryQueue } from './app/hooks/useUploadRetryQueue';
import { useAppNavigation } from './app/hooks/useAppNavigation';

import { useLogQueue } from './app/hooks/useLogQueue';
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
        embedStatSettings, setEmbedStatSettings,
        mvpWeights, setMvpWeights,
        statsViewSettings, setStatsViewSettings,
        disruptionMethod, setDisruptionMethod,
        allowLocalJson, setAllowLocalJson,
        r2PreciseReplay, setR2PreciseReplay,
        ollamaEnabled, setOllamaEnabled,
        ollamaModel, setOllamaModel,
        colorPalette, setColorPalette,
        glassSurfaces, setGlassSurfaces,
        particlesEnabled, setParticlesEnabled,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        handleUpdateSettings,
        handleSelectDirectory,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughSeen,
        eiAnnouncementDismissed, setEiAnnouncementDismissed,
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
        parserSettingsFocusTrigger,
        handleParserSettingsFocusConsumed,
        showEiBanner,
        handleEiBannerDismiss,
        handleEiBannerSetup,
        eiAutoManageStatus,
        eiAutoManageProgress,
    } = useAppNavigation({
        walkthroughSeen,
        eiAnnouncementDismissed,
        setEiAnnouncementDismissed,
        shouldOpenWhatsNew,
        whatsNewVersion,
        logsCount: logs.length,
    });

    // Persisted map of permalink → replayDataUrl, loaded from electron-store at startup.
    const r2ReplayUrlsRef = useRef<Record<string, string>>({});
    useEffect(() => {
        window.electronAPI?.getSettings?.().then((s) => {
            console.log('[App] r2ReplayUrls from store:', s?.r2ReplayUrls);
            if (!s?.r2ReplayUrls || typeof s.r2ReplayUrls !== 'object') return;
            r2ReplayUrlsRef.current = s.r2ReplayUrls;
            // Immediately inject into any logs already loaded.
            setLogsDeferred((currentLogs) => {
                const r2Map = s.r2ReplayUrls!;
                let changed = false;
                const next = currentLogs.map((l) => {
                    if (l.permalink && r2Map[l.permalink] && !l.replayDataUrl) {
                        changed = true;
                        return { ...l, replayDataUrl: r2Map[l.permalink] };
                    }
                    return l;
                });
                return changed ? next : currentLogs;
            });
        }).catch(() => {});
    }, [setLogsDeferred]);

    const { webUploadState, setWebUploadState, handleWebUpload, logEntries: webUploadLogEntries } = useWebUpload({
        onLogReplayUrl: useCallback((logPermalinks: string[], replayDataUrl: string) => {
            // 1. Persist to electron-store so it survives restarts.
            const entries: Record<string, string> = {};
            for (const p of logPermalinks) { if (p) entries[p] = replayDataUrl; }
            if (Object.keys(entries).length > 0) {
                r2ReplayUrlsRef.current = { ...r2ReplayUrlsRef.current, ...entries };
                window.electronAPI?.saveR2ReplayUrls?.(entries);
            }
            // 2. Inject into in-memory logs immediately.
            const pSet = new Set(logPermalinks);
            setLogsDeferred((currentLogs) => {
                let changed = false;
                const next = currentLogs.map((l) => {
                    if (l.permalink && pSet.has(l.permalink)) { changed = true; return { ...l, replayDataUrl }; }
                    return l;
                });
                return changed ? next : currentLogs;
            });
        }, [setLogsDeferred]),
    });
    const {
        logsForStats,
        setLogsForStats,
        logsRef,
    } = useLogsForStats({ logs });

    // When logs change (new logs added from watcher/file-picker), inject any persisted replayDataUrl.
    useEffect(() => {
        const r2Map = r2ReplayUrlsRef.current;
        if (!r2Map || Object.keys(r2Map).length === 0) return;
        setLogsDeferred((currentLogs) => {
            let changed = false;
            const next = currentLogs.map((l) => {
                if (l.permalink && r2Map[l.permalink] && !l.replayDataUrl) {
                    changed = true;
                    return { ...l, replayDataUrl: r2Map[l.permalink] };
                }
                return l;
            });
            return changed ? next : currentLogs;
        });
    }, [logs, setLogsDeferred]);

    const [bulkCalculatingActive, setBulkCalculatingActive] = useState(false);
    const detailsCacheRef = useRef<DetailsCache | null>(null);
    if (!detailsCacheRef.current) {
        detailsCacheRef.current = new DetailsCache({
            lruCapacity: 15,
            resolveDetails: () => null,
            fetchDetails: async (logId: string) => {
                const log = logsRef.current.find((l: any) => l.id === logId || l.filePath === logId);
                if (!log) return null;
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
        console.log('[DetailsCache] Sweeping expired IndexedDB entries (7-day TTL)...');
        detailsCacheRef.current.sweep(7 * 24 * 60 * 60 * 1000).then((n) => {
            console.log(`[DetailsCache] Sweep complete: ${n} expired entries removed`);
        });
    }
    // Write-through effect removed — hydration now writes directly to the DetailsCache
    const filePickerState = useFilePicker({
        logDirectory,
        setLogs,
        setBulkUploadMode,
        bulkUploadExpectedRef,
        bulkUploadCompletedRef,
        allowLocalJson,
    });

    // Persistence removed

    // Diagnostics: report renderer errors and respond to memory probes from main
    useEffect(() => {
        const onError = (event: ErrorEvent) => {
            window.electronAPI?.reportRendererError?.({
                source: 'window.onerror',
                message: event.message,
                stack: event.error?.stack,
            });
        };
        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            window.electronAPI?.reportRendererError?.({
                source: 'unhandledrejection',
                message: reason instanceof Error ? reason.message : String(reason),
                stack: reason instanceof Error ? reason.stack : undefined,
            });
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onUnhandledRejection);

        const cleanupDiag = window.electronAPI?.onRequestRendererDiagnostics?.(() => {
            const perf = (performance as any);
            const memInfo = perf.memory ? {
                heapUsed: perf.memory.usedJSHeapSize,
                heapTotal: perf.memory.totalJSHeapSize,
                heapLimit: perf.memory.jsHeapSizeLimit,
            } : { heapUsed: 0, heapTotal: 0, heapLimit: 0 };
            window.electronAPI?.sendRendererDiagnostics?.({
                ...memInfo,
                logCount: logsRef.current.length,
            });
        });

        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
            cleanupDiag?.();
        };
    }, []);

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
        detailsCache: detailsCacheRef.current,
        preciseReplay: r2PreciseReplay,
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
        // Don't mark logs as success while aggregation is still actively computing
        if (aggregationProgress?.active && (aggregationProgress.phase === 'streaming' || aggregationProgress.phase === 'computing')) {
            return;
        }
        setLogsDeferred((currentLogs) => {
            let changed = false;
            const next = currentLogs.map<ILogData>((log) => {
                if (log.status === 'calculating') {
                    // Only promote if details are in cache (worker used them)
                    // or details will never arrive.
                    const hasDetails = Boolean(detailsCacheRef.current?.peek(log.id));
                    const ds = log.detailsStatus || 'idle';
                    const detailsWontArrive = ds === 'exhausted' || ds === 'unavailable';
                    if (!hasDetails && !detailsWontArrive) {
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
    }, [computeTick, lastComputedLogCount, lastComputedToken, activeToken, lastComputedAt, lastComputedFlushId, logsForStats.length, setLogsDeferred, aggregationProgress]);

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
        // Per-log promotion: promote calculating → success based on aggregation state.
        // - streaming: promote first N logs (N = aggregationProgress.streamed)
        // - settled: promote all remaining (worker finished)
        // - idle/computing: don't promote (worker not started or finalizing)
        if (!logs.some((log) => log.status === 'calculating')) {
            return;
        }
        const phase = aggregationProgress?.phase;
        const isActive = aggregationProgress?.active;
        const streamed = Math.max(0, Number(aggregationProgress?.streamed || 0));

        if (phase === 'idle' || (isActive && phase === 'computing')) {
            // idle: worker hasn't started yet — don't promote
            // computing: finalize running — wait for settled
            return;
        }

        if (isActive && phase === 'streaming') {
            if (streamed === 0) return;
            // Build set of log identifiers that the worker has ingested
            // (first `streamed` entries in logsForStats order)
            const ingestedIds = new Set<string>();
            for (let i = 0; i < Math.min(streamed, logsForStats.length); i++) {
                const log = logsForStats[i];
                const id = String(log?.filePath || log?.id || '');
                if (id) ingestedIds.add(id);
            }
            if (ingestedIds.size === 0) return;

            setLogsDeferred((currentLogs) => {
                let changed = false;
                const next = currentLogs.map((entry) => {
                    if (entry.status !== 'calculating') return entry;
                    const id = String(entry?.filePath || entry?.id || '');
                    if (!id || !ingestedIds.has(id)) return entry;
                    // Only promote if details were available for the worker to use
                    const hasDetails = Boolean(detailsCacheRef.current?.peek(entry.id));
                    const ds = entry.detailsStatus || 'idle';
                    const detailsWontArrive = ds === 'exhausted' || ds === 'unavailable';
                    if (!hasDetails && !detailsWontArrive) return entry;
                    changed = true;
                    return { ...entry, status: 'success' as const };
                });
                return changed ? next : currentLogs;
            });
        } else if (phase === 'settled') {
            // Worker finished — promote only logs whose details are available
            setLogsDeferred((currentLogs) => {
                let changed = false;
                const next = currentLogs.map((entry) => {
                    if (entry.status !== 'calculating') return entry;
                    const hasDetails = Boolean(detailsCacheRef.current?.peek(entry.id));
                    const ds = entry.detailsStatus || 'idle';
                    const detailsWontArrive = ds === 'exhausted' || ds === 'unavailable';
                    if (!hasDetails && !detailsWontArrive) return entry;
                    changed = true;
                    return { ...entry, status: 'success' as const };
                });
                return changed ? next : currentLogs;
            });
        }
    }, [logs, setLogsDeferred, aggregationProgress, logsForStats]);

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

    const { emitterNode: bulkCompleteEmitter, trigger: triggerBulkComplete } = useParticleEffect();

    const prevBulkModeRef = useRef(bulkUploadMode);
    useEffect(() => {
        if (prevBulkModeRef.current && !bulkUploadMode && particlesEnabled) {
            triggerBulkComplete(PRESETS.bulkUploadComplete);
        }
        prevBulkModeRef.current = bulkUploadMode;
    }, [bulkUploadMode, triggerBulkComplete]);

    useEffect(() => {
        if (bulkUploadMode) return;
        const hasPendingDetailsHydration = logs.some((log) => {
            const ds = log.detailsStatus || 'idle';
            if (detailsCacheRef.current?.peek(log.id) || ds === 'loaded') return false;
            if (ds === 'exhausted' || ds === 'unavailable') return false;
            if (ds === 'available') return true;
            const status = log.status || 'queued';
            return (status === 'success' || status === 'calculating' || status === 'discord') && Boolean(log.permalink);
        });
        if (!hasPendingDetailsHydration) return;
        scheduleDetailsHydration(true);
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
        // Mark that we're awaiting the worker to catch up with the full log set.
        bulkStatsAwaitingRef.current = true;
        // Publish logsForStats synchronously so the worker begins streaming in the
        // same React batch as bulkUploadMode=false.
        setLogsForStats((prev) => {
            const source = prev === logsRef.current ? [...logsRef.current] : logsRef.current;
            return stripDetailsFromEntries(source);
        });
        const flushId = requestFlush?.();
        if (flushId) {
            bulkFlushIdRef.current = flushId;
        }
        // Single hydration pass — the isBulkUploadActive transition effect
        // will schedule another if needed.
        const hydrationDelay = viewRef.current === 'stats' ? 0 : 180;
        window.setTimeout(() => scheduleDetailsHydration(true), hydrationDelay);
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

    // Pre-warm: populate LRU + IDB so details survive LRU eviction on large sessions.
    // Also mark the log as loaded so useLogsForStats re-triggers aggregation after
    // prewarm data arrives (without this, the worker would settle with partial replays
    // if EI JSON fetches were still in flight when endBulkUpload fired).
    useEffect(() => {
        const cache = detailsCacheRef.current;
        if (!cache || !window.electronAPI?.onDetailsPrewarm) return;
        const cleanup = window.electronAPI.onDetailsPrewarm((payload: any) => {
            if (payload?.details && (payload.logId || payload.filePath)) {
                const logId = payload.logId || payload.filePath;
                cache.putSync(logId, payload.details);
                setLogsDeferred((currentLogs) => {
                    const idx = currentLogs.findIndex(
                        (l) => (l.id && l.id === logId) || (l.filePath && l.filePath === logId)
                    );
                    if (idx < 0) return currentLogs;
                    const entry = currentLogs[idx];
                    if (entry.detailsStatus === 'loaded') return currentLogs;
                    const updated = [...currentLogs];
                    updated[idx] = { ...entry, detailsStatus: 'loaded' as const };
                    return updated;
                });
            }
        });
        return cleanup;
    }, [setLogsDeferred]);

    const appIconPath = `${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg`;
    const axibridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
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
                    <ParticleHover className="shrink-0 rounded-[4px]" disabled={!particlesEnabled}>
                        <button
                            onClick={handleSelectDirectory}
                            className="rounded-[4px] w-8 h-8 flex items-center justify-center border transition-colors"
                            style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--brand-primary)' }}
                            title="Browse..."
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                    </ParticleHover>
                </div>
            </div>

            {/* Status card */}
            <div className="rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Status</div>
                <div className="space-y-0">
                    <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Watcher</span>
                        <span className="text-[11px] font-medium" style={{ color: logDirectory ? 'var(--status-success)' : 'var(--text-muted)' }}>
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
                            <span style={{ color: 'var(--status-success)' }}>{successCount}</span>
                            <span style={{ color: 'var(--text-muted)' }}> / </span>
                            <span style={{ color: errorCount > 0 ? 'var(--status-error)' : 'var(--text-muted)' }}>{errorCount}</span>
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
                    <ParticleHover className="shrink-0 rounded-[4px]" disabled={!particlesEnabled}>
                        <button
                            onClick={() => setWebhookModalOpen(true)}
                            className="rounded-[4px] w-8 h-8 flex items-center justify-center gap-2 border transition-colors"
                            style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--brand-primary)' }}
                            title="Manage Webhooks"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                    </ParticleHover>
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
                            <span style={{ color: 'var(--status-success-muted)' }}>{winLoss.wins}</span>
                            <span style={{ color: 'var(--text-muted)' }}> / </span>
                            <span style={{ color: 'var(--status-error-muted)' }}>{winLoss.losses}</span>
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
                const droppedLogs = extractDroppedLogFiles(e.dataTransfer, { allowJson: allowLocalJson });
                const validFiles = droppedLogs.map((entry) => entry.filePath);
                const optimisticLogs: ILogData[] = droppedLogs.map(({ filePath, fileName }) => ({
                    id: fileName,
                    filePath,
                    status: 'queued',
                    fightName: fileName,
                    uploadTime: Date.now() / 1000,
                    permalink: '',
                    detailsStatus: 'idle' as const
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
                    <ParticleHover className="rounded-[4px]" disabled={!particlesEnabled}>
                        <button
                            onClick={() => filePickerState.setFilePickerOpen(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors"
                            style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
                            title="Select logs to upload"
                        >
                            <FilePlus2 className="w-3 h-3" />
                            Add Logs
                        </button>
                    </ParticleHover>
                    <ParticleHover className="rounded-[4px]" disabled={!particlesEnabled} color="#f87171">
                        <button
                            onClick={clearLogsFromActivity}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-colors"
                            style={{ borderColor: 'var(--status-error-border)', background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                            title="Clear all logs"
                        >
                            <Trash2 className="w-3 h-3" />
                            Clear Logs
                        </button>
                    </ParticleHover>
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
                                    particlesEnabled={particlesEnabled}
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
                            <>
                            <div style={{ position: 'relative', width: '100%', pointerEvents: 'none', zIndex: 10 }}>
                                {bulkCompleteEmitter}
                            </div>
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
                                        particlesEnabled={particlesEnabled}
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
                            </>
                        )}
                        {logListVirtualization.enabled && logListVirtualization.bottomSpacer > 0 && (
                            <div aria-hidden="true" style={{ height: `${logListVirtualization.bottomSpacer}px` }} />
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );

    const filePickerCtx = useMemo(() => ({
        ...filePickerState, logDirectory
    }), [filePickerState, logDirectory]);
    const appLayoutCtx = useMemo(() => ({
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded, updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason, view, settingsUpdateCheckRef, versionClickTimesRef, versionClickTimeoutRef, setDeveloperSettingsTrigger, appVersion, setView, showTerminal, setShowTerminal, webUploadState, setWebUploadState, webUploadLogEntries, logsForStats, mvpWeights, disruptionMethod, statsViewSettings, computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, statsDataProgress, setStatsViewSettings, colorPalette, setColorPalette, glassSurfaces, setGlassSurfaces, particlesEnabled, setParticlesEnabled, handleWebUpload, selectedWebhookId, setEmbedStatSettings, setMvpWeights, setDisruptionMethod, setAllowLocalJson, setR2PreciseReplay, ollamaEnabled, setOllamaEnabled, ollamaModel, setOllamaModel, developerSettingsTrigger, helpUpdatesFocusTrigger, handleHelpUpdatesFocusConsumed, parserSettingsFocusTrigger, handleParserSettingsFocusConsumed, showEiBanner, eiAutoManageStatus, eiAutoManageProgress, handleEiBannerDismiss, handleEiBannerSetup, setWalkthroughOpen, setWhatsNewOpen, activityPanel, configurationPanel, filePickerCtx, webhookDropdownOpen, webhookDropdownStyle, webhookDropdownPortalRef, webhooks, handleUpdateSettings, setSelectedWebhookId, setWebhookDropdownOpen, webhookModalOpen, setWebhookModalOpen, setWebhooks, showUpdateErrorModal, setShowUpdateErrorModal, updateError, whatsNewOpen, handleWhatsNewClose, whatsNewVersion, whatsNewNotes, walkthroughOpen, handleWalkthroughClose, handleWalkthroughLearnMore, isBulkUploadActive
    }), [
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded,
        updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason,
        view, appVersion, showTerminal, webUploadState, webUploadLogEntries,
        logsForStats, mvpWeights, disruptionMethod, statsViewSettings,
        computedStats, computedSkillUsageData, aggregationProgress,
        aggregationDiagnostics, statsDataProgress, colorPalette, glassSurfaces, particlesEnabled,
        selectedWebhookId, developerSettingsTrigger, helpUpdatesFocusTrigger, parserSettingsFocusTrigger,
        showEiBanner, eiAutoManageStatus, eiAutoManageProgress,
        activityPanel, configurationPanel, filePickerCtx,
        webhookDropdownOpen, webhookDropdownStyle, webhooks, handleUpdateSettings,
        webhookModalOpen, showUpdateErrorModal, updateError, whatsNewOpen,
        whatsNewVersion, whatsNewNotes, walkthroughOpen, isBulkUploadActive,
        ollamaEnabled, ollamaModel,
        handleWebUpload, handleWhatsNewClose, handleWalkthroughClose,
        handleWalkthroughLearnMore, handleHelpUpdatesFocusConsumed, handleParserSettingsFocusConsumed,
        handleEiBannerDismiss, handleEiBannerSetup,
    ]);

    return (
        <DetailsCacheProvider cache={detailsCacheRef.current!}>
            <AppLayout ctx={appLayoutCtx} />
        </DetailsCacheProvider>
    );
}

export default App;
