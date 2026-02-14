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
    view: 'dashboard' | 'stats' | 'settings';
    bulkUploadMode: boolean;
    setView: Dispatch<SetStateAction<'dashboard' | 'stats' | 'settings'>>;
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
    const [statsViewMounted, setStatsViewMounted] = useState(false);
    const hasPendingStatsDetails = logs.some((log) => log.detailsAvailable && !log.details);

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
        if (bulkUploadMode && view !== 'stats') {
            if (statsBatchTimerRef.current) {
                window.clearTimeout(statsBatchTimerRef.current);
                statsBatchTimerRef.current = null;
            }
            return;
        }
        if (view === 'stats' && hasPendingStatsDetails) {
            if (statsBatchTimerRef.current) {
                window.clearTimeout(statsBatchTimerRef.current);
                statsBatchTimerRef.current = null;
            }
            return;
        }
        if (statsBatchTimerRef.current) return;
        statsBatchTimerRef.current = window.setTimeout(() => {
            statsBatchTimerRef.current = null;
            setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));
        }, 5000);
    }, [logs, view, hasPendingStatsDetails, bulkUploadMode]);

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
            // During initial hydration, defer refreshes to avoid visibly jumping totals.
            if (!hasPendingStatsDetails) {
                setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));
            }
        }
    }, [view, hasPendingStatsDetails]);

    useEffect(() => {
        if (view !== 'stats') return;
        if (hasPendingStatsDetails) return;
        // Publish a single full snapshot when pending detail hydration settles.
        setLogsForStats((prev) => (prev === logsRef.current ? [...logsRef.current] : logsRef.current));
    }, [view, hasPendingStatsDetails]);

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
