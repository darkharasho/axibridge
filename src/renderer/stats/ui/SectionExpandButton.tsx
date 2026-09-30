import { Maximize2, X } from 'lucide-react';

type SectionExpandButtonProps = {
    expanded: boolean;
    onToggle: () => void;
    /** The section's name, as the reader knows it: "Offense Detailed", "Distance to Tag". */
    section: string;
    /** For the sites that push the control to the end of a header row. */
    className?: string;
};

/**
 * The expand/close control in a section header.
 *
 * This existed 31 times before it existed once. Every copy carried the same
 * inline style object - `background: transparent`, a 1px `--border-default`,
 * `--radius-md` - which is `.axi-btn--ghost --icon` written out by hand, and
 * three consequences followed from its being inline rather than a class:
 *
 *  1. Nothing hovered. An inline style has no `:hover`, and none of the 31
 *     carried a hover utility either, so the app's most-repeated control gave
 *     no feedback when the cursor reached it.
 *  2. The icon hardcoded `--text-secondary`, so even once the button did have
 *     a hover brighten, the glyph would have sat the brightening out. It
 *     inherits `currentColor` now, which is what `.axi-btn`'s dim-to-plain
 *     fallback is written to move.
 *  3. Thirty-one copies of a border meant the control could not be restyled by
 *     the theme it lived in - the glass theme's control border never reached it.
 */
export const SectionExpandButton = ({
    expanded,
    onToggle,
    section,
    className
}: SectionExpandButtonProps) => (
    <button
        type="button"
        onClick={onToggle}
        className={`axi-btn axi-btn--ghost axi-btn--icon${className ? ` ${className}` : ''}`}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Close' : 'Expand'} ${section}`}
        title={expanded ? 'Close' : 'Expand'}
    >
        {expanded ? <X className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
    </button>
);
