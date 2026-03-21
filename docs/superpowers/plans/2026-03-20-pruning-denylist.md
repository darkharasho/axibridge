# Pruning Denylist Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert EI JSON pruning from allowlist to denylist so new fields survive automatically.

**Architecture:** Replace `pick(obj, ALLOWED_KEYS)` with `omit(obj, DENIED_KEYS)` at both pruning sites (main process + renderer). Reshaping operations (pruneMetaMap, damageModMap, pruneCombatReplayData, minion pruning) stay unchanged. Only `mechanics` is denied at the top level; player and target fields all pass through.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-03-20-pruning-denylist-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/main/detailsProcessing.ts:99-130` | Main-process pruner — convert to denylist |
| Modify | `src/main/__tests__/detailsProcessing.test.ts:103-188` | Main-process pruner tests — invert unknown-field assertions |
| Modify | `src/renderer/stats/utils/pruneStatsLog.ts:74-217` | Renderer pruner — convert to denylist |
| Modify | `src/renderer/__tests__/pruneStatsLog.test.ts` | Renderer pruner tests — add denylist coverage |

---

### Task 1: Main-process pruner — convert to denylist

**Files:**
- Modify: `src/main/detailsProcessing.ts:52-130`
- Modify: `src/main/__tests__/detailsProcessing.test.ts:103-188`

- [ ] **Step 1: Update tests — invert unknown-field assertions, add denylist tests**

In `src/main/__tests__/detailsProcessing.test.ts`, update the `pruneDetailsForStats` describe block:

1. Rename test "retains known top-level keys" → "passes through all fields except denied ones". Change the fixture value to `'should survive'` and assert `toBe('should survive')` (it now passes through). Add an assertion that `mechanics` IS stripped:

```typescript
it('passes through all fields except denied ones', () => {
    const details = {
        players: [],
        targets: [],
        fightName: 'Eternal Coliseum',
        durationMS: 60000,
        success: true,
        permalink: 'https://dps.report/abc',
        mechanics: [{ name: 'Stomp', data: [] }],
        __unknown__: 'should survive'
    };
    const pruned = pruneDetailsForStats(details);
    expect(pruned.fightName).toBe('Eternal Coliseum');
    expect(pruned.durationMS).toBe(60000);
    expect(pruned.success).toBe(true);
    expect(pruned.permalink).toBe('https://dps.report/abc');
    expect(pruned.__unknown__).toBe('should survive');
    expect(pruned.mechanics).toBeUndefined();
});
```

2. Rename test "prunes unknown player fields" → "passes through all player fields". Change the fixture value to `'keep me'` and assert `toBe('keep me')`:

```typescript
it('passes through all player fields', () => {
    const player = {
        name: 'Alice',
        profession: 'Guardian',
        __secret__: 'keep me',
        dpsAll: [{ dps: 10000 }]
    };
    const pruned = pruneDetailsForStats({ players: [player], targets: [] });
    const p = pruned.players[0];
    expect(p.name).toBe('Alice');
    expect(p.profession).toBe('Guardian');
    expect(p.dpsAll).toBeDefined();
    expect(p.__secret__).toBe('keep me');
});
```

3. Rename test "prunes unknown target fields" → "passes through all target fields". Change the fixture value to `'keep me'` and assert `toBe('keep me')`:

```typescript
it('passes through all target fields', () => {
    const target = {
        id: 1,
        name: 'Enemy',
        isFake: false,
        __extra__: 'keep me'
    };
    const pruned = pruneDetailsForStats({ players: [], targets: [target] });
    const t = pruned.targets[0];
    expect(t.id).toBe(1);
    expect(t.name).toBe('Enemy');
    expect(t.__extra__).toBe('keep me');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/__tests__/detailsProcessing.test.ts`
Expected: 3 test failures (the inverted assertions fail against the old allowlist code)

- [ ] **Step 3: Convert main-process pruner to denylist**

In `src/main/detailsProcessing.ts`:

1. Add `omit` helper after the existing `pick` helper:

```typescript
const omit = (obj: any, keys: string[]): any => {
    if (!obj || typeof obj !== 'object') return obj;
    const out: any = {};
    Object.keys(obj).forEach((key) => {
        if (!keys.includes(key)) {
            out[key] = obj[key];
        }
    });
    return out;
};
```

2. Replace the three allowlist constants with a single denylist:

```typescript
const TOP_LEVEL_DENY = ['mechanics'];
```

Remove `PLAYER_KEYS`, `TARGET_KEYS`, and `TOP_LEVEL_KEYS`. Retain the `pick` helper — it is still used by `pruneCombatReplayData`.

3. Rewrite `pruneDetailsForStats`:

```typescript
export const pruneDetailsForStats = (details: any): any => {
    if (!details || typeof details !== 'object') return details;
    const pruned: any = omit(details, TOP_LEVEL_DENY);
    if (Array.isArray(pruned.players)) {
        pruned.players = pruned.players.map((player: any) => ({ ...player }));
    }
    if (Array.isArray(pruned.targets)) {
        pruned.targets = pruned.targets.map((target: any) => {
            const out = { ...target };
            out.combatReplayData = pruneCombatReplayData(target?.combatReplayData);
            return out;
        });
    }
    return pruned;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/__tests__/detailsProcessing.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/detailsProcessing.ts src/main/__tests__/detailsProcessing.test.ts
git commit -m "refactor: convert main-process pruner from allowlist to denylist"
```

---

### Task 2: Renderer pruner — convert to denylist

**Files:**
- Modify: `src/renderer/stats/utils/pruneStatsLog.ts:74-217`
- Modify: `src/renderer/__tests__/pruneStatsLog.test.ts`

- [ ] **Step 1: Add denylist tests to renderer pruner test file**

In `src/renderer/__tests__/pruneStatsLog.test.ts`, add a new describe block after the existing one:

```typescript
describe('pruneDetailsForStats — denylist behavior', () => {
    it('strips denied top-level fields', () => {
        const details = {
            players: [],
            targets: [],
            mechanics: [{ name: 'Stomp', data: [] }],
            fightName: 'Test',
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.mechanics).toBeUndefined();
        expect(pruned.fightName).toBe('Test');
    });

    it('passes through unknown top-level fields', () => {
        const details = {
            players: [],
            targets: [],
            newEiField: { some: 'data' },
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.newEiField).toEqual({ some: 'data' });
    });

    it('passes through unknown player fields', () => {
        const details = {
            players: [{ name: 'Alice', futureField: 'new data', combatReplayData: null, minions: [] }],
            targets: [],
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.players[0].futureField).toBe('new data');
    });

    it('passes through unknown target fields', () => {
        const details = {
            players: [],
            targets: [{ id: 1, futureField: 'new data', combatReplayData: null }],
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.targets[0].futureField).toBe('new data');
    });

    it('does not mutate original player objects', () => {
        const player = { name: 'Alice', minions: [{ name: 'Golem', totalDamageTakenDist: [], extra: true }], combatReplayData: { start: 0, extra: true } };
        const details = { players: [player], targets: [] };
        pruneDetailsForStats(details);
        expect(player.minions[0].extra).toBe(true);
        expect(player.combatReplayData.extra).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify the new denylist tests fail**

Run: `npx vitest run src/renderer/__tests__/pruneStatsLog.test.ts`
Expected: "passes through unknown" tests fail (old allowlist strips them)

- [ ] **Step 3: Convert renderer pruner to denylist**

In `src/renderer/stats/utils/pruneStatsLog.ts`:

1. Add `omit` helper after the existing `pick` helper:

```typescript
const omit = (obj: any, keys: string[]): any => {
    if (!obj || typeof obj !== 'object') return obj;
    const out: any = {};
    Object.keys(obj).forEach((key) => {
        if (!keys.includes(key)) {
            out[key] = obj[key];
        }
    });
    return out;
};
```

2. Remove the inline top-level key array (lines 76-106) and the inline player key array (lines 130-173) and the inline target key array (lines 188-211). Retain the `pick` helper — it is still used by `pruneCombatReplayData` and minion pruning. Add a single denylist constant:

```typescript
const TOP_LEVEL_DENY = ['mechanics'];
```

3. Rewrite `pruneDetailsForStats`. The reshaping operations (pruneMetaMap, damageModMap, pruneCombatReplayData, minion pruning) stay identical — only the field selection changes from pick to omit/spread:

```typescript
export const pruneDetailsForStats = (details: any) => {
    if (!details || typeof details !== 'object') return details;
    const pruned: any = omit(details, TOP_LEVEL_DENY);
    pruned.skillMap = pruneMetaMap(pruned.skillMap, { includeClassification: false, includeStacking: false, includeAutoAttack: true, includeProcFlags: true });
    pruned.buffMap = pruneMetaMap(pruned.buffMap, { includeClassification: true, includeStacking: true });
    if (pruned.damageModMap && typeof pruned.damageModMap === 'object') {
        const prunedModMap: Record<string, any> = {};
        Object.entries(pruned.damageModMap).forEach(([key, value]) => {
            if (!value || typeof value !== 'object') return;
            const v = value as any;
            prunedModMap[key] = {
                ...(typeof v.name === 'string' ? { name: v.name } : {}),
                ...(typeof v.icon === 'string' ? { icon: v.icon } : {}),
                ...(typeof v.description === 'string' ? { description: v.description } : {}),
                ...(typeof v.incoming === 'boolean' ? { incoming: v.incoming } : {}),
            };
        });
        pruned.damageModMap = prunedModMap;
    }
    if (Array.isArray(pruned.players)) {
        const sourcePlayers = details.players as any[];
        const squadPlayers = sourcePlayers.filter((player: any) => !player?.notInSquad);
        const needsReplayDistanceFallback = squadPlayers.some((player: any) => (
            !player?.hasCommanderTag && !playerHasDirectTagDistance(player)
        ));
        pruned.players = sourcePlayers.map((player: any) => {
            const out = { ...player };
            const minions = Array.isArray(player?.minions) ? player.minions : [];
            out.minions = minions.map((minion: any) => pick(minion, ['name', 'totalDamageTakenDist']));
            const keepReplayPositions = (player?.hasCommanderTag && !player?.notInSquad)
                || (
                    needsReplayDistanceFallback
                    && !player?.notInSquad
                    && !playerHasDirectTagDistance(player)
                );
            out.combatReplayData = pruneCombatReplayData(player?.combatReplayData, keepReplayPositions);
            return out;
        });
    }
    if (Array.isArray(pruned.targets)) {
        pruned.targets = pruned.targets.map((target: any) => {
            const out = { ...target };
            out.combatReplayData = pruneCombatReplayData(target?.combatReplayData, false);
            return out;
        });
    }
    return pruned;
};
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/renderer/__tests__/pruneStatsLog.test.ts`
Expected: All tests PASS (both existing reshaping tests and new denylist tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/utils/pruneStatsLog.ts src/renderer/__tests__/pruneStatsLog.test.ts
git commit -m "refactor: convert renderer pruner from allowlist to denylist"
```

---

### Task 3: Cross-cutting validation

- [ ] **Step 1: Run full unit test suite**

Run: `npm run test:unit`
Expected: All tests PASS. No other tests should break since the pruner interfaces are unchanged (same function signatures, same output shape).

- [ ] **Step 2: Run validate (typecheck + lint)**

Run: `npm run validate`
Expected: PASS with zero warnings.

- [ ] **Step 3: Run metrics audits**

Run: `npm run audit:metrics && npm run audit:boons && npm run audit:conditions`
Expected: All PASS. The denylist keeps strictly more data than the old allowlist, so all existing metric calculations should produce identical results.

- [ ] **Step 4: Commit any fixes if needed, then final commit**

If all green, no additional commit needed. If any audit or test revealed issues, fix and commit with a descriptive message.
