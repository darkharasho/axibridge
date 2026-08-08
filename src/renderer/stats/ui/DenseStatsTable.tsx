import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { HorizontalScrollScrubber } from './HorizontalScrollScrubber';

type DenseStatsColumn = {
    id: string;
    label: ReactNode;
    align?: 'left' | 'right';
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
    const templateColumns = [
        'minmax(220px, max-content)',
        ...columns.map((column) => `minmax(${column.minWidth ?? 60}px, max-content)`)
    ].join(' ');

    // Track whether the scroll container has been scrolled to show a shadow on the sticky header
    const [isScrolled, setIsScrolled] = useState(false);
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (el) setIsScrolled(el.scrollTop > 2);
    }, []);

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
                    {subtitle && <div className="dense-table__subtitle">{subtitle}</div>}
                </div>
            )}
            {controls && <div className="dense-table__controls">{controls}</div>}
            <div className="dense-table__container">
                <div ref={scrollRef} onScroll={handleScroll} className={`dense-table__scroll${isScrolled ? ' dense-table__scroll--scrolled' : ''}`}>
                    <div className="dense-table__grid" style={{ gridTemplateColumns: templateColumns }}>
                        <div className="dense-table__head dense-table__head--sticky dense-table__head--pinned">
                            <div className="dense-table__head-inner">Player</div>
                        </div>
                        {columns.map((column) => {
                            const isSortable = !!onSortColumn;
                            const isActive = sortColumnId === column.id;
                            const ArrowIcon = isActive ? (sortDirection === 'desc' ? ChevronDown : ChevronUp) : null;
                            return (
                            <div
                                key={column.id}
                                data-metric-key={column.metricKey}
                                className={`dense-table__head ${column.align === 'right' ? 'dense-table__cell--right' : ''} ${sortColumnId === column.id ? 'dense-table__head--active' : ''}`}
                                style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                            >
                                {isSortable ? (
                                    <button
                                        type="button"
                                        onClick={() => onSortColumn?.(column.id)}
                                        className="dense-table__head-inner"
                                    >
                                        <span className="truncate">{column.label}</span>
                                        {ArrowIcon && (
                                            <ArrowIcon className="w-3 h-3 shrink-0" style={{ color: 'var(--text-primary)' }} />
                                        )}
                                    </button>
                                ) : (
                                    <div className="dense-table__head-inner">{column.label}</div>
                                )}
                            </div>
                        )})}
                        {rows.map((row) => (
                            <div key={row.id} data-player-account={row.playerAccount} className="dense-table__row">
                                <div className="dense-table__cell dense-table__cell--label dense-table__cell--pinned">{row.label}</div>
                                {columns.map((column) => (
                                    <div
                                        key={`${row.id}-${column.id}`}
                                        className={`dense-table__cell ${column.align === 'right' ? 'dense-table__cell--right' : ''} ${sortColumnId === column.id ? 'dense-table__cell--active' : ''}`}
                                    >
                                        {row.values[column.id] ?? '-'}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <HorizontalScrollScrubber containerRef={scrollRef} />
            </div>
        </div>
    );
};
