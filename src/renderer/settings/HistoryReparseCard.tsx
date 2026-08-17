/**
 * "Re-parse my whole history with Axilog" — the deliberate, one-time
 * counterpart to the coverage banner's heal action.
 *
 * The banner can only offer what the current stats selection contains. A user
 * whose old fights never enter a stats view has no way to reach them from
 * there, so the full-history entry point lives here, in Settings, next to the
 * engine picker that created the gap.
 *
 * It stays a two-step action on purpose: scan, then confirm against a real
 * count. Each re-parse is a synchronous native call in the main process, so a
 * large history is minutes of work — that is worth showing someone before they
 * start it, not after.
 */

import { useCallback, useContext, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { DetailsCacheContext } from '../cache/DetailsCacheContext';
import { useAxilogHeal } from '../stats/hooks/useAxilogHeal';
import { toCoverageLog, type AxilogCoverageLog } from '../stats/utils/axilogCoverage';

/**
 * A log is a candidate when it was not parsed by Axilog and still names the
 * `.evtc`/`.zevtc` it came from.
 *
 * The extension check is stricter than the banner's `isHealable`, which only
 * asks for a non-empty path. Over a whole history that laxness would drag in
 * hand-imported EI `.json` files, which Axilog cannot read — every one of them
 * a guaranteed line in the failure list, for a gap re-parsing can never close.
 */
const needsReparse = (log: any): boolean => {
    if (log?.parseSource === 'axilog') return false;
    const filePath = String(log?.filePath || '');
    return /\.z?evtc$/i.test(filePath);
};

export function HistoryReparseCard({
    backend,
    onLogsHealed,
}: {
    /** The selected parse engine; re-parsing needs Axilog to be the active one. */
    backend: 'axilog' | 'elite-insights' | null;
    onLogsHealed?: (filePaths: string[]) => void;
}) {
    const detailsCache = useContext(DetailsCacheContext);
    const { healState, heal } = useAxilogHeal({ detailsCache, onLogsHealed });
    const [scanning, setScanning] = useState(false);
    const [targets, setTargets] = useState<AxilogCoverageLog[] | null>(null);
    const [scanned, setScanned] = useState(0);

    const scan = useCallback(async () => {
        setScanning(true);
        try {
            // The persisted list, not the in-memory selection — "history" here
            // means everything the app has kept, which is the whole point of
            // this card existing alongside the banner.
            const logs = (await window.electronAPI?.getLogs?.()) || [];
            setScanned(logs.length);
            setTargets(logs.filter(needsReparse).map(toCoverageLog));
        } finally {
            setScanning(false);
        }
    }, []);

    const wrongBackend = backend === 'elite-insights';
    const busy = healState.running;

    return (
        <div className="bg-black/30 border border-white/10 rounded-[4px] p-4 mb-4" data-testid="history-reparse-card">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Log History</div>
            <p className="text-sm text-gray-400 mb-3">
                Logs parsed before Axilog — or by the Elite Insights engine — carry no Axilog data, so damage,
                positioning, boons and replay come out empty for them. Re-parsing reads the original
                <code className="mx-1 text-gray-300">.zevtc</code> files again and fills that back in.
            </p>

            {wrongBackend && (
                <div className="text-xs text-yellow-300 mb-3">
                    Elite Insights is the selected engine, so re-parsing would produce the same gap. Pick Axilog
                    above first.
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={scanning || busy || wrongBackend}
                    onClick={scan}
                    data-testid="history-reparse-scan"
                    className="px-3 py-2 rounded-[4px] text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
                >
                    <History className="w-3 h-3" />
                    {scanning ? 'Checking...' : 'Check history'}
                </button>

                {targets !== null && targets.length > 0 && (
                    <button
                        type="button"
                        disabled={busy || wrongBackend}
                        onClick={async () => { await heal(targets); await scan(); }}
                        data-testid="history-reparse-run"
                        className="px-3 py-2 rounded-[4px] text-xs font-semibold border bg-blue-500/10 text-blue-200 border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
                    >
                        <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} style={busy ? { animationDuration: '2s' } : undefined} />
                        {busy ? `Re-parsing ${healState.done}/${healState.total}...` : `Re-parse ${targets.length} log${targets.length === 1 ? '' : 's'}`}
                    </button>
                )}
            </div>

            {targets !== null && !busy && healState.total === 0 && (
                <div className="text-xs text-gray-400 mt-3" data-testid="history-reparse-scan-result">
                    {targets.length === 0
                        ? `Nothing to re-parse — all ${scanned} stored log${scanned === 1 ? '' : 's'} already carry Axilog data, or no longer name a source file.`
                        : `${targets.length} of ${scanned} stored logs can be re-parsed. This runs one log at a time and may take a while.`}
                </div>
            )}

            {healState.total > 0 && !busy && (
                <div className="text-xs text-gray-300 mt-3" data-testid="history-reparse-result">
                    Re-parsed {healState.healed} of {healState.total} logs.
                    {healState.failures.length > 0 && ' The rest could not be read:'}
                </div>
            )}

            {!busy && healState.failures.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-red-300/80 max-h-40 overflow-y-auto">
                    {healState.failures.map((failure, idx) => (
                        <li key={`${failure.label}-${idx}`}>• {failure.label} — {failure.error}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
