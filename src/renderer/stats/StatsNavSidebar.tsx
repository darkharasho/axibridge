import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { STATS_TOC_GROUPS } from './hooks/useStatsNavigation';
import { useStatsStore } from './statsStore';

const COLLAPSED_W = 72;
const EXPANDED_W = 248;

// Springs kept only for transform/opacity animations (GPU-composited, no layout cost)
const FAST_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

// CSS transition for layout-affecting properties — browser-optimized, no per-frame JS overhead.
// Framer-motion springs compute spring physics in JS every frame, which is expensive for
// properties that trigger layout (width, padding, gap, maxWidth, marginLeft).
const LAYOUT_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const LAYOUT_DUR = '280ms';
const LAYOUT_T = `${LAYOUT_DUR} ${LAYOUT_EASE}`;

export interface StatsNavSidebarProps {
    onSectionVisibilityChange?: (fn: (id: string) => boolean) => void;
    onScrollToSection?: (id: string) => void;
}

export function StatsNavSidebar({ onSectionVisibilityChange, onScrollToSection }: StatsNavSidebarProps) {
    const [activeNavId, setActiveNavId] = useState('overview');
    const activeGroup = useStatsStore((s) => s.activeNavGroup);
    const setActiveGroup = useStatsStore((s) => s.setActiveNavGroup);
    const [openGroup, setOpenGroup] = useState(activeGroup);
    const [isHovered, setIsHovered] = useState(false);

    const activeGroupDef = useMemo(
        () => STATS_TOC_GROUPS.find((g) => g.id === activeGroup) || STATS_TOC_GROUPS[0],
        [activeGroup]
    );

    // Push sectionVisibility up whenever activeGroupDef changes
    useEffect(() => {
        if (!onSectionVisibilityChange) return;
        const sectionIds = Array.isArray((activeGroupDef as any)?.sectionIds)
            ? (activeGroupDef as any).sectionIds
            : ((activeGroupDef as any)?.items || []).map((item: any) => item.id);
        onSectionVisibilityChange((id: string) => sectionIds.includes(id));
    }, [activeGroupDef, onSectionVisibilityChange]);

    const scrollToSection = useCallback((id: string) => {
        if (!onScrollToSection) {
            const targetId = id === 'kdr' ? 'overview' : id;
            let attempts = 0;
            const run = () => {
                const container = document.getElementById('stats-dashboard-container');
                const node = document.getElementById(targetId);
                if (!(container instanceof HTMLElement) || !(node instanceof HTMLElement)) {
                    if (attempts++ < 10) requestAnimationFrame(run);
                    return;
                }
                node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            requestAnimationFrame(run);
            return;
        }
        onScrollToSection(id);
    }, [onScrollToSection]);

    const handleItemClick = useCallback((groupId: string, itemId: string) => {
        setOpenGroup(groupId);
        setActiveGroup(groupId);
        setActiveNavId(itemId);
        requestAnimationFrame(() => scrollToSection(itemId));
    }, [scrollToSection, setActiveGroup]);

    const expanded = isHovered;

    return (
        <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-50 w-[248px] -mr-[176px] shrink-0 self-stretch min-h-0 overflow-visible pointer-events-none"
        >
            {/* Container: width animated via CSS transition instead of framer-motion spring */}
            <div
                className="stats-dashboard-nav-panel absolute inset-y-0 left-0 z-40 min-h-0 rounded-[4px] border border-[color:var(--border-default)] overflow-hidden pointer-events-auto"
                style={{
                    background: 'var(--bg-card)',
                    boxShadow: 'var(--shadow-card)',
                    width: expanded ? EXPANDED_W : COLLAPSED_W,
                    transition: `width ${LAYOUT_T}`,
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-1.5">
                    {/* Header: padding/gap via CSS transition */}
                    <div
                        className="h-5 flex items-center"
                        style={{
                            paddingLeft: expanded ? 12 : 20,
                            paddingRight: expanded ? 12 : 20,
                            gap: expanded ? 8 : 0,
                            transition: `padding ${LAYOUT_T}, gap ${LAYOUT_T}`,
                        }}
                    >
                        <span
                            className="w-3.5 h-3.5 inline-block shrink-0"
                            style={{
                                backgroundColor: 'var(--brand-primary)',
                                WebkitMaskImage: `url(${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg)`,
                                maskImage: `url(${import.meta.env.BASE_URL || './'}svg/AxiBridge.svg)`,
                                WebkitMaskSize: 'contain',
                                maskSize: 'contain',
                                WebkitMaskRepeat: 'no-repeat',
                                maskRepeat: 'no-repeat',
                                WebkitMaskPosition: 'center',
                                maskPosition: 'center',
                            }}
                        />
                        {/* "Jump to" label: layout props via CSS, opacity via CSS */}
                        <span
                            className="text-[10px] uppercase tracking-[0.28em] whitespace-nowrap"
                            style={{
                                color: 'var(--text-secondary)',
                                opacity: expanded ? 1 : 0,
                                marginLeft: expanded ? 6 : 0,
                                transition: `opacity 200ms ease, margin-left ${LAYOUT_T}`,
                            }}
                        >
                            Jump to
                        </span>
                    </div>

                    {/* Groups */}
                    {STATS_TOC_GROUPS.map((group) => {
                        const GroupIcon = group.icon as any;
                        const isActiveGroup = group.id === activeGroupDef?.id;
                        const isOpen = openGroup === group.id;
                        const defaultTarget = group.sectionIds?.[0] || group.items[0]?.id || 'overview';

                        return (
                            <div key={group.id}>
                                {/* Group button: padding/gap via CSS transition */}
                                <button
                                    type="button"
                                    onClick={() => { if (expanded && isOpen) return; handleItemClick(group.id, defaultTarget); }}
                                    className={`w-full h-9 flex items-center text-left rounded-sm ${isActiveGroup ? 'text-white' : 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                    style={{
                                        paddingLeft: expanded ? 12 : 20,
                                        paddingRight: expanded ? 12 : 20,
                                        gap: expanded ? 10 : 0,
                                        transition: `padding ${LAYOUT_T}, gap ${LAYOUT_T}`,
                                    }}
                                >
                                    {/* Icon scale: transform-only, fine in framer-motion */}
                                    <motion.div
                                        className="shrink-0"
                                        animate={{ scale: expanded ? 1.1 : 1 }}
                                        transition={FAST_SPRING}
                                    >
                                        <GroupIcon className="w-3.5 h-3.5 text-[color:var(--brand-primary)]" />
                                    </motion.div>
                                    {/* Group label: maxWidth/marginLeft via CSS, opacity/x via framer-motion (transform) */}
                                    <motion.span
                                        className="text-[11px] leading-none font-semibold uppercase tracking-[0.18em] whitespace-nowrap overflow-hidden"
                                        style={{
                                            maxWidth: expanded ? 160 : 0,
                                            marginLeft: expanded ? 6 : 0,
                                            transition: `max-width ${LAYOUT_T}, margin-left ${LAYOUT_T}`,
                                        }}
                                        animate={{
                                            opacity: expanded ? 1 : 0,
                                            x: expanded ? 0 : -8,
                                        }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {group.label}
                                    </motion.span>
                                    {/* Chevron: maxWidth via CSS, opacity/scale/rotate via framer-motion (composited) */}
                                    <motion.span
                                        className="inline-flex ml-auto overflow-hidden"
                                        style={{
                                            maxWidth: expanded ? 24 : 0,
                                            transition: `max-width ${LAYOUT_T}`,
                                        }}
                                        animate={{
                                            opacity: expanded ? 1 : 0,
                                            scale: expanded ? 1 : 0.75,
                                            rotate: isOpen ? 0 : -90,
                                        }}
                                        transition={FAST_SPRING}
                                    >
                                        <ChevronDown className="w-4 h-4 text-gray-300" />
                                    </motion.span>
                                </button>

                                {/* Subnav items — only show when sidebar is expanded and group is open */}
                                <AnimatePresence initial={false}>
                                    {expanded && isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-1.5 pb-1.5 px-2 space-y-0.5 rounded-[4px] border border-[color:var(--border-subtle)]">
                                                {group.items.map((item, index) => {
                                                    const ItemIcon = item.icon;
                                                    const isActive = activeNavId === item.id;
                                                    return (
                                                        <motion.div
                                                            key={item.id}
                                                            initial={{ opacity: 0, x: -8 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ ...FAST_SPRING, delay: index * 0.03 }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => handleItemClick(group.id, item.id)}
                                                                className={`w-full h-[34px] flex items-center text-left rounded-md transition-colors duration-150 ${expanded ? 'justify-start gap-2 px-2' : 'justify-start gap-0 pl-[10px]'} ${isActive ? 'text-white' : 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                                            >
                                                                <ItemIcon className="w-3.5 h-3.5 text-[color:var(--brand-primary)] shrink-0" />
                                                                {/* Subnav label: maxWidth via CSS, opacity/x via framer-motion */}
                                                                <motion.span
                                                                    className="text-xs leading-tight truncate overflow-hidden"
                                                                    style={{
                                                                        maxWidth: expanded ? 140 : 0,
                                                                        transition: `max-width ${LAYOUT_T}`,
                                                                    }}
                                                                    animate={{
                                                                        opacity: expanded ? 1 : 0,
                                                                        x: expanded ? 0 : -4,
                                                                    }}
                                                                    transition={{ duration: 0.2 }}
                                                                >
                                                                    {item.label}
                                                                </motion.span>
                                                            </button>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </motion.aside>
    );
}
