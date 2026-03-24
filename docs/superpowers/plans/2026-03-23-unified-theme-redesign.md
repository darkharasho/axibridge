# Unified Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 6 UI themes with a single unified theme offering 4 color palettes and an optional glass surface mode, across both the Electron app and web report.

**Architecture:** Remove ~4000-5000 lines of theme-specific CSS and ~20 files of theme-conditional logic. Replace with CSS custom properties driven by a `colorPalette` setting (4 options) and a `glassSurfaces` boolean. One set of `:root` variables, palette overrides via `body.palette-*` classes, glass mode via `body.glass-surfaces` class.

**Tech Stack:** CSS custom properties, React (useState/useEffect), Electron IPC, TypeScript, vitest

---

## File Structure

### New Files
- None — all changes are modifications to existing files or deletions

### Files to Delete
- `public/web-report-themes/classic.css`
- `public/web-report-themes/modern.css`
- `public/web-report-themes/matte.css`
- `public/web-report-themes/crt.css`
- `public/web-report-themes/kinetic.css`
- `public/web-report-themes/dark-glass.css`
- `src/shared/__tests__/statsThemesContract.test.ts`

### Major Modifications
| File | What Changes |
|------|-------------|
| `src/renderer/global.d.ts` | Replace `UiTheme`/`KineticFontStyle`/`KineticThemeVariant`/`DashboardLayout` with `ColorPalette`; update settings interfaces and defaults |
| `src/shared/webThemes.ts` | Gut entirely — replace with `PALETTES` object defining CSS variable sets per palette |
| `src/renderer/index.css` | Remove ~4000-5000 lines of `body.theme-*` rules; rewrite `:root` variables; add `body.palette-*` and `body.glass-surfaces` selectors |
| `src/renderer/App.tsx` | Remove `uiTheme` state, theme conditionals; pass `colorPalette`/`glassSurfaces` instead |
| `src/renderer/app/hooks/useSettings.ts` | Replace theme class logic with palette/glass class management |
| `src/renderer/SettingsView.tsx` | Replace theme picker with palette swatch picker + glass toggle |
| `src/renderer/app/AppLayout.tsx` | Remove all ternary theme checks from props |
| `src/renderer/StatsView.tsx` | Remove `uiTheme` prop and context value |
| `src/renderer/ExpandableLogCard.tsx` | Remove `theme-classic`/`theme-matte`/`theme-crt` body class checks |
| `src/renderer/app/DevDatasetsModal.tsx` | Remove `uiTheme` prop |
| `src/renderer/stats/hooks/useStatsUploads.ts` | Remove `uiTheme` parameter |
| `src/renderer/app/hooks/useDevDatasets.ts` | Remove `uiTheme`/`UiTheme` references (~6 occurrences) |
| `src/web/reportApp.tsx` | Remove ~200 lines of theme resolution; add palette/glass reader with backward compat |
| `src/main/handlers/githubHandlers.ts` | Rewrite `buildWebReportPayload()`, remove `resolveWebPublishTheme()` |
| `src/main/handlers/settingsHandlers.ts` | Replace `uiTheme`/`githubWebTheme` reads with `colorPalette`/`glassSurfaces` |
| `src/main/index.ts` | Add settings migration; remove old theme store keys; update `applySettings()` |
| `src/preload/index.ts` | Remove `applyGithubTheme` IPC binding |

---

## Task 1: Types & Palette Definitions

**Files:**
- Modify: `src/renderer/global.d.ts:153-262` (type definitions and defaults)
- Modify: `src/shared/webThemes.ts` (full rewrite)

- [ ] **Step 1: Update type definitions in `global.d.ts`**

Replace lines 153-156 (theme types):
```typescript
type ColorPalette = 'electric-blue' | 'refined-cyan' | 'amber-warm' | 'emerald-mint';
```

Remove: `UiTheme`, `KineticFontStyle`, `KineticThemeVariant`, `DashboardLayout` types.

Replace lines 259-262 (defaults):
```typescript
export const DEFAULT_COLOR_PALETTE: ColorPalette = 'electric-blue';
export const DEFAULT_GLASS_SURFACES = false;
```

Remove: `DEFAULT_UI_THEME`, `DEFAULT_KINETIC_FONT_STYLE`, `DEFAULT_KINETIC_THEME_VARIANT`, `DEFAULT_DASHBOARD_LAYOUT`.

Update the settings interface (around lines 287-299) — replace `uiTheme`, `kineticFontStyle`, `kineticThemeVariant`, `dashboardLayout`, `githubWebTheme` with:
```typescript
colorPalette?: ColorPalette;
glassSurfaces?: boolean;
```

Update `IDevDatasetSnapshot` (line 118) — replace `uiTheme?: UiTheme` with `colorPalette?: ColorPalette`.

Also update the `IElectronAPI` interface — anywhere `getSettings` returns or `saveSettings` accepts the old keys, swap them. Search for all occurrences of the removed types throughout the file and update.

- [ ] **Step 2: Rewrite `webThemes.ts` as palette definitions**

