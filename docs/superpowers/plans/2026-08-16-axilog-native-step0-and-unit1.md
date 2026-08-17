# axilog Native Migration — Step 0 + Equality Oracle + Unit 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the axilog 0.3.4 bump with the dead compatibility code it obsoletes, stand up the equality-oracle test harness, and migrate the roster/identity read surface to axilog's native 1.0 container.

**Architecture:** Step 0 stays on the ei-json compatibility layer and only removes workarounds that 0.3.4 has genuinely made dead, then flips the shipped default parser to axilog. The oracle harness then parses one committed fixture *both* ways at the same axilog version so every later unit can assert its native rewrite against the EI-derived answer. Unit 1 is the first genuine native read: roster membership, identity, profession and squad-guild move from `details.players[]` to `report.entities[]`, filtered by `entities[].role`.

**Tech Stack:** TypeScript, Electron main + React renderer, vitest, `@axiapps/axilog` (napi-rs native bindings), `@axiapps/bridge-metrics` (npm workspace, consumed via `dist/`).

**Spec:** `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`

## Scope of this plan

The spec covers Step 0, ten migration units, Step N (Elite Insights removal) and a history migration. That is not one plan. This plan covers:

- **Step 0** — the 0.3.4 bump and the deletions it enables (Tasks 1–4)
- **The equality oracle** — the shared test harness every later unit depends on (Task 5)
- **Unit 1** — roster & identity (Tasks 6–9)

Units 2–10, Step N and the history migration each get their own plan, written just-in-time. This is not deferral for its own sake: see "Spec corrections" below — two of Step 0's four claimed deletions turned out to be invalid when probed against the real 0.3.4 artifact. Planning unit 7 today, against an unprobed guess at what `blocks.rotation` contains, would repeat that mistake five times over.

## Spec corrections

These were established by probing `@axiapps/axilog@0.3.4` against `test-fixtures/axilog/wvw-small.anon.zevtc`. They override the spec where they conflict; the spec is corrected in Task 10.

| Spec claim | Reality at 0.3.4 | Consequence |
|---|---|---|
| Step 0 deletes `deriveDistanceScalars` — "0.3.4 computes `distToCom`/`stackDist` engine-side and maps them onto `statsAll`" | Engine-side computation exists and lands on **native** `blocks.replay.by_entity[id].{dist_to_com, stack_dist}`. `to_ei_json` does **not** map it: `statsAll[0].distToCom` is `undefined` for all 42 players, with `everything: true`. | `deriveDistanceScalars` survives Step 0. It is deleted in **unit 3** (Positioning & replay), replaced by the native block. |
| Step 0 deletes the `.zevtc`-mtime timestamp inference — "`encounter.started_at_unix` is carried through to EI's `timeStart`" | `encounter.started_at_unix` is `1768702180` on **native**. On ei-json, `timeStart`, `timeEnd`, `timeStartStd`, `timeEndStd`, `zone`, `encounterDuration` and `players[].name` are all still `undefined`. | `applyEiCompatShims` survives Step 0 in full. It is retired in **unit 2** (Encounter & fight-level). |
| Step 0 deletes `OFFENSE_METRICS_STATS_ALL_FALLBACK` | Confirmed. `statsTargets[i][0]` carries **23** fields at 0.3.4 (was 8), and all 8 fallback ids are among them. The 7 columns the code comment says "stay blank" (`directDmg`, `missed`, `evaded`, `blocked`, `invulned`, `appliedCrowdControlDownContribution`, `appliedCrowdControlDurationDownContribution`) are also present. | Valid. Task 2. |
| Step 0 deletes the `sawTargetSplit` enemy-downs fallback | Confirmed. `statsTargets[i][0]` now carries `downed` and `killed`, so `sawTargetSplit` is always `true` and the branch is unreachable. | Valid. Task 3. |
| Unit 1 includes `attendance.ts` | `packages/bridge-metrics/src/attendance.ts` reads `payload.stats.attendanceData` — a rollup payload, never EI JSON. The producer is `src/renderer/stats/incrementalAggregation.ts:1375`. | Not a unit-1 file. Attendance moves with **unit 8**. |
| Unit 1 includes `professionUtils.ts` | Every exported function takes a profession **string** (`getProfessionColor(profession: string)`). It is shape-agnostic. Its *callers* read `player.profession`. | Not a unit-1 file as a module rewrite; its callers are in scope. See Task 8's `PROFESSION_BASE` note. |
| Unit 1's principal files, corrected | `packages/bridge-metrics/src/playerIdentity.ts`, `src/renderer/stats/utils/computeDominantGuildId.ts`, `src/shared/squadGuilds.ts` | |

One further probed fact, load-bearing for Task 8: **EI's `players[].profession` equals native's `entities[].elite_spec`, not native's `entities[].profession`.** EI reports `"Amalgam"`; native reports `profession: "Engineer"`, `elite_spec: "Amalgam"`. Every axibridge lookup table (`PROFESSION_COLORS`, `PROFESSION_ABBREVIATIONS`) is keyed on the elite-spec name.

## Global Constraints

Every task's requirements implicitly include these.

- **vitest must run with `--maxWorkers=2`.** Repo-wide runner limit (`/var/home/mstephens/.claude/CLAUDE.md`). The root `test:unit` script does **not** set it, so pass it on the command line: `npx vitest run --maxWorkers=2 <path>`.
- **`@axiapps/axilog` is pinned to the exact version `0.3.4`** — no caret. Per the spec's "Coupling: this freezes native 1.0", axibridge pins exactly until axilog commits a freeze declaration to its `NATIVE-FORMAT.md`.
- **`packages/bridge-metrics` is consumed via `dist/`, not `src/`.** `node_modules/@axiapps/bridge-metrics` is a symlink to the package dir and the package `main` points at `dist/`. After **every** edit under `packages/bridge-metrics/src/`, run `npm run build -w @axiapps/bridge-metrics` before running root tests, or you get phantom `TS2305` errors and stale test results.
- **Test fixture:** `test-fixtures/axilog/wvw-small.anon.zevtc`. The repo has a blanket `*.zevtc` gitignore with one negation for `test-fixtures/axilog/*.anon.zevtc`. Never add a non-anonymized log.
- **Parse options for the oracle:** `{ everything: true }` on both `parseFileEi` and `parseFile`. Never an enumerated option list — `everything` is defined as "every analysis pass this version knows about", which is what stops oracle coverage silently narrowing as axilog adds passes.
- **Gates at every task boundary:** `npm run validate` (typecheck + lint, `--max-warnings 0`) and the touched test files green.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Sentinel gate (spec, "The sentinel hazard"):** every unit must include at least one test asserting behaviour against a `not_computed` block or an absent sentinel, not only against populated data. Task 9 discharges this for unit 1.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `package.json` | Pin `@axiapps/axilog` to `0.3.4` exactly | 1 |
| `packages/bridge-metrics/src/statsMetrics.ts` | Modify: drop `OFFENSE_METRICS_STATS_ALL_FALLBACK` | 2 |
| `packages/bridge-metrics/src/computePlayerAggregation.ts` | Modify: drop the fallback branch at ~line 1048 | 2 |
| `src/renderer/stats/__tests__/offenseStatsAllFallback.test.ts` | Delete (11 tests retire with their subject) | 2 |
| `src/main/detailsProcessing.ts` | Modify: drop the `sawTargetSplit` branch | 3 |
| `src/main/__tests__/detailsProcessing.test.ts` | Modify: retire the fallback tests | 3 |
| `src/main/axilogParser.ts` | Modify: flip `DEFAULT_PARSER_BACKEND`, rewrite its doc block | 4 |
| `src/main/__tests__/axilogParser.test.ts` | Modify: retarget the default-backend assertions | 4 |
| `src/test/axilogOracle.ts` | **Create.** Both-ways fixture parse, cached; divergence allowlist type | 5 |
| `src/test/__tests__/axilogOracle.test.ts` | **Create.** Self-test of the harness | 5 |
| `packages/bridge-metrics/src/nativeRoster.ts` | **Create.** `entities[]` → roster/identity readers | 6 |
| `packages/bridge-metrics/src/__tests__/nativeRoster.test.ts` | **Create.** Unit tests incl. the sentinel case | 6, 9 |
| `packages/bridge-metrics/src/index.ts` | Modify: export the new module | 6 |
| `src/test/__tests__/unit1Roster.oracle.test.ts` | **Create.** Unit 1's oracle test | 7 |
| `src/renderer/stats/utils/computeDominantGuildId.ts` | Modify: read `entities[].guild_id` | 8 |
| `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md` | Modify: fold in the spec corrections | 10 |

