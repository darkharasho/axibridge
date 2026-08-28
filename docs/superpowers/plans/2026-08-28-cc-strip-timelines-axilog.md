# CC and Strip Timelines — Part A: axilog 1.8.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit three new per-second series from axilog — squad boon strips, and per-entity outgoing CC, outgoing strips, and incoming strips — so AxiBridge can render within-fight CC and strip timelines.

**Architecture:** A new self-contained analysis module (`analysis/entity_series.rs`) folds the existing CC and strip primitives into per-player 1s buckets. The two strip primitives widen their tuple to carry the event timestamp they currently discard. The squad `strips` lane joins the existing `Timeline`. Nothing already-calibrated changes its arithmetic.

**Tech Stack:** Rust 2021, `cargo test`, napi-rs (`crates/axilog-node`), serde JSON.

**Spec:** `docs/superpowers/specs/2026-08-28-cc-strip-timelines-design.md` (in the AxiBridge repo)

**Repo:** `~/Documents/GitHub/axilog` — all paths below are relative to it.

## Deviation from the spec, and why

The spec sketches per-entity CC buckets as "a per-player bucket matrix populated inside the existing loop in `cc.rs`". This plan instead builds them in a **new module** that calls the same `is_cc` predicate and `pet_credit_cc_events` producer.

Reason: `cc::apply` does not receive `Encounter`, so it has no `duration_ms` and cannot size buckets; `timeline_with_registry` has `enc` but not the per-player `idx`/`addr_to_rep` map. Threading either one into the other perturbs the most heavily pinned function in the crate for no gain. A separate module costs one extra pass over `raw.events` — negligible — and reuses the identical predicate, which is what the spec's sum-invariants actually depend on.

## Global Constraints

- **Calibration is frozen.** `strips`, `strips_duration_ms`, `boon_strips_taken`, `cc_applied`, `cc_duration_ms` must not change value for any fixture. The widened tuples exist to be ignored by the existing folds.
- **Per-entity lanes are `Option<SeriesOut>`, gated on `timeseries: true`.** The squad lane is required and unconditional, matching `cc_applied`.
- **Series resolution is 1000 ms**, matching `Timeline::resolution_ms` and every other `SeriesOut`.
- **Bucket counts are per-bucket, not cumulative.** No running totals.
- **`crates/axilog-node/types.d.ts` is hand-maintained.** Every schema field added in Rust needs a matching entry with a doc comment.
- **Release tags are cut from `main`.** A `docs/CHANGELOG.md` section must exist before tagging or the Release job dies after npm-publish.

---

### Task 1: Widen the strip primitives to carry timestamps

**Files:**
- Modify: `crates/axilog-core/src/analysis/support.rs` (`outgoing_boon_strips`, `fold_outgoing_boon_strips`)
- Modify: `crates/axilog-core/src/analysis/defenses.rs` (`incoming_boon_strips`, `incoming_boon_strips_with_registry`, and its fold site)
- Test: inline `#[cfg(test)] mod tests` in both files

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `support::outgoing_boon_strips(raw, enemies, addr_to_rep) -> BTreeMap<u64, Vec<(u64, u32, u64)>>` keyed by remover rep-addr, tuple `(time_ms, skillid, duration_ms)`
  - `defenses::incoming_boon_strips_with_registry(raw, registry, squad, addr_to_rep) -> BTreeMap<u64, Vec<(u64, u32, u64)>>` keyed by victim rep-addr, same tuple

- [ ] **Step 1: Write the failing test in `support.rs`**

Add to the existing `mod tests` in `crates/axilog-core/src/analysis/support.rs`:

```rust
#[test]
fn outgoing_boon_strips_carries_event_time() {
    let mut e = base_event();
    e.time = 4200;
    e.is_buffremove = buff_remove::ALL;
    e.skillid = 740;          // Might, a BOON_IDS member
    e.src_agent = 200;        // victim (enemy) — role inversion
    e.dst_agent = 100;        // remover (squad player)
    e.value = 3000;

    let raw = RawLog {
        header: RawHeader::default(),
        agents: vec![],
        skills: vec![],
        events: vec![e],
    };
    let enemies: BTreeSet<u64> = [200u64].into_iter().collect();
    let addr_to_rep: BTreeMap<u64, u64> = BTreeMap::new();

    let out = outgoing_boon_strips(&raw, &enemies, &addr_to_rep);
    assert_eq!(out.get(&100).map(Vec::as_slice), Some(&[(4200u64, 740u32, 3000u64)][..]));
}
```

