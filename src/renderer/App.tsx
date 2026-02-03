import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS, DEFAULT_WEB_UPLOAD_STATE, DisruptionMethod, IEmbedStatSettings, IMvpWeights, IStatsViewSettings, IWebUploadState } from './global.d';
import { WhatsNewModal } from './WhatsNewModal';

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
    const [uiTheme, setUiTheme] = useState<'classic' | 'modern'>('classic');
    const [webUploadState, setWebUploadState] = useState<IWebUploadState>(DEFAULT_WEB_UPLOAD_STATE);
    const webUploadClearTimerRef = useRef<number | null>(null);

    const [screenshotData, setScreenshotData] = useState<ILogData | null>(null);

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
    const [showDeveloperSettings, setShowDeveloperSettings] = useState(false);
    const settingsUpdateCheckRef = useRef(false);
    const versionClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const versionClickTimesRef = useRef<number[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('arcbridge.devSettings');
        if (saved === 'true') setShowDeveloperSettings(true);
    }, []);

    // View State
    const [view, setView] = useState<'dashboard' | 'stats' | 'settings'>('dashboard');

    // App Version
    const [appVersion, setAppVersion] = useState<string>('...');
    const [whatsNewOpen, setWhatsNewOpen] = useState(false);
    const [whatsNewVersion, setWhatsNewVersion] = useState<string>('');
    const [whatsNewNotes, setWhatsNewNotes] = useState<string | null>(null);

    // Webhook Management
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [webhookDropdownOpen, setWebhookDropdownOpen] = useState(false);
    const webhookDropdownRef = useRef<HTMLDivElement | null>(null);

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
    const devDatasetStreamingIdRef = useRef<string | null>(null);
    const [devDatasetSaveProgress, setDevDatasetSaveProgress] = useState<{ id: string; stage: string; written: number; total: number } | null>(null);
    const devDatasetSavingIdRef = useRef<string | null>(null);
    const logsListRef = useRef<HTMLDivElement | null>(null);
    const [bulkCalculatingActive, setBulkCalculatingActive] = useState(false);
    const [logsForStats, setLogsForStats] = useState<ILogData[]>(logs);
    const statsBatchTimerRef = useRef<number | null>(null);
    const logsRef = useRef<ILogData[]>(logs);

    const loadDevDatasets = useCallback(async () => {
        if (!window.electronAPI?.listDevDatasets) return;
        setDevDatasetRefreshing(true);
        try {
            const result = await window.electronAPI.listDevDatasets();
            if (result?.success && Array.isArray(result.datasets)) {
                setDevDatasets(result.datasets);
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
        if (!devDatasetsEnabled || !window.electronAPI?.onDevDatasetLogsChunk) return;
        const unsubscribe = window.electronAPI.onDevDatasetLogsChunk((payload: { id: string; logs: ILogData[]; done?: boolean }) => {
            if (!payload?.id || payload.id !== devDatasetStreamingIdRef.current) return;
            if (Array.isArray(payload.logs) && payload.logs.length > 0) {
                setLogs((prev) => [...prev, ...payload.logs]);
            }
            if (payload.done) {
                devDatasetStreamingIdRef.current = null;
                setDevDatasetLoadingId(null);
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
            const next = currentLogs.map((log) => {
                if (log.status === 'calculating') {
                    changed = true;
                    return { ...log, status: 'success' };
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
        () => bulkUploadMode || logs.some((log) => log.status === 'queued' || log.status === 'pending' || log.status === 'uploading' || log.status === 'calculating'),
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
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (webhookDropdownRef.current && !webhookDropdownRef.current.contains(target)) {
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
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [webhookDropdownOpen]);

    useEffect(() => {
        const body = document.body;
        body.classList.remove('theme-classic', 'theme-modern');
        body.classList.add(uiTheme === 'modern' ? 'theme-modern' : 'theme-classic');
    }, [uiTheme]);


    // Stats calculation
    const totalUploads = logs.length;
    const pendingUploads = logs.filter((log) =>
        log.status === 'queued' || log.status === 'pending' || log.status === 'uploading' || log.status === 'calculating'
    ).length;
    const completedUploads = totalUploads - pendingUploads;
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
            if (whatsNew.version && whatsNew.version !== whatsNew.lastSeenVersion) {
                setWhatsNewOpen(true);
            }
        };
        loadSettings();

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
                                    backgroundColor: '#0f172a',
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
                                    backgroundColor: transparent ? 'rgba(0,0,0,0)' : '#0f172a',
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
                                backgroundColor: '#0f172a', // Match bg-slate-900
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
                detail: data.message || prev.detail
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

    const handleWhatsNewClose = async () => {
        setWhatsNewOpen(false);
        if (whatsNewVersion) {
            await window.electronAPI.setLastSeenVersion(whatsNewVersion);
        }
    };

    const scheduleWebUploadClear = () => {
        if (webUploadClearTimerRef.current) {
            window.clearTimeout(webUploadClearTimerRef.current);
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
        try {
            const result = await window.electronAPI.uploadWebReport(payload);
            if (result?.success) {
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
                setWebUploadState((prev) => ({
                    ...prev,
                    message: result?.error || 'Upload failed.',
                    stage: 'Upload failed',
                    buildStatus: 'idle'
                }));
            }
        } catch (err: any) {
            setWebUploadState((prev) => ({
                ...prev,
                message: err?.message || 'Upload failed.',
                stage: 'Upload failed',
                buildStatus: 'idle'
            }));
        } finally {
            setWebUploadState((prev) => ({ ...prev, uploading: false }));
            scheduleWebUploadClear();
        }
    };

    const isModernTheme = uiTheme === 'modern';
    const appIconPath = `${import.meta.env.BASE_URL || './'}img/ArcBridgeGradient.png`;
    const isDev = import.meta.env.DEV;
    const shellClassName = isModernTheme
        ? 'app-shell h-screen w-screen text-white overflow-hidden flex flex-col'
        : 'app-shell h-screen w-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-gray-900 to-black text-white font-sans overflow-hidden flex flex-col';

    return (
        <div className={shellClassName}>
            {/* Custom Title Bar */}
            <div className="app-titlebar h-10 shrink-0 w-full flex justify-between items-center px-4 bg-black/20 backdrop-blur-md border-b border-white/5 drag-region select-none z-50">
                <div className="flex items-center gap-2">
                    <img src={appIconPath} alt="Icon" className="h-4 w-auto" />
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

            <div className={`app-content relative z-10 max-w-5xl mx-auto flex-1 w-full flex flex-col min-h-0 ${view === 'stats' ? 'pt-8 px-8 pb-2' : 'p-8'}`}>
                <header className="app-header flex justify-between items-center mb-10 shrink-0">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3"
                    >
                        <div className="flex items-center gap-3">
                            <img src={appIconPath} alt="ArcBridge" className="h-8 w-auto rounded-md" />
                            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                                ArcBridge
                            </h1>
                        </div>
                    </motion.div>
                    <div className="flex items-center gap-3">
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
                            className="text-xs font-medium px-3 py-1 bg-white/5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
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
                                    setShowDeveloperSettings(true);
                                    localStorage.setItem('arcbridge.devSettings', 'true');
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
                        <div className="w-full max-w-md bg-white/10 border border-white/15 rounded-2xl p-6 shadow-2xl backdrop-blur-2xl">
                            <div className="text-sm uppercase tracking-widest text-cyan-300/70">Web Upload</div>
                            <div className="text-2xl font-bold text-white mt-2">{webUploadState.stage || 'Uploading'}</div>
                            <div className="text-sm text-gray-400 mt-2">
                                {webUploadState.detail || webUploadState.message || 'Working...'}
                            </div>
                            <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                                    style={{ width: `${webUploadState.progress ?? (webUploadState.uploading ? 35 : 100)}%` }}
                                />
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                {typeof webUploadState.progress === 'number' ? `${Math.round(webUploadState.progress)}%` : 'Preparing...'}
                            </div>
                        </div>
                    </div>
                )}

                {view === 'stats' ? (
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
                    />
                ) : view === 'settings' ? (
                    <SettingsView
                        onBack={() => setView('dashboard')}
                        onEmbedStatSettingsSaved={setEmbedStatSettings}
                        onMvpWeightsSaved={setMvpWeights}
                        onStatsViewSettingsSaved={setStatsViewSettings}
                        onDisruptionMethodSaved={setDisruptionMethod}
                        onUiThemeSaved={setUiTheme}
                        showDeveloperSettings={showDeveloperSettings}
                        onOpenWhatsNew={() => setWhatsNewOpen(true)}
                    />
                ) : (
                    <div className="dashboard-view grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-hidden">
                        <div className="space-y-6 overflow-y-auto pr-2">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl hover:border-white/20 transition-colors"
                            >
                                <h2 className="text-lg font-semibold mb-4 text-gray-200 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-gray-400" />
                                    Configuration
                                </h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Log Directory</label>
                                        <div className="flex gap-2 w-full max-w-full">
                                            <div className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-xl p-2 flex items-center gap-3 hover:border-blue-500/50 transition-colors">
                                                <div className="pl-2 shrink-0">
                                                    <FolderOpen className="w-5 h-5 text-blue-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={logDirectory || ''}
                                                    placeholder="C:\...\arcdps.cbtlogs"
                                                    className="flex-1 bg-transparent border-none text-sm text-gray-300 placeholder-gray-600 focus:ring-0 px-2 min-w-0 w-full"
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
                                                className="shrink-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl px-4 flex items-center justify-center transition-colors"
                                                title="Browse..."
                                            >
                                                <FolderOpen className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Discord Webhook</label>
                                        <div className="flex gap-2">
                                            <div ref={webhookDropdownRef} className="relative flex-1 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setWebhookDropdownOpen((prev) => !prev)}
                                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-sm text-gray-300 hover:border-purple-500/50 hover:bg-black/50 transition-colors"
                                                    aria-haspopup="listbox"
                                                    aria-expanded={webhookDropdownOpen}
                                                >
                                                    <span className="truncate">
                                                        {selectedWebhook?.name || 'Disabled'}
                                                    </span>
                                                    <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${webhookDropdownOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                                {webhookDropdownOpen && (
                                                    <div
                                                        className="glass-dropdown absolute z-30 mt-2 w-full rounded-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden"
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
                                                                className={`w-full px-3 py-2 text-left text-sm transition-colors ${!selectedWebhookId
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
                                                                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${selectedWebhookId === hook.id
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
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => setWebhookModalOpen(true)}
                                                className="shrink-0 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl px-3 flex items-center justify-center gap-2 transition-colors"
                                                title="Manage Webhooks"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Notification Type</label>
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
                                    </div>
                                </div>


                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="grid grid-cols-2 gap-4"
                            >
                                <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-blue-200 text-xs font-medium mb-1 uppercase tracking-wider">Uploads</div>
                                    <div className="text-2xl font-bold text-white">
                                        <span className="text-amber-200">{pendingUploads}</span>
                                        <span className="text-gray-500 mx-2">/</span>
                                        <span className="text-emerald-300">{completedUploads}</span>
                                    </div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">W / L</div>
                                    <div className="text-2xl font-bold text-white">
                                        <span className="text-emerald-300">{winLoss.wins}</span>
                                        <span className="text-gray-500 mx-2">/</span>
                                        <span className="text-red-400">{winLoss.losses}</span>
                                    </div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">Avg Players</div>
                                    <div className="text-2xl font-bold text-white">
                                        <span className="text-emerald-300">{avgSquadSize}</span>
                                        <span className="text-gray-500 mx-2">/</span>
                                        <span className="text-red-400">{avgEnemies}</span>
                                    </div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">Squad KDR</div>
                                    <div className="text-2xl font-bold text-emerald-300">{squadKdr}</div>
                                </div>
                            </motion.div>
                        </div>

                        <div className="lg:col-span-2 flex flex-col min-h-0">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className={`bg-white/5 backdrop-blur-xl border ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'} rounded-2xl p-6 flex flex-col h-full shadow-2xl transition-all duration-300 relative`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'copy'; // Explicitly show copy cursor
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
                                        // On some systems 'path' is a property of the File object in Electron
                                        const filePath = (file as any).path;
                                        if (filePath && (file.name.endsWith('.evtc') || file.name.endsWith('.zevtc'))) {
                                            validFiles.push(filePath);
                                            // Create optimistic entry
                                            optimisticLogs.push({
                                                id: file.name, // Temporary ID
                                                filePath: filePath,
                                                status: 'pending',
                                                fightName: file.name,
                                                uploadTime: Date.now() / 1000,
                                                permalink: '' // Placeholder
                                            });
                                        }
                                    });

                                    if (validFiles.length > 0) {
                                        // Immediately show these logs in the UI
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
                        </div>
                    </div>
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
                            className="w-full max-w-2xl bg-[#0a0f1a]/95 border border-amber-500/30 rounded-2xl shadow-2xl"
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
                                                    }
                                                });
                                                if (!result?.success || !result.dataset?.id) return;
                                                const datasetId = result.dataset.id;
                                                devDatasetSavingIdRef.current = datasetId;
                                                setDevDatasets((prev) => [result.dataset!, ...prev]);
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
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (devDatasetLoadingId) return;
                                                            if (!window.electronAPI?.loadDevDatasetChunked && !window.electronAPI?.loadDevDataset) return;
                                                            setDevDatasetLoadingId(dataset.id);
                                                            try {
                                                                if (window.electronAPI?.loadDevDatasetChunked) {
                                                                    const result = await window.electronAPI.loadDevDatasetChunked({ id: dataset.id, chunkSize: 25 });
                                                                    if (!result?.success || !result.dataset) return;
                                                                    datasetLoadRef.current = true;
                                                                    devDatasetStreamingIdRef.current = dataset.id;
                                                                    setLogs([]);
                                                                    setPrecomputedStats(result.dataset.report || null);
                                                                    setExpandedLogId(null);
                                                                    setScreenshotData(null);
                                                                    canceledLogsRef.current.clear();
                                                                    setDevDatasetsOpen(false);
                                                                } else {
                                                                    const result = await window.electronAPI.loadDevDataset({ id: dataset.id });
                                                                    if (!result?.success || !result.dataset) return;
                                                                    datasetLoadRef.current = true;
                                                                    setLogs(result.dataset.logs || []);
                                                                    setPrecomputedStats(result.dataset.report || null);
                                                                    setExpandedLogId(null);
                                                                    setScreenshotData(null);
                                                                    canceledLogsRef.current.clear();
                                                                    setDevDatasetsOpen(false);
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
                                                            if (window.electronAPI?.deleteDevDataset) {
                                                                await window.electronAPI.deleteDevDataset({ id: dataset.id });
                                                            }
                                                            setDevDatasets((prev) => prev.filter((entry) => entry.id !== dataset.id));
                                                        }}
                                                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-700/40 bg-amber-700/10 text-amber-200 hover:bg-amber-700/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                        disabled={devDatasetLoadingId === dataset.id}
                                                    >
                                                        Delete
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
                            className="w-full max-w-2xl bg-[#101826]/90 border border-white/10 rounded-2xl shadow-2xl p-6"
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

            {/* Terminal */}
            <Terminal isOpen={showTerminal} onClose={() => setShowTerminal(false)} />
        </div >
    );
}

export default App;