`nativeRoster.ts` is a new module rather than an edit to `playerIdentity.ts` because the two shapes coexist during the migration: `playerIdentity.ts` keeps serving the frozen legacy read path for EI-shaped history rows (spec, "History migration"), while `nativeRoster.ts` serves native. They are deliberately separate files so the legacy one can be deleted whole at Step N.

---

## Task 1: Pin axilog to 0.3.4

**Files:**
- Modify: `package.json:61`
- Modify: `package-lock.json` (regenerated)

**Interfaces:**
- Consumes: nothing.
- Produces: `@axiapps/axilog@0.3.4` resolvable at `require('@axiapps/axilog')`, exporting `parseFile`, `parseBuffer`, `parseFileEi`, `anonymizeFile`.

The working tree already carries an in-flight `^0.3.2` bump on this branch. This task retargets it to an exact `0.3.4`.

- [ ] **Step 1: Set the exact pin**

In `package.json`, change the `dependencies` entry:

```json
"@axiapps/axilog": "0.3.4",
```

No caret. The spec's freeze coupling requires an exact pin until axilog declares native 1.0 frozen.

- [ ] **Step 2: Install and verify the resolved version**

```bash
npm install
node -e "console.log(require('@axiapps/axilog/package.json').version)"
```

Expected: `0.3.4`

- [ ] **Step 3: Verify the native entry points exist**

```bash
node -e "console.log(Object.keys(require('@axiapps/axilog')).sort().join(','))"
```

Expected: `anonymizeFile,parseBuffer,parseFile,parseFileEi`

If `parseFile` is missing, stop — the rest of this plan has no foundation.

- [ ] **Step 4: Run the existing parser test to see the pre-existing state**

```bash
npx vitest run --maxWorkers=2 src/main/__tests__/axilogParser.test.ts
```

Record which assertions fail. The file contains an *inverse pin* — assertions that documented residual gaps are still absent — and it is expected to go red on a version bump. That is the pin doing its job, not a regression. Do not fix them here; Task 4 retargets them.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: pin @axiapps/axilog to 0.3.4

Exact pin rather than a caret range: per the Phase D spec, axibridge
becomes native 1.0's first external consumer, and pins exactly until
axilog commits a freeze declaration to NATIVE-FORMAT.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Delete the statsAll offense fallback

**Files:**
- Modify: `packages/bridge-metrics/src/statsMetrics.ts:93-102`
- Modify: `packages/bridge-metrics/src/computePlayerAggregation.ts:7, ~1026-1050`
- Delete: `src/renderer/stats/__tests__/offenseStatsAllFallback.test.ts`

**Interfaces:**
- Consumes: axilog 0.3.4 from Task 1.
- Produces: `OFFENSE_METRICS_STATS_ALL_FALLBACK` no longer exported from `@axiapps/bridge-metrics`. Any later task importing it will fail to typecheck — that is intentional.

**Why this is safe:** at 0.3.4, `statsTargets[i][0]` carries 23 fields, including all 8 fallback ids (`connectedDirectDamageCount`, `criticalRate`, `criticalDmg`, `flankingRate`, `glanceRate`, `againstDownedDamage`, `appliedCrowdControl`, `appliedCrowdControlDuration`). The fallback's trigger is `sawTarget && !sawField`; with the fields present, `sawField` is always true and the branch is unreachable.

- [ ] **Step 1: Write the failing test that pins the new parser reality**

Create `packages/bridge-metrics/src/__tests__/statsTargetsFieldSurface.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseFileEi } from '@axiapps/axilog';

const FIXTURE = 'test-fixtures/axilog/wvw-small.anon.zevtc';

/**
 * The 8 fields OFFENSE_METRICS_STATS_ALL_FALLBACK used to substitute from
 * statsAll[0]. At axilog 0.3.4 they are reported per target, which is what
 * makes the fallback dead code. This test is the pin: if a future axilog
 * narrows the per-target split again, this goes red BEFORE the columns
 * silently read 0.
 */
const FORMERLY_SUBSTITUTED = [
    'connectedDirectDamageCount',
    'criticalRate',
    'criticalDmg',
    'flankingRate',
    'glanceRate',
    'againstDownedDamage',
    'appliedCrowdControl',
    'appliedCrowdControlDuration',
];

describe('statsTargets field surface at axilog 0.3.4', () => {
    it('reports every formerly-substituted field per target', () => {
        const details: any = parseFileEi(FIXTURE, { everything: true } as any);
        const perTarget = details.players[0].statsTargets[0][0];
        const missing = FORMERLY_SUBSTITUTED.filter((f) => perTarget[f] === undefined);
        expect(missing).toEqual([]);
    });

    it('reports the per-target downs/kills split', () => {
        const details: any = parseFileEi(FIXTURE, { everything: true } as any);
        const perTarget = details.players[0].statsTargets[0][0];
        expect(perTarget.downed).toBeDefined();
        expect(perTarget.killed).toBeDefined();
    });
});
```

- [ ] **Step 2: Run it — it should PASS immediately**

```bash
npx vitest run --maxWorkers=2 --root . packages/bridge-metrics/src/__tests__/statsTargetsFieldSurface.test.ts
```

Expected: PASS (2 tests). This is a characterization test, not a red-green cycle — it pins a fact about the newly-installed dependency. If it FAILS, the 0.3.4 install did not take; go back to Task 1.

If the fixture path does not resolve, the vitest root differs from the repo root; use an absolute path built from `process.cwd()` or adjust to the root vitest config's `test.root`.

- [ ] **Step 3: Delete the constant**

In `packages/bridge-metrics/src/statsMetrics.ts`, delete lines 93–102 in full — the `OFFENSE_METRICS_STATS_ALL_FALLBACK` declaration **and** the doc comment above it that begins `**Exactly these 8**`.

- [ ] **Step 4: Delete the consuming branch**

In `packages/bridge-metrics/src/computePlayerAggregation.ts`:

Remove `OFFENSE_METRICS_STATS_ALL_FALLBACK` from the import on line 7:

```typescript
import { NON_DAMAGING_CONDITIONS, OFFENSE_METRICS, DEFENSE_METRICS, SUPPORT_METRICS } from './statsMetrics';
```

Delete the `if (sawTarget && !sawField && statsAll && OFFENSE_METRICS_STATS_ALL_FALLBACK.has(m.id))` block and the ~22-line comment above it that begins `// axilog populates only 8 of EI's 38 per-target stat fields`.

Then delete the now-unused `sawField` tracking: the declaration `let sawField = false;` and the line `if (t[0][m.field!] !== undefined) sawField = true;`. Leave `sawTarget` alone if anything else reads it; if the lint step reports it unused, delete it too.

- [ ] **Step 5: Delete the retired test file**

```bash
git rm src/renderer/stats/__tests__/offenseStatsAllFallback.test.ts
```

11 tests retire with their subject. This is expected and named in the spec's Testing section.

- [ ] **Step 6: Rebuild bridge-metrics — mandatory**

```bash
npm run build -w @axiapps/bridge-metrics
```

Skipping this makes the next step test stale `dist/` and report a false pass.

- [ ] **Step 7: Run the full unit suite**

```bash
npm run validate && npx vitest run --maxWorkers=2
```

Expected: green, except `src/main/__tests__/axilogParser.test.ts` whose inverse pin is still on 0.3.2 (Task 4 fixes it). Any *other* failure means a consumer of the deleted constant was missed — find it with `grep -rn OFFENSE_METRICS_STATS_ALL_FALLBACK --include=*.ts --include=*.tsx src packages | grep -v dist`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: drop the statsAll offense fallback, dead at axilog 0.3.4

axilog 0.3.4 widened the per-target split from 8 to 23 fields, which
includes all 8 the fallback substituted from statsAll[0]. Its trigger
(sawTarget && !sawField) is now unreachable. Replaces the 11 fallback
tests with a pin on the per-target field surface, so a future narrowing
goes red rather than silently reading 0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Delete the enemy-downs statsAll substitution

**Files:**
- Modify: `src/main/detailsProcessing.ts:227-~275`
- Modify: `src/main/__tests__/detailsProcessing.test.ts`

**Interfaces:**
- Consumes: axilog 0.3.4 from Task 1; the per-target `downed`/`killed` pin from Task 2.
- Produces: `buildDashboardSummaryFromDetails(details)` unchanged in signature; `enemyDeaths`/`enemyDownsDeaths` now always sourced from the per-target split.

