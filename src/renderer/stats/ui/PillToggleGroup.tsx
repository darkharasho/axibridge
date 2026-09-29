import { type ReactNode } from 'react';

type PillToggleOption<T extends string> = {
    value: T;
    label: ReactNode;
    /** Optional hover explanation, rendered as the button's native tooltip. */
    title?: string;
};

type PillToggleGroupProps<T extends string> = {
    value: T;
    options: PillToggleOption<T>[];
    onChange: (value: T) => void;
    className?: string;
};

/**
 * A row of pills, one of which is on — which is now what the name says.
 *
 * It used to draw a bordered trough around the row and slide a filled indicator
 * under the active option, and take `activeClassName` / `inactiveClassName` from
 * every call site to colour the two states. All of that is gone:
 *
 * - `activeClassName` was **dead**. The component destructured it to `_` and
 *   never used it, while all 50 call sites passed the same string.
 * - `inactiveClassName` was three spellings of "dim text", which is what an
 *   unpressed pill already is.
 * - The trough and the indicator were a second frame drawn around controls that
 *   carry their own edge, and a fill positioned by measuring the DOM — so the
 *   row could not be styled without a layout effect, a ref and a resize-blind
 *   `offsetLeft` read.
 *
 * `.axi-pill` says all of it in `aria-pressed`, so the appearance and the
 * accessibility tree cannot disagree.
 */
export const PillToggleGroup = <T extends string>({
    value,
    options,
    onChange,
    className = ''
}: PillToggleGroupProps<T>) => (
    <div className={`pill-toggle-group flex items-center gap-1 overflow-x-auto ${className}`}>
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                title={option.title}
                aria-pressed={value === option.value}
                className="pill-toggle-option axi-pill axi-pill--xs whitespace-nowrap"
            >
                {option.label}
            </button>
        ))}
    </div>
);
