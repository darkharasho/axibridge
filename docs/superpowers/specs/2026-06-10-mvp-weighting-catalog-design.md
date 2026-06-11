# MVP Weighting on the Full Stat Catalog — Design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Scope:** Extend the MVP scoring system so every stat in the Top Stats catalog (`topStatsCatalog.ts`) can be weighted toward the Offensive and/or Defensive MVP, with custom per-stat weights. The two-MVP structure (Offensive + Defensive) and the gold/silver/bronze cards are unchanged; only *which* stats feed the score and at *what* weight becomes fully configurable.

## Problem

MVP weights live in a fixed `IMvpWeights` object with 16 hardcoded keys, hand-mapped to a small set of metrics in `incrementalAggregation.ts` (three arrays: offensive, general, defensive). Users cannot weight any of the new catalog stats (boons, kills, deaths, breakbar, condition damage, avoidance, etc.) into the MVP score. We want the same catalog of options we exposed for Top Stats cards to be weightable for MVP, keeping the familiar **General / Offensive / Defensive** buckets.

## Goals

- Three weight buckets — **General**, **Offensive**, **Defensive** — each able to weight *any* catalog stat (0 = ignored).
- Offensive MVP score = Offensive bucket + General bucket; Defensive MVP score = Defensive bucket + General bucket (matches today's behavior).
- Defaults reproduce today's MVP exactly; every new stat defaults to weight 0.
- Scoring engine unchanged: `score = Σ (ratio × weight)`, `ratio = val/best` (higher-is-better) or `best/val` (lower-is-better), driven by each stat's catalog `higherIsBetter` and its leaderboard.
- Settings UI: bucket tabs + category-grouped chips, each with an inline weight stepper (0.1 steps), plus "Reset to defaults".
- Migrate existing saved `mvpWeights` into the new structure so nobody's MVP changes silently.

## Non-Goals

- No change to MVP scoring math, the offensive/defensive candidate-pool split (damage-role vs support-role), or the gold/silver/bronze card layout.
- No new stats beyond the existing 38-entry catalog.
- Boon-uptime/avg-stacks values feed MVP via their existing boon leaderboards; no new aggregation.

## Architecture

### 1. Data model

Replace the flat `IMvpWeights` with three id-keyed weight maps:

```ts
// global.d.ts — plain string-keyed maps (NO catalog import; keeps the audit
// TS sandbox lucide-free, same lesson as enabledTopStats).
export interface IMvpWeightProfiles {
  general: Record<string, number>;    // applied to BOTH MVPs
  offensive: Record<string, number>;  // Offensive MVP only
  defensive: Record<string, number>;  // Defensive MVP only
}
```

Keys are catalog stat ids (`downContrib`, `boon:might`, `deaths`, …). Absent key ⇒ weight 0.

`DEFAULT_MVP_WEIGHT_PROFILES` (inlined literal in `global.d.ts`, guarded by a sync test against a catalog-derived value):

- **offensive:** `downContrib: 1`, `dps: 0.2`, `damage: 0.2`
- **general:** `strips: 1`, `cc: 0.7`, `closestToTag: 0.7`, `participation: 0.7`, `dodges: 0.4`
- **defensive:** `healing: 1`, `downedHealing: 0.7`, `cleanses: 1`, `stability: 1`, `revives: 0.7`

(These are exactly the current `DEFAULT_MVP_WEIGHTS` values, re-keyed to catalog ids. `closestToTag` carries the old "Distance to Tag" weight.)

### 2. Migration / normalization

A `normalizeMvpWeightProfiles(value): IMvpWeightProfiles` lives in a renderer-side module next to the catalog (`mvpWeightProfiles.ts`), since it references catalog ids. It:

- If `value` already looks like `IMvpWeightProfiles` (has `general`/`offensive`/`defensive` objects), keep numeric weights for known catalog ids, drop unknown ids, default missing to 0.
- Else if `value` looks like the legacy flat `IMvpWeights`, map legacy keys → new buckets:
  - `offensiveDownContribution→offensive.downContrib`, `offensiveDps→offensive.dps`, `offensiveDamage→offensive.damage`
  - `generalStrips→general.strips`, `generalCc→general.cc`, `generalDistanceToTag→general.closestToTag`, `generalParticipation→general.participation`, `generalDodging→general.dodges`
  - `defensiveHealing→defensive.healing`, `defensiveDownedHealing→defensive.downedHealing`, `defensiveCleanses→defensive.cleanses`, `defensiveStability→defensive.stability`, `defensiveRevives→defensive.revives`
  - (legacy `defensiveDistanceToTag/Participation/Dodging` are ignored — they were unused by the metric arrays.)
- Else return a deep copy of `DEFAULT_MVP_WEIGHT_PROFILES`.

This guarantees existing users' weights carry over unchanged.

### 3. Scoring — catalog-driven metrics

In `incrementalAggregation.ts`, replace the three hardcoded metric arrays with a builder that turns a weight map into scoring metrics, reusing the existing `computeCategoryScores`/ratio engine:

```ts
const buildMetrics = (weights: Record<string, number>) =>
  TOP_STATS_CATALOG
    .filter((def) => (weights[def.id] || 0) > 0)
    .map((def) => ({
      name: def.label,
      weight: weights[def.id],
      higher: def.higherIsBetter,
      leaderboard: leaderboardForDef(def),   // stats.leaderboards[key] or boonLeaderboards[boonId]
      getter: getterForDef(def),             // see below
    }));
```

- `leaderboardForDef`: leaderboard source → `leaderboards[def.source.key]`; boon source → `boonLeaderboards[def.source.boonId]`.
- `getterForDef`: leaderboard source → `(s) => getVal(s, def.source.key)`; boon source → a closure over an `account → value` map built from that boon's leaderboard (`(s) => boonValueMap.get(s.account) ?? 0`). `best` continues to come from `leaderboard[0].value`.

Then: `offensiveMetrics = buildMetrics(offensive) + buildMetrics(general)`, scored over the damage-role pool; `defensiveMetrics = buildMetrics(defensive) + buildMetrics(general)`, scored over the support-role pool. Everything downstream (`computeCategoryScores`, `contribs`, top-3 `topStats` pills, silver/bronze) is unchanged.

> `TOP_STATS_CATALOG` is already imported by the renderer; `incrementalAggregation.ts` is renderer-side and may import it (it is NOT loaded by the audit sandbox — only `global.d.ts` and `shared/*` are).

### 4. MVP pill visibility

The gold/silver/bronze cards show up to three stat pills filtered by `isMvpStatEnabled(name)` in `StatsView.tsx`, currently driven by the `mvpStatWeightKeys` map. Replace that with catalog-based logic: a pill (keyed by stat label/id from `contribs`) shows when its stat has weight > 0 in the relevant bucket set (offensive ∪ general for the Offensive card; defensive ∪ general for the Defensive card). Since `contribs` are only produced for weighted metrics, the simplest correct rule is: **show all pills present in `contribs`** (they are weighted by construction), so `isMvpStatEnabled` can be retired for this path.

### 5. Settings UI

Rework the existing **"MVP Weighting"** SettingsSection:

- Three bucket tabs: **Offensive**, **Defensive**, **General (both)**.
- Under the active tab: the catalog grouped by category (same category headers/colors as the Top Stats picker), each stat rendered as a chip with an inline weight stepper (`− value +`, **0.05 steps, clamped 0–1** to match the current MVP weight range). Weight > 0 ⇒ chip tinted in the bucket's accent color; 0 ⇒ muted.
- "Reset to defaults" restores `DEFAULT_MVP_WEIGHT_PROFILES`.
- Persisted via the existing settings flow as `mvpWeightProfiles`; `mvpWeights` is read on load only for migration.

### 6. Persistence

- `global.d.ts`: add `IMvpWeightProfiles` + `DEFAULT_MVP_WEIGHT_PROFILES` (inlined literal).
- Settings load (`SettingsView`, and wherever `mvpWeights` is read into aggregation): run `normalizeMvpWeightProfiles(settings.mvpWeightProfiles ?? settings.mvpWeights)`.
- Save `mvpWeightProfiles`. Keep writing nothing new to `mvpWeights` (leave the old field untouched for one release as a rollback safety net; it is ignored once `mvpWeightProfiles` exists).
- `aggregationStatsViewSettings` cache key already excludes display-only settings; MVP weights DO affect the computed MVP, so `mvpWeightProfiles` must remain part of the aggregation inputs (it changes results), unlike `enabledTopStats`.

## Data Flow

1. User edits a weight in Settings → `mvpWeightProfiles` updated → saved.
2. Aggregation reads `mvpWeightProfiles` (normalized) → `buildMetrics` produces weighted metric lists → `computeCategoryScores` ranks players → Offensive/Defensive MVP + silver/bronze + pills.
3. Web report: `mvpWeightProfiles` rides along in the report's settings (same path as `mvpWeights` today) so static reports score identically.

## Error Handling / Edge Cases

- Unknown/legacy ids in stored profiles → dropped by the normalizer.
- A weighted stat with no leaderboard data (e.g. a boon nobody generated) → `best = 0` ⇒ that metric contributes 0 (existing guard `if (!best) return`).
- All weights 0 in a bucket → that MVP falls back to the empty placement (existing behavior when no score > 0).
- Lower-is-better stats (deaths, downsTaken, damageTaken, closestToTag) → `best/val` ratio via `higher: false`; `val <= 0` guard already handles zero-death players (they're excluded from that metric's contribution, matching how distance handles commanders).

## Testing

- **Normalizer/migration:** legacy `IMvpWeights` → correct profile maps; partial/unknown ids filtered; missing → defaults; already-new shape preserved. Sync test: `DEFAULT_MVP_WEIGHT_PROFILES` equals the catalog-derived default.
- **Scoring:** on a fixture, default profiles reproduce the pre-change Offensive/Defensive MVP winners (regression guard); adding a boon/lower-is-better weight changes the winner as expected; weight 0 excludes a stat.
- **Settings UI:** stepper changes a weight; tab switch; reset restores defaults; pill visibility reflects weighted stats.
- **Audits:** run `npm run audit:*` locally (boons, metrics, conditions:consistency) — the lesson from v2.8.0: keep `global.d.ts` free of the lucide-bearing catalog, verified by the audit sandbox.
- **Full suite + regression** green before release.

## Files Touched

- `src/renderer/global.d.ts` — `IMvpWeightProfiles` type + inlined `DEFAULT_MVP_WEIGHT_PROFILES`; keep `IMvpWeights` for migration typing.
- `src/renderer/stats/mvpWeightProfiles.ts` — **new**: `normalizeMvpWeightProfiles`, legacy mapping, catalog-derived default (for the sync test), `buildMetrics` helpers (`leaderboardForDef`/`getterForDef`) or those live in incrementalAggregation.
- `src/renderer/stats/incrementalAggregation.ts` — catalog-driven metric building from profiles.
- `src/renderer/SettingsView.tsx` — bucket-tab weight UI; load normalization; save `mvpWeightProfiles`.
- `src/renderer/StatsView.tsx` — pill visibility via weighted `contribs`; retire `mvpStatWeightKeys`/`isMvpStatEnabled` for this path.
- Settings persistence handlers (`src/main/handlers/settingsHandlers.ts`) — pass through `mvpWeightProfiles`.
- Tests as above.

## Open Questions

None blocking. Weight range matches the current MVP sliders (0–1, step 0.05).