- [ ] **Step 1: Read the current branch and its tests**

```bash
sed -n '200,290p' src/main/detailsProcessing.ts
sed -n '305,500p' src/main/__tests__/detailsProcessing.test.ts
```

The `buildDashboardSummaryFromDetails` describe block starts at line 305. Exactly **three** of its tests exercise the fallback and retire in Step 3:

- `falls back to statsAll[0] on the real axilog shape: populated statsTargets, no split`
- `reports zero rather than substituting statsAll when statsTargets is empty`
- `never substitutes statsAll when even one target carries the split (Elite Insights)`

These stay — they assert the normal per-target path, which is now the only path:

- `accumulates enemy downs/deaths from statsTargets`
- `prefers the per-target statsTargets split when present (Elite Insights shape)`
- `honours an explicit per-target zero rather than falling back (Elite Insights shape)`
- `stays at zero when neither statsTargets nor statsAll carry downs/kills`

- [ ] **Step 2: Delete the fallback**

In `buildDashboardSummaryFromDetails`, delete:
- the `let sawTargetSplit = false;` declaration,
- the `if (phase.downed !== undefined || phase.killed !== undefined) sawTargetSplit = true;` line,
- the entire `if (statsTargets.length > 0 && !sawTargetSplit) { ... }` block **and** its ~35-line explanatory comment.

The remaining accumulation (`targetDowned += Number(phase.downed || 0)` / `targetKilled += Number(phase.killed || 0)`) is the whole computation now.

- [ ] **Step 3: Retire the fallback tests**

Delete the three `it(...)` blocks named in Step 1. Keep the other four.

Do not replace them with a test asserting the substitution *no longer* fires — that is a test of absent code. Task 2's field-surface pin is the real guard.

- [ ] **Step 4: Run the test file**

```bash
npx vitest run --maxWorkers=2 src/main/__tests__/detailsProcessing.test.ts
```

Expected: PASS, with the fallback tests gone.

- [ ] **Step 5: Commit**

```bash
git add src/main/detailsProcessing.ts src/main/__tests__/detailsProcessing.test.ts
git commit -m "refactor: drop the enemy-downs statsAll substitution

axilog 0.3.4 emits per-target downed/killed, so sawTargetSplit is always
true and the substitution branch is unreachable. It was a deliberately
high-biased trade taken only because the alternative was a hard 0; that
trade is no longer needed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Flip the shipped default parser to axilog

**Files:**
- Modify: `src/main/axilogParser.ts:26-76`
- Modify: `src/main/__tests__/axilogParser.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `DEFAULT_PARSER_BACKEND === 'axilog'`. `normalizeParserBackend(undefined) === 'axilog'`. `shouldAutoManageEi()` in `src/main/index.ts` reads the default rather than hardcoding, so the Elite Insights auto-install stands down for fresh installs with no further change.

This is decision 1's first move. Elite Insights is **not** removed here — that is Step N, after unit 10. Users who have explicitly selected `elite-insights` keep it.

- [ ] **Step 1: Write the failing test**

In `src/main/__tests__/axilogParser.test.ts`, the `normalizeParserBackend` describe block at line 48 opens with `it('ships Elite Insights as the default — the axilog flip is owner-gated')`. **Delete that test** — its title asserts the thing this task reverses — and replace the whole describe block's default-related cases with:

```typescript
describe('shipped default backend', () => {
    it('defaults to axilog', () => {
        expect(DEFAULT_PARSER_BACKEND).toBe('axilog');
    });

    it('resolves every unrecognized value to axilog', () => {
        expect(normalizeParserBackend(undefined)).toBe('axilog');
        expect(normalizeParserBackend(null)).toBe('axilog');
        expect(normalizeParserBackend('')).toBe('axilog');
        expect(normalizeParserBackend('Axilog')).toBe('axilog');
        expect(normalizeParserBackend('elite insights')).toBe('axilog');
    });

    it('still honours an explicit elite-insights selection', () => {
        expect(normalizeParserBackend('elite-insights')).toBe('elite-insights');
    });
});
```

Ensure `DEFAULT_PARSER_BACKEND` and `normalizeParserBackend` are both in the file's import list.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/main/__tests__/axilogParser.test.ts -t 'shipped default backend'
```

Expected: FAIL — `expected 'elite-insights' to be 'axilog'`.

- [ ] **Step 3: Flip the constant**

In `src/main/axilogParser.ts:76`:

```typescript
export const DEFAULT_PARSER_BACKEND: ParserBackend = 'axilog';
```

- [ ] **Step 4: Rewrite the doc block above it**

The 50-line comment on lines 26–75 argues a case that this commit settles. Replace lines 26–75 with:

```typescript
/**
 * The parser used when the user has expressed no preference.
 *
 * **`'axilog'`.** The Elite Insights backend remains selectable at
 * Settings → Parser Settings → Parse Engine and is removed only at the end of
 * the native migration (the spec's "Step N"), so an explicit
 * `'elite-insights'` selection is still honoured.
 *
 * A fresh install now parses in-process via the `@axiapps/axilog` napi
 * bindings: no ~90 MB `GW2EICLI.zip` download, no .NET 8 runtime, no `dotnet`
 * child process, ~0.4 s instead of ~10 s-10 min per log.
 * `shouldAutoManageEi()` in `src/main/index.ts` reads this constant rather than
 * hardcoding an engine, so the auto-install stands down on its own.
 *
 * The read-surface case is closed. The original cutover audit found 30 missing
 * paths and four features rendering blank; axilog's MEIGAP/MEIGAP2 work closed
 * all four, and 0.3.4 widened the per-target split from 8 to 23 fields, which
 * retired both remaining workarounds (the `statsAll` offense fallback and the
 * enemy-downs substitution). See `docs/axilog-cutover-report.md` §1 for the
 * audit and `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`
 * for where this sits in the migration.
 *
 * Two accuracy caveats that are *not* absences, and so do not degrade visibly —
 * read §2 of the cutover report before trusting the numbers: per-skill
 * `downContribution` is axilog's arcdps-methodology figure under EI's field
 * name, and the mitigation aggregate's secondary `minMitigation` term is
 * roster-shape-sensitive.
 */
```

- [ ] **Step 5: Update `normalizeParserBackend`'s doc comment**

The comment on lines 78–91 reasons about "the current (owner-gated) default ... means Elite Insights". Replace the paragraph beginning `The hardening is symmetric by construction` with:

```typescript
 * The hardening is symmetric by construction: it always lands on the shipped
 * default, so a corrupt or hand-edited store can never put a user on an engine
 * they did not pick.
