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

    // `:not(.axi-design)` anywhere, not just after a bare `body`: the compound-class
    // near-miss that let `body.web-report.axi-design` survive in axi-design.css is the
    // same shape of hole, and `body.web-report:not(.axi-design)` would slip through a
    // substring check on `body:not(.axi-design)`.
    it('has no non-axi escape hatch left', () => {
        expect(css).not.toMatch(/:not\(\.axi-design\)/);
        expect(css).not.toMatch(/\.axi-design\b/);
    });

    // Blur is a no-op on Linux, so a translucent floating surface over content is
    // just see-through. These overrides were inside the deleted glass block and
    // have to be re-expressed, not dropped.
    //
    // The full two-attribute prefix, not just `[data-axi-theme="glass"]`: axi-design.css
    // styles several of these same surfaces at `[data-axi-accent] body .foo`, some with
    // `!important` (e.g. .bridge-search-panel), which is (0,2,1) or deeper. A single-attribute
    // `[data-axi-theme="glass"] .foo` rule is (0,2,0) — it would sit in the bundle, satisfy a
    // substring check on the bare selector, and still lose the cascade and never paint. Pinning
    // the full `[data-axi-accent][data-axi-theme="glass"]` prefix is what actually catches that.
    it('re-expresses the opaque floating surfaces under the glass theme, at the specificity that wins', () => {
        for (const selector of [
            '[data-axi-accent][data-axi-theme="glass"] .app-dropdown',
            '[data-axi-accent][data-axi-theme="glass"] .app-sticky-bar',
            '[data-axi-accent][data-axi-theme="glass"] .app-modal-card',
            '[data-axi-accent][data-axi-theme="glass"] .bridge-search-panel',
            '[data-axi-accent][data-axi-theme="glass"] .stats-dashboard-nav-panel',
        ]) {
            expect(css, selector).toContain(selector);
        }
    });

    // Upstream paints the glass light as body's background-image. A blanket
    // `background: transparent` on body, or an opaque #root over it, hides it.
    it('lets body carry the ground so the glass light can reach it', () => {
        expect(css).not.toMatch(/html,\s*\n?body\s*\{[^}]*background:\s*transparent/);
        expect(css).toContain('[data-axi-accent][data-axi-theme="glass"] #root');
    });
});

