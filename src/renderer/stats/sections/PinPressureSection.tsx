import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import {
    CONVERGED_RATIO, FOCUSED_RATIO, MIN_OTHER_DOWNS,
    type PinPressureFight, type PinPressureResult,
} from '../computePinPressure';

type Props = { result: PinPressureResult };

const BAND_LABEL: Record<string, string> = {
    converged: 'Converged',
    focused: 'Focused',
    normal: 'In line',
};

const bandColor = (fight: PinPressureFight): string | undefined => {
    if (!fight.comparable) return undefined;
    if (fight.band === 'converged') return 'var(--status-danger)';
    if (fight.band === 'focused') return 'var(--status-warning)';
    return undefined;
};

export const PinPressureSection = ({ result }: Props) => {
    const {
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'commander-pin-pressure';
    const isExpanded = expandedSection === sectionId;

    const [showAll, setShowAll] = useState(false);

    const fights = result?.fights ?? [];
    const comparable = result?.comparableFightCount ?? 0;
    const noComparison = result?.noComparisonFightCount ?? 0;
    const unmeasured = result?.unmeasuredFightCount ?? 0;

    const windowSeconds = result.preDownWindowMs > 0
        ? Math.round(result.preDownWindowMs / 100) / 10
        : 3;

    // The uncomparable fights are kept, not dropped — a reader who sees eight
    // fights listed and twelve loaded should be able to find the other four and
    // read why they are not scored.
    const visible = useMemo(
        () => (showAll || isExpanded ? fights : fights.filter(f => f.comparable)),
        [fights, showAll, isExpanded]
    );

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Pin Pressure</h3>
                {comparable > 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {result.pooledRatio.toFixed(2)}× the squad&apos;s own rate across {comparable} {comparable === 1 ? 'fight' : 'fights'}
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Pin Pressure' : 'Expand Pin Pressure'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {/*
              Three distinct empty states, because they mean three different
              things: the log era cannot answer the question, the fights could be
              measured but the tag never fell, or there is no data at all. A
              single "no data" line would flatten all three into a wrong one.
            */}
            {comparable === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    {unmeasured > 0 && noComparison === 0 && fights.length === 0
                        ? <>None of the {unmeasured} loaded {unmeasured === 1 ? 'fight was' : 'fights were'} recorded with an arcdps build that logs enemy casts (May 2026 or later), so what the enemy aimed at before a down cannot be measured for {unmeasured === 1 ? 'it' : 'them'}.</>
                        : noComparison > 0
                            ? <>No fight had both a commander down and at least {MIN_OTHER_DOWNS} other squad downs to compare it against, so there is no baseline to measure convergence on the tag.</>
                            : <>No commander pin pressure data for the loaded fights.</>}
                </div>
            ) : (
                <>
                    <div className={`rounded-[var(--radius-md)] overflow-hidden ${visible.length > 12 && !isExpanded ? 'max-h-[30rem] overflow-y-auto' : ''}`}>
                        <table className="w-full text-xs table-auto min-w-full border-separate border-spacing-0" style={{ color: 'var(--text-primary)' }}>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest border-b border-[color:var(--border-default)]" style={{ color: 'var(--text-secondary)' }}>
                                    <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]">Fight</th>
                                    <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]">Commander</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]" title={`Aimed casts in the ${windowSeconds}s before each of the tag's downs, per down, over the same figure for the rest of the squad before theirs. Both halves come from this fight, so its length, size and lethality divide out.`}>Focus at Down</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]" title={`Aimed casts in the ${windowSeconds}s before each tag down, per down.`}>Tag / Down</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]" title={`The same figure for every other squad member who went down — this fight's own baseline.`}>Squad / Down</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]" title="Tag downs and other squad downs in this fight.">Downs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(f => (
                                    <tr key={f.fightId} className="align-top border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                        <td className="py-2 px-3 whitespace-nowrap">{f.label}</td>
                                        <td className="py-2 px-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5">
                                                {renderProfessionIcon(f.tagProfession, f.tagProfessionList, 'w-4 h-4 flex-shrink-0')}
                                                <span>{f.tagAccount}</span>
                                            </span>
                                        </td>
                                        {f.comparable ? (
                                            <>
                                                <td className="py-2 px-3 text-right font-mono" style={{ color: bandColor(f) }}>
                                                    {f.ratio.toFixed(2)}×
                                                    <span className="ml-1.5 text-[10px] uppercase tracking-wide">{f.band !== 'normal' ? BAND_LABEL[f.band] : ''}</span>
                                                </td>
                                                <td className="py-2 px-3 text-right font-mono">{f.tagPerDown.toFixed(1)}</td>
                                                <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{f.otherPerDown.toFixed(1)}</td>
                                                <td className="py-2 px-3 text-right font-mono">{f.tagDowns} / {f.otherDowns}</td>
                                            </>
                                        ) : (
                                            <td className="py-2 px-3 text-right text-[10px]" colSpan={4} style={{ color: 'var(--text-secondary)' }}>
                                                {f.tagDowns === 0
                                                    ? 'no comparison — the tag never went down'
                                                    : `no comparison — only ${f.otherDowns} other squad ${f.otherDowns === 1 ? 'down' : 'downs'} to compare against`}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {noComparison > 0 && !isExpanded && (
                        <button
                            type="button"
                            onClick={() => setShowAll(v => !v)}
                            className="mt-2 text-[10px] underline"
                            style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}
                        >
                            {showAll
                                ? `Hide the ${noComparison} unscored ${noComparison === 1 ? 'fight' : 'fights'}`
                                : `Show ${noComparison} unscored ${noComparison === 1 ? 'fight' : 'fights'}`}
                        </button>
                    )}

                    <p className="mt-2.5 text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        <strong>Focus at Down</strong> compares the enemy casts aimed at the tag in the {windowSeconds}s before it
                        fell against the casts aimed at everyone else in the squad before <em>they</em> fell, inside the same fight.
                        Above {FOCUSED_RATIO.toFixed(1)}× the enemy converged on the tag noticeably harder than on the squad;
                        above {CONVERGED_RATIO.toFixed(1)}× it is the top tenth of fights measured. This is what the enemy
                        <em> aimed at</em>, not what they intended — a tag that overextends draws the same casts as one being
                        hunted, and across a large log corpus the tag is the single most-focused squad member in only about a
                        sixth of fights. A fight is scored only when the tag went down and at least {MIN_OTHER_DOWNS} others did
                        too; below that the baseline swings too hard to mean anything.
                        {unmeasured > 0 && <>
                            {' '}<strong>{unmeasured} loaded {unmeasured === 1 ? 'fight is' : 'fights are'}</strong> from an arcdps build
                            older than May 2026, which logs no enemy casts at all — {unmeasured === 1 ? 'it is' : 'they are'} excluded
                            rather than scored as calm.
                        </>}
                    </p>
                </>
            )}
        </div>
    );
};
