import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { EASE, DURATION } from '../../motion';

type StatsGroupContainerProps = {
    groupId: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    sectionCount: number;
    children: ReactNode;
    visible?: boolean;
    embedded?: boolean;
    /** Zero-based index of this group within the stats view, used for stagger delay */
    groupIndex?: number;
};

const groupVariants = {
    groupHidden: { opacity: 0, y: 12 },
    groupVisible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.07,
            duration: DURATION.slow,
            ease: EASE.outExpo,
        },
    }),
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
    groupIndex = 0,
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
        background: 'var(--axi-surface-paint)',
        border: 'var(--axi-border-panel) solid var(--axi-ink-line)',
        borderLeft: `var(--axi-border-panel) solid ${accentColor}`,
        borderRadius: 'var(--axi-radius)',
        boxShadow: 'var(--axi-shadow-panel)',
        ...hiddenStyle,
    };

    const header = (
        <div
            className="flex items-center gap-2.5 px-[18px] py-[14px]"
            style={{ borderBottom: '1px solid var(--axi-rule)' }}
        >
            <div
                className="stats-group__mark flex items-center justify-center w-[18px] h-[18px] rounded-[var(--axi-radius-sm)]"
                style={{ background: `var(--axi-surface-raised-paint)`, color: accentColor }}
            >
                <Icon className="w-3 h-3" />
            </div>
            <h2
                className="text-xs font-bold uppercase tracking-[0.08em]"
                style={{ color: 'var(--axi-text)' }}
            >
                {label}
            </h2>
            <span
                className="ml-auto text-[10px]"
                style={{ color: 'var(--axi-text-dim)' }}
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
        <motion.div
            id={`group-${groupId}`}
            className="stats-group-container scroll-mt-24"
            style={baseStyle}
            custom={groupIndex}
            variants={groupVariants}
            initial="groupHidden"
            animate={visible ? 'groupVisible' : 'groupHidden'}
        >
            {header}
            {children}
        </motion.div>
    );
}
