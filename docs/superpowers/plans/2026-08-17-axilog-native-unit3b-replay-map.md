# Unit 3b: Replay Map on Native Positions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Retire the last readers of Elite Insights position data — the visual replay
map and `commanderMetrics` — so no code in axibridge reads `combatReplayData.positions`
or `combatReplayMetaData`.

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`
**Record:** `docs/axilog-cutover-report.md` §6 (this unit)

## The central decision: keep the calibrated pixel space, change its source

The map's hand-calibrated constants — every landmark in `wvwLandmarks.ts` (523×750
for alpine BLs, 716×750 for EBG) and every `pixelOffset` in `wvwTiles.ts` — live in
EI's pixel canvas, whose max dimension is 750. Re-calibrating them into world inches
would be a large, risky, purely-cosmetic change.

Unit 3's oracle already proved the alternative: `worldToPixel(arena, x, y, canvas)`
reproduces EI's pixel coordinates to a **median error under 0.01 px** when handed EI's
canvas. So this unit keeps the 750-max render space and derives it from `arena`
instead of from `combatReplayMetaData.sizes`. Every calibrated constant stays valid;
EI stops being read.

Probed at axilog 0.3.5 on `test-fixtures/axilog/wvw-small.anon.zevtc`:

| | value |
|---|---|
| native `arena` image | 697 × 1000 |
| scaled so max dim = 750 | 522.75 × 750 |
| EI `combatReplayMetaData.sizes` | **523 × 750** |

EI rounds. `replayCanvas()` rounds the same way, so the projection is bit-for-bit
the space the landmarks were calibrated against.

## Two measured facts this plan depends on

1. **Native tracks have no gaps.** All 74 tracks in the fixture step by exactly
   `poll_ms`, and every track's first sample is an exact multiple of `poll_ms`. So
   the compact `positions[] + firstPoll` encoding survives intact. This matters:
   `replayFights` is ~66% of `report.json`, and storing `[t, x, y]` triples instead
   would have inflated the largest part of the payload by ~50% for no gain.
   **If a future axilog version introduces gaps, this encoding breaks silently** —
   Task 2 adds an assertion so it breaks loudly instead.

2. **The projection is anisotropic.** World extent is 61440 × 86016 (ratio 0.714)
   but the arena image is 697 × 1000 (ratio 0.697). The x and y scales genuinely
   differ by ~2.4%. EI collapsed this to a single `inchToPixel` scalar of `0.009`,
   against true scales of `523/61440 = 0.008512` (x) and `750/86016 = 0.008719` (y)
   — so EI's range rings were drawn 3–6% too large. Native replaces the scalar with
   an exact per-axis pair.

## Global Constraints

- axilog pinned at the version in `package.json`; the oracle reads the pin, never a literal.
- `src/shared/**` is compiled by `electron/tsconfig.json` (Node10 resolver) — import
  bridge-metrics **subpaths**, never the package root.
- `packages/bridge-metrics` is consumed via `dist/`. Rebuild before testing.
- vitest runs with `--maxWorkers=2`.
- Never add a non-anonymized `.zevtc`.

---

## Task 1: The native map projection

**Files:** Create `packages/bridge-metrics/src/nativeMapProjection.ts` + test; wire
`package.json` exports, `tsup.config.ts`, `src/index.ts`.

- `REPLAY_CANVAS_MAX = 750` — documented as the space `wvwLandmarks` and
  `wvwTiles.pixelSize` are calibrated in.
- `replayCanvas(arena): [number, number]` — image size scaled so the max dimension
  is 750, rounded, reproducing EI's `sizes`.
- `pixelsPerInch(arena, canvas): { x, y }` — exact per-axis scale, replacing
  `inchToPixel`.

## Task 2: `buildMovementData` sources positions from native

**Files:** `src/shared/movementData.ts`, its test.

- Members come from native `entities` (squad/friendly via `squadEntities`, enemies
  via `enemyPlayerEntities`), joined to tracks by entity id — replacing EI's fragile
  join by character name.
- `positions` = `track.samples` projected through `worldToPixel(arena, …, canvas)`.
- `firstPoll` = `samples[0][0] / pollMs`, read from the sample's own timestamp
  rather than inferred with `ceil(start / poll)`.
- `downRanges`/`deadRanges` from native `down_intervals`/`dead_intervals`.
- `inchToPixel: number` → `pixelsPerInch: { x, y }`.
- Assert the uniform-grid invariant; drop a track loudly if it is violated.
- Boons, skill casts, health percents and damage-taken series still come from EI —
  those blocks belong to units 4–6. Join native entity → EI player by account.

## Task 3: Payload metadata off native

**Files:** `src/renderer/stats/incrementalAggregation.ts`, `src/shared/mapUtils.ts`.

- `mapSize` ← `replayCanvas(arena)`; `mapImageUrl` ← `arena.image_url`.
- `computeFightAvgPosition` reads native tracks and projects, so the landmark
  lookup keeps receiving pixel-space input.

## Task 4: Range rings use the exact per-axis scale

**Files:** `src/renderer/stats/map/SquadOverlay.tsx`, its test.

Replace the two `<circle>` range rings with `<ellipse>`, `rx = 600 * ppi.x`,
`ry = 600 * ppi.y`. This is a deliberate, visible correction: the rings were
previously both too large and forced circular in an anisotropic space.

## Task 5: `commanderMetrics` positional funnel — DEFERRED to its own unit

Scoping this against the code rather than the file list changed the answer. It is
not a mechanical source swap, for two reasons found while probing:

1. **`playerPosAt(player, tSec, framesPerSec)` is keyed on an EI `Player`.** There
   is no entity id on it, so feeding it native tracks means changing
   `computeCommanderFightData`'s contract and threading an account→track join
   through four files. That is unit-scale work on a 2000-line EI-shaped subsystem
   whose other 90% belongs to units 4–6.

2. **There is a pre-existing unit bug here that must be fixed deliberately, not
   incidentally.** `cohesion.ts` computes `distFromTag` in map PIXELS, and
   `firstSquadDeathEarly.ts` renders it as `"<n>u from tag"` — game units. Those
   differ by ~117× (one pixel spans ~117 world inches on the reference fixture).
   The detector's thresholds appear tuned against the pixel value, so correcting
   the unit without re-tuning them would change which fights trigger the detector.

Deciding that trade-off belongs with the commanderMetrics migration, where the
thresholds can be re-derived, not inside the replay-map unit. Tracked as the next
unit; it is the last EI-position reader in the app.

## Task 6: Oracle, docs, verification

- Extend `src/test/__tests__/unit3Positioning.oracle.test.ts` (or add a 3b file):
  native-sourced `MovementData.positions` equals EI's `positions` within a sub-pixel
  tolerance, and `replayCanvas(arena)` equals EI's `sizes`.
- Assert no production file outside the parser reads `combatReplayData.positions`
  or `combatReplayMetaData`.
- Update `docs/axilog-cutover-report.md`.
- `npm --prefix packages/bridge-metrics run build && test`, `npm run validate`,
  full unit suite.
