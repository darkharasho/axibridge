import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import {
    DEFAULT_EMBED_STATS,
    DEFAULT_MVP_WEIGHTS,
    DEFAULT_STATS_VIEW_SETTINGS,
    type DisruptionMethod,
    type IDevDatasetSnapshot,
    type IEmbedStatSettings,
    type IMvpWeights,
    type IStatsViewSettings,
    type UiTheme
} from '../../global.d';

interface UseDevDatasetsOptions {
    view: 'dashboard' | 'stats' | 'history' | 'settings';
    bulkUploadMode: boolean;
    setView: Dispatch<SetStateAction<'dashboard' | 'stats' | 'history' | 'settings'>>;
    logs: ILogData[];
    setLogs: Dispatch<SetStateAction<ILogData[]>>;
    setExpandedLogId: Dispatch<SetStateAction<string | null>>;
    setNotificationType: Dispatch<SetStateAction<'image' | 'image-beta' | 'embed'>>;
    setEmbedStatSettings: Dispatch<SetStateAction<IEmbedStatSettings>>;
    setMvpWeights: Dispatch<SetStateAction<IMvpWeights>>;
    setStatsViewSettings: Dispatch<SetStateAction<IStatsViewSettings>>;
    setDisruptionMethod: Dispatch<SetStateAction<DisruptionMethod>>;
    setUiTheme: Dispatch<SetStateAction<UiTheme>>;
    setSelectedWebhookId: Dispatch<SetStateAction<string | null>>;
    setBulkUploadMode: Dispatch<SetStateAction<boolean>>;
}

