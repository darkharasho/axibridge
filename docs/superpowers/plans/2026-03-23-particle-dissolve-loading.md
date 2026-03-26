# Particle Dissolve Loading State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blur overlay + plain progress bar in StatsView with a particle dissolve progressive reveal loading state.

**Architecture:** CSS-only particle animations layered onto existing StatsView section rendering. A dissolving progress bar replaces the settling banner. Section wrappers apply ghost/loaded states. No new hooks — only a `dissolveCompleting` state variable for the 500ms completion delay. All changes are presentation-layer within `StatsView.tsx` and `index.css`.

**Tech Stack:** React (existing), CSS keyframe animations, Tailwind utility classes, existing `statsSettling` state

**Spec:** `docs/superpowers/specs/2026-03-23-particle-dissolve-loading-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/index.css` | Modify | Remove old settling/blur CSS (~lines 947–1013), add dissolve bar, section states, particle, joke CSS + keyframes |
| `src/renderer/StatsView.tsx` | Modify | Remove settling banner JSX + blur logic, add dissolve bar markup, section wrappers, joke footer, `dissolveCompleting` state |

No new files. No changes to hooks, shared code, or section components.

---

## Task 1: Remove Old CSS

**Files:**
- Modify: `src/renderer/index.css:947-1013`

- [ ] **Step 1: Delete old settling banner and blur CSS**

Remove these class blocks from `index.css` (lines 947–1013):

```css
/* DELETE all of these: */
.stats-settling-banner { ... }
.stats-settling-banner__title { ... }
.stats-settling-banner__meta { ... }
.stats-settling-banner__track { ... }
.stats-settling-banner__bar { ... }
.stats-dashboard-loading-overlay { ... }
.stats-dashboard-loading-shell { ... }
.stats-dashboard-loading-shell #stats-dashboard-container { ... }
.stats-dashboard-loading-shell, .stats-dashboard-loading-shell * { scrollbar-color ... }
.stats-dashboard-loading-shell::-webkit-scrollbar, ... { ... }
body.stats-dashboard-loading .stats-dashboard-nav-panel { ... }
body.stats-dashboard-loading #stats-dashboard-container { ... }
```

Keep `.stats-dashboard-scroll-lock` (lines 978–982) — it's still needed.

- [ ] **Step 2: Verify no CSS regressions**

Run: `npm run validate`
Expected: PASS (typecheck + lint). The removed CSS classes are referenced in JSX that we'll update in Task 3, but CSS removal alone won't break the build.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.css
git commit -m "refactor: remove old settling banner and blur CSS from index.css"
```

---

## Task 2: Add Dissolve CSS

**Files:**
- Modify: `src/renderer/index.css` (insert after the retained `.stats-dashboard-scroll-lock` block)

- [ ] **Step 1: Add keyframe animations**

Insert after `.stats-dashboard-scroll-lock` block:

```css
/* ── Particle dissolve loading: keyframes ── */

@keyframes dissolve-scatter-1 {
  0% { transform: translate(0, 0) scale(1); opacity: 0.8; }
  100% { transform: translate(14px, -10px) scale(0); opacity: 0; }
}
@keyframes dissolve-scatter-2 {
  0% { transform: translate(0, 0) scale(1); opacity: 0.7; }
  100% { transform: translate(10px, 8px) scale(0); opacity: 0; }
}
@keyframes dissolve-scatter-3 {
  0% { transform: translate(0, 0) scale(1); opacity: 0.6; }
  100% { transform: translate(18px, -5px) scale(0); opacity: 0; }
}
@keyframes dissolve-scatter-4 {
  0% { transform: translate(0, 0) scale(1); opacity: 0.7; }
  100% { transform: translate(8px, 11px) scale(0); opacity: 0; }
}
@keyframes dissolve-scatter-5 {
  0% { transform: translate(0, 0) scale(1); opacity: 0.5; }
  100% { transform: translate(22px, -7px) scale(0); opacity: 0; }
}

@keyframes dissolve-glow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

@keyframes particle-float {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.25; }
  25% { transform: translateY(-7px) scale(1.15); opacity: 0.6; }
  50% { transform: translateY(-2px) scale(0.85); opacity: 0.4; }
  75% { transform: translateY(-9px) scale(1.05); opacity: 0.55; }
}

@keyframes dissolve-heartbeat {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.3); }
}

