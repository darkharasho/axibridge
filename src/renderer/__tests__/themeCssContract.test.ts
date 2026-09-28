import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Text-level invariants on the two stylesheets. These are not style assertions —
 * they are the load order and the absence of the deleted theme layer, both of
 * which are invisible to every other test in the suite and both of which a
 * plausible edit can break silently.
 */
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

describe('index.css', () => {
    const css = read('index.css');

    it('imports the three upstream stylesheets', () => {
        expect(css).toContain("@import '@axiapps/axi-design/axi.css';");
        expect(css).toContain("@import '@axiapps/axi-design/accents.css';");
        expect(css).toContain("@import '@axiapps/axi-design/themes/glass.css';");
    });

    // axi.css styles *, html, body, a and :focus-visible. Tailwind's preflight
    // does too, and the later one wins, so upstream has to come after it.
    it('imports upstream after Tailwind preflight', () => {
        expect(css.indexOf('@import "tailwindcss/base";'))
            .toBeLessThan(css.indexOf("@import '@axiapps/axi-design/axi.css';"));
    });

    // accents.css and :root have equal specificity at <html>, so source order is
    // the only thing that decides which sets --axi-accent.
    it('imports accents after axi.css so [data-axi-accent] wins over the token default', () => {
        expect(css.indexOf("@import '@axiapps/axi-design/axi.css';"))
            .toBeLessThan(css.indexOf("@import '@axiapps/axi-design/accents.css';"));
    });

    it('does not import tokens.css separately', () => {
        expect(css).not.toContain('axi-design/tokens.css');
    });

    it('has no legacy palette classes left', () => {
        expect(css).not.toMatch(/body\.palette-/);
    });

    it('has no homegrown glass classes left', () => {
        expect(css).not.toContain('glass-surfaces');
        expect(css).not.toContain('glassmorphic');
    });

    it('has no non-axi escape hatch left', () => {
        expect(css).not.toContain('body:not(.axi-design)');
    });

    // Blur is a no-op on Linux, so a translucent floating surface over content is
    // just see-through. These overrides were inside the deleted glass block and
    // have to be re-expressed, not dropped.
    it('re-expresses the opaque floating surfaces under the glass theme', () => {
        for (const selector of [
            '[data-axi-theme="glass"] .app-dropdown',
            '[data-axi-theme="glass"] .app-sticky-bar',
            '[data-axi-theme="glass"] .app-modal-card',
            '[data-axi-theme="glass"] .bridge-search-panel',
            '[data-axi-theme="glass"] .stats-dashboard-nav-panel',
        ]) {
            expect(css, selector).toContain(selector);
        }
    });

    // Upstream paints the glass light as body's background-image. A blanket
    // `background: transparent` on body, or an opaque #root over it, hides it.
    it('lets body carry the ground so the glass light can reach it', () => {
        expect(css).not.toMatch(/html,\s*\n?body\s*\{[^}]*background:\s*transparent/);
        expect(css).toContain('[data-axi-theme="glass"] #root');
    });
});

describe('axi-design.css', () => {
    const css = read('axi-design.css');

    it('is unconditional — no body.axi-design scoping left', () => {
        expect(css).not.toContain('body.axi-design');
    });

    // [data-axi-accent] body, not :where(body) or a bare body: it is the only
    // replacement with the same specificity (0,1,1) as body.axi-design, so none of
    // the 667 contests this file currently wins against index.css re-resolve.
    it('scopes through the always-present accent attribute', () => {
        expect(css).toContain('[data-axi-accent] body');
        expect(css).not.toContain(':where(body)');
    });

    it('does not import tokens.css (axi.css carries the token block)', () => {
        expect(css).not.toContain('axi-design/tokens.css');
    });

    // The inversion. accents.css owns --axi-accent now, and the app's brand
    // variables derive from it. The old direction read a --brand-primary that
    // lived in the deleted palette blocks.
    it('derives brand-primary from the accent rather than the reverse', () => {
        expect(css).toContain('--brand-primary: var(--axi-accent)');
        expect(css).not.toContain('--axi-accent: var(--brand-primary');
    });

    it('still declares the two tokens upstream does not ship', () => {
        for (const token of ['--axi-well-line:', '--axi-grid:']) {
            expect(css, token).toContain(token);
        }
    });

    // --axi-rail-w is READ with a fallback and declared nowhere — it is the
    // caller's override hook, not a token this file owns. Asserting it is
    // *declared* would be asserting something that has never been true. The
    // bridge-* rename in the previous task covered class names only, so the
    // renamed token would be a silent no-op: guard against it.
    it('reads the rail width as an overridable usage, un-renamed', () => {
        expect(css).toContain('var(--axi-rail-w, 208px)');
        expect(css).not.toContain('--bridge-rail-w');
    });
});