```

- [ ] **Step 6: Retarget the inverse pin**

The `real-parse fixture availability` describe block (line 366) asserts that documented residual gaps are still absent. That pin has already proved its worth by going red on the 0.3.2 bump rather than letting the cutover report go stale — keep the pattern, retarget the content.

Three tests in it need attention:

- **`takes the per-target downs/kills split rather than the statsAll fallback`** (line 469) — the code path it names was deleted in Task 3. Rewrite it to assert the split is present on the parsed fixture, or delete it as superseded by Task 2's `statsTargetsFieldSurface.test.ts`. Do not leave it referencing a fallback that no longer exists.
- **`emits the three residuals axilog 0.3.2 closed`** (line 537) — retitle for 0.3.4 and extend: the per-target split went 8 → 23 fields, which is 0.3.4's headline closure.
- **`leaves the documented residual gaps absent rather than faked`** (line 588) — this must now assert a *shorter* list. Probing confirms these are still genuinely absent on ei-json at 0.3.4 and must stay asserted: `players[].display_name`; `skillMap[].icon` (entries carry `canCrit`, `isGearProc`, `isInstantCast`, `isNotAccurate`, `isSwap`, `isTraitProc`, `isUnconditionalProc`, `name` — no `icon`); `buffMap[].icon` and `.classification` (entries carry only `name`, `stacking`). Those close via native in units 5 and 7. Anything in the list about the `statsTargets` field subset must come out — it is no longer true.

Leave the `deriveDistanceScalars` describe block (lines 157–259, 10 tests) and the `applyEiCompatShims` block (lines 269–316) alone. Per this plan's "Spec corrections", both modules survive Step 0; they retire in units 3 and 2.

The test at line 418, `derives plausible distToCom/stackDist for every squad player`, likewise stays: it pins the derivation that is still doing real work, because `to_ei_json` maps no distance scalars at 0.3.4.

- [ ] **Step 7: Run the file**

```bash
npx vitest run --maxWorkers=2 src/main/__tests__/axilogParser.test.ts
```

Expected: PASS, all of it.

- [ ] **Step 8: Run the full gate**

```bash
npm run validate && npx vitest run --maxWorkers=2
```

Expected: fully green. If `SettingsView` tests assert the default engine label, update them to read `DEFAULT_PARSER_BACKEND` rather than hardcoding a string.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: default to the axilog parser on fresh installs

Removes the ~90MB GW2EICLI + .NET 8 first-run download from the default
path. Elite Insights stays selectable and is removed only at the end of
the native migration; an explicit selection is still honoured.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Step 0 ends here.** This is an independently shippable state: 0.3.4 pinned, two workarounds deleted, the default flipped, everything still on ei-json.

---

## Task 5: The equality-oracle harness

**Files:**
- Create: `src/test/axilogOracle.ts`
- Create: `src/test/__tests__/axilogOracle.test.ts`

**Interfaces:**
- Consumes: `@axiapps/axilog@0.3.4` (`parseFile`, `parseFileEi`).
- Produces, for every later unit:
  - `oracleFixture(): { ei: any; native: NativeReport }` — both-ways parse of the committed fixture, memoized so repeated calls across a test file cost one parse each, not N.
  - `type NativeReport` — the native container's top level: `{ axilog: { schema: string; version: string; generated_from?: string }, encounter: any, entities: NativeEntity[], catalogs: any, blocks: Record<string, any>, coverage: Record<string, CoverageState>, warnings?: any[] }`
  - `type CoverageState = 'present' | 'not_computed' | 'empty' | 'unsupported'`
  - `type NativeEntity = { id: number; account: string; character: string; role: EntityRole; combat_participant: boolean; profession: string; elite_spec?: string; subgroup?: number; team?: string; guild_id?: string; agent_addr: number; instid: number; name?: string; commander?: { guid: string; segments: Array<[number, number]>; variant: string } }`
  - `type EntityRole = 'squad' | 'friendly_player' | 'enemy_player' | 'npc'`
  - `expectEqualOrAllowlisted(label: string, eiValue: unknown, nativeValue: unknown, allowlist: DivergenceAllowlist): void`
  - `type DivergenceAllowlist = Record<string, { reason: string }>`

- [ ] **Step 1: Write the harness**

Create `src/test/axilogOracle.ts`:

```typescript
/**
 * The equality oracle for the axilog native-format migration.
 *
 * Every migration unit rewrites a compute module from EI-shaped input to
 * native. The oracle is how we know the rewrite did not change a displayed
 * number: parse ONE fixture BOTH ways at the SAME axilog version, run
 * old-compute-over-EI and new-compute-over-native, and assert deep equality —
 * or an explicit, reviewed allowlist entry saying which side is right.
 *
 * Both parses use `{ everything: true }` rather than an enumerated option
 * list. `everything` is defined by axilog as "every analysis pass this version
 * knows about", so oracle coverage cannot silently narrow as axilog adds
 * passes. A consumer option list drifting from the parser's is exactly what
 * produced the original cutover audit's 30 blank fields.
 */
import { expect } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';

export const FIXTURE_PATH = path.resolve(
    __dirname,
    '../../test-fixtures/axilog/wvw-small.anon.zevtc',
);

export type CoverageState = 'present' | 'not_computed' | 'empty' | 'unsupported';

export type EntityRole = 'squad' | 'friendly_player' | 'enemy_player' | 'npc';

export interface NativeCommander {
    guid: string;
    segments: Array<[number, number]>;
    variant: string;
}

export interface NativeEntity {
    id: number;
    account: string;
    character: string;
    role: EntityRole;
    combat_participant: boolean;
    profession: string;
    elite_spec?: string;
    subgroup?: number;
    team?: string;
    guild_id?: string;
    agent_addr: number;
    instid: number;
    name?: string;
    commander?: NativeCommander;
}

export interface NativeReport {
    axilog: { schema: string; version: string; generated_from?: string };
    encounter: any;
    entities: NativeEntity[];
    catalogs: any;
    blocks: Record<string, any>;
    coverage: Record<string, CoverageState>;
    warnings?: any[];
}

export interface OraclePair {
    ei: any;
    native: NativeReport;
}

let cached: OraclePair | null = null;

/**
 * Both-ways parse of the committed fixture, memoized for the process.
 * A parse is ~0.4s, so the memo matters once a test file calls this more than
 * once.
 */
export const oracleFixture = (): OraclePair => {
    if (cached) return cached;
    cached = {
        ei: parseFileEi(FIXTURE_PATH, { everything: true } as any),
        native: parseFile(FIXTURE_PATH, { everything: true } as any) as unknown as NativeReport,
    };
    return cached;
};

export type DivergenceAllowlist = Record<string, { reason: string }>;

/**
 * Assert the EI-derived and native-derived answers agree, or that this exact
 * label is a reviewed, documented divergence.
 *
 * An allowlist entry is a DELIVERABLE, not a nuisance: each one is a statement
 * of which side is right and why. Adding one without a `reason` is not
 * possible by construction.
 */
export const expectEqualOrAllowlisted = (
    label: string,
    eiValue: unknown,
    nativeValue: unknown,
    allowlist: DivergenceAllowlist,
): void => {
    const entry = allowlist[label];
    if (entry) {
        expect(entry.reason.length, `allowlist entry "${label}" needs a reason`).toBeGreaterThan(0);
        return;
    }
    expect(nativeValue, `oracle mismatch for "${label}" (add an allowlist entry if native is right)`)
        .toEqual(eiValue);
};
```

- [ ] **Step 2: Write the harness self-test**

Create `src/test/__tests__/axilogOracle.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted } from '../axilogOracle';

describe('axilog oracle harness', () => {
    it('parses the fixture both ways at the same version', () => {
        const { ei, native } = oracleFixture();
        expect(native.axilog.schema).toBe('1.0');
        expect(native.axilog.version).toBe('0.3.4');
        expect(Array.isArray(ei.players)).toBe(true);
        expect(Array.isArray(native.entities)).toBe(true);
    });

    it('memoizes — the second call returns the identical objects', () => {
        const a = oracleFixture();
        const b = oracleFixture();
        expect(a.ei).toBe(b.ei);
        expect(a.native).toBe(b.native);
    });

    it('exposes the six native top-level keys', () => {
        const { native } = oracleFixture();
        for (const key of ['axilog', 'encounter', 'entities', 'catalogs', 'blocks', 'coverage']) {
            expect(native, `missing native key ${key}`).toHaveProperty(key);
        }
    });

    it('passes when the two sides agree', () => {
        expect(() => expectEqualOrAllowlisted('n', 1, 1, {})).not.toThrow();
    });

    it('fails when they disagree and there is no allowlist entry', () => {
        expect(() => expectEqualOrAllowlisted('n', 1, 2, {})).toThrow();
    });

    it('passes a disagreement that carries an allowlist entry', () => {
        expect(() =>
            expectEqualOrAllowlisted('n', 1, 2, { n: { reason: 'native is right because ...' } }),
        ).not.toThrow();
    });
});
```

- [ ] **Step 3: Run it**

```bash
npx vitest run --maxWorkers=2 src/test/__tests__/axilogOracle.test.ts
```

Expected: PASS, 6 tests.

If `native.axilog.version` is not `0.3.4`, Task 1's pin did not take. If the fixture path fails to resolve, adjust `FIXTURE_PATH` — the relative depth depends on where the root vitest config places `__dirname`.

- [ ] **Step 4: Typecheck and lint**

```bash
npm run validate
```

Expected: clean. `parseFile`'s declared return type is `ReportV1` from axilog's own `types.d.ts`; the `as unknown as NativeReport` cast is deliberate — `NativeReport` narrows to the subset this migration reads, and units 2+ widen it as they need more. If `npm run typecheck` does not cover `src/test/`, check the `tsconfig` `include` globs and add it.

- [ ] **Step 5: Commit**

```bash
git add src/test/axilogOracle.ts src/test/__tests__/axilogOracle.test.ts
git commit -m "test: add the axilog native-migration equality oracle

Parses the committed fixture both ways at one axilog version so every
migration unit can assert its native rewrite against the EI-derived
answer, or record a reviewed divergence. Both parses use everything:true
so oracle coverage cannot narrow as axilog adds passes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Native roster readers

