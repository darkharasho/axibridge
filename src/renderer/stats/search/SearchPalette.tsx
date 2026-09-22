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

// The list is capped so the panel never becomes a scrolling wall. The cap is
// named here because the count line has to say when it bit.
const RESULT_LIMIT = 12;

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
    const [typeFilter, setTypeFilter] = useState<SearchEntryType | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const activeRowRef = useRef<HTMLButtonElement | null>(null);

    // Matched uncapped, then sliced here, so the count line can say how many
    // matches the cap is hiding rather than quietly pretending there are 12.
    const allMatches = useMemo(
        () => matchSearchIndex(index, query, Number.POSITIVE_INFINITY, typeFilter),
        [index, query, typeFilter],
    );
    const results = useMemo(() => allMatches.slice(0, RESULT_LIMIT), [allMatches]);
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
        setTypeFilter(null);
        setActiveIdx(0);
        const raf = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(raf);
    }, [open]);

    useEffect(() => {
        activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [clampedActiveIdx]);

    // The flash keyframes must outlive the dialog. Selecting a result calls
    // onSelect (useSearchJump's jumpToEntry), which only SCHEDULES the flash via
    // requestAnimationFrame — then selectAt calls onClose() synchronously, which
    // unmounts this component before that queued frame runs. If this <style> were
    // gated on `open` too, its stylesheet rule would already be gone by the time
    // the flash class is applied, and the highlight would silently never render.
    // Render it unconditionally so it persists across open/close.
    const flashStyle = <style>{FLASH_STYLE}</style>;

    if (!open) return flashStyle;

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

    // Says when the cap bit, so a truncated list never passes for the whole
    // answer. Blank before there is anything to count.
    const countLabel = query.trim() === ''
        ? ''
        : allMatches.length > results.length
            ? `${results.length} of ${allMatches.length}`
            : `${allMatches.length} ${allMatches.length === 1 ? 'match' : 'matches'}`;

    let body: ReactNode;
    if (query.trim() === '') {
        body = (
            <div className="axi-search-empty px-3 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                Type to search sections, metrics, and players.
            </div>
        );
    } else if (results.length === 0) {
        body = (
            <div className="axi-search-empty px-3 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                No results for &ldquo;{query}&rdquo;{typeFilter ? ` in ${GROUP_LABELS[typeFilter].toLowerCase()}` : ''}.
            </div>
        );
    } else {
        body = GROUP_ORDER.map((type) => {
            const items = results.filter((entry) => entry.type === type);
            if (items.length === 0) return null;
            return (
                <div key={type}>
                    <div
                        className="axi-search-group px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
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
                                data-search-row
                                data-active={isActive ? '' : undefined}
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
            // z-[10000]: must sit above FullscreenPortal's zIndex 9999 (replay's
            // in-app fullscreen host), or Ctrl+K opens the palette invisibly
            // underneath its opaque, click-intercepting background.
            className="fixed inset-0 z-[10000] flex items-start justify-center px-4 pt-[12vh] bg-black/60"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            {flashStyle}
            <div
                className="axi-search-panel w-full max-w-lg flex flex-col rounded-[4px] overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)', maxHeight: '70vh' }}
                role="dialog"
                aria-modal="true"
                aria-label="Search"
            >
                <div className="axi-search-bar px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <div className="flex items-center gap-2">
                        {/* The glyph sits in the well rather than beside it, so the
                            field reads as one object the way it does on the site. */}
                        <div className="axi-search-field relative flex-1 min-w-0">
                            <Search
                                className="axi-search-icon absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                                style={{ color: 'var(--brand-primary)' }}
                                aria-hidden="true"
                            />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                                onKeyDown={handleKeyDown}
                                placeholder="Search sections, metrics, players..."
                                className="w-full bg-transparent text-sm pl-9 focus:outline-none"
                                style={{ color: 'var(--text-primary)' }}
                            />
                        </div>
                        <kbd
                            className="text-[10px] px-1.5 py-0.5 rounded-sm shrink-0"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                        >
                            Esc
                        </kbd>
                    </div>
                    <div className="axi-search-filters flex items-center gap-1.5 mt-2">
                        {GROUP_ORDER.map((type) => {
                            const pressed = typeFilter === type;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    data-search-pill
                                    aria-pressed={pressed}
                                    // Pressing the live pill clears it, so the filter
                                    // is its own way out and needs no reset control.
                                    onClick={() => { setTypeFilter(pressed ? null : type); setActiveIdx(0); }}
                                    className="px-2 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.16em]"
                                    style={pressed
                                        ? { background: 'var(--brand-primary)', color: 'var(--bg-base)' }
                                        : { color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                                >
                                    {GROUP_LABELS[type]}
                                </button>
                            );
                        })}
                        <span
                            data-search-count
                            aria-live="polite"
                            className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.16em]"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {countLabel}
                        </span>
                    </div>
                </div>
                <div className="axi-search-results overflow-y-auto py-1">
                    {body}
                </div>
            </div>
        </div>
    );
}