@keyframes section-arrive {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Add dissolve bar styles**

```css
/* ── Dissolve progress bar ── */

.stats-dissolve-bar {
  position: relative;
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
  overflow: visible;
  margin-top: 8px;
}

.stats-dissolve-bar__fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--brand-primary), var(--brand-secondary));
  transition: width 0.6s ease;
}

.stats-dissolve-bar__glow {
  position: absolute;
  top: -4px;
  width: 10px;
  height: 11px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--brand-secondary) 50%, transparent), transparent);
  animation: dissolve-glow 1.5s ease-in-out infinite;
  pointer-events: none;
}

.stats-dissolve-bar__particle {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.stats-dissolve-bar__particle:nth-child(1) {
  width: 3px; height: 3px;
  background: var(--brand-secondary);
  animation: dissolve-scatter-1 1.8s ease-out infinite;
}
.stats-dissolve-bar__particle:nth-child(2) {
  width: 2px; height: 2px;
  background: var(--brand-primary);
  animation: dissolve-scatter-2 1.8s ease-out infinite 0.2s;
}
.stats-dissolve-bar__particle:nth-child(3) {
  width: 2px; height: 2px;
  background: var(--brand-secondary);
  animation: dissolve-scatter-3 1.8s ease-out infinite 0.5s;
}
.stats-dissolve-bar__particle:nth-child(4) {
  width: 3px; height: 3px;
  background: var(--brand-primary);
  animation: dissolve-scatter-4 1.8s ease-out infinite 0.3s;
}
.stats-dissolve-bar__particle:nth-child(5) {
  width: 2px; height: 2px;
  background: var(--brand-secondary);
  animation: dissolve-scatter-5 1.8s ease-out infinite 0.7s;
}

.stats-dissolve-heartbeat {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--brand-primary);
  animation: dissolve-heartbeat 1.8s ease-in-out infinite;
  vertical-align: middle;
  margin-right: 6px;
}
```

- [ ] **Step 3: Add section state styles**

```css
/* ── Section dissolve states ── */

.stats-section-wrap {
  position: relative;
}

.stats-section-wrap--unloaded {
  opacity: 1;
}

.stats-section-wrap--unloaded > :first-child {
  opacity: 0.35;
  pointer-events: none;
}

.stats-section-wrap--materializing > :first-child {
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 300ms ease;
}

.stats-section-wrap--loaded > :first-child {
  animation: section-arrive 400ms ease-out both;
}

/* Floating particles inside unloaded sections */
.stats-dissolve-particle {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 2;
}

.stats-dissolve-particle:nth-child(1) { top: 18%; left: 22%; width: 3px; height: 3px; background: color-mix(in srgb, var(--brand-primary) 40%, transparent); animation: particle-float 3.2s ease-in-out infinite; }
.stats-dissolve-particle:nth-child(2) { top: 52%; left: 68%; width: 2px; height: 2px; background: color-mix(in srgb, var(--brand-secondary) 35%, transparent); animation: particle-float 2.8s ease-in-out infinite 0.5s; }
.stats-dissolve-particle:nth-child(3) { top: 35%; left: 85%; width: 3px; height: 3px; background: color-mix(in srgb, var(--brand-primary) 30%, transparent); animation: particle-float 3.6s ease-in-out infinite 1.0s; }
.stats-dissolve-particle:nth-child(4) { top: 72%; left: 15%; width: 2px; height: 2px; background: color-mix(in srgb, var(--brand-secondary) 45%, transparent); animation: particle-float 2.5s ease-in-out infinite 1.5s; }
.stats-dissolve-particle:nth-child(5) { top: 25%; left: 48%; width: 4px; height: 4px; background: color-mix(in srgb, var(--brand-primary) 25%, transparent); animation: particle-float 3.8s ease-in-out infinite 0.8s; }
.stats-dissolve-particle:nth-child(6) { top: 65%; left: 78%; width: 2px; height: 2px; background: color-mix(in srgb, var(--brand-secondary) 30%, transparent); animation: particle-float 3.0s ease-in-out infinite 1.3s; }

/* Materializing: particles converge to center */
.stats-section-wrap--materializing .stats-dissolve-particle {
  transition: top 300ms ease-in, left 300ms ease-in, opacity 200ms;
  top: 50% !important;
  left: 50% !important;
  opacity: 0;
}
```

- [ ] **Step 4: Add joke footer and reduced-motion styles**

```css
/* ── Joke footer ── */

.stats-dissolve-joke {
  text-align: center;
  padding: 10px 16px;
  font-size: 10px;
  font-style: italic;
  color: var(--text-muted);
  opacity: 0.6;
  background: linear-gradient(to top, var(--bg-base) 60%, transparent);
}

/* ── Reduced motion / bulk upload ── */

@media (prefers-reduced-motion: reduce) {
  .stats-dissolve-bar__particle,
  .stats-dissolve-bar__glow,
  .stats-dissolve-heartbeat,
  .stats-dissolve-particle {
    animation: none !important;
  }

  .stats-section-wrap--loaded > :first-child {
    animation: none;
    opacity: 1;
  }
}

body.bulk-uploading .stats-dissolve-bar__particle,
body.bulk-uploading .stats-dissolve-bar__glow,
body.bulk-uploading .stats-dissolve-heartbeat,
body.bulk-uploading .stats-dissolve-particle {
  animation: none !important;
}

body.bulk-uploading .stats-section-wrap--loaded > :first-child {
  animation: none;
  opacity: 1;
}
```

- [ ] **Step 5: Verify CSS is valid**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.css
git commit -m "feat: add particle dissolve CSS — bar, sections, particles, keyframes"
```

---

## Task 3: Update StatsView JSX and State

**Files:**
- Modify: `src/renderer/StatsView.tsx:148-320` (state/logic area)
- Modify: `src/renderer/StatsView.tsx:3687-3716` (banner + content area)
- Modify: `src/renderer/StatsView.tsx:3717-4096` (modern layout section wrappers)
- Modify: `src/renderer/StatsView.tsx:4098-4491` (classic layout section wrappers — ~30 sections)
- Modify: `src/renderer/StatsView.tsx:4498-4500` (loading overlay div)

This is the largest task. It modifies only `StatsView.tsx` but touches several regions.

- [ ] **Step 1: Add `dissolveCompleting` state and rename variables**

In `StatsView.tsx`, after the existing state declarations (~line 165–170), find:

```tsx
const showStatsSettlingBanner = statsSettling.active;
const statsSettlingBannerTitle = statsSettling.phaseLabel;
const statsSettlingBannerMeta = statsSettling.progressText;
const blurStatsDashboard = showStatsSettlingBanner && statsSettling.progressPercent < 100;
```

Replace with:

```tsx
const showDissolveLoading = statsSettling.active && !embedded;
const dissolveBarTitle = statsSettling.phaseLabel;
const dissolveBarMeta = statsSettling.progressText;

const [dissolveCompleting, setDissolveCompleting] = useState(false);
```

Add `dissolveCompleting` state import — `useState` is already imported.

Add two `useEffect` blocks for the completion delay right after the existing joke rotation `useEffect` block (~after line 310):

```tsx
// Trigger 500ms completion animation when progress reaches 100%
useEffect(() => {
    if (statsSettling.progressPercent >= 100 && statsSettling.active && !embedded) {
        setDissolveCompleting(true);
        const timer = setTimeout(() => setDissolveCompleting(false), 500);
        return () => clearTimeout(timer);
    }
}, [statsSettling.progressPercent, statsSettling.active, embedded]);

// Only clear dissolveCompleting early if settling never reached 100% (e.g. cancelled)
useEffect(() => {
    if (!statsSettling.active && statsSettling.progressPercent < 100) {
        setDissolveCompleting(false);
    }
}, [statsSettling.active, statsSettling.progressPercent]);

const dissolveActive = (showDissolveLoading && statsSettling.progressPercent < 100) || dissolveCompleting;
```

**Important:** The two effects are split to avoid a race condition. When `statsSettling.active` becomes `false` after reaching 100%, the first effect's cleanup runs (clearing the timer), but the second effect does NOT clear `dissolveCompleting` because `progressPercent` is still >= 100. The 500ms timer is the only thing that clears it, ensuring the materializing animation plays fully.

Update `statsActionsDisabled` to use the new name:

```tsx
const statsActionsDisabled = showDissolveLoading || !sectionContentReady;
```

- [ ] **Step 1b: Rename all remaining references to old variable names**

The old `showStatsSettlingBanner` and `blurStatsDashboard` variables are used in several other places beyond the declarations. Rename ALL of these:

| Line | Old | New |
|------|-----|-----|
| ~319 | `if (showStatsSettlingBanner)` | `if (showDissolveLoading)` |
| ~348 | `}, [showStatsSettlingBanner]);` | `}, [showDissolveLoading]);` |
| ~349 | `&& !showStatsSettlingBanner` | `&& !showDissolveLoading` |
| ~445 | `if (showStatsSettlingBanner) return;` | `if (showDissolveLoading) return;` |
| ~505 | `showStatsSettlingBanner` in dep array | `showDissolveLoading` |
| ~546 | `blurStatsDashboard` passed to `useStatsNavigation` | `dissolveActive` |
| ~3578 | `blurStatsDashboard ? { ... overflowY: 'hidden' }` | `dissolveActive ? { ... overflowY: 'hidden' }` |

Use find-and-replace within the file: `showStatsSettlingBanner` → `showDissolveLoading` (all occurrences), then `blurStatsDashboard` → `dissolveActive` (all occurrences). Note: the declarations at lines 261-264 were already replaced in Step 1, so the remaining occurrences are the usage sites listed above.

Also note: `statsSettlingBannerTitle` and `statsSettlingBannerMeta` were removed by the Step 1 replacement (they are now `dissolveBarTitle` and `dissolveBarMeta`). Their only JSX usage is in the settling banner block which gets fully replaced in Step 4, so no additional renames needed for those.

- [ ] **Step 2: Remove the `body.classList.toggle` effect**

Find and delete the effect at ~lines 311–317:

```tsx
// DELETE this entire useEffect:
useEffect(() => {
    if (embedded || typeof document === 'undefined') return;
    document.body.classList.toggle('stats-dashboard-loading', blurStatsDashboard);
    return () => {
        document.body.classList.remove('stats-dashboard-loading');
    };
}, [embedded, blurStatsDashboard]);
```

- [ ] **Step 3: Update the joke rotation effect**

The joke rotation `useEffect` depends on `showStatsSettlingBanner`. Update its dependency:

Find: `}, [showStatsSettlingBanner]);` (end of the joke rotation effect)
Replace with: `}, [showDissolveLoading]);`

Also update the guard inside: `if (!showStatsSettlingBanner) return;` → `if (!showDissolveLoading) return;`

- [ ] **Step 4: Replace the settling banner JSX with dissolve bar**

Find the banner block (~lines 3687–3703):

```tsx
{showStatsSettlingBanner && (
    <div className="stats-settling-banner mb-3 rounded-xl border px-4 py-3 text-xs">
        ...
    </div>
)}
```

Replace with:

```tsx
{showDissolveLoading && (
    <div className="mb-3 text-xs">
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="stats-dissolve-heartbeat" />
                <span className="font-medium">{dissolveBarTitle}</span>
                <span style={{ opacity: 0.7 }}>{dissolveBarMeta}</span>
            </div>
        </div>
        {statsSettling.active && (
            <div className="stats-dissolve-bar">
                <div
                    className="stats-dissolve-bar__fill"
                    style={{ width: `${statsSettling.progressPercent}%` }}
                />
                <div
                    className="stats-dissolve-bar__glow"
                    style={{ left: `calc(${statsSettling.progressPercent}% - 5px)` }}
                />
                <div style={{ position: 'absolute', left: `${statsSettling.progressPercent}%`, top: '50%', transform: 'translateY(-50%)' }}>
                    <span className="stats-dissolve-bar__particle" />
                    <span className="stats-dissolve-bar__particle" />
                    <span className="stats-dissolve-bar__particle" />
                    <span className="stats-dissolve-bar__particle" />
                    <span className="stats-dissolve-bar__particle" />
                </div>
            </div>
        )}
    </div>
)}
```

- [ ] **Step 5: Update the main content wrapper**

Find (~line 3705):

```tsx
<div className={`${embedded ? '' : 'flex-1 min-h-0 flex'} relative ${blurStatsDashboard ? 'stats-dashboard-loading-shell' : ''}`}>
    <div
        id="stats-dashboard-container"
        ref={scrollContainerRef}
        className={`${scrollContainerClass} ${embedded ? '' : 'flex-1'} ${blurStatsDashboard ? 'stats-dashboard-scroll-lock' : ''}`}
