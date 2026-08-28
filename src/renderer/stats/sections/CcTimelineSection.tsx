import React, { useMemo, useState } from 'react';
import { BucketGridTable, type BucketGridRow } from './BucketGridTable';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';
import { formatDurationMs } from '../utils/dashboardUtils';

interface CcTimelineSectionProps {
    fights: ControlFightData[];
    recorded: boolean;
    selectedFightId: string | null;
}

/** `fight.id` is a raw file path; strip directories and extension for a readable option label. */
const fightPickerLabel = (fight: ControlFightData, index: number) => {
    const raw = String(fight.id || '');
    const file = raw.replace(/\\/g, '/').split('/').pop() || raw;
    const name = file.replace(/\.(zevtc|evtc)(\.json)?$/i, '') || `Fight ${index + 1}`;
    return `${name} (${formatDurationMs(fight.durationMs)})`;
};

/**
 * Outgoing CC per player per 5s bucket. Outgoing only: axilog emits no
 * `cc_taken` lane, so there is no direction toggle here — incoming CC
 * remains the `received_cc_count` scalar shown in Defense Detailed.
 *
 * Fight selection is owned entirely by this section (StatsView.tsx cannot
 * take on more useState). `selectedFightId` is an external override — when
 * null, the section falls back to its own internal picker state, and
 * finally to the first fight in the drilldown.
 */
export const CcTimelineSection: React.FC<CcTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const [internalFightId, setInternalFightId] = useState<string | null>(null);

    const resolvedFightId = selectedFightId ?? internalFightId;

    const fight = useMemo(
        () => fights.find(f => f.id === resolvedFightId) || fights[0] || null,
        [fights, resolvedFightId],
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
        <>
            {fights.length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                    <select
                        value={fight?.id ?? ''}
                        onChange={(event) => setInternalFightId(event.target.value)}
                        className="bg-[var(--bg-card-inner)] border border-[color:var(--border-default)] rounded-md px-2 py-1 text-xs text-[color:var(--text-primary)]"
                    >
                        {fights.map((f, i) => (
                            <option key={f.id} value={f.id}>{fightPickerLabel(f, i)}</option>
                        ))}
                    </select>
                </div>
            )}
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent="#f59e0b"
                recorded={effectiveRecorded}
                notRecordedMessage="Per-player CC timelines need Raw timeline arrays enabled — re-parse these logs to populate."
            />
        </>
    );
};
