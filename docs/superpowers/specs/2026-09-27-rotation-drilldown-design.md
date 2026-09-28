# Rotation Timeline: Drill-Down and Small-Screen Design

**Status:** approved design, awaiting implementation plan
**Supersedes nothing.** Extends `docs/superpowers/specs/2026-09-27-rotation-timeline-design.md`,
which shipped the Rotation section on `feat/rotation-timeline` (merged to `main` at `180d84aa`).

## Goal

Make the Rotation section readable at the sizes people actually use it, and give a
single cast a real detail surface instead of a hover tooltip.

## Non-Goals

Two alternative designs were mocked up and rejected for now. Recording them so they
are not re-litigated:

- **Zoom + pan track.** One continuous row with a time ruler and a px/s zoom, replacing
  wrapping. Capable, but it introduces scroll position, zoom level, and ruler rendering
  as new state to own, to persist, and to test — to replace something wrapping already
  does. Parked.
- **Skill lanes.** A second view grouping casts into one lane per skill, sorted by cast
  count. Genuinely answers "what did they press and how often" better than a
  chronological track does, and survives a narrow screen well. Parked as a *later,
  separate* feature, not as part of this change — it is a new view with its own
  aggregation question (median recast interval), not a layout fix.

This spec is layout, scale, and per-cast detail. Nothing else.

## What Is Wrong Today

Measured against the merged implementation:

1. **The row-width ladder starts too coarse.** `WRAP_OPTIONS` in
   `RotationSection.tsx` offers 15s / 30s / 60s, defaulting to 30s. At 30s a typical
   600–900ms cast occupies ~2-3% of the row — roughly 25px on a desktop track. The
   12px icon and the 9px name are both effectively illegible.
2. **The per-cast detail is a `title` attribute.** `RotationTrack.tsx` puts
   `` title={`${name} · ${mmssMillis(castTime)} · ${duration}ms`} `` on each box. A
   touch device never shows it, a keyboard user never reaches it (the box is a `div`,
   not focusable), and it cannot carry anything beyond one line of text.
3. **The player rail is a fixed 210px column at every width.** `w-48` plus the track in
   a flex row means that at ~600px viewport the track gets ~350px — about 6px per cast
   at 30s rows.
4. **The narrow-box fallback is incidental, not designed.** `MIN_WIDTH_PCT = 1.05`
   floors the box width so zero-duration casts stay hoverable, and `min-w-0 truncate`
   on the name means the name is what disappears as a box narrows. The *outcome* is
   right; it is just never stated as a rule, so a narrow box reads as a truncation bug
   rather than an intended icon-only chip.

## The Four Changes

### 1. Row-width ladder gains 10s; default moves to 15s

`WRAP_OPTIONS` becomes 10s / 15s / 30s / 60s. The default `wrapMs` state moves from
`30000` to `15000`.

Rationale, measured on the mockup at a 1180px desktop width: a 600–900ms cast is
~55–70px at 15s rows — enough for a 20px icon plus padding, not enough for a name —
and ~100–130px at 10s rows, where the name appears. 30s and 60s stay for people who
want a long fight on one screen and are reading shape rather than individual casts.

15s rather than 10s as the default because a 2:31 fight is 11 rows at 15s and 16 rows
at 10s; 11 rows at the new 36px row height is ~480px, which still fits a section
without its own scroll.

Both values are one-line changes and reversible if the real thing disagrees with the
mockup.

### 2. Everything scales up

| Thing | Now | Becomes |
|---|---|---|
| Track row height | `h-6` (24px) | `h-9` (36px) |
| Cast icon | `h-3 w-3` (12px) | `h-5 w-5` (20px) |
| Cast label | `text-[9px]` | `text-[11px]` |
| Legend swatch | `w-3 h-2.5` | `w-3.5 h-3` |
| Legend text | `text-[10px]` | `text-[11px]` |
| Player rail | `w-48` (192px) | `w-52` (208px) |

`MIN_WIDTH_PCT` **stops being a percentage.** A percentage floor that guarantees a
12px icon fits does not guarantee a 20px one fits, and the answer depends on the
track's pixel width, which the percentage does not know. Replace it with a CSS
`min-width` in pixels on the box (26px — a 20px icon plus its 2×2px padding and
2×1px border), keeping `left` and `width` in percent. Zero-duration casts stay
clickable at any row width, which is what the floor existed for.

### 3. The narrow-box fallback becomes a stated rule

**Below 78px of box width, render the icon alone, centered, and no name.** Above it,
icon plus truncating name, left-aligned.

This needs the track's pixel width, which the percentage layout does not expose.
Measure it with a `ResizeObserver` on the row container — `HorizontalScrollScrubber.tsx`
already establishes that pattern in this codebase — and compute each box's pixel width
as `widthPct / 100 * trackPx`. When the observer has not yet fired (first paint, and
jsdom, which does not implement `ResizeObserver` without the test setup shim), fall
back to icon-only: an icon with no name is always correct, a clipped name is not.

78px is the mockup's threshold and is a tuning constant, not a derived one. It lives
next to the component with a comment saying so.

### 4. Clicking a cast opens a detail sheet

A cast becomes selectable. Clicking it opens a sheet directly under the track; clicking
the same cast again, pressing `Escape`, or switching player or fight closes it.

**Sheet contents**, in this order:
- The skill icon at 34px, its name, and `N casts this fight`.
- `Cast at` — `mmssMillis(castTime)`, keeping the existing negative-prefix behavior for
  pre-log casts.
