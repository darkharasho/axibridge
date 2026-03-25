import type { CSSProperties, ReactNode } from 'react';

type StatsTableLayoutProps = {
    expanded?: boolean;
    className?: string;
    sidebarClassName?: string;
    sidebarStyle?: CSSProperties;
    contentClassName?: string;
    contentStyle?: CSSProperties;
    sidebar: ReactNode;
    content: ReactNode;
};

export const StatsTableLayout = ({
    expanded,
    className = '',
    sidebarClassName = '',
    sidebarStyle,
    contentClassName = '',
    contentStyle,
    sidebar,
    content
}: StatsTableLayoutProps) => (
    <div className={`stats-table-layout grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0 ${expanded ? 'flex-1 min-h-0 h-full' : 'max-h-[480px]'} ${className}`}>
        <div className={`stats-table-layout__sidebar pr-3 ${sidebarClassName}`} style={{ borderRight: '1px solid var(--border-subtle)', ...sidebarStyle }}>{sidebar}</div>
        <div className={`stats-table-layout__content pl-3 ${contentClassName}`} style={contentStyle}>{content}</div>
    </div>
);
