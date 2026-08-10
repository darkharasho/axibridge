import { startTransition, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DisruptionMethod, IMvpWeightProfiles, IStatsViewSettings } from '../../global.d';
import { IncrementalAggregator, computeStatsSync } from '../incrementalAggregation';
import { reinjectElidedReplayFights } from '../../workers/replayTransfer';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';
import type { DetailsCache } from '../../cache/DetailsCache';
import { LogPayloadCache } from '../utils/logPayloadRetention';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeightProfiles;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
    detailsCache?: DetailsCache | null;
    preciseReplay?: boolean;
}

export interface AggregationProgressState {
    active: boolean;
    phase: 'idle' | 'streaming' | 'computing' | 'settled';
    streamed: number;
    total: number;
    startedAt: number;
    completedAt: number;
}

export interface AggregationDiagnosticsState {
    mode: 'worker' | 'fallback';
    logsInPayload: number;
    streamedLogs: number;
    totalLogs: number;
    startedAt: number;
    completedAt: number;
    streamMs: number;
    computeMs: number;
    totalMs: number;
    flushId: number | null;
    transferStripStats?: {
        spikeSkillRowsRemoved: number;
        incomingSkillRowsRemoved: number;
        playerSkillMapsRemoved: number;
    };
    counts?: {
        playerSkillBreakdowns: number;
        spikeFights: number;
        incomingStrikeFights: number;
    };
    expectedLogCount?: number;
    droppedLogMessages?: number;
}

const DETAILS_TOP_LEVEL_DENY = ['phases', 'logErrors'];
const PLAYER_DENY = ['targetBreakbarDamage1S', 'squadBuffVolumesActive'];

/** True while a log is still uploading/parsing or waiting on details — i.e. its
 *  aggregation input will change again soon. */
export const isLogPendingIngestion = (log: any): boolean => {
    const status = log?.status;
    const detailsStatus = log?.detailsStatus;
    return status === 'queued'
        || status === 'pending'
        || status === 'uploading'
        || status === 'retrying'
        || status === 'parsing'
        || status === 'calculating'
        || detailsStatus === 'available'
        || detailsStatus === 'loading';
};

/** Strip fields not needed by stats aggregation before structured-cloning to the worker. */
export const pruneDetailsForWorker = (details: any): any => {
    if (!details || typeof details !== 'object') return details;
    const pruned: any = {};
    for (const key of Object.keys(details)) {
        if (!DETAILS_TOP_LEVEL_DENY.includes(key)) {
            pruned[key] = details[key];
        }
    }
    if (Array.isArray(pruned.players)) {
        pruned.players = pruned.players.map((player: any) => {
            if (!player || typeof player !== 'object') return player;
            const p: any = {};
            for (const key of Object.keys(player)) {
                if (!PLAYER_DENY.includes(key)) {
                    p[key] = player[key];
                }
            }
            return p;
        });
    }
    return pruned;
};

