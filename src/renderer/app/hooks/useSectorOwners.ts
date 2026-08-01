import { useEffect, useRef, useState } from 'react';
import { collectSquadGuilds, detectWvwMatchId, fetchMatchSectorOwners, fetchMatchWindow, pickSnapshotCandidates, WVW_MATCH_SETTING_CHANGED_EVENT } from '../../stats/utils/sectorOwners';
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
    // Bumped when the wvwMatchId setting changes so already-processed logs get
    // their snapshot immediately instead of waiting for the next logs change.
    const [settingsBump, setSettingsBump] = useState(0);

    useEffect(() => {
        const onSettingChanged = () => setSettingsBump(b => b + 1);
        window.addEventListener(WVW_MATCH_SETTING_CHANGED_EVENT, onSettingChanged);
        return () => window.removeEventListener(WVW_MATCH_SETTING_CHANGED_EVENT, onSettingChanged);
    }, []);

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
                const settings = await window.electronAPI.getSettings();
                const configured = settings.wvwMatchId;
                if (configured === 'off' || cancelled) return;
                let matchId = configured ?? null;
                if (!matchId) {
                    // Auto mode (the default): resolve the match from the squad's
                    // guilds via the GW2 guild→team mapping.
                    const guildIds = collectSquadGuilds(logs);
                    if (!guildIds.length) return;
                    matchId = await detectWvwMatchId(guildIds);
                    if (!matchId || cancelled) return;
                }
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
                // (settings IPC, network, bad data) must stay a silent no-op rather than
                // surface as an unhandled rejection or renderer error.
            }
        })();
        return () => { cancelled = true; };
    }, [logs, setLogsDeferred, settingsBump]);
}
