# Unified Theme Redesign

**Date:** 2026-03-23
**Status:** Proposed

## Summary

Replace all 6 existing UI themes (Classic, Modern, Matte, CRT, Kinetic, Dark Glass) and all web report themes with a single unified theme. The new design uses sharp 4px border radii, Inter typography, solid layered surfaces, and subtle shadows. Users customize through 4 selectable color palettes and an optional glass surface mode. Applies to both the Electron app and the web report viewer.

## Design Decisions

| Aspect | Choice | Details |
|--------|--------|---------|
| Border radius | 4px | Subtle/sharp. Cards, buttons, inputs, badges all use 4px. Inner elements (progress bars, dots) use 2px. |
| Typography | Inter | Primary: `"Inter", system-ui, -apple-system, sans-serif`. Monospace unchanged for code/technical contexts. |
| Surfaces (default) | Solid layered | Opaque background tiers: `--bg-base` → `--bg-elevated` → `--bg-card` → `--bg-card-inner`. No blur. |
| Surfaces (opt-in) | Subtle glass | `rgba(255,255,255,0.035)` backgrounds with `backdrop-filter: blur(12px)`. User toggle in Settings. |
| Shadows | Subtle dark | Cards: `0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)`. Buttons: `0 1px 4px rgba(0,0,0,0.3)`. |
| Color palettes | 4 options | Electric Blue (default), Refined Cyan, Amber Warm, Emerald Mint. User selectable in Settings. |

## Color Palettes

Each palette defines 6 CSS variables. All other variables (backgrounds, borders, text, shadows) are shared.

### Electric Blue (Default)
```css
--brand-primary: #3b82f6;
--brand-secondary: #6366f1;
--brand-gradient: linear-gradient(135deg, #3b82f6, #6366f1);
--accent-bg: rgba(59, 130, 246, 0.10);
--accent-bg-strong: rgba(59, 130, 246, 0.18);
--accent-border: rgba(59, 130, 246, 0.35);
```

### Refined Cyan
```css
--brand-primary: #5eadd5;
--brand-secondary: #7b9fdb;
--brand-gradient: linear-gradient(135deg, #5eadd5, #7b9fdb);
--accent-bg: rgba(94, 173, 213, 0.10);
--accent-bg-strong: rgba(94, 173, 213, 0.18);
--accent-border: rgba(94, 173, 213, 0.35);
```

### Amber Warm
```css
--brand-primary: #f59e0b;
--brand-secondary: #e67e22;
--brand-gradient: linear-gradient(135deg, #f59e0b, #e67e22);
--accent-bg: rgba(245, 158, 11, 0.10);
--accent-bg-strong: rgba(245, 158, 11, 0.18);
--accent-border: rgba(245, 158, 11, 0.35);
```
Note: Secondary uses orange (`#e67e22`) instead of red to avoid conflict with semantic error/danger colors in stats.

### Emerald Mint
```css
--brand-primary: #34d399;
--brand-secondary: #2dd4bf;
--brand-gradient: linear-gradient(135deg, #34d399, #2dd4bf);
--accent-bg: rgba(52, 211, 153, 0.10);
--accent-bg-strong: rgba(52, 211, 153, 0.18);
--accent-border: rgba(52, 211, 153, 0.35);
```

## Shared CSS Variables

