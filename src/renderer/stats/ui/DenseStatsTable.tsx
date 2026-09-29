import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { HorizontalScrollScrubber } from './HorizontalScrollScrubber';

type DenseStatsColumn = {
    id: string;
    label: ReactNode;
    minWidth?: number;
    /**
     * Search-jump target key (metric `id` from OFFENSE_METRICS/DEFENSE_METRICS/etc).
     * Only the five metric-home sections set this; other DenseStatsTable
     * consumers (e.g. PlayerBreakdownSection's skill columns) omit it, so no
     * attribute is rendered for them. See useSearchJump's data-metric-key selector.
     */
    metricKey?: string;
};

type DenseStatsRow = {
    id: string;
    label: ReactNode;
    values: Record<string, ReactNode>;
    /**
     * Search-jump target key (player account). Only PlayerBreakdownSection's
     * per-player rows set this. See useSearchJump's data-player-account selector.
     */
    playerAccount?: string;
};

type DenseStatsTableProps = {
    title?: ReactNode;
    subtitle?: ReactNode;
    controls?: ReactNode;
    columns: DenseStatsColumn[];
    rows: DenseStatsRow[];
    sortColumnId?: string | null;
    sortDirection?: 'asc' | 'desc';
    onSortColumn?: (columnId: string) => void;
    className?: string;
};

export const DenseStatsTable = ({
    title,
    subtitle,
    controls,
    columns,
    rows,
    sortColumnId,
    sortDirection = 'desc',
    onSortColumn,
    className = ''
}: DenseStatsTableProps) => {
    const scrollRef = useRef<HTMLDivElement | null>(null);

    // Workaround: Electron/Chromium compositing breaks native wheel→scroll binding
    // when the element is inside a position:fixed portal with backdrop-filter ancestors.
    // Manually apply deltaY to scrollTop so wheel scrolling works.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            el.scrollTop += e.deltaY;
            e.preventDefault();
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, []);

    return (
        <div className={`dense-table ${className}`}>
            {(title || subtitle) && (
                <div className="dense-table__header">
                    {title && <div className="dense-table__title">{title}</div>}
                    {subtitle && <p className="axi-eyebrow">{subtitle}</p>}
                </div>
            )}
            {controls}
            <div className="axi-panel dense-table__container" style={{ '--axi-panel-pad': '0' } as CSSProperties}>
                <div ref={scrollRef} className="axi-table__scroll dense-table__scroll">
                    <table className="axi-table axi-table--sticky axi-table--pinned axi-table--dense">
                        <thead>
                            <tr>
                                <th scope="col" style={{ minWidth: 220 }}>Player</th>
                                {columns.map((column) => {
                                    const isActive = sortColumnId === column.id;
                                    const ArrowIcon = isActive ? (sortDirection === 'desc' ? ChevronDown : ChevronUp) : null;
                                    return (
                                        <th
                                            key={column.id}
                                            scope="col"
                                            data-metric-key={column.metricKey}
                                            // aria-sort is the styling hook as well as the announcement:
                                            // upstream's .axi-table marks the sorted column off this
                                            // attribute rather than a class saying the same thing twice.
                                            aria-sort={isActive ? (sortDirection === 'desc' ? 'descending' : 'ascending') : undefined}
                                            style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                                        >
                                            {onSortColumn ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onSortColumn(column.id)}
                                                    className="axi-table__sort"
                                                >
                                                    <span className="truncate">{column.label}</span>
                                                    {ArrowIcon && <ArrowIcon className="w-3 h-3 shrink-0" />}
                                                </button>
                                            ) : (
                                                column.label
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} data-player-account={row.playerAccount}>
                                    {/* scope="row" is what makes the pinned first column a row's
                                        NAME rather than a cell that happens to be leftmost. */}
                                    <th scope="row">{row.label}</th>
                                    {columns.map((column) => (
                                        <td
                                            key={`${row.id}-${column.id}`}
                                            className={sortColumnId === column.id ? 'axi-table__cell--sorted' : undefined}
                                        >
                                            {row.values[column.id] ?? '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <HorizontalScrollScrubber containerRef={scrollRef} />
            </div>
        </div>
    );
};
