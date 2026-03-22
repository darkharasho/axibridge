# Squad Stats Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Squad Stats" parent nav group with 4 sub-sections: Damage Comparison, Kill Pressure, Heal Effectiveness (relocated), and Tag Distance Deaths.

**Architecture:** New TOC group inserted after Commander Stats. Two chart-only sections consume existing `fightBreakdown` data from context. One section relocated as-is. One new computation module + scatter chart section for tag distance deaths. TDD approach for the computation module; sections tested via lint/typecheck.

**Tech Stack:** React, recharts (BarChart, ScatterChart, ReferenceLine), TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-03-21-squad-stats-section-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/stats/computeTagDistanceDeaths.ts` | Pure computation: extract per-death events with point-in-time distance from commander tag |
| `src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts` | Unit tests for the computation module |
| `src/renderer/stats/sections/SquadDamageComparisonSection.tsx` | Diverging bar chart — outgoing vs incoming damage per fight |
| `src/renderer/stats/sections/SquadKillPressureSection.tsx` | KDR bar chart per fight with break-even reference line |
| `src/renderer/stats/sections/SquadTagDistanceDeathsSection.tsx` | Summary bar chart + click-to-drill scatter chart for death distances |

### Modified Files
| File | Change |
|------|--------|
| `src/renderer/stats/hooks/useStatsNavigation.ts` | Add `squad-stats` TOC group; move `heal-effectiveness` from `defense` group |
| `src/renderer/StatsView.tsx` | Import 3 new sections; add `useMemo` for tag distance data; relocate + insert JSX in both layout branches |

---

## Task 1: Navigation — Add Squad Stats TOC Group

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts:3,29-124`

- [ ] **Step 1: Add `Crosshair`, `ArrowUpDown` imports to lucide-react import**

In `src/renderer/stats/hooks/useStatsNavigation.ts` line 3, add `Crosshair` and `ArrowUpDown` to the existing lucide-react import:

```typescript
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown } from 'lucide-react';
```

- [ ] **Step 2: Insert the new `squad-stats` group after the `commanders` group (after line 66)**

Insert this new group object between the `commanders` group (ends line 66) and the `roster` group (starts line 67):

```typescript
    {
        id: 'squad-stats',
        label: 'Squad Stats',
        icon: Users,
        sectionIds: ['squad-damage-comparison', 'squad-kill-pressure', 'heal-effectiveness', 'squad-tag-distance-deaths'],
        items: [
            { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown },
            { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target },
            { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves },
            { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair },
        ]
    },
```

- [ ] **Step 3: Remove `heal-effectiveness` from the `defense` group**

In the `defense` group (lines 92-110):
- Remove `'heal-effectiveness'` from the `sectionIds` array (line 96)
- Remove `{ id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves }` from the `items` array (line 108)

After removal, the defense `sectionIds` should end with `'healing-breakdown'` and the last item should be `{ id: 'healing-breakdown', label: 'Healing Breakdown', icon: ListTree }`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors — icons and IDs are all strings)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/hooks/useStatsNavigation.ts
git commit -m "feat: add Squad Stats nav group, relocate heal-effectiveness"
```

---

## Task 2: computeTagDistanceDeaths — Failing Tests

**Files:**
- Create: `src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts`

- [ ] **Step 1: Write test file with 5 test cases**

Create `src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeTagDistanceDeaths } from '../computeTagDistanceDeaths';

const makeLog = (overrides: any = {}) => ({
    log: {
        filePath: overrides.filePath ?? 'fight-1',
        encounterName: overrides.encounterName ?? 'Skirmish',
        details: {
            fightName: overrides.fightName ?? 'Skirmish',
            durationMS: overrides.durationMS ?? 120000,
            combatReplayMetaData: {
                pollingRate: overrides.pollingRate ?? 150,
                inchToPixel: overrides.inchToPixel ?? 0.02,
            },
            players: overrides.players ?? [],
            targets: overrides.targets ?? [],
            ...(overrides.detailsExtra ?? {}),
        },
        dashboardSummary: overrides.dashboardSummary ?? { isWin: true },
        ...(overrides.logExtra ?? {}),
    }
});

