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
--brand-secondary: #ef4444;
--brand-gradient: linear-gradient(135deg, #f59e0b, #ef4444);
--accent-bg: rgba(245, 158, 11, 0.10);
--accent-bg-strong: rgba(245, 158, 11, 0.18);
--accent-border: rgba(245, 158, 11, 0.35);
```

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

  /* Typography */
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
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
- All `body.theme-*` CSS selectors in `index.css` (estimated ~2000+ lines of theme-specific overrides)
- All ternary theme checks in JSX (`uiTheme === 'matte' ? ... : ...`)
- Theme-specific font imports (Manrope, Share Tech Mono, Edu SA Hand)
- Theme-specific CSS variables (`--matte-light`, `--matte-dark`, `--glass-*`, etc.)
- `webThemes.ts` theme definitions (except what's needed for palette/surface config)

### Web Report Themes
- All 6 files in `public/web-report-themes/` (`classic.css`, `modern.css`, `matte.css`, `crt.css`, `kinetic.css`, `dark-glass.css`)
- `githubWebTheme` setting
- `WebTheme` type
- Dynamic theme CSS loading in the web report

### Tests
- `src/shared/__tests__/statsThemesContract.test.ts` (no longer needed — one theme, no duplication risk)
- Theme-related test fixtures and assertions

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

The web report currently loads theme CSS dynamically from `public/web-report-themes/`. After this change:

- The unified theme CSS is embedded directly (no dynamic loading)
- `report.json` includes `colorPalette` and `glassSurfaces` values
- The web report applies palette variables and glass class on load
- All web-report-specific CSS files are deleted

## Migration Path

### Settings Migration
- On first launch after update, read existing `uiTheme` and map to closest palette:
  - `classic` → `electric-blue`
  - `modern` → `electric-blue`
  - `matte` → `refined-cyan`
  - `crt` → `emerald-mint`
  - `kinetic` → `amber-warm`
  - `dark-glass` → `electric-blue` + `glassSurfaces: true`
- Delete `uiTheme` and `githubWebTheme` from store

### Existing Web Reports
- Previously published web reports include their theme CSS inline. They will continue to work as-is — this only affects newly published reports.

## Font Loading

Inter is loaded via Google Fonts in the HTML head (same pattern as current Space Grotesk):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Remove imports for: Space Grotesk, Manrope, Share Tech Mono, Edu SA Hand. Keep IBM Plex Mono (or similar) for monospace contexts if used.

## Performance Considerations

- Removing 6 themes' worth of CSS overrides (~2000+ lines) reduces stylesheet size significantly
- No backdrop-filter by default (solid surfaces) — better rendering performance during bulk uploads
- Glass mode is opt-in, so users on lower-end hardware can avoid the blur cost
- Existing bulk-upload performance optimizations (MotionConfig, CSS containment, display:none) are retained
- `body.bulk-uploading` class continues to disable backdrop-filter even in glass mode

## Mockup Reference

Interactive mockup at: `.superpowers/brainstorm/812005-1774322047/full-mockup.html`
