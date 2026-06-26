# No-Ego Secret Per-Player Detail Reveal — Design

**Date:** 2026-06-25
**Status:** Approved

## Problem

No-ego mode exists to hide per-player rankings and reduce toxicity. But each
no-ego section (`NoEgoMetricSection`) currently renders a visible
"Per-player detail" toggle button that reveals account-level names and values —
an obvious escape hatch that undercuts the mode's purpose.

We want the per-player table to remain available to in-the-know users, but as a
hidden easter egg rather than an advertised button.

## Solution

Replace the visible button with a silent gesture: **triple-clicking a section's
header icon** (3 clicks within 600ms) toggles that section's per-player detail
table open or closed.

### Behavior

- The visible "Per-player detail" button is removed from `NoEgoMetricSection`.
- The section header icon becomes a silent trigger: 3 clicks within a 600ms
  rolling window toggle `detailOpen` for that section.
- Per-section and independent: clicking the Offense icon affects only Offense.
  Each section already owns its own `detailOpen` state, so this holds with no
  changes to the parent sections.
- No visual hint of any kind: no cursor change, no glow/pulse, no tooltip, no
  `role`/`aria`. Single and double clicks produce no visible effect. The table
  simply appears/disappears on the third qualifying click.

### Implementation

All changes are contained in
`src/renderer/stats/sections/NoEgoMetricSection.tsx`:

- Wrap the rendered `{icon}` in a `<span>` with an `onClick` handler and a
  `data-testid="noego-secret-icon"` (the only concession for testability — it
  carries no visible affordance).
- Hold recent click timestamps in a `useRef<number[]>`, using
  `performance.now()`. On each click: drop timestamps older than 600ms, push the
  new one; if the buffer reaches length 3, call `setDetailOpen((v) => !v)` and
  clear the buffer.
- Delete the entire `<button … aria-expanded={detailOpen} …>Per-player detail</button>`
  block (current lines ~165–174).
- The `{detailOpen && activeMetric && (… table …)}` render block stays exactly
  as-is, still driven by `detailOpen`.

No prop or signature changes: `icon`, `detailOpen`, and `setDetailOpen` already
exist on `NoEgoMetricSectionProps`. `OffenseSection`, `DefenseSection`, and
`SupportSection` need no edits.

### Edge cases

- Clicks on the section title, view-mode pills, or any other header element are
  unaffected.
- The timestamp buffer is per component instance, so clicks in one section never
  count toward another.

## Tests

Update the three existing no-ego section tests, which currently assert the
button exists:

- `src/renderer/stats/sections/__tests__/OffenseSection.noego.test.tsx`
- `src/renderer/stats/sections/__tests__/DefenseSection.noego.test.tsx`
- `src/renderer/stats/sections/__tests__/SupportSection.noego.test.tsx`

New assertions for each:

1. On initial render, the per-player detail table is **not** present (e.g. no
   "Fight Time" column header / no player row).
2. After firing 3 rapid clicks on `noego-secret-icon`, the table appears.
3. After 3 more clicks, the table hides again.

Clicks fired synchronously in a test fall within the same 600ms window
naturally; if needed, mock `performance.now()` to control the window
deterministically.

## Out of Scope

- No global "reveal all sections" toggle.
- No change to ego (normal) mode, which already shows per-player data openly.
- No persistence of the revealed state across remounts.
