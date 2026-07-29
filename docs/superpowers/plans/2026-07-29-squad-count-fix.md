# Distinct-Player Squad Count Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Squad/pug player counts everywhere in AxiBridge count distinct people (by account) instead of EI `players[]` entries, which duplicate a person on relog/build swap/subgroup move.

**Architecture:** A new `playerIdentity` module in `packages/bridge-metrics` (re-exported through `src/shared/playerIdentity.ts`, the established shim pattern) provides `getPlayerAccountKey` + `partitionSquadPlayers`. Every count site swaps to partition lengths/primaries; all stat *sums* keep iterating every entry because each entry is a real, disjoint time-slice of that player's fight. Attendance (`logsJoined`, `stackedLogCount`) dedupes per identity per log inside `computePlayerAggregation`.

**Tech Stack:** TypeScript, vitest, tsup (bridge-metrics dual ESM/CJS build), Electron main + React renderer + web report sharing the same package.

**Spec:** `docs/superpowers/specs/2026-07-29-squad-count-fix-design.md`

## Global Constraints

- Run vitest with `--maxWorkers=2` always (machine policy). The bridge-metrics package script already includes it.
- **Never** change a `reduce`/`forEach` that *sums* stats to iterate primaries — sums stay per-entry. Only counts, class-count tallies, and attendance increments change.
- `packages/bridge-metrics/dist/` is gitignored and consumed by the app via workspace resolution; after editing package `src/`, run `npm run build -w @axiapps/bridge-metrics` or the app's typecheck cannot see new subpath exports.
- Match house typing style: player arrays are `any[]` in metrics code; do not introduce strict `Player` typing in the new module.
- Out of scope (do not "fix" while there): enemy counts (anonymous, cannot dedupe), `alliesRevived` in `computeFightBreakdown` (per-entry today, left as-is), historical published reports, `buildManifestEntry.playerCount` (intentionally raw entry count).
- Commit messages use the repo's conventional style (`feat:`/`fix:` + scope) and end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `playerIdentity` module in bridge-metrics

**Files:**
- Create: `packages/bridge-metrics/src/playerIdentity.ts`
- Create: `packages/bridge-metrics/src/__tests__/playerIdentity.test.ts`
- Modify: `packages/bridge-metrics/src/index.ts` (append one export line)
- Modify: `packages/bridge-metrics/tsup.config.ts` (append one entry)
- Modify: `packages/bridge-metrics/package.json` (append one exports entry)

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 3–6):
  - `getPlayerAccountKey(player: any): string | null` — `"acct:<account>"` when account present and not `"Unknown"`, else `"name:<character name>"`, else `null`.
  - `partitionSquadPlayers(players: any): SquadPartition` where `SquadPartition = { squadPrimaries: any[]; pugPrimaries: any[] }`. One primary entry per distinct person; counts are the array lengths.

- [ ] **Step 1: Write the failing test**

