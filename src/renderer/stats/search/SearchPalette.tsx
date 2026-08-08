import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { matchSearchIndex, type SearchEntry, type SearchEntryType } from './searchIndex';
import { STATS_CATEGORIES, type StatsIcon } from '../statsTaxonomy';

export interface SearchPaletteProps {
    open: boolean;
    onClose: () => void;
    index: SearchEntry[];
    onSelect: (entry: SearchEntry) => void;
}

const GROUP_LABELS: Record<SearchEntryType, string> = {
    section: 'Sections',
    metric: 'Metrics',
    player: 'Players',
};

const GROUP_ORDER: readonly SearchEntryType[] = ['section', 'metric', 'player'];

// SearchEntry is a flat, index-serializable shape with no icon reference, so
// resolve section icons from the taxonomy registry by sectionId, once.
const SECTION_ICONS: Record<string, StatsIcon> = {};
for (const category of STATS_CATEGORIES) {
    for (const section of category.sections) {
        SECTION_ICONS[section.id] = section.icon;
    }
}

// Keyframed flash highlight applied by useSearchJump to the jump target.
// Injected via a <style> tag (not a CSS module import) so it works identically
// in the web report bundle.
const FLASH_STYLE = `
@keyframes axiSearchFlash {
  0% { box-shadow: 0 0 0 3px var(--brand-primary); }
  100% { box-shadow: 0 0 0 3px transparent; }
}
.axi-search-flash { animation: axiSearchFlash 1.6s ease-out 2; border-radius: 4px; }
`;

const rowKey = (entry: SearchEntry): string =>
    `${entry.type}-${entry.sectionId}-${entry.metricId ?? ''}-${entry.account ?? entry.label}`;

export function SearchPalette({ open, onClose, index, onSelect }: SearchPaletteProps) {
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const activeRowRef = useRef<HTMLButtonElement | null>(null);

    const results = useMemo(() => matchSearchIndex(index, query), [index, query]);
    // matchSearchIndex already ranks section > metric > player among ties, so
    // bucketing the flat, ranked list by type (for the group headers below)
    // preserves each bucket's internal ranking without a second sort.
    const resultOrder = useMemo(() => {
        const map = new Map<SearchEntry, number>();
        results.forEach((entry, i) => map.set(entry, i));
        return map;
    }, [results]);
    const clampedActiveIdx = results.length === 0 ? 0 : Math.min(activeIdx, results.length - 1);

    // Reset to a blank query and the first result whenever the palette opens
    // (a stale query from the last session would be confusing), and focus the input.
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setActiveIdx(0);
        const raf = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(raf);
    }, [open]);

    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [clampedActiveIdx]);

    if (!open) return null;

    const selectAt = (idx: number) => {
        const entry = results[idx];
        if (!entry) return;
        onSelect(entry);
        onClose();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (results.length === 0) return;
            setActiveIdx((clampedActiveIdx + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (results.length === 0) return;
            setActiveIdx((clampedActiveIdx - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectAt(clampedActiveIdx);
        }
    };

    let body: ReactNode;
    if (query.trim() === '') {
        body = (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                Type to search sections, metrics, and players.
            </div>
        );
    } else if (results.length === 0) {
        body = (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                No results for &ldquo;{query}&rdquo;.
            </div>
        );
    } else {
        body = GROUP_ORDER.map((type) => {
            const items = results.filter((entry) => entry.type === type);
            if (items.length === 0) return null;
            return (
                <div key={type}>
                    <div
                        className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {GROUP_LABELS[type]}
                    </div>
                    {items.map((entry) => {
                        const idx = resultOrder.get(entry) ?? 0;
                        const isActive = idx === clampedActiveIdx;
                        const Icon = entry.type === 'section' ? SECTION_ICONS[entry.sectionId] : undefined;
                        return (
                            <button
                                key={rowKey(entry)}
                                ref={isActive ? activeRowRef : undefined}
                                type="button"
                                onMouseEnter={() => setActiveIdx(idx)}
                                onClick={() => selectAt(idx)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs"
                                style={{ background: isActive ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-primary)' }}
                            >
                                {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-[color:var(--brand-primary)]" />}
                                <span className="truncate font-medium">{entry.label}</span>
                                <span className="truncate ml-auto shrink-0 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {entry.sublabel}
                                </span>
                            </button>
                        );
                    })}
                </div>
            );
        });
    }

    return (
        <div
            className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh] bg-black/60"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <style>{FLASH_STYLE}</style>
            <div
                className="w-full max-w-lg flex flex-col rounded-[4px] overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', maxHeight: '70vh' }}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
            >
                <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search sections, metrics, players..."
                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                        style={{ color: 'var(--text-primary)' }}
                    />
                    <kbd
                        className="text-[10px] px-1.5 py-0.5 rounded-sm shrink-0"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                    >
                        Esc
                    </kbd>
                </div>
                <div className="overflow-y-auto py-1">
                    {body}
                </div>
            </div>
        </div>
    );
}
