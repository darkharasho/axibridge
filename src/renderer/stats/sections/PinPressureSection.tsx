import { useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Crosshair } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import {
    CONVERGED_RATIO, FOCUSED_RATIO, MIN_OTHER_DOWNS,
    type PinPressureFight, type PinPressureResult,
} from '../computePinPressure';
import { expandedPaneProps } from './expandedPane';

type Props = { result: PinPressureResult };

const BAND_LABEL: Record<string, string> = {
    converged: 'Converged',
    focused: 'Focused',
    normal: 'In line',
};

const bandColor = (fight: PinPressureFight): string | undefined => {
    if (!fight.comparable) return undefined;
    if (fight.band === 'converged') return 'var(--axi-danger)';
    if (fight.band === 'focused') return 'var(--axi-warn)';
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
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Pin Pressure</h3>
                {comparable > 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--axi-text-dim)' }}>
                        {result.pooledRatio.toFixed(2)}× the squad&apos;s own rate across {comparable} {comparable === 1 ? 'fight' : 'fights'}
                    </span>
                )}
                <SectionExpandButton
                    expanded={isExpanded}
                    onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    section="Pin Pressure"
                />
            </div>

            {/*
              Three distinct empty states, because they mean three different
              things: the log era cannot answer the question, the fights could be
              measured but the tag never fell, or there is no data at all. A
              single "no data" line would flatten all three into a wrong one.
            */}
            {comparable === 0 ? (
                <div className="axi-empty">
                    {unmeasured > 0 && noComparison === 0 && fights.length === 0
                        ? <>None of the {unmeasured} loaded {unmeasured === 1 ? 'fight was' : 'fights were'} recorded with an arcdps build that logs enemy casts (May 2026 or later), so what the enemy aimed at before a down cannot be measured for {unmeasured === 1 ? 'it' : 'them'}.</>
                        : noComparison > 0
                            ? <>No fight had both a commander down and at least {MIN_OTHER_DOWNS} other squad downs to compare it against, so there is no baseline to measure convergence on the tag.</>
                            : <>No commander pin pressure data for the loaded fights.</>}
                </div>
            ) : (
                <>
                    <div className={`rounded-[var(--axi-radius-sm)] overflow-hidden ${visible.length > 12 && !isExpanded ? 'max-h-[30rem] overflow-y-auto' : ''}`}>
                        <table className="axi-table axi-table--sticky" style={{ color: 'var(--axi-text)' }}>
                            <thead>
                                <tr style={{ color: 'var(--axi-text-dim)' }}>
                                    <th className="sticky top-0 z-20 bg-[color:var(--axi-surface-paint)]" title="Ordered by how hard the enemy converged on the tag, hardest first — not chronologically.">Fight<span className="ml-1 normal-case tracking-normal opacity-70">(hardest first)</span></th>
                                    <th className="text-left sticky top-0 z-20 bg-[color:var(--axi-surface-paint)]">Commander</th>
                                    <th className="sticky top-0 z-20 bg-[color:var(--axi-surface-paint)]" title={`Aimed casts in the ${windowSeconds}s before each of the tag's downs, per down, over the same figure for the rest of the squad before theirs. Both halves come from this fight, so its length, size and lethality divide out.`}>Focus at Down</th>
                                    <th className="sticky top-0 z-20 bg-[color:var(--axi-surface-paint)]" title={`Aimed casts in the ${windowSeconds}s before each tag down, per down.`}>Tag / Down</th>
                                    <th className="sticky top-0 z-20 bg-[color:var(--axi-surface-paint)]" title={`The same figure for every other squad member who went down — this fight's own baseline.`}>Squad / Down</th>
                                    <th className="sticky top-0 z-20 bg-[color:var(--axi-surface-paint)]" title="How many times the tag went down in this fight, and how many downs the rest of the squad took. These are counts, not a rate — they are the denominators the two columns to the left are divided by.">Downs<span className="ml-1 normal-case tracking-normal opacity-70">(tag / squad)</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(f => (
                                    <tr key={f.fightId} className="align-top">
                                        <td>{f.label}</td>
                                        <td>
                                            <span className="axi-table__who">
                                                {renderProfessionIcon(f.tagProfession, f.tagProfessionList, 'w-4 h-4 flex-shrink-0')}
                                                <span>{f.tagAccount}</span>
                                            </span>
                                        </td>
                                        {f.comparable ? (
                                            <>
                                                <td style={{ color: bandColor(f) }}>
                                                    {f.ratio.toFixed(2)}×
                                                    <span className="ml-1.5 text-[10px] uppercase tracking-wide">{f.band !== 'normal' ? BAND_LABEL[f.band] : ''}</span>
                                                </td>
                                                <td>{f.tagPerDown.toFixed(1)}</td>
                                                <td style={{ color: 'var(--axi-text-dim)' }}>{f.otherPerDown.toFixed(1)}</td>
                                                <td>{f.tagDowns} / {f.otherDowns}</td>
                                            </>
                                        ) : (
                                            <td colSpan={4} style={{ color: 'var(--axi-text-dim)' }}>
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
                            className="axi-link axi-ink-dim mt-2 text-[10px]"
                        >
                            {showAll
                                ? `Hide the ${noComparison} unscored ${noComparison === 1 ? 'fight' : 'fights'}`
                                : `Show ${noComparison} unscored ${noComparison === 1 ? 'fight' : 'fights'}`}
                        </button>
                    )}

                    <p className="mt-2.5 text-[10px] leading-relaxed" style={{ color: 'var(--axi-text-dim)' }}>
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