If `RawHeader::default()` or the `RawLog` literal does not match this file's existing test helpers, copy the construction verbatim from the nearest existing test in the same `mod tests` — do not invent field names.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cargo test -p axilog-core outgoing_boon_strips_carries_event_time
```

Expected: FAIL — mismatched types, `(u32, u64)` vs `(u64, u32, u64)`.

- [ ] **Step 3: Widen `outgoing_boon_strips`**

In `crates/axilog-core/src/analysis/support.rs`, change the return type and the push:

```rust
pub fn outgoing_boon_strips(
    raw: &RawLog,
    enemies: &BTreeSet<u64>,
    addr_to_rep: &BTreeMap<u64, u64>,
) -> BTreeMap<u64, Vec<(u64, u32, u64)>> {
```

and the push at the end of the event loop:

```rust
        out.entry(rep(e.dst_agent))
            .or_default()
            .push((e.time, e.skillid, e.value.max(0) as u64));
```

Update its doc comment to state the tuple is `(time_ms, skillid, duration_ms)` and that `time_ms` is the raw event time, NOT relative to log start — callers subtract `raw.log_start_ms()` themselves.

- [ ] **Step 4: Keep the existing fold arithmetically identical**

In the same file, `fold_outgoing_boon_strips`:

```rust
    for (rep_addr, strips) in outgoing_boon_strips(raw, enemies, addr_to_rep) {
        let Some(&i) = idx.get(&rep_addr) else { continue };
        players[i].support.strips += strips.len() as u32;
        players[i].support.strips_duration_ms +=
            strips.iter().map(|&(_, _, ms)| ms).sum::<u64>();
    }
```

Only the destructuring pattern changes: `|&(_, ms)|` becomes `|&(_, _, ms)|`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cargo test -p axilog-core outgoing_boon_strips_carries_event_time
```

Expected: PASS.

- [ ] **Step 6: Apply the identical widening to `incoming_boon_strips`**

In `crates/axilog-core/src/analysis/defenses.rs`, change both the wrapper and the `_with_registry` variant to return `BTreeMap<u64, Vec<(u64, u32, u64)>>`, push `(e.time, e.skillid, e.value.max(0) as u64)`, and update the fold that consumes it to destructure `|&(_, _, ms)|`. Update the doc comment the same way.

Then add the mirror test to that file's `mod tests`:

```rust
#[test]
fn incoming_boon_strips_carries_event_time() {
    let mut e = base_event();
    e.time = 7700;
    e.is_buffremove = buff_remove::ALL;
    e.skillid = 740;
    e.src_agent = 100;        // victim (squad player)
    e.dst_agent = 200;        // remover (enemy)
    e.value = 1500;

    let raw = RawLog {
        header: RawHeader::default(),
        agents: vec![
            // `known_agents` membership is the CreditedBy.IsUnknown test —
            // the remover must appear in the agent table or the row is dropped.
        ],
        skills: vec![],
        events: vec![e],
    };
    let squad: BTreeSet<u64> = [100u64].into_iter().collect();
    let addr_to_rep: BTreeMap<u64, u64> = BTreeMap::new();

    let out = incoming_boon_strips(&raw, &squad, &addr_to_rep);
    assert_eq!(out.get(&100).map(Vec::as_slice), Some(&[(7700u64, 740u32, 1500u64)][..]));
}
```

The `agents` vec must contain an entry whose `addr` is `200`, built the way the nearest existing test in that file builds agents. Without it, `known_agents` rejects the remover and the map comes back empty.

- [ ] **Step 7: Run the full core suite to prove calibration is unchanged**

```bash
cargo test -p axilog-core
```

Expected: PASS, including every existing strip and parity test. If any calibration assertion moved, the widening leaked into the arithmetic — revert and re-check the destructuring patterns.

- [ ] **Step 8: Commit**

```bash
git add crates/axilog-core/src/analysis/support.rs crates/axilog-core/src/analysis/defenses.rs
git commit -m "refactor(analysis): carry event time on boon-strip primitives

The tuple widens from (skillid, duration_ms) to (time_ms, skillid,
duration_ms). Both existing folds ignore the new field, so strips,
strips_duration_ms and boon_strips_taken are unchanged."
```

---

### Task 2: Per-entity 1s series module

**Files:**
- Create: `crates/axilog-core/src/analysis/entity_series.rs`
- Modify: `crates/axilog-core/src/analysis/mod.rs` (add `pub mod entity_series;`)
- Test: inline `#[cfg(test)] mod tests` in the new file

**Interfaces:**
- Consumes: `support::outgoing_boon_strips` and `defenses::incoming_boon_strips_with_registry` from Task 1, both returning `(time_ms, skillid, duration_ms)` tuples
- Produces:
  ```rust
  pub struct PlayerSeries {
      pub cc_applied: Vec<u32>,
      pub strips: Vec<u32>,
      pub strips_taken: Vec<u32>,
  }
  pub struct EntitySeriesDetail { per_player: Vec<PlayerSeries> }
  impl EntitySeriesDetail {
      pub fn len(&self) -> usize;
      pub fn is_empty(&self) -> bool;
      pub fn get(&self, i: usize) -> &PlayerSeries;
  }
  pub fn build(
      enc: &Encounter,
      raw: &RawLog,
      registry: &InstidRegistry,
      players: &[PlayerMetrics],
      squad: &BTreeSet<u64>,
      enemies: &BTreeSet<u64>,
      addr_to_rep: &BTreeMap<u64, u64>,
  ) -> EntitySeriesDetail
  ```
  Indexing is **positional over `players`**, matching `healing_detail`'s convention — consumers must length-guard against `players.len()` before joining.

- [ ] **Step 1: Write the failing sum-invariant test**

Create `crates/axilog-core/src/analysis/entity_series.rs` with only the test module first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// The invariant the whole feature rests on: bucketed CC must sum to the
    /// scalar `cc_applied` that `cc::apply` already produces, because both
    /// walk the same events through the same `is_cc` predicate.
    #[test]
    fn per_player_cc_buckets_sum_to_scalar() {
        let (enc, raw, registry, players, squad, enemies, addr_to_rep) = two_cc_fixture();
        let detail = build(&enc, &raw, &registry, &players, &squad, &enemies, &addr_to_rep);
        for (i, p) in players.iter().enumerate() {
            let bucketed: u32 = detail.get(i).cc_applied.iter().sum();
            assert_eq!(bucketed, p.cc_applied, "player {i} CC buckets must sum to scalar");
        }
    }

    /// Two CC events 6s apart must land in different buckets, not be summed
    /// into one — this is what distinguishes a series from the scalar.
    #[test]
    fn cc_events_separate_into_distinct_buckets() {
        let (enc, raw, registry, players, squad, enemies, addr_to_rep) = two_cc_fixture();
        let detail = build(&enc, &raw, &registry, &players, &squad, &enemies, &addr_to_rep);
        let s = &detail.get(0).cc_applied;
        assert_eq!(s[1], 1, "first CC at t=1500ms lands in bucket 1");
        assert_eq!(s[7], 1, "second CC at t=7500ms lands in bucket 7");
        assert_eq!(s.iter().sum::<u32>(), 2);
    }
}
```

Write `two_cc_fixture()` as a helper in the same `mod tests`, building an `Encounter` with `duration_ms = 10_000`, a `RawLog` whose `log_start_ms()` is 0, one squad player at addr 100, one enemy at addr 200, and two CC events (`result = result::CROWD_CONTROL`) at `time = 1500` and `time = 7500`. Construct `Encounter`, `Player`, and `PlayerMetrics` by copying the construction from `cc.rs`'s `mod tests`, which already builds all four for its own CC tests — do not invent field names.

- [ ] **Step 2: Run to verify it fails**

```bash
cargo test -p axilog-core entity_series
```

Expected: FAIL — `build` and the types are not defined.

- [ ] **Step 3: Implement the module**

Prepend to `crates/axilog-core/src/analysis/entity_series.rs`:

```rust
//! Per-entity 1s series for outgoing CC and boon strips (both directions).
//!
//! Deliberately a separate pass rather than an extension of `cc::apply` or
//! `timeline_with_registry`: `apply` has no `Encounter` (so it cannot size
//! buckets) and `timeline_with_registry` has no per-player index. Reusing the
//! same `is_cc` predicate and the same strip primitives is what makes the
//! sum-invariant tests hold; sharing a loop with them is not required for it.
//!
//! Indexing is POSITIONAL over `players`, matching `healing_detail`.