Replace the entire file content with:
```typescript
export type ColorPalette = 'electric-blue' | 'refined-cyan' | 'amber-warm' | 'emerald-mint';

export interface PaletteDefinition {
  id: ColorPalette;
  label: string;
  primary: string;
  secondary: string;
  gradient: string;
  accentBg: string;
  accentBgStrong: string;
  accentBorder: string;
}

export const PALETTES: Record<ColorPalette, PaletteDefinition> = {
  'electric-blue': {
    id: 'electric-blue',
    label: 'Electric Blue',
    primary: '#3b82f6',
    secondary: '#6366f1',
    gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    accentBg: 'rgba(59, 130, 246, 0.10)',
    accentBgStrong: 'rgba(59, 130, 246, 0.18)',
    accentBorder: 'rgba(59, 130, 246, 0.35)',
  },
  'refined-cyan': {
    id: 'refined-cyan',
    label: 'Refined Cyan',
    primary: '#5eadd5',
    secondary: '#7b9fdb',
    gradient: 'linear-gradient(135deg, #5eadd5, #7b9fdb)',
    accentBg: 'rgba(94, 173, 213, 0.10)',
    accentBgStrong: 'rgba(94, 173, 213, 0.18)',
    accentBorder: 'rgba(94, 173, 213, 0.35)',
  },
  'amber-warm': {
    id: 'amber-warm',
    label: 'Amber Warm',
    primary: '#f59e0b',
    secondary: '#e67e22',
    gradient: 'linear-gradient(135deg, #f59e0b, #e67e22)',
    accentBg: 'rgba(245, 158, 11, 0.10)',
    accentBgStrong: 'rgba(245, 158, 11, 0.18)',
    accentBorder: 'rgba(245, 158, 11, 0.35)',
  },
  'emerald-mint': {
    id: 'emerald-mint',
    label: 'Emerald Mint',
    primary: '#34d399',
    secondary: '#2dd4bf',
    gradient: 'linear-gradient(135deg, #34d399, #2dd4bf)',
    accentBg: 'rgba(52, 211, 153, 0.10)',
    accentBgStrong: 'rgba(52, 211, 153, 0.18)',
    accentBorder: 'rgba(52, 211, 153, 0.35)',
  },
};

export const DEFAULT_PALETTE_ID: ColorPalette = 'electric-blue';

/** Maps old UiTheme values to new palettes for settings migration */
export const LEGACY_THEME_TO_PALETTE: Record<string, { palette: ColorPalette; glass: boolean }> = {
  classic: { palette: 'electric-blue', glass: false },
  modern: { palette: 'electric-blue', glass: false },
  matte: { palette: 'refined-cyan', glass: false },
  crt: { palette: 'emerald-mint', glass: false },
  kinetic: { palette: 'amber-warm', glass: false },
  'dark-glass': { palette: 'electric-blue', glass: true },
};
```

- [ ] **Step 3: Run typecheck to see what breaks**

Run: `npm run typecheck`
Expected: Many errors — this is expected. The errors map out everywhere the old types are used. Save the error list for reference in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/global.d.ts src/shared/webThemes.ts
git commit -m "feat: replace theme types with ColorPalette and palette definitions"
```

---

## Task 2: Settings Migration Logic

**Files:**
- Modify: `src/main/index.ts:1019-1114` (applySettings, startup migration)
- Modify: `src/main/handlers/settingsHandlers.ts:96-232` (getSettings/saveSettings)
- Test: `src/main/__tests__/settingsMigration.test.ts` (new)

- [ ] **Step 1: Write migration test**

Create `src/main/__tests__/settingsMigration.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { LEGACY_THEME_TO_PALETTE } from '../../shared/webThemes';

