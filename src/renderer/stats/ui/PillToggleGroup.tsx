import { useEffect, useRef, useState, type ReactNode } from 'react';

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
    const containerRef = useRef<HTMLDivElement>(null);
    const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const activeIndex = options.findIndex(o => o.value === value);
        if (activeIndex < 0) { setIndicator(null); return; }
        const buttons = containerRef.current.querySelectorAll<HTMLButtonElement>('button');
        const btn = buttons[activeIndex];
        if (!btn) return;
        setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }, [value, options]);

    return (
        <div
            ref={containerRef}
            className={`pill-toggle-group relative flex items-center gap-1 p-[1px] text-[10px] uppercase tracking-[0.25em] ${className}`}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '3px', color: 'var(--text-secondary)' }}
        >
            {indicator && (
                <span
                    className="absolute top-[1px] bottom-[1px] rounded-sm pointer-events-none"
                    style={{
                        left: indicator.left,
                        width: indicator.width,
                        background: 'var(--accent-bg-strong)',
                        border: '1px solid var(--accent-border)',
                        transition: 'left 200ms ease, width 200ms ease',
                    }}
                />
            )}
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={`pill-toggle-option relative px-2.5 py-1 rounded-sm z-[1] ${isActive ? `pill-toggle-option--active ${activeClassName}` : inactiveClassName}`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};
