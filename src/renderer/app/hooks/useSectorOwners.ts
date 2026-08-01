import { useEffect, useRef } from 'react';
import { fetchMatchSectorOwners, pickSnapshotCandidates } from '../../stats/utils/sectorOwners';
import { resolveMapFromZone } from '../../../shared/mapUtils';

type SetLogs = (updater: (logs: ILogData[]) => ILogData[]) => void;

/**
 * Snapshots WvW match ownership onto freshly processed logs so the replay can
 * colour sector outlines. No-op when the wvwMatchId setting is unset. Only
 * recent logs are snapshotted — rehydrated old sessions stay neutral rather
 * than getting colours from the wrong week.
 */
export function useSectorOwners(logs: ILogData[], setLogsDeferred: SetLogs): void {
    const inFlight = useRef<Set<string>>(new Set());

    useEffect(() => {
        const candidates = pickSnapshotCandidates(logs, Date.now())
            .filter(log => !inFlight.current.has(log.id));
        if (!candidates.length) return;

        let cancelled = false;
        (async () => {
            const settings = await window.electronAPI.getSettings();
            const matchId = settings.wvwMatchId;
            if (!matchId || cancelled) return;
            for (const log of candidates) {
                const mapKey = resolveMapFromZone(log.fightName ?? '');
                if (!mapKey) continue;
                inFlight.current.add(log.id);
                const owners = await fetchMatchSectorOwners(matchId, mapKey);
                inFlight.current.delete(log.id);
                if (!owners || cancelled) continue;
                setLogsDeferred(current => {
                    const idx = current.findIndex(l => l.id === log.id);
                    if (idx < 0 || current[idx].sectorOwners) return current;
                    const updated = [...current];
                    updated[idx] = { ...updated[idx], sectorOwners: owners };
                    return updated;
                });
            }
        })();
        return () => { cancelled = true; };
    }, [logs, setLogsDeferred]);
}