```css
:root {
  /* Backgrounds */
  --bg-base: #090b10;
  --bg-elevated: #0f1219;
  --bg-card: #1a1f2e;
  --bg-card-inner: #222838;
  --bg-hover: rgba(255, 255, 255, 0.05);
  --bg-input: #141822;

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-default: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.14);

  /* Text */
  --text-primary: #e8eaed;
  --text-secondary: #8b929e;
  --text-muted: #4a5162;

  /* Shadows */
  --shadow-card: 0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3);
  --shadow-button: 0 1px 4px rgba(0,0,0,0.3);
  --shadow-dropdown: 0 4px 16px rgba(0,0,0,0.5);

  /* Radius */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 8px;  /* Reserved for future use */

  /* Typography */
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

## User Settings

Two new settings replace the existing `uiTheme` / `githubWebTheme` settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `colorPalette` | `'electric-blue' \| 'refined-cyan' \| 'amber-warm' \| 'emerald-mint'` | `'electric-blue'` | Accent color scheme |
| `glassSurfaces` | `boolean` | `false` | Use translucent card backgrounds with backdrop blur |

These apply to both the Electron renderer and the web report. The web report receives these via `report.json` configuration.

## What Gets Removed

### UI Themes (Electron)
- `UiTheme` type and all 6 values (`classic`, `modern`, `matte`, `crt`, `kinetic`, `dark-glass`)
- `uiTheme` setting in electron-store and IPC handlers
- All `body.theme-*` CSS selectors in `index.css` (~4000-5000 lines of theme-specific overrides across ~1400 rule blocks)
- All ternary theme checks in JSX (`uiTheme === 'matte' ? ... : ...`)
- Theme-specific font imports (Manrope, Share Tech Mono, Edu SA Hand)
- Theme-specific CSS variables (`--matte-light`, `--matte-dark`, `--glass-*`, etc.)
- `webThemes.ts` — `BASE_WEB_THEMES` (40+ gradient background definitions), `WebTheme` type, all theme objects. Palette config replaces this.
- `KineticFontStyle`, `KineticThemeVariant`, `DEFAULT_KINETIC_FONT_STYLE`, `DEFAULT_KINETIC_THEME_VARIANT` types and defaults
- `DashboardLayout` type and `dashboardLayout` setting (navigation is now always horizontal)

### Web Report Themes
- All 6 files in `public/web-report-themes/` (`classic.css`, `modern.css`, `matte.css`, `crt.css`, `kinetic.css`, `dark-glass.css`)
- `githubWebTheme` setting
- Dynamic theme CSS loading in the web report
- All theme resolution logic in `reportApp.tsx`: `readReportThemeId()`, `readReportUiTheme()`, `resolveUiThemeFromOverride()`, `isLegacyKineticReport()`, `getWebReportThemeStylesheetHref()`, `ensureWebReportThemeStylesheet()`, `UiThemeChoice` type, cookie/query-param theme overrides

### IPC Channels
- `applyGithubTheme` IPC channel and handler (replaced by palette/glass settings)

### Tests
- `src/shared/__tests__/statsThemesContract.test.ts` (no longer needed — one theme, no duplication risk)
- Theme-related assertions in `SettingsView.test.tsx`

## Component Changes

### Cards
- **Before:** `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl`
- **After:** Tailwind classes map to CSS variables. Solid: `bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-card)]`. Glass mode applies via a CSS class toggle, not per-component logic.

### Buttons
- Primary: solid `--brand-primary` background, white text, 4px radius, subtle shadow
- Secondary: transparent with `--border-default` border, `--text-secondary` text
- Hover: primary brightens via `filter: brightness(1.1)`, secondary border lightens

### Toggles
- Track: 4px radius (not pill-shaped), `--bg-card-inner` background with `--border-default` border
- Knob: 2px radius, `--text-muted` when off, `--brand-primary` when on
- Active track: `--accent-bg-strong` background with `--accent-border`

### Tables
- Header: 9px uppercase with `--text-muted`, separated by `--border-default`
- Rows: `--border-subtle` separators, `--bg-hover` on hover
- Numbers: `font-variant-numeric: tabular-nums`, right-aligned, `--text-primary`
- Top values: `--brand-primary` colored

### Inputs / Selects
- `--bg-input` background, `--border-default` border, 4px radius
- Focus: `--accent-border` with subtle accent ring

### Log Cards
- Horizontal layout: status dot + info + timestamp
- 4px radius, solid card background, subtle shadow
- Hover: border lightens to `--border-hover`

### Navigation
- Horizontal button bar, no background on inactive
- Active: `--brand-primary` text on `--accent-bg` background, 4px radius
- Hover: `--text-primary` on `--bg-hover`

### Modals
- Overlay: `rgba(0,0,0,0.6)` (no backdrop blur by default; with blur in glass mode)
- Card: `--bg-card` background, `--border-default` border, 4px radius, `--shadow-dropdown`

## Glass Surface Mode

When `glassSurfaces` is enabled, a CSS class `glass-surfaces` is added to `<body>`. This single class triggers all glass overrides:

```css
body.glass-surfaces .card-solid,
body.glass-surfaces [data-surface="card"] {
  background: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(12px);
}
```

No per-component logic needed. The solid surface variable definitions remain as fallbacks.

## Web Report Integration

The web report currently loads theme CSS dynamically from `public/web-report-themes/` and has ~200 lines of theme resolution logic in `reportApp.tsx`.

### New Behavior
- The unified theme CSS is embedded directly (no dynamic loading)
- `report.json` includes `colorPalette` and `glassSurfaces` values
- The web report applies palette variables and glass class on load
- All web-report-specific CSS files are deleted
- All theme resolution functions in `reportApp.tsx` are removed

### Backward Compatibility (Published Reports)
Old published `report.json` files embed `reportTheme` with `ui` and `paletteId` fields (from `buildWebReportPayload()` in `githubHandlers.ts`). The new web report viewer must handle these:

- If `report.json` contains `reportTheme.ui` (old format): ignore it, apply `electric-blue` palette as default
- If `report.json` contains `colorPalette` (new format): apply it directly
- The 40+ gradient background themes (`BASE_WEB_THEMES` in `webThemes.ts`) are **removed**. New reports use the unified dark background. Old reports that referenced these gradients will fall back to the new dark base.

### Web Report Build Changes
- `buildWebReportPayload()` in `githubHandlers.ts` updated to emit `colorPalette` and `glassSurfaces` instead of `reportTheme`
- `resolveWebPublishTheme()` and `resolveWebUiThemeChoice()` removed

## Migration Path

### Settings Migration
- On first launch after update, read existing `uiTheme` and map to closest palette:
  - `classic` → `electric-blue`
  - `modern` → `electric-blue`
  - `matte` → `refined-cyan`
  - `crt` → `emerald-mint`
  - `kinetic` → `amber-warm`
  - `dark-glass` → `electric-blue` + `glassSurfaces: true`
- Delete from store: `uiTheme`, `githubWebTheme`, `kineticFontStyle`, `kineticThemeVariant`, `dashboardLayout`

### Settings Import/Export
- `importSettings` handler must also apply the migration mapping when it encounters old `uiTheme`/`githubWebTheme` keys in imported data. This prevents users from importing an old backup and getting broken theme state.

### Existing Web Reports
- Old published `report.json` files with `reportTheme` are handled by backward-compatible reader logic (see Web Report Integration above).

## Font Loading

Inter is loaded via Google Fonts in the HTML head (same pattern as current Space Grotesk):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Remove imports for: Space Grotesk, Manrope, Share Tech Mono, Edu SA Hand. Keep IBM Plex Mono (or similar) for monospace contexts if used.

## Performance Considerations

- Removing 6 themes' worth of CSS overrides (~4000-5000 lines) reduces stylesheet size significantly
- No backdrop-filter by default (solid surfaces) — better rendering performance during bulk uploads
- Glass mode is opt-in, so users on lower-end hardware can avoid the blur cost
- Existing bulk-upload performance optimizations (MotionConfig, CSS containment, display:none) are retained
- `body.bulk-uploading` class continues to disable backdrop-filter even in glass mode

## Files Affected

### CSS (Major)
- `src/renderer/index.css` — Remove ~4000-5000 lines of `body.theme-*` overrides; rewrite `:root` variables; add palette classes and glass mode

### Types & Config
- `src/renderer/global.d.ts` — Remove `UiTheme`, `WebTheme`, `KineticFontStyle`, `KineticThemeVariant`, `DashboardLayout`; add `ColorPalette` type
- `src/shared/webThemes.ts` — Remove `BASE_WEB_THEMES`, all theme objects; replace with palette definitions

### Renderer Components (Theme Logic Removal)
- `src/renderer/App.tsx` — Remove `uiTheme` state, theme-conditional styling
- `src/renderer/app/AppLayout.tsx` — Remove 30+ ternary theme checks for sidebar/nav
- `src/renderer/ExpandableLogCard.tsx` — Remove `theme-classic` body class checks, `matte-log-card` class
- `src/renderer/StatsView.tsx` — Remove `uiTheme` prop, theme-conditional scroll styling
- `src/renderer/SettingsView.tsx` — Replace theme picker with palette picker + glass toggle
- `src/renderer/app/hooks/useSettings.ts` — Remove theme class management, kinetic variant logic; add palette/glass class management
- `src/renderer/stats/hooks/useStatsUploads.ts` — Remove `uiTheme` parameter
- `src/renderer/app/DevDatasetsModal.tsx` — Remove `uiTheme` prop

### Web Report
- `src/web/reportApp.tsx` — Remove ~200 lines of theme resolution logic; add palette/glass reader
- `src/web/rollup.ts` — Update any theme-dependent rendering

### Main Process
- `src/main/handlers/githubHandlers.ts` — Update `buildWebReportPayload()`, remove `resolveWebPublishTheme()`, `resolveWebUiThemeChoice()`
- `src/main/handlers/settingsHandlers.ts` — Remove `uiTheme`/`githubWebTheme` store reads; add `colorPalette`/`glassSurfaces`
- `src/main/index.ts` — Settings migration on startup; remove old theme store keys
- `src/preload/index.ts` — Remove `applyGithubTheme` IPC binding

### Static Assets
- `public/web-report-themes/*.css` — Delete all 6 files

### Tests
- `src/shared/__tests__/statsThemesContract.test.ts` — Delete
- `src/renderer/__tests__/SettingsView.test.tsx` — Update theme-related assertions
- New tests: palette variable application, glass mode toggle, settings migration, old `report.json` backward compat

## Testing Strategy

1. **Unit tests**: Palette CSS variable application, glass mode class toggling, settings migration logic (old theme → new palette mapping), settings import with old keys
2. **Integration tests**: SettingsView renders palette picker and glass toggle correctly
3. **E2E web tests**: Web report renders correctly with new palette; old `report.json` files with `reportTheme` fall back gracefully
4. **Visual verification**: Each palette renders correctly across all views (Dashboard, Stats, History, Settings)
5. **Regression**: Run `npm run audit:metrics` and `npm run test:unit` to ensure no metric/stats regressions from CSS changes

## Mockup Reference

Interactive mockup at: `.superpowers/brainstorm/812005-1774322047/full-mockup.html`
