import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParticleEffect, PRESETS, ParticleHover } from './particles';
import { useStatsStore, hashAggregationSettings } from './stats/statsStore';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, ChevronDown, Trash2, FilePlus2, Clipboard, Check, AlertTriangle, Zap } from 'lucide-react';
import { ExpandableLogCard } from './ExpandableLogCard';
import { useStatsAggregationWorker } from './stats/hooks/useStatsAggregationWorker';
import { AppLayout } from './app/AppLayout';
import { ProcessingStrip } from './app/ProcessingStrip';
import { selectSlicedLogs, computeIngestedIds, hasIngestedAllSlicedLogs } from './app/selectSlicedLogs';
import { useLogsForStats } from './app/hooks/useLogsForStats';
import { useFilePicker } from './app/hooks/useFilePicker';
import { useWebUpload } from './app/hooks/useWebUpload';
import { useAppUpdater } from './app/hooks/useAppUpdater';
import { useDashboardStats } from './app/hooks/useDashboardStats';
import { useStatsDataProgress } from './app/hooks/useStatsDataProgress';
import { useSettings } from './app/hooks/useSettings';
import { useParserSettings } from './app/hooks/useParserSettings';
import type { IStatsViewSettings } from './global.d';
import { QuickSettingsCard } from './app/QuickSettingsCard';
import { useUploadRetryQueue } from './app/hooks/useUploadRetryQueue';
import { useAppNavigation } from './app/hooks/useAppNavigation';

import { canPromoteCalculatingLog, useLogQueue } from './app/hooks/useLogQueue';
import { hasPendingDetailsHydration, useDetailsHydration } from './app/hooks/useDetailsHydration';
import { useUploadListeners } from './app/hooks/useUploadListeners';
import { useSectorOwners } from './app/hooks/useSectorOwners';
import { extractDroppedLogFiles } from './app/utils/droppedFiles';
import { shareIdentity } from '../shared/shareIdentity';
import { DetailsCache } from './cache/DetailsCache';
import { DetailsCacheProvider } from './cache/DetailsCacheContext';
import { resolveWebhookSaveIntent, reconcileEnabledWebhookIds, toggleEnabledWebhookId, summarizeEnabledDestinations, enabledDestinationsNeedingRelink, describeRelinkWarning } from './app/webhookSaveIntent';
import type { Webhook } from './WebhookModal';
import { CrashRecoveryBanner, type CrashRecoveryNotice } from './app/CrashRecoveryBanner';
import { toCrashSnapshot, restoreFromCrashSnapshot } from './app/crashRecovery';

/** Strip details from log entries — logsForStats is metadata-only. */
const stripDetailsFromEntries = (entries: ILogData[]): ILogData[] =>
    entries.some(e => e.details)
        ? entries.map(e => e.details ? { ...e, details: undefined } : e)
        : entries;