describe('settings migration', () => {
  it('maps classic to electric-blue', () => {
    expect(LEGACY_THEME_TO_PALETTE['classic']).toEqual({ palette: 'electric-blue', glass: false });
  });

  it('maps dark-glass to electric-blue with glass enabled', () => {
    expect(LEGACY_THEME_TO_PALETTE['dark-glass']).toEqual({ palette: 'electric-blue', glass: true });
  });

  it('maps matte to refined-cyan', () => {
    expect(LEGACY_THEME_TO_PALETTE['matte']).toEqual({ palette: 'refined-cyan', glass: false });
  });

  it('maps kinetic to amber-warm', () => {
    expect(LEGACY_THEME_TO_PALETTE['kinetic']).toEqual({ palette: 'amber-warm', glass: false });
  });

  it('maps crt to emerald-mint', () => {
    expect(LEGACY_THEME_TO_PALETTE['crt']).toEqual({ palette: 'emerald-mint', glass: false });
  });

  it('maps modern to electric-blue', () => {
    expect(LEGACY_THEME_TO_PALETTE['modern']).toEqual({ palette: 'electric-blue', glass: false });
  });

  it('covers all 6 legacy themes', () => {
    const legacyThemes = ['classic', 'modern', 'matte', 'crt', 'kinetic', 'dark-glass'];
    for (const theme of legacyThemes) {
      expect(LEGACY_THEME_TO_PALETTE[theme]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/main/__tests__/settingsMigration.test.ts`
Expected: PASS (migration map is defined in Task 1)

- [ ] **Step 3: Update `settingsHandlers.ts`**

In the `getSettings` handler (around lines 167-232), replace all reads of `uiTheme`, `kineticFontStyle`, `kineticThemeVariant`, `githubWebTheme` with reads of `colorPalette` and `glassSurfaces`:

```typescript
colorPalette: store.get('colorPalette', 'electric-blue'),
glassSurfaces: store.get('glassSurfaces', false),
```

Remove: `normalizeKineticThemeVariant()`, `inferKineticThemeVariantFromThemeId()` exports.

In the `saveSettings` handler, replace theme key writes with:
```typescript
if (settings.colorPalette !== undefined) store.set('colorPalette', settings.colorPalette);
if (settings.glassSurfaces !== undefined) store.set('glassSurfaces', settings.glassSurfaces);
```

Remove writes of: `uiTheme`, `kineticFontStyle`, `kineticThemeVariant`, `githubWebTheme`.

- [ ] **Step 4: Add startup migration in `index.ts`**

Near the app startup (after store initialization), add migration logic:

```typescript
// Migrate legacy theme settings to new palette system
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
```

Import `LEGACY_THEME_TO_PALETTE` from `../../shared/webThemes`. Remove old theme-related imports from `webThemes.ts` (all the `BASE_WEB_THEMES`, `CRT_WEB_THEME`, etc.).

- [ ] **Step 5: Update `applySettings()` in `index.ts`**

In the `applySettings()` handler (~lines 1019-1114), remove the theme-related blocks:
- Remove: lines handling `uiTheme` (1086-1087)
- Remove: lines handling `kineticFontStyle` (1089-1090)
- Remove: lines handling `kineticThemeVariant` (1092-1093)
- Remove: lines handling `githubWebTheme` (1113-1114)

Add:
```typescript
if (settings.colorPalette !== undefined) {
  store.set('colorPalette', settings.colorPalette);
}
if (settings.glassSurfaces !== undefined) {
  store.set('glassSurfaces', settings.glassSurfaces);
}
```

- [ ] **Step 6: Remove `applyGithubTheme` IPC handler and related plumbing**

In `src/main/handlers/githubHandlers.ts`, find and remove the `ipcMain.handle('apply-github-theme', ...)` handler (~line 1212).

In `src/preload/index.ts`, remove the `applyGithubTheme` line (~line 119).

Also remove all related IPC plumbing:
- `onGithubThemeStatus` / `sendGithubThemeStatus` / `github-theme-status` IPC channel references in `preload/index.ts`, `global.d.ts` (IElectronAPI), and `SettingsView.tsx`.

- [ ] **Step 6b: Update `export-settings` and `import-settings` handlers**

In `settingsHandlers.ts`, find the `export-settings` handler (~lines 195-244). Update it to:
- Export `colorPalette` and `glassSurfaces` instead of `uiTheme`, `kineticFontStyle`, `kineticThemeVariant`, `dashboardLayout`, `githubWebTheme`.

In the `import-settings` handler (~lines 246-268), add migration logic for old exports:
```typescript
// If imported settings contain old theme keys, migrate them
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

Import `LEGACY_THEME_TO_PALETTE` from `../../shared/webThemes`.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/main/handlers/settingsHandlers.ts src/preload/index.ts src/main/__tests__/settingsMigration.test.ts
git commit -m "feat: add settings migration from legacy themes to color palettes"
```

---

## Task 3: CSS Overhaul — Unified Base Styles

**Files:**
- Modify: `src/renderer/index.css:1-6148` (massive rewrite)

This is the largest single task. The approach: keep the `:root` and base styles, replace with new variables, then delete all `body.theme-*` blocks.

- [ ] **Step 1: Rewrite `:root` CSS variables**

In `index.css`, find the existing `:root` block (starts at line 6) and replace ALL CSS variable definitions with the new unified set:

```css
:root {
  /* Electric Blue palette (default) */
  --brand-primary: #3b82f6;
  --brand-secondary: #6366f1;
  --brand-gradient: linear-gradient(135deg, #3b82f6, #6366f1);
  --accent-bg: rgba(59, 130, 246, 0.10);
  --accent-bg-strong: rgba(59, 130, 246, 0.18);
  --accent-border: rgba(59, 130, 246, 0.35);

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
  --radius-lg: 8px;

  /* Scrollbar */
  --scrollbar-size: 10px;
  --scrollbar-track: rgba(8, 12, 18, 0.78);
  --scrollbar-thumb: rgba(146, 163, 184, 0.35);
  --scrollbar-thumb-hover: rgba(148, 163, 184, 0.56);

  font-family: "Inter", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Add palette override selectors**

After the `:root` block, add palette classes:

```css
/* Palette overrides */
body.palette-refined-cyan {
  --brand-primary: #5eadd5;
  --brand-secondary: #7b9fdb;
  --brand-gradient: linear-gradient(135deg, #5eadd5, #7b9fdb);
  --accent-bg: rgba(94, 173, 213, 0.10);
  --accent-bg-strong: rgba(94, 173, 213, 0.18);
  --accent-border: rgba(94, 173, 213, 0.35);
}

body.palette-amber-warm {
  --brand-primary: #f59e0b;
  --brand-secondary: #e67e22;
  --brand-gradient: linear-gradient(135deg, #f59e0b, #e67e22);
  --accent-bg: rgba(245, 158, 11, 0.10);
  --accent-bg-strong: rgba(245, 158, 11, 0.18);
  --accent-border: rgba(245, 158, 11, 0.35);
}

body.palette-emerald-mint {
  --brand-primary: #34d399;
  --brand-secondary: #2dd4bf;
  --brand-gradient: linear-gradient(135deg, #34d399, #2dd4bf);
  --accent-bg: rgba(52, 211, 153, 0.10);
  --accent-bg-strong: rgba(52, 211, 153, 0.18);
  --accent-border: rgba(52, 211, 153, 0.35);
}

/* Glass surface mode */
body.glass-surfaces .stats-view,
body.glass-surfaces .app-shell {
  --bg-card: rgba(255, 255, 255, 0.035);
}
```

Note: `body.palette-electric-blue` is not needed since `:root` defaults to electric-blue values.

- [ ] **Step 3: Delete ALL `body.theme-*` CSS blocks**

This is the bulk deletion. Remove every CSS rule block whose selector starts with or contains `body.theme-classic`, `body.theme-modern`, `body.theme-crt`, `body.theme-matte`, `body.theme-kinetic`, `body.theme-kinetic-dark`, `body.theme-kinetic-slate`, `body.theme-kinetic-font-original`, `body.theme-dark-glass`.

This is approximately 4000-5000 lines. Use a systematic approach:
1. Search for `body.theme-` to find each block
2. Delete the entire rule (including nested rules)
3. Keep any base/non-theme rules that exist between theme blocks

Also remove:
- The Google Fonts import for `Edu SA Hand` (line 1)
- Any `@import` or `@font-face` for Manrope, Share Tech Mono, Edu SA Hand
- The `font-family: "Space Grotesk"` declaration (already replaced by Inter in `:root`)
- Theme-specific CSS variables (`--matte-light`, `--matte-dark`, `--glass-*`, `--kinetic-*`, etc.)

- [ ] **Step 4: Update base component styles to use new variables**

Review the remaining (non-theme) CSS rules and update any that reference old variable names. For example:
- Replace `--glow-primary`/`--glow-secondary` references with `--brand-primary`/`--brand-secondary` opacity variants if they exist in base rules
- Ensure scrollbar styles reference `--scrollbar-*` variables
- Ensure any remaining `.stats-view` rules use the new variable names

- [ ] **Step 5: Add Inter font import**

The project uses `@import url()` in CSS (see `index.css:1` for the existing Edu SA Hand import). Replace the old font import with Inter:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

Remove any existing imports/references for: Space Grotesk, Manrope, Share Tech Mono, Edu SA Hand.

- [ ] **Step 6: Verify CSS parses correctly**

Run: `npm run dev` (or just the Vite build for the renderer)
Expected: App launches without CSS parse errors. It will look broken (components still reference old classes) — that's expected.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.css
git commit -m "feat: replace all theme CSS with unified palette-based variables"
```

---

## Task 4: Settings Hook — Palette & Glass Class Management

**Files:**
- Modify: `src/renderer/app/hooks/useSettings.ts:15-179`

- [ ] **Step 1: Remove old theme logic**

Remove:
- `normalizeKineticThemeVariant()` helper (lines 15-18)
- `inferKineticThemeVariantFromThemeId()` helper (lines 20-24)
- `uiTheme` state (line 33)
- `kineticFontStyle` state (line 34)
- `kineticThemeVariant` state (line 35)
- `dashboardLayout` state (line 36)
- `githubWebTheme` state (line 37)

Add:
```typescript
const [colorPalette, setColorPalette] = useState<ColorPalette>('electric-blue');
const [glassSurfaces, setGlassSurfaces] = useState(false);
```

Import `ColorPalette` from `global.d.ts` (or wherever the type is exported).

- [ ] **Step 2: Update settings load from IPC**

In the `useEffect` that loads settings (around lines 98-107), replace theme reads:
```typescript
if (s.colorPalette) setColorPalette(s.colorPalette);
if (s.glassSurfaces !== undefined) setGlassSurfaces(s.glassSurfaces);
```

Remove reads of: `uiTheme`, `kineticFontStyle`, `kineticThemeVariant`, `githubWebTheme`.

- [ ] **Step 3: Replace body class management**

Replace the theme class effect (lines 152-166) with:

```typescript
useEffect(() => {
  const body = document.body;
  // Remove all palette classes
  body.classList.remove('palette-electric-blue', 'palette-refined-cyan', 'palette-amber-warm', 'palette-emerald-mint');
  // Add current palette (skip electric-blue since it's the :root default)
  if (colorPalette !== 'electric-blue') {
    body.classList.add(`palette-${colorPalette}`);
  }
  // Glass surfaces
  body.classList.toggle('glass-surfaces', glassSurfaces);
}, [colorPalette, glassSurfaces]);
```

- [ ] **Step 4: Update return value**

Replace the returned theme getters/setters (lines 175-179) with:
```typescript
colorPalette, setColorPalette,
glassSurfaces, setGlassSurfaces,
```

Remove from return: `uiTheme`, `setUiTheme`, `setKineticFontStyle`, `setKineticThemeVariant`, `dashboardLayout`, `setDashboardLayout`, `setGithubWebTheme`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app/hooks/useSettings.ts
git commit -m "feat: replace theme class management with palette/glass in useSettings"
```

---

## Task 5: App.tsx & AppLayout.tsx — Remove Theme Props

**Files:**
- Modify: `src/renderer/App.tsx:62-1232`
- Modify: `src/renderer/app/AppLayout.tsx:58-69`

- [ ] **Step 1: Update App.tsx destructuring**

At line 62-66, replace:
```typescript
uiTheme, setUiTheme,
setKineticFontStyle, setKineticThemeVariant,
dashboardLayout, setDashboardLayout,
setGithubWebTheme,
```
with:
```typescript
colorPalette, setColorPalette,
glassSurfaces, setGlassSurfaces,
```

- [ ] **Step 2: Remove theme conditionals in App.tsx**

Remove lines ~575-578:
```typescript
const isModernTheme = uiTheme === 'modern' || uiTheme === 'kinetic';
const isDarkGlassTheme = uiTheme === 'dark-glass';
const isCrtTheme = uiTheme === 'crt';
```

Search for all references to `isModernTheme`, `isDarkGlassTheme`, `isCrtTheme`, `uiTheme` in the file. Each conditional styling block that uses these must be simplified — either pick the unified style or remove the conditional entirely.

For any remaining conditional that was checking theme for styling (e.g., lines 787, 799, 804), replace with the unified style (no conditional needed — one theme).

- [ ] **Step 3: Update props passed to child components**

Line ~1225 (DevDatasetsModal): Remove `uiTheme` prop.
Line ~1228 (FilePickerModal): Remove `uiTheme` prop if present.
Lines ~1231-1232 (AppLayout): Replace theme props with `colorPalette`, `setColorPalette`, `glassSurfaces`, `setGlassSurfaces`.

- [ ] **Step 4: Update AppLayout.tsx props**

In `AppLayout.tsx` (lines 58-69), replace destructured theme props:
- Remove: `uiTheme`, `setUiTheme`, `setKineticFontStyle`, `setKineticThemeVariant`, `setDashboardLayout`, `setGithubWebTheme`
- Add: `colorPalette`, `setColorPalette`, `glassSurfaces`, `setGlassSurfaces`

Remove ALL ternary theme checks in AppLayout (the ~30+ instances). These will be expressions like:
```typescript
uiTheme === 'matte' ? 'some-class' : 'other-class'
```
Replace each with the unified class/style (choose what makes sense for the new design).

Pass the new props through to `SettingsView` where needed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/app/AppLayout.tsx
git commit -m "feat: remove theme props from App and AppLayout, use palette/glass"
```

---

## Task 6: Component Cleanup — Remove Theme References

**Files:**
- Modify: `src/renderer/ExpandableLogCard.tsx:548-550`
- Modify: `src/renderer/StatsView.tsx:80,149,562,3574-3585`
- Modify: `src/renderer/app/DevDatasetsModal.tsx:27,102`
- Modify: `src/renderer/stats/hooks/useStatsUploads.ts`
- Modify: `src/renderer/stats/StatsViewContext.tsx` (if it holds `uiTheme`)
- Modify: `src/renderer/app/hooks/useDevDatasets.ts` (~6 `uiTheme`/`UiTheme` references)

- [ ] **Step 1: Fix ExpandableLogCard.tsx**

At lines 548-550, the dark theme detection checks `theme-classic`, `theme-matte`, `theme-crt` body classes. Since the unified theme is always dark, simplify to always return `true` (or just remove the check and hard-code the dark behavior):

```typescript
// The unified theme is always dark
const isDarkTheme = true;
```

Or if this controls a specific visual behavior, just remove the conditional and use the dark path.

- [ ] **Step 2: Fix StatsView.tsx**

- Line 80: Remove `uiTheme` from props interface
- Line 149: Remove `uiTheme` from destructured props
- Line 562: Remove `uiTheme` from context value (or set a static value if context consumers need it during transition)
- Lines 3574-3585: Remove conditional styling based on `uiTheme`/`embedded`. Use the unified style.

Check `src/renderer/stats/StatsViewContext.tsx` — if it defines `uiTheme` in the context type, remove it. Search for consumers: `useContext` calls that read `uiTheme` from the stats context.

- [ ] **Step 3: Fix DevDatasetsModal.tsx**

- Line 27: Remove `uiTheme` from destructured props
- Line 102: Remove `uiTheme` from passed-through props

Update the component's props interface to remove `uiTheme`.

- [ ] **Step 4: Fix useStatsUploads.ts**

Find and remove the `uiTheme` parameter. This was used when building the web report payload — it will now read `colorPalette` from settings or not need theme info at all (handled by githubHandlers).

- [ ] **Step 5: Fix useDevDatasets.ts**

In `src/renderer/app/hooks/useDevDatasets.ts`, find and replace all `uiTheme`/`UiTheme` references (~6 occurrences). Replace with `colorPalette`/`ColorPalette` where the type is used in dataset snapshots. If `uiTheme` is stored in dataset snapshots (`IDevDatasetSnapshot`), update to use `colorPalette` instead.

- [ ] **Step 6: Search for any remaining `uiTheme` references in renderer**

Run: `grep -r "uiTheme" src/renderer/` — fix any remaining references.
Run: `grep -r "theme-classic\|theme-modern\|theme-crt\|theme-matte\|theme-kinetic\|theme-dark-glass" src/renderer/` — fix any remaining theme class references.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/ExpandableLogCard.tsx src/renderer/StatsView.tsx src/renderer/app/DevDatasetsModal.tsx src/renderer/stats/hooks/useStatsUploads.ts src/renderer/stats/StatsViewContext.tsx src/renderer/app/hooks/useDevDatasets.ts
git commit -m "feat: remove all uiTheme references from renderer components"
```

---

## Task 7: SettingsView — Palette Picker & Glass Toggle

**Files:**
- Modify: `src/renderer/SettingsView.tsx:4-540`

- [ ] **Step 1: Remove old theme imports and helpers**

Remove from imports (line 4-6):
- `UiTheme`, `DEFAULT_UI_THEME`, `KineticFontStyle`, `DEFAULT_KINETIC_FONT_STYLE`, `KineticThemeVariant`, `DEFAULT_KINETIC_THEME_VARIANT`
- `BASE_WEB_THEMES`, `CRT_WEB_THEME`, etc. from webThemes

Add imports:
```typescript
import { PALETTES, type ColorPalette } from '../../shared/webThemes';
import { DEFAULT_COLOR_PALETTE, DEFAULT_GLASS_SURFACES } from '../global.d';
```

Remove helper functions (lines 16-37): `normalizeKineticThemeVariant`, `getKineticThemeIdForVariant`, `inferKineticThemeVariantFromThemeId`, `isKineticWebThemeId`.

- [ ] **Step 2: Update props interface**

Remove from props (~lines 131-135):
- `onUiThemeSaved`
- `onKineticFontStyleSaved`
- `onKineticThemeVariantSaved`
- `onGithubWebThemeSaved`

Add:
```typescript
onColorPaletteSaved?: (palette: ColorPalette) => void;
onGlassSurfacesSaved?: (glass: boolean) => void;
colorPalette?: ColorPalette;
glassSurfaces?: boolean;
```

- [ ] **Step 3: Update state**

Remove state (lines 221-228):
- `uiTheme`, `kineticFontStyle`, `kineticThemeVariant`, `githubWebTheme`

Add:
```typescript
const [colorPalette, setColorPalette] = useState<ColorPalette>(props.colorPalette ?? DEFAULT_COLOR_PALETTE);
const [glassSurfaces, setGlassSurfaces] = useState(props.glassSurfaces ?? DEFAULT_GLASS_SURFACES);
```

- [ ] **Step 4: Replace theme picker UI**

Find the existing theme picker section (the section that renders UI theme buttons and web theme dropdown). Replace the entire section with a palette picker:

```tsx
{/* Appearance */}
<div className="card-solid">
  <h3 className="card-title mb-3">Appearance</h3>

  <div className="mb-4">
    <label className="stat-label mb-2 block">Color Palette</label>
    <div className="flex gap-2">
      {Object.values(PALETTES).map((p) => (
        <button
          key={p.id}
          className={`w-9 h-9 rounded-[var(--radius-md)] border-2 transition-all ${
            colorPalette === p.id ? 'border-[var(--text-primary)] scale-110' : 'border-transparent'
          }`}
          style={{ background: p.gradient }}
          title={p.label}
          onClick={() => {
            setColorPalette(p.id);
            onColorPaletteSaved?.(p.id);
            window.electronAPI.saveSettings({ colorPalette: p.id });
          }}
        />
      ))}
    </div>
  </div>

  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
    <div>
      <div className="text-sm text-[var(--text-primary)]">Glass surfaces</div>
      <div className="text-xs text-[var(--text-muted)]">Translucent card backgrounds with subtle blur</div>
    </div>
    <ToggleSwitch
      checked={glassSurfaces}
      onChange={(v) => {
        setGlassSurfaces(v);
        onGlassSurfacesSaved?.(v);
        window.electronAPI.saveSettings({ glassSurfaces: v });
      }}
    />
  </div>
</div>
```

Remove: the entire web theme dropdown section, kinetic font style picker, kinetic variant picker, dashboard layout toggle (if it was in settings).

- [ ] **Step 5: Remove theme sync logic**

Remove lines 515-540 (the logic that auto-selects matching web theme when UI theme changes). No longer needed.

Remove lines 302-312 (web theme filtering/sorting). No longer needed.

- [ ] **Step 6: Update IMPORT_SETTING_META**

At line 95 and 108, replace the `uiTheme` and `githubWebTheme` entries with `colorPalette` and `glassSurfaces`. Also remove entries for `dashboardLayout`, `kineticFontStyle`, `kineticThemeVariant`:

```typescript
colorPalette: { validate: (v: string) => ['electric-blue', 'refined-cyan', 'amber-warm', 'emerald-mint'].includes(v) },
glassSurfaces: { validate: (v: unknown) => typeof v === 'boolean' },
```

Also remove the `isModernLayout` variable (~line 313) which checked all theme names and was always true.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/SettingsView.tsx
git commit -m "feat: replace theme picker with palette selector and glass toggle"
```

---

## Task 8: Web Report — Theme Resolution Rewrite

**Files:**
- Modify: `src/web/reportApp.tsx:87-395,471-515,1220-1373`
- Modify: `src/main/handlers/githubHandlers.ts:8-520,1212,1405-1408`

- [ ] **Step 1: Rewrite reportApp.tsx theme resolution**

Remove (lines 87-395):
- `UiThemeChoice`, `KineticWebFontChoice`, `KineticThemeVariantChoice` types
- `WEB_THEME_OVERRIDE_COOKIE`, `KINETIC_WEB_FONT_OVERRIDE_COOKIE` constants
- `WEB_REPORT_THEME_STYLESHEET_ID` constant
- `getWebReportThemeStylesheetHref()` function
- `ensureWebReportThemeStylesheet()` function
- `resolveUiThemeFromOverride()` function
- `readReportThemeId()` function
- `readReportUiTheme()` function
- `parseSiteTheme()` function

Add a simple palette reader:

```typescript
import { PALETTES, type ColorPalette, DEFAULT_PALETTE_ID, LEGACY_THEME_TO_PALETTE } from '../shared/webThemes';

function readPaletteFromReport(stats: any): { palette: ColorPalette; glass: boolean } {
  // New format: stats.colorPalette
  if (stats?.colorPalette && stats.colorPalette in PALETTES) {
    return { palette: stats.colorPalette, glass: stats.glassSurfaces ?? false };
  }
  // Legacy format: stats.reportTheme.ui
  if (stats?.reportTheme?.ui) {
    const mapping = LEGACY_THEME_TO_PALETTE[stats.reportTheme.ui];
    if (mapping) return mapping;
  }
  // Older legacy format: stats.uiTheme directly
  if (stats?.uiTheme) {
    const mapping = LEGACY_THEME_TO_PALETTE[stats.uiTheme];
    if (mapping) return mapping;
  }
  return { palette: DEFAULT_PALETTE_ID, glass: false };
}
```

- [ ] **Step 2: Update reportApp.tsx state**

Replace state (lines 471-474):
```typescript
const [colorPalette, setColorPalette] = useState<ColorPalette>('electric-blue');
const [glassSurfaces, setGlassSurfaces] = useState(false);
```

Remove: `uiTheme`, `defaultUiTheme`, `siteTheme`, `siteThemeRef` state.

- [ ] **Step 3: Update report load effect**

Where the report data is loaded and theme is resolved (~lines 1220-1224), replace with:

```typescript
const { palette, glass } = readPaletteFromReport(reportData.stats);
setColorPalette(palette);
setGlassSurfaces(glass);
```

- [ ] **Step 4: Apply palette classes in effect**

Add a `useEffect` to apply palette/glass classes to the body:

```typescript
useEffect(() => {
  const body = document.body;
  body.classList.remove('palette-electric-blue', 'palette-refined-cyan', 'palette-amber-warm', 'palette-emerald-mint');
  if (colorPalette !== 'electric-blue') {
    body.classList.add(`palette-${colorPalette}`);
  }
  body.classList.toggle('glass-surfaces', glassSurfaces);
}, [colorPalette, glassSurfaces]);
```

Remove: the existing `useEffect` that calls `ensureWebReportThemeStylesheet()`.

- [ ] **Step 5: Update githubHandlers.ts**

Remove (lines 8-20): imports of all web theme constants.
Remove: `normalizeUiThemeChoice()` (~line 400-413).
Remove: `resolveWebUiThemeChoice()` (~line 407-425).
Remove: `resolveWebPublishTheme()` (~line 414-426).
Remove: `apply-github-theme` IPC handler (~line 1212).

Update `buildWebReportPayload()` (~line 446): replace the `reportTheme` object with:
```typescript
colorPalette: store.get('colorPalette', 'electric-blue'),
glassSurfaces: store.get('glassSurfaces', false),
```

Update any calls at lines 1405-1408 and 1495, 1659 that reference old theme resolution.

- [ ] **Step 6: Write tests for `readPaletteFromReport` backward compat**

Create or add to `src/web/__tests__/reportPalette.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { readPaletteFromReport } from '../reportApp';

describe('readPaletteFromReport', () => {
  it('reads new format colorPalette', () => {
    expect(readPaletteFromReport({ colorPalette: 'amber-warm', glassSurfaces: true }))
      .toEqual({ palette: 'amber-warm', glass: true });
  });

  it('reads legacy reportTheme.ui format', () => {
    expect(readPaletteFromReport({ reportTheme: { ui: 'matte', paletteId: 'MatteSlate' } }))
      .toEqual({ palette: 'refined-cyan', glass: false });
  });

  it('reads older legacy stats.uiTheme format', () => {
    expect(readPaletteFromReport({ uiTheme: 'dark-glass' }))
      .toEqual({ palette: 'electric-blue', glass: true });
  });

  it('falls back to electric-blue for unknown data', () => {
    expect(readPaletteFromReport({}))
      .toEqual({ palette: 'electric-blue', glass: false });
  });

  it('prefers new format over legacy', () => {
    expect(readPaletteFromReport({ colorPalette: 'emerald-mint', reportTheme: { ui: 'matte' } }))
      .toEqual({ palette: 'emerald-mint', glass: false });
  });
});
```

Note: `readPaletteFromReport` must be exported from `reportApp.tsx` for testability.

- [ ] **Step 7: Commit**

```bash
git add src/web/reportApp.tsx src/main/handlers/githubHandlers.ts src/web/__tests__/reportPalette.test.ts
git commit -m "feat: replace web report theme resolution with palette/glass reader"
```

---

## Task 9: Delete Old Files & Tests

**Files:**
- Delete: `public/web-report-themes/classic.css`
- Delete: `public/web-report-themes/modern.css`
- Delete: `public/web-report-themes/matte.css`
- Delete: `public/web-report-themes/crt.css`
- Delete: `public/web-report-themes/kinetic.css`
- Delete: `public/web-report-themes/dark-glass.css`
- Delete: `src/shared/__tests__/statsThemesContract.test.ts`
- Modify: `src/renderer/__tests__/SettingsView.test.tsx`

- [ ] **Step 1: Delete web report theme CSS files**

```bash
rm public/web-report-themes/classic.css
rm public/web-report-themes/modern.css
rm public/web-report-themes/matte.css
rm public/web-report-themes/crt.css
rm public/web-report-themes/kinetic.css
rm public/web-report-themes/dark-glass.css
```

If the `public/web-report-themes/` directory is now empty, delete it too.

- [ ] **Step 2: Delete statsThemesContract test**

```bash
rm src/shared/__tests__/statsThemesContract.test.ts
```

- [ ] **Step 3: Update SettingsView tests**

In `src/renderer/__tests__/SettingsView.test.tsx`:
- Remove tests at lines 167-196 (kinetic theme variant mapping, kinetic web theme ID validation)
- Remove UI theme picker assertions at lines 331, 366
- Add new tests for palette picker rendering and glass toggle

```typescript
it('renders palette picker with 4 options', () => {
  // render SettingsView
  // expect 4 palette buttons
});

it('renders glass surfaces toggle', () => {
  // render SettingsView
  // expect toggle element
});
```

- [ ] **Step 4: Run all tests**

Run: `npm run test:unit`
Expected: All tests pass (some may need additional fixes — address any failures).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete legacy theme CSS files and update tests"
```

---

## Task 10: Final Cleanup & Grep Sweep

**Files:**
- Various — catch-all for remaining references

- [ ] **Step 1: Grep for all remaining legacy references**

Run each of these and fix any hits:
```bash
grep -r "UiTheme" src/ --include="*.ts" --include="*.tsx"
grep -r "uiTheme" src/ --include="*.ts" --include="*.tsx"
grep -r "WebTheme" src/ --include="*.ts" --include="*.tsx"
grep -r "githubWebTheme" src/ --include="*.ts" --include="*.tsx"
grep -r "KineticFontStyle\|KineticThemeVariant\|DashboardLayout" src/ --include="*.ts" --include="*.tsx"
grep -r "theme-classic\|theme-modern\|theme-crt\|theme-matte\|theme-kinetic\|theme-dark-glass" src/ --include="*.ts" --include="*.tsx" --include="*.css"
grep -r "applyGithubTheme\|onGithubThemeStatus\|github-theme-status\|sendGithubThemeStatus" src/ --include="*.ts" --include="*.tsx"
grep -r "Space Grotesk\|Manrope\|Share Tech Mono\|Edu SA Hand" src/ --include="*.ts" --include="*.tsx" --include="*.css"
grep -r "isModernLayout\|DARK_GLASS_PREVIEW\|availableWebThemes\|orderedThemes" src/ --include="*.ts" --include="*.tsx"
```

Fix every remaining reference found.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: Zero warnings (max-warnings 0)

- [ ] **Step 4: Run full test suite**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 5: Run validate**

Run: `npm run validate`
Expected: PASS (typecheck + lint)

- [ ] **Step 6: Visual smoke test**

Run: `npm run dev`
- Verify the app launches with Electric Blue palette
- Switch to each palette in Settings — verify colors change
- Toggle glass surfaces — verify cards become translucent
- Navigate to Stats, Dashboard, History — verify no visual breakage
- Check log cards render correctly

- [ ] **Step 7: Web report smoke test**

Run: `npm run dev:web`
- Open http://localhost:4173
- Verify the web report renders with the default palette
- Verify no console errors related to missing theme CSS

- [ ] **Step 8: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup of legacy theme references"
```

---

## Task Summary

| Task | Description | Est. Scope |
|------|-------------|-----------|
| 1 | Types & palette definitions | ~100 lines changed |
| 2 | Settings migration logic | ~80 lines changed |
| 3 | CSS overhaul (massive) | ~4500 lines deleted, ~100 added |
| 4 | useSettings hook | ~60 lines changed |
| 5 | App.tsx & AppLayout.tsx | ~100 lines changed |
| 6 | Component cleanup (5 files) | ~50 lines changed |
| 7 | SettingsView rewrite | ~300 lines changed |
| 8 | Web report + githubHandlers | ~400 lines changed |
| 9 | Delete old files & update tests | ~2300 lines deleted |
| 10 | Final grep sweep & validation | Variable |

**Total estimated: ~5000 lines deleted, ~800 lines added/modified**