use std::collections::{BTreeMap, BTreeSet};

use crate::analysis::cc::{is_cc, pet_credit_cc_events};
use crate::analysis::damage::InstidRegistry;
use crate::analysis::{defenses, support, PlayerMetrics};
use crate::evtc::RawLog;
use crate::model::Encounter;

#[derive(Debug, Clone, Default)]
pub struct PlayerSeries {
    pub cc_applied: Vec<u32>,
    pub strips: Vec<u32>,
    pub strips_taken: Vec<u32>,
}

#[derive(Debug, Clone, Default)]
pub struct EntitySeriesDetail {
    per_player: Vec<PlayerSeries>,
}

impl EntitySeriesDetail {
    pub fn len(&self) -> usize { self.per_player.len() }
    pub fn is_empty(&self) -> bool { self.per_player.is_empty() }
    pub fn get(&self, i: usize) -> &PlayerSeries { &self.per_player[i] }
}

pub fn build(
    enc: &Encounter,
    raw: &RawLog,
    registry: &InstidRegistry,
    players: &[PlayerMetrics],
    squad: &BTreeSet<u64>,
    enemies: &BTreeSet<u64>,
    addr_to_rep: &BTreeMap<u64, u64>,
) -> EntitySeriesDetail {
    let res = 1000u64;
    let buckets = ((enc.duration_ms / res) + 1) as usize;
    let t0 = raw.log_start_ms();
    let post_era = raw.header.is_post_buff_rework();

    let idx: BTreeMap<u64, usize> =
        players.iter().enumerate().map(|(i, p)| (p.agent_addr, i)).collect();
    let rep = |addr: u64| addr_to_rep.get(&addr).copied().unwrap_or(addr);

    let mut per_player = vec![
        PlayerSeries {
            cc_applied: vec![0u32; buckets],
            strips: vec![0u32; buckets],
            strips_taken: vec![0u32; buckets],
        };
        players.len()
    ];

    // Bucket index for an absolute event time, or None if out of range.
    let bucket = |time: u64| -> Option<usize> {
        let b = (time.saturating_sub(t0) / res) as usize;
        (b < buckets).then_some(b)
    };

    // Direct player-sourced CC — same predicate and same guards as
    // `cc::apply`'s first loop, which is why the sums match.
    for e in &raw.events {
        if is_cc(e, post_era) && squad.contains(&e.src_agent) && enemies.contains(&e.dst_agent) {
            if let (Some(&i), Some(b)) = (idx.get(&rep(e.src_agent)), bucket(e.time)) {
                per_player[i].cc_applied[b] += 1;
            }
        }
    }

    // Pet/minion-sourced CC credited to the owner — `cc::apply`'s second loop.
    let (agent_team, recorded_by) = crate::wvw::resolve_teams(raw);
    let friendly_team = recorded_by.and_then(|addr| agent_team.get(&addr).copied());
    for (owner, _dst, _duration_ms, time) in
        pet_credit_cc_events_timed(raw, registry, squad, enemies, friendly_team, &agent_team)
    {
        if let (Some(&i), Some(b)) = (idx.get(&rep(owner)), bucket(time)) {
            per_player[i].cc_applied[b] += 1;
        }
    }

    for (rep_addr, strips) in support::outgoing_boon_strips(raw, enemies, addr_to_rep) {
        let Some(&i) = idx.get(&rep_addr) else { continue };
        for &(time, _skillid, _ms) in &strips {
            if let Some(b) = bucket(time) { per_player[i].strips[b] += 1; }
        }
    }

    for (rep_addr, strips) in
        defenses::incoming_boon_strips_with_registry(raw, registry, squad, addr_to_rep)
    {
        let Some(&i) = idx.get(&rep_addr) else { continue };
        for &(time, _skillid, _ms) in &strips {
            if let Some(b) = bucket(time) { per_player[i].strips_taken[b] += 1; }
        }
    }

    EntitySeriesDetail { per_player }
}
```

- [ ] **Step 4: Add the timed pet-CC variant**

`pet_credit_cc_events` yields `(owner, dst, duration_ms)` with no timestamp, so it cannot be bucketed. In `crates/axilog-core/src/analysis/cc.rs`, add a timed variant next to it and re-express the original in terms of it, so the two can never drift:

```rust
/// [`pet_credit_cc_events`] with the source event's absolute time appended.
/// The untimed version delegates here — a single traversal definition, so a
/// change to the credit rule cannot apply to one and not the other.
pub fn pet_credit_cc_events_timed(
    raw: &RawLog,
    registry: &InstidRegistry,
    squad: &BTreeSet<u64>,
    enemies: &BTreeSet<u64>,
    friendly_team: Option<u32>,
    agent_team: &BTreeMap<u64, u32>,
) -> Vec<(u64, u64, u64, u64)> {
    // Body: the existing `pet_credit_cc_events` body, with `e.time` pushed
    // as a fourth tuple element at each push site.
}
```

Then make `pet_credit_cc_events` a thin wrapper:

```rust
pub fn pet_credit_cc_events(
    raw: &RawLog,
    registry: &InstidRegistry,
    squad: &BTreeSet<u64>,
    enemies: &BTreeSet<u64>,
    friendly_team: Option<u32>,
    agent_team: &BTreeMap<u64, u32>,
) -> Vec<(u64, u64, u64)> {
    pet_credit_cc_events_timed(raw, registry, squad, enemies, friendly_team, agent_team)
        .into_iter()
        .map(|(owner, dst, dur, _time)| (owner, dst, dur))
        .collect()
}
```

Import it in `entity_series.rs` as `use crate::analysis::cc::{is_cc, pet_credit_cc_events_timed};` (drop the unused `pet_credit_cc_events` from that import).

- [ ] **Step 5: Register the module**

In `crates/axilog-core/src/analysis/mod.rs`, add alongside the other `pub mod` declarations:

```rust
pub mod entity_series;
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cargo test -p axilog-core entity_series
```

Expected: PASS, both tests.

- [ ] **Step 7: Add the strip sum-invariants**

Append to the same `mod tests`:

```rust
#[test]
fn per_player_strip_buckets_sum_to_scalars() {
    let (enc, raw, registry, players, squad, enemies, addr_to_rep) = strip_fixture();
    let detail = build(&enc, &raw, &registry, &players, &squad, &enemies, &addr_to_rep);
    for (i, p) in players.iter().enumerate() {
        assert_eq!(
            detail.get(i).strips.iter().sum::<u32>(),
            p.support.strips,
            "player {i} outgoing strip buckets must sum to the scalar",
        );
        assert_eq!(
            detail.get(i).strips_taken.iter().sum::<u32>(),
            p.defenses.boon_strips_taken,
            "player {i} incoming strip buckets must sum to the scalar",
        );
    }
}
```

`strip_fixture()` builds a 10s encounter with one squad player (addr 100) and one enemy (addr 200), two `buff_remove::ALL` events on `BOON_IDS` members in each direction at distinct times, and `players` already run through `support::apply` and the defenses pass so the scalars are populated. If `p.defenses.boon_strips_taken` is not the exact field name on `PlayerMetrics`, read it from `defenses.rs` and use the real one — do not guess.

- [ ] **Step 8: Run the whole core suite**

```bash
cargo test -p axilog-core
```

Expected: PASS. `pet_credit_cc_events`'s existing tests must still pass unchanged — they exercise the wrapper.

- [ ] **Step 9: Commit**

```bash
git add crates/axilog-core/src/analysis/entity_series.rs \
        crates/axilog-core/src/analysis/mod.rs \
        crates/axilog-core/src/analysis/cc.rs