const makePlayer = (opts: {
    account: string;
    hasCommanderTag?: boolean;
    notInSquad?: boolean;
    positions?: Array<[number, number]>;
    dead?: Array<[number, number]>;
    down?: Array<[number, number]>;
    start?: number;
}) => ({
    account: opts.account,
    profession: 'Guardian',
    hasCommanderTag: opts.hasCommanderTag ?? false,
    notInSquad: opts.notInSquad ?? false,
    combatReplayData: {
        positions: opts.positions ?? [],
        dead: opts.dead ?? [],
        down: opts.down ?? [],
        start: opts.start ?? 0,
    },
    dpsAll: [{ damage: 100 }],
    defenses: [{ damageTaken: 50, downCount: 0, deadCount: 0 }],
});

describe('computeTagDistanceDeaths', () => {
    it('returns empty array for empty input', () => {
        expect(computeTagDistanceDeaths([])).toEqual([]);
    });

    it('returns fight summary with hasReplayData=false when no commander tag', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                players: [
                    makePlayer({ account: 'Player.1234', positions: [[0, 0], [10, 10]] }),
                ],
            }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(false);
        expect(result[0].events).toEqual([]);
    });

    it('returns fight summary with hasReplayData=false when commander has no positions', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                players: [
                    makePlayer({ account: 'Cmdr.5678', hasCommanderTag: true, positions: [] }),
                    makePlayer({ account: 'Player.1234', positions: [[0, 0]], dead: [[300, 600]], down: [[200, 300]] }),
                ],
            }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(false);
    });

    it('computes point-in-time distance for a death event', () => {
        // pollingRate=150, inchToPixel=0.02
        // Commander at positions: [0,0], [0,0], [0,0] (stationary at origin)
        // Player at positions: [100,0], [200,0], [300,0]
        // Player down at 150ms (poll index 1), dead at 150ms
        // At poll index 1: player=[200,0], tag=[0,0] -> pixel dist=200, inches=200/0.02=10000
        const result = computeTagDistanceDeaths([
            makeLog({
                pollingRate: 150,
                inchToPixel: 0.02,
                players: [
                    makePlayer({
                        account: 'Cmdr.5678',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0]],
                    }),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[100, 0], [200, 0], [300, 0]],
                        down: [[150, 150]],
                        dead: [[150, 300]],
                    }),
                ],
            }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].hasReplayData).toBe(true);
        expect(result[0].eventCount).toBe(1);
        expect(result[0].events[0].playerAccount).toBe('Player.1234');
        expect(result[0].events[0].timeIntoFightMs).toBe(150);
        expect(result[0].events[0].distanceFromTag).toBe(10000);
    });

    it('excludes rallied downs (down with no matching death)', () => {
        const result = computeTagDistanceDeaths([
            makeLog({
                pollingRate: 150,
                inchToPixel: 0.02,
                players: [
                    makePlayer({
                        account: 'Cmdr.5678',
                        hasCommanderTag: true,
                        positions: [[0, 0], [0, 0], [0, 0]],
                    }),
                    makePlayer({
                        account: 'Player.1234',
                        positions: [[100, 0], [200, 0], [300, 0]],
                        down: [[150, 0]],  // down[1]=0 means no linked death
                        dead: [],          // no deaths
                    }),
                ],
            }),
        ]);
        expect(result[0].eventCount).toBe(0);
        expect(result[0].events).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts`
Expected: FAIL with "Cannot find module '../computeTagDistanceDeaths'"

- [ ] **Step 3: Commit failing tests**

```bash
git add src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts
git commit -m "test: add failing tests for computeTagDistanceDeaths"
```

---

## Task 3: computeTagDistanceDeaths — Implementation

**Files:**
- Create: `src/renderer/stats/computeTagDistanceDeaths.ts`

- [ ] **Step 1: Create the computation module**

Create `src/renderer/stats/computeTagDistanceDeaths.ts`:

```typescript
import { sanitizeWvwLabel, buildFightLabel, resolveMapName } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { getFightOutcome } from './computePlayerAggregation';

export type TagDistanceDeathEvent = {
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    playerAccount: string;
    timeIntoFightMs: number;
    timeIntoFightSec: number;
    distanceFromTag: number;
};

export type TagDistanceDeathFightSummary = {
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    avgDistance: number;
    events: TagDistanceDeathEvent[];
    eventCount: number;
    hasReplayData: boolean;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const resolveFightOutcome = (details: any, log: any): boolean | null => {
    const players = Array.isArray(details?.players) ? details.players : [];
    if (players.length > 0) return getFightOutcome(details);
    if (typeof details?.success === 'boolean') return details.success;
    const summary = log?.dashboardSummary;
    if (summary && typeof summary === 'object') {
        if (summary.isWin === true) return true;
        if (summary.isWin === false) return false;
    }
    return null;
};

export const computeTagDistanceDeaths = (
    sortedFightLogs: Array<{ log: any }>
): TagDistanceDeathFightSummary[] => {
    return sortedFightLogs.map(({ log }, idx) => {
        const details = log?.details;
        const fightId = log?.filePath || `fight-${idx}`;
        const fightName = sanitizeWvwLabel(details?.fightName || log?.encounterName || `Fight ${idx + 1}`);
        const mapName = resolveMapName(details, log);
        const shortLabel = `F${idx + 1}`;
        const fullLabel = buildFightLabel(fightName, String(mapName || ''));
        const isWin = resolveFightOutcome(details, log);

        const players = Array.isArray(details?.players) ? details.players : [];
        const squadPlayers = players.filter((p: any) => !p?.notInSquad);
        const replayMeta = (details as any)?.combatReplayMetaData || {};
        const pollingRate = replayMeta?.pollingRate > 0 ? replayMeta.pollingRate : 0;
        const inchToPixel = replayMeta?.inchToPixel > 0 ? replayMeta.inchToPixel : 0;

        const commander = squadPlayers.find((p: any) => p?.hasCommanderTag);
        const tagPositions: Array<[number, number]> = commander?.combatReplayData?.positions || [];

        if (!commander || tagPositions.length === 0 || pollingRate <= 0 || inchToPixel <= 0) {
            return {
                fightId, shortLabel, fullLabel, isWin,
                avgDistance: 0, events: [], eventCount: 0, hasReplayData: false,
            };
        }

        const events: TagDistanceDeathEvent[] = [];

        for (const player of squadPlayers) {
            if (player.hasCommanderTag) continue;
            const replay = player?.combatReplayData;
            if (!replay?.positions || !Array.isArray(replay.dead) || !Array.isArray(replay.down)) continue;

            const playerPositions: Array<[number, number]> = replay.positions;
            const playerStart = Number(replay.start || 0);
            const playerOffset = Math.floor(playerStart / pollingRate);

            const deadSet = new Set<number>();
            for (const entry of replay.dead) {
                if (Array.isArray(entry) && Number.isFinite(entry[0]) && entry[0] > 0) {
                    deadSet.add(entry[0]);
                }
            }

            for (const entry of replay.down) {
                if (!Array.isArray(entry)) continue;
                const downStartMs = Number(entry[0]);
                const linkedDeathMs = Number(entry[1]);
                if (!Number.isFinite(downStartMs) || downStartMs < 0) continue;
                if (!deadSet.has(linkedDeathMs)) continue;

                const pollIndex = Math.floor(downStartMs / pollingRate);
                const playerIdx = clamp(pollIndex - playerOffset, 0, playerPositions.length - 1);
                const tagIdx = clamp(pollIndex, 0, tagPositions.length - 1);

                const [px, py] = playerPositions[playerIdx];
                const [tx, ty] = tagPositions[tagIdx];
                const distanceFromTag = Math.round(Math.hypot(px - tx, py - ty) / inchToPixel);

                events.push({
                    fightId, shortLabel, fullLabel, isWin,
                    playerAccount: player.account || 'Unknown',
                    timeIntoFightMs: downStartMs,
                    timeIntoFightSec: Math.round(downStartMs / 1000),
                    distanceFromTag,
                });
            }
        }

        const avgDistance = events.length > 0
            ? Math.round(events.reduce((sum, e) => sum + e.distanceFromTag, 0) / events.length)
            : 0;

        return {
            fightId, shortLabel, fullLabel, isWin,
            avgDistance, events, eventCount: events.length, hasReplayData: true,
        };
    });
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/computeTagDistanceDeaths.ts src/renderer/stats/__tests__/computeTagDistanceDeaths.test.ts
git commit -m "feat: add computeTagDistanceDeaths module with tests"
```

---

## Task 4: SquadDamageComparisonSection Component

**Files:**
- Create: `src/renderer/stats/sections/SquadDamageComparisonSection.tsx`

**Reference files:**
- `src/renderer/stats/sections/FightBreakdownSection.tsx` — for how to access `stats.fightBreakdown` from context
- `src/renderer/stats/sections/HealEffectivenessSection.tsx` — for section wrapper pattern with expand/collapse

- [ ] **Step 1: Create the section component**

Create `src/renderer/stats/sections/SquadDamageComparisonSection.tsx`:

```typescript
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpDown, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type DamageComparisonPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    outgoing: number;
    incoming: number;
};

export const SquadDamageComparisonSection = () => {
    const {
        stats,
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass
    } = useStatsSharedContext();
    const sectionId = 'squad-damage-comparison';
    const isExpanded = expandedSection === sectionId;

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];

    const chartData: DamageComparisonPoint[] = useMemo(() => {
        return fights.map((fight: any, idx: number) => ({
            index: idx,
            fightId: fight.id || `fight-${idx}`,
            shortLabel: `F${idx + 1}`,
            fullLabel: `${fight.mapName || fight.label || 'Unknown'} • ${fight.duration || '--:--'}`,
            isWin: fight.isWin,
            outgoing: Number(fight.totalOutgoingDamage || 0),
            incoming: -Math.abs(Number(fight.totalIncomingDamage || 0)),
        }));
    }, [fights]);

    const yMax = useMemo(() => {
        if (chartData.length === 0) return 1;
        return Math.max(1, ...chartData.map((d) => Math.max(Math.abs(d.outgoing), Math.abs(d.incoming))));
    }, [chartData]);

    return (
        <div
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                isExpanded
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <ArrowUpDown className="w-5 h-5 text-orange-400" />
                    Damage Comparison
                </h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={isExpanded ? 'Close Damage Comparison' : 'Expand Damage Comparison'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {chartData.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No fight data available</div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Outgoing vs Incoming Damage</div>
                            <div className="text-[11px] text-gray-500 mt-1">
                                Green bars (up) are squad outgoing damage. Red bars (down) are incoming damage.
                            </div>
                        </div>
                        <div className="text-[11px] text-gray-500 shrink-0">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[300px]'}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} stackOffset="sign">
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="shortLabel"
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[-yMax, yMax]}
                                    tickFormatter={(value: number) => formatWithCommas(Math.abs(value), 0)}
                                />
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                    formatter={(value: any, name: string) => {
                                        const absVal = formatWithCommas(Math.abs(Number(value || 0)), 0);
                                        return [absVal, name];
                                    }}
                                    labelFormatter={(_, payload?: readonly any[]) => {
                                        const point = payload?.[0]?.payload;
                                        if (!point) return '';
                                        const winLabel = point.isWin === true ? ' ✓' : point.isWin === false ? ' ✗' : '';
                                        return `${point.fullLabel}${winLabel}`;
                                    }}
                                />
                                <Bar dataKey="outgoing" name="Outgoing Damage" stackId="stack">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.isWin === false ? '#4ade80' : '#22c55e'}
                                        />
                                    ))}
                                </Bar>
                                <Bar dataKey="incoming" name="Incoming Damage" stackId="stack">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.isWin === false ? '#f87171' : '#ef4444'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-gray-400">Outgoing</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                            <span className="text-[9px] text-gray-400">Incoming</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/SquadDamageComparisonSection.tsx
git commit -m "feat: add SquadDamageComparisonSection with diverging bar chart"
```

---

## Task 5: SquadKillPressureSection Component

**Files:**
- Create: `src/renderer/stats/sections/SquadKillPressureSection.tsx`

- [ ] **Step 1: Create the section component**

Create `src/renderer/stats/sections/SquadKillPressureSection.tsx`:

```typescript
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Target, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type KillPressurePoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    kdr: number;
    enemyDeaths: number;
    squadDeaths: number;
};

