# axi-design as the default language, with one glass toggle

Date: 2026-09-28
Status: design approved, ready for planning
Scope: sub-project 1 of 5 (see "Where this sits")

## Intent

`@axiapps/axi-design` now ships a glass theme. AxiBridge should run on the
latest package, stop treating the axi language as an opt-in, and offer exactly
one appearance control beyond the accent picker: glass on or off. Flipping it
must change every surface, in the Electron renderer and in the published web
report alike.

Today the opposite is true. `axiDesign` is a boolean that gates 667
`body.axi-design` selectors; `index.css` carries a whole second look for when
it is off; and two further booleans — `glassSurfaces` and `glassmorphic` —
implement a homegrown glass that cannot coexist with axi at all. The comment at
`useSettings.ts:170` says why: the glass rules use `!important`, so with both on
"the glass wins every contested property and the result is neither language."

Success means: axi-design 1.13.0 installed and actually loaded, one `glass`
boolean, no non-axi CSS path left alive, upstream's components available for
future adoption, and a published report that renders in axi with the
publisher's accent and glass choice.

## Where this sits

The user's stated direction is full adoption of upstream's component library —
replacing AxiBridge's Tailwind markup with `.axi-btn` / `.axi-card` / `.axi-table`
and friends. That is a multi-release UI rewrite: upstream ships 46 component
families, and AxiBridge is 285 TSX files / 62k lines of Tailwind markup served by
248 escaped Tailwind-literal remap selectors (200 in `axi-design.css`, 48 in
`index.css`).

It is therefore decomposed into five sub-projects, each with its own spec, plan
and implementation:

1. **Theme foundation** — this spec. Package upgrade, unconditional axi, one
   glass toggle, legacy theme removal, components loaded but not adopted.
2. **Primitives** — `btn input select check radio switch chip pill badge`.
3. **Surfaces & data** — `card panel page stack row grid table stat meter`.
4. **Chrome & overlays** — `titlebar mast menu drawer modal scrim toast tabs
   crumbs tooltip search`.
5. **Retire the remap layer** — delete the 248 Tailwind-literal selectors and
   whatever remains of `index.css`.

Sub-projects 2–5 are explicitly out of scope here. This one changes no TSX
markup to use upstream component classes.

## Decisions taken

Four questions were settled before design:

1. **The accent picker stays.** All 11 palettes survive, re-sourced from
   upstream's `accents.css`.
2. **Old reports do not get a compatibility path.** `readPaletteFromReport`
   drops its legacy `reportTheme.ui` and `uiTheme` branches entirely; anything
   without a recognized `colorPalette` falls back to `electric-blue`.
3. **Upstream's `axi.css` is imported,** not just its tokens — the components
   must be available for sub-projects 2–5.
4. **Glass is publisher-baked.** The single toggle lives in app Settings and is
   stamped into `report.json` at publish. The viewer gets no control of its own.

## Section 1 — How a theme gets applied

`useSettings.ts:170-186` and `reportApp.tsx:528-551` currently duplicate the
same body-class logic. Both are replaced by one shared module:

```ts
// src/shared/applyAxiTheme.ts
export function applyAxiTheme(
    root: HTMLElement,
    opts: { accent: ColorPalette; glass: boolean },
): void
```

It sets `data-axi-accent` to the accent id, and sets `data-axi-theme="glass"`
when glass is on or removes the attribute when it is off. Nothing else.

The target is `<html>`, not `<body>`. Upstream's `themes/glass.css` and
`accents.css` are unscoped attribute selectors; applying them at the document
element lets them cascade over `body`-level rules without a specificity fight,
which is what the `!important` war in the old glass implementation was.

`particles-disabled` stays a `body` class — it is app behavior, not part of the
design language.

## Section 2 — Accent direction inverts

Accent currently enters through `body.palette-<id>` blocks at
`src/renderer/index.css:109-211`, which set `--brand-primary`;
`axi-design.css:39` then reads it:

```css
--axi-accent: var(--brand-primary, #ffc53d);
```