**Files:**
- Create: `packages/bridge-metrics/src/nativeRoster.ts`
- Create: `packages/bridge-metrics/src/__tests__/nativeRoster.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts`

**Interfaces:**
- Consumes: `NativeEntity`, `EntityRole` (shapes defined in Task 5; redeclared locally here because `packages/bridge-metrics` must not import from `src/test/`).
- Produces, exported from `@axiapps/bridge-metrics`:
  - `squadEntities(report: NativeReportLike): NativeEntityLike[]`
  - `friendlyPlayerEntities(report: NativeReportLike): NativeEntityLike[]`
  - `enemyPlayerEntities(report: NativeReportLike): NativeEntityLike[]`
  - `combatParticipantEnemies(report: NativeReportLike): NativeEntityLike[]`
  - `getEntityAccountKey(entity: NativeEntityLike): string | null`
  - `getEntityProfession(entity: NativeEntityLike): string`
  - `entitiesById(report: NativeReportLike): Map<number, NativeEntityLike>`

**Design note.** `partitionSquadPlayers` exists because EI emits one `players[]` entry per agent instance, so counts had to be collapsed downstream. Native's `dedupe_players` (`crates/axilog-core/src/wvw/mod.rs:17`) does that upstream — one entity per account, collecting agent addrs across relogs. So the native readers are **filters, not partitioners**. That is the whole point of the roster-as-filter table in the spec.

- [ ] **Step 1: Write the failing tests**

Create `packages/bridge-metrics/src/__tests__/nativeRoster.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
    squadEntities,
    friendlyPlayerEntities,
    enemyPlayerEntities,
    combatParticipantEnemies,
    getEntityAccountKey,
    getEntityProfession,
    entitiesById,
} from '../nativeRoster';

const entity = (over: any = {}) => ({
    id: 0,
    account: ':Someone.1234',
    character: 'Someone',
    role: 'squad',
    combat_participant: true,
    profession: 'Engineer',
    elite_spec: 'Holosmith',
    subgroup: 1,
    agent_addr: 1,
    instid: 1,
    ...over,
});

const report = (entities: any[]) => ({ entities } as any);

describe('nativeRoster filters', () => {
    const r = report([
        entity({ id: 0, role: 'squad', account: ':A.1' }),
        entity({ id: 1, role: 'squad', account: ':B.2' }),
        entity({ id: 2, role: 'friendly_player', account: ':C.3' }),
        entity({ id: 3, role: 'enemy_player', account: ':D.4', combat_participant: true }),
        entity({ id: 4, role: 'enemy_player', account: ':E.5', combat_participant: false }),
        entity({ id: 5, role: 'npc', account: '', combat_participant: true }),
        entity({ id: 6, role: 'npc', account: '', combat_participant: false }),
    ]);

    it('selects squad by role', () => {
        expect(squadEntities(r).map((e) => e.id)).toEqual([0, 1]);
    });

    it('selects non-squad allies by role', () => {
        expect(friendlyPlayerEntities(r).map((e) => e.id)).toEqual([2]);
    });

    it("selects EI's curated targets equivalent by role", () => {
        expect(enemyPlayerEntities(r).map((e) => e.id)).toEqual([3, 4]);
    });

    it('selects combat-participant enemies as non-squad AND participating', () => {
        expect(combatParticipantEnemies(r).map((e) => e.id)).toEqual([2, 3, 5]);
    });

    it('tolerates a report with no entities array', () => {
        expect(squadEntities({} as any)).toEqual([]);
        expect(enemyPlayerEntities({ entities: null } as any)).toEqual([]);
    });
});

describe('getEntityAccountKey', () => {
    it('prefers the account', () => {
        expect(getEntityAccountKey(entity({ account: ':A.1', character: 'Char' }))).toBe('acct::A.1');
    });

    it('falls back to the character name', () => {
        expect(getEntityAccountKey(entity({ account: '', character: 'Char' }))).toBe('name:Char');
    });

    it('rejects the literal Unknown on both fields', () => {
        expect(getEntityAccountKey(entity({ account: 'Unknown', character: 'Unknown' }))).toBeNull();
    });

    it('returns null when neither is usable', () => {
        expect(getEntityAccountKey(entity({ account: '  ', character: '' }))).toBeNull();
    });
});

describe('getEntityProfession', () => {
    it('returns the elite spec, which is what EI called profession', () => {
        expect(getEntityProfession(entity({ profession: 'Engineer', elite_spec: 'Holosmith' })))
            .toBe('Holosmith');
    });

    it('falls back to the base class for a core build with no elite spec', () => {
        expect(getEntityProfession(entity({ profession: 'Engineer', elite_spec: undefined })))
            .toBe('Engineer');
    });

    it('returns Unknown when neither is present', () => {
        expect(getEntityProfession(entity({ profession: '', elite_spec: undefined })))
            .toBe('Unknown');
    });
});

describe('entitiesById', () => {
    it('keys entities by their native id', () => {
        const map = entitiesById(report([entity({ id: 7, account: ':Z.9' })]));
        expect(map.get(7)?.account).toBe(':Z.9');
        expect(map.get(99)).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 --root packages/bridge-metrics src/__tests__/nativeRoster.test.ts
```

Expected: FAIL — `Cannot find module '../nativeRoster'`.

- [ ] **Step 3: Write the implementation**

Create `packages/bridge-metrics/src/nativeRoster.ts`:

```typescript
/**
 * Roster and identity readers over axilog's native 1.0 container.
 *
 * These replace `playerIdentity.ts`'s partitioning, and are deliberately a
 * separate module: `playerIdentity.ts` keeps serving EI-shaped history rows
 * during the migration and is deleted whole at Step N.
 *
 * They are FILTERS, not partitioners. EI emitted one `players[]` entry per
 * agent instance, so a relog produced two rows for one person and axibridge
 * collapsed them downstream. axilog dedupes upstream by account
 * (`crates/axilog-core/src/wvw/mod.rs`'s `dedupe_players`), collecting agent
 * addrs across relogs, so one entity IS one person.
 */

export type EntityRole = 'squad' | 'friendly_player' | 'enemy_player' | 'npc';

/** The subset of a native entity this module reads. */
export interface NativeEntityLike {
    id: number;
    account?: string;
    character?: string;
    role?: string;
    combat_participant?: boolean;
    profession?: string;
    elite_spec?: string;
    subgroup?: number;
    team?: string;
    guild_id?: string;
}

export interface NativeReportLike {
    entities?: NativeEntityLike[] | null;
}

const allEntities = (report: NativeReportLike | null | undefined): NativeEntityLike[] =>
    Array.isArray(report?.entities) ? report!.entities! : [];

const byRole = (report: NativeReportLike, role: EntityRole): NativeEntityLike[] =>
    allEntities(report).filter((e) => e?.role === role);

/** The squad. EI's `players[]` minus its `notInSquad` rows. */
export const squadEntities = (report: NativeReportLike): NativeEntityLike[] =>
    byRole(report, 'squad');

/**
 * Non-squad players on the squad's own team — pugs. EI only ever exposed these
 * as a `notInSquad` flag on a squad-shaped row; native gives them a role.
 */
export const friendlyPlayerEntities = (report: NativeReportLike): NativeEntityLike[] =>
    byRole(report, 'friendly_player');

/** The equivalent of EI's curated `targets[]`. */
export const enemyPlayerEntities = (report: NativeReportLike): NativeEntityLike[] =>
    byRole(report, 'enemy_player');

/**
 * Everything not in the squad that actually participated in combat — enemy
 * players plus participating NPCs and pugs. Wider than
 * {@link enemyPlayerEntities}; use that one where EI used `targets[]`.
 */
export const combatParticipantEnemies = (report: NativeReportLike): NativeEntityLike[] =>
    allEntities(report).filter((e) => e?.role !== 'squad' && e?.combat_participant === true);

/**
 * Stable identity key for an entity: account when known, else character name,
 * else null. Mirrors `playerIdentity.getPlayerAccountKey`'s key spelling
 * (`acct:` / `name:` prefixes) so keys stay comparable across the two shapes
 * for the duration of the migration.
 */
export const getEntityAccountKey = (entity: NativeEntityLike | null | undefined): string | null => {
    const account = typeof entity?.account === 'string' ? entity.account.trim() : '';
    if (account && account !== 'Unknown') return `acct:${account}`;
    const character = typeof entity?.character === 'string' ? entity.character.trim() : '';
    if (character && character !== 'Unknown') return `name:${character}`;
    return null;
};

/**
 * The profession string axibridge's lookup tables are keyed on.
 *
 * **EI's `players[].profession` is native's `elite_spec`, not native's
 * `profession`.** EI reports `"Amalgam"`; native reports
 * `profession: "Engineer", elite_spec: "Amalgam"`. `PROFESSION_COLORS`,
 * `PROFESSION_ABBREVIATIONS` and friends are all keyed on the elite-spec
 * spelling, so that is what this returns — falling back to the base class for
 * a core build, which is what EI did too.
 */
export const getEntityProfession = (entity: NativeEntityLike | null | undefined): string => {
    const spec = typeof entity?.elite_spec === 'string' ? entity.elite_spec.trim() : '';
    if (spec) return spec;
    const base = typeof entity?.profession === 'string' ? entity.profession.trim() : '';
    return base || 'Unknown';
};

/**
 * Entities keyed by native id — the join key that replaces EI's positional
 * `statsTargets[i]` ↔ `targets[i]` alignment.
 */
export const entitiesById = (report: NativeReportLike): Map<number, NativeEntityLike> => {
    const map = new Map<number, NativeEntityLike>();
    for (const entity of allEntities(report)) {
        if (typeof entity?.id === 'number') map.set(entity.id, entity);
    }
    return map;
};
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run --maxWorkers=2 --root packages/bridge-metrics src/__tests__/nativeRoster.test.ts
```

