# Discord Embed Damage Mitigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A toggleable (default-off) "Damage Mitigation" top-10 list in the per-fight Discord embed, computed by the same `@axiapps/bridge-metrics` pipeline the dashboard uses.

**Architecture:** A tiny new main-process module (`src/main/embedMitigation.ts`) runs the package's aggregation pipeline on one fight's EI JSON and returns a per-account mitigation map. `discord.ts` gains one `show*` flag and one entry in its existing `topListItems` array that reads from that map. SettingsView gains one checkbox. No renderer aggregation code changes at all.

**Tech Stack:** TypeScript, Electron main (CommonJS), `@axiapps/bridge-metrics` ^0.2.0, vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-discord-embed-damage-mitigation-design.md` (revised: pipeline reuse, player scope only).

## Global Constraints

- Branch: `discord-mitigation-embed` (spec committed there).
- Vitest always with `--maxWorkers=2`.
- `npm run lint` zero warnings; `npm run typecheck` clean.
- New setting key is exactly `showDamageMitigation`, default `false`, added to BOTH `IEmbedStatSettings` declarations and BOTH `DEFAULT_EMBED_STATS` objects (`src/renderer/global.d.ts` and `src/main/discord.ts`).
- Pipeline options, verbatim: `{ method: 'count', skillDamageSource: 'target', splitPlayersByClass: false }` (the dashboard's defaults: `global.d.ts:139` DEFAULT_DISRUPTION_METHOD = 'count'; `incrementalAggregation.ts:555` topSkillDamageSource fallback 'target').
- Player scope only — rows from `acc.damageMitigationPlayersMap`; minion rows are NOT summed in.
- With the toggle off (default), posted embeds must be byte-identical to today's — the pipeline must not even run.
- Main process must import from the package root `@axiapps/bridge-metrics` (its `main: ./dist/index.cjs` resolves under the electron tsconfig's `"module": "commonjs"`); do not import from `src/renderer/`.
- Commit messages: conventional (`feat:`, `docs:`, `chore:`).

---

### Task 1: `buildFightMitigationByAccount` module

**Files:**
- Create: `src/main/embedMitigation.ts`
- Test: `src/main/__tests__/embedMitigation.test.ts`

**Interfaces:**
- Consumes (from `@axiapps/bridge-metrics` root export): `createPlayerAggregationAccumulators(): PlayerAggregationAccumulators`, `precomputeGlobalEnemySkillStats(log: any, acc)`, `ingestLogPlayerData(log: any, acc, options)`, `finalizePlayerAggregation(acc)`; rows in `acc.damageMitigationPlayersMap: Map<string, DamageMitigationRow>` where `DamageMitigationRow = { account, name, profession, professionList, activeMs, mitigationTotals: { totalHits, blocked, evaded, glanced, missed, invulned, interrupted, totalMitigation, minMitigation } }`. The `log` argument is a `{ details: <EI JSON> }` wrapper.
- Produces: `export function buildFightMitigationByAccount(jsonDetails: any): Map<string, number>` — keys are player `account` (fallback `name`), values are `mitigationTotals.totalMitigation`, zero-total rows excluded. Task 2 relies on this exact name and shape.

- [ ] **Step 1: Write the failing tests**

Create `src/main/__tests__/embedMitigation.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFightMitigationByAccount } from '../embedMitigation';

// Minimal synthetic EI JSON with hand-computable mitigation.
// Enemy skill 100: totalDamage 3000 over 3 connected hits → avg 1000;
// min entries average → minDamage 500 (not asserted here; avg drives totalMitigation).
// Player "Alice.1234" against skill 100: blocked 2, glanced 1 →
//   totalMitigation = glanced × avg/2 + (blocked+evaded+missed+invulned+interrupted) × avg
//                   = 1 × 500 + 2 × 1000 = 2500.
// Player "Bob.5678" has an entry for skill 999 with zero connected enemy hits →
//   excluded → Bob has zero total → omitted from the map.
const syntheticDetails = {
    targets: [{
        totalDamageDist: [[
            { id: 100, totalDamage: 3000, connectedHits: 3, min: 500 },
            { id: 999, totalDamage: 0, connectedHits: 0, min: 0 },
        ]],
    }],
    players: [
        {
            account: 'Alice.1234', name: 'Alice', profession: 'Guardian', notInSquad: false,
            totalDamageTaken: [[
                { id: 100, hits: 5, blocked: 2, evaded: 0, glance: 1, missed: 0, invulned: 0, interrupted: 0, totalDamage: 2000, damage: 2000 },
            ]],
        },
        {
            account: 'Bob.5678', name: 'Bob', profession: 'Warrior', notInSquad: false,
            totalDamageTaken: [[
                { id: 999, hits: 1, blocked: 1, evaded: 0, glance: 0, missed: 0, invulned: 0, interrupted: 0, totalDamage: 0, damage: 0 },
            ]],
        },
    ],
};

