import { PALETTES, type ColorPalette, DEFAULT_PALETTE_ID } from '../shared/webThemes';

/**
 * Reads the accent and the surface treatment a report was published with.
 *
 * Both are the publisher's own choice, baked into `report.json` at publish time:
 * the viewer has no appearance control of its own, and the axi design language
 * is unconditional, so there is nothing here to decide except which accent and
 * whether glass.
 *
 * One compatibility path, and only one. A report published before the three
 * appearance booleans collapsed spells the glass choice `glassSurfaces`, so that
 * key is read as an alias. Everything older — `reportTheme.ui`, `uiTheme` — is
 * deliberately not handled: those reports predate the accent picker entirely and
 * land on the default rather than being guessed at. Note also that a published
 * report keeps the viewer bundle from its last publish, so a live report will
 * not pick up the new look until it is republished.
 */
export function readPaletteFromReport(stats: any): { palette: ColorPalette; glass: boolean } {
    // hasOwnProperty, not `in`: this reads a JSON file off the network, and `in`
    // walks the prototype chain — `colorPalette: "constructor"` would pass an `in`
    // guard and be handed to the applier as if it were a real accent id.
    if (stats?.colorPalette && Object.prototype.hasOwnProperty.call(PALETTES, stats.colorPalette)) {
        return {
            palette: stats.colorPalette,
            glass: stats.glass ?? stats.glassSurfaces ?? false,
        };
    }
    return { palette: DEFAULT_PALETTE_ID, glass: false };
}
