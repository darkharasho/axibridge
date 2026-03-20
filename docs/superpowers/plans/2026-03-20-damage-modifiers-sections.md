# Damage Modifiers Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new stats sections ("Damage Modifiers" under offense, "Incoming Damage Modifiers" under defense) that show per-buff/trait/relic damage contribution using EI's damage modifier data.

**Architecture:** Data flows through three layers: (1) types + pruning to preserve `damageModifiers`/`damageModMap` from EI JSON, (2) aggregation in `computePlayerAggregation` to sum modifier stats across fights, (3) a single shared React component `DamageModifiersSection` parameterized for offense/defense with bar chart collapsed view and dense table expanded view.

**Tech Stack:** TypeScript, React, Vitest, existing stats UI components (DenseStatsTable, StatsTableLayout, StatsTableShell, SearchSelectDropdown, ColumnFilterDropdown)

**Spec:** `docs/superpowers/specs/2026-03-20-damage-modifiers-sections-design.md`

---

### Task 1: Add damage modifier types to shared and main dpsReportTypes

**Files:**
- Modify: `src/shared/dpsReportTypes.ts:1-74`
- Modify: `src/main/dpsReportTypes.ts:1-74`

- [ ] **Step 1: Add DamageModifierInfo and DamageModifierData interfaces to shared types**

In `src/shared/dpsReportTypes.ts`, add before the `DPSReportJSON` interface (before line 1):

```typescript
export interface DamageModifierInfo {
    name: string;
    icon: string;
    description: string;
    nonMultiplier: boolean;
    skillBased: boolean;
    approximate: boolean;
    incoming: boolean;
}

export interface DamageModifierData {
    id: number;
    damageModifiers: Array<{
        hitCount: number;
        totalHitCount: number;
        damageGain: number;
        totalDamage: number;
    }>;
}
```

- [ ] **Step 2: Add damageModMap to DPSReportJSON in shared types**

In `src/shared/dpsReportTypes.ts`, add to the `DPSReportJSON` interface (after the `combatReplayMetaData` field, ~line 17):

```typescript
    damageModMap?: Record<string, DamageModifierInfo>;
    personalDamageMods?: Record<string, number[]>;
```

- [ ] **Step 3: Add damageModifiers and incomingDamageModifiers to Player in shared types**

In `src/shared/dpsReportTypes.ts`, add to the `Player` interface (after the `activeTimes` field, ~line 73):

```typescript
    damageModifiers?: DamageModifierData[];
    incomingDamageModifiers?: DamageModifierData[];
```

- [ ] **Step 4: Mirror all changes in main types**

Apply the exact same changes to `src/main/dpsReportTypes.ts` — add the same two interfaces, the same fields on `DPSReportJSON`, and the same fields on `Player`.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no type errors (new fields are all optional)

- [ ] **Step 6: Commit**

```bash
git add src/shared/dpsReportTypes.ts src/main/dpsReportTypes.ts
git commit -m "feat: add damage modifier types to DPSReportJSON and Player interfaces"
```

---

### Task 2: Preserve damage modifier data through pruning

**Files:**
- Modify: `src/renderer/stats/utils/pruneStatsLog.ts:68-146`

- [ ] **Step 1: Add damageModMap to top-level preserved fields**

In `pruneStatsLog.ts`, find the top-level `pick()` call (~lines 68-95). Add `'damageModMap'` to the array, after `'buffMap'` (~line 91):

```typescript
    'buffMap',
    'damageModMap',
    'encounterDuration',
```

- [ ] **Step 2: Prune damageModMap to keep only needed fields**

After the existing `pruneMetaMap` calls for `skillMap` and `buffMap` (~line 97), add pruning for `damageModMap`. Since `pruneMetaMap` only extracts `name` and `icon`, and we also need `description` and `incoming`, write a targeted prune:

```typescript
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
```

- [ ] **Step 3: Add damageModifiers and incomingDamageModifiers to per-player preserved fields**

In `pruneStatsLog.ts`, find the per-player `pick()` call (~lines 105-146). Add to the array, after `'teamColor'` or `'team_color'` (~line 145):