Expected: PASS, 13 tests (5 filter + 4 identity-key + 3 profession + 1 id-map).

- [ ] **Step 5: Export from the package index**

In `packages/bridge-metrics/src/index.ts`, add an export line following the file's existing style (check whether it uses `export * from './x'` or named re-exports and match it):

```typescript
export * from './nativeRoster';
```

- [ ] **Step 6: Rebuild and gate**

```bash
npm run build -w @axiapps/bridge-metrics && npm run validate
```

Expected: clean. If `EntityRole` collides with an existing export, rename the local one to `NativeEntityRole` in `nativeRoster.ts` and update the test import.

- [ ] **Step 7: Commit**

```bash
git add packages/bridge-metrics/src/nativeRoster.ts packages/bridge-metrics/src/__tests__/nativeRoster.test.ts packages/bridge-metrics/src/index.ts
git commit -m "feat(metrics): native roster and identity readers

Roster selection over axilog native entities[] becomes a role filter
rather than a downstream partition: axilog dedupes by account upstream,
so one entity is one person. Notes the profession mapping trap — EI's
profession is native's elite_spec, not native's profession.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Unit 1's oracle test

**Files:**
- Create: `src/test/__tests__/unit1Roster.oracle.test.ts`

**Interfaces:**
- Consumes: `oracleFixture`, `expectEqualOrAllowlisted`, `DivergenceAllowlist` (Task 5); the `nativeRoster` exports (Task 6); `partitionSquadPlayers` from `@axiapps/bridge-metrics`.
- Produces: unit 1's reviewed divergence allowlist, as executable code.

This is the gate the spec requires for every unit: EI-derived roster answers versus native-derived, deep-equal or allowlisted.

- [ ] **Step 1: Write the test**

Create `src/test/__tests__/unit1Roster.oracle.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
    partitionSquadPlayers,
    squadEntities,
    friendlyPlayerEntities,
    enemyPlayerEntities,
    getEntityAccountKey,
    getEntityProfession,
} from '@axiapps/bridge-metrics';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';

/**
 * Unit 1's reviewed divergences. Each entry is a statement of which side is
 * right and why — a deliverable, not a suppression.
 */
const ALLOWLIST: DivergenceAllowlist = {
    // Empty on the committed fixture: it contains no relog, so EI's 42
    // players[] entries are 42 distinct accounts and both sides agree. The
    // dedupe divergence the spec anticipates is exercised synthetically in
    // packages/bridge-metrics/src/__tests__/nativeRoster.test.ts instead.
};