git commit -m "feat(analysis): per-entity 1s series for CC and boon strips

New entity_series module folds the existing CC predicate and strip
primitives into per-player 1s buckets. Sum-invariant tests pin each
series against the scalar it decomposes."
```

---

### Task 3: Squad `strips` lane

**Files:**
- Modify: `crates/axilog-core/src/analysis/mod.rs:282-283` (`Timeline` struct)
- Modify: `crates/axilog-core/src/analysis/cc.rs:20-105` (`timeline_with_registry`)
- Modify: `crates/axilog-schema/src/lib.rs:1330` (`PerSecondOut`), `:1738` (the mapping)
- Modify: `crates/axilog-schema/src/v1/blocks/activity.rs:686` (`SquadSeries`), `:820` (builder)
- Modify: `crates/axilog-ei/src/lib.rs:3607` (second `SquadSeries` construction site)
- Test: inline in `cc.rs`

**Interfaces:**
- Consumes: `support::outgoing_boon_strips` from Task 1
- Produces: `Timeline { resolution_ms, squad_damage, cc_applied, downs, strips }` and `SquadSeries { damage, cc_applied, downs, strips }`

- [ ] **Step 1: Write the failing test**

In `crates/axilog-core/src/analysis/cc.rs`'s `mod tests`, alongside the existing timeline tests:

```rust
#[test]
fn timeline_buckets_squad_strips() {
    // One boon strip by a squad player off an enemy at t=2500ms.
    let mut e = base_event();
    e.time = 2500;
    e.is_buffremove = crate::evtc::buff_remove::ALL;
    e.skillid = 740;          // Might
    e.src_agent = 200;        // victim (enemy) — role inversion
    e.dst_agent = 100;        // remover (squad)
    e.value = 3000;

    let (enc, raw, registry, squad, enemies) = timeline_fixture_with(vec![e]);
    let tl = timeline_with_registry(&enc, &raw, &registry, &squad, &enemies);
    assert_eq!(tl.strips[2], 1, "strip at 2500ms lands in bucket 2");
    assert_eq!(tl.strips.iter().sum::<u32>(), 1);
}
```

Build `timeline_fixture_with` from the construction already used by the existing `timeline_*` tests in this file.

- [ ] **Step 2: Run to verify it fails**

```bash
cargo test -p axilog-core timeline_buckets_squad_strips
```

Expected: FAIL — no field `strips` on `Timeline`.

- [ ] **Step 3: Add the field to `Timeline`**

`crates/axilog-core/src/analysis/mod.rs`:

```rust
#[derive(Debug, Clone, Default)]
pub struct Timeline { pub resolution_ms: u64, pub squad_damage: Vec<u64>,
    pub cc_applied: Vec<u32>, pub downs: Vec<u32>, pub strips: Vec<u32> }
