# Squad Comp By Fight — Visual Redesign

**Date:** 2026-04-19
**Status:** Approved

## Problem

`SquadCompByFightSection` uses hardcoded Tailwind color classes (`emerald-500/30`, `emerald-700/25`, `cyan-300/70`, `cyan-400/40`) that exist nowhere else in the app. The section looks out of place across all UI themes because the emerald/cyan palette ignores the design token system (`--bg-card-inner`, `--border-default`, `--brand-primary`, etc.) used by every other section.

## Goals

- Make the section visually consistent with the rest of the stats dashboard
- Replace hardcoded colors with CSS custom properties
- Retain all existing functionality (fight nav, search highlight, commander indicator, party rows, player tiles)

## Design

### Player Tiles

**Before:** `bg-gradient-to-b from-emerald-500/30 to-emerald-700/25`, `border-emerald-300/20`

**After:**
- Background: `bg-[var(--bg-card-inner)]`
- Border: `border-[color:var(--border-default)]`
- Left border: 2px solid, colored by GW2 profession color (see table below)
- Icon background: profession color at 8% opacity (`rgba(r,g,b,0.08)`)
- Hover: `border-[color:var(--border-hover)]`

Profession colors come directly from the existing `PROFESSION_COLORS` map in `src/shared/professionUtils.ts` (e.g. Guardian `#72C1D9`, Revenant `#D16E5A`, etc.). Unknown/fallback: `var(--border-hover)`.

Implementation: import `PROFESSION_COLORS` from `professionUtils.ts` and look up `PROFESSION_COLORS[profession]` for each tile's left border and icon background tint.

### Search Highlight

**Before:** `ring-2 ring-cyan-300/70 border-cyan-300/60 shadow-[0_0_20px_rgba(34,211,238,0.25)]`

**After:** `ring-1 ring-[var(--brand-primary)]/50 border-[color:var(--brand-primary)]/40 bg-[var(--accent-bg)] shadow-[0_0_12px_rgba(59,130,246,0.15)]`

### Commander Tag

**Before:** Large absolute-positioned SVG watermark (`w-12 h-12`, `opacity-20`) in the tile corner.

**After:** Small inline badge next to the account name — a `12×12` rounded circle with `bg-[rgba(251,191,36,0.15)] border border-[rgba(251,191,36,0.4)]` containing a `★` glyph at `8px`. Rendered inline in the account name row via a sibling `<span>`.

### Fight Navigation

**Before:** `border-cyan-400/40 bg-cyan-400/10 text-cyan-100`

**After:**
- Active: `bg-[var(--accent-bg-strong)] border-[color:var(--accent-border)] text-[#93c5fd]`
- Active fight number label: `text-[rgba(147,197,253,0.7)]`
- Inactive (unchanged): `bg-[var(--bg-hover)] text-[color:var(--text-secondary)] border-[color:var(--border-default)]`

### No Structural Changes

Layout, grid, party rows, party badge, fight nav sidebar, search input, and all interactive behavior remain identical. This is a color/style-only change.

## Files Changed

- `src/renderer/stats/sections/SquadCompByFightSection.tsx` — all style changes land here

## Out of Scope

- Adding expanded/modal mode (separate feature)
- Changing the data model or aggregation logic
- Modifying `processSquadComp` (already fixed in same session for dedup bug)