export const SquadKillPressureSection = () => {
    const {
        stats,
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass
    } = useStatsSharedContext();
    const sectionId = 'squad-kill-pressure';
    const isExpanded = expandedSection === sectionId;

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];

    const chartData: KillPressurePoint[] = useMemo(() => {
        return fights.map((fight: any, idx: number) => {
            const enemyDeaths = Number(fight.enemyDeaths || 0);
            const squadDeaths = Number(fight.alliesDead || 0);
            const kdr = squadDeaths > 0 ? enemyDeaths / squadDeaths : enemyDeaths;
            return {
                index: idx,
                fightId: fight.id || `fight-${idx}`,
                shortLabel: `F${idx + 1}`,
                fullLabel: `${fight.mapName || fight.label || 'Unknown'} • ${fight.duration || '--:--'}`,
                isWin: fight.isWin,
                kdr: Math.round(kdr * 100) / 100,
                enemyDeaths,
                squadDeaths,
            };
        });
    }, [fights]);

    const yMax = useMemo(() => {
        if (chartData.length === 0) return 5;
        return Math.max(5, ...chartData.map((d) => d.kdr));
    }, [chartData]);

    return (
        <div
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                isExpanded
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Target className="w-5 h-5 text-violet-400" />
                    Kill Pressure
                </h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={isExpanded ? 'Close Kill Pressure' : 'Expand Kill Pressure'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {chartData.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No fight data available</div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Kill/Death Ratio per Fight</div>
                            <div className="text-[11px] text-gray-500 mt-1">
                                KDR = enemy deaths ÷ squad deaths. Dashed line at 1.0 is break-even.
                            </div>
                        </div>
                        <div className="text-[11px] text-gray-500 shrink-0">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[280px]'}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="shortLabel"
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[0, yMax]}
                                    tickFormatter={(value: number) => value.toFixed(1)}
                                />
                                <ReferenceLine
                                    y={1}
                                    stroke="rgba(251,191,36,0.5)"
                                    strokeDasharray="6 4"
                                    label={{ value: 'KDR 1.0', position: 'right', fill: '#fbbf24', fontSize: 9 }}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                    formatter={(value: any, _name: string, props: any) => {
                                        const point = props?.payload;
                                        if (!point) return [String(value), 'KDR'];
                                        return [
                                            `${point.kdr.toFixed(2)} (${point.enemyDeaths} kills / ${point.squadDeaths} deaths)`,
                                            'KDR'
                                        ];
                                    }}
                                    labelFormatter={(_, payload?: readonly any[]) => {
                                        const point = payload?.[0]?.payload;
                                        if (!point) return '';
                                        const winLabel = point.isWin === true ? ' ✓' : point.isWin === false ? ' ✗' : '';
                                        return `${point.fullLabel}${winLabel}`;
                                    }}
                                />
                                <Bar dataKey="kdr" name="KDR">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.isWin === false ? '#f87171' : '#22c55e'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-gray-400">Win</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                            <span className="text-[9px] text-gray-400">Loss</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0 border-t border-dashed border-amber-400" />
                            <span className="text-[9px] text-gray-400">Break-even</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/SquadKillPressureSection.tsx
git commit -m "feat: add SquadKillPressureSection with KDR bar chart"
```

---

## Task 6: SquadTagDistanceDeathsSection Component

**Files:**
- Create: `src/renderer/stats/sections/SquadTagDistanceDeathsSection.tsx`

**Reference files:**
- `src/renderer/stats/sections/SpikeDamageSection.tsx` — for the click-to-drill pattern (summary chart → click fight → drilldown)
- `src/renderer/stats/sections/HealEffectivenessSection.tsx` — for section wrapper + chart pattern

- [ ] **Step 1: Create the section component**

Create `src/renderer/stats/sections/SquadTagDistanceDeathsSection.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Crosshair, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import type { TagDistanceDeathFightSummary } from '../computeTagDistanceDeaths';

type SquadTagDistanceDeathsSectionProps = {
    fights: TagDistanceDeathFightSummary[];
};

export const SquadTagDistanceDeathsSection = ({ fights }: SquadTagDistanceDeathsSectionProps) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass
    } = useStatsSharedContext();
    const sectionId = 'squad-tag-distance-deaths';
    const isExpanded = expandedSection === sectionId;
    const [selectedFightIndex, setSelectedFightIndex] = useState<number | null>(null);

    const summaryData = useMemo(() => {
        return fights.map((fight, idx) => ({
            index: idx,
            shortLabel: fight.shortLabel,
            fullLabel: fight.fullLabel,
            isWin: fight.isWin,
            avgDistance: fight.avgDistance,
            eventCount: fight.eventCount,
            hasReplayData: fight.hasReplayData,
        }));
    }, [fights]);

    const summaryMaxY = useMemo(() => {
        return Math.max(500, ...summaryData.map((d) => d.avgDistance));
    }, [summaryData]);

    const totalDeaths = useMemo(() => fights.reduce((sum, f) => sum + f.eventCount, 0), [fights]);
    const overallAvg = useMemo(() => {
        if (totalDeaths === 0) return 0;
        const totalDist = fights.reduce((sum, f) => sum + f.events.reduce((s, e) => s + e.distanceFromTag, 0), 0);
        return Math.round(totalDist / totalDeaths);
    }, [fights, totalDeaths]);

    const selectedFight = selectedFightIndex !== null ? fights[selectedFightIndex] : null;

    const scatterData = useMemo(() => {
        if (!selectedFight) return [];
        return selectedFight.events.map((event, idx) => ({
            x: event.timeIntoFightSec,
            y: event.distanceFromTag,
            playerAccount: event.playerAccount,
            timeMs: event.timeIntoFightMs,
            index: idx,
        }));
    }, [selectedFight]);

    const scatterMaxY = useMemo(() => {
        if (scatterData.length === 0) return 1000;
        return Math.max(500, ...scatterData.map((d) => d.y));
    }, [scatterData]);

    const hasAnyData = fights.some((f) => f.hasReplayData);

    return (
        <div
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                isExpanded
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Crosshair className="w-5 h-5 text-orange-300" />
                    Tag Distance Deaths
                </h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={isExpanded ? 'Close Tag Distance Deaths' : 'Expand Tag Distance Deaths'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {!hasAnyData ? (
                <div className="text-center text-gray-500 italic py-8">No replay data available — commander tag positions are required for this chart.</div>
            ) : (
                <>
                    {/* Summary stats */}
                    <div className="flex gap-4 mb-4">
                        <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/5">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-500">Avg Distance</div>
                            <div className="text-sm font-mono text-gray-200 mt-0.5">{formatWithCommas(overallAvg, 0)} in</div>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/5">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-500">Total Deaths</div>
                            <div className="text-sm font-mono text-gray-200 mt-0.5">{totalDeaths}</div>
                        </div>
                    </div>

                    {/* Summary bar chart */}
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Avg Death Distance from Tag</div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Average distance (inches) from commander tag at moment of death. Click a bar to see individual deaths.
                                </div>
                            </div>
                        </div>
                        <div className={isExpanded ? 'h-[300px]' : 'h-[220px]'}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={summaryData}
                                    onClick={(state: any) => {
                                        const idx = Number(state?.activeTooltipIndex);
                                        if (!Number.isFinite(idx)) return;
                                        setSelectedFightIndex(selectedFightIndex === idx ? null : idx);
                                    }}
                                >
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="shortLabel" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis
                                        tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        domain={[0, summaryMaxY]}
                                        tickFormatter={(value: number) => formatWithCommas(value, 0)}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any) => [`${formatWithCommas(Number(value || 0), 0)} in`, 'Avg Distance']}
                                        labelFormatter={(_, payload?: readonly any[]) => {
                                            const point = payload?.[0]?.payload;
                                            if (!point) return '';
                                            const extra = !point.hasReplayData ? ' (no data)' : ` (${point.eventCount} deaths)`;
                                            return `${point.fullLabel}${extra}`;
                                        }}
                                    />
                                    <Bar dataKey="avgDistance" name="Avg Distance" style={{ cursor: 'pointer' }}>
                                        {summaryData.map((entry, idx) => (
                                            <Cell
                                                key={`bar-${idx}`}
                                                fill={!entry.hasReplayData ? '#374151' : entry.isWin === false ? '#f87171' : '#22c55e'}
                                                stroke={selectedFightIndex === idx ? 'rgba(251,191,36,0.8)' : 'none'}
                                                strokeWidth={selectedFightIndex === idx ? 2 : 0}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                                <span className="text-[9px] text-gray-400">Win</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                                <span className="text-[9px] text-gray-400">Loss</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-gray-600" />
                                <span className="text-[9px] text-gray-400">No data</span>
                            </div>
                        </div>
                    </div>

                    {/* Drilldown scatter chart */}
                    <div className={`mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 transition-all duration-300 ${
                        selectedFight ? 'opacity-100 translate-y-0' : 'opacity-90'
                    }`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">
                                    {selectedFight ? `${selectedFight.fullLabel} — Death Positions` : 'Fight Details'}
                                </div>
                                {selectedFight ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                        <span>{selectedFight.eventCount} death{selectedFight.eventCount !== 1 ? 's' : ''}</span>
                                        <span>Avg: {formatWithCommas(selectedFight.avgDistance, 0)} in from tag</span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-500 mt-1">Click a bar above to see individual death events for that fight.</div>
                                )}
                            </div>
                            {selectedFight && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedFightIndex(null)}
                                    className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-200"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {selectedFight && scatterData.length > 0 ? (
                            <div className={isExpanded ? 'h-[300px]' : 'h-[220px]'}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart>
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                        <XAxis
                                            type="number"
                                            dataKey="x"
                                            name="Time"
                                            unit="s"
                                            tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        />
                                        <YAxis
                                            type="number"
                                            dataKey="y"
                                            name="Distance"
                                            unit=" in"
                                            tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                            domain={[0, scatterMaxY]}
                                            tickFormatter={(value: number) => formatWithCommas(value, 0)}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                            formatter={(value: any, name: string) => {
                                                if (name === 'Time') return [`${value}s`, 'Time'];
                                                if (name === 'Distance') return [`${formatWithCommas(Number(value), 0)} in`, 'Distance from Tag'];
                                                return [value, name];
                                            }}
                                            labelFormatter={() => ''}
                                            content={({ payload }: any) => {
                                                const point = payload?.[0]?.payload;
                                                if (!point) return null;
                                                return (
                                                    <div className="bg-[#161c24] border border-white/10 rounded-lg px-3 py-2 text-xs">
                                                        <div className="text-gray-300 font-medium">{point.playerAccount}</div>
                                                        <div className="text-gray-400 mt-0.5">{point.x}s — {formatWithCommas(point.y, 0)} inches from tag</div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Scatter data={scatterData} fill={selectedFight.isWin === false ? '#f87171' : '#22c55e'}>
                                            {scatterData.map((entry) => (
                                                <Cell
                                                    key={`scatter-${entry.index}`}
                                                    fill={selectedFight.isWin === false ? '#f87171' : '#22c55e'}
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        ) : selectedFight && scatterData.length === 0 ? (
                            <div className="text-center text-gray-500 italic py-6 text-xs">No death events in this fight.</div>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/SquadTagDistanceDeathsSection.tsx
git commit -m "feat: add SquadTagDistanceDeathsSection with summary + drilldown scatter"
```

---

## Task 7: Wire Everything into StatsView.tsx

**Files:**
- Modify: `src/renderer/StatsView.tsx`

**Key locations:**
- Imports: lines 25-55
- `healEffectivenessFights` useMemo: lines 511-515
- Modern layout: `CommanderStatsSection` at line 4061, `AttendanceSection` at line 4066, `HealEffectivenessSection` at line 3971
- Classic layout: `CommanderTagDeathResponseSection` at line 4140, `AttendanceSection` at line 4144, `HealEffectivenessSection` at line 4397

- [ ] **Step 1: Add imports for new sections and computeTagDistanceDeaths**

After line 55 (`import { FightCompSection }...`), add:

```typescript
import { SquadDamageComparisonSection } from './stats/sections/SquadDamageComparisonSection';
import { SquadKillPressureSection } from './stats/sections/SquadKillPressureSection';
import { SquadTagDistanceDeathsSection } from './stats/sections/SquadTagDistanceDeathsSection';
import { computeTagDistanceDeaths } from './stats/computeTagDistanceDeaths';
```

- [ ] **Step 2: Add `tagDistanceDeathsData` useMemo near `healEffectivenessFights`**

Near `healEffectivenessFights` (around line 515), add:

```typescript
const tagDistanceDeathsData = useMemo(() => {
    return computeTagDistanceDeaths(
        logs
            .filter((log: any) => log?.details)
            .map((log: any) => ({ log }))
    );
}, [logs]);
```

- [ ] **Step 3: Modern layout — remove HealEffectivenessSection from old position and insert Squad Stats sections**

In the modern layout branch:

**Remove** the `HealEffectivenessSection` at its current position (around line 3971-3973):
```typescript
                            <HealEffectivenessSection
                                fights={healEffectivenessFights}
                            />
```

**Insert** the Squad Stats block between `CommanderStatsSection` (line ~4064) and `AttendanceSection` (line ~4066):

```typescript
                            <SquadDamageComparisonSection />

                            <SquadKillPressureSection />

                            <HealEffectivenessSection
                                fights={healEffectivenessFights}
                            />

                            <SquadTagDistanceDeathsSection
                                fights={tagDistanceDeathsData}
                            />
```

- [ ] **Step 4: Classic layout — remove HealEffectivenessSection from old position and insert Squad Stats sections**

In the classic layout branch:

**Remove** the `HealEffectivenessSection` at its current position (around line 4397-4399):
```typescript
                        {isSectionVisible('heal-effectiveness') && <HealEffectivenessSection
                            fights={healEffectivenessFights}
                        />}
```

**Insert** the Squad Stats block between `CommanderTagDeathResponseSection` (line ~4142) and `AttendanceSection` (line ~4144):

```typescript
                        {isSectionVisible('squad-damage-comparison') && <SquadDamageComparisonSection />}

                        {isSectionVisible('squad-kill-pressure') && <SquadKillPressureSection />}

                        {isSectionVisible('heal-effectiveness') && <HealEffectivenessSection
                            fights={healEffectivenessFights}
                        />}

                        {isSectionVisible('squad-tag-distance-deaths') && <SquadTagDistanceDeathsSection
                            fights={tagDistanceDeathsData}
                        />}
```

- [ ] **Step 5: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 6: Run all unit tests**

Run: `npm run test:unit`
Expected: All tests pass (including the new computeTagDistanceDeaths tests)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: wire Squad Stats sections into StatsView"
```

---

## Task 8: Visual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify navigation**

Open the app. In the stats dashboard, verify:
- "Squad Stats" group appears in the left nav between "Commander Stats" and "Roster Intel"
- 4 sub-sections listed: Damage Comparison, Kill Pressure, Heal Effectiveness, Tag Distance Deaths
- Clicking each nav item scrolls to the correct section
- "Heal Effectiveness" no longer appears under "Defensive Stats"

- [ ] **Step 3: Verify charts render with data**

Load some test logs (or use a dev dataset). Verify:
- Damage Comparison shows diverging green/red bars per fight
- Kill Pressure shows KDR bars with dashed break-even line
- Heal Effectiveness works as before (line chart with drill-down)
- Tag Distance Deaths shows summary bar chart (may show "no data" if logs lack replay data)

- [ ] **Step 4: Verify expand/collapse**

Click the expand button on each new section — verify it opens fullscreen and closes correctly.

- [ ] **Step 5: Final validation**

Run: `npm run validate && npm run test:unit`
Expected: All pass

- [ ] **Step 6: Commit any fixes if needed**

If visual testing revealed issues, fix and commit.
