import { describe, it, expect, beforeEach } from 'vitest';
import { applyAxiTheme } from '../applyAxiTheme';

describe('applyAxiTheme', () => {
    let root: HTMLElement;

    beforeEach(() => {
        root = document.createElement('html');
    });

    it('sets the accent id as data-axi-accent', () => {
        applyAxiTheme(root, { accent: 'crimson-red', glass: false });
        expect(root.getAttribute('data-axi-accent')).toBe('crimson-red');
    });

    it('sets data-axi-theme to glass when glass is on', () => {
        applyAxiTheme(root, { accent: 'electric-blue', glass: true });
        expect(root.getAttribute('data-axi-theme')).toBe('glass');
    });

    // Removal, not `data-axi-theme=""`: upstream's selector is
    // [data-axi-theme="glass"], but an empty attribute left behind is the kind of
    // thing a later [data-axi-theme] existence selector would silently match.
    it('removes data-axi-theme rather than emptying it when glass is off', () => {
        applyAxiTheme(root, { accent: 'electric-blue', glass: true });
        applyAxiTheme(root, { accent: 'electric-blue', glass: false });
        expect(root.hasAttribute('data-axi-theme')).toBe(false);
    });

    // Review Focus 4: an id upstream's accents.css has no rule for would leave
    // --axi-accent at upstream's own default (gold), not at the app's default.
    it('clamps an unknown accent id to the default palette', () => {
        applyAxiTheme(root, { accent: 'chartreuse-surprise', glass: false });
        expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
    });

    // `in` would return true for these — every one is an Object.prototype key.
    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
        'clamps the prototype key %s to the default palette',
        (key) => {
            applyAxiTheme(root, { accent: key, glass: false });
            expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
        },
    );

    it('clamps a missing accent to the default palette', () => {
        applyAxiTheme(root, { accent: null, glass: false });
        expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
        applyAxiTheme(root, { accent: undefined, glass: false });
        expect(root.getAttribute('data-axi-accent')).toBe('electric-blue');
    });

    it('is idempotent', () => {
        applyAxiTheme(root, { accent: 'teal-ocean', glass: true });
        applyAxiTheme(root, { accent: 'teal-ocean', glass: true });
        expect(root.getAttribute('data-axi-accent')).toBe('teal-ocean');
        expect(root.getAttribute('data-axi-theme')).toBe('glass');
    });
});
