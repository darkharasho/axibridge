# Report Navigation Redesign — Category Pages + Universal Search

**Date:** 2026-08-08
**Status:** Approved (design), pending implementation plan

## Problem

The Stats view has grown to ~51 sections in 8 TOC groups rendered as one scroll-facade page. Squad members viewing published web reports (the primary audience) cannot tell what data exists or where it lives. Specific failures:

- **Findability** — knowing a stat exists but not which section holds it.
- **Discoverability** — entire sections are forgotten or invisible (e.g. `top-skills-incoming` renders but has no TOC entry).
- **Organization** — grouping hasn't kept up: "Defensive Stats" holds 13 items including boons, support, and healing.

The desktop Stats dashboard and the web report share `StatsView` and must behave identically.

## Goals

1. Squad members can find any stat, section, or player in seconds via universal search.
2. The category structure itself communicates what data exists (categories named by question, one obvious home per topic).
3. Identical behavior in the desktop app (`StatsView`), History view (embedded), and web report.
4. Old shared `#section-id` deep links keep working.

## Non-goals

- No new metrics or changes to aggregation, `report.json`, or upload flow.
- No visual re-theme (existing themes/palettes apply to new chrome).
- No server-side search; index is built client-side.

## 1. Taxonomy

Ten categories replace the current 8 groups. Section **ids are unchanged** (no alias entries needed at launch; the alias mechanism exists for future renames). New id: `data-map` (Overview landing cards).

| Category (id) | Section ids |
|---|---|
| Overview (`overview`) | `data-map` *(new)*, `overview`, `fight-breakdown`, `fight-diff-mode`, `timeline`, `map-distribution`, `top-players`, `top-skills-outgoing`, `top-skills-incoming` |
| Offense (`offense`) | `offense-detailed`, `damage-breakdown`, `all-damage`, `spike-damage`, `damage-modifiers`, `conditions-outgoing` |
| Defense (`defense`) | `defense-detailed`, `incoming-strike-damage`, `incoming-damage-modifiers`, `defense-mitigation` |
| Boons & Strips (`boons-strips`) | `boon-output`, `boon-uptime`, `all-boons`, `boon-timeline`, `stab-performance`, `boon-strip-comparison`, `strip-spikes` |
| Support & Healing (`support-healing`) | `support-detailed`, `healing-stats`, `healing-breakdown`, `heal-effectiveness` |
| Squad Cohesion (`squad-cohesion`) | `on-tag-review`, `squad-distance-to-tag`, `squad-distance-to-tag-visual`, `squad-tag-distance-deaths`, `squad-kill-pressure`, `squad-damage-comparison` |
| Commander (`commander`) | `commander-stats`, `commander-push-timing`, `commander-target-conversion`, `commander-tag-movement`, `commander-tag-death-response` |
| Players (`players`) | `player-breakdown`, `player-comparison`, `apm-stats`, `skill-usage`, `sigil-relic-uptime`, `special-buffs` |
| Roster (`roster`) | `attendance-ledger`, `squad-composition`, `squad-comp-fight`, `fight-comp` |
| Replay (`replay`) | `replay` |

Notable moves: Fight Comparison (`fight-diff-mode`) rescued from "Other" into Overview; boons/support/healing split out of Defense; `heal-effectiveness` joins Support & Healing; both strip views (`boon-strip-comparison`, `strip-spikes`) share one home; "Other Metrics" dissolves into Players; `squad-composition` (Classes) moves Overview → Roster; `player-breakdown` moves Offense → Players.

The registry moves to a dedicated module (`statsTaxonomy.ts`) where each category and section carries: `id`, `label`, `icon`, `description` (one-liner), and `keywords` (search synonyms, e.g. "cleanse" → Support Detailed). Descriptions serve both the data-map cards and the search index.

## 2. Navigation structure

- A horizontal **category bar** (replacing the grouped sidebar TOC as primary nav) renders one page per category. Only the active category's sections mount — the existing `sectionVisibility`/active-group gating already works this way; this change removes the scroll facade rather than adding machinery.
- **Deleted:** placeholder-height store (`groupHeights` in `statsStore`), ResizeObserver height tracking in `useLazyGroups`, the global wheel-hijack in `useStatsNavigation`, and cross-group scroll tracking.
- **Kept:** per-section anchor ids; smooth scroll-to-section and active-section tracking *within* the current category page (drives the subnav highlight); `stepSection` prev/next stepping (now within/across categories).
- Within a category page, a slim **subnav** lists its sections (4–7 entries), reusing the current TOC item icons.
- **Overview landing = data map**: one card per category (icon, label, description, section list) linking through. Renders as section `data-map` at the top of Overview.
- **Deep links:** `#<section-id>` resolves by lookup → activate owning category → scroll → highlight. Unknown ids consult the alias map (empty at launch), then fall back to Overview. The web report's existing hash handling and the desktop app adopt the same resolver.
- **Mobile web:** category bar collapses into the existing mobile nav pattern (`data-stats-mobile-nav`); subnav becomes part of the same sheet.

