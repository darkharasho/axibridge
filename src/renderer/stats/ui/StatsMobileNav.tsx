import { ChevronDown, X } from 'lucide-react';

type TocItem = { id: string; label: string; icon: React.ComponentType<any> };

type StatsMobileNavProps = {
    embedded: boolean;
    mobileNavOpen: boolean;
    setMobileNavOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
    tocItems: TocItem[];
    activeNavId: string;
    scrollToSection: (id: string) => void;
    stepSection: (direction: -1 | 1) => void;
};

export const StatsMobileNav = ({
    embedded,
    mobileNavOpen,
    setMobileNavOpen,
    tocItems,
    activeNavId,
    scrollToSection,
    stepSection
}: StatsMobileNavProps) => {
    if (embedded) return null;
    return (
        <>
            <div
                className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-md transition-opacity ${mobileNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setMobileNavOpen(false)}
            />
            <div className="fixed bottom-4 left-4 right-4 z-50">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/25 bg-white/5 backdrop-blur-2xl px-3 py-1.5 shadow-[0_24px_65px_rgba(0,0,0,0.55)]">
                    <button
                        onClick={() => stepSection(-1)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        <ChevronDown className="w-4 h-4 rotate-90 text-[color:var(--accent)]" />
                        Prev
                    </button>
                    <button
                        onClick={() => setMobileNavOpen((open) => !open)}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        <span className="truncate max-w-[160px]">
                            {tocItems.find((item) => item.id === activeNavId)?.label || 'Sections'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[color:var(--accent)] transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        onClick={() => stepSection(1)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        Next
                        <ChevronDown className="w-4 h-4 -rotate-90 text-[color:var(--accent)]" />
                    </button>
                </div>
            </div>
            {mobileNavOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center px-4"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            setMobileNavOpen(false);
                        }
                    }}
                >
                    <div className="w-full max-w-sm max-h-[80vh] rounded-2xl p-4 border border-white/20 bg-white/5 shadow-[0_22px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl flex flex-col">
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
                        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 pb-2">
                            {tocItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = item.id === activeNavId;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => scrollToSection(item.id)}
                                        className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-gray-200 border transition-colors ${isActive
                                            ? 'bg-white/10 border-white/20'
                                            : 'border-transparent hover:border-white/10 hover:bg-white/10'
                                            }`}
                                    >
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10">
                                            <Icon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                        </span>
                                        <span className="text-[13px] font-medium">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
