import { PALETTES, type ColorPalette, DEFAULT_PALETTE_ID, LEGACY_THEME_TO_PALETTE } from '../shared/webThemes';

/**
 * Reads the color palette and surface language from a report stats object.
 * Handles three formats for backward compatibility:
 *   1. New format: stats.colorPalette + stats.glassSurfaces + stats.glassmorphic
 *      + stats.axiDesign
 *   2. Legacy format: stats.reportTheme.ui mapped via LEGACY_THEME_TO_PALETTE
 *   3. Older legacy format: stats.uiTheme mapped via LEGACY_THEME_TO_PALETTE
 *
 * `axi` mirrors the publisher's own toggle: a report published from an app
 * running the axi language renders in it, one published without it doesn't.
 * No legacy format can carry it, so it is false everywhere below.
 */
export function readPaletteFromReport(stats: any): { palette: ColorPalette; glass: boolean; glassmorphic: boolean; axi: boolean } {
    // New format: stats.colorPalette
    if (stats?.colorPalette && stats.colorPalette in PALETTES) {
        return {
            palette: stats.colorPalette,
            glass: stats.glassSurfaces ?? false,
            glassmorphic: stats.glassmorphic ?? false,
            axi: stats.axiDesign ?? false,
        };
    }
    // Legacy format: stats.reportTheme.ui
    if (stats?.reportTheme?.ui) {
        const mapping = LEGACY_THEME_TO_PALETTE[stats.reportTheme.ui];
        if (mapping) return { ...mapping, glassmorphic: false, axi: false };
    }
    // Older legacy format: stats.uiTheme directly
    if (stats?.uiTheme) {
        const mapping = LEGACY_THEME_TO_PALETTE[stats.uiTheme];
        if (mapping) return { ...mapping, glassmorphic: false, axi: false };
    }
    return { palette: DEFAULT_PALETTE_ID, glass: false, glassmorphic: false, axi: false };
}
