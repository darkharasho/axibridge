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
            /* `.axi-select` strips the native chrome and draws the caret from two
               gradients in the accent. It replaces `fight-diff-select`, which did
               the same job with an SVG chevron whose stroke was a hard-coded
               `#cbd5e1` — a colour that followed neither the accent nor the theme. */
            className="axi-select"
        >
            {/* `fights` is oldest-first (F1 = earliest); options list newest-first
                but keep their chronological F-number. */}
            {fights.map((f, i) => (
                <option key={f.id} value={f.id}>{fightPickerLabel(f, i)}</option>
            )).reverse()}
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
    /**
     * Unused since the fill moved into the language: a cell's band is mixed
     * from `--axi-accent` by `.axi-table--matrix`, so the component no longer
     * needs to know the colour. Kept in the type so callers do not churn.
     */
    accent?: string;
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
/**
 * Cells size themselves to the space the panel actually has, between these
 * two bounds. A short fight is only a dozen buckets wide, and pinning every
 * cell at the 26px floor left the grid stopping a third of the way across the
 * panel with dead space beside it; growing into that space keeps the section
 * reading as one table. The ceiling is what stops a three-bucket fight from
 * rendering as a few enormous tiles — past it the leftover goes to the spacer
 * column instead, so the rules and header bar still span the full width.
 */
const CELL_PX = 26;
const CELL_MAX_PX = 64;

export const BucketGridTable: React.FC<BucketGridTableProps> = ({
    rows, bucketCount, bucketMs, renderIcon, notRecordedMessage, recorded, capHeight = true,
}) => {
    const max = useMemo(
        () => rows.reduce((m, r) => r.buckets.reduce((rm, v) => Math.max(rm, v), m), 0),
        [rows],
    );

    if (!recorded) {
        return <div className="bucket-grid__empty axi-well axi-ink-dim px-4 py-6 text-center text-xs">{notRecordedMessage}</div>;
    }

    const stride = labelStride(bucketMs);
    const cols = Array.from({ length: bucketCount }, (_, i) => i);
    // Percentages in a <col> width resolve against the table's used width, which
    // already accounts for the min-width above — so this is the floor on a long
    // fight and an even share of the panel on a short one.
    const cellWidth = `clamp(${CELL_PX}px, calc((100% - ${NAME_COL_PX}px) / ${bucketCount}), ${CELL_MAX_PX}px)`;
    // The header only sticks when the grid is the thing scrolling. Sticking it
    // unconditionally would pin it to whatever scrolls outside instead.
    const scrolls = capHeight && rows.length > SCROLL_ROW_THRESHOLD;

    /* Upstream's matrix: `.axi-table--matrix` bands each occupied cell in four
       opaque steps mixed from the accent and prints the digit on it, which is
       the condition rule 9 admits intensity under. `--ruler` draws the 30s
       ticks down the field from `data-tick`; `[data-group-start]` rules a
       change of subgroup in ink; `--sticky` keeps the ruler on the float
       surface (opaque under glass, where the old raised surface let rows
       slide through it); `--pinned` keeps the name column; `--fixed` plus the
       <colgroup> share one grid between head and body. The continuous alpha
       ramp this component used to paint inline was a second encoding of the
       same number at rule 2's faded ink, and the only reason the bands ever
       needed !important. */
    return (
        <div
            className={`bucket-grid axi-table__scroll${scrolls ? ' overflow-y-auto' : ''}`}
            style={scrolls ? { maxHeight: CAPPED_MAX_HEIGHT } : undefined}
        >
            <table
                className={`axi-table axi-table--dense axi-table--matrix axi-table--ruler axi-table--pinned axi-table--fixed${scrolls ? ' axi-table--sticky' : ''}`}
                // Fill the panel, but never below the width at which cells hit
                // their floor — past that the wrapper scrolls horizontally, as
                // it always did for a long fight.
                style={{ width: '100%', minWidth: NAME_COL_PX + bucketCount * CELL_PX }}
            >
                {/* `table-layout: fixed` takes column widths from <col> (or the first
                    row's `width`), and ignores min-width/max-width entirely — so the
                    widths have to live here for the header and body to share a grid. */}
                <colgroup>
                    <col style={{ width: NAME_COL_PX }} />
                    {cols.map(i => <col key={i} style={{ width: cellWidth }} />)}
                    {/* Auto-width, so the fixed layout hands it whatever is left
                        once the cells have taken their clamped share — without it
                        the surplus is spread over every column and widens the name
                        column along with them. */}
                    <col />
                </colgroup>
                <thead>
                    <tr>
                        <th scope="col">Player</th>
                        {cols.map(i => {
                            const tick = i > 0 && i % stride === 0;
                            return (
                                // Labels are left-aligned by --ruler, so a label's left
                                // edge sits exactly on its column's tick line. Centring
                                // puts the text half a cell to the right of the moment
                                // it names.
                                <th key={i} scope="col" data-tick={tick || undefined}>
                                    {i % stride === 0 ? fmtBucketLabel(i, bucketMs) : ''}
                                </th>
                            );
                        })}
                        <th aria-hidden data-spacer />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => {
                        // Rows arrive sorted by group, so a change of group is a
                        // subgroup boundary — rule it, rather than leaving one
                        // undifferentiated block of names.
                        const startsGroup = rowIndex > 0 && rows[rowIndex - 1].group !== row.group;
                        return (
                            <tr key={row.key} data-group-start={startsGroup || undefined}>
                                <th scope="row">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 shrink-0 axi-ink-faint tabular-nums">{row.group || ''}</span>
                                        {renderIcon?.(row.profession)}
                                        <span className="truncate">{row.displayName}</span>
                                    </span>
                                </th>
                                {cols.map(i => {
                                    const value = row.buckets[i] || 0;
                                    const intensity = max > 0 ? value / max : 0;
                                    const tick = i > 0 && i % stride === 0;
                                    // Four opaque steps, and the digit on every one of
                                    // them. The band lets the eye find the shape; the
                                    // digit is the legible copy of the number.
                                    const heat = value <= 0 ? 0
                                        : intensity > 0.75 ? 4
                                            : intensity > 0.5 ? 3
                                                : intensity > 0.25 ? 2 : 1;
                                    return (
                                        <td
                                            key={i}
                                            data-bucket-cell
                                            data-tick={tick || undefined}
                                            data-heat={heat || undefined}
                                            title={`${row.displayName} \u2014 ${fmtBucketLabel(i, bucketMs)}: ${value}`}
                                        >
                                            {value > 0 ? value : ''}
                                        </td>
                                    );
                                })}
                                <td aria-hidden data-spacer />
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
