import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, CloudOff } from 'lucide-react';
import { STATS_CATEGORIES } from './statsTaxonomy';
import { useCategoryNavigation } from './useCategoryNavigation';
import { SectionSubnav } from './SectionSubnav';

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

export interface CategoryBarProps {
    onSectionVisibilityChange?: (fn: (id: string) => boolean) => void;
    isSectionAllowed?: (id: string) => boolean;
    /** Categories a web upload would leave out, marked so the omission is visible
     *  before publishing rather than after. */
    unpublishedCategoryIds?: ReadonlySet<string>;
}

/**
 * Primary stats nav — replaces the old stats nav sidebar 1:1 in both mounts. Renders
 * the ten top-level categories as a hover-expand rail (same shell/motion as before);
 * the active category's SectionSubnav is always shown beneath it (no more open/closed
 * accordion — the active category IS the open one).
 */
export function CategoryBar({ onSectionVisibilityChange, isSectionAllowed, unpublishedCategoryIds }: CategoryBarProps) {
    // Active-section highlight comes from the store, not local click-only state, so
    // it follows the desktop scroll-spy (useStatsNavigation) and every jump
    // (search palette, data map, subnav) — see statsStore.activeSectionId.
    const { activeCategory, activeSectionId, handleCategoryClick, handleSectionClick } = useCategoryNavigation();
    const [isHovered, setIsHovered] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Stop wheel events from bubbling to the page when scrolling inside the nav.
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const stop = (e: WheelEvent) => e.stopPropagation();
        el.addEventListener('wheel', stop, { passive: true });
        return () => el.removeEventListener('wheel', stop);
    }, []);

    // Categories where every section is disallowed (e.g. embedded/history contexts
    // that don't have data for that category) are hidden entirely.
    const visibleCategories = useMemo(() => {
        if (!isSectionAllowed) return STATS_CATEGORIES;
        return STATS_CATEGORIES.filter((category) => category.sections.some((s) => isSectionAllowed(s.id)));
    }, [isSectionAllowed]);

    const activeCategoryDef = useMemo(
        () => STATS_CATEGORIES.find((c) => c.id === activeCategory) || STATS_CATEGORIES[0],
        [activeCategory]
    );

    // Push sectionVisibility up whenever the active category changes.
    useEffect(() => {
        if (!onSectionVisibilityChange) return;
        const sectionIds = activeCategoryDef.sections.map((s) => s.id);
        onSectionVisibilityChange((id: string) => sectionIds.includes(id));
    }, [activeCategoryDef, onSectionVisibilityChange]);

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
                <div ref={scrollContainerRef} className="h-full min-h-0 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-1.5">
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

                    {/* Categories */}
                    {visibleCategories.map((category) => {
                        const CategoryIcon = category.icon;
                        const isActiveCategory = category.id === activeCategoryDef?.id;
                        const isUnpublished = unpublishedCategoryIds?.has(category.id) ?? false;

                        return (
                            <div key={category.id}>
                                {/* Category button: padding/gap via CSS transition */}
                                <button
                                    type="button"
                                    onClick={() => handleCategoryClick(category.id)}
                                    title={isUnpublished ? `${category.label} — not included in published reports` : undefined}
                                    className={`w-full h-9 flex items-center text-left rounded-sm ${isActiveCategory ? 'text-white' : 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
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
                                        <CategoryIcon className="w-3.5 h-3.5 text-[color:var(--brand-primary)]" />
                                    </motion.div>
                                    {/* Category label: maxWidth/marginLeft via CSS, opacity/x via framer-motion (transform) */}
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
                                        {category.label}
                                    </motion.span>
                                    {isUnpublished && expanded && (
                                        <CloudOff
                                            data-testid={`category-unpublished-${category.id}`}
                                            aria-hidden="true"
                                            className="w-3 h-3 shrink-0 ml-2 text-[color:var(--text-secondary)]"
                                        />
                                    )}
                                    {/* Chevron: maxWidth via CSS, opacity/scale/rotate via framer-motion (composited).
                                        Points down for the active category (its subnav is showing below), sideways
                                        for every other category (no accordion state to track anymore). */}
                                    <motion.span
                                        className="inline-flex ml-auto overflow-hidden"
                                        style={{
                                            maxWidth: expanded ? 24 : 0,
                                            transition: `max-width ${LAYOUT_T}`,
                                        }}
                                        animate={{
                                            opacity: expanded ? 1 : 0,
                                            scale: expanded ? 1 : 0.75,
                                            rotate: isActiveCategory ? 0 : -90,
                                        }}
                                        transition={FAST_SPRING}
                                    >
                                        <ChevronDown className="w-4 h-4 text-gray-300" />
                                    </motion.span>
                                </button>

                                {/* Subnav — always rendered for the active category (no hover gate: search-palette-
                                    driven and history-driven category switches must reflect immediately). */}
                                {isActiveCategory && (
                                    <SectionSubnav
                                        category={category}
                                        activeSectionId={activeSectionId}
                                        onSelect={handleSectionClick}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </motion.aside>
    );
}
