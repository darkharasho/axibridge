# Player Breakdown: Min Hit, Avg Hit, Max Hit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Min Hit, Avg Hit, and Max Hit metric rows to the Player Breakdown detail pane.

**Architecture:** Extend the existing `PlayerSkillDamageEntry` type with `hits`, `min`, `max` fields. Capture these from the EI JSON `TotalDamageDist` entries during aggregation. Render three new rows in the detail pane. Avg is derived at render time as `damage / hits`.

**Tech Stack:** TypeScript, React, Vitest

---

### Task 1: Add `min` field to `TotalDamageDist` type

**Files:**
- Modify: `src/shared/dpsReportTypes.ts:160-174`

- [ ] **Step 1: Add `min` to the interface**

In `src/shared/dpsReportTypes.ts`, add `min: number;` to `TotalDamageDist` after the `blocked` field:

```typescript
export interface TotalDamageDist {
    id: number;
    hits: number;
    connectedHits: number;
    flank: number;
    crit: number;
    glance: number;
    totalDamage: number;
    missed: number;
    interrupted: number;
    evaded: number;
    blocked: number;
    min: number;
    max: number;
    downContribution?: number;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (the field exists in EI JSON but was just untyped; no existing code references `TotalDamageDist.min` for outgoing damage)

- [ ] **Step 3: Commit**

```bash
git add src/shared/dpsReportTypes.ts
git commit -m "feat: add min field to TotalDamageDist type"
```

---

### Task 2: Extend `PlayerSkillDamageEntry` with hits, min, max

**Files:**
- Modify: `src/renderer/stats/statsTypes.ts:40-46`

- [ ] **Step 1: Add fields to the interface**

In `src/renderer/stats/statsTypes.ts`, add `hits`, `min`, and `max` to `PlayerSkillDamageEntry`:

```typescript
export interface PlayerSkillDamageEntry {
    id: string;
    name: string;
    icon?: string;
    damage: number;
    downContribution: number;
    hits: number;
    min: number;
    max: number;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: FAIL — `computePlayerAggregation.ts` creates `PlayerSkillDamageEntry` objects without the new required fields. This is expected and will be fixed in Task 3.

---

### Task 3: Write test for min/avg/max aggregation

**Files:**
- Modify: `src/renderer/__tests__/computeStatsAggregation.skillDamage.test.ts`

- [ ] **Step 1: Add test for min, max, and hits aggregation**

Append this test to the existing `describe` block in `src/renderer/__tests__/computeStatsAggregation.skillDamage.test.ts`:

```typescript
    it('captures hits, min, and max per skill in player breakdown', () => {
        const fireballId = 5491;
        const playerKey = 'TestPlayer.1234';
        const log = {
            status: 'success',
            filePath: 'skill-min-max-test',
            details: {
                durationMS: 10000,
                skillMap: {
                    [`s${fireballId}`]: { name: 'Fireball', icon: 'https://example.invalid/fireball.png' }
                },
                buffMap: {},
                players: [
                    {
                        account: 'TestPlayer.1234',
                        profession: 'Weaver',
                        notInSquad: false,
                        dpsAll: [{ damage: 5000, dps: 500 }],
                        statsAll: [{ connectedDamageCount: 5 }],
                        support: [{ resurrects: 0 }],
                        damage1S: [[0, 1000, 2000, 3000, 4000, 5000]],
                        targetDamage1S: [[[0, 1000, 2000, 3000, 4000, 5000]]],
                        targetDamageDist: [[[
                            { id: fireballId, totalDamage: 5000, connectedHits: 5, hits: 5, min: 675, max: 1400, downContribution: 2000 }
                        ]]],
                        totalDamageDist: [[
                            { id: fireballId, totalDamage: 5000, connectedHits: 5, hits: 5, min: 675, max: 1400, downContribution: 2000 }
                        ]]
                    }
                ],
                targets: []
            }
        };

        const { stats } = computeStatsAggregation({ logs: [log as any] });
        const playerBreakdown = (stats.playerSkillBreakdowns || []).find((entry: any) => entry.key === playerKey);
        expect(playerBreakdown).toBeTruthy();
        const skill = (playerBreakdown.skills || []).find((s: any) => s.name === 'Fireball');
        expect(skill).toBeTruthy();
        expect(skill.hits).toBe(5);
        expect(skill.min).toBe(675);
        expect(skill.max).toBe(1400);
        // Avg = damage / hits = 5000 / 5 = 1000
        expect(skill.damage / skill.hits).toBe(1000);
    });

    it('aggregates min/max across multiple logs correctly', () => {
        const slashId = 1001;
        const playerKey = 'MultiLog.5678';
        const makeLog = (damage: number, hits: number, min: number, max: number) => ({
            status: 'success',
            filePath: `multi-log-min-max-${min}-${max}`,
            details: {
                durationMS: 5000,
                skillMap: { [`s${slashId}`]: { name: 'Slash' } },
                buffMap: {},
                players: [
                    {
                        account: 'MultiLog.5678',
                        profession: 'Warrior',
                        notInSquad: false,
                        dpsAll: [{ damage, dps: damage / 5 }],
                        statsAll: [{ connectedDamageCount: hits }],
                        support: [{ resurrects: 0 }],
                        damage1S: [[0, 100, 200, 300, 400, 500]],
                        targetDamage1S: [[[0, 100, 200, 300, 400, 500]]],
                        targetDamageDist: [[[
                            { id: slashId, totalDamage: damage, connectedHits: hits, hits, min, max }
                        ]]],
                        totalDamageDist: [[
                            { id: slashId, totalDamage: damage, connectedHits: hits, hits, min, max }
                        ]]
                    }
                ],
                targets: []
            }
        });

        const log1 = makeLog(3000, 3, 800, 1200);
        const log2 = makeLog(4000, 4, 600, 1500);

        const { stats } = computeStatsAggregation({ logs: [log1 as any, log2 as any] });
        const playerBreakdown = (stats.playerSkillBreakdowns || []).find((entry: any) => entry.key === playerKey);
        expect(playerBreakdown).toBeTruthy();
        const skill = (playerBreakdown.skills || []).find((s: any) => s.name === 'Slash');
        expect(skill).toBeTruthy();
        // hits summed: 3 + 4 = 7
        expect(skill.hits).toBe(7);
        // min is global minimum: min(800, 600) = 600
        expect(skill.min).toBe(600);
        // max is global maximum: max(1200, 1500) = 1500
        expect(skill.max).toBe(1500);
        // Avg = total damage / total hits = 7000 / 7 = 1000
        expect(skill.damage / skill.hits).toBe(1000);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation.skillDamage.test.ts`
Expected: FAIL — the new fields (`hits`, `min`, `max`) are not yet populated in the aggregation logic.

---

### Task 4: Implement aggregation of hits, min, max

**Files:**
- Modify: `src/renderer/stats/computePlayerAggregation.ts:1004-1017`

- [ ] **Step 1: Update `pushPlayerSkillEntry` to capture hits, min, max**

In `src/renderer/stats/computePlayerAggregation.ts`, replace the `pushPlayerSkillEntry` function (lines 1004-1017) with:

```typescript
            const pushPlayerSkillEntry = (entry: any) => {
                if (!entry?.id) return;
                const { name, icon } = resolveSkillMeta(entry);
                const skillId = `s${entry.id}`;
                let skillEntry = playerBreakdown!.skills.get(skillId);
                if (!skillEntry) {
                    skillEntry = { id: skillId, name, icon, damage: 0, downContribution: 0, hits: 0, min: Infinity, max: 0 };
                    playerBreakdown!.skills.set(skillId, skillEntry);
                }
                if (skillEntry.name.startsWith('Skill ') && !name.startsWith('Skill ')) skillEntry.name = name;
                if (!skillEntry.icon && icon) skillEntry.icon = icon;
                skillEntry.damage += Number(entry.totalDamage || 0);
                skillEntry.downContribution += Number(entry.downContribution || 0);
                skillEntry.hits += Number(entry.hits || 0);
                const entryMin = Number(entry.min);
                if (Number.isFinite(entryMin) && entryMin > 0) {
                    skillEntry.min = Math.min(skillEntry.min, entryMin);
                }
                skillEntry.max = Math.max(skillEntry.max, Number(entry.max || 0));
            };
```

- [ ] **Step 2: Normalize `min` from `Infinity` to `0` after aggregation**

In `src/renderer/stats/computeSpecialTables.ts`, inside the `.map()` on `playerSkillBreakdownMap` (around line 108), add normalization after converting skills from the Map:

Find:
```typescript
            const skills = Array.from(entry.skills.values())
                .sort((a, b) => b.damage - a.damage);
```

Replace with:
```typescript
            const skills = Array.from(entry.skills.values())
                .map((s) => s.min === Infinity ? { ...s, min: 0 } : s)
                .sort((a, b) => b.damage - a.damage);
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/renderer/__tests__/computeStatsAggregation.skillDamage.test.ts`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 4: Run full typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computePlayerAggregation.ts src/renderer/stats/computeSpecialTables.ts src/renderer/stats/statsTypes.ts src/renderer/__tests__/computeStatsAggregation.skillDamage.test.ts
git commit -m "feat: capture hits, min, max per skill in player breakdown aggregation"
```

---

### Task 5: Add Min Hit, Avg Hit, Max Hit rows to the UI

**Files:**
- Modify: `src/renderer/stats/sections/PlayerBreakdownSection.tsx:569-581`

- [ ] **Step 1: Add the three new metric rows**

In `src/renderer/stats/sections/PlayerBreakdownSection.tsx`, find the metric rows array (line 569-580) and add Min Hit, Avg Hit, Max Hit after the DPS row:

Find:
```typescript
                                                    {([
                                                        { label: 'Down Contribution', value: formatTopStatValue(activePlayerSkill?.downContribution || 0) },
                                                        { label: 'Total Damage', value: formatTopStatValue(activePlayerSkill?.damage || 0) },
                                                        {
                                                            label: 'DPS',
                                                            value: formatWithCommas(
                                                                activePlayerBreakdown.totalFightMs > 0
                                                                    ? (activePlayerSkill?.damage || 0) / (activePlayerBreakdown.totalFightMs / 1000)
                                                                    : 0,
                                                                1
                                                            )
                                                        }
                                                    ]).map((row) => (
```

Replace with:
```typescript
                                                    {([
                                                        { label: 'Down Contribution', value: formatTopStatValue(activePlayerSkill?.downContribution || 0) },
                                                        { label: 'Total Damage', value: formatTopStatValue(activePlayerSkill?.damage || 0) },
                                                        {
                                                            label: 'DPS',
                                                            value: formatWithCommas(
                                                                activePlayerBreakdown.totalFightMs > 0
                                                                    ? (activePlayerSkill?.damage || 0) / (activePlayerBreakdown.totalFightMs / 1000)
                                                                    : 0,
                                                                1
                                                            )
                                                        },
                                                        { label: 'Min Hit', value: formatTopStatValue(activePlayerSkill?.min || 0) },
                                                        {
                                                            label: 'Avg Hit',
                                                            value: formatTopStatValue(
                                                                (activePlayerSkill?.hits || 0) > 0
                                                                    ? Math.round((activePlayerSkill?.damage || 0) / (activePlayerSkill?.hits || 1))
                                                                    : 0
                                                            )
                                                        },
                                                        { label: 'Max Hit', value: formatTopStatValue(activePlayerSkill?.max || 0) }
                                                    ]).map((row) => (
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 3: Run all unit tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/PlayerBreakdownSection.tsx
git commit -m "feat: add Min Hit, Avg Hit, Max Hit rows to Player Breakdown detail pane"
```

---

### Task 6: Visual verification

- [ ] **Step 1: Run the dev environment**

Run: `npm run dev`

- [ ] **Step 2: Manual verification**

1. Load logs that contain player skill data
2. Navigate to the Player Breakdown section
3. Select a player and a skill
4. Verify the detail pane shows all 6 rows: Down Contribution, Total Damage, DPS, Min Hit, Avg Hit, Max Hit
5. Verify the values look reasonable (Min Hit <= Avg Hit <= Max Hit)
6. Check the web report viewer (`npm run dev:web`) shows the same rows
