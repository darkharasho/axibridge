import React, { useMemo, useState } from 'react';
import { BucketGridTable, FightPicker, TIMELINE_NOT_RECORDED_MESSAGE, type BucketGridRow } from './BucketGridTable';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';

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
        <>
            {fights.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                    <FightPicker fights={fights} selectedId={fight?.id} onChange={setInternalFightId} />
                </div>
            )}
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent="#f59e0b"
                renderIcon={(profession) => renderProfessionIcon(profession, undefined, 'w-[15px] h-[15px]')}
                recorded={effectiveRecorded}
                notRecordedMessage={TIMELINE_NOT_RECORDED_MESSAGE}
            />
        </>
    );
};