Those blocks live in the legacy file this spec deletes, so the source
disappears and the direction has to reverse. Upstream `accents.css` sets
`--axi-accent` per `[data-axi-accent]`, and AxiBridge derives the brand
variables from it:

```css
--brand-primary: var(--axi-accent);
```

This is the highest-risk edit in the spec. The comment at `axi-design.css:101`
records that restating these variables is what broke the accent picker
previously, so every consumer of `--brand-primary`, `--brand-secondary`,
`--brand-gradient` and `--on-brand` must be checked to confirm it resolves
through `--axi-accent` after the change.

`PALETTES` in `src/shared/webThemes.ts` stays. Its `label`, `gradient`,
`accentBg`, `accentBgStrong` and `accentBorder` fields have no upstream
equivalent and `mapAccent.ts` needs them. But `primary` becomes documentation
rather than the live value — upstream's `accents.css` owns what actually
renders. A new test asserts `PALETTES[id].primary` equals the hex for the same
id in upstream's `accents.json`, for all 11 ids, so a future upstream change
fails CI instead of silently diverging from what the app displays.

## Section 3 — CSS load order

```
src/renderer/index.css            (app-specific; legacy layer deleted)
  @import '@axiapps/axi-design/axi.css'          base reset + 46 components
  @import '@axiapps/axi-design/accents.css'      [data-axi-accent] → --axi-accent
  @import '@axiapps/axi-design/themes/glass.css' [data-axi-theme="glass"] tokens
src/renderer/axi-design.css       (remap layer, flattened)
```

`tokens.css` is no longer imported separately: `axi.css` already contains the
token block in its `:root`. The hand-copied token re-declaration currently at
`axi-design.css:29` is deleted along with it.

`axi-design.css` loses all 667 `body.axi-design ` selector prefixes. Its 200
Tailwind-literal remaps stay exactly as they are — they are what makes the
Tailwind markup look like axi, and they are retired in sub-project 5, not here.

Two reconciliations this forces:

**Base reset vs Tailwind preflight.** `axi.css` styles `*`, `*::before`,
`*::after`, `html`, `body`, `a` and `:focus-visible`. Import order must place it
after Tailwind's preflight so it wins. Link colors and focus rings need explicit
checking, because `axi-design.css:234` currently owns `:focus-visible` and sets
`outline: var(--axi-border-control) solid var(--axi-accent)`.

**Namespace.** AxiBridge invented several `axi-`prefixed classes of its own, and
upstream already owns `.axi-search`, `.axi-search__icon` and `.axi-spinner`.
Today's names are a near-miss rather than a clean separation, and sub-projects
2–5 would make the overlap load-bearing. Rename now, roughly 25 occurrences
across TSX and CSS:

| Current | New |
|---|---|
| `axi-search-*` (bar, field, filters, group, icon, panel, results, empty, trigger, flash) | `bridge-search-*` |
| `axi-rail` | `bridge-rail` |
| `axi-step-spinner` | `bridge-step-spinner` |

`axi-design` (the body class) and `axi-gold` / `axi-accent` / `axi-warn` are not
renamed: the first is deleted outright, and the rest are token or accent-id
references, not component classes.

## Section 4 — Settings shape and migration

`colorPalette` is unchanged. `glassSurfaces`, `glassmorphic` and `axiDesign` are
replaced by a single `glass` boolean.

Migration in `src/main/index.ts` must run **unconditionally**, not inside the
`if (legacyUiTheme)` guard it sits beside at `:227-239`. Most existing users
have no `uiTheme` left but do have the three booleans, so a guarded migration
would silently skip them:

```
glass = glassSurfaces || glassmorphic
delete glassSurfaces, glassmorphic, axiDesign
```

`glassmorphic` folding into `glass` is a deliberate visible change for anyone
who ran Lillifox Mode. That setting was an aurora-background variant of glass
with rounded cards; it becomes upstream glass. This is the intended consequence
of "one toggle," not a claim of visual equivalence.

