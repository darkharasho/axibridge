import { type ReactNode } from 'react';

type StatsGroupContainerProps = {
    groupId: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    sectionCount: number;
    children: ReactNode;
    visible?: boolean;
    embedded?: boolean;
};

export function StatsGroupContainer({
    groupId,
    label,
    icon: Icon,
    accentColor,
    sectionCount,
    children,
    visible = true,
    embedded = false,
}: StatsGroupContainerProps) {
    const hiddenStyle = !visible ? {
        visibility: 'hidden' as const,
        height: 0,
        overflow: 'hidden' as const,
        pointerEvents: 'none' as const,
        position: 'absolute' as const,
        width: '100%',
    } : {};

    const baseStyle = {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        ...hiddenStyle,
    };

    const header = (
        <div
            className="flex items-center gap-2.5 px-[18px] py-[14px]"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
            <div
                className="flex items-center justify-center w-[18px] h-[18px] rounded-[3px]"
                style={{ background: `${accentColor}33`, color: accentColor }}
            >
                <Icon className="w-3 h-3" />
            </div>
            <h2
                className="text-xs font-bold uppercase tracking-[0.08em]"
                style={{ color: 'var(--text-primary)' }}
            >
                {label}
            </h2>
            <span
                className="ml-auto text-[10px]"
                style={{ color: 'var(--text-secondary)' }}
            >
                {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
            </span>
        </div>
    );

    // Embedded mode (web report): plain div — motion.div interferes with recharts SVG rendering
    if (embedded) {
        return (
            <div
                id={`group-${groupId}`}
                className="stats-group-container scroll-mt-24"
                style={baseStyle}
            >
                {header}
                {children}
            </div>
        );
    }

    return (
        <div
            id={`group-${groupId}`}
            className="stats-group-container scroll-mt-24"
            style={baseStyle}
        >
            {header}
            {children}
        </div>
    );
}