describe('unit 1 oracle — roster & identity', () => {
    it('agrees on the squad roster', () => {
        const { ei, native } = oracleFixture();
        const eiSquad = partitionSquadPlayers(ei.players).squadPrimaries
            .map((p: any) => p.account)
            .sort();
        const nativeSquad = squadEntities(native).map((e) => e.account!).sort();
        expectEqualOrAllowlisted('squad accounts', eiSquad, nativeSquad, ALLOWLIST);
    });

    it('agrees on the non-squad ally roster', () => {
        const { ei, native } = oracleFixture();
        const eiPugs = partitionSquadPlayers(ei.players).pugPrimaries
            .map((p: any) => p.account)
            .sort();
        const nativePugs = friendlyPlayerEntities(native).map((e) => e.account!).sort();
        expectEqualOrAllowlisted('pug accounts', eiPugs, nativePugs, ALLOWLIST);
    });

    it('agrees on the enemy roster size', () => {
        const { ei, native } = oracleFixture();
        expectEqualOrAllowlisted(
            'enemy count',
            ei.targets.length,
            enemyPlayerEntities(native).length,
            ALLOWLIST,
        );
    });

    it('agrees on every squad member profession', () => {
        const { ei, native } = oracleFixture();
        const eiByAccount = new Map<string, string>();
        for (const p of ei.players) {
            if (p.notInSquad) continue;
            eiByAccount.set(p.account, p.profession);
        }
        for (const entity of squadEntities(native)) {
            expectEqualOrAllowlisted(
                `profession:${entity.account}`,
                eiByAccount.get(entity.account!),
                getEntityProfession(entity),
                ALLOWLIST,
            );
        }
    });

    it('agrees on identity keys', () => {
        const { ei, native } = oracleFixture();
        const eiKeys = ei.players
            .filter((p: any) => !p.notInSquad)
            .map((p: any) => `acct:${p.account}`)
            .sort();
        const nativeKeys = squadEntities(native).map((e) => getEntityAccountKey(e)!).sort();
        expectEqualOrAllowlisted('identity keys', eiKeys, nativeKeys, ALLOWLIST);
    });

    it('agrees on the commander', () => {
        const { ei, native } = oracleFixture();
        const eiCommanders = ei.players
            .filter((p: any) => p.hasCommanderTag)
            .map((p: any) => p.account)
            .sort();
        const nativeCommanders = native.entities
            .filter((e) => e.commander)
            .map((e) => e.account)
            .sort();
        expectEqualOrAllowlisted('commanders', eiCommanders, nativeCommanders, ALLOWLIST);
    });

    it('agrees on subgroups', () => {
        const { ei, native } = oracleFixture();
        const eiByAccount = new Map<string, number>();
        for (const p of ei.players) {
            if (p.notInSquad) continue;
            eiByAccount.set(p.account, p.group);
        }
        for (const entity of squadEntities(native)) {
            expectEqualOrAllowlisted(
                `subgroup:${entity.account}`,
                eiByAccount.get(entity.account!),
                entity.subgroup,
                ALLOWLIST,
            );
        }
    });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run --maxWorkers=2 src/test/__tests__/unit1Roster.oracle.test.ts
```

Expected: PASS, 7 tests, with an empty allowlist.

Probed baseline on the committed fixture, so you know what "right" looks like: native `role` counts are `squad: 38`, `friendly_player: 4`, `enemy_player: 32`, `npc: 48`; EI reports 42 `players[]` (4 with `notInSquad`) and 32 `targets[]`; both sides name exactly one commander, `:Anon106.4922`.

**If the profession test fails**, you have hit the elite-spec trap — `getEntityProfession` must return `elite_spec`, not `profession`. Do not add an allowlist entry for it; that would be recording a bug as a decision.

**If the squad/pug tests fail**, do not reach for the allowlist first. Check the role filter. An allowlist entry is only correct when native is genuinely right and EI genuinely wrong — the relog-dedupe case, which this fixture does not contain.

- [ ] **Step 3: Commit**

```bash
git add src/test/__tests__/unit1Roster.oracle.test.ts
git commit -m "test: unit 1 equality oracle for roster and identity

Pins the native roster filters against the EI-derived answers on the
committed fixture. The allowlist is empty: this fixture contains no
relog, so the anticipated dedupe divergence is not observable here and
is covered synthetically in nativeRoster.test.ts instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Move squad-guild extraction to native

**Files:**
- Modify: `src/renderer/stats/utils/computeDominantGuildId.ts`
- Modify: `src/renderer/__tests__/computeDominantGuildId.test.ts`

**Interfaces:**
- Consumes: `squadEntities`, `getEntityAccountKey` (Task 6).
- Produces: `computeDominantGuildId(reports: NativeReportLike[]): string` — same signature shape, native input.

**Fixture caveat, read before writing tests:** the committed fixture is anonymized, and anonymization zeroes guild ids — every squad entity carries `00000000-0000-0000-0000-000000000000`. So the oracle cannot exercise a *real* guild vote on it; both sides correctly return `''`. Unit tests over synthetic reports carry the real coverage here, and that is fine — this is exactly what the spec's "at least one test against an absent sentinel" gate is about.

- [ ] **Step 1: Write the failing tests**

Replace the body of `src/renderer/__tests__/computeDominantGuildId.test.ts` with native-shaped inputs. Keep every behavioural case the existing file covers — commander vote, squad-wide fallback, tie-break, unrepped — and rewrite only the input shape:

```typescript
import { describe, expect, it } from 'vitest';
import { computeDominantGuildId } from '../stats/utils/computeDominantGuildId';

const ZERO = '00000000-0000-0000-0000-000000000000';
const GUILD_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const GUILD_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const ent = (over: any = {}) => ({
    id: 0,
    account: ':Player.1111',
    character: 'Player',
    role: 'squad',
    combat_participant: true,
    profession: 'Guardian',
    elite_spec: 'Firebrand',
    subgroup: 1,
    guild_id: ZERO,
    agent_addr: 1,
    instid: 1,
    ...over,
});

const report = (entities: any[]) => ({ entities } as any);

describe('computeDominantGuildId over native reports', () => {
    it('returns the guild the commander repped in the most logs', () => {
        const commander = (guild: string) =>
            ent({ id: 0, account: ':Cmdr.1', guild_id: guild, commander: { guid: 'g', segments: [[0, 1]], variant: 'p' } });
        const result = computeDominantGuildId([
            report([commander(GUILD_A), ent({ id: 1, account: ':Other.2', guild_id: GUILD_B })]),
            report([commander(GUILD_A), ent({ id: 1, account: ':Other.2', guild_id: GUILD_B })]),
            report([commander(GUILD_B), ent({ id: 1, account: ':Other.2', guild_id: GUILD_B })]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('falls back to the squad-wide vote when nobody tagged', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':A.1', guild_id: GUILD_B }),
                ent({ id: 1, account: ':B.2', guild_id: GUILD_B }),
                ent({ id: 2, account: ':C.3', guild_id: GUILD_A }),
            ]),
        ]);
        expect(result).toBe(GUILD_B);
    });

    it('falls back to the squad vote when the commander repped nothing', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':Cmdr.1', guild_id: ZERO, commander: { guid: 'g', segments: [[0, 1]], variant: 'p' } }),
                ent({ id: 1, account: ':A.2', guild_id: GUILD_A }),
            ]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('ignores non-squad allies in the squad-wide vote', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':A.1', guild_id: GUILD_A }),
                ent({ id: 1, account: ':P.9', role: 'friendly_player', guild_id: GUILD_B }),
                ent({ id: 2, account: ':Q.8', role: 'friendly_player', guild_id: GUILD_B }),
            ]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('breaks ties alphabetically by guild id', () => {
        const result = computeDominantGuildId([
            report([
                ent({ id: 0, account: ':A.1', guild_id: GUILD_B }),
                ent({ id: 1, account: ':B.2', guild_id: GUILD_A }),
            ]),
        ]);
        expect(result).toBe(GUILD_A);
    });

    it('returns empty when the whole squad is unrepped', () => {
        const result = computeDominantGuildId([
            report([ent({ id: 0, account: ':A.1' }), ent({ id: 1, account: ':B.2' })]),
        ]);
        expect(result).toBe('');
    });

    it('returns empty for a report with no entities at all', () => {
        expect(computeDominantGuildId([{} as any])).toBe('');
        expect(computeDominantGuildId([])).toBe('');
    });

    it('treats a missing guild_id the same as the zero guild', () => {
        const result = computeDominantGuildId([
            report([ent({ id: 0, account: ':A.1', guild_id: undefined }), ent({ id: 1, account: ':B.2', guild_id: GUILD_A })]),
        ]);
        expect(result).toBe(GUILD_A);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --maxWorkers=2 src/renderer/__tests__/computeDominantGuildId.test.ts
```

Expected: FAIL — the current implementation reads `details.players[].guildID` and `player.notInSquad`, neither of which exists on a native report.

- [ ] **Step 3: Rewrite the implementation**

In `src/renderer/stats/utils/computeDominantGuildId.ts`, replace the two EI reads:

- `guildReppedInLog`: iterate `squadEntities(report)` instead of `details.players` with a `notInSquad` skip; read `entity.guild_id` instead of `player.guildID`; build the vote key from `getEntityAccountKey(entity)` instead of `player.account || player.name`.
- The squad-wide fallback block: same two substitutions.

The `seenThisLog` dedupe in the fallback becomes redundant — native emits one entity per account — but leave it in. It costs nothing and it keeps the function correct if it is ever handed a hand-built report.

Update the module's doc comment: the sentence "EI emits one `players[]` entry per agent instance (relog/build swap), so the first entry wins" no longer describes the input. Replace it with a note that native emits one entity per account, so there is nothing to collapse.

`computePrimaryCommanderIdentity` (imported at the top) still takes EI-shaped input. **Do not migrate it here** — it is read by other callers not yet converted. Instead, feed it what it expects by projecting the native entities:

```typescript
const commanderShim = (report: NativeReportLike) => ({
    players: squadEntities(report).map((e) => ({
        account: e.account,
        name: e.character,
        hasCommanderTag: Boolean((e as any).commander),
    })),
});
```

Call `computePrimaryCommanderIdentity(reports.map(commanderShim))`. Mark it with a comment: `// TODO(unit 8): delete this shim when computePrimaryCommanderIdentity moves to native.` This is a deliberate, scoped, one-function bridge — not the general `eiToNative()` adapter decision 1 rejects.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run --maxWorkers=2 src/renderer/__tests__/computeDominantGuildId.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Handle the single call site**

There is exactly one: `src/renderer/stats/hooks/useStatsUploads.ts:141`, `guildId: computeDominantGuildId(detailsList)`.

`detailsList` is still EI-shaped — the parse seam does not return native until unit 2 — so this call site **cannot** be converted in unit 1. Leave the call as it is and add a comment above it:

```typescript
// TODO(unit 2): detailsList is still EI-shaped until the parse seam returns
// ReportV1. computeDominantGuildId now reads native entities[], so this call
// yields '' until then. Guild detection is degraded, not wrong, in the interim.
```

**This is a real, temporary, user-visible regression: the report guild reads empty between this task and unit 2's merge.** It is the honest cost of migrating a leaf before its seam. The alternatives are worse: shimming the input reintroduces the EI-to-native adapter decision 1 rejects, and holding unit 1 until unit 2 lands inverts the spec's data-dependency ordering.

Do not ship Step 0 through unit 1 as a user release without unit 2. If a release is needed in that window, revert this task only — it is the last commit in the plan's code sequence and reverts cleanly.

Both `computeDominantGuildId` signatures are `(list: any[]) => string`, so this compiles either way; `npm run validate` will not catch it for you.

- [ ] **Step 6: Gate**

```bash
npm run validate && npx vitest run --maxWorkers=2
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: read squad guild from native entities

Guild votes now read entities[].guild_id filtered by role == squad
rather than players[].guildID with a notInSquad skip. Keeps a scoped
shim for computePrimaryCommanderIdentity, which stays EI-shaped until
unit 8.

Known interim regression: the sole call site (useStatsUploads) still
passes EI-shaped details until unit 2 converts the parse seam, so the
report guild reads empty in between. Do not ship a user release in that
window without unit 2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The sentinel gate for unit 1

**Files:**
- Modify: `packages/bridge-metrics/src/__tests__/nativeRoster.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5–8.
- Produces: no new exports. This task discharges the spec's per-unit sentinel requirement.

**Why this task exists as its own gate.** The spec names this the sharpest risk in the migration: EI collapsed "the pass never ran", "it ran and found nothing", and "the value is zero" into one falsy value, and EI-shaped code learned to treat them as interchangeable because EI gave it no alternative. A mechanical port that keeps those null-guards compiles, passes Task 7's oracle, and silently discards information. The oracle cannot catch this — it only ever sees a fully-populated fixture.

- [ ] **Step 1: Write the sentinel tests**

Append to `packages/bridge-metrics/src/__tests__/nativeRoster.test.ts`:

```typescript
describe('sentinel handling — the three states EI collapsed into one', () => {
    it('distinguishes a squad with zero members from a report that has no roster', () => {
        // "ran, found nothing" vs "never ran". Both yield an empty array here,
        // but they must be distinguishable at the coverage layer, not inferred
        // from emptiness. This test pins that the FILTER never invents members
        // for either case.
        expect(squadEntities({ entities: [] } as any)).toEqual([]);
        expect(squadEntities({} as any)).toEqual([]);
    });

    it('treats combat_participant absent as NOT participating, never as true', () => {
        const r = {
            entities: [
                { id: 0, role: 'npc', account: '', combat_participant: undefined },
                { id: 1, role: 'npc', account: '', combat_participant: false },
                { id: 2, role: 'npc', account: '', combat_participant: true },
            ],
        } as any;
        // Strict === true, so an absent flag cannot be silently promoted.
        expect(combatParticipantEnemies(r).map((e) => e.id)).toEqual([2]);
    });

    it('treats an unrecognised role as not-squad rather than defaulting to squad', () => {
        const r = { entities: [{ id: 0, role: 'some_future_role', combat_participant: true }] } as any;
        expect(squadEntities(r)).toEqual([]);
        expect(enemyPlayerEntities(r)).toEqual([]);
        // But it IS a combat participant, because that is a separate fact.
        expect(combatParticipantEnemies(r).map((e) => e.id)).toEqual([0]);
    });

    it('does not confuse subgroup 0 with an absent subgroup', () => {
        const zero = { id: 0, role: 'squad', account: ':A.1', subgroup: 0 } as any;
        const absent = { id: 1, role: 'squad', account: ':B.2' } as any;
        expect(zero.subgroup).toBe(0);
        expect(absent.subgroup).toBeUndefined();
        // The trap: `entity.subgroup || 1` would turn a real 0 into 1.
        expect(squadEntities({ entities: [zero, absent] } as any).map((e) => e.subgroup))
            .toEqual([0, undefined]);
    });

    it('does not treat the zero guild id as a repped guild', () => {
        // Anonymized fixtures carry the zero guild on every entity. A reader
        // that trusted presence over value would report a session guild of
        // all-zeros for every anonymized log.
        const ZERO = '00000000-0000-0000-0000-000000000000';
        const e = { id: 0, role: 'squad', account: ':A.1', guild_id: ZERO } as any;
        expect(e.guild_id).toBe(ZERO);
        expect(squadEntities({ entities: [e] } as any)).toHaveLength(1);
    });
});
```

Add `combatParticipantEnemies` and `enemyPlayerEntities` to the file's import list if they are not already there.

- [ ] **Step 2: Run**

```bash
npx vitest run --maxWorkers=2 --root packages/bridge-metrics src/__tests__/nativeRoster.test.ts
```

Expected: PASS, 18 tests total (13 from Task 6 plus these 5).

If "treats `combat_participant` absent as NOT participating" fails, `combatParticipantEnemies` is using a truthiness check instead of `=== true`. Fix the implementation, not the test — that is the exact hazard this gate exists to catch.

- [ ] **Step 3: Rebuild, full gate**

```bash
npm run build -w @axiapps/bridge-metrics && npm run validate && npx vitest run --maxWorkers=2
```

Expected: fully green.

- [ ] **Step 4: Commit**

```bash
git add packages/bridge-metrics/src/__tests__/nativeRoster.test.ts
git commit -m "test: sentinel gate for unit 1

Discharges the spec's per-unit requirement that behaviour be asserted
against absent sentinels, not only populated data. EI collapsed 'never
ran', 'found nothing' and 'zero' into one falsy value; these pin that
the native readers keep them apart.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Fold the spec corrections back into the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md`

**Interfaces:**
- Consumes: the "Spec corrections" table at the top of this plan.
- Produces: a spec that matches the probed reality, so units 2–10 are planned from correct premises.

The spec is the document units 2–10 will be planned from. Leaving it asserting deletions that cannot happen would propagate the error five plans deep.

- [ ] **Step 1: Correct Step 0's deletion list**

In the "Step 0" section, remove the `deriveDistanceScalars` and `.zevtc`-mtime bullets from the deletion list. Add, after the list:

```markdown
Two deletions originally scoped here turned out not to be available at 0.3.4,
established by probing the published artifact:

- `deriveDistanceScalars` — 0.3.4 computes the scalars engine-side onto
  **native** `blocks.replay.by_entity[id].{dist_to_com, stack_dist}`, but
  `to_ei_json` does not map them: `statsAll[0].distToCom` is `undefined` for
  every player even with `everything: true`. The deletion moves to **unit 3**.
- The `.zevtc`-mtime timestamp inference — `encounter.started_at_unix` is real
  on native, but ei-json still emits no `timeStart`/`timeEnd`/`zone`/
  `encounterDuration`/`players[].name`. `applyEiCompatShims` survives Step 0
  in full and is retired in **unit 2**.
```

- [ ] **Step 2: Correct unit 1's file list**

In the migration-unit table, change row 1's principal files to:

```
| 1 | Roster & identity | `playerIdentity.ts` → new `nativeRoster.ts`, `computeDominantGuildId.ts`, `squadGuilds.ts` |
```

Add below the table:

```markdown
`attendance.ts` reads a rollup payload, never EI JSON; its producer is
`incrementalAggregation.ts`, so attendance moves with unit 8.
`professionUtils.ts` takes profession *strings* and is shape-agnostic — only
its callers migrate.

**The profession mapping trap:** EI's `players[].profession` is native's
`entities[].elite_spec`, not native's `entities[].profession`. EI reports
`"Amalgam"`; native reports `profession: "Engineer", elite_spec: "Amalgam"`.
Every axibridge lookup table is keyed on the elite-spec spelling.
```

- [ ] **Step 3: Close open item 1**

Replace open item 1 with:

```markdown
1. ~~**Publish axilog 0.3.4 to npm.**~~ CLOSED — 0.3.4 is on the registry and
   pinned exactly in `package.json`.
```

- [ ] **Step 4: Record what the fixture cannot test**

Append to the Testing section:

```markdown
**What the committed fixture cannot exercise.** It contains no relog (42 EI
`players[]` entries, 42 distinct accounts), so the account-dedupe divergence
the allowlist anticipates is not observable on it and is covered synthetically
instead. It is also anonymized, which zeroes every `guild_id`, so the
squad-guild vote cannot be exercised end-to-end on real data. Both gaps are
covered by unit tests over hand-built reports; neither is a reason to commit a
non-anonymized log.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-axilog-native-format-migration-design.md
git commit -m "docs: correct the Phase D spec against the real 0.3.4 artifact

Two Step 0 deletions were scoped on an assumption about what to_ei_json
maps; probing the published package showed the distance scalars and the
log-start anchor land on native only. They move to units 3 and 2. Also
corrects unit 1's file list and records the profession mapping trap.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of done

- `@axiapps/axilog` pinned to exactly `0.3.4`; fresh installs parse via axilog with no Elite Insights download.
- `OFFENSE_METRICS_STATS_ALL_FALLBACK`, the `sawTargetSplit` substitution, and their 14 combined tests (11 + 3) are gone, replaced by one pin on the per-target field surface.
- `src/test/axilogOracle.ts` exists and every later unit can call `oracleFixture()`.
- Roster, identity, profession and squad-guild reads run off `entities[]` with a role filter.
- Unit 1's oracle test passes with an empty allowlist; the sentinel gate passes.
- The spec matches probed reality.
- `npm run validate` and `npx vitest run --maxWorkers=2` green.

**Not shippable to users as-is.** Task 4 (end of Step 0) is a clean release point. Task 8 opens an interim regression — the report guild reads empty until unit 2 converts the parse seam — so the plan's full range must be paired with unit 2 before any user release.

## What this plan does not do

Units 2–10, Step N (Elite Insights removal), and the history migration. Each gets its own plan, written against a probe of the native blocks it actually reads. Unit 8 in particular is ~40% of the compute surface and the spec already flags it as a bucket needing a split.

**One decision falls due when Task 6 merges:** unit 1 makes axibridge native 1.0's first external consumer, which by `NATIVE-FORMAT.md`'s own terms ends axilog's malleability licence. The spec recommends axilog commit a freeze declaration at that point. That is an axilog-side commit and is not in this plan.