`LEGACY_THEME_TO_PALETTE` survives for the `uiTheme` → accent path in
`index.ts` and in settings import at `settingsHandlers.ts:308`, with its `glass`
field now feeding the new key. The table therefore lives on for *settings*
migration and dies for *reports* (Section 5).

`SettingsView.tsx` changes:

- the toggle list at `:80-82` keeps one row, `glass` — label "Glass", described
  as the translucent surface treatment. The `glassSurfaces`, `glassmorphic`
  ("Lillifox Mode") and `axiDesign` rows are removed.
- `paletteLocked` (`:252`) is deleted. It existed because glassmorphic pinned
  the accent; nothing pins it now.
- `onGlassmorphicSaved` and `onAxiDesignSaved` and their prop plumbing
  (`:118-120`, `:131-133`, `:248-250`, `:573-580`, `:857-859`, `:1030-1032`,
  `:1054-1056`, `:1084`) collapse to a single `onGlassSaved`.

`src/renderer/global.d.ts` settings fields at `:357-360` and `:411-414` follow
the same collapse.

## Section 5 — Web report and publish

`src/web/paletteReader.ts` shrinks to the current format only:

```ts
readPaletteFromReport(stats): { palette: ColorPalette; glass: boolean }
```

A recognized `stats.colorPalette` yields that accent plus
`stats.glass ?? stats.glassSurfaces ?? false`; the `glassSurfaces` fallback
preserves the glass choice of reports published before this change. Anything
else yields `{ palette: DEFAULT_PALETTE_ID, glass: false }`. The
`reportTheme.ui` and `uiTheme` branches are removed.

The function's doc comment must be rewritten. Its current claim — "`axi` mirrors
the publisher's own toggle: a report published from an app running the axi
language renders in it, one published without it doesn't" — is exactly what this
change overturns.

`reportApp.tsx`:

- state at `:369-371` collapses to `colorPalette` + `glass`, applied through
  `applyAxiTheme`; the body-class effect at `:528-551` goes away, keeping only
  its inline map-accent properties.
- the share-link branch at `:1034-1042` no longer needs to force axi on. Axi is
  the only language, so it sets accent and glass like the other two call sites
  (`:1061-1065`, `:1076-1082`).
- `glassCard` (`:45`), `glassCardStyle` (`:973`) and the opaque-base note at
  `:978-980` stay, retargeted at the new tokens. The reasoning holds verbatim
  under upstream glass: `--axi-surface` is an alpha gradient there too, so
  sticky table headers still need a solid dark fallback beneath the tint.

Publish side, `src/main/handlers/githubHandlers.ts`: the three store reads at
`:2167-2169` and `:2752-2754` become one, and the stamped stats at `:2434-2436`
and `:2844-2846` carry `glass`. The helper signature at `:965-976` collapses to
a single boolean.

`src/main/webReportParts.ts:27` exists so a pre-3.10 viewer can still theme a
stub page. To keep that working for viewers already deployed in the field, the
published payload writes `glass` **and** continues to emit `glassSurfaces` as a
compat alias, and `STUB_STATS_KEYS` becomes
`['colorPalette', 'glass', 'glassSurfaces']`. One redundant boolean is the whole
cost of not breaking already-published reports.

Note an existing constraint this spec does not change: a published report keeps
the viewer bundle from its last publish, so live reports will not pick up the
new look until they are republished.

## Section 6 — Deletions

- `src/renderer/index.css`: the 9 `body:not(.axi-design)` blocks, the 123
  `glass-surfaces` / `glassmorphic` selector occurrences, and the 10
  `body.palette-*` blocks at `:109-211` (superseded by upstream `accents.css`).
  **Not all 123 are pure deletions — see "Floating surfaces" below.**
- `web/web-report-themes/` and `public/web-report-themes/` — both copies of all
  six files (`classic.css`, `modern.css`, `matte.css`, `crt.css`, `kinetic.css`,
  `dark-glass.css`; ~2078 lines). No runtime code loads them.
- `scripts/dedupe-web-themes.mjs` and
  `src/shared/__tests__/statsThemesContract.test.ts`, which exist only to serve
  those files.