describe('buildFightMitigationByAccount', () => {
    it('computes the hand-derived total for a synthetic fight', () => {
        const map = buildFightMitigationByAccount(syntheticDetails);
        expect(map.get('Alice.1234')).toBe(2500);
    });

    it('omits players whose only avoided skills had zero connected enemy hits', () => {
        const map = buildFightMitigationByAccount(syntheticDetails);
        expect(map.has('Bob.5678')).toBe(false);
    });

    it('returns an empty map when the fight has no enemy damage data', () => {
        expect(buildFightMitigationByAccount({ targets: [], players: [] }).size).toBe(0);
        expect(buildFightMitigationByAccount(null).size).toBe(0);
    });

    it('produces finite positive totals on a real fixture log', () => {
        const raw = JSON.parse(readFileSync(
            path.resolve(__dirname, '../../../test-fixtures/dmg-mit/20260205-190624.json'), 'utf8'));
        // Fixture files may be the EI JSON itself or a wrapper with .details — handle both.
        const details = raw.details ?? raw;
        const map = buildFightMitigationByAccount(details);
        expect(map.size).toBeGreaterThan(0);
        for (const v of map.values()) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThan(0);
        }
    });
});
```

NOTE for the implementer: if the synthetic test fails because the package's ingest reads different field names (e.g. `glance` vs `glanced`, or requires extra player fields), inspect `node_modules/@axiapps/bridge-metrics/src/computePlayerAggregation.ts` (the mitigation ingest is near `parseMitigationKey`, line ~212, and inside `ingestLogPlayerData`, line ~512) and adjust the SYNTHETIC INPUT to the fields the pipeline actually reads — never adjust the expected 2500 without re-deriving it by hand from the formula in `src/shared/metrics-spec.md` §Damage Mitigation. Record any input-shape adjustments in your report.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/embedMitigation.test.ts --maxWorkers=2`
Expected: FAIL — module `../embedMitigation` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/embedMitigation.ts`:

```ts
import {
    createPlayerAggregationAccumulators,
    precomputeGlobalEnemySkillStats,
    ingestLogPlayerData,
    finalizePlayerAggregation,
} from '@axiapps/bridge-metrics';

/**
 * Per-account damage-mitigation totals for a single fight, computed by the
 * same bridge-metrics pipeline the stats dashboard uses (window = this one
 * log). Player scope only, matching the dashboard's default view.
 * Options mirror the dashboard defaults (method 'count', skill damage
 * source 'target', no class split).
 */
export function buildFightMitigationByAccount(jsonDetails: any): Map<string, number> {
    const result = new Map<string, number>();
    if (!jsonDetails) return result;
    const acc = createPlayerAggregationAccumulators();
    const log = { details: jsonDetails };
    precomputeGlobalEnemySkillStats(log, acc);
    ingestLogPlayerData(log, acc, { method: 'count', skillDamageSource: 'target', splitPlayersByClass: false });
    finalizePlayerAggregation(acc);
    for (const row of acc.damageMitigationPlayersMap.values()) {
        const total = row?.mitigationTotals?.totalMitigation ?? 0;
        if (total > 0) result.set(row.account || row.name, total);
    }
    return result;
}
```

(If `finalizePlayerAggregation` requires fields the synthetic JSON lacks and throws, add the minimal missing fields to the synthetic input per the Step 1 NOTE — the real fixture test guards representativeness.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/embedMitigation.test.ts --maxWorkers=2`
Expected: PASS (4 tests). Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/embedMitigation.ts src/main/__tests__/embedMitigation.test.ts
git commit -m "feat: per-fight damage mitigation totals via bridge-metrics pipeline"
```

---

### Task 2: Embed toggle + top-10 list in discord.ts

**Files:**
- Modify: `src/main/discord.ts` (interface ~line 40-62, defaults ~line 65-91, top-list array ~line 758-877)
- Modify: `src/renderer/global.d.ts` (interface line ~11-40, `DEFAULT_EMBED_STATS` line ~142-168)

**Interfaces:**
- Consumes: `buildFightMitigationByAccount(jsonDetails): Map<string, number>` from Task 1 (`./embedMitigation`).
- Produces: `showDamageMitigation: boolean` on `IEmbedStatSettings` (both copies) — Task 3's checkbox binds to this exact key.

- [ ] **Step 1: Add the setting key to all four declaration sites**

In `src/main/discord.ts` interface, after `showDodges: boolean;` add:
```ts
    showDamageMitigation: boolean;
```
In `src/main/discord.ts` `DEFAULT_EMBED_STATS`, after `showDodges: false,` add:
```ts
    showDamageMitigation: false,
