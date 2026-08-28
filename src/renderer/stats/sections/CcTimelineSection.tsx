import React, { useMemo } from 'react';
import { BucketGridTable, type BucketGridRow } from './BucketGridTable';
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
 */
export const CcTimelineSection: React.FC<CcTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const fight = useMemo(
        () => fights.find(f => f.id === selectedFightId) || fights[0] || null,
        [fights, selectedFightId],
    );

    const rows = useMemo<BucketGridRow[]>(() => {
        if (!fight) return [];
        return Object.entries(fight.players)
            .map(([key, p]) => ({ key, displayName: p.displayName, group: p.group, buckets: p.cc }))
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight]);

    // The dataset-wide `recorded` flag latches true the moment ANY ingested
    // log carries lanes. In a mixed dataset (some logs parsed before axilog
    // 1.8.0), an individual fight can still have no data even though the
    // flag is true — falling back to it here would draw that fight as a
    // false all-zero grid. Resolve the fight's own `recorded` first; only
    // fall back to the dataset-wide flag when no fight resolves at all.
    const effectiveRecorded = fight ? fight.recorded : recorded;

    return (
        <BucketGridTable
            rows={rows}
            bucketCount={fight?.bucketCount || 0}
            bucketMs={CONTROL_BUCKET_MS}
            accent="#f59e0b"
            recorded={effectiveRecorded}
            notRecordedMessage="Per-player CC timelines need Raw timeline arrays enabled — re-parse these logs to populate."
        />
    );
};
