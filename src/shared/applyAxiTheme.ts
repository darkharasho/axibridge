import { PALETTES, DEFAULT_PALETTE_ID, type ColorPalette } from './webThemes';

/**
 * Applies the axi design language to a document root.
 *
 * Two attributes, and nothing else. `@axiapps/axi-design/accents.css` maps
 * `[data-axi-accent]` to `--axi-accent`, and
 * `@axiapps/axi-design/themes/glass.css` maps `[data-axi-theme="glass"]` to the
 * whole glass token set. Every surface in the app derives from those tokens, so
 * these two attributes are the entire appearance API.
 *
 * `root` is `<html>` rather than `<body>` on purpose: upstream's selectors are
 * unscoped, and at the document element they cascade over every body-level rule
 * without contesting specificity. The homegrown glass had to use `!important`
 * to win that fight, which is why it could not coexist with the axi language at
 * all.
 *
 * `particles-disabled` is deliberately NOT handled here — it is app behaviour,
 * not part of the design language, and stays a `body` class.
 */
export function applyAxiTheme(
    root: HTMLElement,
    opts: { accent: ColorPalette | string | null | undefined; glass: boolean },
): void {
    const accent: ColorPalette =
        typeof opts.accent === 'string' && opts.accent in PALETTES
            ? (opts.accent as ColorPalette)
            : DEFAULT_PALETTE_ID;

    root.setAttribute('data-axi-accent', accent);

    if (opts.glass) root.setAttribute('data-axi-theme', 'glass');
    else root.removeAttribute('data-axi-theme');
}