```

Replace with:

```tsx
<div className={`${embedded ? '' : 'flex-1 min-h-0 flex'} relative`}>
    <div
        id="stats-dashboard-container"
        ref={scrollContainerRef}
        className={`${scrollContainerClass} ${embedded ? '' : 'flex-1'} ${dissolveActive ? 'stats-dashboard-scroll-lock' : ''}`}
```

- [ ] **Step 6: Remove the loading overlay div**

Find the loading overlay at ~lines 4498-4500 (after the scroll container closing `</div>`, inside the outer relative wrapper):

```tsx
{blurStatsDashboard && (
    <div className="stats-dashboard-loading-overlay" aria-hidden="true" />
)}
```

Delete it entirely.

- [ ] **Step 7: Create a section wrapper helper**

At the top of the `StatsView` function (after the state declarations, before the return), add a helper to wrap sections:

```tsx
const sectionWrapClass = dissolveActive
    ? (dissolveCompleting ? 'stats-section-wrap stats-section-wrap--materializing' : 'stats-section-wrap stats-section-wrap--unloaded')
    : 'stats-section-wrap stats-section-wrap--loaded';

const renderSectionWrap = (children: React.ReactNode) => (
    <div className={sectionWrapClass}>
        {children}
        {dissolveActive && !dissolveCompleting && (
            <>
                <span className="stats-dissolve-particle" />
                <span className="stats-dissolve-particle" />
                <span className="stats-dissolve-particle" />
                <span className="stats-dissolve-particle" />
                <span className="stats-dissolve-particle" />
                <span className="stats-dissolve-particle" />
            </>
        )}
    </div>
);
```

- [ ] **Step 8: Wrap modern layout sections**

In the modern layout (`useModernLayout` branch, ~lines 3714–4096), wrap each `<SomeSection ... />` call with `renderSectionWrap()`. For example:

Before:
```tsx
<OverviewSection />
```

After:
```tsx
{renderSectionWrap(<OverviewSection />)}
```

Apply this to all section calls in the modern layout. Sections inside grid containers (like the 3-column `xl:grid-cols-3` div) should each be individually wrapped.

Do the same for the classic layout (`else` branch, ~lines 4098+). Each `{isSectionVisible('...') && <SomeSection ... />}` becomes:

```tsx
{isSectionVisible('overview') && renderSectionWrap(<OverviewSection />, 'overview')}
```

- [ ] **Step 9: Add joke footer**

Just before the closing `</StatsSharedContext.Provider>` tag, add:

```tsx
{dissolveActive && (
    <div className="stats-dissolve-joke">{statsSettlingBannerJoke}</div>
)}
```

(The joke state variable `statsSettlingBannerJoke` keeps its current name — it's internal.)

- [ ] **Step 10: Verify build and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: replace blur overlay with particle dissolve loading state"
```

