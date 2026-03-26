import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type SearchSelectOption = {
    id: string;
    label: string;
    type: 'column' | 'player';
    icon?: ReactNode;
};

type SearchSelectDropdownProps = {
    options: SearchSelectOption[];
    selectedIds?: Set<string>;
    placeholder?: string;
    onSelect: (option: SearchSelectOption) => void;
    className?: string;
};

export const SearchSelectDropdown = ({
    options,
    selectedIds,
    placeholder = 'Search...',
    onSelect,
    className = ''
}: SearchSelectDropdownProps) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const optionRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const filteredOptions = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return options.slice(0, 50);
        return options.filter((option) => option.label.toLowerCase().includes(term)).slice(0, 50);
    }, [options, query]);

    const optionIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        filteredOptions.forEach((option, index) => {
            map.set(`${option.type}-${option.id}`, index);
        });
        return map;
    }, [filteredOptions]);

    const grouped = useMemo(() => {
        const columns = filteredOptions.filter((option) => option.type === 'column');
        const players = filteredOptions.filter((option) => option.type === 'player');
        return { columns, players };
    }, [filteredOptions]);

    useEffect(() => {
        if (!open) return;
        if (filteredOptions.length === 0) {
            setActiveIndex(0);
            return;
        }
        setActiveIndex((prev) => Math.min(Math.max(prev, 0), filteredOptions.length - 1));
    }, [filteredOptions, open]);

    useEffect(() => {
        if (!open) return;
        const option = filteredOptions[activeIndex];
        if (!option) return;
        const key = `${option.type}-${option.id}`;
        const el = optionRefs.current.get(key);
        if (el && listRef.current) {
            el.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, filteredOptions, open]);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <input
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onKeyDown={(event) => {
                    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                        setOpen(true);
                        return;
                    }
                    if (!open) return;
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        if (filteredOptions.length === 0) return;
                        setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
                    } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        if (filteredOptions.length === 0) return;
                        setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
                    } else if (event.key === 'Enter') {
                        event.preventDefault();
                        const selected = filteredOptions[activeIndex];
                        if (!selected) return;
                        onSelect(selected);
                        setQuery('');
                        setOpen(false);
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpen(false);
                    }
                }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                className="w-full sm:w-64 rounded-lg border px-2 py-1 text-xs focus:outline-none"
                style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                }}
            />
            {open && (
                <div
                    className="absolute z-30 mt-2 w-64 border p-2 text-xs"
                    style={{
                        borderRadius: 'var(--radius-md)',
                        borderColor: 'var(--border-default)',
                        background: 'var(--bg-elevated)',
                        boxShadow: 'var(--shadow-dropdown)',
                    }}
                >
                    {filteredOptions.length === 0 ? (
                        <div className="px-2 py-2 italic" style={{ color: 'var(--text-muted)' }}>No matches</div>
                    ) : (
                        <div ref={listRef} className="max-h-60 overflow-y-auto space-y-2 pr-1">
                            {grouped.columns.length > 0 && (
                                <div>
                                    <div
                                        className="px-2 pb-1 text-[10px] uppercase tracking-widest"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >Columns</div>
                                    {grouped.columns.map((option) => {
                                        const selected = selectedIds?.has(`${option.type}:${option.id}`) ?? false;
                                        const isActive = activeIndex === optionIndexMap.get(`${option.type}-${option.id}`);
                                        return (
                                        <button
                                            key={`${option.type}-${option.id}`}
                                            type="button"
                                            ref={(node) => {
                                                optionRefs.current.set(`${option.type}-${option.id}`, node);
                                            }}
                                            onClick={() => {
                                                onSelect(option);
                                                setQuery('');
                                                setOpen(false);
                                            }}
                                            onMouseEnter={() => {
                                                const idx = optionIndexMap.get(`${option.type}-${option.id}`);
                                                if (typeof idx === 'number') setActiveIndex(idx);
                                            }}
                                            className="w-full text-left px-2 py-1.5 rounded-lg border"
                                            style={{
                                                color: 'var(--text-primary)',
                                                background: selected
                                                    ? 'var(--accent-bg-strong)'
                                                    : isActive
                                                    ? 'var(--bg-hover)'
                                                    : 'transparent',
                                                borderColor: selected
                                                    ? 'var(--border-hover)'
                                                    : isActive
                                                    ? 'var(--border-default)'
                                                    : 'transparent',
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                {option.icon ? <span className="flex h-4 w-4 items-center justify-center">{option.icon}</span> : null}
                                                <span className="truncate">{option.label}</span>
                                            </div>
                                        </button>
                                    )})}
                                </div>
                            )}
                            {grouped.players.length > 0 && (
                                <div>
                                    <div
                                        className="px-2 pb-1 text-[10px] uppercase tracking-widest"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >Players</div>
                                    {grouped.players.map((option) => {
                                        const selected = selectedIds?.has(`${option.type}:${option.id}`) ?? false;
                                        const isActive = activeIndex === optionIndexMap.get(`${option.type}-${option.id}`);
                                        return (
                                        <button
                                            key={`${option.type}-${option.id}`}
                                            type="button"
                                            ref={(node) => {
                                                optionRefs.current.set(`${option.type}-${option.id}`, node);
                                            }}
                                            onClick={() => {
                                                onSelect(option);
                                                setQuery('');
                                                setOpen(false);
                                            }}
                                            onMouseEnter={() => {
                                                const idx = optionIndexMap.get(`${option.type}-${option.id}`);
                                                if (typeof idx === 'number') setActiveIndex(idx);
                                            }}
                                            className="w-full text-left px-2 py-1.5 rounded-lg border"
                                            style={{
                                                color: 'var(--text-primary)',
                                                background: selected
                                                    ? 'var(--accent-bg-strong)'
                                                    : isActive
                                                    ? 'var(--bg-hover)'
                                                    : 'transparent',
                                                borderColor: selected
                                                    ? 'var(--border-hover)'
                                                    : isActive
                                                    ? 'var(--border-default)'
                                                    : 'transparent',
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                {option.icon ? <span className="flex h-4 w-4 items-center justify-center">{option.icon}</span> : null}
                                                <span className="truncate">{option.label}</span>
                                            </div>
                                        </button>
                                    )})}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