```

- [ ] **Step 4: Populate it in `timeline_with_registry`**

In `crates/axilog-core/src/analysis/cc.rs`, add the accumulator next to the others:

```rust
    let mut strips = vec![0u32; buckets];
```

After the main event loop — strips come from the shared primitive, not an inline predicate, so the squad lane and the per-entity lanes cannot disagree:

```rust
    // Squad boon strips, from the same primitive `support::strips` folds, so
    // this lane and `entity_series`'s per-player lane count identically.
    let addr_to_rep: BTreeMap<u64, u64> = BTreeMap::new();
    for (_remover, events) in
        crate::analysis::support::outgoing_boon_strips(raw, enemies, &addr_to_rep)
    {
        for &(time, _skillid, _ms) in &events {
            let b = (time.saturating_sub(t0) / res) as usize;
            if b < buckets { strips[b] += 1; }
        }
    }
```

and widen the return:

```rust
    Timeline { resolution_ms: res, squad_damage, cc_applied, downs, strips }
```

Add `use std::collections::BTreeMap;` to the file's imports if it is not already there.

- [ ] **Step 5: Run to verify it passes**

```bash
cargo test -p axilog-core timeline_buckets_squad_strips
```

Expected: PASS.

- [ ] **Step 6: Fix every other `Timeline` construction site**

`cargo build -p axilog-schema` will now fail on the struct literals at `crates/axilog-schema/src/lib.rs:1819`, `:1995`, and `:2019`. Add `strips: vec![]` to the first two (both are empty-timeline literals) and `strips: vec![0]` to the third, matching its sibling `cc_applied:vec![0],downs:vec![0]`.

- [ ] **Step 7: Thread it through `PerSecondOut` and `SquadSeries`**

`crates/axilog-schema/src/lib.rs:1330`:

```rust
pub struct PerSecondOut { pub squad_damage: Vec<u64>, pub cc_applied: Vec<u32>, pub downs: Vec<u32>, pub strips: Vec<u32> }
```

`:1738`, in the mapping that clones from `metrics.timeline`:

```rust
                strips: metrics.timeline.strips.clone(),