```typescript
    'team_color',
    'damageModifiers',
    'incomingDamageModifiers'
]);
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/utils/pruneStatsLog.ts
git commit -m "feat: preserve damageModMap and player damage modifiers through pruning"
```

---

### Task 3: Aggregate damage modifier data per player across fights

**Files:**
- Modify: `src/renderer/stats/computePlayerAggregation.ts:13-54,439-1349`

- [ ] **Step 1: Add damageModTotals and incomingDamageModTotals to PlayerStats interface**

In `computePlayerAggregation.ts`, add to the `PlayerStats` interface (~after line 52, before `outgoingConditions`):

```typescript
    damageModTotals: Record<string, { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number }>;
    incomingDamageModTotals: Record<string, { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number }>;
```

- [ ] **Step 2: Initialize the new fields when creating a new PlayerStats entry**

Find where new PlayerStats objects are initialized (search for `outgoingConditions: {}` in the file — this is where new player entries are created). Add initialization alongside it:

```typescript
    damageModTotals: {},
    incomingDamageModTotals: {},
```

- [ ] **Step 3: Add aggregation logic inside the per-player loop**

Find where per-player stats are accumulated within the main `validLogs.forEach` loop (look for where `offenseTotals` are accumulated — the same per-player block). Add after the existing accumulation code:

```typescript
    // Aggregate outgoing damage modifiers
    if (player.damageModifiers) {
        for (const entry of player.damageModifiers) {
            const phase0 = entry.damageModifiers?.[0];
            if (!phase0) continue;
            const key = `d${entry.id}`;
            const existing = ps.damageModTotals[key];
            if (existing) {
                existing.damageGain += phase0.damageGain;
                existing.hitCount += phase0.hitCount;
                existing.totalHitCount += phase0.totalHitCount;
                existing.totalDamage += phase0.totalDamage;
            } else {
                ps.damageModTotals[key] = {
                    damageGain: phase0.damageGain,
                    hitCount: phase0.hitCount,
                    totalHitCount: phase0.totalHitCount,
                    totalDamage: phase0.totalDamage,
                };
            }
        }
    }

    // Aggregate incoming damage modifiers
    if (player.incomingDamageModifiers) {
        for (const entry of player.incomingDamageModifiers) {
            const phase0 = entry.damageModifiers?.[0];
            if (!phase0) continue;
            const key = `d${entry.id}`;
            const existing = ps.incomingDamageModTotals[key];
            if (existing) {
                existing.damageGain += phase0.damageGain;
                existing.hitCount += phase0.hitCount;
                existing.totalHitCount += phase0.totalHitCount;
                existing.totalDamage += phase0.totalDamage;
            } else {
                ps.incomingDamageModTotals[key] = {
                    damageGain: phase0.damageGain,
                    hitCount: phase0.hitCount,
                    totalHitCount: phase0.totalHitCount,
                    totalDamage: phase0.totalDamage,
                };
            }
        }
    }
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computePlayerAggregation.ts
git commit -m "feat: aggregate damage modifier totals per player across fights"
```

---

### Task 4: Merge damageModMap across logs and expose in stats output

**Files:**
- Modify: `src/renderer/stats/computeStatsAggregation.ts:143-706`

- [ ] **Step 1: Merge damageModMap across all logs**

In `computeStatsAggregation.ts`, find where `validLogs` is iterated or where `skillMap`/`buffMap` are handled. Before the `computePlayerAggregation` call (~line 143), add a merge loop:

```typescript
    // Merge damageModMap across all logs (data lives under log.details)
    const mergedDamageModMap: Record<string, { name: string; icon: string; description: string; incoming: boolean }> = {};
    for (const log of validLogs) {
        const modMap = (log as any).details?.damageModMap;
        if (modMap && typeof modMap === 'object') {
            for (const [key, value] of Object.entries(modMap)) {
                if (!mergedDamageModMap[key] && value && typeof value === 'object') {
                    const v = value as any;
                    mergedDamageModMap[key] = {
                        name: v.name ?? '',
                        icon: v.icon ?? '',
                        description: v.description ?? '',
                        incoming: v.incoming ?? false,
                    };
                }
            }
        }
    }
```