- `Duration` — `${duration} ms`.
- `Outcome` — `Interrupted` in `var(--status-error)`, or `Completed`.
- `Gap since prev` — `castTime - (prev.castTime + prev.duration)` in ms, or `—` for the
  first cast. This may legitimately be negative when casts overlap; show it as-is rather
  than clamping, because a negative gap is real information about the log.
- `Previous cast` — that skill's name, or `—`.
- `Every cast of this skill` — a full-fight-width strip with one tick per cast of the
  same skill, the selected one highlighted.

**The hover `title` stays.** It costs nothing and remains the fastest path for a mouse
user who just wants the name.

**Structural consequence, called out because it is the only non-local part of this
change:** `RotationTrack` currently calls `decodeRotation(fight, player)` internally.
The sheet needs the same decoded casts — specifically the *previous* cast, which the
per-row box list has already lost. So the `decodeRotation` memo lifts into
`RotationSection`, and `RotationTrack` takes the decoded casts as a prop alongside
`fight` and `player`. Selection state (`selectedCastIndex: number | null`) lives in
`RotationSection` and is passed down with an `onSelectCast` callback.

### 5. Responsive: the rail collapses to a chip strip

Below the `sm` breakpoint the 208px player rail is hidden and a horizontally scrolling
chip strip takes its place above the track — one chip per player, profession icon, first
name, cast count, the selected one accented.

Implement with Tailwind breakpoint classes (`hidden sm:flex` on the rail, `sm:hidden`
on the strip), not a JS media query. The stats sections already use `sm:`/`md:`/`lg:`/
`xl:` throughout, including `xl:hidden` + `xl:block` for exactly this kind of swap, and
a CSS-only swap needs no test shim and cannot desync from the rendered width.

The track gains row-start time labels, which it does not have today — once the track
is the full width of a phone, a reader has nothing to anchor a row to. 38px wide at
11px, shrinking to 30px at 10px below `sm`.

## Accessibility

The cast box becomes a `<button type="button">` rather than a `<div>`: keyboard
focusable, `Enter`/`Space` activates, `aria-pressed` reflects selection, and an
`aria-label` carries what the `title` carries. **The `data-cast`, `data-interrupted`,
and `data-prelog` attributes stay exactly as they are** — eight existing assertions key
on them.

Arrow-key navigation between casts is explicitly out of scope; tab order through a
300-cast track is already poor and fixing it properly means a roving tabindex, which is
its own change.

## What Does Not Change

**No data, wire-format, or aggregation change.** This is renderer-only:

- `computeRotationTimeline.ts` is untouched apart from the `decodeRotation` call moving
  to a different caller.
- The columnar/delta wire shape is unchanged.
- `RotationSkill.icon` and the `iconIndex` expansion contract are unchanged.
- **`SLICE_SIDECAR_VERSION` does not move.** Frames carry no new section, so a v5
  sidecar published before this change renders correctly under a viewer that has it.
- No re-publish is required for an existing report to gain the new UI, beyond the
  viewer-bundle staleness that already governs every published report.

## Testing

**Must keep passing, unchanged** — the eight assertions in
`src/renderer/stats/__tests__/RotationSection.test.tsx`: empty render for an absent
drilldown, the `re-parse` and `upload size limit` messages, one `[data-cast]` per cast,
`[data-interrupted="true"]` count, the pre-log box clamped to `left: 0%`, no
`/Skill \d+/` anywhere in the markup, the icon `<img>` present/absent per palette entry,
and no `<img>` for a bare numeric icon index.

**New tests:**

1. `WRAP_OPTIONS` renders a `10s` choice, and the default selected value is `15s`.
2. With the `ResizeObserver` shim reporting a narrow track, a cast renders its `<img>`
   and no name text; with a wide track, the name appears. This is the one test that
   would catch the fallback silently inverting.
3. Clicking a cast renders the sheet with that cast's `Cast at` and `Duration`; the
   `Gap since prev` value equals `castTime - (prev.castTime + prev.duration)` for a
   constructed pair, and is `—` for the first cast.
4. Clicking the same cast again removes the sheet; `Escape` removes it; changing the
   selected player removes it.
5. A cast is a `button` with `aria-pressed` that flips on selection.
6. Below `sm`, the chip strip is in the DOM and the rail carries `hidden` — asserted on
   classes, since jsdom does not evaluate breakpoints.

`ResizeObserver` needs a shim in `src/renderer/test/setup.ts` if one is not already
there; the file already stubs `matchMedia`.

## Risks

- **The 78px threshold is guessed from a mockup, not from the real font stack.** If it
  is wrong, names will either clip or vanish too eagerly. It is one constant, and test 2
  pins the behavior rather than the number.
- **Lifting `decodeRotation` into the section changes the memo's identity.** Memoize on
  `[fight, player]` exactly as `RotationTrack` does today, or every wrap-width change
  re-decodes the whole fight.
- **`ResizeObserver` in jsdom.** If the shim is wrong the fallback swallows it silently —
  every box renders icon-only and every test that does not assert on names still passes.
  Test 2 must assert both directions.
- **A 300-cast track with a `button` per cast** is more DOM work than a `div` per cast.
  Unlikely to matter at this scale, but if it does, the row-width default is the lever.

## Open Question for Review

The sheet is specified as sitting **under the track**. On a phone, the track plus a
~150px sheet is most of the viewport, and the stats row above it is pushed off-screen.
The alternative is that the sheet *replaces* the stats row while a cast is selected.
Under-the-track is specified because it preserves context and is simpler; flag it if you
would rather have the swap.
