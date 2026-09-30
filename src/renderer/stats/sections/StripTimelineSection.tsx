import React, { useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Eraser } from 'lucide-react';
import { BucketGridTable, FightPicker, TIMELINE_NOT_RECORDED_MESSAGE, type BucketGridRow } from './BucketGridTable';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

type StripDirection = 'out' | 'in';

/** Shared by the header icon and the grid shading so the two read as one section. */
const STRIP_ACCENT: Record<StripDirection, string> = { out: '#e879f9', in: '#f87171' };

/** Matches the taxonomy id in `statsTaxonomy.ts`, which is what the expand state keys on. */
const SECTION_ID = 'strip-timeline';

interface StripTimelineSectionProps {
    fights: ControlFightData[];
    recorded: boolean;
    selectedFightId: string | null;
}

/**
 * Boon strips per player per 5s bucket, in either direction.
 *
 * Distinct from `strip-spikes`, which holds per-FIGHT totals with peak-fight
 * tracking and has no time axis inside a fight.
 *
 * Fight selection is owned entirely by this section (StatsView.tsx cannot
 * take on more useState). `selectedFightId` only seeds the section's own
 * picker state on mount — it is not a permanent override, so the picker
 * keeps working for callers that pass a non-null value.
 */
export const StripTimelineSection: React.FC<StripTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection } = useStatsSharedContext();
    const isExpanded = expandedSection === SECTION_ID;
    const [direction, setDirection] = useState<StripDirection>('out');
    const [internalFightId, setInternalFightId] = useState<string | null>(selectedFightId);

    const resolvedFightId = internalFightId;

    const fight = useMemo(
        () => fights.find(f => f.id === resolvedFightId) || fights[fights.length - 1] || null,
        [fights, resolvedFightId],
    );

    const rows = useMemo<BucketGridRow[]>(() => {
        if (!fight) return [];
        return Object.entries(fight.players)
            .map(([key, p]) => ({
                key,
                displayName: p.displayName,
                group: p.group,
                profession: p.profession,
                buckets: direction === 'out' ? p.stripsOut : p.stripsIn,
            }))
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight, direction]);

    // See CcTimelineSection: the resolved fight's own `recorded` takes
    // priority over the dataset-wide flag, which is too coarse for a mixed
    // dataset (some logs parsed before axilog 1.8.0), and an empty `fights`
    // is never "recorded" — a trimmed `report.json` clears it while leaving
    // the dataset flag true.
    const effectiveRecorded = fight ? fight.recorded : (recorded && fights.length > 0);

    return (
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing, { pad: '16px' })}>
            {/* Title row, subtitle, controls — the same shape every other stats
                section uses, so this reads as one of them rather than as a bare
                table dropped into the page. */}
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Eraser className="w-4 h-4 shrink-0" style={{ color: STRIP_ACCENT[direction] }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Strip Timeline</h3>
                <span className="ml-auto">
                    <FightPicker fights={fights} selectedId={fight?.id} onChange={setInternalFightId} />
                </span>
                <SectionExpandButton
                    expanded={isExpanded}
                    onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(SECTION_ID))}
                    section="Strip Timeline"
                />
            </div>
            <div className="text-[10px] mb-3 ml-6" style={{ color: 'var(--text-secondary)' }}>
                Boon strips per player, in {CONTROL_BUCKET_MS / 1000}s buckets
                <span className="mx-1.5 opacity-50">|</span>cell shade is intensity against this fight&apos;s peak
                <span className="mx-1.5 opacity-50">|</span>per-fight totals live in Strip Spikes
            </div>
            <div className="flex items-center gap-3 mb-2">
                <button
                    type="button"
                    onClick={() => setDirection('out')}
                    aria-pressed={direction === 'out'}
                    title="Boons this player removed from enemies"
                    className={`axi-action text-[10px] uppercase tracking-[0.16em] ${
                        direction === 'out'
                            ? 'axi-ink-meta'
                            : ''
                    }`}
                >
                    Outgoing
                </button>
                <button
                    type="button"
                    onClick={() => setDirection('in')}
                    aria-pressed={direction === 'in'}
                    title="Boons removed from this player by enemies"
                    className={`axi-action text-[10px] uppercase tracking-[0.16em] ${
                        direction === 'in'
                            ? 'axi-ink-danger'
                            : ''
                    }`}
                >
                    Incoming
                </button>
            </div>
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent={STRIP_ACCENT[direction]}
                renderIcon={(profession) => renderProfessionIcon(profession, undefined, 'w-[15px] h-[15px]')}
                recorded={effectiveRecorded}
                notRecordedMessage={TIMELINE_NOT_RECORDED_MESSAGE}
                capHeight={!isExpanded}
            />
        </div>
    );
};
