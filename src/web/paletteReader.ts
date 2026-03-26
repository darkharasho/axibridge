import { PALETTES, type ColorPalette, DEFAULT_PALETTE_ID, LEGACY_THEME_TO_PALETTE } from '../shared/webThemes';

/**
 * Reads the color palette and glass mode from a report stats object.
 * Handles three formats for backward compatibility:
 *   1. New format: stats.colorPalette + stats.glassSurfaces
 *   2. Legacy format: stats.reportTheme.ui mapped via LEGACY_THEME_TO_PALETTE
 *   3. Older legacy format: stats.uiTheme mapped via LEGACY_THEME_TO_PALETTE
 */
export function readPaletteFromReport(stats: any): { palette: ColorPalette; glass: boolean } {
    // New format: stats.colorPalette
    if (stats?.colorPalette && stats.colorPalette in PALETTES) {
        return { palette: stats.colorPalette, glass: stats.glassSurfaces ?? false };
    }
    // Legacy format: stats.reportTheme.ui
    if (stats?.reportTheme?.ui) {
        const mapping = LEGACY_THEME_TO_PALETTE[stats.reportTheme.ui];
        if (mapping) return mapping;
    }
    // Older legacy format: stats.uiTheme directly
    if (stats?.uiTheme) {
        const mapping = LEGACY_THEME_TO_PALETTE[stats.uiTheme];
        if (mapping) return mapping;
    }
    return { palette: DEFAULT_PALETTE_ID, glass: false };
}