---

## Task 4: Visual Verification and Cleanup

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Load a dataset with >8 logs to trigger the loading state.

- [ ] **Step 2: Verify dissolve bar**

Confirm:
- Thin gradient bar appears below header during loading
- Leading edge has scattering particles
- Glow pulses at the frontier
- Text shows phase label + count with pulsing heartbeat dot
- Bar fades out when complete

- [ ] **Step 3: Verify section states**

Confirm:
- Sections appear ghosted with floating particles during loading
- When loading completes, particles converge briefly (materializing), then sections fade in with slide-up
- No blur anywhere

- [ ] **Step 4: Verify joke footer**

Confirm:
- Joke text appears at the bottom during loading
- Rotates every ~4.2 seconds
- Disappears when loading completes

- [ ] **Step 5: Verify interaction blocking**

Confirm:
- Scrolling is locked during loading
- Buttons/actions are disabled
- After loading completes, everything is interactive

- [ ] **Step 6: Verify reduced motion**

In DevTools, set `prefers-reduced-motion: reduce`. Confirm:
- No particle animations
- Sections still fade in (opacity only, no float/drift)

- [ ] **Step 7: Verify embedded mode is unaffected**

If possible, check the web report viewer (`npm run dev:web`). Confirm no dissolve loading state appears in embedded mode.

- [ ] **Step 8: Run full test suite**

Run: `npm run test:unit`
Expected: All tests pass. No test references the removed CSS classes directly (they're visual-only).

- [ ] **Step 9: Run lint + typecheck**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 10: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: particle dissolve loading polish and fixups"
```

(Skip if no changes needed.)
