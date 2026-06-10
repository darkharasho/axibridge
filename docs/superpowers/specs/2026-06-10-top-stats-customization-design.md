# Top Stats Customization — Design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Scope:** The "Top Stats" leader-card grid in the stats dashboard (`TopPlayersSection`). The MVP gold/silver/bronze cards and their scoring weights are **out of scope** and unchanged.

## Problem

The Top Stats grid renders a hardcoded list of 9 leader cards (`leaderCards` array in `TopPlayersSection.tsx`). Users cannot turn individual cards off, and there is no way to surface other meaningful metrics (DPS, Damage, Revives, Downed Healing, or boon generation). We want users to enable/disable each card individually and choose from a much larger catalog, including per-boon generation cards. The default enabled set must exactly reproduce today's 9 cards so existing users see no change until they opt in.

## Goals

- Configure which Top Stats cards appear, from Settings (not inline).
- On/off only — no drag-to-reorder. Enabled cards render in a fixed canonical order grouped by category.
- Expand the catalog to ~27 options across 5 categories: Offense, Defense/Support, Control, Utility, Boons.
- Boon cards rank players by **squad generation output** (avg stacks for stacking boons like Might/Stability; uptime % otherwise).
- Compact, well-styled Settings picker (color-coded chip grid, ~470px tall) that does not dominate vertical space.
- A single generic boon glyph (hexagon + up-arrow) used for all boon cards and chips — no per-boon art.

## Non-Goals

- No reordering, no per-card configuration beyond on/off.
- No changes to MVP cards, MVP pills, or MVP weights.
- No new Discord-embed or web-report-specific config surfaces (the web report shares `StatsView`/`TopPlayersSection` and inherits the behavior via the persisted setting embedded in `report.json`).

## Architecture

### 1. Stat catalog — single source of truth

Add a new module `src/renderer/stats/topStatsCatalog.ts` exporting an ordered array of catalog entries. Both the Settings picker and `TopPlayersSection` consume this array, replacing the hardcoded `leaderCards`.

```ts
export type TopStatCategory = 'offense' | 'defense' | 'control' | 'utility' | 'boon';

export interface TopStatDef {
  id: string;                 // stable key persisted in settings, e.g. 'healing', 'boon:might'
  label: string;              // 'Healing'
  category: TopStatCategory;
  color: string;              // accent token/hex used by chip + card
  icon: LucideIcon | 'boon';  // 'boon' => render the generic boon glyph
  unit?: string;              // 'dist', 'avg stacks', 'uptime', etc.
  higherIsBetter: boolean;    // false for Closest to Tag
  source: TopStatSource;      // how to pull the value (see below)
  defaultOn: boolean;         // true for the current 9
  supportsRate: boolean;      // participates in per-second/minute mode; false for boons & closestToTag
}
```

`source` is a discriminated union:
- `{ kind: 'leaderboard', key: string }` — read from the existing `stats.leaderboards[key]` (and the per-second/per-minute variants). Covers all non-boon stats.
- `{ kind: 'boon', boonId: string, stacking: boolean }` — read from a new boon leaderboard (see §2).

**Default-on set (`defaultOn: true`) — exactly today's 9 cards:**
Down Contribution, Healing, Barrier, Cleanses, Strips, Stability Gen, CC, Dodges, Closest to Tag.

> Note: today's CC/Interrupt cards are governed by `interruptMode` (`combined` shows "CC + Interrupts", `separate` adds an "Interrupts" card, `ccOnly` shows just "CC"). The catalog keeps **CC**, **Interrupts**, and **CC + Interrupts** as three independent toggleable entries. `interruptMode` continues to exist for the Fight Breakdown/embeds, but the Top Stats grid is now driven purely by the user's enabled set, so the mode no longer gates these cards here. Default-on remains "CC" only, matching the current default appearance.