- [ ] **Step 2: Add damageModPlayers, incomingDamageModPlayers, and damageModMap to the return object**

In the final `return` object (~line 640), add after `healingPlayers`:

```typescript
    damageModMap: mergedDamageModMap,
    damageModPlayers: Array.from(playerStats.values()).map(s => ({
        account: s.account, profession: s.profession, professionList: s.professionList,
        damageModTotals: s.damageModTotals, totalFightMs: s.totalFightMs,
    })),
    incomingDamageModPlayers: Array.from(playerStats.values()).map(s => ({
        account: s.account, profession: s.profession, professionList: s.professionList,
        incomingDamageModTotals: s.incomingDamageModTotals, totalFightMs: s.totalFightMs,
    })),
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (return type is inferred)

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `npm run test:unit`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeStatsAggregation.ts
git commit -m "feat: merge damageModMap across logs and expose modifier players in stats output"
```

---

### Task 5: Write tests for damage modifier aggregation

**Files:**
- Create: `src/renderer/stats/__tests__/damageModifierAggregation.test.ts`

- [ ] **Step 1: Write test for outgoing damage modifier aggregation**

Create `src/renderer/stats/__tests__/damageModifierAggregation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

// Minimal log shape — data lives under `details` (matches actual codebase structure)
const makeLog = (overrides: any = {}) => ({
    details: {
        durationMS: 60000,
        fightName: 'Test Fight',
        success: true,
        players: [],
        targets: [],
        ...overrides,
    },
});

const makePlayer = (overrides: any = {}) => ({
    name: 'TestPlayer',
    account: 'Test.1234',
    profession: 'Daredevil',
    group: 1,
    dpsAll: [{ damage: 100000 }],
    defenses: [{}],
    support: [{}],
    activeTimes: [60000],
    ...overrides,
});

describe('damage modifier aggregation', () => {
    it('aggregates outgoing damage modifiers across fights', () => {
        const logs = [
            makeLog({
                players: [makePlayer({
                    damageModifiers: [
                        { id: 44, damageModifiers: [{ hitCount: 25, totalHitCount: 100, damageGain: 1000, totalDamage: 50000 }] },
                        { id: 32, damageModifiers: [{ hitCount: 50, totalHitCount: 100, damageGain: 3000, totalDamage: 50000 }] },
                    ],
                })],
            }),
            makeLog({
                players: [makePlayer({
                    damageModifiers: [
                        { id: 44, damageModifiers: [{ hitCount: 30, totalHitCount: 120, damageGain: 1500, totalDamage: 60000 }] },
                    ],
                })],
            }),
        ];

        const result = computePlayerAggregation({
            validLogs: logs as any,
            method: 'target' as any,
            skillDamageSource: 'totalDamageDist',
            splitPlayersByClass: false,
        });

        const player = result.playerStats.get('Test.1234');
        expect(player).toBeDefined();
        expect(player!.damageModTotals['d44']).toEqual({
            damageGain: 2500,
            hitCount: 55,
            totalHitCount: 220,
            totalDamage: 110000,
        });
        expect(player!.damageModTotals['d32']).toEqual({
            damageGain: 3000,
            hitCount: 50,
            totalHitCount: 100,
            totalDamage: 50000,
        });
    });

    it('aggregates incoming damage modifiers', () => {
        const logs = [
            makeLog({
                players: [makePlayer({
                    incomingDamageModifiers: [
                        { id: -58, damageModifiers: [{ hitCount: 6, totalHitCount: 10, damageGain: -2900, totalDamage: 11000 }] },
                    ],
                })],
            }),
        ];

        const result = computePlayerAggregation({
            validLogs: logs as any,
            method: 'target' as any,
            skillDamageSource: 'totalDamageDist',
            splitPlayersByClass: false,
        });

        const player = result.playerStats.get('Test.1234');
        expect(player).toBeDefined();
        expect(player!.incomingDamageModTotals['d-58']).toEqual({
            damageGain: -2900,
            hitCount: 6,
            totalHitCount: 10,
            totalDamage: 11000,
        });
    });

    it('returns empty objects when no modifier data present', () => {
        const logs = [makeLog({ players: [makePlayer()] })];

        const result = computePlayerAggregation({
            validLogs: logs as any,
            method: 'target' as any,
            skillDamageSource: 'totalDamageDist',
            splitPlayersByClass: false,
        });

        const player = result.playerStats.get('Test.1234');
        expect(player).toBeDefined();
        expect(player!.damageModTotals).toEqual({});
        expect(player!.incomingDamageModTotals).toEqual({});
    });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/damageModifierAggregation.test.ts`
