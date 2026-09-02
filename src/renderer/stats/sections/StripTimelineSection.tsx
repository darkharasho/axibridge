import React, { useMemo, useState } from 'react';
import { Eraser, Maximize2, X } from 'lucide-react';
import { BucketGridTable, FightPicker, TIMELINE_NOT_RECORDED_MESSAGE, type BucketGridRow } from './BucketGridTable';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';
import { useStatsSharedContext } from '../StatsViewContext';

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
        () => fights.find(f => f.id === resolvedFightId) || fights[0] || null,
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
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 p-4 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            {/* Title row, subtitle, controls — the same shape every other stats
                section uses, so this reads as one of them rather than as a bare
                table dropped into the page. */}
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Eraser className="w-4 h-4 shrink-0" style={{ color: STRIP_ACCENT[direction] }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Strip Timeline</h3>
                <span className="ml-auto">
                    <FightPicker fights={fights} selectedId={fight?.id} onChange={setInternalFightId} />
                </span>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(SECTION_ID))}
                    className="flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Strip Timeline' : 'Expand Strip Timeline'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
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
                    className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                        direction === 'out'
                            ? 'text-fuchsia-200 hover:text-fuchsia-100'
                            : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                    }`}
                >
                    Outgoing
                </button>
                <button
                    type="button"
                    onClick={() => setDirection('in')}
                    aria-pressed={direction === 'in'}
                    title="Boons removed from this player by enemies"
                    className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                        direction === 'in'
                            ? 'text-red-300 hover:text-red-200'
                            : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
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
