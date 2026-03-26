# Web Report Theme Handling Deep Dive

## Goal

Document how web report themes work today, why they feel finicky, and what to change to make them predictable and easier to maintain.

This is focused on the hosted web reports (`src/web`) and GitHub Pages publish flow, not the Electron app theme system in general.

## Implementation Status

As of March 1, 2026, the migration described in this document is partially implemented.

Completed:

- Hosted reports now load dedicated per-`uiTheme` stylesheets from `public/web-report-themes/`.
- `report.json` is now the effective primary source of truth for hosted-report theme selection.
- `classic.css`, `modern.css`, `matte.css`, `crt.css`, and `kinetic.css` are published as stable static assets for GitHub Pages.
- `classic`, `modern`, `matte`, and `crt` hosted-report theme rules have been substantially split out of `src/renderer/index.css`.
- `kinetic` hosted-report rules have been substantially split as well, including the major light-theme block and the main hosted-report-only dark-theme blocks.
- The remaining `modern` and `matte` hosted-report component leftovers (`fight-diff`, `stats-table-shell__head-stack`, `squad-comp`, and `fight-comp`) have been moved into their theme files.
- The remaining small `classic` hosted-report leftovers (`fight-diff` and `squad-comp`) have been moved into `public/web-report-themes/classic.css`.
- No explicit `body.web-report.theme-crt` selectors remain in `src/renderer/index.css`; CRT is effectively fully split for hosted-report-specific styling.
- The hosted-report `kinetic` dark utility remap block (theme variables plus broad `text-*`, `bg-*`, `border-*` remaps) has been moved into `public/web-report-themes/kinetic.css`.
- The remaining hosted-only `kinetic` dark content blocks (`top-skills`, `MVP`, `overview`, `top-players`) have been moved into `public/web-report-themes/kinetic.css`.
- GitHub theme sync no longer writes unused per-report `reports/<id>/theme.json` files during `apply-github-theme`.
- The web report runtime no longer consults root `theme.json` / `ui-theme.json` for theme resolution.
- The main GitHub publish/sync paths now remove legacy root `theme.json` / `ui-theme.json` files instead of publishing new ones.
- Asset-base probing no longer depends on `ui-theme.json`; the web app now resolves the published asset root by probing stable non-theme assets.
- Exported report payloads now include `stats.reportTheme = { ui, paletteId }`, and the web runtime prefers that shape while remaining backward-compatible with `stats.uiTheme` / `stats.webThemeId`.

Still intentionally in progress:

- Some `kinetic` rules remain in `src/renderer/index.css` where the selectors are still genuinely mixed between the Electron app and hosted reports, or where the remaining split would be low-value compared to the duplication risk.
- The document below still describes the target architecture and rationale; it should be read as a migration design with most of phase 1 and a large part of phase 2 already shipped.

## Migration Snapshot

The migration is far enough along that the remaining work should be treated as targeted cleanup and runtime simplification, not a broad theme-system rewrite.

What is done:

- Per-`uiTheme` hosted CSS assets exist and are loaded explicitly by the web report.
- `report.json` is the normal source of truth for hosted theme resolution.
- The largest hosted-only theme blocks are no longer embedded in the shared renderer stylesheet.
- Root theme files are no longer part of the web runtime theme-resolution path.

What is left:

- Mostly validation and maintenance work around intentionally shared selectors.
- If needed, clean up any already-published legacy root theme files in older repos that have not been republished yet.

## Remaining Shared Stylesheet Audit

This section is the practical inventory of what still lives in `src/renderer/index.css` after the current migration work.

### `classic`

The remaining small hosted-report selectors have been moved into `public/web-report-themes/classic.css`.

Status:

- `classic` is now largely split for hosted-report usage.
- Any remaining `classic` overlap in `src/renderer/index.css` should be treated as shared-on-purpose or tiny cleanup only.

### `modern`

The remaining high-value hosted-report component selectors have been moved into `public/web-report-themes/modern.css`.

Status:

- `modern` is now largely split for hosted-report usage.
- Any remaining `modern` overlap in `src/renderer/index.css` should be treated as shared-on-purpose or tiny cleanup, not migration debt.

### `matte`

The remaining high-value hosted-report component selectors have also been moved into `public/web-report-themes/matte.css`.

Status:

- `matte` is now largely split for hosted-report usage.
- Any remaining `matte` overlap in `src/renderer/index.css` should be treated as shared-on-purpose or small cleanup only.

### `crt`

No explicit hosted-report CRT selectors remain in `src/renderer/index.css`.

Status:

- `crt` is effectively fully split for hosted-report-specific styling.
- Any remaining CRT behavior in `src/renderer/index.css` is shared-on-purpose, not outstanding migration work.

### `kinetic`

`kinetic` still has the largest remaining footprint in `src/renderer/index.css`, but the highest-value hosted-report-only work is already done.

