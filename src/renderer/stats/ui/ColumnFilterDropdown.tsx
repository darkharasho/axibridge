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
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-300 hover:text-white hover:border-white/30 transition-colors"
            >
                {buttonIcon ? <span className="h-3.5 w-3.5 text-gray-400">{buttonIcon}</span> : null}
                <span>{buttonLabel}</span>
                {selectedIds.length > 0 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-200">
                        {selectedIds.length}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute z-20 mt-2 w-56 rounded-xl border border-white/10 bg-slate-950 p-2 text-xs shadow-2xl">
                    <div className="flex items-center justify-between px-2 pb-2 text-[11px] uppercase tracking-widest text-gray-500">
                        <span>Filter Columns</span>
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-gray-400 hover:text-white"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {options.length === 0 ? (
                            <div className="px-2 py-2 text-gray-500 italic">No columns</div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => onToggle(option.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg border transition-colors ${
                                        selectedSet.has(option.id)
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'border-transparent text-gray-300 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2.5 w-2.5 rounded-full border ${
                                            selectedSet.has(option.id) ? 'bg-emerald-400/80 border-emerald-300' : 'border-gray-500'
                                        }`} />
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