```

`crates/axilog-schema/src/v1/blocks/activity.rs:686`:

```rust
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct SquadSeries {
    pub damage: SeriesOut,
    pub cc_applied: SeriesOut,
    pub downs: SeriesOut,
    /// Boons the squad removed from enemies, per second. Folded from the
    /// same `support::outgoing_boon_strips` primitive as the `strips`
    /// scalar, so this lane sums to the squad total by construction.
    pub strips: SeriesOut,
}
```

and its builder at `:820`:

```rust
        strips: SeriesOut::encode_u64(
            res,
            &ps.strips.iter().map(|v| u64::from(*v)).collect::<Vec<_>>(),
        ),
```

- [ ] **Step 8: Fix the EI-compat construction site**

`crates/axilog-ei/src/lib.rs:3607` constructs a `SquadSeries` too. Add a `strips` field there, sourced the same way its sibling `cc_applied` is at that call site.

- [ ] **Step 9: Build and test the workspace**

```bash
cargo build --workspace && cargo test --workspace
```

Expected: PASS. Any remaining compile error is another `Timeline`/`SquadSeries`/`PerSecondOut` literal — add the field and re-run.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(series): squad boon-strip lane

SquadSeries gains a required, unconditional strips lane, folded from
support::outgoing_boon_strips so it agrees with the strips scalar."
```

---

### Task 4: Per-entity lanes on `EntitySeries`

**Files:**
- Modify: `crates/axilog-schema/src/v1/blocks/activity.rs:698` (`EntitySeries`), `:792` (`empty_series`), `:810-980` (builder and its other `EntitySeries` literals)
- Modify: `crates/axilog-ei/src/lib.rs:3638` (`EntitySeries` construction site)
- Modify: `crates/axilog-node/types.d.ts`
- Test: `crates/axilog-schema/tests/` — new file `v1_entity_series_cc_strips.rs`

**Interfaces:**
- Consumes: `entity_series::build` and `EntitySeriesDetail` from Task 2; `SquadSeries.strips` from Task 3
- Produces: `EntitySeries { ..., cc_applied: Option<SeriesOut>, strips: Option<SeriesOut>, strips_taken: Option<SeriesOut> }`

- [ ] **Step 1: Write the failing integration test**

Create `crates/axilog-schema/tests/v1_entity_series_cc_strips.rs`. Model its fixture loading and report construction on the existing `crates/axilog-schema/tests/v1_healing_detail.rs`, which already exercises the exact same optional-per-entity-lane pattern — read it first and copy its harness rather than inventing one.