export function useDevDatasets({
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
}: UseDevDatasetsOptions) {
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
    const [bulkCalculatingActive, setBulkCalculatingActive] = useState(false);
    const [devDatasetLoadProgress, setDevDatasetLoadProgress] = useState<{ id: string; name: string; loaded: number; total: number | null; done: boolean } | null>(null);
    const [logsForStats, setLogsForStats] = useState<ILogData[]>(logs);
    const statsBatchTimerRef = useRef<number | null>(null);
    const logsRef = useRef<ILogData[]>(logs);
    const statsObjectIdMapRef = useRef<WeakMap<object, number>>(new WeakMap());
    const nextStatsObjectIdRef = useRef(1);
    const lastPublishedStatsKeyRef = useRef('');
    const [statsViewMounted, setStatsViewMounted] = useState(false);
    const hasPendingStatsDetails = logs.some((log) => {
        if (log.details || log.statsDetailsLoaded) return false;
        if (log.detailsKnownUnavailable) return false;
        if (log.detailsAvailable) return true;
        return (log.status === 'success' || log.status === 'calculating' || log.status === 'discord') && Boolean(log.permalink) && !log.detailsFetchExhausted;
    });
    const getStatsObjectId = useCallback((value: unknown): number => {
        if (!value || typeof value !== 'object') return 0;
        const objectValue = value as object;
        const existing = statsObjectIdMapRef.current.get(objectValue);
        if (typeof existing === 'number') return existing;
        const nextId = nextStatsObjectIdRef.current;
        nextStatsObjectIdRef.current += 1;
        statsObjectIdMapRef.current.set(objectValue, nextId);
        return nextId;
    }, []);
    const buildStatsSnapshotKey = useCallback((entries: ILogData[]) => {
        let key = `len:${entries.length}`;
        entries.forEach((log, index) => {
            const details = log?.details && typeof log.details === 'object' ? log.details : null;
            const detailsId = details ? getStatsObjectId(details) : 0;
            const logId = details ? 0 : getStatsObjectId(log);
            const identifier = String(log?.filePath || log?.id || `idx-${index}`);
            const permalink = String(log?.permalink || (details as any)?.permalink || '');
            const uploadTime = Number(log?.uploadTime || (details as any)?.uploadTime || 0);
            const successValue = (details as any)?.success;
            const successToken = successValue === true ? '1' : successValue === false ? '0' : 'u';
            key += `|${identifier}:${detailsId}:${logId}:${uploadTime}:${successToken}:${permalink}`;
        });
        return key;
    }, [getStatsObjectId]);
    const mergeLogsForStatsSnapshot = useCallback((entries: ILogData[], previous: ILogData[]) => {
        if (entries.length === 0) return entries;
        if (previous.length === 0) return entries;
        const previousByIdentity = new Map<string, ILogData>();
        previous.forEach((entry, index) => {
            const identity = String(entry?.filePath || entry?.id || `idx-${index}`);
            if (!identity) return;
            previousByIdentity.set(identity, entry);
        });
        let changed = false;
        const merged = entries.map((entry, index) => {
            const identity = String(entry?.filePath || entry?.id || `idx-${index}`);
            const previousEntry = previousByIdentity.get(identity);
            if (!previousEntry) return entry;
            const shouldCarryDetails = !entry.details && !!previousEntry.details;
            const shouldCarryStatsLoaded = !entry.statsDetailsLoaded && !!previousEntry.statsDetailsLoaded;
            const shouldPromoteStatus = shouldCarryStatsLoaded && entry.status === 'calculating';
            if (!shouldCarryDetails && !shouldCarryStatsLoaded && !shouldPromoteStatus) {
                return entry;
            }
            changed = true;
            const nextEntry: ILogData = { ...entry };
            if (shouldCarryDetails) {
                nextEntry.details = previousEntry.details;
            }
            if (shouldCarryStatsLoaded) {
                nextEntry.statsDetailsLoaded = true;
            }
            if (shouldPromoteStatus) {
                nextEntry.status = 'success';
            }
            return nextEntry;
        });
        return changed ? merged : entries;
    }, []);
    const publishLogsForStats = useCallback((entries: ILogData[]) => {
        setLogsForStats((prev) => {
            const mergedEntries = mergeLogsForStatsSnapshot(entries, prev);
            const nextKey = buildStatsSnapshotKey(mergedEntries);
            if (nextKey === lastPublishedStatsKeyRef.current) {
                return prev;
            }
            lastPublishedStatsKeyRef.current = nextKey;
            return mergedEntries;
        });
    }, [buildStatsSnapshotKey, mergeLogsForStatsSnapshot]);

    const applyDevDatasetSnapshot = useCallback((snapshot: IDevDatasetSnapshot | null | undefined) => {
        const state = snapshot?.state;
        if (!state || typeof state !== 'object') return;

        if (state.view === 'dashboard' || state.view === 'stats' || state.view === 'history' || state.view === 'settings') {
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
        if (state.uiTheme === 'classic' || state.uiTheme === 'modern' || state.uiTheme === 'crt' || state.uiTheme === 'matte') {
            setUiTheme(state.uiTheme);
        }
        if (state.selectedWebhookId === null || typeof state.selectedWebhookId === 'string') {
            setSelectedWebhookId(state.selectedWebhookId ?? null);
        }
        if (typeof state.bulkUploadMode === 'boolean') {
            setBulkUploadMode(state.bulkUploadMode);
        }
    }, [setView, setExpandedLogId, setNotificationType, setEmbedStatSettings, setMvpWeights, setStatsViewSettings, setDisruptionMethod, setUiTheme, setSelectedWebhookId, setBulkUploadMode]);

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
        lastPublishedStatsKeyRef.current = buildStatsSnapshotKey(logsForStats);
    }, [buildStatsSnapshotKey, logsForStats]);

    useEffect(() => {
        if (view !== 'stats') {
            if (statsBatchTimerRef.current) {
                window.clearTimeout(statsBatchTimerRef.current);
                statsBatchTimerRef.current = null;
            }
            return;
        }
        if (bulkUploadMode) {
            if (statsBatchTimerRef.current) {
                window.clearTimeout(statsBatchTimerRef.current);
                statsBatchTimerRef.current = null;
            }
            return;
        }
        if (statsBatchTimerRef.current) return;
        statsBatchTimerRef.current = window.setTimeout(() => {
            statsBatchTimerRef.current = null;
            publishLogsForStats(logsRef.current);
        }, 1200);
    }, [logs, view, bulkUploadMode, publishLogsForStats]);

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    useEffect(() => {
        return () => {
            if (statsBatchTimerRef.current) {
                window.clearTimeout(statsBatchTimerRef.current);
                statsBatchTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (view === 'stats') {
            setStatsViewMounted(true);
            if (!bulkUploadMode) {
                publishLogsForStats(logsRef.current);
            }
        }
    }, [view, bulkUploadMode, publishLogsForStats]);

    useEffect(() => {
        if (view !== 'stats') return;
        if (bulkUploadMode) return;
        if (logsForStats.length === logs.length) return;
        publishLogsForStats(logsRef.current);
    }, [view, bulkUploadMode, logs.length, logsForStats.length, publishLogsForStats]);

    useEffect(() => {
        if (view !== 'stats') return;
        if (bulkUploadMode) return;
        if (hasPendingStatsDetails) return;
        // Publish a single full snapshot when pending detail hydration settles.
        publishLogsForStats(logsRef.current);
    }, [view, bulkUploadMode, hasPendingStatsDetails, publishLogsForStats]);

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
    }, [devDatasetsEnabled, setLogs]);

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

    return {
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
    };
}
