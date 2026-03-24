# Particle Dissolve Loading State

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Replace the blur overlay + plain progress bar in StatsView with a particle dissolve progressive reveal system.

## Problem

The current stats loading state applies a 3px blur + opacity reduction over the entire dashboard and shows a basic cyan banner with a flat progress bar. This feels heavy, disconnected from the app's design language, and visually uninteresting. The user cannot see anything meaningful while stats compute.

## Solution

A **particle dissolve** loading system where:
- Sections start as ghosted containers filled with floating brand-colored particles
- As data arrives, particles condense and real content fades in progressively
- A **dissolving progress bar** in the header replaces the settling banner — its leading edge scatters into particles
- Loading jokes are retained in a subtle footer area
- All content remains non-interactive until computation completes (same as current behavior)

## Components

### 1. Dissolving Progress Bar

Replaces the `stats-settling-banner` entirely.

**Location:** Inside the stats header area, below the title row.

**Structure:**
- Thin bar (3px height, full width of header)
- Track: `rgba(--brand-primary, 0.08)` background
- Fill: `linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))`, width driven by `progressPercent`
- Leading edge: 4–6 small particle `<span>` elements positioned at the fill boundary, each with a unique scatter `@keyframes` animation (varying direction, speed, and fade)
- Soft radial glow at the dissolve frontier

**Header text:**
- Phase label + count displayed inline with the stats header title: e.g. "6 / 14 fights" or "Finalizing squad stats"
- Small pulsing dot (5px, `--brand-primary`) as an activity heartbeat next to the text

**Transitions:**
- Fill width: `transition: width 0.6s ease`
- On completion (100%): particles scatter outward in a final burst, bar fades out over 400ms

### 2. Section Particle States

Replaces the blur overlay and `stats-dashboard-loading-overlay`.

Each stats section card transitions through three visual states:

**Unloaded:**
- Card background at reduced opacity: `rgba(--bg-card, 0.4)`
- Faint border: `rgba(255, 255, 255, 0.02)`
- Section title visible but muted: `rgba(--text-secondary, 0.3)`
- 4–8 floating particles inside the card area
  - Particles: small `<span>` elements (2–4px), `border-radius: 50%`
  - Colors: `--brand-primary` and `--brand-secondary` at 20–50% opacity
  - Animation: gentle vertical drift with scale variation, 2.5–4s duration, staggered delays
  - Positioned randomly within the card bounds via percentage-based `top`/`left`

**Materializing** (brief transition, ~300ms):
- Particles accelerate inward toward center
- Ghost content shapes become visible at 15–25% opacity underneath (suggesting rows/charts forming)
- Card background opacity increases to ~0.65

**Loaded:**
- Particles fade out (`opacity → 0` over 200ms)
- Real content fades in: `opacity: 0 → 1` + `translateY(6px) → translateY(0)` over 400ms, `ease-out`
- Card border transitions to `var(--accent-border)`
- Section title reaches full color

### 3. Joke Display

Replaces the joke line inside the settling banner.

**Location:** Fixed to the bottom of the stats scroll container (above any system chrome).

**Styling:**
- `font-size: 10px`, `font-style: italic`, `color: var(--text-muted)` at 60% opacity
- Background: `linear-gradient(to top, var(--bg-base) 60%, transparent)` to fade into content above
- Padding: 8px horizontal, 10px vertical

**Behavior:**
- Same shuffled-deck rotation logic, 4.2s interval
- Crossfade between jokes: outgoing fades out (200ms), incoming fades in (200ms)

### 4. Interaction Blocking

Same mechanism as current, minus the blur:
- `pointer-events: none` on `#stats-dashboard-container` while loading
- `.stats-dashboard-scroll-lock` class for scroll prevention (`overflow-y: hidden`, `touch-action: none`)
- Header actions disabled via `statsActionsDisabled` flag
- **Removed:** `filter: blur(3px) saturate(0.9)` and `opacity: 0.7` on body/container — the particle states make the loading/loaded distinction visually clear without blanket dimming

## CSS Architecture

### New Classes

```
.stats-dissolve-bar                   — bar track container (3px, rounded, relative)
.stats-dissolve-bar__fill             — gradient fill (absolute, width from progressPercent)
.stats-dissolve-bar__particles        — container for scatter particle spans
.stats-dissolve-bar__glow             — radial glow at leading edge
.stats-dissolve-bar__particle         — individual scatter particle (absolute, small circle)

.stats-dissolve-heartbeat             — pulsing dot next to progress text

.stats-section--unloaded              — ghost card with particles
.stats-section--materializing         — brief inward-acceleration state
.stats-section--loaded                — fade-in with slide-up

.stats-dissolve-particle              — floating particle inside section cards
.stats-dissolve-joke                  — joke footer with gradient backdrop
```

