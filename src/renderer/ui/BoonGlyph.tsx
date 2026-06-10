// Generic boon glyph: hexagon + upward arrow. Uses currentColor so callers
// control the color via text color / the `color` style. Used by the Top Stats
// boon cards and the Settings Top Stats Cards picker.
type BoonGlyphProps = {
    className?: string;
};

export const BoonGlyph = ({ className = 'w-4 h-4' }: BoonGlyphProps) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <path d="M12 2l8.5 5v10L12 22 3.5 17V7z" />
        <path d="M12 16V9M9 12l3-3 3 3" />
    </svg>
);
