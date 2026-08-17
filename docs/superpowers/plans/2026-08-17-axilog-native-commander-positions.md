# Commander Positions Native Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move `commanderMetrics` off EI replay positions onto native world-inch tracks — the last EI-position reader in the codebase — and, in doing so, fix the pixels-vs-game-units bug that silently disabled six metrics and four detectors.

**Architecture:** Native replay samples are already world inches, which is the unit every commander threshold is written in. So the migration is not "convert pixels to units" — it is "stop projecting". `computeCohesion` and `computeMatchup` take native tracks keyed by entity id instead of EI `Player.combatReplayData.positions`, and their distances come out in game units for free.

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`

## Global Constraints

- axilog pinned at 0.3.5; `@axiapps/bridge-metrics` is consumed via `dist/` — rebuild before testing.
- `src/shared/**` is compiled by `electron/tsconfig.json` (Node10 resolver): import bridge-metrics **subpaths**, never the package root.
- vitest runs with `--maxWorkers=2`.
- Thresholds in `commanderThresholds.ts` stay at their current values. They were always game units.

---

## The measured problem

Probed against `test-fixtures/axilog/wvw-small.anon.zevtc` (38 squad, 49s):

| | today (pixels) | corrected (game units) |
|---|---|---|
| `avgDistFromTag` | 10.20 → rendered as "10u" | 1101u |
| `peakSpreadStdev` | 58.82 vs `spreadBad` 600 | 5228u |
| `timeSpread900PlusSec` | 0 of 50s | — |
| `stragglersAtBomb` | 0 | — |

At 0.008512 px/inch, `900u` is **7.66px** and `1500u` is **12.77px**. Since the whole
arena is 523×750px, a pixel-space distance can never reach 900, so:

- `timeSpread900PlusSec` is **always 0**
- `stragglersAtBomb` is **always 0**
- `matchup.inTagBubbleAtEngage` (600u vs pixels) is **provably always 100%** — 600px is ~70,000u, wider than the map
- `fragmentedAtBomb`, `caughtOutDeaths`, `firstSquadDeathEarly`'s far-flag, and `outcome`'s `caught-out` chip can never fire

The per-player-second distance distribution in game units — median 599u, p75 778u,
p90 992u — lands squarely on the existing 600/900/1500 thresholds. That is the
evidence the thresholds were always intended as game units and only the input
scale was wrong.

---

### Task 1: A native squad-position layer

**Files:**
- Modify: `src/shared/commanderMetrics/shared.ts`
- Test: `src/shared/commanderMetrics/__tests__/shared.squadPos.test.ts` (replaces `shared.playerPosAt.test.ts`)

Delete `playerPosAt` and the EI form of `buildSquadPositionSeries`. Replace with a
layer built from `NativeMovement`, keyed by entity id and identified by account:

```ts
export interface SquadTrack { key: string; track: PositionTrack }

export function buildSquadTracks(json: DPSReportJSON): { tracks: SquadTrack[]; pollMs: number }
export function squadPosAt(t: SquadTrack, tSec: number, pollMs: number): [number, number] | null
export function buildSquadPositionSeries(
  tracks: SquadTrack[], pollMs: number, seriesLen: number,
): Array<[number, number][]>
```

`squadPosAt` delegates to `positionAtOrBefore(track, tSec * 1000, pollMs)`, which
already refuses to borrow a position across a tracking gap. A per-second sample on
a 300ms grid is never on-grid (t=1000 → last sample 900), so at-or-before is the
correct resolver, and the one-poll staleness bound is what keeps it honest.

There is no `framesPerSec` and no start-frame derivation: native samples carry
their own timestamps. This removes the `ceil`-vs-`floor` bug class that unit 3
found at five call sites and that `shared.ts` carries an eight-line comment about.

- [ ] Write the failing test for `squadPosAt` (on-grid, between-grid, past-the-end, gap)
- [ ] Implement, delete the EI helpers
- [ ] Run tests
- [ ] Commit

### Task 2: Cohesion in game units

**Files:**
- Modify: `src/shared/commanderMetrics/cohesion.ts`, `src/shared/commanderMetrics/index.ts`
- Test: `src/shared/commanderMetrics/__tests__/cohesion.native.test.ts`

`CohesionContext` swaps `squadPlayers: Player[]` + `pollingRate` for
`tracks: SquadTrack[]` + `pollMs`. The 900/1500 literals stay; they are now
compared against game units.

Death matching stays keyed on account (`SquadTrack.key`), matching
`DeathEvent.account`, so `distFromTag` fills exactly as before — in units the
`"…u from tag"` evidence string has always claimed.

- [ ] Write a native-backed test asserting corrected magnitudes on the real fixture
- [ ] Migrate `computeCohesion`
- [ ] Run tests
- [ ] Commit

### Task 3: Matchup's tag bubble

**Files:**
- Modify: `src/shared/commanderMetrics/matchup.ts`
- Test: `src/shared/commanderMetrics/__tests__/matchup.test.ts`

Same swap for `inTagBubbleAtEngage`. Its `TAG_RADIUS = 600` becomes meaningful for
the first time; the distinct-person dedupe logic is untouched.

- [ ] Update the existing test onto native tracks
- [ ] Add a test that a member well outside 600u is excluded (impossible to write today)
- [ ] Migrate, run tests
- [ ] Commit

### Task 4: Verification against the real fixture

**Files:**
- Create: `src/test/__tests__/commanderPositions.oracle.test.ts`

Assert, against `test-fixtures/axilog/wvw-small.anon.zevtc`:
- `avgDistFromTag` is in a plausible game-unit band (hundreds–thousands), not single digits
- `matchup.inTagBubbleAtEngage < squadCount` — i.e. the metric can now discriminate
- allowlist entry recording that EI's pixel space is the wrong side

- [ ] Write, run, commit

### Task 5: Documentation

- [ ] `docs/axilog-cutover-report.md` §5: record the unit and the measured before/after
- [ ] `src/shared/movementData.ts`: the `NativeMovement` docstring still describes unit 3b as future work — correct it
- [ ] Commit

---

## Deliberately NOT in this unit

- **Absent squad members distort the aggregates.** One alive squad member sits
  ~18,000u away (a scout or an afk in spawn), which is what drags the mean to
  1101u against a median of 572u and inflates `peakSpreadStdev` to 5228u. Excluding
  dead/downed players does not help — measured, it moves nothing. Whether cohesion
  should use robust statistics, or exclude non-participants, is a product decision
  about what these cards mean, not a migration question.
- **`distFromTag` measures distance from the squad centroid, not the commander.**
  Native exposes `commander.segments`, so the real tag position is now available for
  the first time. Changing it would redefine the metric the thresholds sit on.
