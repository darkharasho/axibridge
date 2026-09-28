import { describe, it, expect } from 'vitest';
import accents from '@axiapps/axi-design/accents.json';
import { PALETTES, type ColorPalette } from '../webThemes';

/**
 * `accents.css` in the published package is what actually sets `--axi-accent`,
 * so upstream owns the hex that renders. `PALETTES[id].primary` is now only
 * documentation of that value — read by the Settings swatch grid and by no
 * stylesheet — and documentation that can drift silently is worse than none.
 * This fails CI on the next upstream accent change instead of letting the app
 * display one colour and render another.
 */
describe('accent parity with @axiapps/axi-design', () => {
    const upstream = accents as Array<{ id: string; label: string; hex: string }>;

    it('ships the same 11 accent ids the app offers', () => {
        expect(upstream.map((a) => a.id).sort()).toEqual(Object.keys(PALETTES).sort());
    });

    it.each(Object.keys(PALETTES) as ColorPalette[])('matches upstream hex for %s', (id) => {
        const entry = upstream.find((a) => a.id === id);
        expect(entry, `upstream accents.json has no entry for ${id}`).toBeDefined();
        expect(PALETTES[id].primary.toLowerCase()).toBe(entry!.hex.toLowerCase());
    });

    it.each(Object.keys(PALETTES) as ColorPalette[])('matches upstream label for %s', (id) => {
        const entry = upstream.find((a) => a.id === id);
        expect(PALETTES[id].label).toBe(entry!.label);
    });
});

/**
 * The parity block above pins `primary` only, because `primary` is the only field
 * with an upstream counterpart. The other five exist solely as a record of the
 * palette, and the failure mode that motivates this block is a two-step one that
 * neither half catches alone: upstream moves an accent hex, the parity test above
 * fails, someone updates `primary` to match — and `gradient`, `accentBg`,
 * `accentBgStrong` and `accentBorder` keep the retired colour forever, because
 * nothing renders them and nothing checks them.
 *
 * `secondary` cannot be pinned (it is an independent second hue), so it is checked
 * only for its appearance inside `gradient`.
 *
 * All 11 palettes were verified consistently derived before these assertions were
 * written, so this is a pin on real regularity, not a shape forced onto the data.
 */
describe('derived accent fields follow primary', () => {
    const rgb = (hex: string) => {
        expect(hex, `${hex} is not a 6-digit hex`).toMatch(/^#[0-9a-fA-F]{6}$/);
        return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    };

    it.each(Object.keys(PALETTES) as ColorPalette[])('%s derives every wash and the gradient from primary', (id) => {
        const p = PALETTES[id];
        const [r, g, b] = rgb(p.primary);
        const wash = (alpha: string) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

        expect(p.accentBg, 'accentBg is primary at 10%').toBe(wash('0.10'));
        expect(p.accentBgStrong, 'accentBgStrong is primary at 18%').toBe(wash('0.18'));
        expect(p.accentBorder, 'accentBorder is primary at 35%').toBe(wash('0.35'));

        // secondary has no derivation to check, but it must at least be a hex, and
        // the gradient must be exactly the two hexes this palette declares — that
        // is what makes a stale `gradient` a failure rather than a silent lie.
        rgb(p.secondary);
        expect(p.gradient, 'gradient ramps primary to secondary').toBe(
            `linear-gradient(135deg, ${p.primary}, ${p.secondary})`
        );
    });

    it('every palette id is its own key', () => {
        for (const [key, palette] of Object.entries(PALETTES)) {
            expect(palette.id, key).toBe(key);
        }
    });
});
