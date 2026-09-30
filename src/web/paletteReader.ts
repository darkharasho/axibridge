import { PALETTES, DEFAULT_PALETTE_ID, asAxiTheme, axiThemeFromLegacyGlass, type ColorPalette, type AxiTheme } from '../shared/webThemes';

/**
 * Reads the accent and the theme a report was published with.
 *
 * Both are the publisher's own choice, baked into `report.json` at publish time:
 * the viewer has no appearance control of its own, and the axi design language
 * is unconditional, so there is nothing here to decide except which accent and
 * which theme.
 *
 * Two compatibility paths, both read-only and both for the same reason — a report
 * on someone's GitHub Pages site was written by whatever build published it and is
 * never rewritten:
 *
 *   - `axiTheme` is the field current builds write.
 *   - `glass` and `glassSurfaces` are the boolean this setting was before there was
 *     more than one theme. `glassSurfaces` is the older spelling of the two, from
 *     before the three appearance booleans collapsed into one.
 *
 * A `false` boolean maps to `default`, not to `flat`: "glass off" meant the main
 * theme when those reports were written.
 *
 * Everything older — `reportTheme.ui`, `uiTheme` — is deliberately not handled:
 * those reports predate the accent picker entirely and land on the default rather
 * than being guessed at. Note also that a published report keeps the viewer bundle
 * from its last publish, so a live report will not pick up a new look until it is
 * republished — which is also why publish keeps writing the legacy booleans
 * alongside `axiTheme`, for the stale bundles still reading them.
 */
export function readPaletteFromReport(stats: any): { palette: ColorPalette; theme: AxiTheme } {
    // hasOwnProperty, not `in`: this reads a JSON file off the network, and `in`
    // walks the prototype chain — `colorPalette: "constructor"` would pass an `in`
    // guard and be handed to the applier as if it were a real accent id.
    if (stats?.colorPalette && Object.prototype.hasOwnProperty.call(PALETTES, stats.colorPalette)) {
        return {
            palette: stats.colorPalette,
            theme: stats.axiTheme !== undefined
                ? asAxiTheme(stats.axiTheme)
                : axiThemeFromLegacyGlass(stats.glass ?? stats.glassSurfaces),
        };
    }
    return { palette: DEFAULT_PALETTE_ID, theme: 'default' };
}
