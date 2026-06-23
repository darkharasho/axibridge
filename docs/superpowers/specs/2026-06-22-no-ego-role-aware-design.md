# No Ego Mode — Role-Aware Comparisons (Design)

**Date:** 2026-06-22
**Status:** Approved (pending spec review)
**Builds on:** [No Ego Mode design](2026-06-22-no-ego-mode-design.md). Same branch (`feat/no-ego-mode`), not yet merged.

## Problem

No Ego mode flags "needs-improvement" outliers by comparing every player against a
single squad-wide average per metric. That is unfair across roles: a healer with low
down-contribution gets flagged even though low down-contribution is expected for that
role. The fix is to compare like-with-like.

## What already exists (reused, not rebuilt)

- A binary role classifier: `packages/bridge-metrics/src/roles.ts`
  (`PlayerRoleClassification` = `{ role: 'support' | 'damage'; supportScore; confidenceScore; threshold; factors }`)
  and `src/renderer/stats/classifyPlayerRoles.ts`.
- It is populated per player as `roleClassification` during aggregation
  (`computePlayerAggregation.ts`, `incrementalAggregation.ts`) and already used to filter
  MVP candidates (damage → Offensive MVP, support → Defensive MVP).
- The aggregation output also carries a `roleClassifications` array
  (`{ account, profession, professionList, role, supportScore, confidenceScore, threshold, factors }`).
- `computeSquadStat(players, higherIsBetter, sigmaThreshold=1.5)` in `src/shared/squadStats.ts`
  computes mean/σ/outliers for a set of players.

## Decisions (from brainstorming)

- **Cohort comparison (#1):** needs-improvement outliers are computed *within the
  player's role group* (support vs damage), not against the whole squad.
- **One card per metric** (no card doubling). The dot-plot colors dots by role; headline
  shows **per-cohort averages** when both roles are present, collapsing to a single average
  when only one role is present.
- **Outlier row shows value + gap** (`value · −1.6σ`) measured against that player's cohort,
  replacing the bare value.
- **Applies to all metrics uniformly.** No per-metric role-relevance list.
- **Small-cohort fallback:** if a player's role group has **fewer than 3 players**, that
  player is compared squad-wide instead (σ from <3 players is meaningless), and is not
  spuriously flagged.
- **Trust the classifier as-is** (same one MVP uses); no confidence-gating.
- **Binary support/damage only.** Finer roles (healer vs boon-support) are out of scope.
- **Rollup stays squad-wide / unchanged.** Roles are not stable across many reports.
- **Always on inside No Ego mode** — no separate toggle.

## Architecture

### New shared helper: cohort-aware squad stats

Add to `src/shared/squadStats.ts` (keep it dependency-free):

```ts
export type PlayerRole = 'support' | 'damage';

export interface CohortStatPlayer extends SquadStatPlayer {
  role?: PlayerRole;   // omitted/unknown players are treated squad-wide
}

export interface CohortStatSummary {
  // Per-cohort summaries (undefined when that cohort has 0 players)
  support?: SquadStatSummary;
  damage?: SquadStatSummary;
  squad: SquadStatSummary;            // always present (whole-squad), for fallback + dot-plot context
  // Outliers across the squad, each flagged against the correct baseline:
  needsImprovementOutliers: Array<SquadStatPlayer & {
    role?: PlayerRole;
    baseline: 'support' | 'damage' | 'squad';  // which cohort it was judged against
    sigmaGap: number;                            // signed distance in σ on the needs-improvement side (>= sigmaThreshold)
  }>;
}

export function computeCohortStat(
  players: CohortStatPlayer[],
  higherIsBetter: boolean,
  sigmaThreshold?: number,            // default 1.5
  minCohortSize?: number,             // default 3
): CohortStatSummary;
```

Rules:
- Partition players into `support`, `damage`, and `unknown` (no role).
- A cohort with `>= minCohortSize` players is a valid baseline; otherwise its members fall
  back to the squad baseline. `unknown`-role players always use the squad baseline.
- For each player, run the 1.5σ needs-improvement test against its chosen baseline
  (cohort or squad), reusing the existing `computeSquadStat` math; `sigmaGap` = how far past
  the mean on the bad end (in σ).
- `squad` summary is always computed (used for the dot-plot extent and headline collapse).

This isolates all role-vs-squad logic in one tested pure function. `computeSquadStat` is
unchanged.

### Card presentation: `MetricDistributionCard`

Extend `MetricDistributionCardProps` with an optional role channel:

```ts
players: Array<SquadStatPlayer & { role?: 'support' | 'damage' }>;
roleAware?: boolean;   // when true, use computeCohortStat; default false = current behavior
```

When `roleAware` is true:
- Compute via `computeCohortStat`.
- Dot-plot: color dots by role (damage = warm accent, support = cool accent, unknown =
  neutral). Outlier dots keep the accent-outline treatment.
- Headline: when both `support` and `damage` baselines exist, render two compact averages
  (`DPS <avg> · Sup <avg>`) each with σ; otherwise a single average as today.
- "Most room to improve": each row shows profession icon · account · `value · −<sigmaGap>σ`,
  with a small role/baseline tag when the baseline is a cohort.

When `roleAware` is false/absent, the card behaves exactly as today (default-off safety).

### Wiring

The Squad Summary (`TopPlayersSection`) and the Offense/Defense/Support section cards build
their `players` arrays. Add `role` to each player from the aggregation's `roleClassifications`
(join by account, respecting `splitPlayersByClass` keys the same way existing code does), and
pass `roleAware={noEgoMode}` (role-aware is part of No Ego mode). The rollup cards are NOT
changed.

Role lookup: build a `Map<account, 'support'|'damage'>` from `stats.roleClassifications` once
per section and attach `role` when constructing each card's player list. Players missing from
the map get no role (squad-wide fallback).

## Testing

- **Unit (`squadStats.test.ts` additions):** `computeCohortStat`
  - healer with low value-for-damage-metric is NOT flagged when judged among supports;
  - a genuinely-low support IS flagged against the support baseline;
  - small cohort (<3) falls back to squad baseline (no spurious flag);
  - unknown-role players use squad baseline;
  - `sigmaGap` sign/magnitude correct for both higherIsBetter true/false;
  - both-cohorts-present vs single-cohort summaries populated correctly;
  - empty input safe.
- **Component (`MetricDistributionCard` additions):** with `roleAware` and a mixed-role
  fixture, dual-average headline renders, dots carry role colors, and a damage-metric does
  not flag a support player; outlier rows show the `· −Xσ` gap.
- **Integration:** extend the existing No Ego StatsView test (or add one) asserting that a
  support player with low down-contribution is not listed as a down-contribution
  outlier when role-aware comparison is active.

## Out of scope (YAGNI)

- Finer sub-roles (healer vs boon-support vs power vs condi).
- Role-aware treatment of the cross-report rollup.
- A separate toggle (role-awareness is intrinsic to No Ego mode).
- Confidence-score gating of classifications.
- Persisting elite-spec through aggregation.
