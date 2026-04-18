# Upload Modal Redesign

**Date:** 2026-04-17  
**Status:** Approved

## Goal

Replace the current minimal upload overlay (`WebUploadOverlay`) with a more informative, professional modal that shows a step-by-step progress timeline and a streaming activity log. Also improve the post-success `WebUploadBanner`.

## In Scope

- `src/renderer/app/WebUploadOverlay.tsx` — full redesign
- `src/renderer/stats/ui/WebUploadBanner.tsx` — visual refresh
- No changes to `useWebUpload.ts`, `IWebUploadState`, or backend handlers

---

## Modal Design (WebUploadOverlay)

### Layout — Option C: Stepper + Log Feed

```
┌─────────────────────────────────────────────┐
│ WEB UPLOAD            [stage title]   3 / 5 │  ← topbar
├─────────────────────────────────────────────┤
│  ●──●──●──○──○                              │  ← step dots
│  Prepare Build Package Upload Finalize      │  ← step labels
│  ████████░░░░░░░░░░░░░░  42%               │  ← progress bar
│  Preparing report bundle...                 │  ← current message
├─────────────────────────────────────────────┤
│  0.3s  Validating settings...               │  ← log feed
│  0.9s  Using darkharasho/axibridge-report   │    (scrollable,
│  3.0s  Preparing report bundle... ←hot      │     dark bg)
└─────────────────────────────────────────────┘
```

### Step Mapping

The five main backend stages map to step indices:

| Stage string (from backend) | Step index | Label   |
|-----------------------------|-----------|---------|
| `Preparing`                 | 0         | Prepare |
| `Building`                  | 1         | Build   |
| `Packaging`                 | 2         | Package |
| `Uploading`                 | 3         | Upload  |
| `Finalizing`                | 4         | Finalize|
| `Complete`                  | — (close) | —       |
| `Warning`                   | — (log only, amber) | — |
| `Build failed` / `Upload failed` | — (failure state) | — |

Step index is derived by scanning the stage string for these keywords in order. The current active step shows a pulsing cyan dot; completed steps show a checkmark; pending steps show their index number.

### States

**In-progress:**
- Border: `rgba(255,255,255,0.10)` (default glass)
- Stage title = current stage string
- Step counter `N / 5` top-right
- Progress bar fills cyan→blue gradient
- Current message text below bar
- Log feed appends each new `detail`/`message` as it arrives, prefixed with elapsed seconds since upload start. Most-recent entry highlighted at full opacity; older entries fade.
- The log entry array is **component-local state** (a `useState` inside `WebUploadOverlay`), accumulated by watching `webUploadState.message`/`detail` for changes via `useEffect`. The elapsed time is tracked via a `useRef` set when `webUploadState.uploading` first becomes `true`. No changes to `IWebUploadState` or `useWebUpload` are needed.
- No close button (not dismissible while running)

**Failure:**
- Border: `rgba(248,81,73,0.35)` (red tint)
- Stage title turns red (`fca5a5`)
- Failed step dot becomes `✕` in red
- Progress bar gradient switches to red→orange
- Current message red
- Final error line in log shown in red
- Footer: "failed at step N" left, **Dismiss** button right
- Clicking the backdrop also dismisses (existing behavior)
- If `isDev || webUploadState.detail` is true, the error detail `<pre>` block is shown below the log feed (same as current)

**Success → auto-close:**
- On `stage === 'Complete'` or `progress === 100`: modal fades out after ~800ms
- Hands off to the banner (existing `scheduleWebUploadClear` behavior, timing unchanged)

### Visual Style

Matches the existing dark glass aesthetic:
- Background: `rgba(13,17,23,0.96)` + `backdrop-blur-2xl`
- Border: `border-white/10`, with state overrides above
- Border-radius: `rounded-2xl` (16px)
- Step dots: 20px circles, cyan for done/active, muted for pending
- Active dot: faint cyan `box-shadow` glow
- Log feed: `bg-black/28`, `max-height: 96px`, `overflow-y: auto`
- Log timestamps: relative seconds from upload start (`0.3s`, `1.4s`, …), monospace, `opacity-20`
- Width: `max-w-md` (unchanged); expands to `max-w-2xl` on failure with error detail (unchanged)

---

## Banner Design (WebUploadBanner)

### Layout

```
┌─────────────────────────────────────────────────────┐
│  🌐  PUBLISHED   [ Building… / ✓ Live ]             │
│      https://darkharasho.github.io/...?report=abc   │
│                                       [Copy] [Open ↗]│
└─────────────────────────────────────────────────────┘
```

### Changes vs Current

| Current | Redesigned |
|---------|-----------|
| Plain "UPLOADED" eyebrow | Globe icon + "PUBLISHED" eyebrow |
| Build status as separate badge after URL | Build status pill inline with eyebrow row |
| "Copy URL" + "Copy Short" buttons | Single **Copy** button (copies shortest available URL — short form if available, full URL otherwise) + **Open ↗** button |
| No icon | 30px rounded-square icon: globe (in-progress/building), checkmark (built), ✕ (errored) |

### Build Status Pill

- `checking` / `building` → spinning arrow + "Building…" (cyan)
- `built` → "✓ Live" (green)
- `errored` → "Build failed" (red)
- `unknown` → omitted (don't show a confusing status)
- `idle` → omitted

### Behavior

- Banner appearance, position, and dismissal are unchanged (no new dismiss button; it clears the same way as today)
- URL display and `openExternal` click behavior unchanged
- Copy consolidation: if `shortUrl` is available, **Copy** writes the short URL; otherwise writes the full URL. The "Copy Short" button is removed.

---

## Component Changes

| File | Change |
|------|--------|
| `src/renderer/app/WebUploadOverlay.tsx` | Full rewrite — new stepper, log feed, state-driven styling |
| `src/renderer/stats/ui/WebUploadBanner.tsx` | Refresh — icon, pill layout, consolidated copy |

No changes to:
- `useWebUpload.ts` — state shape and logic are sufficient as-is
- `global.d.ts` — `IWebUploadState` needs no new fields
- `githubHandlers.ts` — backend stage strings are the source of truth, consumed as-is

---

## Testing

- Manual: trigger a real upload in dev, verify each stage advances the stepper and logs appear
- Manual: trigger a failure (bad token) and verify failure state renders correctly
- Manual: verify success auto-closes and banner appears with correct URL + build polling
- Existing `StatsHeader.test.tsx` and `WebUploadBanner.test.tsx` — update snapshot/prop expectations if needed
