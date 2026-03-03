import { startTransition, useCallback, useEffect, useRef } from 'react';

export function useLogQueue(
    setLogs: React.Dispatch<React.SetStateAction<ILogData[]>>,
    bulkUploadModeRef: React.MutableRefObject<boolean>
) {
    const pendingLogUpdatesRef = useRef<Map<string, ILogData>>(new Map());
    const pendingLogFlushTimerRef = useRef<number | null>(null);

    const setLogsDeferred = useCallback((updater: (currentLogs: ILogData[]) => ILogData[]) => {
        startTransition(() => {
            setLogs(updater);
        });
    }, [setLogs]);

    const normalizeIncomingStatus = useCallback((candidate: ILogData): ILogData => {
        if ((candidate.details || candidate.detailsAvailable) && candidate.detailsFetchExhausted) {
            candidate = { ...candidate, detailsFetchExhausted: false };
        }
        if ((candidate.details || candidate.detailsAvailable) && candidate.detailsKnownUnavailable) {
            candidate = { ...candidate, detailsKnownUnavailable: false };
        }
        if (candidate.status === 'success' && candidate.detailsAvailable && !candidate.details) {
            return { ...candidate, status: 'calculating' as const };
        }
        return candidate;
    }, []);

    const hasLogChanges = useCallback((existing: ILogData, merged: ILogData) => {
        const keys = new Set<string>([
            ...Object.keys(existing),
            ...Object.keys(merged)
        ]);
        for (const key of keys) {
            const typedKey = key as keyof ILogData;
            if (existing[typedKey] !== merged[typedKey]) {
                return true;
            }
        }
        return false;
    }, []);

    const flushQueuedLogUpdates = useCallback(() => {
        pendingLogFlushTimerRef.current = null;
        if (pendingLogUpdatesRef.current.size === 0) return;
        const updatesByIdentity = new Map(pendingLogUpdatesRef.current);
        pendingLogUpdatesRef.current.clear();
        setLogsDeferred((currentLogs) => {
            if (updatesByIdentity.size === 0) return currentLogs;
            let changed = false;
            const consumed = new Set<string>();
            const nextLogs = currentLogs.map((existing) => {
                const identity = String(existing.filePath || existing.id || '');
                if (!identity) return existing;
                const incoming = updatesByIdentity.get(identity);
                if (!incoming) return existing;
                consumed.add(identity);
                const merged = normalizeIncomingStatus({ ...existing, ...incoming });
                if (!hasLogChanges(existing, merged)) return existing;
                changed = true;
                return merged;
            });
            const newLogs: ILogData[] = [];
            updatesByIdentity.forEach((incoming, identity) => {
                if (consumed.has(identity)) return;
                newLogs.push(normalizeIncomingStatus(incoming));
                changed = true;
            });
            if (!changed) return currentLogs;
            if (newLogs.length === 0) return nextLogs;
            return [...newLogs.reverse(), ...nextLogs];
        });
    }, [hasLogChanges, normalizeIncomingStatus, setLogsDeferred]);

    const queueLogUpdate = useCallback((incoming: ILogData) => {
        const identity = incoming.filePath || incoming.id;
        if (!identity) return;
        pendingLogUpdatesRef.current.set(String(identity), incoming);
        if (pendingLogFlushTimerRef.current !== null) return;
        const pendingCount = pendingLogUpdatesRef.current.size;
        const delayMs = bulkUploadModeRef.current
            ? (pendingCount > 24 ? 240 : pendingCount > 10 ? 180 : 120)
            : 16;
        pendingLogFlushTimerRef.current = window.setTimeout(() => {
            flushQueuedLogUpdates();
        }, delayMs);
    }, [flushQueuedLogUpdates, bulkUploadModeRef]);

    useEffect(() => {
        return () => {
            if (pendingLogFlushTimerRef.current !== null) {
                window.clearTimeout(pendingLogFlushTimerRef.current);
                pendingLogFlushTimerRef.current = null;
            }
        };
    }, []);

    return { setLogsDeferred, queueLogUpdate, pendingLogUpdatesRef, pendingLogFlushTimerRef };
}
