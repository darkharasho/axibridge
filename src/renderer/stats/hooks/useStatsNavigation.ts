import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { STATS_CATEGORIES } from '../statsTaxonomy';
import { useStatsStore } from '../statsStore';

export type StatsTocIcon = ComponentType<{ className?: string }>;

export interface StatsTocItem {
    id: string;
    label: string;
    icon: StatsTocIcon;
}

export interface StatsTocGroup {
    id: string;
    label: string;
    icon: StatsTocIcon;
    sectionIds: readonly string[];
    items: readonly StatsTocItem[];
}

// Derived from the taxonomy module (Task 1) — one TOC group per category, in the
// same order as STATS_CATEGORIES. Web/History pick up the new grouping automatically
// wherever they consume STATS_TOC_GROUPS.
export const STATS_TOC_GROUPS: readonly StatsTocGroup[] = STATS_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    sectionIds: c.sections.map((s) => s.id),
    items: c.sections.map((s) => ({ id: s.id, label: s.label, icon: s.icon })),
}));

/**
 * Provides the desktop scroll container ref plus a scroll-spy that tracks which
 * section is currently in view and writes it to the store (`activeSectionId`),
 * which CategoryBar/SectionSubnav consume for the subnav highlight.
 *
 * Navigation actions (activate category, scroll/flash to a section) are NOT owned
 * here anymore: the data map and search palette both route through
 * `useSearchJump` (scrollIntoView-based, works on desktop + embedded History +
 * web), and CategoryBar owns its own click-to-scroll. The old container-scroll
 * helpers (`scrollToSection`/`jumpToSection`/`stepSection`) were removed because
 * `container.scrollTo` is a no-op on embedded hosts where the page — not this
 * container — scrolls.
 *
 * The scroll-spy is scoped to the active category (only its sections are mounted)
 * and runs in desktop mode only: embedded hosts scroll the page, not
 * `scrollContainerRef`, so the highlight there is driven purely by clicks/jumps.
 */
export const useStatsNavigation = (embedded: boolean, trackActiveOnScroll = true, scrollLocked = false) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const activeCategory = useStatsStore((s) => s.activeCategory);

    const tocGroups = useMemo(() => STATS_TOC_GROUPS, []);
    // Scope tracking to the active category only, so scroll-spy doesn't reach into
    // sections that aren't even mounted.
    const activeItems = useMemo(
        () => tocGroups.find((group) => group.id === activeCategory)?.items ?? [],
        [tocGroups, activeCategory]
    );

    useEffect(() => {
        if (!trackActiveOnScroll || scrollLocked || embedded) return;
        const container = scrollContainerRef.current;
        if (!container) return;
        let raf = 0;
        const updateActiveSection = () => {
            const containerTop = container.getBoundingClientRect().top;
            let currentId = activeItems[0]?.id || 'overview';
            activeItems.forEach((item) => {
                const el = document.getElementById(item.id);
                if (!el) return;
                const offset = el.getBoundingClientRect().top - containerTop;
                if (offset <= 24) {
                    currentId = item.id;
                }
            });
            const store = useStatsStore.getState();
            if (store.activeSectionId !== currentId) store.setActiveSectionId(currentId);
        };
        const onScroll = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateActiveSection);
        };
        updateActiveSection();
        container.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            container.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [activeItems, trackActiveOnScroll, scrollLocked, embedded]);

    return {
        scrollContainerRef,
    };
};