Create `packages/bridge-metrics/src/__tests__/playerIdentity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getPlayerAccountKey, partitionSquadPlayers } from '../playerIdentity';

const entry = (over: any = {}) => ({
    account: 'Acct.1234', name: 'Char One', profession: 'Guardian',
    notInSquad: false, activeTimes: [1000], ...over
});

describe('getPlayerAccountKey', () => {
    it('prefers account over name', () => {
        expect(getPlayerAccountKey(entry())).toBe('acct:Acct.1234');
    });
    it('falls back to character name when account is missing or Unknown', () => {
        expect(getPlayerAccountKey(entry({ account: undefined }))).toBe('name:Char One');
        expect(getPlayerAccountKey(entry({ account: 'Unknown' }))).toBe('name:Char One');
        expect(getPlayerAccountKey(entry({ account: '   ' }))).toBe('name:Char One');
    });
    it('returns null when neither account nor name identify the entry', () => {
        expect(getPlayerAccountKey({ notInSquad: false })).toBeNull();
        expect(getPlayerAccountKey(entry({ account: undefined, name: 'Unknown' }))).toBeNull();
    });
});

describe('partitionSquadPlayers', () => {
    it('collapses duplicate squad entries to one person', () => {
        const players = [
            entry({ profession: 'Specter', activeTimes: [100] }),
            entry({ profession: 'Daredevil', activeTimes: [900] }),
            entry({ profession: 'Antiquary', activeTimes: [50] }),
            entry({ account: 'Other.5678', name: 'Char Two' })
        ];
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
        expect(squadPrimaries).toHaveLength(2);
        expect(pugPrimaries).toHaveLength(0);
    });
    it('picks the longest-active entry as the primary', () => {
        const { squadPrimaries } = partitionSquadPlayers([
            entry({ profession: 'Specter', activeTimes: [100] }),
            entry({ profession: 'Daredevil', activeTimes: [900] })
        ]);
        expect(squadPrimaries[0].profession).toBe('Daredevil');
    });
    it('breaks active-time ties to the first entry seen', () => {
        const { squadPrimaries } = partitionSquadPlayers([
            entry({ profession: 'Specter', activeTimes: [500] }),
            entry({ profession: 'Daredevil', activeTimes: [500] })
        ]);
        expect(squadPrimaries[0].profession).toBe('Specter');
    });
    it('collapses duplicate pug entries', () => {
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers([
            entry({ notInSquad: true }),
            entry({ notInSquad: true, profession: 'Druid' })
        ]);
        expect(squadPrimaries).toHaveLength(0);
        expect(pugPrimaries).toHaveLength(1);
    });
    it('counts a person seen both in and out of squad once, as squad', () => {
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers([
            entry({ notInSquad: true, activeTimes: [900] }),
            entry({ notInSquad: false, activeTimes: [100] })
        ]);
        expect(squadPrimaries).toHaveLength(1);
        expect(pugPrimaries).toHaveLength(0);
    });
    it('keeps unidentifiable entries as separate people', () => {
        const { squadPrimaries } = partitionSquadPlayers([
            { notInSquad: false }, { notInSquad: false }
        ]);
        expect(squadPrimaries).toHaveLength(2);
    });
    it('excludes fake and friendly-NPC entries', () => {
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers([
            entry({ isFake: true }),
            entry({ account: 'Npc.0001', name: 'Siege Golem', friendlyNPC: true, notInSquad: true })
        ]);
        expect(squadPrimaries).toHaveLength(0);
        expect(pugPrimaries).toHaveLength(0);
    });
    it('handles non-array input', () => {
        expect(partitionSquadPlayers(undefined).squadPrimaries).toHaveLength(0);
        expect(partitionSquadPlayers(null).pugPrimaries).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @axiapps/bridge-metrics -- playerIdentity`
Expected: FAIL — cannot resolve `../playerIdentity`.

- [ ] **Step 3: Write the implementation**

Create `packages/bridge-metrics/src/playerIdentity.ts`:

```ts
/**
 * Distinct-player identity helpers.
 *
 * arcdps emits a new agent (and EI a new `players[]` entry) when the same
 * person relogs, swaps build/character, changes subgroup, or re-enters
 * tracking range, so entry counts overstate how many people fought. These
 * helpers collapse entries to distinct people for COUNT displays only —
 * stat sums must keep iterating every entry, because each entry is a real,
 * disjoint time-slice of that player's fight.
 */

export interface SquadPartition {
    /** One primary entry (longest activeTimes[0]) per distinct squad member. */
    squadPrimaries: any[];
    /** One primary entry per distinct ally never seen in the squad. */
    pugPrimaries: any[];
}

/**
 * Stable identity key for a player entry: account when known, else character
 * name, else null (the entry cannot be matched to any other entry).
 */
export const getPlayerAccountKey = (player: any): string | null => {
    const account = typeof player?.account === 'string' ? player.account.trim() : '';
    if (account && account !== 'Unknown') return `acct:${account}`;
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    if (name && name !== 'Unknown') return `name:${name}`;
    return null;
};

const getActiveTime = (player: any): number => {
    const active = Array.isArray(player?.activeTimes) ? player.activeTimes[0] : null;
    return typeof active === 'number' && Number.isFinite(active) ? active : 0;
};

/**
 * Collapse EI player entries to distinct people. Membership is
 * union-over-the-log: any in-squad entry makes the person a squad member.
 * Fake and friendly-NPC entries never count.
 */
export const partitionSquadPlayers = (players: any): SquadPartition => {
    const list: any[] = Array.isArray(players) ? players : [];
    type Bucket = { primary: any; primaryActive: number; inSquad: boolean };
    const byKey = new Map<string, Bucket>();
    const keyless: Bucket[] = [];
    list.forEach((p) => {
        if (!p || p.isFake || p.friendlyNPC) return;
        const bucket: Bucket = { primary: p, primaryActive: getActiveTime(p), inSquad: !p.notInSquad };
        const key = getPlayerAccountKey(p);
        if (key === null) {
            keyless.push(bucket);
            return;
        }
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, bucket);
            return;
        }
        existing.inSquad = existing.inSquad || bucket.inSquad;
        if (bucket.primaryActive > existing.primaryActive) {
            existing.primary = bucket.primary;
            existing.primaryActive = bucket.primaryActive;
        }
    });
    const squadPrimaries: any[] = [];
    const pugPrimaries: any[] = [];
    [...byKey.values(), ...keyless].forEach((bucket) => {
        (bucket.inSquad ? squadPrimaries : pugPrimaries).push(bucket.primary);
    });
    return { squadPrimaries, pugPrimaries };
};
```

