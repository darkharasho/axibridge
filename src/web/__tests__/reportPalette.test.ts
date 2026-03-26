import { describe, it, expect } from 'vitest';
import { readPaletteFromReport } from '../paletteReader';

describe('readPaletteFromReport', () => {
    it('reads new format colorPalette', () => {
        expect(readPaletteFromReport({ colorPalette: 'amber-warm', glassSurfaces: true }))
            .toEqual({ palette: 'amber-warm', glass: true });
    });

    it('reads legacy reportTheme.ui format', () => {
        expect(readPaletteFromReport({ reportTheme: { ui: 'matte', paletteId: 'MatteSlate' } }))
            .toEqual({ palette: 'refined-cyan', glass: false });
    });

    it('reads older legacy stats.uiTheme format', () => {
        expect(readPaletteFromReport({ uiTheme: 'dark-glass' }))
            .toEqual({ palette: 'electric-blue', glass: true });
    });

    it('falls back to electric-blue for unknown data', () => {
        expect(readPaletteFromReport({}))
            .toEqual({ palette: 'electric-blue', glass: false });
    });

    it('prefers new format over legacy', () => {
        expect(readPaletteFromReport({ colorPalette: 'emerald-mint', reportTheme: { ui: 'matte' } }))
            .toEqual({ palette: 'emerald-mint', glass: false });
    });

    it('falls back to electric-blue for null/undefined stats', () => {
        expect(readPaletteFromReport(null)).toEqual({ palette: 'electric-blue', glass: false });
        expect(readPaletteFromReport(undefined)).toEqual({ palette: 'electric-blue', glass: false });
    });

    it('defaults glassSurfaces to false when not specified in new format', () => {
        expect(readPaletteFromReport({ colorPalette: 'refined-cyan' }))
            .toEqual({ palette: 'refined-cyan', glass: false });
    });

    it('ignores unknown colorPalette and falls through to legacy', () => {
        expect(readPaletteFromReport({ colorPalette: 'unknown-palette', reportTheme: { ui: 'kinetic' } }))
            .toEqual({ palette: 'amber-warm', glass: false });
    });

    it('maps all known legacy uiTheme values', () => {
        expect(readPaletteFromReport({ uiTheme: 'classic' })).toEqual({ palette: 'electric-blue', glass: false });
        expect(readPaletteFromReport({ uiTheme: 'modern' })).toEqual({ palette: 'electric-blue', glass: false });
        expect(readPaletteFromReport({ uiTheme: 'crt' })).toEqual({ palette: 'emerald-mint', glass: false });
        expect(readPaletteFromReport({ uiTheme: 'kinetic' })).toEqual({ palette: 'amber-warm', glass: false });
        expect(readPaletteFromReport({ uiTheme: 'matte' })).toEqual({ palette: 'refined-cyan', glass: false });
        expect(readPaletteFromReport({ uiTheme: 'dark-glass' })).toEqual({ palette: 'electric-blue', glass: true });
    });
});
