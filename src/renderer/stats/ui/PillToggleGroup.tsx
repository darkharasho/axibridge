import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';

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
}: PillToggleGroupProps<T>) => {
    const layoutGroupId = useId();
    return (
        <div className={`pill-toggle-group flex items-center gap-1 p-[1px] text-[10px] uppercase tracking-[0.25em] ${className}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '3px', color: 'var(--text-secondary)' }}>
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={`pill-toggle-option relative px-2.5 py-1 rounded-sm transition-colors ${isActive ? `pill-toggle-option--active ${activeClassName}` : inactiveClassName}`}
                    >
                        {isActive && (
                            <motion.span
                                layoutId={`pill-bg-${layoutGroupId}`}
                                className="absolute inset-0 rounded-sm"
                                style={{ background: 'var(--accent-bg-strong)', border: '1px solid var(--accent-border)' }}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            />
                        )}
                        <span className="relative z-[1]">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
};
