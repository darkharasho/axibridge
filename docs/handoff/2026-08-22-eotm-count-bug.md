# Handoff: wrong squad/ally counts on Edge of the Mists logs

**Status:** parked, unstarted. Root cause NOT established.
**Reported:** 2026-08-22, by the user, while `feat/fight-slicer-phase-b` was mid-flight.
**Branch discipline:** fix on a **new branch cut from `main`**. Do not build on
`feat/fight-slicer-phase-b` (PR #41) — it is a large unrelated slicer branch and
must not absorb a parser/identity fix.

---

## 1. The symptom, as reported

Counts come out wrong on Edge of the Mists (EotM) logs. Narrowed during the
original session to **squad and ally counts** specifically (not damage or other
stats). The user's initial suspicion was that this is an axilog (native parser)
issue rather than an AxiBridge aggregation issue.

**This is the single biggest gap in the handoff.** Nobody has written down:

- what number was displayed, and what the user expected instead
- whether it read **too high** or **too low**
- whether it was on a **single fight card** or on the **session aggregate**
- whether the desktop app, the published web report, or both

Ask these first. The two leading hypotheses below predict *opposite* directions
of error, so this one answer eliminates half the search space immediately.

## 2. What was actually verified

Logs live at (from the user's local config, key `logDirectory`):

```
/var/mnt/data/SteamLibrary/steamapps/compatdata/1284210/pfx/drive_c/users/steamuser/Documents/Guild Wars 2/addons/arcdps/arcdps.cbtlogs
```

The 2026-08-22 19:16–19:47 logs are all EotM (`fightName: "Detailed WvW - Edge of the Mists"`).

**An early hypothesis was tested and disproved:** the account-less entries in
`players[]` are *not* NPCs. They are anonymous **same-team allies**. Names like
"Diamond Legend", "Gold Footman", "Silver Invader" are WvW **rank titles**, so
different people legitimately reuse the same name across logs. They carry the
squad's own `teamID` (433 on EB, 1282 on EotM; enemies are 707/886), plus
`notInSquad: true`, `group: 0`, and 0 damage — arcdps can see they exist but not
their skill events.

Re-parsing those logs and recomputing **per-log** counts gave numbers that look
right: EB 22 squad / 18 allies, EotM 38 squad / 1 ally. So whatever is wrong is
probably *not* in the single-log partition of a freshly parsed log.

That points the search at: aggregation **across** fights, a **different counter**
than the partition helper, or a **persisted/rehydrated** details object that
differs from a freshly parsed one.

## 3. Hypothesis A — the keyless bucket inflates counts (VERIFY BEFORE TRUSTING)

`getPlayerAccountKey` (`packages/bridge-metrics/src/playerIdentity.ts:47-54`)
builds the identity key that `partitionSquadPlayers` dedupes on:

```ts
const account = normalizeAccountName(raw);
if (account && account !== 'Unknown') return `acct:${account}`;
const name = typeof player?.name === 'string' ? player.name.trim() : '';
if (name && name !== 'Unknown') return `name:${name}`;
return null;              // -> the `keyless` bucket, which never dedupes
```

Every entry that keys to `null` lands in `partitionSquadPlayers`'s `keyless`
bucket, where it can never be matched to another entry. Since arcdps emits a new
entry per agent — on relog, build swap, subgroup change, or re-entering tracking
range — each extra entry for the same account-less person would count as
**another distinct person**, inflating squad/ally counts. EotM is exactly where
this would bite, because EotM is where the account-less anonymous allies are.

**The original session recorded this as a confirmed defect, on the grounds that
axilog emits `character_name` and has no `name` field, making the fallback dead
code. That reasoning is now in doubt** — `applyEiCompatShims`
(`src/main/axilogParser.ts:178-186`) explicitly fills it in:

```ts
if (player && typeof player === 'object' && player.name === undefined) {
    player.name = player.character_name;
}
```

and it runs on both paths that produce a details object: at parse
(`axilogParser.ts:393`) and on cache read (`dpsReportCache.ts:339`). So under
the normal pipeline `name` **is** populated and the fallback is **not** dead.

The "no `name` field" observation was almost certainly made against **raw axilog
output**, before the shim. That does not make Hypothesis A wrong — it makes it
*unproven*, and it narrows it to a much sharper question:

> Is there any path where `partitionSquadPlayers` sees a details object that has
> NOT been through `applyEiCompatShims`?

Check in particular the web-report/publish path and anything that reads persisted
details JSON directly rather than through `dpsReportCache`. If such a path
exists, that is the bug, and `name ?? character_name` in `getPlayerAccountKey` is
a cheap belt-and-braces fix regardless.

**Direction of error if true: counts read TOO HIGH.**

## 4. Hypothesis B — cross-fight aggregation collapses distinct people

Per-log counts recomputed correctly, so consider the other end. Rank titles are
**not identities**: two different players can both be "Silver Invader", and the
same person's title changes as their rank does. Any counter that aggregates
across fights and keys account-less players on `name` will therefore **merge
distinct people** who happen to share a rank title, and **split one person** whose
title changed mid-session.

Note this is the direct cost of the Hypothesis A fix: `name:Silver Invader` as a
key is what merges two strangers. The two hypotheses trade against each other,
which is why the direction-of-error question in §1 matters so much.

**Direction of error if true: counts read TOO LOW.**

## 5. Where to look

Callers of `partitionSquadPlayers` / `getPlayerAccountKey`:

```
src/renderer/stats/incrementalAggregation.ts     <- session aggregate
src/renderer/stats/computeFightBreakdown.ts      <- per-fight
src/renderer/stats/computeCommanderStats.ts
src/renderer/stats/computeTimelineAndMapData.ts
src/renderer/ExpandableLogCard.tsx               <- the per-log card counts
src/main/detailsProcessing.ts
src/main/discord.ts
src/shared/squadGuilds.ts
src/shared/commanderMetrics/matchup.ts
packages/bridge-metrics/src/computePlayerAggregation.ts
packages/bridge-metrics/src/nativeRoster.ts
```

If the user says "single fight card", start at `ExpandableLogCard.tsx` and
`computeFightBreakdown.ts`. If they say "session totals", start at
`incrementalAggregation.ts`.

## 6. Traps

- **`packages/bridge-metrics` resolves through `dist/`, not `src/`.** Run
  `npm run build --workspace @axiapps/bridge-metrics` before any test or audit,
  or you will be testing stale code and drawing false conclusions.
- **Vitest parallelism is pinned at `maxWorkers: 2`** in `vitest.config.ts`
  (this machine runs heavy apps alongside dev work). Do not override it.
- **Flip-test every new test.** Break the rule the test claims to pin, confirm
  *that specific test* fails, then restore from a pre-edit `cp` copy — never
  `git checkout`/`reset`/`stash`. The slicer branch produced twelve tests that
  passed for the wrong reason; this codebase's fixtures are unusually good at
  hiding a dead assertion.
- **Beware degenerate fixtures.** A fixture where the account-less entries each
  appear exactly once per log cannot discriminate a dedupe bug at all — that is
  precisely why the 2026-08-22 logs looked clean. Any fixture built for this bug
  must contain the **same account-less person twice in one log**, and the **same
  rank title used by two different people across logs**.

## 7. Suggested first moves

1. Ask the four questions in §1.
2. Cut a branch from `main`.
3. Answer the §3 question: grep every path that reaches `partitionSquadPlayers`
   and confirm whether its details object went through `applyEiCompatShims`.
4. Build a fixture with the two adversarial shapes from §6 and watch the counter
   the user actually complained about.
