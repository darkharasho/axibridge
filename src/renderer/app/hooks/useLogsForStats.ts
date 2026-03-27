import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DetailsCacheContext } from '../../cache/DetailsCacheContext';

interface UseLogsForStatsOptions {
    logs: ILogData[];
    bulkUploadMode: boolean;
}

export function useLogsForStats({ logs, bulkUploadMode }: UseLogsForStatsOptions) {
    const detailsCache = useContext(DetailsCacheContext);

    const [logsForStats, setLogsForStats] = useState<ILogData[]>(logs);
    const [bulkCalculatingActive, setBulkCalculatingActive] = useState(false);
    const logsRef = useRef<ILogData[]>(logs);
    const statsBatchTimerRef = useRef<number | null>(null);
    const statsObjectIdMapRef = useRef<WeakMap<object, number>>(new WeakMap());
    const nextStatsObjectIdRef = useRef(1);
    const lastPublishedStatsKeyRef = useRef('');

    const hasPendingStatsDetails = logs.some((log) => {
        if (detailsCache?.peek(log.id) || log.statsDetailsLoaded) return false;
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
            const cached = detailsCache?.peek(log?.id);
            const details = cached || (log?.details && typeof log.details === 'object' ? log.details : null);
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
            if (previousEntry.details && previousEntry.id && detailsCache) {
                if (!detailsCache.peek(previousEntry.id)) {
                    detailsCache.putSync(previousEntry.id, previousEntry.details);
                }
            }
            const shouldCarryStatsLoaded = !entry.statsDetailsLoaded && !!previousEntry.statsDetailsLoaded;
            const shouldPromoteStatus = shouldCarryStatsLoaded && entry.status === 'calculating';
            if (!shouldCarryStatsLoaded && !shouldPromoteStatus) {
                return entry;
            }
            changed = true;
            const nextEntry: ILogData = { ...entry };
            if (shouldCarryStatsLoaded) {
                nextEntry.statsDetailsLoaded = true;
            }
            if (shouldPromoteStatus) {
                nextEntry.status = 'success';
            }
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

    useEffect(() => {
        lastPublishedStatsKeyRef.current = buildStatsSnapshotKey(logsForStats);
    }, [buildStatsSnapshotKey, logsForStats]);

    useEffect(() => {
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
    }, [logs, bulkUploadMode, publishLogsForStats]);

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
        if (bulkUploadMode) return;
        if (logsForStats.length === logs.length) return;
        publishLogsForStats(logsRef.current);
    }, [bulkUploadMode, logs.length, logsForStats.length, publishLogsForStats]);

    useEffect(() => {
        if (bulkUploadMode) return;
        if (hasPendingStatsDetails) return;
        publishLogsForStats(logsRef.current);
    }, [bulkUploadMode, hasPendingStatsDetails, publishLogsForStats]);

    return {
        logsForStats,
        setLogsForStats,
        logsRef,
        bulkCalculatingActive,
        setBulkCalculatingActive,
    };
}