**Full catalog:**
- **Offense** (orange): DPS, Damage, Down Contribution*
- **Defense/Support** (green): Healing*, Downed Healing, Barrier*, Cleanses*, Strips*, Stability Gen*, Revives
- **Control** (pink): CC*, Interrupts, CC + Interrupts
- **Utility** (indigo): Dodges*, Closest to Tag*, Participation
- **Boons** (cyan): Might, Quickness, Alacrity, Fury, Protection, Resistance, Resolution, Stability, Aegis, Regeneration, Swiftness

(* = default on.) All non-boon entries map to leaderboard keys that **already exist** in `incrementalAggregation` (`downContrib`, `barrier`, `healing`, `dodges`, `strips`, `cleanses`, `cc`, `interrupts`, `ccAndInterrupts`, `stability`, `revives`, `downedHealing`, `dps`, `damage`, `participation`, `closestToTag`). No new aggregation is needed for the non-boon expansion — only wiring.

"Stability Gen" (count-based, `stats.leaderboards.stability`, from `s.stab`) stays exactly as today under Defense/Support. The Boons-group "Stability" is a **separate** boon-uptime card. They can coexist; only Stab Gen is default-on.

### 2. Boon leaderboards

Boon generation is already computed per-player in `buildBoonTables` (`src/shared/boonGeneration.ts`), which `incrementalAggregation` already produces as `stats.boonTables`. We derive ranked leaderboards from it so boon cards reuse the existing leaderboard/expand plumbing.

- Add a `buildBoonLeaderboards(boonTables)` helper (in `boonGeneration.ts` or a small adjacent module) that, for each boon in a fixed allowlist (the 11 boons above), produces a leaderboard array of `{ account, profession, professionList, value, count }` ranked by **squad generation output**:
  - **Stacking boons** (Might, Stability) → average stacks: reuse `computeBoonMetrics(row, 'squadBuffs', stacking=true)` → `squad generationMs / activeTimeMs`.
  - **Non-stacking boons** → uptime %: `squad generationMs / activeTimeMs * 100`.
  - This mirrors the math already used by the boon section, ensuring numbers match what users see elsewhere.
- Expose these as `stats.boonLeaderboards: Record<string, LeaderboardRow[]>` keyed by boon id, produced in `finalize()` alongside the existing `leaderboards`.
- Boons do **not** get per-second/per-minute variants (`supportsRate: false`); in rate mode boon cards render their normal uptime/stacks value, unaffected by the toggle.

This keeps all aggregation in one place, flows through the worker and `aggregationCache` unchanged in shape (just an added field), and feeds both the #1-player card and the click-to-expand leaderboard rows.

### 3. Settings field + migration

Add to `IStatsViewSettings`:

```ts
enabledTopStats: string[];   // catalog ids; order ignored (canonical order used for render)
```

- `DEFAULT_STATS_VIEW_SETTINGS.enabledTopStats` = the 9 `defaultOn` ids.
- **Migration / back-compat:** a normalizer (mirroring `normalizeMvpWeights`) maps a missing/undefined `enabledTopStats` to the default 9, and filters unknown ids out of any stored array. Existing users (no field saved) therefore see the current 9 cards unchanged. Persisted via the existing settings-save path in `SettingsView` (`saveSettings` / `settingsHandlers`) and embedded into `report.json` for web reports.

### 4. Rendering — `TopPlayersSection`

- Replace the hardcoded `leaderCards` array with: `catalog.filter(def => enabledIds.has(def.id))` (already in canonical order because the catalog is ordered).
- For each enabled def, resolve data + leaderboard rows from `def.source`:
  - leaderboard source → `topStatsLeaderboards[key]` (respecting per-second/minute selection as today).
  - boon source → `stats.boonLeaderboards[boonId]` (rate selection ignored).
- `LeaderCard` gains: render the **generic boon glyph** when `def.icon === 'boon'`, apply a subtle category-tinted background + "BOON" badge for boon cards, and format the value via the def's unit (`avg stacks` / `uptime %` / existing numeric formatting). Existing non-boon cards render identically to today.
- Empty state: if `enabledTopStats` is empty, show a small "No top stats selected — enable some in Settings" placeholder instead of an empty grid.
- `isMvpStatEnabled` and the MVP pill logic are untouched.

