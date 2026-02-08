import { AnimatePresence, motion } from 'framer-motion';
import { FilePlus2, RefreshCw, X } from 'lucide-react';

export function DevDatasetsModal({ ctx }: { ctx: any }) {
    const {
        devDatasetsEnabled,
        devDatasetsOpen,
        loadDevDatasets,
        devDatasetRefreshing,
        setDevDatasetsOpen,
        devDatasetName,
        setDevDatasetName,
        devDatasetSaving,
        setDevDatasetSaving,
        devDatasetSavingIdRef,
        setDevDatasetSaveProgress,
        computedStats,
        computedSkillUsageData,
        appVersion,
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
        logs,
        setDevDatasets,
        setDevDatasetLoadModes,
        devDatasetSaveProgress,
        devDatasets,
        devDatasetLoadModes,
        setDevDatasetLoadingId,
        setDevDatasetLoadProgress,
        setLogs,
        setLogsForStats,
        logsRef,
        setPrecomputedStats,
        setScreenshotData,
        canceledLogsRef,
        datasetLoadRef,
        devDatasetStreamingIdRef,
        applyDevDatasetSnapshot,
        setDevDatasetDeleteConfirmId,
        devDatasetDeleteConfirmId,
        devDatasetLoadingId
    } = ctx;

    return (
        <AnimatePresence>
            {devDatasetsEnabled && devDatasetsOpen && (
                <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <motion.div className="w-full max-w-2xl bg-[#161c24]/95 border border-amber-500/30 rounded-2xl shadow-2xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                        <div className="px-6 pt-6 pb-4 border-b border-amber-500/20 flex items-center justify-between">
                            <div>
                                <div className="text-xs uppercase tracking-widest text-amber-200/70">Dev Mode</div>
                                <h3 className="text-xl font-semibold text-amber-100">Datasets</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={loadDevDatasets} className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20 transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed" disabled={devDatasetRefreshing}>
                                    <RefreshCw className={`w-3.5 h-3.5 ${devDatasetRefreshing ? 'animate-spin' : ''}`} />
                                    {devDatasetRefreshing ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <button type="button" onClick={() => setDevDatasetsOpen(false)} className="p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:text-amber-50 hover:border-amber-400/60 transition-colors" aria-label="Close datasets">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <input value={devDatasetName} onChange={(e) => setDevDatasetName(e.target.value)} placeholder="Dataset name" className="flex-1 min-w-[200px] bg-black/50 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-100 focus:outline-none focus:border-amber-400/60" />
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
                                                report: { stats: computedStats, skillUsageData: computedSkillUsageData },
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
                                                        datasetLogOrder: logs.map((_: any, index: number) => `logs/log-${index + 1}.json`),
                                                        datasetLogIds: logs.map((log: any, index: number) => log.id || `dev-log-${index + 1}`)
                                                    }
                                                }
                                            });
                                            if (!result?.success || !result.dataset?.id) return;
                                            const datasetId = result.dataset.id;
                                            devDatasetSavingIdRef.current = datasetId;
                                            setDevDatasets((prev: any[]) => [result.dataset!, ...prev]);
                                            setDevDatasetLoadModes((prev: Record<string, 'frozen' | 'recompute'>) => ({ ...prev, [datasetId]: prev[datasetId] || 'frozen' }));
                                            setDevDatasetName('');
                                            const snapshot = logs.slice();
                                            const chunkSize = 20;
                                            const total = snapshot.length;
                                            const chunks: Array<{ startIndex: number; logs: any[] }> = [];
                                            for (let i = 0; i < snapshot.length; i += chunkSize) chunks.push({ startIndex: i, logs: snapshot.slice(i, i + chunkSize) });
                                            let completed = 0;
                                            let nextIndex = 0;
                                            const runWorker = async () => {
                                                while (nextIndex < chunks.length) {
                                                    const currentIndex = nextIndex;
                                                    nextIndex += 1;
                                                    const chunk = chunks[currentIndex];
                                                    if (window.electronAPI?.appendDevDatasetLogs) {
                                                        await window.electronAPI.appendDevDatasetLogs({ id: datasetId, logs: chunk.logs, startIndex: chunk.startIndex, total });
                                                    }
                                                    completed += 1;
                                                    const written = Math.min(completed * chunkSize, total);
                                                    setDevDatasetSaveProgress({ id: datasetId, stage: 'logs', written, total });
                                                }
                                            };
                                            await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, () => runWorker()));
                                            if (window.electronAPI?.finishDevDatasetSave) await window.electronAPI.finishDevDatasetSave({ id: datasetId, total });
                                            setDevDatasetSaveProgress({ id: datasetId, stage: 'done', written: total, total });
                                        } finally {
                                            setDevDatasetSaving(false);
                                            devDatasetSavingIdRef.current = null;
                                        }
                                    }}
                                    className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                    disabled={devDatasetSaving}
                                >
                                    {devDatasetSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
                                    {devDatasetSaving ? 'Saving...' : 'Save Current'}
                                    {devDatasetSaving && devDatasetSaveProgress?.stage === 'logs' && devDatasetSaveProgress.total > 0 ? ` (${Math.round((devDatasetSaveProgress.written / devDatasetSaveProgress.total) * 100)}%)` : ''}
                                </button>
                            </div>
                            <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                                {devDatasets.length === 0 ? (
                                    <div className="text-xs text-amber-200/60 italic py-6 text-center">No datasets saved.</div>
                                ) : (
                                    devDatasets.map((dataset: any) => (
                                        <div key={dataset.id} className="flex items-center justify-between gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-amber-100 truncate">{dataset.name}</div>
                                                <div className="text-[10px] text-amber-200/60">{new Date(dataset.createdAt).toLocaleString()}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-black/40 p-1">
                                                    <button type="button" onClick={() => setDevDatasetLoadModes((prev: Record<string, 'frozen' | 'recompute'>) => ({ ...prev, [dataset.id]: 'frozen' }))} className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${((devDatasetLoadModes[dataset.id] || 'frozen') === 'frozen') ? 'bg-amber-400/25 text-amber-100' : 'text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/10'}`}>Frozen</button>
                                                    <button type="button" onClick={() => setDevDatasetLoadModes((prev: Record<string, 'frozen' | 'recompute'>) => ({ ...prev, [dataset.id]: 'recompute' }))} className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${((devDatasetLoadModes[dataset.id] || 'frozen') === 'recompute') ? 'bg-amber-400/25 text-amber-100' : 'text-amber-200/70 hover:text-amber-100 hover:bg-amber-500/10'}`}>Recompute</button>
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
                                                                    result = await window.electronAPI.loadDevDatasetChunked({ id: dataset.id, chunkSize: 25, allowLogsOnlyOnIntegrityFailure: true });
                                                                }
                                                                if (!result?.success || !result.dataset) return;
                                                                datasetLoadRef.current = true;
                                                                devDatasetStreamingIdRef.current = dataset.id;
                                                                const useFrozen = loadMode === 'frozen' && !result.logsOnlyFallback;
                                                                if (useFrozen) applyDevDatasetSnapshot(result.dataset.snapshot);
                                                                setPrecomputedStats(useFrozen ? (result.dataset.report || null) : null);
                                                                setDevDatasetsOpen(false);
                                                                if (typeof result.totalLogs === 'number') {
                                                                    setDevDatasetLoadProgress((prev: any) => (prev && prev.id === dataset.id ? { ...prev, total: result.totalLogs } : prev));
                                                                }
                                                            } else {
                                                                let result = await window.electronAPI.loadDevDataset({ id: dataset.id });
                                                                if (!result?.success && result?.canLoadLogsOnly) {
                                                                    const issueText = Array.isArray(result.integrity?.issues) ? result.integrity?.issues.join('\n') : (result.error || 'Dataset integrity check failed.');
                                                                    const confirmed = window.confirm(`Dataset integrity check failed.\n\n${issueText}\n\nLoad logs only and recompute stats?`);
                                                                    if (!confirmed) return;
                                                                    result = await window.electronAPI.loadDevDataset({ id: dataset.id, allowLogsOnlyOnIntegrityFailure: true });
                                                                }
                                                                if (!result?.success || !result.dataset) return;
                                                                datasetLoadRef.current = true;
                                                                const useFrozen = loadMode === 'frozen' && !result.logsOnlyFallback;
                                                                if (useFrozen) applyDevDatasetSnapshot(result.dataset.snapshot);
                                                                setLogs(result.dataset.logs || []);
                                                                setPrecomputedStats(useFrozen ? (result.dataset.report || null) : null);
                                                                setDevDatasetsOpen(false);
                                                                const total = Array.isArray(result.dataset.logs) ? result.dataset.logs.length : 0;
                                                                setDevDatasetLoadProgress((prev: any) => (prev && prev.id === dataset.id ? { ...prev, loaded: total, total, done: true } : prev));
                                                                window.setTimeout(() => {
                                                                    setDevDatasetLoadProgress((prev: any) => (prev?.id === dataset.id ? null : prev));
                                                                }, 1500);
                                                            }
                                                        } finally {
                                                            if (!devDatasetStreamingIdRef.current) setDevDatasetLoadingId(null);
                                                        }
                                                    }}
                                                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                                                    disabled={devDatasetLoadingId === dataset.id}
                                                >
                                                    {devDatasetLoadingId === dataset.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
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
                                                            if (window.electronAPI?.deleteDevDataset) await window.electronAPI.deleteDevDataset({ id: dataset.id });
                                                            setDevDatasets((prev: any[]) => prev.filter((entry) => entry.id !== dataset.id));
                                                            setDevDatasetLoadModes((prev: Record<string, 'frozen' | 'recompute'>) => {
                                                                const next = { ...prev };
                                                                delete next[dataset.id];
                                                                return next;
                                                            });
                                                        } finally {
                                                            setDevDatasetDeleteConfirmId(null);
                                                        }
                                                    }}
                                                    className={`relative overflow-hidden px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${devDatasetDeleteConfirmId === dataset.id ? 'border-red-500 bg-red-600 text-white' : 'border-amber-700/40 bg-amber-700/10 text-amber-200 hover:bg-amber-700/20'}`}
                                                    disabled={devDatasetLoadingId === dataset.id}
                                                >
                                                    <motion.span aria-hidden className="absolute inset-0 bg-red-600" initial={false} animate={{ x: devDatasetDeleteConfirmId === dataset.id ? '0%' : '-100%' }} transition={{ duration: 0.2, ease: 'easeOut' }} />
                                                    <AnimatePresence mode="wait" initial={false}>
                                                        <motion.span key={devDatasetDeleteConfirmId === dataset.id ? `confirm-${dataset.id}` : `delete-${dataset.id}`} className="relative z-10 inline-flex" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
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
                            <button type="button" onClick={() => setDevDatasetsOpen(false)} className="px-4 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:text-amber-50 hover:border-amber-400/60 transition-colors">Close</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
