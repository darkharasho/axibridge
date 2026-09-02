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
 * the log predates the axilog release that added the lane, it was parsed
 * with Include Timeline Arrays off, or (either way) it needs a re-parse to
 * populate. Every "not recorded" surface in the CC/strip/stab-perf timeline
 * family builds its wording here so it cannot drift out of sync across
 * sections again.
 *
 * The version floor is a parameter because the lanes did not all ship at
 * once: the strips and outgoing-CC lanes arrived in 1.8.0, `cc_taken` in
 * 1.9.0. Naming the wrong floor sends a reader off to re-parse logs that
 * were never going to carry the lane.
 */
export const timelineNotRecordedMessage = (axilogFloor: string): string =>
    `Not recorded for this fight — the log predates axilog ${axilogFloor}, was parsed with Include Timeline Arrays off, or needs a re-parse to populate.`;

/** The 1.8.0 lanes: outgoing CC, strips out, strips taken. */
export const TIMELINE_NOT_RECORDED_MESSAGE = timelineNotRecordedMessage('1.8.0');

/** The `cc_taken` lane, which shipped one release later. */
export const TIMELINE_CC_TAKEN_NOT_RECORDED_MESSAGE = timelineNotRecordedMessage('1.9.0');

export type TimelinePickerFight = { id: string; durationMs: number; label?: string };

/**
 * `F1 - Eternal: Bay (2:31)` — the `shortLabel - fullLabel` shape every other
 * fight picker in the app uses, so this one reads the same as Fight
 * Comparison and All Damage rather than as a list of raw log filenames.
 *
 * `fight.label` is absent on a `report.json` written before the control
 * timeline carried one; the fallback derives a name from `fight.id`, which is
 * a raw file path, by stripping directories and the extension.
 */
export const fightPickerLabel = (fight: TimelinePickerFight, index: number) => {
    const ordinal = `F${index + 1}`;
    if (fight.label) return `${ordinal} - ${fight.label}`;
    const raw = String(fight.id || '');
    const file = raw.replace(/\\/g, '/').split('/').pop() || raw;
    const name = file.replace(/\.(zevtc|evtc)(\.json)?$/i, '') || `Fight ${index + 1}`;
    return `${ordinal} - ${name} (${formatDurationMs(fight.durationMs)})`;
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
            aria-label="Fight"
            /* `fight-diff-select` is the app's own select treatment: it strips the
               native chrome, supplies the chevron, and carries the glass-theme
               overrides for the option list. Without it this renders as a raw
               platform dropdown that matches nothing else in the app. */
            className="fight-diff-select rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1 text-xs focus:outline-none"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
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
    /** EI profession string, for the class icon beside the name. */
    profession?: string;
    buckets: number[];
};

export interface BucketGridTableProps {
    rows: BucketGridRow[];
    bucketCount: number;
    bucketMs: number;
    accent: string;
    /**
     * Renders the class icon for a row. Injected rather than imported so this
     * stays presentational and the sections keep sourcing it from the shared
     * stats context, which both the desktop renderer and the web report
     * already provide.
     */
    renderIcon?: (profession: string | undefined) => React.ReactNode;
    notRecordedMessage?: string;
    /** False means the series was never captured — render the message, not zeros. */
    recorded: boolean;
    /**
     * Cap the grid's height and scroll past the cap, rather than letting a
     * 40-player squad run a full screen tall and push the next section off
     * the page. Sections turn this off when expanded, where the height is
     * the whole point of expanding.
     */
    capHeight?: boolean;
}