```
Make the same two additions in `src/renderer/global.d.ts` (interface after `showDodges`, defaults after `showDodges: false,`).

- [ ] **Step 2: Compute the map and add the stat entry**

In `src/main/discord.ts`, add the import at the top with the other local imports:
```ts
import { buildFightMitigationByAccount } from './embedMitigation';
```

Directly above the `const topListItems: Array<{` declaration (~line 758), add:
```ts
                    // Runs the shared metrics pipeline on this one fight (~25ms);
                    // skipped entirely when the stat is disabled.
                    const mitigationByAccount = settings.showDamageMitigation
                        ? buildFightMitigationByAccount(jsonDetails)
                        : new Map<string, number>();
                    const getMitigation = (p: any) => mitigationByAccount.get(p.account ?? p.name) || 0;
```
(If the enclosing scope names the fight JSON differently than `jsonDetails`, use the same variable the neighboring `valFn` helpers' data comes from — the object whose `.players` feeds the top lists. Match the file's 4-space-in-context indentation exactly.)

Then append a new entry at the END of the `topListItems` array, after the `showDodges` entry:
```ts
                            {
                                enabled: settings.showDamageMitigation,
                                title: "Damage Mitigation",
                                sortFn: (a: any, b: any) => getMitigation(b) - getMitigation(a),
                                valFn: (p: any) => getMitigation(p),
                        fmtVal: (v: any) => fmtInt(v)
                            }
```
(Yes, the odd `fmtVal` indentation matches the existing entries — keep the file's style.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean, zero warnings.
Run: `npx vitest run src/main --maxWorkers=2`
Expected: all main-process tests pass (including Task 1's).

- [ ] **Step 4: Commit**

```bash
git add src/main/discord.ts src/renderer/global.d.ts
git commit -m "feat: damage mitigation top-10 option in Discord fight embeds"
```

---

### Task 3: Settings checkbox

**Files:**
- Modify: `src/renderer/SettingsView.tsx` — three sites: the toggle-all builder (~line 1336-1352), the `allTopListsEnabled` conjunction (~line 1355-1361), and the checkbox list (~line 2062 onward).

**Interfaces:**
- Consumes: `showDamageMitigation` key from Task 2 (`IEmbedStatSettings`).
- Produces: nothing new.

- [ ] **Step 1: Wire the three sites**

1. In the toggle-all builder (the object literal assigning `show<Stat>: enabled` for every top-list key, ~1336-1351), add:
```ts
            showDamageMitigation: enabled,
```
2. In the `allTopListsEnabled` conjunction (~1355-1361), add `embedStats.showDamageMitigation &&` alongside the other additional stats (keep the expression's existing formatting).
3. In the checkbox list, after the last existing additional-stat checkbox (pattern at ~2062: a component with `enabled={embedStats.showX}` / `onChange={(v) => updateEmbedStat('showX', v)}`), add an identical sibling labeled `Damage Mitigation` bound to `showDamageMitigation`. Copy the exact component and props shape of the neighboring entries (label prop name, layout wrappers).

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.
Run: `npx vitest run src/renderer/__tests__ --maxWorkers=2`
Expected: existing renderer tests pass (SettingsView tests, if any cover the embed group, must still pass — if one asserts the exact set of embed checkboxes, update it to include the new one and say so in your report).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/SettingsView.tsx
git commit -m "feat: settings checkbox for embed damage mitigation stat"
```

---

### Task 4: Docs, dependency range, full validation

**Files:**
- Modify: `src/shared/metrics-spec.md` (Damage Mitigation section, after the "Player Mitigation Aggregation" intro)
- Modify: `package.json` (dependency range)
- Generated: `docs/metrics-spec.md` via sync script

**Interfaces:**
- Consumes: nothing from earlier tasks (docs only).
- Produces: nothing.

- [ ] **Step 1: metrics-spec note**

In `src/shared/metrics-spec.md`, at the end of the "Damage Mitigation (Player + Minion)" section, add:

```markdown
### Discord Embed Variant

The Discord fight embed's optional "Damage Mitigation" top list runs the
same pipeline with a window of **one log** (that fight's own enemy skill
averages), player scope only. Values therefore match what the dashboard
would show for a single-fight aggregation of that log, not the multi-log
session numbers.
```

Run: `npm run sync:metrics-spec` (copies to `docs/`).

- [ ] **Step 2: Correct the dependency range**

In `package.json`, change `"@axiapps/bridge-metrics": "^0.1.0"` to `"^0.2.0"` (0.2.0 is what's installed and what the lockfile pins). Run `npm install` and confirm `git diff package-lock.json` is empty or trivially updates the range metadata only.

- [ ] **Step 3: Full validation**

```bash
npm run validate
npx vitest run --maxWorkers=2
npm run audit:boons && npm run audit:metrics && npm run audit:conditions
```
Expected: all clean/green — the no-drift backstop (nothing in renderer aggregation changed, so any audit movement means something is wrong; stop and investigate rather than re-baselining).

- [ ] **Step 4: Commit**

```bash
git add src/shared/metrics-spec.md docs/metrics-spec.md package.json package-lock.json
git commit -m "docs: embed mitigation variant note; align bridge-metrics range"
```

---

### Task 5: Live smoke check (controller)

**Files:** none — verification only, performed by the controller, not a subagent.

- [ ] **Step 1:** `npm run dev`, enable "Damage Mitigation" in Settings → embed stats, post a test embed for a fight with a configured dev webhook (or use the app's embed preview if available) and confirm the "Damage Mitigation" list renders with plausible values and disappears when toggled off.
- [ ] **Step 2:** Confirm a default-settings embed is unchanged (toggle off → field absent).
