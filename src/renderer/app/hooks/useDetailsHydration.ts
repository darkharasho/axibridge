import { useCallback, useEffect, useRef } from 'react';
import type { DetailsCache } from '../../cache/DetailsCache';
import { shareIdentity } from '../../../shared/shareIdentity';

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
    // A report link stands in for "this log finished". It must be asked via
    // `shareIdentity`, not `log.permalink`: since share links shipped, the
    // dps.report upload is skipped whenever sharing has somewhere to write, so
    // every new log has a `shareUrl` and an empty `permalink`. The link is not
    // what hydration fetches -- `getLogDetails` reads main's local cache by
    // filePath -- so a permalink-only test silently retires the whole branch.
    return (status === 'success' || status === 'calculating' || status === 'discord') && Boolean(shareIdentity(log));
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
    /**
     * Paths whose LAST failure was a rejected durable write rather than a
     * failed read. Kept across passes because it sets the retry budget, and a
     * pass-local set would let an exhausted log back in on the next tick.
     * Cleared the moment a write for that path lands.
     */
    const detailsWriteFailuresRef = useRef<Set<string>>(new Set());
    const MAX_DETAILS_HYDRATION_ATTEMPTS = 8;
    /**
     * A rejected durable write gets a far smaller budget than a failed read.
     * The read is worth retrying — it can be a cold main process, a busy disk,
     * a 12s timeout on a large log. The write is not: the fetch already
     * returned the details in full and the store refused them, so each retry
     * re-sends a multi-MB payload over IPC to re-prove the same broken store.
     * Two attempts covers a transient quota blip that the TTL sweep clears;
     * eight just burns the UI thread.
     */
    const MAX_DETAILS_WRITE_ATTEMPTS = 2;
    const attemptCeilingFor = (filePath: string) =>
        detailsWriteFailuresRef.current.has(filePath)
            ? MAX_DETAILS_WRITE_ATTEMPTS
            : MAX_DETAILS_HYDRATION_ATTEMPTS;

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
        // Populate LRU + IndexedDB. The write itself starts immediately; what
        // is awaited here is only its outcome.
        const persisted = Boolean(await detailsCache?.putDurable(log.id, log.filePath, result.details));
        if (!persisted) {
            // The parse succeeded but the details are memory-only, so they will
            // be gone as soon as the LRU evicts them. Leaving the log 'idle'
            // keeps it a hydration candidate for after that eviction rather
            // than stamping a durability claim the cache cannot honour.
            setLogs((currentLogs) => {
                const idx = currentLogs.findIndex((entry) => entry.filePath === log.filePath);
                if (idx < 0) return currentLogs;
                const updated = [...currentLogs];
                const existing = updated[idx];
                if (existing.detailsStatus !== 'loading') return currentLogs;
                updated[idx] = { ...existing, detailsStatus: 'idle' as const };
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
                    if (hasStaleDetails) return Boolean(shareIdentity(log));
                    // A cache hit whose durable write was rejected is readable
                    // right now and gone after the next eviction. Keeping it a
                    // candidate lets the write be retried, and lets the attempt
                    // counter carry it to 'exhausted' — and into the coverage
                    // banner — if the store stays broken.
                    if (cachedDetails && detailsCache?.isDurable(log.id) !== false) return false;
                    // Already hydrated this session → details are in IndexedDB.
                    // The worker reads via getLocal (LRU + IDB), so no re-fetch needed.
                    if (log.detailsStatus === 'loaded') return false;
                    if (log.detailsStatus === 'available') return true;
                    return (log.status === 'success' || log.status === 'calculating' || log.status === 'discord') && Boolean(shareIdentity(log));
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
            detailsWriteFailuresRef.current.forEach((filePath) => {
                if (!candidatePaths.has(filePath)) {
                    detailsWriteFailuresRef.current.delete(filePath);
                }
            });
            const allCandidates = rawCandidates.filter((log) => {
                const filePath = String(log.filePath || '');
                const attempts = detailsHydrationAttemptsRef.current.get(filePath) || 0;
                return attempts < attemptCeilingFor(filePath);
            });
            if (allCandidates.length === 0) return;
            const maxPerPass = allCandidates.length;
            const candidates = allCandidates.slice(0, maxPerPass);
            const hasMore = allCandidates.length > candidates.length;
            const hydratedBatch: Array<{ filePath: string; details: any }> = [];
            const failedPaths = new Set<string>();
            const terminalFailures = new Set<string>();
            // Fetched fine; the durable write is what failed. Tracked apart from
            // `failedPaths` so the retry budget and the banner's wording can
            // both tell the two apart.
            const writeFailures = new Set<string>();
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
                            // The gap is closed; a stale cause would keep the
                            // banner explaining a failure that no longer exists.
                            detailsGap: undefined,
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
                        if (result?.success && result.details && await detailsCache?.putDurable(log.id, filePath, result.details)) {
                            detailsHydrationAttemptsRef.current.delete(filePath);
                            detailsWriteFailuresRef.current.delete(filePath);
                            hydratedBatch.push({ filePath, details: result.details });
                            if (hydratedBatch.length >= flushThreshold) {
                                flushHydratedBatch();
                            }
                        } else if (result?.success && result.details) {
                            // Parsed fine, but the details did not reach durable
                            // storage. Still a failure — clearing the attempt
                            // counter would claim a durability the store never
                            // granted — but a failure of a different kind, so it
                            // is recorded as one. It exhausts sooner, and the
                            // banner says "storage refused the details" instead
                            // of accusing a read that worked.
                            writeFailures.add(filePath);
                            detailsWriteFailuresRef.current.add(filePath);
                            failedPaths.add(filePath);
                        } else {
                            if ((result as any)?.terminal) {
                                terminalFailures.add(filePath);
                            }
                            detailsWriteFailuresRef.current.delete(filePath);
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
                if (nextAttempts < attemptCeilingFor(filePath)) {
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
                            // The coverage banner reads this to name the cause.
                            detailsGap: writeFailures.has(filePath) ? 'unwritable' as const : 'unreadable' as const,
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
