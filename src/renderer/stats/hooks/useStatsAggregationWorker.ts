import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { DisruptionMethod, IMvpWeights, IStatsViewSettings } from '../../global.d';
import { computeStatsAggregation } from '../computeStatsAggregation';
import { pruneLogForStats } from '../utils/pruneStatsLog';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
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

export const useStatsAggregationWorker = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }: UseStatsAggregationProps) => {
    const workerLogLimit = 8;
    const shouldUseWorker = logs.length > workerLogLimit;
    const [result, setResult] = useState(() => {
        if (typeof Worker !== 'undefined' && shouldUseWorker) {
            // Avoid blocking initial mount on large datasets; worker will publish the first full result.
            return computeStatsAggregation({ logs: [], precomputedStats: undefined, mvpWeights, statsViewSettings, disruptionMethod });
        }
        return computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod });
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
    const prunedLogCacheRef = useRef<Map<string, { sourceLog: any; sourceDetails: any; pruned: any }>>(new Map());
    const aggregationSettingsKeyRef = useRef<string>('');
    const aggregationSettingsRef = useRef<IStatsViewSettings | undefined>(undefined);
    const lastFallbackComputeKeyRef = useRef('');
    const expectedLogCountRef = useRef(0);
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
    const getPrunedLogForWorker = (log: any, index: number) => {
        const cacheKey = String(log?.filePath || log?.id || `idx-${index}`);
        const detailsRef = log?.details && typeof log.details === 'object' ? log.details : null;
        const cached = prunedLogCacheRef.current.get(cacheKey);
        if (cached) {
            if (detailsRef && cached.sourceDetails === detailsRef) {
                return cached.pruned;
            }
            if (!detailsRef && cached.sourceLog === log) {
                return cached.pruned;
            }
        }
        const pruned = pruneLogForStats(log);
        prunedLogCacheRef.current.set(cacheKey, {
            sourceLog: log,
            sourceDetails: detailsRef,
            pruned
        });
        return pruned;
    };

    const aggregationStatsViewSettings = useMemo(() => {
        if (!statsViewSettings) {
            aggregationSettingsKeyRef.current = '';
            aggregationSettingsRef.current = undefined;
            return undefined;
        }
        const stripped: any = { ...statsViewSettings };
        delete stripped.topSkillsMetric;
        const nextKey = JSON.stringify(stripped);
        if (aggregationSettingsKeyRef.current !== nextKey) {
            aggregationSettingsKeyRef.current = nextKey;
            aggregationSettingsRef.current = stripped as IStatsViewSettings;
        }
        return aggregationSettingsRef.current;
    }, [statsViewSettings]);

    useEffect(() => {
        if (typeof Worker === 'undefined') return;
        if (workerFailed) return;
        if (!shouldUseWorker) return;
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../../workers/statsWorker.ts', import.meta.url), { type: 'module' });
            workerRef.current.onmessage = (event) => {
                if (event.data?.type === 'result') {
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

    useEffect(() => {
        if (!workerRef.current || workerFailed || !shouldUseWorker) return;
        const streamSession = streamSessionRef.current + 1;
        streamSessionRef.current = streamSession;
        let cancelled = false;
        try {
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
            prunedLogCacheRef.current.forEach((_value, key) => {
                if (!validCacheKeys.has(key)) {
                    prunedLogCacheRef.current.delete(key);
                }
            });
            clearStreamTimer();
            workerRef.current.postMessage({ type: 'reset', token: activeToken, totalLogs: logs.length });
            workerRef.current.postMessage({
                type: 'settings',
                token: activeToken,
                payload: {
                    precomputedStats,
                    mvpWeights,
                    statsViewSettings: aggregationStatsViewSettings,
                    disruptionMethod
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
                    workerRef.current.postMessage({
                        type: 'log',
                        token: activeToken,
                        payload: getPrunedLogForWorker(logs[index], index)
                    });
                    index += 1;
                    processed += 1;
                }
                if (index < totalLogs) {
                    publishProgress('streaming');
                    scheduleStep();
                } else {
                    publishProgress('computing', true);
                    workerRef.current.postMessage({ type: 'flush', token: activeToken });
                }
            };
            lastStreamProgressUpdateRef.current = 0;
            if (totalLogs <= 0) {
                publishProgress('computing', true);
                workerRef.current.postMessage({ type: 'flush', token: activeToken });
            } else {
                publishProgress('streaming', true);
                scheduleStep();
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
    }, [logs, precomputedStats, mvpWeights, aggregationStatsViewSettings, disruptionMethod, shouldUseWorker, workerFailed]);

    const fallback = useMemo(() => {
        if (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker) return null;
        const startedAt = Date.now();
        const computeStartedAt = performance.now();
        const result = computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings: aggregationStatsViewSettings, disruptionMethod });
        const computeMs = Math.max(0, performance.now() - computeStartedAt);
        const completedAt = Date.now();
        return { result, computeMs, startedAt, completedAt };
    }, [workerFailed, logs, precomputedStats, mvpWeights, aggregationStatsViewSettings, disruptionMethod, shouldUseWorker]);
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
        ? (fallback?.result ?? computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings: aggregationStatsViewSettings, disruptionMethod }))
        : result;
    const resolvedAggregationProgress = (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker)
        ? aggregationProgress
        : {
            active: false,
            phase: 'idle' as const,
            streamed: logs.length,
            total: logs.length,
            startedAt: 0,
            completedAt: Date.now()
        };

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
