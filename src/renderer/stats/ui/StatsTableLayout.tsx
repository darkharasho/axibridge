import type { ReactNode } from 'react';

type StatsTableLayoutProps = {
    expanded?: boolean;
    className?: string;
    sidebarClassName?: string;
    contentClassName?: string;
    sidebar: ReactNode;
    content: ReactNode;
};

export const StatsTableLayout = ({
    expanded,
    className = '',
    sidebarClassName = '',
    contentClassName = '',
    sidebar,
    content
}: StatsTableLayoutProps) => (
    <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expanded ? 'flex-1 min-h-0 h-full' : ''} ${className}`}>
        <div className={sidebarClassName}>{sidebar}</div>
        <div className={contentClassName}>{content}</div>
    </div>
);