describe('axi-design.css', () => {
    const css = read('axi-design.css');

    // A regex on the class name anywhere, not `not.toContain('body.axi-design')`.
    // The substring form passed for a whole release while
    // `body.web-report.axi-design .report-head` sat in the file: the compound class
    // does not contain the substring `body.axi-design`, so the assertion could not
    // fail for the very thing it named, and every published report kept the header
    // rule that rule exists to remove. Any `.axi-design` in a selector is dead now
    // — nothing adds the class — so match it wherever it appears.
    it('is unconditional — no .axi-design class scoping left, compound or not', () => {
        expect(css).not.toMatch(/\.axi-design\b/);
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

    // The body rule paints the ground with the background-color LONGHAND, not the
    // `background:` shorthand. This selector is (0,1,1) against upstream's bare
    // `body` at (0,0,1) in an earlier stylesheet, so it always wins for whatever
    // properties it declares — and the shorthand declares them all, resetting
    // background-image to `none` and discarding upstream's --axi-ground-image (the
    // three radial gradients that ARE the glass theme's visual). A positive
    // assertion on the winning form, scoped to the token block itself (not a
    // negative regex over the whole file, which nearby rules like .app-shell's own
    // `background: var(--axi-ground)` — a different element, safe to leave as
    // shorthand — would trip): robust to whitespace/comment reflow elsewhere in the
    // file, and it is the thing that actually has to stay true.
    it('paints the ground on body with background-color, so background-image survives', () => {
        const bodyTokenBlock = css.match(/\[data-axi-accent\] body \{[^}]*\}/);
        expect(bodyTokenBlock, 'the [data-axi-accent] body token block').not.toBeNull();
        const block = bodyTokenBlock![0];
        expect(block).toContain('background-color: var(--axi-ground);');
        expect(block).not.toMatch(/(?<!-)background:\s*var\(--axi-ground\)/);
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

/**
 * The flat-surface-token contract under glass.
 *
 * Mechanism: `background-color: var(--X)` where --X resolves to a linear-gradient
 * is invalid at computed-value time — it does not fall back, it drops, and the
 * element computes to `transparent` with NO fill. Upstream's glass theme makes
 * --axi-surface and --axi-surface-raised alpha gradients, and axi-design.css
 * remaps sixteen of the app's own tokens onto those two. Roughly 200 markup sites
 * consume those tokens through Tailwind arbitrary utilities (`bg-[var(--bg-hover)]`),
 * which compile to `background-color` by construction and have no shorthand
 * spelling, so the only place the fix can live is the token itself.
 *
 * This test enumerates the affected tokens OUT OF axi-design.css rather than from a
 * hand-kept list, so it fails on three distinct regressions:
 *   1. the glass flat-token block in index.css is deleted or renamed;
 *   2. any one token in it is re-pointed back at a gradient-valued --axi-* token;
 *   3. a NEW app token is remapped onto --axi-surface/-raised in axi-design.css
 *      without a flat counterpart being added here.
 * It also fails if the glass block's selector loses its trailing ` body`, which is
 * the form that ships inert: the remaps are declared directly ON body, and an
 * inherited custom property from <html> always loses to a declaration on the
 * element regardless of specificity.
 */
describe('flat app surface tokens under glass', () => {
    const axiDesign = read('axi-design.css');
    const indexCss = read('index.css');

    // Every block whose selector is exactly `[data-axi-accent] body` — the app's
    // body-level token layer. Component blocks (`... body .foo`) are excluded on
    // purpose: the tokens they declare are read by `background:` shorthands, where a
    // gradient is valid, and they are out of a body-scoped block's reach anyway.
    const gradientValued = new Map<string, string>();
    for (const block of axiDesign.matchAll(/^\[data-axi-accent\] body \{([^}]*)\}/gm)) {
        for (const decl of block[1].matchAll(/(--[\w-]+):\s*var\((--axi-surface(?:-raised)?)\)\s*;/g)) {
            gradientValued.set(decl[1], decl[2]);
        }
    }

    const glassBlock = indexCss.match(
        /\[data-axi-accent\]\[data-axi-theme="glass"\] body \{([^}]*)\}/
    );

    const FLAT = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/;

    it('finds the remapped tokens it is meant to guard', () => {
        // Guards the enumeration itself: if the selector shape in axi-design.css
        // changes, this test must fail loudly rather than pass over an empty set.
        expect(gradientValued.size).toBeGreaterThanOrEqual(16);
        for (const token of ['--bg-card', '--bg-elevated', '--bg-hover', '--accent-bg', '--accent-bg-strong']) {
            expect(gradientValued.has(token), `${token} should be remapped onto a surface token`).toBe(true);
        }
    });

    it('re-declares them on body, where a declaration beats inheritance', () => {
        expect(glassBlock, 'the [data-axi-accent][data-axi-theme="glass"] body token block').not.toBeNull();
    });

    it('gives every one of them a flat colour under glass', () => {
        const declared = new Map<string, string>();
        for (const decl of glassBlock![1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
            declared.set(decl[1], decl[2].trim());
        }
        for (const [token, source] of gradientValued) {
            const value = declared.get(token);
            expect(value, `${token} maps to ${source} (a gradient under glass) and needs a flat value here`)
                .toBeDefined();
            expect(value, `${token} is still gradient-valued under glass`).toMatch(FLAT);
        }
    });

    it('does not redeclare upstream’s own tokens', () => {
        // Upstream's .axi-* components read --axi-surface directly and must keep
        // their gradients; this block is only for AxiBridge's vocabulary.
        expect(glassBlock![1]).not.toMatch(/--axi-[\w-]+\s*:/);
    });

    // The hand-written third of the same problem. These five tokens are
    // gradient-valued under glass, so neither stylesheet may consume them through a
    // property that only accepts a colour: `background-color` or a color-mix()
    // operand. The flat block above makes them safe today, which is exactly why a
    // regression here would be silent — it only resurfaces if a token moves.
    //
    // This list is deliberately five of the sixteen, not all of them. The other
    // eleven ARE still read through `background-color` — `--status-success-bg` and
    // `--status-error-bg` at index.css:941,947 and 951,957 — and are rescued by the
    // flat block rather than by avoiding the property, so widening this regex would
    // fail on correct code. The invariant these five carry is the stronger one:
    // never reach for a colour-only property with a surface token in the first place.
    const COLOUR_ONLY_TOKENS = 'bg-card|bg-elevated|bg-hover|accent-bg|accent-bg-strong';
    it.each(['index.css', 'axi-design.css'])('%s never reads a surface token where only a colour is legal', (file) => {
        const css = file === 'index.css' ? indexCss : axiDesign;
        expect(css, 'background-color: var(<surface token>)')
            .not.toMatch(new RegExp(String.raw`background-color:\s*var\(--(${COLOUR_ONLY_TOKENS})[,)]`));
        expect(css, 'color-mix() with a gradient-valued operand')
            .not.toMatch(/color-mix\([^;]*var\(--axi-surface(-raised)?\)/);
    });

    // SVG `fill` is the fifth population of the same mechanism, and the one that
    // hides best: `fill` takes <paint>, not <image>, so a gradient-valued token
    // makes the declaration invalid — and because `fill` INHERITS, the element does
    // not fall back to its own initial value, it silently adopts the ancestor's
    // fill. Measured in Chrome: a gradient-valued `fill` computed to the ancestor's
    // purple, not to any surface. Nothing in the app sets fill on a recharts
    // ancestor, so under glass the brush slide, the brush travellers and the
    // tooltip hover band rendered initial black.
    it('never paints SVG fill from a gradient-valued token', () => {
        for (const [file, css] of [['index.css', indexCss], ['axi-design.css', axiDesign]] as const) {
            expect(css, `${file}: fill: var(--axi-surface…) is invalid and inherits instead`)
                .not.toMatch(/fill:\s*var\(--axi-surface(-raised)?\)/);
        }
    });
});
