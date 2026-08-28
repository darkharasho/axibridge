import React, { useMemo, useState } from 'react';
import { BucketGridTable, type BucketGridRow } from './BucketGridTable';
import { CONTROL_BUCKET_MS, type ControlFightData } from '../computeControlTimeline';
import { formatDurationMs } from '../utils/dashboardUtils';

type StripDirection = 'out' | 'in';

interface StripTimelineSectionProps {
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
 * Boon strips per player per 5s bucket, in either direction.
 *
 * Distinct from `strip-spikes`, which holds per-FIGHT totals with peak-fight
 * tracking and has no time axis inside a fight.
 *
 * Fight selection is owned entirely by this section (StatsView.tsx cannot
 * take on more useState). `selectedFightId` is an external override — when
 * null, the section falls back to its own internal picker state, and
 * finally to the first fight in the drilldown.
 */
export const StripTimelineSection: React.FC<StripTimelineSectionProps> = ({
    fights, recorded, selectedFightId,
}) => {
    const [direction, setDirection] = useState<StripDirection>('out');
    const [internalFightId, setInternalFightId] = useState<string | null>(null);

    const resolvedFightId = selectedFightId ?? internalFightId;

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
                buckets: direction === 'out' ? p.stripsOut : p.stripsIn,
            }))
            .sort((a, b) => a.group - b.group || a.displayName.localeCompare(b.displayName));
    }, [fight, direction]);

    // See CcTimelineSection: the resolved fight's own `recorded` takes
    // priority over the dataset-wide flag, which is too coarse for a mixed
    // dataset (some logs parsed before axilog 1.8.0). Only fall back to the
    // dataset-wide flag when no fight resolves.
    const effectiveRecorded = fight ? fight.recorded : recorded;

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
                {fights.length > 1 && (
                    <select
                        value={fight?.id ?? ''}
                        onChange={(event) => setInternalFightId(event.target.value)}
                        className="bg-[var(--bg-card-inner)] border border-[color:var(--border-default)] rounded-md px-2 py-1 text-xs text-[color:var(--text-primary)]"
                    >
                        {fights.map((f, i) => (
                            <option key={f.id} value={f.id}>{fightPickerLabel(f, i)}</option>
                        ))}
                    </select>
                )}
            </div>
            <BucketGridTable
                rows={rows}
                bucketCount={fight?.bucketCount || 0}
                bucketMs={CONTROL_BUCKET_MS}
                accent={direction === 'out' ? '#e879f9' : '#f87171'}
                recorded={effectiveRecorded}
                notRecordedMessage="Per-player strip timelines need Raw timeline arrays enabled — re-parse these logs to populate."
            />
        </>
    );
};
