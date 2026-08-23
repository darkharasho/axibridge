# Wrong squad/ally counts on Edge of the Mists logs

**Status:** ROOT CAUSE FOUND AND FIXED 2026-08-23. Fix is in **axilog**, not AxiBridge.
**Reported:** 2026-08-22, while `feat/fight-slicer-phase-b` was mid-flight.
**Investigated on:** branch `docs/eotm-count-handoff` (cut clean from `main`).

> **This document was rewritten on 2026-08-23.** The original version's two
> hypotheses (keyless-bucket inflation; cross-fight rank-title merging) are
> both **disproven on real data**, and its "where to look" file list was a dead
> end — every file on it is downstream of the actual defect. Section 6 below
> preserves what was tested and ruled out, so nobody re-chases it.

---

## 1. The symptom

On a minority of EotM fights, the squad count reads **far too low**, and the
missing squad members are rendered as the **enemy team**. Per fight, not
session-aggregate. All three surfaces are affected (desktop, web report,
Discord embed) because all three read the same mis-partitioned object.

From the app's own posted embeds, 2026-08-22 (`#fight-reports`, channel
`1040221331695878144`), against a re-parse of the same logs:

| fight    | log                    | embed said              | truth              |
|----------|------------------------|-------------------------|--------------------|
| 07:21 PM | `20260822-192239.zevtc`| Squad **20**, Blue team 25 | 45 squad, 40 red enemies |
| 07:33 PM | `20260822-193429.zevtc`| Squad **10**, Blue team 36 | 46 squad, 43 red enemies |
| 10 others| —                      | Squad 41–45, Red team 40–56 | correct |

`20 + 25 = 45` and `10 + 36 = 46` — the squad was **cut in half**, with the
remainder relabelled as the enemy. Meanwhile the ~40 *real* enemies dropped out
of the report entirely.

**The cheapest tell that a fight is affected: the enemy is labelled "Blue
team".** On every healthy fight in that session the enemy is "Red team".

## 2. Root cause

`axilog_core::wvw::resolve_teams` (`crates/axilog-core/src/wvw/mod.rs`) built
its `agent_addr -> team_id` map **last-write-wins**, on the stated assumption
that "every agent gets exactly one `TEAM_CHANGE` event". That assumption is
false, and the extra events are not mid-fight noise — they are emitted at log
**teardown**, as the recording player zones out of the map.

Raw-event evidence from `20260822-192239.zevtc` (log duration 82623 ms, last
real combat event at t=68307 ms):

```
RECORDER 0x7d0 TEAM_CHANGE events: [(1282, t=66760), (433, t=68512), (2543, t=82335)]
                                     ^ true team    ^ post-combat  ^ final millisecond

player-agent FIRST team histogram: {886: 40, 1282: 45}     <- clean: 45 squad, 40 enemy
player-agent LAST  team histogram: {707: 1, 886: 39, 1282: 25, 2543: 20}   <- shredded
```

`friendly_team` is the recorder's team, so last-write-wins made it **2543** — a
team nobody fought on. Only the **20** agents still in tracking range at that
final instant carried the matching trailing stamp and stayed in `players[]`;
the other **25** squad members fell to the `else` branch and were emitted as
enemies. The 40 real enemies (team 886) were also non-matching, but the enemy
*label* is taken from the team colour, hence "Blue team 25".

`20260822-193429.zevtc` is the same shape: recorder `[(1282, 52109), (433,
53902), (2543, 72284)]`, trailing stamp 0.3 s after the last combat event, 10
agents carry it → `Squad: 10`.

Healthy logs differ only in that the recorder's trailing event happens to still
carry its real team (`20260822-191638`: recorder history is just `[1282]`).
**Nothing about the fights themselves differs** — this is a coin-flip on
whether a map transition lands inside the recording window.

### Why EotM

EotM is where this session's map transitions happened; the mechanism is not
EotM-specific in principle, and any map could hit it. But it was verified to be
*observed* only on EotM across 70 logs / 2 days / the same squad: Eternal
Battlegrounds (19 logs), Blue Alpine BL (29), Green Alpine BL (10) all resolve
the squad to `433` every single time, with no drift. Only the 12 EotM logs
show ids flipping between fights minutes apart.

## 3. The fix

`resolve_teams` is now **first-write-wins**, with team `0` treated as a
placeholder rather than a team (prefer any real id over it; keep `0` only when
it is all an agent ever emits — a disjoint set of 45-of-243 agents in the
reference log are `0` on every event they emit, never mixed with a real id).

Result across all 12 EotM logs from that session — every fight now resolves a
consistent roster against **red** enemies:

```
20260822-192239: squad=45  enemy=40 {"red": 40}     (was 20 squad / 25 "blue")
20260822-193429: squad=46  enemy=43 {"red": 43}     (was 10 squad / 36 "blue")
```

(These are raw agent-entry counts; AxiBridge's `partitionSquadPlayers` dedupes
them to distinct people for display, which is why an embed reads 44 where the
parser reports 45 entries.)

The 10 previously-healthy EotM logs are unchanged, and the whole axilog test
suite passes — including `wvw_partition` and `postrework` goldens.

### Companion change

