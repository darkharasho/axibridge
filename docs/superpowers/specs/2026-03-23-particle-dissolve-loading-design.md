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

**Color approach:** Use `color-mix(in srgb, var(--brand-primary) N%, transparent)` throughout for alpha-blended brand colors. This works with any `--brand-primary` value (hex, named, etc.) without requiring companion `-rgb` variables.

**Structure:**
- Thin bar (3px height, full width of header)
- Track: `color-mix(in srgb, var(--brand-primary) 8%, transparent)` background
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

**Section wrapping strategy:** Each `<SomeSection />` call in `StatsView.tsx` is wrapped in a thin `<div className={dissolveActive ? 'stats-section--unloaded' : 'stats-section--loaded'}>`. During the dissolve state, 6 particle `<span>` elements are rendered inside this wrapper (conditionally: only when `dissolveActive` is true, removed from DOM when false). This keeps changes localized to `StatsView.tsx` — no modifications to individual section components.

**Unloaded:**
- Card background at reduced opacity: `color-mix(in srgb, var(--bg-card) 40%, transparent)`
- Faint border: `rgba(255, 255, 255, 0.02)`
- Section title visible but muted: `color-mix(in srgb, var(--text-secondary) 30%, transparent)`
- 6 floating particles inside the wrapper (deterministic positions, not random)
  - Particles: small `<span>` elements (2–4px), `border-radius: 50%`
  - Colors: `var(--brand-primary)` and `var(--brand-secondary)` via `color-mix()` at 20–50% opacity
  - Animation: gentle vertical drift with scale variation, 2.5–4s duration, staggered delays
  - Positioned via fixed percentage `top`/`left` values, varied per `nth-child` (e.g., 1st: `top:18%;left:22%`, 2nd: `top:52%;left:68%`, etc.) — deterministic, no JS randomization needed

**Materializing** (brief transition, ~300ms, triggered by `stats-section--materializing` class):
- Particles transition `top`/`left` to `50%` with `transition: top 300ms ease-in, left 300ms ease-in, opacity 200ms` — converging to center
- Ghost content (the real section content) becomes visible at 15–25% opacity underneath
- Card background opacity increases to ~0.65

**Loaded:**
- Particle `<span>` elements removed from DOM (conditional render)
- Real content fades in: `opacity: 0 → 1` + `translateY(6px) → translateY(0)` over 400ms, `ease-out` (via `section-arrive` animation on `.stats-section--loaded`)
- Card border transitions to `var(--accent-border)`
- Section title reaches full color

### 3. Joke Display

Replaces the joke line inside the settling banner.

**Location:** Last child of the stats scroll container, visible only during dissolve state. Not `position: fixed` — simply appended at the bottom of the content area. Since scroll is locked during loading, it appears at the bottom of the visible area. Removed from DOM when `dissolveActive` is false.

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

No changes to state management or hooks, except one new piece of state for the completion delay.

- `statsSettling` memo (StatsView.tsx lines 200–260): drives `progressPercent`, `phaseLabel`, `progressText` — consumed by dissolving bar
- `showStatsSettlingBanner` boolean: renamed/repurposed to `showDissolveLoading` (controls whether dissolve state is active)
- `blurStatsDashboard` boolean: renamed to `dissolveActive` (controls section particle states and scroll lock)
- `statsActionsDisabled`: unchanged, still gates header actions
- Section loaded/unloaded state: keyed off `sectionContentReady` (existing boolean) for the global transition from unloaded → loaded. Individual section data presence is not tracked (all sections transition together when aggregation completes).
- Joke rotation: same `useEffect` with shuffled deck and timer — only the display changes

### Completion delay

When `progressPercent` reaches 100, `dissolveActive` must remain `true` for 500ms to allow the completion animations (bar fade-out burst, section `materializing → loaded` transitions) to play. Implementation:

```tsx
const [dissolveCompleting, setDissolveCompleting] = useState(false);
useEffect(() => {
    if (statsSettling.progressPercent >= 100 && statsSettling.active) {
        setDissolveCompleting(true);
        const timer = setTimeout(() => setDissolveCompleting(false), 500);
        return () => clearTimeout(timer);
    }
}, [statsSettling.progressPercent, statsSettling.active]);

const dissolveActive = (showDissolveLoading && statsSettling.progressPercent < 100) || dissolveCompleting;
```

During the 500ms `dissolveCompleting` window, sections get the `stats-section--materializing` class (particles converge), then transition to `stats-section--loaded` when `dissolveActive` becomes false.

### Details-unavailable edge case

When `detailsUnavailable >= detailsTotal`, the existing code sets `progressPercent: 100` and `active: true`. In this state, the dissolve bar shows at 100% (full), the completion delay fires immediately, and sections transition to loaded. The phase label "Fight details unavailable" is displayed in the header text. No special handling needed — the existing degraded-state messaging flows through the same dissolve bar text.

### Fast loads (< 8 logs)

When fewer than 8 logs are present, aggregation runs synchronously on the main thread. `aggregationProgress` stays `{ active: false, phase: 'idle' }`, so `showDissolveLoading` is never true. No dissolve state is shown — stats render immediately. This is intentional.

### Embedded context

When `embedded` is true (web report viewer), the dissolve loading state is skipped entirely. The `dissolveActive` computation includes a `!embedded` guard, matching the existing pattern where the blur/loading-shell logic already checks `embedded` (line 312).

## JSX Changes

### StatsView.tsx

**Remove:**
- The `stats-settling-banner` div block (lines ~3687–3703)
- The `stats-dashboard-loading-overlay` div
- `body.classList.toggle('stats-dashboard-loading', ...)` effect

**Add:**
- Dissolving progress bar markup inline in the header area (between `DevMockBanner` and the main content div)
- A thin wrapper `<div>` around each `<SomeSection />` call that applies `.stats-section--unloaded` / `.stats-section--materializing` / `.stats-section--loaded` class based on `dissolveActive` and `dissolveCompleting`. When `dissolveActive`, the wrapper also renders 6 particle `<span>` children.
- `dissolveCompleting` state variable + `useEffect` for the 500ms completion delay
- Joke footer div as last child of the scroll container (conditionally rendered when `dissolveActive`)

**Modify:**
- Main content div: remove `stats-dashboard-loading-shell` class toggle, keep `stats-dashboard-scroll-lock` toggle
- Rename `blurStatsDashboard` → `dissolveActive`, `showStatsSettlingBanner` → `showDissolveLoading`

## Performance Considerations

- Particle elements are lightweight empty `<span>`s — no text content, no children
- Per-section particle count: 6 × ~27 visible sections (varies by `sectionVisibility`) = ~160 particle spans during loading. These are conditionally rendered and removed from DOM when `dissolveActive` becomes false.
- All animations are compositor-friendly (transform + opacity). No layout recalculations.
- Off-screen particle spans benefit from the browser's native rendering skip for elements outside the viewport (no explicit `content-visibility` on section cards).
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
