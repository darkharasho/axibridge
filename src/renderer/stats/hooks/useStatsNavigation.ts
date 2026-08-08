import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { STATS_CATEGORIES, SECTION_TO_CATEGORY } from '../statsTaxonomy';
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

export const useStatsNavigation = (_embedded: boolean, trackActiveOnScroll = true, scrollLocked = false) => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [activeNavId, setActiveNavId] = useState('overview');
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const activeCategory = useStatsStore((s) => s.activeCategory);

    const tocGroups = useMemo(() => STATS_TOC_GROUPS, []);
    const tocItems = useMemo(
        () => tocGroups.flatMap((group) => group.items),
        [tocGroups]
    );
    // Scope tracking/stepping to the active category only, so scroll-spy and
    // keyboard stepping don't reach into sections that aren't even mounted.
    const activeItems = useMemo(
        () => tocGroups.find((group) => group.id === activeCategory)?.items ?? [],
        [tocGroups, activeCategory]
    );

    const scrollToSection = (id: string) => {
        const targetId = id === 'kdr' ? 'overview' : id;
        const container = scrollContainerRef.current;
        const node = document.getElementById(targetId);
        if (container && node) {
            const containerRect = container.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const rawTop = nodeRect.top - containerRect.top + container.scrollTop;
            const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
            const nextTop = Math.min(Math.max(rawTop - 16, 0), maxTop);
            container.scrollTo({ top: nextTop, behavior: 'smooth' });
            setActiveNavId(targetId);
        } else if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveNavId(targetId);
        }
        setMobileNavOpen(false);
    };

    const activateCategory = (categoryId: string) => {
        useStatsStore.getState().setActiveCategory(categoryId);
    };

    const jumpToSection = (sectionId: string) => {
        const categoryId = SECTION_TO_CATEGORY.get(sectionId);
        if (categoryId) activateCategory(categoryId);
        // Retry loop: the category's sections may not be committed yet.
        let attempts = 0;
        const tryScroll = () => {
            const node = document.getElementById(sectionId);
            if (node) { scrollToSection(sectionId); return; }
            if (attempts++ < 20) window.setTimeout(() => requestAnimationFrame(tryScroll), 40);
        };
        requestAnimationFrame(tryScroll);
    };

    const stepSection = (direction: -1 | 1) => {
        const currentIndex = Math.max(0, activeItems.findIndex((item) => item.id === activeNavId));
        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= activeItems.length) {
            // Crossed a category boundary — move to the adjacent category and land
            // on its last item (moving up) or first item (moving down).
            const categoryIndex = tocGroups.findIndex((g) => g.id === activeCategory);
            if (categoryIndex === -1) return;
            const nextGroup = tocGroups[categoryIndex + direction];
            if (!nextGroup || nextGroup.items.length === 0) return;
            activateCategory(nextGroup.id);
            const targetItem = direction === 1 ? nextGroup.items[0] : nextGroup.items[nextGroup.items.length - 1];
            if (targetItem) jumpToSection(targetItem.id);
            return;
        }
        const nextId = activeItems[nextIndex]?.id;
        if (nextId) scrollToSection(nextId);
    };

    useEffect(() => {
        if (!trackActiveOnScroll || scrollLocked) return;
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
            setActiveNavId((prev) => (prev === currentId ? prev : currentId));
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
    }, [activeItems, trackActiveOnScroll, scrollLocked]);

    return {
        mobileNavOpen,
        setMobileNavOpen,
        activeNavId,
        setActiveNavId,
        scrollContainerRef,
        tocGroups,
        tocItems,
        scrollToSection,
        stepSection,
        activateCategory,
        jumpToSection
    };
};
