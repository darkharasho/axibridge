import { startTransition, useCallback, useEffect, useRef } from 'react';

export const normalizeQueuedLogStatus = (candidate: ILogData): ILogData => {
    const ds = candidate.detailsStatus;

    // Promote calculating → success for terminal states where details will never arrive.
    const detailsTerminal = ds === 'exhausted' || ds === 'unavailable' || ds === 'idle';
    if (candidate.status === 'calculating' && detailsTerminal) {
        return { ...candidate, status: 'success' as const };
    }

    // Demote success → calculating when details are available but not yet loaded.
    if (candidate.status === 'success' && ds === 'available') {
        return { ...candidate, status: 'calculating' as const };
    }

    return candidate;
};

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

    const normalizeIncomingStatus = useCallback((candidate: ILogData): ILogData => normalizeQueuedLogStatus(candidate), []);

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
        const key = String(identity);
        // Merge with any prior queued update for the same identity. Without this
        // a thin payload (e.g. upload-permalink, which carries only id/filePath/
        // permalink) arriving in the same batch window as upload-complete would
        // replace the EI fields — dashboardSummary, detailsStatus, playerCount —
        // and the row would render as Unknown / 0 / --:--.
        const prior = pendingLogUpdatesRef.current.get(key);
        pendingLogUpdatesRef.current.set(key, prior ? { ...prior, ...incoming } : incoming);
        if (pendingLogFlushTimerRef.current !== null) return;
        const pendingCount = pendingLogUpdatesRef.current.size;
        // Sweet spot batching: 50-80ms avoids render thrashing while staying responsive
        // Too fast (24-40ms) causes scroll lag from too many renders
        // Too slow (120-240ms) causes perceptible UI lag
        const delayMs = bulkUploadModeRef.current
            ? (pendingCount > 20 ? 80 : pendingCount > 10 ? 65 : 50)
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
