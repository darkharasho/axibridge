import type { ReactNode } from 'react';

type PillToggleOption<T extends string> = {
    value: T;
    label: ReactNode;
};

type PillToggleGroupProps<T extends string> = {
    value: T;
    options: PillToggleOption<T>[];
    onChange: (value: T) => void;
    className?: string;
    activeClassName: string;
    inactiveClassName: string;
};

export const PillToggleGroup = <T extends string>({
    value,
    options,
    onChange,
    className = '',
    activeClassName,
    inactiveClassName
}: PillToggleGroupProps<T>) => (
    <div className={`pill-toggle-group flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-[10px] uppercase tracking-[0.25em] text-gray-400 ${className}`}>
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`pill-toggle-option px-2.5 py-1 rounded-full transition-colors ${value === option.value ? `pill-toggle-option--active ${activeClassName}` : inactiveClassName}`}
            >
                {option.label}
            </button>
        ))}
    </div>
);
