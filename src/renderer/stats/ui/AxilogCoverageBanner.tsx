/**
 * Says out loud that some of the numbers on screen are missing logs.
 *
 * Without this the degradation is silent: a log with no Axilog data
 * contributes zero to damage, positioning, boons and replay, and the dashboard
 * renders a confident-looking total that is simply wrong by however many logs
 * are missing. The banner names the count, names the cause, and — when the
 * source `.zevtc` files are still on disk and the user is on the Axilog engine
 * — offers the one action that actually fixes it.
 */

import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { AxilogCoverage } from '../utils/axilogCoverage';
import { describeAxilogGap, isHealable } from '../utils/axilogCoverage';
import type { AxilogHealState } from '../hooks/useAxilogHeal';

type AxilogCoverageBannerProps = {
    embedded: boolean;
    coverage: AxilogCoverage;
    healState: AxilogHealState;
    onHeal: () => void;
};

export const AxilogCoverageBanner = ({
    embedded,
    coverage,
    healState,
    onHeal,
}: AxilogCoverageBannerProps) => {
    const [detailsOpen, setDetailsOpen] = useState(false);

    // The published web report is a snapshot: its logs cannot be re-parsed and
    // its reader cannot act on this, so it stays out of the way there.
    if (embedded) return null;
    const missing = coverage.missingLogs;
    if (missing.length === 0 && !healState.running && healState.healed === 0) return null;

    const healable = missing.filter(isHealable);
    const canHeal = healable.length > 0 && !healState.running;

    // Nothing left to warn about, but the run just finished — report and stop.
    if (missing.length === 0) {
        return (
            <div
                className="mb-3 rounded-xl px-3 py-2.5 flex items-center gap-3"
                style={{ background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)' }}
            >
                <span className="text-[11px]" style={{ color: 'var(--status-success)' }}>
                    Re-parsed {healState.healed} {healState.healed === 1 ? 'log' : 'logs'}. Axilog data restored.
                </span>
            </div>
        );
    }

    const remedy = healable.length === 0
        ? 'The original .zevtc files are no longer on disk, so these logs cannot be repaired.'
        : healable.length < missing.length
            ? `${healable.length} of them can be repaired; the rest no longer have their .zevtc on disk.`
            : '';

    return (
        <div
            className="mb-3 rounded-xl px-3 py-2.5"
            style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)' }}
        >
            <div className="flex items-center gap-3">
                <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)' }}
                    aria-hidden="true"
                >
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold tracking-[.1em] uppercase mb-0.5" style={{ color: 'var(--status-warning)' }}>
                        Incomplete data
                    </div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {describeAxilogGap(coverage)}{' '}
                        Damage, positioning, boons and replay from{' '}
                        {missing.length === 1 ? 'it' : 'them'} are missing from every total below.
                        {remedy ? ` ${remedy}` : ''}
                    </div>
                    {healState.running && (
                        <div className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Re-parsing {healState.done + 1} of {healState.total}…
                        </div>
                    )}
                    {!healState.running && healState.failures.length > 0 && (
                        <div className="text-[10px] mt-1" style={{ color: 'var(--status-error)' }}>
                            {healState.failures.length} could not be re-parsed.
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setDetailsOpen((open) => !open)}
                        className="px-3 py-1 rounded-full text-[10px] font-medium border bg-white/[0.04] text-gray-400 border-white/[0.08] hover:text-white hover:bg-white/[0.08] transition-colors"
                    >
                        {detailsOpen ? 'Hide' : `Show ${missing.length}`}
                    </button>
                    {canHeal && (
                        <button
                            type="button"
                            onClick={onHeal}
                            className="px-3 py-1 rounded-full text-[10px] font-medium border transition-colors"
                            style={{
                                background: 'var(--status-warning-bg)',
                                borderColor: 'var(--status-warning-border)',
                                color: 'var(--status-warning)',
                            }}
                        >
                            Re-parse {healable.length}
                        </button>
                    )}
                    {healState.running && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--status-warning)' }} />
                    )}
                </div>
            </div>

            {detailsOpen && (
                <ul className="mt-2 pt-2 border-t border-white/[0.07] space-y-0.5 max-h-40 overflow-y-auto">
                    {missing.map((log) => (
                        <li key={log.id || log.filePath} className="flex items-baseline gap-2 text-[10px]">
                            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{log.label}</span>
                            {!isHealable(log) && (
                                <span className="flex-shrink-0" style={{ color: 'var(--status-error)' }}>source file missing</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
