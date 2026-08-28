import React, { useMemo } from 'react';
import { formatDurationMs } from '../utils/dashboardUtils';

/**
 * Player rows x time-bucket columns, intensity-shaded. Shared by the CC
 * Timeline and Strip Timeline sections.
 *
 * `StabPerformanceSection` deliberately does NOT use this: its cells layer
 * stack counts, death marks and distance semantics together, and
 * generalizing that is a separate refactor.
 */

/**
 * Absent is not zero. Three things independently produce an empty grid:
 * the log predates axilog 1.8.0, it was parsed with Include Timeline Arrays
 * off, or (either way) it needs a re-parse to populate. Every "not
 * recorded" surface in the CC/strip/stab-perf timeline family shares this
 * exact wording so it cannot drift out of sync across sections again.
 */
export const TIMELINE_NOT_RECORDED_MESSAGE =
    'Not recorded for this fight — the log predates axilog 1.8.0, was parsed with Include Timeline Arrays off, or needs a re-parse to populate.';

export type TimelinePickerFight = { id: string; durationMs: number };

/** `fight.id` is a raw file path; strip directories and extension for a readable option label. */
export const fightPickerLabel = (fight: TimelinePickerFight, index: number) => {
    const raw = String(fight.id || '');
    const file = raw.replace(/\\/g, '/').split('/').pop() || raw;
    const name = file.replace(/\.(zevtc|evtc)(\.json)?$/i, '') || `Fight ${index + 1}`;
    return `${name} (${formatDurationMs(fight.durationMs)})`;
};

export interface FightPickerProps<T extends TimelinePickerFight> {
    fights: T[];
    selectedId: string | undefined | null;
    onChange: (id: string) => void;
}

/** Shared fight-select control for the CC Timeline and Strip Timeline sections. Renders nothing for a single-fight dataset. */
export function FightPicker<T extends TimelinePickerFight>({ fights, selectedId, onChange }: FightPickerProps<T>) {
    if (fights.length <= 1) return null;
    return (
        <select
            value={selectedId ?? ''}
            onChange={(event) => onChange(event.target.value)}
            className="bg-[var(--bg-card-inner)] border border-[color:var(--border-default)] rounded-md px-2 py-1 text-xs text-[color:var(--text-primary)]"
        >
            {fights.map((f, i) => (
                <option key={f.id} value={f.id}>{fightPickerLabel(f, i)}</option>
            ))}
        </select>
    );
}

export type BucketGridRow = {
    key: string;
    displayName: string;
    group: number;
    buckets: number[];
};

export interface BucketGridTableProps {
    rows: BucketGridRow[];
    bucketCount: number;
    bucketMs: number;
    accent: string;
    notRecordedMessage?: string;
    /** False means the series was never captured — render the message, not zeros. */
    recorded: boolean;
}

const fmtBucketLabel = (i: number, bucketMs: number) => {
    const s = Math.floor((i * bucketMs) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const BucketGridTable: React.FC<BucketGridTableProps> = ({
    rows, bucketCount, bucketMs, accent, notRecordedMessage, recorded,
}) => {
    const max = useMemo(
        () => rows.reduce((m, r) => r.buckets.reduce((rm, v) => Math.max(rm, v), m), 0),
        [rows],
    );

    if (!recorded) {
        return <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">{notRecordedMessage}</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs table-auto min-w-full border-separate border-spacing-0">
                <thead>
                    <tr>
                        <th scope="col">Player</th>
                        {Array.from({ length: bucketCount }, (_, i) => (
                            <th key={i} scope="col">{fmtBucketLabel(i, bucketMs)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.key}>
                            <th scope="row">{row.displayName}</th>
                            {Array.from({ length: bucketCount }, (_, i) => {
                                const value = row.buckets[i] || 0;
                                const intensity = max > 0 ? value / max : 0;
                                return (
                                    <td
                                        key={i}
                                        data-bucket-cell
                                        data-intensity={String(intensity)}
                                        style={{ backgroundColor: accent, opacity: intensity }}
                                        title={`${row.displayName} — ${fmtBucketLabel(i, bucketMs)}: ${value}`}
                                    >
                                        {value > 0 ? value : ''}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