const fmtBucketLabel = (i: number, bucketMs: number) => {
    const s = Math.floor((i * bucketMs) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Label roughly every 30s rather than every bucket: at the 5s resolution a
 * five-minute fight is 60 columns, and a timestamp over each one is unreadable
 * at the width a 26px cell allows.
 */
const labelStride = (bucketMs: number) => Math.max(1, Math.round(30000 / bucketMs));

/** `#rrggbb` -> `rgba(r, g, b, a)`. Falls back to the raw value for any other notation. */
const withAlpha = (color: string, alpha: number) => {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    if (!hex) return color;
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
};

/**
 * Shade via the background's alpha channel, never the cell's `opacity`:
 * `opacity` composites the whole element, fading the digit along with its
 * backdrop, so exactly the low-intensity cells a reader is scanning for
 * become unreadable. The floor keeps a present-but-small value visibly
 * present against an empty one.
 */
const ALPHA_FLOOR = 0.1;

/**
 * Row count above which a capped grid scrolls instead of growing, and the cap
 * it grows to. Both match the other roster tables (On Tag Review, Squad
 * Distance to Tag) so a squad-sized grid takes the same vertical bite here as
 * it does there.
 */
const SCROLL_ROW_THRESHOLD = 12;
const CAPPED_MAX_HEIGHT = '30rem';

/** Column widths, in px. Fed to <colgroup> — see the note at the table. */
const NAME_COL_PX = 172;
const CELL_PX = 26;

export const BucketGridTable: React.FC<BucketGridTableProps> = ({
    rows, bucketCount, bucketMs, accent, renderIcon, notRecordedMessage, recorded, capHeight = true,
}) => {
    const max = useMemo(
        () => rows.reduce((m, r) => r.buckets.reduce((rm, v) => Math.max(rm, v), m), 0),
        [rows],
    );

    if (!recorded) {
        return <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">{notRecordedMessage}</div>;
    }

    const stride = labelStride(bucketMs);
    const cols = Array.from({ length: bucketCount }, (_, i) => i);
    // The header only sticks when the grid is the thing scrolling. Sticking it
    // unconditionally would pin it to whatever scrolls outside instead.
    const scrolls = capHeight && rows.length > SCROLL_ROW_THRESHOLD;
    const headClass = scrolls ? ' bucket-grid__head' : '';

    return (
        <div
            className={`overflow-x-auto${scrolls ? ' overflow-y-auto' : ''}`}
            style={scrolls ? { maxHeight: CAPPED_MAX_HEIGHT } : undefined}
        >
            <table
                className="text-xs border-separate border-spacing-0"
                style={{ tableLayout: 'fixed', width: NAME_COL_PX + bucketCount * CELL_PX }}
            >
                {/* `table-layout: fixed` takes column widths from <col> (or the first
                    row's `width`), and ignores min-width/max-width entirely — so the
                    widths have to live here for the header and body to share a grid. */}
                <colgroup>
                    <col style={{ width: NAME_COL_PX }} />
                    {cols.map(i => <col key={i} style={{ width: CELL_PX }} />)}
                </colgroup>
                <thead>
                    <tr>
                        <th scope="col" className={`bucket-grid__pin${headClass} text-left pr-3 pb-1.5 border-b border-white/5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-secondary)]`}>Player</th>
                        {cols.map(i => {
                            const tick = i > 0 && i % stride === 0;
                            return (
                                <th
                                    key={i}
                                    scope="col"
                                    // Labels are left-aligned, not centred, so a label's
                                    // left edge sits exactly on its column's tick line.
                                    // Centring puts the text half a cell to the right of
                                    // the moment it names.
                                    className={`${headClass} pb-1.5 text-left text-[9px] font-semibold tabular-nums whitespace-nowrap text-[color:var(--text-secondary)] border-b border-white/5 ${tick ? 'border-l border-white/10' : ''}`}
                                >
                                    {i % stride === 0 ? fmtBucketLabel(i, bucketMs) : ''}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => {
                        // Rows arrive sorted by group, so a change of group is a
                        // subgroup boundary — rule it, rather than leaving one
                        // undifferentiated block of names.
                        const startsGroup = rowIndex > 0 && rows[rowIndex - 1].group !== row.group;
                        const edge = startsGroup ? 'border-t border-white/10' : '';
                        return (
                            <tr key={row.key} className="group/row">
                                <th
                                    scope="row"
                                    className={`bucket-grid__pin text-left pr-3 truncate border-b border-white/[0.03] text-[11px] font-medium text-[color:var(--text-primary)] ${edge}`}
                                >
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 shrink-0 text-[9px] tabular-nums text-[color:var(--text-secondary)]">{row.group || ''}</span>
                                        {renderIcon?.(row.profession)}
                                        <span className="truncate">{row.displayName}</span>
                                    </span>
                                </th>
                                {cols.map(i => {
                                    const value = row.buckets[i] || 0;
                                    const intensity = max > 0 ? value / max : 0;
                                    const tick = i > 0 && i % stride === 0;
                                    return (
                                        <td
                                            key={i}
                                            data-bucket-cell
                                            data-intensity={String(intensity)}
                                            // No per-cell vertical ruling: the shaded blocks
                                            // are the data, and a line around every one of
                                            // 60+ columns reads as a spreadsheet rather than
                                            // a heatmap. Verticals appear only on the 30s
                                            // ticks, matching the header labels.
                                            className={`h-6 text-center text-[10px] tabular-nums text-[color:var(--text-primary)] border-b border-white/[0.03] group-hover/row:bg-white/[0.02] ${tick ? 'border-l border-white/10' : ''} ${edge}`}
                                            style={value > 0
                                                ? { backgroundColor: withAlpha(accent, ALPHA_FLOOR + intensity * (1 - ALPHA_FLOOR)) }
                                                : undefined}
                                            title={`${row.displayName} \u2014 ${fmtBucketLabel(i, bucketMs)}: ${value}`}
                                        >
                                            {value > 0 ? value : ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
