# axi-design as the default language, with one glass toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `@axiapps/axi-design` to 1.13.0, make the axi design language unconditional in both the Electron renderer and the published web report, and replace `glassSurfaces` / `glassmorphic` / `axiDesign` with a single `glass` boolean driven by upstream's `[data-axi-theme="glass"]`.

**Architecture:** Upstream's `axi.css`, `accents.css` and `themes/glass.css` are imported into `src/renderer/index.css` after Tailwind's preflight. Theme selection moves from body classes to two data attributes on `<html>` (`data-axi-accent`, `data-axi-theme`), set by one shared module `applyAxiTheme` used by both the renderer and the report viewer. `axi-design.css` loses its `body.axi-design` prefixes and becomes the app's unconditional remap layer; the legacy non-axi look and the homegrown glass are deleted from `index.css`, with the opaque floating-surface overrides re-expressed under `[data-axi-theme="glass"]`.

**Tech Stack:** TypeScript, React 18, Electron, Vite (three targets: `dist-react/`, `dist-web/`, `docs/view/`), Tailwind CSS, `@axiapps/axi-design` 1.13.0 (CSS only), vitest + jsdom, electron-store.

**Spec:** `docs/superpowers/specs/2026-09-28-axi-design-default-glass-toggle-design.md`

## Global Constraints

- `@axiapps/axi-design` pinned at `^1.13.0`. Import paths are exactly `@axiapps/axi-design/axi.css`, `@axiapps/axi-design/accents.css`, `@axiapps/axi-design/themes/glass.css`, `@axiapps/axi-design/accents.json`. `tokens.css` is NOT imported separately — `axi.css` already carries the token block in its `:root`.
- Run vitest as `npx vitest run <file>` — nothing more. `vitest.config.ts` already pins `pool: 'forks'`, `maxWorkers: 2`, which is the memory cap this machine needs (it has 32 GB but runs heavy apps alongside dev work). Do NOT pass `--pool=forks --poolOptions.forks.maxForks=2`: vitest 4 removed `test.poolOptions`, and that flag makes the run die with `CACError: Unknown option --poolOptions` rather than capping anything.
- `npm run validate` is `typecheck + lint` at `--max-warnings 0`. It must pass at the end of every task that touches TS/TSX.
- **Membership in `PALETTES` is tested with `Object.prototype.hasOwnProperty.call(PALETTES, id)`, never `id in PALETTES`.** `in` walks the prototype chain, so `'constructor' in PALETTES` is `true` and a payload carrying `colorPalette: "constructor"` would pass an `in` guard unclamped. Not `Object.hasOwn`: `tsconfig.json` sets `lib: ["ES2021", …]` and `hasOwn` is ES2022, so it will not typecheck.
- All 11 `ColorPalette` ids survive: `electric-blue refined-cyan amber-warm emerald-mint rose-pink violet-purple crimson-red slate-silver teal-ocean gold-bronze axi-gold`. `DEFAULT_PALETTE_ID` stays `electric-blue`.
- `PALETTES` in `src/shared/webThemes.ts` stays. `LEGACY_THEME_TO_PALETTE` stays, for *settings* migration only.
- Already-published reports get no compatibility path in the reader: `readPaletteFromReport` drops its `reportTheme.ui` and `uiTheme` branches. It keeps one fallback only — `stats.glassSurfaces` as an alias for `stats.glass`.
- The published payload emits **both** `glass` and `glassSurfaces` (same value), so viewers already deployed in the field keep working.
- Glass is publisher-baked. The single toggle lives in app Settings and is stamped into `report.json` at publish. The web-report viewer gets no control of its own.
- No TSX markup is changed to use upstream component classes (`.axi-btn`, `.axi-card`, …). That is sub-projects 2–5.
- Blur is a no-op on Linux. Any floating surface with content moving behind it needs an opaque fill of its own — never a translucent one.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

Five input classes the spec implies but which no task's own tests would otherwise exercise. Each has a test added to the task that owns the code.

1. **Second launch after migration.** `glassSurfaces`/`glassmorphic` are deleted by the first run, so a naive unconditional `glass = glassSurfaces || glassmorphic` re-runs as `undefined || undefined` → `false` and silently switches a user's glass back off on every subsequent launch. The migration must only write `glass` when it is absent. Test in Task 4.
2. **Settings import from a file with no `uiTheme`.** `settingsHandlers.ts:308` guards its whole migration on `importedSettings.uiTheme`. A settings file exported by the *current* version carries the three booleans and no `uiTheme`, so the guard skips it and the import lands with no `glass` key at all. The boolean collapse has to run outside that guard, and is shared with the launch-time migration as `collapseGlassKeys`. Test in Task 4.
3. **A share link's map accent.** `MAP_ACCENT_CSS_VARS` sets `--brand-primary` inline. After the accent direction inverts, `--brand-primary` is derived *from* `--axi-accent`, so an inline `--brand-primary` no longer reaches the language — every upstream component and every axi remap would keep the palette accent and ignore the map colour. `--axi-accent` must be set inline too. Test in Task 6.
4. **A `colorPalette` value that is not a known id** (a corrupt store, a hand-edited `report.json`). Written straight to `data-axi-accent` it matches no rule in upstream `accents.css`, so the accent silently falls back to upstream's gold rather than to `electric-blue`. `applyAxiTheme` must clamp unknown ids. Test in Task 2.
5. **A report published with `glass: true` must render in glass.** This is the whole user-visible point of "swapping to glass should swap everything ... app and web report", and nothing else in the viewer path asserts it end to end. Test in Task 6.

---

## File Structure

**Created:**
- `src/shared/applyAxiTheme.ts` — the single theme applier. Sets `data-axi-accent` and `data-axi-theme` on a root element. No other responsibility.
- `src/shared/__tests__/applyAxiTheme.test.ts` — unit tests for the applier.
- `src/shared/__tests__/accentParity.test.ts` — asserts `PALETTES[id].primary` matches upstream `accents.json` for all 11 ids.
- `src/renderer/__tests__/themeCssContract.test.ts` — text-level invariants on the two stylesheets: upstream imports present and ordered, no `body.axi-design`, no `glass-surfaces`/`glassmorphic`, no `body.palette-*`, glass floating-surface overrides present.

**Modified:**
- `package.json` — the dependency pin.
- `src/shared/webThemes.ts` — doc comment on `primary` and on `LEGACY_THEME_TO_PALETTE`.
- `src/shared/mapAccent.ts` — `MAP_ACCENT_CSS_VARS` gains `--axi-accent`.
- `index.html`, `web/index.html`, `src/web/viewerMain.tsx` — seed `data-axi-accent` so the remap layer's scope is true from first paint.
- `src/renderer/index.css` — upstream imports; delete the legacy layer; re-express glass floating surfaces.
- `src/renderer/axi-design.css` — drop the `tokens.css` import, drop the 667 `body.axi-design ` prefixes, invert the accent, add the glass overrides.
- `src/renderer/global.d.ts` — `DEFAULT_GLASS`; the two settings interfaces.
- `src/renderer/app/hooks/useSettings.ts` — one `glass` boolean; body-class effect replaced by `applyAxiTheme`.
- `src/renderer/App.tsx`, `src/renderer/SettingsView.tsx` — prop/state collapse.
- `src/main/index.ts`, `src/main/handlers/settingsHandlers.ts` — the store migration.
- `src/main/handlers/githubHandlers.ts`, `src/main/webReportParts.ts` — publish stamping and stub keys.
- `src/web/paletteReader.ts`, `src/web/reportApp.tsx` — the viewer.
- Ten source files for the namespace rename (Task 3).
- Six stats components — comment rewrites (Task 7).

**Deleted:**
- `web/web-report-themes/` and `public/web-report-themes/` (6 files each).
- `scripts/dedupe-web-themes.mjs`.
- `src/shared/__tests__/statsThemesContract.test.ts`.

---

### Task 1: Upgrade the package to 1.13.0 and pin the accent contract

Eight releases of drift land at once. The accent-parity test is both the spec's required new test and the cheapest possible proof that the new `./accents.json` export resolves — it cannot pass on 1.6.0, whose exports map has only `./axi.css`, `./tokens.css` and `./package.json`.

**Files:**
- Modify: `package.json:66`
- Modify: `src/shared/webThemes.ts` (doc comment on `primary`)
- Create: `src/shared/__tests__/accentParity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `@axiapps/axi-design` 1.13.0 in `node_modules`, with these five entry points resolvable — `@axiapps/axi-design/axi.css`, `/accents.css`, `/themes/glass.css`, `/accents.json`, `/tokens.css`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/accentParity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/accentParity.test.ts`

Expected: FAIL — Vite cannot resolve `@axiapps/axi-design/accents.json`, because 1.6.0's exports map does not list it.

- [ ] **Step 3: Bump the pin and install**

Edit `package.json:66`, changing `"@axiapps/axi-design": "^1.6.0",` to:

```json
        "@axiapps/axi-design": "^1.13.0",
```

Then run: `npm install @axiapps/axi-design@^1.13.0`

- [ ] **Step 4: Verify the installed version and the five entry points**

Run:

```bash
node -e "
const p = require('@axiapps/axi-design/package.json');
console.log('version', p.version);
console.log(JSON.stringify(p.exports, null, 2));
"
```

Expected: `version 1.13.0`, and an `exports` object containing `./axi.css`, `./tokens.css`, `./accents.css`, `./themes/*.css`, `./accents.json`, `./package.json`.

Run:

```bash
ls node_modules/@axiapps/axi-design/dist/axi.css \
   node_modules/@axiapps/axi-design/dist/accents.css \
   node_modules/@axiapps/axi-design/dist/themes/glass.css \
   node_modules/@axiapps/axi-design/accents.json
```

Expected: all four listed, no errors.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/shared/__tests__/accentParity.test.ts`

Expected: PASS, 12 tests (1 id-set test + 11 per-id).

- [ ] **Step 6: Record the one token value that changed**

The only *value* change between 1.6.0 and 1.13.0 is the corner radius; everything else in the diff is new tokens. `--axi-radius` went `10px` → `0` and `--axi-radius-sm` went `6px` → `0`. Upstream's glass theme restates them as `16px` / `10px`. The default (non-glass) axi look therefore becomes square-cornered, and glass becomes the rounded one. This is upstream's intent, not a regression — note it so nobody chases it during the visual pass.

Add this comment above the `primary` field in `src/shared/webThemes.ts`. Replace:

```ts
export interface PaletteDefinition {
    id: ColorPalette;
    label: string;
    primary: string;
```

with:

```ts
export interface PaletteDefinition {
    id: ColorPalette;
    label: string;
    /**
     * Documentation of the accent, not the live value. `--axi-accent` is set by
     * `@axiapps/axi-design/accents.css` from `[data-axi-accent]`, and every
     * brand variable in the app derives from it. Kept because `mapAccent.ts`
     * and the Settings swatch grid read it; pinned to upstream by
     * `src/shared/__tests__/accentParity.test.ts`.
     */
    primary: string;
```

- [ ] **Step 7: Verify nothing else broke**

Run: `npm run validate`

Expected: PASS. (1.13.0 is not loaded by any stylesheet yet — `axi-design.css` still imports only `tokens.css`, whose token *names* are all still present. The tokens AxiBridge adds itself are unaffected: `--axi-grid` and `--axi-well-line` are declared locally, and `--axi-rail-w` is only ever read, with an inline `208px` fallback and no declaration at all.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/shared/webThemes.ts src/shared/__tests__/accentParity.test.ts
git commit -m "$(cat <<'EOF'
chore(deps): upgrade @axiapps/axi-design 1.6.0 -> 1.13.0

Brings the glass theme, accents.css and accents.json. Pins PALETTES[id].primary
to upstream's accents.json so the documented accent cannot drift from the one
that renders.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The shared theme applier

`useSettings.ts:170-186` and `reportApp.tsx:528-551` duplicate the same body-class logic today. Both are replaced by this one module. The target is `<html>`, not `<body>`: upstream's `accents.css` and `themes/glass.css` are unscoped attribute selectors, and applying them at the document element lets them cascade over every `body`-level rule without a specificity fight — which is what the `!important` war in the old glass implementation was.

**Files:**
- Create: `src/shared/applyAxiTheme.ts`
- Create: `src/shared/__tests__/applyAxiTheme.test.ts`

**Interfaces:**
- Consumes: `ColorPalette`, `PALETTES`, `DEFAULT_PALETTE_ID` from `src/shared/webThemes.ts` (Task 1).
- Produces:
  ```ts
  export function applyAxiTheme(
      root: HTMLElement,
      opts: { accent: ColorPalette | string | null | undefined; glass: boolean },
  ): void
  ```
  Tasks 5 and 6 call this. Its only side effects are `data-axi-accent` (always set, clamped to a known id) and `data-axi-theme` (set to `"glass"` or removed).

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/applyAxiTheme.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/applyAxiTheme.test.ts`

Expected: FAIL — `Failed to resolve import "../applyAxiTheme"`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/applyAxiTheme.ts`:

```ts
import { PALETTES, DEFAULT_PALETTE_ID, type ColorPalette } from './webThemes';

/**
 * Applies the axi design language to a document root.
 *
 * Two attributes, and nothing else. `@axiapps/axi-design/accents.css` maps
 * `[data-axi-accent]` to `--axi-accent`, and
 * `@axiapps/axi-design/themes/glass.css` maps `[data-axi-theme="glass"]` to the
 * whole glass token set. Every surface in the app derives from those tokens, so
 * these two attributes are the entire appearance API.
 *
 * `root` is `<html>` rather than `<body>` on purpose: upstream's selectors are
 * unscoped, and at the document element they cascade over every body-level rule
 * without contesting specificity. The homegrown glass had to use `!important`
 * to win that fight, which is why it could not coexist with the axi language at
 * all.
 *
 * `particles-disabled` is deliberately NOT handled here — it is app behaviour,
 * not part of the design language, and stays a `body` class.
 */
export function applyAxiTheme(
    root: HTMLElement,
    opts: { accent: ColorPalette | string | null | undefined; glass: boolean },
): void {
    // hasOwnProperty, not `in`: `in` walks the prototype chain, so
    // `'constructor' in PALETTES` is true and an accent of "constructor" — which a
    // malformed settings blob or a hand-edited report.json can carry — would sail
    // through unclamped and land in the attribute, where upstream's accents.css has
    // no rule for it and --axi-accent silently falls back to upstream's gold.
    const accent: ColorPalette =
        typeof opts.accent === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, opts.accent)
            ? (opts.accent as ColorPalette)
            : DEFAULT_PALETTE_ID;