### Removed/Replaced Classes

```
.stats-settling-banner                — removed (replaced by dissolve bar)
.stats-settling-banner__title         — removed
.stats-settling-banner__meta          — removed
.stats-settling-banner__track         — removed
.stats-settling-banner__bar           — removed
.stats-settling-banner__joke          — removed
.stats-dashboard-loading-overlay      — removed (no more overlay div)
body.stats-dashboard-loading rules    — removed (no more blur/opacity)
.stats-dashboard-loading-shell        — removed (no more scrollbar hiding)
```

### Retained

```
.stats-dashboard-scroll-lock          — still needed for scroll/touch prevention
```

### Keyframe Animations

```css
@keyframes dissolve-scatter-N    — 4–6 variants for particle scatter directions
@keyframes dissolve-glow         — pulse opacity on the frontier glow
@keyframes particle-float        — gentle vertical drift for section particles
@keyframes particle-condense     — inward acceleration for materializing state
@keyframes dissolve-heartbeat    — scale/opacity pulse for the activity dot
@keyframes section-arrive        — opacity + translateY for loaded content
@keyframes joke-crossfade        — opacity transition for joke rotation
```

All animations use `transform` and `opacity` only (GPU-composited). No `filter`, `width`, `height`, or layout-triggering properties in keyframes.

### Reduced Motion / Bulk Upload

- `@media (prefers-reduced-motion: reduce)`: disable all particle `@keyframes`, fall back to simple `opacity` fade for section transitions
- `body.bulk-uploading` context: same reduction — skip particle animations, use fade-only transitions (consistent with existing Tier 3 performance optimizations)
- Existing `MotionConfig reducedMotion="always"` during bulk upload already handles Framer Motion; CSS particles need explicit `animation: none` under `body.bulk-uploading`

## Data Flow

No changes to state management or hooks.

- `statsSettling` memo (StatsView.tsx lines 200–260): drives `progressPercent`, `phaseLabel`, `progressText` — consumed by dissolving bar
- `showStatsSettlingBanner` boolean: renamed/repurposed to `showDissolveLoading` (controls whether dissolve state is active)
- `blurStatsDashboard` boolean: renamed to `dissolveActive` (controls section particle states and scroll lock)
- `statsActionsDisabled`: unchanged, still gates header actions
- Section loaded/unloaded state: keyed off `sectionContentReady` (existing boolean) for the global transition from unloaded → loaded. Individual section data presence is not tracked (all sections transition together when aggregation completes).
- Joke rotation: same `useEffect` with shuffled deck and timer — only the display changes

## JSX Changes

### StatsView.tsx

**Remove:**
- The `stats-settling-banner` div block (lines ~3687–3703)
- The `stats-dashboard-loading-overlay` div
- `body.classList.toggle('stats-dashboard-loading', ...)` effect

**Add:**
- Dissolving progress bar component inline in the header area (between `DevMockBanner` and the main content div)
- Section wrapper that applies `.stats-section--unloaded` / `.stats-section--loaded` class based on `dissolveActive`
- Joke footer div at the bottom of the scroll container (visible only when `dissolveActive`)

**Modify:**
- Main content div: remove `stats-dashboard-loading-shell` class toggle, keep `stats-dashboard-scroll-lock` toggle
- Rename `blurStatsDashboard` → `dissolveActive`, `showStatsSettlingBanner` → `showDissolveLoading`

## Performance Considerations

- Particle elements are lightweight empty `<span>`s — no text content, no children
- Per-section particle count (4–8) × ~30 sections = 120–240 particle spans during loading. These are removed from DOM when sections transition to loaded state.
- All animations are compositor-friendly (transform + opacity). No layout recalculations.
- Particles inside off-screen sections benefit from existing `content-visibility: auto` on section cards.
- The dissolving bar has a fixed 4–6 particles — negligible overhead.

## Testing

- Existing unit tests for `statsSettling` computation are unaffected (logic unchanged)
- Visual verification: use `npm run dev` with a dataset large enough to trigger the loading state (>8 logs)
- Reduced motion: verify fallback by setting `prefers-reduced-motion: reduce` in dev tools
- Bulk upload: verify particle animations are suppressed when `body.bulk-uploading` is active

## Out of Scope

- Per-section granular loading (tracking which individual sections have data) — all sections transition together
- Canvas/WebGL particle rendering — CSS-only approach is sufficient for this particle count
- Changes to the web report loading state — this spec covers the Electron renderer only