### 5. Generic boon glyph

Add a small shared `BoonGlyph` component (hexagon + up-arrow SVG, `currentColor`) under the renderer's icon/components area, used by both the Settings chips/headers and the dashboard boon cards. Single definition, reused everywhere.

### 6. Settings UI — chip-grid picker

In `SettingsView.tsx`, under the existing **"Dashboard - Top Stats & MVP"** section (near the `topStatsMode` controls), add a "Top Stats Cards" block:

- Header row: title + live "N of 27 enabled" summary + "Reset to defaults" link (sets `enabledTopStats` back to the default 9).
- For each category: a header with the category icon (swords/shield/hammer/wind/boon-glyph) and colored label, followed by a wrapping flex grid of chip toggles.
- Each chip: checkbox box + label (+ leading boon glyph for boon chips); enabled = category-colored fill/border, disabled = muted. Clicking toggles the id in `enabledTopStats`.
- Matches the existing Settings styling (chip pills like the Total/Per-Second toggles; category sub-headers like General/Offensive/Defensive MVP). Target footprint ~470px.

## Data Flow

1. User toggles chips in Settings → `enabledTopStats` updated → saved via existing settings persistence.
2. `StatsView` reads `statsViewSettings.enabledTopStats`, passes the enabled set to `TopPlayersSection`.
3. `TopPlayersSection` filters the ordered catalog, resolves each card's value/rows from `stats.leaderboards` / `stats.boonLeaderboards`, and renders.
4. Web report: `enabledTopStats` is embedded in `report.json`; the web `StatsView` renders the same selection.

## Error Handling / Edge Cases

- Unknown/legacy ids in stored settings → filtered by the normalizer.
- Empty selection → placeholder, not a broken grid.
- Boon with no generation data in the dataset → leaderboard empty → card shows the existing "no data" treatment.
- Per-second/minute mode → only `supportsRate` cards switch; boon and Closest-to-Tag cards ignore it.
- `splitPlayersByClass` and `minParticipationPercent` continue to apply (boon leaderboards are built from the same filtered player set as other leaderboards).

## Testing

- **Unit (catalog/normalizer):** default set equals the 9 legacy cards; unknown ids filtered; empty/undefined → defaults.
- **Unit (boon leaderboards):** stacking boon → avg stacks, non-stacking → uptime %, ranking order, matches boon-section math on a fixture.
- **Component (`TopPlayersSection`):** renders only enabled cards in canonical order; boon card shows glyph + badge + correct unit; empty selection → placeholder; rate toggle affects only `supportsRate` cards. (Extend existing `TopPlayersSection.test.tsx`.)
- **Settings (`SettingsView.test.tsx`):** toggling a chip updates `enabledTopStats`; reset restores defaults; summary count updates.
- **Regression:** `npm run test:regression:stats` to confirm aggregation output shape (added `boonLeaderboards` field) doesn't break existing consumers.

## Files Touched

- `src/renderer/stats/topStatsCatalog.ts` — **new** catalog + types.
- `src/shared/boonGeneration.ts` (or adjacent) — **new** `buildBoonLeaderboards`.
- `src/renderer/stats/incrementalAggregation.ts` — emit `boonLeaderboards` in `finalize()`.
- `src/renderer/stats/statsTypes.ts` — add `boonLeaderboards` to the stats type.
- `src/renderer/global.d.ts` — `enabledTopStats` on `IStatsViewSettings` + default + normalizer.
- `src/renderer/stats/sections/TopPlayersSection.tsx` — catalog-driven rendering, boon cards.
- `src/renderer/SettingsView.tsx` — chip-grid picker.
- `src/renderer/components/BoonGlyph.tsx` — **new** shared glyph (location TBD to match existing icon conventions).
- Tests as above.

## Open Questions

None blocking. Icon choices per category (swords/shield/hammer/wind) are from `lucide-react` already used in the section and can be finalized during implementation.
