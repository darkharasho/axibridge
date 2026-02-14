import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

type TocItem = { id: string; label: string; icon: React.ComponentType<any> };
type TocGroup = { id: string; label: string; icon: React.ComponentType<any>; items: TocItem[] };

type StatsMobileNavProps = {
    embedded: boolean;
    mobileNavOpen: boolean;
    setMobileNavOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
    tocGroups: TocGroup[];
    tocItems: TocItem[];
    activeNavId: string;
    scrollToSection: (id: string) => void;
    stepSection: (direction: -1 | 1) => void;
};

export const StatsMobileNav = ({
    embedded,
    mobileNavOpen,
    setMobileNavOpen,
    tocGroups,
    tocItems,
    activeNavId,
    scrollToSection,
    stepSection
}: StatsMobileNavProps) => {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (tocGroups.length === 0) return;
        setExpandedGroups((prev) => {
            if (Object.keys(prev).length > 0) return prev;
            const init: Record<string, boolean> = {};
            tocGroups.forEach((group, idx) => {
                init[group.id] = idx === 0;
            });
            return init;
        });
    }, [tocGroups]);

    useEffect(() => {
        const group = tocGroups.find((entry) => entry.items.some((item) => item.id === activeNavId));
        if (!group) return;
        setExpandedGroups((prev) => ({ ...prev, [group.id]: true }));
    }, [activeNavId, tocGroups]);

    if (embedded) return null;
    return (
        <>
            <div
                className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${mobileNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setMobileNavOpen(false)}
            />
            <div className="fixed bottom-4 left-4 right-4 z-50">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-[#1f252b] px-3 py-1.5">
                    <button
                        onClick={() => stepSection(-1)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#202830] border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        <ChevronDown className="w-4 h-4 rotate-90 text-[color:var(--accent)]" />
                        Prev
                    </button>
                    <button
                        onClick={() => setMobileNavOpen((open) => !open)}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#202830] border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        <span className="truncate max-w-[160px]">
                            {tocItems.find((item) => item.id === activeNavId)?.label || 'Sections'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[color:var(--accent)] transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        onClick={() => stepSection(1)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#202830] border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        Next
                        <ChevronDown className="w-4 h-4 -rotate-90 text-[color:var(--accent)]" />
                    </button>
                </div>
            </div>
            {mobileNavOpen && (
                <div
                    data-stats-mobile-nav="overlay"
                    className="fixed inset-0 z-50 flex items-center justify-center px-4"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            setMobileNavOpen(false);
                        }
                    }}
                >
                    <div data-stats-mobile-nav="panel" className="w-full max-w-sm max-h-[68vh] rounded-2xl p-4 border border-white/20 bg-[#1f252b] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Jump to</div>
                            <button
                                onClick={() => setMobileNavOpen(false)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                                aria-label="Close navigation"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div
                            data-stats-mobile-nav="list"
                            className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y -mx-4 px-4 pb-8"
                            onWheel={(event) => event.stopPropagation()}
                            onTouchMove={(event) => event.stopPropagation()}
                        >
                            <div className="space-y-3">
                                {tocGroups.map((group) => {
                                    const GroupIcon = group.icon;
                                    const open = expandedGroups[group.id] ?? false;
                                    const activeInGroup = group.items.some((item) => item.id === activeNavId);
                                    return (
                                        <div key={group.id} className="space-y-1">
                                            <button
                                                onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: !open }))}
                                                className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors ${activeInGroup
                                                    ? 'bg-white/10 border-white/15 text-white'
                                                    : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/[0.08]'
                                                    }`}
                                            >
                                                <span className="flex items-center justify-center w-6 h-6">
                                                    <GroupIcon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                                </span>
                                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] truncate">{group.label}</span>
                                                <ChevronDown className={`ml-auto w-4 h-4 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                                            </button>
                                            {open && (
                                                <div className="space-y-1 pl-2">
                                                    {group.items.map((item) => {
                                                        const Icon = item.icon;
                                                        const isActive = item.id === activeNavId;
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                onClick={() => scrollToSection(item.id)}
                                                                className={`stats-nav-entry stats-nav-entry--item w-full text-left flex items-center gap-2 px-2 py-2 text-gray-200 transition-colors min-w-0 rounded-md ${isActive
                                                                    ? 'bg-white/10'
                                                                    : 'hover:bg-white/[0.03]'
                                                                    }`}
                                                            >
                                                                <span className="flex items-center justify-center w-6 h-6">
                                                                    <Icon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                                                </span>
                                                                <span className="text-[13px] font-medium truncate min-w-0">{item.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