What remains falls into two buckets:

- Intentionally shared or acceptable to keep shared for now:
  - mixed app/web selector groups where the same visual rule is intentionally aligned across the Electron app and hosted reports
  - small dark-state text-color follow-on rules that depend on nearby mixed selectors
- Intentionally shared or acceptable to keep shared for now:
  - the remaining dark chart/tooltip, table, and sortable-header refinement layer
  - a few remaining dark semantic button and dense-table follow-on refinements near the already-split utility block

Status:

- `kinetic` is substantially migrated.
- The obvious hosted-only content blocks are now split.
- Remaining overlap is the intentionally shared refinement layer, not core migration debt.

## Recommended Next Cleanup Order

If further cleanup is desired, the best return-on-effort order is:

1. Leave mixed app/web rules in `src/renderer/index.css` unless there is a clear benefit to duplicating them into the hosted theme files.
2. Treat the remaining `kinetic` dark overlap as intentional shared refinement unless a specific visual bug justifies further extraction.

## Current Architecture

### 1. The web report now uses a hybrid CSS model

- `src/web/main.tsx` still imports `../renderer/index.css`.
- `src/renderer/index.css` is still the shared base stylesheet for both the Electron app and the hosted web reports.
- Hosted reports now also load a dedicated per-`uiTheme` stylesheet from `public/web-report-themes/`.
- `vite.web.config.ts` still emits the main hashed CSS bundle under `dist-web/assets/`, while the theme files are published as stable static assets under `dist-web/web-report-themes/`.

What that means in practice:

- The report now loads a separate CSS file per structural theme.
- Shared base rules are still bundled up front.
- Theme switching is now a combination of:
  - swapping the hosted theme stylesheet
  - toggling `body.theme-*` classes
  - applying palette variables inline

This is already much closer to the desired architecture than the original implementation.

### 2. There are two different theme concepts

The current system mixes two different layers:

- `uiTheme`: structural look and feel (`classic`, `modern`, `crt`, `matte`, `kinetic`)
- `webThemeId`: accent palette/background preset (`Arcane`, `Amethyst`, `Aurora`, etc., plus special ids like `MatteSlate`, `KineticPaper`, `KineticPaperDark`, `CRT`)

Those are defined in `src/shared/webThemes.ts`.

This split is reasonable in principle, but the implementation makes the two layers overlap in ways that are hard to reason about.

### 3. Theme selection is coupled in Settings

`src/renderer/SettingsView.tsx` currently constrains available hosted web themes based on the app `uiTheme`:

- `crt` only allows `CRT`
- `matte` only allows `MatteSlate`
- `kinetic` only allows `KineticPaper` or `KineticPaperDark`
- `classic` and `modern` both share the `BASE_WEB_THEMES` list

It also auto-resets `githubWebTheme` when `uiTheme` changes.

Effectively:

- the app theme decides what web themes are legal
- hosted report theme state is not fully independent

That coupling is one reason the system feels finicky.

### 4. Theme state is stored in multiple places

A hosted report can derive its theme from several sources:

1. Query param override: `?themeId=...`
2. Cookie override: `axibridge_web_theme_override`
3. `report.json` fields:
   - `stats.uiTheme`
   - `stats.webThemeId`
4. Root-level theme files (legacy artifacts in older deployments):
   - `theme.json`
   - `ui-theme.json`
5. Hardcoded defaults in the app

In `src/web/reportApp.tsx`, the app:

- reads overrides from query/cookie
- loads `report.json`
- applies theme defaults from `report.stats`
- then toggles `body.theme-*` classes
- then computes accent variables inline in React

This is much simpler now than the original implementation. The runtime no longer uses root theme files, and current publish flows remove them instead of writing new ones.

### 5. Report JSON already carries per-report theme data

`src/main/index.ts` injects both values into every exported report payload:

- `stats.uiTheme`
- `stats.webThemeId`

So the report JSON already contains enough information to render its own theme.

That is the strongest signal in the current implementation, and it should become the primary source of truth.

### 6. Root theme files are now legacy artifacts

Older GitHub Pages deployments may still contain:

- root `theme.json`
- root `ui-theme.json`

Current publish flows remove those files instead of writing new ones.

Older versions of the GitHub theme sync path also wrote `reports/<id>/theme.json`, but that behavior has been removed and the web runtime never read those files.

The current runtime reads:

- `report.json` in the report folder
- explicit query overrides
- built-in defaults when no report-specific theme is present

So today:

- per-report `theme.json` files are redundant and no longer written in the GitHub theme sync path
- root theme files are no longer used by the hosted web runtime and are actively removed by current publish flows

## Why It Feels Finicky

### Too many authoritative sources

The same report can be influenced by:

- the report payload
- global GitHub Pages defaults
- runtime query overrides
- cookies from a prior visit

That makes debugging "why is this report using this theme?" harder than it should be.

### CSS is bundled by platform, not by responsibility

The biggest stylesheet (`src/renderer/index.css`) contains:

- app theme rules
- web report theme rules
- component overrides for many sections

That means theme work for hosted reports is mixed into a file that also controls Electron UI behavior.

### Structural theme and accent palette are partially collapsed together

Examples:

- `matte`, `kinetic`, and `crt` are treated as both UI themes and special web theme ids
- `classic` and `modern` share the same palette list, but use different CSS behavior
- Kinetic dark is partly driven by `uiTheme === 'kinetic'` and partly by `webThemeId === 'KineticPaperDark'`

That is workable, but it increases condition count and special cases.

### GitHub theme sync mutates global site state

Changing the GitHub web theme updates root `theme.json` / `ui-theme.json`, and in one path also writes `reports/<id>/theme.json` for existing reports.

That makes theme changes feel global and retroactive, even though each report already carries its own theme fields.

## Recommendation

The cleanest version of your idea is:

- use separate CSS files for structural UI themes
- keep those CSS files as static assets on GitHub Pages
- make each `report.json` the authoritative source for which structural theme and palette to use
- stop relying on root `theme.json` / `ui-theme.json` for normal rendering

The key refinement is this:

- split CSS by **UI theme**, not by every `webThemeId`

That means:

- `classic.css`
- `modern.css`
- `matte.css`
- `crt.css`
- `kinetic.css`

But do **not** make one full CSS file for every accent palette like `Amethyst`, `Aurora`, `Arcane`, etc.

Why:

- there are many palette presets
- those presets mostly change accent color and background pattern
- duplicating the entire stylesheet for each palette would explode bundle size and maintenance cost

Instead:

- structural theme = separate CSS file
- palette theme = JSON metadata or CSS variables from the report payload

That gets the simplicity you want without unnecessary duplication.

## Proposed Target Design

### 1. Make report JSON the primary source of truth

Each report should explicitly declare its hosted theme in one place.

Recommended shape:

```json
{
  "meta": {
    "...": "..."
  },
  "stats": {
    "...": "...",
    "reportTheme": {
      "ui": "modern",
      "paletteId": "Arcane"
    }
  }
}
```

Current implementation:

- `stats.uiTheme`
- `stats.webThemeId`
- `stats.reportTheme`

The runtime now prefers `stats.reportTheme`, while still reading the legacy fields for backward compatibility.

### 2. Split theme CSS by UI theme only

Recommended static asset layout:

```text
public/web-report-themes/
  classic.css
  modern.css
  matte.css
  crt.css
  kinetic.css
```

Why `public/` is the easiest place:

- Vite copies `public/` files to GitHub Pages as-is
- filenames stay stable
- runtime can reference predictable URLs
- no manifest lookup is needed

This is better than relying on hashed Vite CSS chunks when the runtime wants to load a specific theme file by name.

### 3. Keep one small shared base CSS bundle

Do not try to move all CSS into five totally separate files immediately.

Better split:

- base shared CSS:
  - layout
  - typography
  - common component structure
  - non-theme utility fixes
- per-theme CSS:
  - `body.web-report.theme-*` blocks
  - theme-specific component overrides

That avoids duplicated base rules across all theme files.

### 4. Load the selected theme stylesheet at runtime

This is already implemented in `src/web/reportApp.tsx`: the app maintains a dedicated `<link>` element for the hosted theme stylesheet and swaps only that file.

Conceptually, the runtime behavior is:

```html
<link id="web-report-theme-stylesheet" rel="stylesheet" href="./web-report-themes/classic.css" />
```

Then set it from the parsed report theme:

- `classic` -> `./web-report-themes/classic.css`
- `modern` -> `./web-report-themes/modern.css`
- `matte` -> `./web-report-themes/matte.css`
- `crt` -> `./web-report-themes/crt.css`
- `kinetic` -> `./web-report-themes/kinetic.css`

### 5. Keep palette data as variables, not full CSS files

Continue using the existing `WEB_THEMES` data for palette presets:

- accent RGB
- background pattern
- special palette variants

Then apply only the selected palette as CSS variables or inline style values.

This part of the current implementation is already close to the right shape:

- `WEB_THEMES` acts like a palette registry
- React computes `--accent`, `--accent-rgb`, glow values, and background pattern from the selected theme

That should stay, with fewer fallbacks.

### 6. Remove root `theme.json` and `ui-theme.json` from runtime behavior

Current state:

- normal report rendering should use the theme embedded in `report.json`
- the runtime no longer reads root theme files for theme resolution

Remaining question:

- whether publish should keep writing the root files for compatibility/tooling, or stop writing them entirely

### 7. Stop writing per-report `theme.json`

