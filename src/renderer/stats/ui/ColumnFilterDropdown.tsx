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
                style={{ border: 'var(--axi-border-control) solid var(--axi-ink-line)', borderRadius: 'var(--axi-radius-sm)', background: 'transparent', color: 'var(--axi-text-dim)' }}
            >
                {buttonIcon ? <span className="h-3.5 w-3.5" style={{ color: 'var(--axi-text-dim)' }}>{buttonIcon}</span> : null}
                <span>{buttonLabel}</span>
                {selectedIds.length > 0 && (
                    <span className="axi-chip axi-ink-plain">
                        {selectedIds.length}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute z-20 mt-2 w-56 text-xs app-dropdown axi-panel axi-panel--tile axi-panel--float [--axi-panel-pad:8px]">
                    <div className="flex items-center justify-between px-2 pb-2 text-[11px] uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>
                        <span>Filter Columns</span>
                        <button
                            type="button"
                            onClick={onClear}
                            className="axi-action"
                            style={{ color: 'var(--axi-text-dim)' }}
                        >
                            Clear
                        </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {options.length === 0 ? (
                            <div className="px-2 py-2 italic" style={{ color: 'var(--axi-text-faint)' }}>No columns</div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => onToggle(option.id)}
                                    className={`w-full text-left px-2 py-1.5 border transition-colors ${
                                        selectedSet.has(option.id)
                                            ? 'axi-ink-plain'
                                            : 'border-transparent hover:bg-[var(--axi-surface-raised-paint)] hover:text-white'
                                    }`}
                                    style={selectedSet.has(option.id)
                                        ? { background: 'var(--axi-surface-raised-paint)', borderColor: 'var(--axi-rule)', color: 'var(--axi-text)' }
                                        : { color: 'var(--axi-text-dim)' }
                                    }
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="axi-diamond"
                                            style={selectedSet.has(option.id)
                                                ? { background: 'var(--axi-accent)', borderColor: 'var(--axi-accent)' }
                                                : { borderColor: 'var(--axi-text-faint)' }
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