## 3. Universal search

One shared component mounted in both surfaces (desktop `StatsView` and web report; History's embedded view included).

**Invocation:** Ctrl/⌘+K or clicking the search field in the category bar (desktop); magnifier button opening the palette full-screen (mobile web).

**Index** (built client-side at load/aggregation-complete; ~200 entries):

| Entry type | Source | Payload |
|---|---|---|
| `section` | taxonomy registry | label, keywords, categoryId, sectionId |
| `metric` | `statsMetrics.ts` OFFENSE/DEFENSE/SUPPORT defs + boon names | label, home sectionId, columnKey |
| `player` | aggregation result | account, character names, profession; target sectionId = `player-breakdown` |

**Matching:** case-insensitive substring with prefix boost; type-grouped results (sections, then metrics, then players); no fuzzy library at this scale.

**Selection behavior:** activate owning category → scroll to section → flash-highlight target (section header, column header via `data-metric-key` attribute, or player row via account-keyed row attribute), reusing the timed-highlight pattern from the web metrics-spec viewer.

**Visibility:** the index is filtered by the active `sectionVisibility` fn and `noEgoMode` so search never surfaces hidden content. Player entries appear only after aggregation completes; sections/metrics are available immediately.

## 4. Architecture

| Area | Change |
|---|---|
| `src/renderer/stats/statsTaxonomy.ts` *(new)* | Category/section registry with descriptions + keywords; single source for nav, data map, and search |
| `src/renderer/stats/hooks/useStatsNavigation.ts` | Consume taxonomy; category-page navigation; drop wheel-hijack and cross-group scroll tracking |
| `src/renderer/stats/hooks/useLazyGroups.ts` | Reduce to active-category mount tracking (heights/observers deleted) |
| `src/renderer/stats/statsStore.ts` | `activeNavGroup` → `activeCategory`; remove `groupHeights` |
| `src/renderer/StatsView.tsx` | Render active category only; mount category bar, subnav, search palette, data map |
| `src/renderer/stats/CategoryBar.tsx` + `SectionSubnav.tsx` *(new)* | Replace `StatsNavSidebar.tsx` (deleted); mobile sheet folds both in |
| `src/renderer/stats/search/` *(new)* | `searchIndex.ts` (builder + matcher), `SearchPalette.tsx`, `useSearchJump.ts` (activate/scroll/highlight) |
| `src/web/reportApp.tsx` | Adopt shared hash resolver; pass player list + visibility fn to search; mount identical chrome |
| `src/renderer/FightReportHistoryView.tsx` | Verify embedded parity (props flow unchanged) |
| Section components | Add `data-metric-key` to column headers of sections that are metric homes; account-keyed row attributes in `PlayerBreakdownSection` only (the sole player-result target at launch) |

## 5. Edge cases

- A category whose sections are all hidden (report visibility / noEgoMode) disappears from the bar; direct links to its sections fall back to Overview.
- Search before aggregation completes: sections/metrics only.
- `kdr` legacy alias (existing `id === 'kdr' → overview` special case) moves into the alias map.
- Replay stays a full-height page; search result "Replay" simply activates the category.

## 6. Testing

- **Taxonomy integrity (unit):** every rendered section id appears in exactly one category; category ids unique among categories, section ids unique among sections (cross-namespace reuse like `overview`/`replay` is fine — the hash resolver only consults section ids); data-map descriptions present. This permanently kills the invisible-section bug class.
- **Alias/hash resolver (unit):** old-style `#section-id` for every current id resolves to the correct category; unknown id falls back safely.
- **Search index (unit):** builder output for fixture aggregation; visibility filtering (noEgoMode, sectionVisibility); matcher ranking (prefix > substring).
- **Jump behavior (integration, vitest + jsdom):** selecting a metric result activates category and targets the column key.
- **E2E (Playwright, web report):** old deep link scrolls to section; palette search "stab" → Stab Performance highlighted; player search → highlighted row in Player Breakdown; mobile nav sheet.
- Run vitest with `--maxWorkers=2` per machine policy.

## Rollout

Single release. No data-format changes; web reports published by older app versions render with the new viewer chrome automatically (viewer is bundled per publish — older *published* reports keep their old bundled viewer, which is acceptable).