export const useStatsAggregationWorker = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod, detailsCache: detailsCacheProp, preciseReplay }: UseStatsAggregationProps) => {
    const detailsCacheContext = useContext(DetailsCacheContext);
    const detailsCache = detailsCacheProp ?? detailsCacheContext;
    const workerLogLimit = 8;
    const shouldUseWorker = logs.length > workerLogLimit;
    const [result, setResult] = useState(() => {
        if (typeof Worker !== 'undefined' && shouldUseWorker) {
            // Avoid blocking initial mount on large datasets; worker will publish the first full result.
            return computeStatsSync({ logs: [], precomputedStats: undefined, mvpWeights, statsViewSettings, disruptionMethod });
        }
        return computeStatsSync({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod });
    });
    const [computeTick, setComputeTick] = useState(0);
    const [lastComputedLogCount, setLastComputedLogCount] = useState(0);
    const [lastComputedToken, setLastComputedToken] = useState(0);
    const [lastComputedAt, setLastComputedAt] = useState(0);
    const [lastComputedFlushId, setLastComputedFlushId] = useState<number | null>(null);
    const activeTokenRef = useRef(0);
    const [activeToken, setActiveToken] = useState(0);
    const pendingFlushIdRef = useRef<number | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const [workerFailed, setWorkerFailed] = useState(false);
    const streamTimerRef = useRef<number | null>(null);
    const streamIdleCallbackRef = useRef<number | null>(null);
    const lastStreamProgressUpdateRef = useRef(0);
    const streamSessionRef = useRef(0);
    // Single source of truth for retained log payloads: memoises the pruned
    // payload per log AND tracks which of them the current worker still holds.
    // These were previously two maps holding the same object refs — bounding
    // them separately just moves the retention, so they are one cache with one
    // heap-pressure-driven budget. Every eviction must be forwarded to the
    // worker as a 'forget' so its payload store shrinks in lockstep.
    const payloadCacheRef = useRef<LogPayloadCache | null>(null);
    if (!payloadCacheRef.current) {
        payloadCacheRef.current = new LogPayloadCache();
    }
    const aggregationSettingsKeyRef = useRef<string>('');
    const aggregationSettingsRef = useRef<IStatsViewSettings | undefined>(undefined);
    const lastFallbackComputeKeyRef = useRef('');
    const lastSettledSettingsKeyRef = useRef<string>('');
    const expectedLogCountRef = useRef(0);
    // Last full replayFights payload received from the worker. The worker elides
    // the payload when it is byte-identical to the previous post (same logs,
    // same preciseReplay) — reinject it here so consumers always see a full result.
    const lastReplayFightsRef = useRef<any[] | null>(null);
    const [aggregationProgress, setAggregationProgress] = useState<AggregationProgressState>({
        active: false,
        phase: 'idle',
        streamed: 0,
        total: 0,
        startedAt: 0,
        completedAt: 0
    });
    const [aggregationDiagnostics, setAggregationDiagnostics] = useState<AggregationDiagnosticsState | null>(null);
    const workerAggregationStartedAtRef = useRef(0);
    // Guards the stuck-elided-replay recovery flush so it fires at most once per
    // settle (keyed by the settled completedAt), preventing a flush loop.
    const replayRecoveryCompletedAtRef = useRef(0);
    const clearStreamTimer = () => {
        if (streamTimerRef.current !== null) {
            window.clearTimeout(streamTimerRef.current);
            streamTimerRef.current = null;
        }
        if (streamIdleCallbackRef.current !== null) {
            const cancelIdle = (window as any).cancelIdleCallback;
            if (typeof cancelIdle === 'function') {
                cancelIdle(streamIdleCallbackRef.current);
            }
            streamIdleCallbackRef.current = null;
        }
    };
    /** Tell the worker to release payloads the main thread no longer retains. */
    const forgetInWorker = (keys: string[]) => {
        if (keys.length === 0 || !workerRef.current) return;
        workerRef.current.postMessage({ type: 'forget', keys });
    };

    const getPayloadEntryForWorker = (log: any, details: any, index: number) => {
        const cacheKey = String(log?.filePath || log?.id || `idx-${index}`);
        const detailsRef = details && typeof details === 'object' ? details : null;
        // useSectorOwners patches log.sectorOwners in place on the same details
        // object identity (async ownership fetch resolves well after the log was
        // first streamed) — validate the cache on owners identity too, or the
        // stale pre-patch payload (or a `ref` message pointing the worker at it)
        // is reused until the details object is LRU-evicted.
        const owners = log?.sectorOwners ?? null;
        const cache = payloadCacheRef.current!;
        const cached = cache.get(cacheKey);
        if (cached) {
            if (detailsRef && cached.sourceDetails?.deref() === detailsRef && cached.sourceOwners === owners) {
                return cached;
            }
            if (!detailsRef && cached.sourceLog === log && cached.sourceOwners === owners) {
                return cached;
            }
        }
        // Pruning allocates a fresh payload, so only do it on a cache miss.
        const logWithDetails = details ? { ...log, details: pruneDetailsForWorker(details) } : log;
        const entry = {
            sourceLog: log,
            sourceDetails: detailsRef ? new WeakRef(detailsRef) : null,
            sourceOwners: owners,
            pruned: logWithDetails,
            sent: false
        };
        forgetInWorker(cache.set(cacheKey, entry));
        return entry;
    };

    const aggregationStatsViewSettings = useMemo(() => {
        if (!statsViewSettings) {
            aggregationSettingsKeyRef.current = '';
            aggregationSettingsRef.current = undefined;
            return undefined;
        }
        const stripped: any = { ...statsViewSettings };
        delete stripped.topSkillsMetric;
        delete stripped.topStatsMode;
        delete stripped.roundCountStats;
        delete stripped.showTopStats;
        delete stripped.interruptMode;
        delete stripped.enabledTopStats;
        const nextKey = JSON.stringify(stripped);
        if (aggregationSettingsKeyRef.current !== nextKey) {
            aggregationSettingsKeyRef.current = nextKey;
            aggregationSettingsRef.current = stripped as IStatsViewSettings;
        }
        return aggregationSettingsRef.current;
    }, [statsViewSettings]);

    // Stable key representing the current computation-affecting inputs.
    // Used to detect when settings have changed but the worker hasn't produced
    // a result yet — so we can show the spinner during that gap.
    const currentComputeInputsKey = useMemo(() => {
        return JSON.stringify({
            svs: aggregationSettingsKeyRef.current,
            dm: disruptionMethod,
            mvp: mvpWeights,
        });
    }, [aggregationStatsViewSettings, disruptionMethod, mvpWeights]);
    const currentComputeInputsKeyRef = useRef(currentComputeInputsKey);
    currentComputeInputsKeyRef.current = currentComputeInputsKey;

    useEffect(() => {
        if (typeof Worker === 'undefined') return;
        if (workerFailed) return;
        if (!shouldUseWorker) return;
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../../workers/statsWorker.ts', import.meta.url), { type: 'module' });
            // Fresh worker = empty worker-side payload store; never send refs for
            // payloads transferred to a previous worker instance. The memoised
            // payloads themselves stay valid, so only the sent flags are cleared.
            payloadCacheRef.current!.markAllUnsent();
            workerRef.current.onmessage = (event) => {
                if (event.data?.type === 'progress') {
                    const incomingToken = typeof event.data.token === 'number' ? event.data.token : null;
                    if (incomingToken !== null && incomingToken !== activeTokenRef.current) return;
                    const ingested = Number(event.data.ingested || 0);
                    const total = Number(event.data.total || 0);
                    setAggregationProgress((prev) => {
                        if (prev.streamed >= ingested && prev.total === total) return prev;
                        return {
                            ...prev,
                            active: true,
                            phase: 'streaming',
                            streamed: ingested,
                            total: total > 0 ? total : prev.total
                        };
                    });
                    return;
                }
                if (event.data?.type === 'result') {
                    // Track/reinject replay payloads even for stale-token results: the worker's
                    // elision state assumes every posted payload was received, so a dropped
                    // result must still update the local copy.
                    lastReplayFightsRef.current = reinjectElidedReplayFights(event.data.result, lastReplayFightsRef.current);
                    const incomingToken = typeof event.data.token === 'number' ? event.data.token : null;
                    if (incomingToken !== null && incomingToken !== activeTokenRef.current) {
                        return;
                    }
                    startTransition(() => {
                        setResult(event.data.result);
                        if (typeof event.data.computeId === 'number') {
                            setComputeTick(event.data.computeId);
                        } else {
                            setComputeTick((prev) => prev + 1);
                        }
                        if (typeof event.data.logCount === 'number') {
                            setLastComputedLogCount(event.data.logCount);
                        }
                        if (typeof event.data.token === 'number') {
                            setLastComputedToken(event.data.token);
                        }
                        if (typeof event.data.completedAt === 'number') {
                            setLastComputedAt(event.data.completedAt);
                        }
                        if (typeof event.data.flushId === 'number') {
                            setLastComputedFlushId(event.data.flushId);
                        }
                        const tokenMatches = incomingToken === null || incomingToken === activeTokenRef.current;
                        const expectedCount = expectedLogCountRef.current;
                        const logCount = typeof event.data.logCount === 'number' ? event.data.logCount : 0;
                        if (tokenMatches) {
                            const completedAt = typeof event.data.completedAt === 'number' ? event.data.completedAt : Date.now();
                            const diagnostics = event.data?.diagnostics || {};
                            const computeMs = Math.max(0, Number(diagnostics.computeMs || 0));
                            const startedAt = workerAggregationStartedAtRef.current > 0
                                ? workerAggregationStartedAtRef.current
                                : completedAt;
                            const totalMs = Math.max(0, completedAt - startedAt);
                            const streamMs = Math.max(0, totalMs - computeMs);
                            setAggregationDiagnostics({
                                mode: 'worker',
                                logsInPayload: Number(diagnostics.logsInPayload || event.data.logCount || 0),
                                streamedLogs: Number(event.data.logCount || 0),
                                totalLogs: expectedCount,
                                startedAt,
                                completedAt,
                                streamMs,
                                computeMs,
                                totalMs,
                                flushId: typeof event.data.flushId === 'number' ? event.data.flushId : null,
                                transferStripStats: diagnostics.transferStripStats,
                                counts: diagnostics.counts,
                                expectedLogCount: Number(diagnostics.expectedLogCount || 0),
                                droppedLogMessages: Number(diagnostics.droppedLogMessages || 0)
                            });
                        }
                        if (tokenMatches && logCount >= expectedCount) {
                            lastSettledSettingsKeyRef.current = currentComputeInputsKeyRef.current;
                            setAggregationProgress((prev) => ({
                                ...prev,
                                active: expectedCount > 0,
                                phase: expectedCount > 0 ? 'settled' : 'idle',
                                streamed: expectedCount,
                                total: expectedCount,
                                completedAt: typeof event.data.completedAt === 'number' ? event.data.completedAt : Date.now()
                            }));
                        }
                    });
                }
            };
            workerRef.current.onerror = (event) => {
                console.warn('[StatsWorker] Worker error. Falling back to main thread.', event);
                workerRef.current?.terminate();
                workerRef.current = null;
                setWorkerFailed(true);
            };
            workerRef.current.onmessageerror = (event) => {
                console.warn('[StatsWorker] Worker message error. Falling back to main thread.', event);
                workerRef.current?.terminate();
                workerRef.current = null;
                setWorkerFailed(true);
            };
            if (pendingFlushIdRef.current !== null) {
                workerRef.current.postMessage({
                    type: 'flush',
                    flushId: pendingFlushIdRef.current,
                    token: activeTokenRef.current
                });
            }
        }
        return () => {
            streamSessionRef.current += 1;
            clearStreamTimer();
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, [workerFailed, shouldUseWorker]);

    // Recovery for a permanently-elided replay payload. The worker elides
    // replayFights whenever it believes the main thread already holds an identical
    // copy — but a settling flush that ran with skipReplay (because a log's details
    // were still pending) sets the elision marker without ever delivering a full
    // copy. If the pending state later resolves without triggering a fresh
    // re-stream, aggregation settles with the marker stuck on, `isReplayElided`
    // stays true, and the web upload is disabled forever ("Stats are still
    // loading") even though nothing is computing. Detect that terminal state and
    // force the worker to re-send replay in full.
    useEffect(() => {
        if (workerFailed || typeof Worker === 'undefined' || !shouldUseWorker) return;
        if (!workerRef.current) return;
        if (aggregationProgress.phase !== 'settled') return;
        const resultStats = (result as any)?.stats;
        if (!resultStats?.replayFightsElided) return;
        // A log still settling will produce its own re-stream (and a non-skip
        // final flush) — don't race it; only recover when the set has quiesced.
        if (logs.some(isLogPendingIngestion)) return;
        const completedAt = Number(aggregationProgress.completedAt || 0);
        if (replayRecoveryCompletedAtRef.current === completedAt) return;
        replayRecoveryCompletedAtRef.current = completedAt;
        // Clear the worker's elision key, then flush: the aggregator still holds
        // all logs, so this recomputes with skipReplay=false and transfers the full
        // replayFights payload, which the main thread reinjects and un-marks.
        const flushId = Date.now();
        pendingFlushIdRef.current = flushId;
        workerRef.current.postMessage({ type: 'resetReplayElision' });
        workerRef.current.postMessage({ type: 'flush', flushId, token: activeTokenRef.current });
    }, [result, aggregationProgress, logs, workerFailed, shouldUseWorker]);

    useEffect(() => {
        if (!workerRef.current || workerFailed || !shouldUseWorker) return;
        const streamSession = streamSessionRef.current + 1;
        streamSessionRef.current = streamSession;
        let cancelled = false;
        try {
            // ── Full reset path ──
            // Always reset and re-stream when logsForStats changes reference.
            // The snapshot key in useLogsForStats prevents spurious reference
            // changes; when it DOES change, it means log content or details
            // availability changed and we need fresh aggregation.
            expectedLogCountRef.current = logs.length;
            workerAggregationStartedAtRef.current = Date.now();
            setAggregationDiagnostics(null);
            setAggregationProgress({
                active: logs.length > 0,
                phase: logs.length > 0 ? 'streaming' : 'idle',
                streamed: 0,
                total: logs.length,
                startedAt: Date.now(),
                completedAt: 0
            });
            const activeToken = activeTokenRef.current + 1;
            activeTokenRef.current = activeToken;
            setActiveToken(activeToken);
            const validCacheKeys = new Set<string>();
            logs.forEach((log, index) => {
                validCacheKeys.add(String(log?.filePath || log?.id || `idx-${index}`));
            });
            // Logs that left the set are dead weight in both isolates — drop them
            // here and tell the worker to release its clones too.
            forgetInWorker(payloadCacheRef.current!.retain(validCacheKeys));
            clearStreamTimer();
            workerRef.current.postMessage({ type: 'reset', token: activeToken, totalLogs: logs.length });
            workerRef.current.postMessage({
                type: 'settings',
                token: activeToken,
                payload: {
                    precomputedStats,
                    mvpWeights,
                    statsViewSettings: aggregationStatsViewSettings,
                    disruptionMethod,
                    preciseReplay,
                }
            });
            let index = 0;
            const totalLogs = logs.length;
            const publishProgress = (phase: 'streaming' | 'computing', force = false) => {
                const now = performance.now();
                if (!force && now - lastStreamProgressUpdateRef.current < 120 && index < totalLogs) return;
                lastStreamProgressUpdateRef.current = now;
                const streamed = Math.min(index, totalLogs);
                setAggregationProgress((prev) => {
                    if (
                        prev.active === (totalLogs > 0)
                        && prev.phase === phase
                        && prev.streamed === streamed
                        && prev.total === totalLogs
                    ) {
                        return prev;
                    }
                    return {
                        ...prev,
                        active: totalLogs > 0,
                        phase,
                        streamed,
                        total: totalLogs
                    };
                });
            };
            const prefetchAndStep = async () => {
                if (cancelled || streamSessionRef.current !== streamSession || !workerRef.current) return;
                // Pre-fetch next batch of details into the LRU so peek() hits in step()
                // Skip prefetch for logs that already have details in state
                const prefetchEnd = Math.min(index + 4, totalLogs);
                for (let i = index; i < prefetchEnd; i++) {
                    const log = logs[i];
                    if (detailsCache?.peek(log?.id || log?.filePath)) continue; // already in cache, no need to fetch
                    const logId = log?.id || log?.filePath;
                    if (detailsCache && logId && !detailsCache.peek(logId)) {
                        // Use getLocal (LRU + IndexedDB only) — never trigger IPC/network
                        // fetches here, as they can block the streaming pipeline indefinitely
                        try { await detailsCache.getLocal(logId); } catch { /* not in cache */ }
                    }
                }
                scheduleStep();
            };
            const scheduleStep = () => {
                if (cancelled || streamSessionRef.current !== streamSession || !workerRef.current) return;
                const requestIdle = (window as any).requestIdleCallback;
                if (typeof requestIdle === 'function') {
                    streamIdleCallbackRef.current = requestIdle(
                        (deadline: any) => {
                            streamIdleCallbackRef.current = null;
                            step(deadline);
                        },
                        { timeout: 120 }
                    );
                    return;
                }
                streamTimerRef.current = window.setTimeout(() => {
                    streamTimerRef.current = null;
                    step();
                }, 0);
            };
            const step = (deadline?: any) => {
                if (cancelled || streamSessionRef.current !== streamSession || !workerRef.current) return;
                const hasIdleBudget = Boolean(deadline && typeof deadline.timeRemaining === 'function');
                const remaining = hasIdleBudget ? Math.max(0, Number(deadline.timeRemaining() || 0)) : 0;
                const chunkSize = hasIdleBudget
                    ? (remaining > 12 ? 4 : remaining > 7 ? 2 : 1)
                    : 1;
                let processed = 0;
                while (processed < chunkSize && index < totalLogs) {
                    const log = logs[index];
                    const logId = log?.id || log?.filePath;
                    // peek is synchronous — details were pre-fetched into LRU by prefetchAndStep
                    const details = detailsCache && logId ? detailsCache.peek(logId) : null;
                    const payloadKey = String(log?.filePath || log?.id || `idx-${index}`);
                    const entry = getPayloadEntryForWorker(log, details, index);
                    if (entry.sent) {
                        // Unchanged since last transfer — the worker still holds it.
                        workerRef.current.postMessage({ type: 'log', token: activeToken, ref: payloadKey });
                    } else {
                        entry.sent = true;
                        workerRef.current.postMessage({ type: 'log', token: activeToken, key: payloadKey, payload: entry.pruned });
                    }
                    // Heap pressure climbs as the stream progresses, so re-evaluate
                    // the budget per log rather than only on insertion. Safe to evict
                    // a payload already streamed this pass: each key is visited once,
                    // so the worker's store only matters for subsequent streams.
                    forgetInWorker(payloadCacheRef.current!.trim());
                    index += 1;
                    processed += 1;
                }
                if (index < totalLogs) {
                    publishProgress('streaming');
                    prefetchAndStep();
                } else {
                    publishProgress('computing', true);
                    // Mid-bulk results are transient (more logs/details are coming);
                    // skip the heavy replay transfer until the set settles.
                    const skipReplay = logs.some(isLogPendingIngestion);
                    workerRef.current.postMessage({ type: 'flush', token: activeToken, skipReplay });
                }
            };
            lastStreamProgressUpdateRef.current = 0;
            if (totalLogs <= 0) {
                publishProgress('computing', true);
                workerRef.current.postMessage({ type: 'flush', token: activeToken });
            } else {
                publishProgress('streaming', true);
                prefetchAndStep();
            }
        } catch (err) {
            console.warn('[StatsWorker] Failed to postMessage payload. Falling back to main thread.', err);
            clearStreamTimer();
            workerRef.current?.terminate();
            workerRef.current = null;
            setWorkerFailed(true);
            setAggregationProgress({
                active: false,
                phase: 'idle',
                streamed: 0,
                total: 0,
                startedAt: 0,
                completedAt: 0
            });
            setAggregationDiagnostics(null);
        }
        return () => {
            cancelled = true;
            clearStreamTimer();
        };
    }, [logs, precomputedStats, mvpWeights, aggregationStatsViewSettings, disruptionMethod, preciseReplay, shouldUseWorker, workerFailed]);

    const fallback = useMemo(() => {
        if (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker) return null;
        const startedAt = Date.now();
        const computeStartedAt = performance.now();

        const aggregator = new IncrementalAggregator({
            precomputedStats, mvpWeights,
            statsViewSettings: aggregationStatsViewSettings,
            disruptionMethod,
            preciseReplay,
        });

        for (const log of logs) {
            const logId = log?.id || log?.filePath;
            const cachedDetails = detailsCache && logId ? detailsCache.peek(logId) : null;
            const logWithDetails = cachedDetails ? { ...log, details: cachedDetails } : log;
            aggregator.ingestLog(logWithDetails);
            // logWithDetails goes out of scope — eligible for GC
        }

        let result: any;
        try {
            result = aggregator.finalize();
        } catch (err) {
            console.error('[StatsAggregation] Fallback finalize failed:', err);
            result = { stats: null, skillUsageData: null };
        }

        const computeMs = Math.max(0, performance.now() - computeStartedAt);
        const completedAt = Date.now();
        return { result, computeMs, startedAt, completedAt };
    }, [workerFailed, logs, precomputedStats, mvpWeights, aggregationStatsViewSettings, disruptionMethod, preciseReplay, shouldUseWorker]);
    const fallbackComputeKey = useMemo(() => {
        if (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker) return 'worker';
        const firstLog = logs[0];
        const lastLog = logs[logs.length - 1];
        return JSON.stringify({
            logCount: logs.length,
            firstLogPath: firstLog?.filePath || firstLog?.name || '',
            lastLogPath: lastLog?.filePath || lastLog?.name || '',
            precomputedTotal: Number(precomputedStats?.total || 0),
            precomputedUpdatedAt: String(precomputedStats?.updatedAt || ''),
            disruptionMethod: disruptionMethod || null,
            settingsKey: aggregationSettingsKeyRef.current
        });
    }, [workerFailed, shouldUseWorker, logs, precomputedStats, disruptionMethod]);

    useEffect(() => {
        if (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker) return;
        if (lastFallbackComputeKeyRef.current === fallbackComputeKey) return;
        lastFallbackComputeKeyRef.current = fallbackComputeKey;
        lastSettledSettingsKeyRef.current = currentComputeInputsKey;
        setComputeTick((prev) => prev + 1);
        setLastComputedLogCount(logs.length);
        setLastComputedToken(activeTokenRef.current);
        const completedAt = Date.now();
        setLastComputedAt(completedAt);
        setAggregationDiagnostics({
            mode: 'fallback',
            logsInPayload: logs.length,
            streamedLogs: logs.length,
            totalLogs: logs.length,
            startedAt: fallback?.startedAt || completedAt,
            completedAt,
            streamMs: 0,
            computeMs: Math.max(0, Number(fallback?.computeMs || 0)),
            totalMs: Math.max(0, Number(fallback?.computeMs || 0)),
            flushId: null
        });
    }, [fallbackComputeKey, fallback, workerFailed, logs.length, shouldUseWorker]);

    const resolvedResult = (workerFailed || typeof Worker === 'undefined' || !shouldUseWorker)
        ? (fallback?.result ?? (() => {
            try {
                return computeStatsSync({ logs, precomputedStats, mvpWeights, statsViewSettings: aggregationStatsViewSettings, disruptionMethod });
            } catch (err) {
                console.error('[StatsAggregation] Inline fallback failed:', err);
                return { stats: null, skillUsageData: null };
            }
        })())
        : result;
    // Detect when computation-affecting settings changed but worker hasn't
    // produced a result yet.  During this gap the progress state still reads
    // 'settled' from the previous computation — override it to show the
    // particle spinner so the dashboard doesn't flash stale data.
    const settingsPendingRecalc = logs.length > 0
        && shouldUseWorker && !workerFailed
        && lastSettledSettingsKeyRef.current !== ''
        && currentComputeInputsKey !== lastSettledSettingsKeyRef.current;

    const baseAggregationProgress = (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker)
        ? aggregationProgress
        : {
            active: logs.length > 0,
            phase: logs.length > 0 ? 'settled' as const : 'idle' as const,
            streamed: logs.length,
            total: logs.length,
            startedAt: 0,
            completedAt: Date.now()
        };

    const resolvedAggregationProgress = settingsPendingRecalc
        && (baseAggregationProgress.phase === 'settled' || baseAggregationProgress.phase === 'idle')
        ? {
            ...baseAggregationProgress,
            active: true,
            phase: 'computing' as const,
        }
        : baseAggregationProgress;

    return {
        result: resolvedResult,
        computeTick,
        lastComputedLogCount,
        lastComputedToken,
        activeToken,
        lastComputedAt,
        lastComputedFlushId,
        aggregationProgress: resolvedAggregationProgress,
        aggregationDiagnostics,
        requestFlush: () => {
            const flushId = Date.now();
            pendingFlushIdRef.current = flushId;
            if (workerRef.current && !workerFailed) {
                workerRef.current.postMessage({ type: 'flush', flushId, token: activeTokenRef.current });
            }
            return flushId;
        }
    };
};
