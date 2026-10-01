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
import { describeAxilogGap, describeUnresolvedGap, isHealable } from '../utils/axilogCoverage';
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
    // Both gaps are repaired by the same re-parse and both silently distort the
    // numbers on screen, so they share one banner rather than stacking two.
    const axilogGap = coverage.missingLogs;
    const unresolved = coverage.unresolvedLogs;
    const missing = [...axilogGap, ...unresolved];
    if (missing.length === 0 && !healState.running && healState.healed === 0) return null;

    const healable = missing.filter(isHealable);
    const canHeal = healable.length > 0 && !healState.running;

    // Nothing left to warn about, but the run just finished — report and stop.
    if (missing.length === 0) {
        return (
            <div
                className="mb-3 axi-well axi-edge-ok flex items-center gap-3"
            >
                <span className="text-[11px]" style={{ color: 'var(--axi-ok)' }}>
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
            className="mb-3 axi-well axi-edge-warn"
        >
            <div className="flex items-center gap-3">
                <div
                    className="w-8 h-8 axi-well axi-well--sm [--axi-well-pad:0] axi-edge-warn flex-shrink-0 flex items-center justify-center"
                    aria-hidden="true"
                >
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--axi-warn)' }} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold tracking-[.1em] uppercase mb-0.5" style={{ color: 'var(--axi-warn)' }}>
                        Incomplete data
                    </div>
                    <div className="text-[11px] leading-snug" style={{ color: 'var(--axi-text-dim)' }}>
                        {axilogGap.length > 0 && (
                            <>
                                {describeAxilogGap(coverage)}{' '}
                                Damage, positioning, boons and replay from{' '}
                                {axilogGap.length === 1 ? 'it' : 'them'} are missing from every total below.{' '}
                            </>
                        )}
                        {describeUnresolvedGap(coverage)}
                        {remedy ? ` ${remedy}` : ''}
                    </div>
                    {healState.running && (
                        <div className="text-[10px] mt-1" style={{ color: 'var(--axi-text-dim)' }}>
                            Re-parsing {healState.done + 1} of {healState.total}…
                        </div>
                    )}
                    {!healState.running && healState.failures.length > 0 && (
                        <div className="text-[10px] mt-1" style={{ color: 'var(--axi-danger)' }}>
                            {healState.failures.length} could not be re-parsed.
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setDetailsOpen((open) => !open)}
                        className="axi-btn axi-btn--xs"
                    >
                        {detailsOpen ? 'Hide' : `Show ${missing.length}`}
                    </button>
                    {canHeal && (
                        <button
                            type="button"
                            onClick={onHeal}
                            className="axi-btn axi-btn--xs axi-ink-warn axi-edge-warn"
                        >
                            Re-parse {healable.length}
                        </button>
                    )}
                    {healState.running && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin axi-ink-warn" />
                    )}
                </div>
            </div>

            {detailsOpen && (
                <ul className="mt-2 pt-2 border-t axi-edge-rule space-y-0.5 max-h-40 overflow-y-auto">
                    {missing.map((log) => (
                        <li key={`${log.id || log.filePath}:${log.label}`} className="flex items-baseline gap-2 text-[10px]">
                            <span className="truncate" style={{ color: 'var(--axi-text-dim)' }}>{log.label}</span>
                            {!isHealable(log) && (
                                <span className="flex-shrink-0" style={{ color: 'var(--axi-danger)' }}>source file missing</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
