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
- The mitigation math currently lives in renderer-only code
  (`src/renderer/stats/incrementalAggregation.ts`) — nothing in
  `src/shared/`, so `discord.ts` cannot reuse it today. Per the repo's
  architecture rules, metric implementations belong in `src/shared/`.
- The dashboard computes enemy skill averages across **all logs in the
  aggregation window**; a per-fight embed naturally uses a window of one
  log. Same formula, smaller window.

## Goals

1. A "Damage Mitigation" top-10 list is available in the Discord embed,
   toggleable in Settings, **default off** (consistent with the other
   additional stats).
2. One shared implementation of the mitigation math, used by both the
   dashboard aggregation and the embed builder — zero drift by construction.
3. Dashboard numbers do not change at all (the extraction is a pure
   refactor; the `npm run audit:*` scripts and existing suites prove it).

## Non-Goals

- No changes to the dashboard's Damage Mitigation section or its numbers.
- No min-based ("floor") estimate in the embed — it shows the primary
  avg-based `totalMitigation` only.
- No web-report changes.
- No retroactive behavior: the toggle affects embeds posted after the
  setting is enabled.

## Design

### 1. Shared metric module — `src/shared/damageMitigation.ts`

Extract the existing math from `incrementalAggregation.ts` into pure
functions with no renderer/DOM/Node dependencies:

- Enemy skill-average accumulation: per skill id, gather `totalDamage`,
  `connectedHits`, and `min` from `targets[*].totalDamageDist[0]` entries →
  `avgDamage = Σdamage / Σhits`, `minDamage = avg(min)`, carrying
  `connectedHits` so zero-hit skills can be excluded downstream.
- Avoided-damage formula per skill:
  `avoidCount = blocked + evaded + missed + invulned + interrupted`;
  `avoid = glanced × avg/2 + avoidCount × avg` (and the min variant, kept
  because the dashboard uses it).

`incrementalAggregation.ts` delegates to these functions; its multi-log
accumulation behavior and outputs are unchanged. Exact signatures are pinned
during planning from the code being extracted — extraction, not invention.

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

- Unit tests (vitest) for `src/shared/damageMitigation.ts` against a real
  EI JSON from `test-fixtures/` plus small synthetic cases for the edge
  rules (glanced halving, zero-connected-hits exclusion).
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
