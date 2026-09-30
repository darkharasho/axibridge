import { describe, it, expect, beforeEach } from 'vitest';
import { applyAxiTheme } from '../applyAxiTheme';
import { DEFAULT_AXI_THEME } from '../webThemes';

describe('applyAxiTheme', () => {
    let root: HTMLElement;

    beforeEach(() => {
        root = document.createElement('html');
    });

    it('sets the accent id as data-axi-accent', () => {
        applyAxiTheme(root, { accent: 'crimson-red', theme: 'default' });
        expect(root.getAttribute('data-axi-accent')).toBe('crimson-red');
    });

    it.each(['glass', 'flat'])('sets data-axi-theme to the chosen theme (%s)', (theme) => {
        applyAxiTheme(root, { accent: 'electric-blue', theme });
        expect(root.getAttribute('data-axi-theme')).toBe(theme);
    });

    // Removal, not `data-axi-theme=""`: upstream's selectors are
    // [data-axi-theme="<id>"], and an empty attribute left behind is the kind of thing
    // a later [data-axi-theme] existence selector would silently match. This is the
    // one place `default` is translated back into upstream's spelling of the main
    // theme, which is the absence of the attribute.
    it('removes data-axi-theme rather than emptying it for the default theme', () => {
        applyAxiTheme(root, { accent: 'electric-blue', theme: 'glass' });
        applyAxiTheme(root, { accent: 'electric-blue', theme: 'default' });
        expect(root.hasAttribute('data-axi-theme')).toBe(false);
    });

    // Review Focus 4: an id upstream's accents.css has no rule for would leave
    // --axi-accent at upstream's own default (gold), not at the app's default.
    it('clamps an unknown accent id to the default palette', () => {
        applyAxiTheme(root, { accent: 'chartreuse-surprise', theme: 'default' });
        expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
    });

    // `in` would return true for these — every one is an Object.prototype key.
    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
        'clamps the prototype key %s to the default palette',
        (key) => {
            applyAxiTheme(root, { accent: key, theme: 'default' });
            expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
        },
    );

    it('clamps a missing accent to the default palette', () => {
        applyAxiTheme(root, { accent: null, theme: 'default' });
        expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
        applyAxiTheme(root, { accent: undefined, theme: 'default' });
        expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
    });

    it('is idempotent', () => {
        applyAxiTheme(root, { accent: 'teal-ocean', theme: 'glass' });
        applyAxiTheme(root, { accent: 'teal-ocean', theme: 'glass' });
        expect(root.getAttribute('data-axi-accent')).toBe('teal-ocean');
        expect(root.getAttribute('data-axi-theme')).toBe('glass');
    });

    // The same prototype-key hazard as the accent, one field over. A theme arrives
    // from a persisted blob, an imported settings file or a report.json off the
    // network, and `in` would accept every one of these.
    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'frosted', '', null, undefined])(
        'clamps the unusable theme %s to the default, leaving no attribute',
        (theme) => {
            applyAxiTheme(root, { accent: 'electric-blue', theme: theme as string });
            expect(root.hasAttribute('data-axi-theme')).toBe(false);
        },
    );

    // The reason AxiTheme spells the main theme 'default' and not ''. An empty string
    // is falsy, so a single `theme || 'glass'` anywhere between the settings store and
    // here would turn glass on for every user who had chosen the main theme. Asserted
    // as the shape of the value rather than trusted to review.
    it('spells the default theme as a truthy id', () => {
        expect(DEFAULT_AXI_THEME).toBe('default');
        expect(Boolean(DEFAULT_AXI_THEME)).toBe(true);
    });

    it('switches directly between two themes without stranding the old one', () => {
        applyAxiTheme(root, { accent: 'teal-ocean', theme: 'glass' });
        applyAxiTheme(root, { accent: 'teal-ocean', theme: 'flat' });
        expect(root.getAttribute('data-axi-theme')).toBe('flat');
    });
});
