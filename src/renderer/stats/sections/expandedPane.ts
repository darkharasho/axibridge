import type { CSSProperties } from 'react';

/*
    Thirty stats sections can each be blown up to fill the app, and every one of
    them used to spell the same thing out by hand: a 76-character Tailwind string
    plus an inline `background: var(--pane-bg, ...)` / `boxShadow:
    var(--pane-block, ...)` shim, repeated verbatim thirty times. Nothing kept
    the thirty copies in step. When the pane's fill moved to a custom property,
    the shim had to be threaded through all thirty as an inline style, because
    there was no one place to change.

    This is that place. The object is upstream's `.axi-sheet` - one thing blown
    up to fill its container, with a way back out - and the sheet carries the
    position, the inset, the layer, the flex column, the scroll, the fill and the
    padding. So all the Tailwind string was doing is now the class's own job:

        fixed inset-0   -> .axi-sheet's `position: fixed` and `inset`
        z-50            -> layer 45, the sheet's documented rung
        h-screen        -> implied: pinned top and bottom
        overflow-y-auto -> .axi-sheet
        flex flex-col   -> .axi-sheet
        pb-10           -> the --axi-sheet-pad knob, set per mode in index.css

    None of those could have STAYED as utilities even if we wanted them:
    `axi.css` is imported after Tailwind's utilities, so at equal specificity the
    sheet wins every one of those properties. A `p-4` left on the element would
    silently do nothing. That is why the three sections that wanted 16px pass it
    as the knob instead of a class.

    `.modal-pane` stays on the element. It is not chrome any more - it is the
    hook that the grow/shrink animation, the horizontal-scrollbar rules for
    dense tables inside a pane, and three test locators all key on.
*/

/** The pane's own padding, for a section that wants something other than the
 *  sheet's default. A knob rather than a utility class, because a utility
 *  would lose to `.axi-sheet` in the cascade. */
export interface ExpandedPaneOptions {
    pad?: string;
}

export interface ExpandedPaneProps {
    className: string;
    style?: CSSProperties;
}

/**
 * The props for a stats section's outermost element. Collapsed, a section is
 * just a block in the page and carries nothing; expanded, it is a sheet.
 *
 * Spread it: `<div {...expandedPaneProps(isExpanded, closing)}>`.
 */
export function expandedPaneProps(
    expanded: boolean,
    closing: boolean,
    options?: ExpandedPaneOptions,
): ExpandedPaneProps {
    if (!expanded) return { className: '' };
    return {
        className: `modal-pane axi-sheet ${closing ? 'modal-pane-exit' : 'modal-pane-enter'}`,
        style: options?.pad ? ({ '--axi-sheet-pad': options.pad } as CSSProperties) : undefined,
    };
}
