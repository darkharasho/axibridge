import { useEffect, useRef, useState } from 'react';

export type ColumnFilterOption = {
    id: string;
    label: string;
    icon?: React.ReactNode;
};

type ColumnFilterDropdownProps = {
    options: ColumnFilterOption[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    onClear: () => void;
    className?: string;
    buttonLabel?: string;
    buttonIcon?: React.ReactNode;
};

export const ColumnFilterDropdown = ({
    options,
    selectedIds,
    onToggle,
    onClear,
    className = '',
    buttonLabel = 'Columns',
    buttonIcon
}: ColumnFilterDropdownProps) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const selectedSet = new Set(selectedIds);

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

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex items-center gap-2 px-3 py-1 text-xs font-semibold transition-colors hover:text-white"
                style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'transparent', color: 'var(--text-secondary)' }}
            >
                {buttonIcon ? <span className="h-3.5 w-3.5" style={{ color: 'var(--text-secondary)' }}>{buttonIcon}</span> : null}
                <span>{buttonLabel}</span>
                {selectedIds.length > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                        {selectedIds.length}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute z-20 mt-2 w-56 p-2 text-xs app-dropdown" style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-dropdown)' }}>
                    <div className="flex items-center justify-between px-2 pb-2 text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                        <span>Filter Columns</span>
                        <button
                            type="button"
                            onClick={onClear}
                            className="hover:text-white"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Clear
                        </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {options.length === 0 ? (
                            <div className="px-2 py-2 italic" style={{ color: 'var(--text-muted)' }}>No columns</div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => onToggle(option.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg border transition-colors ${
                                        selectedSet.has(option.id)
                                            ? 'text-white'
                                            : 'border-transparent hover:bg-[var(--bg-hover)] hover:text-white'
                                    }`}
                                    style={selectedSet.has(option.id)
                                        ? { background: 'var(--bg-hover)', borderColor: 'var(--border-hover)', color: 'var(--text-primary)' }
                                        : { color: 'var(--text-secondary)' }
                                    }
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="h-2.5 w-2.5 rounded-full border"
                                            style={selectedSet.has(option.id)
                                                ? { background: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' }
                                                : { borderColor: 'var(--text-muted)' }
                                            }
                                        />
                                        {option.icon ? <span className="flex h-4 w-4 items-center justify-center shrink-0">{option.icon}</span> : null}
                                        <span className="truncate max-w-[140px]">{option.label}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
