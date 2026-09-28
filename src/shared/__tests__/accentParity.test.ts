import { describe, it, expect } from 'vitest';
import accents from '@axiapps/axi-design/accents.json';
import { PALETTES, type ColorPalette } from '../webThemes';

/**
 * `accents.css` in the published package is what actually sets `--axi-accent`,
 * so upstream owns the hex that renders. `PALETTES[id].primary` is now only
 * documentation of that value — used by no stylesheet — and documentation that
 * can drift silently is worse than none. This fails CI on the next upstream
 * accent change instead of letting the app display one colour and render another.
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
});
