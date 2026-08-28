import React, { useMemo } from 'react';

/**
 * Player rows x time-bucket columns, intensity-shaded. Shared by the CC
 * Timeline and Strip Timeline sections.
 *
 * `StabPerformanceSection` deliberately does NOT use this: its cells layer
 * stack counts, death marks and distance semantics together, and
 * generalizing that is a separate refactor.
 */

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
        () => rows.reduce((m, r) => Math.max(m, ...r.buckets), 0),
        [rows],
    );

    if (!recorded) {
        return <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">{notRecordedMessage}</div>;
    }

    return (
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
    );
};
