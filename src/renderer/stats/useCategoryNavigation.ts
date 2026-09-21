import { useCallback } from 'react';
import { STATS_CATEGORIES } from './statsTaxonomy';
import { useStatsStore } from './statsStore';

/**
 * Category and section selection for the stats nav, shared by every nav shell
 * that draws it: the hover-expand CategoryBar and the axi-design left rail
 * both need the same "pick a category, land on its first section" behaviour,
 * and a second copy of it would drift the moment one of them was touched.
 */
export function useCategoryNavigation() {
    const activeCategory = useStatsStore((s) => s.activeCategory);
    const setActiveCategory = useStatsStore((s) => s.setActiveCategory);
    const activeSectionId = useStatsStore((s) => s.activeSectionId);
    const setActiveSectionId = useStatsStore((s) => s.setActiveSectionId);

    // The target section may not be mounted yet (a category switch can
    // unmount/remount sections), so poll a few animation frames until it shows up.
    const scrollToSection = useCallback((id: string) => {
        let attempts = 0;
        const run = () => {
            const container = document.getElementById('stats-dashboard-container');
            const node = document.getElementById(id);
            if (!(container instanceof HTMLElement) || !(node instanceof HTMLElement)) {
                if (attempts++ < 10) requestAnimationFrame(run);
                return;
            }
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        requestAnimationFrame(run);
    }, []);

    const handleCategoryClick = useCallback((categoryId: string) => {
        // Already active — its subnav is already showing, don't yank the scroll
        // position back to the first section.
        if (categoryId === activeCategory) return;
        const category = STATS_CATEGORIES.find((c) => c.id === categoryId);
        const targetId = category?.sections[0]?.id;
        setActiveCategory(categoryId);
        if (targetId) {
            setActiveSectionId(targetId);
            scrollToSection(targetId);
        }
    }, [activeCategory, scrollToSection, setActiveCategory, setActiveSectionId]);

    const handleSectionClick = useCallback((sectionId: string) => {
        setActiveSectionId(sectionId);
        scrollToSection(sectionId);
    }, [scrollToSection, setActiveSectionId]);

    return { activeCategory, activeSectionId, handleCategoryClick, handleSectionClick };
}
