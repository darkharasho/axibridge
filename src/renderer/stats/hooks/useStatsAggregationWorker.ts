import { useEffect, useMemo, useRef, useState } from 'react';
import type { DisruptionMethod, IMvpWeights, IStatsViewSettings } from '../../global.d';
import { computeStatsAggregation } from '../computeStatsAggregation';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
}

export const useStatsAggregationWorker = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }: UseStatsAggregationProps) => {
    const [result, setResult] = useState(() => computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }));
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
    const workerLogLimit = 8;
    const shouldUseWorker = logs.length <= workerLogLimit;

    const payload = useMemo(
        () => ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }),
        [logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod]
    );

    useEffect(() => {
        if (typeof Worker === 'undefined') return;
        if (workerFailed) return;
        if (!shouldUseWorker) return;
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../../workers/statsWorker.ts', import.meta.url), { type: 'module' });
            workerRef.current.onmessage = (event) => {
                if (event.data?.type === 'result') {
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
                workerRef.current.postMessage({ type: 'flush', flushId: pendingFlushIdRef.current });
            }
        }
        return () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, [workerFailed, shouldUseWorker]);

    useEffect(() => {
        if (!workerRef.current || workerFailed || !shouldUseWorker) return;
        try {
            activeTokenRef.current += 1;
            setActiveToken(activeTokenRef.current);
            workerRef.current.postMessage({ type: 'reset', token: activeTokenRef.current });
            workerRef.current.postMessage({
                type: 'settings',
                payload: {
                    precomputedStats,
                    mvpWeights,
                    statsViewSettings,
                    disruptionMethod
                }
            });
            if (streamTimerRef.current) {
                window.clearTimeout(streamTimerRef.current);
                streamTimerRef.current = null;
            }
            let index = 0;
            const step = () => {
                if (!workerRef.current) return;
                const chunkSize = 5;
                for (let i = 0; i < chunkSize && index < logs.length; i += 1, index += 1) {
                    workerRef.current.postMessage({ type: 'log', payload: logs[index] });
                }
                if (index < logs.length) {
                    streamTimerRef.current = window.setTimeout(step, 0);
                } else {
                    streamTimerRef.current = null;
                    workerRef.current.postMessage({ type: 'flush' });
                }
            };
            step();
        } catch (err) {
            console.warn('[StatsWorker] Failed to postMessage payload. Falling back to main thread.', err);
            workerRef.current?.terminate();
            workerRef.current = null;
            setWorkerFailed(true);
        }
    }, [payload, logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod, shouldUseWorker]);

    const fallback = useMemo(() => {
        if (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker) return null;
        return computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod });
    }, [workerFailed, logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod, shouldUseWorker]);

    useEffect(() => {
        if (!workerFailed && typeof Worker !== 'undefined' && shouldUseWorker) return;
        setComputeTick((prev) => prev + 1);
        setLastComputedLogCount(logs.length);
        setLastComputedToken(activeTokenRef.current);
        setLastComputedAt(Date.now());
    }, [fallback, workerFailed, logs.length, shouldUseWorker]);

    const resolvedResult = (workerFailed || typeof Worker === 'undefined' || !shouldUseWorker)
        ? (fallback ?? computeStatsAggregation({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }))
        : result;

    return {
        result: resolvedResult,
        computeTick,
        lastComputedLogCount,
        lastComputedToken,
        activeToken,
        lastComputedAt,
        lastComputedFlushId,
        requestFlush: () => {
            const flushId = Date.now();
            pendingFlushIdRef.current = flushId;
            if (workerRef.current && !workerFailed) {
                workerRef.current.postMessage({ type: 'flush', flushId });
            }
            return flushId;
        }
    };
};
