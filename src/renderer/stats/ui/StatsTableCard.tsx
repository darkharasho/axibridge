import type { ReactNode } from 'react';

const defaultSidebarClass = 'bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0';
const defaultContentClass = 'bg-black/30 border border-white/5 rounded-xl overflow-hidden';

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
    const resolvedSidebarClass = sidebarClassName ?? `${defaultSidebarClass} ${expanded ? 'h-full flex-1' : 'self-start'}`;
    const resolvedContentClass = contentClassName ?? `${defaultContentClass} ${expanded ? 'flex flex-col min-h-0' : ''}`;

    return (
        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expanded ? 'flex-1 min-h-0 h-full' : ''} ${className}`}>
            <div className={resolvedSidebarClass}>{sidebar}</div>
            <div className={resolvedContentClass}>{content}</div>
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