- the stale reference to them in the comment at `vite.viewer.config.ts:17`.
- the retired booleans where they are threaded as state and props:
  `SettingsView.tsx` (Section 4) and `App.tsx` (`:81-83`, `:1308`, `:1316`).

Six stats components mention the glass themes but contain **no** code branching
on the booleans — `BoonStripComparisonSection.tsx:117`,
`BucketGridTable.tsx:70`, `FightIdentityPill.tsx:27`,
`TransportInstrument.tsx:141`, `TransportBar.tsx:54-58`,
`FightSliceTray.tsx:20`. Their references are comments explaining why they
depend on CSS overrides elsewhere. Those comments need rewriting to name the new
theme, and one of them (`FightIdentityPill.tsx:27`) cites `index.css:1538`,
a line number that has already rotted to unrelated spinner CSS — drop the line
reference rather than re-pointing it.

### Floating surfaces are a migration, not a deletion

The opaque floating-surface overrides live inside the glass selectors being
removed: `body.glass-surfaces .app-dropdown` (`index.css:263`),
`body.glassmorphic .app-dropdown` (`:551`, `:574`), the bulk-uploading variant,
and `:1788`. They exist because blur is a no-op on Linux, so a translucent
floating surface over content is simply see-through and unreadable — which is
exactly what the six comments above are pointing at.

Upstream glass has the same property: `--axi-surface` is an alpha gradient and
`--axi-surface-filter: blur(18px)` does nothing on Linux. So these rules must be
**re-expressed** under `[data-axi-theme="glass"]`, not dropped. The affected
surfaces are `.app-dropdown` and its consumers: dropdowns, the publish popover,
the search palette, the replay/transport bar, and sticky table headers. Deleting
them without replacement is the most likely way for this sub-project to ship a
visible regression.

## Section 7 — Testing

Updated:

| File | Change |
|---|---|
| `src/main/__tests__/settingsMigration.test.ts` | the `glass` collapse, including `glassmorphic: true` alone → `glass: true`, and that it runs without a `uiTheme` present |
| `src/web/__tests__/reportPalette.test.ts` | two-field return, `glassSurfaces` fallback, legacy branches gone |
| `src/web/__tests__/reportShareTheme.test.tsx` | no forced-axi branch |
| `src/renderer/__tests__/SettingsView.test.tsx` | one toggle, no `paletteLocked` |
| `src/main/__tests__/webReportParts.test.ts` | new stub key list |
| `src/renderer/stats/search/__tests__/SearchPalette.test.tsx`, `src/renderer/stats/__tests__/statsHeaderSlicePill.test.tsx` | renamed `bridge-search-*` classes |

New:

- `PALETTES[id].primary` parity against upstream `accents.json` for all 11 ids.
- `applyAxiTheme` unit test: both attribute states on `<html>`, and that
  turning glass off removes `data-axi-theme` rather than setting it to a falsy
  value.

Deleted: `src/shared/__tests__/statsThemesContract.test.ts`.

Beyond unit tests: `npm run validate`, then a visual pass over the accent
picker through all 11 palettes with glass both on and off. The floating
surfaces need specific attention — dropdowns, the publish popover, the search
palette and the replay bar. Blur is a no-op on Linux, so upstream glass's
`--axi-surface-filter: blur(18px)` does nothing there and its translucent alpha
shows straight through unless those surfaces carry opaque overrides.

## Risks

1. **The accent inversion** (Section 2) has broken the picker before. Every
   `--brand-*` consumer needs verifying, not just the declaration site.
2. **Eight releases of package drift** (1.6.0 → 1.13.0) land at once, and
   `axi.css` was never loaded before. Base-reset and focus-ring regressions are
   the likely form.
3. **Glass on Linux** degrades to flat translucency, and the existing opaque
   overrides for floating surfaces are inside the CSS being deleted. They must
   be re-expressed under `[data-axi-theme="glass"]`; see Section 6.
4. **Lillifox Mode users** get a different look, by design.