    root.setAttribute('data-axi-accent', accent);

    if (opts.glass) root.setAttribute('data-axi-theme', 'glass');
    else root.removeAttribute('data-axi-theme');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/applyAxiTheme.test.ts`

Expected: PASS, 10 tests (6 behavioural + 4 prototype-key cases).

- [ ] **Step 5: Validate**

Run: `npm run validate`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/applyAxiTheme.ts src/shared/__tests__/applyAxiTheme.test.ts
git commit -m "$(cat <<'EOF'
feat(theme): add applyAxiTheme, one applier for accent and glass

Sets data-axi-accent and data-axi-theme on the document element, replacing the
duplicated body-class logic in useSettings and reportApp. Unknown accent ids
clamp to electric-blue rather than falling through to upstream's own default.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rename AxiBridge's own `axi-*` classes to `bridge-*`

Upstream already owns `.axi-search`, `.axi-search__icon` and `.axi-spinner`. AxiBridge invented `axi-search-*`, `axi-rail` and `axi-step-spinner`. Today that is a near-miss rather than a clean separation; sub-projects 2–5 make the overlap load-bearing, and Task 5 imports the upstream stylesheet that contains those classes. Rename now, before anything else depends on the old names.

There are **109 occurrences across 10 source files**, more than the spec's rough estimate. The `web/assets/` hits are committed build artifacts and are left alone — they are regenerated by `npm run build:web`.

**Files:**
- Modify: `src/renderer/app/AxiRail.tsx` (6)
- Modify: `src/renderer/app/FilePickerModal.tsx` (1)
- Modify: `src/renderer/app/ProcessingStrip.tsx` (1)
- Modify: `src/renderer/axi-design.css` (34)
- Modify: `src/renderer/index.css` (8)
- Modify: `src/renderer/stats/search/SearchPalette.tsx` (10)
- Modify: `src/renderer/stats/search/useSearchJump.ts` (3)
- Modify: `src/renderer/stats/ui/StatsHeader.tsx` (2)
- Modify: `src/web/reportApp.tsx` (3)
- Test: `src/renderer/stats/search/__tests__/SearchPalette.test.tsx` (4)

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS class names Task 5 writes glass overrides against — `bridge-search-panel`, `bridge-search-bar`, `bridge-search-field`, `bridge-search-filters`, `bridge-search-group`, `bridge-search-icon`, `bridge-search-results`, `bridge-search-empty`, `bridge-search-trigger`, `bridge-search-flash`, `bridge-rail`, `bridge-step-spinner`.

- [ ] **Step 1: Record the inventory before the rename**

Run:

```bash
grep -ro 'axi-search-[a-z]*\|axi-rail\|axi-step-spinner' \
  src/renderer src/web --include='*.ts' --include='*.tsx' --include='*.css' \
  | sed 's/.*://' | sort | uniq -c | sort -rn
```

Expected output (total 109):

```
     30 axi-rail
     13 axi-search-bar
     13 axi-search-trigger
      9 axi-search-flash
      9 axi-search-panel
      9 axi-step-spinner
      8 axi-search-results
      6 axi-search-empty
      6 axi-search-group
      3 axi-search-field
      2 axi-search-icon
      1 axi-search-filters
```

Save this as the number the post-rename check must reproduce under the new prefix.

- [ ] **Step 2: Write the failing test**

Add to `src/renderer/stats/search/__tests__/SearchPalette.test.tsx`, inside the existing top-level `describe`, replacing the current test at line 122. Delete:

```tsx
    it('carries the axi-search-panel class the glass theme targets for its opaque override', () => {
```

…through the end of that `it` block, and put this in its place:

```tsx
    it('carries the bridge-search-panel class the glass theme targets for its opaque override', () => {
        // The search palette floats over scrolling content, and blur is a no-op on
        // Linux, so it needs an opaque fill of its own under glass. That override
        // is keyed on this class:
        //   index.css: `[data-axi-theme="glass"] .bridge-search-panel { … }`
        // `bridge-` rather than `axi-`: upstream @axiapps/axi-design owns
        // `.axi-search` and `.axi-search__icon`, and this is not one of those.
        const { container } = renderPalette();
        expect(container.querySelector('.bridge-search-panel')).toBeTruthy();
        expect(container.querySelector('.axi-search-panel')).toBeNull();
    });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/search/__tests__/SearchPalette.test.tsx`

Expected: FAIL on the new test — `expect(container.querySelector('.bridge-search-panel')).toBeTruthy()` receives `null`.

- [ ] **Step 4: Apply the rename**

Run:

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
FILES="src/renderer/app/AxiRail.tsx
src/renderer/app/FilePickerModal.tsx
src/renderer/app/ProcessingStrip.tsx
src/renderer/axi-design.css
src/renderer/index.css
src/renderer/stats/search/SearchPalette.tsx
src/renderer/stats/search/useSearchJump.ts
src/renderer/stats/ui/StatsHeader.tsx
src/web/reportApp.tsx
src/renderer/stats/search/__tests__/SearchPalette.test.tsx"
for f in $FILES; do
  sed -i -e 's/axi-search-/bridge-search-/g' \
         -e 's/axi-step-spinner/bridge-step-spinner/g' \
         -e 's/axi-rail__/bridge-rail__/g' \
         -e 's/\baxi-rail\b/bridge-rail/g' "$f"
done
```

`axi-design` (the body class), `axi-gold` (a palette id), `axi-step-march` (a `@keyframes` name, not a class) and every `--axi-*` CUSTOM PROPERTY — including `--axi-rail-w`, which a `\baxi-rail\b` pattern will otherwise rewrite, since `-` is not a word character — are deliberately untouched — the first is deleted outright in Task 5, and the rest are token or accent-id references, not component classes.

- [ ] **Step 5: Verify the rename is complete and conserved**

Run:

```bash
echo "--- leftovers (want: none) ---"
grep -rn 'axi-search-\|axi-step-spinner\|\baxi-rail\b' \
  src/renderer src/web --include='*.ts' --include='*.tsx' --include='*.css' || echo "clean"
echo "--- new total (want: 109) ---"
grep -ro 'bridge-search-[a-z]*\|bridge-rail\|bridge-step-spinner' \
  src/renderer src/web --include='*.ts' --include='*.tsx' --include='*.css' | wc -l
```

Expected: `clean`, then `109`.

Also confirm no collision was introduced with a name upstream owns:

```bash
grep -rn '\.axi-search\b\|\.axi-search__\|\.axi-spinner\b' \
  src/renderer src/web --include='*.css' || echo "no upstream-owned selectors declared locally"
```

Expected: `no upstream-owned selectors declared locally`.

- [ ] **Step 6: Run the tests**

Run:

```bash
npx vitest run src/renderer/stats/search
npx vitest run src/renderer/stats/__tests__/statsHeaderSlicePill.test.tsx
```

Expected: both PASS. (`statsHeaderSlicePill.test.tsx` contains no `axi-search-*` reference despite the spec's test table listing it — it is run here only to confirm `StatsHeader.tsx` still renders.)

- [ ] **Step 7: Validate**

Run: `npm run validate`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/renderer src/web
git commit -m "$(cat <<'EOF'
refactor(css): rename AxiBridge's own axi-* classes to bridge-*

Upstream @axiapps/axi-design owns .axi-search, .axi-search__icon and
.axi-spinner. AxiBridge's axi-search-*, axi-rail and axi-step-spinner were a
near-miss rather than a clean separation, and loading axi.css next makes the
overlap load-bearing. 109 occurrences across 10 files.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Collapse three booleans into one `glass` setting

This task changes the setting's *shape* everywhere — store, migration, import, types, renderer state, Settings UI — while the CSS is still keyed on body classes. To keep the app looking correct at the end of this task, `useSettings` keeps one transitional line: it adds `body.axi-design` unconditionally. That preserves today's rendering exactly, because glass is already suppressed under axi today (`glassSurfaces && !axiDesign`), so a `glass` toggle with no CSS behind it yet is inert rather than broken. Task 5 removes that line.

**Files:**
- Modify: `src/main/index.ts:226-239`
- Modify: `src/main/handlers/settingsHandlers.ts:307-317`
- Modify: `src/renderer/global.d.ts:299-303`, `:357-360`, `:411-414`
- Modify: `src/renderer/app/hooks/useSettings.ts:4`, `:28-30`, `:99-107`, `:169-186`, `:200-202`, `:217`
- Modify: `src/renderer/App.tsx:81-83`, `:1308`, `:1316`
- Modify: `src/renderer/SettingsView.tsx:80-82`, `:118-120`, `:131-133`, `:234`, `:248-252`, `:573-580`, `:857-859`, `:1030-1032`, `:1054-1056`, `:1084-1086`, `:2986-3040`
- Test: `src/main/__tests__/settingsMigration.test.ts`
- Test: `src/renderer/__tests__/SettingsView.test.tsx:357-405`

**Interfaces:**
- Consumes: `applyAxiTheme` from `src/shared/applyAxiTheme.ts` (Task 2).
- Produces:
  - `export const DEFAULT_GLASS = false;` in `src/renderer/global.d.ts`.
  - `export function migrateGlassSetting(store: GlassMigrationStore): void` and `export function collapseGlassKeys(settings: Record<string, any>): void`, both in a new module `src/main/glassSettingMigration.ts` — extracted so they are testable without booting Electron. `migrateGlassSetting` serves the electron-store on launch; `collapseGlassKeys` serves the settings-import handler's plain object. Tasks 5–7 call neither.
  - `settings.glass?: boolean` on both settings interfaces in `global.d.ts`; `glassSurfaces`, `glassmorphic` and `axiDesign` are gone from them.
  - `SettingsView` prop `onGlassSaved?: (glass: boolean) => void` and prop `glass?: boolean`.
  - `useSettings()` returns `glass, setGlass` in place of the three pairs.

- [ ] **Step 1: Write the failing migration test**

Replace the whole of `src/main/__tests__/settingsMigration.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { LEGACY_THEME_TO_PALETTE } from '../../shared/webThemes';
import { collapseGlassKeys, migrateGlassSetting } from '../glassSettingMigration';

/** Minimal stand-in for the electron-store surface the migration uses. */
const makeStore = (initial: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { ...initial };
    return {
        data,
        get: (key: string, fallback?: unknown) => (key in data ? data[key] : fallback),
        set: (key: string, value: unknown) => { data[key] = value; },
        delete: (key: string) => { delete data[key]; },
        has: (key: string) => key in data,
    };
};

describe('LEGACY_THEME_TO_PALETTE', () => {
    it('maps every legacy uiTheme, and dark-glass is the one that carried glass', () => {
        expect(LEGACY_THEME_TO_PALETTE['classic']).toEqual({ palette: 'electric-blue', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['modern']).toEqual({ palette: 'electric-blue', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['matte']).toEqual({ palette: 'refined-cyan', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['crt']).toEqual({ palette: 'emerald-mint', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['kinetic']).toEqual({ palette: 'amber-warm', glass: false });
        expect(LEGACY_THEME_TO_PALETTE['dark-glass']).toEqual({ palette: 'electric-blue', glass: true });
    });
});

describe('migrateGlassSetting', () => {
    it('maps a legacy uiTheme to a palette and the glass boolean', () => {
        const store = makeStore({ uiTheme: 'dark-glass' });
        migrateGlassSetting(store);
        expect(store.data.colorPalette).toBe('electric-blue');
        expect(store.data.glass).toBe(true);
        expect(store.data.uiTheme).toBeUndefined();
    });

    it('drops the dead companion keys alongside uiTheme', () => {
        const store = makeStore({
            uiTheme: 'kinetic',
            githubWebTheme: 'x',
            kineticFontStyle: 'y',
            kineticThemeVariant: 'z',
            dashboardLayout: 'w',
        });
        migrateGlassSetting(store);
        for (const key of ['uiTheme', 'githubWebTheme', 'kineticFontStyle', 'kineticThemeVariant', 'dashboardLayout']) {
            expect(store.data[key], key).toBeUndefined();
        }
    });

    // The reason the collapse cannot sit inside the `if (legacyUiTheme)` guard it
    // used to share: most users have no uiTheme left but do have the three
    // booleans, so a guarded migration would silently skip every one of them.
    it('collapses the booleans with no uiTheme present', () => {
        const store = makeStore({ glassSurfaces: true, glassmorphic: false, axiDesign: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
        expect(store.data.glassSurfaces).toBeUndefined();
        expect(store.data.glassmorphic).toBeUndefined();
        expect(store.data.axiDesign).toBeUndefined();
    });

    it('folds glassmorphic alone into glass', () => {
        const store = makeStore({ glassmorphic: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
    });

    it('leaves glass off when neither glass boolean was set', () => {
        const store = makeStore({ axiDesign: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(false);
    });

    // Review Focus 1: glassSurfaces/glassmorphic are deleted by the first run, so
    // re-deriving on every launch would read `undefined || undefined` and switch a
    // user's glass back off for good.
    it('does not clobber an existing glass value on a second launch', () => {
        const store = makeStore({ glassSurfaces: true });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(true);
    });

    it('does not clobber a user who has since turned glass off', () => {
        const store = makeStore({ glass: false });
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(false);
    });

    it('is a no-op on a fresh store', () => {
        const store = makeStore({});
        migrateGlassSetting(store);
        expect(store.data.glass).toBe(false);
        expect(Object.keys(store.data)).toEqual(['glass']);
    });
});

// Review Focus 2: settings *import* reads a plain object, not the store, and its
// uiTheme guard would skip a file exported by the version that shipped the three
// booleans — which carries them and no uiTheme. Same collapse, same module.
describe('collapseGlassKeys', () => {
    it('collapses the booleans on an imported settings object', () => {
        const settings: Record<string, any> = { colorPalette: 'rose-pink', glassSurfaces: true, axiDesign: true };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(true);
        expect(settings.glassSurfaces).toBeUndefined();
        expect(settings.axiDesign).toBeUndefined();
        expect(settings.colorPalette).toBe('rose-pink');
    });

    it('folds glassmorphic alone into glass', () => {
        const settings: Record<string, any> = { glassmorphic: true };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(true);
    });

    it('respects a glass key the file already carries', () => {
        const settings: Record<string, any> = { glass: false, glassSurfaces: true };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(false);
    });

    it('writes glass: false for a file that carries neither', () => {
        const settings: Record<string, any> = { colorPalette: 'slate-silver' };
        collapseGlassKeys(settings);
        expect(settings.glass).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/settingsMigration.test.ts`

Expected: FAIL — `Failed to resolve import "../glassSettingMigration"`.

- [ ] **Step 3: Write the migration module**

Create `src/main/glassSettingMigration.ts`:

```ts
import { LEGACY_THEME_TO_PALETTE } from '../shared/webThemes';

/** The slice of electron-store's API this migration needs. */
export interface GlassMigrationStore {
    get(key: string, fallback?: unknown): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
    has(key: string): boolean;
}

/**
 * Collapses the three appearance booleans into one `glass`, and finishes the
 * older `uiTheme` migration if it is still pending.
 *
 * Runs unconditionally on every launch, NOT inside a `uiTheme` guard: most
 * existing users have no `uiTheme` left but do have `glassSurfaces` /
 * `glassmorphic` / `axiDesign`, and a guarded migration would silently skip
 * every one of them.
 *
 * Because it runs every launch and deletes its own inputs, it must only write
 * `glass` when the key is absent. Re-deriving would read `undefined || undefined`
 * on the second launch and switch a user's glass back off permanently.
 *
 * `glassmorphic` (Lillifox Mode) folding into `glass` is a deliberate visible
 * change: it was an aurora-background variant of glass with rounded cards, and
 * it becomes upstream glass. That is the intended consequence of "one toggle",
 * not a claim of visual equivalence.
 */
export function migrateGlassSetting(store: GlassMigrationStore): void {
    const legacyUiTheme = store.get('uiTheme') as string | undefined;
    if (legacyUiTheme) {
        const mapping = LEGACY_THEME_TO_PALETTE[legacyUiTheme] ?? { palette: 'electric-blue', glass: false };
        store.set('colorPalette', mapping.palette);
        if (mapping.glass) store.set('glassSurfaces', true);
        store.delete('uiTheme');
        store.delete('githubWebTheme');
        store.delete('kineticFontStyle');
        store.delete('kineticThemeVariant');
        store.delete('dashboardLayout');
    }

    if (!store.has('glass')) {
        const glassSurfaces = store.get('glassSurfaces', false) === true;
        const glassmorphic = store.get('glassmorphic', false) === true;
        store.set('glass', glassSurfaces || glassmorphic);
    }

    store.delete('glassSurfaces');
    store.delete('glassmorphic');
    store.delete('axiDesign');
}

/**
 * The same collapse for a plain settings object, used by the settings-import
 * handler. Kept here beside `migrateGlassSetting` so the two cannot drift: an
 * imported file and a live store carry the same keys and deserve the same answer.
 *
 * Must be called OUTSIDE the import handler's `uiTheme` guard. A settings file
 * exported by the version that shipped the three booleans carries them and no
 * `uiTheme`, so a guarded collapse would land the import with no `glass` key at
 * all and silently switch the setting off.
 */
export function collapseGlassKeys(settings: Record<string, any>): void {
    if (typeof settings.glass !== 'boolean') {
        settings.glass = settings.glassSurfaces === true || settings.glassmorphic === true;
    }
    delete settings.glassSurfaces;
    delete settings.glassmorphic;
    delete settings.axiDesign;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/settingsMigration.test.ts`

Expected: PASS, 13 tests (9 for `migrateGlassSetting` and the legacy table, 4 for `collapseGlassKeys`).

- [ ] **Step 5: Wire the migration into the main process**

In `src/main/index.ts`, replace lines 226-239:

```ts
// ─── Settings migration: legacy UiTheme → colorPalette + glassSurfaces ────────
{
    const legacyUiTheme = store.get('uiTheme') as string | undefined;
    if (legacyUiTheme) {
        const mapping = LEGACY_THEME_TO_PALETTE[legacyUiTheme] ?? { palette: 'electric-blue', glass: false };
        store.set('colorPalette', mapping.palette);
        store.set('glassSurfaces', mapping.glass);
        store.delete('uiTheme');
        store.delete('githubWebTheme');
        store.delete('kineticFontStyle');
        store.delete('kineticThemeVariant');
        store.delete('dashboardLayout');
    }
}
```

with:

```ts
// ─── Settings migration: legacy appearance keys → colorPalette + glass ────────
migrateGlassSetting(store);
```

Add the import near the other `src/main` imports at the top of the file:

```ts
import { migrateGlassSetting } from './glassSettingMigration';
```

Then remove the now-unused `LEGACY_THEME_TO_PALETTE` import from `src/main/index.ts` if nothing else in that file uses it. Check with:

```bash
grep -n 'LEGACY_THEME_TO_PALETTE' src/main/index.ts
```

If the only hit is the import line, delete that name from the import.

- [ ] **Step 6: Fix the settings-import path (Review Focus 2)**

In `src/main/handlers/settingsHandlers.ts`, replace lines 307-317:

```ts
            if (importedSettings.uiTheme && !importedSettings.colorPalette) {
                const mapping = LEGACY_THEME_TO_PALETTE[importedSettings.uiTheme] ?? { palette: 'electric-blue', glass: false };
                importedSettings.colorPalette = mapping.palette;
                importedSettings.glassSurfaces = mapping.glass;
                delete importedSettings.uiTheme;
                delete importedSettings.githubWebTheme;
                delete importedSettings.kineticFontStyle;
                delete importedSettings.kineticThemeVariant;
                delete importedSettings.dashboardLayout;
            }
```

with:

```ts
            if (importedSettings.uiTheme && !importedSettings.colorPalette) {
                const mapping = LEGACY_THEME_TO_PALETTE[importedSettings.uiTheme] ?? { palette: 'electric-blue', glass: false };
                importedSettings.colorPalette = mapping.palette;
                if (mapping.glass) importedSettings.glassSurfaces = true;
                delete importedSettings.uiTheme;
                delete importedSettings.githubWebTheme;
                delete importedSettings.kineticFontStyle;
                delete importedSettings.kineticThemeVariant;
                delete importedSettings.dashboardLayout;
            }
            // Outside the uiTheme guard on purpose: a settings file exported by
            // the version that shipped the three booleans carries them and no
            // uiTheme, so a guarded collapse would land the import with no glass
            // key at all and silently switch the setting off.
            collapseGlassKeys(importedSettings);
```

Add the import to `src/main/handlers/settingsHandlers.ts`, beside its other `src/main` imports:

```ts
import { collapseGlassKeys } from '../glassSettingMigration';
```

- [ ] **Step 7: Collapse the types**

In `src/renderer/global.d.ts`, replace lines 299-303:

```ts
export const DEFAULT_GLASS_SURFACES = false;
export const DEFAULT_GLASSMORPHIC = false;
/* The axi design language: flat, outlined, hard offset blocks. Off by default
   while it lives alongside the existing look. */
export const DEFAULT_AXI_DESIGN = false;
```

with:

```ts
/* The axi design language is unconditional now, so there is no boolean for it.
   Glass is the one appearance choice beyond the accent: upstream's
   [data-axi-theme="glass"] token override, off by default. */
export const DEFAULT_GLASS = false;
```

In the same file, in **both** settings interfaces, replace:

```ts
        glassSurfaces?: boolean;
        glassmorphic?: boolean;
        axiDesign?: boolean;
```

with:

```ts
        glass?: boolean;
```

Run `grep -n 'glassSurfaces\|glassmorphic\|axiDesign' src/renderer/global.d.ts` and confirm it prints nothing.

- [ ] **Step 8: Collapse `useSettings`**

In `src/renderer/app/hooks/useSettings.ts`:

Line 4 — change the import list, replacing `DEFAULT_AXI_DESIGN, DEFAULT_GLASS_SURFACES, DEFAULT_GLASSMORPHIC,` with `DEFAULT_GLASS,`.

Add the applier import beside the other shared imports:

```ts
import { applyAxiTheme } from '../../../shared/applyAxiTheme';
```

Lines 28-30 — replace:

```ts
    const [glassSurfaces, setGlassSurfaces] = useState(DEFAULT_GLASS_SURFACES);
    const [glassmorphic, setGlassmorphic] = useState(DEFAULT_GLASSMORPHIC);
    const [axiDesign, setAxiDesign] = useState(DEFAULT_AXI_DESIGN);
```

with:

```ts
    const [glass, setGlass] = useState(DEFAULT_GLASS);
```

Lines 99-107 — replace:

```ts
            if (typeof settings.glassSurfaces === 'boolean') {
                setGlassSurfaces(settings.glassSurfaces);
            }
            if (typeof settings.glassmorphic === 'boolean') {
                setGlassmorphic(settings.glassmorphic);
            }
            if (typeof settings.axiDesign === 'boolean') {
                setAxiDesign(settings.axiDesign);
            }
```

with:

```ts
            if (typeof settings.glass === 'boolean') {
                setGlass(settings.glass);
            }
```

Lines 169-186 — replace the whole effect:

```ts
    useEffect(() => {
        const body = document.body;
        for (const id of Object.keys(PALETTES)) body.classList.remove(`palette-${id}`);
        if (colorPalette !== 'electric-blue') {
            body.classList.add(`palette-${colorPalette}`);
        }
        // Glass and axi are opposite claims about what a surface is: glass is
        // translucent and lit from behind, axi is opaque with a hard block. The
        // glass rules are written with !important (they have to be, to beat the
        // inline styles they override), so with both on the glass wins every
        // contested property and the result is neither language. axi-design
        // suppresses them rather than trying to out-specify them.
        body.classList.toggle('glass-surfaces', glassSurfaces && !axiDesign);
        body.classList.toggle('glassmorphic', glassmorphic && !axiDesign);
        body.classList.toggle('axi-design', axiDesign);
        body.classList.toggle('particles-disabled', !particlesEnabled);
    }, [colorPalette, glassSurfaces, glassmorphic, axiDesign, particlesEnabled]);
```

with:

```ts
    useEffect(() => {
        // Two data attributes on <html> are the whole appearance API — see
        // applyAxiTheme for why the document element rather than the body.
        applyAxiTheme(document.documentElement, { accent: colorPalette, glass });
        // TRANSITIONAL, removed in the CSS switchover: axi is unconditional from
        // here on, but the stylesheets are still keyed on this class. Glass is
        // inert for now, which is what it already was under axi.
        document.body.classList.add('axi-design');
        // Not part of the design language — app behaviour, so it stays a body class.
        document.body.classList.toggle('particles-disabled', !particlesEnabled);
    }, [colorPalette, glass, particlesEnabled]);
```

Lines 200-202 — replace the three returned pairs:

```ts
        glassSurfaces, setGlassSurfaces,
        glassmorphic, setGlassmorphic,
        axiDesign, setAxiDesign,
```

with:

```ts
        glass, setGlass,
```

Line 217 — in the `useMemo` dependency array, replace `colorPalette, glassSurfaces, glassmorphic, axiDesign, particlesEnabled,` with `colorPalette, glass, particlesEnabled,`.

Finally, check whether `PALETTES` is still used in this file: `grep -n 'PALETTES' src/renderer/app/hooks/useSettings.ts`. If the only hit is the import, remove that name from the import.

- [ ] **Step 9: Collapse `App.tsx`**

In `src/renderer/App.tsx`:

Lines 81-83 — replace:

```ts
        glassSurfaces, setGlassSurfaces,
        glassmorphic, setGlassmorphic,
        axiDesign, setAxiDesign,
```

with:

```ts
        glass, setGlass,
```

Line 1308 — in that long object literal, replace the substring `colorPalette, setColorPalette, glassSurfaces, setGlassSurfaces, glassmorphic, setGlassmorphic, axiDesign, setAxiDesign, particlesEnabled, setParticlesEnabled,` with `colorPalette, setColorPalette, glass, setGlass, particlesEnabled, setParticlesEnabled,`.

Line 1316 — in the dependency array, replace `colorPalette, glassSurfaces, glassmorphic, axiDesign, particlesEnabled,` with `colorPalette, glass, particlesEnabled,`.

- [ ] **Step 10: Write the failing SettingsView test**

In `src/renderer/__tests__/SettingsView.test.tsx`, replace the whole `describe('Appearance section', …)` block (lines 344-405) with:

```tsx
    describe('Appearance section', () => {
        it('activates the Amber Warm palette button when clicked', async () => {
            renderSettings();
            selectSettingsCategory('Application');
            await screen.findByRole('heading', { name: 'Appearance' });

            const amberBtn = screen.getByRole('button', { name: 'Amber Warm' });
            fireEvent.click(amberBtn);

            expect(amberBtn.className).toMatch(/white\/40/);
        });

        it('shows exactly one surface toggle, labelled Glass', async () => {
            renderSettings();
            selectSettingsCategory('Application');
            await screen.findByRole('heading', { name: 'Appearance' });

            expect(screen.getByText('Glass')).toBeInTheDocument();
            expect(screen.queryByText('Glass Surfaces')).toBeNull();
            expect(screen.queryByText('Lillifox Mode')).toBeNull();
            expect(screen.queryByText('Axi Design')).toBeNull();
        });

        it('fires onGlassSaved after toggling glass', async () => {
            const { mock, callbacks } = renderSettings();
            await waitForLoad(mock);
            callbacks.onGlassSaved.mockClear();
            selectSettingsCategory('Application');

            fireEvent.click(screen.getByText('Glass'));

            await waitFor(() => {
                expect(callbacks.onGlassSaved).toHaveBeenCalledWith(true);
            }, { timeout: 1000 });
        });

        // paletteLocked is gone: it existed because Lillifox Mode painted its own
        // accents and pinned the picker. Nothing pins it now.
        it('never disables the palette grid', async () => {
            const { mock } = renderSettings({}, { glass: true });
            await waitForLoad(mock);
            selectSettingsCategory('Application');
            await screen.findByRole('heading', { name: 'Appearance' });

            expect(await screen.findByRole('button', { name: 'Amber Warm' })).not.toBeDisabled();
            expect(screen.queryByText('(disabled in Lillifox Mode)')).toBeNull();
            expect(screen.queryByText('(disabled in Axi Design)')).toBeNull();
        });
    });
```

In the same file's `renderSettings` helper (line 66), replace `onGlassSurfacesSaved: vi.fn(),` with:

```tsx
        onGlassSaved: vi.fn(),
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/SettingsView.test.tsx`

Expected: FAIL — `screen.getByText('Glass')` finds nothing (the rendered labels are still "Glass Surfaces", "Lillifox Mode", "Axi Design"), and `callbacks.onGlassSaved` is not a recognised prop.

- [ ] **Step 12: Collapse `SettingsView.tsx`**

Lines 80-82 — replace the three search-index rows:

```ts
    { key: 'glassSurfaces', label: 'Glass Surfaces', description: 'Enable frosted-glass card surfaces.', section: 'Application' },
    { key: 'glassmorphic', label: 'Lillifox Mode', description: 'Aurora background with rounded glass cards (legacy look).', section: 'Application' },
    { key: 'axiDesign', label: 'Axi Design', description: 'Flat, outlined surfaces with hard offset blocks and a left rail.', section: 'Application' },
```

with:

```ts
    { key: 'glass', label: 'Glass', description: 'Translucent, backlit surfaces instead of flat opaque ones.', section: 'Application' },
```

Lines 118-120 — replace:

```ts
    onGlassSurfacesSaved?: (glass: boolean) => void;
    onGlassmorphicSaved?: (glass: boolean) => void;
    onAxiDesignSaved?: (enabled: boolean) => void;
```

with:

```ts
    onGlassSaved?: (glass: boolean) => void;
```

Lines 131-133 — replace:

```ts
    glassSurfaces?: boolean;
    glassmorphic?: boolean;
    axiDesign?: boolean;
```

with:

```ts
    glass?: boolean;
```

Line 234 (the destructuring signature) — replace `onGlassSurfacesSaved, onGlassmorphicSaved, onAxiDesignSaved,` with `onGlassSaved,` and replace `glassSurfaces: glassSurfacesProp, glassmorphic: glassmorphicProp, axiDesign: axiDesignProp,` with `glass: glassProp,`.

Lines 248-252 — replace:

```ts
    const [glassSurfaces, setGlassSurfaces] = useState(glassSurfacesProp ?? false);
    const [glassmorphic, setGlassmorphic] = useState(glassmorphicProp ?? false);
    const [axiDesign, setAxiDesign] = useState(axiDesignProp ?? false);
    // Mirrors useSettings: axi and glass are mutually exclusive on the body, and axi wins.
    const paletteLocked = glassmorphic && !axiDesign;
```

with:

```ts
    const [glass, setGlass] = useState(glassProp ?? false);
```

Lines 573-580 — replace:

```ts
        if (typeof settings.glassSurfaces === 'boolean') {
            setGlassSurfaces(settings.glassSurfaces);
        }
        if (typeof settings.axiDesign === 'boolean') {
            setAxiDesign(settings.axiDesign);
        }
        if (typeof settings.glassmorphic === 'boolean') {
            setGlassmorphic(settings.glassmorphic);
        }
```

with:

```ts
        if (typeof settings.glass === 'boolean') {
            setGlass(settings.glass);
        }
```

While you are in this block, fix the same prototype-chain guard three lines above it. Replace:

```ts
        if (settings.colorPalette && settings.colorPalette in PALETTES) {
```

with:

```ts
        // hasOwnProperty, not `in`: `in` walks the prototype chain, so a settings
        // blob carrying colorPalette: "constructor" would be accepted as an accent id.
        if (settings.colorPalette && Object.prototype.hasOwnProperty.call(PALETTES, settings.colorPalette)) {
```

Lines 857-859, 1030-1032 and 1084-1086 — in each of those three places, replace the three lines

```ts
        glassSurfaces,
        glassmorphic,
        axiDesign,
```

(and the more-indented `            glassSurfaces,` / `            glassmorphic,` / `            axiDesign,` variant at 1030-1032) with a single `glass,` at the same indentation.

Lines 1054-1056 — replace:

```ts
        onGlassSurfacesSaved?.(glassSurfaces);
        onGlassmorphicSaved?.(glassmorphic);
        onAxiDesignSaved?.(axiDesign);
```

with:

```ts
        onGlassSaved?.(glass);
```

Lines 2986-3040 — replace the comment, the palette-grid header, the grid's lock plumbing and the three surface toggles. Replace:

```tsx
                        {/* Lillifox paints its own accents, so the picker is dead under it — but
                            axi suppresses Lillifox (useSettings refuses both classes at once), and
                            the picker drives axi. So the grid is only dead when Lillifox is the one
                            actually applied. */}
                        <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 mb-2">
                            Color Palette {paletteLocked ? <span className="ml-2 normal-case tracking-normal text-gray-500">(disabled in Lillifox Mode)</span> : null}
                        </div>
                        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${paletteLocked ? 'opacity-40 pointer-events-none' : ''}`} aria-disabled={paletteLocked}>
```

with:

```tsx
                        {/* The picker is never locked now. It used to be, because Lillifox
                            Mode painted its own accents; that mode is gone, and the accent
                            drives the language in both surface treatments. */}
                        <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500 mb-2">
                            Color Palette
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
```

Then remove the `disabled={paletteLocked}` line from the palette `<button>`, and replace the three surface toggles:

```tsx
                            <Toggle
                                enabled={glassSurfaces}
                                onChange={(v) => { setGlassSurfaces(v); onGlassSurfacesSaved?.(v); }}
                                label="Glass Surfaces"
                                description="Enable frosted-glass card backgrounds with backdrop blur"
                                disabled={axiDesign}
                                disabledNote="(disabled in Axi Design)"
                            />
                            <Toggle
                                enabled={glassmorphic}
                                onChange={(v) => { setGlassmorphic(v); onGlassmorphicSaved?.(v); }}
                                label="Lillifox Mode"
                                description="Aurora background, rounded translucent cards — the original AxiBridge look"
                                disabled={axiDesign}
                                disabledNote="(disabled in Axi Design)"
                            />
                            <Toggle
                                enabled={axiDesign}
                                onChange={(v) => { setAxiDesign(v); onAxiDesignSaved?.(v); }}
                                label="Axi Design"
                                description="Flat outlined surfaces, hard offset blocks, and a left rail instead of the top tab strip"
                            />
```

with:

```tsx
                            <Toggle
                                enabled={glass}
                                onChange={(v) => { setGlass(v); onGlassSaved?.(v); }}
                                label="Glass"
                                description="Translucent, backlit surfaces and rounded corners instead of flat opaque ones"
                            />
```

- [ ] **Step 13: Update the SettingsView call site in App**

Run `grep -n 'onGlassSurfacesSaved\|onGlassmorphicSaved\|onAxiDesignSaved\|glassSurfaces=\|glassmorphic=\|axiDesign=' src/renderer/app/AppLayout.tsx src/renderer/App.tsx` and replace each prop pass-through with the single `glass` / `onGlassSaved` pair, keeping the surrounding style:

```tsx
                onGlassSaved={setGlass}
                glass={glass}
```

- [ ] **Step 14: Run the tests**

Run:

```bash
npx vitest run src/main/__tests__/settingsMigration.test.ts src/renderer/__tests__/SettingsView.test.tsx
```

Expected: PASS.

- [ ] **Step 15: Confirm no stale references remain in TS/TSX**

Run:

```bash
grep -rn 'glassSurfaces\|glassmorphic\|axiDesign\|DEFAULT_AXI_DESIGN\|DEFAULT_GLASS_SURFACES\|DEFAULT_GLASSMORPHIC\|paletteLocked' \
  src/renderer src/main --include='*.ts' --include='*.tsx'
```

Expected: only the deliberate compatibility hits — `glassSurfaces` inside `src/main/glassSettingMigration.ts`, and `glassSurfaces`/`glassmorphic` inside `src/main/handlers/settingsHandlers.ts`'s import path. Anything in `src/web` is Task 6's; anything else is a miss to fix here.

- [ ] **Step 16: Validate**

Run: `npm run validate`

Expected: PASS.

- [ ] **Step 17: Commit**

```bash
git add -A src/main src/renderer
git commit -m "$(cat <<'EOF'
feat(settings): collapse glassSurfaces/glassmorphic/axiDesign into one glass

Settings now carry a single `glass` boolean, applied through applyAxiTheme.
The store migration runs unconditionally rather than inside the uiTheme guard,
because most users have no uiTheme left but do have the three booleans — and it
only writes `glass` when absent, so the second launch cannot re-derive from its
own deleted inputs and switch glass back off.

Settings import gets the same treatment outside its uiTheme guard. Lillifox Mode
folds into glass, which is a deliberate visible change.

useSettings keeps one transitional `body.axi-design` line until the CSS
switchover removes it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The CSS switchover

Load upstream, flatten the remap layer, invert the accent direction, re-express the glass floating surfaces, and delete the legacy theme layer. This is the task the spec called its highest-risk edit, and verification has made it simpler than the spec assumed — see Step 5.

**Files:**
- Modify: `src/renderer/index.css` (imports at the head; delete `:109-211` and the 123 glass selectors; the `html, body` background; add the glass overrides)
- Modify: `src/renderer/axi-design.css` (drop the `tokens.css` import, drop the 667 `body.axi-design ` prefixes, invert the accent)
- Modify: `src/renderer/app/hooks/useSettings.ts` (drop the transitional body class)
- Modify: `index.html`, `web/index.html`, `src/web/viewerMain.tsx` (seed `data-axi-accent`)
- Create: `src/renderer/__tests__/themeCssContract.test.ts`

**Interfaces:**
- Consumes: the upstream stylesheets from Task 1; the `bridge-*` class names from Task 3; `data-axi-accent` / `data-axi-theme` set by Task 4.
- Produces: `--brand-primary`, `--brand-secondary`, `--brand-gradient`, `--on-brand`, `--accent-bg`, `--accent-bg-strong`, `--accent-border`, `--glow-primary`, `--glow-secondary` all resolving from `--axi-accent`, and the remap layer scoped as `[data-axi-accent] body`. Task 6 relies on both: it sets `--axi-accent` **and** the brand variables inline on `<body>` for a share link's map accent, because a custom property declared at `:root` computes once at `<html>` and is inherited as a value — overriding `--axi-accent` lower down does not recompute it.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/themeCssContract.test.ts`:

```ts
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

    // --axi-rail-w is the third local token, but it is only ever READ, with an
    // inline fallback and no declaration anywhere — so it is asserted as a usage.
    // It is a custom property, not a component class, which is why Task 3's
    // bridge-* rename deliberately leaves it alone.
    it('reads the rail width token under its axi name', () => {
        expect(css).toContain('var(--axi-rail-w, 208px)');
        expect(css).not.toContain('--bridge-rail-w');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/themeCssContract.test.ts`

Expected: FAIL on most assertions — no upstream imports, `body.palette-*` present, 123 glass selectors present, 667 `body.axi-design` present.

- [ ] **Step 3: Add the upstream imports**

In `src/renderer/index.css`, replace lines 1-4:

```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";
```

with:

```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

/* The design language, after Tailwind's preflight so its base reset wins.
   axi.css carries the token block in its own :root as well as the 46 component
   families, which is why tokens.css is not imported separately any more.
   accents.css must follow axi.css: both land on <html> with equal specificity,
   so source order is the only thing that decides which one sets --axi-accent.
   The components are loaded but not yet adopted — that is sub-projects 2-5. */
@import '@axiapps/axi-design/axi.css';
@import '@axiapps/axi-design/accents.css';
@import '@axiapps/axi-design/themes/glass.css';
```

- [ ] **Step 4: Flatten `axi-design.css`**

Drop the `tokens.css` import (line 27) and every `body.axi-design ` prefix. Run:

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
sed -i -e "/@import '@axiapps\/axi-design\/tokens.css';/d" \
       -e 's/body\.axi-design/[data-axi-accent] body/g' \
       src/renderer/axi-design.css
```

There is no hand-copied token block left to delete alongside it: the spec cites one at `axi-design.css:29`, but that line is already the opening of the `body.axi-design` rule — the hand-copy was replaced by the `tokens.css` import in an earlier change, and the file's own header comment records it. Deleting the import is the whole job.

**`[data-axi-accent] body`, and the choice matters.** The replacement has to preserve specificity *exactly*, and the obvious candidates do not:

| Replacement | Specificity | Effect |
|---|---|---|
| `body.axi-design` (today) | (0,1,1) | — |
| `:where(body)` | (0,0,0) | loses one class; flips every contest this file currently wins by source order against a 2-class rule in `index.css` |
| `body` | (0,0,1) | same problem |
| `[data-axi-accent] body` | (0,1,1) | **identical**; every relationship inside and outside the file is unchanged |

`index.css` still holds rules like `body.web-report .stats-view .max-h-80` and `body:not(.web-report) .modal-pane .dense-table` that contest classes this file styles. Dropping a class from 667 selectors at once would silently re-resolve an unknown number of those contests, and no test in this repo can see it. The attribute form is also honest rather than a trick: `data-axi-accent` is exactly "the axi language is applied here", which is what `axi-design` meant.

All 667 occurrences are the bare string with no compound class attached, so one global substitution is sufficient — verified with `grep -oE 'body\.axi-design[^ ,{]*' | sort -u`, which yields only `body.axi-design`.

Verify:

```bash
grep -c 'body\.axi-design' src/renderer/axi-design.css || echo "0 — clean"
grep -c '\[data-axi-accent\] body' src/renderer/axi-design.css
```

Expected: `0 — clean`, then `667`.

- [ ] **Step 5: Invert the accent direction**

Verification changed this step's shape from what the spec assumed. `axi-design.css` **already** remaps every downstream accent variable — `--brand-secondary` and `--brand-gradient` (`:102-103`), `--accent-bg-strong` (`:113`), `--accent-bg` (`:125`), `--accent-border` (`:126`), `--glow-primary` and `--glow-secondary` (`:130-131`) — and it loads after `index.css`. With axi now unconditional, **every declaration in the ten `body.palette-*` blocks is already overridden**. So those blocks are a pure deletion, not a port: there is nothing per-accent to re-key, and the only edit needed is the one declaration the spec named.

In `src/renderer/axi-design.css`, replace lines 33-39 (inside what is now the `:where(body)` token block):

```css
  /* The accent is the one token this language does not own. It reads whatever
     the colour picker set, so the ten palettes drive the language instead of
     being shut out by it; the gold the spec draws in is still reachable, as
     the Axi Gold palette. The fallback is only for a body that somehow carries
     this class without index.css beneath it. */
  --axi-accent: var(--brand-primary, #ffc53d);
```

with:

```css
  /* The accent direction is inverted from what it used to be here. It used to
     read --brand-primary, which lived in index.css's body.palette-* blocks; the
     accent picker now sets data-axi-accent on <html>, upstream's accents.css
     maps that to --axi-accent, and the app's brand variables derive from it.
     Everything downstream of the accent is already remapped below, which is why
     deleting those palette blocks cost nothing: all eight of their declarations
     were being overridden here anyway.
     Declared at :root, with one consequence worth knowing: a custom property
     computes where it is declared and is inherited as a value, so overriding
     --axi-accent further down does NOT recompute this. That is exactly why
     MAP_ACCENT_CSS_VARS carries both --axi-accent (for the token consumers) and
     --brand-primary (for this one) rather than relying on the derivation. */
  --brand-primary: var(--axi-accent);
```

That declaration must sit in a `:root` rule, not in the `:where(body)` block, so the map-accent override in Task 6 works. Move it: add immediately after the `@import` lines at the head of `axi-design.css`:

```css
/* The accent enters the app here. Upstream accents.css sets --axi-accent from
   [data-axi-accent] on <html>; every brand variable in AxiBridge derives from
   it, so the picker drives the whole language including upstream's own
   components.
   A share link's map accent cannot ride this derivation: a custom property
   computes at its declaration site and inherits as a value, so setting
   --axi-accent on <body> does not recompute --brand-primary. That is why
   MAP_ACCENT_CSS_VARS sets both. */
:root {
  --brand-primary: var(--axi-accent);
}
```

and delete the `--brand-primary` line from the `:where(body)` block.

- [ ] **Step 6: Delete the legacy palette blocks**

Delete `src/renderer/index.css` lines 108-222 — the `/* Palette overrides */` comment and all ten `body.palette-*` blocks (`refined-cyan`, `amber-warm`, `emerald-mint`, `rose-pink`, `violet-purple`, `crimson-red`, `slate-silver`, `teal-ocean`, `axi-gold`, `gold-bronze`), including the three-line comment above `body.palette-axi-gold`.

Leave the `:root` block above them untouched: its electric-blue values are now the fallback that applies when `data-axi-accent="electric-blue"` matches no override, and `--brand-primary` there is superseded by `axi-design.css`'s `:root` rule, which loads later.

Verify: `grep -n 'body.palette-' src/renderer/index.css` prints nothing.

- [ ] **Step 7: Delete the homegrown glass layer**

Delete every rule in `src/renderer/index.css` whose selector mentions `glass-surfaces` or `glassmorphic` — 123 selector occurrences, across the blocks at roughly `:223-570`, `:1785-1792`, and the `body.bulk-uploading.glassmorphic` group. Delete whole rules, not just selectors, and delete the section comments that only describe them (`/* Web report glass mode */`, `/* Bulk-upload performance fallback */`, `/* ── Glass mode transition smoothing ── */`).

Also delete the nine `body:not(.axi-design)` rules at `:1856-1873`. Each was the non-axi branch of a Tailwind-literal remap; with axi unconditional there is no non-axi branch.

Do **not** delete: `.app-sticky-bar { background: var(--bg-card); }` (unconditional), `.slice-mini option { background-color: #1b2030; }` (already unconditional), or the `.glass-card` class itself — `reportApp.tsx` still emits it and Task 6 retargets it.

Verify:

```bash
grep -c 'glass-surfaces\|glassmorphic' src/renderer/index.css || echo "0 — clean"
grep -c 'body:not(.axi-design)' src/renderer/index.css || echo "0 — clean"
```

Expected: `0 — clean` twice.

- [ ] **Step 8: Commit the structural half**

```bash
git add src/renderer/index.css src/renderer/axi-design.css
git commit -m "$(cat <<'EOF'
refactor(css): load upstream axi-design and delete the legacy theme layer

index.css imports axi.css, accents.css and themes/glass.css after Tailwind's
preflight. axi-design.css drops its tokens.css import and all 667
body.axi-design prefixes, rewritten as :where(body) so the file's internal
precedence is unchanged.

The accent direction inverts: --brand-primary now derives from --axi-accent at
:root instead of the reverse. The ten body.palette-* blocks are a pure deletion
— axi-design.css already overrode every one of their declarations, so with axi
unconditional there was nothing per-accent left to port.

Glass floating surfaces are re-expressed in the next commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Re-express the opaque floating surfaces**

Upstream glass has exactly the property the deleted overrides existed for: `--axi-surface` is an alpha gradient and `--axi-surface-filter: blur(18px)` is a no-op on Linux. Append this block to `src/renderer/index.css`, at the end of the file so it wins on source order:

```css
/* ---------------------------------------------------------------------------
   FLOATING SURFACES UNDER GLASS

   Every rule here is a migration of one that used to live under
   `body.glass-surfaces` / `body.glassmorphic`, not a new decision. The reason
   is unchanged and worth restating because it is not obvious from the token
   names: upstream glass makes --axi-surface an alpha gradient and puts the
   blur in --axi-surface-filter, and backdrop-filter is a no-op on Linux. A
   floating surface with content moving behind it therefore reads as
   see-through rather than as frosted, so it gets an opaque fill of its own.

   The rule: anything the page scrolls underneath is opaque. Anything you read
   the page around keeps the tint. */

/* Dropdowns, popovers and tooltips — the page moves behind all of them. */
[data-axi-theme="glass"] .app-dropdown,
[data-axi-theme="glass"] .stats-popover {
  background: rgba(15, 18, 25, 0.97) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Sticky action bars (report-history bulk delete): cards scroll underneath. */
[data-axi-theme="glass"] .app-sticky-bar {
  background: rgba(15, 18, 25, 0.97) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Modals sit over the whole app; the scrim darkens it but does not hide it. */
[data-axi-theme="glass"] .app-modal-card {
  background: rgba(15, 18, 25, 0.92) !important;
}

/* The search palette and the stats nav panel both float over scrolling content. */
[data-axi-theme="glass"] .bridge-search-panel,
[data-axi-theme="glass"] .stats-dashboard-nav-panel {
  background: rgba(15, 18, 25, 0.97) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Sticky table headers: rows scroll under them, and --bg-card is a glass tint,
   so the tint is layered over a solid dark base rather than used alone. */
[data-axi-theme="glass"] .stats-table thead th,
[data-axi-theme="glass"] .rollup-table thead th {
  background-color: #0c0f16;
  background-image: linear-gradient(var(--bg-card), var(--bg-card));
}

/* The glass light is painted by upstream as body's background-image, fixed. The
   app's own opaque layers sit on top of it, so under glass they step back to
   transparent and let it through. Not under the flat theme, where --axi-ground
   is the page and these layers are what draw it. */
[data-axi-theme="glass"] #root,
[data-axi-theme="glass"] .app-content {
  background: transparent !important;
}

[data-axi-theme="glass"] .app-shell,
[data-axi-theme="glass"] .min-h-screen {
  background-color: transparent;
}

/* Bulk upload turns the blurs off for frame rate. The opaque fills stay — they
   are legibility, not decoration.
   Two descendant steps rather than one compound selector: `data-axi-theme` is on
   <html> and `bulk-uploading` on <body>, so `body.bulk-uploading[data-axi-theme]`
   would ask one element to carry both and match nothing. */
[data-axi-theme="glass"] body.bulk-uploading .app-dropdown,
[data-axi-theme="glass"] body.bulk-uploading .app-sticky-bar,
[data-axi-theme="glass"] body.bulk-uploading .bridge-search-panel,
[data-axi-theme="glass"] body.bulk-uploading .stats-dashboard-nav-panel {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
```

- [ ] **Step 9b: Seed the attribute in both entry HTML files**

`[data-axi-accent] body` is the scope for the whole remap layer, and `applyAxiTheme`
sets that attribute from a React effect — so between first paint and mount the
language would not apply at all, showing a flash of unstyled content. (The old
`body.axi-design` class had the same defect; this is the cheap moment to fix it.)
Seed the default statically so the selector is true from the first byte, and let
the effect correct it to the user's actual accent.

In `index.html`, replace:

```html
<html lang="en">
```

with:

```html
<!-- Seeded so the axi layer ([data-axi-accent] body ... in axi-design.css) applies
     from first paint; applyAxiTheme corrects it to the saved accent on mount. -->
<html lang="en" data-axi-accent="electric-blue">
```

Make the identical change to `web/index.html:2`.

The share-link viewer needs it too, and has no HTML of ours — the Worker serves a
bare `<body>`. In `src/web/viewerMain.tsx`, beside the two existing
`classList.add('web-report')` calls, add:

```tsx
// The Worker's boot HTML has no <html> attributes of ours, so seed the accent
// scope before the style tag lands rather than waiting for ReportApp's effect.
if (!document.documentElement.hasAttribute('data-axi-accent')) {
    document.documentElement.setAttribute('data-axi-accent', 'electric-blue');
}
```

- [ ] **Step 10: Let body carry the ground**

In `src/renderer/index.css`, find the `html, body` rule (was `:579-585`) and remove its `background: transparent;` line, so it reads:

```css
html,
body {
    height: 100%;
    margin: 0;
    padding: 0;
}
```

That lets upstream's `body { background-color: var(--axi-ground); background-image: var(--axi-ground-image); background-attachment: fixed; }` stand. Under the flat theme `--axi-ground-image` is `none`, so nothing changes there; under glass it is the three radial lights, which the Step 9 transparency rules now let through.

- [ ] **Step 11: Remove the transitional body class**

In `src/renderer/app/hooks/useSettings.ts`, delete these three lines from the effect added in Task 4:

```ts
        // TRANSITIONAL, removed in the CSS switchover: axi is unconditional from
        // here on, but the stylesheets are still keyed on this class. Glass is
        // inert for now, which is what it already was under axi.
        document.body.classList.add('axi-design');
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/themeCssContract.test.ts`

Expected: PASS, 14 tests.

- [ ] **Step 13: Prove the stylesheets actually compile and carry upstream**

A `?inline` CSS import and an npm-scoped `@import` are two things Vite resolves differently from a plain `<link>`, and the share viewer uses the former. Build all three targets and grep the output.

Run:

```bash
npm run build:web
grep -l 'data-axi-theme' dist-web/assets/*.css && echo "web: glass theme present"
grep -l 'axi-btn' dist-web/assets/*.css && echo "web: components present"
```

Expected: both lines print.

Run:

```bash
npx vite build --config vite.viewer.config.ts
grep -c 'data-axi-theme' docs/view/viewer.js
grep -c 'axi-btn' docs/view/viewer.js
```

Expected: both counts greater than zero. If either is `0`, the `?inline` import in `src/web/viewerMain.tsx` did not resolve the npm `@import` — fix that before continuing, because the share-link viewer would ship with no design language at all.

- [ ] **Step 14: Run the full unit suite**

Run: `npx vitest run`

Expected: PASS except for `src/shared/__tests__/statsThemesContract.test.ts`, `src/web/__tests__/reportPalette.test.ts` and `src/web/__tests__/reportShareTheme.test.tsx`, which Tasks 6 and 7 own. Note any *other* failure and fix it here.

- [ ] **Step 15: Validate**

Run: `npm run validate`

Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add -A src/renderer
git commit -m "$(cat <<'EOF'
feat(theme): re-express the glass floating surfaces on upstream's theme

Migrates the opaque overrides that lived inside the deleted glass-surfaces /
glassmorphic selectors onto [data-axi-theme="glass"]: dropdowns, the sticky
action bar, modals, the search palette, the stats nav panel and sticky table
headers. Upstream glass has the same property that made them necessary —
--axi-surface is an alpha gradient and backdrop-filter is a no-op on Linux — so
dropping them was the most likely way to ship a visible regression.

Also lets body carry the ground so upstream's glass light (--axi-ground-image,
fixed) is not hidden by the app's own opaque #root/.app-content/.app-shell
layers, and drops the transitional body.axi-design class.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The web report and the publish path

**Files:**
- Modify: `src/web/paletteReader.ts` (whole file)
- Modify: `src/web/reportApp.tsx:369-371`, `:528-551`, `:973-983`, `:1034-1042`, `:1059-1065`, `:1076-1082`
- Modify: `src/shared/mapAccent.ts` (`MAP_ACCENT_CSS_VARS`)
- Modify: `src/main/handlers/githubHandlers.ts:961-976`, `:2166-2169`, `:2230-2237`, `:2432-2436`, `:2751-2754`, `:2755-2762`, `:2842-2846`
- Modify: `src/main/webReportParts.ts:26-27`
- Test: `src/web/__tests__/reportPalette.test.ts`
- Test: `src/web/__tests__/reportShareTheme.test.tsx`
- Test: `src/main/__tests__/webReportParts.test.ts` and its snapshot
- Test: `src/shared/__tests__/mapAccent.test.ts`

**Interfaces:**
- Consumes: `applyAxiTheme` (Task 2); `--brand-primary: var(--axi-accent)` at `:root` (Task 5).
- Produces:
  ```ts
  export function readPaletteFromReport(stats: any): { palette: ColorPalette; glass: boolean }
  ```
  and `buildWebReportPayload(reportMeta: any, sourceStats: any, colorPalette: string, glass: boolean)`.

- [ ] **Step 1: Write the failing reader test**

Replace the whole of `src/web/__tests__/reportPalette.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/web/__tests__/reportPalette.test.ts`

Expected: FAIL — the returned objects still carry `glassmorphic` and `axi`, and the legacy branches still resolve.

- [ ] **Step 3: Rewrite the reader**

Replace the whole of `src/web/paletteReader.ts` with:

```ts
import { PALETTES, type ColorPalette, DEFAULT_PALETTE_ID } from '../shared/webThemes';

/**
 * Reads the accent and the surface treatment a report was published with.
 *
 * Both are the publisher's own choice, baked into `report.json` at publish time:
 * the viewer has no appearance control of its own, and the axi design language
 * is unconditional, so there is nothing here to decide except which accent and
 * whether glass.
 *
 * One compatibility path, and only one. A report published before the three
 * appearance booleans collapsed spells the glass choice `glassSurfaces`, so that
 * key is read as an alias. Everything older — `reportTheme.ui`, `uiTheme` — is
 * deliberately not handled: those reports predate the accent picker entirely and
 * land on the default rather than being guessed at. Note also that a published
 * report keeps the viewer bundle from its last publish, so a live report will
 * not pick up the new look until it is republished.
 */
export function readPaletteFromReport(stats: any): { palette: ColorPalette; glass: boolean } {
    // hasOwnProperty, not `in`: this reads a JSON file off the network, and `in`
    // walks the prototype chain — `colorPalette: "constructor"` would pass an `in`
    // guard and be handed to the applier as if it were a real accent id.
    if (stats?.colorPalette && Object.prototype.hasOwnProperty.call(PALETTES, stats.colorPalette)) {
        return {
            palette: stats.colorPalette,
            glass: stats.glass ?? stats.glassSurfaces ?? false,
        };
    }
    return { palette: DEFAULT_PALETTE_ID, glass: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/web/__tests__/reportPalette.test.ts`

Expected: PASS, 13 tests (9 behavioural + 4 prototype-key cases).

- [ ] **Step 5: Write the failing share-theme test**

Replace the `describe('share-link theming', …)` block in `src/web/__tests__/reportShareTheme.test.tsx` with:

```tsx
describe('share-link theming', () => {
    // Axi is the only language now, so there is nothing to force on. A share link
    // still ignores the publisher's accent in favour of the map's, but it follows
    // the publisher's glass choice like every other report.
    it('applies the axi language through the document element', () => {
        renderShare({ colorPalette: 'crimson-red' });
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('crimson-red');
        expect(document.documentElement.hasAttribute('data-axi-theme')).toBe(false);
        expect(document.body.classList.contains('axi-design')).toBe(false);
        expect(document.body.classList.contains('glass-surfaces')).toBe(false);
    });

    // Review Focus 5.
    it('renders a report published with glass in glass', () => {
        renderShare({ colorPalette: 'teal-ocean', glass: true });
        expect(document.documentElement.getAttribute('data-axi-theme')).toBe('glass');
    });

    it('honours the pre-collapse glassSurfaces spelling', () => {
        renderShare({ colorPalette: 'teal-ocean', glassSurfaces: true });
        expect(document.documentElement.getAttribute('data-axi-theme')).toBe('glass');
    });

    it('accents a borderlands report with that borderlands colour', () => {
        renderShare({ mapData: [{ name: 'Green Borderlands', value: 6, color: '#22c55e' }] });
        expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#22c55e');
        expect(document.body.style.getPropertyValue('--accent-border')).toBe('rgba(34, 197, 94, 0.35)');
    });

    // Review Focus 3: --brand-primary now DERIVES from --axi-accent, so setting it
    // alone leaves every upstream component and every axi remap on the palette
    // accent and the map colour never arrives.
    it('drives the design language from the map accent too', () => {
        renderShare({ mapData: [{ name: 'Red Borderlands', value: 4, color: '#ef4444' }] });
        expect(document.body.style.getPropertyValue('--axi-accent')).toBe('#ef4444');
    });

    it('accents Eternal Battlegrounds, Obsidian Sanctum and Edge of the Mists white', () => {
        for (const name of ['Eternal Battlegrounds', 'Obsidian Sanctum', 'Edge of the Mists']) {
            document.body.removeAttribute('style');
            renderShare({ mapData: [{ name, value: 3, color: '#ffffff' }] });
            expect(document.body.style.getPropertyValue('--axi-accent')).toBe('#ffffff');
        }
    });

    it('overrides the palette the report was published with', () => {
        renderShare({
            colorPalette: 'crimson-red',
            mapData: [{ name: 'Blue Borderlands', value: 2, color: '#3b82f6' }],
        });
        expect(document.body.style.getPropertyValue('--axi-accent')).toBe('#3b82f6');
    });

    it('leaves the accent to the palette when the report has no map data', () => {
        renderShare({ colorPalette: 'crimson-red' });
        expect(document.body.style.getPropertyValue('--axi-accent')).toBe('');
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('crimson-red');
    });
});
```

In the same file's `beforeEach`, add a line so the document element does not leak state between tests:

```tsx
beforeEach(() => {
    document.body.className = '';
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('data-axi-accent');
    document.documentElement.removeAttribute('data-axi-theme');
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('no network in tests'));
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/web/__tests__/reportShareTheme.test.tsx`

Expected: FAIL — no `data-axi-accent` is set, and `--axi-accent` is never written inline.

- [ ] **Step 7: Add `--axi-accent` to the map-accent variable set**

In `src/shared/mapAccent.ts`, replace the `MAP_ACCENT_CSS_VARS` export:

```ts
/** The accent as inline custom properties, ready for `element.style.setProperty`. */
export const MAP_ACCENT_CSS_VARS: Array<[string, keyof MapAccent]> = [
    ['--brand-primary', 'primary'],
```

with:

```ts
/**
 * The accent as inline custom properties, ready for `element.style.setProperty`.
 *
 * `--axi-accent` leads the list and is not redundant with `--brand-primary`: the
 * accent direction runs from the design language outwards now
 * (`--brand-primary: var(--axi-accent)` at `:root`), so setting only the brand
 * variable would leave every axi remap and every upstream component on the
 * palette accent and the map colour would never arrive. The brand variables stay
 * because components that read them directly need a concrete value, not one that
 * resolves back through the token being overridden.
 */
export const MAP_ACCENT_CSS_VARS: Array<[string, keyof MapAccent]> = [
    ['--axi-accent', 'primary'],
    ['--brand-primary', 'primary'],
```

Then update the `MapAccent` interface doc for `primary`, replacing `/** \`--brand-primary\` */` with:

```ts
    /** `--axi-accent` and `--brand-primary` */
```

- [ ] **Step 8: Extend the mapAccent test**

Add to `src/shared/__tests__/mapAccent.test.ts`, inside its top-level `describe`:

```ts
    it('leads with --axi-accent so the map colour reaches the design language', () => {
        expect(MAP_ACCENT_CSS_VARS[0]).toEqual(['--axi-accent', 'primary']);
    });

    it('still carries every brand and glow variable a component may read directly', () => {
        expect(MAP_ACCENT_CSS_VARS.map(([cssVar]) => cssVar)).toEqual([
            '--axi-accent',
            '--brand-primary',
            '--brand-secondary',
            '--brand-gradient',
            '--accent-bg',
            '--accent-bg-strong',
            '--accent-border',
            '--glow-primary',
            '--glow-secondary',
        ]);
    });
```

Add `MAP_ACCENT_CSS_VARS` to that file's import from `../mapAccent` if it is not already imported.

- [ ] **Step 9: Rewire `reportApp.tsx`**

Lines 369-371 — replace:

```tsx
    const [glassSurfaces, setGlassSurfaces] = useState(false);
    const [glassmorphic, setGlassmorphic] = useState(false);
    const [axiDesign, setAxiDesign] = useState(false);
```

with:

```tsx
    const [glass, setGlass] = useState(false);
```

Lines 528-551 — replace the whole effect:

```tsx
    // Apply palette and glass body classes so CSS variables drive all theming.
    useEffect(() => {
        const body = document.body;
        body.classList.add('web-report');
        for (const id of Object.keys(PALETTES)) body.classList.remove(`palette-${id}`);
        if (colorPalette !== 'electric-blue') {
            body.classList.add(`palette-${colorPalette}`);
        }
        // Glass and axi are opposite claims about what a surface is, and the
        // glass rules are written with !important, so with both on the glass
        // wins every contested property and the result is neither language.
        // The renderer suppresses them the same way (useSettings).
        body.classList.toggle('glass-surfaces', glassSurfaces && !axiDesign);
        body.classList.toggle('glassmorphic', glassmorphic && !axiDesign);
        body.classList.toggle('axi-design', axiDesign);
        // A share link's accent comes from the map it was fought on, not from a
        // palette class. Inline properties beat every `palette-*` rule without
        // needing a class per map, and `axi-design.css` reads the accent through
        // `--axi-accent: var(--brand-primary)`, so the whole language follows.
        for (const [cssVar, key] of MAP_ACCENT_CSS_VARS) {
            if (mapAccent) body.style.setProperty(cssVar, mapAccent[key]);
            else body.style.removeProperty(cssVar);
        }
    }, [colorPalette, glassSurfaces, glassmorphic, axiDesign, mapAccent]);
```

with:

```tsx
    // The publisher's accent and glass choice, applied the same way the renderer
    // applies them — two data attributes on <html>, nothing else.
    useEffect(() => {
        document.body.classList.add('web-report');
        applyAxiTheme(document.documentElement, { accent: colorPalette, glass });
        // A share link's accent comes from the map it was fought on rather than
        // from the publisher's palette. Inline properties on <body> beat the
        // [data-axi-accent] rule on <html> by proximity, so this overrides the
        // whole language — including upstream's own components — without needing
        // an accent id per map. --axi-accent leads the list for exactly that
        // reason; see MAP_ACCENT_CSS_VARS.
        for (const [cssVar, key] of MAP_ACCENT_CSS_VARS) {
            if (mapAccent) document.body.style.setProperty(cssVar, mapAccent[key]);
            else document.body.style.removeProperty(cssVar);
        }
    }, [colorPalette, glass, mapAccent]);
```

Add the import beside the other `shared` imports at the top of the file:

```tsx
import { applyAxiTheme } from '../shared/applyAxiTheme';
```

Then check whether `PALETTES` is still used in `reportApp.tsx` (`grep -n 'PALETTES' src/web/reportApp.tsx`) and drop it from the import if not.

Lines 1034-1042 — replace the share-link branch:

```tsx
            // Share links have a look of their own: always the axi language,
            // accented by the WvW map the fights were on. The publisher's own
            // palette and surface toggles don't reach `/r/<code>` — only
            // published Pages reports (the branch below) follow those.
            const { palette } = readPaletteFromReport(injectedSource.report.stats);
            setColorPalette(palette);
            setGlassSurfaces(false);
            setGlassmorphic(false);
            setAxiDesign(true);
```

with:

```tsx
            // A share link is accented by the WvW map the fights were on rather
            // than by the publisher's palette (see the mapAccent call below), but
            // it follows the publisher's glass choice like any other report.
            // There is no language to force on any more — axi is the only one.
            const { palette, glass: publishedGlass } = readPaletteFromReport(injectedSource.report.stats);
            setColorPalette(palette);
            setGlass(publishedGlass);
```

Lines 1059-1065 — replace:

```tsx
        const applyPaletteFromReport = (reportData: ReportPayload) => {
            const { palette, glass, glassmorphic: gm, axi } = readPaletteFromReport(reportData.stats);
            setColorPalette(palette);
            setGlassSurfaces(glass);
            setGlassmorphic(gm);
            setAxiDesign(axi);
        };
```

with:

```tsx
        const applyPaletteFromReport = (reportData: ReportPayload) => {
            const { palette, glass: publishedGlass } = readPaletteFromReport(reportData.stats);
            setColorPalette(palette);
            setGlass(publishedGlass);
        };
```

Lines 1076-1082 — replace the site-wide `index.json` branch:

```tsx
                    if (!Array.isArray(data) && data?.colorPalette) {
                        const { palette, glass, glassmorphic: gm, axi } = readPaletteFromReport(data);
                        setColorPalette(palette);
                        setGlassSurfaces(glass);
                        setGlassmorphic(gm);
                        setAxiDesign(axi);
                    }
```

with:

```tsx
                    if (!Array.isArray(data) && data?.colorPalette) {
                        const { palette, glass: siteGlass } = readPaletteFromReport(data);
                        setColorPalette(palette);
                        setGlass(siteGlass);
                    }
```

Lines 973-983 — retarget the two style objects at the new tokens. Replace:

```tsx
    // All theming is now driven by CSS variables set by palette/glass body classes.
    const defaultLogoColor = 'var(--brand-primary)';
    const glassCardStyle: CSSProperties = {
        backgroundImage: 'none',
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)'
    };
    // Sticky table headers need an opaque base: --bg-card is a translucent glass
    // tint in glass/glassmorphic modes, so layer it over a solid dark fallback to
    // keep scrolled rows from showing through.
    const rollupTableHeaderStyle: CSSProperties = {
        backgroundColor: '#0c0f16',
        backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))'
    };
```

with:

```tsx
    // All theming resolves from --axi-accent and the axi token set; the two data
    // attributes on <html> are the only switches.
    const defaultLogoColor = 'var(--brand-primary)';
    const glassCardStyle: CSSProperties = {
        backgroundImage: 'none',
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)'
    };
    // Sticky table headers need an opaque base. The reasoning survives the move
    // to upstream glass unchanged: --bg-card resolves to --axi-surface, which the
    // glass theme makes an alpha gradient, and its blur lives in
    // --axi-surface-filter, which is a no-op on Linux. So the tint is layered
    // over a solid dark fallback rather than used alone, or scrolled rows show
    // straight through the header.
    const rollupTableHeaderStyle: CSSProperties = {
        backgroundColor: '#0c0f16',
        backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))'
    };
```

- [ ] **Step 10: Run the viewer tests to verify they pass**

Run: `npx vitest run src/web src/shared/__tests__/mapAccent.test.ts`

Expected: PASS.

- [ ] **Step 11: Write the failing stub-keys test**

In `src/main/__tests__/webReportParts.test.ts`, update the two payload fixtures and the theme-fields test. Replace line 24:

```ts
    stats: { colorPalette: 'arcane', glassSurfaces: false, glassmorphic: true, blob: 'x'.repeat(fill) }
```

with:

```ts
    stats: { colorPalette: 'amber-warm', glass: true, glassSurfaces: true, blob: 'x'.repeat(fill) }
```

and replace the test at line 60:

```ts
    it('keeps theme fields in the stub so an old viewer still themes the page', () => {
        const p = payload('Small', 10);
        writeReportParts(dir, Buffer.from(JSON.stringify(p)), p);
        const stub = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
        expect(stub.stats).toMatchObject({ colorPalette: 'arcane', glassSurfaces: false, glassmorphic: true });
        expect(stub.stats.blob).toBeUndefined();
    });
```

with:

```ts
    it('keeps theme fields in the stub so an old viewer still themes the page', () => {
        const p = payload('Small', 10);
        writeReportParts(dir, Buffer.from(JSON.stringify(p)), p);
        const stub = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
        // glassSurfaces rides along beside glass on purpose: viewers already
        // deployed in the field only know that spelling, and a published report
        // keeps the viewer bundle from its last publish. One redundant boolean is
        // the whole cost of not breaking them.
        expect(stub.stats).toMatchObject({ colorPalette: 'amber-warm', glass: true, glassSurfaces: true });
        expect(stub.stats.blob).toBeUndefined();
        expect(stub.stats.glassmorphic).toBeUndefined();
        expect(stub.stats.axiDesign).toBeUndefined();
    });
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/webReportParts.test.ts`

Expected: FAIL — `stub.stats.glass` is `undefined`, because `glass` is not in `STUB_STATS_KEYS`.

- [ ] **Step 13: Update the stub key list**

In `src/main/webReportParts.ts`, replace lines 26-27:

```ts
/** Stats fields the stub keeps so a pre-3.10 viewer still themes the page. */
const STUB_STATS_KEYS = ['colorPalette', 'glassSurfaces', 'glassmorphic', 'axiDesign'] as const;
```

with:

```ts
/**
 * Stats fields the stub keeps so a pre-3.10 viewer still themes the page.
 *
 * `glassSurfaces` is the same value as `glass`, carried under its old name for
 * viewers already deployed in the field — a published report keeps the viewer
 * bundle from its last publish, so those readers are still out there and only
 * know that spelling.
 */
const STUB_STATS_KEYS = ['colorPalette', 'glass', 'glassSurfaces'] as const;
```

- [ ] **Step 14: Update the snapshot**

Run: `npx vitest run src/main/__tests__/webReportParts.test.ts -u`

Then verify the snapshot file now reads:

```bash
cat src/main/__tests__/__snapshots__/webReportParts.test.ts.snap
```

Expected: the `buildReportStub` snapshot lists `"colorPalette"` only — the fixture at line 81 passes `{ colorPalette: 'arcane', huge: [1] }` and carries no glass key, so nothing else survives. If the snapshot gained or lost any other key, that is a real change and needs explaining before the update is accepted.

- [ ] **Step 15: Collapse the publish path**

In `src/main/handlers/githubHandlers.ts`:

Lines 961-976 — replace the helper signature and stamped stats:

```ts
const buildWebReportPayload = (
    reportMeta: any,
    sourceStats: any,
    colorPalette: string,
    glassSurfaces: boolean,
    glassmorphic: boolean,
    axiDesign: boolean
) => {
    const payload = {
        meta: { ...(reportMeta || {}) },
        stats: {
            ...(sourceStats || {}),
            colorPalette,
            glassSurfaces,
            glassmorphic,
            axiDesign
        } as Record<string, any>
    };
```

with:

```ts
const buildWebReportPayload = (
    reportMeta: any,
    sourceStats: any,
    colorPalette: string,
    glass: boolean
) => {
    const payload = {
        meta: { ...(reportMeta || {}) },
        stats: {
            ...(sourceStats || {}),
            colorPalette,
            glass,
            // The same value under its old name, for viewers already deployed in
            // the field. See STUB_STATS_KEYS in webReportParts.ts.
            glassSurfaces: glass
        } as Record<string, any>
    };
```

Lines 2166-2169 — replace:

```ts
            const paletteValue = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const glassValue = !!store.get('glassSurfaces', false);
            const glassmorphicValue = !!store.get('glassmorphic', false);
            const axiValue = !!store.get('axiDesign', false);
```

with:

```ts
            const paletteValue = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const glassValue = !!store.get('glass', false);
```

Lines 2230-2237 — replace:

```ts
            const builtReport = buildWebReportPayload(
                reportMeta,
                sourceStats,
                paletteValue,
                glassValue,
                glassmorphicValue,
                axiValue
            );
```

with:

```ts
            const builtReport = buildWebReportPayload(
                reportMeta,
                sourceStats,
                paletteValue,
                glassValue
            );
```

Lines 2432-2436 — replace:

```ts
            const indexPayload = {
                colorPalette: paletteValue,
                glassSurfaces: glassValue,
                glassmorphic: glassmorphicValue,
                axiDesign: axiValue,
                entries: mergedEntries
            };
```

with:

```ts
            const indexPayload = {
                colorPalette: paletteValue,
                glass: glassValue,
                glassSurfaces: glassValue,
                entries: mergedEntries
            };
```

Lines 2751-2754 — replace:

```ts
            const localPalette = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const localGlass = !!store.get('glassSurfaces', false);
            const localGlassmorphic = !!store.get('glassmorphic', false);
            const localAxi = !!store.get('axiDesign', false);
```

with:

```ts
            const localPalette = (store.get('colorPalette', 'electric-blue') as string) || 'electric-blue';
            const localGlass = !!store.get('glass', false);
```

Lines 2755-2762 — replace:

```ts
            const builtReport = buildWebReportPayload(
                reportMeta,
                payload.stats || {},
                localPalette,
                localGlass,
                localGlassmorphic,
                localAxi
            );
```

with:

```ts
            const builtReport = buildWebReportPayload(
                reportMeta,
                payload.stats || {},
                localPalette,
                localGlass
            );
```

Lines 2842-2846 — replace:

```ts
            const localIndexPayload = {
                colorPalette: localPalette,
                glassSurfaces: localGlass,
                glassmorphic: localGlassmorphic,
                axiDesign: localAxi,
                entries: mergedLocalEntries
            };
```

with:

```ts
            const localIndexPayload = {
                colorPalette: localPalette,
                glass: localGlass,
                glassSurfaces: localGlass,
                entries: mergedLocalEntries
            };
```

- [ ] **Step 16: Confirm nothing stale is left in the publish and web paths**

Run:

```bash
grep -rn 'glassmorphic\|axiDesign' src/main src/web --include='*.ts' --include='*.tsx'
```

Expected: only `src/main/glassSettingMigration.ts` and `src/main/handlers/settingsHandlers.ts`, where deleting those keys is the point.

- [ ] **Step 17: Run the tests and validate**

Run:

```bash
npx vitest run src/main src/web src/shared
npm run validate
```

Expected: PASS, except `src/shared/__tests__/statsThemesContract.test.ts`, which Task 7 deletes.

- [ ] **Step 18: Commit**

```bash
git add -A src/main src/web src/shared
git commit -m "$(cat <<'EOF'
feat(web-report): publish and read one glass flag, drop the legacy branches

readPaletteFromReport returns { palette, glass } and keeps exactly one
compatibility path — glassSurfaces as an alias for glass. The reportTheme.ui and
uiTheme branches are gone: those reports predate the accent picker and land on
electric-blue rather than being guessed at.

The publish payload and both index.json writers stamp `glass`, plus
`glassSurfaces` at the same value for viewers already deployed in the field, and
STUB_STATS_KEYS follows.

MAP_ACCENT_CSS_VARS gains --axi-accent: with the accent direction inverted,
setting only --brand-primary would leave every upstream component and every axi
remap on the palette accent, so a share link's map colour would never arrive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Delete the dead theme assets, fix the rotted comments, verify

**Files:**
- Delete: `web/web-report-themes/` (6 files), `public/web-report-themes/` (6 files)
- Delete: `scripts/dedupe-web-themes.mjs`
- Delete: `src/shared/__tests__/statsThemesContract.test.ts`
- Modify: `vite.viewer.config.ts:17`
- Modify: `src/renderer/stats/map/FightIdentityPill.tsx:26-32`
- Modify: `src/renderer/stats/map/TransportInstrument.tsx:140-144`
- Modify: `src/renderer/stats/map/TransportBar.tsx:54-58`
- Modify: `src/renderer/stats/components/FightSliceTray.tsx:19-22`
- Modify: `src/renderer/stats/sections/BucketGridTable.tsx:69-72`
- Modify: `src/renderer/stats/sections/BoonStripComparisonSection.tsx:116-117`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing new. This task removes and documents.

- [ ] **Step 1: Confirm nothing loads the theme CSS files**

Run:

```bash
grep -rn 'web-report-themes' \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.json' --include='*.html' \
  src/ web/ scripts/ package.json vite.*.ts electron/ 2>/dev/null
```

Expected: hits only in `scripts/dedupe-web-themes.mjs`, `src/shared/__tests__/statsThemesContract.test.ts` and the comment at `vite.viewer.config.ts:17`. If any *runtime* code references them, stop and report it — that would contradict the spec's premise.

- [ ] **Step 2: Delete**

```bash
cd /var/home/mstephens/Documents/GitHub/axibridge
git rm -r web/web-report-themes public/web-report-themes
git rm scripts/dedupe-web-themes.mjs
git rm src/shared/__tests__/statsThemesContract.test.ts
grep -n 'dedupe-web-themes' package.json || echo "no npm script referenced it"
```

If `package.json` does reference the script, remove that line too.

- [ ] **Step 3: Fix the stale comment in the viewer config**

In `vite.viewer.config.ts`, replace:

```ts
    // CSS in this bundle references `public/` by absolute path. Copying the
    // ~5MB `public/` tree (fonts/img/svg/web-report-themes meant for the
    // Electron app and the full web report) into `docs/view/` would just be
```

with:

```ts
    // CSS in this bundle references `public/` by absolute path. Copying the
    // ~5MB `public/` tree (fonts/img/svg meant for the Electron app and the
    // full web report) into `docs/view/` would just be
```

- [ ] **Step 4: Rewrite the six rotted comments**

None of these six components branch on the retired booleans — their references are comments explaining why they depend on CSS overrides elsewhere. All six overrides still exist; they are now keyed on `[data-axi-theme="glass"]` (Task 5, Step 9).

`src/renderer/stats/map/FightIdentityPill.tsx` — replace lines 26-32:

```tsx
 * `className="app-dropdown"` alone only paints a background under the
 * glass-surfaces/glassmorphic themes (see src/renderer/index.css:1538); in
 * the default theme it carries only an animation. Since blur does not work
 * on this platform, a translucent floating card over the map reads as
 * see-through. We therefore also set an explicit opaque background inline,
 * matching every other floating surface in this codebase (e.g.
 * ColumnFilterDropdown.tsx, PublishWebhookPopover.tsx).
```

with:

```tsx
 * `className="app-dropdown"` alone only paints a background under the glass
 * theme (`[data-axi-theme="glass"] .app-dropdown` in index.css); the flat theme
 * gives it only an animation. Blur does not work on this platform, so a
 * translucent floating card over the map reads as see-through. We therefore
 * also set an explicit opaque background inline, matching every other floating
 * surface in this codebase (e.g. ColumnFilterDropdown.tsx,
 * PublishWebhookPopover.tsx).
```

The old `index.css:1538` citation is dropped rather than re-pointed: that line had already rotted to unrelated spinner CSS, and a class name is a reference that cannot rot.

`src/renderer/stats/map/TransportInstrument.tsx` — replace lines 140-144:

```tsx
                        // A floating surface over the map: under the glass themes a bare
                        // `--bg-elevated` is translucent (blur is a no-op on Linux), so the
                        // map reads straight through the ladder. `.app-dropdown` is the
                        // shared opaque override for exactly this.
```

with:

```tsx
                        // A floating surface over the map: under the glass theme a bare
                        // `--bg-elevated` resolves to --axi-surface, an alpha gradient whose
                        // blur is a no-op on Linux, so the map reads straight through the
                        // ladder. `.app-dropdown` is the shared opaque override for this.
```

`src/renderer/stats/map/TransportBar.tsx` — replace lines 54-58:

```tsx
 * `.app-dropdown` only paints a background under the glass themes (see
 * index.css) — the default theme leaves it transparent, which would make
 * this bar see-through over the map since blur doesn't work on this
 * platform. An explicit `background` keeps it opaque everywhere while
 * still picking up the glass-theme override where that class applies.
```

with:

```tsx
 * `.app-dropdown` only paints a background under the glass theme (see
 * `[data-axi-theme="glass"]` in index.css) — the flat theme leaves it
 * transparent, which would make this bar see-through over the map since blur
 * doesn't work on this platform. An explicit `background` keeps it opaque
 * everywhere while still picking up the glass override where that class applies.
```

`src/renderer/stats/components/FightSliceTray.tsx` — replace lines 19-22:

```tsx
 * header rather than sitting in a row of buttons. The quiet resting style
 * disappears there — under the glass palette `--bg-card` is
 * rgba(255, 255, 255, 0.035), so the pill has no fill at all and reads as a
 * caption. Promoted, it borrows the accent treatment plus a glyph.
```

with:

```tsx
 * header rather than sitting in a row of buttons. The quiet resting style
 * disappears there — under the glass theme `--bg-card` resolves to
 * --axi-surface, a translucent gradient, so the pill has almost no fill and
 * reads as a caption. Promoted, it borrows the accent treatment plus a glyph.
```

`src/renderer/stats/sections/BucketGridTable.tsx` — replace lines 69-72:

```tsx
            /* `fight-diff-select` is the app's own select treatment: it strips the
               native chrome, supplies the chevron, and carries the glass-theme
               overrides for the option list. Without it this renders as a raw
               platform dropdown that matches nothing else in the app. */
```

with:

```tsx
            /* `fight-diff-select` is the app's own select treatment: it strips the
               native chrome, supplies the chevron, and carries the opaque option-list
               fill the glass theme needs. Without it this renders as a raw platform
               dropdown that matches nothing else in the app. */
```

`src/renderer/stats/sections/BoonStripComparisonSection.tsx` — replace lines 116-117:

```tsx
                                    // Solid slate so the hover band stays visible on
                                    // any theme (matches the glass --bg-hover override).
```

with:

```tsx
                                    // Solid slate so the hover band stays visible under
                                    // either surface treatment — --bg-hover resolves to
                                    // --axi-surface-raised, which glass makes translucent.
```

- [ ] **Step 5: Verify no reference to the retired names survives anywhere**

Run:

```bash
grep -rn 'glass-surfaces\|glassmorphic\|Lillifox\|axiDesign\|body\.axi-design\|axi-search-\|body\.palette-' \
  src/ scripts/ vite.*.ts electron/ \
  --include='*.ts' --include='*.tsx' --include='*.css' --include='*.mjs'
```

Expected: only the two deliberate compatibility sites, `src/main/glassSettingMigration.ts` and `src/main/handlers/settingsHandlers.ts`. Anything else is a miss.

- [ ] **Step 6: Run the whole unit suite**

Run: `npx vitest run`

Expected: PASS, no skips beyond the suite's existing ones.

- [ ] **Step 7: Validate and build all three targets**

Run:

```bash
npm run validate
npm run build
npx vite build --config vite.viewer.config.ts
```

Expected: all three PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(theme): delete the dead web-report-themes and retarget the glass comments

Removes both copies of the six legacy theme stylesheets (~2078 lines), the
dedupe script that maintained them, the contract test that guarded them, and
the stale reference in the viewer config. No runtime code loaded any of it.

Rewrites the six stats-component comments that named the retired themes. They
contain no boolean branches — they explain why each component depends on an
opaque override elsewhere, and those overrides now live under
[data-axi-theme="glass"]. FightIdentityPill's index.css:1538 citation is dropped
rather than re-pointed: it had already rotted to unrelated CSS, and a class name
cannot rot the same way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Visual pass**

Automated tests cannot see any of this. Run `npm run dev` and check, in order:

1. **The accent picker, all 11 palettes, glass off.** Each swatch changes the accent everywhere — buttons, focus rings, links, the left rail's active item, chart strokes. A palette that leaves one of those on the previous colour means a `--brand-*` consumer is not resolving through `--axi-accent`; that was the spec's stated top risk.
2. **The same 11 with glass on.** Expect the aurora ground, translucent surfaces and 16px corners.
3. **Corners with glass off.** Square, because `--axi-radius` went `10px` → `0` upstream between 1.6.0 and 1.13.0. Expected, not a regression.
4. **Every floating surface, glass on** — this is where a regression is most likely. The webhook dropdown, the column-filter dropdown, the publish popover, the search palette (`Ctrl+K`), the replay transport bar and speed ladder, the commander `<select>` option list, the report-history sticky bulk-delete bar, and a scrolled stats table's sticky header. Each must be opaque: blur is a no-op on Linux, so anything translucent here is see-through and unreadable.
5. **Focus rings.** Tab through Settings with glass both on and off. `axi.css` now owns `:focus-visible` at base level as well as the app's own rule, and this is where the eight releases of package drift would show.
6. **Link colours.** `axi.css` sets `a { color: inherit; }`. Check the "Learn more" links in Settings and the report footer still read as links.
7. **The published web report.** Publish with glass off, confirm, then publish with glass on and confirm the report follows. A live report will not change until it is republished — it keeps the viewer bundle from its last publish.
8. **A share link** (`/r/<code>`), if one is reachable: the borderlands accent must drive the whole language, not just the elements that read `--brand-primary` directly.

Report anything that does not match, rather than fixing it silently — item 1 or 4 failing means a design assumption was wrong, not that a line needs tweaking.

---

## Notes carried from verification

Three things found while writing this plan that change or simplify the spec:

1. **The accent inversion is far smaller than the spec assumed.** `axi-design.css` already remaps every accent-derived variable — `--brand-secondary`, `--brand-gradient`, `--accent-bg`, `--accent-bg-strong`, `--accent-border`, `--glow-primary`, `--glow-secondary` — and it loads after `index.css`. With axi unconditional, all eight declarations in each of the ten `body.palette-*` blocks are already overridden, so those blocks are a pure deletion and the whole inversion is one `--brand-primary: var(--axi-accent)` at `:root`. Spec Risk 1 stands as a thing to *verify* in the visual pass, but there is no per-accent port to get wrong.
2. **The namespace rename is 109 occurrences across 10 files**, not the spec's "roughly 25". `axi-rail` alone is 30. The spec's test table also lists `statsHeaderSlicePill.test.tsx` as needing rename updates; it contains no `axi-search-*` reference.
3. **There is no hand-copied token block to delete.** Spec Section 3 says the re-declaration at `axi-design.css:29` goes along with the `tokens.css` import. That copy is already gone — the import replaced it, and line 29 is now just the opening of the `body.axi-design` rule.
4. **`--axi-radius` and `--axi-radius-sm` went `10px`/`6px` → `0`/`0`** between 1.6.0 and 1.13.0 — the only token *value* change in eight releases; everything else in the diff is new tokens. The flat theme becomes square-cornered and glass restates them as `16px`/`10px`. Upstream's intent, and the one visible change nobody would predict from the spec.
