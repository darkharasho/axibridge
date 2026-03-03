import { useCallback, useEffect, useRef } from 'react';

export function useDetailsHydration({
    viewRef,
    logsRef,
    setLogs,
    setLogsDeferred,
    setLogsForStats,
}: {
    viewRef: React.MutableRefObject<string>;
    logsRef: React.MutableRefObject<ILogData[]>;
    setLogs: React.Dispatch<React.SetStateAction<ILogData[]>>;
    setLogsDeferred: (updater: (currentLogs: ILogData[]) => ILogData[]) => void;
    setLogsForStats: React.Dispatch<React.SetStateAction<ILogData[]>>;
}) {
    const pendingDetailsRef = useRef<Set<string>>(new Set());
    const hydrateDetailsQueueRef = useRef<number | null>(null);
    const hydrateDetailsRetryTimerRef = useRef<number | null>(null);
    const detailsHydrationAttemptsRef = useRef<Map<string, number>>(new Map());
    const MAX_DETAILS_HYDRATION_ATTEMPTS = 8;

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
    }, [setLogs]);

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
    }, [applyHydratedStatsBatch, setLogsDeferred, viewRef, logsRef]);

    useEffect(() => {
        return () => {
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

    return { fetchLogDetails, scheduleDetailsHydration, applyHydratedStatsBatch };
}
