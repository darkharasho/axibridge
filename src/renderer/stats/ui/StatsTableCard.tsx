import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const defaultSidebarClass = 'stats-table-sidebar bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 overflow-hidden';
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
    const contentInnerRef = useRef<HTMLDivElement | null>(null);
    const [sidebarCapHeight, setSidebarCapHeight] = useState<number | null>(null);

    useEffect(() => {
        if (expanded) {
            setSidebarCapHeight(null);
            return;
        }

        const node = contentInnerRef.current;
        if (!node) return;

        const update = () => {
            const height = Math.round(node.getBoundingClientRect().height);
            setSidebarCapHeight(height > 0 ? height : null);
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        window.addEventListener('resize', update);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [expanded, content]);

    const resolvedSidebarClass = sidebarClassName ?? `${defaultSidebarClass} h-full ${expanded ? 'flex-1' : ''}`;
    const resolvedContentClass = contentClassName ?? `${defaultContentClass} ${expanded ? 'flex flex-col min-h-0' : ''}`;
    const sidebarStyle: CSSProperties | undefined = !expanded && sidebarCapHeight
        ? { height: `${sidebarCapHeight}px`, maxHeight: `${sidebarCapHeight}px` }
        : undefined;

    return (
        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expanded ? 'flex-1 min-h-0 h-full' : ''} ${className}`}>
            <div className={resolvedSidebarClass} style={sidebarStyle}>{sidebar}</div>
            <div className={resolvedContentClass}>
                <div ref={contentInnerRef}>
                    {content}
                </div>
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
