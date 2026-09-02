import React, { useMemo, useState } from 'react';
import { Hand, Maximize2, X } from 'lucide-react';
import { BucketGridTable, FightPicker, TIMELINE_NOT_RECORDED_MESSAGE, type BucketGridRow } from './BucketGridTable';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';
import { useStatsSharedContext } from '../StatsViewContext';

/** Shared by the header icon and the grid shading so the two read as one section. */
const CC_ACCENT = '#f59e0b';

/** Matches the taxonomy id in `statsTaxonomy.ts`, which is what the expand state keys on. */
const SECTION_ID = 'cc-timeline';

interface CcTimelineSectionProps {
    fights: ControlFightData[];
    recorded: boolean;
    selectedFightId: string | null;
}

/**
 * Outgoing CC per player per 5s bucket. Outgoing only: axilog emits no
 * `cc_taken` lane, so there is no direction toggle here — incoming CC
 * remains the `received_cc_count` scalar shown in Defense Detailed.
 *
 * Fight selection is owned entirely by this section (StatsView.tsx cannot
 * take on more useState). `selectedFightId` only seeds the section's own
 * picker state on mount — it is not a permanent override, so the picker
 * keeps working for callers that pass a non-null value.
 */
export const CcTimelineSection: React.FC<CcTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection } = useStatsSharedContext();
    const isExpanded = expandedSection === SECTION_ID;
    const [internalFightId, setInternalFightId] = useState<string | null>(selectedFightId);

    const resolvedFightId = internalFightId;

    const fight = useMemo(
        () => fights.find(f => f.id === resolvedFightId) || fights[0] || null,
        [fights, resolvedFightId],
    );

    const rows = useMemo<BucketGridRow[]>(() => {
        if (!fight) return [];
        return Object.entries(fight.players)
            .map(([key, p]) => ({ key, displayName: p.displayName, group: p.group, profession: p.profession, buckets: p.cc }))
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight]);

    // The dataset-wide `recorded` flag latches true the moment ANY ingested
    // log carries lanes. In a mixed dataset (some logs parsed before axilog
    // 1.8.0), an individual fight can still have no data even though the
    // flag is true — falling back to it here would draw that fight as a
    // false all-zero grid. Resolve the fight's own `recorded` first.
    //
    // With no fight at all the dataset flag is not enough either: a trimmed
    // `report.json` clears `fights` while leaving `recorded` true, and
    // trusting it there renders an empty header-only grid instead of saying
    // why there is nothing to show.
    const effectiveRecorded = fight ? fight.recorded : (recorded && fights.length > 0);

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 p-4 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            {/* Title row, subtitle, controls — the same shape every other stats
                section uses, so this reads as one of them rather than as a bare
                table dropped into the page. */}
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Hand className="w-4 h-4 shrink-0" style={{ color: CC_ACCENT }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>CC Timeline</h3>
                <span className="ml-auto">
                    <FightPicker fights={fights} selectedId={fight?.id} onChange={setInternalFightId} />
                </span>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(SECTION_ID))}
                    className="flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close CC Timeline' : 'Expand CC Timeline'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
            <div className="text-[10px] mb-3 ml-6" style={{ color: 'var(--text-secondary)' }}>
                Outgoing crowd control per player, in {CONTROL_BUCKET_MS / 1000}s buckets
                <span className="mx-1.5 opacity-50">|</span>cell shade is intensity against this fight&apos;s peak
                <span className="mx-1.5 opacity-50">|</span>incoming CC lives in Defense Detailed
            </div>
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent={CC_ACCENT}
                renderIcon={(profession) => renderProfessionIcon(profession, undefined, 'w-[15px] h-[15px]')}
                recorded={effectiveRecorded}
                notRecordedMessage={TIMELINE_NOT_RECORDED_MESSAGE}
                capHeight={!isExpanded}
            />
        </div>
    );
};