Once `report.json` is authoritative, do not publish:

- `reports/<id>/theme.json`

It adds files and complexity without adding useful runtime behavior.

## Practical Migration Plan

### Phase 1: Stabilize the source of truth

1. Keep the existing `stats.uiTheme` and `stats.webThemeId` fields.
2. Change `src/web/reportApp.tsx` so report payload values win immediately when present.
3. Remove root `theme.json` / `ui-theme.json` from runtime theme resolution.
4. Keep query param override support if you still want ad hoc viewing overrides.

Status:

- Largely complete.
- This is now the default hosted-report behavior.

### Phase 2: Extract hosted theme CSS

1. Move `body.web-report.theme-modern`, `body.web-report.theme-matte`, `body.web-report.theme-crt`, `body.web-report.theme-kinetic`, and any report-only theme overrides out of `src/renderer/index.css`.
2. Put them into:
   - `public/web-report-themes/modern.css`
   - `public/web-report-themes/matte.css`
   - `public/web-report-themes/crt.css`
   - `public/web-report-themes/kinetic.css`
   - `public/web-report-themes/classic.css` (can be minimal if classic mostly uses base styling)
3. Keep shared non-theme web-report base rules in the main bundled CSS.

Status:

- Substantially complete.
- `classic`, `modern`, `matte`, `crt`, and the bulk of `kinetic` are already split.
- Remaining work is mostly selective cleanup for lower-value `kinetic` leftovers.

### Phase 3: Load theme CSS explicitly

1. Add a dedicated stylesheet loader in `src/web/reportApp.tsx`.
2. When the resolved `uiTheme` changes, swap the `href` for the theme stylesheet.
3. Keep the `body.theme-*` class if you still want selector scoping, but the file load becomes the main theme boundary.

Status:

- Complete.
- This is now how hosted theme loading works.

### Phase 4: Simplify publish logic

1. Keep writing theme values into `report.json`.
2. Stop treating root `theme.json` and `ui-theme.json` as required for report rendering.
3. Remove `reports/<id>/theme.json` writes.
4. Stop publishing root theme files in the normal export/sync path.

Status:

- Largely complete.
- `reports/<id>/theme.json` writes are gone in the GitHub theme sync path.
- Root theme files are no longer written by the main publish/sync paths.

## Remaining Optimization Work

The highest-value remaining work is now narrower and easier to reason about:

1. Optionally remove legacy fallback reads of `stats.uiTheme` / `stats.webThemeId` once older reports with no `stats.reportTheme` are no longer relevant.
2. Optionally add a one-time cleanup path for older GitHub Pages repos that still have legacy root theme files but have not been republished.
3. Otherwise, treat the remaining theme work as maintenance rather than migration.

## Specific Refactor Guidance

### Best split of responsibilities

- `uiTheme` should choose layout/shape/motion/structural styling.
- `webThemeId` should choose palette only.

That means:

- `modern + Arcane` and `modern + Aurora` should use the same CSS file (`modern.css`) with different variables.
- `classic + Arcane` and `classic + Aurora` should use the same CSS file (`classic.css`) with different variables.
- `kinetic + KineticPaperDark` can still use `kinetic.css` with a dark/light palette branch.

### Reduce special-case mapping

Right now `matte`, `kinetic`, and `crt` are partly represented as both UI modes and palette ids.

The cleaner model is:

- UI theme list stays structural: `classic | modern | matte | crt | kinetic`
- Palette list stays visual: `Arcane | Aurora | ... | KineticPaper | KineticPaperDark | MatteSlate | CRT`

But the runtime should not need many cross-maps between the two.

If a theme requires a fixed palette:

- declare that in the settings layer
- persist the final resolved result into the report payload
- keep runtime rendering simple

### Keep overrides, but make them clearly lower priority

Recommended precedence:

1. Query override (optional, explicit)
2. Report payload theme
3. Legacy root fallback
4. Hardcoded default

Cookies should be optional and probably lower priority than the current report payload. A persisted cookie overriding every report can make hosted reports feel inconsistent.

## Net Result

If you follow the plan above, the hosted reports become much simpler to reason about:

- each report declares its own theme
- GitHub Pages serves stable theme CSS files
- the runtime swaps one stylesheet based on the report
- palette changes stay lightweight and data-driven
- global theme files become fallback, not primary state

That is the least fragile version of the architecture you described.

## Short Version

Your instinct is right, but the best split is:

- separate CSS file per **UI theme**
- not separate CSS file per **palette preset**

And the source of truth should be:

- the report's own JSON

Not:

- root `theme.json`
- root `ui-theme.json`
- cookies
- report-local extra files

If you want, the next step is to implement this in two passes:

1. make `report.json` authoritative first
2. then extract `body.web-report.theme-*` rules into `public/web-report-themes/*.css`
