import { describe, it, expect } from 'vitest';
import { readPaletteFromReport } from '../paletteReader';

describe('readPaletteFromReport', () => {
    it('reads the accent and the glass flag', () => {
        expect(readPaletteFromReport({ colorPalette: 'amber-warm', glass: true }))
            .toEqual({ palette: 'amber-warm', glass: true });
    });

    it('defaults glass to false when the report does not carry it', () => {
        expect(readPaletteFromReport({ colorPalette: 'refined-cyan' }))
            .toEqual({ palette: 'refined-cyan', glass: false });
    });

    // The one compatibility path that survives: a report published before the
    // collapse spells the same choice `glassSurfaces`.
    it('accepts glassSurfaces as an alias for glass', () => {
        expect(readPaletteFromReport({ colorPalette: 'electric-blue', glassSurfaces: true }))
            .toEqual({ palette: 'electric-blue', glass: true });
    });

    it('prefers glass over the glassSurfaces alias', () => {
        expect(readPaletteFromReport({ colorPalette: 'electric-blue', glass: false, glassSurfaces: true }))
            .toEqual({ palette: 'electric-blue', glass: false });
    });

    // Decision 2: already-published reports get no compatibility path. These two
    // branches are gone, and anything they used to catch lands on the default.
    it('ignores the legacy reportTheme.ui branch', () => {
        expect(readPaletteFromReport({ reportTheme: { ui: 'matte', paletteId: 'MatteSlate' } }))
            .toEqual({ palette: 'electric-blue', glass: false });
    });

    it('ignores the legacy uiTheme branch', () => {
        expect(readPaletteFromReport({ uiTheme: 'dark-glass' }))
            .toEqual({ palette: 'electric-blue', glass: false });
    });

    it('ignores the retired axiDesign and glassmorphic flags', () => {
        expect(readPaletteFromReport({ colorPalette: 'crimson-red', axiDesign: false, glassmorphic: true }))
            .toEqual({ palette: 'crimson-red', glass: false });
    });

    it('falls back to electric-blue for an unknown palette', () => {
        expect(readPaletteFromReport({ colorPalette: 'unknown-palette' }))
            .toEqual({ palette: 'electric-blue', glass: false });
    });

    // report.json comes off the network; `in` would accept every Object.prototype key.
    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
        'rejects the prototype key %s as a palette id',
        (key) => {
            expect(readPaletteFromReport({ colorPalette: key }))
                .toEqual({ palette: 'electric-blue', glass: false });
        },
    );

    it('falls back to electric-blue for empty, null and undefined stats', () => {
        expect(readPaletteFromReport({})).toEqual({ palette: 'electric-blue', glass: false });
        expect(readPaletteFromReport(null)).toEqual({ palette: 'electric-blue', glass: false });
        expect(readPaletteFromReport(undefined)).toEqual({ palette: 'electric-blue', glass: false });
    });
});
