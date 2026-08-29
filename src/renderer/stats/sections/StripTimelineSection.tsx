import React, { useMemo, useState } from 'react';
import { BucketGridTable, FightPicker, TIMELINE_NOT_RECORDED_MESSAGE, type BucketGridRow } from './BucketGridTable';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';

type StripDirection = 'out' | 'in';

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
        <>
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
                <FightPicker fights={fights} selectedId={fight?.id} onChange={setInternalFightId} />
            </div>
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent={direction === 'out' ? '#e879f9' : '#f87171'}
                renderIcon={(profession) => renderProfessionIcon(profession, undefined, 'w-[15px] h-[15px]')}
                recorded={effectiveRecorded}
                notRecordedMessage={TIMELINE_NOT_RECORDED_MESSAGE}
            />
        </>
    );
};
