import type { ReactNode } from 'react';
import { useRef } from 'react';
import { HorizontalScrollScrubber } from './HorizontalScrollScrubber';

type DenseStatsColumn = {
    id: string;
    label: ReactNode;
    align?: 'left' | 'right';
    minWidth?: number;
};

type DenseStatsRow = {
    id: string;
    label: ReactNode;
    values: Record<string, ReactNode>;
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
        'minmax(170px, max-content)',
        ...columns.map((column) => `minmax(${column.minWidth ?? 60}px, max-content)`)
    ].join(' ');

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
                <div ref={scrollRef} className="dense-table__scroll">
                    <div className="dense-table__grid" style={{ gridTemplateColumns: templateColumns }}>
                        <div className="dense-table__head dense-table__head--sticky dense-table__head--pinned">
                            <div className="dense-table__head-inner">Player</div>
                        </div>
                        {columns.map((column) => {
                            const isSortable = !!onSortColumn;
                            const isActive = sortColumnId === column.id;
                            const arrow = isActive ? (sortDirection === 'desc' ? '↓' : '↑') : null;
                            return (
                            <div
                                key={column.id}
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
                                        {arrow && (
                                            <span className="text-[10px]" style={{ color: 'var(--text-primary)' }}>{arrow}</span>
                                        )}
                                    </button>
                                ) : (
                                    <div className="dense-table__head-inner">{column.label}</div>
                                )}
                            </div>
                        )})}
                        {rows.map((row) => (
                            <div key={row.id} className="dense-table__row">
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
