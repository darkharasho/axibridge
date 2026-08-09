import type { SearchEntry } from './searchIndex';
import { useStatsStore } from '../statsStore';

export interface UseSearchJumpOptions {
    onRequestCategory: (categoryId: string) => void;
}

// Activates the entry's owning category, then retry-polls for the section's
// mount (categories render lazily, so the target may not exist yet on the
// frame this is called), scrolls to the most specific target it can find,
// and applies a timed flash highlight.
export function useSearchJump({ onRequestCategory }: UseSearchJumpOptions) {
    const jumpToEntry = (entry: SearchEntry) => {
        onRequestCategory(entry.categoryId);
        // Keep the subnav highlight in sync with the jump so it never goes stale
        // (CategoryBar/SectionSubnav read activeSectionId from the store). Harmless
        // on the web, whose nav highlight is driven by reportApp's local state.
        useStatsStore.getState().setActiveSectionId(entry.sectionId);
        let attempts = 0;
        const tick = () => {
            const sectionEl = document.getElementById(entry.sectionId);
            if (!sectionEl) {
                if (attempts++ < 20) window.setTimeout(() => requestAnimationFrame(tick), 40);
                return;
            }
            let target: Element = sectionEl;
            if (entry.type === 'metric' && entry.metricId) {
                target = sectionEl.querySelector(`[data-metric-key="${CSS.escape(entry.metricId)}"]`) ?? sectionEl;
            } else if (entry.type === 'player' && entry.account) {
                target = sectionEl.querySelector(`[data-player-account="${CSS.escape(entry.account)}"]`) ?? sectionEl;
            }
            target.scrollIntoView({ behavior: 'smooth', block: entry.type === 'section' ? 'start' : 'center' });
            target.classList.remove('axi-search-flash');
            // reflow so re-adding restarts the animation
            void (target as HTMLElement).offsetWidth;
            target.classList.add('axi-search-flash');
            window.setTimeout(() => target.classList.remove('axi-search-flash'), 3400);
        };
        requestAnimationFrame(tick);
    };
    return { jumpToEntry };
}