function App() {
    const [logs, setLogs] = useState<ILogData[]>([]);
    /** Set when this renderer replaced one that died; drives the recovery notice. */
    const [crashNotice, setCrashNotice] = useState<CrashRecoveryNotice | null>(null);
    /** Holds aggregation off restored logs until the user asks for it. */
    const [statsPausedAfterCrash, setStatsPausedAfterCrash] = useState(false);
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
        r2HostingEnabled, setR2HostingEnabled,
        r2SliceEnabled, setR2SliceEnabled,
        colorPalette, setColorPalette,
        glassSurfaces, setGlassSurfaces,
        glassmorphic, setGlassmorphic,
        axiDesign, setAxiDesign,
        particlesEnabled, setParticlesEnabled,
        webhooks, setWebhooks,
        selectedWebhookId, setSelectedWebhookId,
        enabledWebhookIds, setEnabledWebhookIds,
        discordDestinationStatus, setDiscordDestinationStatus,
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

    // EI parser settings — backs the dashboard Quick Settings card.
    const { parserSettings, setParserSettings, setParserSetting } = useParserSettings();

    // Quick Settings writes must persist immediately (SettingsView batches its
    // stats-view edits behind a Save button; a dashboard toggle cannot).
    const setQuickStatsViewSettings = useCallback((next: IStatsViewSettings) => {
        setStatsViewSettings(next);
        handleUpdateSettings({ statsViewSettings: next });
    }, [setStatsViewSettings, handleUpdateSettings]);

    // Whether R2 credentials exist at all. Only the main process knows — the
    // renderer never sees the secret half — so it is asked once at mount and
    // again whenever Settings saves.
    const [r2CredentialsPresent, setR2CredentialsPresent] = useState<boolean | null>(null);
    const refreshR2Status = useCallback(() => {
        window.electronAPI?.isR2Configured?.()
            .then((status) => setR2CredentialsPresent(Boolean(status?.credentialsPresent)))
            .catch(() => setR2CredentialsPresent(false));
    }, []);
    useEffect(() => { refreshR2Status(); }, [refreshR2Status]);

    const setQuickR2HostingEnabled = useCallback((value: boolean) => {
        setR2HostingEnabled(value);
        handleUpdateSettings({ r2HostingEnabled: value });
    }, [setR2HostingEnabled, handleUpdateSettings]);

    const setQuickR2SliceEnabled = useCallback((value: boolean) => {
        setR2SliceEnabled(value);
        handleUpdateSettings({ r2SliceEnabled: value });
    }, [setR2SliceEnabled, handleUpdateSettings]);

    const quickSettingsContext = useMemo(() => ({
        parserSettings,
        setParserSetting,
        statsViewSettings,
        setStatsViewSettings: setQuickStatsViewSettings,
        r2Hosting: r2CredentialsPresent === null
            ? null
            : {
                credentialsPresent: r2CredentialsPresent,
                replayEnabled: r2HostingEnabled,
                sliceEnabled: r2SliceEnabled,
            },
        setR2ReplayEnabled: setQuickR2HostingEnabled,
        setR2SliceEnabled: setQuickR2SliceEnabled,
    }), [parserSettings, setParserSetting, statsViewSettings, setQuickStatsViewSettings, r2CredentialsPresent, r2HostingEnabled, r2SliceEnabled, setQuickR2HostingEnabled, setQuickR2SliceEnabled]);

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
        howToTrigger,
        handleHowToConsumed,
    } = useAppNavigation({
        walkthroughSeen,
        shouldOpenWhatsNew,
        whatsNewVersion,
        logsCount: logs.length,
    });

    // Persisted map of report link → replayDataUrl, loaded from electron-store at
    // startup. Keyed by `shareIdentity`, because that is what `useStatsUploads`
    // sends as `logIds` when the publish reports its replay url back -- reading
    // it by `permalink` alone missed every share-era log, which has none.
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
                    const link = shareIdentity(l);
                    if (link && r2Map[link] && !l.replayDataUrl) {
                        changed = true;
                        return { ...l, replayDataUrl: r2Map[link] };
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
                    const link = shareIdentity(l);
                    if (link && pSet.has(link)) { changed = true; return { ...l, replayDataUrl }; }
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
    } = useLogsForStats({ logs, paused: statsPausedAfterCrash });

    // Claim the session a crashed renderer left behind. Main holds the slim log
    // list in memory across the reload it performs on `render-process-gone`, so
    // an OOM no longer looks like the list clearing itself. Consuming read —
    // main returns it once, so a later manual reload starts clean.
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const recovery = await window.electronAPI?.takeCrashRecovery?.();
                if (cancelled || !recovery) return;
                const restored = restoreFromCrashSnapshot(recovery.logs);
                // Pause before the list lands: publishing restored logs to
                // aggregation re-streams every one of them and can exhaust the
                // heap all over again. Both updates batch into one render, so the
                // publish effect never observes the logs unpaused.
                setStatsPausedAfterCrash(restored.length > 0);
                setLogs(restored);
                setCrashNotice({ reason: recovery.reason, logCount: restored.length });
            } catch {
                // No recovery available, or main is not offering one. A normal boot.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Keep main's in-memory copy current. Debounced because status churn during
    // bulk ingestion changes `logs` constantly and every push is a structured
    // clone across IPC — slim, but not free.
    const snapshotTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (!window.electronAPI?.rememberSessionLogs) return;
        if (snapshotTimerRef.current !== null) window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = window.setTimeout(() => {
            snapshotTimerRef.current = null;
            try {
                window.electronAPI?.rememberSessionLogs?.(toCrashSnapshot(logs));
            } catch { /* main gone; nothing to recover into anyway */ }
        }, 1000);
        return () => {
            if (snapshotTimerRef.current !== null) {
                window.clearTimeout(snapshotTimerRef.current);
                snapshotTimerRef.current = null;
            }
        };
    }, [logs]);

    const handleCrashRecompute = useCallback(() => {
        setStatsPausedAfterCrash(false);
        setCrashNotice(null);
    }, []);

    const handleCrashDismiss = useCallback(() => {
        setCrashNotice(null);
    }, []);

    const excludedFightKeys = useStatsStore((s) => s.excludedFightKeys);
    // The aggregation input, after the ephemeral fight slice. Filtering *after*
    // useLogsForStats deliberately bypasses that hook's 400ms/2500ms publish
    // debounce, so slice toggles respond immediately rather than waiting on
    // ingest churn.
    const slicedLogsForStats = useMemo(
        () => selectSlicedLogs(logsForStats, excludedFightKeys),
        [logsForStats, excludedFightKeys]
    );

    const resetFightSlicing = useStatsStore((s) => s.resetFightSlicing);
    useEffect(() => {
        if (logs.length === 0) resetFightSlicing();
    }, [logs.length, resetFightSlicing]);

    /**
     * An Axilog re-parse succeeded for these files. The healed details are
     * already in the DetailsCache, so all that is left is to stop the log rows
     * blaming the engine that is no longer responsible — and to hand the
     * aggregation a new `logsForStats` array, which is what makes the streaming
     * effect re-run and pick the fresh details up.
     */
    const handleLogsHealed = useCallback((filePaths: string[]) => {
        if (filePaths.length === 0) return;
        const healed = new Set(filePaths);
        // A healed log always gets a fresh object, even when nothing about it
        // changes: re-parse refills the DetailsCache, and only a new array
        // identity restarts the aggregation stream so it can read what it now
        // holds. A log healed out of the "details never arrived" state is
        // typically already parseSource 'axilog', so keying the rewrite on that
        // field alone would leave the stale totals on screen.
        const mark = (entry: ILogData): ILogData => (
            healed.has(String(entry.filePath || ''))
                ? { ...entry, parseSource: 'axilog' as const, detailsStatus: 'loaded' as const }
                : entry
        );
        setLogsDeferred((currentLogs) => currentLogs.map(mark));
        setLogsForStats((currentLogs) => currentLogs.map(mark));
    }, [setLogsDeferred, setLogsForStats]);

    // When logs change (new logs added from watcher/file-picker), inject any persisted replayDataUrl.
    useEffect(() => {
        const r2Map = r2ReplayUrlsRef.current;
        if (!r2Map || Object.keys(r2Map).length === 0) return;
        setLogsDeferred((currentLogs) => {
            let changed = false;
            const next = currentLogs.map((l) => {
                const link = shareIdentity(l);
                if (link && r2Map[link] && !l.replayDataUrl) {
                    changed = true;
                    return { ...l, replayDataUrl: r2Map[link] };
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
        axilogCoverage,
        requestFlush
    } = useStatsAggregationWorker({
        logs: slicedLogsForStats,
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
            const inputsHash = hashAggregationSettings(
                mvpWeights, statsViewSettings, disruptionMethod, excludedFightKeys
            ) + ':logs' + slicedLogsForStats.length;
            store.setResult(
                { stats: computedStats, skillUsageData: computedSkillUsageData },
                inputsHash,
            );
        }
        store.setProgress(aggregationProgress);
        store.setDiagnostics(aggregationDiagnostics ?? null);
    }, [computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, mvpWeights, statsViewSettings, disruptionMethod, slicedLogsForStats.length, excludedFightKeys]);

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
        // Compare against the array the worker was actually given. Using the
        // unsliced length here wedges this effect permanently whenever a slice
        // is active, and `calculating` logs never promote to `success`.
        if (!hasIngestedAllSlicedLogs(lastComputedLogCount, slicedLogsForStats.length)) {
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
                    // Only promote if details are locally available (worker can
                    // read them) or will never arrive.
                    if (!canPromoteCalculatingLog(log, detailsCacheRef.current)) {
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
    }, [computeTick, lastComputedLogCount, lastComputedToken, activeToken, lastComputedAt, lastComputedFlushId, slicedLogsForStats.length, setLogsDeferred, aggregationProgress]);

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
    // Task 11 / Ruling U: the header dropdown's "Disabled" row calls
    // `handleSetDestinationEnabled` once per currently-enabled id,
    // synchronously, in a single onClick. React does not re-render between
    // those calls, so a version of this callback that reads `enabledWebhookIds`
    // from its own closure recomputes every call from the SAME stale array —
    // each call overwrites the previous one's result and only the last id is
    // ever actually removed. A ref kept in sync with the state lets
    // consecutive synchronous calls compose correctly.
    const enabledWebhookIdsRef = useRef(enabledWebhookIds);
    useEffect(() => {
        enabledWebhookIdsRef.current = enabledWebhookIds;
    }, [enabledWebhookIds]);

    const handleSetDestinationEnabled = useCallback((id: string, enabled: boolean) => {
        // See `toggleEnabledWebhookId` (webhookSaveIntent.ts) for the logic.
        const next = toggleEnabledWebhookId(enabledWebhookIdsRef.current, id, enabled);
        enabledWebhookIdsRef.current = next;
        setEnabledWebhookIds(next);
        // `selectedWebhookId` travels with the save: settingsHandlers still
        // returns it and the export/import list still reads it, so it mirrors
        // the first enabled id rather than going stale.
        handleUpdateSettings({ enabledWebhookIds: next, selectedWebhookId: next[0] ?? null });
        setSelectedWebhookId(next[0] ?? null);
    }, [handleUpdateSettings, setEnabledWebhookIds, setSelectedWebhookId]);

    const handleSaveWebhooks = useCallback((nextWebhooks: Webhook[], selectId?: string) => {
        const intent = resolveWebhookSaveIntent(selectedWebhookId, nextWebhooks, selectId);
        setWebhooks(intent.webhooks);
        // See `reconcileEnabledWebhookIds` (webhookSaveIntent.ts) for the logic.
        // Read/write `enabledWebhookIdsRef` alongside the state, symmetrically
        // with `handleSetDestinationEnabled` above — see its comment for why a
        // closure read cannot compose across synchronous calls in one tick.
        const nextEnabled = reconcileEnabledWebhookIds(enabledWebhookIdsRef.current, nextWebhooks, selectId);
        enabledWebhookIdsRef.current = nextEnabled;
        setEnabledWebhookIds(nextEnabled);
        if (intent.selectedWebhookId !== undefined) setSelectedWebhookId(intent.selectedWebhookId);
        handleUpdateSettings({ ...intent, enabledWebhookIds: nextEnabled });
    }, [selectedWebhookId, handleUpdateSettings, setWebhooks, setEnabledWebhookIds, setSelectedWebhookId]);
    // A revoked bridge token clears `token` but leaves the entry (and its
    // enabled flag) in place, so a `discordDestinationStatus` banner is the only
    // signal a live send failed -- and that state is renderer-only, so it is
    // gone after a restart while the row still looks healthy and every report
    // is silently dropped. Derive "needs re-link" purely from the persisted
    // webhook entries so it survives a restart with no in-memory status, and
    // from EVERY enabled destination rather than the first one -- see
    // `enabledDestinationsNeedingRelink` (webhookSaveIntent.ts) for the
    // order-dependence bug that caused.
    const destinationsNeedingRelink = useMemo(
        () => enabledDestinationsNeedingRelink(webhooks, enabledWebhookIds),
        [webhooks, enabledWebhookIds]
    );
    const relinkWarning = describeRelinkWarning(destinationsNeedingRelink, enabledWebhookIds.length);
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
            // Build the set of log identifiers the worker has ingested so far.
            // Must walk the *sliced* array — `streamed` is the worker's own
            // ingest counter over whatever array it was actually given, so
            // indexing the unsliced `logsForStats` here would promote logs the
            // worker never saw and strand genuinely ingested ones in `calculating`.
            const ingestedIds = computeIngestedIds(slicedLogsForStats, streamed);
            if (ingestedIds.size === 0) return;

            setLogsDeferred((currentLogs) => {
                let changed = false;
                const next = currentLogs.map((entry) => {
                    if (entry.status !== 'calculating') return entry;
                    const id = String(entry?.filePath || entry?.id || '');
                    if (!id || !ingestedIds.has(id)) return entry;
                    // Only promote if details were available for the worker to use
                    if (!canPromoteCalculatingLog(entry, detailsCacheRef.current)) return entry;
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
                    if (!canPromoteCalculatingLog(entry, detailsCacheRef.current)) return entry;
                    changed = true;
                    return { ...entry, status: 'success' as const };
                });
                return changed ? next : currentLogs;
            });
        }
    }, [logs, setLogsDeferred, aggregationProgress, slicedLogsForStats]);

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
        if (!hasPendingDetailsHydration(logs, detailsCacheRef.current)) return;
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
        if (!canVirtualize) {
            return {
                enabled: false,
                startIndex: 0,
                topSpacer: 0,
                bottomSpacer: 0,
                visibleLogs: logs
            };
        }
        // The height is measured in an effect, which is to say after the render
        // that needed it. Until the first measurement lands this was falling
        // back to "render every row" - so the first Add Logs after launch, when
        // the list has never been measured, mounted a card per file. That pass
        // is the freeze. A window-sized guess is wrong by a few rows at worst,
        // and the effect corrects it on the very next commit.
        const viewportHeight = logsViewportHeight > 0
            ? logsViewportHeight
            : (window.innerHeight || 900);
        const viewportRows = Math.max(1, Math.ceil(viewportHeight / rowHeight));
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

    // Zone-colour ownership snapshotting reads details via this LRU peek.
    const peekLogDetails = useCallback((log: ILogData) => {
        const cache = detailsCacheRef.current;
        if (!cache) return undefined;
        return (log.id ? cache.peek(log.id) : undefined) ?? (log.filePath ? cache.peek(log.filePath) : undefined);
    }, []);
    useSectorOwners(logs, setLogsDeferred, peekLogDetails);

    // Pre-warm: populate LRU + IDB so details survive LRU eviction on large sessions.
    // Also mark the log as loaded so useLogsForStats re-triggers aggregation after
    // prewarm data arrives (without this, the worker would settle with partial replays
    // if EI JSON fetches were still in flight when endBulkUpload fired).
    useEffect(() => {
        const cache = detailsCacheRef.current;
        if (!cache || !window.electronAPI?.onDetailsPrewarm) return;
        const cleanup = window.electronAPI.onDetailsPrewarm(async (payload: any) => {
            if (payload?.details && (payload.logId || payload.filePath)) {
                const logId = payload.logId || payload.filePath;
                // Await the outcome, not the write: 'loaded' means the worker
                // can read this back later, which only IndexedDB can promise.
                if (!await cache.putDurable(logId, undefined, payload.details)) return;
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

    const appIconPath = `${import.meta.env.BASE_URL || './'}svg/axibridge-glyph.svg`;
    const axibridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
    const isDev = import.meta.env.DEV;
    const [copyPathsFlash, setCopyPathsFlash] = useState(false);
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
            className="rail-stack flex flex-col gap-3"
        >
            {/* Watch Folder card */}
            <div className="rail-card rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="rail-card__label text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Watch Folder</div>
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
                            style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--button-label, var(--brand-primary))' }}
                            title="Browse..."
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                    </ParticleHover>
                </div>
            </div>

            {/* Status card */}
            <div className="rail-card rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="rail-card__label text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Status</div>
                <div className="space-y-0">
                    <div className="rail-row flex items-center justify-between py-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Watcher</span>
                        <span className="text-[11px] font-medium" style={{ color: logDirectory ? 'var(--status-success)' : 'var(--text-muted)' }}>
                            {logDirectory ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div className="rail-row flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Upload queue</span>
                        <span className="text-[11px] font-medium" style={{ color: uploadingCount > 0 ? 'var(--brand-primary)' : 'var(--text-muted)' }}>
                            {uploadingCount > 0 ? `${uploadingCount} pending` : 'Idle'}
                        </span>
                    </div>
                    <div className="rail-row flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
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
            <div className="rail-card rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="rail-card__label text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Discord Webhook</div>
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
                            <span className="truncate flex items-center gap-1.5">
                                {/* The amber warning renders whenever ANY enabled destination
                                    needs a re-link, however many are enabled: a revoked bridge
                                    silently drops reports and must never be invisible. The purple
                                    bolt is decorative, and with a count there is no single
                                    destination to badge, so it stays gated on exactly one. */}
                                {destinationsNeedingRelink.length > 0
                                    ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                    : enabledWebhookIds.length === 1 && selectedWebhook?.kind === 'bridge' && <Zap className="w-3.5 h-3.5 shrink-0 text-purple-300" />}
                                <span className="truncate">{summarizeEnabledDestinations(webhooks, enabledWebhookIds)}</span>
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${webhookDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                    <ParticleHover className="shrink-0 rounded-[4px]" disabled={!particlesEnabled}>
                        <button
                            onClick={() => setWebhookModalOpen(true)}
                            className="rounded-[4px] w-8 h-8 flex items-center justify-center gap-2 border transition-colors"
                            style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent-border)', color: 'var(--button-label, var(--brand-primary))' }}
                            title="Manage Webhooks"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                    </ParticleHover>
                </div>
                {relinkWarning && (
                    <div className="mt-2 flex items-start justify-between gap-2 rounded-[3px] border border-amber-400/25 bg-amber-400/5 px-2 py-1.5">
                        <p className="text-[11px] text-amber-300">{relinkWarning}</p>
                    </div>
                )}
                {discordDestinationStatus && (
                    <div className="mt-2 flex items-start justify-between gap-2 rounded-[3px] border border-rose-400/25 bg-rose-400/5 px-2 py-1.5">
                        <p className="text-[11px] text-rose-300">{discordDestinationStatus.message}</p>
                        <button
                            type="button"
                            onClick={() => setDiscordDestinationStatus(null)}
                            className="shrink-0 text-[10px] text-gray-500 hover:text-gray-300"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
            </div>

            {/* Session card */}
            <div className="rail-card rounded-[4px] border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <div className="rail-card__label text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Session</div>
                <div className="space-y-0">
                    <div className="rail-row flex items-center justify-between py-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Logs uploaded</span>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{totalUploads}</span>
                    </div>
                    <div className="rail-row flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Win / Loss</span>
                        <span className="text-[11px] font-medium">
                            <span style={{ color: 'var(--status-success-muted)' }}>{winLoss.wins}</span>
                            <span style={{ color: 'var(--text-muted)' }}> / </span>
                            <span style={{ color: 'var(--status-error-muted)' }}>{winLoss.losses}</span>
                        </span>
                    </div>
                    <div className="rail-row flex items-center justify-between py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Squad KDR</span>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{squadKdr}</span>
                    </div>
                </div>
            </div>

            {/* Quick Settings card */}
            <QuickSettingsCard context={quickSettingsContext} />
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
            <CrashRecoveryBanner
                notice={crashNotice}
                onRecompute={handleCrashRecompute}
                onDismiss={handleCrashDismiss}
            />
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
                            style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--button-label, var(--brand-primary))' }}
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
                            style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--status-error)' }}
                            title="Clear all logs"
                        >
                            <Trash2 className="w-3 h-3" />
                            Clear Logs
                        </button>
                    </ParticleHover>
                    {isDev && (
                        <button
                            onClick={() => {
                                const paths = logs.map(l => l.filePath).filter(Boolean).join('\n');
                                navigator.clipboard.writeText(paths).catch(() => {});
                                setCopyPathsFlash(true);
                                window.setTimeout(() => setCopyPathsFlash(false), 1400);
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-medium border transition-all duration-200 ${copyPathsFlash ? 'scale-105' : ''}`}
                            style={{
                                borderColor: copyPathsFlash ? 'rgba(74, 222, 128, 0.6)' : 'rgba(245, 158, 11, 0.5)',
                                background: copyPathsFlash ? 'rgba(74, 222, 128, 0.18)' : 'rgba(245, 158, 11, 0.15)',
                                color: copyPathsFlash ? '#86efac' : '#fcd34d',
                                boxShadow: copyPathsFlash ? '0 0 0 3px rgba(74, 222, 128, 0.18)' : 'none',
                            }}
                            title={`Copy ${logs.length} log file path${logs.length === 1 ? '' : 's'} to clipboard`}
                        >
                            {copyPathsFlash ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                            {copyPathsFlash ? 'Copied' : 'Copy Paths'}
                        </button>
                    )}
                </div>
            </div>
            {bulkCalculatingActive && calculatingCount > 0 && (
                <ProcessingStrip tone="warn" className="mb-3">
                    <span style={{ color: 'var(--text-primary)' }}>Bulk calculations are running.</span>
                    <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>
                        The app may feel less responsive until they finish.
                    </span>
                </ProcessingStrip>
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
                                    onShared={(patch) => queueLogUpdate({ id: log.id, filePath: log.filePath, ...patch } as ILogData)}
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
                                        onShared={(patch) => queueLogUpdate({ id: log.id, filePath: log.filePath, ...patch } as ILogData)}
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
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded, updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason, view, settingsUpdateCheckRef, versionClickTimesRef, versionClickTimeoutRef, setDeveloperSettingsTrigger, appVersion, setView, showTerminal, setShowTerminal, webUploadState, setWebUploadState, webUploadLogEntries, logsForStats, mvpWeights, disruptionMethod, statsViewSettings, computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, axilogCoverage, handleLogsHealed, statsDataProgress, setStatsViewSettings, colorPalette, setColorPalette, glassSurfaces, setGlassSurfaces, glassmorphic, setGlassmorphic, axiDesign, setAxiDesign, particlesEnabled, setParticlesEnabled, handleWebUpload, selectedWebhookId, setEmbedStatSettings, setMvpWeights, setDisruptionMethod, setAllowLocalJson, setR2PreciseReplay, setR2HostingEnabled, setR2SliceEnabled, refreshR2Status, setParserSettings, parserSettings, setParserSetting, developerSettingsTrigger, helpUpdatesFocusTrigger, handleHelpUpdatesFocusConsumed, parserSettingsFocusTrigger, handleParserSettingsFocusConsumed, setWalkthroughOpen, setWhatsNewOpen, activityPanel, configurationPanel, filePickerCtx, webhookDropdownOpen, webhookDropdownStyle, webhookDropdownPortalRef, webhooks, handleUpdateSettings, setSelectedWebhookId, setWebhookDropdownOpen, webhookModalOpen, setWebhookModalOpen, setWebhooks, showUpdateErrorModal, setShowUpdateErrorModal, updateError, whatsNewOpen, handleWhatsNewClose, whatsNewVersion, whatsNewNotes, walkthroughOpen, handleWalkthroughClose, handleWalkthroughLearnMore, howToTrigger, handleHowToConsumed, isBulkUploadActive, enabledWebhookIds, handleSetDestinationEnabled, handleSaveWebhooks, logDirectory, handleSelectDirectory
    }), [
        shellClassName, isDev, axibridgeLogoStyle, updateAvailable, updateDownloaded,
        updateProgress, updateStatus, autoUpdateSupported, autoUpdateDisabledReason,
        view, appVersion, showTerminal, webUploadState, webUploadLogEntries,
        logsForStats, mvpWeights, disruptionMethod, statsViewSettings,
        computedStats, computedSkillUsageData, aggregationProgress,
        aggregationDiagnostics, axilogCoverage, handleLogsHealed,
        statsDataProgress, colorPalette, glassSurfaces, glassmorphic, axiDesign, particlesEnabled,
        selectedWebhookId, developerSettingsTrigger, helpUpdatesFocusTrigger, parserSettingsFocusTrigger,
        parserSettings, setParserSetting,
        activityPanel, configurationPanel, filePickerCtx,
        webhookDropdownOpen, webhookDropdownStyle, webhooks, handleUpdateSettings,
        webhookModalOpen, showUpdateErrorModal, updateError, whatsNewOpen,
        whatsNewVersion, whatsNewNotes, walkthroughOpen, isBulkUploadActive,
        handleWebUpload, handleWhatsNewClose, handleWalkthroughClose,
        handleWalkthroughLearnMore, handleHelpUpdatesFocusConsumed, handleParserSettingsFocusConsumed,
        howToTrigger, handleHowToConsumed,
        enabledWebhookIds, handleSetDestinationEnabled, handleSaveWebhooks,
        logDirectory, handleSelectDirectory,
    ]);

    return (
        <DetailsCacheProvider cache={detailsCacheRef.current!}>
            <AppLayout ctx={appLayoutCtx} />
        </DetailsCacheProvider>
    );
}

export default App;
