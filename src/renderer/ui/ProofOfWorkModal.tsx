import type { CSSProperties, ReactNode, Ref } from 'react';
import { X as CloseIcon } from 'lucide-react';

export type ProofOfWorkTocItem = {
    id: string;
    level: number;
    text: string;
};

export type ProofOfWorkSearchResult = {
    text: string;
    section: string;
    hitId: number;
};

type ProofOfWorkModalProps<TToc extends ProofOfWorkTocItem, TResult extends ProofOfWorkSearchResult> = {
    isOpen: boolean;
    onClose: () => void;
    searchValue: string;
    searchFocused: boolean;
    searchResults: TResult[];
    onSearchChange: (value: string) => void;
    onSearchFocus: () => void;
    onSearchBlur: (nextTarget: Node | null) => void;
    onSearchEnter: () => void;
    onSearchResultMouseDown: (result: TResult) => void;
    renderHighlightedMatch: (text: string, query: string) => ReactNode;
    searchRef: Ref<HTMLDivElement>;
    tocItems: TToc[];
    activeTocId: string;
    onTocClick: (item: TToc) => void;
    contentRef: Ref<HTMLDivElement>;
    children: ReactNode;
};

export function ProofOfWorkModal<TToc extends ProofOfWorkTocItem, TResult extends ProofOfWorkSearchResult>({
    isOpen,
    onClose,
    searchValue,
    searchFocused,
    searchResults,
    onSearchChange,
    onSearchFocus,
    onSearchBlur,
    onSearchEnter,
    onSearchResultMouseDown,
    renderHighlightedMatch,
    searchRef,
    tocItems,
    activeTocId,
    onTocClick,
    contentRef,
    children
}: ProofOfWorkModalProps<TToc, TResult>) {
    if (!isOpen) return null;

    return (
        <div
            className="app-modal-overlay axi-scrim flex items-center justify-center"
            onClick={(event) => event.target === event.currentTarget && onClose()}
        >
            <div className="app-modal-card proof-of-work-modal axi-panel axi-panel--float relative isolate w-full max-w-4xl overflow-hidden [--axi-panel-pad:24px]">
                <div className="pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden="true">
                    <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-cyan-500/8 blur-3xl" />
                    <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-slate-500/10 blur-3xl" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="text-[10px] uppercase tracking-[0.35em] axi-ink-meta">Proof of Work</div>
                            <div className="text-xl font-semibold axi-ink-plain mt-1">Metrics Specification</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative" ref={searchRef}>
                                <input
                                    type="text"
                                    value={searchValue}
                                    onChange={(event) => onSearchChange(event.target.value)}
                                    onFocus={onSearchFocus}
                                    onBlur={(event) => onSearchBlur(event.relatedTarget as Node | null)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            onSearchEnter();
                                        }
                                    }}
                                    placeholder="Search spec..."
                                    className="proof-of-work-search w-56 rounded-lg border axi-edge-rule bg-black/30 px-3 py-2 text-xs axi-ink-plain placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                                />
                                {searchFocused && searchResults.length > 0 && searchValue.trim().length >= 2 && (
                                    <div className="proof-of-work-search-results absolute right-0 mt-2 w-80 max-h-64 overflow-y-auto rounded-lg border axi-edge-rule bg-[var(--bg-base)]/95 shadow-2xl z-10">
                                        {searchResults.map((result, idx) => (
                                            <button
                                                key={`${result.hitId}-${idx}-${result.text}`}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-xs axi-ink-plain hover:bg-white/10 border-b axi-edge-rule last:border-b-0"
                                                onMouseDown={(event) => {
                                                    event.preventDefault();
                                                    onSearchResultMouseDown(result);
                                                }}
                                            >
                                                <div className="text-[10px] uppercase tracking-wide axi-ink-faint mb-1">{result.section}</div>
                                                <div className="truncate">
                                                    {renderHighlightedMatch(result.text, searchValue)}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="axi-btn axi-btn--icon axi-edge-rule axi-ink-dim"
                                aria-label="Close proof of work"
                            >
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="h-[65vh]">
                        <div className="grid grid-cols-[230px_1fr] gap-4 h-full min-h-0">
                            <div className="proof-of-work-sidebar h-full overflow-y-auto pr-2 rounded-xl border axi-edge-rule bg-white/5 p-3">
                                <div className="proof-of-work-toc-header text-[10px] uppercase tracking-[0.3em] axi-ink-dim mb-2">On This Page</div>
                                <div className="space-y-1">
                                    {tocItems.length === 0 && (
                                        <div className="px-2 py-1 text-[11px] axi-ink-faint">Loading sections…</div>
                                    )}
                                    {tocItems.map((item, idx) => {
                                        const isActive = item.id === activeTocId;
                                        return (
                                            <button
                                                key={`${item.id}-${item.level}-${idx}`}
                                                type="button"
                                                data-toc-active={isActive ? 'true' : 'false'}
                                                className={`proof-of-work-toc-item ${item.level === 1 ? 'proof-of-work-toc-item--l1' : item.level === 2 ? 'proof-of-work-toc-item--l2' : 'proof-of-work-toc-item--l3'} w-full text-left flex items-center gap-2 min-w-0 transition-colors ${isActive ? 'proof-of-work-toc-item--active !axi-ink-meta hover:!axi-ink-meta' : (item.level === 1 ? 'axi-ink-plain hover:text-white' : 'axi-ink-dim hover:text-gray-200')}`}
                                                onClick={() => onTocClick(item)}
                                            >
                                                <span className={`proof-of-work-toc-dot ${isActive ? '!bg-cyan-300' : ''}`} aria-hidden="true" />
                                                <span className="proof-of-work-toc-label text-[13px] font-medium truncate min-w-0">{item.text}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* A well at page-column scale — a reading pane sunk into the
                                modal — so it keeps the base radius rather than `--sm`, and
                                states its pad because a column of prose wants more room than
                                the well's 10px default, which is sized for a container of
                                objects that bring their own padding.

                                `.axi-prose` inside it is the language's markdown typography.
                                Both of this modal's callers render a ReactMarkdown here, and
                                before this each had spelled out its own h1-h3/p/ul/ol/li/
                                blockquote/table/th/td/pre/code map. */}
                            <div
                                className="proof-of-work-content axi-well h-full overflow-y-auto pr-2"
                                style={{ '--axi-well-pad': '16px' } as CSSProperties}
                                ref={contentRef}
                                id="metrics-spec-content"
                            >
                                <div className="axi-prose">
                                    {children}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
