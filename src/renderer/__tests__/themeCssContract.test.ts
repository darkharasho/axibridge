import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AXI_THEMES, DEFAULT_AXI_THEME } from '../../shared/webThemes';

/**
 * Text-level invariants on the two stylesheets. These are not style assertions —
 * they are the load order and the absence of the deleted theme layer, both of
 * which are invisible to every other test in the suite and both of which a
 * plausible edit can break silently.
 */
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

/** Every .tsx under src/renderer and src/web, read once. */
const jsxSources = (() => {
    let cache: string[] | null = null;
    return () => {
        if (cache) return cache;
        const roots = [path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..', 'web')];
        const out: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.name.endsWith('.tsx')) out.push(fs.readFileSync(full, 'utf8'));
            }
        };
        for (const r of roots) if (fs.existsSync(r)) walk(r);
        return (cache = out);
    };
})();

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

    // This used to be a list of app classes that had to be pinned opaque under
    // glass, because blur is a no-op on Linux and a translucent floating surface
    // over content is just see-through. The list is empty now: every surface that
    // was on it - the modals, the search palette, both docks and finally the stats
    // nav rail - is an upstream object reading --axi-surface-float, and the
    // assertion that the wiring holds lives in axi-design's own suite, mutation-
    // checked against each of those classes.
    //
    // What is left is the inverse, and it is the more useful shape: nothing here
    // may hand-write a float again. .97 was the opacity every one of those deleted
    // rules used, so a reintroduced float would almost certainly carry it - and if
    // one does, it belongs upstream in the theme, not in this file.
    //
    // A `background` declaration specifically, not the literal anywhere: the
    // paragraphs in that file explaining what was deleted quote the value, and a
    // bare substring match would fail on its own history note.
    it('hand-writes no floating surface fill any more', () => {
        expect(css).not.toMatch(/background[^;:]*:[^;]*rgba\(\s*15,\s*18,\s*25,\s*0?\.97\s*\)/);
    });

    // The bulk-upload blur-off reaches surfaces through the token rather than by
    // naming them. It was an enumeration once, and it lost a surface silently every
    // time one migrated upstream - the modal, the palette, the popovers and both
    // docks were all quietly getting their blur back mid-upload. Pinning the token
    // form is what keeps the fix from decaying into that list again.
    it('turns the bulk-upload blur off through the token, not a list of surfaces', () => {
        expect(css).toMatch(/body\.bulk-uploading\s*\{[^}]*--axi-surface-filter:\s*none/);
    });

    // Upstream paints the glass light as body's background-image. A blanket
    // `background: transparent` on body, or an opaque #root over it, hides it.
    it('lets body carry the ground so the glass light can reach it', () => {
        expect(css).not.toMatch(/html,\s*\n?body\s*\{[^}]*background:\s*transparent/);
        expect(css).toContain('[data-axi-accent][data-axi-theme="glass"] #root');
    });

    // The expanded stats pane is an `.axi-sheet`. For most of this project's
    // history the two stylesheets argued about it: this file drew a modal's
    // outline, radius and card block on `.modal-pane`, and axi-design.css spent
    // five declarations taking all three back off, because a pane pinned to all
    // four sides has no edge on screen to outline. Both halves of that argument
    // are gone and only the motion is left here.
    //
    // Scoped to the `.modal-pane {` rule specifically rather than the whole
    // file: `.modal-pane` also scopes the dense-table scrollbar rules further
    // down, which legitimately draw things.
    it('draws no chrome on the expanded pane, so nothing has to cancel it', () => {
        const rule = css.match(/\n\.modal-pane \{([^}]*)\}/)?.[1] ?? '';
        expect(rule).not.toMatch(/\bbackground\b|\bborder\b|\bborder-radius\b|\bbox-shadow\b/);
        expect(rule).toMatch(/animation-duration/);
    });

    // The two things a sheet cannot know from upstream, and the only two the app
    // is allowed to say: where its top edge is, and how much padding it wants.
    // Both as knobs. A hand-written `top:`/`height:` pair is what this replaced,
    // and it had drifted into four declarations that all restated the same
    // titlebar height.
    it('positions the pane through the sheet knobs, not its own geometry', () => {
        expect(css).toMatch(/--axi-sheet-top:\s*var\(--app-titlebar-height/);
        expect(css).toMatch(/--axi-sheet-pad:[^;]*env\(safe-area-inset-bottom\)/);
        // Rules whose selector ENDS at `.modal-pane` - the pane itself. The
        // dense tables inside a pane set their own height and are entitled to.
        const paneRules = [...css.matchAll(/\.modal-pane\s*\{([^}]*)\}/g)].map((m) => m[1]);
        expect(paneRules.length).toBeGreaterThan(0);
        expect(paneRules.some((r) => /(^|[\s;])(top|bottom|height|max-height):/.test(r))).toBe(false);
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

    // The palette and form bridges translate Tailwind utilities the components
    // know nothing about, so they are written blind: nothing tells you when the
    // last site spelling `bg-orange-500/25` stops spelling it, and the rule then
    // sits here forever looking load-bearing. Twenty-nine had rotted that way by
    // the time anyone checked. This is the only kind of rule in this file whose
    // liveness is decidable from the markup, so decide it.
    it('bridges no Tailwind utility the markup has stopped using', () => {
        const bridged = [...css.matchAll(/^\[data-axi-accent\] body \.((?:bg|rounded|shadow|backdrop-blur|blur)[^\s,{]*)/gm)]
            // the selectors carry CSS escapes (`.bg-white\/5`); the markup does not
            .map((m) => m[1].replace(/\\/g, ''));
        expect(bridged.length).toBeGreaterThan(20);

        const markup = jsxSources().join('\n');
        const dead = [...new Set(bridged)].filter((cls) => {
            const token = cls.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
            // a class token is bounded by whitespace, a quote, or a variant colon
            return !new RegExp(`(^|[\\s'"\`:])${token}([\\s'"\`]|$)`, 'm').test(markup);
        });
        expect(dead).toEqual([]);
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

    // Both were app tokens once. --axi-well-line went upstream with .axi-well in
    // 1.17.0 and --axi-grid with .axi-chart in 1.45.0, and a local redeclaration
    // of a token the package owns is exactly the drift this file exists to
    // prevent - so both are asserted absent. The chart furniture that read
    // --axi-grid went with it: ChartContainer wears .axi-chart and nothing in
    // this file may name a recharts element again.
    it('restates neither --axi-grid nor --axi-well-line, and draws no chart furniture', () => {
        expect(css).not.toContain('--axi-grid:');
        expect(css).not.toContain('--axi-well-line:');
        expect(css).not.toMatch(/^\[data-axi-accent\] body [^{]*\.recharts-/m);
    });
});

/**
 * The surface-paint contract.
 *
 * Mechanism: `background-color: var(--X)` where --X resolves to a linear-gradient
 * is invalid at computed-value time — it does not fall back, it drops, and the
 * element computes to `transparent` with NO fill. `fill` is worse: it takes
 * <paint> and not <image>, and because `fill` INHERITS, an invalid one does not
 * even fall back to its own initial value, it adopts the ancestor's. color-mix()
 * takes colours only and fails the same way.
 *
 * A theme is allowed to paint a surface with a gradient — rule 1's one relief
 * upstream, and BOTH shipped themes take it. So any app token remapped onto
 * --axi-surface or --axi-surface-raised is gradient-valued under a theme, and
 * about thirty of the consuming sites are Tailwind arbitrary utilities
 * (`bg-[var(--bg-hover)]`) which compile to `background-color` by construction
 * and have no shorthand spelling. The fix can only live in the token.
 *
 * This used to be seventeen hand-picked flat values in index.css, scoped to
 * glass. It was correct for glass and structurally one theme behind: when the
 * flat theme arrived and graded its surfaces the same way, every one of those
 * sites lost its fill again with nothing pinned. Measured under flat before the
 * fix — rgb(0, 0, 0) on the chart's brush slide and bar cursor, and no fill at
 * all on the bucket grid's heat ramp.
 *
 * axi-design 1.42.0 gave every surface a `-paint` companion holding that same
 * surface as one flat <color>, in every theme, so the contract is now
 * theme-independent and asserted as such. The tokens are enumerated OUT OF
 * axi-design.css rather than from a hand-kept list, so this fails on:
 *   1. any app token remapped onto a bare surface instead of its companion;
 *   2. either stylesheet reading a bare surface token where only a colour is
 *      legal — background-color, fill, stroke, a border colour, a color-mix
 *      operand;
 *   3. the per-theme pin block coming back, which would mean a third theme got
 *      fixed the old way.
 */
describe('the surface-paint contract', () => {
    const axiDesign = read('axi-design.css');
    const indexCss = read('index.css');

    // Every app token in axi-design.css whose value is a surface token, wherever
    // it is declared: the body-level layer and the component-scoped blocks alike,
    // because a token declared in one is consumed by the same utilities as one
    // declared in the other. What matters is the VALUE, not the selector.
    const remapped = new Map<string, string>();
    for (const decl of axiDesign.matchAll(
        /(--(?!axi-)[\w-]+):\s*var\((--axi-surface(?:-raised|-float)?)(-paint)?\)\s*;/g
    )) {
        remapped.set(decl[1], decl[3] ? `${decl[2]}-paint` : decl[2]);
    }

    it('finds the remapped tokens it is meant to guard', () => {
        // Guards the enumeration itself: if the spelling in axi-design.css
        // changes, this must fail loudly rather than pass over an empty set.
        expect(remapped.size).toBeGreaterThanOrEqual(16);
        for (const token of ['--bg-card', '--bg-elevated', '--bg-hover', '--accent-bg', '--accent-bg-strong']) {
            expect(remapped.has(token), `${token} should be remapped onto a surface`).toBe(true);
        }
    });

    // The whole contract in one assertion. An app token naming a bare surface is
    // gradient-valued under every theme that grades that surface, and there is no
    // longer anywhere to paper over it.
    it('remaps every app token onto a paint companion, never a bare surface', () => {
        const bare = [...remapped].filter(([, source]) => !source.endsWith('-paint'));
        expect(
            bare.map(([token, source]) => `${token} -> ${source}`),
            'these name a surface a theme may paint with a gradient; name its -paint companion instead'
        ).toEqual([]);
    });

    it.each(['index.css', 'axi-design.css'])('%s never reads a bare surface where only a colour is legal', (file) => {
        const css = file === 'index.css' ? indexCss : axiDesign;
        const BARE = String.raw`var\(--axi-surface(?:-raised|-float)?\)`;
        expect(css, 'background-color: var(<bare surface>)')
            .not.toMatch(new RegExp(String.raw`background-color:\s*${BARE}`));
        expect(css, 'fill/stroke from a bare surface is invalid and inherits instead')
            .not.toMatch(new RegExp(String.raw`(?:fill|stroke):\s*${BARE}`));
        expect(css, 'a border colour from a bare surface')
            .not.toMatch(new RegExp(String.raw`border(?:-[a-z]+)?-color:\s*${BARE}`));
        expect(css, 'color-mix() with a gradient-valued operand')
            .not.toMatch(new RegExp(String.raw`color-mix\([^;]*${BARE}`));
    });

    // The same check pointed at the markup, where most of the consuming sites
    // are. A Tailwind arbitrary utility compiles to one property, and for `bg-[…]`
    // that property is background-color — so a bare surface token there is the
    // defect with no CSS anywhere to read it in.
    it('never reads a bare surface token from a Tailwind arbitrary utility', () => {
        const sources = jsxSources();
        expect(sources.length, 'no markup sources found to scan').toBeGreaterThan(50);
        const offenders: string[] = [];
        for (const text of sources) {
            for (const m of text.matchAll(
                /\b(?:bg|border|fill|stroke|from|via|to|ring|outline|decoration|accent|caret)-\[var\(--axi-surface(?:-raised|-float)?\)\]/g
            )) {
                offenders.push(m[0]);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('does not bring back the per-theme pin block', () => {
        // The shape that shipped: a body-level block of flat literals hooked on
        // one theme. Correct for that theme, wrong for the next one.
        expect(indexCss, 'a [data-axi-theme="<id>"] body token block is a per-theme patch')
            .not.toMatch(/\[data-axi-accent\]\[data-axi-theme="[a-z]+"\] body \{/);
    });
});

/**
 * The published viewer bundle is a build artifact committed to the repo, served
 * from GitHub Pages at /view/viewer.js, and produced by its OWN vite config
 * (`npm run build:viewer`) — not by `npm run build`, and not by
 * `scripts/copy-viewer-assets.mjs`, which copies static files beside it and
 * touches the bundle itself never. So a migration can land, the whole suite can
 * go green, the app can be correct, and the published reports can keep rendering
 * the class names the migration deleted. That has now happened twice: the
 * replay-chrome slice shipped believing a clean `git status docs/` after running
 * the copy script proved the bundle current, and it proved nothing at all.
 *
 * This is the check that would have caught it. Each name below was deleted from
 * the app's stylesheets, so a bundle still carrying one is a bundle built before
 * the deletion. Add to the list whenever a class is retired; the fix when it
 * fails is `npm run build:viewer`, never an edit here.
 */
describe('docs/view/viewer.js', () => {
    const RETIRED = ['app-opaque-float', 'app-sticky-bar'];
    const bundle = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'docs', 'view', 'viewer.js'),
        'utf8',
    );

    for (const name of RETIRED) {
        it(`was rebuilt since .${name} was retired`, () => {
            expect(
                bundle.includes(name),
                `docs/view/viewer.js still ships .${name}. Run \`npm run build:viewer\` and commit the result.`,
            ).toBe(false);
        });
    }

    // The same check from the other side: a name the app HAS adopted must be
    // present, or the bundle predates the adoption even though it happens to
    // carry none of the retired ones.
    it('carries the classes the app has adopted since', () => {
        for (const name of ['axi-dock', 'axi-toolbar--float', 'axi-panel--tile', 'axi-sheet']) {
            expect(bundle.includes(name), `docs/view/viewer.js does not ship .${name}`).toBe(true);
        }
    });
});

/**
 * The picker and the stylesheets have to name the same themes.
 *
 * AXI_THEMES is what the settings UI offers and what the applier clamps against;
 * index.css's @import list is what actually has rules behind it. They are two lists
 * in two languages with nothing connecting them, and both failure directions are
 * silent:
 *
 *   - An id offered with no stylesheet imported lands on <html> and renders as the
 *     main theme, with the attribute claiming a theme is on. That is what the flat
 *     theme was for a release: shipped in the package, unreachable in the app.
 *   - A stylesheet imported with no id offered is bytes nobody can select.
 *
 * `default` is not in the import list and must not be: it IS the absence of a theme,
 * and axi.css carries its tokens.
 */
describe('the themes the app offers and the themes it imports', () => {
    const indexCss = read('index.css');

    const imported = [...indexCss.matchAll(/@import '@axiapps\/axi-design\/themes\/([a-z-]+)\.css';/g)]
        .map((m) => m[1]);

    const offered = Object.keys(AXI_THEMES).filter((id) => id !== DEFAULT_AXI_THEME);

    it('finds the imports it is meant to be checking', () => {
        expect(imported.length).toBeGreaterThan(0);
    });

    it('imports a stylesheet for every theme the picker offers', () => {
        expect(imported.slice().sort()).toEqual(offered.slice().sort());
    });

    it('does not import a stylesheet for the default theme', () => {
        // There is no themes/default.css upstream: the main theme is axi.css's own
        // :root, and its spelling here is the absence of the attribute.
        expect(imported).not.toContain(DEFAULT_AXI_THEME);
    });

    it('ships a stylesheet in the installed package for each one', () => {
        for (const id of imported) {
            const file = path.resolve(
                __dirname, '..', '..', '..',
                'node_modules/@axiapps/axi-design/dist/themes', `${id}.css`,
            );
            expect(fs.existsSync(file), `@axiapps/axi-design ships no themes/${id}.css`).toBe(true);
        }
    });
});
