# ArcBridge UI Theme Design Spec

Spec version: `v1`  
Applies to: Electron app UI (`src/renderer`) and web report UI (`src/web` + `body.web-report` rules)

## Purpose

Define each supported UI theme as a stable design system contract so future changes stay intentional and consistent.

## Supported Themes

- `classic` (Classic Default)
- `modern` (Modern Slate)
- `matte` (Matte Slate)
- `crt` (CRT Hacker)

## Core Methodology

- Use a token-first approach. Prefer shared CSS variables for color, text, borders, and scrollbars before component-level overrides.
- Keep component structure theme-agnostic in JSX; drive visual differences through `body.theme-*` rules and small theme-conditional class helpers.
- Treat `classic` as baseline behavior; other themes layer overrides for a deliberate style shift.
- Keep app and web report behavior aligned unless a platform-specific rule is intentional (`body.web-report ...`).
- Optimize readability and data scan speed first, decorative treatment second.

## Cross-Theme Rules

- Preserve semantic color meaning across all themes.
- Keep stat density and table legibility stable across themes.
- Avoid adding theme-specific JSX branches unless the layout truly differs.
- Prefer editing existing theme blocks in `src/renderer/index.css` over scattered one-off overrides.
- Any new interactive control must define hover, active, and focus behavior for all themes.
- Any new scroll container must use the global scrollbar variables unless there is a specific custom scrubber pattern.
- If a theme removes effects globally (blur, gradients, radius), new components should follow that same removal pattern.

## Theme Definitions

### 1) Classic (`theme-classic`)

Ideology:
- Familiar ArcBridge identity with neon-glass atmosphere.
- Cinematic depth through glow and gradient accents.
- Default “brand” presentation that feels energetic but readable.

Visual grammar:
- Rounded cards and pills are allowed.
- Glass-like translucency and subtle bloom are allowed.
- Brand cyan/purple gradient language is primary.

Guidelines:
- Keep visual hierarchy strong with contrast and gradients.
- Use decorative effects to frame data, not compete with it.
- Do not flatten Classic into a purely utilitarian slate look.

### 2) Modern Slate (`theme-modern`)

Ideology:
- Dense, operator-focused, no-frills analysis UI.
- Minimal ornamentation and crisp panel separation.
- Prioritize scan speed and consistency for heavy stats workflows.

Visual grammar:
- Flat or near-flat surfaces.
- Nearly zero corner radius (`rounded-*` neutralized).
- Blur/glass effects disabled.
- Tight spacing and compact controls.

Guidelines:
- Keep edges sharp and geometry strict.
- Remove decorative gradients and soft glows in favor of structural contrast.
- Keep typography neutral and clean.
- Do not reintroduce pill-heavy or heavily rounded treatments.

### 3) Matte Slate (`theme-matte`)

Ideology:
- Tactile, calm slate workstation aesthetic.
- Physical depth through soft inset/outset shadows (neumorphic influence).
- Lower visual noise than Classic, softer than Modern.

Visual grammar:
- Stone/slate palette with muted accents.
- Medium corner radii (not square, not full pill for most controls).
- Inset treatment for inputs/containers; raised treatment for cards/buttons.
- Gradients/blur mostly removed in favor of material depth.

Guidelines:
- Use shadow logic consistently: inset for containers/inputs, outset for controls/cards.
- Keep accent colors desaturated and integrated into the slate palette.
- Avoid high-gloss glow effects.
- Avoid mixing Matte with Modern’s fully square style.

### 4) CRT Hacker (`theme-crt`)

Ideology:
- Retro terminal/monitor aesthetic tuned for analytics.
- High thematic identity while preserving data legibility.
- Immersive monochrome-green mood with controlled effects.

Visual grammar:
- Green-forward palette, mono font stack, mild text glow.
- Minimal radius (hard edges).
- Scanline/vignette overlays and dark phosphor-like surfaces.

Guidelines:
- Keep effects atmospheric but restrained so tables stay readable.
- Preserve strong contrast for metric values and controls.
- Avoid introducing off-theme accent colors that break CRT cohesion.

## Implementation Contract

### Theme selection

- Theme is selected via `uiTheme` in app state.
- Body class contract: `theme-classic`, `theme-modern`, `theme-matte`, `theme-crt`.
- Settings labels map to ids as follows: `classic` => Classic (Default), `modern` => Modern Slate, `matte` => Matte Slate, `crt` => CRT Hacker.

### Primary implementation files

- Theme tokens and global overrides: `src/renderer/index.css`
- App shell + theme-aware layout helpers: `src/renderer/app/AppLayout.tsx`
- Theme picker UI copy: `src/renderer/SettingsView.tsx`
- Theme application at runtime: `src/renderer/App.tsx`
- Web report theme application: `src/web/reportApp.tsx`

### CSS architecture expectations

- Put shared variables in `:root` and theme overrides in `body.theme-*` blocks.
- Keep web-report-specific variants grouped under `body.web-report.theme-*`.
- For utility overrides (Tailwind classes), ensure the same selector family is updated across applicable themes.
- Use comments when a rule exists to preserve behavior parity between app and web report.

## Component-Level Guidelines

- Title bar: Must remain readable and visually integrated with the active theme. Fullscreen/expanded modals must account for title-bar offset in app mode.
- Stats dashboard sidebar: Surface, border, blur, and shadow should be derived from theme helper classes in `AppLayout.tsx`. Sidebar and subnav must follow each theme’s depth language.
- Dense tables: Keep vertical scroll ownership inside table regions in fullscreen views. Hide native horizontal scrollbar where custom scrubber is the intended interaction.
- Forms and inputs: Match theme input language (flat for Modern, inset for Matte, phosphor panel for CRT, glass for Classic). Placeholder and secondary text colors must remain legible at small sizes.

## Accessibility and Readability Guardrails

- Maintain sufficient text/background contrast for primary and muted text.
- Preserve numeric legibility in dense tables and KPI cards.
- Effects must not reduce readability of core values, headers, or controls.
- Keyboard-visible focus behavior must remain perceivable even when default outlines are suppressed.

## Change Checklist (for PRs touching themes)

- Confirm behavior in all four themes (`classic`, `modern`, `matte`, `crt`).
- Confirm behavior in app and web-report contexts if shared components are touched.
- Verify no unintended reintroduction of blur/radius/gradient in Modern.
- Verify Matte shadow direction/strength remains consistent (not mixed inset/outset randomly).
- Verify CRT overlays/effects do not obscure key text or controls.
- Verify dense tables, modal layouts, and custom scrollbar interactions still work.
- Update this spec when introducing a new theme rule pattern or visual principle.

## Non-Goals

- This spec does not lock exact pixel values for every component.
- This spec does not define external web-theme packs used for report publishing.
- This spec does not replace implementation comments for one-off technical constraints.