`wvw::apply`'s `iff`-based hostile-NPC override (the M4 Keep Lord fix) had a
comment asserting that `agent_team` is last-write-wins; that comment is now
corrected. The override is **deliberately kept**: under first-write-wins the
Keep Lord resolves to its pre-flip hostile team on its own, so the override is
no longer load-bearing for that case, but `iff` remains the stronger signal and
it still covers an NPC whose *first* observed team is already friendly.

### Regression tests

Two unit tests in `crates/axilog-core/src/wvw/mod.rs`, both **flip-tested**
(each was independently confirmed to fail when its own rule is reverted, then
restored from a pre-edit copy):

- `eotm_post_fight_team_change_does_not_split_the_squad` — synthetic replica of
  the real teardown shape. Under last-write-wins it fails with the real-world
  value: `left: Some(2543), right: Some(1282)`.
- `team_zero_never_shadows_a_real_team_id` — under plain first-write-wins it
  fails with `left: Some(0)`.

## 4. What is NOT the bug

`partitionSquadPlayers` / `getPlayerAccountKey`
(`packages/bridge-metrics/src/playerIdentity.ts`) are **faithful** — they
report whatever is in `players[]`. All three count surfaces read the same
already-mis-partitioned object, which is why they agree on the wrong number.
One upstream defect, not three:

- `src/main/discord.ts:515`
- `src/renderer/ExpandableLogCard.tsx:106-107`
- `src/renderer/stats/computeFightBreakdown.ts:131-132`

## 5. Rollout — DONE 2026-08-23

Shipped as **axilog v1.5.1**; AxiBridge's `@axiapps/axilog` pin is bumped to
`1.5.1` (exact, no caret). Downstream consumers that parse whole logs through
`axilog_api` went out alongside it: **arcdps-axipulse v0.4.3** and
**axipulse v0.4.1**.

Verified end-to-end through AxiBridge's own parse path
(`parseFileEi` → `partitionSquadPlayers`) across all 12 EotM logs:

```
log            entries  squad  pug  targets  enemyTeams
20260822-192239     45     45    0      40   {"886":40}    <- was Squad 20 / "Blue team" 25
20260822-193429     46     45    1      43   {"886":43}    <- was Squad 10 / "Blue team" 36
```

Every fight now resolves against red (886) enemies, and the discriminator from
§2 — entities in `targets[]` carrying the squad's own team id, which was 40 and
43 on the two broken fights — is **0** across all 12.

**Still outstanding:** a fix in axilog does not retroactively correct anything
already published. The two affected fights are correct on any *re-parse*, but
the report published on 2026-08-22 still carries the bad partition until it is
re-parsed and re-published.

## 6. Ruled out — do not re-chase

- **Hypothesis A (keyless bucket inflates counts): DEAD.** `keyless=0` and
  `noNameAtAll=0` across all 12 EotM logs. `applyEiCompatShims`
  (`src/main/axilogParser.ts:178-186`) really does populate `name`, so nothing
  reaches the keyless bucket. The original "the fallback is dead code" claim
  was made against *raw* axilog output, before the shim.
- **Hypothesis B (rank titles merge distinct people): DEAD.** Exactly ONE
  account-less person exists across the entire session ("Diamond Legend"), and
  never twice within one log. WvW rank titles genuinely aren't identities, but
  no log in evidence exercises that.
- **Direction of error was TOO LOW**, which alone eliminated Hypothesis A
  (predicted too high).
- Separate, real, but unrelated: `src/main/dpsReportCache.ts:226` is a
  genuinely **un-shimmed** details read path (contrast `:339`, which shims).
  Worth fixing on its own merits; it is not this bug.

## 7. Traps (still current)

- **`packages/bridge-metrics` resolves through `dist/`, not `src/`.** Run
  `npm run build --workspace @axiapps/bridge-metrics` before any test or audit.
- **Vitest parallelism is pinned at `maxWorkers: 2`** in `vitest.config.ts`.
  Do not override it.
- **Flip-test every new test.** Break the rule the test claims to pin, confirm
  *that specific test* fails, then restore from a pre-edit `cp` copy — never
  `git checkout`/`reset`/`stash`.
- **Discord read access** for verifying posted embeds needs the **deployed**
  AxiTools bot token on `mstephens@venus.local` (`~/axitools/.env`). The local
  `axitools/.env` token is a different bot ("GW2 Tools Beta") that is not in
  that guild.

## 8. Reproduction

Logs: `/var/mnt/data/SteamLibrary/steamapps/compatdata/1284210/pfx/drive_c/users/steamuser/Documents/Guild Wars 2/addons/arcdps/arcdps.cbtlogs`
— the 12 EotM logs are `20260822-19*.zevtc`; `20260822-10*`/`18*` and
`20260820-*` are the non-EotM control.

Raw-event probe (in axilog, ~0.5 s/log):

```rust
let data = axilog_core::evtc::inflate_zevtc(&std::fs::read(path)?)?;
let raw  = axilog_core::evtc::decode_raw(&data)?;
// sc 22 = TEAM_CHANGE (team id in `value`), 13 = POINT_OF_VIEW, 74 = WVW_TEAMS
// Compare each agent's FIRST vs LAST TEAM_CHANGE, and the recorder's history
// against the last non-statechange event time.
```