```rust
/// Per-entity CC and strip lanes must be present when `timeseries` is on,
/// absent when it is off, and must sum to the block scalars they decompose.
#[test]
fn entity_cc_and_strip_lanes_sum_to_block_scalars() {
    let report = build_report_with_timeseries(true);
    let series = &report.blocks.series;

    for (id, entity) in series.by_entity.iter() {
        let cc_sum: u64 = decode_u64(entity.cc_applied.as_ref().expect("cc lane present")).iter().sum();
        assert_eq!(cc_sum, report.blocks.cc.by_entity[id].applied_total as u64);

        let strips_sum: u64 = decode_u64(entity.strips.as_ref().expect("strips lane present")).iter().sum();
        assert_eq!(strips_sum, report.blocks.support.by_entity[id].strips as u64);

        let taken_sum: u64 = decode_u64(entity.strips_taken.as_ref().expect("taken lane present")).iter().sum();
        assert_eq!(taken_sum, report.blocks.defenses.by_entity[id].boon_strips_taken as u64);
    }
}

#[test]
fn entity_cc_and_strip_lanes_absent_without_timeseries() {
    let report = build_report_with_timeseries(false);
    for (_id, entity) in report.blocks.series.by_entity.iter() {
        assert!(entity.cc_applied.is_none());
        assert!(entity.strips.is_none());
        assert!(entity.strips_taken.is_none());
    }
}
```

`decode_u64` reverses `SeriesOut::encode_u64` — if `crates/axilog-schema/src/v1/series.rs` already exposes a decoder or the test suite already has one, use it; otherwise write a local helper in this test file that expands `enc == "rle"` pairs and passes `enc == "raw"` through.

- [ ] **Step 2: Run to verify it fails**

```bash
cargo test -p axilog-schema entity_cc_and_strip
```

Expected: FAIL — no field `cc_applied` on `EntitySeries`.

- [ ] **Step 3: Add the fields**

`crates/axilog-schema/src/v1/blocks/activity.rs`, in `EntitySeries` alongside `healing_1s`:

```rust
    /// Outgoing crowd control applied by this entity, per second. Gated on
    /// `timeseries` like the other per-entity lanes; sums to
    /// `blocks.cc.by_entity[id].applied_total`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc_applied: Option<SeriesOut>,
    /// Boons this entity removed from enemies, per second. Sums to
    /// `blocks.support.by_entity[id].strips`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strips: Option<SeriesOut>,
    /// Boons removed FROM this entity, per second. Sums to
    /// `blocks.defenses.by_entity[id].boon_strips_taken`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strips_taken: Option<SeriesOut>,
```

Match the exact `#[serde(...)]` attribute style used by the neighbouring `healing_1s` field — if it differs from the above, follow the neighbour.

- [ ] **Step 4: Set them to `None` in every non-primary literal**

`empty_series` at `:792`, and the `EntitySeries` literals at `:866`, `:894`, `:960`, and `crates/axilog-ei/src/lib.rs:3638` all need the three fields added as `None`. `cargo build --workspace` enumerates them.

- [ ] **Step 5: Populate them in the main builder**

In the builder at `:810`, add a parameter alongside `healing_1s`:

```rust
    entity_series: Option<&axilog_core::analysis::entity_series::EntitySeriesDetail>,
```

Apply the same positional-join guard the file already applies to `healing_1s`, for the same reason:

```rust
    let entity_series = entity_series.filter(|d| d.len() == report.players.len());
```

Then inside the `for (i, p) in report.players.iter().enumerate()` loop, next to the `healing` bindings:

```rust
        let cc_applied = entity_series.map(|d| {
            SeriesOut::encode_u64(res, &d.get(i).cc_applied.iter().map(|v| u64::from(*v)).collect::<Vec<_>>())
        });
        let strips = entity_series.map(|d| {
            SeriesOut::encode_u64(res, &d.get(i).strips.iter().map(|v| u64::from(*v)).collect::<Vec<_>>())
        });
        let strips_taken = entity_series.map(|d| {
            SeriesOut::encode_u64(res, &d.get(i).strips_taken.iter().map(|v| u64::from(*v)).collect::<Vec<_>>())
        });
```

and pass them into the `EntitySeries` literal that this loop builds.

- [ ] **Step 6: Wire the producer to the `timeseries` gate**

At the call site that invokes this builder, call `entity_series::build(...)` and pass `Some(&detail)` only when the `timeseries` option is enabled — mirroring exactly how `healing_1s` is conditionally supplied at that same call site. Find it with:

```bash
grep -rn "healing_1s" --include=*.rs crates/axilog-schema/src crates/axilog-napi/src crates/axilog-node/src | grep -v "activity.rs"
```

- [ ] **Step 7: Run the tests**

```bash
cargo test -p axilog-schema entity_cc_and_strip
```

Expected: PASS, both tests.

- [ ] **Step 8: Update the hand-maintained TypeScript types**

