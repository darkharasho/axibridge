import { useEffect, useRef } from 'react';
import { collectSquadGuilds, detectWvwMatchId, fetchMatchSectorOwners, fetchMatchWindow, pickSnapshotCandidates } from '../../stats/utils/sectorOwners';
import { extractSquadGuilds } from '../../../shared/squadGuilds';
import { resolveMapFromZone } from '../../../shared/mapUtils';

type SetLogs = (updater: (logs: ILogData[]) => ILogData[]) => void;
type PeekDetails = (log: ILogData) => any;

/**
 * Snapshots WvW match ownership onto logs so the replay can colour sector
 * outlines. Fully automatic: the match is detected from the squad's guilds
 * (extracted at parse time, or backfilled here from cached details for logs
 * parsed before extraction existed), and only logs uploaded within that
 * match's live window are coloured — older logs stay neutral rather than
 * getting colours from the wrong week.
 */
export function useSectorOwners(logs: ILogData[], setLogsDeferred: SetLogs, peekDetails?: PeekDetails): void {
    const inFlight = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Cheap pre-filter before any async work: is there any WvW log that
        // could possibly need a snapshot? (The real time-window filter needs
        // the match fetched first.)
        const hasPotentialCandidates = logs.some(log =>
            log.status === 'success' && !log.sectorOwners && log.fightName && resolveMapFromZone(log.fightName));
        if (!hasPotentialCandidates) return;

        let cancelled = false;
        (async () => {
            try {
                let guildIds = collectSquadGuilds(logs);
                if (!guildIds.length && peekDetails) {
                    // Backfill: logs parsed before guild extraction existed carry no
                    // squadGuilds, but their cached details still hold player guildIDs.
                    for (const log of logs) {
                        if (log.status !== 'success' || log.squadGuilds) continue;
                        const details = peekDetails(log);
                        const extracted = details ? extractSquadGuilds(details) : undefined;
                        if (!extracted?.length) continue;
                        setLogsDeferred(current => {
                            const idx = current.findIndex(l => l.id === log.id);
                            if (idx < 0 || current[idx].squadGuilds) return current;
                            const updated = [...current];
                            updated[idx] = { ...updated[idx], squadGuilds: extracted };
                            return updated;
                        });
                        guildIds = extracted;
                        break;
                    }
                }
                if (!guildIds.length || cancelled) return;
                const matchId = await detectWvwMatchId(guildIds);
                if (!matchId || cancelled) return;
                const matchWindow = await fetchMatchWindow(matchId);
                if (!matchWindow || cancelled) return;
                const candidates = pickSnapshotCandidates(logs, matchWindow)
                    .filter(log => !inFlight.current.has(log.id));
                for (const log of candidates) {
                    const mapKey = resolveMapFromZone(log.fightName ?? '');
                    if (!mapKey) continue;
                    inFlight.current.add(log.id);
                    try {
                        const owners = await fetchMatchSectorOwners(matchId, mapKey);
                        if (!owners || cancelled) continue;
                        setLogsDeferred(current => {
                            const idx = current.findIndex(l => l.id === log.id);
                            if (idx < 0 || current[idx].sectorOwners) return current;
                            const updated = [...current];
                            updated[idx] = { ...updated[idx], sectorOwners: owners };
                            return updated;
                        });
                    } finally {
                        // Always release, even if the fetch rejected unexpectedly, so a
                        // transient failure doesn't permanently block retries for this log.
                        inFlight.current.delete(log.id);
                    }
                }
            } catch {
                // Ownership snapshotting is a best-effort visual layer. Any failure here
                // (network, bad data) must stay a silent no-op rather than surface as an
                // unhandled rejection or renderer error.
            }
        })();
        return () => { cancelled = true; };
    }, [logs, setLogsDeferred, peekDetails]);
}
