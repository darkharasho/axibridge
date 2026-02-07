import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, Minus, Square, X, Image as ImageIcon, Layout, RefreshCw, Trophy, ChevronDown, ChevronLeft, ChevronRight, Grid3X3, LayoutGrid, Trash2, FilePlus2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ExpandableLogCard } from './ExpandableLogCard';
import { StatsView } from './StatsView';
import { useStatsAggregationWorker } from './stats/hooks/useStatsAggregationWorker';
import { SettingsView } from './SettingsView';
import { WebhookModal, Webhook } from './WebhookModal';
import { UpdateErrorModal } from './UpdateErrorModal';
import { Terminal } from './Terminal';
import { Terminal as TerminalIcon } from 'lucide-react';
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS, DEFAULT_WEB_UPLOAD_STATE, DisruptionMethod, IDevDatasetSnapshot, IEmbedStatSettings, IMvpWeights, IStatsViewSettings, IUploadRetryQueueState, IWebUploadState } from './global.d';
import { WhatsNewModal } from './WhatsNewModal';
import { WalkthroughModal } from './WalkthroughModal';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

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
    const EMPTY_RETRY_QUEUE: IUploadRetryQueueState = {
        failed: 0,
        retrying: 0,
        resolved: 0,
        paused: false,
        pauseReason: null,
        pausedAt: null,
        entries: []
    };
    const [logDirectory, setLogDirectory] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'image' | 'image-beta' | 'embed'>('image');
    const [logs, setLogs] = useState<ILogData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const canceledLogsRef = useRef<Set<string>>(new Set());
    const [embedStatSettings, setEmbedStatSettings] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS);
    const [statsViewSettings, setStatsViewSettings] = useState<IStatsViewSettings>(DEFAULT_STATS_VIEW_SETTINGS);
    const [disruptionMethod, setDisruptionMethod] = useState<DisruptionMethod>(DEFAULT_DISRUPTION_METHOD);
    const [uiTheme, setUiTheme] = useState<'classic' | 'modern' | 'crt'>('classic');
    const [webUploadState, setWebUploadState] = useState<IWebUploadState>(DEFAULT_WEB_UPLOAD_STATE);
    const webUploadClearTimerRef = useRef<number | null>(null);

    const [screenshotData, setScreenshotData] = useState<ILogData | null>(null);
    const [uploadRetryQueue, setUploadRetryQueue] = useState<IUploadRetryQueueState>(EMPTY_RETRY_QUEUE);
    const [retryQueueBusy, setRetryQueueBusy] = useState(false);

    // Updater State
    const [updateStatus, setUpdateStatus] = useState<string>('');
    const [updateProgress, setUpdateProgress] = useState<any>(null);
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);
    const [showUpdateErrorModal, setShowUpdateErrorModal] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [autoUpdateSupported, setAutoUpdateSupported] = useState<boolean>(true);
    const [autoUpdateDisabledReason, setAutoUpdateDisabledReason] = useState<string | null>(null);

    // Terminal State
    const [showTerminal, setShowTerminal] = useState(false);
    const [developerSettingsTrigger, setDeveloperSettingsTrigger] = useState(0);
    const settingsUpdateCheckRef = useRef(false);
    const versionClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const versionClickTimesRef = useRef<number[]>([]);

    // View State
    const [view, setView] = useState<'dashboard' | 'stats' | 'settings'>('dashboard');

    // App Version
    const [appVersion, setAppVersion] = useState<string>('...');
    const [whatsNewOpen, setWhatsNewOpen] = useState(false);
    const [whatsNewVersion, setWhatsNewVersion] = useState<string>('');
    const [whatsNewNotes, setWhatsNewNotes] = useState<string | null>(null);
    const [walkthroughOpen, setWalkthroughOpen] = useState(false);
    const [helpUpdatesFocusTrigger, setHelpUpdatesFocusTrigger] = useState(0);
    const walkthroughSeenMarkedRef = useRef(false);

    // Webhook Management
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [webhookDropdownOpen, setWebhookDropdownOpen] = useState(false);
    const webhookDropdownRef = useRef<HTMLDivElement | null>(null);
    const webhookDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
    const webhookDropdownPortalRef = useRef<HTMLDivElement | null>(null);
    const [webhookDropdownStyle, setWebhookDropdownStyle] = useState<CSSProperties | null>(null);

    // File picker modal state
    const [filePickerOpen, setFilePickerOpen] = useState(false);
    const [filePickerAvailable, setFilePickerAvailable] = useState<Array<{ path: string; name: string; mtimeMs: number; size: number }>>([]);
    const [filePickerAll, setFilePickerAll] = useState<Array<{ path: string; name: string; mtimeMs: number; size: number }>>([]);
    const [filePickerMonthWindow, setFilePickerMonthWindow] = useState(1);
    const [filePickerSelected, setFilePickerSelected] = useState<Set<string>>(new Set());
    const [filePickerFilter, setFilePickerFilter] = useState('');
    const [selectSinceOpen, setSelectSinceOpen] = useState(false);
    const [selectSinceDate, setSelectSinceDate] = useState<Date | null>(null);
    const [selectSinceView, setSelectSinceView] = useState<Date>(() => new Date());
    const [selectSinceHour, setSelectSinceHour] = useState<number>(12);
    const [selectSinceMinute, setSelectSinceMinute] = useState<number>(0);
    const [selectSinceMeridiem, setSelectSinceMeridiem] = useState<'AM' | 'PM'>('AM');
    const [selectSinceMonthOpen, setSelectSinceMonthOpen] = useState(false);
    const [filePickerError, setFilePickerError] = useState<string | null>(null);
    const [filePickerLoading, setFilePickerLoading] = useState(false);
    const lastPickedIndexRef = useRef<number | null>(null);
    const [filePickerAtBottom, setFilePickerAtBottom] = useState(false);
    const filePickerListRef = useRef<HTMLDivElement | null>(null);

    const devDatasetsEnabled = import.meta.env.DEV;
    const [devDatasetName, setDevDatasetName] = useState('');
    const [devDatasets, setDevDatasets] = useState<Array<{ id: string; name: string; createdAt: string }>>([]);
    const [devDatasetsOpen, setDevDatasetsOpen] = useState(false);
    const [precomputedStats, setPrecomputedStats] = useState<any | null>(null);
    const datasetLoadRef = useRef(false);
    const [devDatasetSaving, setDevDatasetSaving] = useState(false);
    const [devDatasetLoadingId, setDevDatasetLoadingId] = useState<string | null>(null);
    const [devDatasetRefreshing, setDevDatasetRefreshing] = useState(false);
    const [devDatasetLoadModes, setDevDatasetLoadModes] = useState<Record<string, 'frozen' | 'recompute'>>({});
    const [devDatasetDeleteConfirmId, setDevDatasetDeleteConfirmId] = useState<string | null>(null);
    const devDatasetStreamingIdRef = useRef<string | null>(null);
    const [devDatasetSaveProgress, setDevDatasetSaveProgress] = useState<{ id: string; stage: string; written: number; total: number } | null>(null);
    const devDatasetSavingIdRef = useRef<string | null>(null);
    const logsListRef = useRef<HTMLDivElement | null>(null);
    const [bulkCalculatingActive, setBulkCalculatingActive] = useState(false);
    const [devDatasetLoadProgress, setDevDatasetLoadProgress] = useState<{ id: string; name: string; loaded: number; total: number | null; done: boolean } | null>(null);
    const [logsForStats, setLogsForStats] = useState<ILogData[]>(logs);
    const statsBatchTimerRef = useRef<number | null>(null);
    const logsRef = useRef<ILogData[]>(logs);
    const [statsViewMounted, setStatsViewMounted] = useState(false);

    const applyDevDatasetSnapshot = useCallback((snapshot: IDevDatasetSnapshot | null | undefined) => {
        const state = snapshot?.state;
        if (!state || typeof state !== 'object') return;

        if (state.view === 'dashboard' || state.view === 'stats' || state.view === 'settings') {
            setView(state.view);
        }
        if (state.expandedLogId === null || typeof state.expandedLogId === 'string') {
            setExpandedLogId(state.expandedLogId ?? null);
        }
        if (state.notificationType === 'image' || state.notificationType === 'image-beta' || state.notificationType === 'embed') {
            setNotificationType(state.notificationType);
        }
        if (state.embedStatSettings && typeof state.embedStatSettings === 'object') {
            setEmbedStatSettings({ ...DEFAULT_EMBED_STATS, ...state.embedStatSettings });
        }
        if (state.mvpWeights && typeof state.mvpWeights === 'object') {
            setMvpWeights({ ...DEFAULT_MVP_WEIGHTS, ...state.mvpWeights });
        }
        if (state.statsViewSettings && typeof state.statsViewSettings === 'object') {
            setStatsViewSettings({ ...DEFAULT_STATS_VIEW_SETTINGS, ...state.statsViewSettings });
        }
        if (state.disruptionMethod === 'count' || state.disruptionMethod === 'duration' || state.disruptionMethod === 'tiered') {
            setDisruptionMethod(state.disruptionMethod);
        }
        if (state.uiTheme === 'classic' || state.uiTheme === 'modern' || state.uiTheme === 'crt') {
            setUiTheme(state.uiTheme);
        }
        if (state.selectedWebhookId === null || typeof state.selectedWebhookId === 'string') {
            setSelectedWebhookId(state.selectedWebhookId ?? null);
        }
        if (typeof state.bulkUploadMode === 'boolean') {
            setBulkUploadMode(state.bulkUploadMode);
        }
    }, []);

    const loadDevDatasets = useCallback(async () => {
        if (!window.electronAPI?.listDevDatasets) return;
        setDevDatasetRefreshing(true);
        try {
            const result = await window.electronAPI.listDevDatasets();
            if (result?.success && Array.isArray(result.datasets)) {
                setDevDatasets(result.datasets);
                setDevDatasetLoadModes((prev) => {
                    const next: Record<string, 'frozen' | 'recompute'> = {};
                    result.datasets!.forEach((dataset) => {
                        next[dataset.id] = prev[dataset.id] || 'frozen';
                    });
                    return next;
                });
            }
        } finally {
            setDevDatasetRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (!devDatasetsEnabled) return;
        let mounted = true;
        (async () => {
            if (!mounted) return;
            await loadDevDatasets();
        })();
        return () => {
            mounted = false;
        };
    }, [devDatasetsEnabled, loadDevDatasets]);

    useEffect(() => {
        if (datasetLoadRef.current) {
            datasetLoadRef.current = false;
            return;
        }
        setPrecomputedStats(null);
    }, [logs]);

    useEffect(() => {
        if (statsBatchTimerRef.current) return;
        statsBatchTimerRef.current = window.setTimeout(() => {
            statsBatchTimerRef.current = null;
            setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));
        }, 5000);
    }, [logs]);

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    useEffect(() => {
        if (view === 'stats') {
            setStatsViewMounted(true);
        }
    }, [view]);

    useEffect(() => {
        if (!devDatasetsEnabled || !window.electronAPI?.onDevDatasetLogsChunk) return;
        const unsubscribe = window.electronAPI.onDevDatasetLogsChunk((payload: { id: string; logs: ILogData[]; done?: boolean }) => {
            if (!payload?.id || payload.id !== devDatasetStreamingIdRef.current) return;
            if (Array.isArray(payload.logs) && payload.logs.length > 0) {
                setLogs((prev) => [...prev, ...payload.logs]);
                setDevDatasetLoadProgress((prev) => {
                    if (!prev || prev.id !== payload.id) return prev;
                    return { ...prev, loaded: prev.loaded + payload.logs.length };
                });
            }
            if (payload.done) {
                devDatasetStreamingIdRef.current = null;
                setDevDatasetLoadingId(null);
                setDevDatasetLoadProgress((prev) => {
                    if (!prev || prev.id !== payload.id) return prev;
                    return { ...prev, done: true, loaded: prev.total ?? prev.loaded };
                });
                window.setTimeout(() => {
                    setDevDatasetLoadProgress((prev) => (prev?.id === payload.id ? null : prev));
                }, 1500);
            }
        });
        return () => {
            unsubscribe?.();
        };
    }, [devDatasetsEnabled]);

    useEffect(() => {
        if (!devDatasetsEnabled || !window.electronAPI?.onDevDatasetSaveProgress) return;
        const unsubscribe = window.electronAPI.onDevDatasetSaveProgress((payload: { id: string; stage: string; written: number; total: number }) => {
            if (!payload?.id) return;
            if (devDatasetSavingIdRef.current && payload.id !== devDatasetSavingIdRef.current) return;
            setDevDatasetSaveProgress(payload);
            if (payload.stage === 'done') {
                setTimeout(() => setDevDatasetSaveProgress(null), 500);
            }
        });
        return () => {
            unsubscribe?.();
        };
    }, [devDatasetsEnabled]);

    useEffect(() => {
        if (!devDatasetsOpen) {
            setDevDatasetDeleteConfirmId(null);
        }
    }, [devDatasetsOpen]);

    useEffect(() => {
        if (!devDatasetDeleteConfirmId) return;
        const timeout = window.setTimeout(() => {
            setDevDatasetDeleteConfirmId(null);
        }, 4000);
        return () => window.clearTimeout(timeout);
    }, [devDatasetDeleteConfirmId]);

    // Persistence removed

    const { result: aggregationResult, computeTick, lastComputedLogCount, lastComputedToken, activeToken, lastComputedAt, lastComputedFlushId, requestFlush } = useStatsAggregationWorker({
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

    useEffect(() => {
        if (!bulkStatsAwaitingRef.current) {
            return;
        }
        if (bulkFlushIdRef.current === null) {
            return;
        }
        if (lastComputedFlushId !== bulkFlushIdRef.current) {
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
        setLogs((currentLogs) => {
            let changed = false;
            const next = currentLogs.map<ILogData>((log) => {
                if (log.status === 'calculating') {
                    changed = true;
                    return { ...log, status: 'success' as const };
                }
                return log;
            });
            return changed ? next : currentLogs;
        });
        bulkStatsAwaitingRef.current = false;
        bulkFlushIdRef.current = null;
    }, [computeTick, lastComputedLogCount, lastComputedToken, activeToken, lastComputedAt, lastComputedFlushId, logsForStats.length]);

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

    const selectedWebhook = useMemo(
        () => webhooks.find((hook) => hook.id === selectedWebhookId) || null,
        [webhooks, selectedWebhookId]
    );

    const [bulkUploadMode, setBulkUploadMode] = useState(false);
    const isBulkUploadActive = useMemo(
        () => bulkUploadMode || logs.some((log) => log.status === 'queued' || log.status === 'pending' || log.status === 'uploading' || log.status === 'retrying' || log.status === 'calculating'),
        [bulkUploadMode, logs]
    );
    const bulkUploadActiveRef = useRef(isBulkUploadActive);
    const bulkUploadModeRef = useRef(bulkUploadMode);
    const bulkUploadExpectedRef = useRef<number | null>(null);
    const bulkUploadCompletedRef = useRef(0);

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
        if (!isBulkUploadActive) {
            scheduleDetailsHydration();
        }
    }, [isBulkUploadActive]);

    useEffect(() => {
        bulkUploadModeRef.current = bulkUploadMode;
    }, [bulkUploadMode]);

    useEffect(() => {
        if (!bulkUploadMode) {
            scheduleDetailsHydration();
        }
    }, [bulkUploadMode, logs]);

    useEffect(() => {
        if (view === 'stats') {
            scheduleDetailsHydration(true);
        }
    }, [view]);

    const fetchLogDetails = useCallback(async (log: ILogData) => {
        if (log.details || !log.filePath || !window.electronAPI?.getLogDetails) return;
        setLogs((currentLogs) => {
            const idx = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
            if (idx < 0) return currentLogs;
            const updated = [...currentLogs];
            updated[idx] = { ...updated[idx], detailsLoading: true };
            return updated;
        });
        const result = await window.electronAPI.getLogDetails({ filePath: log.filePath });
        if (!result?.success || !result.details) {
            setLogs((currentLogs) => {
                const idx = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
                if (idx < 0) return currentLogs;
                const updated = [...currentLogs];
                updated[idx] = { ...updated[idx], detailsLoading: false };
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
                status: 'success'
            };
            return updated;
        });
    }, []);

    const pendingDetailsRef = useRef<Set<string>>(new Set());
    const hydrateDetailsQueueRef = useRef<number | null>(null);

    const scheduleDetailsHydration = useCallback((force = false) => {
        if (hydrateDetailsQueueRef.current !== null && !force) return;
        const schedule = typeof (window as any).requestIdleCallback === 'function'
            ? (window as any).requestIdleCallback
            : (cb: () => void) => window.setTimeout(cb, 150);
        hydrateDetailsQueueRef.current = schedule(async () => {
            hydrateDetailsQueueRef.current = null;
            if (!window.electronAPI?.getLogDetails) return;
            const candidates = logsRef.current
                .filter((log) => (log.detailsAvailable || log.status === 'success' || log.status === 'calculating') && !log.details && log.filePath)
                .sort((a, b) => {
                    const aTime = a.uploadTime || 0;
                    const bTime = b.uploadTime || 0;
                    if (aTime !== bTime) return aTime - bTime;
                    return (a.filePath || '').localeCompare(b.filePath || '');
                });
            if (candidates.length === 0) return;
            const maxConcurrent = 1;
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
                        const result = await window.electronAPI.getLogDetails({ filePath });
                        if (result?.success && result.details) {
                            setLogs((currentLogs) => {
                                const idx = currentLogs.findIndex((entry) => entry.filePath === filePath);
                                if (idx < 0) return currentLogs;
                                const updated = [...currentLogs];
                                const existing = updated[idx];
                                updated[idx] = {
                                    ...existing,
                                    details: result.details,
                                    status: 'success'
                                };
                                return updated;
                            });
                        }
                    } finally {
                        pendingDetailsRef.current.delete(filePath);
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(maxConcurrent, candidates.length) }, () => runWorker()));
        });
    }, [logs]);

    const endBulkUpload = useCallback(() => {
        bulkUploadExpectedRef.current = null;
        bulkUploadCompletedRef.current = 0;
        setBulkUploadMode(false);
        bulkStatsAwaitingRef.current = true;
        setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));
        const flushId = requestFlush?.();
        if (flushId) {
            bulkFlushIdRef.current = flushId;
        }
        window.setTimeout(() => scheduleDetailsHydration(true), 0);
        window.setTimeout(() => scheduleDetailsHydration(true), 500);
    }, [scheduleDetailsHydration, requestFlush]);

    useEffect(() => {
        if (!webhookDropdownOpen) return;
        const updatePosition = () => {
            if (!webhookDropdownButtonRef.current) return;
            const rect = webhookDropdownButtonRef.current.getBoundingClientRect();
            setWebhookDropdownStyle({
                position: 'fixed',
                top: Math.round(rect.bottom + 8),
                left: Math.round(rect.left),
                width: Math.round(rect.width),
                zIndex: 9999
            });
        };
        updatePosition();
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node;
            const inAnchor = webhookDropdownRef.current?.contains(target);
            const inPortal = webhookDropdownPortalRef.current?.contains(target);
            if (!inAnchor && !inPortal) {
                setWebhookDropdownOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setWebhookDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [webhookDropdownOpen]);

    useEffect(() => {
        const body = document.body;
        body.classList.remove('theme-classic', 'theme-modern', 'theme-crt');
        if (uiTheme === 'modern') body.classList.add('theme-modern');
        else if (uiTheme === 'crt') body.classList.add('theme-crt');
        else body.classList.add('theme-classic');
    }, [uiTheme]);


    // Stats calculation
    const totalUploads = logs.length;
    const statusCounts = logs.reduce<Record<string, number>>((acc, log) => {
        const key = log.status || 'queued';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const uploadStatusBreakdown = [
        { key: 'queued', label: 'Queued', color: '#94a3b8' },
        { key: 'pending', label: 'Pending', color: '#f59e0b' },
        { key: 'uploading', label: 'Uploading', color: '#38bdf8' },
        { key: 'retrying', label: 'Retrying', color: '#0ea5e9' },
        { key: 'discord', label: 'Discord', color: '#a78bfa' },
        { key: 'calculating', label: 'Calculating', color: '#facc15' },
        { key: 'success', label: 'Success', color: '#34d399' },
        { key: 'error', label: 'Error', color: '#f87171' }
    ].map((entry) => ({ ...entry, count: statusCounts[entry.key] || 0 }));
    const knownStatusKeys = new Set(uploadStatusBreakdown.map((entry) => entry.key));
    const otherStatusCount = Object.entries(statusCounts).reduce((sum, [status, count]) => {
        if (knownStatusKeys.has(status)) return sum;
        return sum + count;
    }, 0);
    if (otherStatusCount > 0) {
        uploadStatusBreakdown.push({ key: 'other', label: 'Other', color: '#9ca3af', count: otherStatusCount });
    }
    const uploadHasAnyStatus = uploadStatusBreakdown.some((entry) => entry.count > 0);
    const uploadPieData = uploadHasAnyStatus
        ? uploadStatusBreakdown
        : [{ key: 'none', label: 'No logs', color: '#334155', count: 1 }];
    const avgSquadSize = logs.length > 0
        ? Math.round(logs.reduce((acc, log) => acc + (log.details?.players?.filter((p: any) => !p.notInSquad)?.length || 0), 0) / logs.length)
        : 0;
    const avgEnemies = logs.length > 0
        ? Math.round(logs.reduce((acc, log) => acc + (log.details?.targets?.filter((t: any) => !t.isFake)?.length || 0), 0) / logs.length)
        : 0;
    const getFightDownsDeaths = (details: any) => {
        const players = details?.players || [];
        const squadPlayers = players.filter((p: any) => !p.notInSquad);
        let squadDownsDeaths = 0;
        let enemyDownsDeaths = 0;
        let squadDeaths = 0;
        let enemyDeaths = 0;

        squadPlayers.forEach((p: any) => {
            const defenses = p.defenses?.[0];
            if (!defenses) return;
            const downCount = Number(defenses.downCount || 0);
            const deadCount = Number(defenses.deadCount || 0);
            squadDownsDeaths += downCount + deadCount;
            squadDeaths += deadCount;
        });

        squadPlayers.forEach((p: any) => {
            if (!p.statsTargets || p.statsTargets.length === 0) return;
            p.statsTargets.forEach((targetStats: any) => {
                const st = targetStats?.[0];
                if (!st) return;
                const downed = Number(st.downed || 0);
                const killed = Number(st.killed || 0);
                enemyDownsDeaths += downed + killed;
                enemyDeaths += killed;
            });
        });

        return { squadDownsDeaths, enemyDownsDeaths, squadDeaths, enemyDeaths };
    };
    const getFightOutcome = (details: any) => {
        const { squadDownsDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
        if (squadDownsDeaths > 0 || enemyDownsDeaths > 0) {
            return enemyDownsDeaths > squadDownsDeaths;
        }
        if (typeof details?.success === 'boolean') return details.success;
        return false;
    };

    const winLoss = logs.reduce(
        (acc, log) => {
            const details: any = log.details;
            if (!details?.players) return acc;
            const isWin = getFightOutcome(details);
            if (isWin) acc.wins += 1;
            else acc.losses += 1;
            return acc;
        },
        { wins: 0, losses: 0 }
    );
    const squadKdr = (() => {
        let totalSquadDeaths = 0;
        let totalEnemyDeaths = 0;
        logs.forEach((log) => {
            const details: any = log.details;
            const { squadDeaths, enemyDeaths } = getFightDownsDeaths(details);
            totalSquadDeaths += squadDeaths;
            totalEnemyDeaths += enemyDeaths;
        });
        const denom = totalSquadDeaths === 0 ? 1 : totalSquadDeaths;
        return Number((totalEnemyDeaths / denom).toFixed(2));
    })();

    useEffect(() => {
        // Load saved settings
        const loadSettings = async () => {
            const settings = await window.electronAPI.getSettings();
            if (settings.logDirectory) {
                setLogDirectory(settings.logDirectory);
                window.electronAPI.startWatching(settings.logDirectory);
            }
            if (settings.discordNotificationType) {
                setNotificationType(settings.discordNotificationType);
            }
            if (settings.webhooks) {
                setWebhooks(settings.webhooks);
            }
            if (settings.selectedWebhookId) {
                setSelectedWebhookId(settings.selectedWebhookId);
            }
            if (settings.embedStatSettings) {
                setEmbedStatSettings({ ...DEFAULT_EMBED_STATS, ...settings.embedStatSettings });
            }
            if (settings.mvpWeights) {
                setMvpWeights({ ...DEFAULT_MVP_WEIGHTS, ...settings.mvpWeights });
            }
            if (settings.statsViewSettings) {
                setStatsViewSettings({ ...DEFAULT_STATS_VIEW_SETTINGS, ...settings.statsViewSettings });
            }
            if (settings.uiTheme) {
                setUiTheme(settings.uiTheme);
            }
            if (settings.disruptionMethod) {
                setDisruptionMethod(settings.disruptionMethod);
            }
            if (typeof settings.autoUpdateSupported === 'boolean') {
                setAutoUpdateSupported(settings.autoUpdateSupported);
                setAutoUpdateDisabledReason(settings.autoUpdateDisabledReason || null);
            }

            const whatsNew = await window.electronAPI.getWhatsNew();
            setAppVersion(whatsNew.version);
            setWhatsNewVersion(whatsNew.version);
            setWhatsNewNotes(whatsNew.releaseNotes);
            const shouldShowWalkthrough = settings.walkthroughSeen !== true;
            if (shouldShowWalkthrough) {
                setWalkthroughOpen(true);
                if (!walkthroughSeenMarkedRef.current) {
                    walkthroughSeenMarkedRef.current = true;
                    window.electronAPI?.saveSettings?.({ walkthroughSeen: true });
                }
            } else if (whatsNew.version && whatsNew.version !== whatsNew.lastSeenVersion) {
                setWhatsNewOpen(true);
            }
        };
        loadSettings();

        const loadUploadRetryQueue = async () => {
            if (!window.electronAPI?.getUploadRetryQueue) return;
            const result = await window.electronAPI.getUploadRetryQueue();
            if (result?.success && result.queue) {
                setUploadRetryQueue(result.queue);
            }
        };
        loadUploadRetryQueue();
        const cleanupRetryQueue = window.electronAPI?.onUploadRetryQueueUpdated
            ? window.electronAPI.onUploadRetryQueueUpdated((queue) => {
                if (!queue) return;
                setUploadRetryQueue(queue);
            })
            : null;

        // Listen for status updates during upload process
        const cleanupStatus = window.electronAPI.onUploadStatus((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            setLogs((currentLogs) => {
                const existingIndex = currentLogs.findIndex(log => log.filePath === data.filePath);
                if (existingIndex >= 0) {
                    const updated = [...currentLogs];
                    updated[existingIndex] = { ...updated[existingIndex], ...data };
                    return updated;
                } else {
                    return [data, ...currentLogs];
                }
            });
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
                setLogs((currentLogs) => {
                    const existingIndex = currentLogs.findIndex(log => log.filePath === data.filePath);
                    if (existingIndex >= 0) {
                        const updated = [...currentLogs];
                        updated[existingIndex] = { ...updated[existingIndex], ...data };
                        return updated;
                    }
                    return [data, ...currentLogs];
                });
                bulkUploadCompletedRef.current += 1;
                if (bulkUploadExpectedRef.current !== null && bulkUploadCompletedRef.current >= bulkUploadExpectedRef.current) {
                    endBulkUpload();
                }
                return;
            }
            setLogs((currentLogs) => {
                const existingIndex = currentLogs.findIndex(log => log.filePath === data.filePath);
                if (existingIndex >= 0) {
                    const updated = [...currentLogs];
                    updated[existingIndex] = data;
                    return updated;
                } else {
                    return [data, ...currentLogs];
                }
            });
        });

        const cleanupScreenshot = window.electronAPI.onRequestScreenshot(async (data: ILogData) => {
            const logKey = data.id || data.filePath;
            console.log("Screenshot requested for:", logKey);
            if (!logKey) {
                console.error('Screenshot request missing log identifier.');
                return;
            }
            setScreenshotData({ ...data, id: logKey });

            const escapeSelector = (value: string) => {
                if (typeof window !== 'undefined' && (window as any).CSS?.escape) {
                    return (window as any).CSS.escape(value);
                }
                return value.replace(/"/g, '\\"');
            };

            const waitForNodes = async (selector: string, expectedCount: number, timeoutMs: number) => {
                const start = performance.now();
                while (performance.now() - start < timeoutMs) {
                    const nodes = Array.from(document.querySelectorAll(selector));
                    if (nodes.length >= expectedCount) {
                        return nodes;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
                return Array.from(document.querySelectorAll(selector));
            };

            const waitForNode = async (nodeId: string, timeoutMs: number) => {
                const start = performance.now();
                while (performance.now() - start < timeoutMs) {
                    const node = document.getElementById(nodeId);
                    if (node) return node;
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
                return document.getElementById(nodeId);
            };

            // Wait for render
            setTimeout(async () => {
                const mode = (data as any)?.mode || 'image';

                // Helper to prevent hanging calls
                const safeToPng = async (node: HTMLElement, options: any) => {
                    return Promise.race([
                        toPng(node, { ...options, cacheBust: false, skipAutoScale: true }),
                        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Screenshot generation timed out')), 5000))
                    ]);
                };

                if (mode === 'image-beta') {
                    const selector = `[data-screenshot-id="${escapeSelector(logKey)}"]`;
                    const summaryTileCount = (embedStatSettings.showSquadSummary ? 1 : 0)
                        + (embedStatSettings.showEnemySummary ? 1 : 0);
                    const expectedCount = summaryTileCount
                        + (embedStatSettings.showClassSummary ? summaryTileCount : 0)
                        + (embedStatSettings.showIncomingStats ? 4 : 0)
                        + enabledTopListCount;
                    const nodes = await waitForNodes(selector, Math.max(1, expectedCount), 5000);
                    if (nodes.length === 0) {
                        console.error("Screenshot nodes not found, falling back to full card.");
                        const fallbackNode = await waitForNode(`log-screenshot-${logKey}`, 1500);
                        if (fallbackNode) {
                            try {
                                const dataUrl = await safeToPng(fallbackNode, {
                                    backgroundColor: '#10141b',
                                    quality: 0.95,
                                    pixelRatio: 3
                                });
                                const buffer = dataUrlToUint8Array(dataUrl);
                                window.electronAPI.sendScreenshot(logKey, buffer);
                            } catch (err) {
                                console.error("Fallback screenshot failed:", err);
                                // Ensure we clean up even on error so UI doesn't hang
                                setScreenshotData(null);
                            }
                        } else {
                            // If everything fails, clean up
                            console.error("No fallback node found either.");
                            setScreenshotData(null);
                        }
                        return;
                    }
                    try {
                        const buffers: { group: string; buffer: Uint8Array }[] = [];
                        for (const node of nodes) {
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
                                console.error("Failed to screenshot a specific tile:", innerErr);
                                // Continue with other tiles if one fails
                            }
                        }

                        if (buffers.length === 0) {
                            throw new Error("No tiles were successfully captured");
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
                        setScreenshotData(null);
                    } catch (err) {
                        console.error("Screenshot failed:", err);
                        setScreenshotData(null);
                    }
                } else {
                    const node = await waitForNode(`log-screenshot-${logKey}`, 2000);
                    if (node) {
                        try {
                            const dataUrl = await safeToPng(node, {
                                backgroundColor: '#10141b',
                                quality: 0.95,
                                pixelRatio: 3 // Higher fidelity for Discord
                            });
                            const buffer = dataUrlToUint8Array(dataUrl);

                            window.electronAPI.sendScreenshot(logKey, buffer);
                            setScreenshotData(null); // Cleanup
                        } catch (err) {
                            console.error("Screenshot failed:", err);
                            setScreenshotData(null);
                        }
                    } else {
                        console.error("Screenshot node not found");
                        setScreenshotData(null);
                    }
                }
            }, 800);
        });

        return () => {
            cleanupStatus();
            cleanupUpload();
            cleanupScreenshot();
            cleanupRetryQueue?.();
        };
    }, []);

    useEffect(() => {
        if (!window.electronAPI?.onWebUploadStatus) return;
        const cleanupWebUpload = window.electronAPI.onWebUploadStatus((data) => {
            if (!data) return;
            setWebUploadState((prev) => ({
                ...prev,
                stage: data.stage || 'Uploading',
                progress: typeof data.progress === 'number' ? data.progress : prev.progress,
                detail: prev.stage === 'Upload failed' ? prev.detail : (data.message || prev.detail)
            }));
        });
        return () => {
            cleanupWebUpload();
        };
    }, []);

    useEffect(() => {
        if (webUploadState.buildStatus !== 'checking' && webUploadState.buildStatus !== 'building') return;
        if (!window.electronAPI?.getGithubPagesBuildStatus) {
            setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
            return;
        }
        let attempts = 0;
        const interval = setInterval(async () => {
            attempts += 1;
            try {
                const resp = await window.electronAPI.getGithubPagesBuildStatus();
                if (resp?.success) {
                    const status = String(resp.status || '').toLowerCase();
                    if (status === 'built' || status === 'success') {
                        setWebUploadState((prev) => ({ ...prev, buildStatus: 'built' }));
                        clearInterval(interval);
                        return;
                    }
                    if (status === 'errored' || status === 'error' || status === 'failed') {
                        setWebUploadState((prev) => ({ ...prev, buildStatus: 'errored' }));
                        clearInterval(interval);
                        return;
                    }
                    setWebUploadState((prev) => ({ ...prev, buildStatus: 'building' }));
                } else if (resp?.error) {
                    setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
                    clearInterval(interval);
                    return;
                }
            } catch {
                setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
                clearInterval(interval);
                return;
            }
            if (attempts >= 18) {
                setWebUploadState((prev) => ({ ...prev, buildStatus: 'unknown' }));
                clearInterval(interval);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [webUploadState.buildStatus]);

    useEffect(() => {
        if (updateStatus) console.log('[Updater]', updateStatus);
    }, [updateStatus]);

    useEffect(() => {
        if (!filePickerOpen) return;
        loadLogFiles(logDirectory);
    }, [filePickerOpen, logDirectory]);

    useEffect(() => {
        if (!filePickerOpen) return;
        const node = filePickerListRef.current;
        if (!node) return;
        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
        setFilePickerAtBottom(atBottom);
    }, [filePickerOpen, filePickerAvailable.length, filePickerFilter]);

    useEffect(() => {
        const cleanupMessage = window.electronAPI.onUpdateMessage((message) => setUpdateStatus(message));
        const cleanupAvailable = window.electronAPI.onUpdateAvailable(() => {
            setUpdateAvailable(true);
            setUpdateStatus('Update available.');
        });
        const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
            setUpdateStatus('App is up to date.');
            setTimeout(() => setUpdateStatus(''), 5000);
        });
        const cleanupError = window.electronAPI.onUpdateError((err) => {
            const errorMessage = err.message || (typeof err === 'string' ? err : 'Unknown update error');
            setUpdateStatus('Error: ' + errorMessage);
            setUpdateError(errorMessage);
            setShowUpdateErrorModal(true);
            setUpdateAvailable(false); // Reset so spinner stops
            setUpdateProgress(null);
        });
        const cleanupProgress = window.electronAPI.onDownloadProgress((progress) => {
            setUpdateProgress(progress);
        });
        const cleanupDownloaded = window.electronAPI.onUpdateDownloaded(() => {
            setUpdateStatus('Update downloaded. Ready to restart.');
            setUpdateDownloaded(true);
            setUpdateProgress(null);
        });

        return () => {
            cleanupMessage();
            cleanupAvailable();
            cleanupNotAvailable();
            cleanupError();
            cleanupProgress();
            cleanupDownloaded();
        };
    }, []);

    const handleSelectDirectory = async () => {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
            setLogDirectory(path);
            window.electronAPI.startWatching(path);
        }
    };

    const loadLogFiles = async (dir: string | null) => {
        if (!dir) {
            setFilePickerAvailable([]);
            setFilePickerAll([]);
            return;
        }
        if (!window.electronAPI.listLogFiles) {
            setFilePickerError('Log listing is unavailable in this build.');
            return;
        }
        setFilePickerLoading(true);
        setFilePickerError(null);
        try {
            const result = await window.electronAPI.listLogFiles({ dir });
            if (result?.success) {
                const files = (result.files || []).slice().sort((a, b) => {
                    const aTime = Number.isFinite(a.mtimeMs) ? a.mtimeMs : 0;
                    const bTime = Number.isFinite(b.mtimeMs) ? b.mtimeMs : 0;
                    return bTime - aTime;
                });
                setFilePickerAll(files);
                setFilePickerMonthWindow(1);
                setFilePickerAvailable([]);
                setFilePickerAtBottom(false);
            } else {
                setFilePickerError(result?.error || 'Failed to load logs.');
            }
        } catch (err: any) {
            setFilePickerError(err?.message || 'Failed to load logs.');
        } finally {
            setFilePickerLoading(false);
        }
    };

    const filePickerVisible = useMemo(() => {
        if (filePickerAll.length === 0) return [];
        const cutoffMs = Date.now() - (Math.max(1, filePickerMonthWindow) * 30 * 24 * 60 * 60 * 1000);
        return filePickerAll.filter((entry) => {
            if (!Number.isFinite(entry.mtimeMs)) return true;
            return entry.mtimeMs >= cutoffMs;
        });
    }, [filePickerAll, filePickerMonthWindow]);

    useEffect(() => {
        setFilePickerAvailable(filePickerVisible);
    }, [filePickerVisible]);

    const filePickerHasMore = useMemo(() => {
        if (filePickerAll.length === 0) return false;
        const cutoffMs = Date.now() - (Math.max(1, filePickerMonthWindow) * 30 * 24 * 60 * 60 * 1000);
        return filePickerAll.some((entry) => Number.isFinite(entry.mtimeMs) && entry.mtimeMs < cutoffMs);
    }, [filePickerAll, filePickerMonthWindow]);

    const ensureMonthWindowForSince = (sinceMs: number) => {
        if (!Number.isFinite(sinceMs)) return;
        let monthsBack = Math.max(1, filePickerMonthWindow);
        const cutoffFor = (months: number) =>
            Date.now() - (months * 30 * 24 * 60 * 60 * 1000);
        while (sinceMs < cutoffFor(monthsBack)) {
            monthsBack += 1;
        }
        if (monthsBack !== filePickerMonthWindow) {
            setFilePickerMonthWindow(monthsBack);
        }
    };

    const handleAddSelectedFiles = () => {
        const files = Array.from(filePickerSelected);
        if (!files.length) {
            setFilePickerError('Select at least one log file.');
            return;
        }
        const optimisticLogs: ILogData[] = [];
        files.forEach((filePath) => {
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            optimisticLogs.push({
                id: fileName,
                filePath,
                status: 'queued',
                fightName: fileName,
                uploadTime: Date.now() / 1000,
                permalink: ''
            });
        });
        setLogs((currentLogs) => {
            const newLogs = [...currentLogs];
            optimisticLogs.forEach((optLog) => {
                if (!newLogs.some((l) => l.filePath === optLog.filePath)) {
                    newLogs.unshift(optLog);
                }
            });
            return newLogs;
        });
        if (files.length > 1) {
            setBulkUploadMode(true);
            bulkUploadExpectedRef.current = files.length;
            bulkUploadCompletedRef.current = 0;
        }
        window.electronAPI.manualUploadBatch(files);
        setFilePickerOpen(false);
        setFilePickerSelected(new Set());
        setFilePickerError(null);
    };

    const handleUpdateSettings = (updates: any) => {
        window.electronAPI.saveSettings(updates);
    };

    const handleRetryFailedUploads = async () => {
        if (!window.electronAPI?.retryFailedUploads) return;
        if (retryQueueBusy) return;
        setRetryQueueBusy(true);
        try {
            const result = await window.electronAPI.retryFailedUploads();
            if (result?.success && result.queue) {
                setUploadRetryQueue(result.queue);
            }
        } finally {
            setRetryQueueBusy(false);
        }
    };

    const handleResumeUploadRetries = async () => {
        if (!window.electronAPI?.resumeUploadRetries) return;
        if (retryQueueBusy) return;
        setRetryQueueBusy(true);
        try {
            const result = await window.electronAPI.resumeUploadRetries();
            if (result?.success && result.queue) {
                setUploadRetryQueue(result.queue);
            }
        } finally {
            setRetryQueueBusy(false);
        }
    };

    const handleWhatsNewClose = async () => {
        setWhatsNewOpen(false);
        if (whatsNewVersion) {
            await window.electronAPI.setLastSeenVersion(whatsNewVersion);
        }
    };

    const handleWalkthroughClose = () => {
        setWalkthroughOpen(false);
        window.electronAPI?.saveSettings?.({ walkthroughSeen: true });
    };

    const handleWalkthroughLearnMore = () => {
        handleWalkthroughClose();
        setView('settings');
        setHelpUpdatesFocusTrigger((current) => current + 1);
    };
    const handleHelpUpdatesFocusConsumed = useCallback((trigger: number) => {
        setHelpUpdatesFocusTrigger((current) => (current === trigger ? 0 : current));
    }, []);

    const scheduleWebUploadClear = () => {
        if (webUploadClearTimerRef.current) {
            window.clearTimeout(webUploadClearTimerRef.current);
        }
        if (webUploadState.stage === 'Upload failed') {
            return;
        }
        webUploadClearTimerRef.current = window.setTimeout(() => {
            setWebUploadState((prev) => ({
                ...prev,
                stage: null,
                progress: null,
                detail: null
            }));
            webUploadClearTimerRef.current = null;
        }, 2500);
    };

    const handleWebUpload = async (payload: { meta: any; stats: any }) => {
        if (!window.electronAPI?.uploadWebReport) {
            setWebUploadState((prev) => ({
                ...prev,
                message: 'Web upload is not available in this build.'
            }));
            return;
        }
        if (webUploadClearTimerRef.current) {
            window.clearTimeout(webUploadClearTimerRef.current);
            webUploadClearTimerRef.current = null;
        }
        setWebUploadState((prev) => ({
            ...prev,
            uploading: true,
            message: 'Preparing report...',
            stage: 'Preparing report',
            progress: 0,
            detail: null,
            url: null,
            buildStatus: 'idle'
        }));
        let uploadSucceeded = false;
        try {
            const result = await window.electronAPI.uploadWebReport(payload);
            if (result?.success) {
                uploadSucceeded = true;
                const url = result.url || '';
                setWebUploadState((prev) => ({
                    ...prev,
                    url,
                    message: `Uploaded: ${url || 'GitHub Pages'}`,
                    stage: 'Upload complete',
                    progress: 100,
                    buildStatus: 'checking'
                }));
            } else {
                if (result?.errorDetail) {
                    console.error('[Web Upload] Failed:', result.errorDetail);
                } else if (result?.error) {
                    console.error('[Web Upload] Failed:', result.error);
                }
                setWebUploadState((prev) => ({
                    ...prev,
                    message: result?.error || 'Upload failed.',
                    detail: result?.errorDetail || null,
                    stage: 'Upload failed',
                    buildStatus: 'idle'
                }));
            }
        } catch (err: any) {
            const errorDetail = err?.stack || String(err);
            console.error('[Web Upload] Failed:', errorDetail);
            setWebUploadState((prev) => ({
                ...prev,
                message: err?.message || 'Upload failed.',
                detail: errorDetail,
                stage: 'Upload failed',
                buildStatus: 'idle'
            }));
        } finally {
            setWebUploadState((prev) => ({ ...prev, uploading: false }));
            if (uploadSucceeded) {
                scheduleWebUploadClear();
            }
        }
    };

    const isModernTheme = uiTheme === 'modern';
    const isCrtTheme = uiTheme === 'crt';
    const appIconPath = `${import.meta.env.BASE_URL || './'}img/ArcBridge.svg`;
    const arcbridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
    const isDev = import.meta.env.DEV;
    const shellClassName = isModernTheme
        ? 'app-shell h-screen w-screen text-white overflow-hidden flex flex-col'
        : isCrtTheme
            ? 'app-shell h-screen w-screen text-white overflow-hidden flex flex-col'
            : 'app-shell h-screen w-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-gray-900 to-black text-white font-sans overflow-hidden flex flex-col';

    const notificationTypeButtons = isModernTheme ? (
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
        <div className={isModernTheme ? 'space-y-1 min-w-0' : ''}>
            <label className={`text-xs uppercase tracking-wider text-gray-500 font-semibold ${isModernTheme ? 'mb-1 block' : 'mb-2 block'}`}>Notification Type</label>
            {notificationTypeButtons}
        </div>
    );

    const configurationPanel = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl hover:border-white/20 transition-colors"
        >
            {isModernTheme ? (
                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,360px)] gap-3 items-start p-2">
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
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 h-11 flex items-center justify-between gap-2 text-sm text-gray-300 hover:border-purple-500/50 hover:bg-black/50 transition-colors"
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
                                className="shrink-0 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl w-11 h-11 flex items-center justify-center gap-2 transition-colors"
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
    const uploadingCount = (statusCounts.uploading || 0) + (statusCounts.retrying || 0);
    const winRate = totalUploads > 0 ? Math.round((winLoss.wins / totalUploads) * 100) : 0;

    const statsTilesPanel = isModernTheme ? (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
        >
            <div className="grid grid-cols-4 gap-4">
                <div className="h-24 bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-blue-200 text-xs font-medium uppercase tracking-wider">Upload Status</div>
                        <div className="mt-2 text-2xl font-bold text-white leading-none">{totalUploads}</div>
                        <div className="mt-1 text-[11px] text-blue-100/70">
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
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">W / L</div>
                        <div className="text-2xl font-bold text-white leading-none">
                            <span className="text-emerald-300">{winLoss.wins}</span>
                            <span className="text-gray-500 mx-2">/</span>
                            <span className="text-red-400">{winLoss.losses}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">Totals</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500">Win rate</div>
                        <div className="text-xl font-semibold text-emerald-200">{winRate}%</div>
                        <div className="text-[11px] text-gray-500">{totalUploads} logs</div>
                    </div>
                </div>
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Avg Players</div>
                        <div className="text-2xl font-bold text-white leading-none">
                            <span className="text-emerald-300">{avgSquadSize}</span>
                            <span className="text-gray-500 mx-2">/</span>
                            <span className="text-red-400">{avgEnemies}</span>
                        </div>
                        <div className="text-[11px] text-gray-500">Squad / Enemy</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500">Diff</div>
                        <div className="text-xl font-semibold text-sky-200">{avgSquadSize - avgEnemies}</div>
                        <div className="text-[11px] text-gray-500">Ratio {(avgEnemies ? (avgSquadSize / avgEnemies) : 0).toFixed(2)}</div>
                    </div>
                </div>
                <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
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
            className="grid grid-cols-2 gap-4"
        >
            <div className="h-24 bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-col">
                <div className="text-blue-200 text-xs font-medium uppercase tracking-wider">Upload Status</div>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                    <div className="w-full h-full max-h-[63px]">
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
                                    className="fill-white text-[11px] font-semibold"
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
            <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col">
                <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">W / L</div>
                <div className="flex-1 flex items-center">
                    <div className="text-2xl font-bold text-white leading-none">
                        <span className="text-emerald-300">{winLoss.wins}</span>
                        <span className="text-gray-500 mx-2">/</span>
                        <span className="text-red-400">{winLoss.losses}</span>
                    </div>
                </div>
            </div>
            <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col">
                <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Avg Players</div>
                <div className="flex-1 flex items-center">
                    <div className="text-2xl font-bold text-white leading-none">
                        <span className="text-emerald-300">{avgSquadSize}</span>
                        <span className="text-gray-500 mx-2">/</span>
                        <span className="text-red-400">{avgEnemies}</span>
                    </div>
                </div>
            </div>
            <div className="h-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col">
                <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Squad KDR</div>
                <div className="flex-1 flex items-center">
                    <div className="text-2xl font-bold text-emerald-300 leading-none">{squadKdr}</div>
                </div>
            </div>
        </motion.div>
    );

    const activityPanel = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`bg-white/5 backdrop-blur-xl border ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'} rounded-2xl p-6 flex flex-col h-full shadow-2xl transition-all duration-300 relative`}
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
                className="flex-1 overflow-y-auto pr-2"
                ref={logsListRef}
            >
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-20">
                        <UploadCloud className="w-12 h-12 mb-3" />
                        <p>Drop logs to upload</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {logs.map((log) => (
                            <ExpandableLogCard
                                key={log.filePath}
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
                                useClassIcons={showClassIcons}
                            />
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );

    return (
        <div className={shellClassName}>
            {/* Custom Title Bar */}
            <div className="app-titlebar h-10 shrink-0 w-full flex justify-between items-center px-4 bg-black/20 backdrop-blur-md border-b border-white/5 drag-region select-none z-50">
                <div className="flex items-center gap-2">
                    <span className="arcbridge-logo h-4 w-4" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
                    <span className="text-xs font-medium text-gray-400">ArcBridge</span>
                    {isDev ? (
                        <span className="ml-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-amber-300">
                            Dev Build
                        </span>
                    ) : null}
                </div>
                <div className="flex items-center gap-4 no-drag">
                    <button onClick={() => window.electronAPI.windowControl('minimize')} className="text-gray-400 hover:text-white transition-colors">
                        <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => window.electronAPI.windowControl('maximize')} className="text-gray-400 hover:text-white transition-colors">
                        <Square className="w-3 h-3" />
                    </button>
                    <button onClick={() => window.electronAPI.windowControl('close')} className="text-gray-400 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Background Orbs */}
            <div className="legacy-orb absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[100px] pointer-events-none" />
            <div className="legacy-orb absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[100px] pointer-events-none" />

        <div className={`app-content relative z-10 ${isModernTheme ? 'max-w-none' : 'max-w-5xl mx-auto'} flex-1 w-full min-w-0 flex flex-col min-h-0 ${view === 'stats' ? 'pt-8 px-8 pb-2 overflow-hidden' : (isModernTheme ? 'p-8 overflow-visible' : 'p-8 overflow-hidden')}`}>
                <header className="app-header flex flex-wrap justify-between items-center gap-3 mb-10 shrink-0">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 min-w-0"
                    >
                        <div className="flex items-center gap-3">
                            <span className="arcbridge-logo h-8 w-8 rounded-md" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
                            <h1 className="text-3xl font-bold arcbridge-gradient-text">
                                ArcBridge
                            </h1>
                        </div>
                    </motion.div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                        <AnimatePresence mode="wait">
                            {(updateAvailable || updateDownloaded) ? (
                                <motion.div
                                    key="updating"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="flex items-center gap-2"
                                >
                                    {updateDownloaded ? (
                                        <button
                                            onClick={() => window.electronAPI.restartApp()}
                                            className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 hover:bg-green-500/30 transition-colors"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            <span>Restart to Update</span>
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span>{updateProgress ? `${Math.round(updateProgress.percent)}%` : 'Updating...'}</span>
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                updateStatus && (
                                    <motion.div
                                        key="status"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className={`flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border ${updateStatus.includes('Error')
                                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                            : 'bg-white/5 text-gray-400 border-white/10'
                                            }`}
                                    >
                                        <RefreshCw className={`w-3 h-3 ${updateStatus.includes('Checking') ? 'animate-spin' : ''}`} />
                                        <span>{updateStatus}</span>
                                    </motion.div>
                                )
                            )}
                        </AnimatePresence>
                        {!autoUpdateSupported && (
                            <div
                                className="flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border bg-amber-500/15 text-amber-200 border-amber-500/30"
                                title={autoUpdateDisabledReason === 'portable'
                                    ? 'Portable build detected'
                                    : autoUpdateDisabledReason === 'missing-config'
                                        ? 'Update config missing for this build'
                                        : 'Auto-updates disabled in development'}
                            >
                                Auto-updates disabled
                            </div>
                        )}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-xs font-medium px-3 py-1 bg-white/5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10 transition-colors select-none"
                            onClick={() => {
                                if (view === 'settings') {
                                    if (!settingsUpdateCheckRef.current) {
                                        window.electronAPI.checkForUpdates();
                                        settingsUpdateCheckRef.current = true;
                                    }
                                } else {
                                    window.electronAPI.checkForUpdates();
                                }
                                if (view !== 'settings') return;
                                const now = Date.now();
                                versionClickTimesRef.current = versionClickTimesRef.current.filter((t) => now - t < 5000);
                                versionClickTimesRef.current.push(now);
                                if (versionClickTimeoutRef.current) {
                                    clearTimeout(versionClickTimeoutRef.current);
                                }
                                versionClickTimeoutRef.current = setTimeout(() => {
                                    versionClickTimesRef.current = [];
                                }, 5200);
                                if (versionClickTimesRef.current.length >= 5) {
                                    setDeveloperSettingsTrigger((prev) => prev + 1);
                                    versionClickTimesRef.current = [];
                                }
                            }}
                            title="Check for updates"
                        >
                            v{appVersion}
                        </motion.div>
                        <button
                            onClick={() => setView('dashboard')}
                            className={`p-2 rounded-xl transition-all ${view === 'dashboard' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Dashboard"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setView('stats')}
                            className={`p-2 rounded-xl transition-all ${view === 'stats' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="View Stats"
                        >
                            <Trophy className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setView('settings')}
                            className={`p-2 rounded-xl transition-all ${view === 'settings' ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setShowTerminal(!showTerminal)}
                            className={`p-2 rounded-xl transition-all ${showTerminal ? 'bg-gray-700/50 text-white border-gray-600' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Toggle Terminal"
                        >
                            <TerminalIcon className="w-5 h-5" />
                        </button>
                        {devDatasetsEnabled && (
                            <button
                                type="button"
                                onClick={() => setDevDatasetsOpen(true)}
                                className="p-2 rounded-xl transition-all bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
                                title="Dev Datasets"
                            >
                                <FilePlus2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                {(webUploadState.uploading || webUploadState.stage) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg">
                        <div className={`w-full bg-white/10 border border-white/15 rounded-2xl p-6 shadow-2xl backdrop-blur-2xl ${
                            isDev && (webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored')
                                ? 'max-w-2xl'
                                : 'max-w-md'
                        }`}>
                            <div className="text-sm uppercase tracking-widest text-cyan-300/70">Web Upload</div>
                            <div className="text-2xl font-bold text-white mt-2">{webUploadState.stage || 'Uploading'}</div>
                            <div className="text-sm text-gray-400 mt-2">
                                {(webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored')
                                    ? 'Upload failed (WEB_UPLOAD_ERROR)'
                                    : (webUploadState.detail || webUploadState.message || 'Working...')}
                            </div>
                            {isDev && webUploadState.detail && (webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored') && (
                                <pre
                                    className="mt-4 h-64 overflow-y-auto overflow-x-auto overscroll-contain rounded-xl border border-amber-500/20 bg-black/60 p-3 text-[11px] text-amber-100 whitespace-pre-wrap pointer-events-auto"
                                    onWheel={(event) => event.stopPropagation()}
                                    onTouchMove={(event) => event.stopPropagation()}
                                >
                                    {webUploadState.detail}
                                </pre>
                            )}
                            <div className={`mt-4 h-2 rounded-full overflow-hidden ${isModernTheme ? 'bg-slate-800/70 border border-white/20' : 'bg-white/10'}`}>
                                <div
                                    className={`h-full transition-all ${isModernTheme ? 'bg-slate-200 shadow-[0_0_10px_rgba(226,232,240,0.6)]' : 'bg-gradient-to-r from-cyan-300 to-blue-400'}`}
                                    style={{ width: `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%` }}
                                />
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                {typeof webUploadState.progress === 'number' ? `${Math.round(webUploadState.progress)}%` : 'Preparing...'}
                            </div>
                            {isDev && (webUploadState.stage === 'Upload failed' || webUploadState.buildStatus === 'errored') && (
                                <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setWebUploadState((prev) => ({
                                                ...prev,
                                                uploading: false,
                                                stage: null,
                                                progress: null,
                                                detail: null,
                                                message: null,
                                                buildStatus: 'idle'
                                            }));
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {statsViewMounted && (
                    <div className="flex-1 min-h-0" style={{ display: view === 'stats' ? 'flex' : 'none' }}>
                        <StatsView
                            logs={logsForStats}
                            onBack={() => setView('dashboard')}
                            mvpWeights={mvpWeights}
                            disruptionMethod={disruptionMethod}
                            statsViewSettings={statsViewSettings}
                            precomputedStats={precomputedStats || undefined}
                            onStatsViewSettingsChange={(next) => {
                                setStatsViewSettings(next);
                                window.electronAPI?.saveSettings?.({ statsViewSettings: next });
                            }}
                            uiTheme={uiTheme}
                            webUploadState={webUploadState}
                            onWebUpload={handleWebUpload}
                            canShareDiscord={!!selectedWebhookId}
                        />
                    </div>
                )}
                {view === 'settings' ? (
                    <SettingsView
                        onBack={() => setView('dashboard')}
                        onEmbedStatSettingsSaved={setEmbedStatSettings}
                        onMvpWeightsSaved={setMvpWeights}
                        onStatsViewSettingsSaved={setStatsViewSettings}
                        onDisruptionMethodSaved={setDisruptionMethod}
                        onUiThemeSaved={setUiTheme}
                        developerSettingsTrigger={developerSettingsTrigger}
                        helpUpdatesFocusTrigger={helpUpdatesFocusTrigger}
                        onHelpUpdatesFocusConsumed={handleHelpUpdatesFocusConsumed}
                        onOpenWalkthrough={() => setWalkthroughOpen(true)}
                        onOpenWhatsNew={() => setWhatsNewOpen(true)}
                    />
                ) : view === 'stats' ? null : (
                    isModernTheme ? (
                        <div className="dashboard-view dashboard-modern flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto overflow-x-visible pr-1">
                            {statsTilesPanel}
                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 flex-1 min-h-0 content-start">
                                <div className="order-2 xl:order-1 min-h-0">
                                    {activityPanel}
                                </div>
                                <div className="dashboard-rail order-1 xl:order-2 flex flex-col gap-4 overflow-y-auto pr-0">
                                    {configurationPanel}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="dashboard-view grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-y-auto pr-1">
                            <div className="space-y-6 overflow-y-auto pr-2">
                                {configurationPanel}
                                {statsTilesPanel}
                            </div>
                            <div className="lg:col-span-2 flex flex-col min-h-0">
                                {activityPanel}
                            </div>
                        </div>
                    )
                )}
            </div>

            {/* Hidden Screenshot Container */}
            <div className="fixed top-0 left-0 pointer-events-none opacity-0 overflow-hidden z-[-9999]">
                {screenshotData && (screenshotData as any).mode === 'image-beta' ? (
                    <>
                        {embedStatSettings.showSquadSummary && (
                            <ExpandableLogCard
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad' }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        )}
                        {embedStatSettings.showEnemySummary && (
                            <ExpandableLogCard
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy' }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        )}
                        {embedStatSettings.showClassSummary && embedStatSettings.showSquadSummary && (
                            <ExpandableLogCard
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad-classes' }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        )}
                        {embedStatSettings.showClassSummary && embedStatSettings.showEnemySummary && (
                            <ExpandableLogCard
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy-classes' }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        )}
                        {embedStatSettings.showIncomingStats && (
                            <>
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-attacks' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-cc' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-strips' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-blank' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                            </>
                        )}
                        {Array.from({ length: enabledTopListCount }, (_, index) => (
                            <ExpandableLogCard
                                key={`toplist-tile-${index}`}
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'toplist', tileIndex: index }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        ))}
                        <ExpandableLogCard
                            log={screenshotData}
                            isExpanded={true}
                            onToggle={() => { }}
                            screenshotMode={true}
                            embedStatSettings={embedStatSettings}
                            disruptionMethod={disruptionMethod}
                            useClassIcons={showClassIcons}
                        />
                    </>
                ) : (
                    screenshotData && (
                        <ExpandableLogCard
                            log={screenshotData}
                            isExpanded={true}
                            onToggle={() => { }}
                            screenshotMode={true}
                            embedStatSettings={embedStatSettings}
                            disruptionMethod={disruptionMethod}
                            useClassIcons={showClassIcons}
                        />
                    )
                )}
            </div>

            <AnimatePresence>
                {devDatasetsEnabled && devDatasetsOpen && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-2xl bg-[#161c24]/95 border border-amber-500/30 rounded-2xl shadow-2xl"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className="px-6 pt-6 pb-4 border-b border-amber-500/20 flex items-center justify-between">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-amber-200/70">Dev Mode</div>
                                    <h3 className="text-xl font-semibold text-amber-100">Datasets</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={loadDevDatasets}
                                        className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20 transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                        disabled={devDatasetRefreshing}
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${devDatasetRefreshing ? 'animate-spin' : ''}`} />
                                        {devDatasetRefreshing ? 'Refreshing...' : 'Refresh'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDevDatasetsOpen(false)}
                                        className="p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:text-amber-50 hover:border-amber-400/60 transition-colors"
                                        aria-label="Close datasets"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="px-6 py-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        value={devDatasetName}
                                        onChange={(e) => setDevDatasetName(e.target.value)}
                                        placeholder="Dataset name"
                                        className="flex-1 min-w-[200px] bg-black/50 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400/60"
                                    />
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (devDatasetSaving) return;
                                            const name = devDatasetName.trim();
                                            if (!name) return;
                                            if (!window.electronAPI?.beginDevDatasetSave) return;
                                            setDevDatasetSaving(true);
                                            devDatasetSavingIdRef.current = null;
                                            setDevDatasetSaveProgress(null);
                                            await new Promise((resolve) => setTimeout(resolve, 0));
                                            try {
                                                const result = await window.electronAPI.beginDevDatasetSave({
                                                    name,
                                                    report: {
                                                        stats: computedStats,
                                                        skillUsageData: computedSkillUsageData
                                                    },
                                                    snapshot: {
                                                        schemaVersion: 1,
                                                        capturedAt: new Date().toISOString(),
                                                        appVersion,
                                                        state: {
                                                            view,
                                                            expandedLogId,
                                                            notificationType,
                                                            embedStatSettings,
                                                            mvpWeights,
                                                            statsViewSettings,
                                                            disruptionMethod,
                                                            uiTheme,
                                                            selectedWebhookId,
                                                            bulkUploadMode,
                                                            datasetLogOrder: logs.map((_, index) => `logs/log-${index + 1}.json`),
                                                            datasetLogIds: logs.map((log, index) => log.id || `dev-log-${index + 1}`)
                                                        }
                                                    } satisfies IDevDatasetSnapshot
                                                });
                                                if (!result?.success || !result.dataset?.id) return;
                                                const datasetId = result.dataset.id;
                                                devDatasetSavingIdRef.current = datasetId;
                                                setDevDatasets((prev) => [result.dataset!, ...prev]);
                                                setDevDatasetLoadModes((prev) => ({ ...prev, [datasetId]: prev[datasetId] || 'frozen' }));
                                                setDevDatasetName('');
                                                const snapshot = logs.slice();
                                                const chunkSize = 20;
                                                const total = snapshot.length;
                                                const chunks: Array<{ startIndex: number; logs: ILogData[] }> = [];
                                                for (let i = 0; i < snapshot.length; i += chunkSize) {
                                                    chunks.push({ startIndex: i, logs: snapshot.slice(i, i + chunkSize) });
                                                }
                                                let completed = 0;
                                                const maxConcurrent = 3;
                                                let nextIndex = 0;
                                                const runWorker = async () => {
                                                    while (nextIndex < chunks.length) {
                                                        const currentIndex = nextIndex;
                                                        nextIndex += 1;
                                                        const chunk = chunks[currentIndex];
                                                        if (window.electronAPI?.appendDevDatasetLogs) {
                                                            await window.electronAPI.appendDevDatasetLogs({
                                                                id: datasetId,
                                                                logs: chunk.logs,
                                                                startIndex: chunk.startIndex,
                                                                total
                                                            });
                                                        }
                                                        completed += 1;
                                                        const written = Math.min(completed * chunkSize, total);
                                                        setDevDatasetSaveProgress({
                                                            id: datasetId,
                                                            stage: 'logs',
                                                            written,
                                                            total
                                                        });
                                                    }
                                                };
                                                await Promise.all(Array.from({ length: Math.min(maxConcurrent, chunks.length) }, () => runWorker()));
                                                if (window.electronAPI?.finishDevDatasetSave) {
                                                    await window.electronAPI.finishDevDatasetSave({ id: datasetId, total });
                                                }
                                                setDevDatasetSaveProgress({
                                                    id: datasetId,
                                                    stage: 'done',
                                                    written: total,
                                                    total
                                                });
                                            } finally {
                                                setDevDatasetSaving(false);
                                                devDatasetSavingIdRef.current = null;
                                            }
                                        }}
                                        className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                        disabled={devDatasetSaving}
                                    >
                                        {devDatasetSaving ? (
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <FilePlus2 className="w-3.5 h-3.5" />
                                        )}
                                        {devDatasetSaving ? 'Saving...' : 'Save Current'}
                                        {devDatasetSaving && devDatasetSaveProgress?.stage === 'logs' && devDatasetSaveProgress.total > 0
                                            ? ` (${Math.round((devDatasetSaveProgress.written / devDatasetSaveProgress.total) * 100)}%)`
                                            : ''}
                                    </button>
                                </div>
                                <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                                    {devDatasets.length === 0 ? (
                                        <div className="text-xs text-amber-200/60 italic py-6 text-center">No datasets saved.</div>
                                    ) : (
                                        devDatasets.map((dataset) => (
                                            <div key={dataset.id} className="flex items-center justify-between gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-amber-100 truncate">{dataset.name}</div>
                                                    <div className="text-[10px] text-amber-200/60">{new Date(dataset.createdAt).toLocaleString()}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-black/40 p-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDevDatasetLoadModes((prev) => ({ ...prev, [dataset.id]: 'frozen' }))}
                                                            className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${((devDatasetLoadModes[dataset.id] || 'frozen') === 'frozen')
                                                                ? 'bg-amber-400/25 text-amber-100'
                                                                : 'text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/10'
                                                                }`}
                                                        >
                                                            Frozen
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDevDatasetLoadModes((prev) => ({ ...prev, [dataset.id]: 'recompute' }))}
                                                            className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${((devDatasetLoadModes[dataset.id] || 'frozen') === 'recompute')
                                                                ? 'bg-amber-400/25 text-amber-100'
                                                                : 'text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/10'
                                                                }`}
                                                        >
                                                            Recompute
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (devDatasetLoadingId) return;
                                                            if (!window.electronAPI?.loadDevDatasetChunked && !window.electronAPI?.loadDevDataset) return;
                                                            const loadMode = devDatasetLoadModes[dataset.id] || 'frozen';
                                                            setDevDatasetLoadingId(dataset.id);
                                                            setDevDatasetLoadProgress({ id: dataset.id, name: dataset.name, loaded: 0, total: null, done: false });
                                                            setLogs([]);
                                                            setLogsForStats([]);
                                                            logsRef.current = [];
                                                            setPrecomputedStats(null);
                                                            setScreenshotData(null);
                                                            canceledLogsRef.current.clear();
                                                            try {
                                                                if (window.electronAPI?.loadDevDatasetChunked) {
                                                                    let result = await window.electronAPI.loadDevDatasetChunked({ id: dataset.id, chunkSize: 25 });
                                                                    if (!result?.success && result?.canLoadLogsOnly) {
                                                                        const issueText = Array.isArray(result.integrity?.issues) ? result.integrity?.issues.join('\n') : (result.error || 'Dataset integrity check failed.');
                                                                        const confirmed = window.confirm(`Dataset integrity check failed.\n\n${issueText}\n\nLoad logs only and recompute stats?`);
                                                                        if (!confirmed) return;
                                                                        result = await window.electronAPI.loadDevDatasetChunked({
                                                                            id: dataset.id,
                                                                            chunkSize: 25,
                                                                            allowLogsOnlyOnIntegrityFailure: true
                                                                        });
                                                                    }
                                                                    if (!result?.success || !result.dataset) return;
                                                                    datasetLoadRef.current = true;
                                                                    devDatasetStreamingIdRef.current = dataset.id;
                                                                    const useFrozen = loadMode === 'frozen' && !result.logsOnlyFallback;
                                                                    if (useFrozen) {
                                                                        applyDevDatasetSnapshot(result.dataset.snapshot as IDevDatasetSnapshot | null);
                                                                    }
                                                                    setPrecomputedStats(useFrozen ? (result.dataset.report || null) : null);
                                                                    setDevDatasetsOpen(false);
                                                                    if (typeof result.totalLogs === 'number') {
                                                                        const totalLogs = result.totalLogs;
                                                                        setDevDatasetLoadProgress((prev) => (prev && prev.id === dataset.id ? { ...prev, total: totalLogs } : prev));
                                                                    }
                                                                } else {
                                                                    let result = await window.electronAPI.loadDevDataset({ id: dataset.id });
                                                                    if (!result?.success && result?.canLoadLogsOnly) {
                                                                        const issueText = Array.isArray(result.integrity?.issues) ? result.integrity?.issues.join('\n') : (result.error || 'Dataset integrity check failed.');
                                                                        const confirmed = window.confirm(`Dataset integrity check failed.\n\n${issueText}\n\nLoad logs only and recompute stats?`);
                                                                        if (!confirmed) return;
                                                                        result = await window.electronAPI.loadDevDataset({
                                                                            id: dataset.id,
                                                                            allowLogsOnlyOnIntegrityFailure: true
                                                                        });
                                                                    }
                                                                    if (!result?.success || !result.dataset) return;
                                                                    datasetLoadRef.current = true;
                                                                    const useFrozen = loadMode === 'frozen' && !result.logsOnlyFallback;
                                                                    if (useFrozen) {
                                                                        applyDevDatasetSnapshot(result.dataset.snapshot as IDevDatasetSnapshot | null);
                                                                    }
                                                                    setLogs(result.dataset.logs || []);
                                                                    setPrecomputedStats(useFrozen ? (result.dataset.report || null) : null);
                                                                    setDevDatasetsOpen(false);
                                                                    const total = Array.isArray(result.dataset.logs) ? result.dataset.logs.length : 0;
                                                                    setDevDatasetLoadProgress((prev) => (prev && prev.id === dataset.id ? { ...prev, loaded: total, total, done: true } : prev));
                                                                    window.setTimeout(() => {
                                                                        setDevDatasetLoadProgress((prev) => (prev?.id === dataset.id ? null : prev));
                                                                    }, 1500);
                                                                }
                                                            } finally {
                                                                if (!devDatasetStreamingIdRef.current) {
                                                                    setDevDatasetLoadingId(null);
                                                                }
                                                            }
                                                        }}
                                                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                                        disabled={devDatasetLoadingId === dataset.id}
                                                    >
                                                        {devDatasetLoadingId === dataset.id ? (
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                        ) : null}
                                                        {devDatasetLoadingId === dataset.id ? 'Loading...' : 'Load'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (devDatasetDeleteConfirmId !== dataset.id) {
                                                                setDevDatasetDeleteConfirmId(dataset.id);
                                                                return;
                                                            }
                                                            try {
                                                                if (window.electronAPI?.deleteDevDataset) {
                                                                    await window.electronAPI.deleteDevDataset({ id: dataset.id });
                                                                }
                                                                setDevDatasets((prev) => prev.filter((entry) => entry.id !== dataset.id));
                                                                setDevDatasetLoadModes((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[dataset.id];
                                                                    return next;
                                                                });
                                                            } finally {
                                                                setDevDatasetDeleteConfirmId(null);
                                                            }
                                                        }}
                                                        className={`relative overflow-hidden px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${devDatasetDeleteConfirmId === dataset.id
                                                            ? 'border-red-500 bg-red-600 text-white'
                                                            : 'border-amber-700/40 bg-amber-700/10 text-amber-200 hover:bg-amber-700/20'
                                                            }`}
                                                        disabled={devDatasetLoadingId === dataset.id}
                                                    >
                                                        <motion.span
                                                            aria-hidden
                                                            className="absolute inset-0 bg-red-600"
                                                            initial={false}
                                                            animate={{ x: devDatasetDeleteConfirmId === dataset.id ? '0%' : '-100%' }}
                                                            transition={{ duration: 0.2, ease: 'easeOut' }}
                                                        />
                                                        <AnimatePresence mode="wait" initial={false}>
                                                            <motion.span
                                                                key={devDatasetDeleteConfirmId === dataset.id ? `confirm-${dataset.id}` : `delete-${dataset.id}`}
                                                                className="relative z-10 inline-flex"
                                                                initial={{ opacity: 0, x: 8 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0, x: -8 }}
                                                                transition={{ duration: 0.16 }}
                                                            >
                                                                {devDatasetDeleteConfirmId === dataset.id ? 'Confirm?' : 'Delete'}
                                                            </motion.span>
                                                        </AnimatePresence>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="px-6 pb-5 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setDevDatasetsOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:text-amber-50 hover:border-amber-400/60 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {filePickerOpen && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-2xl bg-[#161c24]/95 border border-white/10 rounded-2xl shadow-2xl p-6"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-cyan-200/70">Log Import</div>
                                    <h3 className="text-xl font-semibold text-white">Select Logs to Upload</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        setFilePickerOpen(false);
                                        setFilePickerError(null);
                                        setFilePickerSelected(new Set());
                                    }}
                                    className="p-2 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/30"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-xs uppercase tracking-widest text-gray-500">Available Logs</div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => loadLogFiles(logDirectory)}
                                                className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                            >
                                                Refresh
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (filePickerSelected.size > 0) {
                                                        setFilePickerSelected(new Set());
                                                        return;
                                                    }
                                                    setSelectSinceOpen((prev) => {
                                                        const next = !prev;
                                                        if (next) {
                                                            const now = new Date();
                                                            setSelectSinceView(new Date(now.getFullYear(), now.getMonth(), 1));
                                                            setSelectSinceDate((current) => current ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()));
                                                            const hour24 = now.getHours();
                                                            const meridiem = hour24 >= 12 ? 'PM' : 'AM';
                                                            const hour12 = hour24 % 12 || 12;
                                                            setSelectSinceHour(hour12);
                                                            setSelectSinceMinute(now.getMinutes());
                                                            setSelectSinceMeridiem(meridiem);
                                                            setSelectSinceMonthOpen(false);
                                                        }
                                                        return next;
                                                    });
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filePickerSelected.size > 0
                                                    ? 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    : 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30'
                                                    }`}
                                            >
                                                {filePickerSelected.size > 0 ? 'Clear Selection' : 'Select Since'}
                                            </button>
                                        </div>
                                    </div>
                                    <AnimatePresence>
                                        {selectSinceOpen && filePickerSelected.size === 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                                className="absolute z-20 left-4 right-4 top-[56px] rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-2xl shadow-black/40"
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="text-xs uppercase tracking-widest text-gray-400">Select Since</div>
                                                    <div className="text-[10px] text-gray-500">
                                                        {selectSinceDate
                                                            ? `${selectSinceDate.toLocaleDateString()} • ${selectSinceHour.toString().padStart(2, '0')}:${selectSinceMinute.toString().padStart(2, '0')} ${selectSinceMeridiem}`
                                                            : 'Pick a date'}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <button
                                                                onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                                className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                aria-label="Previous month"
                                                            >
                                                                <ChevronLeft className="w-3.5 h-3.5" />
                                                            </button>
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setSelectSinceMonthOpen((prev) => !prev)}
                                                                    className="text-sm font-semibold text-gray-200 hover:text-white"
                                                                >
                                                                    {selectSinceView.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                                                                </button>
                                                                <AnimatePresence>
                                                                    {selectSinceMonthOpen && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                            transition={{ duration: 0.14, ease: 'easeOut' }}
                                                                            className="absolute z-10 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-2xl p-2"
                                                                        >
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <button
                                                                                    onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
                                                                                    className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                                    aria-label="Previous year"
                                                                                >
                                                                                    <ChevronLeft className="w-3 h-3" />
                                                                                </button>
                                                                                <div className="text-[11px] text-gray-300">
                                                                                    {selectSinceView.getFullYear()}
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
                                                                                    className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                                    aria-label="Next year"
                                                                                >
                                                                                    <ChevronRight className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="grid grid-cols-3 gap-1">
                                                                                {Array.from({ length: 12 }, (_, i) => (
                                                                                    <button
                                                                                        key={`month-${i}`}
                                                                                        onClick={() => {
                                                                                            setSelectSinceView((prev) => new Date(prev.getFullYear(), i, 1));
                                                                                            setSelectSinceMonthOpen(false);
                                                                                        }}
                                                                                        className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selectSinceView.getMonth() === i
                                                                                            ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50'
                                                                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                                            }`}
                                                                                    >
                                                                                        {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                                className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                aria-label="Next month"
                                                            >
                                                                <ChevronRight className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-2">
                                                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                                                                <div key={day} className="text-center">{day}</div>
                                                            ))}
                                                        </div>
                                                        {(() => {
                                                            const year = selectSinceView.getFullYear();
                                                            const month = selectSinceView.getMonth();
                                                            const firstDay = new Date(year, month, 1).getDay();
                                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                            const cells = Array.from({ length: firstDay + daysInMonth }, (_, idx) => idx);
                                                            return (
                                                                <div className="grid grid-cols-7 gap-1 text-xs">
                                                                    {cells.map((idx) => {
                                                                        if (idx < firstDay) {
                                                                            return <div key={`pad-${idx}`} />;
                                                                        }
                                                                        const day = idx - firstDay + 1;
                                                                        const isSelected = selectSinceDate
                                                                            && selectSinceDate.getFullYear() === year
                                                                            && selectSinceDate.getMonth() === month
                                                                            && selectSinceDate.getDate() === day;
                                                                        return (
                                                                            <button
                                                                                key={`day-${day}`}
                                                                                onClick={() => setSelectSinceDate(new Date(year, month, day))}
                                                                                className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center transition-colors ${isSelected
                                                                                    ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/50'
                                                                                    : 'text-gray-200 hover:bg-white/10'
                                                                                    }`}
                                                                            >
                                                                                {day}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Time</div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">Hour</div>
                                                                <div className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                                                        <button
                                                                            key={`hour-${hour}`}
                                                                            onClick={() => setSelectSinceHour(hour)}
                                                                            className={`w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-colors ${selectSinceHour === hour
                                                                                ? 'bg-cyan-500/30 text-cyan-100'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {hour.toString().padStart(2, '0')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">Minute</div>
                                                                <div className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                    {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                                                                        <button
                                                                            key={`minute-${minute}`}
                                                                            onClick={() => setSelectSinceMinute(minute)}
                                                                            className={`w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-colors ${selectSinceMinute === minute
                                                                                ? 'bg-cyan-500/30 text-cyan-100'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {minute.toString().padStart(2, '0')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">AM/PM</div>
                                                                <div className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                    {(['AM', 'PM'] as const).map((period) => (
                                                                        <button
                                                                            key={period}
                                                                            onClick={() => setSelectSinceMeridiem(period)}
                                                                            className={`w-full py-2 text-[10px] border-b border-white/5 last:border-0 transition-colors ${selectSinceMeridiem === period
                                                                                ? 'bg-cyan-500/30 text-cyan-100'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {period}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (!selectSinceDate) return;
                                                            const base = new Date(
                                                                selectSinceDate.getFullYear(),
                                                                selectSinceDate.getMonth(),
                                                                selectSinceDate.getDate()
                                                            );
                                                            let hour24 = selectSinceHour % 12;
                                                            if (selectSinceMeridiem === 'PM') {
                                                                hour24 += 12;
                                                            }
                                                            base.setHours(hour24, selectSinceMinute, 0, 0);
                                                            const sinceMs = base.getTime();
                                                            if (!Number.isFinite(sinceMs)) return;
                                                            ensureMonthWindowForSince(sinceMs);
                                                            const matching = filePickerAll.filter((entry) => {
                                                                if (!Number.isFinite(entry.mtimeMs)) return false;
                                                                return entry.mtimeMs >= sinceMs;
                                                            });
                                                            setFilePickerSelected((prev) => {
                                                                const next = new Set(prev);
                                                                matching.forEach((entry) => next.add(entry.path));
                                                                return next;
                                                            });
                                                            setSelectSinceOpen(false);
                                                        }}
                                                        className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30"
                                                    >
                                                        Apply
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectSinceOpen(false)}
                                                        className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <input
                                        type="search"
                                        value={filePickerFilter}
                                        onChange={(event) => setFilePickerFilter(event.target.value)}
                                        placeholder="Filter logs..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                    />
                                    {filePickerLoading ? (
                                        <div className="text-xs text-gray-500">Loading logs...</div>
                                    ) : filePickerAvailable.length === 0 ? (
                                        <div className="text-xs text-gray-500">
                                            {filePickerAll.length > 0 ? 'No logs in the last 30 days.' : 'No logs found in this folder.'}
                                        </div>
                                    ) : (
                                        <div
                                            ref={filePickerListRef}
                                            onScroll={(event) => {
                                                const target = event.currentTarget;
                                                const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 4;
                                                setFilePickerAtBottom(atBottom);
                                            }}
                                            className="max-h-56 overflow-y-auto space-y-1 pr-1 text-xs text-gray-300"
                                        >
                                            {filePickerAvailable
                                                .filter((entry) => entry.name.toLowerCase().includes(filePickerFilter.trim().toLowerCase()))
                                                .map((entry, index, filtered) => {
                                                    const timestamp = Number.isFinite(entry.mtimeMs)
                                                        ? new Date(entry.mtimeMs).toLocaleString(undefined, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })
                                                        : null;
                                                    return (
                                                        <div
                                                            key={entry.path}
                                                            className={`flex items-center gap-2 px-2 py-1 rounded-lg border cursor-pointer select-none ${filePickerSelected.has(entry.path)
                                                                ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-100'
                                                                : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                                                                }`}
                                                            onClick={(event) => {
                                                                if (event.shiftKey && lastPickedIndexRef.current !== null) {
                                                                    const start = Math.min(lastPickedIndexRef.current, index);
                                                                    const end = Math.max(lastPickedIndexRef.current, index);
                                                                    setFilePickerSelected((prev) => {
                                                                        const next = new Set(prev);
                                                                        for (let i = start; i <= end; i += 1) {
                                                                            next.add(filtered[i].path);
                                                                        }
                                                                        return next;
                                                                    });
                                                                } else {
                                                                    setFilePickerSelected((prev) => {
                                                                        const next = new Set(prev);
                                                                        if (next.has(entry.path)) {
                                                                            next.delete(entry.path);
                                                                        } else {
                                                                            next.add(entry.path);
                                                                        }
                                                                        return next;
                                                                    });
                                                                }
                                                                lastPickedIndexRef.current = index;
                                                            }}
                                                        >
                                                            <div className="h-3.5 w-3.5 rounded border border-white/20 flex items-center justify-center">
                                                                {filePickerSelected.has(entry.path) && (
                                                                    <div className="h-2 w-2 rounded-sm bg-cyan-300" />
                                                                )}
                                                            </div>
                                                            <span className="truncate flex-1">{entry.name}</span>
                                                            {timestamp && (
                                                                <span className="text-[10px] text-gray-500/80 font-medium whitespace-nowrap">
                                                                    {timestamp}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                    {!filePickerLoading && filePickerHasMore && filePickerAtBottom && (
                                        <div className="mt-3 flex justify-center">
                                            <button
                                                onClick={() => setFilePickerMonthWindow((prev) => prev + 1)}
                                                className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                            >
                                                Load more
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {filePickerError && (
                                    <div className="text-xs text-rose-300">{filePickerError}</div>
                                )}

                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => {
                                            setFilePickerOpen(false);
                                            setFilePickerError(null);
                                            setFilePickerSelected(new Set());
                                        }}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddSelectedFiles}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30"
                                    >
                                        Add to Recent Activity ({filePickerSelected.size})
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {webhookDropdownOpen && webhookDropdownStyle && createPortal(
                <div
                    ref={webhookDropdownPortalRef}
                    className="glass-dropdown rounded-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden"
                    style={webhookDropdownStyle}
                    role="listbox"
                >
                    <div className="relative z-10 max-h-64 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedWebhookId(null);
                                handleUpdateSettings({ selectedWebhookId: null });
                                setWebhookDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left ${uiTheme === 'modern' ? 'text-xs' : 'text-sm'} transition-colors ${!selectedWebhookId
                                ? 'bg-purple-500/20 text-purple-100'
                                : 'text-gray-300 hover:bg-white/10'
                                }`}
                            role="option"
                            aria-selected={!selectedWebhookId}
                        >
                            Disabled
                        </button>
                        {webhooks.map((hook) => (
                            <button
                                key={hook.id}
                                type="button"
                                onClick={() => {
                                    setSelectedWebhookId(hook.id);
                                    handleUpdateSettings({ selectedWebhookId: hook.id });
                                    setWebhookDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left ${uiTheme === 'modern' ? 'text-xs' : 'text-sm'} transition-colors ${selectedWebhookId === hook.id
                                    ? 'bg-purple-500/20 text-purple-100'
                                    : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                role="option"
                                aria-selected={selectedWebhookId === hook.id}
                            >
                                {hook.name}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}

            {/* Webhook Management Modal */}
            <WebhookModal
                isOpen={webhookModalOpen}
                onClose={() => setWebhookModalOpen(false)}
                webhooks={webhooks}
                onSave={(newWebhooks) => {
                    setWebhooks(newWebhooks);
                    handleUpdateSettings({ webhooks: newWebhooks });
                    // If the selected webhook was deleted, clear selection
                    if (selectedWebhookId && !newWebhooks.find(w => w.id === selectedWebhookId)) {
                        setSelectedWebhookId(null);
                        handleUpdateSettings({ selectedWebhookId: null });
                    }
                }}
            />

            {/* Update Error Modal */}
            <UpdateErrorModal
                isOpen={showUpdateErrorModal}
                onClose={() => setShowUpdateErrorModal(false)}
                error={updateError}
            />

            <WhatsNewModal
                isOpen={whatsNewOpen}
                onClose={handleWhatsNewClose}
                version={whatsNewVersion}
                releaseNotes={whatsNewNotes}
            />
            <WalkthroughModal
                isOpen={walkthroughOpen}
                onClose={handleWalkthroughClose}
                onLearnMore={handleWalkthroughLearnMore}
            />

            {/* Terminal */}
            <Terminal isOpen={showTerminal} onClose={() => setShowTerminal(false)} />
        </div >
    );
}

export default App;
