import { describe, it, expect } from 'vitest';
import { readPaletteFromReport } from '../paletteReader';

describe('readPaletteFromReport', () => {
    it('reads the accent and the theme', () => {
        expect(readPaletteFromReport({ colorPalette: 'amber-warm', axiTheme: 'glass' }))
            .toEqual({ palette: 'amber-warm', theme: 'glass' });
    });

    // The theme this whole field was added for. A report published with it carries
    // `axiTheme: 'flat'` and the two legacy booleans false, so a current viewer reads
    // flat and an older one reads the main theme — which is the honest degradation,
    // and the reason the id exists rather than the boolean being stretched.
    it('reads a flat report, which no boolean could express', () => {
        expect(readPaletteFromReport({ colorPalette: 'teal-ocean', axiTheme: 'flat', glass: false, glassSurfaces: false }))
            .toEqual({ palette: 'teal-ocean', theme: 'flat' });
    });

    it('defaults to the main theme when the report carries no theme at all', () => {
        expect(readPaletteFromReport({ colorPalette: 'refined-cyan' }))
            .toEqual({ palette: 'refined-cyan', theme: 'default' });
    });

    // Two read-only compatibility paths, for two generations of published report.
    // `glass` is the boolean the setting was while there was one theme to turn on;
    // `glassSurfaces` is that boolean's older spelling, from before the three
    // appearance booleans collapsed. A report on someone's Pages site is never
    // rewritten, so both are still arriving.
    it('accepts the legacy glass boolean', () => {
        expect(readPaletteFromReport({ colorPalette: 'electric-blue', glass: true }))
            .toEqual({ palette: 'electric-blue', theme: 'glass' });
    });

    it('accepts glassSurfaces as the older spelling of that boolean', () => {
        expect(readPaletteFromReport({ colorPalette: 'electric-blue', glassSurfaces: true }))
            .toEqual({ palette: 'electric-blue', theme: 'glass' });
    });

    it('prefers glass over the glassSurfaces alias', () => {
        expect(readPaletteFromReport({ colorPalette: 'electric-blue', glass: false, glassSurfaces: true }))
            .toEqual({ palette: 'electric-blue', theme: 'default' });
    });

    // The ordering that matters for a report published by a current build: it carries
    // BOTH, and the booleans cannot express flat. Reading them first would render
    // every flat report as the main theme.
    it('prefers axiTheme over both legacy booleans', () => {
        expect(readPaletteFromReport({ colorPalette: 'crimson-red', axiTheme: 'flat', glass: true, glassSurfaces: true }))
            .toEqual({ palette: 'crimson-red', theme: 'flat' });
    });

    // `false` means the main theme, never flat: that is what those reports were
    // published looking like, and flat did not exist when they were written.
    it('maps a false legacy boolean to the main theme, not to flat', () => {
        expect(readPaletteFromReport({ colorPalette: 'rose-pink', glass: false }))
            .toEqual({ palette: 'rose-pink', theme: 'default' });
    });

    // Decision 2: already-published reports get no compatibility path. These two
    // branches are gone, and anything they used to catch lands on the default.
    it('ignores the legacy reportTheme.ui branch', () => {
        expect(readPaletteFromReport({ reportTheme: { ui: 'matte', paletteId: 'MatteSlate' } }))
            .toEqual({ palette: 'electric-blue', theme: 'default' });
    });

    it('ignores the legacy uiTheme branch', () => {
        expect(readPaletteFromReport({ uiTheme: 'dark-glass' }))
            .toEqual({ palette: 'electric-blue', theme: 'default' });
    });

    it('ignores the retired axiDesign and glassmorphic flags', () => {
        expect(readPaletteFromReport({ colorPalette: 'crimson-red', axiDesign: false, glassmorphic: true }))
            .toEqual({ palette: 'crimson-red', theme: 'default' });
    });

    it('falls back to electric-blue for an unknown palette', () => {
        expect(readPaletteFromReport({ colorPalette: 'unknown-palette' }))
            .toEqual({ palette: 'electric-blue', theme: 'default' });
    });

    // report.json comes off the network; `in` would accept every Object.prototype key.
    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
        'rejects the prototype key %s as a palette id',
        (key) => {
            expect(readPaletteFromReport({ colorPalette: key }))
                .toEqual({ palette: 'electric-blue', theme: 'default' });
        },
    );

    // Same hazard, the theme field. A hand-edited or hostile report.json setting
    // axiTheme to a prototype key would otherwise put it straight on <html>.
    it.each(['constructor', 'toString', 'frosted', '', 42, null])(
        'clamps the unusable theme %s to the main theme',
        (value) => {
            expect(readPaletteFromReport({ colorPalette: 'gold-bronze', axiTheme: value }))
                .toEqual({ palette: 'gold-bronze', theme: 'default' });
        },
    );

    it('falls back to electric-blue for empty, null and undefined stats', () => {
        expect(readPaletteFromReport({})).toEqual({ palette: 'electric-blue', theme: 'default' });
        expect(readPaletteFromReport(null)).toEqual({ palette: 'electric-blue', theme: 'default' });
        expect(readPaletteFromReport(undefined)).toEqual({ palette: 'electric-blue', theme: 'default' });
    });
});