- [ ] **Step 4: Wire the module into the package**

In `packages/bridge-metrics/src/index.ts`, append:

```ts
export * from './playerIdentity';
```

In `packages/bridge-metrics/tsup.config.ts`, append to the `entry` object (after the last existing entry):

```ts
        playerIdentity: 'src/playerIdentity.ts',
```

In `packages/bridge-metrics/package.json`, append to the `exports` map after the `"./constants"` line:

```json
        "./playerIdentity": { "types": "./dist/playerIdentity.d.ts", "import": "./dist/playerIdentity.js", "require": "./dist/playerIdentity.cjs" }
```

(`typesVersions` is a wildcard `dist/*.d.ts` — no change needed.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @axiapps/bridge-metrics -- playerIdentity`
Expected: PASS (all tests).

- [ ] **Step 6: Build the package so the app can resolve the new subpath**

Run: `npm run build -w @axiapps/bridge-metrics`
Expected: tsup emits `dist/playerIdentity.{js,cjs,d.ts,d.cts}` without errors.

- [ ] **Step 7: Commit**

```bash
git add packages/bridge-metrics/src/playerIdentity.ts packages/bridge-metrics/src/__tests__/playerIdentity.test.ts packages/bridge-metrics/src/index.ts packages/bridge-metrics/tsup.config.ts packages/bridge-metrics/package.json
git commit -m "feat(metrics): add playerIdentity distinct-player helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Attendance dedup in `computePlayerAggregation`

**Files:**
- Modify: `packages/bridge-metrics/src/computePlayerAggregation.ts` (inside `ingestLogPlayerData`, around lines 644–690)
- Test: `packages/bridge-metrics/src/__tests__/computePlayerAggregation.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing from Task 1 (uses the existing internal `getPlayerIdentity(...).key` so split-by-class mode keeps per-build rows).
- Produces: `playerStats` rows where `logsJoined` and `stackedLogCount` increment at most once per identity key per log. All other accumulators unchanged.

- [ ] **Step 1: Write the failing test**

Append to `packages/bridge-metrics/src/__tests__/computePlayerAggregation.test.ts`:

```ts
describe('duplicate player entries (same account)', () => {
    const dupPlayer = (profession: string, activeMs: number, over: any = {}) => ({
        account: 'Dup.1234', name: 'Char A', profession, notInSquad: false,
        activeTimes: [activeMs],
        dpsAll: [{ damage: 1000 }],
        defenses: [{ downCount: 0, deadCount: 0, damageTaken: 100, dodgeCount: 0 }],
        statsAll: [{ distToCom: 100, saved: 0 }],
        statsTargets: [[{ downed: 0, killed: 0 }]],
        support: [{}],
        rotation: [],
        ...over
    });
    const dupLog = {
        details: {
            durationMS: 60000,
            success: true,
            players: [
                dupPlayer('Guardian', 45000, { defenses: [{ downCount: 1, deadCount: 1, damageTaken: 100, dodgeCount: 0 }] }),
                dupPlayer('Necromancer', 15000)
            ],
            targets: [],
            skillMap: {},
            buffMap: {}
        }
    };

    it('credits one logsJoined and one stackedLogCount per person per log', () => {
        const result = computePlayerAggregation({
            validLogs: [dupLog], method: 'count', skillDamageSource: 'target', splitPlayersByClass: false
        });
        const row = result.playerStats.get('Dup.1234');
        expect(row).toBeTruthy();
        expect(row!.logsJoined).toBe(1);
        expect(row!.stackedLogCount).toBe(1);
        // stat sums still cover every entry (disjoint time-slices)
        expect(row!.deaths).toBe(1);
        expect(row!.downs).toBe(1);
    });

    it('keeps per-build rows counting their own participation when split by class', () => {
        const result = computePlayerAggregation({
            validLogs: [dupLog], method: 'count', skillDamageSource: 'target', splitPlayersByClass: true
        });
        expect(result.playerStats.get('Dup.1234::Guardian')!.logsJoined).toBe(1);
        expect(result.playerStats.get('Dup.1234::Necromancer')!.logsJoined).toBe(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @axiapps/bridge-metrics -- computePlayerAggregation`
Expected: FAIL — `logsJoined` is `2` (one per entry) in the first test; second test passes already (two distinct keys). If the first test fails for a different reason (e.g. a metric getter throwing on the synthetic shape), fix the synthetic player shape, not the production code.

- [ ] **Step 3: Implement the per-log dedup**

In `packages/bridge-metrics/src/computePlayerAggregation.ts`, directly above the `players.forEach((p, playerIndex) => {` line (~646), insert:

```ts
    // One increment per person per log: duplicate entries for the same
    // identity (relog / build swap / subgroup move) must not inflate attendance.
    const joinedIdentityKeys = new Set<string>();
    const stackedIdentityKeys = new Set<string>();
```

Replace (line ~672):

```ts
        s.logsJoined++;
```

with:

```ts
        if (!joinedIdentityKeys.has(key)) {
            joinedIdentityKeys.add(key);
            s.logsJoined++;
        }
```

Replace (lines ~687–689):

```ts
        if (dist <= 600) {
            s.stackedLogCount++;
        }
```

with:

```ts
        if (dist <= 600 && !stackedIdentityKeys.has(key)) {
            stackedIdentityKeys.add(key);
            s.stackedLogCount++;
        }
```

Do not touch `totalDist`/`distCount` or any other accumulator in that loop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @axiapps/bridge-metrics`
Expected: PASS, including the pre-existing fixture-based tests (their assertions are lower bounds / unique-account fixtures).

- [ ] **Step 5: Rebuild and commit**

```bash
npm run build -w @axiapps/bridge-metrics
git add packages/bridge-metrics/src/computePlayerAggregation.ts packages/bridge-metrics/src/__tests__/computePlayerAggregation.test.ts
git commit -m "fix(metrics): count attendance once per person per log

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Shared re-export + `detailsProcessing` counts

**Files:**
- Create: `src/shared/playerIdentity.ts`
- Modify: `src/main/detailsProcessing.ts:205-232` (`buildDashboardSummaryFromDetails`) and `:258-276` (`buildManifestEntry`)
- Test: `src/main/__tests__/detailsProcessing.test.ts` (append cases)

**Interfaces:**
- Consumes: `partitionSquadPlayers` from Task 1 via the new shim.
- Produces: `src/shared/playerIdentity.ts` — the import path all app-side files (Tasks 4–6) use: `import { partitionSquadPlayers } from '<relative>/shared/playerIdentity';`

- [ ] **Step 1: Create the shim**

Create `src/shared/playerIdentity.ts` (mirrors `src/shared/professionUtils.ts`):

```ts
export * from '@axiapps/bridge-metrics/playerIdentity';
```

- [ ] **Step 2: Write the failing tests**

Append to `src/main/__tests__/detailsProcessing.test.ts`, inside the existing `buildDashboardSummaryFromDetails` and `buildManifestEntry` describe blocks (both functions are already imported there — no new imports needed):

```ts
    it('counts duplicate squad entries for one account as one person', () => {
        const summary = buildDashboardSummaryFromDetails({
            players: [
                { account: 'Dup.1234', name: 'Char A', profession: 'Specter', notInSquad: false, activeTimes: [45000], defenses: [{ downCount: 1, deadCount: 1 }] },
                { account: 'Dup.1234', name: 'Char A', profession: 'Daredevil', notInSquad: false, activeTimes: [15000], defenses: [{ downCount: 0, deadCount: 1 }] },
                { account: 'Solo.5678', name: 'Char B', profession: 'Guardian', notInSquad: false, activeTimes: [60000], defenses: [{ downCount: 0, deadCount: 0 }] }
            ],
            targets: []
        });
        expect(summary.squadCount).toBe(2);
        // deaths keep summing every entry — each is a real time-slice
        expect(summary.squadDeaths).toBe(2);
    });

    it('reports 43 (+4) for a Log-21-shaped roster (43 people across 51 squad entries)', () => {
        const players: any[] = [];
        for (let i = 0; i < 40; i++) {
            players.push({ account: `Member.${1000 + i}`, name: `Squaddie ${i}`, profession: 'Guardian', notInSquad: false, activeTimes: [60000], defenses: [{ downCount: 0, deadCount: 0 }] });
        }
        for (let i = 0; i < 5; i++) {
            players.push({ account: 'Dash.8715', name: 'Celeana S', profession: 'Thief', notInSquad: false, activeTimes: [5000 + i], defenses: [{ downCount: 0, deadCount: 0 }] });
        }
        for (let i = 0; i < 3; i++) {
            players.push({ account: 'Tangella.4031', name: 'Tanggella', profession: 'Ranger', notInSquad: false, activeTimes: [10000 + i], defenses: [{ downCount: 0, deadCount: 0 }] });
        }
        for (let i = 0; i < 3; i++) {
            players.push({ account: 'Ayumi Anime.1426', name: 'Bàe Suzy', profession: 'Ranger', notInSquad: false, activeTimes: [12000 + i], defenses: [{ downCount: 0, deadCount: 0 }] });
        }
        for (let i = 0; i < 4; i++) {
            players.push({ account: `Pug.${2000 + i}`, name: `Pug ${i}`, profession: 'Necromancer', notInSquad: true, activeTimes: [60000], defenses: [{ downCount: 0, deadCount: 0 }] });
        }
        const summary = buildDashboardSummaryFromDetails({ players, targets: [] });
        expect(summary.squadCount).toBe(43);
    });

    it('dedupes manifest squad/non-squad counts but keeps raw playerCount', () => {
        const entry = buildManifestEntry({
            players: [
                { account: 'Dup.1234', name: 'Char A', notInSquad: false },
                { account: 'Dup.1234', name: 'Char A', notInSquad: false },
                { account: 'Pug.9999', name: 'Char C', notInSquad: true }
            ]
        }, '/tmp/log.zevtc', 0);
        expect(entry.playerCount).toBe(3);
        expect(entry.squadCount).toBe(1);
        expect(entry.nonSquadCount).toBe(1);
    });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/detailsProcessing.test.ts --maxWorkers=2`
Expected: the three new tests FAIL (`squadCount` 3 instead of 2; 51 instead of 43; manifest `squadCount` 2 instead of 1). Existing tests PASS.

- [ ] **Step 4: Implement**

In `src/main/detailsProcessing.ts` add to the imports at the top:

```ts
import { partitionSquadPlayers } from '../shared/playerIdentity';
```

In `buildDashboardSummaryFromDetails`, replace:

```ts
    let squadCount = 0;
```

with:

```ts
    const squadCount = partitionSquadPlayers(players).squadPrimaries.length;
```

and delete the `squadCount += 1;` line inside the `players.forEach` (the loop and its `if (player?.notInSquad) return;` guard stay — it still sums downs/deaths/statsTargets per entry).

In `buildManifestEntry`, replace:

```ts
    const squadCount = players.filter((p) => !p?.notInSquad).length;
    const nonSquadCount = players.filter((p) => p?.notInSquad).length;
```

with:

```ts
    const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
    const squadCount = squadPrimaries.length;
    const nonSquadCount = pugPrimaries.length;
```

(`playerCount: players.length` in the return stays raw.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/detailsProcessing.test.ts --maxWorkers=2`
Expected: PASS (all, including pre-existing).

- [ ] **Step 6: Commit**

```bash
git add src/shared/playerIdentity.ts src/main/detailsProcessing.ts src/main/__tests__/detailsProcessing.test.ts
git commit -m "fix(main): distinct-player counts in dashboard summary and manifest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Discord embed counts

**Files:**
- Modify: `src/main/discord.ts` (imports ~line 28; count sites at ~368, ~408–411, ~427–437, ~491–497)

No unit tests exist for `DiscordNotifier` (embed assembly lives inside the network-coupled `sendLog`); the counting logic itself is covered by Task 1's tests. Verification here is the typecheck.

**Interfaces:**
- Consumes: `partitionSquadPlayers` from `../shared/playerIdentity`.
- Produces: embed shows distinct counts, e.g. `43 (+4)` for the reported fight instead of `51 (+4)`.

- [ ] **Step 1: Add the import**

Next to the existing `../shared/professionUtils` import in `src/main/discord.ts`:

```ts
import { partitionSquadPlayers } from '../shared/playerIdentity';
```

- [ ] **Step 2: Partition once, before the class-count objects**

Directly above `const squadClassCounts: { [key: string]: number } = {};` (~line 368), insert:

```ts
                    const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
```

- [ ] **Step 3: Move squad class counting from the per-entry loop to primaries**

Delete from inside the big `players.forEach` (~lines 408–411):

```ts
                        if (isSquad) {
                            const prof = p.profession || 'Unknown';
                            squadClassCounts[prof] = (squadClassCounts[prof] || 0) + 1;
                        }
```

and directly after that forEach's closing `});` (~line 412), insert:

```ts
                    squadPrimaries.forEach((p: any) => {
                        const prof = p.profession || 'Unknown';
                        squadClassCounts[prof] = (squadClassCounts[prof] || 0) + 1;
                    });
```

- [ ] **Step 4: Swap the pug-based enemy fallbacks**

Replace (~lines 427–429):

```ts
                    if (enemyCount === 0) {
                        enemyCount = players.filter((p: any) => p.notInSquad).length;
                    }
```

with:

```ts
                    if (enemyCount === 0) {
                        enemyCount = pugPrimaries.length;
                    }
```

Replace (~line 432):

```ts
                    const enemyPlayers = players.filter((p: any) => p.notInSquad);
```

with:

```ts
                    const enemyPlayers = pugPrimaries;
```

- [ ] **Step 5: Swap the Squad Summary count line**

Delete (~lines 491–492):

```ts
                    const squadPlayers = players.filter((p: any) => !p.notInSquad);
                    const nonSquadPlayers = players.filter((p: any) => p.notInSquad);
```

and change the count line (~497) from:

```ts
                            formatStatLine('Count:', nonSquadPlayers.length > 0 ? `${squadPlayers.length} (+${nonSquadPlayers.length})` : squadPlayers.length),
```

to:

```ts
                            formatStatLine('Count:', pugPrimaries.length > 0 ? `${squadPrimaries.length} (+${pugPrimaries.length})` : squadPrimaries.length),
```

(`squadPlayers`/`nonSquadPlayers` have no other uses in this file — verify with a grep before deleting; if another use appears, keep the variables and only swap the count line.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean for both `tsc` configs.

- [ ] **Step 7: Commit**

```bash
git add src/main/discord.ts
git commit -m "fix(discord): distinct-player squad and pug counts in embeds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Desktop log card counts

**Files:**
- Modify: `src/renderer/ExpandableLogCard.tsx` (~lines 44–49, 106–107, 393–395, 408–414)

No dedicated card test exists; counting logic is covered by Task 1. Verification is the typecheck.

**Interfaces:**
- Consumes: `partitionSquadPlayers` from `../shared/playerIdentity`.
- Produces: card `Count:` line and class bars show distinct people.

- [ ] **Step 1: Add the import**

Next to the existing `../shared/professionUtils` import:

```ts
import { partitionSquadPlayers } from '../shared/playerIdentity';
```

- [ ] **Step 2: Replace the entry-count loop**

Replace (~lines 44–49):

```ts
    let squadPlayerCount = 0;
    let nonSquadPlayerCount = 0;
    allPlayers.forEach((player: any) => {
        if (player?.notInSquad) nonSquadPlayerCount += 1;
        else squadPlayerCount += 1;
    });
```

with:

```ts
    const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(allPlayers);
```

- [ ] **Step 3: Simplify the display counts**

Replace (~lines 106–107):

```ts
    const squadDisplayCount = shouldComputeDetails ? squadPlayers.length : squadPlayerCount;
    const nonSquadDisplayCount = shouldComputeDetails ? nonSquadPlayers.length : nonSquadPlayerCount;
```

with:

```ts
    const squadDisplayCount = squadPrimaries.length;
    const nonSquadDisplayCount = pugPrimaries.length;
```

(The partition is over `allPlayers`, which is what `players` aliases when expanded, so the value is identical in both card states.)

- [ ] **Step 4: Swap the enemy fallback and class counts**

Replace (~lines 393–395):

```ts
        if (enemyCount === 0) {
            enemyCount = nonSquadPlayers.length;
        }
```

with:

```ts
        if (enemyCount === 0) {
            enemyCount = pugPrimaries.length;
        }
```

Replace (~line 408):

```ts
        squadClassCounts = buildClassCounts(squadPlayers);
```

with:

```ts
        squadClassCounts = buildClassCounts(squadPrimaries);
```

In the `enemyClassCounts` IIFE (~lines 410–414), replace:

```ts
            nonSquadPlayers.forEach((p: any) => {
```

with:

```ts
            pugPrimaries.forEach((p: any) => {
```

Leave `squadPlayers`/`nonSquadPlayers` (lines 54–55) and every `reduce`/`forEach` that sums stats untouched.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean. (If `squadPlayerCount`/`nonSquadPlayerCount` are referenced anywhere else in the file, the typecheck will flag it — swap those references to `squadPrimaries.length`/`pugPrimaries.length`.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/ExpandableLogCard.tsx
git commit -m "fix(renderer): distinct-player counts in log card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Stats pipeline counts (timeline, breakdown, averages) + end-to-end test

**Files:**
- Modify: `src/renderer/stats/incrementalAggregation.ts` (~lines 610–621)
- Modify: `src/renderer/stats/computeTimelineAndMapData.ts` (~lines 122–128)
- Modify: `src/renderer/stats/computeFightBreakdown.ts` (~lines 44–45, 75–76, 117, 121)
- Create: `src/renderer/__tests__/computeStatsAggregation.duplicatePlayers.test.ts`

**Interfaces:**
- Consumes: `partitionSquadPlayers` from `../../shared/playerIdentity`.
- Produces: `stats.timelineData[i].squadCount/friendlyCount`, `stats.avgSquadSize`, `stats.fightBreakdown[i].squadCount/allyCount/squadClassCountsFight/allyClassCountsFight`, and commander `avgSquadSize` (its own count in `ingestLogCommanderStats` — corrected in follow-up Task 6b; the original "fed by the per-fight squadCount" claim was wrong) all reflect distinct people.

- [ ] **Step 1: Write the failing end-to-end test**

Create `src/renderer/__tests__/computeStatsAggregation.duplicatePlayers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeStatsSync as computeStatsAggregation } from '../stats/incrementalAggregation';

const squadEntry = (account: string, name: string, profession: string, over: any = {}) => ({
    account, name, profession, notInSquad: false,
    activeTimes: [60000],
    dpsAll: [{ damage: 1000 }],
    defenses: [{ downCount: 0, deadCount: 0, damageTaken: 500, dodgeCount: 0 }],
    statsAll: [{ distToCom: 100, saved: 0 }],
    statsTargets: [[{ downed: 0, killed: 0, damage: 1000, connectedHits: 3 }]],
    support: [{}],
    rotation: [],
    ...over
});

// Mirrors the reported fight (report 20260727-200833-g1o0, Log 21):
// 43 distinct squad accounts across 51 entries, plus 4 pugs.
const buildLog21Roster = () => {
    const players: any[] = [];
    for (let i = 0; i < 40; i++) {
        players.push(squadEntry(`Member.${1000 + i}`, `Squaddie ${i}`, 'Guardian'));
    }
    // Dash.8715: 5 entries (relog + build swaps)
    players.push(squadEntry('Dash.8715', 'Celeana S', 'Thief', { activeTimes: [30000] }));
    for (let i = 0; i < 4; i++) {
        players.push(squadEntry('Dash.8715', 'Celeana S', 'Thief', { activeTimes: [5000 + i] }));
    }
    // Tangella.4031: 3 entries (subgroup move)
    for (let i = 0; i < 3; i++) {
        players.push(squadEntry('Tangella.4031', 'Tanggella', 'Ranger', { activeTimes: [10000 + i] }));
    }
    // Ayumi Anime.1426: 3 entries (build swaps)
    for (let i = 0; i < 3; i++) {
        players.push(squadEntry('Ayumi Anime.1426', 'Bàe Suzy', 'Ranger', { activeTimes: [12000 + i] }));
    }
    for (let i = 0; i < 4; i++) {
        players.push(squadEntry(`Pug.${2000 + i}`, `Pug ${i}`, 'Necromancer', { notInSquad: true }));
    }
    return players;
};

describe('computeStatsAggregation (duplicate player entries)', () => {
    const logs = [{
        status: 'success',
        filePath: 'dup-log-21',
        uploadTime: 1700000000000,
        details: {
            uploadTime: 1700000000000,
            durationMS: 411000,
            success: false,
            players: buildLog21Roster(),
            targets: [{ profession: 'Necromancer', isFake: false }],
            skillMap: {},
            buffMap: {}
        }
    }];

    it('counts 43 (+4) distinct people, matching the real squad', () => {
        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        expect(stats.timelineData).toHaveLength(1);
        expect(stats.timelineData[0].squadCount).toBe(43);
        expect(stats.timelineData[0].friendlyCount).toBe(47);
        expect(stats.avgSquadSize).toBe(43);
        expect(stats.fightBreakdown[0].squadCount).toBe(43);
        expect(stats.fightBreakdown[0].allyCount).toBe(4);
    });

    it('counts each person once in per-fight class counts, by primary build', () => {
        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        const squadClasses = stats.fightBreakdown[0].squadClassCountsFight;
        expect(squadClasses.Guardian).toBe(40);
        expect(squadClasses.Thief).toBe(1);
        expect(squadClasses.Ranger).toBe(2);
        const allyClasses = stats.fightBreakdown[0].allyClassCountsFight;
        expect(allyClasses.Necromancer).toBe(4);
    });

    it('credits participation once per person per log', () => {
        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        const participation = stats.leaderboards?.participation || [];
        const dupRow = participation.find((row: any) => row.account === 'Dash.8715');
        expect(dupRow?.value).toBe(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation.duplicatePlayers.test.ts --maxWorkers=2`
Expected: first two tests FAIL (squadCount 51, friendlyCount 55, class counts inflated); the participation test PASSES already (Task 2 fixed it).

- [ ] **Step 3: Implement — `incrementalAggregation.ts`**

Add to the imports:

```ts
import { partitionSquadPlayers } from '../../shared/playerIdentity';
```

In the per-log timeline block (~lines 610–621), replace:

```ts
        const squadPlayers = players.filter((p: any) => !p.notInSquad);
```

with:

```ts
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
```

and replace:

```ts
        const squadCount = squadPlayers.length > 0 ? squadPlayers.length : summarySquadCount;
```

with:

```ts
        const squadCount = squadPrimaries.length > 0 ? squadPrimaries.length : summarySquadCount;
```

and replace:

```ts
        const friendlyCount = players.length > 0 ? players.length : squadCount;
```

with:

```ts
        const friendlyCount = players.length > 0 ? squadPrimaries.length + pugPrimaries.length : squadCount;
```

Do NOT touch the other `filter((p: any) => !p.notInSquad)` sites in this file (~lines 349, 1510, 1544) — those feed stat sums and series.

- [ ] **Step 4: Implement — `computeTimelineAndMapData.ts`**

Add to the imports:

```ts
import { partitionSquadPlayers } from '../../shared/playerIdentity';
```

In the `timelineData` mapping (~lines 122–128), apply the identical three replacements as Step 3 (`squadPlayers` filter → partition; `squadCount` from `squadPrimaries.length`; `friendlyCount` from `squadPrimaries.length + pugPrimaries.length`).

- [ ] **Step 5: Implement — `computeFightBreakdown.ts`**

Add to the imports:

```ts
import { partitionSquadPlayers } from '../../shared/playerIdentity';
```

In `ingestLogFightBreakdown`, directly after the `allies` line:

```ts
    const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
```

Replace the class-count lines:

```ts
    const squadClassCountsFight = countProfessions(squadPlayers, (p) => p?.profession || p?.name);
    const allyClassCountsFight = countProfessions(allies, (p) => p?.profession || p?.name);
```

with:

```ts
    const squadClassCountsFight = countProfessions(squadPrimaries, (p) => p?.profession || p?.name);
    const allyClassCountsFight = countProfessions(pugPrimaries, (p) => p?.profession || p?.name);
```

In the returned object, replace:

```ts
        squadCount: squadPlayers.length > 0 ? squadPlayers.length : Math.max(0, Number(summary?.squadCount || 0)),
        allyCount: allies.length,
```

with:

```ts
        squadCount: squadPrimaries.length > 0 ? squadPrimaries.length : Math.max(0, Number(summary?.squadCount || 0)),
        allyCount: pugPrimaries.length,
```

Leave `squadPlayers`/`allies` and every `reduce` over them untouched (sums), including `alliesRevived` (documented out of scope).

- [ ] **Step 6: Run the new test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation.duplicatePlayers.test.ts --maxWorkers=2`
Expected: PASS (all three).

- [ ] **Step 7: Run the full renderer/main suite**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS. Existing tests use unique-account synthetic players and fixtures, so dedup is a no-op for them. If one fails, first confirm its fixture genuinely contains duplicate account entries (same `account` twice in one log's `players`); only then update that numeric expectation to the deduped value — otherwise treat it as a regression in your change.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/incrementalAggregation.ts src/renderer/stats/computeTimelineAndMapData.ts src/renderer/stats/computeFightBreakdown.ts src/renderer/__tests__/computeStatsAggregation.duplicatePlayers.test.ts
git commit -m "fix(stats): distinct-player counts in timeline, breakdown, and averages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full validation gate

**Files:** none (verification only).

- [ ] **Step 1: Rebuild the package and validate types/lint**

```bash
npm run build -w @axiapps/bridge-metrics
npm run validate
```

Expected: typecheck (both configs) and ESLint clean.

- [ ] **Step 2: Run both test suites**

```bash
npm test -w @axiapps/bridge-metrics
npx vitest run --maxWorkers=2
```

Expected: PASS.

- [ ] **Step 3: Confirm clean tree**

Run: `git status`
Expected: nothing to commit (all work landed in Tasks 1–6). If anything is dirty, it's an unplanned change — review it before deciding to commit or revert.
