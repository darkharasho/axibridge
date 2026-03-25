import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { STATS_TOC_GROUPS } from './hooks/useStatsNavigation';

const EXPAND_DELAY_MS = 180;
const CLOSE_HOLD_MS = 1250;
const CONTENT_HOLD_MS = 1450;
const GROUP_SWITCH_CLOSE_MS = 320;
const GROUP_SWITCH_CONTENT_HOLD_MS = 520;

export interface StatsNavSidebarProps {
    onSectionVisibilityChange: (fn: (id: string) => boolean) => void;
    onScrollToSection?: (id: string) => void;
}

export function StatsNavSidebar({ onSectionVisibilityChange, onScrollToSection }: StatsNavSidebarProps) {
    const [activeNavId, setActiveNavId] = useState('overview');
    const [activeGroup, setActiveGroup] = useState('overview');
    const [openGroup, setOpenGroup] = useState('overview');
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSubnavReady, setIsSubnavReady] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isContentClosing, setIsContentClosing] = useState(false);
    const [closingGroupId, setClosingGroupId] = useState<string | null>(null);
    const [closingContentGroupId, setClosingContentGroupId] = useState<string | null>(null);

    const expandDelayRef = useRef<number | null>(null);
    const collapseDelayRef = useRef<number | null>(null);
    const groupCloseRef = useRef<number | null>(null);
    const contentCloseRef = useRef<number | null>(null);
    const groupContentCloseRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (expandDelayRef.current !== null) window.clearTimeout(expandDelayRef.current);
            if (collapseDelayRef.current !== null) window.clearTimeout(collapseDelayRef.current);
            if (groupCloseRef.current !== null) window.clearTimeout(groupCloseRef.current);
            if (contentCloseRef.current !== null) window.clearTimeout(contentCloseRef.current);
            if (groupContentCloseRef.current !== null) window.clearTimeout(groupContentCloseRef.current);
        };
    }, []);

    const activeGroupDef = useMemo(
        () => STATS_TOC_GROUPS.find((g) => g.id === activeGroup) || STATS_TOC_GROUPS[0],
        [activeGroup]
    );

    // Push sectionVisibility up whenever activeGroupDef changes
    useEffect(() => {
        const sectionIds = Array.isArray((activeGroupDef as any)?.sectionIds)
            ? (activeGroupDef as any).sectionIds
            : ((activeGroupDef as any)?.items || []).map((item: any) => item.id);
        onSectionVisibilityChange((id: string) => sectionIds.includes(id));
    }, [activeGroupDef, onSectionVisibilityChange]);

    const handleMouseEnter = useCallback(() => {
        if (collapseDelayRef.current !== null) { window.clearTimeout(collapseDelayRef.current); collapseDelayRef.current = null; }
        if (groupCloseRef.current !== null) { window.clearTimeout(groupCloseRef.current); groupCloseRef.current = null; }
        if (contentCloseRef.current !== null) { window.clearTimeout(contentCloseRef.current); contentCloseRef.current = null; }
        if (groupContentCloseRef.current !== null) { window.clearTimeout(groupContentCloseRef.current); groupContentCloseRef.current = null; }
        setClosingGroupId(null);
        setClosingContentGroupId(null);
        setIsClosing(false);
        setIsContentClosing(false);
        setIsExpanded(true);
        setIsSubnavReady(false);
        if (expandDelayRef.current !== null) { window.clearTimeout(expandDelayRef.current); expandDelayRef.current = null; }
        expandDelayRef.current = window.setTimeout(() => {
            setIsSubnavReady(true);
            expandDelayRef.current = null;
        }, EXPAND_DELAY_MS);
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (expandDelayRef.current !== null) { window.clearTimeout(expandDelayRef.current); expandDelayRef.current = null; }
        if (!isSubnavReady) {
            setIsClosing(false); setIsContentClosing(false); setIsExpanded(false); setIsSubnavReady(false);
            return;
        }
        setIsSubnavReady(false);
        setIsClosing(true);
        setIsContentClosing(true);
        if (collapseDelayRef.current !== null) { window.clearTimeout(collapseDelayRef.current); collapseDelayRef.current = null; }
        collapseDelayRef.current = window.setTimeout(() => {
            setIsClosing(false); setIsExpanded(false); collapseDelayRef.current = null;
        }, CLOSE_HOLD_MS);
        if (contentCloseRef.current !== null) { window.clearTimeout(contentCloseRef.current); contentCloseRef.current = null; }
        contentCloseRef.current = window.setTimeout(() => {
            setIsContentClosing(false); contentCloseRef.current = null;
        }, CONTENT_HOLD_MS);
    }, [isSubnavReady]);

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
        if (groupId !== openGroup) {
            if (groupCloseRef.current !== null) { window.clearTimeout(groupCloseRef.current); groupCloseRef.current = null; }
            if (groupContentCloseRef.current !== null) { window.clearTimeout(groupContentCloseRef.current); groupContentCloseRef.current = null; }
            setClosingGroupId(openGroup);
            setClosingContentGroupId(openGroup);
            groupCloseRef.current = window.setTimeout(() => { setClosingGroupId(null); groupCloseRef.current = null; }, GROUP_SWITCH_CLOSE_MS);
            groupContentCloseRef.current = window.setTimeout(() => { setClosingContentGroupId(null); groupContentCloseRef.current = null; }, GROUP_SWITCH_CONTENT_HOLD_MS);
        }
        setOpenGroup(groupId);
        setActiveGroup(groupId);
        setActiveNavId(itemId);
        requestAnimationFrame(() => scrollToSection(itemId));
    }, [scrollToSection, openGroup]);

    const surfaceClass = 'border border-[color:var(--border-default)]';
    const subnavClass = 'rounded-[4px] border border-[color:var(--border-subtle)]';
    const shellClass = 'rounded-[4px] border border-[color:var(--border-default)]';
    const groupBtnState = 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]';
    const groupBtnActive = 'text-white';
    const entryState = 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]';
    const entryActive = 'text-white';

    return (
        <aside className="relative w-[248px] -mr-[176px] shrink-0 self-stretch min-h-0 overflow-visible ml-1">
            <div
                className={`stats-dashboard-nav-panel group/statsnavpanel absolute inset-y-0 left-0 z-40 min-h-0 w-[72px] hover:w-[248px] rounded-[4px] ${surfaceClass} overflow-hidden will-change-[width] transition-[width] duration-[1250ms] ease-[cubic-bezier(0.16,1,0.3,1)]`}
                style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="h-full min-h-0 overflow-y-auto py-3 px-3 space-y-1.5">
                    <div className="px-2 h-5 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover/statsnavpanel:opacity-100">
                        <span
                            className="w-4 h-4 inline-block shrink-0"
                            style={{
                                backgroundColor: 'var(--brand-primary)',
                                WebkitMaskImage: 'url(/svg/AxiBridge.svg)',
                                maskImage: 'url(/svg/AxiBridge.svg)',
                                WebkitMaskSize: 'contain',
                                maskSize: 'contain',
                                WebkitMaskRepeat: 'no-repeat',
                                maskRepeat: 'no-repeat',
                                WebkitMaskPosition: 'center',
                                maskPosition: 'center',
                            }}
                        />
                        <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: 'var(--text-secondary)' }}>Jump to</span>
                    </div>
                    {STATS_TOC_GROUPS.map((group) => {
                        const GroupIcon = group.icon as any;
                        const isActiveGroup = group.id === activeGroupDef?.id;
                        const isCurrentGroup = openGroup === group.id;
                        const defaultTarget = group.sectionIds?.[0] || group.items[0]?.id || 'overview';
                        const isOpenGroup = isSubnavReady && isCurrentGroup;
                        const isNavClosing = isClosing && isCurrentGroup;
                        const isSwitchClosing = closingGroupId === group.id;
                        const isNavContentClosing2 = isContentClosing && isCurrentGroup;
                        const isSwitchContentClosing = closingContentGroupId === group.id;
                        const closingPhase = isNavClosing && !isOpenGroup;
                        const showCompactChildren = isCurrentGroup && (!isExpanded || !isSubnavReady);
                        const expanded = isOpenGroup || isNavClosing || isSwitchClosing || showCompactChildren;
                        const showContent = isOpenGroup || isNavContentClosing2 || isSwitchContentClosing || showCompactChildren;
                        const switchClosingPhase = isSwitchClosing && !isOpenGroup;
                        const disableFade = closingPhase || switchClosingPhase;
                        return (
                            <div key={group.id} className={`stats-nav-group-shell ${shellClass}`}>
                                <button type="button"
                                    onClick={() => { if (isOpenGroup) return; handleItemClick(group.id, defaultTarget); }}
                                    className={`stats-nav-group-button ${isActiveGroup ? 'stats-nav-group-button--active' : ''} w-full h-9 flex items-center justify-start gap-0 pl-[21px] pr-[21px] text-left transition-[padding,gap,background-color,color] duration-[980ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/statsnavpanel:gap-2 group-hover/statsnavpanel:pl-3 group-hover/statsnavpanel:pr-3 ${isActiveGroup ? groupBtnActive : groupBtnState}`}
                                >
                                    <GroupIcon className={`w-3.5 h-3.5 text-[color:var(--brand-primary)] shrink-0 transition-transform duration-[1050ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'scale-110' : 'scale-100'}`} />
                                    <span className={`stats-nav-group-label text-[11px] leading-none font-semibold uppercase tracking-[0.18em] whitespace-nowrap overflow-hidden transition-[opacity,transform,max-width] duration-[1050ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'opacity-100 translate-x-0 max-w-[160px]' : 'opacity-0 -translate-x-2 max-w-0'}`}>{group.label}</span>
                                    <span className={`inline-flex ml-auto overflow-hidden transition-[opacity,transform,max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'opacity-100 scale-100 max-w-[24px]' : 'opacity-0 scale-75 max-w-0'} ${isOpenGroup || isNavClosing || isSwitchClosing ? 'rotate-0' : '-rotate-90'}`}>
                                        <ChevronDown className="w-4 h-4 text-gray-300" />
                                    </span>
                                </button>
                                <div className={`${expanded ? 'max-h-[560px]' : 'max-h-0'} overflow-hidden transition-[max-height] ${switchClosingPhase ? 'duration-[320ms]' : 'duration-[1180ms]'} ease-[cubic-bezier(0.16,1,0.3,1)]`}>
                                    <div className={`stats-nav-subnav-shell origin-top pt-1.5 pb-1.5 px-2 space-y-0.5 will-change-[opacity,transform] ${disableFade ? '' : (switchClosingPhase ? 'transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'transition-[opacity,transform] duration-[1020ms] ease-[cubic-bezier(0.16,1,0.3,1)]')} ${subnavClass} ${showContent ? 'opacity-100 translate-y-0 scale-y-100' : (switchClosingPhase ? 'opacity-0 -translate-y-1 scale-y-95' : 'opacity-0 -translate-y-2 scale-y-95')}`}>
                                        {group.items.map((item, index) => {
                                            const ItemIcon = item.icon;
                                            const isActive = activeNavId === item.id;
                                            const enterDelay = 420 + Math.min(index * 34, 204);
                                            return (
                                                <div key={item.id}
                                                    style={{ transitionDelay: isOpenGroup ? `${enterDelay}ms` : '0ms' }}
                                                    className={`${disableFade ? '' : (switchClosingPhase ? 'transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'transition-[opacity,transform] duration-[560ms] ease-[cubic-bezier(0.16,1,0.3,1)]')} ${showContent ? 'opacity-100 translate-x-0' : (switchClosingPhase ? 'opacity-0 -translate-x-1' : 'opacity-0 -translate-x-2')}`}
                                                >
                                                    <button type="button"
                                                        onClick={() => handleItemClick(group.id, item.id)}
                                                        className={`stats-nav-entry ${isActive ? 'stats-nav-entry--active' : ''} w-full h-[34px] flex items-center text-left rounded-md transition-colors duration-150 ${isExpanded ? 'justify-start gap-2 px-2' : 'justify-center gap-0 px-2'} ${isActive ? entryActive : entryState}`}
                                                    >
                                                        <ItemIcon className="w-3.5 h-3.5 text-[color:var(--brand-primary)] shrink-0" />
                                                        <span className={`stats-nav-item-label text-xs leading-tight truncate overflow-hidden transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isExpanded ? 'opacity-100 max-w-[140px] translate-x-0' : 'opacity-0 max-w-0 -translate-x-1'}`}>{item.label}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
}
