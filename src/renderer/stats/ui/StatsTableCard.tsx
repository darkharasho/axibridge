import type { CSSProperties, ReactNode } from 'react';

const defaultSidebarClass = 'stats-table-sidebar pr-3 flex flex-col min-h-0 overflow-y-auto';
const defaultSidebarStyle: CSSProperties = { borderRight: '1px solid var(--border-subtle)' };
const defaultContentClass = 'overflow-hidden pl-3 min-w-0';
const defaultContentStyle: CSSProperties = {};

type StatsTableCardProps = {
    expanded?: boolean;
    className?: string;
    sidebarClassName?: string;
    contentClassName?: string;
    sidebar: ReactNode;
    content: ReactNode;
};

export const StatsTableCard = ({
    expanded,
    className = '',
    sidebarClassName,
    contentClassName,
    sidebar,
    content
}: StatsTableCardProps) => {
    const resolvedSidebarClass = sidebarClassName ?? `${defaultSidebarClass} ${expanded ? 'flex-1' : ''}`;
    const resolvedSidebarStyle = sidebarClassName ? undefined : defaultSidebarStyle;
    const resolvedContentClass = contentClassName ?? `${defaultContentClass} ${expanded ? 'flex flex-col min-h-0' : ''}`;
    const resolvedContentStyle = contentClassName ? undefined : defaultContentStyle;

    return (
        <div className={`grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0 ${expanded ? 'flex-1 min-h-0 h-full' : 'max-h-[480px]'} ${className}`}>
            <div className={resolvedSidebarClass} style={resolvedSidebarStyle}>{sidebar}</div>
            <div className={resolvedContentClass} style={resolvedContentStyle}>
                {content}
            </div>
        </div>
    );
};

type StatsTableCardTableProps = {
    header: ReactNode;
    columns: ReactNode;
    rows: ReactNode;
    expanded?: boolean;
    maxHeightClass?: string;
};

export const StatsTableCardTable = ({
    header,
    columns,
    rows,
    expanded,
    maxHeightClass = 'max-h-80'
}: StatsTableCardTableProps) => (
    <>
        {header}
        {columns}
        <div className={`${expanded ? 'flex-1 min-h-0 overflow-y-auto' : `${maxHeightClass} overflow-y-auto`}`}>
            {rows}
        </div>
    </>
);
