import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';

interface UseLogsForStatsOptions {
    logs: ILogData[];
}

export function useLogsForStats({ logs }: UseLogsForStatsOptions) {
    const detailsCache = useContext(DetailsCacheContext);

    const [logsForStats, setLogsForStats] = useState<ILogData[]>(logs);
    const logsRef = useRef<ILogData[]>(logs);
    const statsObjectIdMapRef = useRef<WeakMap<object, number>>(new WeakMap());
    const nextStatsObjectIdRef = useRef(1);
    const lastPublishedStatsKeyRef = useRef('');

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
            const details = detailsCache?.peek(log?.id) ?? null;
            const detailsId = details ? getStatsObjectId(details) : 0;
            const logId = details ? 0 : getStatsObjectId(log);
            const identifier = String(log?.filePath || log?.id || `idx-${index}`);
            const permalink = String(log?.permalink || (details as any)?.permalink || '');
            const uploadTime = Number(log?.uploadTime || (details as any)?.uploadTime || 0);
            const successValue = (details as any)?.success;
            const successToken = successValue === true ? '1' : successValue === false ? '0' : 'u';
            const r2 = log?.replayDataUrl ? '1' : '0';
            key += `|${identifier}:${detailsId}:${logId}:${uploadTime}:${successToken}:${permalink}:${r2}`;
        });
        return key;
    }, [getStatsObjectId, detailsCache]);

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
            const shouldCarryStatsLoaded = entry.detailsStatus !== 'loaded' && previousEntry.detailsStatus === 'loaded';
            const shouldCarryReplayUrl = !entry.replayDataUrl && previousEntry.replayDataUrl;
            if (!shouldCarryStatsLoaded && !shouldCarryReplayUrl) {
                return entry;
            }
            changed = true;
            const nextEntry: ILogData = { ...entry };
            if (shouldCarryStatsLoaded) nextEntry.detailsStatus = 'loaded';
            if (shouldCarryReplayUrl) nextEntry.replayDataUrl = previousEntry.replayDataUrl;
            return nextEntry;
        });
        return changed ? merged : entries;
    }, [detailsCache]);

    const publishLogsForStats = useCallback((entries: ILogData[]) => {
        setLogsForStats((prev) => {
            const stripped = entries.some(e => e.details)
                ? entries.map(e => e.details ? { ...e, details: undefined } : e)
                : entries;
            const mergedEntries = mergeLogsForStatsSnapshot(stripped, prev);
            const nextKey = buildStatsSnapshotKey(mergedEntries);
            if (nextKey === lastPublishedStatsKeyRef.current) {
                return prev;
            }
            lastPublishedStatsKeyRef.current = nextKey;
            return mergedEntries;
        });
    }, [buildStatsSnapshotKey, mergeLogsForStatsSnapshot]);

    // Keep snapshot key in sync when logsForStats changes externally (e.g. removals)
    useEffect(() => {
        lastPublishedStatsKeyRef.current = buildStatsSnapshotKey(logsForStats);
    }, [buildStatsSnapshotKey, logsForStats]);

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    // Debounced publish: batch rapid logs changes (queue flushes, status updates)
    // into a single logsForStats update.  Without debouncing, each logs change
    // produces a new logsForStats reference → restarts the worker → the worker
    // never settles → calculating logs never promote to success.
    // 400ms matches the base branch's debounce window.
    const publishTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (publishTimerRef.current !== null) {
            window.clearTimeout(publishTimerRef.current);
        }
        publishTimerRef.current = window.setTimeout(() => {
            publishTimerRef.current = null;
            publishLogsForStats(logsRef.current);
        }, 400);
    }, [logs, publishLogsForStats]);

    useEffect(() => {
        return () => {
            if (publishTimerRef.current !== null) {
                window.clearTimeout(publishTimerRef.current);
                publishTimerRef.current = null;
            }
        };
    }, []);

    return {
        logsForStats,
        setLogsForStats,
        logsRef,
    };
}