Expected: All 3 tests PASS. If tests fail because `makeLog`/`makePlayer` don't satisfy the function's expected shape, adjust the minimal mock objects to include required fields.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/__tests__/damageModifierAggregation.test.ts
git commit -m "test: add unit tests for damage modifier aggregation"
```

---

### Task 6: Create DamageModifiersSection component — collapsed view

**Files:**
- Create: `src/renderer/stats/sections/DamageModifiersSection.tsx`

- [ ] **Step 1: Create the component file with types and basic structure**

Create `src/renderer/stats/sections/DamageModifiersSection.tsx`. The component receives props for search/activeMod state and an `incoming` flag. It reads `damageModMap`, `damageModPlayers` or `incomingDamageModPlayers` from `stats` via `useStatsSharedContext()`.

```typescript
import { useState, useMemo } from 'react';
import { Maximize2, X, Columns, Users } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, type SearchSelectOption } from '../ui/SearchSelectDropdown';

type DamageModifiersSectionProps = {
    search: string;
    setSearch: (value: string) => void;
    activeMod: string;
    setActiveMod: (value: string) => void;
    incoming: boolean;
};

const SECTION_CONFIG = {
    outgoing: {
        sectionId: 'damage-modifiers' as const,
        title: 'Damage Modifiers',
        accentBg: 'bg-rose-500/20',
        accentText: 'text-rose-200',
        accentBorder: 'border-rose-500/40',
        barGradient: 'from-rose-500/40 to-rose-500/15',
    },
    incoming: {
        sectionId: 'incoming-damage-modifiers' as const,
        title: 'Incoming Damage Modifiers',
        accentBg: 'bg-blue-500/20',
        accentText: 'text-blue-200',
        accentBorder: 'border-blue-500/40',
        barGradient: 'from-blue-500/40 to-blue-500/15',
    },
};
```

- [ ] **Step 2: Build the modifier list and player rows from stats data**

Add the main component body. Key logic:
- Extract player data from `stats.damageModPlayers` or `stats.incomingDamageModPlayers`
- Build a list of all unique modifier IDs across all players
- For each modifier, compute total squad `damageGain`
- Sort modifiers by squad total descending (absolute value for incoming)
- Default `activeMod` to the first modifier if unset

```typescript
export const DamageModifiersSection = ({
    search, setSearch, activeMod, setActiveMod, incoming,
}: DamageModifiersSectionProps) => {
    const {
        stats, formatWithCommas, renderProfessionIcon,
        expandedSection, expandedSectionClosing,
        openExpandedSection, closeExpandedSection,
        isSectionVisible, isFirstVisibleSection, sectionClass, sidebarListClass,
    } = useStatsSharedContext();

    const config = incoming ? SECTION_CONFIG.incoming : SECTION_CONFIG.outgoing;
    const isExpanded = expandedSection === config.sectionId;

    const modMap: Record<string, { name: string; icon: string; description: string; incoming: boolean }> =
        (stats as any).damageModMap ?? {};
    const playerRows: Array<{
        account: string; profession: string; professionList?: string[];
        damageModTotals?: Record<string, { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number }>;
        incomingDamageModTotals?: Record<string, { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number }>;
        totalFightMs: number;
    }> = incoming ? (stats as any).incomingDamageModPlayers ?? [] : (stats as any).damageModPlayers ?? [];

    // Build sorted modifier list
    const { modifiers, modSquadTotals } = useMemo(() => {
        const totals: Record<string, number> = {};
        for (const row of playerRows) {
            const mods = incoming ? row.incomingDamageModTotals : row.damageModTotals;
            if (!mods) continue;
            for (const [key, val] of Object.entries(mods)) {
                totals[key] = (totals[key] ?? 0) + val.damageGain;
            }
        }
        const sorted = Object.entries(totals)
            .filter(([key]) => {
                const info = modMap[key];
                return info && (incoming ? info.incoming : !info.incoming);
            })
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .map(([key]) => key);
        return { modifiers: sorted, modSquadTotals: totals };
    }, [playerRows, modMap, incoming]);

    // Auto-select first modifier
    const effectiveActiveMod = modifiers.includes(activeMod) ? activeMod : modifiers[0] ?? '';

    // Filter modifiers by search
    const filteredModifiers = modifiers.filter(key => {
        if (!search) return true;
        const info = modMap[key];
        return info?.name?.toLowerCase().includes(search.toLowerCase());
    });
```

- [ ] **Step 3: Implement the collapsed sidebar**

Add the sidebar rendering inside the `StatsTableLayout`. Shows search input + modifier list:

```typescript
    // Players for the active modifier, sorted by damageGain descending
    const activeModPlayers = useMemo(() => {
        if (!effectiveActiveMod) return [];
        return playerRows
            .map(row => {
                const mods = incoming ? row.incomingDamageModTotals : row.damageModTotals;
                const modData = mods?.[effectiveActiveMod];
                if (!modData) return null;
                return { ...row, modData };
            })
            .filter(Boolean)
            .sort((a, b) => Math.abs(b!.modData.damageGain) - Math.abs(a!.modData.damageGain)) as Array<{
                account: string; profession: string; professionList?: string[];
                totalFightMs: number;
                modData: { damageGain: number; hitCount: number; totalHitCount: number; totalDamage: number };
            }>;
    }, [effectiveActiveMod, playerRows, incoming]);

    if (!isSectionVisible(config.sectionId)) return null;

    const modInfo = modMap[effectiveActiveMod];
    const maxGain = activeModPlayers.length > 0 ? Math.max(...activeModPlayers.map(p => Math.abs(p.modData.damageGain))) : 1;

    return (
        <div
            id={config.sectionId}
            data-section-visible
            data-section-first={isFirstVisibleSection(config.sectionId) || undefined}
            className={`${sectionClass(config.sectionId, 'bg-white/5 border border-white/10 rounded-2xl overflow-hidden')} ${
                isExpanded ? 'fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10' : ''
            }`}
        >
```

Continue with the collapsed view layout — sidebar with modifier list + content pane with bars and table. This follows the same structural pattern as `OffenseSection.tsx`.

- [ ] **Step 4: Implement the bar chart in the content pane**

The bar chart renders one horizontal bar per player for the selected modifier:

```typescript
    {/* Bar Chart */}
    <div className="space-y-1.5 mb-4">
        {activeModPlayers.map((player, idx) => {
            const pct = player.modData.totalDamage > 0
                ? ((player.modData.damageGain / player.modData.totalDamage) * 100).toFixed(1)
                : '0.0';
            const barWidth = (Math.abs(player.modData.damageGain) / maxGain) * 100;
            const isNegative = player.modData.damageGain < 0;

            return (
                <div key={player.account} className="flex items-center gap-2">
                    <span className="w-36 text-xs truncate flex items-center gap-1">
                        {renderProfessionIcon(player.profession, player.professionList)}
                        {player.account}
                    </span>
                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                        {incoming ? (
                            // Bidirectional: negative = green (left from center), positive = red (right)
                            <div className="absolute inset-0 flex">
                                <div className="w-1/2 flex justify-end">
                                    {isNegative && (
                                        <div
                                            className="h-full bg-gradient-to-l from-teal-500/40 to-teal-500/15 rounded-l"
                                            style={{ width: `${barWidth}%` }}
                                        />
                                    )}
                                </div>
                                <div className="w-px bg-white/20" />
                                <div className="w-1/2">
                                    {!isNegative && (
                                        <div
                                            className="h-full bg-gradient-to-r from-rose-500/40 to-rose-500/15 rounded-r"
                                            style={{ width: `${barWidth}%` }}
                                        />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div
                                className={`h-full bg-gradient-to-r ${config.barGradient} rounded`}
                                style={{ width: `${barWidth}%` }}
                            />
                        )}
                        <span className="absolute right-1.5 top-0.5 text-[11px] text-gray-300">
                            {player.modData.damageGain >= 0 ? '+' : ''}{formatWithCommas(Math.round(player.modData.damageGain))} ({pct}%)
                        </span>
                    </div>
                </div>
            );
        })}
    </div>
```

- [ ] **Step 5: Implement the detail table below bars**

Add a sortable table using `StatsTableShell` with columns: Rank, Player, Damage Gain, % of Total Damage, Hit Coverage, Fight Time. Use the same sort pattern as OffenseSection (local state for sort key/direction).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (component may have warnings about unused expanded view code — that's OK, we add it next task)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stats/sections/DamageModifiersSection.tsx
git commit -m "feat: add DamageModifiersSection component with bar chart collapsed view"
```

---

### Task 7: Add expanded/fullscreen dense table view to DamageModifiersSection

**Files:**
- Modify: `src/renderer/stats/sections/DamageModifiersSection.tsx`

- [ ] **Step 1: Add state for expanded view (column/player selection, dense sort)**

Add state hooks inside the component for the expanded view controls:

```typescript
    const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
```

- [ ] **Step 2: Build column and row data for DenseStatsTable**

Compute columns (one per modifier), rows (one per player), and cell values (formatted damageGain or "—"):

```typescript
    const denseColumns = useMemo(() => {
        const cols = (selectedColumnIds.length > 0 ? modifiers.filter(m => selectedColumnIds.includes(m)) : modifiers)
            .filter(key => {
                if (!search) return true;
                return modMap[key]?.name?.toLowerCase().includes(search.toLowerCase());
            });
        return cols.map(key => ({
            id: key,
            label: modMap[key]?.name ?? key,
            align: 'right' as const,
            minWidth: 100,
        }));
    }, [modifiers, selectedColumnIds, search, modMap]);

    const denseRows = useMemo(() => {
        let rows = playerRows.map(row => {
            const mods = incoming ? row.incomingDamageModTotals : row.damageModTotals;
            const values: Record<string, React.ReactNode> = {};
            for (const col of denseColumns) {
                const val = mods?.[col.id];
                values[col.id] = val ? (
                    <span className={val.damageGain >= 0 ? config.accentText : 'text-teal-300'}>
                        {val.damageGain >= 0 ? '+' : ''}{formatWithCommas(Math.round(val.damageGain))}
                    </span>
                ) : <span className="text-gray-600">—</span>;
            }
            return {
                id: row.account,
                label: (
                    <span className="flex items-center gap-1">
                        {renderProfessionIcon(row.profession, row.professionList)}
                        {row.account}
                    </span>
                ),
                values,
                _raw: mods ?? {},
            };
        });
        // Filter by selected players
        if (selectedPlayers.length > 0) {
            rows = rows.filter(r => selectedPlayers.includes(r.id));
        }
        // Sort by dense sort column
        if (denseSort.columnId) {
            rows.sort((a, b) => {
                const aVal = (a._raw as any)[denseSort.columnId]?.damageGain ?? 0;
                const bVal = (b._raw as any)[denseSort.columnId]?.damageGain ?? 0;
                return denseSort.dir === 'desc' ? Math.abs(bVal) - Math.abs(aVal) : Math.abs(aVal) - Math.abs(bVal);
            });
        }
        return rows;
    }, [playerRows, denseColumns, incoming, selectedPlayers, denseSort, formatWithCommas, config.accentText, renderProfessionIcon]);
```

- [ ] **Step 3: Render the expanded view with controls + DenseStatsTable**

In the component's return, add the expanded view branch (when `isExpanded` is true). Follow the same pattern as OffenseSection lines 79-264: render a control panel with SearchSelectDropdown, ColumnFilterDropdown for modifiers, ColumnFilterDropdown for players, Clear All button, active filter pills, then the DenseStatsTable.

- [ ] **Step 4: Add expand/collapse button to the section header**

Add the Maximize2/X icon button that calls `openExpandedSection(config.sectionId)` or `closeExpandedSection()`, matching the pattern in OffenseSection lines 67-75.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/sections/DamageModifiersSection.tsx
git commit -m "feat: add expanded dense table view to DamageModifiersSection"
```

---

### Task 8: Integrate sections into StatsView

**Files:**
- Modify: `src/renderer/StatsView.tsx:31-52,92-126,587-622,3699-4129`

- [ ] **Step 1: Import DamageModifiersSection**

Add import near line 31 with other section imports:

```typescript
import { DamageModifiersSection } from './stats/sections/DamageModifiersSection';
```

- [ ] **Step 2: Add section IDs to ORDERED_SECTION_IDS**

In the `ORDERED_SECTION_IDS` array (~lines 92-126):
- Add `'damage-modifiers'` after `'offense-detailed'` (after line 110)
- Add `'incoming-damage-modifiers'` after `'defense-detailed'` (after line 115)

```typescript
    'offense-detailed',
    'damage-modifiers',       // NEW
    'player-breakdown',
    ...
    'defense-detailed',
    'incoming-damage-modifiers', // NEW
    'incoming-strike-damage',
```

- [ ] **Step 3: Add state variables for the new sections**

Near the other section state declarations (~lines 587-622), add:

```typescript
    const [damageModSearch, setDamageModSearch] = useState('');
    const [activeDamageMod, setActiveDamageMod] = useState('');
    const [incomingDamageModSearch, setIncomingDamageModSearch] = useState('');
    const [activeIncomingDamageMod, setActiveIncomingDamageMod] = useState('');
```

- [ ] **Step 4: Render DamageModifiersSection (offense) in both layout branches**

After the OffenseSection rendering in both the modern and legacy layout branches, add:

```typescript
    <DamageModifiersSection
        search={damageModSearch}
        setSearch={setDamageModSearch}
        activeMod={activeDamageMod}
        setActiveMod={setActiveDamageMod}
        incoming={false}
    />
```

- [ ] **Step 5: Render DamageModifiersSection (defense/incoming) in both layout branches**

After the DefenseSection rendering in both layout branches, add:

```typescript
    <DamageModifiersSection
        search={incomingDamageModSearch}
        setSearch={setIncomingDamageModSearch}
        activeMod={activeIncomingDamageMod}
        setActiveMod={setActiveIncomingDamageMod}
        incoming={true}
    />
```

- [ ] **Step 6: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: integrate damage modifier sections into StatsView"
```

---

### Task 9: Manual testing and polish

**Files:**
- May touch: `src/renderer/stats/sections/DamageModifiersSection.tsx`

- [ ] **Step 1: Run the dev environment**

Run: `npm run dev`
Load a dataset that contains damage modifier data (any WvW log set).

- [ ] **Step 2: Verify the Damage Modifiers section appears after Offense**

Navigate to the stats view. Confirm:
- "Damage Modifiers" section appears after "Offense (Detailed)"
- Sidebar shows modifier list with icons, names, and squad totals
- Clicking a modifier shows bar chart + detail table
- Bars scale correctly relative to top player
- Table is sortable by each column

- [ ] **Step 3: Verify the Incoming Damage Modifiers section appears after Defense**

Confirm:
- "Incoming Damage Modifiers" section appears after "Defense (Detailed)"
- Negative damageGain values show green/teal bars extending left
- Positive values show red bars extending right

- [ ] **Step 4: Verify expanded/fullscreen view**

Click the expand button on both sections. Confirm:
- Dense table shows modifiers as columns, players as rows
- "—" appears for players without a given modifier
- Column sort works (click header)
- Column and player filter dropdowns work
- Clear All removes filters

- [ ] **Step 5: Fix any styling or behavior issues found**

Make adjustments as needed. Common things to check:
- Bar label text contrast/readability
- Long modifier names in sidebar truncation
- Empty state when no modifiers present in the dataset

- [ ] **Step 6: Run full validation**

Run: `npm run validate && npm run test:unit`
Expected: All pass

- [ ] **Step 7: Commit any polish changes**

```bash
git add -u
git commit -m "fix: polish damage modifiers section styling and edge cases"
```