`crates/axilog-node/types.d.ts` at the `EntitySeries` interface (~line 2323) and the `SquadSeries` interface:

```ts
export interface SquadSeries {
  damage: SeriesOut
  cc_applied: SeriesOut
  downs: SeriesOut
  /**
   * Boons the squad removed from enemies, per second. Folded from the same
   * primitive as the `strips` scalar, so this lane sums to the squad total.
   * Required and unconditional, like `cc_applied`.
   */
  strips: SeriesOut
}
```

and inside `EntitySeries`:

```ts
  /**
   * Outgoing crowd control applied by this entity, per second. Present only
   * with `timeseries: true`. Sums to `blocks.cc.by_entity[id].applied_total`.
   */
  cc_applied?: SeriesOut
  /**
   * Boons this entity removed from enemies, per second. Present only with
   * `timeseries: true`. Sums to `blocks.support.by_entity[id].strips`.
   */
  strips?: SeriesOut
  /**
   * Boons removed FROM this entity, per second. Present only with
   * `timeseries: true`. Sums to
   * `blocks.defenses.by_entity[id].boon_strips_taken`.
   */
  strips_taken?: SeriesOut
```

- [ ] **Step 9: Run the full workspace suite**

```bash
cargo test --workspace
```

Expected: PASS. The byte-identity baseline tests will fail if the EI-compat output changed — it must not have, since all edits are on the native v1 surface. If one fails, the change leaked into `axilog-ei`'s output and needs isolating before proceeding.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(series): per-entity CC and boon-strip lanes

EntitySeries gains cc_applied, strips and strips_taken, gated on
timeseries like the healing lanes, each pinned by a sum-invariant
against the scalar it decomposes."
```

---

### Task 5: Release 1.8.0

**Files:**
- Modify: `Cargo.toml:6` (workspace version)
- Modify: `crates/axilog-node/package.json` (version)
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4
- Produces: published `@axiapps/axilog@1.8.0` with the new lanes — the pin AxiBridge's Part B plan bumps to

- [ ] **Step 1: Verify the whole suite and a real parse**

```bash
cargo test --workspace
```

Expected: PASS.

- [ ] **Step 2: Write the changelog section**

Prepend to `docs/CHANGELOG.md` immediately after the header block, above `## v1.7.2`. **This is a hard gate** — without it the Release job dies after npm-publish, leaving a published package with no GitHub release.

```markdown
## v1.8.0 — 2026-08-28

### Added
- **Per-second CC and boon-strip series.** `SquadSeries` gains a required
  `strips` lane, and `EntitySeries` gains `cc_applied`, `strips` and
  `strips_taken` — the last three gated on `timeseries: true` like the
  existing healing lanes. Every lane is folded from the primitive that
  already produces its scalar counterpart (`is_cc`,
  `support::outgoing_boon_strips`, `defenses::incoming_boon_strips`), and
  sum-invariant tests pin each series against that scalar, so a bucketed
  series can never disagree with the whole-fight total it decomposes.

### Changed
- `support::outgoing_boon_strips` and `defenses::incoming_boon_strips` now
  return `(time_ms, skillid, duration_ms)` rather than `(skillid,
  duration_ms)`. Both existing folds ignore the added field, so `strips`,
  `strips_duration_ms` and `boon_strips_taken` are unchanged for every
  fixture.
```

- [ ] **Step 3: Bump the version in both manifests**

`Cargo.toml:6` → `version = "1.8.0"`, and the `"version"` field in `crates/axilog-node/package.json` → `"1.8.0"`.

- [ ] **Step 4: Verify you are on `main` before tagging**

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `main`. Tagging from a release branch breaks the lockfile refresh — if this prints anything else, merge to `main` first and re-run.

- [ ] **Step 5: Commit, tag, and push**

```bash
git add Cargo.toml crates/axilog-node/package.json docs/CHANGELOG.md
git commit -m "chore: release v1.8.0"
git tag v1.8.0
git push origin main
git push origin v1.8.0
```

- [ ] **Step 6: Verify the tag points at the release commit**

```bash
git show v1.8.0:Cargo.toml | head -8
```

Expected: `version = "1.8.0"`. If it shows 1.7.2 the tag landed a commit early — force-move it with `git tag -f v1.8.0 <correct-sha>` and force-push the tag.

- [ ] **Step 7: Watch the release workflow**

Watch the run on `main` for `release.yml`. The Release job must reach completion, not just npm-publish — that ordering is exactly what the changelog gate protects.

- [ ] **Step 8: Confirm the published package carries the new lanes**

```bash
npm view @axiapps/axilog@1.8.0 version
```

Expected: `1.8.0`. Part B of this plan can now bump AxiBridge's pin.
