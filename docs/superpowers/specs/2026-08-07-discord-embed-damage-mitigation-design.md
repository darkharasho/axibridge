# Discord Embed: Damage Mitigation Stat — Design

**Date:** 2026-08-07
**Status:** Approved (pending spec review)
**Origin:** User feature request (relayed): "is it possible to add damage
mitigation as an option within the discord embed?"

## Problem

The Discord fight embed offers a configurable set of per-fight top-10 stat
lists (`IEmbedStatSettings.show*` toggles), but Damage Mitigation is not one
of them. The metric itself already exists in the app: the stats dashboard has
a Damage Mitigation section, and `src/shared/metrics-spec.md` §"Damage
Mitigation (Player + Minion)" defines it — an **estimate** of avoided damage
(enemy per-skill damage averages × block/evade/miss/invuln/interrupt counts,
glances at half; skills with zero connected hits excluded).

## Investigation Findings (current state)

- Embed fields are built per fight in the **main process**
  (`src/main/discord.ts`) directly from the fight's EI JSON, as a list of
  stat definitions gated by `enabled: settings.show<Stat>` flags.
- `IEmbedStatSettings` exists in TWO places that must stay in sync:
  `src/renderer/global.d.ts` (with `DEFAULT_EMBED_STATS`) and a copy in
  `src/main/discord.ts`. Additional stats (Resurrects, Kills, Deaths, …)
  default to `false`.
- The mitigation math lives in the published shared package
  **`@axiapps/bridge-metrics`** (`src/renderer/stats/computePlayerAggregation.ts`
  is a one-line re-export). The package ships dual CJS/ESM (`main:
  ./dist/index.cjs`) and its root export exposes the full pipeline:
  `createPlayerAggregationAccumulators` → `precomputeGlobalEnemySkillStats(log, acc)`
  → `ingestLogPlayerData(log, acc, options)` → `finalizePlayerAggregation(acc)`,
  filling `acc.damageMitigationPlayersMap` / `damageMitigationMinionsMap`
  with rows carrying `mitigationTotals` (`totalMitigation`, `minMitigation`,
  per-event counts). `log` is a `{ details }` wrapper around the EI JSON —
  exactly what `discord.ts` holds per fight. The Electron main build is
  CommonJS, so it can import the package directly.
- Housekeeping: `package.json` declares `@axiapps/bridge-metrics: ^0.1.0`
  but 0.2.0 is installed — the range gets corrected to `^0.2.0`.
- The dashboard computes enemy skill averages across **all logs in the
  aggregation window**; a per-fight embed naturally uses a window of one
  log. Same formula, smaller window.

## Goals

1. A "Damage Mitigation" top-10 list is available in the Discord embed,
   toggleable in Settings, **default off** (consistent with the other
   additional stats).
2. One shared implementation of the mitigation math, used by both the
   dashboard aggregation and the embed builder — zero drift by construction.
3. Dashboard numbers and code paths do not change at all (nothing in the
   renderer is modified; the `npm run audit:*` scripts and existing suites
   stay green as the backstop).

## Non-Goals

- No changes to the dashboard's Damage Mitigation section or its numbers.
- No min-based ("floor") estimate in the embed — it shows the primary
  avg-based `totalMitigation` only.
- No web-report changes.
- No retroactive behavior: the toggle affects embeds posted after the
  setting is enabled.

## Design

### 1. Reuse the `@axiapps/bridge-metrics` pipeline (no extraction)

**(Revised 2026-08-07 after exploration; original design called for
extracting math into `src/shared/damageMitigation.ts` — unnecessary, the
shared home already exists as the package.)**

`discord.ts` imports the pipeline from `@axiapps/bridge-metrics` and runs it
per fight when the mitigation stat is enabled:

```
const acc = createPlayerAggregationAccumulators();
precomputeGlobalEnemySkillStats({ details: jsonDetails }, acc);
ingestLogPlayerData({ details: jsonDetails }, acc, defaultOptions);
finalizePlayerAggregation(acc);
```

then builds the top-10 from `acc.damageMitigationPlayersMap` plus each
account's minion rows (summed per account — the metric's "Player + Minion"
scope). `defaultOptions` mirrors the dashboard's defaults
(`splitPlayersByClass: false`, default disruption method / skill damage
source). Zero drift is structural: the embed executes the same code the
dashboard does, with a window of one log (~23ms per fight, per existing
profiling). `incrementalAggregation.ts` is not touched.

### 2. Embed stat — `src/main/discord.ts`

- `showDamageMitigation: boolean` added to both `IEmbedStatSettings`
  declarations and both `DEFAULT_EMBED_STATS` objects, default `false`.
- New top-10 stat definition in the embed builder: for the fight's EI JSON,
  build single-log enemy skill averages, compute each player's mitigation
  **including minions** (player `totalDamageTaken[0]` + minions'
  `totalDamageTakenDist[0]`, matching the metric's "Player + Minion"
  scope), sort descending, respect `maxTopListRows`, format like the
  existing lists (emoji-label style).
- Fights with no usable enemy damage distribution produce an empty list and
  the field is omitted, matching existing empty-list behavior.

### 3. Settings UI — `src/renderer/SettingsView.tsx`

One new checkbox, "Damage Mitigation", in the embed-stats group alongside
the other default-off additional stats, following the existing
checkbox-list pattern.

### 4. Testing & docs

- Unit tests (vitest) for the embed-side mitigation list builder (pipeline
  invocation + player/minion summing + sorting + row formatting) against a
  real EI JSON from `test-fixtures/`, plus a synthetic case covering the
  empty/no-enemy-data omission path.
- `npm run audit:boons && npm run audit:metrics && npm run audit:conditions`
  and the full unit suite stay green — the no-drift proof for the
  extraction.
- `src/shared/metrics-spec.md`: add a short note under the Damage
  Mitigation section that the Discord embed computes the same estimate over
  a single-log window; run `npm run sync:metrics-spec`.
- Release-notes reminder for whoever ships it: call out that mitigation is
  an estimate and will not match the arcdps meter (per
  `metrics-spec.md` and the existing down-contribution precedent).

## Success Criteria

- Enabling the new checkbox adds a "Damage Mitigation" top-10 to the next
  posted fight embed; disabled (default) embeds are byte-identical to
  today's.
- Dashboard mitigation numbers are unchanged (audits + suite green).
- The embed list ranks the same players in the same order as the dashboard
  would for a single-fight aggregation of that log.
