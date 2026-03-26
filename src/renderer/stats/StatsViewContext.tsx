import { createContext, useContext, type JSX, type RefObject } from 'react';

export interface StatsSharedContextValue {
    stats: any;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
    formatWithCommas: (value: number, decimals: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    roundCountStats: boolean;
    /** Portal target at the StatsView root level — sections portal their expanded
     *  content here so `position: fixed` escapes ancestor transforms/filters. */
    expandedPortalRef: RefObject<HTMLDivElement | null>;
}

export const StatsSharedContext = createContext<StatsSharedContextValue | null>(null);

export function useStatsSharedContext(): StatsSharedContextValue {
    const ctx = useContext(StatsSharedContext);
    if (!ctx) throw new Error('useStatsSharedContext must be used within StatsSharedContext.Provider');
    return ctx;
}
