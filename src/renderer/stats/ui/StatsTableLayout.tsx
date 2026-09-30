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
    /* Upstream's split pane: a picker in a well on the left choosing what the
       raised body on the right shows. It brings the column widths, the gap,
       the body's surface, edge and block, the quiet scrollbar on the picker,
       and the stack under 640px. The stats-table-layout* names stay as hooks
       for tests and carry no styling. */
    <div className={`stats-table-layout axi-split ${expanded ? 'flex-1 min-h-0 h-full' : ''} ${className}`}>
        <div className={`axi-well axi-split__nav stats-table-layout__sidebar ${sidebarClassName}`} style={sidebarStyle}>{sidebar}</div>
        <div className={`axi-split__body stats-table-layout__content ${contentClassName}`} style={contentStyle}>{content}</div>
    </div>
);
