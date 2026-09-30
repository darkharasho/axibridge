import {
    PALETTES,
    DEFAULT_PALETTE_ID,
    asAxiTheme,
    DEFAULT_AXI_THEME,
    type ColorPalette,
    type AxiTheme,
} from './webThemes';

/**
 * Applies the axi design language to a document root.
 *
 * Two attributes, and nothing else. `@axiapps/axi-design/accents.css` maps
 * `[data-axi-accent]` to `--axi-accent`, and each `themes/<id>.css` maps
 * `[data-axi-theme="<id>"]` to that theme's whole token set. Every surface in the
 * app derives from those tokens, so these two attributes are the entire
 * appearance API.
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
    opts: { accent: ColorPalette | string | null | undefined; theme: AxiTheme | string | null | undefined },
): void {
    // hasOwnProperty, not `in`: `in` walks the prototype chain, so
    // `'constructor' in PALETTES` is true and an accent of "constructor" — which a
    // malformed settings blob or a hand-edited report.json can carry — would sail
    // through unclamped and land in the attribute, where upstream's accents.css has
    // no rule for it and --axi-accent silently falls back to upstream's gold.
    const accent: ColorPalette =
        typeof opts.accent === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, opts.accent)
            ? (opts.accent as ColorPalette)
            : DEFAULT_PALETTE_ID;

    root.setAttribute('data-axi-accent', accent);

    // The only place `default` is translated back into upstream's spelling of the
    // main theme, which is the absence of the attribute. Removing it rather than
    // setting it empty is not cosmetic: `[data-axi-theme=""]` matches no theme rule,
    // so an empty attribute renders correctly and tells everything else reading the
    // DOM — a test, a screenshot differ, a future rule — that a theme is on.
    const theme = asAxiTheme(opts.theme);
    if (theme === DEFAULT_AXI_THEME) root.removeAttribute('data-axi-theme');
    else root.setAttribute('data-axi-theme', theme);
}
