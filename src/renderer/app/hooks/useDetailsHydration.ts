import { useCallback, useEffect, useRef } from 'react';
import type { DetailsCache } from '../../cache/DetailsCache';

/** Logs the hydration pass still needs to visit. 'available' always counts —
 *  cache misses need a fetch, and cache hits need their mark flipped to
 *  'loaded' (scheduleDetailsHydration does both). A cache-hit 'available' log
 *  that never gets visited stays pending-ingestion forever, which forces
 *  skipReplay on every aggregation flush and permanently disables the web
 *  upload. */
export const hasPendingDetailsHydration = (
    logs: ILogData[],
    detailsCache: { peek(logId: string): any } | null
): boolean => logs.some((log) => {
    const ds = log.detailsStatus || 'idle';
    if (ds === 'available') return true;
    if (detailsCache?.peek(log.id) || ds === 'loaded') return false;
    if (ds === 'exhausted' || ds === 'unavailable') return false;
    const status = log.status || 'queued';
    return (status === 'success' || status === 'calculating' || status === 'discord') && Boolean(log.permalink);
});

export function useDetailsHydration({
    viewRef: _viewRef,
    logsRef,
    setLogs,
    setLogsDeferred,
    setLogsForStats: _setLogsForStats,
    detailsCache,
}: {
    viewRef: React.MutableRefObject<string>;
    logsRef: React.MutableRefObject<ILogData[]>;
    setLogs: React.Dispatch<React.SetStateAction<ILogData[]>>;
    setLogsDeferred: (updater: (currentLogs: ILogData[]) => ILogData[]) => void;
    setLogsForStats: React.Dispatch<React.SetStateAction<ILogData[]>>;
    detailsCache: DetailsCache | null;
}) {
    const pendingDetailsRef = useRef<Set<string>>(new Set());
    const hydrateDetailsQueueRef = useRef<number | null>(null);
    const hydrateDetailsRetryTimerRef = useRef<number | null>(null);
    const detailsHydrationAttemptsRef = useRef<Map<string, number>>(new Map());
    const MAX_DETAILS_HYDRATION_ATTEMPTS = 8;

    const applyHydratedStatsBatch = useCallback((_batch: Array<{ filePath: string; details: any }>) => {
        // No-op: details are already in DetailsCache (putSync'd before this call).
        // The main `logs` state gets metadata flags via setLogsDeferred in flushHydratedBatch.
        // The force-touch after hydration completes (setLogsForStats((prev) => [...prev]))
        // triggers the single worker restart with a fully warm cache.
        //
        // Previously this called setLogsForStats to update statsDetailsLoaded flags,
        // but that created new array references every 8 hydrated details, restarting
        // the worker streaming effect and causing an infinite cycling loop on
        // memory-constrained systems with 30+ logs.
    }, []);

    const fetchLogDetails = useCallback(async (log: ILogData) => {
        if ((detailsCache?.peek(log.id)) || !log.filePath || !window.electronAPI?.getLogDetails) return;
        setLogs((currentLogs) => {
            const idx = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
            if (idx < 0) return currentLogs;
            const updated = [...currentLogs];
            updated[idx] = { ...updated[idx], detailsStatus: 'loading' as const };
            return updated;
        });
        let timeoutId: number | null = null;
        const result = await Promise.race([
            window.electronAPI.getLogDetails({
                filePath: log.filePath
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
                        detailsStatus: 'unavailable' as const,
                        status: existing.status === 'error' ? 'error' : 'success'
                    }
                    : { ...existing, detailsStatus: existing.detailsStatus === 'loading' ? 'idle' as const : existing.detailsStatus };
                return updated;
            });
            return;
        }
        // Populate LRU + IndexedDB (fire-and-forget — structured clone runs async)
        if (detailsCache && result.details) {
            if (log.id) detailsCache.putSync(log.id, result.details);
            if (log.filePath && log.filePath !== log.id) detailsCache.putSync(log.filePath, result.details);
        }
        setLogs((currentLogs) => {
            const existingIndex = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
            if (existingIndex < 0) return currentLogs;
            const updated = [...currentLogs];
            const existing = updated[existingIndex];
            updated[existingIndex] = {
                ...existing,
                detailsStatus: 'loaded' as const,
                // Don't force status to 'success' — let the aggregation
                // pipeline promote calculating → success after the worker
                // has actually ingested this log.
            };
            return updated;
        });
    }, [setLogs, detailsCache]);

    const scheduleDetailsHydration = useCallback((force = false) => {
        if (hydrateDetailsQueueRef.current !== null && !force) return;
        const schedule = typeof (window as any).requestIdleCallback === 'function'
            ? (window as any).requestIdleCallback
            : (cb: () => void) => window.setTimeout(cb, 150);
        hydrateDetailsQueueRef.current = schedule(async () => {
            hydrateDetailsQueueRef.current = null;
            if (!window.electronAPI?.getLogDetails) return;
            const rawCandidates = logsRef.current
                .filter((log) => {
                    if (!log.filePath) return false;
                    // Re-hydrate if cached details exist but are missing fields added in later versions,
                    // or if targets are missing buffs data needed for outgoing condition uptime
                    const cachedDetails = detailsCache?.peek(log.id);
                    const targetsLackBuffs = Array.isArray(cachedDetails?.targets) &&
                        cachedDetails.targets.length > 1 &&
                        !cachedDetails.targets.some((t: any) => Array.isArray(t?.buffs) && t.buffs.length > 0);
                    const hasStaleDetails = cachedDetails && (!cachedDetails.damageModMap || !cachedDetails.conditionMetrics || targetsLackBuffs);
                    if (hasStaleDetails) return Boolean(log.permalink);
                    if (cachedDetails) return false;
                    // Already hydrated this session → details are in IndexedDB.
                    // The worker reads via getLocal (LRU + IDB), so no re-fetch needed.
                    if (log.detailsStatus === 'loaded') return false;
                    if (log.detailsStatus === 'available') return true;
                    return (log.status === 'success' || log.status === 'calculating' || log.status === 'discord') && Boolean(log.permalink);
                })
                .sort((a, b) => {
                    const aTime = a.uploadTime || 0;
                    const bTime = b.uploadTime || 0;
                    if (aTime !== bTime) return aTime - bTime;
                    return (a.filePath || '').localeCompare(b.filePath || '');
                });
            // Exit the 'available' dead state for cache-resident logs. The
            // fetch path below only runs on cache misses (or stale hits with a
            // permalink), so an 'available' log whose details were prewarmed
            // into the LRU would otherwise never transition to 'loaded' — it
            // would stay pending-ingestion forever and keep the web upload
            // disabled. Details are write-through cached, so residency alone
            // proves the worker can read them.
            const candidatePaths = new Set(rawCandidates.map((log) => String(log.filePath || '')));
            const residentAvailablePaths = new Set<string>();
            logsRef.current.forEach((log) => {
                if ((log.detailsStatus || 'idle') !== 'available' || !log.filePath) return;
                if (candidatePaths.has(String(log.filePath))) return;
                if (!detailsCache?.peek(log.id)) return;
                residentAvailablePaths.add(String(log.filePath));
            });
            if (residentAvailablePaths.size > 0) {
                setLogsDeferred((currentLogs) => {
                    let changed = false;
                    const next = currentLogs.map((entry) => {
                        if (!residentAvailablePaths.has(String(entry.filePath || ''))) return entry;
                        if (entry.detailsStatus === 'loaded') return entry;
                        changed = true;
                        return { ...entry, detailsStatus: 'loaded' as const };
                    });
                    return changed ? next : currentLogs;
                });
            }
            detailsHydrationAttemptsRef.current.forEach((_attempts, filePath) => {
                if (!candidatePaths.has(filePath)) {
                    detailsHydrationAttemptsRef.current.delete(filePath);
                }
            });
            const allCandidates = rawCandidates.filter((log) => {
                const attempts = detailsHydrationAttemptsRef.current.get(String(log.filePath || '')) || 0;
                return attempts < MAX_DETAILS_HYDRATION_ATTEMPTS;
            });
            if (allCandidates.length === 0) return;
            const maxPerPass = allCandidates.length;
            const candidates = allCandidates.slice(0, maxPerPass);
            const hasMore = allCandidates.length > candidates.length;
            const hydratedBatch: Array<{ filePath: string; details: any }> = [];
            const failedPaths = new Set<string>();
            const terminalFailures = new Set<string>();
            const flushHydratedBatch = () => {
                if (hydratedBatch.length === 0) return;
                const batch = hydratedBatch.splice(0, hydratedBatch.length);
                applyHydratedStatsBatch(batch);
                const updatesByPath = new Map(batch.map((entry) => [entry.filePath, entry.details]));
                setLogsDeferred((currentLogs) => {
                    if (updatesByPath.size === 0) return currentLogs;
                    let changed = false;
                    const next = currentLogs.map((entry) => {
                        const filePath = entry.filePath || '';
                        if (!updatesByPath.has(filePath)) return entry;
                        if (entry.detailsStatus === 'loaded') return entry;
                        changed = true;
                        return {
                            ...entry,
                            detailsStatus: 'loaded' as const,
                            // Don't force status — aggregation pipeline controls
                            // calculating → success promotion.
                        };
                    });
                    return changed ? next : currentLogs;
                });
            };
            const maxConcurrent = 3; // Fetch up to 3 details in parallel (was 1, now parallelize for 3× speedup)
            const flushThreshold = 8;
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
                                filePath
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
                            if (detailsCache) {
                                // Store under both id and filePath — logsForStats
                                // entries may still have the old filePath-based id
                                // from before the real id was assigned.
                                if (log.id) detailsCache.putSync(log.id, result.details);
                                if (filePath && filePath !== log.id) detailsCache.putSync(filePath, result.details);
                            }
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
                        // Brief yield to keep UI responsive during bulk hydration
                        await new Promise((resolve) => window.setTimeout(resolve, 5));
                    } catch {
                        failedPaths.add(filePath);
                    } finally {
                        pendingDetailsRef.current.delete(filePath);
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(maxConcurrent, candidates.length) }, () => runWorker()));
            flushHydratedBatch();
            // Details are now in the cache. The worker will pick them up on
            // its next run — no need to force a logsForStats touch that would
            // restart the worker and reprocess all logs from scratch.
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
                        if ((entry.detailsStatus === 'exhausted' || entry.detailsStatus === 'unavailable') && entry.status !== 'calculating') {
                            return entry;
                        }
                        changed = true;
                        const nextStatus: ILogData['status'] = entry.status === 'error' ? 'error' : 'success';
                        return {
                            ...entry,
                            detailsStatus: (terminalFailures.has(filePath) || entry.detailsStatus === 'unavailable') ? 'unavailable' as const : 'exhausted' as const,
                            status: nextStatus
                        };
                    });
                    return changed ? next : currentLogs;
                });
            }
            if (hasMore || retryableFailures.length > 0) {
                const delayMs = retryableFailures.length > 0 ? 260 : 0;
                if (hydrateDetailsRetryTimerRef.current !== null) {
                    window.clearTimeout(hydrateDetailsRetryTimerRef.current);
                }
                hydrateDetailsRetryTimerRef.current = window.setTimeout(() => {
                    hydrateDetailsRetryTimerRef.current = null;
                    scheduleDetailsHydration(true);
                }, delayMs);
            }
        });
    }, [applyHydratedStatsBatch, setLogsDeferred, logsRef, detailsCache]);

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
